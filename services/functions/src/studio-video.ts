import { getFirestore, FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  approvedKasemScriptMatches,
  estimateStudioVideoCost,
  parseStudioVideoInput,
  studioVideoCapabilities,
  type StudioVideoInput,
} from './studio-video-policy.js';
import {
  pollFalLipSync,
  pollRunwayVisual,
  submitFalLipSync,
  submitRunwayVisual,
  type ProviderStatus,
  type ProviderSubmission,
} from './studio-video-providers.js';

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
const MAX_IMPORTED_VIDEO_BYTES = 200 * 1024 * 1024;
const SIGNED_ASSET_TTL_MS = 30 * 60 * 1000;

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

async function importProviderVideo(
  remoteUrl: string,
  uid: string,
  jobId: string,
): Promise<string> {
  const url = safeHttpsUrl(remoteUrl);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
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
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMPORTED_VIDEO_BYTES) {
    throw new HttpsError('resource-exhausted', 'The generated video is too large to import.');
  }
  const storagePath = `studio-video-jobs/${uid}/${jobId}/output.mp4`;
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

async function submitToProvider(input: StudioVideoInput): Promise<ProviderSubmission> {
  if (input.operation === 'generate_visual') {
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
  const providerTaskId = snapshot.get('providerTask.id');
  if (typeof providerTaskId !== 'string' || !providerTaskId) {
    throw new HttpsError('failed-precondition', 'This job has no provider task yet.');
  }
  if (provider === 'runway') {
    return pollRunwayVisual(providerTaskId, RUNWAYML_API_SECRET.value());
  }
  if (provider === 'fal') {
    const statusUrl = snapshot.get('providerTask.statusUrl');
    const responseUrl = snapshot.get('providerTask.responseUrl');
    if (typeof statusUrl !== 'string' || typeof responseUrl !== 'string') {
      throw new HttpsError('failed-precondition', 'This fal job is missing queue URLs.');
    }
    return pollFalLipSync(statusUrl, responseUrl, FAL_KEY.value());
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
      return publicJob(jobId, existing.data() as Record<string, unknown>);
    }

    // Spend controls are server-side and apply only to newly created jobs.
    await Promise.all([
      consumeRateLimit('studioVideoCreateBurst', uid, 3, 10 * 60_000),
      consumeRateLimit('studioVideoCreateDaily', uid, 20, 24 * 60 * 60_000),
      consumeRateLimit('studioVideoCreateGlobalDaily', 'all-creators', 250, 24 * 60 * 60_000),
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

/** Polls a provider and imports a successful output into private Firebase Storage. */
export const refreshStudioVideoJob = onCall(
  { ...CALLABLE_OPTIONS, secrets: [RUNWAYML_API_SECRET, FAL_KEY] },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'creator');
    await consumeRateLimit('studioVideoRefresh', uid, 30, 10 * 60_000);
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
    const currentStatus = snapshot.get('status');
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(String(currentStatus))) {
      return publicJob(jobId, snapshot.data() as Record<string, unknown>);
    }

    const providerStatus = await pollProvider(snapshot);
    let outputStoragePath: string | null = null;
    if (providerStatus.state === 'succeeded') {
      if (!providerStatus.outputUrl) {
        throw new HttpsError('data-loss', 'Provider completed without a video.');
      }
      outputStoragePath = await importProviderVideo(providerStatus.outputUrl, uid, jobId);
    }
    const status = providerStatus.state === 'succeeded'
      ? 'SUCCEEDED'
      : providerStatus.state === 'failed'
        ? 'FAILED'
        : providerStatus.state === 'cancelled'
          ? 'CANCELLED'
          : providerStatus.state === 'running'
            ? 'RUNNING'
            : 'QUEUED';
    const updatedAt = nowIso();
    await jobRef.update({
      status,
      outputStoragePath,
      failureReason: providerStatus.failureReason,
      updatedAt,
      completedAt: status === 'SUCCEEDED' ? updatedAt : null,
      'lifecycle.version': FieldValue.increment(1),
    });
    const refreshed = await jobRef.get();
    return publicJob(jobId, refreshed.data() as Record<string, unknown>);
  },
);
