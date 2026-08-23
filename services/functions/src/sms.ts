import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

/**
 * SMS delivery via Arkesel (https://arkesel.com), used for *high-priority*
 * notifications to Ghanaian numbers where email is too slow or easily missed.
 *
 * The only secret is the Arkesel API key, stored in Secret Manager as
 * `ARKESEL_API_KEY`; every function that sends SMS or reads the balance must
 * declare it in its `secrets: [ARKESEL_API_KEY]` option. The sender ID and base
 * URL are non-secret and read from the environment with defaults.
 *
 * Like email, SMS is *best effort*: senders never throw and quietly no-op when
 * the key is not configured, so an SMS outage cannot fail a review decision or
 * the emulator test suite. Delivery uses the built-in global `fetch` (Node 22).
 */
export const ARKESEL_API_KEY = defineSecret('ARKESEL_API_KEY');

const BASE_URL = 'https://sms.arkesel.com';

/** Approved Arkesel sender ID (max 11 characters). */
function sender(): string {
  return (process.env.ARKESEL_SENDER || 'Indigen').slice(0, 11);
}

function apiKey(): string {
  try {
    const secret = ARKESEL_API_KEY.value();
    if (secret) return secret;
  } catch {
    // Secret not bound in this context (e.g. a plain Node script or the emulator).
  }
  return process.env.ARKESEL_API_KEY || '';
}

export function isSmsConfigured(): boolean {
  return Boolean(apiKey());
}

/**
 * Normalise a phone number to Arkesel's expected `233XXXXXXXXX` form.
 * Accepts local (`0557535673`), international (`+233557535673`), bare
 * national (`557535673`) and already-normalised inputs. Returns `''` when the
 * value cannot be turned into a plausible Ghanaian MSISDN.
 */
export function normalizeGhanaPhone(raw: string): string {
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `233${digits.slice(1)}`;
  else if (digits.startsWith('233')) { /* already international */ }
  else if (digits.length === 9) digits = `233${digits}`; // bare national part
  // A valid Ghana MSISDN is 233 followed by 9 digits.
  return /^233\d{9}$/.test(digits) ? digits : '';
}

export interface SmsResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Send one SMS. Never throws; returns `{ ok:false }` on any failure. */
export async function sendSms(input: { to: string; message: string }): Promise<SmsResult> {
  const recipient = normalizeGhanaPhone(input.to);
  if (!recipient) return { ok: false, error: 'invalid-recipient' };
  if (!isSmsConfigured()) {
    logger.info('SMS skipped: Arkesel is not configured');
    return { ok: false, error: 'not-configured' };
  }
  try {
    const response = await fetch(`${BASE_URL}/api/v2/sms/send`, {
      method: 'POST',
      headers: { 'api-key': apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: sender(), message: input.message, recipients: [recipient] }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      status?: string;
      data?: Array<{ id?: string }>;
      message?: string;
    };
    if (!response.ok || payload.status !== 'success') {
      logger.error('SMS send failed', { httpStatus: response.status, apiStatus: payload.status });
      return { ok: false, error: payload.message || `http-${response.status}` };
    }
    const id = Array.isArray(payload.data) ? payload.data[0]?.id : undefined;
    logger.info('SMS sent', { id, recipient });
    return { ok: true, id };
  } catch (error) {
    logger.error('SMS send threw', { errorType: error instanceof Error ? error.name : 'unknown' });
    return { ok: false, error: 'network' };
  }
}

/**
 * Format a wall-clock instant into Arkesel's expected `scheduled_date` string,
 * `YYYY-MM-DD hh:mm AM/PM` (e.g. `2026-08-25 07:00 AM`). Arkesel operates on
 * Ghana time (UTC±0), so we read the UTC components directly — the admin picks
 * a Ghana local time and gets exactly that.
 */
export function formatArkeselSchedule(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h24 = date.getUTCHours();
  const meridiem = h24 < 12 ? 'AM' : 'PM';
  const h12 = pad(((h24 + 11) % 12) + 1); // 0→12, 13→01
  const mi = pad(date.getUTCMinutes());
  return `${y}-${mo}-${d} ${h12}:${mi} ${meridiem}`;
}

export interface BulkSmsResult {
  ok: boolean;
  /** Message ids returned by Arkesel (one per recipient, when available). */
  ids: string[];
  error?: string;
}

/**
 * Send one Arkesel request to many recipients, optionally scheduled and/or in
 * sandbox mode. Recipients must already be normalised (`normalizeGhanaPhone`).
 * Never throws — returns `{ ok:false }` on any failure so a broadcast loop can
 * record and continue. Sandbox sends are simulated by Arkesel and not billed.
 */
export async function sendBulkSms(input: {
  recipients: string[];
  message: string;
  scheduledDate?: string;
  sandbox?: boolean;
}): Promise<BulkSmsResult> {
  const recipients = Array.from(new Set(input.recipients.map(normalizeGhanaPhone).filter(Boolean)));
  if (recipients.length === 0) return { ok: false, ids: [], error: 'invalid-recipient' };
  if (!isSmsConfigured()) {
    logger.info('Bulk SMS skipped: Arkesel is not configured');
    return { ok: false, ids: [], error: 'not-configured' };
  }
  try {
    const body: Record<string, unknown> = {
      sender: sender(),
      message: input.message,
      recipients,
    };
    if (input.scheduledDate) body.scheduled_date = input.scheduledDate;
    if (input.sandbox) body.sandbox = true;

    const response = await fetch(`${BASE_URL}/api/v2/sms/send`, {
      method: 'POST',
      headers: { 'api-key': apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      status?: string;
      data?: Array<{ id?: string }>;
      message?: string;
    };
    if (!response.ok || payload.status !== 'success') {
      logger.error('Bulk SMS send failed', { httpStatus: response.status, apiStatus: payload.status });
      return { ok: false, ids: [], error: payload.message || `http-${response.status}` };
    }
    const ids = Array.isArray(payload.data)
      ? payload.data.map((d) => d?.id).filter((id): id is string => typeof id === 'string')
      : [];
    logger.info('Bulk SMS sent', { count: recipients.length, scheduled: Boolean(input.scheduledDate) });
    return { ok: true, ids };
  } catch (error) {
    logger.error('Bulk SMS send threw', { errorType: error instanceof Error ? error.name : 'unknown' });
    return { ok: false, ids: [], error: 'network' };
  }
}

export interface SmsBalance {
  smsBalance: number | null;
  mainBalance: string | null;
}

/** Read the Arkesel account balance. Throws only on a genuine transport error. */
export async function checkBalance(): Promise<SmsBalance> {
  if (!isSmsConfigured()) throw new Error('not-configured');
  const response = await fetch(`${BASE_URL}/api/v2/clients/balance-details`, {
    headers: { 'api-key': apiKey() },
  });
  if (!response.ok) throw new Error(`http-${response.status}`);
  const payload = (await response.json()) as {
    data?: { sms_balance?: number; main_balance?: string };
  };
  return {
    smsBalance: typeof payload.data?.sms_balance === 'number' ? payload.data.sms_balance : null,
    mainBalance: typeof payload.data?.main_balance === 'string' ? payload.data.main_balance : null,
  };
}
