import { httpsCallable } from 'firebase/functions';
import type {
  FormsAdminRequest,
  FormsAdminResponses,
  FormsReviewRequest,
  FormsReviewResponses,
} from '@indigen-world/contracts/forms-api';
import { functions } from '../firebase';

/* ==========================================================================
   Indigen Forms: the admin console's only way to the backend. Every read and
   write goes through two staff callables (`onStaffCall`, verified two-step
   session) whose request and response shapes are fixed by
   packages/contracts/forms-api.d.ts. The Firestore collections behind them
   are closed to clients, so nothing here reads Firestore directly.
   ========================================================================== */

const adminCallable = httpsCallable<FormsAdminRequest, unknown>(functions, 'formsAdmin', { timeout: 120_000 });
const reviewCallable = httpsCallable<FormsReviewRequest, unknown>(functions, 'formsReview', { timeout: 120_000 });

export type FormsAdminAction = FormsAdminRequest['action'];
export type FormsReviewAction = FormsReviewRequest['action'];

/** One typed call: the action picks both the request fields and the result. */
export async function formsAdmin<A extends FormsAdminAction>(request: Extract<FormsAdminRequest, { action: A }>): Promise<FormsAdminResponses[A]> {
  return (await adminCallable(request)).data as FormsAdminResponses[A];
}

/** Reviewer decisions and attachment links; admins review every reviewer group. */
export async function formsReview<A extends FormsReviewAction>(request: Extract<FormsReviewRequest, { action: A }>): Promise<FormsReviewResponses[A]> {
  return (await reviewCallable(request)).data as FormsReviewResponses[A];
}

/* -- Errors -------------------------------------------------------------------------- */

export interface CallError {
  /** The callable code without the `functions/` prefix: `aborted`, `permission-denied`, … */
  code: string;
  message: string;
  details: Record<string, unknown> | null;
}

export function callError(error: unknown): CallError {
  const raw = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof raw.code === 'string' ? raw.code.replace(/^functions\//, '') : '';
  const message = typeof raw.message === 'string' ? raw.message.replace(/^Firebase(Error)?:\s*/i, '') : '';
  const details = raw.details && typeof raw.details === 'object' && !Array.isArray(raw.details) ? raw.details as Record<string, unknown> : null;
  return { code, message, details };
}

/** `details.reason` of an HttpsError, when the server set one. */
export function errorReason(error: unknown): string | null {
  const reason = callError(error).details?.reason;
  return typeof reason === 'string' ? reason : null;
}

/**
 * A sentence an administrator can act on. An expired two-step session is
 * named as such: it is a `failed-precondition` like a stale decision, but the
 * fix is to verify again, not to reload.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const { code, message } = callError(error);
  if (errorReason(error) === 'staff-mfa-required') return 'Your two-step verification has expired. Verify again from the account menu, then retry. Nothing was changed.';
  if (code === 'permission-denied') return message || 'Your account is not allowed to do this.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'The server could not be reached. Check your connection and try again.';
  if (code === 'internal' && (!message || message === 'internal')) return fallback;
  return message || fallback;
}

export function isDenied(error: unknown): boolean {
  return callError(error).code === 'permission-denied';
}

/** Another administrator saved this draft since it was loaded (`aborted` + reason `conflict`). */
export function isConflict(error: unknown): boolean {
  return callError(error).code === 'aborted' && errorReason(error) === 'conflict';
}

/**
 * The response changed since the reviewer opened it. Checked by reason first,
 * so an expired two-step session (`failed-precondition`,
 * `staff-mfa-required`) is never mistaken for a stale decision.
 */
export function isStale(error: unknown): boolean {
  const reason = errorReason(error);
  if (reason === 'staff-mfa-required') return false;
  if (reason === 'stale' || reason === 'conflict') return true;
  return callError(error).code === 'aborted' && reason === null;
}

/** Issues the server attached to a refusal (`details.issues`), e.g. a publish that failed validation. */
export function errorIssues(error: unknown): Array<{ path: string; message: string }> {
  const issues = callError(error).details?.issues;
  return Array.isArray(issues)
    ? issues.filter((item): item is { path: string; message: string } => Boolean(item) && typeof (item as { message?: unknown }).message === 'string')
      .map((item) => ({ path: String(item.path ?? ''), message: item.message }))
    : [];
}

/** Accounts the server could not find (`details.unknown`), e.g. a cohort or access list entry. */
export function errorUnknown(error: unknown): string[] {
  const unknown = callError(error).details?.unknown;
  return Array.isArray(unknown) ? unknown.filter((item): item is string => typeof item === 'string') : [];
}

/** An idempotency key for a decision, reused if the same decision is retried. */
export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
