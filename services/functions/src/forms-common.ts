import { createHash, randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  FORM_DIALECTS, FORM_LANGUAGES, RESPONSE_STATUSES, audienceText, consentRecords, grantedPurposes, referenceIdFrom,
  topLevelFields, type Answers, type AttachmentRef, type Audience, type ConsentPurpose, type ConsentRecord,
  type FormDefinition, type FormStatus, type ResponseStatus, type ReviewerGroup, type VersionState,
} from '@indigen-world/contracts/forms';
import type { FormSummary, ResponseSummary, StatusCounts } from '@indigen-world/contracts/forms-api';
import { attachmentsIn, type ReviewDecision } from '@indigen-world/contracts/forms';
import type { HistoryEvent, ResponseDetail, RevisionSnapshot } from '@indigen-world/contracts/forms-api';
import { callerClaims, effectiveRole, isOwnerSuperAdmin, requireAuth, roleSatisfies, type Role } from './auth.js';
import { hasFinanceAccess } from './contributor-common.js';

/**
 * Indigen Forms: storage layout, permissions and the small writers every
 * forms callable shares (see docs/architecture/indigen-forms.md).
 *
 * Every collection here is server-only. Clients read and write through the
 * three callables (formsAdmin, formsContributor, formsReview); firestore.rules
 * deny direct access explicitly.
 */

export const FORMS = 'indigenForms';
/** indigenForms/{formId}/formVersions/{version}: immutable once published. */
export const VERSIONS = 'formVersions';
export const RESPONSES = 'indigenFormResponses';
/** indigenFormResponses/{id}/formRevisions/{revision}: immutable submitted snapshots. */
export const REVISIONS = 'formRevisions';
/** indigenFormResponses/{id}/formHistory/{eventId}: decision and lifecycle history. */
export const HISTORY = 'formHistory';
export const UPLOADS = 'indigenFormUploads';
export const COHORTS = 'indigenFormCohorts';
export const REQUESTS = 'indigenFormRequests';
/** One marker per response that earned points (formAwards/{responseId}). */
export const AWARDS = 'formAwards';
/** Records created in destination workflows (indigenFormRoutes/{responseId}). */
export const ROUTES = 'indigenFormRoutes';
export const SETTINGS_PATH = 'settings/indigenForms';
export const AUDIT_DOMAIN = 'indigen-forms';
/** Private Storage prefix; storage.rules deny all client access to it. */
export const UPLOAD_PREFIX = 'form-uploads';
export const FORMS_REGION = 'us-central1';

export const FORMS_CALL_OPTIONS = {
  region: FORMS_REGION,
  invoker: 'public' as const,
  timeoutSeconds: 120,
  memory: '512MiB' as const,
};

/* -- Stored documents ---------------------------------------------------------------- */

export interface FormDoc {
  id: string;
  title: string;
  description: string;
  category: string;
  languageIds: string[];
  status: FormStatus;
  currentVersion: number | null;
  draftVersion: number | null;
  /** Save counter of the draft version (optimistic concurrency for admins). */
  draftRevision: number;
  latestVersion: number;
  publishedVersions: number[];
  retiredVersions: number[];
  counts: StatusCounts;
  totalSubmitted: number;
  /** Audience of the current published version (or the draft before the first publish). */
  audience: Audience;
  reviewerGroup: ReviewerGroup;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
  publishedAt: string | null;
  publishedBy: string | null;
  lastActivityAt: string | null;
  templateId: string | null;
}

export interface VersionDoc {
  version: number;
  state: VersionState;
  definition: FormDefinition;
  revision: number;
  basedOn: number | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
  publishedAt: string | null;
  publishedBy: string | null;
  retiredAt: string | null;
  retiredBy: string | null;
  /** sha256 of the published definition, so a published version can be proven unchanged. */
  schemaHash: string | null;
}

export interface ResponseDoc {
  id: string;
  formId: string;
  formTitle: string;
  formVersion: number;
  contributorUid: string;
  status: ResponseStatus;
  /** Submitted revisions so far (0 while a never-submitted draft). */
  revision: number;
  /** Save counter of the working answers (optimistic concurrency for the contributor). */
  draftRevision: number;
  /**
   * Answers of the latest submitted revision: what reviewers, admins and
   * exports see. Empty while the response has never been submitted.
   */
  answers: Answers;
  /**
   * The contributor's unsent edits (a draft, or a revision in progress after
   * changes were requested). Never shown to reviewers or exported. Null when
   * there are none.
   */
  workingAnswers: Answers | null;
  consents: ConsentRecord[];
  grantedPurposes: ConsentPurpose[];
  /** Every upload id ever submitted with this response (current and earlier revisions). */
  attachmentIds: string[];
  referenceId: string | null;
  languageIds: string[];
  dialectIds: string[];
  reviewerGroup: ReviewerGroup;
  reviewRequired: boolean;
  feedback: string | null;
  lastDecision: { decision: string; actorUid: string; at: string } | null;
  reward: { points: number; status: 'none' | 'awarded' | 'failed' | 'not_applicable'; entryId: string | null; note: string | null };
  routing: { destination: string; status: 'not_applicable' | 'pending' | 'routed' | 'blocked' | 'failed'; targetCollection: string | null; targetId: string | null; note: string | null };
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  firstSubmittedAt: string | null;
  decidedAt: string | null;
}

export interface UploadDoc {
  id: string;
  ownerUid: string;
  responseId: string;
  formId: string;
  formVersion: number;
  fieldId: string;
  path: string;
  name: string;
  declaredType: string;
  declaredSize: number;
  status: 'pending' | 'ready' | 'rejected' | 'removed';
  format: string | null;
  contentType: string | null;
  size: number | null;
  generation: string | null;
  sha256: string | null;
  rejectionReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface FormsSettings {
  /** Empty = every administrator may publish. */
  publishers: string[];
  /** Empty = every administrator may export. */
  exporters: string[];
  /** Finance-owned limits on points from approved form responses. */
  rewards: { enabled: boolean; maxPointsPerResponse: number; dailyCap: number };
}

export const DEFAULT_SETTINGS: FormsSettings = {
  publishers: [],
  exporters: [],
  rewards: { enabled: true, maxPointsPerResponse: 20, dailyCap: 100 },
};

export function emptyCounts(): StatusCounts {
  return { draft: 0, submitted: 0, under_review: 0, changes_requested: 0, approved: 0, rejected: 0 };
}

/* -- Small value helpers -------------------------------------------------------------- */

export function nowIso(): string {
  return new Date().toISOString();
}

export function objectData(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpsError('invalid-argument', 'Request is malformed.');
  return value as Record<string, unknown>;
}

const DOC_ID = /^[A-Za-z0-9_-]{1,80}$/;
export function docId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !DOC_ID.test(value)) throw new HttpsError('invalid-argument', `${label} is missing or malformed.`);
  return value;
}

export function wholeNumber(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new HttpsError('invalid-argument', `${label} must be a whole number.`);
  return value as number;
}

/** A random, URL-safe document id. */
export function newDocId(prefix: string): string {
  return `${prefix}${randomBytes(12).toString('base64url')}`;
}

export function newReferenceId(): string {
  return referenceIdFrom(randomBytes(5));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Deterministic JSON (sorted keys) for hashing definitions and request payloads. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The languages and Kasem varieties a response is about, for filtering. */
export function languageFacets(definition: FormDefinition, answers: Answers): { languageIds: string[]; dialectIds: string[] } {
  const languageIds = new Set(definition.languageContext.languageIds);
  const dialectIds = new Set(definition.languageContext.dialectIds);
  for (const { field } of topLevelFields(definition)) {
    const value = answers[field.id];
    if (field.type === 'language' && typeof value === 'string' && FORM_LANGUAGES.some((item) => item.id === value)) languageIds.add(value);
    if (field.type === 'dialect' && typeof value === 'string' && FORM_DIALECTS.some((item) => item.id === value)) dialectIds.add(value);
  }
  return { languageIds: [...languageIds], dialectIds: [...dialectIds] };
}

export function consentFacts(definition: FormDefinition, answers: Answers): { consents: ConsentRecord[]; grantedPurposes: ConsentPurpose[] } {
  const consents = consentRecords(definition, answers);
  return { consents, grantedPurposes: grantedPurposes(consents) };
}

/* -- Callers and permissions ---------------------------------------------------------------- */

export interface FormsCaller {
  uid: string;
  role: Role | null;
  isAdmin: boolean;
  isOwner: boolean;
  finance: boolean;
}

export function formsCaller(req: CallableRequest<unknown>): FormsCaller {
  const uid = requireAuth(req);
  const claims = callerClaims(req);
  const role = effectiveRole(claims);
  return {
    uid,
    role,
    isAdmin: roleSatisfies(role, 'admin'),
    isOwner: isOwnerSuperAdmin(claims),
    finance: hasFinanceAccess(claims),
  };
}

export function requireFormsAdmin(caller: FormsCaller): void {
  if (!caller.isAdmin) throw new HttpsError('permission-denied', 'Administrator access is required to manage forms.');
}

export async function loadSettings(db: Firestore = getFirestore(), tx?: Transaction): Promise<FormsSettings> {
  const ref = db.doc(SETTINGS_PATH);
  const snap = tx ? await tx.get(ref) : await ref.get();
  const raw = (snap.exists ? snap.data() : {}) as Partial<FormsSettings>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  const rewards = (raw.rewards ?? {}) as Partial<FormsSettings['rewards']>;
  return {
    publishers: list(raw.publishers),
    exporters: list(raw.exporters),
    rewards: {
      enabled: rewards.enabled !== false,
      maxPointsPerResponse: Number.isInteger(rewards.maxPointsPerResponse) ? Number(rewards.maxPointsPerResponse) : DEFAULT_SETTINGS.rewards.maxPointsPerResponse,
      dailyCap: Number.isInteger(rewards.dailyCap) ? Number(rewards.dailyCap) : DEFAULT_SETTINGS.rewards.dailyCap,
    },
  };
}

/** Publishing is a separate permission: any admin by default, or only the listed admins. */
export function canPublish(caller: FormsCaller, settings: FormsSettings): boolean {
  if (!caller.isAdmin) return false;
  return caller.isOwner || !settings.publishers.length || settings.publishers.includes(caller.uid);
}

/** Exporting is a separate permission: any admin by default, or only the listed admins. */
export function canExport(caller: FormsCaller, settings: FormsSettings): boolean {
  if (!caller.isAdmin) return false;
  return caller.isOwner || !settings.exporters.length || settings.exporters.includes(caller.uid);
}

/** An active, unexpired knowledge review grant with this scope (knowledgeRoleGrants/{uid}). */
function grantHasScope(raw: Record<string, unknown> | undefined, scope: 'language' | 'culture', now = Date.now()): boolean {
  if (!raw || raw.active !== true) return false;
  const scopes = Array.isArray(raw.scopes) ? raw.scopes : [];
  const expiresAt = typeof raw.expiresAt === 'string' ? Date.parse(raw.expiresAt) : NaN;
  return scopes.includes(scope) && Number.isFinite(expiresAt) && expiresAt > now
    && typeof raw.qualificationReference === 'string' && raw.qualificationReference.trim().length > 0;
}

/**
 * Whether the caller belongs to a form's reviewer group. Administrators review
 * every group. Validators and reviewers hold the same standing everywhere in
 * the platform, so `reviewers` accepts both; the scoped groups also need an
 * active knowledge review grant.
 */
export async function inReviewerGroup(caller: FormsCaller, group: ReviewerGroup, db: Firestore = getFirestore(), grants?: Map<string, Record<string, unknown> | undefined>): Promise<boolean> {
  if (caller.isAdmin) return true;
  if (!roleSatisfies(caller.role, 'validator')) return false;
  if (group === 'reviewers') return true;
  if (group === 'admins') return false;
  let grant = grants?.get(caller.uid);
  if (!grants?.has(caller.uid)) {
    const snap = await db.doc(`knowledgeRoleGrants/${caller.uid}`).get();
    grant = snap.exists ? snap.data() : undefined;
    grants?.set(caller.uid, grant);
  }
  return grantHasScope(grant, group === 'language_reviewers' ? 'language' : 'culture');
}

/** Any review standing at all (used to gate the review queue before per-form checks). */
export function mayReviewSomething(caller: FormsCaller): boolean {
  return caller.isAdmin || roleSatisfies(caller.role, 'validator');
}

/* -- Names ------------------------------------------------------------------------------------ */

/** Display names for uids: the contributor profile name, then the Auth name, never an email address. */
export async function displayNames(uids: Iterable<string>, db: Firestore = getFirestore()): Promise<Map<string, string>> {
  const unique = [...new Set([...uids].filter(Boolean))];
  const names = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const profiles = await db.getAll(...batch.map((uid) => db.doc(`contributors/${uid}`)));
    const missing: string[] = [];
    for (const snap of profiles) {
      const name = snap.get('public.displayName');
      if (typeof name === 'string' && name.trim()) names.set(snap.id, name.trim());
      else missing.push(snap.id);
    }
    if (missing.length) {
      const result = await getAuth().getUsers(missing.map((uid) => ({ uid }))).catch(() => ({ users: [] as Array<{ uid: string; displayName?: string }> }));
      for (const user of result.users) if (user.displayName?.trim()) names.set(user.uid, user.displayName.trim());
    }
  }
  for (const uid of unique) if (!names.has(uid)) names.set(uid, 'Contributor');
  return names;
}

/* -- Audit, history, counts, notifications --------------------------------------------------- */

/**
 * The canonical audit row (packages/contracts/schemas/audit-log.schema.json)
 * plus `domain` and a one-line `summary` for the Forms activity feed. Write it
 * in the same transaction or batch as the change it records.
 */
export function formsAudit(input: {
  actor: string;
  action: string;
  formId?: string | null;
  formTitle?: string | null;
  responseId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  at?: string;
}): Record<string, unknown> & { id: string } {
  const ref = getFirestore().collection('auditLogs').doc();
  return {
    id: ref.id,
    domain: AUDIT_DOMAIN,
    actor: { collection: 'contributors', id: input.actor },
    action: input.action,
    target: input.responseId ? { collection: RESPONSES, id: input.responseId } : { collection: FORMS, id: input.formId ?? 'settings' },
    outcome: 'success',
    source: 'functions',
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: { ...(input.metadata ?? {}), formId: input.formId ?? null, formTitle: input.formTitle ?? null, responseId: input.responseId ?? null },
    summary: input.summary.slice(0, 300),
    occurredAt: input.at ?? nowIso(),
  };
}

export function auditRef(entry: { id: string }): DocumentReference {
  return getFirestore().collection('auditLogs').doc(entry.id);
}

/** `counts.<status>` increments for a status change (null = no response before / after). */
export function countsDelta(from: ResponseStatus | null, to: ResponseStatus | null): Record<string, FieldValue> {
  const delta: Record<string, FieldValue> = {};
  if (from === to) return delta;
  if (from && (RESPONSE_STATUSES as readonly string[]).includes(from)) delta[`counts.${from}`] = FieldValue.increment(-1);
  if (to && (RESPONSE_STATUSES as readonly string[]).includes(to)) delta[`counts.${to}`] = FieldValue.increment(1);
  return delta;
}

export function historyRef(responseId: string, eventId: string): DocumentReference {
  return getFirestore().collection(RESPONSES).doc(responseId).collection(HISTORY).doc(eventId);
}

/** Read in the transaction's read phase: whether the contributor accepts review emails. */
export async function reviewEmailAllowed(tx: Transaction, uid: string): Promise<boolean> {
  const snap = await tx.get(getFirestore().doc(`contributorSettings/${uid}`));
  return snap.get('notifications.reviewEmail') !== false;
}

/**
 * An in-app (and, unless the contributor opted out, email) notice about one
 * response event. The id is derived from the event, so a retried decision
 * never notifies twice.
 */
export function notifyContributor(tx: Transaction, input: {
  uid: string;
  responseId: string;
  eventId: string;
  title: string;
  body: string;
  email: boolean;
}): void {
  const id = `form-${sha256(`${input.responseId}:${input.eventId}`).slice(0, 40)}`;
  const at = nowIso();
  tx.set(getFirestore().collection('notifications').doc(id), {
    id,
    recipient: { collection: 'contributors', id: input.uid },
    authUid: input.uid,
    type: 'form_review',
    title: input.title.slice(0, 140),
    body: input.body.slice(0, 1000),
    link: `/contributor/forms/submissions/${input.responseId}`,
    read: false,
    channels: input.email ? ['in_app', 'email'] : ['in_app'],
    schemaVersion: 1,
    lifecycle: { createdAt: at, updatedAt: at, version: 1 },
  });
}

/* -- Loading ------------------------------------------------------------------------------------ */

export function formRef(formId: string): DocumentReference {
  return getFirestore().collection(FORMS).doc(formId);
}

export function versionRef(formId: string, version: number): DocumentReference {
  return formRef(formId).collection(VERSIONS).doc(String(version));
}

export function responseRef(responseId: string): DocumentReference {
  return getFirestore().collection(RESPONSES).doc(responseId);
}

export async function loadForm(formId: string, tx?: Transaction): Promise<FormDoc> {
  const ref = formRef(formId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'This form does not exist.');
  return snap.data() as FormDoc;
}

export async function loadVersion(formId: string, version: number, tx?: Transaction): Promise<VersionDoc> {
  const ref = versionRef(formId, version);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'This form version does not exist.');
  return snap.data() as VersionDoc;
}

export async function loadResponse(responseId: string, tx?: Transaction): Promise<ResponseDoc> {
  const ref = responseRef(responseId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'This response does not exist.');
  return snap.data() as ResponseDoc;
}

/* -- Views ----------------------------------------------------------------------------------------- */

export function formSummary(form: FormDoc, cohortNames: Record<string, string> = {}): FormSummary {
  return {
    id: form.id,
    title: form.title,
    description: form.description,
    category: form.category,
    languageIds: form.languageIds ?? [],
    status: form.status,
    currentVersion: form.currentVersion,
    draftVersion: form.draftVersion,
    publishedVersions: form.publishedVersions ?? [],
    retiredVersions: form.retiredVersions ?? [],
    counts: { ...emptyCounts(), ...(form.counts ?? {}) },
    totalSubmitted: form.totalSubmitted ?? 0,
    audienceText: audienceText(form.audience, cohortNames),
    closesAt: form.closesAt,
    opensAt: form.opensAt,
    createdAt: form.createdAt,
    createdBy: form.createdBy,
    updatedAt: form.updatedAt,
    updatedByName: form.updatedByName,
    lastActivityAt: form.lastActivityAt,
    templateId: form.templateId,
  };
}

export function responseSummary(response: ResponseDoc, names: Map<string, string>): ResponseSummary {
  return {
    id: response.id,
    referenceId: response.referenceId,
    formId: response.formId,
    formTitle: response.formTitle,
    formVersion: response.formVersion,
    status: response.status,
    revision: response.revision,
    contributorId: response.contributorUid,
    contributorName: names.get(response.contributorUid) ?? 'Contributor',
    languageIds: response.languageIds ?? [],
    dialectIds: response.dialectIds ?? [],
    submittedAt: response.submittedAt,
    updatedAt: response.updatedAt,
    decidedAt: response.decidedAt,
    answers: response.answers ?? {},
    grantedPurposes: response.grantedPurposes ?? [],
    attachmentCount: response.attachmentIds?.length ?? 0,
  };
}

/* -- Attachments ------------------------------------------------------------------------------------ */

/**
 * A five-minute, generation-pinned download link for one attachment of a
 * response, forced to download. Every link issued is recorded in the
 * response history; links are never stored or exported.
 */
export async function attachmentLink(input: {
  response: ResponseDoc;
  attachmentId: string;
  actorUid: string;
  actorRole: 'contributor' | 'reviewer' | 'admin';
}): Promise<{ url: string; expiresAt: string }> {
  const db = getFirestore();
  const attachmentId = docId(input.attachmentId, 'Attachment');
  // Reviewers and admins reach submitted attachments only; the contributor also reaches their unsent uploads.
  const unsent = input.actorRole === 'contributor' && JSON.stringify(input.response.workingAnswers ?? {}).includes(`"${attachmentId}"`);
  if (!unsent && !(input.response.attachmentIds ?? []).includes(attachmentId)) {
    throw new HttpsError('not-found', 'This attachment is not part of the response.');
  }
  const snap = await db.collection(UPLOADS).doc(attachmentId).get();
  const upload = snap.data() as UploadDoc | undefined;
  if (!upload || upload.responseId !== input.response.id || upload.status !== 'ready' || !upload.generation) {
    throw new HttpsError('not-found', 'This attachment is not available.');
  }
  const expires = Date.now() + 5 * 60_000;
  const safeName = upload.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'attachment';
  const file = getStorage().bucket().file(upload.path, { generation: Number(upload.generation) });
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires,
    responseDisposition: `attachment; filename="${safeName}"`,
    responseType: upload.contentType ?? 'application/octet-stream',
  });
  if (input.actorRole !== 'contributor') {
    await historyRef(input.response.id, `link-${newDocId('')}`).set({
      type: 'attachment_link',
      actorUid: input.actorUid,
      actorRole: input.actorRole,
      revision: input.response.revision,
      at: nowIso(),
      note: `Download link issued for ${upload.name}`,
      attachmentId,
    });
  }
  return { url, expiresAt: new Date(expires).toISOString() };
}

/** Attachments named in answers that are registered, ready and owned by this response. */
export async function verifyAttachments(responseId: string, ownerUid: string, refs: Array<AttachmentRef & { fieldId: string }>, tx?: Transaction): Promise<Map<string, UploadDoc>> {
  const db = getFirestore();
  const found = new Map<string, UploadDoc>();
  if (!refs.length) return found;
  const docs = tx
    ? await tx.getAll(...refs.map((ref) => db.collection(UPLOADS).doc(ref.id)))
    : await db.getAll(...refs.map((ref) => db.collection(UPLOADS).doc(ref.id)));
  for (const [index, snap] of docs.entries()) {
    const ref = refs[index];
    const upload = snap.data() as UploadDoc | undefined;
    if (!upload || upload.ownerUid !== ownerUid || upload.responseId !== responseId || upload.fieldId !== ref.fieldId) {
      throw new HttpsError('invalid-argument', `${ref.name || 'An attachment'} was not uploaded to this question.`, { reason: 'attachment' });
    }
    if (upload.status !== 'ready') {
      throw new HttpsError('failed-precondition', `${upload.name} has not finished uploading or failed its check. Remove it and upload it again.`, { reason: 'attachment' });
    }
    found.set(ref.id, upload);
  }
  return found;
}

/* -- Response detail ---------------------------------------------------------------------------- */

const HISTORY_TYPES = new Set<HistoryEvent['type']>([
  'created', 'submitted', 'resubmitted', 'review_started', 'changes_requested', 'approved', 'rejected',
  'points_awarded', 'points_failed', 'routed', 'routing_blocked', 'version_moved', 'attachment_link',
]);
const ACTOR_ROLES = new Set<HistoryEvent['actorRole']>(['contributor', 'reviewer', 'admin', 'system']);

/**
 * The full view of one response (forms-api ResponseDetail). `contributor` is
 * the contributor's own view: it shows their unsent answers while the
 * response has never been submitted, names reviewers only by role ("Indigen
 * World reviewer"), and leaves out internal notes, download-link events and
 * the ids of records created in other workflows. `staff` shows submitted
 * answers and real names.
 */
export async function loadResponseDetail(response: ResponseDoc, options: { viewer: 'contributor' | 'staff'; allowedDecisions?: ReviewDecision[] }): Promise<ResponseDetail> {
  const db = getFirestore();
  const ref = responseRef(response.id);
  const contributorView = options.viewer === 'contributor';
  const [versionSnap, revisionSnaps, historySnaps] = await Promise.all([
    versionRef(response.formId, response.formVersion).get(),
    ref.collection(REVISIONS).orderBy('revision', 'asc').limit(200).get(),
    ref.collection(HISTORY).orderBy('at', 'asc').limit(500).get(),
  ]);
  const version = versionSnap.data() as VersionDoc | undefined;
  if (!version) throw new HttpsError('not-found', 'This form version does not exist.');
  const answers = contributorView && response.revision === 0 ? (response.workingAnswers ?? {}) : (response.answers ?? {});

  const rawHistory = historySnaps.docs
    .map((doc) => ({ id: doc.id, raw: doc.data() as Record<string, unknown> }))
    .filter(({ raw }) => HISTORY_TYPES.has(raw.type as HistoryEvent['type']))
    .filter(({ raw }) => !(contributorView && raw.type === 'attachment_link'));
  const names = await displayNames([
    response.contributorUid,
    ...(contributorView ? [] : rawHistory.map(({ raw }) => (typeof raw.actorUid === 'string' ? raw.actorUid : ''))),
  ], db);
  const history: HistoryEvent[] = rawHistory.map(({ id, raw }) => {
    const actorRole = ACTOR_ROLES.has(raw.actorRole as HistoryEvent['actorRole']) ? raw.actorRole as HistoryEvent['actorRole'] : 'system';
    const actorUid = typeof raw.actorUid === 'string' ? raw.actorUid : '';
    const actorName = actorRole === 'system'
      ? 'Indigen World'
      : contributorView && actorRole !== 'contributor' ? 'Indigen World reviewer' : names.get(actorUid) ?? 'Unknown';
    const event: HistoryEvent = {
      id,
      type: raw.type as HistoryEvent['type'],
      actorName,
      actorRole,
      revision: Number.isInteger(raw.revision) ? raw.revision as number : 0,
      at: typeof raw.at === 'string' ? raw.at : '',
    };
    if (typeof raw.feedback === 'string' && raw.feedback) event.feedback = raw.feedback;
    if (Array.isArray(raw.checks) && !contributorView) event.checks = raw.checks.filter((item): item is string => typeof item === 'string');
    if (typeof raw.note === 'string' && raw.note && (!contributorView || actorRole === 'contributor')) event.note = raw.note;
    return event;
  });

  const revisions: RevisionSnapshot[] = revisionSnaps.docs.map((doc) => {
    const raw = doc.data();
    return {
      revision: Number(raw.revision),
      formVersion: Number(raw.formVersion),
      answers: (raw.answers ?? {}) as Answers,
      consents: (raw.consents ?? []) as ConsentRecord[],
      submittedAt: String(raw.submittedAt ?? ''),
    };
  });

  const refs = attachmentsIn(version.definition, answers);
  const uploads = refs.length ? await db.getAll(...refs.map((item) => db.collection(UPLOADS).doc(item.id))) : [];
  const attachments = refs.map((item, index) => {
    const status = (uploads[index]?.data() as UploadDoc | undefined)?.status;
    return { ...item, inspection: status === 'ready' ? 'passed' as const : status === 'rejected' ? 'rejected' as const : 'pending' as const };
  });

  const reward = response.reward ?? { points: 0, status: 'none', entryId: null, note: null };
  const routing = response.routing ?? { destination: version.definition.destination.type, status: 'not_applicable', targetCollection: null, targetId: null, note: null };
  return {
    ...responseSummary(response, names),
    answers,
    definition: version.definition,
    versionState: version.state,
    consents: response.consents ?? [],
    attachments,
    feedback: response.feedback ?? null,
    revisions,
    history,
    reward: { points: reward.points ?? 0, status: reward.status ?? 'none', note: reward.note ?? null },
    routing: {
      destination: routing.destination,
      status: routing.status,
      targetCollection: contributorView ? null : routing.targetCollection ?? null,
      targetId: contributorView ? null : routing.targetId ?? null,
      note: routing.note ?? null,
    },
    allowedDecisions: options.allowedDecisions ?? [],
    expectedStatus: response.status,
    expectedRevision: response.revision,
  };
}
