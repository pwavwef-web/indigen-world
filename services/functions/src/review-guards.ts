import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Guards shared by the submission and decision callables. Pure, so the rules
 * that keep work from being duplicated or overwritten are tested on their own.
 *
 * ── Requests ──────────────────────────────────────────────────────────────
 * A contributor's app sends a `requestId` it chose for one attempt to send
 * something. The record created for it gets an id derived from the caller and
 * that request, so a retry after a dropped connection finds the record the
 * first attempt made instead of creating a second one. The request's content
 * is fingerprinted: the same id with different content is refused, never
 * silently answered with the old record. Older clients send no id and keep
 * the previous behaviour.
 *
 * ── Decisions ─────────────────────────────────────────────────────────────
 * A reviewer's decision may carry the status and version they saw. If the
 * item has moved on — someone else decided it, the contributor withdrew it —
 * the decision is refused with `aborted` and nothing is written.
 */

export function parseRequestId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(raw)) {
    throw new HttpsError('invalid-argument', 'That request id is not valid.');
  }
  return raw;
}

/** The record id for one caller's request of one kind: stable across retries. */
export function requestDocumentId(uid: string, kind: string, requestId: string): string {
  return createHash('sha256').update(`${kind}:${uid}:${requestId}`).digest('hex').slice(0, 28);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function requestFingerprint(payload: unknown): string {
  return createHash('sha256').update(stable(payload)).digest('hex');
}

/**
 * What an existing record means for a request: nothing yet (create it), the
 * same request again (answer with what was made), or a different request
 * under the same id (refuse).
 */
export function replayOutcome(
  existing: { authUid?: unknown; uid?: unknown; requestFingerprint?: unknown } | null | undefined,
  uid: string,
  fingerprint: string,
): 'create' | 'replay' | 'conflict' {
  if (!existing) return 'create';
  const owner = existing.authUid ?? existing.uid;
  if (owner !== uid) return 'conflict';
  return existing.requestFingerprint === fingerprint ? 'replay' : 'conflict';
}

export const REQUEST_CONFLICT_MESSAGE = 'This was already sent, with different details. Open it from your submissions before sending a change.';

export interface DecisionExpectation {
  status: string | null;
  version: number | null;
}

export function parseDecisionExpectation(data: Record<string, unknown>): DecisionExpectation {
  const rawStatus = data.expectedStatus;
  const rawVersion = data.expectedVersion;
  if (rawStatus != null && rawStatus !== '' && (typeof rawStatus !== 'string' || !/^[A-Za-z_-]{1,40}$/.test(rawStatus))) {
    throw new HttpsError('invalid-argument', 'expectedStatus is not valid.');
  }
  if (rawVersion != null && (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 0)) {
    throw new HttpsError('invalid-argument', 'expectedVersion is not valid.');
  }
  return {
    status: typeof rawStatus === 'string' && rawStatus ? rawStatus : null,
    version: typeof rawVersion === 'number' ? rawVersion : null,
  };
}

/** Why a decision no longer applies to the item as it is now, or null when it does. */
export function staleDecisionProblem(current: { status?: unknown; version?: unknown }, expected: DecisionExpectation): string | null {
  if (expected.status && current.status !== expected.status) {
    return 'This item changed while you were reviewing it, so your decision was not recorded. Reload to see where it stands now.';
  }
  if (expected.version !== null && typeof current.version === 'number' && current.version !== expected.version) {
    return 'Someone else updated this item while you were reviewing it, so your decision was not recorded. Reload to see the latest version.';
  }
  return null;
}

/** How long a reviewer's claim on a pronunciation decision holds if the decision never finishes. */
export const DECISION_LOCK_MS = 2 * 60_000;

/**
 * Whether this reviewer may decide this pronunciation recording now. A
 * recording is decided once, never by the person who recorded it, and by one
 * reviewer at a time: an approval copies audio before it is recorded, so it
 * holds a short claim that stops a second decision from starting meanwhile.
 */
export function recordingDecisionProblem(
  record: { status?: unknown; uid?: unknown; decisionLock?: unknown },
  reviewerUid: string,
  nowMs: number,
): { code: 'permission-denied' | 'failed-precondition' | 'aborted'; message: string } | null {
  if (record.uid === reviewerUid) {
    return { code: 'permission-denied', message: 'Reviewers cannot decide their own recordings.' };
  }
  if (record.status !== 'submitted') {
    return { code: 'failed-precondition', message: 'That recording has already been decided.' };
  }
  const lock = record.decisionLock && typeof record.decisionLock === 'object'
    ? record.decisionLock as { by?: unknown; at?: unknown }
    : null;
  const at = typeof lock?.at === 'number' ? lock.at : 0;
  if (lock && at && nowMs - at < DECISION_LOCK_MS) {
    return {
      code: 'aborted',
      message: lock.by === reviewerUid
        ? 'Your earlier decision on this recording is still being recorded. Wait a moment, then reload.'
        : 'Another reviewer is deciding this recording right now.',
    };
  }
  return null;
}
