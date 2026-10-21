/**
 * Two-step verification for the admin console.
 *
 * Everyone with staff standing (a validator, reviewer or admin role, finance
 * access or a project-finance role) sets up an authenticator app the first
 * time they open the console, and enters a code from it after every sign-in.
 *
 * A correct code adds that sign-in's `auth_time` to the account's `staffMfa`
 * claim (auth.ts, hasVerifiedStaffSession). The console then refreshes its ID
 * token, and from that moment the console's callables (onStaffCall) and the
 * Security Rules for staff-only data accept it — for that sign-in only, and
 * for at most STAFF_SESSION_SECONDS. The shared secret is sealed with
 * STAFF_MFA_KEY and never leaves the server after enrolment; recovery codes
 * are stored as keyed hashes. `staffMfa/{uid}` is closed to every client.
 *
 * Actions: status · enroll · confirm · verify · recoveryCodes · roster · reset.
 */
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Transaction } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  STAFF_MFA_CLAIM,
  STAFF_SESSION_SECONDS,
  callerClaims,
  effectiveRole,
  hasStaffStanding,
  hasVerifiedStaffSession,
  isOwnerSuperAdmin,
  requireAuth,
  roleSatisfies,
} from './auth.js';
import { CONTRIBUTOR_CALL_OPTIONS, guarded } from './contributor-common.js';
import { ADMIN_APP_CHECK_OPTIONS } from './admin-app-check.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  ENROLMENT_TTL_MINUTES,
  MAX_FAILED_ATTEMPTS,
  MFA_LOCK_MINUTES,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  nextVerifiedSessions,
  openSecret,
  otpauthUrl,
  parseMfaKey,
  recoveryCodeHash,
  sealSecret,
  type SealedSecret,
} from './staff-mfa-policy.js';

export const STAFF_MFA_KEY = defineSecret('STAFF_MFA_KEY');

interface MfaRecord {
  uid: string;
  status: 'enrolled' | 'none';
  secret?: SealedSecret | null;
  pending?: { secret: SealedSecret; expiresAt: number } | null;
  recoveryCodes?: string[];
  lastStep?: number;
  failures?: number;
  lockedUntil?: number | null;
  enrolledAt?: string | null;
  lastVerifiedAt?: string | null;
  updatedAt?: string;
}

const db = () => getFirestore();
const recordRef = (uid: string) => db().doc(`staffMfa/${uid}`);
const iso = (ms = Date.now()) => new Date(ms).toISOString();

function mfaKey(): Buffer {
  try { return parseMfaKey(STAFF_MFA_KEY.value()); }
  catch { throw new HttpsError('failed-precondition', 'Two-step verification is not configured on the server. Ask the project owner to set STAFF_MFA_KEY.'); }
}

function audit(tx: Transaction | null, actor: string, action: string, target: string, metadata: Record<string, unknown> = {}, outcome: 'success' | 'failure' = 'success') {
  const ref = db().collection('auditLogs').doc();
  const row = {
    id: ref.id, domain: 'staff-security', action,
    actor: { collection: 'users', id: actor }, target: { collection: 'users', id: target },
    outcome, source: 'functions', before: null, after: null, metadata, occurredAt: iso(),
  };
  return tx ? tx.set(ref, row) : ref.set(row);
}

/** Add this sign-in to the verified sessions on the account's claims. */
async function stampVerifiedSession(uid: string, authTime: number) {
  const user = await getAuth().getUser(uid);
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  claims[STAFF_MFA_CLAIM] = nextVerifiedSessions(claims[STAFF_MFA_CLAIM], authTime, Math.floor(Date.now() / 1000), STAFF_SESSION_SECONDS);
  await getAuth().setCustomUserClaims(uid, claims);
}

function codeInput(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40) throw new HttpsError('invalid-argument', 'Enter the code from your authenticator app.');
  return value;
}

function lockedMessage(lockedUntil: number) {
  const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
  return `Too many wrong codes. Two-step verification is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`;
}

/**
 * Check a code (or recovery code) inside a transaction, counting failures and
 * locking after MAX_FAILED_ATTEMPTS. Returns how the person proved it.
 */
async function checkCode(uid: string, key: Buffer, input: { code?: unknown; recoveryCode?: unknown }, purpose: 'verify' | 'confirm') {
  const ref = recordRef(uid);
  const outcome = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const record = (snap.exists ? snap.data() : { uid, status: 'none' }) as MfaRecord;
    const now = Date.now();
    if (record.lockedUntil && record.lockedUntil > now) {
      return { ok: false as const, message: lockedMessage(record.lockedUntil) };
    }
    let method: 'totp' | 'recovery' | null = null;
    const patch: Partial<MfaRecord> = { updatedAt: iso(now) };

    if (purpose === 'confirm') {
      if (!record.pending || record.pending.expiresAt < now) {
        return { ok: false as const, message: 'This setup has expired. Start again to get a new QR code.' };
      }
      const secret = openSecret(key, uid, record.pending.secret);
      const step = matchTotp(secret, codeInput(input.code));
      if (step !== null) {
        method = 'totp';
        Object.assign(patch, {
          status: 'enrolled', secret: record.pending.secret, pending: null, lastStep: step,
          enrolledAt: iso(now), lastVerifiedAt: iso(now),
        });
      }
    } else {
      if (record.status !== 'enrolled' || !record.secret) {
        return { ok: false as const, message: 'Set up two-step verification first.' };
      }
      if (typeof input.recoveryCode === 'string' && input.recoveryCode.trim()) {
        const hash = recoveryCodeHash(key, uid, codeInput(input.recoveryCode));
        const codes = record.recoveryCodes ?? [];
        if (codes.includes(hash)) {
          method = 'recovery';
          patch.recoveryCodes = codes.filter((value) => value !== hash);
          patch.lastVerifiedAt = iso(now);
        }
      } else {
        const step = matchTotp(openSecret(key, uid, record.secret), codeInput(input.code), { lastUsedStep: record.lastStep });
        if (step !== null) {
          method = 'totp';
          patch.lastStep = step;
          patch.lastVerifiedAt = iso(now);
        }
      }
    }

    if (method) {
      Object.assign(patch, { failures: 0, lockedUntil: null });
      tx.set(ref, { uid, ...patch }, { merge: true });
      return { ok: true as const, method, recoveryCodesLeft: (patch.recoveryCodes ?? record.recoveryCodes ?? []).length };
    }
    const failures = (record.failures ?? 0) + 1;
    const lock = failures >= MAX_FAILED_ATTEMPTS ? now + MFA_LOCK_MINUTES * 60_000 : null;
    tx.set(ref, { uid, ...patch, failures: lock ? 0 : failures, lockedUntil: lock }, { merge: true });
    if (lock) audit(tx, uid, 'staff_mfa.locked', uid, { failures }, 'failure');
    return {
      ok: false as const,
      message: lock ? lockedMessage(lock) : `That code is not right. ${MAX_FAILED_ATTEMPTS - failures} attempt${MAX_FAILED_ATTEMPTS - failures === 1 ? '' : 's'} left before a ${MFA_LOCK_MINUTES}-minute lock.`,
    };
  });
  if (!outcome.ok) throw new HttpsError('permission-denied', outcome.message, { reason: 'staff-mfa-code' });
  return outcome;
}

async function issueRecoveryCodes(uid: string, key: Buffer) {
  const codes = newRecoveryCodes();
  await recordRef(uid).set({ recoveryCodes: codes.map((code) => recoveryCodeHash(key, uid, code)), updatedAt: iso() }, { merge: true });
  return codes;
}

export const staffMfa = onCall({ ...CONTRIBUTOR_CALL_OPTIONS, ...ADMIN_APP_CHECK_OPTIONS, secrets: [STAFF_MFA_KEY] }, guarded('staffMfa', async (req) => {
  const uid = requireAuth(req);
  const claims = callerClaims(req);
  if (!hasStaffStanding(claims)) {
    throw new HttpsError('permission-denied', 'Two-step verification is for admin console staff. This account has no staff role.');
  }
  const action = String(req.data?.action ?? '');
  await consumeRateLimit('staffMfa', uid, 20);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const authTime = Number(claims.auth_time);
  if (!Number.isInteger(authTime) || authTime <= nowSeconds - STAFF_SESSION_SECONDS) {
    throw new HttpsError('failed-precondition', 'This sign-in has expired. Sign out and sign in again.', { reason: 'staff-session-expired' });
  }
  const verified = hasVerifiedStaffSession(claims, nowSeconds);
  const snap = await recordRef(uid).get();
  const record = (snap.exists ? snap.data() : { uid, status: 'none' }) as MfaRecord;
  const enrolled = record.status === 'enrolled' && Boolean(record.secret);

  if (action === 'status') {
    return {
      enrolled,
      verified,
      sessionExpiresAt: iso((authTime + STAFF_SESSION_SECONDS) * 1000),
      recoveryCodesLeft: enrolled ? (record.recoveryCodes ?? []).length : 0,
      lockedUntil: record.lockedUntil && record.lockedUntil > Date.now() ? iso(record.lockedUntil) : null,
    };
  }

  if (action === 'enroll') {
    // A new authenticator replaces the old one only from a verified sign-in;
    // otherwise anyone holding the Google account could re-enrol past it.
    if (enrolled && !verified) {
      throw new HttpsError('failed-precondition', 'Two-step verification is already set up. Enter a code (or a recovery code) first.');
    }
    const key = mfaKey();
    const secret = newTotpSecret();
    await recordRef(uid).set({
      uid, status: record.status ?? 'none',
      pending: { secret: sealSecret(key, uid, secret), expiresAt: Date.now() + ENROLMENT_TTL_MINUTES * 60_000 },
      updatedAt: iso(),
    }, { merge: true });
    const account = typeof claims.email === 'string' && claims.email ? claims.email : uid;
    return { secret, otpauthUrl: otpauthUrl(secret, account), account, expiresInMinutes: ENROLMENT_TTL_MINUTES };
  }

  if (action === 'confirm') {
    const key = mfaKey();
    await checkCode(uid, key, { code: req.data?.code }, 'confirm');
    const recoveryCodes = await issueRecoveryCodes(uid, key);
    await stampVerifiedSession(uid, authTime);
    await audit(null, uid, enrolled ? 'staff_mfa.replaced' : 'staff_mfa.enrolled', uid);
    return { verified: true, recoveryCodes };
  }

  if (action === 'verify') {
    const key = mfaKey();
    const result = await checkCode(uid, key, { code: req.data?.code, recoveryCode: req.data?.recoveryCode }, 'verify');
    await stampVerifiedSession(uid, authTime);
    await audit(null, uid, 'staff_mfa.verified', uid, { method: result.method, recoveryCodesLeft: result.recoveryCodesLeft });
    return { verified: true, method: result.method, recoveryCodesLeft: result.recoveryCodesLeft };
  }

  // Everything below changes security settings, so it needs a verified sign-in.
  if (!verified) {
    throw new HttpsError('failed-precondition', 'Verify this sign-in with your authenticator code first.', { reason: 'staff-mfa-required' });
  }

  if (action === 'recoveryCodes') {
    if (!enrolled) throw new HttpsError('failed-precondition', 'Set up two-step verification first.');
    const recoveryCodes = await issueRecoveryCodes(uid, mfaKey());
    await audit(null, uid, 'staff_mfa.recovery_codes_replaced', uid);
    return { recoveryCodes };
  }

  if (action === 'roster') {
    if (!roleSatisfies(effectiveRole(claims), 'admin')) throw new HttpsError('permission-denied', 'admin access is required.');
    const people: { uid: string; email: string; role: string | null; enrolled: boolean; lastVerifiedAt: string | null }[] = [];
    let pageToken: string | undefined;
    let scanned = 0;
    do {
      const page = await getAuth().listUsers(1000, pageToken);
      for (const user of page.users) {
        const userClaims = { ...(user.customClaims ?? {}), uid: user.uid };
        if (hasStaffStanding(userClaims)) people.push({ uid: user.uid, email: user.email ?? '', role: effectiveRole(userClaims), enrolled: false, lastVerifiedAt: null });
      }
      scanned += page.users.length;
      pageToken = page.pageToken;
    } while (pageToken && scanned < 20_000);
    const records = people.length ? await db().getAll(...people.map((person) => recordRef(person.uid))) : [];
    records.forEach((doc, index) => {
      people[index].enrolled = doc.get('status') === 'enrolled';
      people[index].lastVerifiedAt = doc.get('lastVerifiedAt') ?? null;
    });
    return { people: people.sort((a, b) => a.email.localeCompare(b.email)) };
  }

  if (action === 'reset') {
    // Lost phone and no recovery codes: the super administrator clears the
    // enrolment so the person sets up again at their next sign-in.
    if (!isOwnerSuperAdmin(claims)) throw new HttpsError('permission-denied', 'Only the super administrator can reset someone’s two-step verification.');
    const target = typeof req.data?.uid === 'string' ? req.data.uid : '';
    if (!target) throw new HttpsError('invalid-argument', 'Choose whose two-step verification to reset.');
    if (target === uid) throw new HttpsError('permission-denied', 'Use one of your recovery codes, or the owner reset script, for your own account.');
    const user = await getAuth().getUser(target);
    const targetClaims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
    delete targetClaims[STAFF_MFA_CLAIM];
    await recordRef(target).delete();
    await getAuth().setCustomUserClaims(target, targetClaims);
    await audit(null, uid, 'staff_mfa.reset', target, { email: user.email ?? null });
    return { uid: target, reset: true };
  }

  throw new HttpsError('invalid-argument', 'Unknown two-step verification action.');
}));
