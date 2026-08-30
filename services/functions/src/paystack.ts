import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

/**
 * Paystack, the payment provider for advertising campaigns.
 *
 * Two keys, and only one of them is a secret:
 *
 *   * `PAYSTACK_SECRET_KEY` lives in Secret Manager. It authorises charges and
 *     signs webhooks, so it never leaves this process — no callable returns it,
 *     no client is ever told it, and it is not in `.env`.
 *   * `PAYSTACK_PUBLIC_KEY` is public by design (it is what a checkout page
 *     embeds). It is read from the environment and may be handed to the app.
 *
 * Nothing here trusts an amount from a phone. Every charge is initialised from
 * the total this backend computed and stored on the campaign, and every
 * confirmation re-reads the amount Paystack says it actually collected before
 * anything is marked paid.
 */
export const PAYSTACK_SECRET_KEY = defineSecret('PAYSTACK_SECRET_KEY');

const BASE_URL = 'https://api.paystack.co';

/** Paystack's own timeout is generous; ours is not. */
const REQUEST_TIMEOUT_MS = 20_000;

export function paystackSecretKey(): string {
  try {
    const secret = PAYSTACK_SECRET_KEY.value();
    if (secret) return secret;
  } catch {
    // Not bound in this context (a plain Node script, or the emulator).
  }
  return process.env.PAYSTACK_SECRET_KEY || '';
}

/** Safe to publish: this is the key a checkout page carries in its markup. */
export function paystackPublicKey(): string {
  return process.env.PAYSTACK_PUBLIC_KEY || '';
}

export function isPaystackConfigured(): boolean {
  return Boolean(paystackSecretKey());
}

/** True while the configured key is a test key, which the app says out loud. */
export function isPaystackTestMode(): boolean {
  return paystackSecretKey().startsWith('sk_test_');
}

/** Where Paystack sends somebody once they are done paying. */
export function paystackCallbackUrl(): string {
  return (
    process.env.PAYSTACK_CALLBACK_URL ||
    'https://indigenworld.com/ads/payment-complete'
  );
}

export interface PaystackInitialisation {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerification {
  status: string;
  reference: string;
  amountPesewas: number;
  currency: string;
  paidAt: string | null;
  channel: string | null;
  /** Whatever we attached at initialisation, echoed back. */
  metadata: Record<string, unknown>;
}

export class PaystackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaystackError';
  }
}

async function call<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const key = paystackSecretKey();
  if (!key) throw new PaystackError('Payments are not configured.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (error) {
    logger.error('Paystack request failed', { path, error: String(error) });
    throw new PaystackError('Could not reach the payment provider.');
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as
    | { status?: boolean; message?: string; data?: T }
    | null;

  if (!response.ok || !payload?.status) {
    const message = payload?.message?.trim();
    logger.error('Paystack rejected a request', {
      path,
      httpStatus: response.status,
      message,
    });
    // Paystack's own message names the actual problem ("Invalid amount",
    // "Customer email required"), which is far more use than a generic line.
    throw new PaystackError(message || 'The payment provider refused that.');
  }
  return payload.data as T;
}

/**
 * Opens a transaction and returns the page to send the payer to.
 *
 * `amountPesewas` is in the smallest unit, which is what Paystack's `amount`
 * field expects for GHS — the same integer pesewas this backend keeps
 * everywhere else, so there is no place for a rounding error to enter.
 */
export async function initializeTransaction(input: {
  email: string;
  amountPesewas: number;
  reference: string;
  metadata: Record<string, unknown>;
}): Promise<PaystackInitialisation> {
  const data = await call<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>('/transaction/initialize', {
    method: 'POST',
    body: {
      email: input.email,
      amount: input.amountPesewas,
      currency: 'GHS',
      reference: input.reference,
      callback_url: paystackCallbackUrl(),
      metadata: input.metadata,
      // Mobile money is how most of Ghana pays, so it leads.
      channels: ['mobile_money', 'card', 'bank', 'ussd'],
    },
  });

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  };
}

/** Asks Paystack what actually happened to a reference. */
export async function verifyTransaction(
  reference: string,
): Promise<PaystackVerification> {
  const data = await call<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    channel: string | null;
    metadata: unknown;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });

  return {
    status: String(data.status ?? ''),
    reference: String(data.reference ?? reference),
    amountPesewas: Number(data.amount ?? 0),
    currency: String(data.currency ?? ''),
    paidAt: data.paid_at ?? null,
    channel: data.channel ?? null,
    metadata:
      data.metadata && typeof data.metadata === 'object'
        ? (data.metadata as Record<string, unknown>)
        : {},
  };
}

/**
 * Whether a webhook body really came from Paystack.
 *
 * Paystack signs the *raw* body with the secret key, so the comparison has to
 * be against the bytes as they arrived — a re-serialised `req.body` differs by
 * key order and whitespace and would never match. The comparison itself is
 * constant-time: a signature check that leaks how many leading bytes were
 * right is a signature check somebody can walk.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
): boolean {
  const key = paystackSecretKey();
  if (!key || !signature) return false;
  const expected = createHmac('sha512', key).update(rawBody).digest('hex');
  const given = Buffer.from(signature, 'utf8');
  const mine = Buffer.from(expected, 'utf8');
  if (given.length !== mine.length) return false;
  return timingSafeEqual(given, mine);
}

/**
 * The reference for one campaign's payment attempt.
 *
 * Prefixed and unique per attempt: Paystack refuses a reference it has seen
 * before, so an abandoned checkout would otherwise lock a campaign out of ever
 * being paid for.
 */
export function adPaymentReference(campaignId: string, attempt: number): string {
  return `ad_${campaignId}_${attempt}`;
}
