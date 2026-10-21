/**
 * Claims for a staff sign-in that has passed two-step verification
 * (services/functions/src/auth.ts, hasVerifiedStaffSession). Spread into a
 * test token so an admin-console callable accepts it:
 *
 *   fn.run({ auth: { uid, token: { role: 'admin', ...verifiedStaff() } }, data })
 */
export function verifiedStaff(authTime = Math.floor(Date.now() / 1000) - 60) {
  return { auth_time: authTime, staffMfa: [authTime] };
}

/** The owner-managed super administrator (OWNER_SUPER_ADMIN_UIDS). */
export const OWNER_UID = 'fjnCDzK5lPZnEGHRYkarL5vqpzq1';

/**
 * For emulator end-to-end tests that sign a client in: mark that client's
 * current sign-in as two-step verified (the claim staffMfa.verify would add)
 * and refresh its ID token, so admin-console callables accept it.
 */
export async function verifyClientSession(adminAuth, clientAuth, claims = {}) {
  const user = clientAuth.currentUser;
  const authTime = Number((await user.getIdTokenResult()).claims.auth_time);
  const record = await adminAuth.getUser(user.uid);
  // The custom token's claims are repeated, so they survive the refresh either way.
  await adminAuth.setCustomUserClaims(user.uid, { ...(record.customClaims ?? {}), ...claims, staffMfa: [authTime] });
  await user.getIdToken(true);
}
