import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth, requireRole, type Role } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';

const ASSIGNABLE_ROLES: readonly Role[] = ['contributor', 'validator', 'admin'];
const ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true';

/**
 * An admin assigns a role claim to a user. Role claims are the source of truth
 * the Security Rules read, so this must never be client-controllable. The change
 * is recorded in the audit log.
 */
export const setUserRole = onCall({
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
}, async (req) => {
  const actorUid = requireAuth(req);
  requireRole(req, 'admin');
  await consumeRateLimit('setUserRole', actorUid, 10);

  const { uid, role } = req.data ?? {};
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
    throw new HttpsError('invalid-argument', `Unknown role: ${String(role)}.`);
  }

  await getAuth().setCustomUserClaims(uid, { role });

  const db = getFirestore();
  const auditRef = db.collection('auditLogs').doc();
  await auditRef.set({
    id: auditRef.id,
    actor: { collection: 'contributors', id: actorUid },
    action: 'identity.set_role',
    target: { collection: 'contributors', id: uid },
    outcome: 'success',
    source: 'functions',
    before: null,
    after: { role },
    metadata: {},
    occurredAt: new Date().toISOString(),
  });

  return { uid, role };
});
