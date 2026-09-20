/**
 * Gemini Omni video, as rules rather than calls.
 *
 * Omni replaced Veo as the Google video model behind both the Studio and
 * Kawuri on 2026-09-19. It is reached through Vertex AI's Interactions API
 * instead of Veo's long-running predict operations, so both the request and the
 * finished job look different, and this module is the one place that knows
 * those shapes. Firebase-free, like the two policy modules that use it, so the
 * shapes are pinned by tests rather than discovered by a creator.
 *
 * Measured against `project-kassena-7e026` on 2026-09-19:
 *   * `gemini-omni-1.1-flash-preview` answers on the `global` endpoint only.
 *   * A background create answers in about 1.5 s with `{ id, status:
 *     'in_progress' }`. The first call of the day took 29 s.
 *   * A finished interaction carries the MP4 inline, base64, in a
 *     `model_output` step: ten seconds of portrait 1080p was 13 MB of video
 *     inside 17 MB of JSON, rendered in about 95 s.
 *   * A failed one says `status: 'failed'` and explains itself in `errors[]`,
 *     e.g. `content_blocked` for a policy refusal. A refusal bills only the
 *     prompt and the model's thinking, never video.
 *   * Every video has an AAC soundtrack. There is no switch to turn it off,
 *     only the prompt; asking for silence measured −66 dB mean, against −42 dB
 *     for a gentle ambience.
 */

export const OMNI_VIDEO_MODELS = ['gemini-omni-1.1-flash-preview'] as const;
export type OmniVideoModel = (typeof OMNI_VIDEO_MODELS)[number];

/** Omni is served from the global endpoint only, whatever region Veo used. */
export const OMNI_LOCATION = 'global';
export const OMNI_API_VERSION = 'v1beta1';

export function isOmniVideoModel(model: unknown): model is OmniVideoModel {
  return (OMNI_VIDEO_MODELS as readonly unknown[]).includes(model);
}

/**
 * Lengths offered. Omni takes any whole number of seconds from 3 to 10; these
 * four keep Veo's 4, 6 and 8, so a Kawuri regenerate of an older video keeps
 * its length, and add the 10 Veo could not make.
 */
export const OMNI_DURATIONS: readonly number[] = [4, 6, 8, 10];

/** Both orientations at both resolutions: unlike Veo, Omni makes 1080p portrait. */
export const OMNI_RESOLUTIONS = ['720p', '1080p'] as const;
export type OmniResolution = (typeof OMNI_RESOLUTIONS)[number];

export function isOmniResolution(value: unknown): value is OmniResolution {
  return (OMNI_RESOLUTIONS as readonly unknown[]).includes(value);
}

/**
 * USD per second of output, for the spending ceilings.
 *
 * Google bills Omni in tokens: $17.50 per million video-output tokens, at 5,792
 * tokens a second of 720p and 8,688 of 1080p ($0.1014 and $0.1520), plus the
 * model's thinking at $9 per million and the prompt at $1.50 per million (an
 * image is 1,120 tokens). Thinking measured 200–450 tokens a video, under half
 * a cent, so each rate carries a fifth of a cent a second on top and is then
 * rounded up, never down, because these numbers bound what may be spent.
 */
export const OMNI_RATE_USD_PER_SECOND: Record<OmniResolution, number> = {
  '720p': 0.104,
  '1080p': 0.155,
};

export function omniRateUsdPerSecond(resolution: string): number | null {
  return isOmniResolution(resolution) ? OMNI_RATE_USD_PER_SECOND[resolution] : null;
}

/**
 * Said in words because Omni has no parameter for it. Wording measured live:
 * it came back at −66 dB mean, which no one hears.
 */
export const OMNI_SILENCE_INSTRUCTION = 'This is a silent video: the audio track is complete silence. '
  + 'No dialogue, no speech, no narration, no singing, no music, no sound effects, no ambient sound.';

/** Veo's `personGeneration: 'allow_adult'`, which Omni also lacks. */
export const OMNI_ADULTS_ONLY_INSTRUCTION = 'Everyone shown is an adult. No children or teenagers appear.';

export type OmniSound = 'natural' | 'silent';

/**
 * The prompt Omni is sent.
 *
 * Omni has no negative-prompt field, no soundtrack switch and no
 * person-generation setting. Its own guide says to put such things in the
 * prompt, so each is appended in plain words after what the person asked for.
 */
export function omniPrompt(input: {
  prompt: string;
  negativePrompt?: string;
  sound: OmniSound;
  adultsOnly?: boolean;
}): string {
  const parts = [input.prompt.trim()];
  const negative = (input.negativePrompt ?? '').trim().replace(/[\s.]+$/, '');
  if (negative) parts.push(`Do not include: ${negative}.`);
  if (input.adultsOnly) parts.push(OMNI_ADULTS_ONLY_INSTRUCTION);
  if (input.sound === 'silent') parts.push(OMNI_SILENCE_INSTRUCTION);
  return parts.join('\n\n');
}

export interface OmniImage {
  mimeType: string;
  base64?: string;
  gcsUri?: string;
}

/** The body of one background video interaction. */
export function omniRequestBody(input: {
  model: OmniVideoModel;
  /** Built with `omniPrompt`. */
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  resolution: OmniResolution;
  durationSeconds: number;
  /** The first frame, when there is one. */
  image: OmniImage | null;
}): Record<string, unknown> {
  const image = input.image
    ? input.image.base64
      ? { type: 'image', data: input.image.base64, mime_type: input.image.mimeType }
      : { type: 'image', uri: input.image.gcsUri, mime_type: input.image.mimeType }
    : null;
  return {
    model: input.model,
    // Answers at once with an id, as Veo answered with an operation name. The
    // default is synchronous, which would hold the request open for the whole
    // render: a minute and a half for ten seconds of 1080p.
    background: true,
    input: [{ type: 'text', text: input.prompt }, ...(image ? [image] : [])],
    response_format: [{
      type: 'video',
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      duration: `${input.durationSeconds}s`,
    }],
    // Named rather than inferred: with an image, it is the opening frame (as
    // it was for Veo and Runway), not a loose style reference.
    generation_config: {
      video_config: { task: input.image ? 'image_to_video' : 'text_to_video' },
    },
  };
}

export type OmniOutcome =
  | { state: 'running' }
  | { state: 'succeeded'; base64: string | null; uri: string | null; mimeType: string }
  | { state: 'rejected'; reason: string }
  | { state: 'failed'; reason: string; quota: boolean }
  | { state: 'cancelled'; reason: string };

const REFUSAL_CODES = new Set(['content_blocked', 'safety_blocked', 'prohibited_content']);
const REFUSAL_TEXT = /blocked|policy|safety|prohibited|responsible ai|guidelines|violat|third[- ]party|content providers?/i;
const QUOTA_TEXT = /quota|resource[_ ]exhausted|rate limit|too many requests/i;

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

/** The first error the interaction reports, from `errors[]` or `error`. */
function firstError(data: Record<string, unknown>): { code: string; message: string } {
  const candidates = [
    ...(Array.isArray(data.errors) ? data.errors : []),
    ...(data.error ? [data.error] : []),
  ];
  for (const raw of candidates) {
    const error = record(raw);
    const message = typeof error.message === 'string' ? error.message.trim() : '';
    const code = typeof error.code === 'string' ? error.code : String(error.code ?? '');
    if (message || code) return { code, message };
  }
  return { code: '', message: '' };
}

/** The video in a finished interaction, wherever the response put it. */
function videoOf(data: Record<string, unknown>): Record<string, unknown> | null {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  for (const rawStep of steps) {
    const step = record(rawStep);
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const rawContent of step.content) {
      const content = record(rawContent);
      if (content.type === 'video' && (content.data || content.uri)) return content;
    }
  }
  // The SDK's convenience copy of the same thing, for a response it built.
  const convenience = record(data.output_video);
  return convenience.data || convenience.uri ? convenience : null;
}

/**
 * What an interaction says about its video.
 *
 * Status is the source of truth: `in_progress` is still working, and the other
 * five are all final. `requires_action` and `incomplete` cannot produce a video
 * from a request with no tools, so they are failures rather than waits — a
 * status this function does not know is the only thing still read as running,
 * and the callers' half-hour limit ends that.
 */
export function readOmniInteraction(raw: unknown): OmniOutcome {
  const data = record(raw);
  const status = typeof data.status === 'string' ? data.status : '';
  if (status === 'completed') {
    const video = videoOf(data);
    if (!video) {
      return { state: 'failed', reason: 'Gemini finished without returning a video.', quota: false };
    }
    const base64 = typeof video.data === 'string' && video.data ? video.data : null;
    const uri = typeof video.uri === 'string' && video.uri ? video.uri : null;
    const mimeType = typeof video.mime_type === 'string' && video.mime_type
      ? video.mime_type
      : typeof video.mimeType === 'string' && video.mimeType ? video.mimeType : 'video/mp4';
    return { state: 'succeeded', base64, uri, mimeType };
  }
  if (status === 'failed' || status === 'incomplete' || status === 'requires_action') {
    const { code, message } = firstError(data);
    const reason = (message || (status === 'failed'
      ? 'Gemini could not make this video.'
      : 'Gemini stopped before the video was finished.')).slice(0, 240);
    if (REFUSAL_CODES.has(code) || REFUSAL_TEXT.test(message)) return { state: 'rejected', reason };
    return { state: 'failed', reason, quota: QUOTA_TEXT.test(`${code} ${message}`) };
  }
  if (status === 'cancelled') {
    return { state: 'cancelled', reason: firstError(data).message.slice(0, 240) || 'The video was cancelled.' };
  }
  return { state: 'running' };
}
