import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import {
  OMNI_RESOLUTIONS,
  OMNI_VIDEO_MODELS,
  isOmniVideoModel,
  readOmniInteraction,
} from './omni-video.js';
import {
  durationsForVisualModel,
  vertexVideoRateUsdPerSecond,
} from './studio-video-policy.js';

/**
 * Kawuri's media capabilities — image and video generation, English
 * speech-to-text, and image/video/audio analysis — as rules rather than calls.
 *
 * Firebase-free on purpose, like `studio-video-policy.ts`: what a request may
 * contain, which model serves it, how a Vertex failure reads to a member and
 * when a task has waited too long are the parts worth testing without an
 * emulator or a network, so they live here and `kawuri-media.ts` only wires
 * them to Firestore, Storage and Vertex.
 *
 * ── What is deliberately not here ─────────────────────────────────────────
 * Prices and quotas. Video spends against the Studio's existing cents ceilings
 * and published Vertex video rates (`studio-video-policy.ts`), and every other Kawuri
 * media request counts against the member's existing daily Kawuri allowance
 * (`TIER_BENEFITS` in `subscription-catalog.ts`). Nothing in this file invents
 * a number a member pays for.
 */

// ---------------------------------------------------------------------------
// Vocabulary shared with the app
// ---------------------------------------------------------------------------

export const KAWURI_TASK_TYPES = [
  'image_generation',
  'video_generation',
  'speech_to_text',
  'image_analysis',
  'video_analysis',
  'audio_analysis',
] as const;
export type KawuriTaskType = (typeof KAWURI_TASK_TYPES)[number];

export const KAWURI_TASK_STATUSES = [
  'draft',
  'uploading',
  'queued',
  'generating',
  'processing',
  'ready',
  'failed',
  'rejected',
  'cancelled',
  'expired',
] as const;
export type KawuriTaskStatus = (typeof KAWURI_TASK_STATUSES)[number];

export const TERMINAL_TASK_STATUSES: readonly KawuriTaskStatus[] = [
  'ready',
  'failed',
  'rejected',
  'cancelled',
  'expired',
];

/** Statuses the recovery sweep still owes an outcome. */
export const IN_FLIGHT_TASK_STATUSES: readonly KawuriTaskStatus[] = [
  'queued',
  'generating',
  'processing',
];

export function isTerminalTaskStatus(status: unknown): boolean {
  return (TERMINAL_TASK_STATUSES as readonly unknown[]).includes(status);
}

export type KawuriCategory = 'image' | 'video' | 'analysis' | 'transcription';

export function categoryForTask(type: KawuriTaskType): KawuriCategory {
  switch (type) {
    case 'image_generation': return 'image';
    case 'video_generation': return 'video';
    case 'speech_to_text': return 'transcription';
    default: return 'analysis';
  }
}

/**
 * Whether a task belongs in Recent and the creation library.
 *
 * A dictated message is not a creation: it went into the composer, and a
 * library filling up with "Transcription · Ready" rows would bury the images
 * and videos the section exists to show.
 */
export function isListedTask(type: KawuriTaskType): boolean {
  return type !== 'speech_to_text';
}

export type CapabilityName =
  | 'imageGeneration'
  | 'videoGeneration'
  | 'speechToText'
  | 'mediaAnalysis';

// ---------------------------------------------------------------------------
// Stable error codes
// ---------------------------------------------------------------------------

/**
 * Every way a Kawuri media request can end badly, as the app reads it.
 *
 * Carried in `HttpsError.details.reason` and on a task's `errorCode`. The app
 * switches on these, never on a message, so the wording below can improve
 * without breaking a single installed build.
 */
export const KAWURI_ERROR_CODES = [
  'VERTEX_AUTH_FAILED',
  'VERTEX_API_DISABLED',
  'MODEL_UNAVAILABLE',
  'UNSUPPORTED_REGION',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'ALLOWANCE_EXHAUSTED',
  'SAFETY_REJECTED',
  'INVALID_MEDIA',
  'UNSUPPORTED_LANGUAGE',
  'UPLOAD_MISSING',
  'OPERATION_TIMEOUT',
  'GENERATION_FAILED',
  'STORAGE_FAILED',
  'NOT_ELIGIBLE',
  'CONFIRMATION_REQUIRED',
  'CAPABILITY_UNAVAILABLE',
  'INVALID_REQUEST',
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
  'CANCELLED',
] as const;
export type KawuriErrorCode = (typeof KAWURI_ERROR_CODES)[number];

export const ENGLISH_ONLY_MESSAGE =
  'Voice transcription currently supports English only. You can still type in another language.';

const PUBLIC_MESSAGES: Record<KawuriErrorCode, string> = {
  VERTEX_AUTH_FAILED: 'Kawuri could not reach its media service. This is a problem on our side.',
  VERTEX_API_DISABLED: 'This Kawuri tool is switched off on our side at the moment.',
  MODEL_UNAVAILABLE: 'This Kawuri tool is temporarily unavailable. Please try again later.',
  UNSUPPORTED_REGION: 'This Kawuri tool is not available from our servers yet.',
  QUOTA_EXCEEDED: 'Kawuri is very busy right now. Please try again in a few minutes.',
  RATE_LIMITED: 'That was a lot of requests in a short time. Wait a moment and try again.',
  ALLOWANCE_EXHAUSTED: 'You have reached your Kawuri allowance for today. It resets within 24 hours.',
  SAFETY_REJECTED: 'This request was declined by the safety filters. Try describing it differently.',
  INVALID_MEDIA: 'That file cannot be used. Check its type, size and length.',
  UNSUPPORTED_LANGUAGE: ENGLISH_ONLY_MESSAGE,
  UPLOAD_MISSING: 'The file did not finish uploading, or it has expired. Attach it again.',
  OPERATION_TIMEOUT: 'This took too long and was stopped. Nothing was delivered, so try again.',
  GENERATION_FAILED: 'Kawuri could not finish this one. Try again, or change the request.',
  STORAGE_FAILED: 'The result was made but could not be saved. Try again.',
  NOT_ELIGIBLE: 'Your membership does not include this tool.',
  CONFIRMATION_REQUIRED: 'Confirm that you want to use a video generation before starting.',
  CAPABILITY_UNAVAILABLE: 'This Kawuri tool is not available right now.',
  INVALID_REQUEST: 'The request was not valid. Check it and try again.',
  NOT_FOUND: 'That item could not be found.',
  PERMISSION_DENIED: 'You do not have access to that item.',
  UNAUTHENTICATED: 'Sign in to use this Kawuri tool.',
  CANCELLED: 'Cancelled.',
};

export function publicMessageFor(code: KawuriErrorCode): string {
  return PUBLIC_MESSAGES[code];
}

const HTTPS_CODES: Record<KawuriErrorCode, FunctionsErrorCode> = {
  VERTEX_AUTH_FAILED: 'unavailable',
  VERTEX_API_DISABLED: 'unavailable',
  MODEL_UNAVAILABLE: 'unavailable',
  UNSUPPORTED_REGION: 'unavailable',
  QUOTA_EXCEEDED: 'resource-exhausted',
  RATE_LIMITED: 'resource-exhausted',
  ALLOWANCE_EXHAUSTED: 'resource-exhausted',
  SAFETY_REJECTED: 'failed-precondition',
  INVALID_MEDIA: 'invalid-argument',
  UNSUPPORTED_LANGUAGE: 'invalid-argument',
  UPLOAD_MISSING: 'failed-precondition',
  OPERATION_TIMEOUT: 'deadline-exceeded',
  GENERATION_FAILED: 'internal',
  STORAGE_FAILED: 'internal',
  NOT_ELIGIBLE: 'permission-denied',
  CONFIRMATION_REQUIRED: 'failed-precondition',
  CAPABILITY_UNAVAILABLE: 'failed-precondition',
  INVALID_REQUEST: 'invalid-argument',
  NOT_FOUND: 'not-found',
  PERMISSION_DENIED: 'permission-denied',
  UNAUTHENTICATED: 'unauthenticated',
  CANCELLED: 'cancelled',
};

/** An HttpsError the app can switch on through `details.reason`. */
export function kawuriError(code: KawuriErrorCode, message?: string): HttpsError {
  return new HttpsError(HTTPS_CODES[code], message ?? PUBLIC_MESSAGES[code], { reason: code });
}

/** The stable code carried by an error thrown anywhere in this feature. */
export function reasonOf(error: unknown): KawuriErrorCode | null {
  if (!(error instanceof HttpsError)) return null;
  const details = error.details as Record<string, unknown> | undefined;
  const reason = details?.reason;
  if ((KAWURI_ERROR_CODES as readonly unknown[]).includes(reason)) {
    return reason as KawuriErrorCode;
  }
  // The shared rate limiter throws plain resource-exhausted errors.
  if (error.code === 'resource-exhausted') return 'RATE_LIMITED';
  return null;
}

/**
 * What a failed Vertex call means, from the only two things the SDK reliably
 * gives back: an HTTP status and Google's error text.
 *
 * The text is read, never logged or returned: Google's error bodies can quote
 * the request, and the request is the member's prompt.
 */
export function classifyVertexError(error: unknown): KawuriErrorCode {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const status = typeof record.status === 'number' ? record.status : 0;
  const name = typeof record.name === 'string' ? record.name : '';
  const text = typeof record.message === 'string' ? record.message : '';

  if (name === 'AbortError' || name === 'TimeoutError' || status === 408 || status === 504) {
    return 'OPERATION_TIMEOUT';
  }
  if (status === 401) return 'VERTEX_AUTH_FAILED';
  if (status === 403) {
    return /SERVICE_DISABLED|has not been used|is disabled|API not enabled/i.test(text)
      ? 'VERTEX_API_DISABLED'
      : 'VERTEX_AUTH_FAILED';
  }
  if (status === 404) {
    return /location|region/i.test(text) && !/model/i.test(text)
      ? 'UNSUPPORTED_REGION'
      : 'MODEL_UNAVAILABLE';
  }
  if (status === 429) return 'QUOTA_EXCEEDED';
  if (status === 400) {
    if (/location .*not supported|unsupported location|not available in (this|the) (region|location)/i.test(text)) {
      return 'UNSUPPORTED_REGION';
    }
    // The Interactions API's way of saying a model id does not exist here.
    if (/unsupported model/i.test(text)) return 'MODEL_UNAVAILABLE';
    if (/safety|responsible ai|usage guidelines|prohibited|blocked|sensitive words|violat/i.test(text)) {
      return 'SAFETY_REJECTED';
    }
    return 'INVALID_REQUEST';
  }
  if (status >= 500) return 'GENERATION_FAILED';
  return 'GENERATION_FAILED';
}

/** Errors where the next model in the chain is worth trying. */
export function isFallbackWorthy(code: KawuriErrorCode): boolean {
  return code === 'MODEL_UNAVAILABLE' || code === 'UNSUPPORTED_REGION';
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface KawuriMediaConfig {
  project: string;
  /** Gemini models on this project are served from the global endpoint. */
  location: string;
  /**
   * Veo is served from regional endpoints only. Omni ignores this: it is
   * served from `global` alone (`OMNI_LOCATION`).
   */
  videoLocation: string;
  /** Primary first, fallbacks after. Never empty. */
  imageModels: string[];
  videoModel: string;
  /** The model a plan with creator tools may choose instead. '' for none. */
  videoPlanModel: string;
  transcriptionModels: string[];
  analysisModels: string[];
  /** '' means the project's default Firebase Storage bucket. */
  outputBucket: string;
  disabled: ReadonlySet<CapabilityName>;
}

/**
 * Defaults chosen from what `project-kassena-7e026` actually serves, each
 * confirmed with a real call:
 *
 *   * `gemini-3.1-flash-image` (GA) — image generation, global endpoint only.
 *   * `gemini-omni-1.1-flash-preview` (Preview, since 2026-09-19) — video,
 *     global only, through the Interactions API. It replaced
 *     `veo-3.1-fast-generate-001` as the default and `veo-3.1-generate-001` as
 *     the plan model; Omni has one model, so there is no plan model by
 *     default and no quality choice in the app. Setting VERTEX_VIDEO_MODEL
 *     back to a Veo id still works, should the preview be withdrawn.
 *   * `gemini-3.8-flash` (GA) — transcription and analysis, global only.
 *   * `gemini-2.5-flash` / `gemini-2.5-flash-image` (GA) — fallbacks served in
 *     both places, used when a primary answers "model unavailable".
 *
 * Every one is an environment variable so a model can be replaced without a
 * code change or an app release.
 */
export function readKawuriMediaConfig(
  env: Record<string, string | undefined>,
  project: string,
): KawuriMediaConfig {
  const pick = (key: string, fallback: string) => (env[key] ?? '').trim() || fallback;
  const chain = (...models: string[]) =>
    [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  const disabled = new Set<CapabilityName>();
  for (const raw of (env.KAWURI_DISABLED_CAPABILITIES ?? '').split(',')) {
    const name = raw.trim();
    if (
      name === 'imageGeneration' || name === 'videoGeneration'
      || name === 'speechToText' || name === 'mediaAnalysis'
    ) {
      disabled.add(name);
    }
  }
  const textFallback = pick('VERTEX_TEXT_FALLBACK_MODEL', 'gemini-2.5-flash');
  return {
    // The runtime's own project unless Vertex is billed to another one.
    project: pick('VERTEX_PROJECT_ID', project),
    location: pick('GOOGLE_CLOUD_LOCATION', 'global'),
    videoLocation: pick('VERTEX_VIDEO_LOCATION', pick('STUDIO_VIDEO_VERTEX_LOCATION', 'us-central1')),
    imageModels: chain(
      pick('VERTEX_IMAGE_MODEL', 'gemini-3.1-flash-image'),
      pick('VERTEX_IMAGE_FALLBACK_MODEL', 'gemini-2.5-flash-image'),
    ),
    videoModel: pick('VERTEX_VIDEO_MODEL', OMNI_VIDEO_MODELS[0]),
    videoPlanModel: (env.VERTEX_VIDEO_PLAN_MODEL ?? '').trim(),
    transcriptionModels: chain(pick('VERTEX_TRANSCRIPTION_MODEL', 'gemini-3.8-flash'), textFallback),
    analysisModels: chain(pick('VERTEX_MEDIA_ANALYSIS_MODEL', 'gemini-3.8-flash'), textFallback),
    outputBucket: (env.VERTEX_OUTPUT_BUCKET ?? '').trim(),
    disabled,
  };
}

/**
 * Thinking settings per model family.
 *
 * Gemini 3 takes a level, and rejects MINIMAL on Flash; Gemini 2.5 takes a
 * token budget. Transcription and structured analysis are recall, not
 * multi-step reasoning, so both are kept low — which also stops reasoning
 * tokens eating the output ceiling, the trap `kawuri.ts` documents.
 */
export function thinkingConfigFor(model: string): Record<string, unknown> | undefined {
  if (/^gemini-3/.test(model)) return { thinkingLevel: 'LOW' };
  if (/^gemini-2\.5-(flash|pro)(?!-image)/.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

// ---------------------------------------------------------------------------
// What each model can do
// ---------------------------------------------------------------------------

/** The shapes the product offers, before a model narrows them. */
export const PRODUCT_IMAGE_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const;

const GEMINI_IMAGE_BASE_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

/** Whether [model] is a Gemini image-output model this backend knows how to call. */
export function isGeminiImageModel(model: string): boolean {
  return /^gemini-[\d.]+(-[a-z]+)*-image(-preview)?(-\d+)?$/.test(model);
}

/**
 * The product's aspect ratios that [model] will actually frame.
 *
 * Derived rather than hardcoded in the app: a model with a narrower list makes
 * the app offer fewer chips, instead of letting a member pick a shape the
 * model then refuses.
 */
export function imageAspectRatiosFor(model: string): string[] {
  if (!isGeminiImageModel(model)) return [];
  return PRODUCT_IMAGE_ASPECT_RATIOS.filter((ratio) => GEMINI_IMAGE_BASE_RATIOS.includes(ratio));
}

export const VIDEO_ASPECT_RATIOS = ['9:16', '16:9'] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

/**
 * Veo's resolutions by orientation: 1080p on landscape, portrait at 720p.
 * Only a Kawuri pointed back at Veo uses these now.
 */
export const VIDEO_RESOLUTIONS: Record<VideoAspectRatio, readonly string[]> = {
  '16:9': ['720p', '1080p'],
  '9:16': ['720p'],
};

/** Omni makes 1080p in both orientations. 720p first: it is the default. */
export const OMNI_VIDEO_RESOLUTIONS: Record<VideoAspectRatio, readonly string[]> = {
  '16:9': OMNI_RESOLUTIONS,
  '9:16': OMNI_RESOLUTIONS,
};

export function isVeoModel(model: string): boolean {
  return /^veo-/.test(model);
}

/** Resolutions [model] makes, by orientation. */
export function videoResolutionsFor(model: string): Record<VideoAspectRatio, readonly string[]> {
  return isOmniVideoModel(model) ? OMNI_VIDEO_RESOLUTIONS : VIDEO_RESOLUTIONS;
}

/** Durations the configured video model makes, or [] when it cannot be sold. */
export function videoDurationsFor(model: string): number[] {
  if (!isOmniVideoModel(model) && !isVeoModel(model)) return [];
  if (vertexVideoRateUsdPerSecond(model) === null) return [];
  return [...durationsForVisualModel(model)];
}

/**
 * Whether [model] makes this exact video. The capability manifest describes
 * the default model; a plan model configured beside it may differ, and must
 * never be sent a length or resolution it would refuse after the allowance
 * was spent.
 */
export function videoModelSupports(
  model: string,
  request: { durationSeconds: number; aspectRatio: VideoAspectRatio; resolution: string },
): boolean {
  return videoDurationsFor(model).includes(request.durationSeconds)
    && videoResolutionsFor(model)[request.aspectRatio].includes(request.resolution);
}

/** Pixel size of a video output, which neither API reports back. */
export function videoDimensions(
  aspectRatio: VideoAspectRatio,
  resolution: string,
): { width: number; height: number } {
  const long = resolution === '1080p' ? 1920 : 1280;
  const short = resolution === '1080p' ? 1080 : 720;
  return aspectRatio === '16:9' ? { width: long, height: short } : { width: short, height: long };
}

/**
 * Estimated cost of one video in whole cents, or null when unpriced.
 *
 * [generateAudio] is part of the signature so a caller has to say which video
 * it is pricing. Both answers currently use the with-audio rate — see
 * `vertexVideoRateUsdPerSecond` — so switching sound on can never take a
 * member past a ceiling that was sized for silent video. Omni's rate depends
 * on [resolution]; left out, the dearest one is charged.
 */
export function videoCostCents(
  model: string,
  durationSeconds: number,
  generateAudio = false,
  resolution?: string,
): number | null {
  const rate = vertexVideoRateUsdPerSecond(model, { generateAudio, resolution });
  if (rate === null) return null;
  return Math.ceil(rate * durationSeconds * 100);
}

// ---------------------------------------------------------------------------
// Media limits
// ---------------------------------------------------------------------------

export type MediaKind = 'image' | 'video' | 'audio';

/** Types Gemini on Vertex reads, narrowed to what a phone produces. */
export const ACCEPTED_MIME_TYPES: Record<MediaKind, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/mpeg'],
  audio: [
    'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/ogg',
    'audio/webm', 'audio/flac',
  ],
};

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-aac': 'audio/aac',
  'audio/x-flac': 'audio/flac',
};

export const MEDIA_LIMITS = {
  analysisBytes: {
    image: 20 * 1024 * 1024,
    video: 200 * 1024 * 1024,
    audio: 25 * 1024 * 1024,
  } as Record<MediaKind, number>,
  analysisVideoSeconds: 300,
  analysisAudioSeconds: 600,
  /** A spoken message, not a recording session. */
  transcriptionBytes: 10 * 1024 * 1024,
  transcriptionSeconds: 120,
  /** A reference image travels inline when small, by Cloud Storage URI when not. */
  referenceImageBytes: 20 * 1024 * 1024,
  promptChars: 2_000,
  negativePromptChars: 1_000,
  questionChars: 2_000,
} as const;

/**
 * Media at or under this size is sent inline; anything larger is handed to
 * Vertex as a `gs://` URI rather than an oversized base64 payload.
 */
export const INLINE_MEDIA_MAX_BYTES = 7 * 1024 * 1024;

/** The canonical MIME type, or '' when it is not one Kawuri accepts. */
export function normaliseMimeType(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const base = raw.split(';')[0].trim().toLowerCase();
  const canonical = MIME_ALIASES[base] ?? base;
  for (const list of Object.values(ACCEPTED_MIME_TYPES)) {
    if (list.includes(canonical)) return canonical;
  }
  return '';
}

export function mediaKindOf(mimeType: string): MediaKind | null {
  const canonical = normaliseMimeType(mimeType);
  if (!canonical) return null;
  return canonical.split('/')[0] as MediaKind;
}

const EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
  'video/mp4': ['mp4', 'm4v'],
  'video/quicktime': ['mov'],
  'video/webm': ['webm'],
  'video/3gpp': ['3gp'],
  'video/mpeg': ['mpeg', 'mpg'],
  'audio/mp4': ['m4a', 'mp4', 'aac'],
  'audio/aac': ['aac', 'm4a'],
  'audio/mpeg': ['mp3', 'mpeg'],
  'audio/wav': ['wav'],
  'audio/ogg': ['ogg', 'oga', 'opus'],
  'audio/webm': ['webm', 'weba'],
  'audio/flac': ['flac'],
};

/** Whether a file name's extension agrees with the type it was stored as. */
export function extensionMatches(fileName: string, mimeType: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return (EXTENSIONS[normaliseMimeType(mimeType)] ?? []).includes(extension);
}

// ---------------------------------------------------------------------------
// Storage paths
// ---------------------------------------------------------------------------

/**
 * Where the app uploads: `kawuri-uploads/{uid}/{purpose}/{uploadId}/{fileName}`.
 *
 * Temporary by design. The prefix is its own top-level folder, following the
 * project's `{feature}/{uid}` layout, so one bucket lifecycle rule can delete
 * abandoned uploads without a wildcard in the middle of a path.
 */
export const UPLOAD_ROOT = 'kawuri-uploads';

/** Finished creations: `kawuri-creations/{uid}/{taskId}/{fileName}`. Never expired. */
export const CREATION_ROOT = 'kawuri-creations';

export type UploadPurpose = 'audio' | 'media' | 'reference';

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export interface ParsedUploadPath {
  path: string;
  purpose: UploadPurpose;
  uploadId: string;
  fileName: string;
}

/** Reads and checks an upload path against the caller. Throws on anything else. */
export function assertUploadPath(
  raw: unknown,
  uid: string,
  purposes: readonly UploadPurpose[],
): ParsedUploadPath {
  const path = typeof raw === 'string' ? raw.trim() : '';
  const segments = path.split('/');
  if (
    segments.length !== 5
    || segments[0] !== UPLOAD_ROOT
    || segments[1] !== uid
    || !(purposes as readonly string[]).includes(segments[2])
    || !SAFE_SEGMENT.test(segments[3])
    || !SAFE_SEGMENT.test(segments[4])
    || path.includes('..')
  ) {
    throw kawuriError('PERMISSION_DENIED', 'Use a file you uploaded to Kawuri from this account.');
  }
  return {
    path,
    purpose: segments[2] as UploadPurpose,
    uploadId: segments[3],
    fileName: segments[4],
  };
}

export function creationPrefix(uid: string, taskId: string): string {
  return `${CREATION_ROOT}/${uid}/${taskId}/`;
}

export function creationPath(uid: string, taskId: string, name: string): string {
  return `${creationPrefix(uid, taskId)}${name}`;
}

/** Whether [path] is one of this member's own finished creations. */
export function isOwnCreationPath(path: string, uid: string): boolean {
  const segments = path.split('/');
  return segments.length === 4
    && segments[0] === CREATION_ROOT
    && segments[1] === uid
    && SAFE_SEGMENT.test(segments[2])
    && SAFE_SEGMENT.test(segments[3])
    && !path.includes('..');
}

export function extensionForMime(mimeType: string): string {
  const list = EXTENSIONS[normaliseMimeType(mimeType)];
  return list?.[0] ?? 'bin';
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

function objectOf(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw kawuriError('INVALID_REQUEST', 'The request must be an object.');
  }
  return raw as Record<string, unknown>;
}

function text(
  data: Record<string, unknown>,
  key: string,
  max: number,
  required: boolean,
): string {
  const value = typeof data[key] === 'string' ? (data[key] as string).trim() : '';
  if (required && !value) {
    throw kawuriError('INVALID_REQUEST', `${key} is required.`);
  }
  if (value.length > max) {
    throw kawuriError('INVALID_REQUEST', `${key} must be at most ${max} characters.`);
  }
  return value;
}

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;
const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * The idempotency key for a billable request.
 *
 * Generated once by the app when the member presses the button and reused on
 * every retry of that press, so a double tap or a dropped connection reads the
 * existing task instead of buying a second generation.
 */
export function parseRequestId(data: Record<string, unknown>): string {
  const requestId = typeof data.requestId === 'string' ? data.requestId.trim() : '';
  if (!REQUEST_ID.test(requestId)) {
    throw kawuriError(
      'INVALID_REQUEST',
      'requestId must contain 8–80 letters, numbers, underscores or hyphens.',
    );
  }
  return requestId;
}

function conversationIdOf(data: Record<string, unknown>): string {
  const value = typeof data.conversationId === 'string' ? data.conversationId.trim() : '';
  if (!value) return '';
  if (!CONVERSATION_ID.test(value)) {
    throw kawuriError('INVALID_REQUEST', 'conversationId is not valid.');
  }
  return value;
}

function taskIdOf(value: unknown, uid: string, key: string): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) return '';
  if (!id.startsWith(`${uid}_`) || id.length > 240 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw kawuriError('PERMISSION_DENIED', `${key} must be one of your own Kawuri tasks.`);
  }
  return id;
}

/** The Firestore id of a task, which is also its idempotency scope. */
export function taskIdFor(uid: string, requestId: string): string {
  return `${uid}_${requestId}`;
}

export interface ImageGenerationRequest {
  requestId: string;
  conversationId: string;
  prompt: string;
  aspectRatio: string;
  referenceImagePath: string | null;
  /** The task this one regenerates or edits, for the library's lineage. */
  sourceTaskId: string;
}

export function parseImageGenerationRequest(
  raw: unknown,
  uid: string,
  allowedAspectRatios: readonly string[],
): ImageGenerationRequest {
  const data = objectOf(raw);
  const requestId = parseRequestId(data);
  const prompt = text(data, 'prompt', MEDIA_LIMITS.promptChars, true);
  const aspectRatio = typeof data.aspectRatio === 'string' ? data.aspectRatio : '';
  if (!allowedAspectRatios.includes(aspectRatio)) {
    throw kawuriError(
      'INVALID_REQUEST',
      `Choose one of these shapes: ${allowedAspectRatios.join(', ')}.`,
    );
  }
  const reference = data.referenceImagePath == null || data.referenceImagePath === ''
    ? null
    : referenceImagePathOf(data.referenceImagePath, uid);
  return {
    requestId,
    conversationId: conversationIdOf(data),
    prompt,
    aspectRatio,
    referenceImagePath: reference,
    sourceTaskId: taskIdOf(data.sourceTaskId, uid, 'sourceTaskId'),
  };
}

/** A reference image is either a fresh upload or one of the member's own images. */
function referenceImagePathOf(raw: unknown, uid: string): string {
  const path = typeof raw === 'string' ? raw.trim() : '';
  if (isOwnCreationPath(path, uid)) return path;
  return assertUploadPath(path, uid, ['reference', 'media']).path;
}

export interface VideoGenerationRequest {
  requestId: string;
  conversationId: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: VideoAspectRatio;
  durationSeconds: number;
  resolution: string;
  referenceImagePath: string | null;
  /** `plan` asks for the plan model; the backend decides whether it is allowed. */
  quality: 'fast' | 'plan';
  /**
   * Whether the video gets a soundtrack — ambience, effects, music and any
   * speech.
   *
   * Only an explicit `true` turns it on. Builds up to 0.1.20 never send the
   * field and tell the member their video is "without sound", so an absent
   * flag has to keep meaning silent or those screens would start lying.
   */
  generateAudio: boolean;
  sourceTaskId: string;
}

/**
 * [allowedResolutions] is the model's own list (`videoResolutionsFor`), as
 * the capability manifest states it; it defaults to Veo's for old callers.
 */
export function parseVideoGenerationRequest(
  raw: unknown,
  uid: string,
  allowedDurations: readonly number[],
  allowedResolutions: Partial<Record<VideoAspectRatio, readonly string[]>> = VIDEO_RESOLUTIONS,
): VideoGenerationRequest {
  const data = objectOf(raw);
  const requestId = parseRequestId(data);
  if (data.confirmSpend !== true) {
    // The member must have seen and accepted that this spends a limited
    // generation. Checked before anything else about the request, so a client
    // that forgot the dialog cannot buy a video by accident.
    throw kawuriError('CONFIRMATION_REQUIRED');
  }
  const aspectRatio = data.aspectRatio;
  if (!(VIDEO_ASPECT_RATIOS as readonly unknown[]).includes(aspectRatio)) {
    throw kawuriError('INVALID_REQUEST', 'Video is made in portrait (9:16) or landscape (16:9).');
  }
  const durationSeconds = typeof data.durationSeconds === 'number' ? data.durationSeconds : Number.NaN;
  if (!allowedDurations.includes(durationSeconds)) {
    throw kawuriError(
      'INVALID_REQUEST',
      `Videos are ${allowedDurations.join(', ')} seconds long.`,
    );
  }
  const resolutions = allowedResolutions[aspectRatio as VideoAspectRatio] ?? [];
  const resolution = typeof data.resolution === 'string' && data.resolution
    ? data.resolution
    : resolutions[0];
  if (!resolutions.includes(resolution)) {
    throw kawuriError(
      'INVALID_REQUEST',
      `That shape is made at ${resolutions.join(' or ')}.`,
    );
  }
  const reference = data.referenceImagePath == null || data.referenceImagePath === ''
    ? null
    : referenceImagePathOf(data.referenceImagePath, uid);
  return {
    requestId,
    conversationId: conversationIdOf(data),
    prompt: text(data, 'prompt', MEDIA_LIMITS.promptChars, true),
    negativePrompt: text(data, 'negativePrompt', MEDIA_LIMITS.negativePromptChars, false),
    aspectRatio: aspectRatio as VideoAspectRatio,
    durationSeconds,
    resolution,
    referenceImagePath: reference,
    quality: data.quality === 'plan' ? 'plan' : 'fast',
    generateAudio: data.generateAudio === true,
    sourceTaskId: taskIdOf(data.sourceTaskId, uid, 'sourceTaskId'),
  };
}

export interface TranscriptionRequest {
  requestId: string;
  storagePath: string;
  language: 'en';
  declaredDurationSeconds: number;
}

/**
 * English only, stated by the request and checked here before anything is
 * read or billed. The transcript's own detected language is checked again
 * after the model call, so speaking Kasem into an "en" request is refused too.
 */
export function parseTranscriptionRequest(raw: unknown, uid: string): TranscriptionRequest {
  const data = objectOf(raw);
  const requestId = parseRequestId(data);
  const language = typeof data.language === 'string' ? data.language.trim().toLowerCase() : '';
  if (language !== 'en' && !/^en-[a-z]{2}$/.test(language)) {
    throw kawuriError('UNSUPPORTED_LANGUAGE');
  }
  const declared = typeof data.durationSeconds === 'number' ? data.durationSeconds : Number.NaN;
  if (!Number.isFinite(declared) || declared <= 0) {
    throw kawuriError('INVALID_MEDIA', 'The recording length is missing.');
  }
  if (declared > MEDIA_LIMITS.transcriptionSeconds) {
    throw kawuriError(
      'INVALID_MEDIA',
      `Voice messages can be up to ${MEDIA_LIMITS.transcriptionSeconds / 60} minutes long.`,
    );
  }
  return {
    requestId,
    storagePath: assertUploadPath(data.storagePath, uid, ['audio']).path,
    language: 'en',
    declaredDurationSeconds: declared,
  };
}

export const ANALYSIS_INTENTIONS = [
  'describe',
  'extract_text',
  'transcribe_english',
  'generate_captions',
  'summarise',
  'identify_objects',
  'suggest_metadata',
  'cultural_context',
  'suggest_tags',
  'check_quality',
] as const;
export type AnalysisIntention = (typeof ANALYSIS_INTENTIONS)[number];

export interface AnalysisRequest {
  requestId: string;
  conversationId: string;
  intention: AnalysisIntention;
  question: string;
  /** A new attachment. Null when continuing an earlier analysis. */
  storagePath: string | null;
  /** The analysis this question continues. '' for a new one. */
  followUpTaskId: string;
}

export function parseAnalysisRequest(raw: unknown, uid: string): AnalysisRequest {
  const data = objectOf(raw);
  const requestId = parseRequestId(data);
  const intention = data.intention;
  if (!(ANALYSIS_INTENTIONS as readonly unknown[]).includes(intention)) {
    throw kawuriError('INVALID_REQUEST', 'Choose what you would like Kawuri to do with the media.');
  }
  const followUpTaskId = taskIdOf(data.followUpTaskId, uid, 'followUpTaskId');
  const rawPath = typeof data.storagePath === 'string' ? data.storagePath.trim() : '';
  let storagePath: string | null = null;
  if (rawPath) {
    storagePath = isOwnCreationPath(rawPath, uid)
      ? rawPath
      : assertUploadPath(rawPath, uid, ['media']).path;
  }
  if (!storagePath && !followUpTaskId) {
    throw kawuriError('INVALID_MEDIA', 'Attach an image, video or audio file first.');
  }
  if (storagePath && followUpTaskId) {
    throw kawuriError('INVALID_REQUEST', 'Start a new analysis for a new file.');
  }
  return {
    requestId,
    conversationId: conversationIdOf(data),
    intention: intention as AnalysisIntention,
    question: text(data, 'question', MEDIA_LIMITS.questionChars, false),
    storagePath,
    followUpTaskId,
  };
}

/** The analysis task type for a kind of media. */
export function analysisTypeFor(kind: MediaKind): KawuriTaskType {
  return kind === 'image' ? 'image_analysis' : kind === 'video' ? 'video_analysis' : 'audio_analysis';
}

/**
 * The size and type a stored upload must have, checked against the object's
 * real metadata rather than anything the app claimed.
 */
export function checkStoredMedia(input: {
  contentType: unknown;
  size: unknown;
  fileName: string;
  allowedKinds: readonly MediaKind[];
  maxBytes: (kind: MediaKind) => number;
}): { mimeType: string; kind: MediaKind; sizeBytes: number } {
  const mimeType = normaliseMimeType(input.contentType);
  const kind = mimeType ? mediaKindOf(mimeType) : null;
  if (!kind || !input.allowedKinds.includes(kind)) {
    throw kawuriError('INVALID_MEDIA', `That file type is not supported here.`);
  }
  if (!extensionMatches(input.fileName, mimeType)) {
    throw kawuriError('INVALID_MEDIA', 'The file name does not match its type.');
  }
  const sizeBytes = Number(input.size);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw kawuriError('UPLOAD_MISSING', 'The file is empty or did not finish uploading.');
  }
  if (sizeBytes > input.maxBytes(kind)) {
    const megabytes = Math.round(input.maxBytes(kind) / (1024 * 1024));
    throw kawuriError('INVALID_MEDIA', `That file is larger than ${megabytes} MB.`);
  }
  return { mimeType, kind, sizeBytes };
}

// ---------------------------------------------------------------------------
// Media inspection without a dependency
// ---------------------------------------------------------------------------

/** Pixel size of a PNG, JPEG or WebP, or null when the header is not one. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: signature, then the IHDR chunk.
  if (
    bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: walk the segments to a start-of-frame marker.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }
  // WebP: RIFF container with a VP8, VP8L or VP8X chunk.
  if (
    bytes.length >= 30
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8X') {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
  }
  return null;
}

/**
 * Length of an MP4/M4A or WAV recording in seconds, or null when the container
 * is not one this can read.
 *
 * The app states a recording's length, but a statement is not a limit. Reading
 * the container's own header makes the two-minute ceiling a fact about the
 * file rather than about the request.
 */
export function mediaDurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));

  if (bytes.length >= 44 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') {
    let offset = 12;
    let byteRate = 0;
    while (offset + 8 <= bytes.length) {
      const id = ascii(offset, offset + 4);
      const size = view.getUint32(offset + 4, true);
      if (id === 'fmt ' && offset + 16 <= bytes.length) byteRate = view.getUint32(offset + 16, true);
      if (id === 'data') return byteRate > 0 ? size / byteRate : null;
      offset += 8 + size + (size % 2);
    }
    return null;
  }

  // ISO BMFF: find moov, then mvhd inside it.
  const findBox = (start: number, end: number, type: string): [number, number] | null => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      let header = 8;
      if (size === 1 && offset + 16 <= end) {
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header) return null;
      if (ascii(offset + 4, offset + 8) === type) return [offset + header, offset + size];
      offset += size;
    }
    return null;
  };
  if (bytes.length < 16 || ascii(4, 8) !== 'ftyp') return null;
  const moov = findBox(0, bytes.length, 'moov');
  if (!moov) return null;
  const mvhd = findBox(moov[0], Math.min(moov[1], bytes.length), 'mvhd');
  if (!mvhd || mvhd[0] + 32 > bytes.length) return null;
  const version = bytes[mvhd[0]];
  if (version === 1) {
    const timescale = view.getUint32(mvhd[0] + 20);
    const duration = Number(view.getBigUint64(mvhd[0] + 24));
    return timescale > 0 ? duration / timescale : null;
  }
  const timescale = view.getUint32(mvhd[0] + 12);
  const duration = view.getUint32(mvhd[0] + 16);
  return timescale > 0 ? duration / timescale : null;
}

/**
 * The MP4 duration from a *partial* read — the first and last few megabytes of
 * a file too large to download whole just to measure it.
 *
 * `moov` sits at the start of a fast-start file and at the end of most phone
 * recordings, so between them the head and tail nearly always contain `mvhd`.
 * Found by scanning for its type rather than by walking boxes, because a
 * partial buffer has no reliable offsets; the result is only trusted when the
 * timescale and length are both plausible.
 */
export function scanMp4Duration(...chunks: Uint8Array[]): number | null {
  for (const bytes of chunks) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 4; index + 36 <= bytes.length; index += 1) {
      if (
        bytes[index] !== 0x6d || bytes[index + 1] !== 0x76
        || bytes[index + 2] !== 0x68 || bytes[index + 3] !== 0x64
      ) {
        continue;
      }
      const content = index + 4;
      const version = bytes[content];
      if (version !== 0 && version !== 1) continue;
      const timescale = version === 1 ? view.getUint32(content + 20) : view.getUint32(content + 12);
      const duration = version === 1
        ? Number(view.getBigUint64(content + 24))
        : view.getUint32(content + 16);
      if (timescale < 1 || timescale > 1_000_000) continue;
      const seconds = duration / timescale;
      if (Number.isFinite(seconds) && seconds > 0 && seconds < 24 * 3600) return seconds;
    }
  }
  return null;
}

/** Gemini bills and measures audio at a fixed 32 tokens per second. */
export const AUDIO_TOKENS_PER_SECOND = 32;

export function audioSecondsFromUsage(usage: unknown): number | null {
  const details = (usage as Record<string, unknown> | undefined)?.promptTokensDetails;
  if (!Array.isArray(details)) return null;
  const audio = details.find((row) => (row as Record<string, unknown>)?.modality === 'AUDIO');
  const count = Number((audio as Record<string, unknown> | undefined)?.tokenCount);
  return Number.isFinite(count) && count > 0 ? Math.round(count / AUDIO_TOKENS_PER_SECOND) : null;
}

// ---------------------------------------------------------------------------
// Prompts and structured responses
// ---------------------------------------------------------------------------

export const TRANSCRIPTION_INSTRUCTION = `You transcribe one short voice message for a composer box.

Rules:
- Transcribe the spoken English exactly as intended, word for word.
- Add reasonable punctuation and capitalisation. Do not otherwise rewrite.
- Do not summarise, shorten, explain, answer or translate anything.
- Where a word or phrase is unclear, write [unclear] in its place and add a short note to unclearSegments. Never guess a word you did not hear.
- Names and words in other languages (for example Kasem) that you cannot spell with confidence are unclear segments; do not invent a spelling.
- Set language to the BCP-47 code of the language actually spoken for most of the message, for example "en". If the message is mostly not English, still return that code and leave transcript empty.
- Return only the JSON object described by the schema.`;

export const TRANSCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    transcript: { type: 'string' },
    language: { type: 'string' },
    unclearSegments: { type: 'array', items: { type: 'string' } },
    durationSeconds: { type: 'number' },
  },
  required: ['transcript', 'language', 'unclearSegments'],
} as const;

export interface TranscriptResult {
  transcript: string;
  language: 'en';
  unclearSegments: string[];
  durationSeconds: number;
}

function stringList(raw: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

/** Parses JSON a model returned, tolerating a stray code fence. */
export function parseModelJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const value = JSON.parse(trimmed) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * Checks a transcript before it reaches the composer.
 *
 * The English-only rule is enforced on what was *spoken*, not only on what the
 * request asked for — a model asked for English that hears Kasem must not hand
 * back an invented English rendering of it.
 */
export function validateTranscript(
  raw: Record<string, unknown> | null,
  measuredSeconds: number | null,
): TranscriptResult {
  if (!raw || typeof raw.transcript !== 'string' || typeof raw.language !== 'string') {
    throw kawuriError('GENERATION_FAILED', 'The transcript came back unreadable. Try again.');
  }
  const language = raw.language.trim().toLowerCase();
  if (language !== 'en' && !language.startsWith('en-')) {
    throw kawuriError('UNSUPPORTED_LANGUAGE');
  }
  const transcript = raw.transcript.trim().slice(0, 8_000);
  if (!transcript) {
    throw kawuriError('GENERATION_FAILED', 'No speech was heard in that recording.');
  }
  const reported = typeof raw.durationSeconds === 'number' && raw.durationSeconds > 0
    ? raw.durationSeconds
    : 0;
  return {
    transcript,
    language: 'en',
    unclearSegments: stringList(raw.unclearSegments, 20, 200),
    durationSeconds: Math.round(measuredSeconds ?? reported),
  };
}

const INTENTION_ASK: Record<AnalysisIntention, string> = {
  describe: 'Describe what the media shows or contains.',
  extract_text: 'Extract any visible or written text, exactly as it appears, into detectedText.',
  transcribe_english: 'Transcribe any spoken English into detectedText. Mark unclear words as [unclear]. Do not translate other languages; note them in confidenceNotes instead.',
  generate_captions: 'Write short, accurate captions for the media and put them in suggestedTopics as plain caption lines prefixed "Caption: ".',
  summarise: 'Summarise the media in a few sentences.',
  identify_objects: 'Identify visible objects and activities as observations.',
  suggest_metadata: 'Suggest contribution metadata: a title idea in summary, and topics, languages and observations that would help a reviewer.',
  cultural_context: 'Explain possible cultural context, keeping every interpretation tentative and clearly separated from what is directly observed.',
  suggest_tags: 'Suggest language and topic tags that fit what is actually present.',
  check_quality: 'Check media quality: lighting, focus, framing, noise, legibility and audio clarity, with practical fixes.',
};

/**
 * The analysis instruction. Its whole job is to stop confident claims the
 * media cannot support.
 */
export function analysisInstruction(intention: AnalysisIntention, dictionaryBlock = ''): string {
  return [
    `You are Kawuri, analysing one piece of media a member of Indigen World shared. Indigen World preserves Kasem and the culture of the Kassena people of northern Ghana and southern Burkina Faso.

Task: ${INTENTION_ASK[intention]}
If the member asked a question, answer it in "answer" using only what the media supports.

Keep these apart, always:
- observations: only what is directly visible or audible.
- possibleContext: likely interpretations, each worded tentatively ("may", "could").
- confidenceNotes: what is uncertain, what cannot be known from the media, and why.

Never state as fact, unless the media itself shows it unambiguously (for example a legible caption) or a DICTIONARY LOOKUP block below confirms it:
- who a person is, or their ethnic group
- which language is spoken or written
- what ritual, ceremony or sacred object is shown, or what it means
- where or when it was recorded, or which historical event it shows

Kasem words, spellings and translations must never be invented. If Kasem appears and no DICTIONARY LOOKUP confirms it, say that it needs checking by a speaker.
Set requiresCommunityVerification to true whenever possibleContext, suggestedLanguages or any cultural interpretation is present.
Do not identify real people by name or guess anyone's identity.
Plain text in every field. Return only the JSON object described by the schema.`,
    dictionaryBlock,
  ].filter(Boolean).join('\n\n');
}

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    answer: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
    possibleContext: { type: 'array', items: { type: 'string' } },
    detectedText: { type: 'array', items: { type: 'string' } },
    suggestedLanguages: { type: 'array', items: { type: 'string' } },
    suggestedTopics: { type: 'array', items: { type: 'string' } },
    confidenceNotes: { type: 'array', items: { type: 'string' } },
    requiresCommunityVerification: { type: 'boolean' },
  },
  required: [
    'summary',
    'observations',
    'possibleContext',
    'detectedText',
    'suggestedLanguages',
    'suggestedTopics',
    'confidenceNotes',
    'requiresCommunityVerification',
  ],
} as const;

export interface AnalysisResult {
  summary: string;
  answer: string;
  observations: string[];
  possibleContext: string[];
  detectedText: string[];
  suggestedLanguages: string[];
  suggestedTopics: string[];
  confidenceNotes: string[];
  requiresCommunityVerification: boolean;
}

/**
 * Checks an analysis and caps it to a size a Firestore document can hold.
 *
 * `requiresCommunityVerification` is forced on whenever the result carries an
 * interpretation or a language guess, whatever the model said: that flag is a
 * promise to the member, and a model is not the party that gets to waive it.
 */
export function validateAnalysis(raw: Record<string, unknown> | null): AnalysisResult {
  if (!raw || typeof raw.summary !== 'string') {
    throw kawuriError('GENERATION_FAILED', 'The analysis came back unreadable. Try again.');
  }
  const result: AnalysisResult = {
    summary: raw.summary.trim().slice(0, 1_500),
    answer: typeof raw.answer === 'string' ? raw.answer.trim().slice(0, 3_000) : '',
    observations: stringList(raw.observations, 20, 500),
    possibleContext: stringList(raw.possibleContext, 12, 500),
    detectedText: stringList(raw.detectedText, 30, 1_500),
    suggestedLanguages: stringList(raw.suggestedLanguages, 8, 80),
    suggestedTopics: stringList(raw.suggestedTopics, 15, 160),
    confidenceNotes: stringList(raw.confidenceNotes, 12, 500),
    requiresCommunityVerification: raw.requiresCommunityVerification !== false,
  };
  if (result.possibleContext.length > 0 || result.suggestedLanguages.length > 0) {
    result.requiresCommunityVerification = true;
  }
  if (!result.summary && !result.answer && result.observations.length === 0) {
    throw kawuriError('GENERATION_FAILED', 'Kawuri could not say anything about that file.');
  }
  return result;
}

/** Earlier turns of one analysis, kept small enough to resend. */
export const MAX_ANALYSIS_TURNS = 8;

// ---------------------------------------------------------------------------
// Pre-generation screening
// ---------------------------------------------------------------------------

export const MODERATION_CATEGORIES = [
  'none',
  'real_person',
  'minor',
  'sexual',
  'graphic_violence',
  'hate_or_harassment',
  'self_harm',
  'dangerous_or_illegal',
  'realistic_news_or_politics',
  'sacred_or_restricted',
  'other',
] as const;
export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

/**
 * The screen every image and video request passes before a generation is
 * bought.
 *
 * Vertex's own filters are the backstop, not the policy: on 2026-09-14 they
 * produced a photorealistic image of a "head of state being arrested, with
 * injuries" without complaint. That is not an image Indigen World should make
 * for anyone, so the platform's own rules are applied first, by a model that
 * is told them.
 */
export const MODERATION_INSTRUCTION = `You screen requests to the image and video generator inside Indigen World, a platform that preserves the Kasem language and the culture of the Kassena people of northern Ghana and southern Burkina Faso.

Children are welcome in ordinary scenes. Folktales, family life, school, play, farming, markets, festivals and lessons all have children in them, and an invented child in a scene like that is allowed.

Refuse (allowed=false) when the request, the negative prompt or the attached reference image would produce:
- a real, identifiable person, named or recognisable, including public figures, or a reference photo of a real person — adult or child — to be altered or animated (real_person)
- anyone who appears to be a child in a sexual, suggestive, revealing or romantic context, or being harmed, abused, endangered, frightened or in distress (minor)
- sexual content or nudity (sexual)
- graphic violence, gore or visible injuries (graphic_violence)
- hate, harassment or demeaning stereotypes of any people, including the Kassena or any ethnic group (hate_or_harassment)
- self-harm (self_harm)
- weapons, drugs or dangerous or illegal activity shown approvingly (dangerous_or_illegal)
- realistic scenes of news events, crimes, disasters, elections or political figures that could be mistaken for real footage (realistic_news_or_politics)
- sacred rites, shrines, masks or ceremonies presented as authentic documentation of a real community (sacred_or_restricted)

Allow ordinary creative work described respectfully: invented characters of any age, families, landscapes, architecture, painted compounds, crafts, food, music, markets, farming, festivals and folktales shown as illustration.

A child in the scene is not by itself a reason to refuse. Refuse only when one of the rules above applies. When a rule might apply and you are unsure, refuse. Return only the JSON object described by the schema, with a short, neutral reason that does not repeat the request.`;

export const MODERATION_SCHEMA = {
  type: 'object',
  properties: {
    allowed: { type: 'boolean' },
    category: { type: 'string', enum: [...MODERATION_CATEGORIES] },
    reason: { type: 'string' },
  },
  required: ['allowed', 'category', 'reason'],
} as const;

export interface ModerationVerdict {
  allowed: boolean;
  category: ModerationCategory;
}

/**
 * Reads a screening verdict. Anything unreadable is a refusal: a screen that
 * lets a request through because it could not parse its own answer is not a
 * screen.
 */
export function readModeration(raw: Record<string, unknown> | null): ModerationVerdict {
  if (!raw || typeof raw.allowed !== 'boolean') {
    throw kawuriError('GENERATION_FAILED', 'Kawuri could not check this request. Try again.');
  }
  const category = (MODERATION_CATEGORIES as readonly unknown[]).includes(raw.category)
    ? raw.category as ModerationCategory
    : 'other';
  // A verdict that names a problem is a refusal, whatever the flag says.
  const allowed = raw.allowed && (category === 'none');
  return { allowed, category: allowed ? 'none' : category === 'none' ? 'other' : category };
}

export function moderationMessage(category: ModerationCategory): string {
  switch (category) {
    case 'real_person':
      return 'Kawuri does not create images or videos of real, identifiable people. Try an invented character instead.';
    case 'minor':
      return 'Children can appear in Kawuri’s images and videos, but never in sexual, violent, abusive or frightening scenes.';
    case 'realistic_news_or_politics':
      return 'Kawuri does not create realistic scenes of news, politics or public figures that could be mistaken for real.';
    case 'sacred_or_restricted':
      return 'Sacred and restricted practices are not generated as if they were real documentation. Try an illustration instead, or ask the community.';
    default:
      return publicMessageFor('SAFETY_REJECTED');
  }
}

// ---------------------------------------------------------------------------
// Reading Vertex responses
// ---------------------------------------------------------------------------

const SAFETY_FINISH_REASONS = new Set([
  'SAFETY',
  'IMAGE_SAFETY',
  'PROHIBITED_CONTENT',
  'IMAGE_PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_RECITATION',
]);

export type ImageOutcome =
  | { kind: 'images'; images: { mimeType: string; base64: string }[]; text: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'empty'; reason: string };

/** What an image `generateContent` response delivered. */
export function readImageResponse(response: unknown): ImageOutcome {
  const payload = response && typeof response === 'object'
    ? response as Record<string, unknown>
    : {};
  const feedback = payload.promptFeedback as Record<string, unknown> | undefined;
  if (typeof feedback?.blockReason === 'string' && feedback.blockReason) {
    return { kind: 'rejected', reason: feedback.blockReason };
  }
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = (candidates[0] ?? {}) as Record<string, unknown>;
  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? content.parts as Record<string, unknown>[] : [];
  const images: { mimeType: string; base64: string }[] = [];
  const texts: string[] = [];
  for (const part of parts) {
    const inline = part.inlineData as Record<string, unknown> | undefined;
    if (inline && typeof inline.data === 'string' && inline.data) {
      const mimeType = typeof inline.mimeType === 'string' ? inline.mimeType : 'image/png';
      if (mimeType.startsWith('image/')) images.push({ mimeType, base64: inline.data });
    } else if (typeof part.text === 'string' && part.thought !== true) {
      texts.push(part.text);
    }
  }
  const finishReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : '';
  if (images.length > 0) {
    return { kind: 'images', images, text: texts.join('').trim().slice(0, 1_000) };
  }
  if (SAFETY_FINISH_REASONS.has(finishReason)) {
    return { kind: 'rejected', reason: finishReason };
  }
  return { kind: 'empty', reason: finishReason || 'NO_IMAGE' };
}

/**
 * Whether Vertex refused a request because of its person-generation setting,
 * rather than because of anything in the prompt.
 *
 * Generating children needs `allow_all`, and on Vertex that value is gated:
 * Veo accepts it only for projects Google has allow-listed, and a model that
 * does not support it at all answers with an invalid-argument naming the
 * parameter. Neither is a safety verdict on the member's request, and neither
 * is billed, so the adapter steps down to adults-only instead of failing.
 */
export function isPersonGenerationRefusal(message: string): boolean {
  return /person_?generation|allow_all|allow-?list|minors? (are )?not (supported|allowed)|generation of (children|minors)/i
    .test(message);
}

export type VideoOutcome =
  | { state: 'running'; progress: number | null }
  | { state: 'failed'; code: KawuriErrorCode; message: string; personGenerationRefused?: boolean }
  | { state: 'rejected'; reasons: string[] }
  | { state: 'succeeded'; base64: string | null; uri: string | null; mimeType: string };

/**
 * What a Veo long-running operation says, as SDK objects deliver it.
 *
 * Progress is only reported when Vertex itself puts a percentage in the
 * operation metadata. Veo normally does not, and inventing one from elapsed
 * time would be the "42%" the app must never show without a source.
 */
export function readVideoOperation(operation: unknown): VideoOutcome {
  const op = operation && typeof operation === 'object'
    ? operation as Record<string, unknown>
    : {};
  if (op.done !== true) {
    const metadata = op.metadata as Record<string, unknown> | undefined;
    const raw = Number(metadata?.progressPercent ?? metadata?.progress_percent);
    const progress = Number.isFinite(raw) && raw > 0 && raw <= 100 ? Math.round(raw) : null;
    return { state: 'running', progress };
  }
  if (op.error && typeof op.error === 'object') {
    const error = op.error as Record<string, unknown>;
    const code = Number(error.code);
    const message = typeof error.message === 'string' ? error.message : '';
    // gRPC codes on a finished operation: 3 invalid argument, 8 exhausted.
    if (code === 3 && /safety|responsible|guidelines|prohibited|blocked|filtered/i.test(message)) {
      return { state: 'rejected', reasons: ['SAFETY'] };
    }
    return {
      state: 'failed',
      code: code === 8 ? 'QUOTA_EXCEEDED' : code === 4 ? 'OPERATION_TIMEOUT' : 'GENERATION_FAILED',
      message: publicMessageFor(code === 8 ? 'QUOTA_EXCEEDED' : 'GENERATION_FAILED'),
      ...(code === 3 && isPersonGenerationRefusal(message) ? { personGenerationRefused: true } : {}),
    };
  }
  const response = op.response && typeof op.response === 'object'
    ? op.response as Record<string, unknown>
    : {};
  const videos = Array.isArray(response.generatedVideos)
    ? response.generatedVideos
    : Array.isArray(response.videos) ? response.videos : [];
  for (const raw of videos) {
    const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const video = entry.video && typeof entry.video === 'object'
      ? entry.video as Record<string, unknown>
      : entry;
    const base64 = typeof video.videoBytes === 'string' && video.videoBytes
      ? video.videoBytes
      : typeof video.bytesBase64Encoded === 'string' && video.bytesBase64Encoded
        ? video.bytesBase64Encoded
        : null;
    const uri = typeof video.uri === 'string' && video.uri
      ? video.uri
      : typeof video.gcsUri === 'string' && video.gcsUri ? video.gcsUri : null;
    if (base64 || uri) {
      return {
        state: 'succeeded',
        base64,
        uri,
        mimeType: typeof video.mimeType === 'string' && video.mimeType ? video.mimeType : 'video/mp4',
      };
    }
  }
  const reasons = Array.isArray(response.raiMediaFilteredReasons)
    ? response.raiMediaFilteredReasons.filter((r): r is string => typeof r === 'string')
    : [];
  if (Number(response.raiMediaFilteredCount ?? 0) > 0 || reasons.length > 0) {
    return { state: 'rejected', reasons };
  }
  return {
    state: 'failed',
    code: 'GENERATION_FAILED',
    message: 'The video finished without a file. Nothing was delivered.',
  };
}

/**
 * What a Gemini Omni interaction says, in the same terms as a Veo operation.
 *
 * Omni reports no progress at all, so none is ever shown. A policy refusal is
 * a rejection — the member is told to describe it differently — and anything
 * else that ends without a video is a failure with the stable message, never
 * Google's text: that text can quote the member's prompt.
 */
export function readOmniVideo(interaction: unknown): VideoOutcome {
  const outcome = readOmniInteraction(interaction);
  switch (outcome.state) {
    case 'running':
      return { state: 'running', progress: null };
    case 'succeeded':
      return { state: 'succeeded', base64: outcome.base64, uri: outcome.uri, mimeType: outcome.mimeType };
    case 'rejected':
      return { state: 'rejected', reasons: ['SAFETY'] };
    case 'failed':
      return outcome.quota
        ? { state: 'failed', code: 'QUOTA_EXCEEDED', message: publicMessageFor('QUOTA_EXCEEDED') }
        : { state: 'failed', code: 'GENERATION_FAILED', message: publicMessageFor('GENERATION_FAILED') };
    case 'cancelled':
      return {
        state: 'failed',
        code: 'GENERATION_FAILED',
        message: 'The video was stopped before it finished. Nothing was delivered.',
      };
  }
}

// ---------------------------------------------------------------------------
// Timeouts and recovery
// ---------------------------------------------------------------------------

/** How long a task may stay unfinished before the sweep gives up on it. */
export const TASK_TIMEOUT_MS: Record<KawuriTaskType, number> = {
  image_generation: 10 * 60_000,
  // Matches the Studio: Omni finishes in a minute or two (ten seconds of
  // 1080p took 95 s), so half an hour is a lost job.
  video_generation: 30 * 60_000,
  speech_to_text: 5 * 60_000,
  image_analysis: 10 * 60_000,
  video_analysis: 15 * 60_000,
  audio_analysis: 15 * 60_000,
};

/** A video with no operation name after this long never reached Vertex. */
export const UNSUBMITTED_VIDEO_TIMEOUT_MS = 5 * 60_000;

export interface StaleOutcome {
  status: 'failed' | 'expired';
  errorCode: KawuriErrorCode;
  errorMessage: string;
}

/**
 * Whether an unfinished task has waited too long, and how it should end.
 *
 * Pure so "never generating forever" is a tested rule rather than a hope. The
 * clock is `updatedAt` for processing (an import in progress keeps touching
 * it) and `createdAt` otherwise.
 */
export function staleOutcome(
  task: Record<string, unknown>,
  now: number,
): StaleOutcome | null {
  if (!(IN_FLIGHT_TASK_STATUSES as readonly unknown[]).includes(task.status)) return null;
  const type = task.type as KawuriTaskType;
  const timeout = TASK_TIMEOUT_MS[type];
  if (!timeout) return null;
  const createdAt = Date.parse(String(task.createdAt ?? ''));
  if (!Number.isFinite(createdAt)) return null;
  if (
    type === 'video_generation'
    && !task.operationName
    && now - createdAt > UNSUBMITTED_VIDEO_TIMEOUT_MS
  ) {
    return {
      status: 'failed',
      errorCode: 'GENERATION_FAILED',
      errorMessage: 'This video never started, so nothing was generated. Try again.',
    };
  }
  if (now - createdAt <= timeout) return null;
  return {
    status: 'failed',
    errorCode: 'OPERATION_TIMEOUT',
    errorMessage: publicMessageFor('OPERATION_TIMEOUT'),
  };
}

/** A video is polled from a status check at most this often. */
export const MIN_POLL_INTERVAL_MS = 15_000;

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export interface CapabilityContext {
  config: KawuriMediaConfig;
  signedIn: boolean;
  /** Approved creator, or a plan with creator tools. */
  videoEligible: boolean;
  /** A plan that may use the standard video model. */
  videoPlanModelAllowed: boolean;
  /** Models that recently answered "unavailable". */
  unhealthy: ReadonlySet<string>;
}

export type UnavailableReason =
  | 'not_configured'
  | 'disabled'
  | 'sign_in_required'
  | 'not_eligible'
  | 'model_unavailable';

/**
 * The manifest the app draws Kawuri from.
 *
 * Built from configuration and this instance's recent experience of each
 * model, never from what the app would like to show. A capability that is off
 * says why, so the app can hide it or explain it instead of letting a member
 * reach a final button with nothing behind it.
 */
export function buildCapabilities(context: CapabilityContext) {
  const { config, signedIn, unhealthy } = context;
  const reasons: Partial<Record<CapabilityName, UnavailableReason>> = {};
  const anyHealthy = (models: readonly string[]) => models.some((model) => !unhealthy.has(model));

  const decide = (
    name: CapabilityName,
    models: readonly string[],
    extra: UnavailableReason | null = null,
  ): boolean => {
    let reason: UnavailableReason | null = null;
    if (!config.project || models.length === 0) reason = 'not_configured';
    else if (config.disabled.has(name)) reason = 'disabled';
    else if (!anyHealthy(models)) reason = 'model_unavailable';
    else if (!signedIn) reason = 'sign_in_required';
    else if (extra) reason = extra;
    if (reason) reasons[name] = reason;
    return reason === null;
  };

  const imageRatios = [...new Set(config.imageModels.flatMap(imageAspectRatiosFor))];
  const imageModels = config.imageModels.filter((model) => imageAspectRatiosFor(model).length > 0);
  const durations = videoDurationsFor(config.videoModel);

  const imageGeneration = decide('imageGeneration', imageModels);
  const videoGeneration = decide(
    'videoGeneration',
    durations.length > 0 ? [config.videoModel] : [],
    context.videoEligible ? null : 'not_eligible',
  );
  const speechToText = decide('speechToText', config.transcriptionModels);
  const mediaAnalysis = decide('mediaAnalysis', config.analysisModels);

  const planModelOffered = videoGeneration
    && context.videoPlanModelAllowed
    && Boolean(config.videoPlanModel)
    && videoDurationsFor(config.videoPlanModel).length > 0
    && !unhealthy.has(config.videoPlanModel);

  return {
    provider: 'vertex' as const,
    chat: Boolean(config.project),
    translation: Boolean(config.project),
    imageGeneration,
    videoGeneration,
    speechToText,
    mediaAnalysis,
    unavailableReasons: reasons,
    speechToTextLanguages: speechToText ? ['en'] : [],
    imageAspectRatios: imageGeneration ? imageRatios : [],
    imageOutputCounts: imageGeneration ? [1] : [],
    imageReferenceInput: imageGeneration,
    videoAspectRatios: videoGeneration ? [...VIDEO_ASPECT_RATIOS] : [],
    videoDurations: videoGeneration ? durations : [],
    videoResolutions: videoGeneration ? videoResolutionsFor(config.videoModel) : {},
    videoReferenceImage: videoGeneration,
    // Omni has no negative-prompt field; the adapter says it in the prompt.
    videoNegativePrompt: videoGeneration,
    videoQualityOptions: videoGeneration ? (planModelOffered ? ['fast', 'plan'] : ['fast']) : [],
    // Tells the app it may offer the sound switch. A backend without this
    // flag makes every video silent, and an app that offered the switch to it
    // would be promising a soundtrack nobody asked the model for.
    videoAudio: videoGeneration,
    videoRequiresConfirmation: true,
    analysisIntentions: mediaAnalysis ? [...ANALYSIS_INTENTIONS] : [],
    analysisMediaTypes: mediaAnalysis ? ['image', 'video', 'audio'] : [],
    limits: {
      promptChars: MEDIA_LIMITS.promptChars,
      negativePromptChars: MEDIA_LIMITS.negativePromptChars,
      questionChars: MEDIA_LIMITS.questionChars,
      transcriptionSeconds: MEDIA_LIMITS.transcriptionSeconds,
      transcriptionBytes: MEDIA_LIMITS.transcriptionBytes,
      referenceImageBytes: MEDIA_LIMITS.referenceImageBytes,
      analysisBytes: MEDIA_LIMITS.analysisBytes,
      analysisVideoSeconds: MEDIA_LIMITS.analysisVideoSeconds,
      analysisAudioSeconds: MEDIA_LIMITS.analysisAudioSeconds,
      acceptedMimeTypes: ACCEPTED_MIME_TYPES,
    },
  };
}

export type KawuriCapabilities = ReturnType<typeof buildCapabilities>;

// ---------------------------------------------------------------------------
// The task record
// ---------------------------------------------------------------------------

export interface MediaReference {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  aiGenerated?: boolean;
}

export function newTaskRecord(input: {
  id: string;
  uid: string;
  type: KawuriTaskType;
  requestId: string;
  conversationId: string;
  status: KawuriTaskStatus;
  model: string;
  prompt?: string;
  negativePrompt?: string;
  sourceMedia?: MediaReference[];
  aspectRatio?: string | null;
  duration?: number | null;
  resolution?: string | null;
  generateAudio?: boolean | null;
  language?: string | null;
  intention?: string | null;
  sourceTaskId?: string;
  now: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    userId: input.uid,
    requestId: input.requestId,
    conversationId: input.conversationId,
    type: input.type,
    category: categoryForTask(input.type),
    listed: isListedTask(input.type),
    status: input.status,
    model: input.model,
    provider: 'vertex',
    prompt: input.prompt ?? '',
    negativePrompt: input.negativePrompt ?? '',
    sourceMedia: input.sourceMedia ?? [],
    outputMedia: [],
    operationName: null,
    progress: null,
    aspectRatio: input.aspectRatio ?? null,
    duration: input.duration ?? null,
    resolution: input.resolution ?? null,
    generateAudio: input.generateAudio ?? null,
    language: input.language ?? null,
    intention: input.intention ?? null,
    sourceTaskId: input.sourceTaskId ?? '',
    result: null,
    turns: [],
    errorCode: null,
    errorMessage: null,
    moderationStatus: 'pending',
    aiGenerated: input.type === 'image_generation' || input.type === 'video_generation',
    billed: false,
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: null,
  };
}

/** The fields the app may see. Leases, attempts and billing flags stay home. */
export function publicTask(data: Record<string, unknown>) {
  return {
    id: data.id,
    userId: data.userId,
    conversationId: data.conversationId ?? '',
    type: data.type,
    category: data.category,
    status: data.status,
    model: data.model,
    provider: data.provider,
    prompt: data.prompt ?? '',
    negativePrompt: data.negativePrompt ?? '',
    sourceMedia: data.sourceMedia ?? [],
    outputMedia: data.outputMedia ?? [],
    operationName: data.operationName ? true : null,
    progress: data.progress ?? null,
    aspectRatio: data.aspectRatio ?? null,
    duration: data.duration ?? null,
    resolution: data.resolution ?? null,
    generateAudio: typeof data.generateAudio === 'boolean' ? data.generateAudio : null,
    language: data.language ?? null,
    intention: data.intention ?? null,
    sourceTaskId: data.sourceTaskId ?? '',
    result: data.result ?? null,
    turns: data.turns ?? [],
    errorCode: data.errorCode ?? null,
    errorMessage: data.errorMessage ?? null,
    moderationStatus: data.moderationStatus ?? 'pending',
    aiGenerated: data.aiGenerated === true,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    completedAt: data.completedAt ?? null,
  };
}

/**
 * Which actions a task in its current state supports, so the app's overflow
 * menu can never offer something the backend will refuse.
 */
export function actionsForTask(task: { type: unknown; status: unknown }): string[] {
  const status = String(task.status);
  const generated = task.type === 'image_generation' || task.type === 'video_generation';
  if (!isTerminalTaskStatus(status)) return ['cancel'];
  if (status === 'ready') {
    if (task.type === 'image_generation') {
      return ['download', 'share', 'regenerate', 'edit_prompt', 'use_in_contribution', 'use_as_reel_cover', 'delete'];
    }
    if (task.type === 'video_generation') {
      return ['play', 'download', 'share', 'regenerate', 'edit_prompt', 'use_in_reel', 'use_in_contribution', 'delete'];
    }
    return ['ask_follow_up', 'delete'];
  }
  return generated ? ['retry', 'edit_prompt', 'delete'] : ['delete'];
}
