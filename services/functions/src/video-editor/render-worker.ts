import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { FfmpegError, blankFrameArgs, probeMedia, runFfmpeg } from './ffmpeg.js';
import { buildRenderPlan, type ResolvedInputs, type ResolvedMedia } from './render-plan.js';
import {
  RenderSpecError,
  frameSize,
  layerPrefix,
  referencedIds,
  referencedLayerPaths,
  type RenderSettings,
  type RenderSpec,
} from './render-spec.js';

/**
 * One render, start to finish, for whichever function picked it up.
 *
 * The render document is claimed with a lease in a transaction, so a duplicate
 * delivery — or the sweeper re-dispatching a render that looked stuck — finds
 * it taken and does nothing. Everything the spec names is re-checked here
 * against Firestore and Storage before a byte is downloaded: the media must
 * belong to the project, the music and stickers must be published library
 * items, and the editor's PNGs must sit under this render's own folder.
 */

export const RENDERS = 'videoRenders';
export const PROJECTS = 'videoProjects';
export const MUSIC_TRACKS = 'videoMusicTracks';
export const STICKERS = 'videoStickers';

/** Longer than the longest render the function can run, shorter than a sweep interval plus that. */
export const RENDER_LEASE_MS = 11 * 60_000;
/** The FFmpeg deadline, inside the function's 540-second limit with room to upload. */
const FFMPEG_TIMEOUT_MS = 430_000;
const MAX_INPUT_BYTES = 1_500 * 1024 * 1024;
/** Finished exports kept per project; older ones are deleted when a new one lands. */
export const KEEP_RENDERS_PER_PROJECT = 3;

export interface RenderFailure {
  code: string;
  message: string;
  retryable: boolean;
}

class RenderInputError extends Error {
  constructor(readonly failure: RenderFailure) {
    super(failure.message);
  }
}

const nowIso = () => new Date().toISOString();

/** The storage folders a project's own media may come from. */
export function allowedMediaPath(storagePath: string, uid: string, projectId: string): boolean {
  if (storagePath.includes('..')) return false;
  return storagePath.startsWith(`video-projects/${uid}/${projectId}/media/`)
    || storagePath.startsWith(`studio-video-jobs/${uid}/`);
}

export function classifyFailure(error: unknown): RenderFailure {
  if (error instanceof RenderInputError) return error.failure;
  if (error instanceof RenderSpecError) return { code: 'invalid-spec', message: error.message, retryable: false };
  if (error instanceof FfmpegError) {
    if (/took longer/.test(error.message)) {
      return {
        code: 'too-slow',
        message: 'This export took longer than one render is allowed. Try 720p, or split the video into shorter parts.',
        retryable: true,
      };
    }
    if (/cancelled/.test(error.message)) return { code: 'cancelled', message: 'The export was cancelled.', retryable: true };
    const tail = error.stderr.split('\n').map((l) => l.trim()).filter(Boolean).slice(-2).join(' ').slice(0, 240);
    return {
      code: 'render-failed',
      message: `The renderer could not finish this video${tail ? ` (${tail})` : ''}. Try again; if it fails the same way, replace the clip it names.`,
      retryable: true,
    };
  }
  return { code: 'internal', message: 'Something went wrong while rendering. Try again.', retryable: true };
}

async function download(storagePath: string, dest: string, budget: { left: number }, missing?: string): Promise<void> {
  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new RenderInputError({ code: 'missing-file', message: missing ?? `A file this video uses is missing (${path.basename(storagePath)}). Replace it and export again.`, retryable: false });
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  budget.left -= size;
  if (budget.left < 0) throw new RenderInputError({ code: 'too-large', message: 'The media in this video is larger than one render can take (1.5 GB). Trim or replace the largest clips.', retryable: false });
  await mkdir(path.dirname(dest), { recursive: true });
  await file.download({ destination: dest });
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve()).on('error', reject);
  });
  return hash.digest('hex');
}

/** Resolves every id and path in the spec to a verified local file. */
async function resolveInputs(spec: RenderSpec, render: Record<string, any>, dir: string): Promise<ResolvedInputs> {
  const db = getFirestore();
  const uid = String(render.ownerUid);
  const projectId = String(render.projectId);
  const requestId = String(render.requestId);
  const budget = { left: MAX_INPUT_BYTES };
  const ids = referencedIds(spec);
  const media = new Map<string, ResolvedMedia>();
  for (const mediaId of ids.mediaIds) {
    const snap = await db.collection(PROJECTS).doc(projectId).collection('media').doc(mediaId).get();
    const storagePath = String(snap.get('storagePath') ?? '');
    if (!snap.exists || !allowedMediaPath(storagePath, uid, projectId)) {
      throw new RenderInputError({ code: 'missing-media', message: 'A clip in this video is no longer in the project. Replace it and export again.', retryable: false });
    }
    const local = path.join(dir, 'media', `${mediaId}${path.extname(storagePath) || '.bin'}`);
    await download(storagePath, local, budget);
    const probe = await probeMedia(local);
    if (!probe.hasVideo && !probe.hasAudio) {
      throw new RenderInputError({ code: 'unreadable-media', message: `“${String(snap.get('fileName') ?? mediaId)}” could not be read as video, image or audio. Replace it and export again.`, retryable: false });
    }
    media.set(mediaId, { path: local, hasVideo: probe.hasVideo, hasAudio: probe.hasAudio, durationSec: probe.durationSec });
  }
  const tracks = new Map<string, { path: string; durationSec: number }>();
  for (const trackId of ids.trackIds) {
    const snap = await db.collection(MUSIC_TRACKS).doc(trackId).get();
    if (!snap.exists || snap.get('status') !== 'published') {
      throw new RenderInputError({ code: 'missing-track', message: 'A music track in this video is no longer in the library. Choose another track and export again.', retryable: false });
    }
    const local = path.join(dir, 'music', `${trackId}.mp3`);
    await download(String(snap.get('audio.storagePath')), local, budget);
    tracks.set(trackId, { path: local, durationSec: (await probeMedia(local)).durationSec });
  }
  const stickers = new Map<string, string>();
  for (const stickerId of ids.stickerIds) {
    const snap = await db.collection(STICKERS).doc(stickerId).get();
    if (!snap.exists || snap.get('status') !== 'published') {
      throw new RenderInputError({ code: 'missing-sticker', message: 'A sticker in this video is no longer in the library. Remove it and export again.', retryable: false });
    }
    const local = path.join(dir, 'stickers', `${stickerId}.png`);
    await download(String(snap.get('image.storagePath')), local, budget);
    stickers.set(stickerId, local);
  }
  const layers = new Map<string, string>();
  const prefix = layerPrefix(uid, projectId, requestId);
  let n = 0;
  for (const layerPath of referencedLayerPaths(spec)) {
    if (!layerPath.startsWith(prefix)) throw new RenderInputError({ code: 'invalid-layer', message: 'This export refers to text that was not prepared for it. Export again.', retryable: false });
    const local = path.join(dir, 'layers', `${n}.png`);
    n += 1;
    // Layers left by an export that never finished are swept after a day.
    await download(layerPath, local, budget, 'The text and captions drawn for this export are no longer kept. Export again to draw them afresh.');
    layers.set(layerPath, local);
  }
  const { width, height } = frameSize(render.settings as RenderSettings);
  const blankFramePath = path.join(dir, 'layers', 'blank.png');
  await mkdir(path.dirname(blankFramePath), { recursive: true });
  await runFfmpeg(blankFrameArgs(width, height, blankFramePath), { timeoutMs: 30_000 });
  return { media, tracks, stickers, layers, blankFramePath };
}

/** Deletes the editor's PNGs for this request once the render no longer needs them. */
async function deleteLayers(uid: string, projectId: string, requestId: string): Promise<void> {
  await getStorage().bucket().deleteFiles({ prefix: layerPrefix(uid, projectId, requestId) }).catch(() => undefined);
}

/** Keeps the newest finished exports of a project and deletes the rest. */
export async function pruneOldRenders(uid: string, projectId: string, keep = KEEP_RENDERS_PER_PROJECT): Promise<number> {
  const db = getFirestore();
  const snap = await db.collection(RENDERS).where('ownerUid', '==', uid).get();
  const finished = snap.docs
    .filter((d) => d.get('projectId') === projectId && d.get('status') === 'succeeded' && d.get('quality') !== 'draft' && d.get('output.storagePath'))
    .sort((a, b) => String(b.get('finishedAt') ?? '').localeCompare(String(a.get('finishedAt') ?? '')));
  const drafts = snap.docs
    .filter((d) => d.get('projectId') === projectId && d.get('status') === 'succeeded' && d.get('quality') === 'draft' && d.get('output.storagePath'))
    .sort((a, b) => String(b.get('finishedAt') ?? '').localeCompare(String(a.get('finishedAt') ?? '')));
  // Drafts are previews: only the latest is worth keeping.
  const stale = [...finished.slice(keep), ...drafts.slice(1)];
  for (const doc of stale) {
    await getStorage().bucket().file(String(doc.get('output.storagePath'))).delete({ ignoreNotFound: true }).catch(() => undefined);
    await doc.ref.update({ 'output.storagePath': null, expired: true, updatedAt: nowIso() });
  }
  return stale.length;
}

export async function processRender(renderId: string, dispatchId: string): Promise<'done' | 'skipped'> {
  const db = getFirestore();
  const ref = db.collection(RENDERS).doc(renderId);
  const render = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data() as Record<string, any>;
    if (d.status !== 'queued') return null;
    if (typeof d.leaseUntil === 'number' && d.leaseUntil > Date.now()) return null;
    tx.update(ref, {
      status: 'rendering',
      stage: 'Gathering your media',
      progress: 0.03,
      leaseUntil: Date.now() + RENDER_LEASE_MS,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      dispatchId,
      attempts: FieldValue.increment(1),
      error: null,
    });
    return d;
  });
  if (!render) return 'skipped';

  const uid = String(render.ownerUid);
  const projectId = String(render.projectId);
  const requestId = String(render.requestId);
  const settings = render.settings as RenderSettings;
  const spec = render.spec as RenderSpec;
  const dir = await mkdtemp(path.join(tmpdir(), 'render-'));
  const abort = new AbortController();
  let lastWrite = 0;
  const cancelWatch = setInterval(() => {
    void ref.get().then((s) => {
      if (s.get('cancelRequested') === true) abort.abort();
    }).catch(() => undefined);
  }, 8000);
  try {
    const inputs = await resolveInputs(spec, render, dir);
    await ref.update({ stage: 'Rendering', progress: 0.1, updatedAt: nowIso() });
    const output = path.join(dir, 'output.mp4');
    const plan = buildRenderPlan(spec, settings, inputs, dir, output);
    for (const file of plan.files) await writeFile(file.path, file.content);
    await runFfmpeg(plan.args, {
      timeoutMs: FFMPEG_TIMEOUT_MS,
      signal: abort.signal,
      onProgress: (seconds) => {
        const now = Date.now();
        if (now - lastWrite < 3000) return;
        lastWrite = now;
        const share = Math.min(1, seconds / Math.max(0.1, plan.durationSec));
        void ref.update({ progress: Math.round((0.1 + share * 0.8) * 100) / 100, stage: `Rendering ${Math.round(share * 100)}%`, updatedAt: nowIso() }).catch(() => undefined);
      },
    });

    // Check the file is what was asked for before anybody downloads it.
    const probe = await probeMedia(output);
    if (!probe.hasVideo || !probe.hasAudio || probe.width !== plan.width || probe.height !== plan.height || Math.abs(probe.durationSec - plan.durationSec) > 0.25) {
      throw new RenderInputError({
        code: 'verification-failed',
        message: `The finished file did not check out (${probe.width}×${probe.height}, ${probe.durationSec.toFixed(2)} s; expected ${plan.width}×${plan.height}, ${plan.durationSec.toFixed(2)} s). Try again.`,
        retryable: true,
      });
    }
    await ref.update({ stage: 'Saving', progress: 0.94, updatedAt: nowIso() });
    const slug = String(render.title ?? 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'video';
    const storagePath = `video-renders/${uid}/${renderId}/${slug}-${settings.aspect.replace(':', 'x')}.mp4`;
    await getStorage().bucket().upload(output, {
      destination: storagePath,
      resumable: false,
      metadata: { contentType: 'video/mp4', cacheControl: 'private, max-age=3600', metadata: { renderId, projectId } },
    });
    const bytes = (await stat(output)).size;
    const finishedAt = nowIso();
    const result = {
      storagePath,
      bytes,
      sha256: await sha256(output),
      durationSec: Math.round(probe.durationSec * 100) / 100,
      width: probe.width,
      height: probe.height,
      videoCodec: 'h264',
      audioCodec: 'aac',
    };
    await ref.update({ status: 'succeeded', stage: 'Ready', progress: 1, output: result, finishedAt, updatedAt: finishedAt, leaseUntil: null });
    await db.collection(PROJECTS).doc(projectId).set({ lastRender: { renderId, status: 'succeeded', quality: settings.quality, aspect: settings.aspect, finishedAt } }, { merge: true }).catch(() => undefined);
    // What the library's items were actually used for, counted on exports only.
    if (settings.quality !== 'draft') {
      const ids = referencedIds(spec);
      for (const trackId of ids.trackIds) await db.collection(MUSIC_TRACKS).doc(trackId).update({ 'usage.exports': FieldValue.increment(1), 'usage.lastUsedAt': finishedAt }).catch(() => undefined);
      for (const stickerId of ids.stickerIds) await db.collection(STICKERS).doc(stickerId).update({ 'usage.exports': FieldValue.increment(1), 'usage.lastUsedAt': finishedAt }).catch(() => undefined);
    }
    await deleteLayers(uid, projectId, requestId);
    await pruneOldRenders(uid, projectId).catch((e) => logger.warn('render prune failed', { renderId, error: String(e) }));
    logger.info('video render finished', { renderId, seconds: plan.durationSec, bytes, quality: settings.quality });
    return 'done';
  } catch (error) {
    const failure = abort.signal.aborted ? { code: 'cancelled', message: 'The export was cancelled.', retryable: true } : classifyFailure(error);
    logger.warn('video render failed', { renderId, code: failure.code, detail: error instanceof FfmpegError ? error.stderr.slice(-1500) : String(error) });
    await ref.update({
      status: failure.code === 'cancelled' ? 'cancelled' : 'failed',
      stage: failure.code === 'cancelled' ? 'Cancelled' : 'Failed',
      error: failure,
      leaseUntil: null,
      finishedAt: nowIso(),
      updatedAt: nowIso(),
    });
    await db.collection(PROJECTS).doc(projectId).set({ lastRender: { renderId, status: failure.code === 'cancelled' ? 'cancelled' : 'failed', quality: settings.quality, aspect: settings.aspect, finishedAt: nowIso() } }, { merge: true }).catch(() => undefined);
    return 'done';
  } finally {
    clearInterval(cancelWatch);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
