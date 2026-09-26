import { randomBytes } from 'node:crypto';
import { getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { requireAuth, roleSatisfies } from './auth.js';

/**
 * Pieces every contributor-workspace callable shares.
 *
 * ── Why a wrapper around every handler ─────────────────────────────────────
 * A callable that throws anything other than an `HttpsError` reaches the
 * browser as `{ code: 'internal', message: 'internal' }`. That is exactly what
 * the payment profile showed contributors in September 2026, and it told them
 * nothing and told us nothing either. [guarded] turns an unexpected failure
 * into a sentence a contributor can act on plus a short reference, and writes
 * the detail, keyed by that reference, to Cloud Logging where only the team
 * can read it. Deliberate `HttpsError`s pass through untouched: they are
 * already written for the person reading them.
 *
 * The log line carries the error's type, its code and a trimmed message with
 * long digit runs and email addresses masked. Never the request: a bank
 * detail, a MoMo code or a draft translation must not reach a log because a
 * transaction happened to fail while holding it.
 */

export const CONTRIBUTOR_REGION = 'us-central1';

export const CONTRIBUTOR_CALL_OPTIONS = {
  region: CONTRIBUTOR_REGION,
  invoker: 'public' as const,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true',
};

/** A reference a contributor can quote, and the team can search the logs for. */
export function diagnosticReference(): string {
  return `IW-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Masks what could identify a person or an account before a message is logged. */
export function sanitiseForLog(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\d[\d\s-]{3,}\d/g, '[digits]')
    .slice(0, 300);
}

export function unexpectedError(operation: string, error: unknown): HttpsError {
  const reference = diagnosticReference();
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  logger.error('Contributor operation failed', {
    operation,
    reference,
    errorType: error instanceof Error ? error.name : typeof error,
    code: typeof record.code === 'string' || typeof record.code === 'number' ? record.code : null,
    detail: sanitiseForLog(record.message),
  });
  return new HttpsError(
    'internal',
    `This could not be completed because of a problem on our side. Please try again. If it keeps happening, quote reference ${reference} when you contact the team.`,
    { reference },
  );
}

/**
 * Wraps a callable handler so an unexpected failure is explained, not leaked.
 * `Data` defaults to `any`, the same default `onCall` gives an unannotated
 * handler, so wrapping an existing callable changes nothing about its types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function guarded<Data = any, Result = unknown>(
  operation: string,
  handler: (req: CallableRequest<Data>) => Promise<Result>,
): (req: CallableRequest<Data>) => Promise<Result> {
  return async (req: CallableRequest<Data>) => {
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw unexpectedError(operation, error);
    }
  };
}

/**
 * The contributor's own invitation record, required to be active.
 *
 * [activated] additionally refuses an account still on its temporary
 * phone-number password: nobody should attach payout details, or change what
 * the community sees of them, to an account whose password is written on an
 * SMS.
 */
export async function requireActiveContributor(
  uid: string,
  options: { activated?: boolean } = {},
): Promise<DocumentSnapshot> {
  const account = await getFirestore().doc(`contributorAccounts/${uid}`).get();
  if (account.get('status') !== 'active') {
    throw new HttpsError('permission-denied', 'An active contributor account is required.');
  }
  if (options.activated && account.get('requiresPasswordChange') === true) {
    throw new HttpsError('failed-precondition', 'Activate your account and choose your own password first.');
  }
  return account;
}

/**
 * Finance access: separation of duties for payout detail.
 *
 * Mirrors `isFinance()` in firestore.rules and `docs/creator-system.md`: an
 * ordinary admin does not see bank statements or full account numbers. A
 * finance claim on an admin, or a super administrator, does. Checked on the
 * server for every payment-detail read and every verification decision.
 */
export function hasFinanceAccess(token: Record<string, unknown> | undefined): boolean {
  if (!token) return false;
  if (token.superAdmin === true || token.role === 'super_admin') return true;
  return token.finance === true && roleSatisfies(token.role, 'admin');
}

export function requireFinance(req: CallableRequest<unknown>): string {
  const uid = requireAuth(req);
  if (!hasFinanceAccess(req.auth?.token as Record<string, unknown> | undefined)) {
    throw new HttpsError(
      'permission-denied',
      'Finance access is required to review contributor payment details. A super administrator can grant the finance claim.',
    );
  }
  return uid;
}

/** `•••• 1234`: enough for a person to recognise their own account, no more. */
export function maskTail(value: unknown, visible = 4): string {
  const clean = typeof value === 'string' ? value.replace(/\s+/g, '') : '';
  if (!clean) return '';
  return `•••• ${clean.slice(-visible)}`;
}

/** The audit row shape the rest of the contributor backend already writes. */
export function auditEntry(input: {
  actor: string;
  action: string;
  target: string;
  targetCollection?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  at?: string;
}): Record<string, unknown> {
  return {
    actor: { collection: 'contributors', id: input.actor },
    action: input.action,
    target: { collection: input.targetCollection ?? 'contributors', id: input.target },
    outcome: 'success',
    source: 'functions',
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? {},
    occurredAt: input.at ?? new Date().toISOString(),
  };
}

/**
 * Bounded, trimmed text, or a field-specific invalid-argument error.
 *
 * Single-line fields fold every run of whitespace to one space; [multiline]
 * keeps line breaks (at most one blank line in a row) for notes and reasons.
 */
export function boundedText(
  value: unknown,
  max: number,
  field: string,
  { optional = false, min = 1, multiline = false } = {},
): string {
  if (value == null || value === '') {
    if (optional) return '';
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${field} must be text.`);
  const trimmed = multiline
    ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
      .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    : value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!trimmed && !optional) throw new HttpsError('invalid-argument', `${field} is required.`);
  if (trimmed && trimmed.length < min) {
    throw new HttpsError('invalid-argument', `${field} must be at least ${min} characters.`);
  }
  if (trimmed.length > max) {
    throw new HttpsError('invalid-argument', `${field} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

/** `YYYY-MM-DD` in UTC, which is local time in Ghana and Burkina Faso. */
export function dayKey(at: string | number | Date = new Date()): string {
  const date = at instanceof Date ? at : new Date(at);
  return (Number.isNaN(date.getTime()) ? new Date() : date).toISOString().slice(0, 10);
}
