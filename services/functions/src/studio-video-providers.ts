import { HttpsError } from 'firebase-functions/v2/https';
import type { GenerateVisualInput, LipSyncInput } from './studio-video-policy.js';

const RUNWAY_BASE_URL = 'https://api.dev.runwayml.com/v1';
const RUNWAY_API_VERSION = '2024-11-06';
const FAL_MODEL_PATH = 'fal-ai/sync-lipsync/v2';
const FAL_QUEUE_URL = `https://queue.fal.run/${FAL_MODEL_PATH}`;

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
  failureReason: string | null;
}

async function providerJson(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new HttpsError('unavailable', `${provider} could not be reached.`);
  }
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = data && typeof data.error === 'string'
      ? data.error.slice(0, 240)
      : `${provider} returned HTTP ${response.status}.`;
    throw new HttpsError('unavailable', message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
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
  if (referenceImageUrl) body.promptImage = referenceImageUrl;
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
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== 'queue.fal.run') {
    throw new HttpsError('data-loss', `fal returned an invalid ${field}.`);
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
    const failureReason = state === 'failed'
      ? String(statusData.error ?? 'fal lip-sync failed.').slice(0, 240)
      : null;
    return { state, outputUrl: null, failureReason };
  }

  const result = await providerJson(
    trustedResponse,
    { method: 'GET', headers: falHeaders(apiKey) },
    'fal',
  );
  const video = result.video && typeof result.video === 'object'
    ? result.video as Record<string, unknown>
    : null;
  const outputUrl = video && typeof video.url === 'string' ? video.url : null;
  return {
    state: outputUrl ? 'succeeded' : 'failed',
    outputUrl,
    failureReason: outputUrl ? null : 'fal completed without a video URL.',
  };
}
