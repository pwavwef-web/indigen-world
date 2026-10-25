import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { draftKey } from '../../drafts/store';
import { friendlyError } from '../model';
import type { Answers, AttachmentRef, Issue } from '@indigen-world/contracts/forms';
import type { FormsContributorRequest, FormsContributorResponses } from '@indigen-world/contracts/forms-api';
import type { FormUploadAdapter } from '@indigen-world/console-ui';

/*
 * The contributor portal's only way into Indigen Forms: the `formsContributor`
 * callable (request and response shapes in @indigen-world/contracts/forms-api),
 * resumable uploads to the session it issues, and the request ids that make a
 * retried save or submit safe. In the development preview
 * (/contributor/preview/forms) the same calls go to an in-memory fixture.
 *
 * This module is loaded by the workspace shell for the navigation badge, so
 * it imports types only from the forms contract and the renderer.
 */

export type FormsAction = FormsContributorRequest['action'];
export type FormsRequest<A extends FormsAction> = Extract<FormsContributorRequest, { action: A }>;

export async function formsCall<A extends FormsAction>(preview: boolean, request: FormsRequest<A> & { action: A }): Promise<FormsContributorResponses[A]> {
  if (preview && import.meta.env.DEV) {
    const { previewForms } = await import('./forms-preview');
    return previewForms(request) as Promise<FormsContributorResponses[A]>;
  }
  const call = httpsCallable<FormsRequest<A>, FormsContributorResponses[A]>(functions, 'formsContributor');
  return (await call(request)).data;
}

/* -- Errors ------------------------------------------------------------------------------ */

export interface FormsFailure {
  /** The callable's code without the `functions/` prefix: 'failed-precondition', 'aborted', 'permission-denied'… */
  code: string;
  /** The server's `details.reason`: 'invalid', 'conflict', 'paused', 'once', 'not-editable', 'audience'… */
  reason: string | null;
  message: string;
  /** Field problems the server found (`details.issues`). */
  issues: Issue[];
  /** The request may or may not have reached the server (offline, time-out): resend the same request. */
  uncertain: boolean;
  /** The response the server named (`details.responseId`), for example the one already sent for a once-only form. */
  responseId?: string | null;
}

const UNCERTAIN = new Set(['internal', 'unavailable', 'deadline-exceeded', 'unknown', 'cancelled']);

export function formsFailure(error: unknown, what = 'Indigen Forms'): FormsFailure {
  const record = (error && typeof error === 'object' ? error : {}) as { code?: unknown; details?: unknown };
  const code = typeof record.code === 'string' ? record.code.replace(/^functions\//, '') : '';
  const details = record.details && typeof record.details === 'object' ? record.details as Record<string, unknown> : {};
  const issues = Array.isArray(details.issues)
    ? (details.issues as unknown[]).filter((issue): issue is Issue => Boolean(issue) && typeof (issue as Issue).path === 'string' && typeof (issue as Issue).message === 'string')
    : [];
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return {
    code,
    reason: typeof details.reason === 'string' ? details.reason : null,
    message: offline ? 'You appear to be offline. Your answers are still on this page; try again when you are connected.' : friendlyError(error, what).message,
    issues,
    uncertain: offline || !code || UNCERTAIN.has(code),
    responseId: typeof details.responseId === 'string' ? details.responseId : null,
  };
}

/** A failure that is already a FormsFailure stays as it is; anything else is read as one. */
export function asFormsFailure(error: unknown, what: string): FormsFailure {
  if (error && typeof error === 'object' && 'uncertain' in error && 'issues' in error && 'message' in error) return error as FormsFailure;
  return formsFailure(error, what);
}

/* -- The forms list, shared by the navigation badge and the list page ---------------------- */

type FormsList = FormsContributorResponses['list'];
let listCache: { preview: boolean; at: number; promise: Promise<FormsList> } | null = null;

/** The available forms; a copy younger than 30 seconds is reused unless `fresh`. */
export function loadFormsList(preview: boolean, fresh = false): Promise<FormsList> {
  const now = Date.now();
  if (!fresh && listCache && listCache.preview === preview && now - listCache.at < 30_000) return listCache.promise;
  const promise = formsCall(preview, { action: 'list' });
  listCache = { preview, at: now, promise };
  promise.catch(() => { if (listCache?.promise === promise) listCache = null; });
  return promise;
}

export const FORMS_CHANGED = 'forms:changed';

/** Tell the badge, the list and Home that a response was saved, submitted or discarded. */
export function announceFormsChanged(): void {
  listCache = null;
  window.dispatchEvent(new Event(FORMS_CHANGED));
  window.dispatchEvent(new Event('portal:changed'));
}

/** Responses waiting on the contributor (changes requested), for the navigation badge. Failures show no badge. */
export function useFormsAttention(preview: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => {
      loadFormsList(preview).then((list) => { if (active) setCount(list.attention); }).catch(() => undefined);
    };
    // After the workspace's own first reads; the badge is not urgent.
    const timer = window.setTimeout(load, 1200);
    window.addEventListener(FORMS_CHANGED, load);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener(FORMS_CHANGED, load);
    };
  }, [preview]);
  return count;
}

/* -- Submit requests that survive a reload --------------------------------------------------- */

export interface PendingSubmit {
  signature: string;
  requestId: string;
  responseId: string;
  answers: Answers;
  expectedDraftRevision: number;
  startedAt: string;
}

function pendingArea(formId: string) {
  return `form-submit-${formId}`;
}

/** A submit that was sent but never confirmed, kept per form so a retry (even after a reload) replays the same request. */
export function readPendingSubmit(uid: string, formId: string): PendingSubmit | null {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey(uid, pendingArea(formId))) || 'null') as PendingSubmit | null;
    return value && typeof value.requestId === 'string' && typeof value.responseId === 'string' && typeof value.signature === 'string'
      && value.answers && typeof value.answers === 'object' && Number.isInteger(value.expectedDraftRevision) ? value : null;
  } catch {
    return null;
  }
}

export function writePendingSubmit(uid: string, formId: string, value: PendingSubmit | null): void {
  try {
    if (value) localStorage.setItem(draftKey(uid, pendingArea(formId)), JSON.stringify(value));
    else localStorage.removeItem(draftKey(uid, pendingArea(formId)));
  } catch {
    // Storage full or blocked: the in-memory request id still covers retries on this page.
  }
}

/* -- Uploads ------------------------------------------------------------------------------- */

/** Google Cloud Storage takes resumable chunks in multiples of 256 KiB. */
const CHUNK_BYTES = 1024 * 1024;

function abortError(): Error {
  return Object.assign(new Error('The upload was cancelled.'), { name: 'AbortError' });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
    const stop = () => { window.clearTimeout(timer); reject(abortError()); };
    signal.addEventListener('abort', stop, { once: true });
  });
}

interface PutResult { status: number; range: string | null }

function put(url: string, body: Blob | null, range: string, contentType: string, signal: AbortSignal, progress?: (loaded: number) => void): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const stop = () => xhr.abort();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Range', range);
    if (body) xhr.setRequestHeader('Content-Type', contentType);
    if (progress) xhr.upload.onprogress = (event) => progress(event.loaded);
    xhr.onload = () => { signal.removeEventListener('abort', stop); resolve({ status: xhr.status, range: xhr.getResponseHeader('Range') }); };
    xhr.onerror = () => { signal.removeEventListener('abort', stop); resolve({ status: 0, range: null }); };
    xhr.onabort = () => { signal.removeEventListener('abort', stop); reject(abortError()); };
    signal.addEventListener('abort', stop, { once: true });
    xhr.send(body);
  });
}

/** The next byte to send after a 308, from `Range: bytes=0-1048575`. */
function nextOffset(range: string | null, fallback: number): number {
  const last = range ? Number(range.split('-').at(-1)) : NaN;
  return Number.isFinite(last) ? last + 1 : fallback;
}

const EXPIRED = 'The upload session expired. Retry this file.';

/**
 * PUT the file in 1 MB chunks with Content-Range, carry on from what the
 * session already holds after a 308 or a dropped connection, and back off
 * between retries. Aborting the signal stops at once.
 */
async function sendResumable(url: string, file: File, contentType: string, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<void> {
  const size = file.size;
  let offset = 0;
  let failures = 0;
  while (offset < size) {
    throwIfAborted(signal);
    const start = offset;
    const end = Math.min(start + CHUNK_BYTES, size);
    const result = await put(url, file.slice(start, end), `bytes ${start}-${end - 1}/${size}`, contentType, signal, (loaded) => onProgress(Math.min(0.98, (start + loaded) / size)));
    if (result.status === 200 || result.status === 201) return;
    if (result.status === 308) {
      offset = nextOffset(result.range, end);
      failures = 0;
      continue;
    }
    if (result.status === 404 || result.status === 410) throw new Error(EXPIRED);
    const retryable = result.status === 0 || result.status === 408 || result.status === 429 || result.status >= 500;
    if (!retryable) throw new Error(`The file store refused this upload (${result.status}). Retry it, or choose another file.`);
    failures += 1;
    if (failures > 5) throw new Error('The connection kept dropping, so this file was not uploaded. Retry it when the connection is steadier.');
    await sleep(Math.min(8000, 500 * 2 ** (failures - 1)), signal);
    // Ask the session how much it already has before sending more.
    const state = await put(url, null, `bytes */${size}`, contentType, signal);
    if (state.status === 200 || state.status === 201) return;
    if (state.status === 404 || state.status === 410) throw new Error(EXPIRED);
    if (state.status === 308) offset = nextOffset(state.range, 0);
  }
  throw new Error('The file store did not confirm this upload. Retry this file.');
}

/** The preview has no file store: progress is simulated and nothing leaves the device. */
async function simulateUpload(onProgress: (fraction: number) => void, signal: AbortSignal): Promise<void> {
  for (const step of [0.2, 0.45, 0.7, 0.9]) {
    await sleep(160, signal);
    onProgress(step);
  }
}

export async function uploadFormFile(input: { preview: boolean; responseId: string; fieldId: string; file: File; onProgress(fraction: number): void; signal: AbortSignal }): Promise<AttachmentRef> {
  const { preview, responseId, fieldId, file, onProgress, signal } = input;
  throwIfAborted(signal);
  const contentType = (file.type || '').split(';')[0].trim().toLowerCase();
  let uploadId = '';
  try {
    const session = await formsCall(preview, { action: 'beginUpload', responseId, fieldId, name: file.name, contentType, size: file.size });
    uploadId = session.uploadId;
    throwIfAborted(signal);
    if (preview) await simulateUpload(onProgress, signal);
    else await sendResumable(session.uploadUrl, file, contentType, onProgress, signal);
    throwIfAborted(signal);
    // The server reads the stored bytes and identifies the format before accepting the file.
    const { attachment } = await formsCall(preview, { action: 'confirmUpload', uploadId });
    onProgress(1);
    return attachment;
  } catch (error) {
    const release = () => { if (uploadId) void formsCall(preview, { action: 'removeUpload', uploadId }).catch(() => undefined); };
    if (signal.aborted) {
      release();
      throw abortError();
    }
    const local = error instanceof Error && !('code' in error);
    const failure = local ? null : formsFailure(error, 'The upload');
    // A file the server refused is already deleted. Any other failure (a dropped connection, an
    // expired session, a lost reply) leaves a registration holding one of the question's upload
    // slots, so it is let go in the background and Retry starts cleanly.
    if (failure?.reason !== 'rejected-file') release();
    if (!failure) throw error;
    throw new Error(failure.message);
  }
}

/** Open a short-lived link to one of the contributor's own attachments in a new tab. */
export async function openFormAttachment(preview: boolean, responseId: string, attachmentId: string): Promise<void> {
  // Opened before the link arrives: a tab opened after waiting is a pop-up most browsers block.
  const tab = preview ? null : window.open('', '_blank');
  try {
    const { url } = await formsCall(preview, { action: 'attachmentLink', responseId, attachmentId });
    if (!/^https:\/\//.test(url)) throw new Error('The file link was not valid. Try again.');
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
    throw new Error(formsFailure(error, 'The file').message);
  }
}

/**
 * The renderer's upload adapter for one response. A form that has not been
 * saved yet has no response to attach files to, so the first upload saves a
 * draft first (`ensureResponse`).
 */
export function formsUploadAdapter(options: { preview: boolean; ensureResponse(): Promise<string>; currentResponse(): string | null }): FormUploadAdapter {
  return {
    async upload({ fieldId, file, onProgress, signal }) {
      let responseId: string;
      try {
        responseId = await options.ensureResponse();
      } catch (error) {
        // Say why the save before the upload failed (too large, a newer version…), not just "the upload failed".
        throw new Error(`Your answers could not be saved, so the file was not sent. ${asFormsFailure(error, 'Saving your answers').message}`);
      }
      return uploadFormFile({ preview: options.preview, responseId, fieldId, file, onProgress, signal });
    },
    async remove(attachment) {
      // The server keeps files that a submitted revision or the saved draft still lists, and
      // lets them go once nothing saved uses them; anything else is deleted now.
      await formsCall(options.preview, { action: 'removeUpload', uploadId: attachment.id });
    },
    async open(attachment) {
      const responseId = options.currentResponse();
      if (!responseId) throw new Error('Save the form before opening its files.');
      await openFormAttachment(options.preview, responseId, attachment.id);
    },
  };
}
