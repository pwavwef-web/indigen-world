import { randomBytes } from 'node:crypto';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  CONSENT_PURPOSES, DESTINATIONS, FORM_LANGUAGES, displayAnswer, findField,
  type AnswerValue, type ConsentPurpose, type ConsentRecord, type DestinationType, type FormDefinition, type FormField,
} from '@indigen-world/contracts/forms';
import { PORTAL_FORMATS, PORTAL_LIMITS, PORTAL_USES, portalIssues, type PortalType, type PortalUse } from '@indigen-world/contracts/portal-contributions';
import {
  COLLECTION_CAMPAIGN_ID, buildCollectionCampaignDocument, buildCollectionContributionReceipt, buildCollectionSubmissionDocument,
  parseCollectionContributionInput, type CollectionContributionInput,
} from './collection-contributions.js';
import {
  ROUTES, UPLOAD_PREFIX, UPLOADS, auditRef, formsAudit, historyRef, loadVersion, nowIso, responseRef, sha256,
  type ResponseDoc, type UploadDoc,
} from './forms-common.js';
import { canonicalPartOfSpeech, partOfSpeechLabel } from './lexical-kinds.js';

/**
 * Where an approved Indigen Forms response goes next
 * (docs/architecture/indigen-forms.md, "Review, points and destinations").
 *
 * The decision transaction only records the routing state: `pending` when the
 * response holds every consent its destination needs, `blocked` when it does
 * not, `not_applicable` for general intake. After that transaction commits,
 * routeApprovedResponse files the response in the destination's OWN review
 * queue — nothing is ever published or approved here:
 *
 *   dictionary_candidate  submissions + collectionContributions (the existing
 *                         campaign builders; never `contributorPortal`, which
 *                         would start the expression reward paths)
 *   translation_review    portalContributions, type `translations`
 *   audio_collection      portalContributions, type `audio`
 *   document_intake       portalContributions, type `documents`
 *
 * Files are copied server-side from the generation that passed inspection
 * into the destination's own private folder. Permissions on the new record
 * come only from consents the contributor granted on this form — intersected
 * with what the destination can express, defaulting to false — and never from
 * the account-wide training agreement. The record id is derived from the
 * response and a server-only route key recorded with the approval, so nobody
 * can claim the id before routing, and a retry after a failure targets the
 * same record and file paths. Creating the record and marking the response
 * `routed` commit together, so an existing record at that id is never ours and
 * is refused. Anything that cannot be filed safely ends as `failed` with a note
 * an administrator can act on (formsReview.retryRouting).
 */

/**
 * The routing state stored on the response. `routeKey` is server-only (the
 * response collection is closed to clients and the callables project it away)
 * and is kept on every later state of the same approval.
 */
export type RoutingState = ResponseDoc['routing'] & { routeKey?: string };

const newRouteKey = () => randomBytes(16).toString('hex');

/** The destination's required consents that this response did not grant. */
export function missingConsents(type: DestinationType, granted: readonly ConsentPurpose[] | undefined): ConsentPurpose[] {
  const have = new Set(granted ?? []);
  return DESTINATIONS[type].requiredConsents.filter((purpose) => !have.has(purpose));
}

function blockedNote(missing: ConsentPurpose[]): string {
  return `Not routed: the contributor did not give ${missing.map((purpose) => `“${CONSENT_PURPOSES[purpose].label}”`).join(' and ')} permission, which this destination requires.`;
}

/** The routing state an approval records, decided inside the decision transaction. */
export function initialRouting(definition: FormDefinition, response: Pick<ResponseDoc, 'grantedPurposes'>): RoutingState {
  const type = definition.destination.type;
  const base = { destination: type, targetCollection: null, targetId: null };
  if (type === 'general_intake') return { ...base, status: 'not_applicable', note: null };
  const missing = missingConsents(type, response.grantedPurposes);
  if (missing.length) return { ...base, status: 'blocked', note: blockedNote(missing) };
  return { ...base, status: 'pending', note: null, routeKey: newRouteKey() };
}

/* -- Plans ------------------------------------------------------------------------------------ */

/** An explicit reason this response cannot be filed; recorded as the routing note. */
class RouteFailure extends Error {}
function refuse(note: string): never {
  throw new RouteFailure(note);
}

interface FileCopy {
  uploadId: string;
  name: string;
  source: string;
  generation: string;
  destination: string;
  contentType: string;
  metadata: Record<string, string>;
}

interface RoutePlan {
  targetCollection: string;
  targetId: string;
  /** Documents created with the route, primary record first. */
  creates: Array<{ ref: DocumentReference; data: Record<string, unknown> }>;
  /** Created only when missing (the shared campaign document). */
  ensure: Array<{ ref: DocumentReference; data: Record<string, unknown> }>;
  copies: FileCopy[];
  notes: string[];
}

interface Context {
  response: ResponseDoc;
  definition: FormDefinition;
  /** Stamped on every created record: where it came from and who routed it. */
  formOrigin: Record<string, unknown>;
  granted: Set<ConsentPurpose>;
  /** `forms:<formId>@v<version>`: the consent wording is the version's, stored with each record. */
  consentVersion: string;
  consents: ConsentRecord[];
  defaultSource: string;
  now: string;
  /** Server-only key of this approval's routing; record ids and file paths derive from it. */
  routeKey: string;
}

/** The answer mapped to a destination slot, with its question (top-level questions only). */
function slot(ctx: Context, slotId: string): { field: FormField; value: AnswerValue } | null {
  const fieldId = ctx.definition.destination.mapping[slotId];
  if (!fieldId) return null;
  const field = findField(ctx.definition, fieldId);
  const value = ctx.response.answers?.[fieldId];
  if (!field || value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return null;
  return { field, value };
}

/** A mapped answer as text: typed text exactly as stored, the label for a choice, file names for uploads. */
function slotText(ctx: Context, slotId: string): string {
  const found = slot(ctx, slotId);
  if (!found) return '';
  return typeof found.value === 'string' && ['short_text', 'long_text'].includes(found.field.type) ? found.value : displayAnswer(found.field, found.value);
}

/**
 * A mapped tick box as the contributor answered it; null when the form maps no
 * question to the slot or the question was not shown — an unasked question is
 * recorded as not asked, never as a "yes" or a "no".
 */
function slotConfirmation(ctx: Context, slotId: string): boolean | null {
  const found = slot(ctx, slotId);
  return found && typeof found.value === 'boolean' ? found.value : null;
}

function limited(value: string, max: number, label: string): string {
  if (value.length > max) refuse(`${label} is longer than the destination accepts (${max} characters).`);
  return value;
}

/** The uploads mapped to a slot, checked against the registry: ready, this contributor's, this response's. */
async function slotUploads(ctx: Context, slotId: string): Promise<UploadDoc[]> {
  const found = slot(ctx, slotId);
  if (!found || !Array.isArray(found.value)) return [];
  const ids = (found.value as Array<{ id?: unknown }>).map((item) => (item && typeof item.id === 'string' ? item.id : ''));
  if (ids.some((id) => !id)) refuse('An attachment in this response is malformed.');
  const db = getFirestore();
  const snaps = await db.getAll(...ids.map((id) => db.collection(UPLOADS).doc(id)));
  const uid = ctx.response.contributorUid;
  return snaps.map((snap, index) => {
    const upload = snap.data() as UploadDoc | undefined;
    if (!upload || upload.status !== 'ready' || !upload.generation || upload.ownerUid !== uid || upload.responseId !== ctx.response.id
      || !(ctx.response.attachmentIds ?? []).includes(upload.id) || !upload.path.startsWith(`${UPLOAD_PREFIX}/${uid}/`)) {
      return refuse(`Attachment ${ids[index]} is not an inspected file of this response.`);
    }
    return upload;
  });
}

const extensionOf = (name: string) => (name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : '');

/* -- Dictionary candidate --------------------------------------------------------------------- */

/** The variety's label ("Navrongo"), the typed text, or "Not sure". */
function dialectLabel(ctx: Context): string {
  return slotText(ctx, 'dialect') || 'Not sure';
}

/**
 * Kind of word: the label of the chosen option, or the canonical word-class
 * label when either the label or the option id names one ("adjective" →
 * "Adjective"), so publication reads a class it knows. "Not sure" when the
 * question was not answered.
 */
function partOfSpeech(ctx: Context): string {
  const found = slot(ctx, 'partOfSpeech');
  if (!found) return partOfSpeechLabel('unknown');
  const label = typeof found.value === 'string' && found.field.type === 'short_text' ? found.value : displayAnswer(found.field, found.value);
  const canonical = canonicalPartOfSpeech(label) ?? (typeof found.value === 'string' ? canonicalPartOfSpeech(found.value) : null);
  return canonical ? partOfSpeechLabel(canonical) : label;
}

async function planDictionary(ctx: Context): Promise<RoutePlan> {
  const db = getFirestore();
  const { response } = ctx;
  const uid = response.contributorUid;
  const targetId = `form_${sha256(`forms:${response.id}:${ctx.routeKey}`).slice(0, 32)}`;
  const headword = slotText(ctx, 'headword');
  const meaning = slotText(ctx, 'meaning');
  if (!headword) refuse('The Kasem word is missing from this response.');
  if (!meaning) refuse('The English meaning is missing from this response.');
  // The contributor's own statements on this form; null where the form did not ask.
  const speakersAgreed = slotConfirmation(ctx, 'speakerPermission');
  const rightsConfirmed = slotConfirmation(ctx, 'rightsConfirmed');

  const notes: string[] = [];
  const copies: FileCopy[] = [];
  let media: Record<string, unknown> | null = null;
  const recordings = await slotUploads(ctx, 'pronunciation');
  if (recordings.length > 1) refuse(`The dictionary takes one pronunciation recording; this response has ${recordings.length}.`);
  if (recordings.length === 1 && !ctx.granted.has('storage')) {
    // Copying the recording keeps it in another private archive, which needs its own permission.
    notes.push('The pronunciation recording was not copied: the contributor did not give storage permission.');
  } else if (recordings.length === 1 && speakersAgreed !== true) {
    // A voice belongs to the people heard in it: the recording goes only with the contributor's statement that they agreed.
    notes.push(ctx.definition.destination.mapping.speakerPermission
      ? 'The pronunciation recording was not copied: the contributor did not confirm that the people heard in it agreed to share it.'
      : 'The pronunciation recording was not copied: this form does not ask whether the people heard in it agreed to share it.');
  } else if (recordings.length === 1) {
    const upload = recordings[0];
    const extension = extensionOf(upload.name).replace(/[^a-z0-9]/g, '') || 'audio';
    const path = `creator-submissions/${uid}/${COLLECTION_CAMPAIGN_ID}/${targetId}/pronunciation.${extension}`;
    const contentType = upload.contentType ?? upload.declaredType;
    copies.push({
      uploadId: upload.id, name: upload.name, source: upload.path, generation: upload.generation!, destination: path, contentType,
      metadata: { formsResponseId: response.id },
    });
    media = { storagePath: path, mimeType: contentType, sizeBytes: upload.size ?? upload.declaredSize, mediaType: 'audio' };
  }

  // The dictionary's own parser checks every limit and required field; its
  // message becomes the routing note. It trims surrounding whitespace only.
  // It also insists on the declarations its own form asks for. `rightsConfirmed`
  // there means permission to share for community review, which this form's
  // required review consent gives; the third-party and participant answers are
  // given only to satisfy it and are replaced below by what the contributor
  // actually said here.
  let input: CollectionContributionInput;
  try {
    input = parseCollectionContributionInput({
      collectionKind: 'dictionary',
      lexicalKind: 'word',
      title: meaning,
      body: headword,
      translations: [headword],
      format: partOfSpeech(ctx),
      dialect: dialectLabel(ctx),
      source: slotText(ctx, 'source') || ctx.defaultSource,
      kasemExample: slotText(ctx, 'example'),
      englishExample: slotText(ctx, 'exampleTranslation'),
      notes: '',
      media,
      rightsConfirmed: true,
      // Publication follows only the public-sharing consent given on this form.
      publicationPermission: ctx.granted.has('public'),
      involvesMinors: null,
      usesThirdPartyMaterial: false,
      participantConsentConfirmed: true,
    }, uid);
  } catch (error) {
    if (error instanceof HttpsError) refuse(`The dictionary refused this response: ${error.message}`);
    throw error;
  }

  const permissions = {
    review: ctx.granted.has('review'),
    publication: ctx.granted.has('public'),
    promotion: false,
    aiTraining: ctx.granted.has('training'),
    consentVersion: ctx.consentVersion,
    statements: ctx.consents,
    recordedAt: ctx.now,
  };
  const submissionRef = db.collection('submissions').doc(targetId);
  const receiptRef = db.collection('collectionContributions').doc(targetId);
  const submission = buildCollectionSubmissionDocument(targetId, uid, input, ctx.now);
  // Only what the contributor stated on this form. Third-party material is never
  // asked here, so it stays null and the desks show "not asked".
  const disclosures = { ...(submission.disclosures as Record<string, unknown>), usesThirdPartyMaterial: null };
  const attestations = { ownsOrHasRights: rightsConfirmed, participantsConsented: speakersAgreed, noUnlawfulCopyright: rightsConfirmed };
  return {
    targetCollection: 'submissions',
    targetId,
    creates: [
      { ref: submissionRef, data: { ...submission, disclosures, attestations, permissions, formOrigin: ctx.formOrigin } },
      {
        ref: receiptRef,
        data: {
          ...buildCollectionContributionReceipt(targetId, targetId, uid, input),
          rightsConfirmed, participantConsentConfirmed: speakersAgreed, usesThirdPartyMaterial: null, formOrigin: ctx.formOrigin,
        },
      },
    ],
    ensure: [{ ref: db.collection('campaigns').doc(COLLECTION_CAMPAIGN_ID), data: buildCollectionCampaignDocument(ctx.now) }],
    copies,
    notes,
  };
}

/* -- Contributor materials (portalContributions) ---------------------------------------------- */

/** Forms upload formats and the materials desk extension that stores the same bytes. */
const PORTAL_EXTENSION: Record<string, string> = {
  jpeg: 'jpg', png: 'png', mp3: 'mp3', wav: 'wav', m4a: 'm4a', webm_audio: 'webm', mp4: 'mp4', pdf: 'pdf', docx: 'docx', txt: 'txt',
};
const PORTAL_CONTENT_KEYS = ['text', 'sourceText', 'meaning', 'example', 'context', 'source', 'sourceLanguage', 'originalRecord', 'reason', 'category',
  'sourceUrl', 'date', 'attribution', 'restrictions', 'speaker', 'dialect', 'script', 'variants', 'transcript'];
const LONG_CONTENT = new Set(['text', 'sourceText', 'transcript']);

/** The materials desk's adjustable ingestion limits (portalIngestionSettings/current), clamped like the portal does. */
async function portalLimits() {
  const raw = (await getFirestore().doc('portalIngestionSettings/current').get()).data() ?? {};
  return {
    uploadsEnabled: raw.uploadsEnabled !== false,
    maxFiles: Math.min(PORTAL_LIMITS.maxFiles, Math.max(1, Number(raw.maxFiles) || PORTAL_LIMITS.maxFiles)),
    maxFileBytes: Math.min(PORTAL_LIMITS.maxFileBytes, Math.max(1024, Number(raw.maxFileBytes) || PORTAL_LIMITS.maxFileBytes)),
    maxBatchBytes: Math.min(PORTAL_LIMITS.maxBatchBytes, Math.max(1024, Number(raw.maxBatchBytes) || PORTAL_LIMITS.maxBatchBytes)),
  };
}

/**
 * The material's language as the portal records it: `xsm` for Kasem material
 * (the form is about Kasem or a Kasem variety was given), otherwise the form's
 * first stated language.
 */
function portalLanguage(ctx: Context): string {
  const { languageContext } = ctx.definition;
  if (languageContext.languageIds.includes('kasem') || languageContext.dialectIds.length || slot(ctx, 'dialect')) return 'xsm';
  const first = FORM_LANGUAGES.find((item) => item.id === languageContext.languageIds[0]);
  return first ? first.label : refuse('The form does not say which language this material is in, which the materials desk requires.');
}

async function planPortal(ctx: Context, type: Extract<PortalType, 'translations' | 'audio' | 'documents'>): Promise<RoutePlan> {
  const db = getFirestore();
  const { response } = ctx;
  const uid = response.contributorUid;
  const profile = (await db.doc(`contributors/${uid}`).get()).data();
  if (profile?.permissions?.edit === false || profile?.permissions?.submit === false) {
    refuse('The contributor’s permission to submit materials is turned off, so the materials desk cannot take this response.');
  }
  const seed = sha256(`forms:${response.id}:${response.revision}`);
  const targetId = `PC-${seed.slice(0, 32)}`;
  const batch = `forms-${seed.slice(32, 56)}`;
  const reference = `${ctx.definition.title} (${response.referenceId ?? response.id})`;

  const content: Record<string, unknown> = Object.fromEntries(PORTAL_CONTENT_KEYS.map((key) => [key, '']));
  content.needsTranscription = false;
  content.source = slotText(ctx, 'source') || ctx.defaultSource;
  let title = reference;
  let provenance = 'original';
  let speakers = false;
  let fileSlot: string | null = null;
  if (type === 'translations') {
    provenance = 'translated';
    content.sourceText = slotText(ctx, 'sourceText');
    content.text = slotText(ctx, 'translation');
    content.sourceLanguage = slotText(ctx, 'sourceLanguage');
    content.dialect = slotText(ctx, 'dialect');
    content.context = slotText(ctx, 'notes');
  } else if (type === 'audio') {
    fileSlot = 'recording';
    title = slotText(ctx, 'title') || reference;
    const permission = slot(ctx, 'speakerPermission');
    speakers = permission?.value === true;
    content.transcript = slotText(ctx, 'transcript');
    content.needsTranscription = !content.transcript;
    content.dialect = slotText(ctx, 'dialect');
    content.speaker = slotText(ctx, 'speaker');
  } else {
    fileSlot = 'files';
    title = slotText(ctx, 'title') || reference;
    content.text = slotText(ctx, 'description');
    // Shown to reviewers beside the ownership answer ("Rights: unclear. <statement>").
    content.restrictions = slotText(ctx, 'rights');
  }
  for (const key of PORTAL_CONTENT_KEYS) limited(String(content[key]), LONG_CONTENT.has(key) ? PORTAL_LIMITS.maxText : 2000, `The ${key} answer`);
  limited(title, 240, 'The title');

  const uploads = fileSlot ? await slotUploads(ctx, fileSlot) : [];
  const limits = await portalLimits();
  if (uploads.length && !limits.uploadsEnabled) refuse('Material uploads are paused in the contributor portal. Retry routing when they reopen.');
  if (uploads.length > limits.maxFiles) refuse(`The materials desk takes at most ${limits.maxFiles} files; this response has ${uploads.length}.`);
  let total = 0;
  const files: Array<Record<string, string>> = [];
  const copies: FileCopy[] = [];
  for (const upload of uploads) {
    const extension = upload.format ? PORTAL_EXTENSION[upload.format] : undefined;
    // ADTS ".aac" passes the forms check as m4a, but the portal reads only MP4-container m4a.
    if (!extension || (upload.format === 'm4a' && extensionOf(upload.name) !== 'm4a')) {
      refuse(`${upload.name} is in a format the materials desk does not accept.`);
    }
    const mime = PORTAL_FORMATS[extension!];
    const size = upload.size ?? upload.declaredSize;
    if (size > limits.maxFileBytes) refuse(`${upload.name} is larger than the materials desk accepts (${Math.floor(limits.maxFileBytes / (1024 * 1024))} MB).`);
    total += size;
    // The portal derives the type from the name's extension, so the name must carry one that maps to the same type.
    const own = extensionOf(upload.name);
    const name = (own && PORTAL_FORMATS[own] === mime ? upload.name : `${upload.name}.${extension}`).slice(-180);
    const path = `portal-originals/${uid}/${batch}/${upload.id}`;
    files.push({ path, name, mime, title: '', description: '', source: '', language: '' });
    copies.push({ uploadId: upload.id, name: upload.name, source: upload.path, generation: upload.generation!, destination: path, contentType: mime, metadata: { portalOwner: uid, originalName: name } });
  }
  if (total > limits.maxBatchBytes) refuse('The files together are larger than the materials desk accepts in one batch.');

  // Uses are the portal's four purposes, true only where this form's consent was granted.
  const uses = Object.fromEntries((Object.keys(PORTAL_USES) as PortalUse[]).map((use) => [use, ctx.granted.has(use)])) as Record<PortalUse, boolean>;
  const consents = ctx.consents;
  const record: Record<string, unknown> = {
    id: targetId,
    owner: uid,
    type,
    title,
    language: portalLanguage(ctx),
    provenance,
    content,
    files,
    uses,
    // Forms ask no structured ownership question, so rights stay "needs clarification" (review only, never exported).
    rights: { ownership: 'unclear', speakers, sensitive: false, confidential: false, cultural: false },
    version: 1,
    status: 'submitted',
    createdAt: ctx.now,
    updatedAt: ctx.now,
    submittedAt: ctx.now,
    feedback: '',
    consent: {
      version: ctx.consentVersion,
      text: Object.fromEntries(consents.map((item) => [item.purpose, [CONSENT_PURPOSES[item.purpose]?.label ?? item.purpose, item.statement]])),
      selected: uses,
      statements: consents,
      at: ctx.now,
    },
    reward: 'Points, if any, were awarded when the form response was approved.',
    processing: { state: files.length ? 'queued' : 'not_required', files: [], attempts: 0, scan: 'No external malware scanner configured' },
    formOrigin: ctx.formOrigin,
  };
  const issues = portalIssues(record);
  if (issues.length) refuse(`The materials desk refused this response: ${issues.join(' ')}`);
  if (Buffer.byteLength(JSON.stringify({ type, title, content, files, uses })) > 200_000) refuse('This response is larger than the materials desk accepts (200 KB).');

  const ref = db.collection('portalContributions').doc(targetId);
  return {
    targetCollection: 'portalContributions',
    targetId,
    creates: [
      { ref, data: record },
      { ref: ref.collection('versions').doc('1'), data: record },
      { ref: ref.collection('history').doc('form-routed'), data: { action: 'submitted', version: 1, at: ctx.now, actor: uid, via: 'indigen-forms', formOrigin: ctx.formOrigin } },
    ],
    ensure: [],
    copies,
    notes: [],
  };
}

/* -- Copying files ----------------------------------------------------------------------------------- */

/**
 * Copies exactly the inspected generation. The destination is created only if
 * absent; a retry that finds the object from an earlier attempt accepts it
 * only when its size and checksums equal the inspected generation's. Custom
 * metadata is never the test: whoever wrote an object can set it.
 */
async function copyFile(copy: FileCopy): Promise<void> {
  const bucket = getStorage().bucket();
  const target = bucket.file(copy.destination);
  const source = bucket.file(copy.source, { generation: Number(copy.generation) });
  const sameBytes = async () => {
    const [held] = await target.getMetadata();
    const [inspected] = await source.getMetadata().catch((error: unknown) => {
      if ((error as { code?: unknown }).code === 404) refuse(`${copy.name} is no longer stored, so it could not be filed.`);
      throw error;
    });
    const checksums = (['md5Hash', 'crc32c'] as const).filter((key) => held[key] && inspected[key]);
    if (!checksums.length || checksums.some((key) => held[key] !== inspected[key]) || Number(held.size) !== Number(inspected.size)) {
      refuse(`${copy.name} could not be filed: a different file already holds its place.`);
    }
  };
  if ((await target.exists())[0]) return sameBytes();
  try {
    await source.copy(target, {
      contentType: copy.contentType,
      // Setting custom metadata also keeps any download token of the source off the copy.
      metadata: { ...copy.metadata, formsUploadId: copy.uploadId, formsSourceGeneration: copy.generation },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 412) return sameBytes();
    if (code === 404) refuse(`${copy.name} is no longer stored, so it could not be filed.`);
    throw error;
  }
}

/* -- Recording outcomes ------------------------------------------------------------------------------- */

async function recordOutcome(response: ResponseDoc, routing: RoutingState, actorUid: string, history: { type: 'routing_blocked'; note: string } | null): Promise<RoutingState> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const current = (await tx.get(responseRef(response.id))).data() as ResponseDoc | undefined;
    if (!current) throw new HttpsError('not-found', 'This response does not exist.');
    // Another attempt finished first; its outcome stands.
    if (current.routing?.status === 'routed' || current.status !== 'approved') return current.routing;
    const now = nowIso();
    tx.update(responseRef(response.id), { routing, updatedAt: now });
    if (history) tx.set(historyRef(response.id, 'routing-blocked'), { type: history.type, actorUid, actorRole: 'system', revision: current.revision, at: now, note: history.note });
    const audit = formsAudit({
      actor: actorUid, action: routing.status === 'failed' ? 'forms.route_failed' : 'forms.route_blocked',
      formId: response.formId, formTitle: response.formTitle, responseId: response.id,
      summary: `${response.referenceId ?? response.id} not routed to ${DESTINATIONS[routing.destination as DestinationType]?.label ?? routing.destination}: ${routing.note ?? ''}`,
      metadata: { destination: routing.destination, status: routing.status }, at: now,
    });
    tx.set(auditRef(audit), audit);
    return routing;
  });
}

async function commitRoute(response: ResponseDoc, plan: RoutePlan, routing: RoutingState, actorUid: string, origin: Record<string, unknown>): Promise<RoutingState> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const current = (await tx.get(responseRef(response.id))).data() as ResponseDoc | undefined;
    if (!current) throw new HttpsError('not-found', 'This response does not exist.');
    if (current.routing?.status === 'routed' || current.status !== 'approved') return current.routing;
    const snaps = await tx.getAll(...plan.creates.map((item) => item.ref), ...plan.ensure.map((item) => item.ref));
    const ensured = snaps.slice(plan.creates.length);
    // Creating these and marking the response routed commit together, and a
    // routed response returned above, so a record already at one of these ids
    // was not made by this routing — whatever its content claims.
    if (snaps.slice(0, plan.creates.length).some((snap) => snap.exists)) refuse('A different record already uses this destination id.');
    const now = nowIso();
    for (const item of plan.creates) tx.create(item.ref, item.data);
    plan.ensure.forEach((item, index) => { if (!ensured[index].exists) tx.set(item.ref, item.data); });
    tx.update(responseRef(response.id), { routing, updatedAt: now });
    tx.set(db.collection(ROUTES).doc(response.id), {
      responseId: response.id,
      formId: response.formId,
      formVersion: response.formVersion,
      revision: response.revision,
      referenceId: response.referenceId,
      contributorUid: response.contributorUid,
      destination: routing.destination,
      targetCollection: plan.targetCollection,
      targetId: plan.targetId,
      documents: plan.creates.map((item) => item.ref.path),
      files: plan.copies.map((copy) => ({ uploadId: copy.uploadId, path: copy.destination, generation: copy.generation, contentType: copy.contentType })),
      notes: plan.notes,
      formOrigin: origin,
      routedBy: actorUid,
      routedAt: now,
    });
    tx.set(historyRef(response.id, 'routed'), {
      type: 'routed', actorUid, actorRole: 'system', revision: response.revision, at: now,
      note: `Filed in ${DESTINATIONS[routing.destination as DestinationType].label} as ${plan.targetCollection}/${plan.targetId}.${plan.notes.length ? ` ${plan.notes.join(' ')}` : ''}`,
    });
    const audit = formsAudit({
      actor: actorUid, action: 'forms.route', formId: response.formId, formTitle: response.formTitle, responseId: response.id,
      summary: `Filed ${response.referenceId ?? response.id} in ${DESTINATIONS[routing.destination as DestinationType].label}`,
      after: { targetCollection: plan.targetCollection, targetId: plan.targetId }, metadata: { files: plan.copies.length }, at: now,
    });
    tx.set(auditRef(audit), audit);
    return routing;
  });
}

/* -- Entry point ---------------------------------------------------------------------------------------- */

/**
 * Files one approved response in its destination. Safe to call more than once
 * (after the decision commits, and again from formsReview.retryRouting): a
 * routed response is returned unchanged, and destination ids and file paths
 * are derived from the response. Problems with the response itself are
 * recorded as `failed` with a note and returned, not thrown.
 */
export async function routeApprovedResponse(responseId: string, actorUid: string): Promise<RoutingState> {
  const response = (await responseRef(responseId).get()).data() as ResponseDoc | undefined;
  if (!response) throw new HttpsError('not-found', 'This response does not exist.');
  const current = response.routing;
  if (response.status !== 'approved' || !current || !['pending', 'failed'].includes(current.status)) return current;
  const definition = (await loadVersion(response.formId, response.formVersion)).definition;
  const type = definition.destination.type;
  const base = { destination: type, targetCollection: null, targetId: null };
  if (type === 'general_intake') return recordOutcome(response, { ...base, status: 'not_applicable', note: null }, actorUid, null);
  const missing = missingConsents(type, response.grantedPurposes);
  if (missing.length) {
    const note = blockedNote(missing);
    return recordOutcome(response, { ...base, status: 'blocked', note }, actorUid, { type: 'routing_blocked', note });
  }

  // Recorded with the approval; an approval made before route keys existed gets one now, kept from here on.
  const routeKey = (current as RoutingState).routeKey ?? newRouteKey();
  const now = nowIso();
  const formOrigin = {
    formId: response.formId,
    formVersion: response.formVersion,
    responseId: response.id,
    revision: response.revision,
    referenceId: response.referenceId,
    routedBy: actorUid,
  };
  const ctx: Context = {
    response,
    definition,
    formOrigin,
    granted: new Set(response.grantedPurposes ?? []),
    consentVersion: `forms:${response.formId}@v${response.formVersion}`,
    consents: response.consents ?? [],
    defaultSource: `Indigen Forms: ${definition.title} (${response.referenceId ?? response.id})`,
    now,
    routeKey,
  };
  try {
    const plan = type === 'dictionary_candidate'
      ? await planDictionary(ctx)
      : await planPortal(ctx, type === 'translation_review' ? 'translations' : type === 'audio_collection' ? 'audio' : 'documents');
    for (const copy of plan.copies) await copyFile(copy);
    const routed: RoutingState = { destination: type, status: 'routed', targetCollection: plan.targetCollection, targetId: plan.targetId, note: plan.notes.join(' ') || null, routeKey };
    return await commitRoute(response, plan, routed, actorUid, formOrigin);
  } catch (error) {
    const known = error instanceof RouteFailure;
    if (!known) logger.error('Forms routing failed', { responseId, destination: type, error: error instanceof Error ? error.message : String(error) });
    const note = known ? (error as RouteFailure).message : 'Routing stopped unexpectedly. An administrator can retry it.';
    // The key stays, so a retry targets the same record and file paths.
    return recordOutcome(response, { ...base, status: 'failed', note: note.slice(0, 1000), routeKey }, actorUid, null);
  }
}
