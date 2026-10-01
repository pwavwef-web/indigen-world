/**
 * One vocabulary for everything a contributor has sent, whatever its kind.
 *
 * Four kinds of work reach the review team from this workspace, each stored
 * where its own backend keeps it:
 *
 *   assigned     an assignment item (contributorAccounts/{uid}/works/…/items)
 *                and its review rounds (submissions, read by authUid)
 *   expression   an everyday expression sent through submitExpression; the
 *                contributor reads its receipt in collectionContributions
 *   word         a dictionary word sent through submitCollectionContribution;
 *                also a receipt in collectionContributions
 *   recording    a pronunciation of a published word, in pronunciationRecordings
 *
 * The kinds keep their identity all the way through: an expression is
 * published to `expressionEntries`, a word to `dictionaryEntries`, a
 * recording onto the word it was made for, and an assigned translation is
 * filed as an expression. Nothing here changes a record; it only says, in one
 * set of words, where each piece of work stands and what can happen next.
 *
 * Pure — no Firebase — so the rules are tested and the preview can run on
 * sample data.
 */
import { itemStatus, parseDate, type Item, type SubmissionRound, type Work } from './model';
import type { IconName, Tone } from './components';

export type ContributionType = 'assigned' | 'expression' | 'word' | 'recording';

export const TYPE_META: Record<ContributionType, { label: string; plural: string; icon: IconName; destination: string }> = {
  assigned: { label: 'Assigned translation', plural: 'Assigned translations', icon: 'translate', destination: 'Published as an expression after review and publication.' },
  expression: { label: 'Everyday expression', plural: 'Everyday expressions', icon: 'expression', destination: 'Published to Expressions, never as a dictionary word.' },
  word: { label: 'Dictionary word', plural: 'Dictionary words', icon: 'word', destination: 'Published to the Kasem dictionary as a word entry.' },
  recording: { label: 'Pronunciation', plural: 'Pronunciations', icon: 'mic', destination: 'Attached to the dictionary word it was recorded for.' },
};

export type SubmissionState =
  | 'draft'
  | 'unsure'
  | 'awaiting_review'
  | 'specialist_review'
  | 'returned'
  | 'not_accepted'
  | 'approved'
  | 'published'
  | 'archived'
  | 'withdrawn';

/**
 * What each state means to the person who sent the work. Approval and
 * publication are separate states because they are separate decisions: an
 * approved expression is not public until a reviewer publishes it.
 */
export const STATE_META: Record<SubmissionState, { label: string; tone: Tone; description: string }> = {
  draft: { label: 'Draft', tone: 'neutral', description: 'Saved, but not sent for review. Only you can see it.' },
  unsure: { label: 'Flagged unsure', tone: 'violet', description: 'You marked this to come back to. Nothing was sent for review.' },
  awaiting_review: { label: 'Awaiting review', tone: 'info', description: 'With the review team. It is locked until a reviewer decides.' },
  specialist_review: { label: 'With a specialist', tone: 'info', description: 'Passed to a specialist reviewer for a second look.' },
  returned: { label: 'Returned for revision', tone: 'warning', description: 'A reviewer explained what to change. Revise it and send it again.' },
  not_accepted: { label: 'Not accepted', tone: 'danger', description: 'A reviewer did not accept it and gave a reason.' },
  approved: { label: 'Approved', tone: 'success', description: 'A reviewer accepted it. Publication is a separate step.' },
  published: { label: 'Published', tone: 'success', description: 'Public on Indigen World and credited to you.' },
  archived: { label: 'Kept, not published', tone: 'neutral', description: 'Approved and kept for review and research, because it was not cleared for publication.' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', description: 'No longer under review and not published anywhere.' },
};

export type NextAction = 'start' | 'continue' | 'revise' | 'correct' | 'record_again' | null;

export const ACTION_LABEL: Record<Exclude<NextAction, null>, string> = {
  start: 'Start',
  continue: 'Continue draft',
  revise: 'Revise and resubmit',
  correct: 'Correct and send again',
  record_again: 'Record again',
};

/** The contributor's own receipt for an expression or a word. */
export interface ReceiptRecord {
  id: string;
  kind: 'expression' | 'word';
  phrase: string;
  meaning: string;
  context: string;
  literalTranslation: string;
  expressionKind: string;
  partOfSpeech: string;
  dialect: string;
  sourceType: string;
  sourceDetail: string;
  speakerName: string;
  exampleKasem: string;
  exampleEnglish: string;
  status: string;
  reviewFeedback: string;
  publicationPermission: boolean;
  aiTraining: boolean;
  revisionOf: string;
  correctedBy: string;
  createdAt: string;
  reviewedAt: string;
  hasAudio: boolean;
}

/** A pronunciation the contributor recorded. */
export interface RecordingRecord {
  id: string;
  entryId: string;
  headword: string;
  meaning: string;
  status: string;
  outcome: string;
  decisionNote: string;
  publishConsent: boolean;
  durationMs: number;
  createdAt: string;
  decidedAt: string;
}

export interface SubmissionRow {
  key: string;
  type: ContributionType;
  /** The source or headline: English for an assigned item, Kasem for the rest. */
  title: string;
  titleLang?: string;
  /** The second line: the contributor's Kasem, or the English meaning. */
  subtitle: string;
  subtitleLang?: string;
  state: SubmissionState;
  /** Where it was filed: the assignment title, or the kind of contribution. */
  context: string;
  submittedAt: string;
  decidedAt: string;
  /** Latest activity, for sorting. */
  updatedAt: string;
  feedback: string;
  action: NextAction;
  /** How many review rounds this piece of work has been through. */
  rounds: number;
  work?: string;
  item?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

/** The review state of an assigned item, with approval and publication told apart by its latest round. */
export function assignedState(item: Item, latest?: SubmissionRound): SubmissionState {
  const status = itemStatus(item);
  switch (status) {
    case 'not_started':
    case 'draft':
      return 'draft';
    case 'unsure':
      return item.submissionId ? 'returned' : 'unsure';
    case 'returned':
      return 'returned';
    case 'approved':
      return latest?.status === 'PUBLISHED' ? 'published' : 'approved';
    case 'archived':
      return 'archived';
    case 'withdrawn':
      return 'withdrawn';
    default:
      return item.status === 'under_review' || latest?.status === 'UNDER_REVIEW' ? 'specialist_review' : 'awaiting_review';
  }
}

/** A receipt status, lowercased by the backend, in the shared vocabulary. */
export function receiptState(status: string): SubmissionState {
  switch (status.trim().toLowerCase()) {
    case 'approved': return 'approved';
    case 'published': return 'published';
    case 'archived': return 'archived';
    case 'withdrawn': return 'withdrawn';
    case 'rejected': return 'not_accepted';
    case 'needs_revision':
    case 'needs_info': return 'returned';
    case 'under_review':
    case 'in_review': return 'specialist_review';
    default: return 'awaiting_review';
  }
}

export function recordingState(status: string): SubmissionState {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'not_accepted';
  return 'awaiting_review';
}

function latestOf(dates: (string | undefined | null)[]): string {
  return dates.filter((value): value is string => Boolean(value && parseDate(value))).sort().at(-1) ?? '';
}

/** Rounds for one assigned item, oldest first. */
export function roundsFor(rounds: SubmissionRound[], work: string, item: string): SubmissionRound[] {
  return rounds.filter((round) => round.work === work && round.item === item)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export function assignedRows(works: Work[], items: Record<string, Item[]>, rounds: SubmissionRound[]): SubmissionRow[] {
  return works.flatMap((work) => (items[work.id] ?? []).flatMap((item): SubmissionRow[] => {
    const touched = Boolean(item.submissionId || item.unsure || item.translation.trim() || item.alternatives?.some((value) => value.trim()));
    if (!touched) return [];
    const history = roundsFor(rounds, work.id, item.id);
    const latest = history.find((round) => round.id === item.submissionId) ?? history.at(-1);
    const state = assignedState(item, latest);
    return [{
      key: `task.${work.id}.${item.id}`,
      type: 'assigned',
      title: item.expression,
      subtitle: item.translation,
      subtitleLang: 'xsm',
      state,
      context: work.title,
      submittedAt: latest?.createdAt || item.submittedAt || '',
      decidedAt: latest?.decidedAt || item.reviewedAt || '',
      updatedAt: latestOf([item.updatedAt, item.submittedAt, item.reviewedAt ?? '', latest?.decidedAt, latest?.createdAt]),
      feedback: item.feedback || latest?.feedback || '',
      action: state === 'returned' ? 'revise' : state === 'draft' || state === 'unsure' ? 'continue' : null,
      rounds: Math.max(history.length, item.submissionId ? 1 : 0),
      work: work.id,
      item: item.id,
    }];
  }));
}

export function receiptRows(receipts: ReceiptRecord[]): SubmissionRow[] {
  return receipts.map((receipt) => {
    const state = receiptState(receipt.status);
    const corrected = Boolean(receipt.correctedBy);
    return {
      key: `${receipt.kind}.${receipt.id}`,
      type: receipt.kind,
      title: receipt.phrase,
      titleLang: 'xsm',
      subtitle: receipt.meaning,
      state,
      context: TYPE_META[receipt.kind].label,
      submittedAt: receipt.createdAt,
      decidedAt: receipt.reviewedAt,
      updatedAt: latestOf([receipt.createdAt, receipt.reviewedAt]),
      feedback: receipt.reviewFeedback,
      // A declined expression can be corrected once; the correction is its own row.
      action: receipt.kind === 'expression' && state === 'not_accepted' && !corrected ? 'correct' : null,
      rounds: 1,
      id: receipt.id,
    };
  });
}

export function recordingRows(recordings: RecordingRecord[]): SubmissionRow[] {
  return recordings.map((recording) => {
    const state = recordingState(recording.status);
    return {
      key: `recording.${recording.id}`,
      type: 'recording',
      title: recording.headword,
      titleLang: 'xsm',
      subtitle: recording.meaning,
      state,
      context: TYPE_META.recording.label,
      submittedAt: recording.createdAt,
      decidedAt: recording.decidedAt,
      updatedAt: latestOf([recording.createdAt, recording.decidedAt]),
      feedback: recording.decisionNote,
      action: state === 'not_accepted' ? 'record_again' : null,
      rounds: 1,
      id: recording.id,
    };
  });
}

// ---------------------------------------------------------------------------
// Filters, summaries and revisions
// ---------------------------------------------------------------------------

export type StatusFilter = 'all' | 'drafts' | 'in_review' | 'action' | 'approved' | 'published' | 'not_accepted' | 'closed';

export const STATUS_FILTERS: { id: StatusFilter; label: string; states: SubmissionState[] | null }[] = [
  { id: 'all', label: 'All statuses', states: null },
  { id: 'drafts', label: 'Drafts and flagged', states: ['draft', 'unsure'] },
  { id: 'in_review', label: 'Awaiting review', states: ['awaiting_review', 'specialist_review'] },
  { id: 'action', label: 'Needs your action', states: ['returned'] },
  { id: 'approved', label: 'Approved', states: ['approved'] },
  { id: 'published', label: 'Published', states: ['published'] },
  { id: 'not_accepted', label: 'Not accepted', states: ['not_accepted'] },
  { id: 'closed', label: 'Kept or withdrawn', states: ['archived', 'withdrawn'] },
];

export type TypeFilter = 'all' | ContributionType;
export type SortOrder = 'recent' | 'oldest';

/** Rows the contributor must act on: a request to revise, or a decline they can correct. */
export function needsAction(row: SubmissionRow): boolean {
  return row.action === 'revise' || row.action === 'correct' || row.action === 'record_again';
}

export function filterRows(rows: SubmissionRow[], filters: { status: StatusFilter; type: TypeFilter; query: string }): SubmissionRow[] {
  const states = STATUS_FILTERS.find((entry) => entry.id === filters.status)?.states ?? null;
  const needle = filters.query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (filters.status === 'action' ? !needsAction(row) : states && !states.includes(row.state)) return false;
    if (filters.type !== 'all' && row.type !== filters.type) return false;
    if (!needle) return true;
    return [row.title, row.subtitle, row.context, row.feedback].join(' ').toLocaleLowerCase().includes(needle);
  });
}

/** Newest activity first, or oldest submission first; ties broken by key so the order never shuffles. */
export function sortRows(rows: SubmissionRow[], order: SortOrder): SubmissionRow[] {
  return [...rows].sort((a, b) => {
    const left = order === 'recent' ? b.updatedAt : a.submittedAt || a.updatedAt;
    const right = order === 'recent' ? a.updatedAt : b.submittedAt || b.updatedAt;
    return left.localeCompare(right) || a.key.localeCompare(b.key);
  });
}

export interface Summary {
  total: number;
  drafts: number;
  inReview: number;
  action: number;
  approved: number;
  published: number;
  notAccepted: number;
}

/** Counts for the overview. Every row is counted once, in the bucket its state belongs to. */
export function summarise(rows: SubmissionRow[]): Summary {
  const summary: Summary = { total: 0, drafts: 0, inReview: 0, action: 0, approved: 0, published: 0, notAccepted: 0 };
  for (const row of rows) {
    summary.total += 1;
    if (needsAction(row)) summary.action += 1;
    else if (row.state === 'draft' || row.state === 'unsure') summary.drafts += 1;
    else if (row.state === 'awaiting_review' || row.state === 'specialist_review') summary.inReview += 1;
    else if (row.state === 'approved') summary.approved += 1;
    else if (row.state === 'published') summary.published += 1;
    else if (row.state === 'not_accepted') summary.notAccepted += 1;
  }
  return summary;
}

/** Revision work, most recently decided first. */
export function revisionRows(rows: SubmissionRow[]): SubmissionRow[] {
  return rows.filter(needsAction).sort((a, b) => (b.decidedAt || b.updatedAt).localeCompare(a.decidedAt || a.updatedAt) || a.key.localeCompare(b.key));
}

/** Rows that have actually been sent, for counting "what you have submitted". */
export function sentRows(rows: SubmissionRow[]): SubmissionRow[] {
  return rows.filter((row) => row.state !== 'draft' && row.state !== 'unsure');
}

export function parseRowKey(key: string): { type: ContributionType; work?: string; item?: string; id?: string } | null {
  const [kind, first, second] = key.split('.');
  if (kind === 'task' && first && second) return { type: 'assigned', work: first, item: second };
  if ((kind === 'expression' || kind === 'word' || kind === 'recording') && first && !second) return { type: kind, id: first };
  return null;
}
