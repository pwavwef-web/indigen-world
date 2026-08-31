import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';

// App Check enforcement is opt-in across the codebase (see creators.ts); enable
// via ENFORCE_APP_CHECK=true once App Check is configured for the admin app.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/**
 * The marks staff may grant, mirroring `VERIFIED_KINDS` in the admin console.
 * `member` is missing on purpose: that one is what a verified phone number
 * earns on its own, so there is nothing for an admin to hand out.
 */
const GRANTABLE_KINDS: readonly string[] = ['', 'creator', 'elder', 'project'];

/**
 * An admin grants or clears a community member's mark.
 *
 * The Security Rules would let an admin write `verifiedKind` straight from the
 * console, but they let nobody write `auditLogs` — that collection is the
 * server's alone. Handing somebody the standing of a language custodian is
 * exactly the kind of decision that should be answerable later, so the two
 * writes belong together behind admin credentials rather than half-done from
 * the browser.
 */
export const setCommunityVerifiedKind = onCall({
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public',
}, async (req) => {
  const actorUid = requireAuth(req);
  requireRole(req, 'admin');
  await consumeRateLimit('setCommunityVerifiedKind', actorUid, 30);

  const { uid, kind } = (req.data ?? {}) as { uid?: unknown; kind?: unknown };
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }
  const nextKind = typeof kind === 'string' ? kind : '';
  if (!GRANTABLE_KINDS.includes(nextKind)) {
    throw new HttpsError('invalid-argument', `Unknown mark: ${String(kind)}.`);
  }

  const db = getFirestore();
  const profileRef = db.collection('communityProfiles').doc(uid);
  const auditRef = db.collection('auditLogs').doc();

  const previous = await db.runTransaction(async (tx) => {
    const profile = await tx.get(profileRef);
    if (!profile.exists) {
      throw new HttpsError('not-found', 'That member has no community profile.');
    }
    const before = String(profile.get('verifiedKind') ?? '');

    tx.update(profileRef, { verifiedKind: nextKind, updatedAt: new Date().toISOString() });
    tx.set(auditRef, {
      id: auditRef.id,
      actor: { collection: 'communityProfiles', id: actorUid },
      action: 'community.set_verified_kind',
      target: { collection: 'communityProfiles', id: uid },
      outcome: 'success',
      source: 'functions',
      before: { verifiedKind: before },
      after: { verifiedKind: nextKind },
      metadata: { username: String(profile.get('username') ?? '') },
      occurredAt: new Date().toISOString(),
    });
    return before;
  });

  logger.info('Community mark changed', { uid, from: previous, to: nextKind, actorUid });
  return { uid, verifiedKind: nextKind };
});
