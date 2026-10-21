import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/**
 * The console's reading of a staff member's claims. Display only: the same
 * rules are enforced by services/functions/src/auth.ts (onStaffCall) and by
 * hasVerifiedStaffSession() in firestore.rules and storage.rules.
 */

/**
 * The owner-managed super administrator. Mirrors OWNER_SUPER_ADMIN_UIDS in
 * services/functions/src/auth.ts; firebase/tests/staffSecurity.test.mjs pins
 * every copy. Agents must never add to it (AGENTS.md).
 */
export const OWNER_SUPER_ADMIN_UIDS: readonly string[] = ['fjnCDzK5lPZnEGHRYkarL5vqpzq1'];

/** Mirrors STAFF_SESSION_SECONDS: one verified sign-in lasts at most twelve hours. */
export const STAFF_SESSION_SECONDS = 12 * 60 * 60;
/** Signed out after this long with no keyboard, pointer or touch input in any console tab. */
export const IDLE_SIGN_OUT_MINUTES = 30;

export type StaffRole = 'contributor' | 'validator' | 'creator' | 'reviewer' | 'admin' | 'super_admin' | null;

const ROLES = new Set(['contributor', 'validator', 'creator', 'reviewer', 'admin', 'super_admin']);

export interface StaffClaims {
  role: StaffRole;
  superAdmin: boolean;
  finance: boolean;
  financeRole: 'editor' | 'viewer' | null;
  /** Anything the console acts on: a staff role, finance access or a finance role. */
  staffStanding: boolean;
  /** This sign-in passed two-step verification and is inside its twelve hours. */
  verified: boolean;
  /** When this sign-in stops being usable (auth_time + twelve hours), ms. */
  expiresAt: number | null;
}

export function readStaffClaims(uid: string, claims: Record<string, unknown>, nowMs = Date.now()): StaffClaims {
  const owner = OWNER_SUPER_ADMIN_UIDS.includes(uid) && (claims.role === 'super_admin' || claims.superAdmin === true);
  const claimed = typeof claims.role === 'string' && ROLES.has(claims.role) ? claims.role as StaffRole : null;
  // A super-administrator claim anywhere else is honoured nowhere, so it is not shown either.
  const role: StaffRole = owner ? 'super_admin' : claimed === 'super_admin' || claims.superAdmin === true ? null : claimed;
  const finance = claims.finance === true && (role === 'admin' || owner);
  const financeRole = claims.financeRole === 'editor' || claims.financeRole === 'viewer' ? claims.financeRole : null;
  const staffStanding = role === 'validator' || role === 'reviewer' || role === 'admin' || role === 'super_admin'
    || claims.finance === true || financeRole !== null;
  const authTime = Number(claims.auth_time);
  const expiresAt = Number.isInteger(authTime) ? (authTime + STAFF_SESSION_SECONDS) * 1000 : null;
  const verified = expiresAt !== null && expiresAt > nowMs
    && Array.isArray(claims.staffMfa) && claims.staffMfa.includes(authTime);
  return { role, superAdmin: owner, finance, financeRole, staffStanding, verified, expiresAt };
}

/* -- The staffMfa callable ---------------------------------------------------------------- */

export interface MfaStatus {
  enrolled: boolean;
  verified: boolean;
  sessionExpiresAt: string;
  recoveryCodesLeft: number;
  lockedUntil: string | null;
}
export interface MfaEnrolment { secret: string; otpauthUrl: string; account: string; expiresInMinutes: number }
export interface MfaRosterRow { uid: string; email: string; role: string | null; enrolled: boolean; lastVerifiedAt: string | null }

const call = httpsCallable<Record<string, unknown>, unknown>(functions, 'staffMfa');

async function request<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  try {
    return (await call({ action, ...data })).data as T;
  } catch (error) {
    throw new Error(error instanceof Error && error.message ? error.message : 'Two-step verification failed. Try again.');
  }
}

export const mfaStatus = () => request<MfaStatus>('status');
export const beginEnrolment = () => request<MfaEnrolment>('enroll');
export const confirmEnrolment = (code: string) => request<{ verified: true; recoveryCodes: string[] }>('confirm', { code });
export const verifyCode = (code: string) => request<{ verified: true; recoveryCodesLeft: number }>('verify', { code });
export const verifyRecoveryCode = (recoveryCode: string) => request<{ verified: true; recoveryCodesLeft: number }>('verify', { recoveryCode });
export const replaceRecoveryCodes = () => request<{ recoveryCodes: string[] }>('recoveryCodes');
export const staffRoster = () => request<{ people: MfaRosterRow[] }>('roster');
export const resetStaffMfa = (uid: string) => request<{ uid: string; reset: true }>('reset', { uid });
