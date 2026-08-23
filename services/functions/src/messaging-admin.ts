import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  ARKESEL_API_KEY,
  checkBalance,
  formatArkeselSchedule,
  normalizeGhanaPhone,
  sendBulkSms,
  sendSms,
} from './sms.js';

// App Check enforcement is opt-in across the codebase (see creators.ts); enable
// via ENFORCE_APP_CHECK=true once App Check is configured for the admin app.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/** Delimiters an admin might paste between numbers: comma, pipe, semicolon,
 * newline, tab or runs of whitespace. Keeps `+` and digits intact. */
const RECIPIENT_DELIMITER = /[\s,;|]+/;

/** How many numbers Arkesel accepts in one send request before we chunk. */
const SEND_CHUNK = 100;

interface ParsedRecipients {
  valid: string[];
  invalid: string[];
}

/** Split a free-text blob (or array) into normalised, de-duplicated MSISDNs. */
function parseRecipients(raw: unknown): ParsedRecipients {
  const tokens = Array.isArray(raw)
    ? raw.map((t) => String(t))
    : String(raw ?? '').split(RECIPIENT_DELIMITER);
  const valid = new Set<string>();
  const invalid = new Set<string>();
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const normalised = normalizeGhanaPhone(trimmed);
    if (normalised) valid.add(normalised);
    else invalid.add(trimmed);
  }
  return { valid: [...valid], invalid: [...invalid] };
}

/**
 * Resolve every reachable app user's phone number for a broadcast: Firebase Auth
 * accounts with a verified `phoneNumber`, unioned with `creatorProfiles` contact
 * numbers. Returns normalised, de-duplicated MSISDNs.
 */
async function resolveAllUserPhones(db: FirebaseFirestore.Firestore): Promise<string[]> {
  const numbers = new Set<string>();

  // Firebase Auth accounts (paginated, 1000 per page).
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.phoneNumber) {
        const n = normalizeGhanaPhone(user.phoneNumber);
        if (n) numbers.add(n);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // Creator profile contact numbers (may differ from the auth account).
  try {
    const snap = await db.collection('creatorProfiles').get();
    for (const doc of snap.docs) {
      const phone = doc.get('contact.phone');
      if (typeof phone === 'string') {
        const n = normalizeGhanaPhone(phone);
        if (n) numbers.add(n);
      }
    }
  } catch (error) {
    logger.warn('Broadcast: creatorProfiles scan failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }

  return [...numbers];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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

/**
 * Admin-only: send (or schedule) an SMS announcement. The audience is either an
 * explicit list of numbers (any of comma / pipe / semicolon / newline / space
 * separated) or a broadcast to every reachable app user. Optionally scheduled
 * for a future Ghana-local time, and optionally run in Arkesel sandbox mode
 * (simulated, not billed). Every send is recorded to `smsCampaigns` for history.
 */
export const sendSmsCampaign = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public', secrets: [ARKESEL_API_KEY] },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'admin');
    await consumeRateLimit('sendSmsCampaign', uid, 10);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message) throw new HttpsError('invalid-argument', 'A message is required.');
    if (message.length > 900) throw new HttpsError('invalid-argument', 'The message is too long (max 900 characters).');

    const audience = data.audience === 'all' ? 'all' : 'numbers';
    const sandbox = data.sandbox === true;
    const db = getFirestore();

    // ---- Resolve recipients ----
    let recipients: string[];
    let invalid: string[] = [];
    if (audience === 'all') {
      recipients = await resolveAllUserPhones(db);
      if (recipients.length === 0) {
        throw new HttpsError('failed-precondition', 'No app users with a phone number were found to broadcast to.');
      }
    } else {
      const parsed = parseRecipients(data.recipients);
      recipients = parsed.valid;
      invalid = parsed.invalid;
      if (recipients.length === 0) {
        throw new HttpsError('invalid-argument', 'No valid Ghana phone numbers were provided.');
      }
    }

    // ---- Optional scheduling (wall-clock `YYYY-MM-DDTHH:mm`, read as Ghana time) ----
    let scheduledDate: string | undefined;
    let scheduledIso: string | null = null;
    if (typeof data.scheduledAt === 'string' && data.scheduledAt.trim()) {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(data.scheduledAt.trim());
      if (!match) throw new HttpsError('invalid-argument', 'The scheduled time is not a valid date/time.');
      const when = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`);
      if (Number.isNaN(when.getTime())) throw new HttpsError('invalid-argument', 'The scheduled time is not a valid date/time.');
      if (when.getTime() < Date.now() + 60_000) {
        throw new HttpsError('invalid-argument', 'The scheduled time must be at least a minute in the future.');
      }
      scheduledDate = formatArkeselSchedule(when);
      scheduledIso = when.toISOString();
    }

    // ---- Send (chunked) ----
    const ids: string[] = [];
    let sentCount = 0;
    const failures: string[] = [];
    for (const group of chunk(recipients, SEND_CHUNK)) {
      const result = await sendBulkSms({ recipients: group, message, scheduledDate, sandbox });
      if (result.ok) {
        sentCount += group.length;
        ids.push(...result.ids);
      } else {
        failures.push(result.error ?? 'unknown');
        if (result.error === 'not-configured') {
          throw new HttpsError('failed-precondition', 'Arkesel SMS is not configured.');
        }
      }
    }

    const status = sentCount === 0 ? 'failed' : failures.length ? 'partial' : scheduledDate ? 'scheduled' : 'sent';

    // ---- Record the campaign for history / audit ----
    const record = {
      message,
      audience,
      recipientCount: recipients.length,
      sentCount,
      invalidCount: invalid.length,
      sandbox,
      status,
      scheduledFor: scheduledIso,
      messageIds: ids.slice(0, 200),
      failures: failures.slice(0, 20),
      createdBy: uid,
      createdAt: new Date().toISOString(),
    };
    let campaignId: string | null = null;
    try {
      const ref = await db.collection('smsCampaigns').add(record);
      campaignId = ref.id;
    } catch (error) {
      logger.warn('Could not record SMS campaign', { errorType: error instanceof Error ? error.name : 'unknown' });
    }

    if (sentCount === 0) {
      throw new HttpsError('unavailable', `The announcement could not be sent (${failures[0] ?? 'unknown'}).`);
    }

    return { ok: true, id: campaignId, status, recipientCount: recipients.length, sentCount, invalid, scheduled: Boolean(scheduledDate) };
  },
);

/** Admin-only: recent SMS campaign history for the console. */
export const listSmsCampaigns = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public' },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'admin');
    await consumeRateLimit('listSmsCampaigns', uid, 60);

    const db = getFirestore();
    const snap = await db.collection('smsCampaigns').orderBy('createdAt', 'desc').limit(25).get();
    const campaigns = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        message: typeof d.message === 'string' ? d.message : '',
        audience: d.audience === 'all' ? 'all' : 'numbers',
        recipientCount: typeof d.recipientCount === 'number' ? d.recipientCount : 0,
        sentCount: typeof d.sentCount === 'number' ? d.sentCount : 0,
        status: typeof d.status === 'string' ? d.status : 'sent',
        sandbox: d.sandbox === true,
        scheduledFor: typeof d.scheduledFor === 'string' ? d.scheduledFor : null,
        createdAt: typeof d.createdAt === 'string' ? d.createdAt : null,
      };
    });
    return { campaigns };
  },
);

/**
 * Admin-only: save (or overwrite) a named contact group in Firestore so admins
 * can reuse a list of numbers without re-pasting them. Server-owned; the admin
 * app reaches it only through these callables.
 */
export const saveSmsContactGroup = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public' },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'admin');
    await consumeRateLimit('saveSmsContactGroup', uid, 30);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name.trim().slice(0, 80) : '';
    if (!name) throw new HttpsError('invalid-argument', 'A group name is required.');

    const { valid, invalid } = parseRecipients(data.recipients);
    if (valid.length === 0) throw new HttpsError('invalid-argument', 'The group needs at least one valid number.');

    const db = getFirestore();
    const now = new Date().toISOString();
    const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : undefined;
    const payload = { name, numbers: valid, updatedBy: uid, updatedAt: now };

    let groupId: string;
    if (id) {
      await db.collection('smsContactGroups').doc(id).set(payload, { merge: true });
      groupId = id;
    } else {
      const ref = await db.collection('smsContactGroups').add({ ...payload, createdBy: uid, createdAt: now });
      groupId = ref.id;
    }
    return { ok: true, id: groupId, count: valid.length, invalid };
  },
);

/** Admin-only: list saved contact groups. */
export const listSmsContactGroups = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public' },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'admin');
    await consumeRateLimit('listSmsContactGroups', uid, 60);

    const db = getFirestore();
    const snap = await db.collection('smsContactGroups').orderBy('name').limit(100).get();
    const groups = snap.docs.map((doc) => {
      const d = doc.data();
      const numbers = Array.isArray(d.numbers) ? d.numbers.filter((n): n is string => typeof n === 'string') : [];
      return { id: doc.id, name: typeof d.name === 'string' ? d.name : '(unnamed)', numbers, count: numbers.length };
    });
    return { groups };
  },
);

/** Admin-only: delete a saved contact group. */
export const deleteSmsContactGroup = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK, consumeAppCheckToken: ENFORCE_APP_CHECK, invoker: 'public' },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'admin');
    await consumeRateLimit('deleteSmsContactGroup', uid, 30);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const id = typeof data.id === 'string' ? data.id.trim() : '';
    if (!id) throw new HttpsError('invalid-argument', 'A group id is required.');
    await getFirestore().collection('smsContactGroups').doc(id).delete();
    return { ok: true };
  },
);
