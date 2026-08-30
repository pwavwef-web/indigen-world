import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { ARKESEL_API_KEY, isSmsConfigured, normalizeMsisdn, sendSmsToMsisdn } from './sms.js';

/**
 * Proving a real person holds an account, by SMS.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Every mark the community shows beside a name now rests on this. A badge that
 * says the project vouches for someone should not sit above an account that
 * could belong to nobody, and a small language community is exactly the size
 * where a handful of throwaway accounts does real damage.
 *
 * ── What is stored, and what is not ───────────────────────────────────────
 * Never the number, and never the code. The challenge document holds a salted
 * hash of each, and `communityProfiles` — which is world-readable — gets only a
 * boolean and a timestamp. A verified number is remembered as a one-way hash in
 * `verifiedPhones`, which is enough to stop one phone verifying two accounts
 * and not enough to read anybody's number off the database.
 *
 * Both callables run with admin credentials and bypass the Security Rules, which
 * is the point: the rules refuse these fields to every client, including the one
 * that owns the profile.
 */

/** How long a code is worth answering. Long enough for a slow SMS network. */
const CODE_TTL_MS = 10 * 60 * 1000;

/** Wrong answers before the challenge is burned and a new code is needed. */
const MAX_ATTEMPTS = 5;

/** The quietest gap between two sends, so "resend" cannot be a hammer. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

const CALL_OPTIONS = {
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public' as const,
  secrets: [ARKESEL_API_KEY],
};

function hash(value: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

/**
 * A stable, keyed hash of a number, so the same phone produces the same value
 * on every account without the value being reversible into a number.
 *
 * Keyed on a deployment secret where one is configured. Without it this is a
 * plain SHA-256 of an E.164 string, which is a small enough space to brute
 * force — acceptable for "has this number already been used", and the reason
 * nothing more sensitive than that is decided by it.
 */
function phoneFingerprint(msisdn: string): string {
  return createHash('sha256')
    .update(`${process.env.PHONE_HASH_PEPPER ?? 'indigen'}:${msisdn}`)
    .digest('hex');
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  // `timingSafeEqual` throws on a length mismatch, which is itself a leak-free
  // answer: two hex digests of the same algorithm are always the same length.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sends a six-digit code to [phone] and remembers only its hash.
 *
 * Returns when the code is on its way. It never returns the code, not even in
 * the emulator: a client that can read the answer is not a verification.
 */
export const startPhoneVerification = onCall(CALL_OPTIONS, async (req) => {
  const uid = requireAuth(req);
  // Five starts an hour. A member who genuinely mistyped their number twice is
  // unaffected; anything using this as an SMS pump is not.
  await consumeRateLimit('startPhoneVerification', uid, 5, 60 * 60 * 1000);

  const raw = (req.data ?? {}).phone;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'A phone number is required.');
  }
  const msisdn = normalizeMsisdn(raw);
  if (!msisdn) {
    throw new HttpsError(
      'invalid-argument',
      'That does not look like a mobile number. Outside Ghana, include the country code.',
    );
  }
  if (!isSmsConfigured()) {
    throw new HttpsError('failed-precondition', 'SMS is not configured for this environment.');
  }

  const db = getFirestore();
  const profileRef = db.collection('communityProfiles').doc(uid);
  const profile = await profileRef.get();
  if (!profile.exists) {
    throw new HttpsError('failed-precondition', 'Set up your community profile first.');
  }
  if (profile.get('phoneVerified') === true) {
    throw new HttpsError('already-exists', 'This account already has a verified number.');
  }

  const fingerprint = phoneFingerprint(msisdn);
  const owner = await db.collection('verifiedPhones').doc(fingerprint).get();
  if (owner.exists && owner.get('uid') !== uid) {
    // Refused here rather than after the code is answered, so nobody pays for
    // an SMS that could never have counted.
    throw new HttpsError('already-exists', 'That number is already verifying another account.');
  }

  const challengeRef = db.collection('phoneVerifications').doc(uid);
  const existing = await challengeRef.get();
  const lastSentAt = existing.get('lastSentAt') as Timestamp | undefined;
  if (lastSentAt && Date.now() - lastSentAt.toMillis() < RESEND_COOLDOWN_MS) {
    throw new HttpsError('resource-exhausted', 'Wait a moment before asking for another code.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = randomBytes(16).toString('hex');
  const expiresAt = Timestamp.fromMillis(Date.now() + CODE_TTL_MS);

  await challengeRef.set({
    uid,
    // Neither the code nor the number is recoverable from what is stored.
    codeHash: hash(code, salt),
    msisdnHash: hash(msisdn, salt),
    fingerprint,
    salt,
    attempts: 0,
    expiresAt,
    lastSentAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });

  const sent = await sendSmsToMsisdn(
    msisdn,
    `${code} is your Indigen World verification code. It expires in 10 minutes.`,
  );
  if (!sent.ok) {
    await challengeRef.delete();
    logger.error('Phone verification SMS failed', { uid, reason: sent.error });
    throw new HttpsError('unavailable', 'The code could not be sent. Try again shortly.');
  }

  logger.info('Phone verification started', { uid });
  return { expiresAt: expiresAt.toDate().toISOString() };
});

/**
 * Answers the challenge. On success the profile is marked verified and the
 * challenge is destroyed.
 */
export const confirmPhoneVerification = onCall(CALL_OPTIONS, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('confirmPhoneVerification', uid, 20, 60 * 60 * 1000);

  const raw = (req.data ?? {}).code;
  const code = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
  if (code.length !== 6) {
    throw new HttpsError('invalid-argument', 'Enter the six-digit code.');
  }

  const db = getFirestore();
  const challengeRef = db.collection('phoneVerifications').doc(uid);
  const challenge = await challengeRef.get();
  if (!challenge.exists) {
    throw new HttpsError('not-found', 'Ask for a code first.');
  }

  const expiresAt = challenge.get('expiresAt') as Timestamp | undefined;
  if (!expiresAt || expiresAt.toMillis() < Date.now()) {
    await challengeRef.delete();
    throw new HttpsError('deadline-exceeded', 'That code has expired. Ask for a new one.');
  }

  const attempts = Number(challenge.get('attempts') ?? 0);
  if (attempts >= MAX_ATTEMPTS) {
    await challengeRef.delete();
    throw new HttpsError('resource-exhausted', 'Too many wrong codes. Ask for a new one.');
  }

  const salt = String(challenge.get('salt') ?? '');
  if (!constantTimeEquals(hash(code, salt), String(challenge.get('codeHash') ?? ''))) {
    await challengeRef.update({ attempts: FieldValue.increment(1) });
    const left = MAX_ATTEMPTS - attempts - 1;
    throw new HttpsError(
      'invalid-argument',
      left > 0 ? `That code is not right. ${left} tries left.` : 'That code is not right.',
    );
  }

  const fingerprint = String(challenge.get('fingerprint') ?? '');
  const ownerRef = db.collection('verifiedPhones').doc(fingerprint);
  const profileRef = db.collection('communityProfiles').doc(uid);
  const auditRef = db.collection('auditLogs').doc();

  await db.runTransaction(async (tx) => {
    const owner = await tx.get(ownerRef);
    if (owner.exists && owner.get('uid') !== uid) {
      // Somebody else finished verifying this number between the send and the
      // answer. Whoever answered first keeps it.
      throw new HttpsError('already-exists', 'That number is already verified on another account.');
    }
    tx.set(ownerRef, { uid, verifiedAt: FieldValue.serverTimestamp() });
    tx.set(
      profileRef,
      { phoneVerified: true, phoneVerifiedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    tx.set(auditRef, {
      id: auditRef.id,
      action: 'community.phoneVerified',
      actorUid: uid,
      targetUid: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.delete(challengeRef);
  });

  logger.info('Phone verified', { uid });
  return { phoneVerified: true };
});
