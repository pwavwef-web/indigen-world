import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

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

export function requireAuth(req: CallableRequest<unknown>): string {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }
  return uid;
}

export function requireRole(req: CallableRequest<unknown>, required: Role): Role {
  const claimed = req.auth?.token.role;
  if (typeof claimed !== 'string' || !ROLE_INHERITANCE[required].includes(claimed as Role)) {
    throw new HttpsError('permission-denied', `${required} access is required.`);
  }
  return claimed as Role;
}
