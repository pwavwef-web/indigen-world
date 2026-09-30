import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
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

export const listContributorRewards = onCall(options, async req => {
  requireRole(req, 'admin');
  const db = getFirestore();
  const [settings, requests] = await Promise.all([
    db.doc('settings/contributorRewards').get(), db.collection('contributorRedemptions').limit(500).get(),
  ]);
  return { rewards: rewardSettings(settings.data() ?? {}),
    requests: requests.docs.filter(row => ['airtime', 'data'].includes(String(row.get('kind'))))
      .map(row => ({ id: row.id, ...row.data(), createdAt: String(row.get('createdAt') ?? '') }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) };
});

export const decideContributorRedemption = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  const requestId = String(req.data?.requestId ?? '');
  const action = req.data?.action;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Invalid request.');
  if (!['approve', 'reject', 'fulfill'].includes(action)) throw new HttpsError('invalid-argument', 'Unsupported action.');
  const note = typeof req.data?.note === 'string' ? req.data.note.trim() : '';
  const paymentReference = typeof req.data?.paymentReference === 'string' ? req.data.paymentReference.trim() : '';
  if (note.length > 1000 || paymentReference.length > 160) throw new HttpsError('invalid-argument', 'Note or reference is too long.');
  if (action === 'reject' && !note) throw new HttpsError('invalid-argument', 'Add a reason for rejection.');
  if (action === 'fulfill' && !paymentReference) throw new HttpsError('invalid-argument', 'Add a delivery reference.');
  const db = getFirestore();
  const ref = db.doc(`contributorRedemptions/${requestId}`);
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const request = await tx.get(ref);
    if (!request.exists || !['airtime', 'data'].includes(String(request.get('kind')))) throw new HttpsError('not-found', 'Redemption not found.');
    const status = String(request.get('status'));
    if (action === 'approve' && status !== 'submitted'
      || action === 'reject' && !['submitted', 'approved'].includes(status)
      || action === 'fulfill' && status !== 'approved') {
      throw new HttpsError('failed-precondition', 'This redemption is no longer in the expected state.');
    }
    if (action === 'reject') {
      const accountRef = db.doc(`contributorAccounts/${request.get('contributorId')}`);
      const account = await tx.get(accountRef);
      tx.update(accountRef, { rewardBalance: Number(account.get('rewardBalance') ?? 0) + Number(request.get('points') ?? 0) });
    }
    tx.update(ref, { status: action === 'fulfill' ? 'fulfilled' : action === 'reject' ? 'rejected' : 'approved',
      adminNote: note, updatedAt: now, decidedBy: actor,
      ...(action === 'fulfill' ? { paidAt: now, paymentReference } : { decidedAt: now }) });
    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, { id: auditRef.id, action: `contributor.redemption.${action}`, actor,
      target: String(request.get('contributorId')), requestId, at: now,
      before: { status }, after: { status: action === 'fulfill' ? 'fulfilled' : action === 'reject' ? 'rejected' : 'approved' } });
  });
  return { requestId };
});
