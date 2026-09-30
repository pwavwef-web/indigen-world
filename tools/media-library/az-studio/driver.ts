import './setup';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { analyzeMusic, computePeaks, isTerminal, jobRequestSchema, sumEstimates } from '@az-studio/shared';
import { MODEL_REGISTRY } from '@azs/config/models';
import { PRICING } from '@azs/config/pricing';
import { bucket, col, FieldValue } from '@azs/lib/firebase';
import { decodeMono, loudnessStats, silentSpans } from '@azs/lib/signal';
import { createJobs, prepareAll } from '@azs/lib/submit';

/**
 * Generates the video editor's starter libraries through AZ Studio.
 *
 * AZ Studio owns the models (Lyria 3.5 on the Gemini Developer API with its
 * server-side key, Nano Banana Pro on Vertex AI), the spending limits and the
 * worker that calls them. This driver only asks for work the way AZ Studio's own
 * API does — `prepareAll` + `createJobs` with the estimate confirmed — waits for
 * the deployed worker to finish each job, and downloads the originals into the
 * Indigen repository's `.work` folder. Publishing to Indigen is a separate step
 * (`publish.mjs`) with its own checks, so nothing leaves AZ Studio unverified.
 *
 * ── Resumable by construction ────────────────────────────────────────────────
 * Every submitted job id is written to `state.<kind>.json` before the next job is
 * submitted, and the file is replaced atomically. A run that dies is restarted
 * with the same command: items whose job is still running are polled (never
 * submitted twice, so never paid for twice), finished ones are downloaded, and
 * only items with no job — or whose last job failed — are submitted.
 *
 * Usage (built and started by ../run-az-studio.mjs):
 *   music     [--only a,b] [--max N] [--in-flight N] [--note "…"]
 *   stickers  [--only a,b] [--max N] [--in-flight N] [--note "…"]
 *   edit      <stickerId> "instruction"      conversational fix of a finished sticker
 *   reject    <music|stickers> <id> "reason" marks an item for regeneration
 *   status
 */

type Kind = 'music' | 'stickers';

interface Attempt {
  jobId: string;
  submittedAt: string;
  status: string;
  finishedAt?: string;
  error?: string | null;
  note?: string | null;
  mode?: 'generate' | 'edit';
}

interface ItemState {
  kind: Kind;
  briefId: string;
  status: 'submitted' | 'downloaded' | 'failed' | 'rejected';
  attempts: Attempt[];
  /** Set when AZ Studio said resubmitting the same request cannot help (a refusal, an invalid request). */
  gaveUp?: boolean;
  rejection?: string | null;
  assetId?: string;
  chainId?: string | null;
  turnId?: string | null;
  storagePath?: string;
  mimeType?: string;
  file?: string;
  sha256?: string;
  bytes?: number;
  generatedAt?: string;
  modelId?: string;
  modelName?: string;
  surface?: string | null;
  costUsd?: number | null;
  prompt?: string;
  modelText?: string;
  width?: number | null;
  height?: number | null;
  analysis?: Record<string, unknown> | null;
}

interface State {
  schemaVersion: 1;
  studioProjectId: string;
  items: Record<string, ItemState>;
}

const args = process.argv.slice(2);
const command = args[0] ?? 'status';
function flag(name: string): string | null {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : null;
}

const WORK = path.resolve(flag('work') ?? process.env.MEDIA_LIBRARY_WORK ?? '.work');
const BRIEFS = path.resolve(flag('briefs') ?? process.env.MEDIA_LIBRARY_BRIEFS ?? 'briefs');
/** One state file per kind, so a music run and a sticker run can go side by side without overwriting each other. */
const stateFile = (kind: Kind) => path.join(WORK, `state.${kind}.json`);
/** The AZ Studio project the library's generations are filed under, so the owner can find them there. */
const STUDIO_PROJECT_ID = 'indigen-video-library';
const MAX_ATTEMPTS = 3;
const POLL_MS = 10_000;

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadState(kind: Kind): State {
  const file = stateFile(kind);
  if (!existsSync(file)) return { schemaVersion: 1, studioProjectId: STUDIO_PROJECT_ID, items: {} };
  return JSON.parse(readFileSync(file, 'utf8')) as State;
}

function saveState(kind: Kind, state: State): void {
  mkdirSync(WORK, { recursive: true });
  const file = stateFile(kind);
  const tmp = `${file}.tmp`;
  const body = JSON.stringify(state, null, 2);
  writeFileSync(tmp, body);
  // Windows refuses a rename over a file another process has open for a
  // moment (an antivirus scan of the file just written, an indexer). Losing
  // the job ids here would mean paying for the same jobs again, so try a few
  // times, then write the file in place.
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EPERM' && (e as NodeJS.ErrnoException).code !== 'EBUSY') throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * attempt);
    }
  }
  writeFileSync(file, body);
}

const key = (kind: Kind, id: string) => `${kind}:${id}`;

interface MusicBrief { id: string; title: string; prompt: string; targetSeconds: number }
interface StickerBrief { id: string; label: string; subject: string; text?: string; background?: 'green' | 'magenta' }

function musicBriefs(): { tracks: MusicBrief[]; suffix: string } {
  const raw = JSON.parse(readFileSync(path.join(BRIEFS, 'music.json'), 'utf8'));
  return { tracks: raw.tracks, suffix: raw.shared.suffix };
}

function stickerBriefs(): { stickers: StickerBrief[]; style: string; backgrounds: Record<string, string>; textRule: string; noTextRule: string } {
  return JSON.parse(readFileSync(path.join(BRIEFS, 'stickers.json'), 'utf8'));
}

/** The whole prompt a sticker is generated from: the shared style, the subject, the lettering rule, the background. */
function stickerPrompt(b: StickerBrief, set: ReturnType<typeof stickerBriefs>, note: string | null): string {
  return [
    set.style,
    `Subject: ${b.subject}.`,
    b.text ? `${set.textRule} The only lettering is: "${b.text}".` : set.noTextRule,
    set.backgrounds[b.background ?? 'green'],
    note ? `Note: ${note}` : '',
  ].filter(Boolean).join('\n');
}

function musicPrompt(b: MusicBrief, suffix: string, note: string | null): string {
  return [b.prompt, suffix, note ? `Note: ${note}` : ''].filter(Boolean).join('\n');
}

async function studioOwner(): Promise<{ uid: string; email: string }> {
  const snap = await col.users().limit(2).get();
  if (snap.size !== 1) throw new Error(`Expected exactly one AZ Studio owner, found ${snap.size}.`);
  const d = snap.docs[0]!;
  return { uid: d.id, email: String(d.get('email') ?? '').toLowerCase() };
}

async function ensureStudioProject(uid: string): Promise<string> {
  const ref = col.projects().doc(STUDIO_PROJECT_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      ownerUid: uid,
      title: 'Indigen World · Video editor library',
      type: 'music_video',
      status: 'active',
      description: 'Background music and stickers generated for the Indigen World (TribeStudio) video editor. Files are verified and published into the Indigen project by tools/media-library/publish.mjs.',
      format: { aspectRatio: '16:9', fps: 24 },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    log(`created AZ Studio project ${STUDIO_PROJECT_ID}`);
  } else if (snap.get('ownerUid') !== uid) {
    throw new Error(`AZ Studio project ${STUDIO_PROJECT_ID} belongs to someone else.`);
  }
  return STUDIO_PROJECT_ID;
}

/** Submits jobs exactly as the callable does, confirming exactly the estimated cost. */
async function submit(uid: string, requests: unknown[], label: string): Promise<{ jobIds: string[]; usd: number }> {
  const parsed = requests.map((r) => jobRequestSchema.parse(r));
  const prepared = await prepareAll(uid, parsed);
  const total = sumEstimates(prepared.map((p) => p.estimate), PRICING).usd;
  const res = await createJobs(uid, parsed, { confirmedUsd: total, batchLabel: label }, prepared);
  return { jobIds: res.jobIds, usd: total };
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Measures a downloaded track with AZ Studio's own DSP (tempo, key, energy, peaks) and FFmpeg (loudness, silence). */
async function analyseMusic(file: string): Promise<Record<string, unknown>> {
  const rate = 22050;
  const samples = await decodeMono(file, rate);
  const a = analyzeMusic(samples, rate);
  const loud = await loudnessStats(file);
  const silences = await silentSpans(file, -45, 1.5);
  const peaks = computePeaks(samples, 160);
  const bins = 24;
  const energyProfile: number[] = [];
  for (let b = 0; b < bins; b++) {
    const s = Math.floor((b * a.energy.length) / bins);
    const e = Math.max(s + 1, Math.floor(((b + 1) * a.energy.length) / bins));
    const slice = a.energy.slice(s, e);
    energyProfile.push(Math.round((slice.reduce((x, y) => x + y, 0) / Math.max(1, slice.length)) * 1000) / 1000);
  }
  const energyMean = a.energy.length ? a.energy.reduce((x, y) => x + y, 0) / a.energy.length : 0;
  return {
    method: 'az-studio-dsp',
    durationSec: Math.round(a.durationSec * 100) / 100,
    bpm: Math.round(a.bpm),
    key: a.key,
    keyConfidence: Math.round(a.keyConfidence * 100) / 100,
    sections: a.sections.map((s) => ({ start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10, label: s.label })),
    energyMean: Math.round(energyMean * 1000) / 1000,
    energyProfile,
    peaks: peaks.max.map((v, i) => Math.round(Math.max(Math.abs(v), Math.abs(peaks.min[i] ?? 0)) * 1000) / 1000),
    integratedLufs: loud.integratedLufs,
    truePeakDb: loud.truePeakDb,
    loudnessRange: loud.lra,
    silences,
  };
}

async function collect(state: State, item: ItemState, job: Record<string, any>): Promise<void> {
  const assetId = (job.result?.assetIds ?? [])[0] as string | undefined;
  if (!assetId) throw new Error(`job ${job.id} completed without an asset`);
  const asset = (await col.assets().doc(assetId).get()).data() ?? {};
  const mimeType = String(asset.mimeType ?? (item.kind === 'music' ? 'audio/mpeg' : 'image/png'));
  const dir = path.join(WORK, item.kind === 'music' ? 'music' : 'stickers/raw');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${item.briefId}.${EXT[mimeType] ?? 'bin'}`);
  await bucket.file(String(asset.storagePath)).download({ destination: file });
  item.assetId = assetId;
  item.storagePath = String(asset.storagePath);
  item.mimeType = mimeType;
  item.file = path.relative(WORK, file).replace(/\\/g, '/');
  item.bytes = statSync(file).size;
  item.sha256 = sha256(file);
  item.modelId = String(job.modelId ?? '');
  item.modelName = item.kind === 'music' ? MODEL_REGISTRY.music.displayName : MODEL_REGISTRY.image.displayName;
  item.generatedAt = (job.updatedAt?.toDate?.() ?? new Date()).toISOString();
  item.costUsd = typeof job.usageUsd === 'number' ? job.usageUsd : (job.estimate?.usd ?? null);
  item.prompt = String(job.params?.prompt ?? '');
  item.modelText = String(job.result?.text ?? '').slice(0, 2000);
  item.width = typeof asset.width === 'number' ? asset.width : null;
  item.height = typeof asset.height === 'number' ? asset.height : null;
  item.chainId = job.target?.kind === 'chain' ? job.target.id : null;
  item.turnId = job.target?.kind === 'chain' ? job.target.sub ?? null : null;
  if (item.kind === 'music') {
    item.surface = 'developer-api';
    item.analysis = await analyseMusic(file);
  }
  item.status = 'downloaded';
}

async function runKind(kind: Kind): Promise<void> {
  const owner = await studioOwner();
  const projectId = await ensureStudioProject(owner.uid);
  const state = loadState(kind);
  const only = flag('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
  const max = Number(flag('max') ?? Infinity);
  const inFlight = Math.max(1, Number(flag('in-flight') ?? 5));
  const note = flag('note');

  const music = kind === 'music' ? musicBriefs() : null;
  const stickers = kind === 'stickers' ? stickerBriefs() : null;
  const briefs: { id: string; title: string; request: Record<string, unknown> }[] = kind === 'music'
    ? music!.tracks.map((b) => ({
        id: b.id,
        title: b.title,
        request: { type: 'music.generate', projectId, purpose: 'song', prompt: musicPrompt(b, music!.suffix, note), instrumental: true, title: b.title, label: `Indigen library · ${b.title}` },
      }))
    : stickers!.stickers.map((b) => ({
        id: b.id,
        title: b.label,
        request: { type: 'image.generate', projectId, prompt: stickerPrompt(b, stickers!, note), purpose: 'free', aspectRatio: '1:1', imageSize: '1K', applyStyleBible: false, collections: ['indigen-sticker-library'], title: `Sticker · ${b.label}`, label: `Indigen sticker · ${b.label}` },
      }));

  const wanted = briefs.filter((b) => !only || only.includes(b.id));
  // A job AZ Studio finished whose download or analysis failed here is
  // collected again, not submitted again: the music is already paid for.
  for (const b of wanted) {
    const s = state.items[key(kind, b.id)];
    if (s?.status === 'failed' && s.attempts.at(-1)?.status === 'completed') {
      s.status = 'submitted';
      log(`${kind} ${b.id}: its job finished in AZ Studio; collecting it again`);
    }
  }
  const needsJob = (b: { id: string }) => {
    const s = state.items[key(kind, b.id)];
    if (!s) return true;
    if (s.status === 'rejected') return true;
    if (s.status === 'failed') return !s.gaveUp && s.attempts.length < MAX_ATTEMPTS;
    return false;
  };
  let queue = wanted.filter(needsJob).slice(0, Number.isFinite(max) ? max : undefined);
  log(`${kind}: ${wanted.length} briefs, ${queue.length} to submit, ${wanted.filter((b) => state.items[key(kind, b.id)]?.status === 'submitted').length} in flight from an earlier run`);

  let spent = 0;
  for (;;) {
    // 1. Poll everything submitted.
    const active = wanted.map((b) => state.items[key(kind, b.id)]).filter((s): s is ItemState => s?.status === 'submitted');
    for (const item of active) {
      const attempt = item.attempts[item.attempts.length - 1]!;
      const snap = await col.jobs().doc(attempt.jobId).get();
      const job = { id: snap.id, ...(snap.data() ?? {}) } as Record<string, any>;
      if (!snap.exists) {
        attempt.status = 'missing';
        item.status = 'failed';
        attempt.error = 'The AZ Studio job document is missing.';
      } else if (isTerminal(job.status)) {
        attempt.status = job.status;
        attempt.finishedAt = new Date().toISOString();
        if (job.status === 'completed') {
          try {
            await collect(state, item, job);
            log(`✓ ${kind} ${item.briefId} — ${item.analysis ? `${(item.analysis as any).durationSec}s, ${(item.analysis as any).bpm} BPM` : `${item.width}×${item.height}`}`);
          } catch (e) {
            item.status = 'failed';
            attempt.error = `download/analysis failed: ${String((e as Error).message).slice(0, 300)}`;
            log(`✗ ${kind} ${item.briefId} — ${attempt.error}`);
          }
        } else {
          item.status = 'failed';
          attempt.error = `${job.error?.code ?? job.status}: ${String(job.error?.message ?? job.stage ?? '').slice(0, 400)}`;
          log(`✗ ${kind} ${item.briefId} — ${attempt.error}`);
          // Refusals and invalid requests will not improve by resubmitting the same prompt.
          if (job.error && job.error.retryable === false) item.gaveUp = true;
          else if (item.attempts.length < MAX_ATTEMPTS) queue.push(wanted.find((b) => b.id === item.briefId)!);
        }
      }
      saveState(kind, state);
    }

    // 2. Submit into free slots.
    const running = wanted.filter((b) => state.items[key(kind, b.id)]?.status === 'submitted').length;
    const slots = Math.max(0, inFlight - running);
    if (slots > 0 && queue.length > 0) {
      const next = queue.slice(0, slots);
      queue = queue.slice(slots);
      const { jobIds, usd } = await submit(owner.uid, next.map((b) => b.request), `Indigen library · ${kind} · ${next.map((b) => b.id).join(', ')}`.slice(0, 150));
      spent += usd;
      next.forEach((b, i) => {
        const prev = state.items[key(kind, b.id)];
        state.items[key(kind, b.id)] = {
          ...(prev ?? {}),
          kind,
          briefId: b.id,
          status: 'submitted',
          gaveUp: false,
          rejection: prev?.status === 'rejected' ? prev.rejection : null,
          attempts: [...(prev?.attempts ?? []), { jobId: jobIds[i]!, submittedAt: new Date().toISOString(), status: 'queued', note, mode: 'generate' }],
        };
        log(`→ ${kind} ${b.id} submitted as ${jobIds[i]}`);
      });
      saveState(kind, state);
    }

    const stillRunning = wanted.filter((b) => state.items[key(kind, b.id)]?.status === 'submitted').length;
    if (stillRunning === 0 && queue.length === 0) break;
    await sleep(POLL_MS);
  }
  const done = wanted.filter((b) => state.items[key(kind, b.id)]?.status === 'downloaded').length;
  log(`${kind}: ${done}/${wanted.length} downloaded; estimated spend this run $${spent.toFixed(2)}`);
}

/** A conversational fix of a finished sticker: the next turn of its image chain, with the previous image as the source. */
async function runEdit(stickerId: string, instruction: string): Promise<void> {
  const kind: Kind = 'stickers';
  const owner = await studioOwner();
  const state = loadState(kind);
  const item = state.items[key(kind, stickerId)];
  if (!item?.assetId || !item.chainId || !item.turnId) throw new Error(`Sticker ${stickerId} has no finished image to edit.`);
  const set = stickerBriefs();
  const brief = set.stickers.find((b) => b.id === stickerId)!;
  const request = {
    type: 'image.generate',
    projectId: state.studioProjectId,
    prompt: `${instruction}\nKeep the same subject, style and composition. ${set.backgrounds[brief.background ?? 'green']}`,
    purpose: 'free',
    aspectRatio: '1:1',
    imageSize: '1K',
    applyStyleBible: false,
    chainId: item.chainId,
    parentTurnId: item.turnId,
    collections: ['indigen-sticker-library'],
    title: `Sticker · ${brief.label} (edit)`,
    label: `Indigen sticker edit · ${brief.label}`,
  };
  const { jobIds } = await submit(owner.uid, [request], `Indigen sticker edit · ${stickerId}`);
  item.status = 'submitted';
  item.attempts.push({ jobId: jobIds[0]!, submittedAt: new Date().toISOString(), status: 'queued', note: instruction, mode: 'edit' });
  saveState(kind, state);
  log(`→ edit ${stickerId} submitted as ${jobIds[0]}`);
  for (;;) {
    await sleep(POLL_MS);
    const snap = await col.jobs().doc(jobIds[0]!).get();
    const job = { id: snap.id, ...(snap.data() ?? {}) } as Record<string, any>;
    if (!isTerminal(job.status)) continue;
    const attempt = item.attempts[item.attempts.length - 1]!;
    attempt.status = job.status;
    attempt.finishedAt = new Date().toISOString();
    if (job.status === 'completed') {
      await collect(state, item, job);
      log(`✓ edit ${stickerId}`);
    } else {
      item.status = 'failed';
      attempt.error = `${job.error?.code ?? job.status}: ${String(job.error?.message ?? '').slice(0, 300)}`;
      log(`✗ edit ${stickerId} — ${attempt.error}`);
    }
    saveState(kind, state);
    return;
  }
}

function runReject(kind: Kind, id: string, reason: string): void {
  const state = loadState(kind);
  const item = state.items[key(kind, id)];
  if (!item) throw new Error(`${kind} ${id} has not been generated.`);
  item.status = 'rejected';
  item.rejection = reason;
  saveState(kind, state);
  log(`${kind} ${id} marked for regeneration: ${reason}`);
}

function runStatus(): void {
  const counts: Record<string, number> = {};
  for (const kind of ['music', 'stickers'] as Kind[]) {
    for (const item of Object.values(loadState(kind).items)) counts[`${kind}/${item.status}`] = (counts[`${kind}/${item.status}`] ?? 0) + 1;
  }
  console.log(JSON.stringify(counts, null, 2));
}

async function main(): Promise<void> {
  if (command === 'music' || command === 'stickers') await runKind(command);
  else if (command === 'edit') await runEdit(args[1]!, args[2]!);
  else if (command === 'reject') runReject(args[1] as Kind, args[2]!, args[3] ?? 'rejected in review');
  else runStatus();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
