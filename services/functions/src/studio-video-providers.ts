import { HttpsError } from 'firebase-functions/v2/https';
import type {
  GeminiVideoModel,
  GenerateVisualInput,
  LipSyncInput,
} from './studio-video-policy.js';

const RUNWAY_BASE_URL = 'https://api.dev.runwayml.com/v1';
const RUNWAY_API_VERSION = '2024-11-06';
const RUNWAY_MAX_PROMPT_IMAGE_URL = 2048;
const FAL_MODEL_PATH = 'fal-ai/sync-lipsync/v2';
const FAL_QUEUE_HOST = 'queue.fal.run';
const FAL_QUEUE_URL = `https://${FAL_QUEUE_HOST}/${FAL_MODEL_PATH}`;
// The queue URLs fal hands back are followed verbatim, so the host is pinned.
// An allowlist rather than one literal, because a host migration should be a
// one-line change and not a fleet of jobs failing as "invalid status_url".
const FAL_QUEUE_HOSTS = new Set([FAL_QUEUE_HOST]);

export type ProviderState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ProviderSubmission {
  providerTaskId: string;
  statusUrl: string;
  responseUrl: string | null;
  state: ProviderState;
}

export interface ProviderStatus {
  state: ProviderState;
  outputUrl: string | null;
  /**
   * The video itself, base64, for a provider that returns bytes instead of a
   * link. Vertex does that unless it is given a Cloud Storage URI to write to,
   * and taking the bytes avoids granting the Vertex service agent write access
   * to the bucket holding creators' private media.
   */
  outputBase64?: string | null;
  failureReason: string | null;
}

/**
 * Pulls the readable reason out of a provider error body.
 *
 * Neither provider puts it where a single `data.error` read would find it:
 * Runway reports Zod body validation under `issues[]` with the offending
 * field path, and fal has no top-level `error` string at all — its 422 carries
 * `detail[]`. Reading only `error` reduced both to "returned HTTP 422", which
 * is undiagnosable from a log and useless to the creator.
 */
function providerErrorMessage(
  data: Record<string, unknown> | null,
  provider: string,
  status: number,
): string {
  if (data) {
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim().slice(0, 240);
    }
    if (Array.isArray(data.issues)) {
      const issues = data.issues
        .map((raw) => {
          const issue = raw as Record<string, unknown>;
          const path = Array.isArray(issue.path) ? issue.path.join('.') : '';
          const message = typeof issue.message === 'string' ? issue.message : '';
          return path && message ? `${path}: ${message}` : message;
        })
        .filter(Boolean)
        .join('; ');
      if (issues) return issues.slice(0, 240);
    }
    if (Array.isArray(data.detail)) {
      const detail = data.detail
        .map((raw) => {
          const item = raw as Record<string, unknown>;
          const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
          const message = typeof item.msg === 'string' ? item.msg : '';
          return loc && message ? `${loc}: ${message}` : message;
        })
        .filter(Boolean)
        .join('; ');
      if (detail) return detail.slice(0, 240);
    }
  }
  return `${provider} returned HTTP ${status}.`;
}

interface ProviderResponse {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
}

/** Performs the call without deciding what a non-2xx means. */
async function providerFetch(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<ProviderResponse> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new HttpsError('unavailable', `${provider} could not be reached.`);
  }
  const raw = await response.json().catch(() => null) as unknown;
  const data = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
  return { ok: response.ok, status: response.status, data };
}

async function providerJson(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<Record<string, unknown>> {
  const { ok, status, data } = await providerFetch(url, init, provider);
  if (!ok) {
    throw new HttpsError('unavailable', providerErrorMessage(data, provider, status));
  }
  if (!data) {
    throw new HttpsError('data-loss', `${provider} returned an invalid response.`);
  }
  return data;
}

function requiredSecret(value: string, name: string): string {
  const secret = value.trim();
  if (!secret) {
    throw new HttpsError('failed-precondition', `${name} is not configured.`);
  }
  return secret;
}

function runwayHeaders(apiSecret: string): Record<string, string> {
  return {
    Authorization: `Bearer ${requiredSecret(apiSecret, 'Runway API')}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': RUNWAY_API_VERSION,
  };
}

export async function submitRunwayVisual(
  input: GenerateVisualInput,
  apiSecret: string,
  referenceImageUrl: string | null,
): Promise<ProviderSubmission> {
  const endpoint = referenceImageUrl ? 'image_to_video' : 'text_to_video';
  const body: Record<string, unknown> = {
    model: input.model,
    promptText: input.prompt,
    duration: input.durationSeconds,
    ratio: input.ratio,
  };
  if (referenceImageUrl) {
    // The HTTPS variant of promptImage is capped at 2048 characters in
    // Runway's schema. A longer signed URL is a 400 whose text says nothing
    // useful, so name the real limit here instead.
    if (referenceImageUrl.length > RUNWAY_MAX_PROMPT_IMAGE_URL) {
      throw new HttpsError(
        'failed-precondition',
        `The reference image link is too long for Runway (limit ${RUNWAY_MAX_PROMPT_IMAGE_URL} characters).`,
      );
    }
    body.promptImage = referenceImageUrl;
  }
  const data = await providerJson(
    `${RUNWAY_BASE_URL}/${endpoint}`,
    { method: 'POST', headers: runwayHeaders(apiSecret), body: JSON.stringify(body) },
    'Runway',
  );
  if (typeof data.id !== 'string' || !data.id) {
    throw new HttpsError('data-loss', 'Runway did not return a task ID.');
  }
  return {
    providerTaskId: data.id,
    statusUrl: `${RUNWAY_BASE_URL}/tasks/${encodeURIComponent(data.id)}`,
    responseUrl: null,
    state: 'queued',
  };
}

function runwayState(raw: unknown): ProviderState {
  switch (raw) {
    case 'PENDING':
    case 'THROTTLED': return 'queued';
    case 'RUNNING': return 'running';
    case 'SUCCEEDED': return 'succeeded';
    case 'FAILED': return 'failed';
    case 'CANCELLED': return 'cancelled';
    default: return 'queued';
  }
}

export async function pollRunwayVisual(
  providerTaskId: string,
  apiSecret: string,
): Promise<ProviderStatus> {
  const data = await providerJson(
    `${RUNWAY_BASE_URL}/tasks/${encodeURIComponent(providerTaskId)}`,
    { method: 'GET', headers: runwayHeaders(apiSecret) },
    'Runway',
  );
  const state = runwayState(data.status);
  const output = Array.isArray(data.output) && typeof data.output[0] === 'string'
    ? data.output[0]
    : null;
  const failureReason = state === 'failed'
    ? String(data.failure ?? data.failureCode ?? 'Runway generation failed.').slice(0, 240)
    : null;
  return { state, outputUrl: state === 'succeeded' ? output : null, failureReason };
}

// ---------------------------------------------------------------------------
// Gemini video (Veo on Vertex AI)
// ---------------------------------------------------------------------------
//
// Reached with the function's own Application Default Credentials, like
// Kawuri: there is no API key for this provider in Secret Manager or anywhere
// else. The project needs `aiplatform.googleapis.com` enabled and the runtime
// service account needs `roles/aiplatform.user`.

const GEMINI_LOCATION = process.env.STUDIO_VIDEO_VERTEX_LOCATION || 'us-central1';

/** Veo frames landscape and portrait; our ratios are stated in pixels. */
const GEMINI_ASPECT_RATIOS: Record<string, string> = {
  '1280:720': '16:9',
  '720:1280': '9:16',
};

function geminiModelUrl(model: GeminiVideoModel, project: string, method: string): string {
  return (
    `https://${GEMINI_LOCATION}-aiplatform.googleapis.com/v1/projects/${project}`
    + `/locations/${GEMINI_LOCATION}/publishers/google/models/${model}:${method}`
  );
}

function geminiHeaders(accessToken: string): Record<string, string> {
  const token = requiredSecret(accessToken, 'Vertex AI credentials');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function submitGeminiVisual(
  input: GenerateVisualInput,
  accessToken: string,
  project: string,
  referenceImage: { base64: string; mimeType: string } | null,
): Promise<ProviderSubmission> {
  const model = input.model as GeminiVideoModel;
  const aspectRatio = GEMINI_ASPECT_RATIOS[input.ratio];
  if (!aspectRatio) {
    throw new HttpsError(
      'invalid-argument',
      'Gemini video is made in landscape or portrait.',
    );
  }
  const instance: Record<string, unknown> = { prompt: input.prompt };
  if (referenceImage) {
    instance.image = {
      bytesBase64Encoded: referenceImage.base64,
      mimeType: referenceImage.mimeType,
    };
  }
  const data = await providerJson(
    geminiModelUrl(model, project, 'predictLongRunning'),
    {
      method: 'POST',
      headers: geminiHeaders(accessToken),
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio,
          durationSeconds: input.durationSeconds,
          sampleCount: 1,
          // 1080p is offered on landscape; portrait stays at 720p.
          resolution: aspectRatio === '16:9' ? '1080p' : '720p',
          // Off deliberately, and not a cost decision alone (audio raises the
          // per-second rate). Veo would synthesise speech and song in a
          // language that is not Kasem, over footage meant to represent
          // Kassena life. The Kasem the creator recorded is the audio; it
          // arrives through lip-sync or in editing, never invented here.
          generateAudio: false,
          // The governance model refuses media involving minors outright, so
          // the model is told the same thing rather than being trusted to
          // infer it.
          personGeneration: 'allow_adult',
        },
      }),
    },
    'Gemini video',
  );
  const operationName = typeof data.name === 'string' ? data.name.trim() : '';
  if (!operationName) {
    throw new HttpsError('data-loss', 'Vertex did not return an operation name.');
  }
  return {
    providerTaskId: operationName,
    // Rebuilt from the model at poll time rather than trusted from the
    // response, so nothing the provider says can redirect a later request.
    statusUrl: geminiModelUrl(model, project, 'fetchPredictOperation'),
    responseUrl: null,
    state: 'queued',
  };
}

/** Reads the video out of a finished Vertex operation, whichever form it took. */
function geminiOutput(response: Record<string, unknown>): {
  url: string | null;
  base64: string | null;
} {
  const videos = Array.isArray(response.videos) ? response.videos : [];
  for (const raw of videos) {
    if (!raw || typeof raw !== 'object') continue;
    const video = raw as Record<string, unknown>;
    const base64 = typeof video.bytesBase64Encoded === 'string' && video.bytesBase64Encoded
      ? video.bytesBase64Encoded
      : null;
    if (base64) return { url: null, base64 };
    // A gs:// URI appears only when the request asked Vertex to write into a
    // bucket, which this integration does not do. Read anyway: an https link
    // is usable, and anything else is reported as a missing video rather than
    // fetched blindly.
    const uri = typeof video.gcsUri === 'string' && video.gcsUri
      ? video.gcsUri
      : typeof video.uri === 'string' ? video.uri : '';
    if (uri.startsWith('https://')) return { url: uri, base64: null };
  }
  return { url: null, base64: null };
}

export async function pollGeminiVisual(
  operationName: string,
  model: GeminiVideoModel,
  accessToken: string,
  project: string,
): Promise<ProviderStatus> {
  const data = await providerJson(
    geminiModelUrl(model, project, 'fetchPredictOperation'),
    {
      method: 'POST',
      headers: geminiHeaders(accessToken),
      body: JSON.stringify({ operationName }),
    },
    'Gemini video',
  );
  if (data.done !== true) {
    return { state: 'running', outputUrl: null, outputBase64: null, failureReason: null };
  }
  // A long-running operation reports its own failure in `error`; the HTTP call
  // that carried it succeeded, so this is the only place it can be seen.
  if (data.error && typeof data.error === 'object') {
    const error = data.error as Record<string, unknown>;
    const message = typeof error.message === 'string' && error.message.trim()
      ? error.message.trim().slice(0, 240)
      : 'Gemini video generation failed.';
    return { state: 'failed', outputUrl: null, outputBase64: null, failureReason: message };
  }
  const response = data.response && typeof data.response === 'object'
    ? data.response as Record<string, unknown>
    : {};
  const filtered = Number(response.raiMediaFilteredCount ?? 0);
  const { url, base64 } = geminiOutput(response);
  if (!url && !base64) {
    // A prompt Google's safety filters declined returns done with no video and
    // a reason. Terminal, and the reason is worth showing: it tells the
    // creator to rephrase rather than to retry the same thing.
    const reasons = Array.isArray(response.raiMediaFilteredReasons)
      ? response.raiMediaFilteredReasons.filter((r): r is string => typeof r === 'string')
      : [];
    return {
      state: 'failed',
      outputUrl: null,
      outputBase64: null,
      failureReason: filtered > 0 || reasons.length > 0
        ? `Gemini declined this prompt: ${reasons.join('; ').slice(0, 200) || 'it was filtered for safety.'}`
        : 'Gemini finished without returning a video.',
    };
  }
  return { state: 'succeeded', outputUrl: url, outputBase64: base64, failureReason: null };
}

function falHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Key ${requiredSecret(apiKey, 'fal API')}`,
    'Content-Type': 'application/json',
  };
}

function trustedFalQueueUrl(raw: unknown, field: string): string {
  if (typeof raw !== 'string') {
    throw new HttpsError('data-loss', `fal did not return ${field}.`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpsError('data-loss', `fal returned an unreadable ${field}.`);
  }
  if (url.protocol !== 'https:' || !FAL_QUEUE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new HttpsError(
      'data-loss',
      `fal returned ${field} on an unexpected host (${url.hostname}).`,
    );
  }
  return url.toString();
}

export async function submitFalLipSync(
  input: LipSyncInput,
  apiKey: string,
  videoUrl: string,
  audioUrl: string,
): Promise<ProviderSubmission> {
  const data = await providerJson(
    FAL_QUEUE_URL,
    {
      method: 'POST',
      headers: falHeaders(apiKey),
      body: JSON.stringify({
        model: input.model,
        video_url: videoUrl,
        audio_url: audioUrl,
        sync_mode: input.syncMode,
      }),
    },
    'fal',
  );
  if (typeof data.request_id !== 'string' || !data.request_id) {
    throw new HttpsError('data-loss', 'fal did not return a request ID.');
  }
  return {
    providerTaskId: data.request_id,
    statusUrl: trustedFalQueueUrl(data.status_url, 'status_url'),
    responseUrl: trustedFalQueueUrl(data.response_url, 'response_url'),
    state: 'queued',
  };
}

/**
 * fal's queue reports only IN_QUEUE, IN_PROGRESS and COMPLETED. A run that
 * failed is still COMPLETED — the failure is in the body, not the status — so
 * 'COMPLETED' means "finished", not "worked". FAILED and CANCELLED are kept as
 * defensive aliases only; the documented queue never emits them.
 */
function falState(raw: unknown): ProviderState {
  switch (raw) {
    case 'IN_QUEUE': return 'queued';
    case 'IN_PROGRESS': return 'running';
    case 'COMPLETED': return 'succeeded';
    case 'CANCELLED': return 'cancelled';
    case 'FAILED': return 'failed';
    default: return 'queued';
  }
}

function falErrorText(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim().slice(0, 240);
  if (typeof data.error_type === 'string' && data.error_type.trim()) {
    return data.error_type.trim().slice(0, 240);
  }
  return null;
}

export async function pollFalLipSync(
  statusUrl: string,
  responseUrl: string,
  apiKey: string,
): Promise<ProviderStatus> {
  const trustedStatus = trustedFalQueueUrl(statusUrl, 'status_url');
  const trustedResponse = trustedFalQueueUrl(responseUrl, 'response_url');
  const statusData = await providerJson(
    trustedStatus,
    { method: 'GET', headers: falHeaders(apiKey) },
    'fal',
  );
  const state = falState(statusData.status);
  if (state !== 'succeeded') {
    const failureReason = state === 'failed' || state === 'cancelled'
      ? falErrorText(statusData) ?? 'fal lip-sync did not complete.'
      : null;
    return { state, outputUrl: null, failureReason };
  }

  // A COMPLETED run that reports an error is a finished failure. Checked
  // before the result is fetched: that fetch answers 4xx for a failed run,
  // and throwing there left the job non-terminal and the creator watching a
  // spinner for a lip-sync that had already given up.
  const statusError = falErrorText(statusData);
  if (statusError) {
    return { state: 'failed', outputUrl: null, failureReason: statusError };
  }

  const result = await providerFetch(
    trustedResponse,
    { method: 'GET', headers: falHeaders(apiKey) },
    'fal',
  );
  if (!result.ok) {
    // 4xx here describes a run that cannot produce a video. Only a server-side
    // fault is worth retrying, so everything else becomes terminal.
    if (result.status >= 400 && result.status < 500) {
      return {
        state: 'failed',
        outputUrl: null,
        failureReason: providerErrorMessage(result.data, 'fal', result.status),
      };
    }
    throw new HttpsError('unavailable', providerErrorMessage(result.data, 'fal', result.status));
  }
  const resultError = falErrorText(result.data);
  if (resultError) {
    return { state: 'failed', outputUrl: null, failureReason: resultError };
  }
  const video = result.data?.video && typeof result.data.video === 'object'
    ? result.data.video as Record<string, unknown>
    : null;
  const outputUrl = video && typeof video.url === 'string' ? video.url : null;
  return {
    state: outputUrl ? 'succeeded' : 'failed',
    outputUrl,
    failureReason: outputUrl ? null : 'fal completed without a video URL.',
  };
}
