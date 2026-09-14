import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Fixed-window per-actor limit stored in a server-only Firestore collection.
 *
 * [units] is how much this one call costs against the window, and it defaults
 * to 1 so a plain call-counter reads exactly as it always did. It exists for
 * ceilings where calls are not the thing worth limiting: one AI video can cost
 * five times another, so the video generator spends the price in cents against
 * this same window rather than pretending every generation is equal.
 *
 * A call is refused when it would take the window past [limit], not only when
 * the window is already full — otherwise an expensive request slips through a
 * nearly-full bucket and overshoots by its whole cost. A single call costing
 * more than [limit] therefore can never run, which is the correct reading of a
 * ceiling it would breach on its own.
 */
export async function consumeRateLimit(
  operation: string,
  uid: string,
  limit: number,
  windowMs = 60_000,
  units = 1,
  message = 'Too many requests. Try again shortly.',
): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('_rateLimits').doc(`${operation}_${uid}`);
  const now = Date.now();
  const cost = Math.max(1, Math.round(units));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const startedAt = snap.get('startedAt');
    const count = snap.get('count');
    if (typeof startedAt === 'number' && now - startedAt < windowMs) {
      const used = typeof count === 'number' ? count : 0;
      if (used + cost > limit) {
        throw new HttpsError('resource-exhausted', message);
      }
      tx.set(ref, { startedAt, count: used + cost });
      return;
    }
    if (cost > limit) throw new HttpsError('resource-exhausted', message);
    tx.set(ref, { startedAt: now, count: cost });
  });
}
