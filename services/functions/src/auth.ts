import { HttpsError, onCall, type CallableOptions, type CallableRequest } from 'firebase-functions/v2/https';

export type Role =
  | 'creator'
  | 'reviewer'
  | 'admin'
  | 'super_admin'
  | 'contributor'
  | 'validator';

const ROLE_INHERITANCE: Record<Role, readonly Role[]> = {
  creator: ['creator', 'reviewer', 'admin', 'super_admin', 'contributor', 'validator'],
  reviewer: ['reviewer', 'admin', 'super_admin', 'validator'],
  admin: ['admin', 'super_admin'],
  super_admin: ['super_admin'],
  contributor: ['contributor', 'validator', 'admin', 'super_admin', 'creator', 'reviewer'],
  validator: ['validator', 'admin', 'super_admin', 'reviewer'],
};

/**
 * The only accounts the backend honours as super administrator.
 *
 * OWNER-MANAGED. A `super_admin` role or `superAdmin` claim on any other
 * account grants nothing: the backend treats that account as having no staff
 * role at all, and so do firestore.rules and storage.rules (`isSuperAdmin()`),
 * which carry the same list. Changing it is a decision for the project owner
 * alone; automated agents must never add to it (see AGENTS.md, "Super
 * administrator"). firebase/tests/staffSecurity.test.mjs pins the three copies.
 */
export const OWNER_SUPER_ADMIN_UIDS: readonly string[] = ['fjnCDzK5lPZnEGHRYkarL5vqpzq1'];

type Claims = Record<string, unknown> | undefined;

function tokenUid(token: Claims): string | null {
  const uid = token?.uid ?? token?.sub ?? token?.user_id;
  return typeof uid === 'string' && uid.length > 0 ? uid : null;
}

/** Whether these claims belong to an owner account that carries the super-administrator claim. */
export function isOwnerSuperAdmin(token: Claims): boolean {
  const uid = tokenUid(token);
  return uid !== null
    && OWNER_SUPER_ADMIN_UIDS.includes(uid)
    && (token?.role === 'super_admin' || token?.superAdmin === true);
}

/**
 * The role the backend honours for a set of claims (which must carry `uid`).
 * A super-administrator claim outside OWNER_SUPER_ADMIN_UIDS counts as no role.
 */
export function effectiveRole(token: Claims): Role | null {
  if (isOwnerSuperAdmin(token)) return 'super_admin';
  const claimed = token?.role;
  if (claimed === 'super_admin' || token?.superAdmin === true) return null;
  return typeof claimed === 'string' && claimed in ROLE_INHERITANCE ? claimed as Role : null;
}

/** The caller's claims with their uid attached, for effectiveRole and friends. */
export function callerClaims(req: CallableRequest<unknown>): Record<string, unknown> {
  return { ...(req.auth?.token ?? {}), uid: req.auth?.uid };
}

export function requireAuth(req: CallableRequest<unknown>): string {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }
  return uid;
}

/**
 * Whether a role satisfies [required], by the same inheritance. Pass a role
 * from effectiveRole() for a caller; a raw `super_admin` claim is only
 * trustworthy once it has been checked against the owner list.
 */
export function roleSatisfies(claimed: unknown, required: Role): boolean {
  return typeof claimed === 'string' && ROLE_INHERITANCE[required].includes(claimed as Role);
}

export function requireRole(req: CallableRequest<unknown>, required: Role): Role {
  const role = effectiveRole(callerClaims(req));
  if (!roleSatisfies(role, required)) {
    throw new HttpsError('permission-denied', `${required} access is required.`);
  }
  return role as Role;
}

/* -- Verified staff sessions (two-step verification) ---------------------------------- */

/** How long one verified sign-in may use the admin console before signing in again. */
export const STAFF_SESSION_SECONDS = 12 * 60 * 60;
/** The claim listing the `auth_time`s of sign-ins that passed two-step verification. */
export const STAFF_MFA_CLAIM = 'staffMfa';

/**
 * Whether these claims carry any standing the admin console acts on: a staff
 * role, finance access or a project-finance role. Such accounts must pass
 * two-step verification before admin-console callables act for them.
 */
export function hasStaffStanding(token: Claims): boolean {
  if (roleSatisfies(effectiveRole(token), 'validator')) return true;
  return token?.finance === true || token?.financeRole === 'editor' || token?.financeRole === 'viewer';
}

/**
 * Whether this ID token comes from a sign-in that passed two-step
 * verification within the last STAFF_SESSION_SECONDS. `auth_time` is set by
 * Firebase Auth at sign-in and survives token refreshes, so a verification
 * covers exactly one sign-in: a new sign-in anywhere, with the same Google
 * account, has a new `auth_time` and must verify again.
 */
export function hasVerifiedStaffSession(token: Claims, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const authTime = Number(token?.auth_time);
  const verified = token?.[STAFF_MFA_CLAIM];
  return Number.isInteger(authTime)
    && authTime > nowSeconds - STAFF_SESSION_SECONDS
    && Array.isArray(verified)
    && verified.includes(authTime);
}

/**
 * Refuse a staff caller whose sign-in has not passed two-step verification.
 * Callers with no staff standing pass through so the handler's own role
 * checks answer them, exactly as before.
 */
export function requireVerifiedStaffSession(req: CallableRequest<unknown>): void {
  requireAuth(req);
  const claims = callerClaims(req);
  if (!hasStaffStanding(claims) || hasVerifiedStaffSession(claims)) return;
  throw new HttpsError(
    'failed-precondition',
    'Two-step verification is required for this sign-in. Reload the admin console and enter your authenticator code.',
    { reason: 'staff-mfa-required' },
  );
}

/**
 * onCall for the admin console's callables: identical, except that a staff
 * caller must hold a verified staff session (requireVerifiedStaffSession)
 * before the handler runs. firebase/tests/staffSecurity.test.mjs checks that
 * every callable the console invokes is declared with it.
 */
export function onStaffCall<T = any, R = any>(
  options: CallableOptions<T>,
  handler: (req: CallableRequest<T>) => R,
) {
  return onCall<T, Promise<Awaited<R>>>(options, async (req): Promise<Awaited<R>> => {
    requireVerifiedStaffSession(req as CallableRequest<unknown>);
    return await handler(req) as Awaited<R>;
  });
}
