/**
 * The contributor workspace's vocabulary: what an expression's state is, how
 * the dashboard counts, and how an error is explained. Pure — no Firebase —
 * so the rules can be tested and the preview can run on sample data.
 *
 * ── Counting rules (the Overview metrics) ──────────────────────────────────
 * Each assignment item has at most one *current* review round: its
 * `submissionId` points at the latest submission, and the backend projects
 * that round's outcome onto `status`.
 *   submitted        every item with a submissionId — sent to the Review Desk
 *                    at least once, whatever happened next
 *   awaiting review  submitted, and the current round has no decision yet
 *   approved         the current round was approved (status `verified`)
 *   returned         the current round was rejected or sent back for
 *                    revision, and has not been resubmitted yet
 * So submitted = awaiting + approved + returned (+ archived/withdrawn, shown
 * separately when present). "Submitted" never means "approved".
 */

export interface Item {
  id: string;
  expression: string;
  translation: string;
  alternatives: string[];
  context?: string;
  revision: number;
  status: string;
  unsure?: boolean;
  submissionId?: string;
  feedback?: string;
  reviewedAt?: string | null;
  updatedAt?: string;
  skippedAt?: string;
}

export interface Work {
  id: string;
  title: string;
  createdAt: string;
  instructions?: string;
  dialect?: string;
  tone?: string;
  deadline?: string;
  helpContact?: string;
}

/** One review round the contributor sent, read from their own `submissions`. */
export interface SubmissionRound {
  id: string;
  work: string;
  item: string;
  expression: string;
  status: string;
  createdAt: string;
  decidedAt: string;
  feedback: string;
  revisionOf: string;
}

export type Status = 'Not started' | 'Drafts' | 'Submitted' | 'Needs revision' | 'I’m not sure';

/** The filters the assignment workspace has always used. */
export function contributionState(item: Item): Status {
  if (item.unsure) return 'I’m not sure';
  if (['needs_revision', 'rejected'].includes(item.status)) return 'Needs revision';
  if (item.submissionId) return 'Submitted';
  return item.translation.trim() || item.alternatives?.some((value) => value.trim()) ? 'Drafts' : 'Not started';
}

export function expressionView(item: Item): 'untranslated' | 'translated' | 'reviewed' {
  if (item.reviewedAt || ['verified', 'rejected', 'needs_revision', 'archived'].includes(item.status)) return 'reviewed';
  return item.translation.trim() || item.submissionId ? 'translated' : 'untranslated';
}

/** Progress numerator: sent for review and not returned (awaiting or approved). */
export function submittedCount(items: Item[]): number {
  return items.filter((item) => Boolean(item.submissionId) && !['rejected', 'needs_revision'].includes(item.status)).length;
}

/** Returned work first, then untouched expressions, then anything unfinished. */
export function nextContribution(items: Item[]): Item | undefined {
  return items.find((item) => ['rejected', 'needs_revision'].includes(item.status))
    ?? items.find((item) => !item.submissionId && !item.unsure)
    ?? items.find((item) => !item.submissionId);
}

export type ItemStatus =
  | 'not_started'
  | 'draft'
  | 'unsure'
  | 'awaiting_review'
  | 'approved'
  | 'returned'
  | 'archived'
  | 'withdrawn';

const RETURNED = new Set(['rejected', 'needs_revision']);

/** The detailed status the dashboard, lists and filters share. */
export function itemStatus(item: Item): ItemStatus {
  if (item.submissionId) {
    if (item.status === 'verified') return 'approved';
    if (RETURNED.has(item.status)) return item.unsure ? 'unsure' : 'returned';
    if (item.status === 'archived') return 'archived';
    if (item.status === 'withdrawn') return 'withdrawn';
    return 'awaiting_review';
  }
  if (item.unsure) return 'unsure';
  return item.translation.trim() || item.alternatives?.some((value) => value.trim()) ? 'draft' : 'not_started';
}

export const STATUS_META: Record<ItemStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet'; description: string }> = {
  not_started: { label: 'Not started', tone: 'neutral', description: 'Nothing written yet.' },
  draft: { label: 'Draft', tone: 'info', description: 'Saved privately. Not sent for review.' },
  unsure: { label: 'Flagged unsure', tone: 'violet', description: 'You flagged this to come back to. Nothing was sent.' },
  awaiting_review: { label: 'Awaiting review', tone: 'info', description: 'With the Review Desk. Locked until a reviewer decides.' },
  approved: { label: 'Approved', tone: 'success', description: 'Accepted by a reviewer.' },
  returned: { label: 'Returned', tone: 'warning', description: 'A reviewer sent this back with feedback. Revise and resubmit.' },
  archived: { label: 'Archived', tone: 'neutral', description: 'Kept on record by reviewers and not published.' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', description: 'No longer under review.' },
};

export interface Metrics {
  total: number;
  submitted: number;
  awaiting: number;
  approved: number;
  returned: number;
  other: number;
  drafts: number;
  unsure: number;
  notStarted: number;
}

/**
 * Every item lands in exactly one progress bucket, so the buckets add up to
 * the total; `submitted` is counted alongside them. A returned expression the
 * contributor has flagged unsure is still returned work.
 */
export function metricsFor(items: Item[]): Metrics {
  const metrics: Metrics = { total: items.length, submitted: 0, awaiting: 0, approved: 0, returned: 0, other: 0, drafts: 0, unsure: 0, notStarted: 0 };
  for (const item of items) {
    if (item.submissionId) metrics.submitted += 1;
    if (item.submissionId && RETURNED.has(item.status)) {
      metrics.returned += 1;
      continue;
    }
    const status = itemStatus(item);
    if (status === 'awaiting_review') metrics.awaiting += 1;
    else if (status === 'approved') metrics.approved += 1;
    else if (status === 'archived' || status === 'withdrawn') metrics.other += 1;
    else if (status === 'draft') metrics.drafts += 1;
    else if (status === 'unsure') metrics.unsure += 1;
    else metrics.notStarted += 1;
  }
  return metrics;
}

export type WorkState = 'not_started' | 'in_progress' | 'needs_attention' | 'awaiting_review' | 'complete' | 'empty';

export function workState(items: Item[]): WorkState {
  if (items.length === 0) return 'empty';
  const metrics = metricsFor(items);
  if (metrics.returned > 0) return 'needs_attention';
  const open = metrics.drafts + metrics.notStarted + metrics.unsure;
  if (open === 0) return metrics.awaiting > 0 ? 'awaiting_review' : 'complete';
  if (metrics.submitted === 0 && metrics.drafts === 0 && metrics.unsure === 0) return 'not_started';
  return 'in_progress';
}

export const WORK_STATE_META: Record<WorkState, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  empty: { label: 'No expressions', tone: 'neutral' },
  not_started: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  needs_attention: { label: 'Needs attention', tone: 'warning' },
  awaiting_review: { label: 'Awaiting review', tone: 'info' },
  complete: { label: 'Complete', tone: 'success' },
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined, withYear = false): string {
  const date = parseDate(value);
  if (!date) return value ?? '';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: withYear || date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function relativeTime(value: string | null | undefined, now = Date.now()): string {
  const date = parseDate(value);
  if (!date) return '';
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(value);
}

/**
 * The due-date line. Deadlines are guidance: the portal never locks an
 * assignment when one passes (docs/product/contributor-portal.md).
 */
export function dueInfo(deadline: string | undefined, complete: boolean, now = new Date()): { label: string; tone: 'neutral' | 'info' | 'warning' | 'danger' } | null {
  if (!deadline) return null;
  const date = parseDate(deadline);
  if (!date) return { label: `Due ${deadline}`, tone: 'neutral' };
  if (complete) return { label: `Due ${formatDate(deadline)}`, tone: 'neutral' };
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (days < 0) return { label: `Due ${formatDate(deadline)} · ${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'danger' };
  if (days === 0) return { label: `Due today`, tone: 'warning' };
  if (days <= 3) return { label: `Due ${formatDate(deadline)} · in ${days} day${days === 1 ? '' : 's'}`, tone: 'warning' };
  return { label: `Due ${formatDate(deadline)} · in ${days} days`, tone: 'info' };
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export type ActivityKind = 'submitted' | 'resubmitted' | 'approved' | 'returned' | 'in_review' | 'archived' | 'assigned' | 'payment';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string;
  work?: string;
  item?: string;
  link?: string;
}

export interface PaymentNotice {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

const DECISION_KIND: Record<string, ActivityKind> = {
  APPROVED: 'approved',
  PUBLISHED: 'approved',
  REJECTED: 'returned',
  NEEDS_REVISION: 'returned',
  UNDER_REVIEW: 'in_review',
  ARCHIVED: 'archived',
};

/**
 * The contributor's own timeline: every review round they sent, every
 * decision on it, every assignment, and payment verification updates. Built
 * from records the portal already reads; nothing is inferred.
 */
export function activityFrom(rounds: SubmissionRound[], works: Work[], payments: PaymentNotice[] = []): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const round of rounds) {
    if (round.createdAt) {
      events.push({
        id: `${round.id}:sent`, kind: round.revisionOf ? 'resubmitted' : 'submitted', at: round.createdAt,
        title: `${round.revisionOf ? 'You resubmitted' : 'You sent'} “${round.expression}” for review`, detail: '',
        work: round.work, item: round.item,
      });
    }
    const kind = DECISION_KIND[round.status];
    if (kind && round.decidedAt) {
      events.push({
        id: `${round.id}:${round.status}`, kind, at: round.decidedAt,
        title: kind === 'approved' ? `“${round.expression}” was approved`
          : kind === 'returned' ? `“${round.expression}” was returned`
            : kind === 'in_review' ? `“${round.expression}” is with a specialist reviewer`
              : `“${round.expression}” was archived`,
        detail: kind === 'returned' ? round.feedback : '',
        work: round.work, item: round.item,
      });
    }
  }
  for (const work of works) {
    if (work.createdAt) events.push({ id: `work:${work.id}`, kind: 'assigned', at: work.createdAt, title: `New assignment: ${work.title}`, detail: '', work: work.id });
  }
  for (const notice of payments) {
    events.push({ id: `payment:${notice.id}`, kind: 'payment', at: notice.createdAt, title: notice.title, detail: notice.body, link: '/contributor/account/payments' });
  }
  return events.filter((event) => parseDate(event.at)).sort((a, b) => b.at.localeCompare(a.at));
}

export function groupByDay(events: ActivityEvent[], now = new Date()): { label: string; events: ActivityEvent[] }[] {
  const groups = new Map<string, ActivityEvent[]>();
  const key = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
  const today = key(now);
  const yesterday = key(new Date(now.getTime() - 86_400_000));
  for (const event of events) {
    const date = parseDate(event.at)!;
    const label = key(date) === today ? 'Today' : key(date) === yesterday ? 'Yesterday' : formatDate(event.at, true);
    groups.set(label, [...(groups.get(label) ?? []), event]);
  }
  return [...groups.entries()].map(([label, grouped]) => ({ label, events: grouped }));
}

// ---------------------------------------------------------------------------
// Errors a contributor can act on
// ---------------------------------------------------------------------------

export interface FriendlyError {
  message: string;
  reference: string | null;
  code: string;
}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/wrong-password': 'That password is not correct.',
  'auth/invalid-credential': 'That email and password do not match.',
  'auth/invalid-login-credentials': 'That email and password do not match.',
  'auth/user-disabled': 'This account is not active. Contact the team.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'You appear to be offline. Check your connection and try again.',
  'auth/requires-recent-login': 'For your security, sign in again before changing this.',
  'auth/weak-password': 'Choose a stronger password of at least 8 characters.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/invalid-action-code': 'This link was already used or is not valid. Request a new one.',
  'storage/unauthorized': 'The file was refused. Upload a PDF, JPEG or PNG between 1 KB and 10 MB.',
  'storage/canceled': 'The upload was cancelled.',
  'storage/retry-limit-exceeded': 'The upload kept failing. Check your connection and try again.',
  'storage/quota-exceeded': 'The upload could not be stored right now. Try again later.',
};

/**
 * Turns anything thrown by Firebase into a sentence for the contributor.
 *
 * The SDK reports an unreachable callable — offline, or a function that has
 * not been deployed — as `functions/internal` with the bare message
 * "internal". That exact message is what the payment profile showed in
 * September 2026, so it is never shown again: it becomes an explanation of
 * what could not be reached. Server failures that carry a `reference` (see
 * `guarded` in services/functions/src/contributor-common.ts) keep their
 * message, which already names the reference.
 */
export function friendlyError(error: unknown, what: string): FriendlyError {
  const record = (error && typeof error === 'object' ? error : {}) as { code?: unknown; message?: unknown; details?: unknown };
  const rawCode = typeof record.code === 'string' ? record.code : '';
  const code = rawCode.replace(/^functions\//, '');
  const message = typeof record.message === 'string' ? record.message.replace(/^Firebase: /, '').trim() : '';
  const details = record.details && typeof record.details === 'object' ? record.details as Record<string, unknown> : null;
  const reference = typeof details?.reference === 'string' ? details.reference : null;
  if (AUTH_MESSAGES[rawCode]) return { message: AUTH_MESSAGES[rawCode], reference, code: rawCode };
  if (reference) return { message, reference, code };
  const bare = !message || message === code || message === 'internal' || /^\w+(-\w+)*$/.test(message);
  switch (code) {
    case 'internal':
    case 'not-found':
      if (bare) {
        return {
          message: `${what} could not be reached. Check your connection and try again. If it keeps happening, the service may not be available yet: use “Report a problem” so the team can check.`,
          reference: null, code,
        };
      }
      return { message, reference, code };
    case 'unavailable':
    case 'deadline-exceeded':
      return { message: bare ? `${what} did not respond in time. Check your connection and try again.` : message, reference, code };
    case 'unauthenticated':
      return { message: 'Your session has ended. Sign in again to continue.', reference, code };
    case 'permission-denied':
      return { message: bare ? 'Your account does not have access to this.' : message, reference, code };
    default:
      return { message: message && !bare ? message : `${what} failed. Please try again.`, reference, code };
  }
}

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

export function initials(name: string): string {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'IW';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / 104857.6) / 10} MB`;
}
