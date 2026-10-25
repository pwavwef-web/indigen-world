import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import { friendlyError } from '../../model';
import type { FormsReviewRequest, FormsReviewResponses } from '@indigen-world/contracts/forms-api';

/*
 * The review desk's only way into Indigen Forms: the `formsReview` callable
 * (an onStaffCall, so the desk sits behind ReviewVerification), with request
 * and response shapes from @indigen-world/contracts/forms-api. In a
 * development build the desk's preview (/contributor/preview/forms-review)
 * sends the same requests to the in-memory fixture in review-preview.ts; a
 * production build never includes it.
 */

export type ReviewAction = FormsReviewRequest['action'];
export type ReviewRequest<A extends ReviewAction> = Extract<FormsReviewRequest, { action: A }>;

export async function formsReview<A extends ReviewAction>(preview: boolean, request: ReviewRequest<A>): Promise<FormsReviewResponses[A]> {
  if (preview && import.meta.env.DEV) {
    const { previewReview } = await import('./review-preview');
    return previewReview(request) as Promise<FormsReviewResponses[A]>;
  }
  const call = httpsCallable<ReviewRequest<A>, FormsReviewResponses[A]>(functions, 'formsReview', { timeout: 120_000 });
  return (await call(request)).data;
}

/* -- Errors ----------------------------------------------------------------------------------- */

export type ReviewFailureKind =
  | 'stale' | 'group' | 'own' | 'denied' | 'checks' | 'decision' | 'feedback' | 'missing' | 'conflict' | 'uncertain' | 'other';

export interface ReviewFailure {
  /** The callable's code without the `functions/` prefix. */
  code: string;
  /** The server's `details.reason`: 'stale', 'group', 'checks', 'decision', 'feedback'… */
  reason: string | null;
  kind: ReviewFailureKind;
  message: string;
  /** The request may or may not have been applied: send the same request again. */
  uncertain: boolean;
}

const UNCERTAIN = new Set(['internal', 'unavailable', 'deadline-exceeded', 'unknown', 'cancelled']);

export function reviewFailure(error: unknown, what = 'This response'): ReviewFailure {
  const record = (error && typeof error === 'object' ? error : {}) as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === 'string' ? record.code.replace(/^functions\//, '') : '';
  const details = record.details && typeof record.details === 'object' ? record.details as Record<string, unknown> : {};
  const reason = typeof details.reason === 'string' ? details.reason : null;
  const raw = typeof record.message === 'string' ? record.message : '';
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const base = { code, reason };
  if (offline || !code || UNCERTAIN.has(code)) {
    return {
      ...base, kind: 'uncertain', uncertain: true,
      message: offline
        ? 'You appear to be offline. Nothing is lost: your notes are still here. Try again when you are connected.'
        : 'The reply did not arrive, so it is not certain whether this went through. Try again: the same request is sent, so a decision cannot be recorded twice.',
    };
  }
  if (code === 'aborted' && (reason === 'stale' || reason === null)) {
    return { ...base, kind: 'stale', uncertain: false, message: 'This response changed after you opened it: another reviewer may have acted on it, or its contributor sent a new revision. Your notes are kept. Load the latest version, check it, then decide again.' };
  }
  if (code === 'permission-denied') {
    if (reason === 'group') {
      return { ...base, kind: 'group', uncertain: false, message: 'This form is reviewed by another reviewer group, and your account is not in it. Its responses cannot be opened or decided from your account.' };
    }
    if (/own response/i.test(raw)) {
      return { ...base, kind: 'own', uncertain: false, message: 'This is your own response. Nobody reviews their own work: another reviewer will decide on it.' };
    }
    return { ...base, kind: 'denied', uncertain: false, message: `${raw || 'Your account cannot review this response.'} If you were given review access recently, sign out and in again.` };
  }
  if (code === 'failed-precondition' && reason === 'checks') return { ...base, kind: 'checks', uncertain: false, message: raw || 'Confirm every reviewer check before approving.' };
  if (code === 'failed-precondition' && reason === 'decision') {
    return { ...base, kind: 'decision', uncertain: false, message: `${raw || 'This decision is not possible in the response’s current status.'} Load the latest version.` };
  }
  if (code === 'invalid-argument' && reason === 'feedback') return { ...base, kind: 'feedback', uncertain: false, message: raw || 'Feedback of at least five characters is needed for this decision.' };
  if (code === 'not-found') return { ...base, kind: 'missing', uncertain: false, message: 'This response does not exist, or it is still a draft that its contributor has not sent.' };
  if (code === 'already-exists') {
    return { ...base, kind: 'conflict', uncertain: false, message: 'A different decision was already sent with this request. Load the latest version to see what was recorded.' };
  }
  return { ...base, kind: 'other', uncertain: false, message: friendlyError(error, what).message };
}

/* -- Attachments ------------------------------------------------------------------------------- */

/**
 * Open a five-minute private link to an attachment in a new tab. The tab is
 * opened before the link arrives, because a tab opened after waiting is a
 * pop-up most browsers block. The server records that the link was issued.
 */
export async function openReviewAttachment(preview: boolean, responseId: string, attachmentId: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { url } = await formsReview(preview, { action: 'attachmentLink', responseId, attachmentId });
    const allowed = /^https:\/\//.test(url) || (preview && import.meta.env.DEV && url.startsWith('blob:'));
    if (!allowed) throw new Error('The file link was not valid. Try again.');
    if (tab) {
      tab.opener = null;
      tab.location.replace(url);
    } else {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
    }
  } catch (error) {
    tab?.close();
    if (error instanceof Error && !('code' in error)) throw error;
    throw new Error(reviewFailure(error, 'The file').message);
  }
}
