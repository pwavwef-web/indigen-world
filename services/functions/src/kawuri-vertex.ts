import { GenerateVideosOperation, GoogleGenAI } from '@google/genai';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  MODERATION_INSTRUCTION,
  MODERATION_SCHEMA,
  classifyVertexError,
  isFallbackWorthy,
  kawuriError,
  moderationMessage,
  parseModelJson,
  readImageResponse,
  readModeration,
  readVideoOperation,
  thinkingConfigFor,
  type ImageOutcome,
  type KawuriErrorCode,
  type ModerationVerdict,
  type VideoAspectRatio,
  type VideoOutcome,
} from './kawuri-media-policy.js';

/**
 * Kawuri's media calls to Vertex AI, through the official Google Gen AI SDK.
 *
 * ── Same architecture, newer transport ─────────────────────────────────────
 * Like `kawuriChat` and the Studio's Veo adapter, this runs only inside a Cloud
 * Function and authenticates as the function's own runtime service account
 * (Application Default Credentials). There is no API key, no service-account
 * file and no token that ever reaches the app. The SDK is used here, rather
 * than the hand-rolled REST those two older adapters use, because it is the
 * supported client for Gemini image output, structured output and Veo's
 * long-running operations; the older adapters are deployed and working, and
 * are left alone rather than rewritten in the same change.
 *
 * ── Retries ────────────────────────────────────────────────────────────────
 * The SDK retries nothing unless asked. Generation calls are never given retry
 * options — a retried generation is a second bill — while status checks on an
 * operation are, because reading an operation twice costs nothing.
 */

interface GenAiLike {
  models: {
    generateContent(params: Record<string, unknown>): Promise<unknown>;
    generateVideos(params: Record<string, unknown>): Promise<{ name?: string }>;
  };
  operations: {
    getVideosOperation(params: Record<string, unknown>): Promise<unknown>;
  };
}

export type GenAiFactory = (project: string, location: string) => GenAiLike;

/**
 * The emulator's stand-in for Vertex, and the only place one exists.
 *
 * Switched on solely inside the Functions emulator running a `demo-` project —
 * a project id that has no Google Cloud project behind it and could never
 * reach Vertex anyway — so the end-to-end suite can drive the real callables
 * without credentials or a bill. A deployed function never matches both
 * conditions, and gets the real SDK.
 */
export function usesEmulatorFake(project: string): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true' && project.startsWith('demo-');
}

const FAKE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
// ftyp + moov/mvhd for a 4-second file: enough for the duration reader.
const FAKE_MP4 = Buffer.from(
  '000000186674797069736f6d0000000069736f6d6d703432'
  + '000000746d6f6f760000006c6d7668640000000000000000000000000000'
  + '03e800000fa0' + '0'.repeat(160),
  'hex',
).toString('base64');

function textOf(params: Record<string, unknown>): string {
  return JSON.stringify(params.contents ?? '') + String(params.prompt ?? '')
    + JSON.stringify(params.source ?? '');
}

function emulatorFake(): GenAiLike {
  const polls = new Map<string, number>();
  let counter = 0;
  const failIfAsked = (text: string) => {
    if (text.includes('[fake:quota]')) throw Object.assign(new Error('quota'), { status: 429 });
    if (text.includes('[fake:missing-model]')) throw Object.assign(new Error('model not found'), { status: 404 });
  };
  return {
    models: {
      async generateContent(params) {
        const text = textOf(params);
        failIfAsked(text);
        const config = (params.config ?? {}) as Record<string, unknown>;
        const reply = (value: unknown) => ({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
          usageMetadata: { promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 320 }] },
        });
        if (Array.isArray(config.responseModalities)) {
          if (text.includes('[fake:image-safety]')) {
            return { candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] };
          }
          return {
            candidates: [{
              finishReason: 'STOP',
              content: { parts: [{ inlineData: { mimeType: 'image/png', data: FAKE_PNG } }] },
            }],
          };
        }
        if (config.systemInstruction === MODERATION_INSTRUCTION) {
          return reply(text.includes('[fake:unsafe]')
            ? { allowed: false, category: 'graphic_violence', reason: 'test' }
            : { allowed: true, category: 'none', reason: '' });
        }
        const schema = config.responseJsonSchema as { properties?: Record<string, unknown> } | undefined;
        if (schema?.properties?.transcript) {
          return reply({
            transcript: 'Please add the painted walls to my reel.',
            language: text.includes('[fake:french]') ? 'fr' : 'en',
            unclearSegments: [],
          });
        }
        return reply({
          summary: 'A test image of a single pixel.',
          answer: 'It is a single pixel.',
          observations: ['One pixel.'],
          possibleContext: [],
          detectedText: [],
          suggestedLanguages: [],
          suggestedTopics: ['Testing'],
          confidenceNotes: ['Nothing else can be known.'],
          requiresCommunityVerification: false,
        });
      },
      async generateVideos(params) {
        const text = textOf(params);
        failIfAsked(text);
        counter += 1;
        return {
          name: `projects/demo/locations/us-central1/publishers/google/models/${String(params.model)}/operations/fake-${Date.now()}-${counter}`,
        };
      },
    },
    operations: {
      async getVideosOperation(params) {
        const operation = params.operation as { name: string };
        const seen = (polls.get(operation.name) ?? 0) + 1;
        polls.set(operation.name, seen);
        if (seen < 2) return { name: operation.name, done: false };
        return {
          name: operation.name,
          done: true,
          response: { generatedVideos: [{ video: { videoBytes: FAKE_MP4, mimeType: 'video/mp4' } }] },
        };
      },
    },
  };
}

const defaultFactory: GenAiFactory = (project, location) =>
  usesEmulatorFake(project)
    ? emulatorFake()
    : new GoogleGenAI({ vertexai: true, project, location }) as unknown as GenAiLike;

let factory: GenAiFactory = defaultFactory;
const clients = new Map<string, GenAiLike>();

/** Swaps the SDK for a fake. Automated tests and the emulator only. */
export function setGenAiFactoryForTests(next: GenAiFactory | null): void {
  factory = next ?? defaultFactory;
  clients.clear();
  unhealthyUntil.clear();
}

function clientFor(project: string, location: string): GenAiLike {
  const key = `${project}/${location}`;
  let client = clients.get(key);
  if (!client) {
    client = factory(project, location);
    clients.set(key, client);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Model health
// ---------------------------------------------------------------------------

/**
 * Models that recently answered "not found" or "not in this region".
 *
 * Remembered per instance for a few minutes so a retired model is skipped
 * straight to its fallback, and so the capability manifest stops advertising a
 * tool whose every model is currently refusing. Per instance is enough: the
 * next cold instance learns it again with one failed call.
 */
const unhealthyUntil = new Map<string, number>();
const UNHEALTHY_MS = 10 * 60_000;

export function unhealthyModels(now = Date.now()): Set<string> {
  const models = new Set<string>();
  for (const [model, until] of unhealthyUntil) {
    if (until > now) models.add(model);
    else unhealthyUntil.delete(model);
  }
  return models;
}

function markUnhealthy(model: string): void {
  unhealthyUntil.set(model, Date.now() + UNHEALTHY_MS);
}

/**
 * Runs [call] against each model in turn until one answers.
 *
 * Only "model unavailable" and "unsupported region" move on to the next model.
 * Anything else — a safety refusal, a quota, a bad request — would fail the
 * same way on the fallback, or worse, succeed on a model the member did not
 * get to choose for a reason that had nothing to do with availability.
 */
async function withModelChain<T>(
  capability: string,
  models: readonly string[],
  call: (model: string) => Promise<T>,
): Promise<{ model: string; value: T }> {
  const sick = unhealthyModels();
  const ordered = models.some((model) => !sick.has(model))
    ? models.filter((model) => !sick.has(model))
    : [...models];
  let last: KawuriErrorCode = 'MODEL_UNAVAILABLE';
  for (const model of ordered) {
    try {
      return { model, value: await call(model) };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const code = classifyVertexError(error);
      logger.warn('Kawuri Vertex call failed', {
        capability,
        model,
        status: (error as { status?: unknown })?.status ?? 0,
        code,
      });
      if (!isFallbackWorthy(code)) throw kawuriError(code);
      markUnhealthy(model);
      last = code;
    }
  }
  throw kawuriError(last);
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Media for a request: small files inline, large ones by Cloud Storage URI. */
export interface MediaInput {
  mimeType: string;
  base64?: string;
  gcsUri?: string;
}

function partFor(media: MediaInput): Record<string, unknown> {
  if (media.base64) return { inlineData: { mimeType: media.mimeType, data: media.base64 } };
  return { fileData: { fileUri: media.gcsUri, mimeType: media.mimeType } };
}

/** Billing labels. Vertex puts them on the invoice line; they carry no content. */
export function vertexLabels(capability: string): Record<string, string> {
  return { app: 'indigen-world', feature: 'kawuri', capability: capability.replace(/_/g, '-') };
}

const SAFETY_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']);

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

const IMAGE_INSTRUCTION = `You create one image for a member of Indigen World, a platform that preserves the Kasem language and the culture of the Kassena people.
Depict what is asked respectfully. Do not depict real, identifiable people, children, sacred rites or restricted objects as if documenting them, and do not add written text in any language unless it is asked for.`;

export async function generateImage(input: {
  project: string;
  location: string;
  models: readonly string[];
  prompt: string;
  aspectRatio: string;
  reference: MediaInput | null;
}): Promise<{ model: string; outcome: ImageOutcome }> {
  const { model, value } = await withModelChain('image_generation', input.models, async (candidate) => {
    const response = await clientFor(input.project, input.location).models.generateContent({
      model: candidate,
      contents: [{
        role: 'user',
        parts: [
          ...(input.reference ? [partFor(input.reference)] : []),
          { text: input.prompt },
        ],
      }],
      config: {
        systemInstruction: IMAGE_INSTRUCTION,
        responseModalities: ['IMAGE'],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: input.aspectRatio,
          // Adults only, matching the Studio's governance for AI video.
          personGeneration: 'ALLOW_ADULT',
          prominentPeople: 'BLOCK_PROMINENT_PEOPLE',
        },
        labels: vertexLabels('image_generation'),
        httpOptions: { timeout: 110_000 },
      },
    });
    return readImageResponse(response);
  });
  return { model, outcome: value };
}

// ---------------------------------------------------------------------------
// Video generation
// ---------------------------------------------------------------------------

export async function startVideo(input: {
  project: string;
  location: string;
  model: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: VideoAspectRatio;
  durationSeconds: number;
  resolution: string;
  image: MediaInput | null;
}): Promise<{ model: string; operationName: string }> {
  const { model, value } = await withModelChain('video_generation', [input.model], async (candidate) => {
    const operation = await clientFor(input.project, input.location).models.generateVideos({
      model: candidate,
      source: {
        prompt: input.prompt,
        ...(input.image
          ? {
            image: input.image.base64
              ? { imageBytes: input.image.base64, mimeType: input.image.mimeType }
              : { gcsUri: input.image.gcsUri, mimeType: input.image.mimeType },
          }
          : {}),
      },
      config: {
        numberOfVideos: 1,
        aspectRatio: input.aspectRatio,
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
        ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
        // Off for the Studio's reason: Veo would voice speech and song in a
        // language that is not Kasem, over footage meant to represent Kassena
        // life.
        generateAudio: false,
        personGeneration: 'allow_adult',
        labels: vertexLabels('video_generation'),
        httpOptions: { timeout: 60_000 },
      },
    });
    const operationName = typeof operation?.name === 'string' ? operation.name.trim() : '';
    if (!operationName) throw kawuriError('GENERATION_FAILED', 'Vertex did not start the video.');
    return operationName;
  });
  return { model, operationName: value };
}

/** The region an operation lives in, read from its own name. */
export function locationOfOperation(operationName: string): string | null {
  return /\/locations\/([a-z0-9-]+)\//.exec(operationName)?.[1] ?? null;
}

/**
 * One status check on a Veo operation.
 *
 * Built from the persisted operation name alone, so a job started by an
 * instance that has since been replaced is resumed by whichever instance
 * checks next — the phone does not have to be open, and nothing is kept in
 * memory.
 */
export async function pollVideo(input: {
  project: string;
  fallbackLocation: string;
  operationName: string;
}): Promise<VideoOutcome> {
  const location = locationOfOperation(input.operationName) ?? input.fallbackLocation;
  const operation = new GenerateVideosOperation();
  operation.name = input.operationName;
  try {
    const result = await clientFor(input.project, location).operations.getVideosOperation({
      operation,
      config: {
        httpOptions: {
          timeout: 90_000,
          retryOptions: { attempts: 3, httpStatusCodes: [429, 500, 502, 503, 504] },
        },
      },
    });
    return readVideoOperation(result);
  } catch (error) {
    const code = classifyVertexError(error);
    logger.warn('Kawuri video status check failed', {
      status: (error as { status?: unknown })?.status ?? 0,
      code,
    });
    throw kawuriError(code);
  }
}

// ---------------------------------------------------------------------------
// Pre-generation screening
// ---------------------------------------------------------------------------

/**
 * Screens an image or video request, reference image included, before any
 * generation is bought. Throws `SAFETY_REJECTED` with a specific message when
 * the platform's rules refuse it.
 */
export async function screenGenerationRequest(input: {
  project: string;
  location: string;
  models: readonly string[];
  capability: 'image_generation' | 'video_generation';
  prompt: string;
  negativePrompt: string;
  reference: MediaInput | null;
}): Promise<{ model: string; verdict: ModerationVerdict }> {
  const lines = [
    `Generator: ${input.capability === 'image_generation' ? 'image' : 'video'}`,
    `Request: ${input.prompt}`,
    input.negativePrompt ? `Negative prompt: ${input.negativePrompt}` : '',
    input.reference ? 'A reference image is attached above.' : 'No reference image.',
  ].filter(Boolean).join('\n');
  const { model, json } = await generateStructured({
    project: input.project,
    location: input.location,
    models: input.models,
    capability: 'moderation',
    systemInstruction: MODERATION_INSTRUCTION,
    contents: [{
      role: 'user',
      parts: [
        ...(input.reference ? [partFor(input.reference)] : []),
        { text: lines },
      ],
    }],
    schema: MODERATION_SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: 512,
    temperature: 0,
    timeoutMs: 45_000,
  });
  const verdict = readModeration(json);
  if (!verdict.allowed) {
    throw new HttpsError('failed-precondition', moderationMessage(verdict.category), {
      reason: 'SAFETY_REJECTED',
      category: verdict.category,
    });
  }
  return { model, verdict };
}

// ---------------------------------------------------------------------------
// Structured understanding: transcription and analysis
// ---------------------------------------------------------------------------

export interface StructuredTurn {
  role: 'user' | 'model';
  parts: Record<string, unknown>[];
}

export function mediaPart(media: MediaInput): Record<string, unknown> {
  return partFor(media);
}

export async function generateStructured(input: {
  project: string;
  location: string;
  models: readonly string[];
  capability: string;
  systemInstruction: string;
  contents: StructuredTurn[];
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
}): Promise<{ model: string; json: Record<string, unknown> | null; usage: unknown }> {
  const { model, value } = await withModelChain(input.capability, input.models, async (candidate) => {
    const thinkingConfig = thinkingConfigFor(candidate);
    const response = await clientFor(input.project, input.location).models.generateContent({
      model: candidate,
      contents: input.contents,
      config: {
        systemInstruction: input.systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: input.schema,
        maxOutputTokens: input.maxOutputTokens,
        temperature: input.temperature,
        ...(thinkingConfig ? { thinkingConfig } : {}),
        labels: vertexLabels(input.capability),
        httpOptions: { timeout: input.timeoutMs },
      },
    }) as Record<string, unknown>;

    const feedback = response.promptFeedback as Record<string, unknown> | undefined;
    const candidates = Array.isArray(response.candidates) ? response.candidates : [];
    const first = (candidates[0] ?? {}) as Record<string, unknown>;
    const finishReason = typeof first.finishReason === 'string' ? first.finishReason : '';
    if (
      (typeof feedback?.blockReason === 'string' && feedback.blockReason)
      || SAFETY_FINISH.has(finishReason)
    ) {
      throw kawuriError('SAFETY_REJECTED');
    }
    if (finishReason === 'MAX_TOKENS') {
      logger.warn('Kawuri structured response hit its output ceiling', {
        capability: input.capability,
        model: candidate,
        maxOutputTokens: input.maxOutputTokens,
      });
    }
    const content = first.content as Record<string, unknown> | undefined;
    const parts = Array.isArray(content?.parts) ? content.parts as Record<string, unknown>[] : [];
    const text = parts
      .filter((part) => typeof part.text === 'string' && part.thought !== true)
      .map((part) => part.text as string)
      .join('');
    return { json: parseModelJson(text), usage: response.usageMetadata };
  });
  return { model, json: value.json, usage: value.usage };
}
