import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FORM_LIMITS } from '@indigen-world/contracts/forms';
import { AWARDS, loadSettings, type FormsSettings } from './forms-common.js';
import { LedgerError, POINT_ACCOUNTS, commitLedger, entryId, ledgerEntryRef, openLedger, post } from './points-ledger.js';
import { rewardAudit } from './reward-system.js';

/**
 * Points for approved Indigen Forms responses, through the one spendable
 * ledger (points-ledger.ts) — never a second ledger, never a reward category.
 *
 * One award per response, whatever happens: the ledger row is
 * `formaward_<responseId>` and the marker is `formAwards/{responseId}`, both
 * read first, so a retried decision, a double click racing another reviewer,
 * or a later re-approval pays nothing more. The amount comes from the
 * response's own immutable version (the caller passes `review.points`),
 * capped by Finance's per-response limit and the contributor's daily limit
 * for forms (`contributorAccounts/{uid}/formRewardDays/{YYYY-MM-DD}`).
 *
 * Usage mirrors settleAward in reward-assessment.ts: call prepareFormAward in
 * the decision transaction's read phase, then commit() with the other writes.
 */

/** Per-contributor, per-UTC-day tally of form points (Finance's daily cap). */
export const FORM_REWARD_DAYS = 'formRewardDays';

export interface FormAwardOutcome {
  status: 'awarded' | 'not_applicable' | 'failed';
  points: number;
  entryId: string | null;
  note: string | null;
}

export interface FormAwardInput {
  responseId: string;
  formId: string;
  formTitle: string;
  formVersion: number;
  /** The contributor who owns the response. */
  uid: string;
  /** `review.points` of the response's own version. */
  points: number;
  reviewerUid: string;
  now: string;
  /** Stored on the marker so the contributor's points page needs no join. */
  referenceId?: string | null;
  /** Finance's limits when the caller already read settings/indigenForms in this transaction. */
  rewards?: FormsSettings['rewards'];
}

export interface PreparedFormAward {
  outcome: FormAwardOutcome;
  /** Queues every write of this award on the transaction. Call once, after all reads. */
  commit(): void;
}

const nothing = (note: string): PreparedFormAward => ({
  outcome: { status: 'not_applicable', points: 0, entryId: null, note },
  commit: () => undefined,
});

/**
 * Reads everything the award needs (marker, ledger row, account, today's
 * tally, settings and the ledger summary) and decides the outcome. Nothing is
 * written until commit().
 */
export async function prepareFormAward(db: Firestore, tx: Transaction, input: FormAwardInput): Promise<PreparedFormAward> {
  const id = entryId('formaward', input.responseId);
  const markerRef = db.collection(AWARDS).doc(input.responseId);
  const accountRef = db.collection('contributorAccounts').doc(input.uid);
  const day = input.now.slice(0, 10);
  const dayRef = accountRef.collection(FORM_REWARD_DAYS).doc(day);
  const [marker, entry, account, tally] = await tx.getAll(markerRef, ledgerEntryRef(db, id), accountRef, dayRef);
  const rewards = input.rewards ?? (await loadSettings(db, tx)).rewards;

  if (marker.exists || entry.exists) {
    const paid = Number(marker.get('points') ?? entry.get('points') ?? 0);
    return nothing(`Points for this response were already settled${paid > 0 ? ` (${paid} points)` : ''}; nothing more was paid.`);
  }
  const configured = Math.max(0, Math.min(Math.floor(Number(input.points) || 0), FORM_LIMITS.maxPoints));
  if (configured === 0) return nothing('This form does not award points.');
  if (!rewards.enabled) return nothing('Finance has paused points for form responses.');

  const audit = (action: string, after: Record<string, unknown>) => {
    const ref = db.collection('auditLogs').doc();
    tx.set(ref, {
      id: ref.id,
      ...rewardAudit({
        actor: { collection: 'staff', id: input.reviewerUid },
        action,
        target: { collection: AWARDS, id: input.responseId },
        after,
        reason: `Approved form response: ${input.formTitle.slice(0, 60)}`,
        metadata: { source: 'form', formId: input.formId, formVersion: input.formVersion, responseId: input.responseId, contributorId: input.uid },
        at: input.now,
      }),
    });
  };
  const markerData = (status: FormAwardOutcome['status'], points: number, note: string | null) => ({
    responseId: input.responseId,
    uid: input.uid,
    formId: input.formId,
    formTitle: input.formTitle,
    referenceId: input.referenceId ?? null,
    formVersion: input.formVersion,
    requestedPoints: configured,
    points,
    entryId: status === 'awarded' ? id : null,
    reviewerUid: input.reviewerUid,
    awardedAt: input.now,
    status,
    note,
  });

  // A reviewer can never pay themselves, even if a caller forgot the self-review check.
  const blocker = input.uid === input.reviewerUid
    ? 'A reviewer cannot award points for their own response.'
    : account.get('status') !== 'active'
      ? 'No points were paid because the contributor account is not active. Finance can adjust the ledger if that changes.'
      : null;
  if (blocker) {
    // Recorded (marker and Finance audit) so the unpaid approval is visible; the marker also stops any later payment.
    return {
      outcome: { status: 'failed', points: 0, entryId: null, note: blocker },
      commit() {
        tx.set(markerRef, markerData('failed', 0, blocker));
        audit('contributor.reward.form.failed', { points: 0, requestedPoints: configured, status: 'failed' });
      },
    };
  }

  const earned = Number.isSafeInteger(tally.get('points')) ? Number(tally.get('points')) : 0;
  const remaining = Math.max(0, rewards.dailyCap - earned);
  const points = Math.min(configured, Math.max(0, rewards.maxPointsPerResponse), remaining);
  if (points === 0) {
    return nothing(remaining === 0
      ? 'The contributor already reached today’s limit for points from forms.'
      : 'Finance’s limit allows no points per response at the moment.');
  }
  const limits: string[] = [];
  if (points < configured && points === rewards.maxPointsPerResponse) limits.push('Finance’s per-response limit');
  if (points < configured && points === remaining) limits.push('today’s limit for this contributor');
  const note = points < configured ? `Reduced from ${configured} to ${points} points by ${limits.join(' and ') || 'Finance’s limits'}.` : null;

  // The ledger summary is read here too; post() only moves the in-memory balance.
  const session = await openLedger(db, tx, input.uid, input.now);
  try {
    post(session, {
      id,
      type: 'award',
      points,
      reason: `Approved form response: ${input.formTitle.slice(0, 60)}`,
      actor: { kind: 'validator', id: input.reviewerUid },
      policy: { id: input.formId, version: input.formVersion },
      refs: { source: 'form', formId: input.formId, formVersion: input.formVersion, responseId: input.responseId },
    });
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    const failure = `The points could not be recorded (${error.message}). Finance can adjust the ledger.`;
    return { outcome: { status: 'failed', points: 0, entryId: null, note: failure }, commit: () => undefined };
  }
  return {
    outcome: { status: 'awarded', points, entryId: id, note },
    commit() {
      commitLedger(session);
      tx.set(markerRef, markerData('awarded', points, note));
      tx.set(dayRef, { day, points: earned + points, updatedAt: input.now }, { merge: true });
      audit('contributor.reward.form.award', { points, requestedPoints: configured, entryId: id, account: `${POINT_ACCOUNTS}/${input.uid}` });
    },
  };
}
