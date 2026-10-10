import { createHash } from 'node:crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';

/**
 * The contributor points ledger.
 *
 * ── What is authoritative ──────────────────────────────────────────────────
 * `pointLedger/{entryId}` is append-only: one immutable row per movement,
 * written only by this backend. `contributorPointAccounts/{uid}` is the
 * running summary of those rows, updated in the SAME transaction as each row,
 * so the summary and the history cannot disagree. Firestore transactions are
 * optimistic: two redemptions racing on one account both read the summary,
 * one commits, the other is retried against the new balance.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 * Every entry id is derived from what caused it (`award:<contribution>`,
 * `reserve:<request>`, `release:<request>` …). A retried trigger or callable
 * reads the entry inside its transaction, finds it, and does nothing.
 *
 * ── Legacy balances ────────────────────────────────────────────────────────
 * Before this ledger, balances lived in `contributorAccounts.rewardBalance`
 * (already net of legacy requests, which deducted points on submission) and
 * `rewardLifetime`. The first ledger operation on an account — or the
 * migration script — writes ONE `opening_balance` entry from those two fields,
 * inside the same transaction, and stamps `contributorAccounts.rewardLedger`.
 * After that the legacy fields are a frozen historical record and nothing
 * writes them again. Historical awards are not replayed as new awards.
 */

export const POINT_ACCOUNTS = 'contributorPointAccounts';
export const LEDGER = 'pointLedger';

export type LedgerType =
  | 'opening_balance'
  | 'award'
  | 'award_adjustment'
  | 'reservation'
  | 'release'
  | 'settlement'
  | 'legacy_refund'
  | 'legacy_settlement'
  | 'adjustment';

export interface PointAccountState {
  available: number;
  reserved: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  /** Points that left `rewardBalance` through legacy requests before the ledger opened (pending or delivered). */
  legacyCommittedPoints: number;
  entryCount: number;
}

export interface NewEntry {
  id: string;
  type: LedgerType;
  points: number;
  reason: string;
  actor: { kind: 'system' | 'validator' | 'finance' | 'contributor' | 'migration'; id: string };
  refs?: Record<string, string | number | null>;
  policy?: { id: string; version: number } | null;
}

export interface LedgerEntry extends NewEntry {
  contributorId: string;
  availableDelta: number;
  reservedDelta: number;
  after: Pick<PointAccountState, 'available' | 'reserved' | 'lifetimeEarned' | 'lifetimeRedeemed'>;
  sequence: number;
  createdAt: string;
}

export class LedgerError extends Error {
  constructor(public readonly code: 'insufficient-points' | 'insufficient-reserved' | 'invalid-entry' | 'already-open', message: string) {
    super(message);
  }
}

export const EMPTY_ACCOUNT: PointAccountState = {
  available: 0, reserved: 0, lifetimeEarned: 0, lifetimeRedeemed: 0, legacyCommittedPoints: 0, entryCount: 0,
};

/** Entry ids are readable and deterministic; long refs are hashed to stay within Firestore's id limits. */
export function entryId(type: string, ref: string): string {
  const safe = ref.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${type}_${safe.length > 100 ? createHash('sha256').update(ref).digest('hex').slice(0, 40) : safe}`;
}

/** How one entry moves the two balances. Pure; throws instead of letting a balance go negative. */
export function applyEntry(state: PointAccountState, type: LedgerType, points: number): { next: PointAccountState; availableDelta: number; reservedDelta: number } {
  if (!Number.isSafeInteger(points)) throw new LedgerError('invalid-entry', 'Points must be whole numbers.');
  const next = { ...state, entryCount: state.entryCount + 1 };
  let availableDelta = 0, reservedDelta = 0;
  const positive = () => { if (points <= 0) throw new LedgerError('invalid-entry', `${type} needs a positive amount.`); };
  switch (type) {
    case 'opening_balance':
      if (state.entryCount !== 0) throw new LedgerError('already-open', 'This account already has an opening balance.');
      if (points < 0) throw new LedgerError('invalid-entry', 'An opening balance cannot be negative.');
      availableDelta = points;
      break;
    case 'award':
      positive(); availableDelta = points; next.lifetimeEarned += points;
      break;
    case 'award_adjustment':
    case 'adjustment':
      if (points === 0) throw new LedgerError('invalid-entry', 'An adjustment needs a non-zero amount.');
      if (state.available + points < 0) throw new LedgerError('insufficient-points', 'The adjustment is larger than the available balance.');
      availableDelta = points;
      if (type === 'award_adjustment') next.lifetimeEarned += points;
      break;
    case 'reservation':
      positive();
      if (state.available < points) throw new LedgerError('insufficient-points', `Only ${state.available} points are available.`);
      availableDelta = -points; reservedDelta = points;
      break;
    case 'release':
      positive();
      if (state.reserved < points) throw new LedgerError('insufficient-reserved', 'Those points are not reserved.');
      availableDelta = points; reservedDelta = -points;
      break;
    case 'settlement':
      positive();
      if (state.reserved < points) throw new LedgerError('insufficient-reserved', 'Those points are not reserved.');
      reservedDelta = -points; next.lifetimeRedeemed += points;
      break;
    case 'legacy_refund':
      // A legacy request deducted its points on submission; rejecting it after
      // the ledger opened returns them here instead of to `rewardBalance`.
      positive(); availableDelta = points; next.legacyCommittedPoints = Math.max(0, next.legacyCommittedPoints - points);
      break;
    case 'legacy_settlement':
      // Bookkeeping only: the points already left the balance before the ledger.
      positive(); next.lifetimeRedeemed += points; next.legacyCommittedPoints = Math.max(0, next.legacyCommittedPoints - points);
      break;
    default:
      throw new LedgerError('invalid-entry', 'Unknown ledger entry type.');
  }
  next.available += availableDelta;
  next.reserved += reservedDelta;
  return { next, availableDelta, reservedDelta };
}

export function readAccountState(data: Record<string, unknown> | undefined): PointAccountState {
  const n = (key: keyof PointAccountState) => (Number.isSafeInteger(data?.[key]) ? Number(data?.[key]) : 0);
  return { available: n('available'), reserved: n('reserved'), lifetimeEarned: n('lifetimeEarned'),
    lifetimeRedeemed: n('lifetimeRedeemed'), legacyCommittedPoints: n('legacyCommittedPoints'), entryCount: n('entryCount') };
}

/** The opening entry an unmigrated account would receive from its legacy fields. */
export function openingFromLegacy(legacy: Record<string, unknown> | undefined) {
  const balance = Number(legacy?.rewardBalance ?? 0);
  const lifetime = Number(legacy?.rewardLifetime ?? 0);
  const problems: string[] = [];
  const available = Number.isSafeInteger(balance) && balance >= 0 ? balance : 0;
  if (!(Number.isSafeInteger(balance) && balance >= 0)) problems.push(`rewardBalance is ${JSON.stringify(legacy?.rewardBalance)}; opened at 0 for Finance review`);
  const earned = Number.isSafeInteger(lifetime) && lifetime >= 0 ? lifetime : available;
  if (!(Number.isSafeInteger(lifetime) && lifetime >= 0)) problems.push('rewardLifetime missing or invalid; lifetime set to the balance');
  if (earned < available) problems.push('rewardLifetime is below rewardBalance');
  return { available, lifetimeEarned: Math.max(earned, available), legacyCommittedPoints: Math.max(0, earned - available), problems };
}

export interface LedgerSession {
  db: Firestore;
  tx: Transaction;
  uid: string;
  accountRef: DocumentReference;
  legacyRef: DocumentReference;
  state: PointAccountState;
  /** True when the summary document already existed at read time. */
  opened: boolean;
  legacyActive: boolean;
  legacyExists: boolean;
  pending: LedgerEntry[];
  now: string;
}

/**
 * Reads the account (opening it lazily from legacy fields if needed). Call it
 * before any write in the transaction; Firestore requires reads first.
 */
export async function openLedger(db: Firestore, tx: Transaction, uid: string, now = new Date().toISOString()): Promise<LedgerSession> {
  const accountRef = db.collection(POINT_ACCOUNTS).doc(uid);
  const legacyRef = db.collection('contributorAccounts').doc(uid);
  const [account, legacy] = await Promise.all([tx.get(accountRef), tx.get(legacyRef)]);
  const session: LedgerSession = {
    db, tx, uid, accountRef, legacyRef, now, pending: [],
    state: account.exists ? readAccountState(account.data()) : { ...EMPTY_ACCOUNT },
    opened: account.exists, legacyActive: legacy.get('status') === 'active', legacyExists: legacy.exists,
  };
  if (!account.exists) {
    const opening = openingFromLegacy(legacy.data());
    post(session, {
      id: entryId('opening', uid), type: 'opening_balance', points: opening.available,
      reason: legacy.exists ? 'Opening balance carried over from the previous points system.' : 'New points account.',
      actor: { kind: 'migration', id: 'points-ledger' },
      refs: { legacyRewardBalance: legacy.exists ? Number(legacy.get('rewardBalance') ?? 0) : null,
        legacyRewardLifetime: legacy.exists ? Number(legacy.get('rewardLifetime') ?? 0) : null,
        discrepancy: opening.problems.join('; ') || null },
    });
    session.state.lifetimeEarned = opening.lifetimeEarned;
    session.state.legacyCommittedPoints = opening.legacyCommittedPoints;
    session.pending[0].after.lifetimeEarned = opening.lifetimeEarned;
  }
  return session;
}

/** Queues one entry and moves the in-memory balance. Nothing is written until [commitLedger]. */
export function post(session: LedgerSession, entry: NewEntry): LedgerEntry {
  const { next, availableDelta, reservedDelta } = applyEntry(session.state, entry.type, entry.points);
  session.state = next;
  const row: LedgerEntry = {
    ...entry, refs: entry.refs ?? {}, policy: entry.policy ?? null,
    contributorId: session.uid, availableDelta, reservedDelta, sequence: next.entryCount, createdAt: session.now,
    after: { available: next.available, reserved: next.reserved, lifetimeEarned: next.lifetimeEarned, lifetimeRedeemed: next.lifetimeRedeemed },
  };
  session.pending.push(row);
  return row;
}

/** Writes the queued entries (create: an existing id aborts the transaction) and the summary. */
export function commitLedger(session: LedgerSession): void {
  if (!session.pending.length) return;
  for (const row of session.pending) session.tx.create(session.db.collection(LEDGER).doc(row.id), row);
  session.tx.set(session.accountRef, {
    uid: session.uid, ...session.state, updatedAt: session.now, lastEntryId: session.pending.at(-1)!.id,
    ...(session.opened ? {} : { openedAt: session.now }),
  });
  if (!session.opened && session.legacyExists) {
    // Marks the legacy fields as frozen from this moment.
    session.tx.set(session.legacyRef, { rewardLedger: { openedAt: session.now, openingEntryId: session.pending[0].id } }, { merge: true });
  }
  session.pending = [];
  session.opened = true;
}

export function ledgerEntryRef(db: Firestore, id: string) {
  return db.collection(LEDGER).doc(id);
}
