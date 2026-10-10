import { createHash, randomBytes } from 'node:crypto';
import { AggregateField, getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { auditEntry, hasFinanceAccess, requireFinance } from './contributor-common.js';
import { consumeRateLimit } from './rate-limit.js';
import { normalizeMsisdn } from './sms.js';
import {
  LEDGER,
  LedgerError,
  POINT_ACCOUNTS,
  commitLedger,
  entryId,
  ledgerEntryRef,
  openLedger,
  openingFromLegacy,
  post,
  readAccountState,
  type LedgerType,
} from './points-ledger.js';
import {
  type AwardPolicyConfig,
  type DataBundle,
  type Network,
  type PolicyRecord,
  type RedemptionPolicyConfig,
  PolicyError,
  REWARD_CATEGORIES,
  bundlePoints,
  computeAward,
  formatGhs,
  liabilityEstimate,
  parseAwardPolicy,
  parseRedemptionPolicy,
  quotePoints,
} from './reward-policy.js';
import { AUDIT_DOMAIN, POLICIES, SYSTEM_DOC, type RewardFlags, loadRewardSystem, readFlags, rewardAudit } from './reward-system.js';
import { ASSESSMENTS, contributorAssessmentView, settleEligibleAwards } from './reward-assessment.js';

/**
 * Contributor points: balances, redemptions and the Finance desk.
 *
 * ── Redemption, end to end ─────────────────────────────────────────────────
 * 1. `quoteContributorRedemption` prices an exact number of points under the
 *    active, versioned rate policy and stores the quote for a few minutes.
 * 2. `redeemContributorPoints` accepts THAT quote: in one transaction it checks
 *    the quote (owner, unused, unexpired, same policy version), the balance,
 *    the open-request limit and the monthly budget, reserves the points in the
 *    ledger and records the request with the agreed value. A repeat of the
 *    same idempotency key returns the same request.
 * 3. Finance approves, then records the outcome of the manual top-up:
 *    delivered (settles the reservation), definitively failed (releases it),
 *    or ambiguous (keeps it reserved until reconciled — a late success can
 *    never be paid AND refunded). Rejection and contributor cancellation
 *    release. Every movement has a deterministic ledger id, so it happens once.
 *
 * Nothing here sends airtime or data. There is no provider integration; the
 * only fulfilment path is a person in Finance topping up and recording the
 * reference. The UI never marks a request delivered on its own.
 *
 * Legacy requests (made before the ledger, no `settlementPath`) keep their
 * original agreed value; their points were deducted from `rewardBalance` on
 * submission, so a rejection returns them as `legacy_refund` and a delivery is
 * booked as `legacy_settlement`.
 */

const options = { region: 'us-central1', invoker: 'public' as const,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };

type Json = Record<string, unknown>;

/* ── Legacy flat settings (used only while awardMode is 'legacy-flat') ────── */

const legacyDefaults = { pointsPerExpression: 10, dailyCap: 300, redemptionMinimum: 300, cedisPerRedemption: 5 };
export function rewardSettings(value: Record<string, unknown> = {}) {
  const settings = { ...legacyDefaults };
  for (const key of Object.keys(legacyDefaults) as (keyof typeof legacyDefaults)[]) {
    if (value[key] !== undefined) settings[key] = value[key] as number;
  }
  for (const [key, amount] of Object.entries(settings)) {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) throw new HttpsError('invalid-argument', `Invalid ${key}.`);
  }
  if (settings.dailyCap < settings.pointsPerExpression) throw new HttpsError('invalid-argument', 'Daily cap must cover one expression.');
  return settings;
}

export const setContributorRewardSettings = onCall(options, async req => {
  const actor = requireFinance(req);
  const settings = rewardSettings(req.data ?? {});
  const db = getFirestore();
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const before = await tx.get(db.doc('settings/contributorRewards'));
    tx.set(before.ref, { ...settings, updatedAt: now, updatedBy: actor });
    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, { id: auditRef.id, ...rewardAudit({ actor: { collection: 'staff', id: actor }, action: 'contributor.reward.legacy-settings.save',
      target: { collection: 'settings', id: 'contributorRewards' }, before: before.data() ?? null, after: settings, at: now }) });
  });
  return settings;
});

function toHttps(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof PolicyError) throw new HttpsError('invalid-argument', error.message, { field: error.field });
  if (error instanceof LedgerError) throw new HttpsError('failed-precondition', error.message, { reason: error.code });
  throw error;
}

/* ── Redemption state machine (pure) ─────────────────────────────────────── */

/** How many requests the staff desk loads at once, newest first. */
export const REDEMPTION_PAGE = 500;
export const REDEMPTION_STATUSES = ['submitted', 'approved', 'needs_reconciliation', 'fulfilled', 'failed', 'rejected', 'cancelled'] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];
export const OPEN_STATUSES: RedemptionStatus[] = ['submitted', 'approved', 'needs_reconciliation'];
export type RedemptionAction = 'approve' | 'reject' | 'fulfill' | 'fail' | 'mark_ambiguous' | 'cancel';
export type Movement = 'release' | 'settle' | null;

/**
 * The only moves a redemption may make, and the one ledger movement each
 * causes. `needs_reconciliation` holds the reservation: points come back only
 * on a definitive failure, never on a timeout.
 */
export function redemptionTransition(status: string, action: RedemptionAction): { next: RedemptionStatus; movement: Movement } | null {
  switch (action) {
    case 'approve': return status === 'submitted' ? { next: 'approved', movement: null } : null;
    case 'reject': return status === 'submitted' || status === 'approved' ? { next: 'rejected', movement: 'release' } : null;
    case 'cancel': return status === 'submitted' ? { next: 'cancelled', movement: 'release' } : null;
    case 'fulfill': return status === 'approved' || status === 'needs_reconciliation' ? { next: 'fulfilled', movement: 'settle' } : null;
    case 'fail': return status === 'approved' || status === 'needs_reconciliation' ? { next: 'failed', movement: 'release' } : null;
    case 'mark_ambiguous': return status === 'approved' ? { next: 'needs_reconciliation', movement: null } : null;
    default: return null;
  }
}

/**
 * How a provider outcome maps onto the machine. Used by Finance's manual
 * records today and by any future provider callback: repeats are no-ops, and
 * an outcome that contradicts a final state is a discrepancy for Finance, not
 * a second ledger movement.
 */
export function providerOutcome(status: string, outcome: 'delivered' | 'failed' | 'timeout'): { action: RedemptionAction | null; discrepancy: string | null } {
  if (outcome === 'timeout') return { action: status === 'approved' ? 'mark_ambiguous' : null, discrepancy: null };
  if (outcome === 'delivered') {
    if (status === 'approved' || status === 'needs_reconciliation') return { action: 'fulfill', discrepancy: null };
    if (status === 'fulfilled') return { action: null, discrepancy: null };
    return { action: null, discrepancy: ['failed', 'rejected', 'cancelled'].includes(status) ? 'late-success-after-release' : 'delivered-before-approval' };
  }
  if (status === 'approved' || status === 'needs_reconciliation') return { action: 'fail', discrepancy: null };
  if (status === 'failed') return { action: null, discrepancy: null };
  return { action: null, discrepancy: status === 'fulfilled' ? 'failure-after-delivery' : null };
}

export function settlementPathOf(request: Json): 'ledger-v1' | 'legacy' {
  return request.settlementPath === 'ledger-v1' ? 'ledger-v1' : 'legacy';
}

export function ledgerTypeFor(path: 'ledger-v1' | 'legacy', movement: 'release' | 'settle'): LedgerType {
  if (path === 'ledger-v1') return movement === 'release' ? 'release' : 'settlement';
  return movement === 'release' ? 'legacy_refund' : 'legacy_settlement';
}

/* ── Public policy views ─────────────────────────────────────────────────── */

export function publicRedemptionPolicy(record: PolicyRecord<RedemptionPolicyConfig>) {
  const c = record.config;
  return {
    id: record.id, version: record.version, basis: record.basis,
    basePoints: c.basePoints, baseAmountMinor: c.baseAmountMinor, bands: c.bands,
    minimumPoints: c.minimumPoints, maximumPoints: c.maximumPoints, quoteTtlSeconds: c.quoteTtlSeconds,
    airtime: c.airtime,
    dataBundles: c.dataBundles.map(bundle => ({ ...bundle, ...bundlePoints(bundle, c)! })),
    examples: [300, 900, 1800, 3000].filter(p => p >= c.minimumPoints && p <= c.maximumPoints).map(p => quotePoints(p, c)),
  };
}

export function publicAwardPolicy(record: PolicyRecord<AwardPolicyConfig>) {
  return {
    id: record.id, version: record.version, basis: record.basis, bands: record.config.bands,
    categories: REWARD_CATEGORIES.filter(key => record.config.categories[key].enabled).map(key => {
      const c = record.config.categories[key];
      return { key, label: c.label, basePoints: c.basePoints, minPoints: c.minPoints, maxPoints: c.maxPoints, note: c.note,
        examples: record.config.bands.map(band => ({ band: band.label, multiplierBps: band.multiplierBps,
          points: computeAward(record.config, key, { accuracy: band.minScore, completeness: band.minScore, technical: band.minScore, metadata: band.minScore }).points })) };
    }),
  };
}

/* ── Balances ────────────────────────────────────────────────────────────── */

async function balanceOf(db: Firestore, uid: string) {
  const [account, legacy] = await Promise.all([db.collection(POINT_ACCOUNTS).doc(uid).get(), db.doc(`contributorAccounts/${uid}`).get()]);
  if (account.exists) return { ...readAccountState(account.data()), ledgerOpen: true, legacy };
  const opening = openingFromLegacy(legacy.data());
  return { available: opening.available, reserved: 0, lifetimeEarned: opening.lifetimeEarned, lifetimeRedeemed: 0,
    legacyCommittedPoints: opening.legacyCommittedPoints, entryCount: 0, ledgerOpen: false, legacy };
}

function requestView(id: string, data: Json) {
  const quote = (data.quote ?? null) as Json | null;
  return {
    id, contributorId: String(data.contributorId ?? ''), status: String(data.status ?? ''), settlementPath: settlementPathOf(data),
    points: Number(data.points ?? 0), amountMinor: Number(data.amountMinor ?? 0), currency: 'GHS',
    baseMinor: quote ? Number(quote.baseMinor) : null, bonusMinor: quote ? Number(quote.bonusMinor) : null,
    kind: data.kind, network: data.network, phoneNumber: data.phoneNumber, bundle: data.bundle ?? null,
    description: String(data.description ?? ''), createdAt: String(data.createdAt ?? ''), updatedAt: String(data.updatedAt ?? ''),
    decidedAt: data.decidedAt ?? null, paidAt: data.paidAt ?? null, paymentReference: String(data.paymentReference ?? ''),
    providerReference: String(data.providerReference ?? ''), adminNote: String(data.adminNote ?? ''),
    policyId: quote ? String(quote.policyId) : null, policyVersion: quote ? Number(quote.policyVersion) : null,
    history: Array.isArray(data.history) ? data.history : [], discrepancy: data.discrepancy ?? null,
  };
}

export const getContributorRewards = onCall(options, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('getContributorRewards', uid, 60);
  const db = getFirestore();
  const [balance, system, legacySettings, requests, assessments] = await Promise.all([
    balanceOf(db, uid), loadRewardSystem(db), db.doc('settings/contributorRewards').get(),
    db.collection('contributorRedemptions').where('contributorId', '==', uid).limit(100).get(),
    db.collection(ASSESSMENTS).where('contributorId', '==', uid).orderBy('createdAt', 'desc').limit(60).get(),
  ]);
  if (balance.legacy.get('status') !== 'active') throw new HttpsError('permission-denied', 'An active contributor account is required.');
  const account = balance.legacy;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const lastDay = String(account.get('streakLastDay') ?? '');
  const awards = assessments.docs.map(doc => contributorAssessmentView({ id: doc.id, data: doc.data() }));
  const pending = awards.filter(a => a.estimate || a.status === 'eligible');
  const legacy = rewardSettings(legacySettings.data() ?? {});
  return {
    mode: system.flags,
    balance: { available: balance.available, reserved: balance.reserved, lifetimeEarned: balance.lifetimeEarned,
      lifetimeRedeemed: balance.lifetimeRedeemed, ledgerOpen: balance.ledgerOpen,
      pendingEstimate: pending.reduce((sum, a) => sum + (a.estimate?.points ?? 0), 0), pendingCount: pending.length },
    awards,
    redemptionPolicy: publicRedemptionPolicy(system.redemption),
    awardPolicy: publicAwardPolicy(system.award),
    legacyAward: system.flags.awardMode === 'legacy-flat' ? { pointsPerExpression: legacy.pointsPerExpression, dailyCap: legacy.dailyCap } : null,
    // Kept so an older TribeStudio bundle still renders during a deploy.
    rewards: { ...legacy, balance: balance.available, lifetime: balance.lifetimeEarned },
    streak: { current: lastDay === today || lastDay === yesterday ? Number(account.get('streakCount') ?? 0) : 0,
      best: Number(account.get('streakBest') ?? 0), lastDay, activeToday: lastDay === today },
    requests: requests.docs.filter(row => ['airtime', 'data'].includes(String(row.get('kind'))))
      .map(row => requestView(row.id, row.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
});

/* ── Quotes and redemption ───────────────────────────────────────────────── */

export const QUOTES = 'redemptionQuotes';
export const BUDGETS = 'rewardBudgets';

function chooseOffer(data: Json, policy: RedemptionPolicyConfig): { kind: 'airtime' | 'data'; network: Network; points: number; bundle: (DataBundle & { residualMinor: number }) | null } {
  const kind = data.kind;
  if (kind === 'airtime') {
    if (!policy.airtime.enabled) throw new HttpsError('failed-precondition', 'Airtime redemptions are paused.');
    const network = data.network as Network;
    if (!policy.airtime.networks.includes(network)) throw new HttpsError('invalid-argument', 'Choose a supported Ghana mobile network.');
    const points = data.points;
    if (typeof points !== 'number' || !Number.isSafeInteger(points) || points < policy.minimumPoints || points > policy.maximumPoints) {
      throw new HttpsError('invalid-argument', `Enter a whole number of points from ${policy.minimumPoints.toLocaleString('en-GB')} to ${policy.maximumPoints.toLocaleString('en-GB')}.`);
    }
    return { kind, network, points, bundle: null };
  }
  if (kind === 'data') {
    const bundle = policy.dataBundles.find(b => b.id === data.bundleId);
    if (!bundle) throw new HttpsError('invalid-argument', policy.dataBundles.length ? 'Choose one of the listed data bundles.' : 'Mobile data is not offered yet.');
    const priced = bundlePoints(bundle, policy);
    if (!priced) throw new HttpsError('failed-precondition', 'That bundle cannot be redeemed under the current rates.');
    return { kind, network: bundle.network, points: priced.points, bundle: { ...bundle, residualMinor: priced.residualMinor } };
  }
  throw new HttpsError('invalid-argument', 'Choose airtime or mobile data.');
}

export const quoteContributorRedemption = onCall(options, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('quoteContributorRedemption', uid, 60);
  const db = getFirestore();
  const [system, balance] = await Promise.all([loadRewardSystem(db), balanceOf(db, uid)]);
  if (balance.legacy.get('status') !== 'active') throw new HttpsError('permission-denied', 'An active contributor account is required.');
  if (!system.flags.redemptionsOpen) throw new HttpsError('failed-precondition', 'New redemptions are paused by Finance. Your points are safe.');
  const offer = chooseOffer((req.data ?? {}) as Json, system.redemption.config);
  if (offer.points > balance.available) throw new HttpsError('failed-precondition', `You have ${balance.available.toLocaleString('en-GB')} points available.`);
  const quote = quotePoints(offer.points, system.redemption.config);
  const now = new Date();
  const ref = db.collection(QUOTES).doc(randomBytes(12).toString('hex'));
  const expiresAt = new Date(now.getTime() + system.redemption.config.quoteTtlSeconds * 1000).toISOString();
  const stored = { id: ref.id, contributorId: uid, kind: offer.kind, network: offer.network, points: offer.points, bundle: offer.bundle,
    quote: { ...quote, policyId: system.redemption.id, policyVersion: system.redemption.version }, createdAt: now.toISOString(), expiresAt, used: false };
  await ref.create(stored);
  return { quoteId: ref.id, expiresAt, kind: offer.kind, network: offer.network, bundle: offer.bundle,
    ...quote, policyId: system.redemption.id, policyVersion: system.redemption.version,
    remainingAfter: balance.available - offer.points };
});

function monthOf(iso: string) { return iso.slice(0, 7); }

export const redeemContributorPoints = onCall(options, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('redeemContributorPoints', uid, 10);
  const data = (req.data ?? {}) as Json;
  if (typeof data.quoteId !== 'string') {
    throw new HttpsError('failed-precondition', 'Redemptions now show the exact value before you confirm. Reload this page to continue.');
  }
  const quoteId = data.quoteId;
  const key = String(data.idempotencyKey ?? '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(quoteId) || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new HttpsError('invalid-argument', 'Invalid request.');
  const phoneNumber = `+${normalizeMsisdn(String(data.phoneNumber ?? ""))}`;
  if (!/^\+233\d{9}$/.test(phoneNumber)) throw new HttpsError('invalid-argument', 'Enter a Ghana mobile number.');
  const db = getFirestore();
  const requestId = createHash('sha256').update(`${uid}:${key}`).digest('hex').slice(0, 32);
  const requestRef = db.collection('contributorRedemptions').doc(requestId);
  const quoteRef = db.collection(QUOTES).doc(quoteId);
  const now = new Date().toISOString();
  try {
    return await db.runTransaction(async tx => {
      const existing = await tx.get(requestRef);
      if (existing.exists) {
        if (existing.get('contributorId') !== uid) throw new HttpsError('permission-denied', 'Invalid request.');
        return { requestId, status: String(existing.get('status')), replayed: true };
      }
      const [quoteSnap, system, open] = await Promise.all([
        tx.get(quoteRef), loadRewardSystem(db, tx),
        tx.get(db.collection('contributorRedemptions').where('contributorId', '==', uid).where('status', 'in', OPEN_STATUSES).limit(1)),
      ]);
      const budgetRef = db.collection(BUDGETS).doc(monthOf(now));
      const budget = await tx.get(budgetRef);
      const session = await openLedger(db, tx, uid, now);
      if (!session.legacyActive) throw new HttpsError('permission-denied', 'An active contributor account is required.');
      if (!system.flags.redemptionsOpen) throw new HttpsError('failed-precondition', 'New redemptions are paused by Finance. Your points are safe.');
      const quote = quoteSnap.data() as Json | undefined;
      if (!quote || quote.contributorId !== uid) throw new HttpsError('not-found', 'That quote was not found. Review the amount again.');
      if (quote.used === true) throw new HttpsError('aborted', 'That quote was already used. Review the amount again.');
      if (String(quote.expiresAt ?? '') < now) throw new HttpsError('aborted', 'That quote expired. Review the amount again to see the current value.');
      const q = quote.quote as Json;
      if (q.policyId !== system.redemption.id || q.policyVersion !== system.redemption.version) {
        throw new HttpsError('aborted', 'Finance updated the redemption rates after this quote. Review the new amount before confirming.');
      }
      if (!open.empty) throw new HttpsError('failed-precondition', 'You already have a redemption being processed. You can request another once it is delivered or closed.');
      const amountMinor = Number(q.totalMinor);
      const cap = system.redemption.config.monthlyBudgetMinor;
      const committed = Number(budget.get('committedMinor') ?? 0);
      if (cap !== null && committed + amountMinor > cap) {
        throw new HttpsError('resource-exhausted', 'This month’s redemption budget is fully committed. Your points are safe; please try again next month.');
      }
      const points = Number(quote.points);
      const reserve = post(session, { id: entryId('reserve', requestId), type: 'reservation', points,
        reason: `Reserved for redemption ${requestId.slice(0, 10)}.`, actor: { kind: 'contributor', id: uid },
        policy: { id: String(q.policyId), version: Number(q.policyVersion) }, refs: { redemptionId: requestId, quoteId } });
      const bundle = quote.bundle as Json | null;
      tx.create(requestRef, {
        id: requestId, contributorId: uid, settlementPath: 'ledger-v1', status: 'submitted', idempotencyKey: key,
        points, amountMinor, currency: 'GHS', kind: quote.kind, network: quote.network, phoneNumber, bundle,
        description: bundle ? `${points} points for ${String(bundle.label)}` : `${points} points for ${formatGhs(amountMinor)} ${String(quote.network)} airtime`,
        quote: { quoteId, policyId: q.policyId, policyVersion: q.policyVersion, baseMinor: q.baseMinor, bonusMinor: q.bonusMinor, totalMinor: q.totalMinor, bands: q.bands, acceptedAt: now },
        ledger: { reserveEntryId: reserve.id }, history: [{ status: 'submitted', at: now, actor: 'contributor' }],
        createdAt: now, updatedAt: now, decidedAt: null, decidedBy: null, paidAt: null, paymentReference: '', providerReference: '', adminNote: '',
      });
      tx.update(quoteRef, { used: true, usedAt: now, requestId });
      tx.set(budgetRef, { month: monthOf(now), committedMinor: committed + amountMinor, updatedAt: now }, { merge: true });
      commitLedger(session);
      return { requestId, status: 'submitted', replayed: false, amountMinor, points };
    });
  } catch (error) { toHttps(error); }
});

/* ── Decisions (Finance) and cancellation (contributor) ──────────────────── */

const ACTIONS: RedemptionAction[] = ['approve', 'reject', 'fulfill', 'fail', 'mark_ambiguous', 'cancel'];

/** One transition with its single ledger movement, budget release and audit row. */
async function transition(db: Firestore, tx: Transaction, input: {
  requestId: string; action: RedemptionAction; actor: string; actorKind: 'finance' | 'contributor'; note: string;
  paymentReference: string; providerReference: string; expectedStatus: string | null; now: string; ownerOnly?: string;
}) {
  const ref = db.collection('contributorRedemptions').doc(input.requestId);
  const request = await tx.get(ref);
  if (!request.exists || !['airtime', 'data'].includes(String(request.get('kind')))) throw new HttpsError('not-found', 'Redemption not found.');
  const data = request.data() as Json;
  if (input.ownerOnly && data.contributorId !== input.ownerOnly) throw new HttpsError('not-found', 'Redemption not found.');
  const status = String(data.status);
  const target = redemptionTransition(status, input.action);
  // A repeated identical decision (double click, retried call) is answered, not re-applied.
  if (!target && input.action === 'fulfill' && status === 'fulfilled' && data.paymentReference === input.paymentReference) {
    return { status, movement: null, replayed: true, points: Number(data.points ?? 0) };
  }
  if (input.expectedStatus !== null && input.expectedStatus !== status) {
    throw new HttpsError('aborted', 'This request was updated by someone else. Reload it before deciding.');
  }
  if (!target) throw new HttpsError('failed-precondition', 'This redemption is no longer in a state that allows that action.');
  const path = settlementPathOf(data);
  const points = Number(data.points ?? 0);
  const contributorId = String(data.contributorId);
  const createdMonth = monthOf(String(data.createdAt ?? input.now));
  const budgetRef = db.collection(BUDGETS).doc(createdMonth);
  let movementEntry: string | null = null;
  let session: Awaited<ReturnType<typeof openLedger>> | null = null;
  let budget: FirebaseFirestore.DocumentSnapshot | null = null;
  if (target.movement) {
    const id = entryId(target.movement === 'release' ? 'release' : 'settle', input.requestId);
    const [entry, budgetSnap] = await Promise.all([tx.get(ledgerEntryRef(db, id)), path === 'ledger-v1' && target.movement === 'release' ? tx.get(budgetRef) : Promise.resolve(null)]);
    budget = budgetSnap;
    session = await openLedger(db, tx, contributorId, input.now);
    if (!entry.exists) {
      post(session, { id, type: ledgerTypeFor(path, target.movement), points,
        reason: target.movement === 'release' ? `Points returned: request ${input.action === 'cancel' ? 'cancelled' : input.action === 'fail' ? 'failed' : 'rejected'}.` : 'Reward delivered.',
        actor: { kind: input.actorKind, id: input.actor }, refs: { redemptionId: input.requestId, settlementPath: path } });
      movementEntry = id;
    }
  }
  const history = [...((data.history as unknown[] | undefined) ?? []).slice(-48), { status: target.next, at: input.now, actor: input.actorKind, note: input.note.slice(0, 200) }];
  tx.update(ref, {
    status: target.next, updatedAt: input.now, history,
    ...(input.actorKind === 'finance' ? { decidedBy: input.actor } : {}),
    ...(input.note ? { adminNote: input.note } : {}),
    ...(['approve', 'reject', 'cancel'].includes(input.action) ? { decidedAt: input.now } : {}),
    ...(input.action === 'fulfill' ? { paidAt: input.now, paymentReference: input.paymentReference, providerReference: input.providerReference } : {}),
    ...(movementEntry ? { [`ledger.${target.movement === 'release' ? 'releaseEntryId' : 'settleEntryId'}`]: movementEntry } : {}),
  });
  if (budget) tx.set(budgetRef, { month: createdMonth, committedMinor: Math.max(0, Number(budget.get('committedMinor') ?? 0) - Number(data.amountMinor ?? 0)), updatedAt: input.now }, { merge: true });
  if (session) commitLedger(session);
  const auditRef = db.collection('auditLogs').doc();
  tx.set(auditRef, { id: auditRef.id, requestId: input.requestId, at: input.now,
    ...auditEntry({ actor: input.actor, action: `contributor.redemption.${input.action}`, target: input.requestId, targetCollection: 'contributorRedemptions',
      before: { status }, after: { status: target.next }, at: input.now,
      metadata: { contributorId, points, amountMinor: Number(data.amountMinor ?? 0), settlementPath: path, ledgerEntry: movementEntry,
        ...(input.action === 'fulfill' ? { paymentReference: input.paymentReference } : {}) } }),
    domain: AUDIT_DOMAIN, actor: { collection: input.actorKind === 'finance' ? 'staff' : 'contributors', id: input.actor } });
  return { status: target.next, movement: target.movement, replayed: false, points };
}

export const decideContributorRedemption = onCall(options, async req => {
  const actor = requireFinance(req);
  await consumeRateLimit('decideContributorRedemption', actor, 120);
  const data = (req.data ?? {}) as Json;
  const requestId = String(data.requestId ?? '');
  const action = data.action as RedemptionAction;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Invalid request.');
  if (!ACTIONS.includes(action) || action === 'cancel') throw new HttpsError('invalid-argument', 'Unsupported action.');
  const note = typeof data.note === 'string' ? data.note.trim() : '';
  const paymentReference = typeof data.paymentReference === 'string' ? data.paymentReference.trim() : '';
  const providerReference = typeof data.providerReference === 'string' ? data.providerReference.trim() : '';
  const expectedStatus = typeof data.expectedStatus === 'string' ? data.expectedStatus : null;
  if (note.length > 1000 || paymentReference.length > 160 || providerReference.length > 160) throw new HttpsError('invalid-argument', 'Note or reference is too long.');
  if (action === 'reject' && !note) throw new HttpsError('invalid-argument', 'Add a reason for rejection.');
  if (action === 'fulfill' && !paymentReference) throw new HttpsError('invalid-argument', 'Add a delivery reference.');
  if (action === 'fail' && (data.definitive !== true || note.length < 10)) {
    throw new HttpsError('invalid-argument', 'Record a failure only when the provider confirmed nothing was delivered, with the reason (at least 10 characters). If unsure, mark it as needing reconciliation.');
  }
  if (action === 'mark_ambiguous' && note.length < 10) throw new HttpsError('invalid-argument', 'Describe what is unclear (at least 10 characters).');
  const db = getFirestore();
  const now = new Date().toISOString();
  try {
    const outcome = await db.runTransaction(tx => transition(db, tx, { requestId, action, actor, actorKind: 'finance', note, paymentReference, providerReference, expectedStatus, now }));
    return { requestId, status: outcome.status, pointsReturned: outcome.movement === 'release' ? outcome.points : 0, replayed: outcome.replayed };
  } catch (error) { toHttps(error); }
});

export const cancelContributorRedemption = onCall(options, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('cancelContributorRedemption', uid, 10);
  const requestId = String(req.data?.requestId ?? '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Invalid request.');
  const db = getFirestore();
  const now = new Date().toISOString();
  try {
    const outcome = await db.runTransaction(tx => transition(db, tx, { requestId, action: 'cancel', actor: uid, actorKind: 'contributor',
      note: 'Cancelled by the contributor.', paymentReference: '', providerReference: '', expectedStatus: null, now, ownerOnly: uid }));
    return { requestId, status: outcome.status, pointsReturned: outcome.points };
  } catch (error) { toHttps(error); }
});

/* ── Finance desk reads ──────────────────────────────────────────────────── */

async function outstandingBalances(db: Firestore) {
  const [accounts, legacy] = await Promise.all([
    db.collection(POINT_ACCOUNTS).limit(5000).get(),
    db.collection('contributorAccounts').limit(5000).get(),
  ]);
  const opened = new Set(accounts.docs.map(doc => doc.id));
  const available: number[] = [];
  let reserved = 0;
  for (const doc of accounts.docs) { const s = readAccountState(doc.data()); available.push(s.available); reserved += s.reserved; }
  let unopened = 0;
  for (const doc of legacy.docs) {
    if (opened.has(doc.id)) continue;
    const opening = openingFromLegacy(doc.data());
    if (opening.available > 0) { available.push(opening.available); unopened++; }
  }
  return { available, reserved, unopenedAccounts: unopened, truncated: accounts.size >= 5000 || legacy.size >= 5000 };
}

export const listContributorRewards = onCall(options, async req => {
  const actor = requireAuth(req);
  requireRole(req, 'admin');
  const db = getFirestore();
  const redemptions = db.collection('contributorRedemptions');
  const totals = await Promise.all(REDEMPTION_STATUSES.map(async status => {
    const result = await redemptions.where('kind', 'in', ['airtime', 'data']).where('status', '==', status)
      .aggregate({ count: AggregateField.count(), points: AggregateField.sum('points'), amountMinor: AggregateField.sum('amountMinor') })
      .get();
    const data = result.data();
    return [status, { count: Number(data.count ?? 0), points: Number(data.points ?? 0), amountMinor: Number(data.amountMinor ?? 0) }] as const;
  })).catch(error => {
    console.error('listContributorRewards: totals unavailable', error);
    return null;
  });
  if (req.data?.summaryOnly === true && totals) {
    return { summary: Object.fromEntries(totals), truncated: false, requests: [] };
  }
  const [system, legacySettings, requests, balances, pendingAwards] = await Promise.all([
    loadRewardSystem(db), db.doc('settings/contributorRewards').get(),
    redemptions.orderBy('createdAt', 'desc').limit(REDEMPTION_PAGE + 1).get(),
    outstandingBalances(db),
    Promise.all(['validator_review', 'eligible'].map(async status => {
      const field = status === 'eligible' ? 'award.points' : 'estimate.points';
      const r = await db.collection(ASSESSMENTS).where('status', '==', status).aggregate({ count: AggregateField.count(), points: AggregateField.sum(field) }).get();
      return [status, { count: Number(r.data().count ?? 0), points: Number(r.data().points ?? 0) }] as const;
    })).catch(() => null),
  ]);
  const rows = requests.docs.filter(row => ['airtime', 'data'].includes(String(row.get('kind')))).map(row => requestView(row.id, row.data()));
  const liability = liabilityEstimate(balances.available, system.redemption.config);
  const open = totals ? OPEN_STATUSES.reduce((sum, s) => sum + (Object.fromEntries(totals)[s]?.amountMinor ?? 0), 0) : null;
  return {
    flags: system.flags,
    awardPolicy: system.award, redemptionPolicy: system.redemption,
    rewards: rewardSettings(legacySettings.data() ?? {}),
    summary: totals ? Object.fromEntries(totals) : null,
    liability: { ...liability, reservedPoints: balances.reserved, openRequestsMinor: open, unopenedAccounts: balances.unopenedAccounts, truncated: balances.truncated },
    pendingAwards: pendingAwards ? Object.fromEntries(pendingAwards) : null,
    canDecide: hasFinanceAccess(req.auth?.token as Record<string, unknown> | undefined),
    viewer: actor,
    truncated: requests.size > REDEMPTION_PAGE,
    requests: rows.slice(0, REDEMPTION_PAGE),
  };
});

/* ── Policies and flags ──────────────────────────────────────────────────── */

export const getRewardPolicies = onCall(options, async req => {
  requireRole(req, 'admin');
  const db = getFirestore();
  const [system, history, agreed, disagreed] = await Promise.all([
    loadRewardSystem(db), db.collection(POLICIES).orderBy('createdAt', 'desc').limit(40).get(),
    db.collection(ASSESSMENTS).where('calibration.agreed', '==', true).count().get().catch(() => null),
    db.collection(ASSESSMENTS).where('calibration.agreed', '==', false).count().get().catch(() => null),
  ]);
  return {
    flags: system.flags, award: system.award, redemption: system.redemption,
    history: history.docs.map(doc => ({ id: doc.id, kind: doc.get('kind'), version: doc.get('version'), basis: doc.get('basis'),
      createdAt: doc.get('createdAt'), createdBy: doc.get('createdBy'), reason: doc.get('reason') })),
    calibration: { agreed: agreed?.data().count ?? null, disagreed: disagreed?.data().count ?? null,
      note: 'Agreement between the automatic recommendation and the validator’s band. Automated settlement stays off until Finance and validators review a labelled sample.' },
    canEdit: hasFinanceAccess(req.auth?.token as Record<string, unknown> | undefined),
  };
});

function parseFor(kind: unknown, config: unknown) {
  if (kind === 'award') return { kind: 'award' as const, config: parseAwardPolicy(config) };
  if (kind === 'redemption') return { kind: 'redemption' as const, config: parseRedemptionPolicy(config) };
  throw new HttpsError('invalid-argument', 'Choose the award or redemption policy.');
}

export const previewRewardPolicy = onCall(options, async req => {
  requireFinance(req);
  const data = (req.data ?? {}) as Json;
  try {
    const parsed = parseFor(data.kind, data.config);
    const db = getFirestore();
    const system = await loadRewardSystem(db);
    if (parsed.kind === 'redemption') {
      const balances = await outstandingBalances(db);
      const points = [...new Set([parsed.config.minimumPoints, 300, 900, 1800, 3000, parsed.config.maximumPoints])]
        .filter(p => p >= parsed.config.minimumPoints && p <= parsed.config.maximumPoints).sort((a, b) => a - b);
      return {
        kind: 'redemption',
        examples: points.map(p => ({ points: p, current: p >= system.redemption.config.minimumPoints && p <= system.redemption.config.maximumPoints ? quotePoints(p, system.redemption.config).totalMinor : null,
          proposed: quotePoints(p, parsed.config) })),
        liability: { current: liabilityEstimate(balances.available, system.redemption.config), proposed: liabilityEstimate(balances.available, parsed.config) },
        bundles: parsed.config.dataBundles.map(b => ({ ...b, ...bundlePoints(b, parsed.config)! })),
      };
    }
    const pending = await db.collection(ASSESSMENTS).where('status', 'in', ['validator_review', 'eligible']).limit(500).get();
    let current = 0, proposed = 0, counted = 0;
    for (const doc of pending.docs) {
      const scores = (doc.get('validator.scores') ?? null) as Json | null;
      const auto = doc.get('automated.result.dimensions') as Json | undefined;
      const s = scores ?? (auto ? Object.fromEntries(Object.entries(auto).map(([k, v]) => [k, (v as Json).score])) : null);
      const category = doc.get('category');
      if (!s || !REWARD_CATEGORIES.includes(category)) continue;
      try {
        current += computeAward(system.award.config, category, s as never).points;
        proposed += computeAward(parsed.config, category, s as never).points;
        counted++;
      } catch { /* rows without applicable scores are left out and counted below */ }
    }
    return {
      kind: 'award',
      categories: REWARD_CATEGORIES.map(key => ({ key, label: parsed.config.categories[key].label, enabled: parsed.config.categories[key].enabled,
        examples: parsed.config.bands.map(band => ({ band: band.label, minScore: band.minScore,
          current: computeAward(system.award.config, key, { accuracy: band.minScore, completeness: band.minScore, technical: band.minScore, metadata: band.minScore }).points,
          proposed: computeAward(parsed.config, key, { accuracy: band.minScore, completeness: band.minScore, technical: band.minScore, metadata: band.minScore }) })) })),
      pending: { assessments: pending.size, scored: counted, currentPoints: current, proposedPoints: proposed },
    };
  } catch (error) { toHttps(error); }
});

export const saveRewardPolicy = onCall(options, async req => {
  const actor = requireFinance(req);
  await consumeRateLimit('saveRewardPolicy', actor, 20);
  const data = (req.data ?? {}) as Json;
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (reason.length < 10 || reason.length > 1000) throw new HttpsError('invalid-argument', 'Explain the change (10–1,000 characters). It is kept in the audit history.');
  try {
    const parsed = parseFor(data.kind, data.config);
    const db = getFirestore();
    const now = new Date().toISOString();
    return await db.runTransaction(async tx => {
      const system = await loadRewardSystem(db, tx);
      const active = parsed.kind === 'award' ? system.award : system.redemption;
      if (data.expectedActiveId !== active.id) throw new HttpsError('aborted', 'Someone saved a newer version. Reload, review it, then make your change.');
      const version = active.version + 1;
      const ref = db.collection(POLICIES).doc(`${parsed.kind}-v${version}-${randomBytes(3).toString('hex')}`);
      const record = { id: ref.id, kind: parsed.kind, version, config: parsed.config, basis: 'finance-set', createdAt: now, createdBy: actor, reason, previousId: active.id };
      tx.create(ref, record);
      tx.set(db.doc(SYSTEM_DOC), { [parsed.kind === 'award' ? 'awardPolicyId' : 'redemptionPolicyId']: ref.id, updatedAt: now, updatedBy: actor }, { merge: true });
      const auditRef = db.collection('auditLogs').doc();
      tx.set(auditRef, { id: auditRef.id, ...rewardAudit({ actor: { collection: 'staff', id: actor }, action: `contributor.reward.policy.${parsed.kind}.save`,
        target: { collection: POLICIES, id: ref.id }, before: { id: active.id, version: active.version, config: active.config }, after: { id: ref.id, version, config: parsed.config }, reason, at: now }) });
      return { id: ref.id, version };
    });
  } catch (error) { toHttps(error); }
});

export const setRewardSystemFlags = onCall(options, async req => {
  const actor = requireFinance(req);
  const data = (req.data ?? {}) as Json;
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (reason.length < 10 || reason.length > 1000) throw new HttpsError('invalid-argument', 'Explain the change (10–1,000 characters).');
  if (data.automatedSettlement === true) throw new HttpsError('failed-precondition', 'Automated settlement is unavailable until a reviewer-labelled shadow calibration has been recorded.');
  const patch = (data.flags ?? {}) as Json;
  const db = getFirestore();
  const now = new Date().toISOString();
  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(db.doc(SYSTEM_DOC));
    const before = readFlags(snap.data());
    const next: RewardFlags = { ...before };
    if (patch.awardMode !== undefined) { if (!['legacy-flat', 'assessed'].includes(String(patch.awardMode))) throw new HttpsError('invalid-argument', 'Unknown award mode.'); next.awardMode = patch.awardMode as RewardFlags['awardMode']; }
    if (patch.assessmentWorker !== undefined) { if (!['off', 'on'].includes(String(patch.assessmentWorker))) throw new HttpsError('invalid-argument', 'Unknown worker setting.'); next.assessmentWorker = patch.assessmentWorker as RewardFlags['assessmentWorker']; }
    if (patch.redemptionsOpen !== undefined) { if (typeof patch.redemptionsOpen !== 'boolean') throw new HttpsError('invalid-argument', 'Redemptions open must be true or false.'); next.redemptionsOpen = patch.redemptionsOpen; }
    tx.set(db.doc(SYSTEM_DOC), { flags: next, updatedAt: now, updatedBy: actor }, { merge: true });
    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, { id: auditRef.id, ...rewardAudit({ actor: { collection: 'staff', id: actor }, action: 'contributor.reward.flags.save',
      target: { collection: 'settings', id: 'contributorRewardSystem' }, before, after: next, reason, at: now }) });
    return { before, next };
  });
  const settled = result.before.awardMode !== 'assessed' && result.next.awardMode === 'assessed' ? await settleEligibleAwards(db) : null;
  return { flags: result.next, settledOnSwitch: settled };
});

/* ── Ledger and adjustments ──────────────────────────────────────────────── */

export const getContributorPointsLedger = onCall(options, async req => {
  requireRole(req, 'admin');
  const uid = String(req.data?.contributorId ?? '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError('invalid-argument', 'Choose a contributor.');
  const db = getFirestore();
  const [balance, entries, assessments, requests] = await Promise.all([
    balanceOf(db, uid),
    db.collection(LEDGER).where('contributorId', '==', uid).orderBy('sequence', 'desc').limit(200).get(),
    db.collection(ASSESSMENTS).where('contributorId', '==', uid).orderBy('createdAt', 'desc').limit(50).get(),
    db.collection('contributorRedemptions').where('contributorId', '==', uid).limit(100).get(),
  ]);
  const { legacy, ...state } = balance;
  return {
    contributorId: uid, account: state,
    legacy: { rewardBalance: legacy.get('rewardBalance') ?? null, rewardLifetime: legacy.get('rewardLifetime') ?? null, rewardLedger: legacy.get('rewardLedger') ?? null },
    entries: entries.docs.map(doc => doc.data()),
    assessments: assessments.docs.map(doc => ({ ...contributorAssessmentView({ id: doc.id, data: doc.data() }), financeAttention: doc.get('financeAttention') ?? null })),
    requests: requests.docs.map(doc => requestView(doc.id, doc.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
});

export const adjustContributorPoints = onCall(options, async req => {
  const actor = requireFinance(req);
  await consumeRateLimit('adjustContributorPoints', actor, 30);
  const data = (req.data ?? {}) as Json;
  const uid = String(data.contributorId ?? '');
  const points = data.points;
  const key = String(data.idempotencyKey ?? '');
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new HttpsError('invalid-argument', 'Invalid request.');
  if (typeof points !== 'number' || !Number.isSafeInteger(points) || points === 0 || Math.abs(points) > 100000) throw new HttpsError('invalid-argument', 'Enter a non-zero whole number of points up to 100,000.');
  if (reason.length < 10 || reason.length > 1000) throw new HttpsError('invalid-argument', 'Give the reason (10–1,000 characters). It is shown in the ledger and audit history.');
  if (uid === actor) throw new HttpsError('permission-denied', 'You cannot adjust your own points.');
  const db = getFirestore();
  const now = new Date().toISOString();
  const id = entryId('adjust', `${uid}:${key}`);
  try {
    return await db.runTransaction(async tx => {
      const existing = await tx.get(ledgerEntryRef(db, id));
      if (existing.exists) return { entryId: id, replayed: true, after: existing.get('after') };
      const session = await openLedger(db, tx, uid, now);
      const entry = post(session, { id, type: 'adjustment', points, reason, actor: { kind: 'finance', id: actor },
        refs: { assessmentId: typeof data.assessmentId === 'string' ? data.assessmentId.slice(0, 128) : null } });
      commitLedger(session);
      const auditRef = db.collection('auditLogs').doc();
      tx.set(auditRef, { id: auditRef.id, ...rewardAudit({ actor: { collection: 'staff', id: actor }, action: 'contributor.reward.ledger.adjust',
        target: { collection: POINT_ACCOUNTS, id: uid }, before: null, after: entry.after, reason, at: now, metadata: { points, entryId: id } }) });
      return { entryId: id, replayed: false, after: entry.after };
    });
  } catch (error) { toHttps(error); }
});

export const listRewardAudit = onCall(options, async req => {
  requireRole(req, 'admin');
  const before = typeof req.data?.before === 'string' ? req.data.before : null;
  let query = getFirestore().collection('auditLogs').where('domain', '==', AUDIT_DOMAIN).orderBy('occurredAt', 'desc').limit(100);
  if (before) query = query.startAfter(before);
  const rows = await query.get();
  return { rows: rows.docs.map(doc => ({ id: doc.id, action: doc.get('action'), actor: doc.get('actor'), target: doc.get('target'),
    before: doc.get('before'), after: doc.get('after'), reason: doc.get('reason') ?? '', metadata: doc.get('metadata') ?? {}, occurredAt: doc.get('occurredAt') })) };
});


