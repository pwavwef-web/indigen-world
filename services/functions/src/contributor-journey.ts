import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { CONTRIBUTOR_CALL_OPTIONS, guarded, requireActiveContributor } from './contributor-common.js';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';

export function journeyPreferences(raw: Record<string, unknown>) {
  if (![1, 2, 3, 4, 5, 6, 7].includes(Number(raw.weeklyGoal)) || !Number.isInteger(raw.weeklyGoal)) throw new HttpsError('invalid-argument', 'Choose a weekly goal from one to seven days.');
  if (![3, 5].includes(Number(raw.sessionSize)) || !Number.isInteger(raw.sessionSize)) throw new HttpsError('invalid-argument', 'Choose sessions of three or five expressions.');
  if (typeof raw.celebrations !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether to show celebrations.');
  return { weeklyGoal: Number(raw.weeklyGoal), sessionSize: Number(raw.sessionSize), celebrations: raw.celebrations };
}

export function collectionGoal(raw: Record<string, unknown>) {
  if (typeof raw.enabled !== 'boolean' || !Number.isInteger(raw.target) || Number(raw.target) < 1 || Number(raw.target) > 10000) throw new HttpsError('invalid-argument', 'Choose a target from 1 to 10,000 reviewed expressions.');
  if (typeof raw.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day) || !Number.isFinite(Date.parse(raw.day)) || new Date(raw.day).toISOString().slice(0, 10) !== raw.day) throw new HttpsError('invalid-argument', 'Choose a valid UTC day.');
  return { enabled: raw.enabled, target: Number(raw.target), day: raw.day };
}

export const getContributorJourney = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('getContributorJourney', async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('getContributorJourney', uid, 60);
  const account = await requireActiveContributor(uid, { activated: true });
  const goal = await getFirestore().doc('settings/contributorCollectionGoal').get();
  const saved = account.get('journey') ?? {};
  return { weeklyGoal: saved.weeklyGoal ?? 3, sessionSize: saved.sessionSize ?? 3, celebrations: saved.celebrations !== false,
    practiceCompleted: saved.practiceCompleted === true, participationDays: saved.participationDays ?? [],
    communityGoal: goal.get('enabled') === true && goal.get('day') === new Date().toISOString().slice(0, 10)
      ? { target: goal.get('target'), day: goal.get('day') } : null };
}));

export const saveContributorJourney = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('saveContributorJourney', async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('saveContributorJourney', uid, 30);
  const prefs = journeyPreferences(req.data ?? {});
  const db = getFirestore(), ref = db.doc(`contributorAccounts/${uid}`);
  await db.runTransaction(async tx => {
    const account = await tx.get(ref);
    if (account.get('status') !== 'active' || account.get('requiresPasswordChange') === true) throw new HttpsError('permission-denied', 'An activated contributor account is required.');
    tx.update(ref, { journey: { ...(account.get('journey') ?? {}), ...prefs,
      ...(req.data?.practiceCompleted === true ? { practiceCompleted: true } : {}), updatedAt: new Date().toISOString() } });
  });
  return { saved: true };
}));

export const setContributorCollectionGoal = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('setContributorCollectionGoal', async req => {
  const uid = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('setContributorCollectionGoal', uid, 20);
  const goal = collectionGoal(req.data ?? {});
  await getFirestore().doc('settings/contributorCollectionGoal').set({ ...goal, updatedAt: new Date().toISOString(), updatedBy: uid });
  return goal;
}));

export const getContributorCollectionGoal = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('getContributorCollectionGoal', async req => {
  requireAuth(req); requireRole(req, 'admin');
  const snapshot = await getFirestore().doc('settings/contributorCollectionGoal').get();
  return { enabled: snapshot.get('enabled') === true, target: snapshot.get('target') ?? 30, day: snapshot.get('day') ?? new Date().toISOString().slice(0, 10) };
}));

export const findContributorExpressionMatches = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('findContributorExpressionMatches', async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('findContributorExpressionMatches', uid, 30);
  await requireActiveContributor(uid, { activated: true });
  const phrase = req.data?.phrase;
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 2000) throw new HttpsError('invalid-argument', 'Enter a translation before checking published expressions.');
  const snapshot = await getFirestore().collection('expressionEntries').where('phrase', '==', phrase.trim().normalize('NFC')).where('isPublished', '==', true).limit(10).get();
  return { matches: snapshot.docs.filter(row => row.get('isPublished') === true).map(row => ({ phrase: row.get('phrase'), meaning: row.get('meaning'), variety: row.get('dialect') ?? '' })).slice(0, 3) };
}));
