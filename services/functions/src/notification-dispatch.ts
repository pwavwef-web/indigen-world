import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { pushToUser, type PushMessage } from './push.js';
const now = () => new Date().toISOString();
export function quietUntil(preferences: Record<string, any> | undefined, date = new Date()): string | null {
  if (preferences?.enabled !== true || !/^\d{2}:\d{2}$/.test(preferences.start) || !/^\d{2}:\d{2}$/.test(preferences.end) || preferences.start === preferences.end) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: preferences.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const inQuiet = (d: Date) => { const time = formatter.format(d); return preferences.start < preferences.end ? time >= preferences.start && time < preferences.end : time >= preferences.start || time < preferences.end; };
    if (!inQuiet(date)) return null;
    for (let i = 1; i <= 1500; i++) { const candidate = new Date(date.getTime() + i * 60000); if (!inQuiet(candidate)) return candidate.toISOString(); }
  } catch { /* invalid self-authored preference cannot block transactional work */ }
  return null;
}
export const notificationDeliveryPreferences = onCall({ region: 'us-central1', invoker: 'public', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' }, async (req) => {
  const uid = requireAuth(req), data = req.data ?? {};
  if (typeof data.timeZone !== 'string' || !data.timeZone || data.timeZone.length > 100) throw new HttpsError('invalid-argument', 'Choose an IANA time zone.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.end)) throw new HttpsError('invalid-argument', 'Use 24-hour times such as 22:00 and 07:00.');
  try { new Intl.DateTimeFormat('en', { timeZone: data.timeZone }).format(); } catch { throw new HttpsError('invalid-argument', 'Enter a supported time zone, such as Africa/Accra.'); }
  const value = { enabled: data.enabled === true, start: data.start, end: data.end, timeZone: String(data.timeZone).slice(0, 100) };
  await getFirestore().collection('communityProfiles').doc(uid).update({ notificationQuietHours: value }); return value;
});

/** Provider acceptance is not a device delivery receipt. A lease protects
 * duplicate trigger invocations; stable Android tags replace retried alerts. */
export async function dispatchRecordedPush(ref: FirebaseFirestore.DocumentReference, uid: string, message: PushMessage) {
  const db = getFirestore(), profile = await db.collection('communityProfiles').doc(uid).get();
  const snap = await ref.get();
  if (!snap.exists || snap.get('recipientId') !== uid || ['suspended', 'revoked'].includes(profile.get('status'))) return;
  const preference: Record<string, string> = { like: 'likes', follow: 'follows', mention: 'mentions', reply: 'threadReplies', thread_reply: 'threadReplies', reel_comment: 'reelComments', post: 'followedPosts', publication: 'followedPosts', milestone: 'milestones', leaderboard: 'leaderboard' };
  if (preference[message.data.type] && profile.get(`notificationPrefs.${preference[message.data.type]}`) === false) { await ref.update({ push: { status: 'skipped', reason: 'category-disabled' } }); return; }
  if (snap.get('promotional') === true && profile.get('notificationPrefs.promotions') !== true) { await ref.update({ push: { status: 'skipped', reason: 'promotions-disabled' } }); return; }
  const nextAt = message.data.type === 'order' ? null : quietUntil(profile.get('notificationQuietHours'));
  if (nextAt) { await ref.update({ pushEnvelope: message, push: { status: 'quiet_hours', nextAt, attempts: snap.get('push.attempts') ?? 0 } }); return; }
  const attempt = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref), state = fresh.get('push') ?? {};
    if (['accepted_by_provider', 'partially_accepted', 'no_devices', 'skipped', 'exhausted'].includes(state.status) || state.leaseUntil > now()) return null;
    const attempts = (state.attempts ?? 0) + 1;
    if (attempts > 4) { tx.update(ref, { push: { ...state, status: 'exhausted' } }); return null; }
    tx.update(ref, { pushEnvelope: message, push: { status: 'dispatching', attempts, leaseUntil: new Date(Date.now() + 60000).toISOString() } }); return attempts;
  });
  if (!attempt) return;
  const result = await pushToUser(db, uid, message);
  await ref.update({ push: { ...result, attempts: attempt, attemptedAt: now(), ...(result.status === 'failed' ? { status: attempt < 4 ? 'retry_pending' : 'exhausted', nextAt: new Date(Date.now() + 60000 * 2 ** attempt).toISOString() } : {}) } });
}
export const retryNotificationPushes = onSchedule({ schedule: 'every 1 minutes', region: 'us-central1', timeoutSeconds: 120 }, async () => {
  const page = await getFirestore().collection('communityNotifications').where('push.status', 'in', ['retry_pending', 'quiet_hours']).where('push.nextAt', '<=', now()).limit(100).get();
  for (const row of page.docs) if (row.get('pushEnvelope') && row.get('recipientId')) await dispatchRecordedPush(row.ref, row.get('recipientId'), row.get('pushEnvelope'));
  const abandoned = await getFirestore().collection('communityNotifications').where('push.status', '==', 'dispatching').where('push.leaseUntil', '<=', now()).limit(100).get();
  for (const row of abandoned.docs) if (row.get('pushEnvelope') && row.get('recipientId')) await dispatchRecordedPush(row.ref, row.get('recipientId'), row.get('pushEnvelope'));
});
