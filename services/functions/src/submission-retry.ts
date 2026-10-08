import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

/** A retry key is namespaced by authenticated account and operation. */
export function submissionRetry(uid: string, operation: string, requestId: unknown, input: unknown) {
  if (requestId === undefined) return null; // Older released clients remain compatible.
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Invalid submission request ID.');
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  return { id: 'retry-' + digest(JSON.stringify([uid, operation, requestId])), hash: digest(JSON.stringify(input)) };
}
export function checkSubmissionRetry(existing: Record<string, unknown> | undefined, uid: string, hash: string): boolean {
  if (!existing) return false;
  if (existing.authUid !== uid || existing.submissionRequestHash !== hash) throw new HttpsError('already-exists', 'This request already submitted different content. Open My contributions before trying again.');
  return true;
}
