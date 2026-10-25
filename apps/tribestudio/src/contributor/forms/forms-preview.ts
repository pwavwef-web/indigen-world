/**
 * Development-only Indigen Forms fixture for /contributor/preview/forms; never
 * selected by a production build (forms-data.ts imports it behind
 * import.meta.env.DEV). Three sample forms are built from the contract's own
 * templates and answered with synthetic, clearly marked text: no Kasem is
 * invented. Nothing leaves the tab and everything resets on reload.
 *
 * It follows the formsContributor contract closely enough to exercise the real
 * screens: request ids replay, draft revisions conflict, submissions are
 * validated with the shared validateAnswers, and reference ids are
 * deterministic (IWF-PREV-0001, -0002, …).
 */
import { FORM_TEMPLATES, FIELD_TYPES, attachmentsIn, carryAnswers, consentRecords, grantedPurposes, matchUploadFormat, submissionWindow, topLevelFields, uploadField, validateAnswers } from '@indigen-world/contracts/forms';
import type { Answers, AttachmentRef, ConsentRecord, FormDefinition, FormStatus, Issue, ResponseStatus, VersionState } from '@indigen-world/contracts/forms';
import type { AvailableForm, FormsContributorRequest, HistoryEvent, MyResponse, OpenedForm, ResponseDetail, RevisionSnapshot } from '@indigen-world/contracts/forms-api';

interface PreviewForm {
  id: string;
  status: FormStatus;
  currentVersion: number;
  versions: Map<number, { state: VersionState; definition: FormDefinition }>;
}

interface PreviewUpload extends AttachmentRef { responseId: string; fieldId: string; ready: boolean }

interface PreviewResponse {
  id: string;
  formId: string;
  formVersion: number;
  status: ResponseStatus;
  revision: number;
  draftRevision: number;
  answers: Answers;
  workingAnswers: Answers | null;
  consents: ConsentRecord[];
  referenceId: string | null;
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  revisions: RevisionSnapshot[];
  history: HistoryEvent[];
  reward: ResponseDetail['reward'];
}

const EDITABLE: ResponseStatus[] = ['draft', 'changes_requested'];
const VISIBLE: FormStatus[] = ['published', 'paused', 'closed'];
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function template(id: string): FormDefinition {
  const found = FORM_TEMPLATES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Preview template ${id} is missing.`);
  return structuredClone(found.definition) as FormDefinition;
}

function buildForms(): PreviewForm[] {
  const words = template('kasem_word_collection');
  words.schedule = { opensAt: null, closesAt: inDays(10) };
  words.submission.nextSteps = 'A reviewer checks the spelling, tone marks and meaning, usually within a week. You will see the decision under My submissions.';
  const translation = template('sentence_translation');
  translation.submission.nextSteps = 'A reviewer checks that the meaning is kept and the phrasing is natural for the variety you named.';
  const feedback = template('general_feedback');
  feedback.submission.policy = 'once';
  return [
    { id: 'preview_words', status: 'published', currentVersion: 1, versions: new Map([[1, { state: 'published', definition: words }]]) },
    { id: 'preview_translation', status: 'published', currentVersion: 1, versions: new Map([[1, { state: 'published', definition: translation }]]) },
    { id: 'preview_feedback', status: 'paused', currentVersion: 1, versions: new Map([[1, { state: 'published', definition: feedback }]]) },
  ];
}

function event(type: HistoryEvent['type'], actorRole: HistoryEvent['actorRole'], revision: number, at: string, extra: Partial<HistoryEvent> = {}): HistoryEvent {
  return { id: `${type}-${revision}-${at}`, type, actorName: actorRole === 'contributor' ? 'Sample Contributor' : 'Indigen World reviewer', actorRole, revision, at, ...extra };
}

function buildResponses(forms: PreviewForm[]): PreviewResponse[] {
  const translation = forms[1].versions.get(1)!.definition;
  const feedbackForm = forms[2].versions.get(1)!.definition;
  const sent: Answers = {
    source_language: 'english',
    source_sentence: 'Please come and sit with us.',
    translation: '[Sample Kasem translation]',
    dialect: 'navrongo',
    context: 'everyday',
    consent_review: true,
    consent_training: false,
  };
  const approved: Answers = { ...sent, source_sentence: 'Thank you for welcoming me.', context: 'elders', consent_training: true };
  const feedbackText = 'The meaning is right. Please add a note for reviewers on who you would say this to, and check the tone marks on the second word.';
  return [
    {
      id: 'preview_resp_changes', formId: 'preview_translation', formVersion: 1, status: 'changes_requested', revision: 1, draftRevision: 2,
      answers: sent, workingAnswers: null, consents: consentRecords(translation, sent), referenceId: 'IWF-PREV-0001', feedback: feedbackText,
      createdAt: hoursAgo(72), updatedAt: hoursAgo(6), submittedAt: hoursAgo(70), decidedAt: hoursAgo(6),
      revisions: [{ revision: 1, formVersion: 1, answers: sent, consents: consentRecords(translation, sent), submittedAt: hoursAgo(70) }],
      history: [
        event('created', 'contributor', 0, hoursAgo(72)),
        event('submitted', 'contributor', 1, hoursAgo(70)),
        event('review_started', 'reviewer', 1, hoursAgo(20)),
        event('changes_requested', 'reviewer', 1, hoursAgo(6), { feedback: feedbackText }),
      ],
      reward: { points: 0, status: 'none', note: null },
    },
    {
      id: 'preview_resp_approved', formId: 'preview_translation', formVersion: 1, status: 'approved', revision: 1, draftRevision: 2,
      answers: approved, workingAnswers: null, consents: consentRecords(translation, approved), referenceId: 'IWF-PREV-0002', feedback: null,
      createdAt: hoursAgo(240), updatedAt: hoursAgo(200), submittedAt: hoursAgo(238), decidedAt: hoursAgo(200),
      revisions: [{ revision: 1, formVersion: 1, answers: approved, consents: consentRecords(translation, approved), submittedAt: hoursAgo(238) }],
      history: [
        event('created', 'contributor', 0, hoursAgo(240)),
        event('submitted', 'contributor', 1, hoursAgo(238)),
        event('approved', 'reviewer', 1, hoursAgo(200)),
        event('points_awarded', 'system', 1, hoursAgo(200), { note: '3 points added to your balance.' }),
      ],
      reward: { points: 3, status: 'awarded', note: null },
    },
    {
      id: 'preview_resp_draft', formId: 'preview_feedback', formVersion: 1, status: 'draft', revision: 0, draftRevision: 2,
      answers: {}, workingAnswers: { topic: 'contributor_portal', feedback: 'Sample draft: the upload progress is easy to follow.' },
      consents: consentRecords(feedbackForm, {}), referenceId: null, feedback: null,
      createdAt: hoursAgo(30), updatedAt: hoursAgo(29), submittedAt: null, decidedAt: null,
      revisions: [], history: [event('created', 'contributor', 0, hoursAgo(30))],
      reward: { points: 0, status: 'none', note: null },
    },
  ];
}

const forms = buildForms();
const responses = buildResponses(forms);
const uploads = new Map<string, PreviewUpload>();
const requests = new Map<string, { signature: string; result: unknown }>();
let references = 2;
let sequence = 0;
/** Actions whose next reply is "lost" after the change is made (scripts/forms-browser.test.mjs). */
const lostReplies = new Set<string>();

if (typeof window !== 'undefined') {
  (window as unknown as { __iwfFormsPreview?: unknown }).__iwfFormsPreview = {
    loseNextReply(action: string) { lostReplies.add(action); },
    responses: () => structuredClone(responses.map(({ id, formId, status, revision, referenceId }) => ({ id, formId, status, revision, referenceId }))),
    /** Change a form's status, as an administrator would (browser checks). */
    setFormStatus(formId: string, status: FormStatus) {
      const target = forms.find((entry) => entry.id === formId);
      if (target) target.status = status;
    },
    /** Publish a changed copy of a form's current version, for example while a contributor is filling it in. */
    publishVersion(formId: string, change: (definition: FormDefinition) => void): number | null {
      const target = forms.find((entry) => entry.id === formId);
      if (!target) return null;
      const next = structuredClone(target.versions.get(target.currentVersion)!.definition);
      change(next);
      target.currentVersion += 1;
      target.versions.set(target.currentVersion, { state: 'published', definition: next });
      return target.currentVersion;
    },
  };
}

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { code: `functions/${code}`, details });
}

function form(formId: unknown): PreviewForm {
  const found = forms.find((entry) => entry.id === formId);
  if (!found || !VISIBLE.includes(found.status)) fail('not-found', 'This form is not available.');
  return found;
}

function version(target: PreviewForm, number: number) {
  const found = target.versions.get(number);
  if (!found) fail('not-found', 'This version of the form does not exist.');
  return found;
}

function response(id: unknown): PreviewResponse {
  const found = responses.find((entry) => entry.id === id);
  if (!found) fail('not-found', 'This response does not exist.');
  return found;
}

function windowFor(target: PreviewForm, state: VersionState, definition: FormDefinition, row: PreviewResponse | null) {
  if (row?.status === 'changes_requested' && target.status !== 'archived') return { open: true, reason: null, message: '' };
  return submissionWindow({ formStatus: target.status, versionState: state, schedule: definition.schedule });
}

function replay(key: string, signature: string): unknown {
  const prior = requests.get(key);
  if (!prior) return undefined;
  if (prior.signature !== signature) fail('already-exists', 'This request id was already used for different answers.');
  return prior.result;
}

function lose(action: string) {
  if (!lostReplies.delete(action)) return;
  fail('unavailable', 'The connection dropped before the reply arrived. (Preview: simulated.)');
}

function unknownKeys(definition: FormDefinition, answers: Answers): Issue[] {
  const known = new Set(topLevelFields(definition).filter(({ field }) => FIELD_TYPES[field.type].collects).map(({ field }) => field.id));
  return Object.keys(answers).filter((key) => !known.has(key)).map((key) => ({ path: key, message: 'Unknown answer.' }));
}

function listForms(): { forms: AvailableForm[]; attention: number } {
  const out = forms.filter((entry) => VISIBLE.includes(entry.status)).map((entry): AvailableForm => {
    const current = version(entry, entry.currentVersion);
    const own = responses.filter((row) => row.formId === entry.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const draft = own.find((row) => row.status === 'draft') ?? null;
    const submitted = own.filter((row) => row.status !== 'draft');
    const window = submissionWindow({ formStatus: entry.status, versionState: current.state, schedule: current.definition.schedule });
    return {
      id: entry.id,
      title: current.definition.title,
      description: current.definition.description,
      category: current.definition.category,
      estimatedMinutes: current.definition.estimatedMinutes,
      closesAt: current.definition.schedule.closesAt,
      opensAt: current.definition.schedule.opensAt,
      version: entry.currentVersion,
      open: window.open,
      closedReason: window.reason,
      policy: current.definition.submission.policy,
      mine: {
        draftId: draft?.id ?? null,
        draftVersion: draft?.formVersion ?? null,
        submitted: submitted.length,
        latestStatus: submitted[0]?.status ?? null,
        latestResponseId: submitted[0]?.id ?? null,
        needsChanges: own.filter((row) => row.status === 'changes_requested').length,
      },
    };
  });
  out.sort((a, b) => Number(b.open) - Number(a.open) || a.title.localeCompare(b.title));
  return { forms: out, attention: responses.filter((row) => row.status === 'changes_requested').length };
}

function openForm(input: { formId: string; responseId?: string | null; startNew?: boolean }): OpenedForm {
  const target = form(input.formId);
  const own = responses.filter((row) => row.formId === target.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let row: PreviewResponse | null = null;
  if (input.responseId) {
    row = response(input.responseId);
    if (row.formId !== target.id) fail('not-found', 'This response does not exist.');
  } else if (!input.startNew) {
    row = own.find((entry) => entry.status === 'draft') ?? own.find((entry) => entry.status === 'changes_requested') ?? null;
  }
  const attached = version(target, row?.formVersion ?? target.currentVersion);
  const current = version(target, target.currentVersion);
  const currentWindow = submissionWindow({ formStatus: target.status, versionState: current.state, schedule: current.definition.schedule });
  return structuredClone({
    form: { id: target.id, title: current.definition.title, status: target.status, currentVersion: target.currentVersion },
    version: row?.formVersion ?? target.currentVersion,
    versionState: attached.state,
    definition: attached.definition,
    window: windowFor(target, attached.state, attached.definition, row),
    response: row ? {
      id: row.id, status: row.status, revision: row.revision, draftRevision: row.draftRevision,
      answers: row.workingAnswers ?? row.answers, referenceId: row.referenceId, feedback: row.feedback, updatedAt: row.updatedAt,
    } : null,
    newerVersion: row && row.status === 'draft' && row.revision === 0 && target.currentVersion > row.formVersion ? target.currentVersion : null,
    canStartNew: (currentWindow.open || currentWindow.reason === 'not_yet_open') && !(current.definition.submission.policy === 'once' && own.length > 0),
  });
}

function saveDraft(input: Extract<FormsContributorRequest, { action: 'saveDraft' }>) {
  const signature = JSON.stringify([input.formId, input.responseId ?? null, input.version, input.answers, input.expectedDraftRevision ?? null]);
  const key = `saveDraft:${input.requestId}`;
  const prior = replay(key, signature);
  if (prior) return prior;
  const target = form(input.formId);
  const attached = version(target, input.version);
  const definition = attached.definition;
  const unknown = unknownKeys(definition, input.answers);
  if (unknown.length) fail('invalid-argument', 'This response includes answers to questions that are not on the form.', { reason: 'invalid', issues: unknown });
  const { answers: cleaned, issues } = validateAnswers(definition, input.answers, { mode: 'draft' });
  const now = new Date().toISOString();
  let row: PreviewResponse;
  if (input.responseId) {
    row = response(input.responseId);
    if (row.formId !== target.id) fail('not-found', 'This response does not exist.');
    if (!EDITABLE.includes(row.status)) fail('failed-precondition', 'This response has been submitted and can no longer be edited.', { reason: 'not-editable', responseId: row.id });
    if (row.formVersion !== input.version) fail('failed-precondition', 'This draft belongs to another version of the form. Reload it.', { reason: 'version', version: row.formVersion });
    if (input.expectedDraftRevision !== undefined && input.expectedDraftRevision !== null && input.expectedDraftRevision !== row.draftRevision) {
      fail('aborted', 'This draft was changed somewhere else. Reload it to see the latest version.', { reason: 'conflict', responseId: row.id, draftRevision: row.draftRevision });
    }
    row.workingAnswers = cleaned;
    row.draftRevision += 1;
    row.updatedAt = now;
  } else {
    if (target.currentVersion !== input.version) fail('failed-precondition', 'A newer version of this form is available. Reload it.', { reason: 'version', version: target.currentVersion });
    const window = submissionWindow({ formStatus: target.status, versionState: attached.state, schedule: definition.schedule });
    if (!window.open && window.reason !== 'not_yet_open') fail('failed-precondition', window.message, { reason: window.reason });
    const answered = definition.submission.policy === 'once' ? responses.find((entry) => entry.formId === target.id) : undefined;
    if (answered) fail('failed-precondition', 'You have already responded to this form.', { reason: 'not-editable', responseId: answered.id });
    sequence += 1;
    row = {
      id: `preview_resp_new_${sequence}`, formId: target.id, formVersion: input.version, status: 'draft', revision: 0, draftRevision: 1,
      answers: {}, workingAnswers: cleaned, consents: [], referenceId: null, feedback: null,
      createdAt: now, updatedAt: now, submittedAt: null, decidedAt: null, revisions: [], history: [event('created', 'contributor', 0, now)],
      reward: { points: 0, status: 'none', note: null },
    };
    responses.push(row);
  }
  const result = { responseId: row.id, draftRevision: row.draftRevision, savedAt: now, issues };
  requests.set(key, { signature, result });
  lose('saveDraft');
  return result;
}

function submit(input: Extract<FormsContributorRequest, { action: 'submit' }>) {
  const signature = JSON.stringify([input.responseId, input.answers, input.expectedDraftRevision]);
  const key = `submit:${input.requestId}`;
  const prior = replay(key, signature);
  if (prior) return { ...(prior as object), replayed: true };
  const row = response(input.responseId);
  if (!EDITABLE.includes(row.status)) fail('failed-precondition', 'This response has already been submitted.', { reason: 'not-editable', status: row.status });
  if (row.draftRevision !== input.expectedDraftRevision) fail('aborted', 'This response was changed somewhere else. Reload it before submitting.', { reason: 'conflict', draftRevision: row.draftRevision });
  const target = form(row.formId);
  const attached = version(target, row.formVersion);
  const definition = attached.definition;
  const window = windowFor(target, attached.state, definition, row);
  if (!window.open) fail('failed-precondition', window.message, { reason: window.reason });
  const { answers: cleaned, issues } = validateAnswers(definition, input.answers, { mode: 'submit' });
  if (issues.length) fail('failed-precondition', 'Some answers need attention before this can be submitted.', { reason: 'invalid', issues });
  const files = attachmentsIn(definition, cleaned);
  const missing = files.filter((file) => { const upload = uploads.get(file.id); return !upload || !upload.ready || upload.responseId !== row.id; });
  if (missing.length) fail('failed-precondition', 'Some files were not uploaded to this response. Upload them again.', { reason: 'invalid', issues: missing.map((file) => ({ path: file.fieldId, message: `${file.name} was not uploaded. Upload it again.` })) });
  const now = new Date().toISOString();
  const resubmitted = row.revision > 0;
  row.status = 'submitted';
  row.revision += 1;
  row.draftRevision += 1;
  row.answers = cleaned;
  row.workingAnswers = null;
  row.consents = consentRecords(definition, cleaned);
  if (!row.referenceId) {
    references += 1;
    row.referenceId = `IWF-PREV-${String(references).padStart(4, '0')}`;
  }
  row.updatedAt = now;
  row.submittedAt = now;
  row.revisions.push({ revision: row.revision, formVersion: row.formVersion, answers: cleaned, consents: row.consents, submittedAt: now });
  row.history.push(event(resubmitted ? 'resubmitted' : 'submitted', 'contributor', row.revision, now));
  const result = {
    responseId: row.id, referenceId: row.referenceId, status: row.status, revision: row.revision,
    successMessage: definition.submission.successMessage, nextSteps: definition.submission.nextSteps,
  };
  requests.set(key, { signature, result });
  lose('submit');
  return { ...result, replayed: false };
}

function mine(): { responses: MyResponse[]; nextCursor: string | null } {
  return {
    responses: [...responses].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((row) => {
      const target = forms.find((entry) => entry.id === row.formId);
      return {
        id: row.id, referenceId: row.referenceId, formId: row.formId, formTitle: target?.versions.get(row.formVersion)?.definition.title ?? 'Form',
        formVersion: row.formVersion, status: row.status, revision: row.revision, updatedAt: row.updatedAt, submittedAt: row.submittedAt,
        feedback: row.feedback, canEdit: EDITABLE.includes(row.status) && Boolean(target) && target!.status !== 'archived',
      };
    }),
    nextCursor: null,
  };
}

function detail(id: string): ResponseDetail {
  const row = response(id);
  const target = forms.find((entry) => entry.id === row.formId)!;
  const attached = version(target, row.formVersion);
  const answers = row.revision > 0 ? row.answers : row.workingAnswers ?? {};
  return structuredClone({
    id: row.id, referenceId: row.referenceId, formId: row.formId, formTitle: attached.definition.title, formVersion: row.formVersion,
    status: row.status, revision: row.revision, contributorId: 'preview-contributor', contributorName: 'Sample Contributor',
    languageIds: attached.definition.languageContext.languageIds, dialectIds: typeof answers.dialect === 'string' ? [answers.dialect] : [],
    submittedAt: row.submittedAt, updatedAt: row.updatedAt, decidedAt: row.decidedAt, answers, grantedPurposes: grantedPurposes(row.consents),
    attachmentCount: attachmentsIn(attached.definition, answers).length,
    definition: attached.definition, versionState: attached.state, consents: row.consents,
    attachments: attachmentsIn(attached.definition, answers).map((file) => ({ ...file, inspection: 'passed' as const })),
    feedback: row.feedback, revisions: row.revisions, history: [...row.history].reverse(), reward: row.reward,
    routing: { destination: attached.definition.destination.type, status: 'not_applicable' as const, targetCollection: null, targetId: null, note: null },
    allowedDecisions: [], expectedStatus: row.status, expectedRevision: row.revision,
  });
}

function moveToLatest(id: string) {
  const row = response(id);
  if (row.status !== 'draft' || row.revision !== 0) fail('failed-precondition', 'Only an unsent draft can move to the latest version.', { reason: 'not-editable' });
  const target = form(row.formId);
  if (target.currentVersion <= row.formVersion) return { version: row.formVersion, dropped: [] as string[] };
  // The server's own rule: same key and type carry over, permissions never do.
  const { answers: carried, dropped } = carryAnswers(version(target, row.formVersion).definition, version(target, target.currentVersion).definition, row.workingAnswers ?? {});
  row.workingAnswers = carried;
  row.formVersion = target.currentVersion;
  row.draftRevision += 1;
  row.updatedAt = new Date().toISOString();
  return { version: row.formVersion, dropped };
}

function beginUpload(input: Extract<FormsContributorRequest, { action: 'beginUpload' }>) {
  const row = response(input.responseId);
  if (!EDITABLE.includes(row.status)) fail('failed-precondition', 'This response has been submitted and can no longer be changed.', { reason: 'not-editable' });
  const field = uploadField(version(form(row.formId), row.formVersion).definition, input.fieldId);
  if (!field) fail('invalid-argument', 'This question does not take files.');
  if (!matchUploadFormat(field, input.name, input.contentType)) fail('invalid-argument', `${input.name} is not one of the formats this question accepts.`);
  const maxBytes = (field.settings?.maxSizeMb ?? 1) * 1024 * 1024;
  if (!(input.size > 0) || input.size > maxBytes) fail('invalid-argument', `Files for this question must be ${field.settings?.maxSizeMb} MB or smaller.`);
  sequence += 1;
  const id = `previewupload${String(sequence).padStart(4, '0')}`;
  uploads.set(id, { id, name: input.name, contentType: input.contentType, size: input.size, responseId: row.id, fieldId: input.fieldId, ready: false });
  return { uploadId: id, uploadUrl: 'preview://not-uploaded', maxBytes };
}

function confirmUpload(id: string) {
  const upload = uploads.get(id);
  if (!upload) fail('not-found', 'This upload does not exist.');
  upload.ready = true;
  return { attachment: { id: upload.id, name: upload.name, contentType: upload.contentType, size: upload.size } };
}

function removeUpload(id: string) {
  const upload = uploads.get(id);
  if (upload) {
    const row = responses.find((entry) => entry.id === upload.responseId);
    const submitted = row?.revisions.some((revision) => JSON.stringify(revision.answers).includes(`"${id}"`));
    if (submitted) fail('failed-precondition', 'This file belongs to a submitted response and cannot be removed.', { reason: 'not-editable' });
    uploads.delete(id);
  }
  return { removed: true as const };
}

/** The fixture behind formsCall(preview = true, …). */
export async function previewForms(request: FormsContributorRequest): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  switch (request.action) {
    case 'list': return structuredClone(listForms());
    case 'open': return openForm(request);
    case 'saveDraft': return structuredClone(saveDraft(request));
    case 'submit': return structuredClone(submit(request));
    case 'mine': return structuredClone(mine());
    case 'getMine': return detail(request.responseId);
    case 'moveToLatest': return moveToLatest(request.responseId);
    case 'discardDraft': {
      const row = response(request.responseId);
      if (row.status !== 'draft' || row.revision !== 0) fail('failed-precondition', 'Only a draft that was never submitted can be discarded.', { reason: 'not-editable' });
      responses.splice(responses.indexOf(row), 1);
      return { discarded: true };
    }
    case 'beginUpload': return beginUpload(request);
    case 'confirmUpload': return confirmUpload(request.uploadId);
    case 'removeUpload': return removeUpload(request.uploadId);
    case 'attachmentLink': return fail('failed-precondition', 'The preview keeps no files, so there is nothing to open. In the live portal this opens a five-minute private link.');
    default: return fail('invalid-argument', 'Unknown forms action.');
  }
}
