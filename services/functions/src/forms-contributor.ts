import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  ANSWERS_BYTE_BUDGET, FIELD_TYPES, attachmentsIn, audienceMatches, carryAnswers, submissionWindow, topLevelFields, validateAnswers,
  type Answers, type AnswerValue, type AudienceProfile, type FormDefinition, type FormField, type FormStatus,
  type Issue, type ResponseStatus,
} from '@indigen-world/contracts/forms';
import type { AvailableForm, MyResponse, OpenedForm } from '@indigen-world/contracts/forms-api';
import { requireAuth } from './auth.js';
import { guarded, requireActiveContributor } from './contributor-common.js';
import {
  COHORTS, FORMS, FORMS_CALL_OPTIONS, REQUESTS, RESPONSES, REVISIONS, UPLOADS,
  attachmentLink, consentFacts, countsDelta, docId, formRef, historyRef, languageFacets, loadForm,
  loadResponse, loadResponseDetail, loadVersion, newDocId, newReferenceId, nowIso, objectData, responseRef,
  sha256, verifyAttachments, versionRef, wholeNumber,
  type FormDoc, type ResponseDoc, type UploadDoc, type VersionDoc,
} from './forms-common.js';
import {
  beginFormUpload, confirmFormUpload, deleteDraftUploads, removeFormUpload, requestExpiry, unusedUploads,
} from './forms-uploads.js';
import { consumeRateLimit } from './rate-limit.js';
import { checkSubmissionRetry, submissionRetry } from './submission-retry.js';

/**
 * formsContributor: the contributor portal's only way into Indigen Forms
 * (docs/architecture/indigen-forms.md). Contributors send answers and nothing
 * else; status, reference ids, consents, reviewer routing and counts are all
 * computed here against the authoritative published version.
 */

/** Responses the contributor may still change. */
const EDITABLE: readonly ResponseStatus[] = ['draft', 'changes_requested'];
/** Forms a contributor can see at all (draft forms are unpublished, archived forms are hidden). */
const VISIBLE: readonly FormStatus[] = ['published', 'paused', 'closed'];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const db = () => getFirestore();

function notFound(): never {
  throw new HttpsError('not-found', 'This response does not exist.');
}

function notEligible(): never {
  throw new HttpsError('permission-denied', 'This form is not open to your account.', { reason: 'audience' });
}

/** What the server knows for audience matching: profile variety, contribution types and cohorts. */
async function audienceProfile(uid: string): Promise<AudienceProfile & { submitBlocked: boolean }> {
  const [profile, cohorts] = await Promise.all([
    db().doc(`contributors/${uid}`).get(),
    db().collection(COHORTS).where('memberUids', 'array-contains', uid).select().limit(200).get(),
  ]);
  const dialect = profile.get('languageProfile.dialect');
  const types = profile.get('contributionTypes');
  return {
    // The legacy contributor rule: a missing permission counts as allowed.
    submitBlocked: profile.get('status') === 'inactive' || profile.get('permissions.submit') === false,
    dialect: typeof dialect === 'string' ? dialect : null,
    contributionTypes: Array.isArray(types) ? types.filter((item): item is string => typeof item === 'string') : [],
    cohortIds: cohorts.docs.map((doc) => doc.id),
  };
}

/**
 * A response that has been submitted once stays reachable for its owner (for
 * example to resubmit after changes were requested) even if the audience
 * changes; anything new needs the version's audience.
 */
function mayUse(definition: FormDefinition, response: ResponseDoc | null, profile: AudienceProfile): boolean {
  if (response && response.revision > 0) return true;
  return audienceMatches(definition.audience, profile);
}

type Schedule = { opensAt: string | null; closesAt: string | null };

/** The later opening and the earlier deadline of the given schedules. */
function stricterSchedule(...schedules: Array<Partial<Schedule> | null | undefined>): Schedule {
  const times = (key: keyof Schedule) => schedules
    .map((schedule) => schedule?.[key])
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return { opensAt: times('opensAt').at(-1) ?? null, closesAt: times('closesAt')[0] ?? null };
}

/**
 * Whether a response may be submitted now. Resubmission after changes were
 * requested is allowed unless the form was archived. Anything else is bound by
 * its own version's schedule and by the form's current one (the head mirrors
 * the current published version), whichever is stricter: publishing a version
 * with a deadline ends collection for drafts on older versions too.
 */
function windowFor(form: FormDoc, version: VersionDoc, response: ResponseDoc | null) {
  if (response?.status === 'changes_requested' && form.status !== 'archived') return { open: true, reason: null, message: '' };
  const schedule = stricterSchedule(version.definition.schedule, { opensAt: form.opensAt, closesAt: form.closesAt });
  return submissionWindow({ formStatus: form.status, versionState: version.state, schedule });
}

/** One response per contributor and form for "once" forms: the id itself enforces it. */
export function onceResponseId(formId: string, uid: string): string {
  return `${formId}_${sha256(`once:${uid}`).slice(0, 24)}`;
}

function answersInput(value: unknown): Answers {
  if (!isObject(value)) throw new HttpsError('invalid-argument', 'Answers are malformed.');
  // Firestore holds a response in one document; the portal checks the same budget before sending.
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > ANSWERS_BYTE_BUDGET) {
    throw new HttpsError('invalid-argument', 'This response is too large to save. Shorten the longest answers.', { reason: 'too-large' });
  }
  return value as Answers;
}

/** Answer keys (and group entry keys) that are not questions of this version. */
function unknownKeys(definition: FormDefinition, input: Answers): Issue[] {
  const fields = new Map(topLevelFields(definition).map(({ field }) => [field.id, field]));
  const issues: Issue[] = [];
  for (const [key, value] of Object.entries(input)) {
    const field = fields.get(key);
    if (!field || !FIELD_TYPES[field.type].collects) {
      issues.push({ path: key, message: 'Unknown answer.' });
      continue;
    }
    if (field.type === 'group' && Array.isArray(value)) {
      const subs = new Set((field.fields ?? []).map((sub) => sub.id));
      value.forEach((item, index) => {
        if (isObject(item)) for (const sub of Object.keys(item)) if (!subs.has(sub)) issues.push({ path: `${key}.${index}.${sub}`, message: 'Unknown answer.' });
      });
    }
  }
  return issues;
}

function requiredRetry(uid: string, operation: string, requestId: unknown, input: unknown) {
  if (requestId === undefined || requestId === null) throw new HttpsError('invalid-argument', 'A request id is required.');
  return submissionRetry(uid, operation, requestId, input)!;
}

async function ownResponse(uid: string, responseId: unknown): Promise<ResponseDoc> {
  const response = await loadResponse(docId(responseId, 'Response'));
  if (response.contributorUid !== uid) notFound();
  return response;
}

async function ownResponsesForForm(uid: string, formId: string): Promise<ResponseDoc[]> {
  const snap = await db().collection(RESPONSES).where('contributorUid', '==', uid).where('formId', '==', formId).limit(100).get();
  return snap.docs.map((doc) => doc.data() as ResponseDoc).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* -- list ------------------------------------------------------------------------------------- */

async function list(uid: string, profile: AudienceProfile): Promise<{ forms: AvailableForm[]; attention: number }> {
  const [formsSnap, mineSnap] = await Promise.all([
    db().collection(FORMS).where('status', 'in', [...VISIBLE]).limit(300).get(),
    db().collection(RESPONSES).where('contributorUid', '==', uid).orderBy('updatedAt', 'desc').limit(500).get(),
  ]);
  const mine = new Map<string, ResponseDoc[]>();
  let attention = 0;
  for (const doc of mineSnap.docs) {
    const response = doc.data() as ResponseDoc;
    if (response.status === 'changes_requested') attention += 1;
    mine.set(response.formId, [...(mine.get(response.formId) ?? []), response]);
  }
  const forms = formsSnap.docs.map((doc) => doc.data() as FormDoc).filter((form) => form.currentVersion);
  const versions = forms.length ? await db().getAll(...forms.map((form) => versionRef(form.id, form.currentVersion!))) : [];
  const out: AvailableForm[] = [];
  forms.forEach((form, index) => {
    const version = versions[index]?.data() as VersionDoc | undefined;
    if (!version) return;
    const own = mine.get(form.id) ?? [];
    const needsChanges = own.filter((response) => response.status === 'changes_requested').length;
    if (!audienceMatches(version.definition.audience, profile) && !needsChanges) return;
    if (form.status === 'closed' && !own.length) return;
    const draft = own.find((response) => response.status === 'draft') ?? null;
    const submitted = own.filter((response) => response.status !== 'draft');
    const window = windowFor(form, version, null);
    out.push({
      id: form.id,
      title: version.definition.title,
      description: version.definition.description,
      category: version.definition.category,
      estimatedMinutes: version.definition.estimatedMinutes,
      closesAt: version.definition.schedule.closesAt,
      opensAt: version.definition.schedule.opensAt,
      version: version.version,
      open: window.open,
      closedReason: window.reason,
      policy: version.definition.submission.policy,
      mine: {
        draftId: draft?.id ?? null,
        draftVersion: draft?.formVersion ?? null,
        submitted: submitted.length,
        latestStatus: submitted[0]?.status ?? null,
        latestResponseId: submitted[0]?.id ?? null,
        needsChanges,
      },
    });
  });
  out.sort((a, b) => Number(b.open) - Number(a.open) || a.title.localeCompare(b.title));
  return { forms: out, attention };
}

/* -- open --------------------------------------------------------------------------------------- */

async function open(uid: string, data: Record<string, unknown>, profile: AudienceProfile): Promise<OpenedForm> {
  const formId = docId(data.formId, 'Form');
  const form = await loadForm(formId);
  if (!VISIBLE.includes(form.status) || !form.currentVersion) throw new HttpsError('not-found', 'This form is not available.');
  const own = await ownResponsesForForm(uid, formId);
  let response: ResponseDoc | null = null;
  if (data.responseId !== undefined && data.responseId !== null) {
    response = await ownResponse(uid, data.responseId);
    if (response.formId !== formId) notFound();
  } else if (data.startNew !== true) {
    response = own.find((item) => item.status === 'draft') ?? own.find((item) => item.status === 'changes_requested') ?? null;
  }
  const [version, current] = await Promise.all([
    loadVersion(formId, response?.formVersion ?? form.currentVersion),
    loadVersion(formId, form.currentVersion),
  ]);
  if (!mayUse(version.definition, response, profile)) notEligible();
  const once = current.definition.submission.policy === 'once';
  const currentWindow = windowFor(form, current, null);
  const canStartNew = audienceMatches(current.definition.audience, profile)
    && (currentWindow.open || currentWindow.reason === 'not_yet_open')
    && !(once && own.length > 0);
  return {
    form: { id: form.id, title: current.definition.title, status: form.status, currentVersion: form.currentVersion },
    version: version.version,
    versionState: version.state,
    definition: version.definition,
    window: windowFor(form, version, response),
    response: response ? {
      id: response.id,
      status: response.status,
      revision: response.revision,
      draftRevision: response.draftRevision,
      answers: response.workingAnswers ?? response.answers ?? {},
      referenceId: response.referenceId,
      feedback: response.feedback,
      updatedAt: response.updatedAt,
    } : null,
    newerVersion: response && response.status === 'draft' && response.revision === 0 && form.currentVersion > response.formVersion ? form.currentVersion : null,
    canStartNew,
  };
}

/* -- saveDraft ------------------------------------------------------------------------------------ */

function newResponse(input: { id: string; uid: string; form: FormDoc; version: VersionDoc; answers: Answers; now: string }): ResponseDoc {
  const { definition } = input.version;
  const facets = languageFacets(definition, input.answers);
  return {
    id: input.id,
    formId: input.form.id,
    formTitle: definition.title,
    formVersion: input.version.version,
    contributorUid: input.uid,
    status: 'draft',
    revision: 0,
    draftRevision: 1,
    answers: {},
    workingAnswers: input.answers,
    consents: [],
    grantedPurposes: [],
    attachmentIds: [],
    referenceId: null,
    languageIds: facets.languageIds,
    dialectIds: facets.dialectIds,
    reviewerGroup: definition.review.reviewerGroup,
    reviewRequired: definition.review.required,
    feedback: null,
    lastDecision: null,
    reward: { points: 0, status: 'none', entryId: null, note: null },
    routing: { destination: definition.destination.type, status: 'not_applicable', targetCollection: null, targetId: null, note: null },
    createdAt: input.now,
    updatedAt: input.now,
    submittedAt: null,
    firstSubmittedAt: null,
    decidedAt: null,
  };
}

async function saveDraft(uid: string, data: Record<string, unknown>, profile: () => Promise<AudienceProfile>) {
  await consumeRateLimit('formsSaveDraft', uid, 60, 60_000);
  const formId = docId(data.formId, 'Form');
  const versionNumber = wholeNumber(data.version, 'Form version', 1, 100_000);
  const answers = answersInput(data.answers);
  const responseIdInput = data.responseId === undefined || data.responseId === null ? null : docId(data.responseId, 'Response');
  const expected = data.expectedDraftRevision === undefined || data.expectedDraftRevision === null ? null : wholeNumber(data.expectedDraftRevision, 'Draft revision');
  const retry = requiredRetry(uid, 'forms.saveDraft', data.requestId, { formId, responseId: responseIdInput, version: versionNumber, answers, expected });

  const [form, version] = await Promise.all([loadForm(formId), loadVersion(formId, versionNumber)]);
  if (version.state === 'draft' || !VISIBLE.includes(form.status)) throw new HttpsError('failed-precondition', 'This form is not accepting responses.', { reason: 'not_published' });
  const definition = version.definition;
  const unknown = unknownKeys(definition, answers);
  if (unknown.length) throw new HttpsError('invalid-argument', 'This response includes answers to questions that are not on the form.', { reason: 'invalid', issues: unknown });
  const { answers: cleaned, issues } = validateAnswers(definition, answers, { mode: 'draft' });
  const eligible = audienceMatches(definition.audience, await profile());
  const retryRef = db().collection(REQUESTS).doc(retry.id);

  return db().runTransaction(async (tx) => {
    const prior = (await tx.get(retryRef)).data();
    if (checkSubmissionRetry(prior, uid, retry.hash)) return prior!.result as { responseId: string; draftRevision: number; savedAt: string; issues: Issue[] };
    const implicitId = !responseIdInput && definition.submission.policy === 'once' ? onceResponseId(formId, uid) : null;
    const responseId = responseIdInput ?? implicitId;
    const snap = responseId ? await tx.get(responseRef(responseId)) : null;
    const existing = snap?.exists ? snap.data() as ResponseDoc : null;
    if (responseIdInput && !existing) notFound();
    const now = nowIso();
    let result: { responseId: string; draftRevision: number; savedAt: string; issues: Issue[] };
    if (existing) {
      if (existing.contributorUid !== uid || existing.formId !== formId) notFound();
      if (!EDITABLE.includes(existing.status)) {
        throw new HttpsError('failed-precondition', implicitId ? 'You have already responded to this form.' : 'This response has been submitted and can no longer be edited.', { reason: 'not-editable', responseId: existing.id });
      }
      if (existing.formVersion !== versionNumber) {
        throw new HttpsError('failed-precondition', 'This draft belongs to another version of the form. Reload it.', { reason: 'version', version: existing.formVersion });
      }
      if (implicitId ? expected !== existing.draftRevision : expected !== null && expected !== existing.draftRevision) {
        throw new HttpsError('aborted', 'This draft was changed somewhere else. Reload it to see the latest version.', { reason: 'conflict', responseId: existing.id, draftRevision: existing.draftRevision });
      }
      if (existing.revision === 0 && !eligible) notEligible();
      tx.update(responseRef(existing.id), { workingAnswers: cleaned, draftRevision: existing.draftRevision + 1, updatedAt: now });
      result = { responseId: existing.id, draftRevision: existing.draftRevision + 1, savedAt: now, issues };
    } else {
      if (!eligible) notEligible();
      // New responses always start on the current version, inside the form's window (an early draft is fine).
      if (form.currentVersion !== versionNumber) throw new HttpsError('failed-precondition', 'A newer version of this form is available. Reload it.', { reason: 'version', version: form.currentVersion });
      const window = windowFor(form, version, null);
      if (!window.open && window.reason !== 'not_yet_open') throw new HttpsError('failed-precondition', window.message, { reason: window.reason });
      const id = responseId ?? newDocId('r');
      tx.create(responseRef(id), newResponse({ id, uid, form, version, answers: cleaned, now }));
      tx.update(formRef(formId), { ...countsDelta(null, 'draft'), lastActivityAt: now });
      tx.set(historyRef(id, 'created'), { type: 'created', actorUid: uid, actorRole: 'contributor', revision: 0, at: now });
      result = { responseId: id, draftRevision: 1, savedAt: now, issues };
    }
    tx.set(retryRef, { authUid: uid, submissionRequestHash: retry.hash, operation: 'forms.saveDraft', result, createdAt: now, expiresAt: requestExpiry(2) });
    return result;
  });
}

/* -- submit ------------------------------------------------------------------------------------------ */

/** Replace what the client says about each attached file with the server's record of it. */
function canonicalAttachments(definition: FormDefinition, input: Answers, uploads: Map<string, UploadDoc>): Answers {
  const swap = (value: AnswerValue | undefined): AnswerValue | undefined => {
    if (!Array.isArray(value)) return value;
    return value.map((item) => {
      if (!isObject(item) || typeof item.id !== 'string') return item;
      const upload = uploads.get(item.id);
      if (!upload || upload.status !== 'ready') return item;
      return { id: upload.id, name: upload.name, contentType: upload.contentType ?? upload.declaredType, size: upload.size ?? upload.declaredSize };
    }) as AnswerValue;
  };
  const isUpload = (field: FormField) => FIELD_TYPES[field.type].family === 'upload';
  const out: Answers = { ...input };
  for (const { field } of topLevelFields(definition)) {
    if (!Object.prototype.hasOwnProperty.call(input, field.id)) continue;
    if (isUpload(field)) out[field.id] = swap(input[field.id]) as AnswerValue;
    if (field.type === 'group' && Array.isArray(input[field.id])) {
      out[field.id] = (input[field.id] as unknown[]).map((item) => {
        if (!isObject(item)) return item;
        const entry: Record<string, unknown> = { ...item };
        for (const sub of field.fields ?? []) if (isUpload(sub) && sub.id in entry) entry[sub.id] = swap(entry[sub.id] as AnswerValue);
        return entry;
      }) as AnswerValue;
    }
  }
  return out;
}

interface SubmitResult { responseId: string; referenceId: string; status: ResponseStatus; revision: number; successMessage: string; nextSteps: string }

async function submit(uid: string, data: Record<string, unknown>, profile: () => Promise<AudienceProfile>) {
  await consumeRateLimit('formsSubmit', uid, 10, 60_000);
  const responseId = docId(data.responseId, 'Response');
  const answers = answersInput(data.answers);
  const expected = wholeNumber(data.expectedDraftRevision, 'Draft revision');
  const retry = requiredRetry(uid, 'forms.submit', data.requestId, { responseId, answers, expected });
  const audience = await profile();
  const retryRef = db().collection(REQUESTS).doc(retry.id);

  return db().runTransaction(async (tx) => {
    // Every read comes first; a double click or retry with the same request id replays the first result.
    const prior = (await tx.get(retryRef)).data();
    if (checkSubmissionRetry(prior, uid, retry.hash)) return { ...(prior!.result as SubmitResult), replayed: true };
    const responseSnap = await tx.get(responseRef(responseId));
    const response = responseSnap.data() as ResponseDoc | undefined;
    if (!response || response.contributorUid !== uid) notFound();
    if (!EDITABLE.includes(response.status)) throw new HttpsError('failed-precondition', 'This response has already been submitted.', { reason: 'not-editable', status: response.status });
    if (response.draftRevision !== expected) {
      throw new HttpsError('aborted', 'This response was changed somewhere else. Reload it before submitting.', { reason: 'conflict', draftRevision: response.draftRevision });
    }
    const form = await loadForm(response.formId, tx);
    const version = await loadVersion(response.formId, response.formVersion, tx);
    const definition = version.definition;
    const window = windowFor(form, version, response);
    if (!window.open) throw new HttpsError('failed-precondition', window.message, { reason: window.reason });
    const first = response.revision === 0;
    if (first && !audienceMatches(definition.audience, audience)) notEligible();
    if (first && definition.submission.policy === 'once') {
      const others = await tx.get(db().collection(RESPONSES).where('contributorUid', '==', uid).where('formId', '==', response.formId).limit(100));
      if (others.docs.some((doc) => doc.id !== responseId && doc.get('status') !== 'draft')) {
        throw new HttpsError('failed-precondition', 'You have already responded to this form.', { reason: 'once' });
      }
    }
    const uploadSnaps = await tx.get(db().collection(UPLOADS).where('responseId', '==', responseId).limit(500));
    const uploads = new Map(uploadSnaps.docs.map((doc) => [doc.id, doc.data() as UploadDoc]));
    const { answers: cleaned, issues } = validateAnswers(definition, canonicalAttachments(definition, answers, uploads), { mode: 'submit' });
    if (issues.length) throw new HttpsError('failed-precondition', 'Some answers need attention before this can be submitted.', { reason: 'invalid', issues });
    const refs = attachmentsIn(definition, cleaned);
    await verifyAttachments(responseId, uid, refs, tx);

    const now = nowIso();
    const revision = response.revision + 1;
    const referenceId = response.referenceId ?? newReferenceId();
    const { consents, grantedPurposes } = consentFacts(definition, cleaned);
    const facets = languageFacets(definition, cleaned);
    const attachmentIds = [...new Set([...(response.attachmentIds ?? []), ...refs.map((ref) => ref.id)])];
    tx.update(responseRef(responseId), {
      status: 'submitted',
      revision,
      draftRevision: response.draftRevision + 1,
      answers: cleaned,
      workingAnswers: null,
      consents,
      grantedPurposes,
      attachmentIds,
      referenceId,
      languageIds: facets.languageIds,
      dialectIds: facets.dialectIds,
      reviewerGroup: definition.review.reviewerGroup,
      reviewRequired: definition.review.required,
      formTitle: definition.title,
      updatedAt: now,
      submittedAt: now,
      firstSubmittedAt: response.firstSubmittedAt ?? now,
    });
    // Revisions are immutable: create() fails rather than overwrite an earlier submission.
    tx.create(responseRef(responseId).collection(REVISIONS).doc(String(revision)), {
      revision,
      formVersion: response.formVersion,
      schemaHash: version.schemaHash,
      contributorUid: uid,
      answers: cleaned,
      consents,
      grantedPurposes,
      attachmentIds: refs.map((ref) => ref.id),
      submittedAt: now,
    });
    tx.set(historyRef(responseId, `submitted-${revision}`), { type: first ? 'submitted' : 'resubmitted', actorUid: uid, actorRole: 'contributor', revision, at: now });
    tx.update(formRef(response.formId), {
      ...countsDelta(response.status, 'submitted'),
      ...(first ? { totalSubmitted: FieldValue.increment(1) } : {}),
      lastActivityAt: now,
    });
    for (const id of unusedUploads([...uploads.values()], new Set(attachmentIds))) tx.update(db().collection(UPLOADS).doc(id), { status: 'removed' });
    const result: SubmitResult = {
      responseId,
      referenceId,
      status: 'submitted',
      revision,
      successMessage: definition.submission.successMessage,
      nextSteps: definition.submission.nextSteps,
    };
    tx.set(retryRef, { authUid: uid, submissionRequestHash: retry.hash, operation: 'forms.submit', result, createdAt: now, expiresAt: requestExpiry(30) });
    return { ...result, replayed: false };
  });
}

/* -- mine, moveToLatest, discardDraft ------------------------------------------------------------------ */

async function mine(uid: string, data: Record<string, unknown>): Promise<{ responses: MyResponse[]; nextCursor: string | null }> {
  const pageSize = 30;
  let query = db().collection(RESPONSES).where('contributorUid', '==', uid).orderBy('updatedAt', 'desc').limit(pageSize);
  if (data.cursor !== undefined && data.cursor !== null) {
    const cursor = await responseRef(docId(data.cursor, 'Cursor')).get();
    if (cursor.exists && cursor.get('contributorUid') === uid) query = query.startAfter(cursor);
  }
  const snap = await query.get();
  const responses = snap.docs.map((doc) => doc.data() as ResponseDoc);
  const formIds = [...new Set(responses.map((response) => response.formId))];
  const forms = formIds.length ? await db().getAll(...formIds.map((id) => formRef(id))) : [];
  const status = new Map(forms.map((doc) => [doc.id, doc.get('status') as FormStatus | undefined]));
  return {
    responses: responses.map((response) => ({
      id: response.id,
      referenceId: response.referenceId,
      formId: response.formId,
      formTitle: response.formTitle,
      formVersion: response.formVersion,
      status: response.status,
      revision: response.revision,
      updatedAt: response.updatedAt,
      submittedAt: response.submittedAt,
      feedback: response.feedback,
      canEdit: EDITABLE.includes(response.status) && Boolean(status.get(response.formId)) && status.get(response.formId) !== 'archived',
    })),
    nextCursor: snap.size === pageSize ? snap.docs[snap.size - 1].id : null,
  };
}

async function moveToLatest(uid: string, data: Record<string, unknown>, profile: () => Promise<AudienceProfile>) {
  const responseId = docId(data.responseId, 'Response');
  const audience = await profile();
  return db().runTransaction(async (tx) => {
    const response = await loadResponse(responseId, tx);
    if (response.contributorUid !== uid) notFound();
    if (response.status !== 'draft' || response.revision !== 0) {
      throw new HttpsError('failed-precondition', 'Only an unsent draft can move to the latest version.', { reason: 'not-editable' });
    }
    const form = await loadForm(response.formId, tx);
    if (form.status === 'archived' || !form.currentVersion) throw new HttpsError('failed-precondition', 'This form is not accepting responses.', { reason: form.status });
    if (form.currentVersion <= response.formVersion) return { version: response.formVersion, dropped: [] as string[] };
    const [previous, current] = await Promise.all([
      loadVersion(response.formId, response.formVersion, tx),
      loadVersion(response.formId, form.currentVersion, tx),
    ]);
    if (!audienceMatches(current.definition.audience, audience)) notEligible();
    // Answers whose question kept its key and type carry over; permissions never do, so each
    // is given again under the wording that will be recorded. Every lost answer is listed.
    const { answers: cleaned, dropped } = carryAnswers(previous.definition, current.definition, response.workingAnswers ?? {});
    const now = nowIso();
    tx.update(responseRef(responseId), {
      formVersion: current.version,
      formTitle: current.definition.title,
      workingAnswers: cleaned,
      draftRevision: response.draftRevision + 1,
      reviewerGroup: current.definition.review.reviewerGroup,
      reviewRequired: current.definition.review.required,
      updatedAt: now,
    });
    tx.set(historyRef(responseId, `moved-${current.version}`), {
      type: 'version_moved', actorUid: uid, actorRole: 'contributor', revision: 0, at: now,
      note: `Moved from version ${previous.version} to version ${current.version}${dropped.length ? `; ${dropped.length} answer(s) no longer apply` : ''}.`,
    });
    return { version: current.version, dropped };
  });
}

async function discardDraft(uid: string, data: Record<string, unknown>): Promise<{ discarded: true }> {
  const responseId = docId(data.responseId, 'Response');
  await db().runTransaction(async (tx) => {
    const response = await loadResponse(responseId, tx);
    if (response.contributorUid !== uid) notFound();
    if (response.status !== 'draft' || response.revision !== 0) {
      throw new HttpsError('failed-precondition', 'Only a draft that was never submitted can be discarded.', { reason: 'not-editable' });
    }
    tx.delete(responseRef(responseId));
    tx.update(formRef(response.formId), countsDelta('draft', null));
  });
  await db().recursiveDelete(responseRef(responseId));
  await deleteDraftUploads(responseId, uid);
  return { discarded: true };
}

/* -- The callable --------------------------------------------------------------------------------------- */

const WRITE_ACTIONS = new Set(['saveDraft', 'submit', 'beginUpload', 'confirmUpload', 'moveToLatest']);

export const formsContributor = onCall(
  { ...FORMS_CALL_OPTIONS, enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' },
  guarded('formsContributor', async (req) => {
    const uid = requireAuth(req);
    const data = objectData(req.data);
    await requireActiveContributor(uid, { activated: true });
    let cached: Promise<AudienceProfile & { submitBlocked: boolean }> | null = null;
    const profile = () => (cached ??= audienceProfile(uid));
    // Contributors whose profile is inactive or whose submit permission was withdrawn keep
    // read access to their own responses but cannot start, change or send anything.
    if (WRITE_ACTIONS.has(String(data.action)) && (await profile()).submitBlocked) {
      throw new HttpsError('permission-denied', 'Your contributor account cannot submit at the moment. Contact the Indigen World team.', { reason: 'submit-blocked' });
    }

    switch (data.action) {
      case 'list':
        return list(uid, await profile());
      case 'open':
        return open(uid, data, await profile());
      case 'saveDraft':
        return saveDraft(uid, data, profile);
      case 'submit':
        return submit(uid, data, profile);
      case 'mine':
        return mine(uid, data);
      case 'getMine':
        return loadResponseDetail(await ownResponse(uid, data.responseId), { viewer: 'contributor' });
      case 'moveToLatest':
        return moveToLatest(uid, data, profile);
      case 'discardDraft':
        return discardDraft(uid, data);
      case 'attachmentLink': {
        const response = await ownResponse(uid, data.responseId);
        return attachmentLink({ response, attachmentId: String(data.attachmentId ?? ''), actorUid: uid, actorRole: 'contributor' });
      }
      case 'beginUpload': {
        await consumeRateLimit('formsBeginUpload', uid, 30, 10 * 60_000);
        const response = await ownResponse(uid, data.responseId);
        if (!EDITABLE.includes(response.status)) throw new HttpsError('failed-precondition', 'This response has been submitted and can no longer be changed.', { reason: 'not-editable' });
        const [form, version] = await Promise.all([loadForm(response.formId), loadVersion(response.formId, response.formVersion)]);
        if (!VISIBLE.includes(form.status)) throw new HttpsError('failed-precondition', 'This form is not accepting responses.', { reason: form.status });
        if (!mayUse(version.definition, response, await profile())) notEligible();
        const origin = String(req.rawRequest?.headers?.origin ?? '');
        return beginFormUpload({ uid, response, definition: version.definition, data, origin });
      }
      case 'confirmUpload':
        return confirmFormUpload(uid, data);
      case 'removeUpload':
        return removeFormUpload(uid, data);
      default:
        throw new HttpsError('invalid-argument', 'Unknown forms action.');
    }
  }),
);
