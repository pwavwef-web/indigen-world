import { AggregateField, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { auditEntry } from './contributor-common.js';
import { consumeRateLimit } from './rate-limit.js';
import { normalizeMsisdn } from './sms.js';

const options = { region: 'us-central1', invoker: 'public' as const,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const defaults = { pointsPerExpression: 10, dailyCap: 300, redemptionMinimum: 300, cedisPerRedemption: 5 };
export function rewardSettings(value: Record<string, unknown> = {}) {
  const settings = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    if (value[key] !== undefined) settings[key] = value[key] as number;
  }
  for (const [key, amount] of Object.entries(settings)) {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) throw new HttpsError('invalid-argument', `Invalid ${key}.`);
  }
  if (settings.dailyCap < settings.pointsPerExpression) throw new HttpsError('invalid-argument', 'Daily cap must cover one expression.');
  return settings;
}

export const setContributorRewardSettings = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  const settings = rewardSettings(req.data ?? {});
  await getFirestore().doc('settings/contributorRewards').set({ ...settings,
    updatedAt: new Date().toISOString(), updatedBy: actor });
  return settings;
});

export const getContributorRewards = onCall(options, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('getContributorRewards', uid, 60);
  const db = getFirestore();
  const [account, settings, requests] = await Promise.all([
    db.doc(`contributorAccounts/${uid}`).get(), db.doc('settings/contributorRewards').get(),
    db.collection('contributorRedemptions').where('contributorId', '==', uid).limit(100).get(),
  ]);
  if (account.get('status') !== 'active') throw new HttpsError('permission-denied', 'An active contributor account is required.');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const lastDay = String(account.get('streakLastDay') ?? '');
  return {
    rewards: { ...rewardSettings(settings.data() ?? {}), balance: Number(account.get('rewardBalance') ?? 0),
      lifetime: Number(account.get('rewardLifetime') ?? 0) },
    streak: { current: lastDay === today || lastDay === yesterday ? Number(account.get('streakCount') ?? 0) : 0,
      best: Number(account.get('streakBest') ?? 0), lastDay, activeToday: lastDay === today },
    requests: requests.docs.filter(row => ['airtime', 'data'].includes(String(row.get('kind'))))
      .map(row => ({ id: row.id, ...row.data(), createdAt: String(row.get('createdAt') ?? '') }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  };
});

export const redeemContributorPoints = onCall(options, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('redeemContributorPoints', uid, 10);
  const kind = req.data?.kind;
  const network = req.data?.network;
  const phoneNumber = `+${normalizeMsisdn(req.data?.phoneNumber)}`;
  if (!['airtime', 'data'].includes(kind)) throw new HttpsError('invalid-argument', 'Choose airtime or mobile data.');
  if (!['MTN', 'Telecel', 'AT'].includes(network)) throw new HttpsError('invalid-argument', 'Choose a supported Ghana mobile network.');
  if (!/^\+233\d{9}$/.test(phoneNumber)) throw new HttpsError('invalid-argument', 'Enter a Ghana mobile number.');
  const db = getFirestore();
  const accountRef = db.doc(`contributorAccounts/${uid}`);
  const requestRef = db.collection('contributorRedemptions').doc();
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const [account, settingsDoc, prior] = await Promise.all([
      tx.get(accountRef), tx.get(db.doc('settings/contributorRewards')),
      tx.get(db.collection('contributorRedemptions').where('contributorId', '==', uid).limit(100)),
    ]);
    if (account.get('status') !== 'active') throw new HttpsError('permission-denied', 'An active contributor account is required.');
    const settings = rewardSettings(settingsDoc.data() ?? {});
    const points = req.data?.points;
    const balance = Number(account.get('rewardBalance') ?? 0);
    if (!Number.isSafeInteger(points) || points < settings.redemptionMinimum || points > balance) {
      throw new HttpsError('failed-precondition', `Redeem at least ${settings.redemptionMinimum} points, up to your available balance.`);
    }
    if (prior.docs.some(row => ['airtime', 'data'].includes(String(row.get('kind')))
      && ['submitted', 'approved'].includes(String(row.get('status'))))) {
      throw new HttpsError('failed-precondition', 'You already have a redemption request being processed.');
    }
    const amountMinor = Math.round(points / settings.redemptionMinimum * settings.cedisPerRedemption * 100);
    if (amountMinor < 100 || amountMinor > 100_000_000) throw new HttpsError('invalid-argument', 'Redemption amount is out of range.');
    tx.create(requestRef, { id: requestRef.id, contributorId: uid, amountMinor, currency: 'GHS',
      description: `${points} points for ${kind}`, points, kind, network, phoneNumber,
      status: 'submitted', createdAt: now, updatedAt: now, decidedAt: null,
      decidedBy: null, paidAt: null, paymentReference: '', adminNote: '' });
    tx.update(accountRef, { rewardBalance: balance - points });
  });
  return { requestId: requestRef.id };
});

/** How many requests the staff desk loads at once, newest first. */
export const REDEMPTION_PAGE = 500;
export const REDEMPTION_STATUSES = ['submitted', 'approved', 'fulfilled', 'rejected'] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];
export type RedemptionAction = 'approve' | 'reject' | 'fulfill';

/**
 * The only moves a redemption may make. `submitted` is pending a decision;
 * `approved` is waiting for someone to deliver the airtime or data outside
 * the system; `fulfilled` records that delivery with its reference; and
 * `rejected` returns the reserved points. Both ends are final.
 */
export function redemptionTransition(status: string, action: RedemptionAction): RedemptionStatus | null {
  if (action === 'approve') return status === 'submitted' ? 'approved' : null;
  if (action === 'fulfill') return status === 'approved' ? 'fulfilled' : null;
  if (action === 'reject') return status === 'submitted' || status === 'approved' ? 'rejected' : null;
  return null;
}

export const listContributorRewards = onCall(options, async req => {
  requireRole(req, 'admin');
  const db = getFirestore();
  const redemptions = db.collection('contributorRedemptions');
  // Totals come from aggregates over every airtime and data request, so the
  // desk never presents the loaded page as if it were the whole ledger. A
  // failed aggregate leaves the totals out rather than failing the desk.
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
  // Home and the notification bell only need the totals.
  if (req.data?.summaryOnly === true && totals) {
    return { summary: Object.fromEntries(totals), truncated: false, requests: [] };
  }
  const [settings, requests] = await Promise.all([
    db.doc('settings/contributorRewards').get(),
    redemptions.orderBy('createdAt', 'desc').limit(REDEMPTION_PAGE + 1).get(),
  ]);
  const rows = requests.docs.filter(row => ['airtime', 'data'].includes(String(row.get('kind'))))
    .map(row => ({ id: row.id, ...row.data(), createdAt: String(row.get('createdAt') ?? '') }));
  return { rewards: rewardSettings(settings.data() ?? {}),
    summary: totals ? Object.fromEntries(totals) : null,
    truncated: requests.size > REDEMPTION_PAGE,
    requests: rows.slice(0, REDEMPTION_PAGE) };
});

export const decideContributorRedemption = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  const requestId = String(req.data?.requestId ?? '');
  const action = req.data?.action as RedemptionAction;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Invalid request.');
  if (!['approve', 'reject', 'fulfill'].includes(action)) throw new HttpsError('invalid-argument', 'Unsupported action.');
  const note = typeof req.data?.note === 'string' ? req.data.note.trim() : '';
  const paymentReference = typeof req.data?.paymentReference === 'string' ? req.data.paymentReference.trim() : '';
  // The status the reviewer was looking at. Optional for older clients; when
  // sent, a decision made from a stale screen is refused instead of applied.
  const expectedStatus = typeof req.data?.expectedStatus === 'string' ? req.data.expectedStatus : null;
  if (note.length > 1000 || paymentReference.length > 160) throw new HttpsError('invalid-argument', 'Note or reference is too long.');
  if (action === 'reject' && !note) throw new HttpsError('invalid-argument', 'Add a reason for rejection.');
  if (action === 'fulfill' && !paymentReference) throw new HttpsError('invalid-argument', 'Add a delivery reference.');
  const db = getFirestore();
  const ref = db.doc(`contributorRedemptions/${requestId}`);
  const now = new Date().toISOString();
  const outcome = await db.runTransaction(async tx => {
    const request = await tx.get(ref);
    if (!request.exists || !['airtime', 'data'].includes(String(request.get('kind')))) throw new HttpsError('not-found', 'Redemption not found.');
    const status = String(request.get('status'));
    if (expectedStatus !== null && expectedStatus !== status) {
      throw new HttpsError('aborted', 'This request was updated by someone else. Reload it before deciding.');
    }
    const next = redemptionTransition(status, action);
    if (!next) throw new HttpsError('failed-precondition', 'This redemption is no longer in the expected state.');
    const contributorId = String(request.get('contributorId'));
    const points = Number(request.get('points') ?? 0);
    if (action === 'reject') {
      const accountRef = db.doc(`contributorAccounts/${contributorId}`);
      const account = await tx.get(accountRef);
      tx.update(accountRef, { rewardBalance: Number(account.get('rewardBalance') ?? 0) + points });
    }
    tx.update(ref, { status: next, adminNote: note, updatedAt: now, decidedBy: actor,
      ...(action === 'fulfill' ? { paidAt: now, paymentReference } : { decidedAt: now }) });
    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, { id: auditRef.id, requestId, at: now,
      ...auditEntry({ actor, action: `contributor.redemption.${action}`, target: requestId,
        targetCollection: 'contributorRedemptions', before: { status }, after: { status: next }, at: now,
        metadata: { contributorId, points, amountMinor: Number(request.get('amountMinor') ?? 0),
          ...(action === 'reject' ? { pointsReturned: points } : {}),
          ...(action === 'fulfill' ? { paymentReference } : {}) } }),
      actor: { collection: 'staff', id: actor } });
    return { status: next, pointsReturned: action === 'reject' ? points : 0 };
  });
  return { requestId, ...outcome };
});
