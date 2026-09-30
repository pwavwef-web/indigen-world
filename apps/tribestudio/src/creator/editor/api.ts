import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { db, functions, storage } from '../../firebase';
import { fetchStudioVideoPlayback } from '../data';
import { normaliseProject, totalDuration, type Aspect, type EditorProject, type ProjectMedia } from './model';
import type { LayerUpload, RenderSettings } from './render-job';

/**
 * The editor's reads and writes.
 *
 * Projects, their media records and uploads go straight to Firestore and
 * Storage under rules that keep them to their owner; rendering, signed links,
 * project deletion and the two model calls go through callables. Nothing here
 * holds a key: the library's files are public download links written by the
 * publisher, and everything private is read through the member's own session.
 */

export interface ProjectSummary {
  id: string;
  title: string;
  aspect: Aspect;
  updatedAt: string;
  sceneCount: number;
  durationSec: number;
  lastRender: { renderId: string; status: string; quality: string; finishedAt: string } | null;
}

export interface MusicTrack {
  id: string;
  title: string;
  group: string;
  moods: string[];
  style: string;
  energy: string;
  bpm: number | null;
  durationSec: number;
  url: string;
  peaks: number[];
  description: string;
  license: { summary: string; aiGenerated: boolean; model: string; restrictions: string[] };
}

export interface Sticker {
  id: string;
  label: string;
  category: string;
  keywords: string[];
  url: string;
  width: number;
  height: number;
  altText: string;
}

export interface RenderDoc {
  id: string;
  projectId: string;
  status: 'queued' | 'rendering' | 'succeeded' | 'failed' | 'cancelled';
  stage: string | null;
  progress: number;
  settings: RenderSettings;
  quality: string;
  error: { code: string; message: string; retryable: boolean } | null;
  output: { storagePath: string | null; bytes: number; durationSec: number; width: number; height: number } | null;
  createdAt: string;
  finishedAt: string | null;
  expired?: boolean;
}

const nowIso = () => new Date().toISOString();

/** Firestore refuses `undefined`; a project is plain data, so a JSON round trip strips it. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ── Projects ────────────────────────────────────────────────────────────────

export async function listProjects(uid: string): Promise<ProjectSummary[]> {
  const snap = await getDocs(query(collection(db, 'videoProjects'), where('ownerUid', '==', uid)));
  return snap.docs
    .filter((d) => d.get('status') !== 'archived')
    .map((d) => {
      const project = normaliseProject(d.data());
      return {
        id: d.id,
        title: project.title,
        aspect: project.aspect,
        updatedAt: String(d.get('updatedAt') ?? ''),
        sceneCount: project.timeline.scenes.length,
        durationSec: totalDuration(project),
        lastRender: (d.get('lastRender') as ProjectSummary['lastRender']) ?? null,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface ProjectPlanInfo {
  musicMoods: string[];
  method: string | null;
}

export async function createProject(uid: string, project: EditorProject, plan: ProjectPlanInfo | null = null): Promise<string> {
  const now = nowIso();
  const created = await addDoc(collection(db, 'videoProjects'), {
    ownerUid: uid,
    title: project.title,
    aspect: project.aspect,
    status: 'draft',
    origin: project.origin,
    timeline: plain(project.timeline),
    continuity: plain(project.continuity),
    ...(plan ? { plan } : {}),
    schemaVersion: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  return created.id;
}

export async function loadProject(projectId: string): Promise<{ project: EditorProject; revision: number; consent: Record<string, unknown> | null; plan: ProjectPlanInfo | null } | null> {
  const snap = await getDoc(doc(db, 'videoProjects', projectId));
  if (!snap.exists()) return null;
  return {
    project: normaliseProject(snap.data()),
    revision: Number(snap.get('revision') ?? 1),
    consent: (snap.get('consent') as Record<string, unknown>) ?? null,
    plan: (snap.get('plan') as ProjectPlanInfo) ?? null,
  };
}

export function subscribeLastRender(projectId: string, onChange: (lastRender: ProjectSummary['lastRender']) => void): Unsubscribe {
  return onSnapshot(doc(db, 'videoProjects', projectId), (snap) => onChange((snap.get('lastRender') as ProjectSummary['lastRender']) ?? null));
}

export async function saveProject(projectId: string, project: EditorProject, revision: number): Promise<void> {
  await updateDoc(doc(db, 'videoProjects', projectId), {
    title: project.title,
    aspect: project.aspect,
    timeline: plain(project.timeline),
    continuity: plain(project.continuity),
    revision,
    updatedAt: nowIso(),
  });
}

export async function saveConsent(projectId: string, consent: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, 'videoProjects', projectId), { consent, updatedAt: nowIso() });
}

export async function deleteProject(projectId: string): Promise<void> {
  await httpsCallable(functions, 'deleteVideoProject')({ projectId });
}

// ── Media ───────────────────────────────────────────────────────────────────

export function subscribeMedia(projectId: string, onChange: (media: ProjectMedia[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, 'videoProjects', projectId, 'media'), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectMedia, 'id'>) })));
  }, onError);
}

export const MEDIA_LIMITS = { video: 500 * 1024 * 1024, audio: 100 * 1024 * 1024, image: 25 * 1024 * 1024 } as const;

export function mediaKindOf(file: File): ProjectMedia['kind'] | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (/^image\/(png|jpeg|webp)$/.test(file.type)) return 'image';
  return null;
}

/** Length and size of a local file, read by the browser before it uploads. */
export function readLocalMedia(file: File, kind: ProjectMedia['kind']): Promise<{ durationSec: number; width: number | null; height: number | null }> {
  const url = URL.createObjectURL(file);
  const done = <T,>(v: T) => {
    URL.revokeObjectURL(url);
    return v;
  };
  if (kind === 'image') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(done({ durationSec: 0, width: img.naturalWidth, height: img.naturalHeight }));
      img.onerror = () => reject(done(new Error(`${file.name} could not be read as an image.`)));
      img.src = url;
    });
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const video = el as HTMLVideoElement;
      resolve(done({ durationSec: Number.isFinite(el.duration) ? el.duration : 0, width: kind === 'video' ? video.videoWidth || null : null, height: kind === 'video' ? video.videoHeight || null : null }));
    };
    el.onerror = () => reject(done(new Error(`${file.name} could not be read. Try an MP4, MOV, MP3 or M4A file.`)));
    el.src = url;
  });
}

/**
 * Uploads a file into the project and records it. The record is written only
 * once the bytes are in Storage, so a half-finished upload never becomes a
 * clip the renderer is asked for.
 */
export async function uploadMedia(uid: string, projectId: string, file: File, onProgress: (pct: number) => void, source: ProjectMedia['source'] = 'upload'): Promise<ProjectMedia> {
  const kind = mediaKindOf(file);
  if (!kind) throw new Error(`${file.name} is not a video, an audio file or a PNG, JPEG or WebP image.`);
  if (file.size > MEDIA_LIMITS[kind]) throw new Error(`${file.name} is larger than ${MEDIA_LIMITS[kind] / (1024 * 1024)} MB.`);
  const info = await readLocalMedia(file, kind);
  const mediaRef = doc(collection(db, 'videoProjects', projectId, 'media'));
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-100) || `${kind}.bin`;
  const storagePath = `video-projects/${uid}/${projectId}/media/${mediaRef.id}/${safeName}`;
  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: file.type });
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', (s) => onProgress(Math.round((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100)), reject, () => resolve());
  });
  const media: Omit<ProjectMedia, 'id'> = {
    kind,
    storagePath,
    fileName: file.name.slice(0, 160),
    mimeType: file.type,
    sizeBytes: file.size,
    durationSec: Math.round(info.durationSec * 1000) / 1000,
    width: info.width,
    height: info.height,
    hasAudio: kind !== 'image',
    source,
    jobId: null,
    status: 'ready',
  };
  await setDoc(mediaRef, { ...media, createdAt: nowIso() });
  return { id: mediaRef.id, ...media };
}

/** Records a finished AI video from the Studio as project media. */
export async function addAiMedia(projectId: string, job: { id: string; outputStoragePath: string; durationSec: number; prompt: string }): Promise<ProjectMedia> {
  const mediaRef = doc(collection(db, 'videoProjects', projectId, 'media'));
  const media: Omit<ProjectMedia, 'id'> = {
    kind: 'video',
    storagePath: job.outputStoragePath,
    fileName: job.prompt.slice(0, 80) || 'AI video',
    mimeType: 'video/mp4',
    sizeBytes: 0,
    durationSec: job.durationSec,
    width: null,
    height: null,
    hasAudio: false,
    source: 'ai',
    jobId: job.id,
    status: 'ready',
  };
  await setDoc(mediaRef, { ...media, createdAt: nowIso() });
  return { id: mediaRef.id, ...media };
}

export async function deleteMedia(projectId: string, media: ProjectMedia): Promise<void> {
  if (media.source !== 'ai') await deleteObject(ref(storage, media.storagePath)).catch(() => undefined);
  await deleteDoc(doc(db, 'videoProjects', projectId, 'media', media.id));
}

const urlCache = new Map<string, { url: string; at: number }>();

/** A playable URL for a project file: a download link for uploads, a signed one for AI videos. */
export async function mediaUrl(media: ProjectMedia): Promise<string> {
  const hit = urlCache.get(media.id);
  if (hit && Date.now() - hit.at < 50 * 60_000) return hit.url;
  const url = media.source === 'ai' && media.jobId
    ? (await fetchStudioVideoPlayback(media.jobId)).playbackUrl
    : await getDownloadURL(ref(storage, media.storagePath));
  urlCache.set(media.id, { url, at: Date.now() });
  return url;
}

// ── The libraries ───────────────────────────────────────────────────────────

let tracksCache: MusicTrack[] | null = null;
let stickersCache: Sticker[] | null = null;

// An empty answer is never cached: a library published while the editor is
// open must appear the next time the panel asks.
export async function listMusicTracks(): Promise<MusicTrack[]> {
  if (tracksCache?.length) return tracksCache;
  const snap = await getDocs(query(collection(db, 'videoMusicTracks'), where('status', '==', 'published')));
  tracksCache = snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        title: String(x.title ?? 'Untitled'),
        group: String(x.group ?? ''),
        moods: Array.isArray(x.moods) ? (x.moods as string[]) : [],
        style: String(x.style ?? ''),
        energy: String(x.energy ?? ''),
        bpm: typeof x.tempoBpm === 'number' ? x.tempoBpm : null,
        durationSec: Number(x.durationSec ?? 0),
        url: String(x.audio?.url ?? ''),
        peaks: Array.isArray(x.waveform) ? (x.waveform as number[]) : [],
        description: String(x.description ?? ''),
        license: {
          summary: String(x.license?.summary ?? ''),
          aiGenerated: x.license?.aiGenerated !== false,
          model: String(x.generation?.modelName ?? x.generation?.model ?? ''),
          restrictions: Array.isArray(x.license?.restrictions) ? (x.license.restrictions as string[]) : [],
        },
      };
    })
    .filter((t) => t.url)
    .sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));
  return tracksCache;
}

export async function listStickers(): Promise<Sticker[]> {
  if (stickersCache?.length) return stickersCache;
  const snap = await getDocs(query(collection(db, 'videoStickers'), where('status', '==', 'published')));
  stickersCache = snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        label: String(x.label ?? ''),
        category: String(x.category ?? ''),
        keywords: Array.isArray(x.keywords) ? (x.keywords as string[]) : [],
        url: String(x.image?.url ?? ''),
        width: Number(x.image?.width ?? 512),
        height: Number(x.image?.height ?? 512),
        altText: String(x.altText ?? x.label ?? ''),
      };
    })
    .filter((s) => s.url)
    .sort((a, b) => Number(a.category.localeCompare(b.category)) || a.label.localeCompare(b.label));
  return stickersCache;
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** Uploads an export's PNGs, six at a time. */
/** An upload that has sent nothing for this long is stuck, not slow. */
const LAYER_STALL_MS = 20_000;
/** Tries per layer: a stuck request is cancelled and sent again. */
const LAYER_ATTEMPTS = 3;

class StalledUpload extends Error {}

/** One try at one layer, cancelled if it stops making progress. */
async function uploadLayer(upload: LayerUpload, inFlight: Set<UploadTask>): Promise<void> {
  const task = uploadBytesResumable(ref(storage, upload.path), upload.blob, { contentType: 'image/png' });
  inFlight.add(task);
  let lastProgress = Date.now();
  let stalled = false;
  const stopWatching = task.on('state_changed', () => { lastProgress = Date.now(); });
  const watchdog = window.setInterval(() => {
    if (Date.now() - lastProgress < LAYER_STALL_MS) return;
    stalled = true;
    task.cancel();
  }, 1000);
  try {
    await task;
  } catch (e) {
    throw stalled ? new StalledUpload() : e;
  } finally {
    window.clearInterval(watchdog);
    stopWatching();
    inFlight.delete(task);
  }
}

/**
 * Sends the drawn layers, three at a time. Three, not more: a browser opens
 * only six connections to a host over HTTP/1.1 (the Storage emulator, some
 * proxies), and the editor's own players stream from the same host. A request
 * that stops making progress is cancelled and sent again, twice at most —
 * dropped mobile connections do this, and so does the Storage emulator under
 * concurrent uploads. After that the member gets an error to retry, never a
 * progress bar that stops moving.
 */
export async function uploadLayers(uploads: LayerUpload[], onProgress: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  let failed = false;
  const queue = [...uploads];
  const inFlight = new Set<UploadTask>();
  const worker = async () => {
    while (!failed) {
      const next = queue.shift();
      if (!next) return;
      for (let attempt = 1; ; attempt += 1) {
        try {
          await uploadLayer(next, inFlight);
          break;
        } catch (e) {
          if (!(e instanceof StalledUpload) || failed) throw e;
          if (attempt >= LAYER_ATTEMPTS) throw new Error('Sending the text and captions stopped part-way. Check your connection, then try again.');
        }
      }
      done += 1;
      onProgress(done, uploads.length);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, uploads.length) }, worker));
  } catch (e) {
    failed = true;
    for (const task of inFlight) task.cancel();
    throw e;
  }
}

export async function startRender(input: { projectId: string; requestId: string; spec: Record<string, unknown>; settings: RenderSettings }): Promise<RenderDoc> {
  const call = httpsCallable<typeof input, RenderDoc>(functions, 'startVideoRender');
  return (await call(input)).data;
}

export async function retryRender(renderId: string): Promise<void> {
  await httpsCallable(functions, 'retryVideoRender')({ renderId });
}

export async function cancelRender(renderId: string): Promise<void> {
  await httpsCallable(functions, 'cancelVideoRender')({ renderId });
}

export async function renderUrl(renderId: string, download = false): Promise<{ url: string; fileName: string }> {
  const call = httpsCallable<{ renderId: string; download: boolean }, { url: string; fileName: string }>(functions, 'getVideoRenderUrl');
  return (await call({ renderId, download })).data;
}

export async function copyRenderForPost(renderId: string): Promise<string> {
  const call = httpsCallable<{ renderId: string }, { storagePath: string }>(functions, 'copyVideoRenderForPost');
  return (await call({ renderId })).data.storagePath;
}

export function subscribeRender(renderId: string, onChange: (render: RenderDoc | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'videoRenders', renderId), (snap) => onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as RenderDoc) : null), () => onChange(null));
}

export async function listRenders(uid: string, projectId: string): Promise<RenderDoc[]> {
  const snap = await getDocs(query(collection(db, 'videoRenders'), where('ownerUid', '==', uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as RenderDoc)
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Planning and captions ───────────────────────────────────────────────────

export interface ScenePlanReply {
  title: string;
  scenes: { title: string; visual: string; narration: string; caption: string; durationSec: number; transition: 'cut' | 'fade' | 'flash' | 'slide' | 'wipe' }[];
  musicMoods: string[];
  continuity: { name: string; kind: 'character' | 'location' | 'object' | 'brand'; description: string }[];
  method: 'model' | 'script-split';
}

export async function planScenes(input: { source: 'prompt' | 'script'; text: string; aspect: Aspect; targetSeconds: number }): Promise<ScenePlanReply> {
  const call = httpsCallable<typeof input, ScenePlanReply>(functions, 'planVideoScenes', { timeout: 90_000 });
  return (await call(input)).data;
}

export interface AlignReply {
  method: 'speech-timing' | 'transcript';
  cues: { start: number; end: number; text: string; words: { text: string; start: number; end: number }[] }[];
  speech: { start: number; end: number }[];
}

export async function alignCaptions(input: {
  projectId: string;
  source: { kind: 'media'; mediaId: string } | { kind: 'track'; trackId: string };
  clipStart: number;
  sourceIn: number;
  duration: number;
  text: string;
  language: string;
}): Promise<AlignReply> {
  const call = httpsCallable<typeof input, AlignReply>(functions, 'alignVideoCaptions', { timeout: 180_000 });
  return (await call(input)).data;
}

/** Turns a callable's error into the sentence the member should see. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message ?? '').replace(/^Firebase(Error)?:\s*/i, '').trim();
    if (message && !/^(internal|INTERNAL)$/.test(message)) return message;
  }
  return fallback;
}
