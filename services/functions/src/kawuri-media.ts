import {
  getFirestore,
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { roleSatisfies } from './auth.js';
import { googleProjectId } from './google-api-auth.js';
import { DAY_MS, RATE_LIMIT_PER_MINUTE } from './kawuri.js';
import { dictionaryContextFor, looksLikeTranslationRequest } from './kawuri-dictionary.js';
import {
  ANALYSIS_SCHEMA,
  INLINE_MEDIA_MAX_BYTES,
  IN_FLIGHT_TASK_STATUSES,
  MAX_ANALYSIS_TURNS,
  MEDIA_LIMITS,
  MIN_POLL_INTERVAL_MS,
  TRANSCRIPTION_INSTRUCTION,
  TRANSCRIPT_SCHEMA,
  actionsForTask,
  analysisInstruction,
  analysisTypeFor,
  audioSecondsFromUsage,
  buildCapabilities,
  checkStoredMedia,
  creationPath,
  creationPrefix,
  extensionForMime,
  imageDimensions,
  isOwnCreationPath,
  isTerminalTaskStatus,
  kawuriError,
  mediaDurationSeconds,
  newTaskRecord,
  parseAnalysisRequest,
  parseImageGenerationRequest,
  parseTranscriptionRequest,
  parseVideoGenerationRequest,
  publicMessageFor,
  publicTask,
  readKawuriMediaConfig,
  reasonOf,
  scanMp4Duration,
  staleOutcome,
  taskIdFor,
  validateAnalysis,
  validateTranscript,
  videoCostCents,
  videoDimensions,
  videoModelSupports,
  type AnalysisIntention,
  type CapabilityName,
  type KawuriCapabilities,
  type KawuriErrorCode,
  type KawuriMediaConfig,
  type KawuriTaskType,
  type MediaKind,
  type MediaReference,
} from './kawuri-media-policy.js';
import {
  generateImage,
  generateStructured,
  mediaPart,
  pollVideo,
  screenGenerationRequest,
  startVideo,
  unhealthyModels,
  type MediaInput,
  type StructuredTurn,
} from './kawuri-vertex.js';
import { ACCOUNT_CHANNEL_ID, pushToUser } from './push.js';
import { consumeRateLimit } from './rate-limit.js';
import { VIDEO_SPEND_LIMITS } from './studio-video-policy.js';
import { benefitsForUid } from './subscriptions.js';

/**
 * Kawuri's media tools, as Firebase callables and one recovery sweep.
 *
 * Every Vertex call in this file happens here, on the server, as the function's
 * runtime service account. The app authenticates with Firebase Auth, the
 * callable framework verifies the ID token before any of this runs, and every
 * handler reads the member's uid from that verified token — never from the
 * request body.
 *
 * Tasks live in `kawuriTasks/{uid}_{requestId}`. The request id is the
 * idempotency key: a retried or double-tapped request reads the existing task
 * instead of paying for another generation.
 */

const REGION = 'us-central1';
const TASKS = 'kawuriTasks';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
const SIGNED_URL_TTL_MS = 30 * 60_000;
const ADVANCE_LEASE_MS = 6 * 60_000;
const MAX_IMPORT_ATTEMPTS = 3;
const MAX_OUTPUT_VIDEO_BYTES = 200 * 1024 * 1024;
const SWEEP_BATCH_SIZE = 40;
const SWEEP_RUN_BUDGET_MS = 420_000;
const TRANSCRIPT_RETENTION_MS = DAY_MS;

const READ_OPTIONS = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  invoker: 'public' as const,
  timeoutSeconds: 60,
};

/**
 * Billable requests also consume their App Check token when enforcement is on,
 * so a captured token cannot be replayed to buy generations. The app sends a
 * limited-use token on exactly these calls.
 */
const BILLABLE_OPTIONS = {
  ...READ_OPTIONS,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
};

function nowIso(): string {
  return new Date().toISOString();
}

function config(): KawuriMediaConfig {
  return readKawuriMediaConfig(process.env, googleProjectId());
}

function bucketFor(cfg: KawuriMediaConfig) {
  return cfg.outputBucket ? getStorage().bucket(cfg.outputBucket) : getStorage().bucket();
}

function requireMember(req: CallableRequest<unknown>): string {
  const uid = req.auth?.uid;
  if (!uid) throw kawuriError('UNAUTHENTICATED');
  return uid;
}

function dataOf(req: CallableRequest<unknown>): Record<string, unknown> {
  return req.data && typeof req.data === 'object' && !Array.isArray(req.data)
    ? req.data as Record<string, unknown>
    : {};
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

async function capabilitiesFor(
  req: CallableRequest<unknown>,
  cfg: KawuriMediaConfig,
): Promise<KawuriCapabilities> {
  const uid = req.auth?.uid;
  // Guests have no plan to read; reading one would only cost a round trip.
  const benefits = uid ? await benefitsForUid(uid) : null;
  const approvedCreator = roleSatisfies(req.auth?.token.role, 'creator');
  return buildCapabilities({
    config: cfg,
    signedIn: Boolean(uid),
    videoEligible: approvedCreator || benefits?.creatorTools === true,
    videoPlanModelAllowed: benefits?.creatorTools === true,
    unhealthy: unhealthyModels(),
  });
}

function requireCapability(caps: KawuriCapabilities, name: CapabilityName): void {
  if (caps[name]) return;
  const reason = caps.unavailableReasons[name];
  if (reason === 'sign_in_required') throw kawuriError('UNAUTHENTICATED');
  if (reason === 'not_eligible') throw kawuriError('NOT_ELIGIBLE');
  if (reason === 'model_unavailable') throw kawuriError('MODEL_UNAVAILABLE');
  throw kawuriError('CAPABILITY_UNAVAILABLE');
}

export const getKawuriCapabilities = onCall(READ_OPTIONS, async (req) => {
  // Open to guests on purpose: Kawuri's home screen works signed out, and a
  // guest is told which tools need an account rather than shown none at all.
  return capabilitiesFor(req, config());
});

// ---------------------------------------------------------------------------
// Allowance
// ---------------------------------------------------------------------------

/**
 * One Kawuri request against the member's existing allowance: the shared
 * per-minute limit and the daily allowance their plan buys. Charged before the
 * model call, as `kawuriChat` does, because a limit that only counts successes
 * can be walked past by failing.
 */
async function chargeKawuriAllowance(uid: string): Promise<void> {
  try {
    await consumeRateLimit('kawuriChat', uid, RATE_LIMIT_PER_MINUTE);
  } catch {
    throw kawuriError('RATE_LIMITED');
  }
  const benefits = await benefitsForUid(uid);
  try {
    await consumeRateLimit('kawuriChatDaily', uid, benefits.kawuriDailyMessages, DAY_MS);
  } catch {
    throw kawuriError('ALLOWANCE_EXHAUSTED');
  }
}

/**
 * One video against the shared AI-video ceilings — the same buckets and
 * numbers the Studio spends from, so a person's video allowance is one
 * allowance on every surface.
 */
async function chargeVideoSpend(uid: string, cents: number): Promise<void> {
  try {
    await Promise.all([
      consumeRateLimit('studioVideoCreateBurst', uid, VIDEO_SPEND_LIMITS.burstPerTenMinutes, 10 * 60_000),
      consumeRateLimit('studioVideoCreateDaily', uid, VIDEO_SPEND_LIMITS.jobsPerDay, DAY_MS),
      consumeRateLimit(
        'studioVideoCreateGlobalDaily',
        'all-creators',
        VIDEO_SPEND_LIMITS.globalJobsPerDay,
        DAY_MS,
      ),
      consumeRateLimit(
        'studioVideoSpendDaily',
        uid,
        VIDEO_SPEND_LIMITS.creatorDailySpendCents,
        DAY_MS,
        cents,
      ),
      consumeRateLimit(
        'studioVideoSpendGlobalDaily',
        'all-creators',
        VIDEO_SPEND_LIMITS.platformDailySpendCents,
        DAY_MS,
        cents,
      ),
    ]);
  } catch {
    throw kawuriError('ALLOWANCE_EXHAUSTED', 'You have reached your video allowance for today. It resets within 24 hours.');
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** An unbilled task left in flight this long is taken to have died. */
const ABANDONED_CLAIM_MS = 3 * 60_000;

/**
 * Whether a task with this id may run again: it never reached Vertex, and it
 * either failed or was abandoned mid-request.
 *
 * An unbilled task that is still fresh is NOT retryable — it is the first tap
 * of a double tap, still on its way to Vertex, and running it again is exactly
 * the second bill the request id exists to prevent.
 */
function unbilledAndRetryable(data: Record<string, unknown>, now = Date.now()): boolean {
  if (data.billed === true || data.operationName) return false;
  if (data.status === 'failed') return true;
  if (!(IN_FLIGHT_TASK_STATUSES as readonly unknown[]).includes(data.status)) return false;
  const touched = Date.parse(String(data.updatedAt ?? ''));
  return Number.isFinite(touched) && now - touched > ABANDONED_CLAIM_MS;
}

/**
 * Creates the task, or takes over one that may run again, atomically.
 *
 * `claimed` is true for exactly one caller per request id at a time: the one
 * that goes on to spend the allowance and call Vertex. Everybody else gets the
 * task as it stands.
 */
async function claimTask(
  ref: DocumentReference,
  record: Record<string, unknown>,
  uid: string,
): Promise<{ claimed: boolean; data: Record<string, unknown> }> {
  return getFirestore().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) {
      tx.create(ref, record);
      return { claimed: true, data: record };
    }
    const data = existing.data() as Record<string, unknown>;
    if (data.userId !== uid) throw kawuriError('PERMISSION_DENIED');
    if (!unbilledAndRetryable(data)) return { claimed: false, data };
    const now = nowIso();
    const patch = {
      status: record.status,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      updatedAt: now,
    };
    tx.update(ref, patch);
    return { claimed: true, data: { ...data, ...patch } };
  });
}

/**
 * Writes a task's next state, refusing to move a task that has already ended.
 *
 * A cancel, a timeout from the sweep and a slow generation can all land on the
 * same task; whichever reaches a terminal state first wins, and a late writer
 * finds out through the `false` it gets back.
 */
async function commitTask(
  ref: DocumentReference,
  patch: Record<string, unknown>,
): Promise<boolean> {
  return getFirestore().runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists || isTerminalTaskStatus(current.get('status'))) return false;
    tx.update(ref, { ...patch, updatedAt: nowIso() });
    return true;
  });
}

async function failTask(
  ref: DocumentReference,
  code: KawuriErrorCode,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const rejected = code === 'SAFETY_REJECTED';
  return commitTask(ref, {
    status: rejected ? 'rejected' : 'failed',
    errorCode: code,
    errorMessage: publicMessageFor(code),
    moderationStatus: rejected ? 'blocked' : 'not_applicable',
    progress: null,
    advanceLeaseUntil: null,
    completedAt: nowIso(),
    ...extra,
  });
}

/**
 * Records a billable attempt before the provider is called.
 *
 * In `auditLogs`, which outlives the task: a member deleting a creation must
 * not delete the record that it was paid for.
 */
async function recordBillableAttempt(
  ref: DocumentReference,
  uid: string,
  type: KawuriTaskType,
  model: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const db = getFirestore();
  const audit = db.collection('auditLogs').doc();
  const occurredAt = nowIso();
  const batch = db.batch();
  batch.create(audit, {
    id: audit.id,
    actor: { collection: 'users', id: uid, role: 'member' },
    action: `kawuri.${type}`,
    target: { collection: TASKS, id: ref.id },
    before: null,
    after: { type, model, provider: 'vertex', ...extra },
    occurredAt,
  });
  batch.update(ref, {
    billed: true,
    billableAttempts: FieldValue.increment(1),
    updatedAt: occurredAt,
  });
  await batch.commit();
}

/** The task as the app sees it, with short-lived links to any finished media. */
async function presentTask(
  cfg: KawuriMediaConfig,
  data: Record<string, unknown>,
  withDownload = true,
) {
  const task = publicTask(data);
  const uid = String(data.userId ?? '');
  const outputs = Array.isArray(data.outputMedia) ? data.outputMedia as MediaReference[] : [];
  const expires = Date.now() + SIGNED_URL_TTL_MS;
  const outputMedia = await Promise.all(outputs.map(async (media, index) => {
    if (task.status !== 'ready' || !isOwnCreationPath(String(media.storagePath), uid)) return media;
    const file = bucketFor(cfg).file(media.storagePath);
    try {
      const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires });
      let downloadUrl: string | null = null;
      if (withDownload) {
        const extension = extensionForMime(media.mimeType);
        [downloadUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires,
          responseDisposition: `attachment; filename="kawuri-${String(data.type).split('_')[0]}-${index + 1}.${extension}"`,
        });
      }
      return { ...media, url, downloadUrl, urlExpiresAt: new Date(expires).toISOString() };
    } catch (error) {
      // Signing is an IAM call (signBlob on the runtime service account), not a
      // Storage one. The file is fine; say so in the log where it can be fixed.
      logger.error('Kawuri could not sign a creation URL; check roles/iam.serviceAccountTokenCreator on the runtime service account', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return { ...media, url: null, downloadUrl: null, urlExpiresAt: null };
    }
  }));
  return { ...task, outputMedia, actions: actionsForTask(task) };
}

function ownTaskRef(uid: string, raw: unknown, key = 'taskId'): DocumentReference {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id || id.length > 240 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw kawuriError('INVALID_REQUEST', `${key} is required.`);
  }
  if (!id.startsWith(`${uid}_`)) throw kawuriError('NOT_FOUND');
  return getFirestore().collection(TASKS).doc(id);
}

async function readOwnTask(uid: string, raw: unknown, key = 'taskId'): Promise<DocumentSnapshot> {
  const ref = ownTaskRef(uid, raw, key);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw kawuriError('NOT_FOUND');
  if (snapshot.get('userId') !== uid) throw kawuriError('NOT_FOUND');
  return snapshot;
}

// ---------------------------------------------------------------------------
// Media handling
// ---------------------------------------------------------------------------

interface StoredMedia {
  storagePath: string;
  mimeType: string;
  kind: MediaKind;
  sizeBytes: number;
}

/**
 * Reads an upload's real metadata. The object has to exist, be finished, and
 * have the type and size the path's purpose allows — whatever the app said.
 */
async function inspectStoredMedia(
  cfg: KawuriMediaConfig,
  storagePath: string,
  allowedKinds: readonly MediaKind[],
  maxBytes: (kind: MediaKind) => number,
): Promise<StoredMedia> {
  const file = bucketFor(cfg).file(storagePath);
  let metadata: Record<string, unknown>;
  try {
    const [exists] = await file.exists();
    if (!exists) throw kawuriError('UPLOAD_MISSING');
    [metadata] = await file.getMetadata() as unknown as [Record<string, unknown>];
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw kawuriError('STORAGE_FAILED', 'The file could not be read. Try again.');
  }
  const fileName = storagePath.split('/').pop() ?? '';
  const checked = checkStoredMedia({
    contentType: metadata.contentType,
    size: metadata.size,
    fileName,
    allowedKinds,
    maxBytes,
  });
  return { storagePath, ...checked };
}

/** Small media inline, large media by Cloud Storage URI. */
async function mediaInputFor(cfg: KawuriMediaConfig, media: StoredMedia): Promise<MediaInput> {
  const bucket = bucketFor(cfg);
  if (media.sizeBytes <= INLINE_MEDIA_MAX_BYTES) {
    const [buffer] = await bucket.file(media.storagePath).download();
    return { mimeType: media.mimeType, base64: buffer.toString('base64') };
  }
  return { mimeType: media.mimeType, gcsUri: `gs://${bucket.name}/${media.storagePath}` };
}

async function loadReferenceImage(
  cfg: KawuriMediaConfig,
  storagePath: string,
): Promise<{ media: MediaInput; reference: MediaReference }> {
  const stored = await inspectStoredMedia(
    cfg,
    storagePath,
    ['image'],
    () => MEDIA_LIMITS.referenceImageBytes,
  );
  return {
    media: await mediaInputFor(cfg, stored),
    reference: {
      storagePath: stored.storagePath,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    },
  };
}

/**
 * The length of a stored recording or clip, in seconds, or null when the
 * container cannot be read without decoding it.
 */
async function storedDurationSeconds(
  cfg: KawuriMediaConfig,
  media: StoredMedia,
): Promise<number | null> {
  const file = bucketFor(cfg).file(media.storagePath);
  if (media.sizeBytes <= 25 * 1024 * 1024) {
    const [buffer] = await file.download();
    return mediaDurationSeconds(buffer) ?? scanMp4Duration(buffer);
  }
  const headEnd = 2 * 1024 * 1024;
  const tailStart = Math.max(headEnd, media.sizeBytes - 6 * 1024 * 1024);
  const [[head], [tail]] = await Promise.all([
    file.download({ start: 0, end: headEnd - 1 }),
    file.download({ start: tailStart, end: media.sizeBytes - 1 }),
  ]);
  return scanMp4Duration(head, tail);
}

async function deleteQuietly(cfg: KawuriMediaConfig, storagePath: string): Promise<void> {
  await bucketFor(cfg).file(storagePath).delete({ ignoreNotFound: true }).catch(() => {
    // The bucket lifecycle rule removes anything left behind.
  });
}

/**
 * Runs the platform's own screen on a generation request. Returns false after
 * ending the task as rejected, true when generation may go ahead; any other
 * failure of the screen ends the task too, because an unscreened request must
 * not reach a generator.
 */
async function passesScreening(
  cfg: KawuriMediaConfig,
  ref: DocumentReference,
  capability: 'image_generation' | 'video_generation',
  prompt: string,
  negativePrompt: string,
  reference: MediaInput | null,
): Promise<boolean> {
  try {
    await screenGenerationRequest({
      project: cfg.project,
      location: cfg.location,
      models: cfg.analysisModels,
      capability,
      prompt,
      negativePrompt,
      reference,
    });
    await ref.update({ moderationStatus: 'screened', updatedAt: nowIso() });
    return true;
  } catch (error) {
    const code = reasonOf(error) ?? 'GENERATION_FAILED';
    const details = error instanceof HttpsError ? error.details as Record<string, unknown> | undefined : undefined;
    await failTask(ref, code, {
      errorMessage: error instanceof HttpsError ? error.message : publicMessageFor(code),
      ...(typeof details?.category === 'string' ? { moderationCategory: details.category } : {}),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

export const createKawuriImage = onCall(
  { ...BILLABLE_OPTIONS, timeoutSeconds: 180, memory: '1GiB' },
  async (req) => {
    const uid = requireMember(req);
    const cfg = config();
    const caps = await capabilitiesFor(req, cfg);
    requireCapability(caps, 'imageGeneration');
    const input = parseImageGenerationRequest(req.data, uid, caps.imageAspectRatios);

    // Checked before a task exists, so a bad reference never costs anything.
    const reference = input.referenceImagePath
      ? await loadReferenceImage(cfg, input.referenceImagePath)
      : null;

    const taskId = taskIdFor(uid, input.requestId);
    const ref = getFirestore().collection(TASKS).doc(taskId);
    const { claimed, data } = await claimTask(ref, newTaskRecord({
      id: taskId,
      uid,
      type: 'image_generation',
      requestId: input.requestId,
      conversationId: input.conversationId,
      status: 'generating',
      model: cfg.imageModels[0],
      prompt: input.prompt,
      sourceMedia: reference ? [reference.reference] : [],
      aspectRatio: input.aspectRatio,
      sourceTaskId: input.sourceTaskId,
      now: nowIso(),
    }), uid);

    // The same press, retried or double-tapped: hand back the task as it
    // stands. Only a request that never reached Vertex is ever run again.
    if (!claimed) return presentTask(cfg, data);

    try {
      await chargeKawuriAllowance(uid);
    } catch (error) {
      await ref.update({
        status: 'failed',
        errorCode: reasonOf(error) ?? 'RATE_LIMITED',
        errorMessage: error instanceof Error ? error.message : publicMessageFor('RATE_LIMITED'),
        completedAt: nowIso(),
        updatedAt: nowIso(),
      });
      throw error;
    }
    if (!(await passesScreening(cfg, ref, 'image_generation', input.prompt, '', reference?.media ?? null))) {
      return presentTask(cfg, (await ref.get()).data() as Record<string, unknown>);
    }
    await recordBillableAttempt(ref, uid, 'image_generation', cfg.imageModels[0]);

    let generated: Awaited<ReturnType<typeof generateImage>>;
    try {
      generated = await generateImage({
        project: cfg.project,
        location: cfg.location,
        models: cfg.imageModels,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        reference: reference?.media ?? null,
      });
    } catch (error) {
      await failTask(ref, reasonOf(error) ?? 'GENERATION_FAILED');
      return presentTask(cfg, (await ref.get()).data() as Record<string, unknown>);
    }

    const { model, outcome } = generated;
    if (outcome.kind === 'rejected') {
      await failTask(ref, 'SAFETY_REJECTED', { model, safetyReason: outcome.reason });
      return presentTask(cfg, (await ref.get()).data() as Record<string, unknown>);
    }
    if (outcome.kind === 'empty') {
      await failTask(ref, 'GENERATION_FAILED', {
        model,
        errorMessage: 'No image was produced. Try describing it differently.',
      });
      return presentTask(cfg, (await ref.get()).data() as Record<string, unknown>);
    }

    const outputMedia: MediaReference[] = [];
    const saved: string[] = [];
    try {
      // One image per request is what the product offers, and what Gemini's
      // image models return.
      const image = outcome.images[0];
      const bytes = Buffer.from(image.base64, 'base64');
      const storagePath = creationPath(uid, taskId, `image-1.${extensionForMime(image.mimeType)}`);
      await bucketFor(cfg).file(storagePath).save(bytes, {
        resumable: false,
        metadata: {
          contentType: image.mimeType,
          cacheControl: 'private, max-age=3600',
          metadata: { source: 'kawuri', taskId, model, aiGenerated: 'true', provider: 'vertex' },
        },
      });
      saved.push(storagePath);
      const size = imageDimensions(bytes);
      outputMedia.push({
        storagePath,
        mimeType: image.mimeType,
        sizeBytes: bytes.byteLength,
        width: size?.width ?? null,
        height: size?.height ?? null,
        aiGenerated: true,
      });
    } catch (error) {
      logger.error('Kawuri could not save a generated image', {
        taskId,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      await failTask(ref, 'STORAGE_FAILED', { model });
      return presentTask(cfg, (await ref.get()).data() as Record<string, unknown>);
    }

    const committed = await commitTask(ref, {
      status: 'ready',
      model,
      outputMedia,
      moderationStatus: 'passed',
      modelNote: outcome.text || null,
      errorCode: null,
      errorMessage: null,
      completedAt: nowIso(),
    });
    if (!committed) {
      // Cancelled or deleted while Vertex was working. Keeping the file would
      // leave an orphan nobody can see or delete.
      await Promise.all(saved.map((path) => deleteQuietly(cfg, path)));
    }
    const final = await ref.get();
    if (!final.exists) throw kawuriError('NOT_FOUND');
    return presentTask(cfg, final.data() as Record<string, unknown>);
  },
);

// ---------------------------------------------------------------------------
// Video generation
// ---------------------------------------------------------------------------

export const createKawuriVideo = onCall(
  { ...BILLABLE_OPTIONS, timeoutSeconds: 120, memory: '512MiB' },
  async (req) => {
    const uid = requireMember(req);
    const cfg = config();
    const caps = await capabilitiesFor(req, cfg);
    requireCapability(caps, 'videoGeneration');
    const input = parseVideoGenerationRequest(
      req.data,
      uid,
      caps.videoDurations,
      caps.videoResolutions,
    );
    const model = input.quality === 'plan' && caps.videoQualityOptions.includes('plan')
      ? cfg.videoPlanModel
      : cfg.videoModel;
    if (!videoModelSupports(model, input)) {
      throw kawuriError('INVALID_REQUEST', 'That length or resolution is not made at this quality.');
    }
    const cents = videoCostCents(model, input.durationSeconds, input.generateAudio, input.resolution);
    if (cents === null) throw kawuriError('CAPABILITY_UNAVAILABLE');

    const reference = input.referenceImagePath
      ? await loadReferenceImage(cfg, input.referenceImagePath)
      : null;

    const taskId = taskIdFor(uid, input.requestId);
    const ref = getFirestore().collection(TASKS).doc(taskId);
    const record = newTaskRecord({
      id: taskId,
      uid,
      type: 'video_generation',
      requestId: input.requestId,
      conversationId: input.conversationId,
      status: 'queued',
      model,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      sourceMedia: reference ? [reference.reference] : [],
      aspectRatio: input.aspectRatio,
      duration: input.durationSeconds,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      sourceTaskId: input.sourceTaskId,
      now: nowIso(),
    });
    record.estimatedCostCents = cents;
    const { claimed, data } = await claimTask(ref, record, uid);
    // A persisted operation, a recorded billable attempt, or another request
    // still on its way to Vertex: this press already has its video. Hand back
    // that task; never start another.
    if (!claimed) return presentTask(cfg, data, false);

    try {
      // The per-minute Kawuri limit first, so screening cannot be spammed; the
      // screen next, so a refused prompt never spends a video allowance.
      await consumeRateLimit('kawuriChat', uid, RATE_LIMIT_PER_MINUTE).catch(() => {
        throw kawuriError('RATE_LIMITED');
      });
    } catch (error) {
      await ref.update({
        status: 'failed',
        errorCode: 'RATE_LIMITED',
        errorMessage: publicMessageFor('RATE_LIMITED'),
        completedAt: nowIso(),
        updatedAt: nowIso(),
      });
      throw error;
    }
    if (!(await passesScreening(
      cfg,
      ref,
      'video_generation',
      input.prompt,
      input.negativePrompt,
      reference?.media ?? null,
    ))) {
      return presentTask(cfg, (await ref.get()).data() as Record<string, unknown>, false);
    }
    try {
      await chargeVideoSpend(uid, cents);
    } catch (error) {
      await ref.update({
        status: 'failed',
        errorCode: 'ALLOWANCE_EXHAUSTED',
        errorMessage: error instanceof Error ? error.message : publicMessageFor('ALLOWANCE_EXHAUSTED'),
        completedAt: nowIso(),
        updatedAt: nowIso(),
      });
      throw error;
    }
    await recordBillableAttempt(ref, uid, 'video_generation', model, {
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      estimatedCostCents: cents,
    });

    try {
      const started = await startVideo({
        project: cfg.project,
        location: cfg.videoLocation,
        model,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        aspectRatio: input.aspectRatio,
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
        image: reference?.media ?? null,
        generateAudio: input.generateAudio,
      });
      // Persisted the moment Vertex answers. From here on the job belongs to
      // whichever backend instance checks it next, not to this request.
      await commitTask(ref, {
        status: 'generating',
        model: started.model,
        operationName: started.operationName,
        operationStartedAt: nowIso(),
        lastPolledAt: null,
      });
    } catch (error) {
      await failTask(ref, reasonOf(error) ?? 'GENERATION_FAILED');
    }
    return presentTask(cfg, (await ref.get()).data() as Record<string, unknown>, false);
  },
);

/** Takes the exclusive right to advance one video, as the Studio's jobs do. */
async function claimAdvanceLease(ref: DocumentReference): Promise<DocumentSnapshot | null> {
  const now = Date.now();
  return getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || isTerminalTaskStatus(snapshot.get('status'))) return null;
    const lease = Date.parse(String(snapshot.get('advanceLeaseUntil') ?? ''));
    if (Number.isFinite(lease) && lease > now) return null;
    tx.update(ref, { advanceLeaseUntil: new Date(now + ADVANCE_LEASE_MS).toISOString() });
    return snapshot;
  });
}

async function releaseClaim(ref: DocumentReference): Promise<void> {
  await ref.update({ advanceLeaseUntil: null }).catch(() => { /* gone or ended */ });
}

async function notifyVideoOutcome(uid: string, taskId: string, ready: boolean): Promise<void> {
  // Deliberately says nothing about the prompt: this reaches a lock screen.
  await pushToUser(getFirestore(), uid, {
    title: ready ? 'Your Kawuri video is ready' : 'Your Kawuri video could not be made',
    body: ready
      ? 'Tap to watch it, save it or use it in a reel.'
      : 'Nothing was delivered. Tap to see why and try again.',
    channelId: ACCOUNT_CHANNEL_ID,
    data: { type: 'account', route: `/kawuri/creations/${taskId}`, taskId },
    collapseKey: `kawuri_${taskId}`,
    tag: `kawuri_${taskId}`,
  });
}

async function videoBytesFrom(
  outcome: { base64: string | null; uri: string | null },
): Promise<Buffer> {
  if (outcome.base64) return Buffer.from(outcome.base64, 'base64');
  const uri = outcome.uri ?? '';
  if (uri.startsWith('https://')) {
    const response = await fetch(uri, { signal: AbortSignal.timeout(240_000) });
    if (!response.ok) throw new Error(`Video download returned ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_OUTPUT_VIDEO_BYTES) throw new Error('Video too large');
    return Buffer.from(await response.arrayBuffer());
  }
  // A gs:// result only appears when a request asks Vertex to write into a
  // bucket, which this integration never does.
  throw new Error('Vertex returned a video location this backend does not read.');
}

/**
 * One step of a video: a status check, and the import when it has finished.
 * The caller must hold the claim.
 */
async function advanceVideoTask(
  cfg: KawuriMediaConfig,
  ref: DocumentReference,
  snapshot: DocumentSnapshot,
): Promise<void> {
  const uid = String(snapshot.get('userId') ?? '');
  const operationName = String(snapshot.get('operationName') ?? '');
  const outcome = await pollVideo({
    project: cfg.project,
    fallbackLocation: cfg.videoLocation,
    operationName,
    // Which kind of handle `operationName` is: an Omni interaction id or a
    // Veo operation, for a task started before the switch.
    model: String(snapshot.get('model') ?? ''),
  });

  if (outcome.state === 'running') {
    await commitTask(ref, {
      status: 'generating',
      progress: outcome.progress,
      lastPolledAt: nowIso(),
      advanceLeaseUntil: null,
    });
    return;
  }
  if (outcome.state === 'rejected') {
    const ended = await failTask(ref, 'SAFETY_REJECTED', {
      safetyReason: outcome.reasons.join('; ').slice(0, 200) || 'SAFETY',
    });
    if (ended) await notifyVideoOutcome(uid, ref.id, false);
    return;
  }
  if (outcome.state === 'failed') {
    const ended = await failTask(ref, outcome.code, { errorMessage: outcome.message });
    if (ended) await notifyVideoOutcome(uid, ref.id, false);
    return;
  }

  await commitTask(ref, { status: 'processing', progress: null, lastPolledAt: nowIso() });
  const storagePath = creationPath(uid, ref.id, 'video-1.mp4');
  try {
    const bytes = await videoBytesFrom(outcome);
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_OUTPUT_VIDEO_BYTES) {
      throw new Error('Unusable video size');
    }
    await bucketFor(cfg).file(storagePath).save(bytes, {
      resumable: bytes.byteLength > 8 * 1024 * 1024,
      metadata: {
        contentType: 'video/mp4',
        cacheControl: 'private, max-age=3600',
        metadata: {
          source: 'kawuri',
          taskId: ref.id,
          model: String(snapshot.get('model') ?? ''),
          aiGenerated: 'true',
          provider: 'vertex',
        },
      },
    });
    const aspectRatio = snapshot.get('aspectRatio') === '9:16' ? '9:16' : '16:9';
    const size = videoDimensions(aspectRatio, String(snapshot.get('resolution') ?? '720p'));
    const ready = await commitTask(ref, {
      status: 'ready',
      outputMedia: [{
        storagePath,
        mimeType: 'video/mp4',
        sizeBytes: bytes.byteLength,
        width: size.width,
        height: size.height,
        durationSeconds: Number(snapshot.get('duration') ?? 0) || null,
        aiGenerated: true,
      }],
      moderationStatus: 'passed',
      progress: null,
      errorCode: null,
      errorMessage: null,
      advanceLeaseUntil: null,
      completedAt: nowIso(),
    });
    if (ready) {
      await notifyVideoOutcome(uid, ref.id, true);
    } else {
      await deleteQuietly(cfg, storagePath);
    }
  } catch (error) {
    await deleteQuietly(cfg, storagePath);
    logger.error('Kawuri could not import a finished video', {
      taskId: ref.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    await ref.update({
      importAttempts: FieldValue.increment(1),
      advanceLeaseUntil: null,
      updatedAt: nowIso(),
    }).catch(() => { /* read back below */ });
    const after = await ref.get();
    if (Number(after.get('importAttempts') ?? 0) >= MAX_IMPORT_ATTEMPTS) {
      const ended = await failTask(ref, 'STORAGE_FAILED', {
        errorMessage: 'The video was generated but could not be saved, so nothing was delivered.',
      });
      if (ended) await notifyVideoOutcome(uid, ref.id, false);
    }
  }
}

/** Ends an unfinished task that has waited past its limit. */
async function expireIfStale(ref: DocumentReference): Promise<void> {
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  const data = snapshot.data() as Record<string, unknown>;
  const outcome = staleOutcome(data, Date.now());
  if (!outcome) return;
  const ended = await commitTask(ref, {
    status: outcome.status,
    errorCode: outcome.errorCode,
    errorMessage: outcome.errorMessage,
    progress: null,
    advanceLeaseUntil: null,
    completedAt: nowIso(),
  });
  if (ended && data.type === 'video_generation') {
    await notifyVideoOutcome(String(data.userId), ref.id, false);
  }
}

// ---------------------------------------------------------------------------
// Reading, cancelling, listing and deleting
// ---------------------------------------------------------------------------

export const getKawuriTask = onCall(
  { ...READ_OPTIONS, timeoutSeconds: 300, memory: '1GiB' },
  async (req) => {
    const uid = requireMember(req);
    const cfg = config();
    const snapshot = await readOwnTask(uid, dataOf(req).taskId);
    const ref = snapshot.ref;
    const data = snapshot.data() as Record<string, unknown>;

    if (
      data.type === 'video_generation'
      && (IN_FLIGHT_TASK_STATUSES as readonly unknown[]).includes(data.status)
      && typeof data.operationName === 'string' && data.operationName
    ) {
      const lastPolled = Date.parse(String(data.lastPolledAt ?? ''));
      const due = !Number.isFinite(lastPolled) || Date.now() - lastPolled >= MIN_POLL_INTERVAL_MS;
      if (due) {
        const claimed = await claimAdvanceLease(ref);
        if (claimed) {
          try {
            // A status check, not a generation: its own generous limit, and
            // no allowance spent.
            await consumeRateLimit('kawuriTaskRefresh', uid, 120, 10 * 60_000);
            await advanceVideoTask(cfg, ref, claimed);
          } catch (error) {
            await releaseClaim(ref);
            // A failed check leaves the task as it was; the sweep tries again.
            logger.warn('Kawuri task refresh did not complete', {
              code: reasonOf(error) ?? 'unknown',
            });
          }
        }
      }
    }
    await expireIfStale(ref);
    const current = await ref.get();
    if (!current.exists) throw kawuriError('NOT_FOUND');
    return presentTask(cfg, current.data() as Record<string, unknown>);
  },
);

export const cancelKawuriTask = onCall(READ_OPTIONS, async (req) => {
  const uid = requireMember(req);
  const cfg = config();
  const snapshot = await readOwnTask(uid, dataOf(req).taskId);
  const data = snapshot.data() as Record<string, unknown>;
  if (!isTerminalTaskStatus(data.status)) {
    const started = data.type === 'video_generation' && Boolean(data.operationName);
    await commitTask(snapshot.ref, {
      status: 'cancelled',
      errorCode: 'CANCELLED',
      // A generation Vertex has accepted is not stopped from here (Veo offered
      // no way to, and an Omni cancel is not known to stop the bill), so
      // the member is told plainly that the generation may still be counted.
      errorMessage: started
        ? 'Cancelled. The video had already started, so it still counts towards today’s allowance.'
        : 'Cancelled.',
      progress: null,
      advanceLeaseUntil: null,
      completedAt: nowIso(),
    });
  }
  return presentTask(cfg, (await snapshot.ref.get()).data() as Record<string, unknown>, false);
});

const LIST_FILTERS = ['all', 'image', 'video', 'analysis'] as const;

export const listKawuriCreations = onCall(READ_OPTIONS, async (req) => {
  const uid = requireMember(req);
  const cfg = config();
  const data = dataOf(req);
  const filter = (LIST_FILTERS as readonly unknown[]).includes(data.filter)
    ? data.filter as (typeof LIST_FILTERS)[number]
    : 'all';
  const limit = Math.min(30, Math.max(1, Number(data.limit) || 20));

  let query = getFirestore().collection(TASKS).where('userId', '==', uid);
  query = filter === 'all'
    ? query.where('listed', '==', true)
    : query.where('category', '==', filter);
  query = query.orderBy('createdAt', 'desc').limit(limit + 1);
  if (typeof data.cursor === 'string' && data.cursor) {
    const cursor = await readOwnTask(uid, data.cursor, 'cursor');
    query = query.startAfter(cursor);
  }
  const page = await query.get();
  const docs = page.docs.slice(0, limit);
  const tasks = await Promise.all(docs.map((doc) =>
    presentTask(cfg, doc.data() as Record<string, unknown>, false)));
  return {
    tasks,
    nextCursor: page.docs.length > limit ? docs[docs.length - 1].id : null,
  };
});

export const deleteKawuriCreation = onCall(READ_OPTIONS, async (req) => {
  const uid = requireMember(req);
  const cfg = config();
  const snapshot = await readOwnTask(uid, dataOf(req).taskId);
  const ref = snapshot.ref;
  const data = snapshot.data() as Record<string, unknown>;

  // Ended first, so a sweep mid-import commits nothing and removes its own
  // file, then the files, then the record.
  if (!isTerminalTaskStatus(data.status)) {
    await commitTask(ref, { status: 'cancelled', errorCode: 'CANCELLED', completedAt: nowIso() });
  }
  try {
    await bucketFor(cfg).deleteFiles({ prefix: creationPrefix(uid, ref.id) });
  } catch (error) {
    logger.error('Kawuri could not delete a creation’s files', {
      taskId: ref.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    throw kawuriError('STORAGE_FAILED', 'The creation could not be deleted. Try again.');
  }
  const sources = Array.isArray(data.sourceMedia) ? data.sourceMedia as MediaReference[] : [];
  await Promise.all(sources
    .map((media) => String(media.storagePath ?? ''))
    .filter((path) => path.startsWith(`kawuri-uploads/${uid}/`))
    .map((path) => deleteQuietly(cfg, path)));

  const db = getFirestore();
  const audit = db.collection('auditLogs').doc();
  const batch = db.batch();
  batch.delete(ref);
  batch.create(audit, {
    id: audit.id,
    actor: { collection: 'users', id: uid, role: 'member' },
    action: 'kawuri.delete',
    target: { collection: TASKS, id: ref.id },
    before: { type: data.type, status: data.status, model: data.model },
    after: null,
    occurredAt: nowIso(),
  });
  await batch.commit();
  return { deleted: true, taskId: ref.id };
});

// ---------------------------------------------------------------------------
// English speech-to-text
// ---------------------------------------------------------------------------

export const transcribeKawuriAudio = onCall(
  { ...BILLABLE_OPTIONS, timeoutSeconds: 120, memory: '512MiB' },
  async (req) => {
    const uid = requireMember(req);
    const cfg = config();
    const caps = await capabilitiesFor(req, cfg);
    requireCapability(caps, 'speechToText');
    const input = parseTranscriptionRequest(req.data, uid);
    const taskId = taskIdFor(uid, input.requestId);
    const ref = getFirestore().collection(TASKS).doc(taskId);

    const answered = await ref.get();
    if (answered.exists) {
      if (answered.get('userId') !== uid) throw kawuriError('PERMISSION_DENIED');
      if (answered.get('status') === 'ready' && answered.get('result')) {
        return { taskId, ...(answered.get('result') as Record<string, unknown>) };
      }
    }

    let media: StoredMedia;
    let seconds: number | null;
    try {
      media = await inspectStoredMedia(
        cfg,
        input.storagePath,
        ['audio'],
        () => MEDIA_LIMITS.transcriptionBytes,
      );
      seconds = await storedDurationSeconds(cfg, media);
      if (seconds !== null && seconds > MEDIA_LIMITS.transcriptionSeconds + 1) {
        throw kawuriError(
          'INVALID_MEDIA',
          `Voice messages can be up to ${MEDIA_LIMITS.transcriptionSeconds / 60} minutes long.`,
        );
      }
    } catch (error) {
      const code = reasonOf(error);
      if (code === 'INVALID_MEDIA') await deleteQuietly(cfg, input.storagePath);
      throw error;
    }

    const record = newTaskRecord({
      id: taskId,
      uid,
      type: 'speech_to_text',
      requestId: input.requestId,
      conversationId: '',
      status: 'processing',
      model: cfg.transcriptionModels[0],
      sourceMedia: [{ storagePath: media.storagePath, mimeType: media.mimeType, sizeBytes: media.sizeBytes }],
      duration: Math.round(seconds ?? input.declaredDurationSeconds),
      language: 'en',
      now: nowIso(),
    });
    const transcription = await claimTask(ref, record, uid);
    if (!transcription.claimed) {
      const current = transcription.data;
      if (current.status === 'ready' && current.result) {
        return { taskId, ...(current.result as Record<string, unknown>) };
      }
      if (!isTerminalTaskStatus(current.status)) {
        throw kawuriError('RATE_LIMITED', 'That recording is already being transcribed.');
      }
      const code = (current.errorCode as KawuriErrorCode | null) ?? 'GENERATION_FAILED';
      throw kawuriError(code, String(current.errorMessage ?? publicMessageFor(code)));
    }

    try {
      await chargeKawuriAllowance(uid);
      await recordBillableAttempt(ref, uid, 'speech_to_text', cfg.transcriptionModels[0], {
        durationSeconds: record.duration,
      });
      const audio = await mediaInputFor(cfg, media);
      const { model, json, usage } = await generateStructured({
        project: cfg.project,
        location: cfg.location,
        models: cfg.transcriptionModels,
        capability: 'speech_to_text',
        systemInstruction: TRANSCRIPTION_INSTRUCTION,
        contents: [{
          role: 'user',
          parts: [mediaPart(audio), { text: 'Transcribe this voice message.' }],
        }],
        schema: TRANSCRIPT_SCHEMA as unknown as Record<string, unknown>,
        maxOutputTokens: 4_096,
        temperature: 0,
        timeoutMs: 90_000,
      });
      // The container's own header is exact; the model's audio token count
      // runs a little short (leading silence is not counted) but exists for
      // every format, so it is the check for files the header parser cannot
      // read.
      const tokenSeconds = audioSecondsFromUsage(usage);
      if (tokenSeconds !== null && tokenSeconds > MEDIA_LIMITS.transcriptionSeconds + 5) {
        throw kawuriError('INVALID_MEDIA', 'That recording is longer than voice messages allow.');
      }
      const result = validateTranscript(json, seconds ?? tokenSeconds);
      await commitTask(ref, {
        status: 'ready',
        model,
        result,
        duration: result.durationSeconds || record.duration,
        moderationStatus: 'passed',
        completedAt: nowIso(),
        // The transcript went into the member's composer; this copy exists
        // only so a retried request can be answered, and is purged tomorrow.
        purgeAfter: new Date(Date.now() + TRANSCRIPT_RETENTION_MS).toISOString(),
      });
      return { taskId, ...result };
    } catch (error) {
      const code = reasonOf(error) ?? 'GENERATION_FAILED';
      await failTask(ref, code, {
        errorMessage: error instanceof HttpsError ? error.message : publicMessageFor(code),
        purgeAfter: new Date(Date.now() + TRANSCRIPT_RETENTION_MS).toISOString(),
      });
      if (error instanceof HttpsError) throw error;
      throw kawuriError(code);
    } finally {
      // Temporary audio is deleted as soon as the request has an outcome. The
      // app keeps its own copy for a retry; the bucket lifecycle rule is only
      // the backstop.
      await deleteQuietly(cfg, input.storagePath);
    }
  },
);

// ---------------------------------------------------------------------------
// Media analysis
// ---------------------------------------------------------------------------

const INTENTION_LABELS: Record<AnalysisIntention, string> = {
  describe: 'Describe this',
  extract_text: 'Extract visible text',
  transcribe_english: 'Transcribe English speech',
  generate_captions: 'Generate captions',
  summarise: 'Summarise',
  identify_objects: 'Identify objects or activities',
  suggest_metadata: 'Suggest contribution metadata',
  cultural_context: 'Explain possible cultural context',
  suggest_tags: 'Suggest language or topic tags',
  check_quality: 'Check media quality',
};

function askText(intention: AnalysisIntention, question: string): string {
  return question
    ? `${INTENTION_LABELS[intention]}. My question: ${question}`
    : `${INTENTION_LABELS[intention]}.`;
}

export const analyseKawuriMedia = onCall(
  { ...BILLABLE_OPTIONS, timeoutSeconds: 180, memory: '1GiB' },
  async (req) => {
    const uid = requireMember(req);
    const cfg = config();
    const caps = await capabilitiesFor(req, cfg);
    requireCapability(caps, 'mediaAnalysis');
    const input = parseAnalysisRequest(req.data, uid);
    const db = getFirestore();

    let ref: DocumentReference;
    let media: StoredMedia;
    let priorTurns: Record<string, unknown>[] = [];
    let isFollowUp = false;

    if (input.followUpTaskId) {
      isFollowUp = true;
      const snapshot = await readOwnTask(uid, input.followUpTaskId, 'followUpTaskId');
      ref = snapshot.ref;
      const data = snapshot.data() as Record<string, unknown>;
      if (!String(data.type).endsWith('_analysis')) {
        throw kawuriError('INVALID_REQUEST', 'Follow-up questions continue an analysis.');
      }
      const turns = Array.isArray(data.turns) ? data.turns as Record<string, unknown>[] : [];
      if (turns.some((turn) => turn.requestId === input.requestId)) {
        return presentTask(cfg, data, false);
      }
      const source = (Array.isArray(data.sourceMedia) ? data.sourceMedia[0] : null) as MediaReference | null;
      if (!source) throw kawuriError('UPLOAD_MISSING');
      media = await inspectStoredMedia(
        cfg,
        source.storagePath,
        ['image', 'video', 'audio'],
        (kind) => MEDIA_LIMITS.analysisBytes[kind],
      );
      // One question at a time per analysis, taken atomically: `ready` is
      // terminal, so a follow-up reopens the analysis itself, and a second
      // question arriving meanwhile is told to wait rather than racing it.
      priorTurns = await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (current.get('status') !== 'ready') {
          throw kawuriError('RATE_LIMITED', 'Kawuri is still answering the previous question.');
        }
        tx.update(ref, {
          status: 'processing',
          errorCode: null,
          errorMessage: null,
          updatedAt: nowIso(),
        });
        return Array.isArray(current.get('turns')) ? current.get('turns') as Record<string, unknown>[] : [];
      });
    } else {
      const taskId = taskIdFor(uid, input.requestId);
      ref = db.collection(TASKS).doc(taskId);
      const existing = await ref.get();
      if (existing.exists && existing.get('userId') !== uid) throw kawuriError('PERMISSION_DENIED');
      if (existing.exists && existing.get('status') === 'ready') {
        return presentTask(cfg, existing.data() as Record<string, unknown>, false);
      }
      media = await inspectStoredMedia(
        cfg,
        input.storagePath as string,
        ['image', 'video', 'audio'],
        (kind) => MEDIA_LIMITS.analysisBytes[kind],
      );
      if (media.kind !== 'image') {
        const seconds = await storedDurationSeconds(cfg, media);
        const limit = media.kind === 'video'
          ? MEDIA_LIMITS.analysisVideoSeconds
          : MEDIA_LIMITS.analysisAudioSeconds;
        if (seconds !== null && seconds > limit + 1) {
          throw kawuriError('INVALID_MEDIA', `That ${media.kind} is longer than ${limit / 60} minutes.`);
        }
      }
      const analysis = await claimTask(ref, newTaskRecord({
        id: taskId,
        uid,
        type: analysisTypeFor(media.kind),
        requestId: input.requestId,
        conversationId: input.conversationId,
        status: 'processing',
        model: cfg.analysisModels[0],
        prompt: input.question,
        sourceMedia: [{ storagePath: media.storagePath, mimeType: media.mimeType, sizeBytes: media.sizeBytes }],
        intention: input.intention,
        now: nowIso(),
      }), uid);
      if (!analysis.claimed) {
        const current = analysis.data;
        if (current.status === 'ready') return presentTask(cfg, current, false);
        if (!isTerminalTaskStatus(current.status)) {
          throw kawuriError('RATE_LIMITED', 'Kawuri is already analysing that file.');
        }
        const code = (current.errorCode as KawuriErrorCode | null) ?? 'GENERATION_FAILED';
        throw kawuriError(code, String(current.errorMessage ?? publicMessageFor(code)));
      }
    }

    const restoreOrFail = async (error: unknown) => {
      const code = reasonOf(error) ?? 'GENERATION_FAILED';
      if (isFollowUp) {
        // A failed follow-up must not hide the answers the analysis already
        // holds; the error goes back to the conversation instead.
        await ref.update({ status: 'ready', updatedAt: nowIso() }).catch(() => { /* ignore */ });
      } else {
        await failTask(ref, code, {
          errorMessage: error instanceof HttpsError ? error.message : publicMessageFor(code),
        });
      }
      if (error instanceof HttpsError) throw error;
      throw kawuriError(code);
    };

    try {
      await chargeKawuriAllowance(uid);
      await recordBillableAttempt(ref, uid, analysisTypeFor(media.kind), cfg.analysisModels[0], {
        intention: input.intention,
        followUp: isFollowUp,
      });
      const [attachment, dictionaryBlock] = await Promise.all([
        mediaInputFor(cfg, media),
        input.question && looksLikeTranslationRequest(input.question)
          ? dictionaryContextFor(input.question)
          : Promise.resolve(''),
      ]);

      const history = priorTurns.slice(-MAX_ANALYSIS_TURNS);
      const contents: StructuredTurn[] = [];
      history.forEach((turn, index) => {
        const ask = askText(turn.intention as AnalysisIntention, String(turn.question ?? ''));
        contents.push({
          role: 'user',
          parts: index === 0 ? [mediaPart(attachment), { text: ask }] : [{ text: ask }],
        });
        contents.push({ role: 'model', parts: [{ text: JSON.stringify(turn.result ?? {}) }] });
      });
      const ask = askText(input.intention, input.question);
      contents.push({
        role: 'user',
        parts: history.length === 0 ? [mediaPart(attachment), { text: ask }] : [{ text: ask }],
      });

      const { model, json } = await generateStructured({
        project: cfg.project,
        location: cfg.location,
        models: cfg.analysisModels,
        capability: analysisTypeFor(media.kind),
        systemInstruction: analysisInstruction(input.intention, dictionaryBlock),
        contents,
        schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
        maxOutputTokens: 4_096,
        temperature: 0.3,
        timeoutMs: 150_000,
      });
      const result = validateAnalysis(json);
      const turn = {
        requestId: input.requestId,
        intention: input.intention,
        question: input.question,
        result,
        model,
        createdAt: nowIso(),
      };
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        const turns = Array.isArray(current.get('turns'))
          ? current.get('turns') as Record<string, unknown>[]
          : [];
        tx.update(ref, {
          status: 'ready',
          model,
          intention: input.intention,
          prompt: input.question,
          result,
          turns: [...turns, turn].slice(-MAX_ANALYSIS_TURNS),
          moderationStatus: 'passed',
          errorCode: null,
          errorMessage: null,
          completedAt: nowIso(),
          updatedAt: nowIso(),
        });
      });
    } catch (error) {
      await restoreOrFail(error);
    }
    return presentTask(cfg, (await ref.get()).data() as Record<string, unknown>, false);
  },
);

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/**
 * Finishes videos nobody is watching, and ends anything that has waited too
 * long.
 *
 * The phone subscribes to the task document; it never has to be open for a
 * video to complete. Operation names are persisted, so a job started by an
 * instance that has since gone away is resumed here by whichever instance
 * runs next.
 */
export const sweepKawuriTasks = onSchedule(
  {
    region: REGION,
    schedule: 'every 2 minutes',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async () => {
    const cfg = config();
    const db = getFirestore();
    const startedAt = Date.now();

    const inFlight = await db.collection(TASKS)
      .where('status', 'in', [...IN_FLIGHT_TASK_STATUSES])
      .orderBy('createdAt', 'asc')
      .limit(SWEEP_BATCH_SIZE)
      .get();

    for (const snapshot of inFlight.docs) {
      if (Date.now() - startedAt > SWEEP_RUN_BUDGET_MS) break;
      const data = snapshot.data() as Record<string, unknown>;
      if (data.type === 'video_generation' && data.operationName) {
        const claimed = await claimAdvanceLease(snapshot.ref);
        if (claimed) {
          try {
            await advanceVideoTask(cfg, snapshot.ref, claimed);
          } catch (error) {
            await releaseClaim(snapshot.ref);
            logger.warn('Kawuri sweep could not advance a video', {
              taskId: snapshot.id,
              code: reasonOf(error) ?? 'unknown',
            });
          }
        }
      }
      // Only after one more status check, so a video that finished at minute
      // 29 is imported rather than reported as never delivered.
      await expireIfStale(snapshot.ref);
    }

    // Transcripts are kept a day for retries, then removed.
    const purge = await db.collection(TASKS)
      .where('purgeAfter', '<=', nowIso())
      .limit(200)
      .get();
    if (!purge.empty) {
      const batch = db.batch();
      purge.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  },
);
