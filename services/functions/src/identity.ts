import { HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { effectiveRole, isOwnerSuperAdmin, onStaffCall, requireAuth, requireRole, type Role } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * Roles this callable can assign. `super_admin` is deliberately absent: the
 * super administrator is owner-managed (OWNER_SUPER_ADMIN_UIDS in auth.ts and
 * AGENTS.md), so no console action, script or agent can promote anyone to it.
 */
const ASSIGNABLE_ROLES: readonly Role[] = [
  'contributor',
  'validator',
  'creator',
  'reviewer',
  'admin',
];
// App Check enforcement is opt-in (see creators.ts): enable via ENFORCE_APP_CHECK=true
// on the deployed functions once App Check is configured for the web apps.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/**
 * An admin assigns a role claim to a user. Role claims are the source of truth
 * the Security Rules read, so this must never be client-controllable. The change
 * is recorded in the audit log.
 *
 * - Nobody can assign `super_admin` here, and an owner super administrator's
 *   role cannot be changed here either.
 * - Only the super administrator grants, changes or removes the admin role.
 * - Nobody changes their own role.
 */
export const setUserRole = onStaffCall({
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public',
}, async (req) => {
  const actorUid = requireAuth(req);
  const actorRole = requireRole(req, 'admin');
  await consumeRateLimit('setUserRole', actorUid, 10);

  const { uid, role } = req.data ?? {};
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }
  if (role === 'super_admin') {
    throw new HttpsError('permission-denied', 'The super administrator role is owner-managed and cannot be assigned.');
  }
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
    throw new HttpsError('invalid-argument', `Unknown role: ${String(role)}.`);
  }
  if (uid === actorUid) {
    throw new HttpsError('permission-denied', 'You cannot change your own role.');
  }

  const auth = getAuth();
  const target = await auth.getUser(uid);
  const claims = { ...(target.customClaims ?? {}) } as Record<string, unknown>;
  const targetClaims = { ...claims, uid };
  if (isOwnerSuperAdmin(targetClaims) || claims.role === 'super_admin' || claims.superAdmin === true) {
    throw new HttpsError('permission-denied', 'A super administrator account is owner-managed and cannot be changed here.');
  }
  const before = effectiveRole(targetClaims);
  if ((role === 'admin' || before === 'admin') && actorRole !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Super administrator access is required to grant, change or remove the admin role.');
  }

  await auth.setCustomUserClaims(uid, { ...claims, role });

  const db = getFirestore();
  const auditRef = db.collection('auditLogs').doc();
  await auditRef.set({
    id: auditRef.id,
    actor: { collection: 'contributors', id: actorUid },
    action: 'identity.set_role',
    target: { collection: 'contributors', id: uid },
    outcome: 'success',
    source: 'functions',
    before: { role: before },
    after: { role },
    metadata: {},
    occurredAt: new Date().toISOString(),
  });

  return { uid, role };
});
