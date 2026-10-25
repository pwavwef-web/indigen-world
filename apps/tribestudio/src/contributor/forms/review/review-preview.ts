/**
 * Development-only formsReview fixture for the review desk preview
 * (/contributor/preview/forms-review). review-data.ts imports it behind
 * import.meta.env.DEV, so a production build never contains it. The forms come
 * from the contract's own templates and the answers are synthetic and clearly
 * marked: no Kasem is invented ("[Sample …]" placeholders, and one "[test]"
 * run of letters and tone marks that must come back byte for byte).
 *
 * It follows the formsReview contract closely enough to exercise the real
 * desk: the queue filters and orders like the server, own responses and other
 * groups' forms are refused, decisions check expectations, the allowed moves,
 * feedback and reviewer checks, and a request id replays its first answer.
 * Nothing leaves the tab and everything resets on reload.
 */
import { FORM_TEMPLATES, DESTINATIONS, REVIEW_DECISIONS, attachmentsIn, consentRecords, grantedPurposes } from '@indigen-world/contracts/forms';
import type { Answers, ConsentRecord, FormDefinition, ResponseStatus, ReviewDecision } from '@indigen-world/contracts/forms';
import type { FormsReviewRequest, HistoryEvent, ResponseDetail, ResponseSummary, RevisionSnapshot } from '@indigen-world/contracts/forms-api';

interface PreviewForm { id: string; definition: FormDefinition; reviewable: boolean }

interface PreviewResponse {
  id: string;
  formId: string;
  status: ResponseStatus;
  revision: number;
  referenceId: string;
  contributorId: string;
  contributorName: string;
  submittedAt: string;
  updatedAt: string;
  decidedAt: string | null;
  feedback: string | null;
  revisions: RevisionSnapshot[];
  history: HistoryEvent[];
  reward: ResponseDetail['reward'];
  routing: ResponseDetail['routing'];
  inspection: Record<string, 'passed' | 'rejected' | 'pending'>;
}

const REVIEWER = { id: 'preview-reviewer', name: 'Sample Reviewer' };
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
/** Letters and tone marks, precomposed and decomposed; not a Kasem word. */
const TONE_RUN = '[test] ɛ́ ɔ̀ ŋ ʋ́ ɩ̀ à à';

function template(id: string): FormDefinition {
  const found = FORM_TEMPLATES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Preview template ${id} is missing.`);
  return structuredClone(found.definition) as FormDefinition;
}

const forms: PreviewForm[] = [
  { id: 'preview_words', definition: template('kasem_word_collection'), reviewable: true },
  { id: 'preview_translation', definition: template('sentence_translation'), reviewable: true },
  { id: 'preview_documents', definition: template('research_documents'), reviewable: true },
  // Reviewed by administrators only: this sample reviewer is not in that group.
  { id: 'preview_feedback', definition: template('general_feedback'), reviewable: false },
];

function form(id: string): PreviewForm {
  const found = forms.find((entry) => entry.id === id);
  if (!found) throw new Error(`Preview form ${id} is missing.`);
  return found;
}

function event(type: HistoryEvent['type'], actorRole: HistoryEvent['actorRole'], revision: number, at: string, extra: Partial<HistoryEvent> = {}, actorName?: string): HistoryEvent {
  const name = actorName ?? (actorRole === 'contributor' ? 'Contributor' : actorRole === 'system' ? 'Indigen World' : 'Another reviewer');
  return { id: `${type}-${revision}-${at}-${Math.random().toString(36).slice(2, 7)}`, type, actorName: name, actorRole, revision, at, ...extra };
}

function snapshot(formId: string, revision: number, answers: Answers, submittedAt: string): RevisionSnapshot {
  return { revision, formVersion: 1, answers, consents: consentRecords(form(formId).definition, answers), submittedAt };
}

const notRouted = (formId: string): ResponseDetail['routing'] => ({ destination: form(formId).definition.destination.type, status: 'not_applicable', targetCollection: null, targetId: null, note: null });

function build(): PreviewResponse[] {
  const word: Answers = {
    word: '[Sample Kasem word]',
    meaning: 'water for drinking (synthetic sample)',
    dialect: 'navrongo',
    part_of_speech: 'noun',
    examples: [
      { example_kasem: '[Sample Kasem example sentence]', example_english: 'Please bring the drinking water inside. (synthetic)' },
      { example_kasem: TONE_RUN, example_english: 'A run of letters and tone marks used to check exact display.' },
    ],
    pronunciation: [{ id: 'previewaudio0001', name: 'pronunciation.webm', contentType: 'audio/webm', size: 48_213 }],
    source: 'family_elder',
    rights_confirmed: true,
    speaker_permission: true,
    consent_review: true,
    consent_storage: true,
    consent_public: false,
    consent_training: false,
  };
  const firstTranslation: Answers = {
    source_language: 'english',
    source_sentence: 'Please come and sit with us.',
    translation: '[Sample Kasem translation]',
    dialect: 'navrongo',
    context: 'everyday',
    notes: '',
    consent_review: true,
    consent_training: false,
  };
  const secondTranslation: Answers = {
    ...firstTranslation,
    translation: `${TONE_RUN} [Sample Kasem translation, revised]`,
    context: 'elders',
    notes: 'Line one: this is how you would invite an elder.\nLine two: the second word carries the tone marks the reviewer asked about.',
  };
  const documents: Answers = {
    title: 'Field notes on market greetings (synthetic sample)',
    description: 'Two pages of notes from a sample interview.\nThe second page lists greetings by time of day.',
    source: 'Field notes, Paga, March 2024 (synthetic)',
    authorship: 'permission',
    permission_statement: 'The author agreed by message that Indigen World may review and keep these notes.',
    language: 'english',
    attachments: [
      { id: 'previewdoc0001', name: 'field-notes.pdf', contentType: 'application/pdf', size: 182_400 },
      { id: 'previewdoc0002', name: 'page-2-scan.png', contentType: 'image/png', size: 1_204_224 },
    ],
    consent_review: true,
    consent_retrieval: false,
  };
  const feedback: Answers = { topic: 'contributor_portal', feedback: 'The upload progress is easy to follow. (synthetic sample)' };
  const changes = 'The meaning is right. Please add who you would say this to, and check the tone marks on the second word.';
  const rejected = 'This word is already in the dictionary with the same meaning and spelling, so it cannot be added again.';
  const approvedAnswers: Answers = { ...firstTranslation, source_sentence: 'Thank you for welcoming me.', translation: '[Sample Kasem translation]', context: 'elders', consent_training: true };

  return [
    {
      id: 'preview_rv_word', formId: 'preview_words', status: 'submitted', revision: 1, referenceId: 'IWF-PREV-0101',
      contributorId: 'preview-contributor-a', contributorName: 'Sample Contributor A',
      submittedAt: hoursAgo(50), updatedAt: hoursAgo(50), decidedAt: null, feedback: null,
      revisions: [snapshot('preview_words', 1, word, hoursAgo(50))],
      history: [event('created', 'contributor', 0, hoursAgo(52)), event('submitted', 'contributor', 1, hoursAgo(50))],
      reward: { points: 0, status: 'none', note: null }, routing: notRouted('preview_words'),
      inspection: { previewaudio0001: 'passed' },
    },
    {
      id: 'preview_rv_documents', formId: 'preview_documents', status: 'under_review', revision: 1, referenceId: 'IWF-PREV-0102',
      contributorId: 'preview-contributor-b', contributorName: 'Sample Contributor B',
      submittedAt: hoursAgo(30), updatedAt: hoursAgo(4), decidedAt: null, feedback: null,
      revisions: [snapshot('preview_documents', 1, documents, hoursAgo(30))],
      history: [
        event('created', 'contributor', 0, hoursAgo(31)), event('submitted', 'contributor', 1, hoursAgo(30)),
        event('review_started', 'reviewer', 1, hoursAgo(4), {}, REVIEWER.name),
      ],
      reward: { points: 0, status: 'none', note: null }, routing: notRouted('preview_documents'),
      inspection: { previewdoc0001: 'passed', previewdoc0002: 'pending' },
    },
    {
      id: 'preview_rv_translation', formId: 'preview_translation', status: 'submitted', revision: 2, referenceId: 'IWF-PREV-0103',
      contributorId: 'preview-contributor-c', contributorName: 'Sample Contributor C',
      submittedAt: hoursAgo(20), updatedAt: hoursAgo(20), decidedAt: hoursAgo(40), feedback: changes,
      revisions: [snapshot('preview_translation', 1, firstTranslation, hoursAgo(60)), snapshot('preview_translation', 2, secondTranslation, hoursAgo(20))],
      history: [
        event('created', 'contributor', 0, hoursAgo(61)), event('submitted', 'contributor', 1, hoursAgo(60)),
        event('review_started', 'reviewer', 1, hoursAgo(45)),
        event('changes_requested', 'reviewer', 1, hoursAgo(40), { feedback: changes, checks: ['meaning_preserved'] }),
        event('resubmitted', 'contributor', 2, hoursAgo(20)),
      ],
      reward: { points: 0, status: 'none', note: null }, routing: notRouted('preview_translation'),
      inspection: {},
    },
    {
      id: 'preview_rv_admins', formId: 'preview_feedback', status: 'submitted', revision: 1, referenceId: 'IWF-PREV-0104',
      contributorId: 'preview-contributor-d', contributorName: 'Sample Contributor D',
      submittedAt: hoursAgo(70), updatedAt: hoursAgo(70), decidedAt: null, feedback: null,
      revisions: [snapshot('preview_feedback', 1, feedback, hoursAgo(70))],
      history: [event('submitted', 'contributor', 1, hoursAgo(70))],
      reward: { points: 0, status: 'none', note: null }, routing: notRouted('preview_feedback'), inspection: {},
    },
    {
      id: 'preview_rv_own', formId: 'preview_translation', status: 'submitted', revision: 1, referenceId: 'IWF-PREV-0105',
      contributorId: REVIEWER.id, contributorName: REVIEWER.name,
      submittedAt: hoursAgo(80), updatedAt: hoursAgo(80), decidedAt: null, feedback: null,
      revisions: [snapshot('preview_translation', 1, firstTranslation, hoursAgo(80))],
      history: [event('submitted', 'contributor', 1, hoursAgo(80))],
      reward: { points: 0, status: 'none', note: null }, routing: notRouted('preview_translation'), inspection: {},
    },
    {
      id: 'preview_rv_approved', formId: 'preview_translation', status: 'approved', revision: 1, referenceId: 'IWF-PREV-0090',
      contributorId: 'preview-contributor-a', contributorName: 'Sample Contributor A',
      submittedAt: hoursAgo(240), updatedAt: hoursAgo(200), decidedAt: hoursAgo(200), feedback: null,
      revisions: [snapshot('preview_translation', 1, approvedAnswers, hoursAgo(240))],
      history: [
        event('submitted', 'contributor', 1, hoursAgo(240)),
        event('approved', 'reviewer', 1, hoursAgo(200), { checks: ['meaning_preserved', 'natural'] }),
        event('points_awarded', 'system', 1, hoursAgo(200), { note: '3 points awarded.' }),
        event('routed', 'system', 1, hoursAgo(200), { note: 'Queued in the materials review desk.' }),
      ],
      reward: { points: 3, status: 'awarded', note: null },
      routing: { destination: 'translation_review', status: 'routed', targetCollection: 'portalContributions', targetId: 'PC-preview-0090', note: null },
      inspection: {},
    },
    {
      id: 'preview_rv_rejected', formId: 'preview_words', status: 'rejected', revision: 1, referenceId: 'IWF-PREV-0091',
      contributorId: 'preview-contributor-b', contributorName: 'Sample Contributor B',
      submittedAt: hoursAgo(300), updatedAt: hoursAgo(280), decidedAt: hoursAgo(280), feedback: rejected,
      revisions: [snapshot('preview_words', 1, { ...word, pronunciation: [] }, hoursAgo(300))],
      history: [event('submitted', 'contributor', 1, hoursAgo(300)), event('rejected', 'reviewer', 1, hoursAgo(280), { feedback: rejected })],
      reward: { points: 0, status: 'none', note: null }, routing: notRouted('preview_words'), inspection: {},
    },
    {
      id: 'preview_rv_changes', formId: 'preview_words', status: 'changes_requested', revision: 1, referenceId: 'IWF-PREV-0092',
      contributorId: 'preview-contributor-c', contributorName: 'Sample Contributor C',
      submittedAt: hoursAgo(100), updatedAt: hoursAgo(90), decidedAt: hoursAgo(90), feedback: 'Please add a second example that uses the word in a question.',
      revisions: [snapshot('preview_words', 1, { ...word, pronunciation: [] }, hoursAgo(100))],
      history: [
        event('submitted', 'contributor', 1, hoursAgo(100)),
        event('changes_requested', 'reviewer', 1, hoursAgo(90), { feedback: 'Please add a second example that uses the word in a question.' }),
      ],
      reward: { points: 0, status: 'none', note: null }, routing: notRouted('preview_words'), inspection: {},
    },
  ];
}

const responses = build();
const requests = new Map<string, { signature: string; result: unknown }>();
const recorded: Array<{ responseId: string; decision: ReviewDecision; feedback: string | null; checks: string[]; requestId: string }> = [];
let loseNext = false;

/** Hooks for scripts/forms-review-browser.test.mjs. */
if (typeof window !== 'undefined') {
  (window as unknown as { __iwfReviewPreview?: unknown }).__iwfReviewPreview = {
    /** Decisions applied by the fixture, in order (a replayed request is not applied twice). */
    decisions: () => structuredClone(recorded),
    status: (id: string) => { const row = responses.find((entry) => entry.id === id); return row ? { status: row.status, revision: row.revision } : null; },
    /** Another reviewer starts reviewing the response (or the contributor resubmits) behind this tab's back. */
    touch(id: string) {
      const row = responses.find((entry) => entry.id === id);
      if (!row) return;
      const now = new Date().toISOString();
      if (row.status === 'submitted') {
        row.status = 'under_review';
        row.history.push(event('review_started', 'reviewer', row.revision, now));
      } else {
        row.revision += 1;
        row.revisions.push({ ...row.revisions[row.revisions.length - 1], revision: row.revision, submittedAt: now });
        row.history.push(event('resubmitted', 'contributor', row.revision, now));
      }
      row.updatedAt = now;
    },
    /** The next decision is applied, then its reply is lost (a dropped connection). */
    loseNextReply() { loseNext = true; },
  };
}

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { code: `functions/${code}`, details });
}

function reviewable(id: unknown): PreviewResponse {
  const row = responses.find((entry) => entry.id === id);
  if (!row) fail('not-found', 'This response does not exist.');
  if (row.contributorId === REVIEWER.id) fail('permission-denied', 'You cannot review your own response.');
  if (!form(row.formId).reviewable) fail('permission-denied', 'This form is reviewed by another reviewer group.', { reason: 'group' });
  return row;
}

function answersOf(row: PreviewResponse): Answers {
  return row.revisions[row.revisions.length - 1]?.answers ?? {};
}

function consentsOf(row: PreviewResponse): ConsentRecord[] {
  return row.revisions[row.revisions.length - 1]?.consents ?? [];
}

function summary(row: PreviewResponse): ResponseSummary {
  const definition = form(row.formId).definition;
  const answers = answersOf(row);
  return {
    id: row.id, referenceId: row.referenceId, formId: row.formId, formTitle: definition.title, formVersion: 1,
    status: row.status, revision: row.revision, contributorId: row.contributorId, contributorName: row.contributorName,
    languageIds: definition.languageContext.languageIds, dialectIds: typeof answers.dialect === 'string' ? [answers.dialect] : [],
    submittedAt: row.submittedAt, updatedAt: row.updatedAt, decidedAt: row.decidedAt, answers,
    grantedPurposes: grantedPurposes(consentsOf(row)), attachmentCount: attachmentsIn(definition, answers).length,
  };
}

function allowedDecisions(row: PreviewResponse): ReviewDecision[] {
  if (!form(row.formId).definition.review.required) return [];
  return (Object.keys(REVIEW_DECISIONS) as ReviewDecision[]).filter((decision) => REVIEW_DECISIONS[decision].from.includes(row.status));
}

function detail(row: PreviewResponse): ResponseDetail {
  const definition = form(row.formId).definition;
  return structuredClone({
    ...summary(row),
    definition, versionState: 'published' as const, consents: consentsOf(row),
    attachments: attachmentsIn(definition, answersOf(row)).map((file) => ({ ...file, inspection: row.inspection[file.id] ?? 'passed' as const })),
    feedback: row.feedback, revisions: row.revisions, history: row.history, reward: row.reward, routing: row.routing,
    allowedDecisions: allowedDecisions(row), expectedStatus: row.status, expectedRevision: row.revision,
  });
}

const OPEN: ResponseStatus[] = ['submitted', 'under_review'];
const HISTORY_TYPE: Record<ReviewDecision, HistoryEvent['type']> = { start_review: 'review_started', request_changes: 'changes_requested', approve: 'approved', reject: 'rejected' };

function queue(input: Extract<FormsReviewRequest, { action: 'queue' }>) {
  const statuses: ResponseStatus[] = !input.status || input.status === 'open' ? OPEN : [input.status];
  const waiting = statuses.every((status) => OPEN.includes(status));
  const rows = responses
    .filter((row) => statuses.includes(row.status) && (!input.formId || row.formId === input.formId))
    .filter((row) => row.contributorId !== REVIEWER.id && form(row.formId).reviewable)
    .sort((a, b) => waiting ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt))
    .map(summary);
  const visible = forms.filter((entry) => entry.reviewable).map((entry) => ({ id: entry.id, title: entry.definition.title }));
  visible.sort((a, b) => a.title.localeCompare(b.title));
  return structuredClone({ rows, forms: visible, nextCursor: null });
}

function decide(input: Extract<FormsReviewRequest, { action: 'decide' }>) {
  const feedback = typeof input.feedback === 'string' ? input.feedback.trim() : '';
  const checks = [...new Set(input.checks ?? [])];
  const signature = JSON.stringify([input.responseId, input.decision, feedback, [...checks].sort(), input.expectedStatus, input.expectedRevision]);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.requestId)) fail('invalid-argument', 'A request id is required.');
  const prior = requests.get(input.requestId);
  if (prior) {
    if (prior.signature !== signature) fail('already-exists', 'This request id was already used for a different decision. Reload the response.');
    return { ...(prior.result as object), replayed: true };
  }
  if ((input.decision === 'request_changes' || input.decision === 'reject') && feedback.length < 5) {
    fail('invalid-argument', 'Tell the contributor why, in at least five characters.', { reason: 'feedback' });
  }
  const row = reviewable(input.responseId);
  if (row.status !== input.expectedStatus || row.revision !== input.expectedRevision) {
    fail('aborted', 'This response changed since you opened it. Reload it before deciding.', { reason: 'stale', status: row.status, revision: row.revision });
  }
  const rule = REVIEW_DECISIONS[input.decision];
  if (!rule || !rule.from.includes(row.status)) fail('failed-precondition', 'This response cannot be given this decision.', { reason: 'decision', status: row.status });
  const definition = form(row.formId).definition;
  const known = new Set(definition.review.checks.map((check) => check.id));
  if (checks.some((id) => !known.has(id))) fail('invalid-argument', 'Some checks are not part of this form.', { reason: 'checks' });
  if (input.decision === 'approve') {
    const missing = definition.review.checks.filter((check) => !checks.includes(check.id));
    if (missing.length) fail('failed-precondition', `Confirm every review check before approving: ${missing.map((check) => check.label).join('; ')}.`, { reason: 'checks' });
  }

  const now = new Date().toISOString();
  row.status = rule.to;
  row.updatedAt = now;
  if (input.decision !== 'start_review') {
    row.feedback = feedback || null;
    row.decidedAt = now;
  }
  row.history.push(event(HISTORY_TYPE[input.decision], 'reviewer', row.revision, now, { ...(feedback ? { feedback } : {}), ...(checks.length ? { checks } : {}) }, REVIEWER.name));
  if (input.decision === 'approve') {
    const points = definition.review.points;
    row.reward = points > 0 ? { points, status: 'awarded', note: null } : { points: 0, status: 'not_applicable', note: null };
    if (points > 0) row.history.push(event('points_awarded', 'system', row.revision, now, { note: `${points} points awarded.` }));
    const type = definition.destination.type;
    const granted = grantedPurposes(consentsOf(row));
    const missing = DESTINATIONS[type].requiredConsents.filter((purpose) => !granted.includes(purpose));
    if (type === 'general_intake') row.routing = notRouted(row.formId);
    else if (missing.length) {
      row.routing = { destination: type, status: 'blocked', targetCollection: null, targetId: null, note: 'A permission this destination needs was not given.' };
      row.history.push(event('routing_blocked', 'system', row.revision, now, { note: row.routing.note ?? undefined }));
    } else {
      row.routing = { destination: type, status: 'routed', targetCollection: type === 'dictionary_candidate' ? 'submissions' : 'portalContributions', targetId: `PREVIEW-${row.referenceId}`, note: null };
      row.history.push(event('routed', 'system', row.revision, now, { note: `Filed in ${DESTINATIONS[type].label}.` }));
    }
  }
  recorded.push({ responseId: row.id, decision: input.decision, feedback: input.feedback ?? null, checks, requestId: input.requestId });
  const result = { status: row.status, reward: row.reward, routing: row.routing };
  requests.set(input.requestId, { signature, result: structuredClone(result) });
  if (loseNext) {
    loseNext = false;
    fail('unavailable', 'The connection dropped before the reply arrived. (Preview: simulated.)');
  }
  return structuredClone({ ...result, replayed: false });
}

/** The fixture behind formsReview(preview = true, …). */
export async function previewReview(request: FormsReviewRequest): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  switch (request.action) {
    case 'queue': return queue(request);
    case 'get': return detail(reviewable(request.responseId));
    case 'decide': return decide(request);
    case 'attachmentLink': {
      const row = reviewable(request.responseId);
      const file = attachmentsIn(form(row.formId).definition, answersOf(row)).find((entry) => entry.id === request.attachmentId);
      if (!file) fail('not-found', 'This file is not part of the response.');
      row.history.push(event('attachment_link', 'reviewer', row.revision, new Date().toISOString(), { note: file.name }, REVIEWER.name));
      const body = `Synthetic preview file: ${file.name}\nThe preview stores no files. In the live desk this opens a five-minute private link.`;
      return { url: URL.createObjectURL(new Blob([body], { type: 'text/plain' })), expiresAt: new Date(Date.now() + 300_000).toISOString() };
    }
    case 'retryRouting': {
      const row = reviewable(request.responseId);
      if (row.status !== 'approved' || !['failed', 'pending'].includes(row.routing.status)) fail('failed-precondition', 'Only an approved response whose routing failed or is still pending can be retried.', { reason: 'routing' });
      row.routing = { ...row.routing, status: 'routed', targetId: `PREVIEW-${row.referenceId}`, note: null };
      return { routing: structuredClone(row.routing) };
    }
    default: return fail('invalid-argument', 'Unknown review action.');
  }
}
