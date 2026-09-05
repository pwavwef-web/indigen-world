import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { consumeRateLimit } from './rate-limit.js';
import {
  type RestoreCredentialConfig,
  restoreCredentialConfigFrom,
} from './restore-credential-config.js';

/**
 * Zero-Tap Sign-In: the relying party behind Android's Restore Credentials API.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Google Play requires, from April 2027, that any app supporting user sign-in
 * signs a member back in *without a tap* when they move to a new Android
 * handset. The mechanism is the Restore Credentials API: after a member
 * authenticates, the app asks the system to mint a restore key; the backup
 * service carries that key to the next device with the app; on first launch
 * there the app asserts the key and is handed a session.
 *
 * ── Why it is a WebAuthn server and not a token store ──────────────────────
 * A restore key is a public-key credential in every respect — the same
 * `PublicKeyCredentialCreationOptionsJSON` in, the same attestation and
 * assertion out. The private half never leaves the device's credential store,
 * which is the entire security property: what travels between handsets is a
 * key Google's backup transport moves under the member's own account, and what
 * reaches this backend is a signature over a challenge it issued moments ago.
 * A "restore token" kept in Firestore would be a bearer credential for the
 * account, sitting in a database, forever. So the verification is real FIDO
 * verification, done by a FIDO library.
 *
 * ── What a successful assertion buys ──────────────────────────────────────
 * A Firebase custom token for the uid the credential was registered to, and
 * nothing else. The app exchanges it for a normal session, so every rule and
 * claim downstream is unchanged — this is a way of signing in, not a way of
 * being someone.
 *
 * ── Configuration ─────────────────────────────────────────────────────────
 * Two values, both in `services/functions/.env`:
 *
 *   RESTORE_CREDENTIAL_RP_ID     the domain the credential is scoped to. It
 *                                must be a domain whose assetlinks.json names
 *                                this app under `common.get_login_creds`, or
 *                                the device refuses to mint the key at all.
 *   ANDROID_CERTIFICATE_DIGESTS  every signing certificate that may assert it.
 *                                The same list Play Integrity already checks
 *                                against, reused rather than duplicated — a
 *                                second copy of this list is a second thing to
 *                                forget on a key rotation.
 *
 * With either missing the feature reports itself disabled and the app falls
 * back to an ordinary sign-in screen. That is deliberate: a half-configured
 * relying party that accepted assertions it could not attribute would be far
 * worse than one that politely does nothing.
 */

const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
const REGION = 'us-central1';

/** Challenges waiting to be spent. Server-only, short-lived. */
const CHALLENGE_COLLECTION = '_restoreCredentialChallenges';

/** One registered restore key per member. Server-only. */
const CREDENTIAL_COLLECTION = '_restoreCredentials';

/**
 * Credential id → uid.
 *
 * Needed because a restore sign-in arrives unauthenticated: the assertion is
 * the only thing identifying the member, and it identifies them by credential
 * id. Without this map the backend would have to scan every credential.
 */
const CREDENTIAL_INDEX_COLLECTION = '_restoreCredentialIndex';

/** A challenge is worth minutes. Device setup is not a slow ceremony. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** The friendly name Android may show if it ever surfaces the credential. */
const RP_NAME = 'Indigen World';

function config(): RestoreCredentialConfig | null {
  const settings = restoreCredentialConfigFrom(process.env);
  if (settings !== null && settings.rejected.length > 0) {
    logger.warn('ANDROID_CERTIFICATE_DIGESTS contains values that are not SHA-256 digests', {
      rejected: settings.rejected,
    });
  }
  return settings;
}

/**
 * Issues a challenge and remembers it.
 *
 * The challenge is the whole anti-replay story, so it lives here rather than
 * in the response the phone hands back: an assertion is only accepted against
 * a challenge this backend minted, has not yet spent, and issued within the
 * last few minutes.
 */
async function issueChallenge(
  kind: 'register' | 'signin',
  uid: string | null,
): Promise<{ id: string; challenge: string }> {
  const challenge = randomBytes(32).toString('base64url');
  const db = getFirestore();
  const ref = db.collection(CHALLENGE_COLLECTION).doc();
  await ref.set({
    kind,
    uid,
    challenge,
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + CHALLENGE_TTL_MS,
    spent: false,
  });
  return { id: ref.id, challenge };
}

/**
 * Burns a challenge and returns it, or throws.
 *
 * Transactional because two devices racing the same challenge must not both be
 * told they are fine — for the sign-in flow that would be two sessions minted
 * from one signature.
 */
async function spendChallenge(
  challengeId: string,
  kind: 'register' | 'signin',
  uid: string | null,
): Promise<string> {
  if (challengeId.length === 0) {
    throw new HttpsError('invalid-argument', 'A challenge id is required.');
  }
  const db = getFirestore();
  const ref = db.collection(CHALLENGE_COLLECTION).doc(challengeId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError('failed-precondition', 'That challenge is not valid.');
    }
    const data = snap.data() ?? {};
    if (data.spent === true) {
      throw new HttpsError('failed-precondition', 'That challenge has already been used.');
    }
    if (data.kind !== kind) {
      throw new HttpsError('failed-precondition', 'That challenge is for a different step.');
    }
    if (typeof data.expiresAtMs !== 'number' || data.expiresAtMs < Date.now()) {
      throw new HttpsError('deadline-exceeded', 'That challenge has expired. Please try again.');
    }
    // A registration challenge belongs to the member it was issued to. A
    // sign-in challenge belongs to nobody yet — that is what the assertion is
    // about to establish — so it carries a null uid and is not checked here.
    if (uid !== null && data.uid !== uid) {
      throw new HttpsError('permission-denied', 'That challenge belongs to another account.');
    }
    if (typeof data.challenge !== 'string') {
      throw new HttpsError('failed-precondition', 'That challenge is not valid.');
    }
    tx.update(ref, { spent: true, spentAtMs: Date.now() });
    return data.challenge;
  });
}

/**
 * Step 1 of creating a restore key: the creation options the system needs.
 *
 * Called right after a member signs in, and again on a later launch if no key
 * has been minted for this install yet. Silent — the member is not asked
 * anything, because they have just answered the only question that matters.
 */
export const startRestoreKeyRegistration = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
  },
  async (req) => {
    const settings = config();
    if (settings === null) return { enabled: false, challengeId: '', requestJson: '' };

    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
    await consumeRateLimit('startRestoreKeyRegistration', uid, 10);

    const { id, challenge } = await issueChallenge('register', uid);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: settings.rpId,
      // The uid, not the email. A restore key outlives an address change, and
      // the uid is what the custom token at the other end is minted for.
      userID: Buffer.from(uid, 'utf8'),
      // Both claims arrive through the token's index signature, so neither is
      // guaranteed to be a string however plausible it looks. Neither is used
      // for anything but a label the system may never show.
      userName: typeof req.auth?.token.email === 'string' ? req.auth.token.email : uid,
      userDisplayName:
        typeof req.auth?.token.name === 'string' ? req.auth.token.name : 'Indigen member',
      challenge,
      attestationType: 'none',
      // Nothing to exclude: one restore key per member, and a second
      // registration deliberately replaces the first.
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: 'required',
        // A restore key is created and asserted with nobody watching. Asking
        // for user verification here would be asking the system for something
        // it cannot supply, on every launch.
        userVerification: 'discouraged',
      },
    });

    return { enabled: true, challengeId: id, requestJson: JSON.stringify(options) };
  },
);

/**
 * Step 2: stores the public half of the key the device just minted.
 *
 * The private half stays in the device's credential store and is never seen
 * here, which is why what is written below is safe to keep and useless to
 * steal on its own.
 */
export const finishRestoreKeyRegistration = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
  },
  async (req) => {
    const settings = config();
    if (settings === null) return { enabled: false, created: false };

    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
    await consumeRateLimit('finishRestoreKeyRegistration', uid, 10);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const challengeId = typeof data.challengeId === 'string' ? data.challengeId : '';
    const responseJson = typeof data.responseJson === 'string' ? data.responseJson : '';
    if (responseJson.length === 0) {
      throw new HttpsError('invalid-argument', 'A registration response is required.');
    }

    const expectedChallenge = await spendChallenge(challengeId, 'register', uid);

    let response: RegistrationResponseJSON;
    try {
      response = JSON.parse(responseJson) as RegistrationResponseJSON;
    } catch {
      throw new HttpsError('invalid-argument', 'That registration response is not valid JSON.');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: [...settings.expectedOrigins],
        expectedRPID: settings.rpId,
        // Both false on purpose, and both for the same reason: a restore key
        // is minted by the system with nobody present. The default settings
        // would refuse every genuine restore credential ever created.
        requireUserPresence: false,
        requireUserVerification: false,
      });
    } catch (error) {
      logger.warn('Restore key registration failed verification', { uid, error });
      throw new HttpsError('permission-denied', 'That restore key could not be verified.');
    }

    if (!verification.verified) {
      throw new HttpsError('permission-denied', 'That restore key could not be verified.');
    }

    const credential = verification.registrationInfo.credential;
    const db = getFirestore();
    const credentialRef = db.collection(CREDENTIAL_COLLECTION).doc(uid);
    const previous = await credentialRef.get();
    const previousId = previous.get('credentialId');

    const batch = db.batch();
    // A member gets one restore key. Re-registering replaces it, and the old
    // index entry has to go with it or a stale credential id keeps resolving
    // to an account it no longer opens.
    if (typeof previousId === 'string' && previousId !== credential.id) {
      batch.delete(db.collection(CREDENTIAL_INDEX_COLLECTION).doc(previousId));
    }
    batch.set(credentialRef, {
      uid,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? [],
      aaguid: verification.registrationInfo.aaguid,
      createdAtMs: previous.get('createdAtMs') ?? Date.now(),
      updatedAtMs: Date.now(),
    });
    batch.set(db.collection(CREDENTIAL_INDEX_COLLECTION).doc(credential.id), {
      uid,
      updatedAtMs: Date.now(),
    });
    await batch.commit();

    return { enabled: true, created: true };
  },
);

/**
 * Step 1 of a zero-tap sign-in: the request options for the new device.
 *
 * Unauthenticated by necessity — the whole point is that nobody is signed in
 * yet. `allowCredentials` is left empty because the backend has no idea who is
 * holding this handset; the system matches on the relying party id and offers
 * whichever restore key it carried across.
 */
export const startRestoreSignIn = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const settings = config();
    if (settings === null) return { enabled: false, challengeId: '', requestJson: '' };

    // Deliberately a high ceiling. Without a session there is nothing to key a
    // limit on but the App Check app id, which is the same value for every
    // device — so this counter is shared by the whole install base, and a
    // limit tight enough to stop an attacker would also stop a morning's worth
    // of genuine device transfers. It is a runaway-cost backstop, not the
    // protection: what stops a forged assertion is the signature check below.
    await consumeRateLimit('startRestoreSignIn', req.app?.appId ?? 'anonymous', 600);

    const { id, challenge } = await issueChallenge('signin', null);
    const options = await generateAuthenticationOptions({
      rpID: settings.rpId,
      challenge,
      allowCredentials: [],
      userVerification: 'discouraged',
    });

    return { enabled: true, challengeId: id, requestJson: JSON.stringify(options) };
  },
);

/**
 * Step 2: verifies the assertion and hands back a session.
 *
 * This is an authentication endpoint reachable without a session, so it is the
 * most security-sensitive callable in the codebase. Three things stand between
 * an assertion and a custom token, and all three are checked before any token
 * is minted: the challenge was issued here and is unspent, the origin is one of
 * this app's own signing certificates, and the signature verifies against the
 * public key registered for that credential id.
 */
export const finishRestoreSignIn = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const settings = config();
    if (settings === null) return { enabled: false, customToken: '' };

    // Shared across the install base for the same reason as the ceiling on
    // `startRestoreSignIn`, and set to match it: a caller who cannot get a
    // challenge cannot get here, so a second, tighter limit would only ever
    // refuse somebody who already had one.
    await consumeRateLimit('finishRestoreSignIn', req.app?.appId ?? 'anonymous', 600);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const challengeId = typeof data.challengeId === 'string' ? data.challengeId : '';
    const responseJson = typeof data.responseJson === 'string' ? data.responseJson : '';
    if (responseJson.length === 0) {
      throw new HttpsError('invalid-argument', 'An authentication response is required.');
    }

    const expectedChallenge = await spendChallenge(challengeId, 'signin', null);

    let response: AuthenticationResponseJSON;
    try {
      response = JSON.parse(responseJson) as AuthenticationResponseJSON;
    } catch {
      throw new HttpsError('invalid-argument', 'That authentication response is not valid JSON.');
    }

    const credentialId = typeof response.id === 'string' ? response.id : '';
    if (credentialId.length === 0) {
      throw new HttpsError('invalid-argument', 'That authentication response has no credential id.');
    }

    const db = getFirestore();
    const indexSnap = await db.collection(CREDENTIAL_INDEX_COLLECTION).doc(credentialId).get();
    const uid = indexSnap.get('uid');
    if (typeof uid !== 'string') {
      // Not an error worth naming to the caller. An unknown credential id is
      // what a device that never had a key looks like, and it is also what an
      // attacker probing with a made-up one looks like; neither learns
      // anything from the same flat answer.
      throw new HttpsError('permission-denied', 'That restore key is not recognised.');
    }

    const credentialRef = db.collection(CREDENTIAL_COLLECTION).doc(uid);
    const credentialSnap = await credentialRef.get();
    const publicKey = credentialSnap.get('publicKey');
    if (typeof publicKey !== 'string') {
      throw new HttpsError('permission-denied', 'That restore key is not recognised.');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: [...settings.expectedOrigins],
        expectedRPID: settings.rpId,
        credential: {
          id: credentialId,
          publicKey: new Uint8Array(Buffer.from(publicKey, 'base64url')),
          counter: typeof credentialSnap.get('counter') === 'number'
            ? (credentialSnap.get('counter') as number)
            : 0,
          transports: credentialSnap.get('transports') ?? undefined,
        },
        requireUserVerification: false,
        // A restore assertion is produced during device setup with nobody
        // touching anything, so neither the user-presence nor the
        // user-verified flag will be set. This is the documented way to say
        // "those flags are optional" without also saying the signature is.
        advancedFIDOConfig: { userVerification: 'discouraged' },
      });
    } catch (error) {
      logger.warn('Restore sign-in failed verification', { uid, error });
      throw new HttpsError('permission-denied', 'That restore key could not be verified.');
    }

    if (!verification.verified) {
      throw new HttpsError('permission-denied', 'That restore key could not be verified.');
    }

    await credentialRef.update({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAtMs: Date.now(),
    });

    const customToken = await getAuth().createCustomToken(uid);
    logger.info('Zero-tap sign-in restored a session', { uid });
    return { enabled: true, customToken };
  },
);

/**
 * Forgets a member's restore key.
 *
 * Called when somebody signs out. The device clears its own half through
 * `ClearCredentialStateRequest`; this clears ours, so a key that can no longer
 * be asserted also stops resolving to an account.
 */
export const forgetRestoreKey = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
    await consumeRateLimit('forgetRestoreKey', uid, 10);

    const db = getFirestore();
    const credentialRef = db.collection(CREDENTIAL_COLLECTION).doc(uid);
    const snap = await credentialRef.get();
    if (!snap.exists) return { forgotten: false };

    const credentialId = snap.get('credentialId');
    const batch = db.batch();
    if (typeof credentialId === 'string') {
      batch.delete(db.collection(CREDENTIAL_INDEX_COLLECTION).doc(credentialId));
    }
    batch.delete(credentialRef);
    await batch.commit();
    return { forgotten: true };
  },
);
