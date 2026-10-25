import { getAuth, type UserIdentifier } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference, type DocumentSnapshot, type Query, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  FORM_LIMITS, FORM_STATUS_TRANSITIONS, FORM_TEMPLATES, FORM_LANGUAGES, REVIEW_DECISIONS, RESPONSE_STATUSES,
  emptyDefinition, publishSummary, responsesToCsv, responsesToJson, slugId, validateDefinition, versionCompatibilityIssues,
  type ExportResponse, type ExportVersion, type FormDefinition, type FormStatus, type Issue, type ResponseStatus, type ReviewDecision,
} from '@indigen-world/contracts/forms';
import type { ActivityEntry, Cohort, FormsAccess, ResponseFilter, ResponseSummary, VersionMeta } from '@indigen-world/contracts/forms-api';
import { onStaffCall } from './auth.js';
import { guarded } from './contributor-common.js';
import {
  AUDIT_DOMAIN, COHORTS, FORMS, FORMS_CALL_OPTIONS, RESPONSES, SETTINGS_PATH, VERSIONS,
  attachmentLink, auditRef, canExport, canPublish, displayNames, docId, emptyCounts, formRef, formSummary, formsAudit,
  formsCaller, loadForm, loadResponse, loadResponseDetail, loadSettings, loadVersion, mayReviewSomething, newDocId,
  nowIso, objectData, requireFormsAdmin, responseSummary, sha256, stableJson, versionRef, wholeNumber,
  type FormDoc, type FormsCaller, type FormsSettings, type ResponseDoc, type VersionDoc,
} from './forms-common.js';

/**
 * formsAdmin: the admin console's Indigen Forms callable
 * (docs/architecture/indigen-forms.md). Every action needs an administrator
 * with a verified staff session (onStaffCall + requireFormsAdmin); publishing,
 * exporting, the publisher/exporter lists and points limits each have their
 * own permission on top. Every change writes its audit row in the same
 * transaction or batch as the change itself.
 */

/** Definitions are stored in one document. */
const MAX_DEFINITION_BYTES = 600_000;
/** A draft with problems keeps the administrator's entry beside its validated copy; both share the 1 MiB document. */
const MAX_DRAFT_BYTES = 900_000;
/** Deeper than any definition the builder makes (about ten levels), and inside Firestore's limit of twenty. */
const MAX_INPUT_DEPTH = 16;
const MAX_EXPORT_ROWS = 5000;
const MAX_LIST_SCAN = 1000;
const MAX_COHORT_MEMBERS = 1000;
const MAX_ACCESS_ENTRIES = 50;
const DAILY_CAP_MAX = 1000;

const db = () => getFirestore();
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A draft version also keeps the definition exactly as the administrator
 * entered it whenever validation had to change it (see saveDraft).
 */
type DraftVersionDoc = VersionDoc & { draftInput?: Record<string, unknown> | null };
/** The form head remembers the last discarded draft, so a retried discard is told apart from a stale one. */
type FormHead = FormDoc & { lastDiscarded?: { version: number; revision: number } | null };

interface CohortDoc {
  id: string;
  name: string;
  description: string;
  memberUids: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

function text(value: unknown, label: string, max: number, { required = false } = {}): string {
  if (value === undefined || value === null) {
    if (required) throw new HttpsError('invalid-argument', `${label} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${label} must be text.`);
  const clean = value.trim();
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean)) throw new HttpsError('invalid-argument', `${label} contains control characters.`);
  if (clean.length > max) throw new HttpsError('invalid-argument', `${label} must be ${max} characters or fewer.`);
  if (required && !clean) throw new HttpsError('invalid-argument', `${label} is required.`);
  return clean;
}

function optionalDocId(value: unknown, label: string): string | null {
  return value === undefined || value === null || value === '' ? null : docId(value, label);
}

/** The name shown in activity and conflict messages: the token name, then the profile, never an email. */
async function actorName(req: CallableRequest<unknown>, uid: string): Promise<string> {
  const name = (req.auth?.token as Record<string, unknown> | undefined)?.name;
  if (typeof name === 'string' && name.trim() && !name.includes('@')) return name.trim().slice(0, 120);
  const found = (await displayNames([uid])).get(uid);
  return found && found !== 'Contributor' ? found : 'Administrator';
}

/** The form-head fields that mirror a definition (dashboard, audience, schedule). */
function headFields(definition: FormDefinition) {
  return {
    title: definition.title,
    description: definition.description,
    category: definition.category,
    languageIds: definition.languageContext.languageIds,
    audience: definition.audience,
    reviewerGroup: definition.review.reviewerGroup,
    opensAt: definition.schedule.opensAt,
    closesAt: definition.schedule.closesAt,
  };
}

/** Plain JSON that Firestore can store as it is: bounded depth, no list directly inside a list, ordinary keys. */
function storable(value: unknown, depth: number, inList: boolean): boolean {
  if (depth > MAX_INPUT_DEPTH) return false;
  if (Array.isArray(value)) return !inList && value.every((item) => storable(item, depth + 1, true));
  if (isObject(value)) {
    return Object.entries(value).every(([key, item]) => key.length > 0 && key.length <= 200 && !/^__.*__$/.test(key) && storable(item, depth + 1, false));
  }
  return true;
}

/**
 * A definition as the administrator sent it, made safe to store unchanged:
 * a plain JSON object (a round trip drops anything JSON cannot carry), within
 * the size limit and storable by Firestore. Nothing in it is normalised.
 */
function definitionInput(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new HttpsError('invalid-argument', 'Form definition is malformed.');
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new HttpsError('invalid-argument', 'Form definition is malformed.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_DEFINITION_BYTES) throw new HttpsError('invalid-argument', 'This form is too large to save. Split it into several forms.');
  const plain = JSON.parse(json) as Record<string, unknown>;
  if (!storable(plain, 0, false)) throw new HttpsError('invalid-argument', 'Form definition is malformed.');
  return plain;
}

/**
 * Check a definition for a draft. Validation drops what does not validate (a
 * rule on a later question, a limit out of range, points above the maximum),
 * so when it reports problems the administrator's own entry is kept beside the
 * validated copy: the builder reopens what was entered, and publishing checks
 * that entry and refuses until every problem is fixed.
 */
function draftDefinition(value: unknown): { definition: FormDefinition; draftInput: Record<string, unknown> | null; issues: Issue[] } {
  const input = definitionInput(value);
  const { definition, issues } = validateDefinition(input);
  if (!definition) throw new HttpsError('invalid-argument', 'Form definition is malformed.');
  const draftInput = issues.length && stableJson(input) !== stableJson(definition) ? input : null;
  if (draftInput && Buffer.byteLength(JSON.stringify(definition), 'utf8') + Buffer.byteLength(JSON.stringify(draftInput), 'utf8') > MAX_DRAFT_BYTES) {
    throw new HttpsError('invalid-argument', 'This form is too large to save while it has problems to fix. Fix the problems listed, or split it into several forms.', { reason: 'too-large' });
  }
  return { definition, draftInput, issues };
}

/** What the builder edits: the administrator's entry when one was kept, otherwise the validated definition. */
function editableDefinition(version: DraftVersionDoc): unknown {
  return version.draftInput ?? version.definition;
}

function conflict(form: FormDoc): never {
  throw new HttpsError('aborted', `${form.updatedByName || 'Another administrator'} changed this draft. Reload it, or overwrite it deliberately.`, {
    reason: 'conflict', version: form.draftVersion, revision: form.draftRevision, updatedByName: form.updatedByName, updatedAt: form.updatedAt,
  });
}

/**
 * The draft a builder is looking at, named by its version and revision.
 * Revisions only ever increase for a form and discarded version numbers are
 * never reused, so a builder holding an earlier draft can never match a later one.
 */
function expectDraft(form: FormDoc, data: Record<string, unknown>): void {
  const version = wholeNumber(data.version, 'Version', 1);
  const revision = wholeNumber(data.expectedRevision, 'Revision');
  if (form.draftVersion !== version || form.draftRevision !== revision) conflict(form);
}

/* -- Publish checks --------------------------------------------------------------------------------- */

interface PublishCheck { definition: FormDefinition; issues: Issue[]; cohortNames: Record<string, string> }

/**
 * Everything that must hold before a draft goes live: the contract's publish
 * validation, answer-key compatibility with every earlier published version,
 * Finance's points ceiling, and cohorts that exist. Reads go through the
 * transaction when one is given.
 */
async function publishCheck(form: FormDoc, draft: DraftVersionDoc, settings: FormsSettings, tx?: Transaction): Promise<PublishCheck> {
  // The administrator's entry is checked, not the validated copy, so a rule or setting that
  // validation would drop blocks publishing instead of quietly disappearing from the live version.
  const { definition, issues } = validateDefinition(editableDefinition(draft), { forPublish: true });
  if (!definition) throw new HttpsError('failed-precondition', 'The draft is malformed.', { reason: 'invalid', issues });
  const earlierNumbers = [...new Set([...(form.publishedVersions ?? []), ...(form.retiredVersions ?? [])])].filter((n) => n !== draft.version);
  const read = (refs: DocumentReference[]) => (refs.length ? (tx ? tx.getAll(...refs) : db().getAll(...refs)) : Promise.resolve([] as DocumentSnapshot[]));
  const earlier = (await read(earlierNumbers.map((n) => versionRef(form.id, n))))
    .map((snap) => snap.data() as VersionDoc | undefined).filter((doc): doc is VersionDoc => Boolean(doc));
  issues.push(...versionCompatibilityIssues(earlier.map((doc) => doc.definition), definition));
  if (definition.review.points > settings.rewards.maxPointsPerResponse) {
    issues.push({ path: 'review.points', message: `Finance allows at most ${settings.rewards.maxPointsPerResponse} points per response.` });
  }
  const cohortNames: Record<string, string> = {};
  const cohorts = await read(definition.audience.cohortIds.map((id) => db().collection(COHORTS).doc(id)));
  cohorts.forEach((snap, index) => {
    const id = definition.audience.cohortIds[index];
    if (snap.exists) cohortNames[id] = String(snap.get('name') ?? id);
    else issues.push({ path: 'audience.cohortIds', message: `Cohort ${id} does not exist.` });
  });
  return { definition, issues, cohortNames };
}

/* -- Forms and drafts ----------------------------------------------------------------------------------- */

function newFormDoc(input: { formId: string; definition: FormDefinition; uid: string; name: string; now: string; templateId: string | null }): FormDoc {
  return {
    id: input.formId,
    ...headFields(input.definition),
    status: 'draft',
    currentVersion: null,
    draftVersion: 1,
    draftRevision: 1,
    latestVersion: 1,
    publishedVersions: [],
    retiredVersions: [],
    counts: emptyCounts(),
    totalSubmitted: 0,
    createdAt: input.now,
    createdBy: input.uid,
    updatedAt: input.now,
    updatedBy: input.uid,
    updatedByName: input.name,
    publishedAt: null,
    publishedBy: null,
    lastActivityAt: null,
    templateId: input.templateId,
  };
}

function newVersionDoc(input: {
  version: number; revision: number; definition: FormDefinition; draftInput?: Record<string, unknown> | null; uid: string; name: string; now: string; basedOn: number | null;
}): DraftVersionDoc {
  return {
    version: input.version,
    state: 'draft',
    definition: input.definition,
    draftInput: input.draftInput ?? null,
    revision: input.revision,
    basedOn: input.basedOn,
    createdAt: input.now,
    createdBy: input.uid,
    updatedAt: input.now,
    updatedBy: input.uid,
    updatedByName: input.name,
    publishedAt: null,
    publishedBy: null,
    retiredAt: null,
    retiredBy: null,
    schemaHash: null,
  };
}

async function createForm(caller: FormsCaller, name: string, source: unknown, templateId: string | null, action: 'forms.create' | 'forms.duplicate', summary: string) {
  const { definition, draftInput } = draftDefinition(source);
  const formId = newDocId('f');
  const now = nowIso();
  const batch = db().batch();
  batch.create(formRef(formId), newFormDoc({ formId, definition, uid: caller.uid, name, now, templateId }));
  batch.create(versionRef(formId, 1), newVersionDoc({ version: 1, revision: 1, definition, draftInput, uid: caller.uid, name, now, basedOn: null }));
  const audit = formsAudit({ actor: caller.uid, action, formId, formTitle: definition.title, summary: `${summary}: ${definition.title}`, metadata: { templateId }, at: now });
  batch.set(auditRef(audit), audit);
  await batch.commit();
  return { formId };
}

async function create(caller: FormsCaller, name: string, data: Record<string, unknown>) {
  const templateId = data.templateId === undefined || data.templateId === null || data.templateId === '' ? null : String(data.templateId);
  const title = text(data.title, 'Title', FORM_LIMITS.maxTitle);
  let source: FormDefinition;
  if (templateId) {
    const template = FORM_TEMPLATES.find((item) => item.id === templateId);
    if (!template) throw new HttpsError('invalid-argument', 'Unknown template.');
    source = structuredClone(template.definition);
  } else {
    source = emptyDefinition();
  }
  if (title) source.title = title;
  else if (!templateId) source.title = 'Untitled form';
  return createForm(caller, name, source, templateId, 'forms.create', templateId ? `Created from the ${templateId} template` : 'Created a blank form');
}

async function duplicate(caller: FormsCaller, name: string, data: Record<string, unknown>) {
  const form = await loadForm(docId(data.formId, 'Form'));
  const number = form.draftVersion ?? form.currentVersion;
  if (!number) throw new HttpsError('failed-precondition', 'This form has nothing to copy.');
  // A draft is copied as the administrator entered it, problems included, so nothing is lost in the copy.
  const source = structuredClone(editableDefinition(await loadVersion(form.id, number))) as Record<string, unknown>;
  source.title = `${typeof source.title === 'string' ? source.title : form.title} (copy)`.slice(0, FORM_LIMITS.maxTitle);
  return createForm(caller, name, source, form.templateId, 'forms.duplicate', `Duplicated ${form.title}`);
}

async function startDraft(caller: FormsCaller, name: string, data: Record<string, unknown>) {
  const formId = docId(data.formId, 'Form');
  return db().runTransaction(async (tx) => {
    const form = await loadForm(formId, tx);
    if (form.draftVersion) return { version: form.draftVersion, revision: form.draftRevision };
    if (form.status === 'archived') throw new HttpsError('failed-precondition', 'Restore this form before editing it.');
    if (!form.currentVersion) throw new HttpsError('failed-precondition', 'This form has no published version to start from.');
    const current = await loadVersion(formId, form.currentVersion, tx);
    // Version numbers are never reused and the revision keeps counting from the last draft,
    // so a builder still holding an earlier draft can never match this one.
    const version = (form.latestVersion ?? form.currentVersion) + 1;
    const revision = (form.draftRevision ?? 0) + 1;
    const now = nowIso();
    tx.create(versionRef(formId, version), newVersionDoc({ version, revision, definition: current.definition, uid: caller.uid, name, now, basedOn: current.version }));
    tx.update(formRef(formId), { draftVersion: version, draftRevision: revision, latestVersion: version, updatedAt: now, updatedBy: caller.uid, updatedByName: name });
    const audit = formsAudit({ actor: caller.uid, action: 'forms.start_draft', formId, formTitle: form.title, summary: `Started version ${version} of ${form.title}`, metadata: { version, basedOn: current.version }, at: now });
    tx.set(auditRef(audit), audit);
    return { version, revision };
  });
}

async function saveDraft(caller: FormsCaller, name: string, data: Record<string, unknown>) {
  const formId = docId(data.formId, 'Form');
  const { definition, draftInput, issues } = draftDefinition(data.definition);
  return db().runTransaction(async (tx) => {
    const form = await loadForm(formId, tx);
    if (!form.draftVersion) throw new HttpsError('failed-precondition', 'There is no draft to save. Start a new draft first.', { reason: 'no-draft' });
    if (form.status === 'archived') throw new HttpsError('failed-precondition', 'Restore this form before editing it.');
    expectDraft(form, data);
    const version = await loadVersion(formId, form.draftVersion, tx);
    // Published versions are immutable: only a draft version's definition is ever written.
    if (version.state !== 'draft') throw new HttpsError('failed-precondition', 'This version is already published.');
    const now = nowIso();
    const revision = form.draftRevision + 1;
    tx.update(versionRef(formId, form.draftVersion), { definition, draftInput, revision, updatedAt: now, updatedBy: caller.uid, updatedByName: name });
    tx.update(formRef(formId), {
      draftRevision: revision, updatedAt: now, updatedBy: caller.uid, updatedByName: name,
      // Before the first publish the dashboard shows the draft's title and settings.
      ...(form.currentVersion ? {} : headFields(definition)),
    });
    const audit = formsAudit({
      actor: caller.uid, action: 'forms.save_draft', formId, formTitle: definition.title,
      summary: `Saved version ${form.draftVersion} draft of ${definition.title}`, metadata: { version: form.draftVersion, revision, issues: issues.length }, at: now,
    });
    tx.set(auditRef(audit), audit);
    return { revision, issues, updatedAt: now };
  });
}

async function discardDraft(caller: FormsCaller, data: Record<string, unknown>) {
  const formId = docId(data.formId, 'Form');
  const expectedVersion = wholeNumber(data.version, 'Version', 1);
  const expectedRevision = wholeNumber(data.expectedRevision, 'Revision');
  return db().runTransaction(async (tx) => {
    const form = await loadForm(formId, tx) as FormHead;
    if (form.draftVersion !== expectedVersion) {
      // Only a retry of the discard that removed this very draft is reported as done.
      if (form.lastDiscarded?.version === expectedVersion && form.lastDiscarded.revision === expectedRevision) return { discarded: true as const };
      throw new HttpsError('failed-precondition', `Draft version ${expectedVersion} is no longer open: it was published or discarded. Reload the form.`, { reason: 'no-draft' });
    }
    expectDraft(form, data);
    if (!form.currentVersion) throw new HttpsError('failed-precondition', 'This form has never been published. Archive it instead of discarding its only version.');
    const version = await loadVersion(formId, form.draftVersion, tx);
    if (version.state !== 'draft') throw new HttpsError('failed-precondition', 'This version is already published.');
    const now = nowIso();
    // latestVersion stays as it is: a discarded number is never given to another draft.
    tx.delete(versionRef(formId, form.draftVersion));
    tx.update(formRef(formId), { draftVersion: null, lastDiscarded: { version: form.draftVersion, revision: form.draftRevision }, updatedAt: now, updatedBy: caller.uid });
    const audit = formsAudit({ actor: caller.uid, action: 'forms.discard_draft', formId, formTitle: form.title, summary: `Discarded the version ${form.draftVersion} draft of ${form.title}`, metadata: { version: form.draftVersion }, at: now });
    tx.set(auditRef(audit), audit);
    return { discarded: true as const };
  });
}

async function publishPreview(data: Record<string, unknown>) {
  const formId = docId(data.formId, 'Form');
  const form = await loadForm(formId);
  if (!form.draftVersion) throw new HttpsError('failed-precondition', 'There is no draft to publish.', { reason: 'no-draft' });
  const [draft, settings] = await Promise.all([loadVersion(formId, form.draftVersion), loadSettings()]);
  const check = await publishCheck(form, draft, settings);
  return { summary: publishSummary(check.definition, { cohortNames: check.cohortNames }), issues: check.issues, version: draft.version, revision: form.draftRevision };
}

async function publish(caller: FormsCaller, name: string, data: Record<string, unknown>) {
  const formId = docId(data.formId, 'Form');
  wholeNumber(data.version, 'Version', 1);
  wholeNumber(data.expectedRevision, 'Revision');
  return db().runTransaction(async (tx) => {
    const form = await loadForm(formId, tx);
    const settings = await loadSettings(db(), tx);
    if (!canPublish(caller, settings)) throw new HttpsError('permission-denied', 'Only the administrators named in the forms settings may publish.');
    if (form.status === 'archived') throw new HttpsError('failed-precondition', 'Restore this form before publishing it.');
    if (!form.draftVersion) throw new HttpsError('failed-precondition', 'There is no draft to publish.', { reason: 'no-draft' });
    // Exactly the draft the administrator reviewed goes live, never a later save by someone else.
    expectDraft(form, data);
    const draft = await loadVersion(formId, form.draftVersion, tx);
    if (draft.state !== 'draft') throw new HttpsError('failed-precondition', 'This version is already published.');
    const { definition, issues } = await publishCheck(form, draft, settings, tx);
    if (issues.length) throw new HttpsError('failed-precondition', 'Fix the listed problems before publishing.', { reason: 'invalid', issues });
    const now = nowIso();
    const schemaHash = sha256(stableJson(definition));
    // A new version replaces what contributors meet; it never reopens a paused or closed form.
    const status: FormStatus = form.status === 'paused' || form.status === 'closed' ? form.status : 'published';
    tx.update(versionRef(formId, draft.version), {
      state: 'published', definition, draftInput: FieldValue.delete(), schemaHash, publishedAt: now, publishedBy: caller.uid, updatedAt: now, updatedBy: caller.uid, updatedByName: name,
    });
    tx.update(formRef(formId), {
      ...headFields(definition),
      status,
      currentVersion: draft.version,
      draftVersion: null,
      publishedVersions: FieldValue.arrayUnion(draft.version),
      publishedAt: now,
      publishedBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
      updatedByName: name,
    });
    const audit = formsAudit({
      actor: caller.uid, action: 'forms.publish', formId, formTitle: definition.title,
      summary: `Published version ${draft.version} of ${definition.title}${status === 'published' ? '' : ` (the form stays ${status})`}`,
      before: { status: form.status, currentVersion: form.currentVersion }, after: { status, currentVersion: draft.version },
      metadata: { version: draft.version, schemaHash }, at: now,
    });
    tx.set(auditRef(audit), audit);
    return { version: draft.version, status };
  });
}

async function setStatus(caller: FormsCaller, name: string, data: Record<string, unknown>) {
  const formId = docId(data.formId, 'Form');
  const status = data.status as FormStatus;
  if (!Object.prototype.hasOwnProperty.call(FORM_STATUS_TRANSITIONS, status)) throw new HttpsError('invalid-argument', 'Unknown form status.');
  const reason = text(data.reason, 'Reason', 500);
  return db().runTransaction(async (tx) => {
    const form = await loadForm(formId, tx);
    if (form.status === status) return { status };
    if (!FORM_STATUS_TRANSITIONS[form.status].includes(status)) {
      throw new HttpsError('failed-precondition', `A ${form.status} form cannot be moved to ${status}.`);
    }
    // Restoring an archived form brings it back closed if it was ever published, otherwise as a draft.
    if (form.status === 'archived' && status !== (form.currentVersion ? 'closed' : 'draft')) {
      throw new HttpsError('failed-precondition', `This form is restored as ${form.currentVersion ? 'closed' : 'a draft'}.`);
    }
    if (status === 'published') {
      const settings = await loadSettings(db(), tx);
      if (!canPublish(caller, settings)) throw new HttpsError('permission-denied', 'Only the administrators named in the forms settings may publish.');
      if (!form.currentVersion) throw new HttpsError('failed-precondition', 'Publish a version first.');
    }
    const now = nowIso();
    tx.update(formRef(formId), { status, updatedAt: now, updatedBy: caller.uid, updatedByName: name });
    const audit = formsAudit({
      actor: caller.uid, action: 'forms.status', formId, formTitle: form.title,
      summary: `${form.title}: ${form.status} → ${status}${reason ? ` (${reason})` : ''}`,
      before: { status: form.status }, after: { status }, metadata: { reason: reason || null }, at: now,
    });
    tx.set(auditRef(audit), audit);
    return { status };
  });
}

async function retireVersion(caller: FormsCaller, data: Record<string, unknown>) {
  const formId = docId(data.formId, 'Form');
  const number = wholeNumber(data.version, 'Version', 1);
  return db().runTransaction(async (tx) => {
    const form = await loadForm(formId, tx);
    const version = await loadVersion(formId, number, tx);
    if (version.state !== 'published' || !(form.publishedVersions ?? []).includes(number)) throw new HttpsError('failed-precondition', 'Only a published version can be retired.');
    if (form.currentVersion === number) throw new HttpsError('failed-precondition', 'The current version cannot be retired. Publish a newer version first.');
    const now = nowIso();
    tx.update(versionRef(formId, number), { state: 'retired', retiredAt: now, retiredBy: caller.uid });
    tx.update(formRef(formId), { publishedVersions: FieldValue.arrayRemove(number), retiredVersions: FieldValue.arrayUnion(number), updatedAt: now, updatedBy: caller.uid });
    const audit = formsAudit({ actor: caller.uid, action: 'forms.retire_version', formId, formTitle: form.title, summary: `Retired version ${number} of ${form.title}`, metadata: { version: number }, at: now });
    tx.set(auditRef(audit), audit);
    return { version: number, state: 'retired' as const };
  });
}

/* -- Reading forms ---------------------------------------------------------------------------------------- */

async function cohortList(): Promise<Cohort[]> {
  const snap = await db().collection(COHORTS).limit(500).get();
  return snap.docs.map((doc) => {
    const cohort = doc.data() as CohortDoc;
    return { id: doc.id, name: cohort.name, description: cohort.description ?? '', memberCount: cohort.memberUids?.length ?? 0, updatedAt: cohort.updatedAt };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function getForm(data: Record<string, unknown>) {
  const formId = docId(data.formId, 'Form');
  const form = await loadForm(formId);
  const [versionsSnap, cohorts, settings] = await Promise.all([formRef(formId).collection(VERSIONS).get(), cohortList(), loadSettings()]);
  const versionDocs = versionsSnap.docs.map((doc) => doc.data() as DraftVersionDoc).sort((a, b) => a.version - b.version);
  const responseCounts = await Promise.all(versionDocs.map((version) => db().collection(RESPONSES)
    .where('formId', '==', formId).where('formVersion', '==', version.version).count().get()));
  const versions: VersionMeta[] = versionDocs.map((version, index) => ({
    version: version.version,
    state: version.state,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    publishedAt: version.publishedAt,
    publishedBy: version.publishedBy,
    retiredAt: version.retiredAt,
    responses: responseCounts[index].data().count,
  }));
  const draftDoc = form.draftVersion ? versionDocs.find((version) => version.version === form.draftVersion) : undefined;
  const currentDoc = form.currentVersion ? versionDocs.find((version) => version.version === form.currentVersion) : undefined;
  return {
    form: formSummary(form, Object.fromEntries(cohorts.map((cohort) => [cohort.id, cohort.name]))),
    versions,
    draft: draftDoc ? {
      version: draftDoc.version,
      revision: form.draftRevision,
      definition: editableDefinition(draftDoc) as FormDefinition,
      issues: (await publishCheck(form, draftDoc, settings)).issues,
      updatedAt: draftDoc.updatedAt,
      updatedByName: draftDoc.updatedByName,
    } : null,
    current: currentDoc ? { version: currentDoc.version, definition: currentDoc.definition, publishedAt: currentDoc.publishedAt ?? currentDoc.updatedAt } : null,
  };
}

/* -- Responses ------------------------------------------------------------------------------------------------ */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ParsedFilter {
  formId: string | null;
  version: number | null;
  status: ResponseStatus | null;
  languageId: string | null;
  contributorId: string | null;
  from: string | null;
  to: string | null;
}

function parseFilter(raw: unknown, { allowStatus = true } = {}): ParsedFilter {
  const filter = (raw === undefined || raw === null ? {} : objectData(raw)) as ResponseFilter;
  const date = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !DATE.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) throw new HttpsError('invalid-argument', `${label} must be a date (YYYY-MM-DD).`);
    return value;
  };
  let status: ResponseStatus | null = null;
  if (allowStatus && filter.status !== undefined && filter.status !== null && filter.status !== 'all_submitted') {
    if (!(RESPONSE_STATUSES as readonly string[]).includes(filter.status)) throw new HttpsError('invalid-argument', 'Unknown response status.');
    if (filter.status === 'draft') throw new HttpsError('invalid-argument', 'Drafts are contributors’ unsent work and are not listed.');
    status = filter.status;
  }
  const languageId = filter.languageId === undefined || filter.languageId === null || filter.languageId === '' ? null : String(filter.languageId);
  if (languageId && !FORM_LANGUAGES.some((item) => item.id === languageId)) throw new HttpsError('invalid-argument', 'Unknown language.');
  const contributorId = filter.contributorId === undefined || filter.contributorId === null || filter.contributorId === '' ? null : text(filter.contributorId, 'Contributor', 128);
  return {
    formId: optionalDocId(filter.formId, 'Form'),
    version: filter.version === undefined || filter.version === null ? null : wholeNumber(filter.version, 'Version', 1),
    status,
    languageId,
    contributorId,
    from: date(filter.from, 'From'),
    to: date(filter.to, 'To'),
  };
}

/**
 * Submitted responses newest first. `submittedAt` is null exactly while a
 * response has never been submitted, so the range on it also keeps drafts out.
 * Equality on form and status uses composite indexes; the remaining filters
 * are applied while scanning.
 */
function responsesQuery(filter: ParsedFilter): Query {
  let query: Query = db().collection(RESPONSES);
  if (filter.formId) query = query.where('formId', '==', filter.formId);
  if (filter.status) query = query.where('status', '==', filter.status);
  query = query.where('submittedAt', '>=', filter.from ? `${filter.from}T00:00:00.000Z` : '0');
  if (filter.to) query = query.where('submittedAt', '<=', `${filter.to}T23:59:59.999Z`);
  return query.orderBy('submittedAt', 'desc');
}

function matchesFilter(response: ResponseDoc, filter: ParsedFilter): boolean {
  if (response.status === 'draft' || !response.submittedAt) return false;
  if (filter.version !== null && response.formVersion !== filter.version) return false;
  if (filter.languageId && !(response.languageIds ?? []).includes(filter.languageId)) return false;
  if (filter.contributorId && response.contributorUid !== filter.contributorId) return false;
  return true;
}

async function listResponses(data: Record<string, unknown>) {
  const filter = parseFilter(data.filter);
  const limit = data.limit === undefined || data.limit === null ? 50 : wholeNumber(data.limit, 'Limit', 1, 100);
  const query = responsesQuery(filter);
  let last: DocumentSnapshot | null = null;
  if (data.cursor !== undefined && data.cursor !== null && data.cursor !== '') {
    const cursor = await db().collection(RESPONSES).doc(docId(data.cursor, 'Cursor')).get();
    if (cursor.exists) last = cursor;
  }
  const rows: ResponseDoc[] = [];
  let scanned = 0;
  let more = true;
  const pageSize = 200;
  while (rows.length < limit && scanned < MAX_LIST_SCAN) {
    const snap = await (last ? query.startAfter(last) : query).limit(pageSize).get();
    let stoppedEarly = false;
    for (const doc of snap.docs) {
      scanned += 1;
      last = doc;
      const response = doc.data() as ResponseDoc;
      if (matchesFilter(response, filter)) rows.push(response);
      if (rows.length >= limit || scanned >= MAX_LIST_SCAN) { stoppedEarly = doc !== snap.docs[snap.docs.length - 1]; break; }
    }
    if (snap.size < pageSize && !stoppedEarly) { more = false; break; }
  }
  const names = await displayNames(rows.map((row) => row.contributorUid));
  const summaries: ResponseSummary[] = rows.map((row) => responseSummary(row, names));
  return { rows: summaries, nextCursor: more && last ? last.id : null, scanned };
}

function allowedDecisions(caller: FormsCaller, response: ResponseDoc): ReviewDecision[] {
  if (!response.reviewRequired || response.contributorUid === caller.uid) return [];
  return (Object.keys(REVIEW_DECISIONS) as ReviewDecision[]).filter((decision) => REVIEW_DECISIONS[decision].from.includes(response.status));
}

async function staffResponse(responseId: unknown): Promise<ResponseDoc> {
  const response = await loadResponse(docId(responseId, 'Response'));
  // Drafts are the contributor's unsent work.
  if (response.status === 'draft') throw new HttpsError('not-found', 'This response does not exist.');
  return response;
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'form';
}

async function exportResponses(caller: FormsCaller, data: Record<string, unknown>) {
  const settings = await loadSettings();
  if (!canExport(caller, settings)) throw new HttpsError('permission-denied', 'Only the administrators named in the forms settings may export responses.');
  const formId = docId(data.formId, 'Form');
  const format = data.format === 'json' ? 'json' : data.format === 'csv' ? 'csv' : null;
  if (!format) throw new HttpsError('invalid-argument', 'Choose CSV or JSON.');
  const scope = data.scope === 'approved' ? 'approved' : data.scope === 'submitted' ? 'submitted' : null;
  if (!scope) throw new HttpsError('invalid-argument', 'Choose submitted or approved responses.');
  const filter = { ...parseFilter(data.filter, { allowStatus: false }), formId, status: scope === 'approved' ? 'approved' as const : null };
  const form = await loadForm(formId);

  const query = responsesQuery(filter);
  const rows: ResponseDoc[] = [];
  let last: QueryDocumentSnapshot | null = null;
  for (;;) {
    const snap = await (last ? query.startAfter(last) : query).limit(500).get();
    for (const doc of snap.docs) {
      const response = doc.data() as ResponseDoc;
      if (matchesFilter(response, filter)) rows.push(response);
    }
    if (rows.length > MAX_EXPORT_ROWS) throw new HttpsError('failed-precondition', `More than ${MAX_EXPORT_ROWS} responses match. Narrow the export by version, date or language.`);
    if (snap.size < 500) break;
    last = snap.docs[snap.docs.length - 1];
  }
  const numbers = [...new Set(rows.map((row) => row.formVersion))].sort((a, b) => a - b);
  const versionSnaps = numbers.length ? await db().getAll(...numbers.map((n) => versionRef(formId, n))) : [];
  const versions: ExportVersion[] = versionSnaps.map((snap) => snap.data() as VersionDoc | undefined)
    .filter((doc): doc is VersionDoc => Boolean(doc)).map((doc) => ({ version: doc.version, definition: doc.definition }));
  // Exports carry each response's submitted answers, never the contributor's unsent edits.
  const responses: ExportResponse[] = rows.map((row) => ({
    id: row.id,
    referenceId: row.referenceId ?? '',
    formId: row.formId,
    formVersion: row.formVersion,
    revision: row.revision,
    status: row.status,
    contributorId: row.contributorUid,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    answers: row.answers ?? {},
    consents: row.consents ?? [],
  }));
  const now = nowIso();
  const filters = { version: filter.version, languageId: filter.languageId, contributorId: filter.contributorId, from: filter.from, to: filter.to };
  const content = format === 'csv'
    ? responsesToCsv(versions, responses)
    : responsesToJson({ id: form.id, title: form.title }, versions, responses, { exportedAt: now, scope, filters, count: responses.length });
  const audit = formsAudit({
    actor: caller.uid, action: 'forms.export', formId, formTitle: form.title,
    summary: `Exported ${responses.length} ${scope} response${responses.length === 1 ? '' : 's'} of ${form.title} as ${format.toUpperCase()}`,
    metadata: { format, scope, filters, count: responses.length, versions: numbers }, at: now,
  });
  await auditRef(audit).set(audit);
  return {
    filename: `indigen-forms-${slug(form.title)}-${scope}-${now.slice(0, 10)}.${format}`,
    contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    content,
    count: responses.length,
  };
}

async function activity(data: Record<string, unknown>): Promise<{ entries: ActivityEntry[] }> {
  const limit = data.limit === undefined || data.limit === null ? 50 : wholeNumber(data.limit, 'Limit', 1, 200);
  const formId = optionalDocId(data.formId, 'Form');
  const snap = await db().collection('auditLogs').where('domain', '==', AUDIT_DOMAIN).orderBy('occurredAt', 'desc').limit(formId ? Math.min(limit * 5, 500) : limit).get();
  const rows = snap.docs.map((doc) => ({ id: doc.id, raw: doc.data() }))
    .filter(({ raw }) => !formId || raw.metadata?.formId === formId)
    .slice(0, limit);
  const names = await displayNames(rows.map(({ raw }) => String(raw.actor?.id ?? '')));
  return {
    entries: rows.map(({ id, raw }) => ({
      id,
      action: String(raw.action ?? ''),
      actorName: names.get(String(raw.actor?.id ?? '')) ?? 'Unknown',
      formId: typeof raw.metadata?.formId === 'string' ? raw.metadata.formId : null,
      formTitle: typeof raw.metadata?.formTitle === 'string' ? raw.metadata.formTitle : null,
      summary: String(raw.summary ?? ''),
      occurredAt: String(raw.occurredAt ?? ''),
    })),
  };
}

/* -- Cohorts and access ------------------------------------------------------------------------------------------ */

/** Emails or uids to accounts. Anything Auth does not know is returned as unknown, never guessed. */
async function resolveAccounts(entries: string[]): Promise<{ uids: string[]; unknown: string[] }> {
  const identifiers: UserIdentifier[] = entries.map((entry) => (entry.includes('@') ? { email: entry } : { uid: entry }));
  const uids: string[] = [];
  const unknown: string[] = [];
  for (let i = 0; i < identifiers.length; i += 100) {
    const chunk = identifiers.slice(i, i + 100);
    const result = await getAuth().getUsers(chunk);
    const byUid = new Map(result.users.map((user) => [user.uid, user.uid]));
    const byEmail = new Map(result.users.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user.uid]));
    chunk.forEach((identifier, index) => {
      const found = 'email' in identifier ? byEmail.get(identifier.email.toLowerCase()) : byUid.get((identifier as { uid: string }).uid);
      if (found) uids.push(found);
      else unknown.push(entries[i + index]);
    });
  }
  return { uids: [...new Set(uids)], unknown };
}

function entryList(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value)) throw new HttpsError('invalid-argument', `${label} must be a list.`);
  const entries = [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
  if (entries.length > max) throw new HttpsError('invalid-argument', `${label} may hold at most ${max} entries.`);
  if (entries.some((entry) => entry.length > 320 || /[\s\u0000-\u001f]/.test(entry))) throw new HttpsError('invalid-argument', `${label} contains a malformed entry.`);
  return entries;
}

async function cohortWithMembers(cohort: CohortDoc): Promise<Cohort> {
  const members: NonNullable<Cohort['members']> = [];
  const names = await displayNames(cohort.memberUids ?? []);
  for (let i = 0; i < (cohort.memberUids ?? []).length; i += 100) {
    const chunk = cohort.memberUids.slice(i, i + 100);
    const result = await getAuth().getUsers(chunk.map((uid) => ({ uid })));
    const emails = new Map(result.users.map((user) => [user.uid, user.email ?? null]));
    for (const uid of chunk) members.push({ uid, name: names.get(uid) ?? 'Contributor', email: emails.get(uid) ?? null });
  }
  return { id: cohort.id, name: cohort.name, description: cohort.description, memberCount: cohort.memberUids.length, members, updatedAt: cohort.updatedAt };
}

async function saveCohort(caller: FormsCaller, data: Record<string, unknown>) {
  const name = text(data.name, 'Name', 120, { required: true });
  const description = text(data.description, 'Description', 500);
  const members = entryList(data.members ?? [], 'Members', MAX_COHORT_MEMBERS);
  const requestedId = optionalDocId(data.cohortId, 'Cohort');
  const expectedUpdatedAt = text(data.expectedUpdatedAt, 'Cohort version', 40);
  // The member list is replaced as a whole, so an edit must start from the list as it is stored now.
  if (requestedId && !expectedUpdatedAt) throw new HttpsError('invalid-argument', 'Load the cohort’s current members before saving it.');
  const { uids, unknown } = await resolveAccounts(members);
  const now = nowIso();
  const saved = await db().runTransaction(async (tx) => {
    let id = requestedId;
    let before: CohortDoc | null = null;
    if (id) {
      const snap = await tx.get(db().collection(COHORTS).doc(id));
      if (!snap.exists) throw new HttpsError('not-found', 'This cohort does not exist.');
      before = snap.data() as CohortDoc;
      if (before.updatedAt !== expectedUpdatedAt) {
        throw new HttpsError('aborted', 'Another administrator changed this cohort since you opened it. Reload its members, or save yours over them deliberately.', {
          reason: 'conflict', updatedAt: before.updatedAt,
        });
      }
    } else {
      // Cohort ids appear in form audiences, so they follow the contract's id pattern.
      const taken = (await tx.get(db().collection(COHORTS).select().limit(1000))).docs.map((doc) => doc.id);
      id = slugId(name, 'cohort', taken);
    }
    const cohort: CohortDoc = {
      id,
      name,
      description,
      memberUids: uids,
      createdAt: before?.createdAt ?? now,
      createdBy: before?.createdBy ?? caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(db().collection(COHORTS).doc(id), cohort);
    const audit = formsAudit({
      actor: caller.uid, action: 'forms.cohort', summary: `${before ? 'Updated' : 'Created'} cohort ${name} (${uids.length} member${uids.length === 1 ? '' : 's'})`,
      before: before ? { name: before.name, memberCount: before.memberUids.length } : null, after: { name, memberCount: uids.length },
      metadata: { cohortId: id, unknown: unknown.length }, at: now,
    });
    tx.set(auditRef(audit), audit);
    return cohort;
  });
  return { cohort: await cohortWithMembers(saved), unknown };
}

async function accessView(caller: FormsCaller, settings?: FormsSettings): Promise<FormsAccess> {
  const current = settings ?? await loadSettings();
  const names = await displayNames([...current.publishers, ...current.exporters]);
  return {
    canManage: caller.isAdmin,
    canPublish: canPublish(caller, current),
    canExport: canExport(caller, current),
    canReview: mayReviewSomething(caller),
    canConfigureAccess: caller.isOwner,
    publishers: current.publishers.map((uid) => ({ uid, name: names.get(uid) ?? 'Administrator' })),
    exporters: current.exporters.map((uid) => ({ uid, name: names.get(uid) ?? 'Administrator' })),
    rewards: current.rewards,
    canEditRewards: caller.finance || caller.isOwner,
  };
}

async function saveAccess(caller: FormsCaller, data: Record<string, unknown>) {
  if (!caller.isOwner) throw new HttpsError('permission-denied', 'Only the owner super administrator can change who publishes and exports forms.');
  const publishers = await resolveAccounts(entryList(data.publishers, 'Publishers', MAX_ACCESS_ENTRIES));
  const exporters = await resolveAccounts(entryList(data.exporters, 'Exporters', MAX_ACCESS_ENTRIES));
  const unknown = [...publishers.unknown, ...exporters.unknown];
  if (unknown.length) throw new HttpsError('invalid-argument', `These accounts were not found: ${unknown.join(', ')}.`, { reason: 'unknown', unknown });
  const settings = await db().runTransaction(async (tx) => {
    const before = await loadSettings(db(), tx);
    const now = nowIso();
    tx.set(db().doc(SETTINGS_PATH), { publishers: publishers.uids, exporters: exporters.uids, updatedAt: now, updatedBy: caller.uid }, { merge: true });
    const audit = formsAudit({
      actor: caller.uid, action: 'forms.access', summary: `Forms access: ${publishers.uids.length || 'all'} publisher(s), ${exporters.uids.length || 'all'} exporter(s)`,
      before: { publishers: before.publishers, exporters: before.exporters }, after: { publishers: publishers.uids, exporters: exporters.uids }, at: now,
    });
    tx.set(auditRef(audit), audit);
    return { ...before, publishers: publishers.uids, exporters: exporters.uids };
  });
  return accessView(caller, settings);
}

async function saveRewardSettings(caller: FormsCaller, data: Record<string, unknown>) {
  if (!caller.finance) throw new HttpsError('permission-denied', 'Finance access is required to change points limits for forms.');
  if (typeof data.enabled !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether forms may award points.');
  const rewards = {
    enabled: data.enabled,
    maxPointsPerResponse: wholeNumber(data.maxPointsPerResponse, 'Points per response', 0, FORM_LIMITS.maxPoints),
    dailyCap: wholeNumber(data.dailyCap, 'Daily cap', 0, DAILY_CAP_MAX),
  };
  const settings = await db().runTransaction(async (tx) => {
    const before = await loadSettings(db(), tx);
    const now = nowIso();
    tx.set(db().doc(SETTINGS_PATH), { rewards, updatedAt: now, updatedBy: caller.uid }, { merge: true });
    const audit = formsAudit({
      actor: caller.uid, action: 'forms.reward_settings',
      summary: `Forms points ${rewards.enabled ? 'on' : 'off'}: up to ${rewards.maxPointsPerResponse} per response, ${rewards.dailyCap} per contributor per day`,
      before: before.rewards, after: rewards, at: now,
    });
    tx.set(auditRef(audit), audit);
    return { ...before, rewards };
  });
  return accessView(caller, settings);
}

/* -- The callable ---------------------------------------------------------------------------------------------------- */

export const formsAdmin = onStaffCall({ ...FORMS_CALL_OPTIONS }, guarded('formsAdmin', async (req) => {
  const caller = formsCaller(req);
  requireFormsAdmin(caller);
  const data = objectData(req.data);
  const name = () => actorName(req, caller.uid);

  switch (data.action) {
    case 'overview': {
      const [formsSnap, cohorts, access, recent] = await Promise.all([
        db().collection(FORMS).orderBy('updatedAt', 'desc').limit(300).get(),
        cohortList(),
        accessView(caller),
        activity({ limit: 20 }),
      ]);
      const cohortNames = Object.fromEntries(cohorts.map((cohort) => [cohort.id, cohort.name]));
      return { forms: formsSnap.docs.map((doc) => formSummary(doc.data() as FormDoc, cohortNames)), access, cohorts, recent: recent.entries };
    }
    case 'get':
      return getForm(data);
    case 'getVersion': {
      const version = await loadVersion(docId(data.formId, 'Form'), wholeNumber(data.version, 'Version', 1));
      return { version: version.version, state: version.state, definition: version.definition, publishedAt: version.publishedAt };
    }
    case 'create':
      return create(caller, await name(), data);
    case 'duplicate':
      return duplicate(caller, await name(), data);
    case 'startDraft':
      return startDraft(caller, await name(), data);
    case 'saveDraft':
      return saveDraft(caller, await name(), data);
    case 'discardDraft':
      return discardDraft(caller, data);
    case 'publishPreview':
      return publishPreview(data);
    case 'publish':
      return publish(caller, await name(), data);
    case 'setStatus':
      return setStatus(caller, await name(), data);
    case 'retireVersion':
      return retireVersion(caller, data);
    case 'listResponses':
      return listResponses(data);
    case 'getResponse': {
      const response = await staffResponse(data.responseId);
      return loadResponseDetail(response, { viewer: 'staff', allowedDecisions: allowedDecisions(caller, response) });
    }
    case 'export':
      return exportResponses(caller, data);
    case 'attachmentLink': {
      const response = await staffResponse(data.responseId);
      return attachmentLink({ response, attachmentId: String(data.attachmentId ?? ''), actorUid: caller.uid, actorRole: 'admin' });
    }
    case 'activity':
      return activity(data);
    case 'listCohorts':
      return { cohorts: await cohortList() };
    case 'getCohort': {
      const snap = await db().collection(COHORTS).doc(docId(data.cohortId, 'Cohort')).get();
      if (!snap.exists) throw new HttpsError('not-found', 'This cohort does not exist.');
      return { cohort: await cohortWithMembers(snap.data() as CohortDoc) };
    }
    case 'saveCohort':
      return saveCohort(caller, data);
    case 'access':
      return accessView(caller);
    case 'saveAccess':
      return saveAccess(caller, data);
    case 'saveRewardSettings':
      return saveRewardSettings(caller, data);
    default:
      throw new HttpsError('invalid-argument', 'Unknown forms action.');
  }
}));
