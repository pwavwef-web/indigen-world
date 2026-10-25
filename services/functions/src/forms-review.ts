import { getFirestore, type DocumentSnapshot, type Query } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  REVIEW_DECISIONS, RESPONSE_STATUSES,
  type ResponseStatus, type ReviewDecision, type ReviewerGroup,
} from '@indigen-world/contracts/forms';
import type { HistoryEvent, ResponseDetail, ResponseSummary } from '@indigen-world/contracts/forms-api';
import { onStaffCall } from './auth.js';
import { guarded } from './contributor-common.js';
import { prepareFormAward, type FormAwardOutcome } from './form-rewards.js';
import { initialRouting, routeApprovedResponse, type RoutingState } from './forms-destinations.js';
import {
  FORMS, FORMS_CALL_OPTIONS, RESPONSES,
  attachmentLink, auditRef, countsDelta, displayNames, docId, formRef, formsAudit, formsCaller, historyRef, inReviewerGroup,
  loadResponse, loadResponseDetail, loadVersion, mayReviewSomething, notifyContributor, nowIso, objectData, requireFormsAdmin,
  responseRef, responseSummary, reviewEmailAllowed, sha256, stableJson, wholeNumber,
  type FormDoc, type FormsCaller, type ResponseDoc,
} from './forms-common.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * formsReview: reviewers' and administrators' way to decide on Indigen Forms
 * responses (docs/architecture/indigen-forms.md, "Review, points and
 * destinations"), from the TribeStudio review desk and the admin console.
 *
 * Every action needs review standing and a verified staff session
 * (onStaffCall); every response also needs membership of the reviewer group
 * its version names, and nobody reviews their own response. A decision is one
 * transaction — expectations, allowed move, required checks, status, history,
 * counts, audit, the contributor's notice and, on approval, the points award
 * and routing state — so a retry or a second reviewer racing the first can
 * never apply it twice. Filing in the destination happens after the decision
 * commits, and its problems are recorded on the response, never thrown back
 * at the reviewer.
 */

const HOUR = 60 * 60 * 1000;
const PAGE = 50;
const MAX_SCAN = 500;
const MAX_FEEDBACK = 3000;
const MIN_FEEDBACK = 5;
/** Submitted work waiting for a reviewer; listed oldest first. */
const OPEN: readonly ResponseStatus[] = ['submitted', 'under_review'];
const REQUEST_ID = /^[A-Za-z0-9_-]{16,100}$/;

const HISTORY_TYPE: Record<ReviewDecision, HistoryEvent['type']> = {
  start_review: 'review_started',
  request_changes: 'changes_requested',
  approve: 'approved',
  reject: 'rejected',
};
const NOTICE_TITLE: Partial<Record<ReviewDecision, string>> = {
  request_changes: 'Changes requested on your form response',
  approve: 'Your form response was approved',
  reject: 'Your form response was not accepted',
};

const db = () => getFirestore();
const isDecision = (value: unknown): value is ReviewDecision => typeof value === 'string' && Object.prototype.hasOwnProperty.call(REVIEW_DECISIONS, value);
const isStatus = (value: unknown): value is ResponseStatus => typeof value === 'string' && (RESPONSE_STATUSES as readonly string[]).includes(value);
/** Responses saved before the reviewer group was recorded fall back to the strictest group. */
const groupOf = (response: ResponseDoc): ReviewerGroup => response.reviewerGroup ?? 'admins';

function rewardView(response: ResponseDoc): ResponseDetail['reward'] {
  const reward = response.reward ?? { points: 0, status: 'none', entryId: null, note: null };
  return { points: reward.points ?? 0, status: reward.status ?? 'none', note: reward.note ?? null };
}

function routingView(routing: RoutingState | null | undefined, fallback: string): ResponseDetail['routing'] {
  const value = routing ?? { destination: fallback, status: 'not_applicable', targetCollection: null, targetId: null, note: null };
  return { destination: value.destination, status: value.status, targetCollection: value.targetCollection ?? null, targetId: value.targetId ?? null, note: value.note ?? null };
}

/** Decisions the caller may take now (the caller's group was checked already; drafts never get here). */
function allowedDecisions(response: ResponseDoc): ReviewDecision[] {
  if (response.reviewRequired === false) return [];
  return (Object.keys(REVIEW_DECISIONS) as ReviewDecision[]).filter((decision) => REVIEW_DECISIONS[decision].from.includes(response.status));
}

/** A submitted response this caller may review: not a draft, not their own, inside their reviewer group. */
async function reviewable(caller: FormsCaller, responseId: unknown): Promise<ResponseDoc> {
  const response = await loadResponse(docId(responseId, 'Response'));
  // Drafts are the contributor's unsent work.
  if (response.status === 'draft' || !response.submittedAt) throw new HttpsError('not-found', 'This response does not exist.');
  if (response.contributorUid === caller.uid) throw new HttpsError('permission-denied', 'You cannot review your own response.');
  if (!(await inReviewerGroup(caller, groupOf(response)))) {
    throw new HttpsError('permission-denied', 'This form is reviewed by another reviewer group.', { reason: 'group' });
  }
  return response;
}

/* -- queue -------------------------------------------------------------------------------------- */

async function queue(caller: FormsCaller, data: Record<string, unknown>) {
  let statuses: ResponseStatus[];
  if (data.status === undefined || data.status === null || data.status === 'open') statuses = [...OPEN];
  else if (isStatus(data.status) && data.status !== 'draft') statuses = [data.status];
  else throw new HttpsError('invalid-argument', 'Unknown response status.');
  const waiting = statuses.every((status) => OPEN.includes(status));
  const formId = data.formId === undefined || data.formId === null || data.formId === '' ? null : docId(data.formId, 'Form');

  // Waiting work oldest first, so nothing starves; decided work newest first.
  let query: Query = db().collection(RESPONSES);
  if (formId) query = query.where('formId', '==', formId);
  query = statuses.length === 1 ? query.where('status', '==', statuses[0]) : query.where('status', 'in', statuses);
  query = query.orderBy('submittedAt', waiting ? 'asc' : 'desc');
  let last: DocumentSnapshot | null = null;
  if (data.cursor !== undefined && data.cursor !== null && data.cursor !== '') {
    const cursor = await db().collection(RESPONSES).doc(docId(data.cursor, 'Cursor')).get();
    if (cursor.exists) last = cursor;
  }

  const grants = new Map<string, Record<string, unknown> | undefined>();
  const groups = new Map<ReviewerGroup, boolean>();
  const member = async (group: ReviewerGroup) => {
    if (!groups.has(group)) groups.set(group, await inReviewerGroup(caller, group, db(), grants));
    return groups.get(group)!;
  };
  const rows: ResponseDoc[] = [];
  let scanned = 0;
  let more = true;
  while (rows.length < PAGE && scanned < MAX_SCAN) {
    const snap = await (last ? query.startAfter(last) : query).limit(100).get();
    let stoppedEarly = false;
    for (const doc of snap.docs) {
      scanned += 1;
      last = doc;
      const response = doc.data() as ResponseDoc;
      // Own work, responses kept without review and other groups' work are not this reviewer's queue.
      if (response.contributorUid !== caller.uid && response.reviewRequired !== false && response.submittedAt && await member(groupOf(response))) rows.push(response);
      if (rows.length >= PAGE || scanned >= MAX_SCAN) { stoppedEarly = doc !== snap.docs[snap.docs.length - 1]; break; }
    }
    if (snap.size < 100 && !stoppedEarly) { more = false; break; }
  }

  const formsSnap = await db().collection(FORMS).where('status', 'in', ['published', 'paused', 'closed', 'archived']).limit(300).get();
  const forms: Array<{ id: string; title: string }> = [];
  for (const doc of formsSnap.docs) {
    const form = doc.data() as FormDoc;
    if (form.currentVersion && await member(form.reviewerGroup ?? 'admins')) forms.push({ id: form.id, title: form.title });
  }
  forms.sort((a, b) => a.title.localeCompare(b.title));
  const names = await displayNames(rows.map((row) => row.contributorUid));
  const summaries: ResponseSummary[] = rows.map((row) => responseSummary(row, names));
  return { rows: summaries, forms, nextCursor: more && last ? last.id : null };
}

/* -- decide -------------------------------------------------------------------------------------- */

function feedbackInput(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Feedback must be text.');
  // Surrounding whitespace only: the reviewer's wording (and any Kasem in it) is kept as typed.
  const clean = value.trim();
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean)) throw new HttpsError('invalid-argument', 'Feedback contains control characters.');
  if (clean.length > MAX_FEEDBACK) throw new HttpsError('invalid-argument', `Feedback must be ${MAX_FEEDBACK} characters or fewer.`);
  return clean;
}

function checksInput(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50 || value.some((item) => typeof item !== 'string' || item.length > 40)) {
    throw new HttpsError('invalid-argument', 'Checks must be a list of check ids.');
  }
  return [...new Set(value as string[])];
}

interface DecideResult {
  status: ResponseStatus;
  replayed: boolean;
  reward: ResponseDetail['reward'];
  routing: ResponseDetail['routing'];
}

async function decide(caller: FormsCaller, data: Record<string, unknown>): Promise<DecideResult> {
  const responseId = docId(data.responseId, 'Response');
  if (!isDecision(data.decision)) throw new HttpsError('invalid-argument', 'Unknown review decision.');
  const decision = data.decision;
  if (!isStatus(data.expectedStatus)) throw new HttpsError('invalid-argument', 'Send the status you reviewed.');
  const expectedStatus = data.expectedStatus;
  const expectedRevision = wholeNumber(data.expectedRevision, 'Revision');
  if (typeof data.requestId !== 'string' || !REQUEST_ID.test(data.requestId)) throw new HttpsError('invalid-argument', 'A request id is required.');
  // Starting a review tells the contributor nothing, so text drafted for a later decision is never sent with it.
  const feedback = decision === 'start_review' ? '' : feedbackInput(data.feedback);
  if ((decision === 'request_changes' || decision === 'reject') && feedback.length < MIN_FEEDBACK) {
    throw new HttpsError('invalid-argument', 'Tell the contributor why, in at least five characters.', { reason: 'feedback' });
  }
  const checks = checksInput(data.checks);

  // Group membership may read a knowledge grant, so it is checked first and pinned inside the transaction.
  const before = await reviewable(caller, responseId);
  const group = groupOf(before);
  const actorRole = caller.isAdmin ? 'admin' as const : 'reviewer' as const;
  // The request id names the decision's history event: a replay finds it and writes nothing.
  const eventId = `decision-${sha256(`${caller.uid}:${data.requestId}`).slice(0, 32)}`;
  const requestHash = sha256(stableJson({ responseId, decision, feedback, checks: [...checks].sort(), expectedStatus, expectedRevision }));

  const committed = await db().runTransaction(async (tx) => {
    // Reads, all before any write.
    const prior = await tx.get(historyRef(responseId, eventId));
    const snap = await tx.get(responseRef(responseId));
    const response = snap.data() as ResponseDoc | undefined;
    if (!response) throw new HttpsError('not-found', 'This response does not exist.');
    if (prior.exists) {
      if (prior.get('actorUid') !== caller.uid || prior.get('requestHash') !== requestHash) {
        throw new HttpsError('already-exists', 'This request id was already used for a different decision. Reload the response.');
      }
      return { status: response.status, replayed: true, reward: rewardView(response), routing: routingView(response.routing, ''), route: false };
    }
    if (response.contributorUid === caller.uid) throw new HttpsError('permission-denied', 'You cannot review your own response.');
    if (groupOf(response) !== group) throw new HttpsError('aborted', 'This response moved to another reviewer group. Reload it.', { reason: 'stale', status: response.status, revision: response.revision });
    if (response.status !== expectedStatus || response.revision !== expectedRevision) {
      throw new HttpsError('aborted', 'This response changed since you opened it. Reload it before deciding.', { reason: 'stale', status: response.status, revision: response.revision });
    }
    if (response.reviewRequired === false) {
      throw new HttpsError('failed-precondition', 'This form does not use review: its responses are kept as received.', { reason: 'no-review' });
    }
    const rule = REVIEW_DECISIONS[decision];
    if (!rule.from.includes(response.status)) {
      throw new HttpsError('failed-precondition', `A ${response.status.replace('_', ' ')} response cannot be given this decision.`, { reason: 'decision', status: response.status });
    }
    const version = await loadVersion(response.formId, response.formVersion, tx);
    const definition = version.definition;
    const known = new Set(definition.review.checks.map((check) => check.id));
    const unknown = checks.filter((id) => !known.has(id));
    if (unknown.length) throw new HttpsError('invalid-argument', 'Some checks are not part of this form.', { reason: 'checks', unknown });
    if (decision === 'approve') {
      const missing = definition.review.checks.filter((check) => !checks.includes(check.id));
      if (missing.length) {
        throw new HttpsError('failed-precondition', `Confirm every review check before approving: ${missing.map((check) => check.label).join('; ')}.`, { reason: 'checks', missing: missing.map((check) => check.id) });
      }
    }
    const formSnap = await tx.get(formRef(response.formId));
    const title = NOTICE_TITLE[decision];
    const email = title ? await reviewEmailAllowed(tx, response.contributorUid) : false;
    const now = nowIso();
    const award = decision === 'approve'
      ? await prepareFormAward(db(), tx, {
        responseId,
        formId: response.formId,
        formTitle: response.formTitle,
        formVersion: response.formVersion,
        referenceId: response.referenceId,
        uid: response.contributorUid,
        points: definition.review.points,
        reviewerUid: caller.uid,
        now,
      })
      : null;
    const routing = decision === 'approve' ? initialRouting(definition, response) : response.routing;

    // Writes.
    const to = rule.to;
    const outcome: FormAwardOutcome | null = award?.outcome ?? null;
    const reward = outcome ? { points: outcome.points, status: outcome.status, entryId: outcome.entryId, note: outcome.note } : response.reward;
    tx.update(responseRef(responseId), {
      status: to,
      updatedAt: now,
      lastDecision: { decision, actorUid: caller.uid, at: now },
      ...(decision === 'start_review' ? {} : { feedback: feedback || null, decidedAt: now }),
      ...(decision === 'approve' ? { reward, routing } : {}),
    });
    tx.create(historyRef(responseId, eventId), {
      type: HISTORY_TYPE[decision],
      decision,
      actorUid: caller.uid,
      actorRole,
      revision: response.revision,
      at: now,
      ...(feedback ? { feedback } : {}),
      ...(checks.length ? { checks } : {}),
      requestHash,
    });
    if (outcome && outcome.status !== 'not_applicable') {
      tx.set(historyRef(responseId, 'points'), {
        type: outcome.status === 'awarded' ? 'points_awarded' : 'points_failed',
        actorUid: caller.uid, actorRole: 'system', revision: response.revision, at: now,
        note: outcome.status === 'awarded' ? `${outcome.points} points awarded.${outcome.note ? ` ${outcome.note}` : ''}` : outcome.note,
      });
    }
    if (decision === 'approve' && routing?.status === 'blocked') {
      tx.set(historyRef(responseId, 'routing-blocked'), { type: 'routing_blocked', actorUid: caller.uid, actorRole: 'system', revision: response.revision, at: now, note: routing.note });
    }
    award?.commit();
    if (formSnap.exists) tx.update(formRef(response.formId), { ...countsDelta(response.status, to), lastActivityAt: now });
    const reference = response.referenceId ?? response.id;
    const audit = formsAudit({
      actor: caller.uid,
      action: `forms.review.${decision}`,
      formId: response.formId,
      formTitle: response.formTitle,
      responseId,
      summary: `${rule.label}: ${response.formTitle} (${reference})`,
      before: { status: response.status, revision: response.revision },
      after: { status: to },
      metadata: {
        revision: response.revision, formVersion: response.formVersion, checks, feedbackLength: feedback.length,
        reward: outcome ? { status: outcome.status, points: outcome.points } : null,
        routing: decision === 'approve' ? routing?.status ?? null : null,
      },
      at: now,
    });
    tx.set(auditRef(audit), audit);
    if (title) {
      const points = outcome?.status === 'awarded' ? ` You earned ${outcome.points} points.` : '';
      const lead = decision === 'approve'
        ? `Your response to “${response.formTitle}” (${reference}) was approved.${points}`
        : decision === 'request_changes'
          ? `A reviewer asked for changes to your response to “${response.formTitle}” (${reference}). Open it, make the changes and submit it again.`
          : `Your response to “${response.formTitle}” (${reference}) was not accepted.`;
      notifyContributor(tx, {
        uid: response.contributorUid,
        responseId,
        eventId,
        title,
        body: feedback ? `${lead}\n\nReviewer feedback: ${feedback}` : lead,
        email,
      });
    }
    return {
      status: to,
      replayed: false,
      reward: { points: reward?.points ?? 0, status: reward?.status ?? 'none', note: reward?.note ?? null },
      routing: routingView(routing, definition.destination.type),
      route: decision === 'approve' && routing?.status === 'pending',
    };
  });

  const { route, ...result } = committed;
  if (!route) return result;
  try {
    return { ...result, routing: routingView(await routeApprovedResponse(responseId, caller.uid), result.routing.destination) };
  } catch (error) {
    // The decision stands; routing stays pending for an administrator to retry.
    logger.error('Forms routing after approval failed', { responseId, error: error instanceof Error ? error.message : String(error) });
    return { ...result, routing: { ...result.routing, note: 'Filing in the destination did not finish. An administrator can retry it.' } };
  }
}

/* -- retryRouting --------------------------------------------------------------------------------- */

/** Administrators re-run filing for an approved response whose routing failed or never finished. */
async function retryRouting(caller: FormsCaller, data: Record<string, unknown>): Promise<{ routing: ResponseDetail['routing'] }> {
  requireFormsAdmin(caller);
  const response = await reviewable(caller, data.responseId);
  if (response.status !== 'approved' || !['failed', 'pending'].includes(response.routing?.status ?? '')) {
    throw new HttpsError('failed-precondition', 'Only an approved response whose routing failed or is still pending can be retried.', { reason: 'routing' });
  }
  return { routing: routingView(await routeApprovedResponse(response.id, caller.uid), response.routing.destination) };
}

/* -- The callable ------------------------------------------------------------------------------------ */

export const formsReview = onStaffCall({ ...FORMS_CALL_OPTIONS }, guarded('formsReview', async (req) => {
  const caller = formsCaller(req);
  if (!mayReviewSomething(caller)) throw new HttpsError('permission-denied', 'Reviewer access is required to review form responses.');
  const data = objectData(req.data);

  switch (data.action) {
    case 'queue':
      await consumeRateLimit('formsReviewRead', caller.uid, 600, HOUR);
      return queue(caller, data);
    case 'get': {
      await consumeRateLimit('formsReviewRead', caller.uid, 600, HOUR);
      const response = await reviewable(caller, data.responseId);
      return loadResponseDetail(response, { viewer: 'staff', allowedDecisions: allowedDecisions(response) });
    }
    case 'decide':
      await consumeRateLimit('formsReviewDecide', caller.uid, 120, HOUR);
      return decide(caller, data);
    case 'attachmentLink': {
      await consumeRateLimit('formsReviewRead', caller.uid, 600, HOUR);
      const response = await reviewable(caller, data.responseId);
      return attachmentLink({ response, attachmentId: String(data.attachmentId ?? ''), actorUid: caller.uid, actorRole: caller.isAdmin ? 'admin' : 'reviewer' });
    }
    case 'retryRouting':
      await consumeRateLimit('formsReviewDecide', caller.uid, 120, HOUR);
      return retryRouting(caller, data);
    default:
      throw new HttpsError('invalid-argument', 'Unknown review action.');
  }
}));
