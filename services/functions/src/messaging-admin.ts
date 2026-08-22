import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { ARKESEL_API_KEY, checkBalance, normalizeGhanaPhone, sendSms } from './sms.js';

// App Check enforcement is opt-in across the codebase (see creators.ts); enable
// via ENFORCE_APP_CHECK=true once App Check is configured for the admin app.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/**
 * Admin-only: read the Arkesel SMS balance for the console. The API key stays
 * server-side — the admin app never sees it, it only calls this function.
 */
export const smsBalance = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public', secrets: [ARKESEL_API_KEY] },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'admin');
    await consumeRateLimit('smsBalance', uid, 60);
    try {
      return await checkBalance();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      throw new HttpsError(reason === 'not-configured' ? 'failed-precondition' : 'unavailable', 'Could not read the SMS balance.');
    }
  },
);

/**
 * Admin-only: send a test SMS from the console to confirm the integration and
 * sender ID are working.
 */
export const sendTestSms = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public', secrets: [ARKESEL_API_KEY] },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'admin');
    await consumeRateLimit('sendTestSms', uid, 20);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const recipient = normalizeGhanaPhone(typeof data.to === 'string' ? data.to : '');
    if (!recipient) {
      throw new HttpsError('invalid-argument', 'A valid Ghana phone number is required.');
    }
    const message = (typeof data.message === 'string' && data.message.trim())
      ? data.message.trim().slice(0, 400)
      : 'Indigen World test SMS — your Arkesel integration is working.';

    const result = await sendSms({ to: recipient, message });
    if (!result.ok) {
      throw new HttpsError(
        result.error === 'not-configured' ? 'failed-precondition' : 'unavailable',
        `SMS could not be sent (${result.error ?? 'unknown'}).`,
      );
    }
    return { ok: true, id: result.id ?? null, recipient };
  },
);
