import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { PORTAL_LIMITS, portalFileType, type PortalType, type PortalUse } from '@indigen-world/contracts/portal-contributions';
export type { PortalType, PortalUse };
export interface PortalFile { path: string; name: string; mime: string; title?: string; description?: string; source?: string; language?: string }
export interface PortalInput {
  type: PortalType; title: string; language: string; provenance: string; content: Record<string, any>; files: PortalFile[];
  uses: Record<PortalUse, boolean>; rights: { ownership: string; speakers: boolean; sensitive: boolean; confidential: boolean; cultural: boolean };
}
export interface PortalRecord extends PortalInput {
  id: string; owner: string; version: number; status: string; updatedAt: string; createdAt: string; submittedAt?: string;
  feedback?: string; reviewer?: string; reviewedAt?: string; assignment?: string;
  parent?: { id: string; version: number; locator: string; method: string };
  processing: { state: string; attempts: number; scan?: string; files: (PortalFile & { state: string; text?: string; error?: string; checksum?: string; duplicateIds?: string[] })[] };
}
export interface PortalDetail { record: PortalRecord; history: { action: string; at: string; version: number; note?: string; decision?: string }[] }
export interface PortalSummary { counts: Record<string, number>; failed: number; unread: number }
export const blankContribution = (type: PortalType): PortalInput => ({ type, title: '', language: 'Kasem (xsm)', provenance: 'original', content: { sourceLanguage: 'English', source: '', text: '' }, files: [], uses: { review: false, retrieval: false, training: false, public: false }, rights: { ownership: '', speakers: false, sensitive: false, confidential: false, cultural: false } });
export async function portalCall<T = any>(preview: boolean, action: string, data: Record<string, unknown> = {}, review = false): Promise<T> {
  if (preview && import.meta.env.DEV) return (await import('./portal-preview')).previewPortal(action, data, review) as Promise<T>;
  return (await httpsCallable<unknown, T>(functions, review ? 'portalContributionReview' : 'portalContribution')({ action, ...data })).data;
}
export interface PortalTransferTask { snapshot: { state: string }; pause(): void; resume(): void; cancel(): void }
export async function uploadPortalFile(_uid: string, batch: string, file: File, progress: (value: number) => void): Promise<{ task: PortalTransferTask; done: Promise<PortalFile> }> {
  const type = portalFileType(file.name);
  if (!type || file.size <= 0 || file.size > PORTAL_LIMITS.maxFileBytes) throw new Error('Choose an accepted format between 1 byte and 20 MB. Archives, macros and executable files are not accepted.');
  const session = await portalCall<{ url: string; file: PortalFile }>(false, 'beginUpload', { batch, requestId: crypto.randomUUID(), name: file.name, size: file.size });
  let active: XMLHttpRequest | null = null, wake: (() => void) | null = null, offset = 0;
  const task: PortalTransferTask = { snapshot: { state: 'running' }, pause() { task.snapshot.state = 'paused'; active?.abort(); }, resume() { task.snapshot.state = 'running'; wake?.(); }, cancel() { task.snapshot.state = 'cancelled'; active?.abort(); wake?.(); } };
  const send = (body: Blob | null, range: string) => new Promise<{ status: number; range: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); active = xhr; xhr.open('PUT', session.url); xhr.setRequestHeader('Content-Range', range); xhr.setRequestHeader('Content-Type', type.mime);
    xhr.upload.onprogress = e => { if (body) progress(Math.min(99, Math.round((offset + e.loaded) / file.size * 100))); };
    xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader('Range') });
    xhr.onerror = () => reject(new Error('Upload connection failed. Retry this file.')); xhr.onabort = () => reject(new Error('Upload paused or cancelled.')); xhr.send(body);
  });
  const done = (async () => {
    let failures = 0;
    while (offset < file.size) {
      if (task.snapshot.state === 'cancelled') throw new Error('Upload cancelled. Select or retry the file to upload again.');
      if (task.snapshot.state === 'paused') { await new Promise<void>(resolve => { wake = resolve; }); continue; }
      try {
        const end = Math.min(offset + 1024 * 1024, file.size), result = await send(file.slice(offset, end), `bytes ${offset}-${end - 1}/${file.size}`);
        if (result.status === 200 || result.status === 201) { progress(100); task.snapshot.state = 'success'; return session.file; }
        if (result.status !== 308) throw new Error(`Upload rejected (${result.status}). Retry this file.`);
        offset = result.range ? Number(result.range.split('-').at(-1)) + 1 : end;
      } catch (e) {
        if (task.snapshot.state !== 'running') continue;
        if (++failures > 3) throw e;
        await new Promise(resolve => setTimeout(resolve, failures * 500));
        const state = await send(null, `bytes */${file.size}`);
        if (state.status === 200 || state.status === 201) { progress(100); task.snapshot.state = 'success'; return session.file; }
        if (state.status !== 308) throw e;
        offset = state.range ? Number(state.range.split('-').at(-1)) + 1 : 0;
      }
    }
    throw new Error('The server did not confirm this upload. Retry this file.');
  })();
  return { task, done };
}
export const portalMessage = (e: unknown) => e instanceof Error ? e.message.replace(/^Firebase: /, '') : 'This could not be completed. Try again.';
