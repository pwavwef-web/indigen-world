import {
  getFirestore,
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  approvedKasemScriptMatches,
  assertStudioAssetPath,
  estimateStudioVideoCost,
  isCollectableGeminiVideoModel,
  isTerminalStudioVideoStatus,
  parseStudioVideoInput,
  providerStateToJobStatus,
  readStoredProviderTask,
  studioVideoCapabilities,
  VIDEO_SPEND_LIMITS,
  type StudioVideoInput,
} from './studio-video-policy.js';
// Vertex is reached with the function's own credentials -- no API key exists
// for this provider. `google-api-auth` is where this backend keeps "call a
// Google API as ourselves", so Gemini video uses it rather than borrowing the
// token cache that happens to live inside the Kawuri feature.
import {
  CLOUD_PLATFORM_SCOPE,
  googleAccessToken,
  googleProjectId,
} from './google-api-auth.js';
import {
  pollFalLipSync,
  pollGeminiVisual,
  pollRunwayVisual,
  submitFalLipSync,
  submitGeminiVisual,
  submitRunwayVisual,
  type ProviderStatus,
  type ProviderSubmission,
} from './studio-video-providers.js';

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
const MAX_IMPORTED_VIDEO_BYTES = 200 * 1024 * 1024;
const SIGNED_ASSET_TTL_MS = 30 * 60 * 1000;
// Runway and fal finish in minutes. Half an hour means a provider that is
// never going to answer, and the creator deserves to be told so rather than
// left watching a spinner.
const STUCK_JOB_TIMEOUT_MS = 30 * 60 * 1000;
const SWEEP_BATCH_SIZE = 40;
const MAX_IMPORT_ATTEMPTS = 3;
// Leaves headroom inside the sweep's own 540s deadline.
const SWEEP_RUN_BUDGET_MS = 420_000;
// A reference image travels to Vertex inside the request body as base64, so
// the ceiling is the request, not the bucket.
const MAX_VERTEX_IMAGE_BYTES = 7 * 1024 * 1024;
// Runaway guards, not quotas: generous enough that ordinary work never meets
// them, low enough that a mistake or a stolen token cannot run up a bill.
// Shared with Kawuri's video generator, which spends the same allowance.
const CREATOR_DAILY_SPEND_CENTS = VIDEO_SPEND_LIMITS.creatorDailySpendCents;
const PLATFORM_DAILY_SPEND_CENTS = VIDEO_SPEND_LIMITS.platformDailySpendCents;
// Long enough to cover a large import, short enough that a worker killed
// mid-flight does not block the job for long.
const ADVANCE_LEASE_MS = 8 * 60_000;

export const RUNWAYML_API_SECRET = defineSecret('RUNWAYML_API_SECRET');
export const FAL_KEY = defineSecret('FAL_KEY');

const CALLABLE_OPTIONS = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public' as const,
  timeoutSeconds: 120,
  memory: '1GiB' as const,
};

function nowIso(): string {
  return new Date().toISOString();
}

function jobIdFor(uid: string, clientRequestId: string): string {
  return `${uid}_${clientRequestId}`;
}

async function assertValidatedKasemScript(input: StudioVideoInput, uid: string): Promise<void> {
  // Free-authored video scripts intentionally have no submission reference.
  // When a creator does attach one, keep the exact-match provenance check.
  if (!input.kasem.validationRef) return;
  const match = /^submissions\/([^/]+)$/.exec(input.kasem.validationRef);
  if (!match) {
    throw new HttpsError(
      'failed-precondition',
      'validationRef must identify the approved TribeStudio script submission.',
    );
  }
  const snapshot = await getFirestore().collection('submissions').doc(match[1]).get();
  if (
    !snapshot.exists
    || !approvedKasemScriptMatches(
      input.kasem,
      snapshot.data() as Record<string, unknown>,
      uid,
    )
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The Kasem transcript must exactly match an approved submission by this creator.',
    );
  }
}

function publicJob(jobId: string, data: Record<string, unknown>) {
  return {
    id: jobId,
    operation: data.operation,
    provider: data.provider,
    model: data.model,
    status: data.status,
    outputStoragePath: data.outputStoragePath ?? null,
    costEstimate: data.costEstimate,
    failureReason: data.failureReason ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

async function signedReadUrl(
  storagePath: string,
  expectedType: 'image' | 'audio' | 'video',
): Promise<string> {
  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'A source media file was not found.');
  const [metadata] = await file.getMetadata();
  const contentType = String(metadata.contentType ?? '');
  const size = Number(metadata.size ?? 0);
  const sizeLimit = expectedType === 'image'
    ? 20 * 1024 * 1024
    : expectedType === 'audio'
      ? 50 * 1024 * 1024
      : MAX_IMPORTED_VIDEO_BYTES;
  if (!contentType.startsWith(`${expectedType}/`)) {
    throw new HttpsError('failed-precondition', `The selected file is not ${expectedType} media.`);
  }
  if (!Number.isFinite(size) || size <= 0 || size > sizeLimit) {
    throw new HttpsError('failed-precondition', `The selected ${expectedType} file has an unsupported size.`);
  }
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGNED_ASSET_TTL_MS,
  });
  return url;
}

function safeHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpsError('data-loss', 'The provider returned an invalid output URL.');
  }
  const hostname = url.hostname.toLowerCase();
  const privateName = hostname === 'localhost'
    || hostname.endsWith('.local')
    || hostname === '0.0.0.0'
    || hostname === '127.0.0.1'
    || hostname === '::1';
  if (url.protocol !== 'https:' || privateName) {
    throw new HttpsError('data-loss', 'The provider returned an unsafe output URL.');
  }
  return url;
}

/**
 * Streams the finished video from the provider into private Storage.
 *
 * Streamed rather than buffered: `arrayBuffer()` plus the `Buffer.from` copy
 * held ~400MB of a 1GiB instance for a max-size video, and a chunked response
 * carries no content-length, so the pre-flight size check passed and the body
 * was buffered in full before the real limit could reject it. Counting bytes
 * as they pass enforces the ceiling on responses that never declare a size.
 */
function outputPathFor(uid: string, jobId: string): string {
  return `studio-video-jobs/${uid}/${jobId}/output.mp4`;
}

/**
 * Saves a video the provider returned inline.
 *
 * Vertex hands back the encoded video rather than a link, so there is nothing
 * to download — which also means none of the failure modes the streaming
 * importer exists to survive.
 */
async function saveProviderVideoBytes(
  base64: string,
  uid: string,
  jobId: string,
): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength <= 0) {
    throw new HttpsError('data-loss', 'The provider returned an empty video file.');
  }
  if (buffer.byteLength > MAX_IMPORTED_VIDEO_BYTES) {
    throw new HttpsError('resource-exhausted', 'The generated video is too large to import.');
  }
  const storagePath = outputPathFor(uid, jobId);
  await getStorage().bucket().file(storagePath).save(buffer, {
    resumable: false,
    metadata: {
      contentType: 'video/mp4',
      cacheControl: 'private, max-age=3600',
      metadata: { source: 'studio-video-provider', jobId },
    },
  });
  return storagePath;
}

async function importProviderVideo(
  remoteUrl: string,
  uid: string,
  jobId: string,
): Promise<string> {
  const url = safeHttpsUrl(remoteUrl);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(240_000) });
  } catch {
    throw new HttpsError('unavailable', 'The completed provider video could not be downloaded.');
  }
  if (!response.ok) {
    throw new HttpsError('unavailable', `Provider video download returned HTTP ${response.status}.`);
  }
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_IMPORTED_VIDEO_BYTES) {
    throw new HttpsError('resource-exhausted', 'The generated video is too large to import.');
  }
  if (!response.body) {
    throw new HttpsError('unavailable', 'The provider returned an empty video response.');
  }

  const storagePath = outputPathFor(uid, jobId);
  const file = getStorage().bucket().file(storagePath);
  let received = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.byteLength;
      if (received > MAX_IMPORTED_VIDEO_BYTES) {
        callback(new HttpsError('resource-exhausted', 'The generated video is too large to import.'));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      meter,
      file.createWriteStream({
        resumable: true,
        metadata: {
          contentType: 'video/mp4',
          cacheControl: 'private, max-age=3600',
          metadata: { source: 'studio-video-provider', jobId },
        },
      }),
    );
  } catch (error) {
    // A half-written object would read back as a truncated, unplayable video.
    await file.delete({ ignoreNotFound: true }).catch(() => { /* best effort */ });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'The finished video could not be saved.');
  }
  if (received <= 0) {
    await file.delete({ ignoreNotFound: true }).catch(() => { /* best effort */ });
    throw new HttpsError('data-loss', 'The provider returned an empty video file.');
  }
  return storagePath;
}

/**
 * Reads a reference image out of our own bucket as base64.
 *
 * Vertex takes image bytes or a Cloud Storage URI, not an arbitrary signed
 * link, and handing it a URI would mean granting the Vertex service agent read
 * access to the prefix holding creators' unpublished media. Sending the bytes
 * keeps that grant unmade.
 */
async function referenceImageBytes(
  storagePath: string,
): Promise<{ base64: string; mimeType: string }> {
  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'The reference image was not found.');
  const [metadata] = await file.getMetadata();
  const mimeType = String(metadata.contentType ?? '');
  const size = Number(metadata.size ?? 0);
  if (!mimeType.startsWith('image/')) {
    throw new HttpsError('failed-precondition', 'The selected file is not image media.');
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_VERTEX_IMAGE_BYTES) {
    throw new HttpsError(
      'failed-precondition',
      `A reference image for Gemini video must be under ${Math.round(MAX_VERTEX_IMAGE_BYTES / (1024 * 1024))} MB.`,
    );
  }
  const [buffer] = await file.download();
  return { base64: buffer.toString('base64'), mimeType };
}

async function submitToProvider(input: StudioVideoInput): Promise<ProviderSubmission> {
  if (input.operation === 'generate_visual') {
    if (input.provider === 'gemini') {
      const project = googleProjectId();
      if (!project) {
        throw new HttpsError(
          'failed-precondition',
          'Gemini video is not available on this deployment.',
        );
      }
      const reference = input.referenceImageStoragePath
        ? await referenceImageBytes(input.referenceImageStoragePath)
        : null;
      return submitGeminiVisual(input, await googleAccessToken(CLOUD_PLATFORM_SCOPE), project, reference);
    }
    const referenceUrl = input.referenceImageStoragePath
      ? await signedReadUrl(input.referenceImageStoragePath, 'image')
      : null;
    return submitRunwayVisual(input, RUNWAYML_API_SECRET.value(), referenceUrl);
  }
  const [videoUrl, audioUrl] = await Promise.all([
    signedReadUrl(input.videoStoragePath, 'video'),
    signedReadUrl(input.audioStoragePath, 'audio'),
  ]);
  return submitFalLipSync(input, FAL_KEY.value(), videoUrl, audioUrl);
}

async function pollProvider(snapshot: DocumentSnapshot): Promise<ProviderStatus> {
  const provider = snapshot.get('provider');
  // `readStoredProviderTask` reads the same field submission writes. Reading a
  // differently-spelled one is what made every poll throw, so the mapping is
  // pure, shared, and asserted in firebase/tests/studioVideo.test.mjs.
  const task = readStoredProviderTask(snapshot.get('providerTask'));
  if (!task) {
    throw new HttpsError('failed-precondition', 'This job has no provider task yet.');
  }
  if (provider === 'runway') {
    return pollRunwayVisual(task.providerTaskId, RUNWAYML_API_SECRET.value());
  }
  if (provider === 'gemini') {
    const model = snapshot.get('model');
    // Veo is no longer offered, but a job started on it before the switch to
    // Omni is still collected: it was paid for.
    if (!isCollectableGeminiVideoModel(model)) {
      throw new HttpsError('failed-precondition', 'This job names an unknown Gemini model.');
    }
    const project = googleProjectId();
    if (!project) {
      throw new HttpsError('failed-precondition', 'Gemini video is not available here.');
    }
    return pollGeminiVisual(
      task.providerTaskId,
      String(model),
      await googleAccessToken(CLOUD_PLATFORM_SCOPE),
      project,
    );
  }
  if (provider === 'fal') {
    if (!task.statusUrl || !task.responseUrl) {
      throw new HttpsError('failed-precondition', 'This fal job is missing queue URLs.');
    }
    return pollFalLipSync(task.statusUrl, task.responseUrl, FAL_KEY.value());
  }
  throw new HttpsError('failed-precondition', 'This job uses an unknown provider.');
}

export const getStudioVideoCapabilities = onCall(
  CALLABLE_OPTIONS,
  async (req) => {
    requireAuth(req);
    requireRole(req, 'creator');
    return studioVideoCapabilities();
  },
);

/**
 * Creates one idempotent provider task. Retrying the same clientRequestId reads
 * the existing job instead of purchasing another generation.
 */
export const createStudioVideoJob = onCall(
  { ...CALLABLE_OPTIONS, secrets: [RUNWAYML_API_SECRET, FAL_KEY] },
  async (req) => {
    const uid = requireAuth(req);
    const actorRole = requireRole(req, 'creator');
    const input = parseStudioVideoInput(req.data, uid);
    await assertValidatedKasemScript(input, uid);
    const db = getFirestore();
    const jobId = jobIdFor(uid, input.clientRequestId);
    const jobRef = db.collection('studioVideoJobs').doc(jobId);
    const auditRef = db.collection('auditLogs').doc();
    const costEstimate = estimateStudioVideoCost(input);
    const createdAt = nowIso();

    const created = await db.runTransaction(async (tx) => {
      const existing = await tx.get(jobRef);
      if (existing.exists) {
        if (existing.get('ownerUid') !== uid) {
          throw new HttpsError('permission-denied', 'This job belongs to another creator.');
        }
        return false;
      }
      tx.create(jobRef, {
        id: jobId,
        ownerUid: uid,
        operation: input.operation,
        provider: input.provider,
        model: input.model,
        status: 'SUBMITTING',
        input,
        governance: input.governance,
        kasem: input.kasem,
        costEstimate,
        pricingVersion: costEstimate.pricingVersion,
        providerTask: null,
        outputStoragePath: null,
        failureReason: null,
        createdAt,
        updatedAt: createdAt,
        lifecycle: { version: 1 },
      });
      tx.create(auditRef, {
        id: auditRef.id,
        actor: { collection: 'users', id: uid, role: actorRole },
        action: 'studio_video.create',
        target: { collection: 'studioVideoJobs', id: jobId },
        before: null,
        after: {
          operation: input.operation,
          provider: input.provider,
          model: input.model,
          estimatedUsd: costEstimate.amountUsd,
          consentVersion: input.governance.consentVersion,
        },
        occurredAt: createdAt,
      });
      return true;
    });

    if (!created) {
      const existing = await jobRef.get();
      // Retrying the same clientRequestId must not double-charge, which is why
      // an existing job is normally returned as-is. But a job holding no
      // provider handle bought nothing: the call died between committing the
      // document and submitting it. Returning that document stranded the
      // creator on a spinner for a generation that was never requested, and
      // poisoned the request id so no retry could ever submit it either.
      if (readStoredProviderTask(existing.get('providerTask'))) {
        return publicJob(jobId, existing.data() as Record<string, unknown>);
      }
      const existingStatus = String(existing.get('status'));
      if (existingStatus !== 'SUBMITTING' && existingStatus !== 'FAILED') {
        return publicJob(jobId, existing.data() as Record<string, unknown>);
      }
      await jobRef.update({
        status: 'SUBMITTING',
        failureReason: null,
        updatedAt: nowIso(),
        'lifecycle.version': FieldValue.increment(1),
      });
    }

    // Spend controls are server-side: they apply to a new job and to a resubmit
    // of one that never reached a provider, both of which buy a generation.
    //
    // Counted twice over, because counting jobs stopped being enough once the
    // models stopped costing the same. A 10-second Gemini Omni generation is
    // two and a half times a 5-second Runway one, so twenty jobs a day is a
    // bill between $12 and $31 depending only on which model was picked. The
    // cents ceilings below are what actually bound that.
    //
    // These are flat numbers today. When a membership plan covers video, the
    // per-creator ceiling is the number a tier supplies — `benefitsForUid` in
    // `subscriptions.ts` already resolves a creator's tier, and `TIER_BENEFITS`
    // in `subscription-catalog.ts` already carries a `creatorTools` benefit to
    // hang it on. Replacing the constant here is the whole change.
    const spendCents = Math.ceil(costEstimate.amountUsd * 100);
    await Promise.all([
      consumeRateLimit('studioVideoCreateBurst', uid, VIDEO_SPEND_LIMITS.burstPerTenMinutes, 10 * 60_000),
      consumeRateLimit('studioVideoCreateDaily', uid, VIDEO_SPEND_LIMITS.jobsPerDay, 24 * 60 * 60_000),
      consumeRateLimit(
        'studioVideoCreateGlobalDaily',
        'all-creators',
        VIDEO_SPEND_LIMITS.globalJobsPerDay,
        24 * 60 * 60_000,
      ),
      consumeRateLimit(
        'studioVideoSpendDaily',
        uid,
        CREATOR_DAILY_SPEND_CENTS,
        24 * 60 * 60_000,
        spendCents,
        'You have reached your video allowance for today. It resets within 24 hours.',
      ),
      consumeRateLimit(
        'studioVideoSpendGlobalDaily',
        'all-creators',
        PLATFORM_DAILY_SPEND_CENTS,
        24 * 60 * 60_000,
        spendCents,
        'Video making has reached its limit for today across Indigen World. Please try tomorrow.',
      ),
    ]).catch(async (error: unknown) => {
      await jobRef.update({
        status: 'FAILED',
        failureReason: 'Generation allowance reached.',
        updatedAt: nowIso(),
        'lifecycle.version': FieldValue.increment(1),
      });
      throw error;
    });

    try {
      const providerTask = await submitToProvider(input);
      const updatedAt = nowIso();
      await jobRef.update({
        status: providerTask.state === 'running' ? 'RUNNING' : 'QUEUED',
        providerTask,
        updatedAt,
        'lifecycle.version': FieldValue.increment(1),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 240) : 'Provider submission failed.';
      await jobRef.update({
        status: 'FAILED',
        failureReason: reason,
        updatedAt: nowIso(),
        'lifecycle.version': FieldValue.increment(1),
      });
      throw error;
    }

    const submitted = await jobRef.get();
    return publicJob(jobId, submitted.data() as Record<string, unknown>);
  },
);

/**
 * Claims the exclusive right to advance one job.
 *
 * Both the browser-facing refresh and the scheduled sweep advance jobs, and
 * both perform the import inline. Without a claim they run concurrently on the
 * same job and write the same deterministic object path — and since a failed
 * import deletes that object, one writer's cleanup could delete the file
 * another had just finished, leaving a document that says SUCCEEDED and a
 * video that is gone. One claim, one importer.
 *
 * Returns the claimed snapshot, or null when the job is already terminal or
 * another worker holds the lease. A refused claim is not an error: the caller
 * simply reports the document as it stands.
 */
async function claimStudioVideoJob(
  jobRef: DocumentReference,
): Promise<DocumentSnapshot | null> {
  const now = Date.now();
  return getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(jobRef);
    if (!snapshot.exists) return null;
    if (isTerminalStudioVideoStatus(snapshot.get('status'))) return null;
    const lease = Date.parse(String(snapshot.get('advanceLeaseUntil') ?? ''));
    if (Number.isFinite(lease) && lease > now) return null;
    tx.update(jobRef, {
      advanceLeaseUntil: new Date(now + ADVANCE_LEASE_MS).toISOString(),
    });
    return snapshot;
  });
}

/** Writes the outcome of an advance, refusing to walk back a finished job. */
async function commitAdvance(
  jobRef: DocumentReference,
  patch: Record<string, unknown>,
): Promise<void> {
  await getFirestore().runTransaction(async (tx) => {
    const current = await tx.get(jobRef);
    if (!current.exists) return;
    // A slower poll must never overwrite a finished job with the QUEUED it saw
    // before the provider answered, nor null out a video another worker
    // imported. Re-read inside the transaction and let the terminal state win.
    if (isTerminalStudioVideoStatus(current.get('status'))) return;
    const next = { ...patch };
    if (next.outputStoragePath == null) {
      const held = current.get('outputStoragePath');
      if (typeof held === 'string' && held) next.outputStoragePath = held;
    }
    tx.update(jobRef, {
      ...next,
      advanceLeaseUntil: null,
      updatedAt: nowIso(),
      'lifecycle.version': FieldValue.increment(1),
    });
  });
}

/** Releases a claim without changing the job, so the next worker can retry. */
async function releaseClaim(jobRef: DocumentReference): Promise<void> {
  await jobRef.update({ advanceLeaseUntil: null }).catch(() => { /* best effort */ });
}

/**
 * Polls one job's provider, imports a finished video into private Storage, and
 * writes the new status. Shared by the creator-facing refresh callable and by
 * the scheduled sweep, so a job advances on whichever happens first.
 *
 * The caller must already hold this job's claim.
 */
async function advanceStudioVideoJob(
  jobRef: DocumentReference,
  snapshot: DocumentSnapshot,
): Promise<void> {
  const ownerUid = String(snapshot.get('ownerUid') ?? '');
  const jobId = snapshot.id;
  const providerStatus = await pollProvider(snapshot);

  const delivered = providerStatus.outputUrl || providerStatus.outputBase64 || null;
  if (providerStatus.state === 'succeeded' && !delivered) {
    // The provider says it finished but handed back nothing. That is terminal:
    // leaving it RUNNING is the spinner-forever failure.
    await commitAdvance(jobRef, {
      status: 'FAILED',
      failureReason: 'The provider reported success without returning a video.',
    });
    return;
  }

  const status = providerStateToJobStatus(providerStatus.state);
  if (status === 'SUCCEEDED' && delivered) {
    try {
      // Bytes when the provider returned the video itself, a download when it
      // returned a link to one.
      const outputStoragePath = providerStatus.outputBase64
        ? await saveProviderVideoBytes(providerStatus.outputBase64, ownerUid, jobId)
        : await importProviderVideo(providerStatus.outputUrl as string, ownerUid, jobId);
      const completedAt = nowIso();
      await commitAdvance(jobRef, {
        status: 'SUCCEEDED',
        outputStoragePath,
        failureReason: null,
        completedAt,
      });
    } catch (error) {
      // The provider made the video; only the transfer failed. Retry a few
      // times, then fail the job for real. Rethrowing without recording an
      // attempt is what left a finished generation looping on a download the
      // creator only ever saw as a spinner.
      const reason = error instanceof Error
        ? error.message.slice(0, 240)
        : 'The finished video could not be saved.';
      // Incremented by the server so overlapping workers cannot both compute
      // the same next value and burn the allowance twice over.
      await jobRef.update({
        importAttempts: FieldValue.increment(1),
        advanceLeaseUntil: null,
        updatedAt: nowIso(),
      }).catch(() => { /* the ceiling below reads the real value back */ });
      const after = await jobRef.get();
      if (Number(after.get('importAttempts') ?? 0) >= MAX_IMPORT_ATTEMPTS) {
        await commitAdvance(jobRef, {
          status: 'FAILED',
          failureReason: `${reason} The video was generated but could not be saved, so nothing was delivered.`,
        });
        return;
      }
      throw error;
    }
    return;
  }

  await commitAdvance(jobRef, {
    status,
    outputStoragePath: null,
    failureReason: providerStatus.failureReason,
    completedAt: null,
  });
}

/** Polls a provider and imports a successful output into private Firebase Storage. */
export const refreshStudioVideoJob = onCall(
  {
    ...CALLABLE_OPTIONS,
    secrets: [RUNWAYML_API_SECRET, FAL_KEY],
    // Importing a finished video is part of this call. At 120s a large
    // transfer was killed mid-flight, leaving the job non-terminal and the
    // next poll repeating the same doomed download.
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'creator');
    const data = req.data && typeof req.data === 'object'
      ? req.data as Record<string, unknown>
      : {};
    const jobId = typeof data.jobId === 'string' ? data.jobId.trim() : '';
    if (!jobId || jobId.length > 240) {
      throw new HttpsError('invalid-argument', 'jobId is required.');
    }

    const db = getFirestore();
    const jobRef = db.collection('studioVideoJobs').doc(jobId);
    const snapshot = await jobRef.get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'Video job not found.');
    if (snapshot.get('ownerUid') !== uid) {
      throw new HttpsError('permission-denied', 'Only the creator can refresh this job.');
    }
    if (isTerminalStudioVideoStatus(snapshot.get('status'))) {
      return publicJob(jobId, snapshot.data() as Record<string, unknown>);
    }

    // Claimed before any provider work. A browser polling every few seconds
    // while an import runs would otherwise start a fresh import each time, all
    // writing the same object. A refused claim means someone is already on it,
    // so answer with the document as it stands — that is what a poll is for.
    const claimed = await claimStudioVideoJob(jobRef);
    if (!claimed) {
      const current = await jobRef.get();
      return publicJob(jobId, current.data() as Record<string, unknown>);
    }

    // Charged here, not at the top: reopening a finished job, or polling one
    // another worker holds, reads one document and should cost nothing.
    try {
      await consumeRateLimit('studioVideoRefresh', uid, 120, 10 * 60_000);
    } catch (error) {
      await releaseClaim(jobRef);
      throw error;
    }
    try {
      await advanceStudioVideoJob(jobRef, claimed);
    } catch (error) {
      await releaseClaim(jobRef);
      throw error;
    }
    const refreshed = await jobRef.get();
    return publicJob(jobId, refreshed.data() as Record<string, unknown>);
  },
);

/**
 * Hands the owner short-lived URLs for a finished video.
 *
 * The browser used to fetch the object with `getBlob`, which is an XHR and so
 * is subject to bucket CORS: on the deployed origin the request is refused
 * before Storage authorization is ever consulted, and a creator saw "the video
 * is ready, but its preview could not be loaded" for a video that was fine.
 * A signed URL loads in a <video> element and a download link without any CORS
 * involvement, streams instead of buffering 200MB into a tab, and expires —
 * unlike a Storage download token, which is a permanent public link and the
 * wrong shape for material that is private until its author publishes it.
 */
export const getStudioVideoPlaybackUrl = onCall(
  CALLABLE_OPTIONS,
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'creator');
    const data = req.data && typeof req.data === 'object'
      ? req.data as Record<string, unknown>
      : {};
    const jobId = typeof data.jobId === 'string' ? data.jobId.trim() : '';
    if (!jobId || jobId.length > 240) {
      throw new HttpsError('invalid-argument', 'jobId is required.');
    }
    const snapshot = await getFirestore().collection('studioVideoJobs').doc(jobId).get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'Video job not found.');
    if (snapshot.get('ownerUid') !== uid) {
      throw new HttpsError('permission-denied', 'Only the creator can open this video.');
    }
    const storagePath = snapshot.get('outputStoragePath');
    if (typeof storagePath !== 'string' || !storagePath) {
      throw new HttpsError('failed-precondition', 'This video is not ready yet.');
    }
    // Re-checked rather than trusted: the path is read back out of a document,
    // and only this creator's own generator output may be signed.
    assertStudioAssetPath(storagePath, uid, 'output');

    const file = getStorage().bucket().file(storagePath);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError('not-found', 'The generated video file is missing.');
    const expires = Date.now() + SIGNED_ASSET_TTL_MS;
    try {
      const [playbackUrl] = await file.getSignedUrl({ version: 'v4', action: 'read', expires });
      const [downloadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires,
        responseDisposition: `attachment; filename="kasem-video-${jobId}.mp4"`,
      });
      return { playbackUrl, downloadUrl, expiresAt: new Date(expires).toISOString() };
    } catch (error) {
      // Signing is an IAM call, not a Storage one: the runtime service account
      // needs iam.serviceAccounts.signBlob on itself (Service Account Token
      // Creator). Without it every preview and download failed as a bare
      // INTERNAL, which read to the creator like a transient glitch with their
      // video — the file was fine and retrying could never help.
      console.error(
        `getStudioVideoPlaybackUrl could not sign ${storagePath}; grant the functions runtime service account roles/iam.serviceAccountTokenCreator on itself`,
        error,
      );
      throw new HttpsError(
        'unavailable',
        'Your video is saved, but we could not open it just now. This is a problem on our side, not with your video.',
      );
    }
  },
);

/**
 * Finishes jobs whose creator has closed the tab.
 *
 * Polling from the browser was the only thing that could ever complete a job,
 * which made "close the laptop" indistinguishable from "the video was never
 * made": the generation was paid for at the provider and then abandoned. This
 * sweep imports the result regardless, and fails anything still unfinished
 * after STUCK_JOB_TIMEOUT_MS so no job stays non-terminal forever.
 */
export const sweepStudioVideoJobs = onSchedule(
  {
    region: REGION,
    schedule: 'every 2 minutes',
    secrets: [RUNWAYML_API_SECRET, FAL_KEY],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async () => {
    const db = getFirestore();
    // Oldest first. Taking the first 40 by document id — which begins with the
    // creator's uid — would hand the same accounts every sweep and starve the
    // rest until the stuck-job timeout failed a video the provider had
    // actually finished.
    const inFlight = await db
      .collection('studioVideoJobs')
      .where('status', 'in', ['SUBMITTING', 'QUEUED', 'RUNNING'])
      .orderBy('createdAt', 'asc')
      .limit(SWEEP_BATCH_SIZE)
      .get();
    if (inFlight.empty) return;

    const startedAt = Date.now();
    const cutoff = startedAt - STUCK_JOB_TIMEOUT_MS;
    for (const snapshot of inFlight.docs) {
      // One import can take minutes. Stopping before the function's own
      // deadline leaves the tail of a busy batch for the next run instead of
      // being killed mid-write.
      if (Date.now() - startedAt > SWEEP_RUN_BUDGET_MS) break;

      // A job with no provider handle yet is still inside createStudioVideoJob.
      if (!readStoredProviderTask(snapshot.get('providerTask'))) continue;

      // The same claim the callable takes, so a sweep and a browser refresh
      // cannot import one video twice.
      const claimed = await claimStudioVideoJob(snapshot.ref);
      if (!claimed) continue;

      const overAge = (() => {
        const createdAt = Date.parse(String(claimed.get('createdAt') ?? ''));
        return Number.isFinite(createdAt) && createdAt < cutoff;
      })();

      try {
        await advanceStudioVideoJob(snapshot.ref, claimed);
      } catch {
        // One unreachable provider must not strand the rest of the batch.
        await releaseClaim(snapshot.ref);
      }

      if (!overAge) continue;
      // Only now is it fair to give up: the job has been polled once more, so
      // a provider that finished at minute 28 has had its video imported
      // rather than being reported as never delivered.
      const after = await snapshot.ref.get();
      if (!after.exists || isTerminalStudioVideoStatus(after.get('status'))) continue;
      await snapshot.ref.update({
        status: 'FAILED',
        failureReason: 'The provider did not finish this video in time. Nothing was delivered, so start a new one.',
        advanceLeaseUntil: null,
        updatedAt: nowIso(),
        'lifecycle.version': FieldValue.increment(1),
      }).catch(() => { /* another writer already moved it on */ });
    }
  },
);
