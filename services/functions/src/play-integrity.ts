import { randomBytes } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { PLAY_INTEGRITY_SCOPE, callGoogleApi, GoogleApiAuthError } from './google-api-auth.js';
import {
  type IntegrityPayload,
  type IntegrityVerdict,
  evaluateIntegrity,
  integrityPolicyFromEnv,
} from './play-integrity-policy.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * Play Integrity: asking Google what it thinks of the device we are talking to.
 *
 * ── Why this exists next to App Check ─────────────────────────────────────
 * Firebase App Check already runs the Play Integrity provider on this app, and
 * that is what protects ordinary Firestore and callable traffic. It answers one
 * question — "is this a genuine install of this app on a genuine device" — and
 * it answers it as a yes/no that this backend never sees the reasoning for.
 *
 * The seven services Play Console lists under the Play Integrity API are the
 * reasoning. Play Protect state, recent device activity, app access risk and
 * licensing are not part of an App Check token and cannot be read from one.
 * Getting them means requesting an integrity verdict directly, which is what
 * this module does, and it is why the two live side by side rather than one
 * replacing the other.
 *
 * ── The shape of a check ──────────────────────────────────────────────────
 * 1. The app calls `startIntegrityCheck` and is handed a single-use request
 *    hash with a short life.
 * 2. The app asks Play for a Standard integrity token bound to that hash.
 * 3. The app calls `verifyDeviceIntegrity` with the token. This decodes it
 *    server-side, checks the hash came back unchanged, burns the challenge and
 *    records the verdict.
 *
 * A token the app decoded for itself would prove nothing — the thing being
 * judged is the app — so decoding happens here, against Google, or not at all.
 */

const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
const REGION = 'us-central1';

/** Where a single-use request hash waits to be spent. Server-only. */
const CHALLENGE_COLLECTION = '_integrityChallenges';

/** Where the last verdict per member is kept. Server-only; staff may read. */
const VERDICT_COLLECTION = 'deviceIntegrityChecks';

/** A challenge is worth minutes, not hours. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * How long a recorded verdict stands before a gated action wants a new one.
 *
 * A day: long enough that somebody who checked this morning is not asked again
 * before they can subscribe this evening, short enough that a device that has
 * since been compromised is re-judged well before a renewal.
 */
const VERDICT_FRESHNESS_MS = 24 * 60 * 60 * 1000;

export function integrityPolicy() {
  return integrityPolicyFromEnv(process.env);
}

/** Whether this deployment is meant to be doing any of this at all. */
export function isIntegrityEnabled(): boolean {
  return integrityPolicy().mode !== 'off';
}

/**
 * Decodes a Standard or Classic integrity token through Google.
 *
 * Returns null when the deployment has no credentials or Google refused, which
 * is treated everywhere as "no verdict" rather than as a bad verdict. An
 * outage at Google is not evidence against a member's phone.
 */
export async function decodeIntegrityToken(
  packageName: string,
  token: string,
): Promise<IntegrityPayload | null> {
  const url =
    'https://playintegrity.googleapis.com/v1/'
    + `${encodeURIComponent(packageName)}:decodeIntegrityToken`;

  try {
    const result = await callGoogleApi<{ tokenPayloadExternal?: IntegrityPayload }>({
      url,
      scope: PLAY_INTEGRITY_SCOPE,
      method: 'POST',
      body: { integrity_token: token },
    });
    if (!result.ok) return null;
    return result.data.tokenPayloadExternal ?? null;
  } catch (error) {
    if (error instanceof GoogleApiAuthError) {
      logger.warn('Play Integrity is not configured for this deployment');
      return null;
    }
    throw error;
  }
}

/**
 * Hands the app a single-use value to bind its next integrity request to.
 *
 * Open to guests on purpose. Kawuri and the Explore feed both work signed out,
 * and a device check that only signed-in members could run would leave the
 * surfaces most worth protecting from automation entirely unprotected.
 */
export const startIntegrityCheck = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const policy = integrityPolicy();
    if (policy.mode === 'off') {
      return { enabled: false, challengeId: '', requestHash: '', ttlSeconds: 0 };
    }

    const actor = req.auth?.uid ?? req.app?.appId ?? 'anonymous';
    await consumeRateLimit('startIntegrityCheck', actor, 20);

    // base64url so it survives a JSON round trip and the Play SDK's own
    // 500-byte request-hash limit without any escaping.
    const requestHash = randomBytes(32).toString('base64url');
    const db = getFirestore();
    const ref = db.collection(CHALLENGE_COLLECTION).doc();
    await ref.set({
      requestHash,
      uid: req.auth?.uid ?? null,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + CHALLENGE_TTL_MS,
      spent: false,
    });

    return {
      enabled: true,
      challengeId: ref.id,
      requestHash,
      ttlSeconds: Math.floor(CHALLENGE_TTL_MS / 1000),
    };
  },
);

/**
 * Decodes and judges a token the app just obtained from Play.
 *
 * Returns the decision and the reasons rather than a bare boolean. The app uses
 * `blocked` to decide whether to stop; everything else exists so a support
 * conversation can be about a named signal instead of "it says no".
 */
export const verifyDeviceIntegrity = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
    timeoutSeconds: 30,
  },
  async (req) => {
    const policy = integrityPolicy();
    if (policy.mode === 'off') {
      return { enabled: false, decision: 'allow', blocked: false, reasons: [] };
    }

    const actor = req.auth?.uid ?? req.app?.appId ?? 'anonymous';
    await consumeRateLimit('verifyDeviceIntegrity', actor, 20);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const token = typeof data.token === 'string' ? data.token.trim() : '';
    const challengeId = typeof data.challengeId === 'string' ? data.challengeId : '';
    if (token.length === 0) {
      throw new HttpsError('invalid-argument', 'An integrity token is required.');
    }
    if (!policy.expectedPackageName) {
      logger.warn('ANDROID_PACKAGE_NAME is unset; integrity checks cannot run');
      return { enabled: false, decision: 'allow', blocked: false, reasons: [] };
    }

    const db = getFirestore();

    // Spend the challenge before the token is decoded, in a transaction, so two
    // devices racing the same hash cannot both be told they are fine.
    let expectedHash: string | undefined;
    if (challengeId) {
      const challengeRef = db.collection(CHALLENGE_COLLECTION).doc(challengeId);
      expectedHash = await db.runTransaction(async (tx) => {
        const snap = await tx.get(challengeRef);
        if (!snap.exists) return undefined;
        if (snap.get('spent') === true) return undefined;
        if (Number(snap.get('expiresAtMs') ?? 0) < Date.now()) return undefined;
        tx.update(challengeRef, { spent: true, spentAtMs: Date.now() });
        const hash = snap.get('requestHash');
        return typeof hash === 'string' ? hash : undefined;
      });
      if (!expectedHash) {
        throw new HttpsError(
          'failed-precondition',
          'That check has already been used or has expired. Start a new one.',
        );
      }
    }

    const payload = await decodeIntegrityToken(policy.expectedPackageName, token);
    if (payload === null) {
      // Nothing to judge. Say so plainly rather than inventing a verdict.
      return {
        enabled: true,
        decision: 'allow',
        blocked: false,
        reasons: ['undecodable'],
      };
    }

    const verdict = evaluateIntegrity({
      payload,
      policy,
      expectedHash,
      now: Date.now(),
    });

    await recordVerdict(req.auth?.uid ?? null, verdict);

    return {
      enabled: true,
      mode: policy.mode,
      decision: verdict.decision,
      blocked: verdict.blocked,
      reasons: verdict.reasons,
      deviceTrust: verdict.signals.deviceTrust,
    };
  },
);

/** Writes the verdict where support and the gates below can find it. */
async function recordVerdict(
  uid: string | null,
  verdict: IntegrityVerdict,
): Promise<void> {
  logger.info('Play Integrity verdict', {
    uid: uid ?? 'anonymous',
    decision: verdict.decision,
    reasons: verdict.reasons,
    deviceTrust: verdict.signals.deviceTrust,
    playProtect: verdict.signals.playProtect,
    activityLevel: verdict.signals.activityLevel,
  });

  if (!uid) return;
  const db = getFirestore();
  await db.collection(VERDICT_COLLECTION).doc(uid).set(
    {
      uid,
      decision: verdict.decision,
      reasons: verdict.reasons,
      blocked: verdict.blocked,
      signals: {
        licensing: verdict.signals.licensing,
        appRecognition: verdict.signals.appRecognition,
        deviceTrust: verdict.signals.deviceTrust,
        virtualDevice: verdict.signals.virtualDevice,
        activityLevel: verdict.signals.activityLevel,
        playProtect: verdict.signals.playProtect,
        appsDetected: verdict.signals.appsDetected,
      },
      checkedAtMs: Date.now(),
      checkedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Refuses an action when the last verdict for this member said to.
 *
 * Only ever refuses in `enforce` mode, and only on a verdict that is both
 * recent and negative. A member who has never run a check is not refused: the
 * check is something the app does, and an old build that does not know how to
 * do it must not be locked out of paying by a server it cannot see.
 */
export async function assertDeviceIntegrity(
  uid: string,
  operation: string,
): Promise<void> {
  const policy = integrityPolicy();
  if (policy.mode !== 'enforce') return;

  const snap = await getFirestore().collection(VERDICT_COLLECTION).doc(uid).get();
  if (!snap.exists) return;

  const checkedAtMs = Number(snap.get('checkedAtMs') ?? 0);
  if (Date.now() - checkedAtMs > VERDICT_FRESHNESS_MS) return;
  if (snap.get('decision') !== 'block') return;

  logger.warn('Refused an action on a failing integrity verdict', {
    uid,
    operation,
    reasons: snap.get('reasons'),
  });
  throw new HttpsError(
    'failed-precondition',
    'This device did not pass Google Play\'s security check. Update the app '
      + 'from Play, restart your phone, and try again.',
  );
}
