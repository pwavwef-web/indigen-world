import type { AnswerValue, Answers, Issue, ResponseStatus, WindowReason } from '@indigen-world/contracts/forms';
import type { AvailableForm, HistoryEvent } from '@indigen-world/contracts/forms-api';

/*
 * Pure wording and decisions for the contributor's Indigen Forms screens.
 * Nothing here reads the network or the DOM, so scripts/workflows.test.mjs
 * loads this file as it ships. Contributors' answers are compared and passed
 * through exactly as typed: no trimming, case folding or normalisation.
 */

export type FormTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

/** Badge tone for each response status (labels come from the contract's RESPONSE_STATUS_LABELS). */
export const STATUS_TONE: Record<ResponseStatus, FormTone> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'violet',
  changes_requested: 'warning',
  approved: 'success',
  rejected: 'danger',
};

/** What a status means for the contributor, in plain words. */
export function statusMeaning(status: ResponseStatus, reviewRequired = true): string {
  switch (status) {
    case 'draft': return 'Not sent yet. Only you can see it. Continue it and submit it when you are ready.';
    case 'submitted': return reviewRequired
      ? 'Received. It is waiting for a reviewer to look at it.'
      : 'Received. This form does not need review, so there is nothing more to do.';
    case 'under_review': return 'A reviewer is looking at it now.';
    case 'changes_requested': return 'A reviewer asked for changes. Read the feedback, revise your answers and submit again.';
    case 'approved': return 'A reviewer approved it. Thank you.';
    case 'rejected': return 'A reviewer decided not to accept it. The feedback explains why.';
    default: return '';
  }
}

/** Notices for a form that is not taking submissions now. */
export function windowNotice(reason: WindowReason | null): { title: string; tone: 'info' | 'warning' | 'danger' } | null {
  switch (reason) {
    case 'paused': return { title: 'This form is paused', tone: 'warning' };
    case 'closed': return { title: 'This form is closed', tone: 'danger' };
    case 'past_deadline': return { title: 'The deadline has passed', tone: 'danger' };
    case 'archived': return { title: 'This form has been archived', tone: 'danger' };
    case 'not_published': return { title: 'This form is not published', tone: 'danger' };
    case 'retired': return { title: 'This version of the form was retired', tone: 'warning' };
    case 'not_yet_open': return { title: 'This form is not open yet', tone: 'info' };
    default: return null;
  }
}

const DAY = 86_400_000;
function startOfDay(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function shortDate(time: number, now: number): string {
  const date = new Date(time);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: date.getFullYear() !== new Date(now).getFullYear() ? 'numeric' : undefined }).format(date);
}
function clock(time: number): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(time));
}

/** "Closes in 3 days (28 Oct)", "Closes today at 17:00", "Closed on 20 Oct", "Opens tomorrow (26 Oct)". */
export function scheduleText(input: { opensAt: string | null; closesAt: string | null }, now = Date.now()): { label: string; tone: 'neutral' | 'info' | 'warning' | 'danger' } | null {
  const opens = input.opensAt ? Date.parse(input.opensAt) : NaN;
  const closes = input.closesAt ? Date.parse(input.closesAt) : NaN;
  if (Number.isFinite(opens) && now < opens) {
    const days = Math.round((startOfDay(opens) - startOfDay(now)) / DAY);
    if (days === 0) return { label: `Opens today at ${clock(opens)}`, tone: 'info' };
    if (days === 1) return { label: `Opens tomorrow (${shortDate(opens, now)})`, tone: 'info' };
    return { label: `Opens in ${days} days (${shortDate(opens, now)})`, tone: 'info' };
  }
  if (!Number.isFinite(closes)) return null;
  if (now >= closes) return { label: `Closed on ${shortDate(closes, now)}`, tone: 'danger' };
  const days = Math.round((startOfDay(closes) - startOfDay(now)) / DAY);
  if (days === 0) return { label: `Closes today at ${clock(closes)}`, tone: 'danger' };
  if (days === 1) return { label: `Closes tomorrow at ${clock(closes)}`, tone: 'warning' };
  if (days <= 7) return { label: `Closes in ${days} days (${shortDate(closes, now)})`, tone: 'warning' };
  return { label: `Closes ${shortDate(closes, now)}`, tone: 'neutral' };
}

/** "About 5 minutes", "About 1 hour 30 minutes". */
export function estimatedTime(minutes: number | null | undefined): string {
  if (!minutes || minutes < 1) return '';
  if (minutes < 60) return `About ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `About ${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} minute${rest === 1 ? '' : 's'}` : ''}`;
}

export type CardAction =
  | { kind: 'revise'; responseId: string | null }
  | { kind: 'continue'; responseId: string }
  | { kind: 'start' }
  | { kind: 'start_another'; latestResponseId: string | null }
  | { kind: 'view'; responseId: string }
  | { kind: 'none' };

/**
 * The main thing a contributor can do with a listed form, in priority order:
 * answer the reviewer, finish a draft, start, start another, or look at what
 * was sent.
 */
export function cardAction(form: AvailableForm): CardAction {
  const mine = form.mine;
  if (mine.needsChanges > 0) return { kind: 'revise', responseId: mine.latestStatus === 'changes_requested' ? mine.latestResponseId : null };
  if (mine.draftId) return { kind: 'continue', responseId: mine.draftId };
  const startable = form.open || form.closedReason === 'not_yet_open';
  if (mine.submitted > 0) {
    if (form.policy === 'multiple' && startable) return { kind: 'start_another', latestResponseId: mine.latestResponseId };
    return mine.latestResponseId ? { kind: 'view', responseId: mine.latestResponseId } : { kind: 'none' };
  }
  return startable ? { kind: 'start' } : { kind: 'none' };
}

/** The contributor's own state for a listed form, for its badge. */
export function cardStatus(form: AvailableForm): { label: string; tone: FormTone } | null {
  const mine = form.mine;
  if (mine.needsChanges > 0) return { label: mine.needsChanges === 1 ? 'Changes requested' : `${mine.needsChanges} need changes`, tone: 'warning' };
  if (mine.draftId) return { label: 'Draft in progress', tone: 'neutral' };
  if (mine.submitted > 0) return { label: mine.submitted === 1 ? 'Submitted' : `Submitted ${mine.submitted} times`, tone: 'success' };
  return null;
}

const HISTORY_LABELS: Record<HistoryEvent['type'], string> = {
  created: 'Draft started',
  submitted: 'Submitted',
  resubmitted: 'Submitted again',
  review_started: 'Review started',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Not accepted',
  points_awarded: 'Points added',
  points_failed: 'Points could not be added yet',
  routed: 'Passed on for further review',
  routing_blocked: 'Not passed on',
  version_moved: 'Moved to a newer version of the form',
  attachment_link: 'A file was opened',
};
export function historyLabel(type: HistoryEvent['type']): string {
  return HISTORY_LABELS[type] ?? 'Update';
}

/** Contributors see who acted by role only, never a reviewer's name. */
export function actorLabel(role: HistoryEvent['actorRole']): string {
  if (role === 'contributor') return 'You';
  if (role === 'reviewer') return 'Indigen World reviewer';
  if (role === 'admin') return 'Indigen World administrator';
  return 'Indigen World';
}

/** Answers as stored; empty values (missing, null, '', []) count as the same. Text is compared exactly. */
export function sameValue(a: AnswerValue | undefined, b: AnswerValue | undefined): boolean {
  const empty = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty(a) && empty(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Problems found when the contributor last pressed Next or Submit, minus the
 * ones whose question has been changed since. Problems only ever disappear
 * while typing; new ones are found on the next Next or Submit.
 */
export function openIssues(found: { issues: Issue[]; answers: Answers } | null, answers: Answers): Issue[] {
  if (!found) return [];
  return found.issues.filter((issue) => {
    const top = String(issue.path ?? '').split('.')[0];
    if (!top) return true;
    return sameValue(answers[top], found.answers[top]);
  });
}

/**
 * One submit request per payload. A retry of the same answers (a timeout, a
 * double click, a reload) carries the same request id, so the server replays
 * its first answer instead of creating a second submission.
 */
export function submitRequest(
  previous: { signature: string; requestId: string } | null,
  payload: { responseId: string; answers: Answers; expectedDraftRevision: number },
  newId: () => string,
): { signature: string; requestId: string } {
  const signature = JSON.stringify([payload.responseId, payload.expectedDraftRevision, payload.answers]);
  return previous && previous.signature === signature ? previous : { signature, requestId: newId() };
}
