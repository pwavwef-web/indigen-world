import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/** Fixed-window per-actor limit stored in a server-only Firestore collection. */
export async function consumeRateLimit(
  operation: string,
  uid: string,
  limit: number,
  windowMs = 60_000,
): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('_rateLimits').doc(`${operation}_${uid}`);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const startedAt = snap.get('startedAt');
    const count = snap.get('count');
    if (typeof startedAt === 'number' && now - startedAt < windowMs) {
      if (typeof count === 'number' && count >= limit) {
        throw new HttpsError('resource-exhausted', 'Too many requests. Try again shortly.');
      }
      tx.set(ref, { startedAt, count: (typeof count === 'number' ? count : 0) + 1 });
      return;
    }
    tx.set(ref, { startedAt: now, count: 1 });
  });
}
