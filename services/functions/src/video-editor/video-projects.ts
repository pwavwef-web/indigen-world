import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth } from '../auth.js';
import { googleProjectId } from '../google-api-auth.js';
import { readKawuriMediaConfig } from '../kawuri-media-policy.js';
import { generateStructured, mediaPart } from '../kawuri-vertex.js';
import { consumeRateLimit } from '../rate-limit.js';
import {
  TRANSCRIPT_INSTRUCTION,
  TRANSCRIPT_SCHEMA,
  alignToSpeech,
  captionLines,
  snapToSpeech,
  speechSegments,
} from './captions.js';
import { ffmpegPath, probeMedia } from './ffmpeg.js';
import {
  MUSIC_TRACKS,
  PROJECTS,
  RENDERS,
  STICKERS,
  allowedMediaPath,
  processRender,
} from './render-worker.js';
import {
  RenderSpecError,
  layerPrefix,
  parseRenderSettings,
  parseRenderSpec,
  referencedIds,
  referencedLayerPaths,
  sceneTimes,
} from './render-spec.js';
import { PLAN_SCHEMA, planInstruction, readPlan, splitScript, type ScenePlan } from './scene-planner.js';

/**
 * The video editor's backend.
 *
 * Projects, their media and their timelines are written by the editor itself,
 * under Firestore rules that keep each project to its owner. What cannot be
 * trusted to a browser runs here: rendering, which is FFmpeg on eight vCPUs;
 * signed links to finished files; deleting a project together with every file
 * it left behind; and the two model calls — planning scenes and timing
 * captions — which spend Vertex AI and are rate limited per member.
 *
 * ── How a render travels ──────────────────────────────────────────────────
 * `startVideoRender` validates the spec, checks that every file it names is in
 * place, and writes the render (idempotently: the id is the member's request
 * id) plus a dispatch record. The dispatch record is what triggers
 * `onVideoRenderDispatched`; a retry or a sweep writes another one. The render
 * document itself carries progress and has no trigger on it, so the many
 * progress writes cost nothing but the writes.
 */

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
const CALLABLE = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public' as const,
  timeoutSeconds: 120,
  memory: '1GiB' as const,
};
export const DISPATCHES = 'videoRenderDispatches';
/** A member's exports running at once. More wait for one to finish. */
export const MAX_ACTIVE_RENDERS = 3;
/** Finished files are kept this long; the editor says so next to every download. */
export const RENDER_RETENTION_DAYS = 30;

const nowIso = () => new Date().toISOString();
type Json = Record<string, unknown>;

function asRecord(raw: unknown): Json {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'A request body is required.');
  return raw as Json;
}

function requiredId(raw: unknown, field: string, pattern = /^[A-Za-z0-9_-]{6,120}$/): string {
  if (typeof raw !== 'string' || !pattern.test(raw)) throw new HttpsError('invalid-argument', `${field} is required.`);
  return raw;
}

async function ownedProject(uid: string, projectId: string): Promise<Json> {
  const snap = await getFirestore().collection(PROJECTS).doc(projectId).get();
  if (!snap.exists || snap.get('ownerUid') !== uid) throw new HttpsError('not-found', 'That project was not found.');
  return snap.data() as Json;
}

async function ownedRender(uid: string, renderId: string) {
  const ref = getFirestore().collection(RENDERS).doc(renderId);
  const snap = await ref.get();
  if (!snap.exists || snap.get('ownerUid') !== uid) throw new HttpsError('not-found', 'That export was not found.');
  return { ref, data: snap.data() as Json };
}

function publicRender(id: string, d: Json) {
  return {
    id,
    projectId: d.projectId,
    status: d.status,
    stage: d.stage ?? null,
    progress: d.progress ?? 0,
    settings: d.settings,
    error: d.error ?? null,
    output: d.output ?? null,
    createdAt: d.createdAt ?? null,
    finishedAt: d.finishedAt ?? null,
  };
}

async function activeRenders(uid: string): Promise<number> {
  const snap = await getFirestore().collection(RENDERS).where('ownerUid', '==', uid).get();
  return snap.docs.filter((d) => d.get('status') === 'queued' || d.get('status') === 'rendering').length;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export const startVideoRender = onCall(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('startVideoRender', uid, 40, 60 * 60_000, 1, 'You have started a lot of exports this hour. Wait a little, then try again.');
  const data = asRecord(req.data);
  const projectId = requiredId(data.projectId, 'projectId');
  const requestId = requiredId(data.requestId, 'requestId', /^[A-Za-z0-9-]{8,64}$/);
  const project = await ownedProject(uid, projectId);
  let spec;
  try {
    spec = parseRenderSpec(data.spec, { uid, projectId, requestId });
  } catch (error) {
    if (error instanceof RenderSpecError) throw new HttpsError('invalid-argument', error.message, { field: error.field });
    throw error;
  }
  const settings = parseRenderSettings(data.settings, spec.aspect);
  const db = getFirestore();
  const renderId = `${uid}_${requestId}`;
  const ref = db.collection(RENDERS).doc(renderId);
  const existing = await ref.get();
  if (existing.exists) return publicRender(renderId, existing.data() as Json);

  // Everything the render will need, checked now so a mistake is reported in
  // the editor rather than minutes later from the worker.
  const ids = referencedIds(spec);
  const mediaSnaps = await Promise.all(ids.mediaIds.map((id) => db.collection(PROJECTS).doc(projectId).collection('media').doc(id).get()));
  const missingMedia = mediaSnaps.filter((s) => !s.exists || !allowedMediaPath(String(s.get('storagePath') ?? ''), uid, projectId));
  if (missingMedia.length > 0) throw new HttpsError('failed-precondition', 'A clip in this video is missing from the project. Replace it, then export again.');
  const pendingUploads = mediaSnaps.filter((s) => s.get('status') === 'uploading');
  if (pendingUploads.length > 0) throw new HttpsError('failed-precondition', 'A clip is still uploading. Wait for it to finish, then export.');
  const libraryChecks = await Promise.all([
    ...ids.trackIds.map((id) => db.collection(MUSIC_TRACKS).doc(id).get()),
    ...ids.stickerIds.map((id) => db.collection(STICKERS).doc(id).get()),
  ]);
  if (libraryChecks.some((s) => !s.exists || s.get('status') !== 'published')) {
    throw new HttpsError('failed-precondition', 'A music track or sticker in this video is no longer in the library. Choose another, then export again.');
  }
  const needed = referencedLayerPaths(spec);
  if (needed.length > 0) {
    const [files] = await getStorage().bucket().getFiles({ prefix: layerPrefix(uid, projectId, requestId) });
    const present = new Set(files.map((f) => f.name));
    if (needed.some((p) => !present.has(p))) {
      throw new HttpsError('failed-precondition', 'Some of the text for this export did not finish uploading. Export again.');
    }
  }
  if (await activeRenders(uid) >= MAX_ACTIVE_RENDERS) {
    throw new HttpsError('resource-exhausted', `${MAX_ACTIVE_RENDERS} exports are already running. Wait for one to finish, then try again.`);
  }

  const now = nowIso();
  const render = {
    id: renderId,
    ownerUid: uid,
    projectId,
    requestId,
    title: String(project.title ?? 'Untitled video').slice(0, 120),
    status: 'queued',
    stage: 'Waiting to start',
    progress: 0,
    settings,
    quality: settings.quality,
    durationSec: sceneTimes(spec.scenes).total,
    spec,
    attempts: 0,
    dispatches: 1,
    leaseUntil: null,
    cancelRequested: false,
    error: null,
    output: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  const created = await db.runTransaction(async (tx) => {
    const again = await tx.get(ref);
    if (again.exists) return again.data() as Json;
    tx.create(ref, render);
    tx.create(db.collection(DISPATCHES).doc(), { renderId, ownerUid: uid, reason: 'start', createdAt: now });
    return render;
  });
  return publicRender(renderId, created);
});

export const retryVideoRender = onCall(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('retryVideoRender', uid, 30, 60 * 60_000);
  const renderId = requiredId(asRecord(req.data).renderId, 'renderId', /^[A-Za-z0-9_-]{8,200}$/);
  const { ref, data } = await ownedRender(uid, renderId);
  if (data.status !== 'failed' && data.status !== 'cancelled') throw new HttpsError('failed-precondition', 'Only a failed or cancelled export can be tried again.');
  const error = data.error as Json | null;
  if (error && error.retryable === false) {
    throw new HttpsError('failed-precondition', `${String(error.message)} Then export again from the editor.`);
  }
  if (await activeRenders(uid) >= MAX_ACTIVE_RENDERS) {
    throw new HttpsError('resource-exhausted', `${MAX_ACTIVE_RENDERS} exports are already running. Wait for one to finish, then try again.`);
  }
  const db = getFirestore();
  const now = nowIso();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get('status') !== 'failed' && snap.get('status') !== 'cancelled') return;
    tx.update(ref, { status: 'queued', stage: 'Waiting to start', progress: 0, error: null, cancelRequested: false, leaseUntil: null, dispatches: Number(snap.get('dispatches') ?? 1) + 1, updatedAt: now, finishedAt: null });
    tx.create(db.collection(DISPATCHES).doc(), { renderId, ownerUid: uid, reason: 'retry', createdAt: now });
  });
  return publicRender(renderId, (await ref.get()).data() as Json);
});

export const cancelVideoRender = onCall(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  const renderId = requiredId(asRecord(req.data).renderId, 'renderId', /^[A-Za-z0-9_-]{8,200}$/);
  const { ref } = await ownedRender(uid, renderId);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const status = snap.get('status');
    if (status === 'queued') tx.update(ref, { status: 'cancelled', stage: 'Cancelled', error: { code: 'cancelled', message: 'The export was cancelled.', retryable: true }, updatedAt: nowIso(), finishedAt: nowIso() });
    else if (status === 'rendering') tx.update(ref, { cancelRequested: true, updatedAt: nowIso() });
  });
  return { renderId, cancelled: true };
});

export const getVideoRenderUrl = onCall(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  const data = asRecord(req.data);
  const renderId = requiredId(data.renderId, 'renderId', /^[A-Za-z0-9_-]{8,200}$/);
  const { data: render } = await ownedRender(uid, renderId);
  const output = render.output as Json | null;
  if (render.status !== 'succeeded' || !output?.storagePath) {
    throw new HttpsError('failed-precondition', render.expired ? `Exports are kept for ${RENDER_RETENTION_DAYS} days; export this video again.` : 'This export is not ready yet.');
  }
  const file = getStorage().bucket().file(String(output.storagePath));
  const name = path.basename(String(output.storagePath));
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    // The Storage emulator cannot sign a URL, so the emulator hands back a
    // token link to itself instead. A deployed function never takes this path:
    // production links are signed and expire.
    const token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
    return { url: `http://${host}/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`, expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), fileName: name };
  }
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 2 * 60 * 60_000,
    ...(data.download === true ? { responseDisposition: `attachment; filename="${name}"`, responseType: 'video/mp4' } : {}),
  });
  return { url, expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), fileName: name };
});

/**
 * Copies a finished export into the member's own submission folder, so it can
 * be posted. A post must not point at the export itself: exports are pruned
 * (the newest three per project are kept) and expire after the retention
 * period, and a post under review would lose its video.
 */
export const copyVideoRenderForPost = onCall(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('copyVideoRenderForPost', uid, 30, 60 * 60_000);
  const renderId = requiredId(asRecord(req.data).renderId, 'renderId', /^[A-Za-z0-9_-]{8,200}$/);
  const { data } = await ownedRender(uid, renderId);
  const output = data.output as Json | null;
  if (data.status !== 'succeeded' || !output?.storagePath) throw new HttpsError('failed-precondition', 'Only a finished export can be posted.');
  if (data.quality === 'draft') throw new HttpsError('failed-precondition', 'Export at Standard or High quality to post; a preview render is for checking.');
  const destination = `creator-submissions/${uid}/studio-video/${renderId}/${path.basename(String(output.storagePath))}`;
  const bucket = getStorage().bucket();
  const [exists] = await bucket.file(destination).exists();
  if (!exists) await bucket.file(String(output.storagePath)).copy(bucket.file(destination));
  return { storagePath: destination };
});

export const deleteVideoProject = onCall({ ...CALLABLE, timeoutSeconds: 300 }, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('deleteVideoProject', uid, 30, 60 * 60_000);
  const projectId = requiredId(asRecord(req.data).projectId, 'projectId');
  await ownedProject(uid, projectId);
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const renders = (await db.collection(RENDERS).where('ownerUid', '==', uid).get()).docs.filter((d) => d.get('projectId') === projectId);
  if (renders.some((d) => d.get('status') === 'rendering')) throw new HttpsError('failed-precondition', 'An export of this project is still rendering. Cancel it or wait, then delete.');
  // Files first: a project document without its files is harmless, files
  // without a document are storage nobody can find to delete.
  await bucket.deleteFiles({ prefix: `video-projects/${uid}/${projectId}/` });
  for (const render of renders) await bucket.deleteFiles({ prefix: `video-renders/${uid}/${render.id}/` });
  const media = await db.collection(PROJECTS).doc(projectId).collection('media').get();
  const writer = db.bulkWriter();
  for (const doc of media.docs) void writer.delete(doc.ref);
  for (const render of renders) void writer.delete(render.ref);
  void writer.delete(db.collection(PROJECTS).doc(projectId));
  await writer.close();
  logger.info('video project deleted', { projectId, renders: renders.length, media: media.size });
  return { projectId, deleted: true };
});

export const onVideoRenderDispatched = onDocumentCreated(
  {
    document: `${DISPATCHES}/{dispatchId}`,
    region: REGION,
    timeoutSeconds: 540,
    memory: '16GiB',
    cpu: 8,
    concurrency: 1,
    maxInstances: 6,
    retry: false,
  },
  async (event) => {
    const renderId = String(event.data?.get('renderId') ?? '');
    if (!renderId) return;
    await processRender(renderId, event.params.dispatchId);
  },
);

/**
 * The safety net, every ten minutes:
 *   - a render whose lease ran out while rendering died with its function, and
 *     is failed with a retry offered;
 *   - a render still queued after five minutes never reached a worker, and is
 *     dispatched again (twice at most);
 *   - finished files older than the retention period are deleted.
 */
export const sweepVideoRenders = onSchedule({ schedule: 'every 10 minutes', region: REGION, timeoutSeconds: 300, memory: '512MiB' }, async () => {
  const db = getFirestore();
  const now = Date.now();
  const rendering = await db.collection(RENDERS).where('status', '==', 'rendering').get();
  for (const doc of rendering.docs) {
    const lease = Number(doc.get('leaseUntil') ?? 0);
    if (lease > now) continue;
    await doc.ref.update({ status: 'failed', stage: 'Failed', leaseUntil: null, finishedAt: nowIso(), updatedAt: nowIso(), error: { code: 'worker-lost', message: 'The renderer stopped before it finished. Try again.', retryable: true } });
  }
  const queued = await db.collection(RENDERS).where('status', '==', 'queued').get();
  for (const doc of queued.docs) {
    const updated = Date.parse(String(doc.get('updatedAt') ?? ''));
    if (Number.isFinite(updated) && now - updated < 5 * 60_000) continue;
    const dispatches = Number(doc.get('dispatches') ?? 1);
    if (dispatches >= 3) {
      await doc.ref.update({ status: 'failed', stage: 'Failed', finishedAt: nowIso(), updatedAt: nowIso(), error: { code: 'not-started', message: 'The export could not be started. Try again in a few minutes.', retryable: true } });
      continue;
    }
    await doc.ref.update({ dispatches: dispatches + 1, updatedAt: nowIso() });
    await db.collection(DISPATCHES).add({ renderId: doc.id, ownerUid: doc.get('ownerUid'), reason: 'sweep', createdAt: nowIso() });
  }
  const cutoff = new Date(now - RENDER_RETENTION_DAYS * 24 * 60 * 60_000).toISOString();
  const old = await db.collection(RENDERS).where('finishedAt', '<', cutoff).limit(200).get();
  for (const doc of old.docs) {
    const storagePath = doc.get('output.storagePath');
    if (storagePath) await getStorage().bucket().file(String(storagePath)).delete({ ignoreNotFound: true }).catch(() => undefined);
    if (!doc.get('expired')) await doc.ref.update({ 'output.storagePath': null, expired: true, updatedAt: nowIso() });
  }
  // Dispatch records are only triggers; a day later they are noise.
  const staleDispatches = await db.collection(DISPATCHES).where('createdAt', '<', new Date(now - 24 * 60 * 60_000).toISOString()).limit(400).get();
  const writer = db.bulkWriter();
  for (const doc of staleDispatches.docs) void writer.delete(doc.ref);
  await writer.close();
  // A render deletes its layers once it has read them. An export abandoned
  // while they were uploading (tab closed, connection lost) leaves them
  // behind; after a day no retry can use them, so they go.
  const [layerFiles] = await getStorage().bucket().getFiles({ matchGlob: 'video-projects/*/*/layers/**', maxResults: 500, autoPaginate: false });
  for (const file of layerFiles) {
    const created = Date.parse(String(file.metadata.timeCreated ?? ''));
    if (Number.isFinite(created) && now - created > 24 * 60 * 60_000) await file.delete({ ignoreNotFound: true }).catch(() => undefined);
  }
});

// ---------------------------------------------------------------------------
// Planning scenes
// ---------------------------------------------------------------------------

let moodCache: { moods: string[]; at: number } | null = null;

/** The library's moods — the categories its tracks are filed under — from the published tracks themselves. */
async function libraryMoods(): Promise<string[]> {
  if (moodCache && Date.now() - moodCache.at < 30 * 60_000 && moodCache.moods.length) return moodCache.moods;
  const snap = await getFirestore().collection(MUSIC_TRACKS).where('status', '==', 'published').select('group').get();
  const moods = [...new Set(snap.docs.map((d) => String(d.get('group') ?? '')).filter(Boolean))].sort();
  moodCache = { moods, at: Date.now() };
  return moods;
}

export const planVideoScenes = onCall({ ...CALLABLE, timeoutSeconds: 90 }, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('planVideoScenes', uid, 20, 60 * 60_000, 1, 'You have planned a lot of videos this hour. Try again later, or start from a blank project.');
  const data = asRecord(req.data);
  const source = data.source === 'script' ? 'script' : 'prompt';
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (text.length < 8) throw new HttpsError('invalid-argument', source === 'script' ? 'Paste the script first.' : 'Describe the video first.');
  if (text.length > 6000) throw new HttpsError('invalid-argument', 'Keep it under 6,000 characters.');
  const aspect = ['9:16', '1:1', '16:9'].includes(String(data.aspect)) ? String(data.aspect) : '9:16';
  const targetSeconds = Math.min(300, Math.max(10, Math.round(Number(data.targetSeconds) || 45)));
  const moods = await libraryMoods().catch(() => [] as string[]);
  const cfg = readKawuriMediaConfig(process.env, googleProjectId());
  let plan: ScenePlan | null = null;
  try {
    const reply = await generateStructured({
      project: cfg.project,
      location: cfg.location,
      models: cfg.analysisModels,
      capability: 'video_scene_plan',
      systemInstruction: planInstruction(source, aspect, targetSeconds, moods),
      contents: [{ role: 'user', parts: [{ text: `${source === 'script' ? 'SCRIPT' : 'IDEA'}:\n${text}` }] }],
      schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 8192,
      temperature: source === 'script' ? 0.2 : 0.7,
      timeoutMs: 60_000,
    });
    plan = readPlan(reply.json, { source, script: text, moods });
  } catch (error) {
    logger.warn('scene planner unavailable', { error: String(error).slice(0, 300) });
  }
  if (!plan && source === 'script') {
    // The model reworded the script or could not be reached: split it ourselves.
    plan = { title: 'Untitled video', scenes: splitScript(text), musicMoods: [], continuity: [], method: 'script-split' };
  }
  if (!plan) throw new HttpsError('unavailable', 'The scene planner could not be reached. Try again, paste a script instead, or start from a blank project.');
  return plan;
});

// ---------------------------------------------------------------------------
// Timing captions
// ---------------------------------------------------------------------------

function runFfmpegStderr(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args);
    let err = '';
    p.stderr.on('data', (d: Buffer) => {
      err += d.toString();
      if (err.length > 2_000_000) err = err.slice(-1_000_000);
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`))));
  });
}

export const alignVideoCaptions = onCall({ ...CALLABLE, timeoutSeconds: 180, memory: '2GiB' }, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('alignVideoCaptions', uid, 40, 60 * 60_000, 1, 'You have timed a lot of captions this hour. Try again later, or time them by hand.');
  const data = asRecord(req.data);
  const projectId = requiredId(data.projectId, 'projectId');
  await ownedProject(uid, projectId);
  const src = asRecord(data.source);
  const offset = Math.max(0, Number(data.clipStart) || 0);
  const sourceIn = Math.max(0, Number(data.sourceIn) || 0);
  const duration = Math.min(600, Math.max(0.5, Number(data.duration) || 0));
  const text = typeof data.text === 'string' ? data.text.trim().slice(0, 12_000) : '';
  const language = typeof data.language === 'string' ? data.language : 'en';

  let storagePath = '';
  if (src.kind === 'media') {
    const mediaId = requiredId(src.mediaId, 'mediaId');
    const snap = await getFirestore().collection(PROJECTS).doc(projectId).collection('media').doc(mediaId).get();
    storagePath = String(snap.get('storagePath') ?? '');
    if (!snap.exists || !allowedMediaPath(storagePath, uid, projectId)) throw new HttpsError('not-found', 'That audio is not in this project.');
  } else if (src.kind === 'track') {
    const snap = await getFirestore().collection(MUSIC_TRACKS).doc(requiredId(src.trackId, 'trackId')).get();
    if (!snap.exists || snap.get('status') !== 'published') throw new HttpsError('not-found', 'That track is not in the library.');
    storagePath = String(snap.get('audio.storagePath'));
  } else {
    throw new HttpsError('invalid-argument', 'Choose the audio to time the captions to.');
  }
  if (!text && !['en', 'fr'].includes(language)) {
    throw new HttpsError('failed-precondition', 'Paste the words to time them. Kasem speech cannot be transcribed automatically yet, but the words you paste can be timed to the audio.');
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'captions-'));
  try {
    const local = path.join(dir, `source${path.extname(storagePath) || '.bin'}`);
    await getStorage().bucket().file(storagePath).download({ destination: local });
    const clip = path.join(dir, 'clip.mp3');
    // The part of the audio the captions are for, as small mono MP3: enough to
    // hear speech, small enough to hand to a model inline.
    await runFfmpegStderr(['-hide_banner', '-nostdin', '-y', '-ss', String(sourceIn), '-t', String(duration), '-i', local, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', clip]);
    const clipDuration = (await probeMedia(clip)).durationSec || duration;
    const stderr = await runFfmpegStderr(['-hide_banner', '-nostdin', '-i', clip, '-af', 'highpass=f=120,lowpass=f=5000,silencedetect=n=-32dB:d=0.28', '-f', 'null', '-']);
    const speech = speechSegments(stderr, clipDuration);
    if (text) {
      const cues = alignToSpeech(captionLines(text), speech, { offset, duration: clipDuration });
      return { method: 'speech-timing', cues, speech: speech.map((s) => ({ start: s.start + offset, end: s.end + offset })) };
    }
    const cfg = readKawuriMediaConfig(process.env, googleProjectId());
    const audio = await readFile(clip);
    if (audio.length > 18 * 1024 * 1024) throw new HttpsError('invalid-argument', 'That audio is too long to transcribe in one go. Time a shorter part.');
    const reply = await generateStructured({
      project: cfg.project,
      location: cfg.location,
      models: cfg.transcriptionModels,
      capability: 'caption_transcription',
      systemInstruction: TRANSCRIPT_INSTRUCTION,
      contents: [{ role: 'user', parts: [mediaPart({ mimeType: 'audio/mp3', base64: audio.toString('base64') }), { text: `Transcribe this ${language === 'fr' ? 'French' : 'English'} speech with times.` }] }],
      schema: TRANSCRIPT_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 8192,
      temperature: 0,
      timeoutMs: 120_000,
    });
    const segments = Array.isArray(reply.json?.segments) ? (reply.json!.segments as { start: number; end: number; text: string }[]) : [];
    const cues = snapToSpeech(segments.filter((s) => typeof s.text === 'string'), speech, { offset, duration: clipDuration });
    return { method: 'transcript', cues, speech: speech.map((s) => ({ start: s.start + offset, end: s.end + offset })) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});
