import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export type Role = 'contributor' | 'validator' | 'admin';

const ROLE_INHERITANCE: Record<Role, readonly Role[]> = {
  contributor: ['contributor', 'validator', 'admin'],
  validator: ['validator', 'admin'],
  admin: ['admin'],
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
