/**
 * The review workspace's vocabulary: which queues exist, what each kind of
 * item is, what every decision does, and how a decision request is built.
 * Pure — no Firebase — so the rules are tested and the preview can run on
 * sample data.
 *
 * Every decision here maps to a callable that checks the reviewer's role,
 * refuses decisions on the reviewer's own work and records an audit entry on
 * the server (decideSubmission, decidePronunciationRecording,
 * decideGrammarNote, decideKasemNameRequest, decideAdCampaign). The
 * interface only offers what those callables accept for the item's status.
 */
import type { IconName, Tone } from '../components';

export type Desk = 'contributions' | 'recordings' | 'sentences' | 'names' | 'adverts';
export type ReviewRecord = Record<string, any> & { id: string; status: string };

export interface QueueView {
  id: string;
  label: string;
  statuses: string[];
  /** Whether a decision can still be recorded on items in this view. */
  actionable: boolean;
}

export interface DeskDefinition {
  label: string;
  description: string;
  collection: string;
  icon: IconName;
  views: QueueView[];
  /** Firestore ordering the existing indexes support, if any. */
  order?: { field: string; direction: 'asc' | 'desc' };
}

export const DESKS: Record<Desk, DeskDefinition> = {
  contributions: {
    label: 'Contributions',
    description: 'Assigned translations, everyday expressions, dictionary words and creator submissions',
    collection: 'submissions',
    icon: 'contributions',
    order: { field: 'lifecycle.createdAt', direction: 'asc' },
    views: [
      { id: 'waiting', label: 'Waiting', statuses: ['SUBMITTED', 'RESUBMITTED'], actionable: true },
      { id: 'escalated', label: 'Escalated', statuses: ['UNDER_REVIEW'], actionable: true },
      { id: 'ready', label: 'Approved, unpublished', statuses: ['APPROVED'], actionable: true },
      { id: 'published', label: 'Published', statuses: ['PUBLISHED'], actionable: false },
      { id: 'returned', label: 'Returned or declined', statuses: ['NEEDS_REVISION', 'REJECTED'], actionable: false },
    ],
  },
  recordings: {
    label: 'Pronunciations',
    description: 'Recordings of published dictionary words',
    collection: 'pronunciationRecordings',
    icon: 'mic',
    order: { field: 'createdAt', direction: 'desc' },
    views: [
      { id: 'waiting', label: 'Waiting', statuses: ['submitted'], actionable: true },
      { id: 'approved', label: 'Approved', statuses: ['approved'], actionable: false },
      { id: 'rejected', label: 'Not accepted', statuses: ['rejected'], actionable: false },
    ],
  },
  sentences: {
    label: 'Sentences',
    description: 'Example sentences and grammar notes, judged independently',
    collection: 'grammarNotes',
    icon: 'sentence',
    views: [
      { id: 'waiting', label: 'Waiting', statuses: ['submitted'], actionable: true },
      { id: 'disputed', label: 'Reviewers disagree', statuses: ['disputed'], actionable: true },
      { id: 'reviewed', label: 'Reviewed variants', statuses: ['reviewed'], actionable: true },
      { id: 'confirmed', label: 'Confirmed', statuses: ['confirmed'], actionable: false },
      { id: 'permission', label: 'Needs permission', statuses: ['needs-permission'], actionable: false },
      { id: 'closed', label: 'Withdrawn or rejected', statuses: ['withdrawn', 'rejected'], actionable: false },
    ],
  },
  names: {
    label: 'Kasem names',
    description: 'Requests to add a Kasem name',
    collection: 'kasemNameRequests',
    icon: 'name',
    views: [
      { id: 'waiting', label: 'Waiting', statuses: ['pending'], actionable: true },
      { id: 'approved', label: 'Added', statuses: ['approved'], actionable: false },
      { id: 'rejected', label: 'Not added', statuses: ['rejected'], actionable: false },
    ],
  },
  adverts: {
    label: 'Adverts',
    description: 'Community adverts before they run',
    collection: 'adCampaigns',
    icon: 'advert',
    views: [
      { id: 'waiting', label: 'Waiting', statuses: ['IN_REVIEW'], actionable: true },
      { id: 'running', label: 'Running', statuses: ['ACTIVE'], actionable: true },
      { id: 'paused', label: 'Paused', statuses: ['PAUSED'], actionable: true },
      { id: 'rejected', label: 'Rejected', statuses: ['REJECTED'], actionable: false },
    ],
  },
};

export const DESK_ORDER: Desk[] = ['contributions', 'recordings', 'sentences', 'names', 'adverts'];

/**
 * The queues the overview counts. `primary` queues hold work a reviewer can
 * decide now; the others are shown for context (approved work waiting to be
 * published, sentences where reviewers disagree).
 */
export const OVERVIEW_QUEUES: { desk: Desk; view: string; label: string; hint: string; tone: Tone; primary: boolean }[] = [
  { desk: 'contributions', view: 'waiting', label: 'Contributions waiting', hint: 'Translations, expressions, words and creator work', tone: 'info', primary: true },
  { desk: 'contributions', view: 'escalated', label: 'Escalated to a specialist', hint: 'Needs an elder, a teacher or a rights reviewer', tone: 'violet', primary: true },
  { desk: 'recordings', view: 'waiting', label: 'Pronunciations waiting', hint: 'Recordings of published dictionary words', tone: 'info', primary: true },
  { desk: 'sentences', view: 'waiting', label: 'Sentences waiting', hint: 'Each needs two independent judgments', tone: 'info', primary: true },
  { desk: 'sentences', view: 'disputed', label: 'Sentences where reviewers disagree', hint: 'Judged differently by two speakers', tone: 'warning', primary: true },
  { desk: 'names', view: 'waiting', label: 'Kasem name requests', hint: 'Requests to add a name', tone: 'info', primary: true },
  { desk: 'adverts', view: 'waiting', label: 'Adverts waiting', hint: 'Community adverts before they run', tone: 'info', primary: true },
  { desk: 'contributions', view: 'ready', label: 'Approved, not yet published', hint: 'Publishing is a separate step', tone: 'success', primary: false },
];

export function isDesk(value: string): value is Desk {
  return (DESK_ORDER as string[]).includes(value);
}

export function viewFor(desk: Desk, id: string | null | undefined): QueueView {
  return DESKS[desk].views.find((view) => view.id === id) ?? DESKS[desk].views[0];
}

// ---------------------------------------------------------------------------
// What an item is
// ---------------------------------------------------------------------------

export type ItemTypeId =
  | 'assigned' | 'expression' | 'word' | 'saying' | 'queue-answer' | 'literature' | 'music' | 'video' | 'post'
  | 'recording' | 'sentence' | 'name' | 'advert';

export const ITEM_TYPES: Record<ItemTypeId, { label: string; icon: IconName }> = {
  assigned: { label: 'Assigned translation', icon: 'translate' },
  expression: { label: 'Everyday expression', icon: 'expression' },
  word: { label: 'Dictionary word', icon: 'word' },
  saying: { label: 'Saying (dictionary)', icon: 'expression' },
  'queue-answer': { label: 'Word request answer', icon: 'word' },
  literature: { label: 'Story or text', icon: 'doc' },
  music: { label: 'Music', icon: 'play' },
  video: { label: 'Video', icon: 'play' },
  post: { label: 'Creator submission', icon: 'doc' },
  recording: { label: 'Pronunciation', icon: 'mic' },
  sentence: { label: 'Sentence', icon: 'sentence' },
  name: { label: 'Kasem name', icon: 'name' },
  advert: { label: 'Advert', icon: 'advert' },
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function itemType(desk: Desk, row: ReviewRecord): ItemTypeId {
  if (desk === 'recordings') return 'recording';
  if (desk === 'sentences') return 'sentence';
  if (desk === 'names') return 'name';
  if (desk === 'adverts') return 'advert';
  if (row.contributorPortal) return 'assigned';
  const kind = text(row.collectionKind).toLowerCase();
  if (kind === 'expressions') return 'expression';
  if (kind === 'dictionary') {
    if (row.wordQueueId) return 'queue-answer';
    return ['phrase', 'idiom', 'proverb'].includes(text(row.lexicalKind).toLowerCase()) ? 'saying' : 'word';
  }
  if (kind === 'literature' || kind === 'audiobooks') return 'literature';
  if (kind === 'music') return 'music';
  if (kind === 'video') return 'video';
  return 'post';
}

/** The Kasem side of an item, or its headline when it has no Kasem side. */
export function itemTitle(desk: Desk, row: ReviewRecord): string {
  const type = itemType(desk, row);
  const expression = (row.expression ?? {}) as Record<string, unknown>;
  if (type === 'assigned') return text(row.title) || 'Untitled expression';
  if (type === 'expression') return text(expression.phrase) || text(row.body) || 'Untitled expression';
  if (type === 'word' || type === 'saying' || type === 'queue-answer') return text(row.body) || text(row.title) || 'Untitled word';
  if (type === 'recording') return text(row.headword) || 'Recording';
  if (type === 'sentence') {
    const first = Array.isArray(row.examples) ? row.examples[0] as Record<string, unknown> | undefined : undefined;
    return text(row.title) || text(first?.kasem) || 'Sentence';
  }
  if (type === 'name') return text(row.name) || text(row.requestedName) || 'Name request';
  if (type === 'advert') return text(row.headline) || text(row.name) || 'Advert';
  return text(row.title) || text(row.name) || 'Untitled submission';
}

/** The second line: the contributor's Kasem for a translation, the English meaning for the rest. */
export function itemSubtitle(desk: Desk, row: ReviewRecord): string {
  const type = itemType(desk, row);
  const expression = (row.expression ?? {}) as Record<string, unknown>;
  if (type === 'assigned') return text(expression.phrase) || text(row.body);
  if (type === 'expression') return text(expression.meaning) || text(row.title);
  if (type === 'word' || type === 'saying' || type === 'queue-answer') return text(row.title);
  if (type === 'recording') return text(row.meaning);
  if (type === 'sentence') {
    const first = Array.isArray(row.examples) ? row.examples[0] as Record<string, unknown> | undefined : undefined;
    return text(first?.english);
  }
  if (type === 'name') return text(row.meaning) || text(row.note);
  if (type === 'advert') return text(row.ctaLabel) || text(row.description);
  return text(row.description) || text(row.format);
}

export function itemDialect(row: ReviewRecord): string {
  const expression = (row.expression ?? {}) as Record<string, unknown>;
  const dialect = text(expression.dialect) || text(row.dialect);
  // Assigned translations record the language ("Kasem"), not a dialect.
  return ['kasem', 'unknown', 'not sure'].includes(dialect.toLocaleLowerCase()) ? '' : dialect;
}

function millis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  const stamp = value as { toMillis?: () => number; seconds?: number };
  if (typeof stamp.toMillis === 'function') return stamp.toMillis();
  if (typeof stamp.seconds === 'number') return stamp.seconds * 1000;
  return 0;
}

/** When the item entered review, whichever field its collection records it in. */
export function itemCreatedAt(row: ReviewRecord): number {
  return millis(row.lifecycle?.createdAt) || millis(row.createdAt) || millis(row.submittedAt) || millis(row.updatedAt);
}

export function isResubmission(row: ReviewRecord): boolean {
  return Boolean(row.revisionOf) || row.status === 'RESUBMITTED';
}

export function ageLabel(createdAt: number, now = Date.now()): string {
  if (!createdAt) return 'Unknown';
  const hours = Math.max(0, Math.round((now - createdAt) / 3_600_000));
  if (hours < 1) return 'Under an hour';
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Filtering, sorting and paging
// ---------------------------------------------------------------------------

export type AgeFilter = 'any' | '1' | '3' | '7';
export type QueueSort = 'oldest' | 'newest';

export interface QueueFilters {
  type: string;
  dialect: string;
  age: AgeFilter;
  query: string;
  sort: QueueSort;
}

export function filterQueue(desk: Desk, rows: ReviewRecord[], filters: QueueFilters, now = Date.now()): ReviewRecord[] {
  const needle = filters.query.trim().toLocaleLowerCase();
  const minimumAge = filters.age === 'any' ? 0 : Number(filters.age) * 86_400_000;
  const filtered = rows.filter((row) => {
    if (filters.type && filters.type !== 'all' && itemType(desk, row) !== filters.type) return false;
    if (filters.dialect && filters.dialect !== 'all' && itemDialect(row) !== filters.dialect) return false;
    if (minimumAge && now - itemCreatedAt(row) < minimumAge) return false;
    if (!needle) return true;
    return [itemTitle(desk, row), itemSubtitle(desk, row), itemDialect(row), text(row.translationNotes), text(row.usageContext)]
      .join(' ').toLocaleLowerCase().includes(needle);
  });
  // Stable: ties fall back to the document id, so paging never shuffles rows.
  return filtered.sort((a, b) => {
    const difference = filters.sort === 'oldest' ? itemCreatedAt(a) - itemCreatedAt(b) : itemCreatedAt(b) - itemCreatedAt(a);
    return difference || a.id.localeCompare(b.id);
  });
}

export function dialectsIn(rows: ReviewRecord[]): string[] {
  return [...new Set(rows.map(itemDialect).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function typesIn(desk: Desk, rows: ReviewRecord[]): ItemTypeId[] {
  return [...new Set(rows.map((row) => itemType(desk, row)))];
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export const DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Approve',
  REQUEST_REVISION: 'Ask for changes',
  REJECT: 'Reject',
  PUBLISH: 'Publish',
  ARCHIVE: 'Keep, do not publish',
  ESCALATE_CULTURAL: 'Escalate to a specialist',
  PAUSE: 'Pause',
  RESUME: 'Resume',
  approve: 'Approve',
  reject: 'Reject',
};

/** The decision's name for this item: rejecting an assigned translation returns it for revision. */
export function decisionLabel(desk: Desk, decision: string, item: ReviewRecord): string {
  if (desk === 'adverts' && decision === 'APPROVE') return 'Approve and run';
  if (decision === 'REJECT' && desk === 'contributions' && itemType(desk, item) === 'assigned') return 'Return with feedback';
  return DECISION_LABELS[decision] ?? decision;
}

export function decisionsFor(desk: Desk, item: ReviewRecord): string[] {
  if (desk === 'names') return item.status === 'pending' ? ['approve', 'reject'] : [];
  if (desk === 'recordings') return item.status === 'submitted' ? ['approve', 'reject'] : [];
  if (desk === 'adverts') return ({ IN_REVIEW: ['APPROVE', 'REJECT'], ACTIVE: ['PAUSE', 'REJECT'], PAUSED: ['RESUME', 'REJECT'] } as Record<string, string[]>)[item.status] ?? [];
  if (desk === 'sentences') return [];
  if (['APPROVED', 'SCHEDULED'].includes(item.status)) {
    // Publishing needs the contributor's permission; without it, approved
    // work can only be kept for the archive (decideSubmission enforces both).
    return [...(item.permissions?.publication === true ? ['PUBLISH'] : ['ARCHIVE']), 'REJECT'];
  }
  if (!['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW', 'NEEDS_REVISION'].includes(item.status)) return [];
  return ['APPROVE', ...(!item.collectionKind || item.wordQueueId ? ['REQUEST_REVISION'] : []), 'REJECT', 'ESCALATE_CULTURAL'];
}

/** Decisions that send work back and therefore need a written reason. */
export const NEEDS_FEEDBACK = new Set(['REJECT', 'REQUEST_REVISION', 'reject']);
export const FEEDBACK_MINIMUM = 15;

export function decisionTone(decision: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (['APPROVE', 'PUBLISH', 'approve', 'RESUME'].includes(decision)) return 'success';
  if (['REJECT', 'reject'].includes(decision)) return 'danger';
  if (['REQUEST_REVISION', 'ESCALATE_CULTURAL', 'PAUSE'].includes(decision)) return 'warning';
  return 'neutral';
}

/**
 * What a decision does, in the words a reviewer needs before choosing it.
 * Grounded in what the callables actually do for that kind of item.
 */
export function decisionHelp(desk: Desk, decision: string, item: ReviewRecord): string {
  const type = itemType(desk, item);
  const publishable = item.permissions?.publication === true;
  if (desk === 'recordings') {
    if (decision === 'approve') return item.publishConsent === true ? 'Attaches the recording to the word if it has none yet; otherwise keeps it as an additional take. A published recording is never replaced.' : 'Marks the recording approved without publishing it, because the speaker did not allow publication.';
    return 'Declines the recording with your note. The speaker sees why and can record it again.';
  }
  if (desk === 'names') return decision === 'approve' ? 'Adds the name to the published Kasem names and tells the person who asked.' : 'Declines the request with your note.';
  if (desk === 'adverts') {
    return ({
      APPROVE: 'Starts the advert running for its booked days and audience.',
      REJECT: 'Stops the advert and tells the advertiser why.',
      PAUSE: 'Stops the advert from showing until it is resumed.',
      RESUME: 'Lets a paused advert run again.',
    } as Record<string, string>)[decision] ?? '';
  }
  switch (decision) {
    case 'APPROVE':
      return type === 'assigned'
        ? 'Accepts this translation. The contributor is notified and earns points. It is not public until someone publishes it.'
        : `Accepts it as reviewed. The contributor is notified. ${publishable ? 'It becomes public only when it is published, as a separate step.' : 'The contributor did not allow publication, so it can only be kept for the archive.'}`;
    case 'PUBLISH':
      return type === 'assigned' || type === 'expression' || type === 'saying'
        ? 'Publishes it to Expressions, credited to the contributor. It is never filed as a dictionary word.'
        : type === 'word' || type === 'queue-answer'
          ? 'Publishes it to the Kasem dictionary as a word entry, credited to the contributor.'
          : 'Makes it public on Indigen World, credited to the contributor.';
    case 'ARCHIVE':
      return 'Keeps the approved work for review and research. It is never published, because the contributor did not allow it.';
    case 'REJECT':
      return type === 'assigned'
        ? 'Returns this version with your feedback. The contributor can revise it and resubmit; this decision stays on record.'
        : type === 'expression'
          ? 'Declines it with your feedback. The contributor can correct it once and send it again.'
          : 'Declines it with your feedback. The contributor sees your reason.';
    case 'REQUEST_REVISION':
      return 'Sends it back with your feedback so the contributor can change it and send it again.';
    case 'ESCALATE_CULTURAL':
      return 'Moves it to the escalated queue for a specialist — an elder, a teacher or a rights reviewer. The contributor is told it is with a specialist.';
    default:
      return '';
  }
}

/** Reusable starting points for feedback. Reviewers edit them to the specific case. */
export const FEEDBACK_SNIPPETS: Record<string, { label: string; text: string }[]> = {
  return: [
    { label: 'Spelling', text: 'Please check the spelling, including the Kasem letters (ɛ, ɔ, ŋ, ɩ, ʋ, ə). ' },
    { label: 'Meaning differs', text: 'The Kasem says something different from the English. Please translate the meaning rather than the words. ' },
    { label: 'Too formal', text: 'This reads as formal or written Kasem. Please give the everyday way people say it. ' },
    { label: 'Needs context', text: 'Please add when this is said and to whom, so the meaning can be checked. ' },
    { label: 'Not an everyday expression', text: 'This form is for everyday language. Restricted or sacred material cannot be accepted here. ' },
    { label: 'Already published', text: 'This is already published. Please check the dictionary or Expressions before sending it again. ' },
  ],
  approve: [
    { label: 'Natural', text: 'Natural and clear. Thank you. ' },
    { label: 'Good context', text: 'The usage note made the meaning easy to check. Thank you. ' },
  ],
};

/**
 * The quality checklist shown beside a decision. Each line is something a
 * reviewer can assess from the material on screen; answers are saved with
 * the decision as `scores` (1 meets, 0 does not), and "cannot judge" is not
 * recorded at all. It informs the decision; it never makes it.
 */
export const RUBRIC: Record<string, { id: string; label: string; hint: string }[]> = {
  translation: [
    { id: 'meaning', label: 'Carries the meaning of the source', hint: 'The sense, not word for word.' },
    { id: 'spelling', label: 'Spelled with standard Kasem letters', hint: 'ɛ, ɔ, ŋ, ɩ, ʋ, ə where they belong.' },
    { id: 'natural', label: 'Sounds natural and everyday', hint: 'How people actually say it.' },
    { id: 'context', label: 'Context is clear enough to check', hint: 'Who says it, to whom, when.' },
  ],
  word: [
    { id: 'meaning', label: 'Meaning is correct', hint: 'The English matches the Kasem.' },
    { id: 'spelling', label: 'Spelled with standard Kasem letters', hint: 'ɛ, ɔ, ŋ, ɩ, ʋ, ə where they belong.' },
    { id: 'example', label: 'Example uses the word correctly', hint: 'Skip when there is no example.' },
    { id: 'source', label: 'Source is credible', hint: 'Where the contributor learned it.' },
  ],
};

export function rubricFor(desk: Desk, row: ReviewRecord): { id: string; label: string; hint: string }[] {
  if (desk !== 'contributions') return [];
  const type = itemType(desk, row);
  if (type === 'assigned' || type === 'expression' || type === 'saying') return RUBRIC.translation;
  if (type === 'word' || type === 'queue-answer') return RUBRIC.word;
  return [];
}

export const TARGETS = { headword: 'Dictionary word', variant: 'Regional variant', expression: 'Expression', example: 'Example sentence', 'translation-pair': 'Translation pair', training: 'Training material (private)' };

export function targetProblem(target: string, item: ReviewRecord): string | null {
  if (target === 'training' && item.permissions?.aiTraining !== true) return 'Training permission was not granted.';
  if (target === 'example' && !item.kasemExample) return 'This answer has no Kasem example.';
  if (target === 'translation-pair' && (!item.kasemExample || !(item.englishExample || item.wordQueuePrompt?.sentence))) return 'An English sentence and its Kasem are required.';
  return null;
}

/**
 * What a dictionary answer becomes. An approval files it as a headword, as
 * the portal always has; a later publish keeps whatever the approval chose
 * (possibly in the admin console), instead of overwriting that choice.
 */
export function publishTarget(decision: string, item: ReviewRecord): { target: string; entryId: string } {
  const stored = typeof item.moderation?.publishAs === 'string' ? item.moderation.publishAs : '';
  if (decision === 'PUBLISH' && stored in TARGETS) {
    return { target: stored, entryId: typeof item.moderation?.linkedEntryId === 'string' ? item.moderation.linkedEntryId : '' };
  }
  return { target: 'headword', entryId: '' };
}

export interface DecisionOptions {
  /** The status the reviewer saw. The server refuses the decision if it has moved on. */
  expectedStatus?: string;
  /** The lifecycle version the reviewer saw, for the same reason. */
  expectedVersion?: number;
  scores?: Record<string, number>;
}

export function decisionRequest(desk: Desk, item: ReviewRecord, decision: string, feedback: string, target: string, entryId: string, options: DecisionOptions = {}) {
  if (!decisionsFor(desk, item).includes(decision)) throw new Error('This action is unavailable for the current status.');
  if (NEEDS_FEEDBACK.has(decision) && feedback.trim().length < FEEDBACK_MINIMUM) {
    throw new Error(`Explain the reason in at least ${FEEDBACK_MINIMUM} characters, so the contributor knows what to change.`);
  }
  if (desk === 'names') return { callable: 'decideKasemNameRequest', data: { requestId: item.id, decision, note: feedback.trim() } };
  if (desk === 'recordings') return { callable: 'decidePronunciationRecording', data: { recordingId: item.id, decision, note: feedback.trim() } };
  if (desk === 'adverts') return { callable: 'decideAdCampaign', data: { campaignId: item.id, decision, feedback: feedback.trim() } };
  const dictionary = item.collectionKind?.toLowerCase() === 'dictionary';
  if (dictionary && ['APPROVE', 'PUBLISH'].includes(decision)) {
    const problem = targetProblem(target, item);
    if (problem) throw new Error(problem);
    if (['variant', 'example'].includes(target) && !entryId.trim()) throw new Error('Choose the existing dictionary entry this refers to.');
  }
  return {
    callable: 'decideSubmission',
    data: {
      submissionId: item.id,
      decision,
      feedback: feedback.trim(),
      ...(dictionary && ['APPROVE', 'PUBLISH'].includes(decision) ? { publishAs: target, entryId: entryId.trim() } : {}),
      ...(options.expectedStatus ? { expectedStatus: options.expectedStatus } : {}),
      ...(typeof options.expectedVersion === 'number' ? { expectedVersion: options.expectedVersion } : {}),
      ...(options.scores && Object.keys(options.scores).length ? { scores: options.scores } : {}),
    },
  };
}

/** A conflict reported by the server, in words a reviewer can act on. */
export function decisionError(error: unknown): { message: string; conflict: boolean } {
  const record = (error && typeof error === 'object' ? error : {}) as { code?: unknown; message?: unknown };
  const code = typeof record.code === 'string' ? record.code.replace(/^functions\//, '') : '';
  const message = typeof record.message === 'string' ? record.message.replace(/^Firebase: /, '').trim() : '';
  if (code === 'aborted') return { message: message || 'Someone else decided this while you were reviewing it.', conflict: true };
  if (code === 'failed-precondition' && /already been decided|no longer|status/i.test(message)) return { message, conflict: true };
  if (code === 'permission-denied') return { message: message || 'Your account cannot record this decision.', conflict: false };
  if (code === 'unavailable' || code === 'deadline-exceeded' || message === 'internal' || !message) {
    return { message: 'The decision could not be sent. Check your connection and try again — nothing was recorded.', conflict: false };
  }
  return { message, conflict: false };
}

export const DIMENSIONS: Record<string, Record<string, string>> = {
  meaning: { 'cannot-judge': 'Cannot judge', faithful: 'Faithful', partial: 'Part missing', different: 'Different meaning' },
  grammar: { 'cannot-judge': 'Cannot judge', acceptable: 'Acceptable', unacceptable: 'Unacceptable', 'context-dependent': 'Depends on context' },
  naturalness: { 'cannot-judge': 'Cannot judge', natural: 'Natural', awkward: 'Awkward', unnatural: 'Unnatural' },
  contextFit: { 'cannot-judge': 'Cannot judge', fits: 'Fits', 'does-not-fit': 'Does not fit', 'context-missing': 'Need more context' },
};

export type SentenceDimension = 'meaning' | 'grammar' | 'naturalness' | 'contextFit';
export const SENTENCE_DIMENSIONS: { id: SentenceDimension; label: string }[] = [
  { id: 'meaning', label: 'Meaning' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'naturalness', label: 'Natural' },
  { id: 'contextFit', label: 'Fits the situation' },
];

export interface SentenceJudgment {
  meaning: string;
  grammar: string;
  naturalness: string;
  contextFit: string;
  explanation: string;
  annotationApproved: boolean;
}

export function emptySentenceJudgment(): SentenceJudgment {
  return { meaning: 'cannot-judge', grammar: 'cannot-judge', naturalness: 'cannot-judge', contextFit: 'cannot-judge', explanation: '', annotationApproved: false };
}

/** A judgment that marks a problem. decideGrammarNote requires an explanation for these. */
export function sentenceConcern(judgment: SentenceJudgment): boolean {
  return ['partial', 'different'].includes(judgment.meaning)
    || judgment.grammar === 'unacceptable'
    || ['awkward', 'unnatural'].includes(judgment.naturalness)
    || judgment.contextFit === 'does-not-fit';
}

/** What stops a sentence judgment from being recorded, with the field to focus. */
export function sentenceReviewProblems(judgments: SentenceJudgment[], competent: boolean): { field: string; message: string }[] {
  const problems = judgments.flatMap((judgment, index) => sentenceConcern(judgment) && judgment.explanation.trim().length < 10
    ? [{ field: `sentence-${index}-explanation`, message: 'Explain the concern in at least 10 characters.' }]
    : []);
  if (!competent) problems.push({ field: 'sentence-competent', message: 'Confirm you can judge this dialect, or leave it for another speaker.' });
  return problems;
}

/** What decideGrammarNote's resulting status means for the reviewer who just judged. */
export const SENTENCE_OUTCOMES: Record<string, string> = {
  submitted: 'Judgment recorded. It needs another independent judgment before it can be confirmed.',
  reviewed: 'Judgment recorded. It has enough judgments, but not every version was judged correct by two speakers, so it is not confirmed.',
  confirmed: 'Judgment recorded. Two independent speakers judged it correct, so it is confirmed. It appears publicly only if the contributor allowed publication.',
  disputed: 'Judgment recorded. Reviewers disagree, so it is marked for discussion.',
};

export function safeUrl(value: unknown): string | null {
  try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

/** Status labels a reviewer reads, for every collection's own vocabulary. */
export const STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  SUBMITTED: { label: 'Waiting for review', tone: 'info' },
  RESUBMITTED: { label: 'Resubmitted', tone: 'info' },
  UNDER_REVIEW: { label: 'Escalated', tone: 'violet' },
  APPROVED: { label: 'Approved', tone: 'success' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  NEEDS_REVISION: { label: 'Revision requested', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  ARCHIVED: { label: 'Kept, not published', tone: 'neutral' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  submitted: { label: 'Waiting for review', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Not accepted', tone: 'danger' },
  pending: { label: 'Waiting for review', tone: 'info' },
  disputed: { label: 'Reviewers disagree', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  reviewed: { label: 'Reviewed', tone: 'success' },
  'needs-permission': { label: 'Needs permission', tone: 'warning' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  IN_REVIEW: { label: 'Waiting for review', tone: 'info' },
  ACTIVE: { label: 'Running', tone: 'success' },
  PAUSED: { label: 'Paused', tone: 'neutral' },
};

export function statusLabel(status: string): { label: string; tone: Tone } {
  return STATUS_LABELS[status] ?? { label: status.replace(/_/g, ' ').toLowerCase(), tone: 'neutral' };
}
