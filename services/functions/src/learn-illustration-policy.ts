import { HttpsError } from 'firebase-functions/v2/https';
import { roleSatisfies } from './auth.js';

/**
 * The course illustration desk, as rules rather than calls.
 *
 * Firebase-free apart from the error type, like `kawuri-media-policy.ts`, so
 * every decision here — who may generate, which model a quality tier means,
 * what a request may ask for, what a record looks like — is unit-tested
 * without an emulator.
 *
 * ── What this is for ───────────────────────────────────────────────────────
 * The Learn tab carries pictures: the lesson hero, a card per unit. Those are
 * made with Vertex AI's Gemini image models ("Nano Banana") by an
 * administrator or an authorised editor, from the admin console, and never on
 * a learner's page load. A picture of Kassena life drawn by a model is a claim
 * about a real people, so every one starts as a DRAFT and reaches the app only
 * when an administrator approves it — at which point it is copied to public
 * storage and attached to the unit, lesson or course it was made for, with its
 * AI attribution beside it.
 */

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export type IllustrationQuality = 'standard' | 'best';

export interface IllustrationConfig {
  project: string;
  /** Gemini 3.x image models answer on the global endpoint only. */
  location: string;
  /** Primary first. `standard` → Nano Banana 2. */
  standardModels: string[];
  /** Primary first. `best` → Nano Banana Pro, falling back to the standard chain. */
  bestModels: string[];
  /** Models used to screen a request before anything is bought. */
  screeningModels: string[];
  outputBucket: string;
}

/**
 * Reads the desk's configuration.
 *
 *   VERTEX_IMAGE_MODEL=gemini-3.1-flash-image      standard (Nano Banana 2)
 *   VERTEX_IMAGE_PRO_MODEL=gemini-3-pro-image      best quality (Nano Banana Pro)
 *
 * `VERTEX_IMAGE_MODEL` is the same variable Kawuri's image tool reads, so the
 * two surfaces cannot drift onto different standard models by accident.
 */
export function readIllustrationConfig(
  env: Record<string, string | undefined>,
  project: string,
): IllustrationConfig {
  const pick = (key: string, fallback: string) => (env[key] ?? '').trim() || fallback;
  const chain = (...models: string[]) =>
    [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  const standard = pick('VERTEX_IMAGE_MODEL', 'gemini-3.1-flash-image');
  const fallback = pick('VERTEX_IMAGE_FALLBACK_MODEL', 'gemini-2.5-flash-image');
  const pro = pick('VERTEX_IMAGE_PRO_MODEL', 'gemini-3-pro-image');
  return {
    project: pick('VERTEX_PROJECT_ID', project),
    location: pick('GOOGLE_CLOUD_LOCATION', 'global'),
    standardModels: chain(standard, fallback),
    // Best quality never silently becomes the 2.5 fallback: if Pro is down the
    // desk makes a Nano Banana 2 picture and records that it did.
    bestModels: chain(pro, standard),
    screeningModels: chain(
      pick('VERTEX_MEDIA_ANALYSIS_MODEL', 'gemini-3.8-flash'),
      pick('VERTEX_TEXT_FALLBACK_MODEL', 'gemini-2.5-flash'),
    ),
    outputBucket: (env.VERTEX_OUTPUT_BUCKET ?? '').trim(),
  };
}

export function modelsForQuality(config: IllustrationConfig, quality: IllustrationQuality): string[] {
  return quality === 'best' ? config.bestModels : config.standardModels;
}

/** The friendly name of the model that actually made a picture. */
export function modelLabel(model: string): string {
  if (/^gemini-3(\.\d+)?-pro-image/.test(model)) return 'Nano Banana Pro';
  if (/^gemini-3\.1-flash-image/.test(model)) return 'Nano Banana 2';
  if (/^gemini-2\.5-flash-image/.test(model)) return 'Nano Banana';
  return model;
}

// ---------------------------------------------------------------------------
// What a request may ask for
// ---------------------------------------------------------------------------

export const ILLUSTRATION_ASPECT_RATIOS = ['1:1', '4:3', '16:9', '9:16'] as const;
export type IllustrationAspectRatio = (typeof ILLUSTRATION_ASPECT_RATIOS)[number];

/**
 * Output sizes. Gemini 3 image models take `imageSize`; 4K is offered only on
 * best quality, where it is worth its price — a unit card is drawn a few
 * hundred pixels wide on a phone.
 */
export const ILLUSTRATION_SIZES: Record<IllustrationQuality, readonly string[]> = {
  standard: ['1K', '2K'],
  best: ['1K', '2K', '4K'],
};

/** Gemini 2.5 image models do not accept `imageSize` at all. */
export function imageSizeFor(model: string, size: string): string | null {
  return /^gemini-3/.test(model) ? size : null;
}

export const ILLUSTRATION_TARGET_KINDS = ['unit', 'lesson', 'course', 'none'] as const;
export type IllustrationTargetKind = (typeof ILLUSTRATION_TARGET_KINDS)[number];

export const ILLUSTRATION_STYLES = ['course', 'none'] as const;
export type IllustrationStyle = (typeof ILLUSTRATION_STYLES)[number];

export const ILLUSTRATION_LIMITS = {
  promptChars: 2_000,
  titleChars: 120,
  noteChars: 1_000,
  referenceImages: 3,
  referenceImageBytes: 8 * 1024 * 1024,
  /** Generations per person per hour — a desk, not a slot machine. */
  perHour: 30,
} as const;

/**
 * The house style every course illustration shares.
 *
 * This is what "consistent across units" means in practice: the same palette
 * and hand on every card, whoever wrote the prompt and whichever model drew
 * it. It is also where the cultural care lives, because a prompt author
 * cannot be relied on to restate it every time.
 */
export const COURSE_STYLE = `House style for the Indigen World Kasem course:
- A warm, painterly storybook illustration with flat shapes, soft brush texture and gentle grain. Not photographic, not 3D.
- Palette: deep forest green, muted mint, warm gold, terracotta and ochre earth, with cream highlights. Soft dusk or morning light and low-contrast shadows.
- Setting: the Kassena homeland in the Upper East Region of Ghana and southern Burkina Faso. Sahel savanna, baobab and shea trees, laterite earth, mud-walled compounds, some walls painted with Kassena geometric patterns (triangles, chevrons, lozenges and bands in red ochre, black and white).
- People are ordinary Kassena people of any age, shown with dignity and warmth, never as caricature. Everyday clothes: woven smocks (batakari), shirts, patterned wrappers and head wraps.
- Do not show masks, shrines, sacrifices, funerals or ritual objects, real identifiable people, or any written text, letters, numbers, logos or watermarks.`;

export const ILLUSTRATION_INSTRUCTION = `You draw illustrations for the Kasem language course inside Indigen World, a platform that preserves the Kasem language and the culture of the Kassena people. Draw exactly what is asked, in the house style you are given, respectfully and without inventing ceremonies or sacred practices. Never add written text of any kind.`;

/** The prompt Vertex receives: the author's words, framed by the house style. */
export function composeIllustrationPrompt(input: {
  prompt: string;
  style: IllustrationStyle;
  mode: 'generate' | 'edit';
  referenceCount: number;
}): string {
  const lines: string[] = [];
  if (input.style === 'course') lines.push(COURSE_STYLE, '');
  if (input.mode === 'edit') {
    lines.push('Edit the first attached image. Keep its composition, characters and style, and change only this:');
  } else if (input.referenceCount > 0) {
    lines.push(`Use the ${input.referenceCount === 1 ? 'attached image' : 'attached images'} as a guide for composition, characters or style.`);
  }
  lines.push(input.prompt.trim());
  return lines.join('\n');
}

export interface IllustrationTarget {
  kind: IllustrationTargetKind;
  id: string;
}

export interface IllustrationRequest {
  requestId: string;
  prompt: string;
  title: string;
  mode: 'generate' | 'edit';
  /** The draft or approved illustration an edit starts from. */
  sourceIllustrationId: string;
  referenceImagePaths: string[];
  aspectRatio: IllustrationAspectRatio;
  imageSize: string;
  quality: IllustrationQuality;
  style: IllustrationStyle;
  target: IllustrationTarget;
}

function invalid(message: string): HttpsError {
  return new HttpsError('invalid-argument', message, { reason: 'INVALID_REQUEST' });
}

function objectOf(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function textOf(data: Record<string, unknown>, key: string, max: number, required: boolean): string {
  const value = typeof data[key] === 'string' ? (data[key] as string).trim() : '';
  if (required && !value) throw invalid(`${key} is required.`);
  if (value.length > max) throw invalid(`${key} must be ${max} characters or fewer.`);
  return value;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

/** A staff member's own reference upload. Anything else is refused by name. */
export function referencePathFor(raw: unknown, uid: string): string {
  const path = typeof raw === 'string' ? raw.trim() : '';
  const prefix = `learn-illustrations/references/${uid}/`;
  if (!path.startsWith(prefix) || path.includes('..') || path.length > 300) {
    throw invalid('Reference images must be uploaded from the illustration desk first.');
  }
  const rest = path.slice(prefix.length);
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(rest)) {
    throw invalid('Reference images must be uploaded from the illustration desk first.');
  }
  return path;
}

export function parseIllustrationRequest(raw: unknown, uid: string): IllustrationRequest {
  const data = objectOf(raw);
  const requestId = typeof data.requestId === 'string' ? data.requestId.trim() : '';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) throw invalid('requestId is required.');

  const mode = data.mode === 'edit' ? 'edit' : 'generate';
  const sourceIllustrationId = typeof data.sourceIllustrationId === 'string'
    ? data.sourceIllustrationId.trim()
    : '';
  if (mode === 'edit' && !ID_PATTERN.test(sourceIllustrationId)) {
    throw invalid('Choose the illustration to edit.');
  }

  const aspectRatio = data.aspectRatio;
  if (!(ILLUSTRATION_ASPECT_RATIOS as readonly unknown[]).includes(aspectRatio)) {
    throw invalid(`Illustrations are made at ${ILLUSTRATION_ASPECT_RATIOS.join(', ')}.`);
  }
  const quality: IllustrationQuality = data.quality === 'best' ? 'best' : 'standard';
  const sizes = ILLUSTRATION_SIZES[quality];
  const imageSize = typeof data.imageSize === 'string' && data.imageSize ? data.imageSize : sizes[0];
  if (!sizes.includes(imageSize)) {
    throw invalid(`${quality === 'best' ? 'Best quality' : 'Standard'} illustrations are made at ${sizes.join(', ')}.`);
  }
  const style: IllustrationStyle = data.style === 'none' ? 'none' : 'course';

  const rawReferences = Array.isArray(data.referenceImagePaths) ? data.referenceImagePaths : [];
  if (rawReferences.length > ILLUSTRATION_LIMITS.referenceImages) {
    throw invalid(`Attach at most ${ILLUSTRATION_LIMITS.referenceImages} reference images.`);
  }
  const referenceImagePaths = [...new Set(rawReferences.map((path) => referencePathFor(path, uid)))];

  const rawTarget = objectOf(data.target);
  const kind = (ILLUSTRATION_TARGET_KINDS as readonly unknown[]).includes(rawTarget.kind)
    ? rawTarget.kind as IllustrationTargetKind
    : 'none';
  const targetId = typeof rawTarget.id === 'string' ? rawTarget.id.trim() : '';
  if (kind !== 'none' && !ID_PATTERN.test(targetId)) {
    throw invalid('Choose which unit, lesson or course the illustration is for.');
  }

  return {
    requestId,
    prompt: textOf(data, 'prompt', ILLUSTRATION_LIMITS.promptChars, true),
    title: textOf(data, 'title', ILLUSTRATION_LIMITS.titleChars, false),
    mode,
    sourceIllustrationId: mode === 'edit' ? sourceIllustrationId : '',
    referenceImagePaths,
    aspectRatio: aspectRatio as IllustrationAspectRatio,
    imageSize,
    quality,
    style,
    target: { kind, id: kind === 'none' ? '' : targetId },
  };
}

export interface IllustrationReview {
  illustrationId: string;
  decision: 'approve' | 'reject';
  note: string;
  /** Where an approved picture is attached. Defaults to the request's target. */
  target: IllustrationTarget | null;
}

export function parseIllustrationReview(raw: unknown): IllustrationReview {
  const data = objectOf(raw);
  const illustrationId = typeof data.illustrationId === 'string' ? data.illustrationId.trim() : '';
  if (!ID_PATTERN.test(illustrationId)) throw invalid('illustrationId is required.');
  if (data.decision !== 'approve' && data.decision !== 'reject') {
    throw invalid('decision must be approve or reject.');
  }
  let target: IllustrationTarget | null = null;
  if (data.target != null) {
    const rawTarget = objectOf(data.target);
    const kind = (ILLUSTRATION_TARGET_KINDS as readonly unknown[]).includes(rawTarget.kind)
      ? rawTarget.kind as IllustrationTargetKind
      : 'none';
    const id = typeof rawTarget.id === 'string' ? rawTarget.id.trim() : '';
    if (kind !== 'none' && !ID_PATTERN.test(id)) throw invalid('The target id is not valid.');
    target = { kind, id: kind === 'none' ? '' : id };
  }
  const note = textOf(data, 'note', ILLUSTRATION_LIMITS.noteChars, false);
  if (data.decision === 'reject' && !note) {
    throw invalid('Say why the illustration is rejected, so the next attempt can fix it.');
  }
  return { illustrationId, decision: data.decision, note, target };
}

// ---------------------------------------------------------------------------
// Who may do what
// ---------------------------------------------------------------------------

/**
 * Generating: an administrator or an authorised editor. Editors are the staff
 * roles (validator and reviewer) who already decide what community work says.
 */
export function canGenerateIllustrations(role: unknown, superAdmin = false): boolean {
  return superAdmin || roleSatisfies(role, 'validator');
}

/**
 * Approving: administrators only. Approval publishes a picture of Kassena life
 * into a course everyone opens, which is the admin's authority, not an
 * editor's — and it means the person who wrote the prompt is never the only
 * person who looked at the result, unless that person is an admin.
 */
export function canReviewIllustrations(role: unknown, superAdmin = false): boolean {
  return superAdmin || roleSatisfies(role, 'admin');
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type IllustrationStatus = 'generating' | 'draft' | 'approved' | 'rejected' | 'failed';

export const ILLUSTRATIONS = 'learnIllustrations';

/** Where a draft's bytes live. Staff-readable, never public. */
export function draftPath(illustrationId: string, mimeType: string): string {
  return `learn-illustrations/drafts/${illustrationId}/image.${extensionFor(mimeType)}`;
}

/** Where an approved picture is published. World-readable. */
export function publishedPath(illustrationId: string, mimeType: string): string {
  return `published-media/learn-illustrations/${illustrationId}.${extensionFor(mimeType)}`;
}

export function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export function illustrationIdFor(uid: string, requestId: string): string {
  return `${uid}_${requestId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
}

/** The collection an approved picture is attached to, or null for none. */
export function targetCollection(kind: IllustrationTargetKind): string | null {
  switch (kind) {
    case 'unit': return 'learnUnits';
    case 'lesson': return 'learnLessons';
    case 'course': return 'learnCourses';
    default: return null;
  }
}

/** The credit shown beside an approved picture in the app. */
export function attributionFor(model: string, reviewerName: string): string {
  const who = reviewerName.trim() ? ` · reviewed by ${reviewerName.trim()}` : ' · reviewed by Indigen World';
  return `AI illustration (${modelLabel(model)}, Vertex AI)${who}`;
}

export function newIllustrationRecord(input: {
  id: string;
  uid: string;
  creatorName: string;
  request: IllustrationRequest;
  composedPrompt: string;
  now: string;
}): Record<string, unknown> {
  const { request } = input;
  return {
    id: input.id,
    requestId: request.requestId,
    status: 'generating' satisfies IllustrationStatus,
    title: request.title,
    prompt: request.prompt,
    composedPrompt: input.composedPrompt,
    style: request.style,
    mode: request.mode,
    sourceIllustrationId: request.sourceIllustrationId,
    referenceImagePaths: request.referenceImagePaths,
    aspectRatio: request.aspectRatio,
    imageSize: request.imageSize,
    quality: request.quality,
    model: null,
    modelLabel: null,
    target: request.target,
    storagePath: null,
    mimeType: null,
    sizeBytes: null,
    publicUrl: null,
    aiGenerated: true,
    provider: 'vertex',
    creatorUid: input.uid,
    creatorName: input.creatorName,
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    reviewedBy: null,
    reviewerName: null,
    reviewedAt: null,
    reviewNote: null,
    attribution: null,
  };
}
