import { CONSENT_PURPOSES, DESTINATIONS, REVIEW_DECISIONS } from '@indigen-world/contracts/forms';
import type { ConsentPurpose, FormDefinition, ResponseStatus, ReviewCheck, ReviewDecision } from '@indigen-world/contracts/forms';
import type { HistoryEvent, ResponseDetail } from '@indigen-world/contracts/forms-api';

/*
 * Pure wording and decisions for the Indigen Forms review desk
 * (/contributor/review?desk=forms). Nothing here reads the network or the DOM,
 * so scripts/workflows.test.mjs loads this file as it ships. Reviewer feedback
 * is checked the way the server checks it (surrounding whitespace ignored for
 * the length) but is always sent exactly as typed.
 */

/** The queue filters: "Awaiting review" is submitted and under review together. */
export type QueueFilter = 'open' | 'under_review' | 'changes_requested' | 'approved' | 'rejected';

export const QUEUE_FILTERS: ReadonlyArray<{ value: QueueFilter; label: string; empty: string }> = [
  { value: 'open', label: 'Awaiting review', empty: 'Nothing is waiting for review. New responses appear here, oldest first.' },
  { value: 'under_review', label: 'Under review', empty: 'No response is being reviewed right now.' },
  { value: 'changes_requested', label: 'Changes requested', empty: 'No response is waiting on its contributor.' },
  { value: 'approved', label: 'Approved', empty: 'No approved responses yet.' },
  { value: 'rejected', label: 'Rejected', empty: 'No rejected responses.' },
];

export function queueFilter(raw: string | null | undefined): QueueFilter {
  return QUEUE_FILTERS.some((entry) => entry.value === raw) ? raw as QueueFilter : 'open';
}

/** Waiting work is listed oldest first so nothing starves; decided work newest first. */
export function oldestFirst(filter: QueueFilter): boolean {
  return filter === 'open' || filter === 'under_review';
}

/** The query string of a desk address: only what differs from the defaults. */
export function deskSearch(input: { status?: QueueFilter | null; form?: string | null; item?: string | null }): string {
  const params = new URLSearchParams({ desk: 'forms' });
  if (input.status && input.status !== 'open') params.set('status', input.status);
  if (input.form) params.set('form', input.form);
  if (input.item) params.set('item', input.item);
  return `?${params.toString()}`;
}

/** Response and form ids are server-issued; anything else in the address is ignored. */
export function safeId(raw: string | null | undefined): string | null {
  return raw && /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : null;
}

/* -- Decisions ------------------------------------------------------------------------------- */

export const FEEDBACK_MIN = 5;
export const FEEDBACK_MAX = 3000;

export const DECISION_ORDER: readonly ReviewDecision[] = ['start_review', 'request_changes', 'approve', 'reject'];

export interface DecisionCopy {
  label: string;
  /** The confirm button. */
  confirm: string;
  tone: 'positive' | 'caution' | 'negative' | 'neutral';
  consequence: string;
  /** Said once it is recorded. */
  done: string;
}

export const DECISION_COPY: Readonly<Record<ReviewDecision, DecisionCopy>> = {
  start_review: {
    label: 'Start review',
    confirm: 'Start review',
    tone: 'neutral',
    consequence: 'Marks the response as under review, so other reviewers can see that someone has it. The contributor is not notified.',
    done: 'Review started',
  },
  request_changes: {
    label: 'Request changes',
    confirm: 'Send the request',
    tone: 'caution',
    consequence: 'Returns the response to its contributor with your feedback. They revise it and submit a new revision; earlier revisions are kept.',
    done: 'Changes requested',
  },
  approve: {
    label: 'Approve',
    confirm: 'Approve response',
    tone: 'positive',
    consequence: 'Accepts the response and tells the contributor. Approval never grants publication or AI-training use: those follow only the permissions the contributor gave.',
    done: 'Approved',
  },
  reject: {
    label: 'Reject',
    confirm: 'Reject response',
    tone: 'negative',
    consequence: 'Closes the response as not accepted and sends your feedback to the contributor. It cannot be revised afterwards.',
    done: 'Rejected',
  },
};

/** Allowed decisions in the desk's order (the server's list is the authority). */
export function orderedDecisions(allowed: readonly ReviewDecision[]): ReviewDecision[] {
  return DECISION_ORDER.filter((decision) => allowed.includes(decision) && Object.hasOwn(REVIEW_DECISIONS, decision));
}

export function feedbackRequired(decision: ReviewDecision | null): boolean {
  return decision === 'request_changes' || decision === 'reject';
}

/** Start review records no note for the contributor, so it asks for none. */
export function takesFeedback(decision: ReviewDecision | null): boolean {
  return decision !== null && decision !== 'start_review';
}

/** The length the server counts: surrounding whitespace is not part of the feedback. */
export function feedbackLength(feedback: string): number {
  return feedback.trim().length;
}

export function feedbackProblem(decision: ReviewDecision | null, feedback: string): string | null {
  if (!takesFeedback(decision)) return null;
  const length = feedbackLength(feedback);
  if (length > FEEDBACK_MAX) return `Feedback must be ${FEEDBACK_MAX} characters or fewer. It is ${length} now.`;
  if (feedbackRequired(decision) && length < FEEDBACK_MIN) {
    return length === 0
      ? `Write feedback for the contributor (at least ${FEEDBACK_MIN} characters): say what to change, or why it cannot be accepted.`
      : `Feedback must be at least ${FEEDBACK_MIN} characters. It is ${length} now.`;
  }
  return null;
}

export function missingChecks(checks: readonly ReviewCheck[], ticked: readonly string[]): ReviewCheck[] {
  return checks.filter((check) => !ticked.includes(check.id));
}

export interface DecisionBlocker { field: 'decision' | 'feedback' | 'checks'; message: string }

/** Why the chosen decision cannot be sent yet, or null when it can. */
export function decisionBlocker(input: {
  decision: ReviewDecision | null;
  allowed: readonly ReviewDecision[];
  feedback: string;
  checks: readonly ReviewCheck[];
  ticked: readonly string[];
}): DecisionBlocker | null {
  const { decision } = input;
  if (!decision) return { field: 'decision', message: 'Choose a decision.' };
  if (!input.allowed.includes(decision)) return { field: 'decision', message: 'This decision is not available in the response’s current status. Load the latest version.' };
  if (decision === 'approve') {
    const missing = missingChecks(input.checks, input.ticked);
    if (missing.length) {
      return {
        field: 'checks',
        message: missing.length === input.checks.length && missing.length > 1
          ? `Tick all ${missing.length} reviewer checks before approving.`
          : `Tick every reviewer check before approving. Still to confirm: ${missing.map((check) => check.label).join('; ')}.`,
      };
    }
  }
  const problem = feedbackProblem(decision, input.feedback);
  return problem ? { field: 'feedback', message: problem } : null;
}

export interface DecisionPayload {
  responseId: string;
  decision: ReviewDecision;
  feedback?: string;
  checks?: string[];
  expectedStatus: ResponseStatus;
  expectedRevision: number;
}

/** What is sent: feedback exactly as typed, checks that belong to the form, and the expectations. */
export function decisionPayload(input: {
  responseId: string;
  decision: ReviewDecision;
  feedback: string;
  checks: readonly ReviewCheck[];
  ticked: readonly string[];
  expectedStatus: ResponseStatus;
  expectedRevision: number;
}): DecisionPayload {
  const known = new Set(input.checks.map((check) => check.id));
  const ticked = input.checks.map((check) => check.id).filter((id) => input.ticked.includes(id) && known.has(id));
  return {
    responseId: input.responseId,
    decision: input.decision,
    ...(takesFeedback(input.decision) && input.feedback.trim() ? { feedback: input.feedback } : {}),
    ...(input.decision !== 'start_review' && ticked.length ? { checks: ticked } : {}),
    expectedStatus: input.expectedStatus,
    expectedRevision: input.expectedRevision,
  };
}

/**
 * One request id per decision. Retrying the same decision on the same
 * revision (a time-out, a lost reply, a double click) sends the same id, so the
 * server records it once; any change to it is a new decision with a new id.
 */
export function decisionRequestId(
  previous: { signature: string; requestId: string } | null,
  payload: DecisionPayload,
  newId: () => string,
): { signature: string; requestId: string } {
  const signature = JSON.stringify([payload.responseId, payload.decision, payload.feedback ?? '', [...(payload.checks ?? [])].sort(), payload.expectedStatus, payload.expectedRevision]);
  return previous && previous.signature === signature ? previous : { signature, requestId: newId() };
}

/** The item to open after a decision: the next one in the list, else the one before, else none. */
export function nextItemAfter(ids: readonly string[], current: string): string | null {
  const index = ids.indexOf(current);
  if (index === -1) return ids[0] ?? null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}

/** Search by reference id (or response id); the reference's letters are matched in either case. */
export function matchesReference(row: { id: string; referenceId: string | null }, needle: string): boolean {
  const query = needle.trim().toUpperCase();
  if (!query) return true;
  return (row.referenceId ?? '').toUpperCase().includes(query) || row.id.toUpperCase().includes(query);
}

/* -- Outcomes and history -------------------------------------------------------------------- */

const HISTORY_LABELS: Record<HistoryEvent['type'], string> = {
  created: 'Draft started',
  submitted: 'Submitted',
  resubmitted: 'Resubmitted',
  review_started: 'Review started',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  points_awarded: 'Points awarded',
  points_failed: 'Points not awarded',
  routed: 'Filed in its destination',
  routing_blocked: 'Not filed',
  version_moved: 'Moved to a newer version of the form',
  attachment_link: 'File opened',
};

export function reviewHistoryLabel(type: HistoryEvent['type']): string {
  return HISTORY_LABELS[type] ?? 'Update';
}

export function actorRoleLabel(role: HistoryEvent['actorRole']): string {
  if (role === 'contributor') return 'Contributor';
  if (role === 'reviewer') return 'Reviewer';
  if (role === 'admin') return 'Administrator';
  return 'System';
}

export type OutcomeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export function rewardOutcome(reward: ResponseDetail['reward'], configuredPoints: number): { tone: OutcomeTone; text: string } {
  switch (reward.status) {
    case 'awarded': return { tone: 'success', text: `${reward.points} point${reward.points === 1 ? '' : 's'} awarded to the contributor, once.` };
    case 'failed': return { tone: 'danger', text: `Points could not be awarded.${reward.note ? ` ${reward.note}` : ''}` };
    case 'not_applicable': return { tone: 'neutral', text: reward.note || 'No points: this form does not award points, or they are turned off.' };
    default: return configuredPoints > 0
      ? { tone: 'neutral', text: `${configuredPoints} point${configuredPoints === 1 ? '' : 's'} on approval. Not awarded yet.` }
      : { tone: 'neutral', text: 'This form gives no points.' };
  }
}

export function destinationLabel(type: string): string {
  return Object.hasOwn(DESTINATIONS, type) ? DESTINATIONS[type as keyof typeof DESTINATIONS].label : 'Indigen Forms';
}

export function routingOutcome(routing: ResponseDetail['routing']): { tone: OutcomeTone; text: string } {
  const where = destinationLabel(routing.destination);
  const note = routing.note ? ` ${routing.note}` : '';
  switch (routing.status) {
    case 'routed': return { tone: 'success', text: `Filed in ${where} for its own review${routing.targetId ? ` (record ${routing.targetId})` : ''}. Nothing was published.${note}` };
    case 'pending': return { tone: 'warning', text: `Filing in ${where} has not finished.${note}` };
    case 'blocked': return { tone: 'warning', text: `Not filed in ${where}.${note || ' The contributor did not give a permission this destination needs.'}` };
    case 'failed': return { tone: 'danger', text: `Filing in ${where} failed.${note}` };
    default: return { tone: 'neutral', text: 'Stays in Indigen Forms. Nothing is copied to another workflow.' };
  }
}

/** Permissions the form's destination needs that this response did not grant: filing will be blocked. */
export function consentGaps(definition: Pick<FormDefinition, 'destination'>, granted: readonly ConsentPurpose[]): ConsentPurpose[] {
  const type = definition.destination?.type;
  const required = type && Object.hasOwn(DESTINATIONS, type) ? DESTINATIONS[type].requiredConsents : [];
  return required.filter((purpose) => !granted.includes(purpose));
}

export function purposeLabel(purpose: ConsentPurpose): string {
  return Object.hasOwn(CONSENT_PURPOSES, purpose) ? CONSENT_PURPOSES[purpose].label : purpose;
}

/** "3 d", "5 h", "12 min": how long a response has waited. */
export function waited(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(1, Math.round((now - at) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}
