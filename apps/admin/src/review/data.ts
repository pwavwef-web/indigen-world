import { collection, doc, getDoc, getDocs, limit, limitToLast, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import type { Submission } from '@indigen-world/contracts/creator-models';
import { app, db, functions } from '../firebase';

/**
 * The review desk reads `submissions` directly (Security Rules let staff read
 * them) and decides through the `decideSubmission` callable, which owns every
 * transition, publication and audit record. Decisions carry the status and
 * version the reviewer was looking at, so a decision made on a stale screen
 * is refused rather than applied.
 */

export type ReviewScope = 'pending' | 'approved' | 'published' | 'revision' | 'rejected' | 'archived';

export const SCOPE_STATUSES: Record<ReviewScope, string[]> = {
  pending: ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'],
  approved: ['APPROVED'],
  published: ['PUBLISHED'],
  revision: ['NEEDS_REVISION'],
  rejected: ['REJECTED'],
  archived: ['ARCHIVED'],
};

export const SCOPE_LABEL: Record<ReviewScope, string> = {
  pending: 'Pending',
  approved: 'Approved',
  published: 'Published',
  revision: 'Needs revision',
  rejected: 'Rejected',
  archived: 'Archived',
};

/** How many records one scope loads. Pending is read oldest first; settled scopes newest first. */
export const SCOPE_PAGE = 250;

export type ReviewSubmission = Submission & {
  wordQueueId?: string;
  contributorPortal?: { contributorId?: string; work?: string; item?: string };
  moderation?: Submission['moderation'] & { publishAs?: string };
};

export async function fetchScope(scope: ReviewScope): Promise<{ rows: ReviewSubmission[]; capped: boolean }> {
  const base = collection(db, 'submissions');
  const statuses = SCOPE_STATUSES[scope];
  const snap = await getDocs(scope === 'pending'
    ? query(base, where('status', 'in', statuses), orderBy('lifecycle.createdAt', 'asc'), limit(SCOPE_PAGE))
    : query(base, where('status', 'in', statuses), orderBy('lifecycle.createdAt', 'asc'), limitToLast(SCOPE_PAGE)));
  const rows = snap.docs.map((entry) => ({ ...(entry.data() as ReviewSubmission), id: entry.id }));
  if (scope !== 'pending') rows.reverse();
  return { rows, capped: snap.size >= SCOPE_PAGE };
}

export interface DecisionInput {
  submission: ReviewSubmission;
  decision: 'APPROVE' | 'REQUEST_REVISION' | 'REJECT' | 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE';
  feedback: string;
  publishAs?: string;
  entryId?: string;
}

const decide = httpsCallable<Record<string, unknown>, unknown>(functions, 'decideSubmission');

export async function decideReview(input: DecisionInput): Promise<void> {
  await decide({
    submissionId: input.submission.id,
    decision: input.decision,
    feedback: input.feedback,
    scores: {},
    expectedStatus: input.submission.status,
    expectedVersion: input.submission.lifecycle?.version,
    ...(input.publishAs ? { publishAs: input.publishAs } : {}),
    ...(input.entryId ? { entryId: input.entryId } : {}),
  });
}

/* -- What a record is ------------------------------------------------------------------ */

export function isExpression(s: ReviewSubmission): boolean {
  return s.collectionKind === 'expressions' || Boolean(s.expression);
}

export function isQueueAnswer(s: ReviewSubmission): boolean {
  return Boolean(s.wordQueueId);
}

export function isCollectionContribution(s: ReviewSubmission): boolean {
  return s.collectionContribution?.collection === 'collectionContributions' || Boolean(s.collectionKind);
}

/** A word-queue answer or non-Collection work can be returned for revision; other Collection work cannot. */
export function canRequestRevision(s: ReviewSubmission): boolean {
  return !isCollectionContribution(s) || isQueueAnswer(s);
}

export type Category = 'expression' | 'invited' | 'dictionary' | 'queue' | 'audiobooks' | 'music' | 'video' | 'literature' | 'creator';

export function categoryOf(s: ReviewSubmission): Category {
  if (isQueueAnswer(s)) return 'queue';
  if (s.contributorPortal?.contributorId) return 'invited';
  if (isExpression(s)) return 'expression';
  if (s.collectionKind === 'dictionary') return 'dictionary';
  if (s.collectionKind === 'audiobooks') return 'audiobooks';
  if (s.collectionKind === 'music') return 'music';
  if (s.collectionKind === 'video') return 'video';
  if (s.collectionKind === 'literature') return 'literature';
  return 'creator';
}

export const CATEGORY_META: Record<Category, { label: string; icon: string }> = {
  expression: { label: 'Expression', icon: 'message' },
  invited: { label: 'Invited expression', icon: 'translation' },
  dictionary: { label: 'Dictionary word', icon: 'book' },
  queue: { label: 'Word queue answer', icon: 'inbox' },
  audiobooks: { label: 'Audiobook', icon: 'headphones' },
  music: { label: 'Music', icon: 'music' },
  video: { label: 'Video', icon: 'video' },
  literature: { label: 'Literature', icon: 'doc' },
  creator: { label: 'Creator work', icon: 'pen' },
};

export function titleOf(s: ReviewSubmission): string {
  return isExpression(s) ? (s.expression?.phrase ?? s.body ?? s.title) : s.title || 'Untitled submission';
}

export const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Pending review',
  RESUBMITTED: 'Resubmitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  NEEDS_REVISION: 'Needs revision',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
  WITHDRAWN: 'Withdrawn',
  SCHEDULED: 'Scheduled',
  DRAFT: 'Draft',
};

export function statusTone(status: string): 'warning' | 'info' | 'success' | 'danger' | 'neutral' | 'violet' {
  if (['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'].includes(status)) return 'warning';
  if (status === 'APPROVED') return 'info';
  if (status === 'PUBLISHED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'NEEDS_REVISION') return 'violet';
  return 'neutral';
}

/**
 * Consent, kept as four different answers: a question never put to the
 * contributor is not the same as a "no", and neither is the same as silence.
 */
export type ConsentState = 'granted' | 'not-granted' | 'not-declared' | 'not-asked' | 'declared' | 'none-declared';

export function publicationConsent(s: ReviewSubmission): ConsentState {
  const value = s.permissions?.publication;
  return value === true ? 'granted' : value === false ? 'not-granted' : 'not-declared';
}

export function trainingConsent(s: ReviewSubmission): ConsentState {
  const value = s.permissions?.aiTraining;
  return value === true ? 'granted' : value === false ? 'not-granted' : 'not-declared';
}

export function thirdPartyDisclosure(s: ReviewSubmission): ConsentState {
  if (!s.disclosures || s.disclosures.usesThirdPartyMaterial == null) return 'not-asked';
  return s.disclosures.usesThirdPartyMaterial ? 'declared' : 'none-declared';
}

export function minorsDisclosure(s: ReviewSubmission): ConsentState | 'yes' | 'no' {
  const value = s.disclosures?.involvesMinors;
  return value == null ? 'not-asked' : value ? 'yes' : 'no';
}

/* -- People and media -------------------------------------------------------------------- */

const names = new Map<string, Promise<{ name: string; handle: string } | null>>();

/** The contributor's public community name, when they have one. */
export function contributorName(uid: string): Promise<{ name: string; handle: string } | null> {
  if (!names.has(uid)) {
    names.set(uid, getDoc(doc(db, 'communityProfiles', uid)).then((snap) => {
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      return { name: String(data.displayName ?? ''), handle: String(data.username ?? '') };
    }).catch(() => null));
  }
  return names.get(uid)!;
}

const storage = getStorage(app);

export async function mediaUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

/** What a word-queue answer can become. Mirrors `PUBLISH_AS` in services/functions/src/language-loop.ts. */
export const PUBLISH_AS_OPTIONS: { value: string; label: string }[] = [
  { value: 'headword', label: 'A dictionary word' },
  { value: 'variant', label: 'A regional variant' },
  { value: 'expression', label: 'An expression' },
  { value: 'example', label: 'An example sentence' },
  { value: 'translation-pair', label: 'A translation pair' },
  { value: 'training', label: 'Training material (not published)' },
];
