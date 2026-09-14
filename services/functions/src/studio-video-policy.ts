import { HttpsError } from 'firebase-functions/v2/https';

export const STUDIO_VIDEO_PRICING_VERSION = '2026-09-01';

export const RUNWAY_VIDEO_MODELS = ['gen4_turbo', 'gen4.5'] as const;
/**
 * Google's video models, reached through Vertex AI.
 *
 * Named for the API ids rather than "Gemini" because that is what the endpoint
 * accepts; the creator-facing label says Gemini, which is what a creator calls
 * it. No secret is involved: Vertex is reached with the function's own
 * Application Default Credentials, exactly as Kawuri is.
 */
export const GEMINI_VIDEO_MODELS = [
  'veo-3.1-generate-001',
  'veo-3.1-fast-generate-001',
] as const;
export const FAL_LIPSYNC_MODELS = ['lipsync-2', 'lipsync-2-pro'] as const;
export const VIDEO_RATIOS = ['1280:720', '720:1280', '960:960'] as const;

export type RunwayVideoModel = (typeof RUNWAY_VIDEO_MODELS)[number];
export type GeminiVideoModel = (typeof GEMINI_VIDEO_MODELS)[number];
export type VisualModel = RunwayVideoModel | GeminiVideoModel;
export type FalLipsyncModel = (typeof FAL_LIPSYNC_MODELS)[number];
export type StudioVideoRatio = (typeof VIDEO_RATIOS)[number];

/**
 * Lengths each model will actually produce.
 *
 * Per model, not per platform. Runway takes 5 or 10 seconds and Veo takes 4, 6
 * or 8 — there is no length the two agree on, so one global list could only
 * have been wrong for one of them. A duration the model does not accept is a
 * submit-time rejection, which the creator would have read as "the video
 * failed" for a request that was never valid.
 */
const RUNWAY_DURATIONS: readonly number[] = [5, 10];
const GEMINI_DURATIONS: readonly number[] = [4, 6, 8];

export function isGeminiVideoModel(model: unknown): model is GeminiVideoModel {
  return (GEMINI_VIDEO_MODELS as readonly unknown[]).includes(model);
}

export function isRunwayVideoModel(model: unknown): model is RunwayVideoModel {
  return (RUNWAY_VIDEO_MODELS as readonly unknown[]).includes(model);
}

export function durationsForVisualModel(model: unknown): readonly number[] {
  return isGeminiVideoModel(model) ? GEMINI_DURATIONS : RUNWAY_DURATIONS;
}

/**
 * Shapes a model will frame.
 *
 * Veo 3.1 offers landscape and portrait only — square is not one of its
 * aspect ratios — so it is absent from both lists rather than offered and
 * rejected. Runway keeps its existing split: square needs a reference image
 * because text-only Gen-4.5 does not frame it.
 */
export function ratiosForVisualModel(
  model: unknown,
  hasReferenceImage: boolean,
): readonly string[] {
  if (isGeminiVideoModel(model)) return ['1280:720', '720:1280'];
  if (hasReferenceImage) return VIDEO_RATIOS;
  return model === 'gen4.5' ? ['1280:720', '720:1280'] : [];
}

export interface StudioVideoGovernance {
  aiProcessingPermission: true;
  rightsConfirmed: true;
  culturalPermissionConfirmed: true;
  participantConsentConfirmed: boolean;
  voiceConsentConfirmed: boolean;
  likenessConsentConfirmed: boolean;
  containsRecognisablePerson: boolean;
  involvesMinors: false;
  usesThirdPartyMaterial: false;
  consentVersion: string;
}

export interface KasemContext {
  languageCode: 'xsm';
  dialect: string;
  transcript: string;
  validationRef: string;
}

interface StudioVideoInputBase {
  clientRequestId: string;
  /** Validated against the chosen model, which is the only authority on it. */
  durationSeconds: number;
  governance: StudioVideoGovernance;
  kasem: KasemContext;
}

export interface GenerateVisualInput extends StudioVideoInputBase {
  operation: 'generate_visual';
  provider: 'runway' | 'gemini';
  model: VisualModel;
  prompt: string;
  ratio: StudioVideoRatio;
  referenceImageStoragePath: string | null;
}

export interface LipSyncInput extends StudioVideoInputBase {
  operation: 'lip_sync';
  provider: 'fal';
  model: FalLipsyncModel;
  videoStoragePath: string;
  audioStoragePath: string;
  syncMode: 'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap';
}

export type StudioVideoInput = GenerateVisualInput | LipSyncInput;

export interface StudioVideoCostEstimate {
  amountUsd: number;
  billingUnit: 'output_second';
  rateUsd: number;
  pricingVersion: typeof STUDIO_VIDEO_PRICING_VERSION;
}

const RUNWAY_RATE_USD_PER_SECOND: Record<RunwayVideoModel, number> = {
  gen4_turbo: 0.05,
  'gen4.5': 0.12,
};

/**
 * Google's published Veo 3.1 rates, audio off. Audio raises them, and it is
 * off — see the submission in studio-video-providers.ts for why.
 */
const GEMINI_RATE_USD_PER_SECOND: Record<GeminiVideoModel, number> = {
  'veo-3.1-generate-001': 0.40,
  'veo-3.1-fast-generate-001': 0.15,
};

const FAL_RATE_USD_PER_SECOND: Record<FalLipsyncModel, number> = {
  // fal lists Pro at $5/minute and documents it as about 1.67x Standard.
  'lipsync-2': 3 / 60,
  'lipsync-2-pro': 5 / 60,
};

function record(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', `${label} must be an object.`);
  }
  return raw as Record<string, unknown>;
}

function textField(
  data: Record<string, unknown>,
  key: string,
  max: number,
  required = true,
): string {
  const value = typeof data[key] === 'string' ? data[key].trim() : '';
  if ((required && value.length === 0) || value.length > max) {
    const qualifier = required ? 'required and ' : '';
    throw new HttpsError(
      'invalid-argument',
      `${key} is ${qualifier}must be at most ${max} characters.`,
    );
  }
  return value;
}

function literalTrue(data: Record<string, unknown>, key: string, message: string): true {
  if (data[key] !== true) throw new HttpsError('failed-precondition', message);
  return true;
}

function literalFalse(data: Record<string, unknown>, key: string, message: string): false {
  if (data[key] !== false) throw new HttpsError('failed-precondition', message);
  return false;
}

function parseGovernance(raw: unknown, operation: StudioVideoInput['operation']): StudioVideoGovernance {
  const data = record(raw, 'governance');
  if (typeof data.containsRecognisablePerson !== 'boolean') {
    throw new HttpsError(
      'invalid-argument',
      'Declare whether the source or requested video contains a recognisable person.',
    );
  }
  const containsRecognisablePerson = data.containsRecognisablePerson;
  const participantConsentConfirmed = data.participantConsentConfirmed === true;
  const voiceConsentConfirmed = data.voiceConsentConfirmed === true;
  const likenessConsentConfirmed = data.likenessConsentConfirmed === true;

  literalTrue(
    data,
    'aiProcessingPermission',
    'Explicit permission to send these assets to an AI provider is required.',
  );
  literalTrue(data, 'rightsConfirmed', 'You must confirm that you have the necessary rights.');
  literalTrue(
    data,
    'culturalPermissionConfirmed',
    'Cultural permission must be confirmed before generation.',
  );
  literalFalse(
    data,
    'involvesMinors',
    'The first video-generation release does not process media involving minors.',
  );
  literalFalse(
    data,
    'usesThirdPartyMaterial',
    'The first video-generation release accepts only material controlled by the contributor.',
  );

  if (operation === 'lip_sync' && (!participantConsentConfirmed || !voiceConsentConfirmed)) {
    throw new HttpsError(
      'failed-precondition',
      'The recorded speaker must consent to participation and AI voice processing.',
    );
  }
  if (operation === 'lip_sync' && !likenessConsentConfirmed) {
    throw new HttpsError(
      'failed-precondition',
      'Consent for the visible person or character likeness is required for lip-sync.',
    );
  }
  if (
    containsRecognisablePerson
    && (!participantConsentConfirmed || !likenessConsentConfirmed)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Every recognisable person must consent to participation and use of their likeness.',
    );
  }

  return {
    aiProcessingPermission: true,
    rightsConfirmed: true,
    culturalPermissionConfirmed: true,
    participantConsentConfirmed,
    voiceConsentConfirmed,
    likenessConsentConfirmed,
    containsRecognisablePerson,
    involvesMinors: false,
    usesThirdPartyMaterial: false,
    consentVersion: textField(data, 'consentVersion', 80),
  };
}

function parseKasem(raw: unknown, operation: StudioVideoInput['operation']): KasemContext {
  const data = record(raw, 'kasem');
  if (data.languageCode !== 'xsm') {
    throw new HttpsError('invalid-argument', 'The first release supports the Kasem language code xsm.');
  }
  const transcript = textField(data, 'transcript', 4_000, operation === 'lip_sync');
  // Creators may write a purpose-built video script directly in TribeStudio.
  // A reviewed submission reference remains optional provenance when available.
  const validationRef = textField(data, 'validationRef', 240, false);
  return {
    languageCode: 'xsm',
    dialect: textField(data, 'dialect', 80),
    transcript,
    validationRef,
  };
}

/**
 * Only dedicated generator uploads and prior generator outputs may leave the
 * private bucket through a short-lived provider URL.
 */
export function assertStudioAssetPath(path: string, uid: string, kind: 'input' | 'output'): string {
  const clean = path.trim();
  if (!clean || clean.includes('..') || clean.includes('\\')) {
    throw new HttpsError('permission-denied', 'The media path is not allowed.');
  }
  const inputPrefix = `creator-submissions/${uid}/studio-video/`;
  const outputPrefix = `studio-video-jobs/${uid}/`;
  const allowed = kind === 'input'
    ? clean.startsWith(inputPrefix)
    : clean.startsWith(inputPrefix) || clean.startsWith(outputPrefix);
  if (!allowed) {
    throw new HttpsError(
      'permission-denied',
      'Use media uploaded for your own Studio video job.',
    );
  }
  return clean;
}

export function parseStudioVideoInput(raw: unknown, uid: string): StudioVideoInput {
  const data = record(raw, 'Video job');
  const operation = data.operation;
  if (operation !== 'generate_visual' && operation !== 'lip_sync') {
    throw new HttpsError('invalid-argument', 'operation must be generate_visual or lip_sync.');
  }
  const clientRequestId = textField(data, 'clientRequestId', 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(clientRequestId)) {
    throw new HttpsError(
      'invalid-argument',
      'clientRequestId must contain 8–80 letters, numbers, underscores, or hyphens.',
    );
  }
  const durationSeconds = typeof data.durationSeconds === 'number'
    ? data.durationSeconds
    : Number.NaN;
  const governance = parseGovernance(data.governance, operation);
  const kasem = parseKasem(data.kasem, operation);

  if (operation === 'generate_visual') {
    const gemini = isGeminiVideoModel(data.model);
    const expectedProvider = gemini ? 'gemini' : 'runway';
    if (!isRunwayVideoModel(data.model) && !gemini) {
      throw new HttpsError('invalid-argument', 'Unknown video model.');
    }
    if (data.provider !== expectedProvider) {
      throw new HttpsError(
        'invalid-argument',
        `That model is served by the ${expectedProvider} provider.`,
      );
    }
    const model = data.model as VisualModel;
    const allowedDurations = durationsForVisualModel(model);
    if (!allowedDurations.includes(durationSeconds)) {
      throw new HttpsError(
        'invalid-argument',
        `This model makes videos of ${allowedDurations.join(', ')} seconds.`,
      );
    }
    if (!(VIDEO_RATIOS as readonly unknown[]).includes(data.ratio)) {
      throw new HttpsError('invalid-argument', 'Unsupported video ratio.');
    }
    const reference = typeof data.referenceImageStoragePath === 'string'
      ? data.referenceImageStoragePath.trim()
      : '';
    if (model === 'gen4_turbo' && !reference) {
      throw new HttpsError('failed-precondition', 'Gen-4 Turbo requires a reference image.');
    }
    if (!ratiosForVisualModel(model, Boolean(reference)).includes(String(data.ratio))) {
      throw new HttpsError(
        'invalid-argument',
        gemini
          ? 'Gemini video is made in landscape or portrait.'
          : 'Text-only Gen-4.5 supports landscape or portrait; square requires a reference image.',
      );
    }
    return {
      operation,
      provider: expectedProvider,
      model,
      prompt: textField(data, 'prompt', 1_000),
      ratio: data.ratio as StudioVideoRatio,
      durationSeconds,
      clientRequestId,
      governance,
      kasem,
      referenceImageStoragePath: reference
        ? assertStudioAssetPath(reference, uid, 'input')
        : null,
    };
  }

  if (!durationsForVisualModel(null).includes(durationSeconds)) {
    throw new HttpsError('invalid-argument', 'durationSeconds must be 5 or 10.');
  }

  if (data.provider !== 'fal') {
    throw new HttpsError('invalid-argument', 'Lip-sync uses the fal provider.');
  }
  if (!(FAL_LIPSYNC_MODELS as readonly unknown[]).includes(data.model)) {
    throw new HttpsError('invalid-argument', 'Unknown fal lip-sync model.');
  }
  const syncMode = data.syncMode ?? 'cut_off';
  if (!['cut_off', 'loop', 'bounce', 'silence', 'remap'].includes(String(syncMode))) {
    throw new HttpsError('invalid-argument', 'Unknown lip-sync duration mode.');
  }
  return {
    operation,
    provider: 'fal',
    model: data.model as FalLipsyncModel,
    durationSeconds,
    clientRequestId,
    governance,
    kasem,
    videoStoragePath: assertStudioAssetPath(
      textField(data, 'videoStoragePath', 1_000),
      uid,
      'output',
    ),
    audioStoragePath: assertStudioAssetPath(
      textField(data, 'audioStoragePath', 1_000),
      uid,
      'input',
    ),
    syncMode: syncMode as LipSyncInput['syncMode'],
  };
}

export function visualRateUsdPerSecond(model: VisualModel): number {
  return isGeminiVideoModel(model)
    ? GEMINI_RATE_USD_PER_SECOND[model]
    : RUNWAY_RATE_USD_PER_SECOND[model as RunwayVideoModel];
}

export function estimateStudioVideoCost(input: StudioVideoInput): StudioVideoCostEstimate {
  const rateUsd = input.operation === 'generate_visual'
    ? visualRateUsdPerSecond(input.model)
    : FAL_RATE_USD_PER_SECOND[input.model];
  return {
    amountUsd: Number((rateUsd * input.durationSeconds).toFixed(4)),
    billingUnit: 'output_second',
    rateUsd,
    pricingVersion: STUDIO_VIDEO_PRICING_VERSION,
  };
}

function normaliseScript(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFC').replace(/\s+/g, ' ').trim()
    : '';
}

/** Pure match used before a validated script is sent to a media provider. */
export function approvedKasemScriptMatches(
  kasem: KasemContext,
  submission: Record<string, unknown>,
  uid: string,
): boolean {
  return submission.authUid === uid
    && ['APPROVED', 'PUBLISHED'].includes(String(submission.status))
    && String(submission.primaryLanguage).toLowerCase() === 'xsm'
    && normaliseScript(submission.dialect).toLowerCase() === normaliseScript(kasem.dialect).toLowerCase()
    && normaliseScript(submission.body) === normaliseScript(kasem.transcript);
}

export function studioVideoCapabilities() {
  return {
    pricingVersion: STUDIO_VIDEO_PRICING_VERSION,
    limits: {
      durationsSeconds: [5, 10],
      ratios: VIDEO_RATIOS,
      minorsSupported: false,
      thirdPartyMaterialSupported: false,
      languageCode: 'xsm',
    },
    operations: [
      {
        operation: 'generate_visual',
        // `provider` now belongs to the model, not the operation: one operation
        // is served by two providers, and the client has to know which one it
        // is asking for.
        models: [
          ...RUNWAY_VIDEO_MODELS.map((model) => ({
            id: model,
            provider: 'runway' as const,
            label: model === 'gen4.5' ? 'Runway Gen-4.5' : 'Runway Gen-4 Turbo',
            estimatedUsdPerSecond: RUNWAY_RATE_USD_PER_SECOND[model],
            requiresReferenceImage: model === 'gen4_turbo',
            durationsSeconds: RUNWAY_DURATIONS,
            textRatios: ratiosForVisualModel(model, false),
            imageRatios: ratiosForVisualModel(model, true),
          })),
          ...GEMINI_VIDEO_MODELS.map((model) => ({
            id: model,
            provider: 'gemini' as const,
            label: model === 'veo-3.1-fast-generate-001'
              ? 'Gemini video (fast)'
              : 'Gemini video',
            estimatedUsdPerSecond: GEMINI_RATE_USD_PER_SECOND[model],
            requiresReferenceImage: false,
            durationsSeconds: GEMINI_DURATIONS,
            textRatios: ratiosForVisualModel(model, false),
            imageRatios: ratiosForVisualModel(model, true),
          })),
        ],
      },
      {
        operation: 'lip_sync',
        models: FAL_LIPSYNC_MODELS.map((model) => ({
          id: model,
          provider: 'fal' as const,
          label: model === 'lipsync-2-pro' ? 'Sync Lipsync 2 Pro' : 'Sync Lipsync 2',
          estimatedUsdPerSecond: FAL_RATE_USD_PER_SECOND[model],
          requiresReferenceImage: false,
          durationsSeconds: RUNWAY_DURATIONS,
          textRatios: [] as readonly string[],
          imageRatios: [] as readonly string[],
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Job progress: the pure half of polling
// ---------------------------------------------------------------------------
//
// The generator only ever reaches a creator through these two functions, and
// both used to live inline in the callable where nothing could test them. That
// is how `providerTask.id` survived: the submission writes `providerTaskId`,
// the poller read `id`, and every poll threw `failed-precondition` while the
// browser showed a spinner. A job could never finish. They are pure and
// exported now so the field names are asserted by the test suite instead of
// by a creator waiting on a video that was already sitting at the provider.

export type StudioVideoProviderState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type StudioVideoJobStatus =
  | 'SUBMITTING'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export const TERMINAL_STUDIO_VIDEO_STATUSES: readonly StudioVideoJobStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
];

export function isTerminalStudioVideoStatus(status: unknown): boolean {
  return (TERMINAL_STUDIO_VIDEO_STATUSES as readonly string[]).includes(String(status));
}

export function providerStateToJobStatus(
  state: StudioVideoProviderState,
): StudioVideoJobStatus {
  switch (state) {
    case 'succeeded': return 'SUCCEEDED';
    case 'failed': return 'FAILED';
    case 'cancelled': return 'CANCELLED';
    case 'running': return 'RUNNING';
    default: return 'QUEUED';
  }
}

export interface StoredProviderTask {
  providerTaskId: string;
  statusUrl: string | null;
  responseUrl: string | null;
}

/**
 * Reads the provider handle back off a job document.
 *
 * `providerTaskId` is what submission writes. `id` is accepted as well so that
 * jobs created before this was fixed — which are stranded mid-flight, not
 * broken — still resolve once their owner opens them again.
 */
export function readStoredProviderTask(raw: unknown): StoredProviderTask | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const task = raw as Record<string, unknown>;
  const id = typeof task.providerTaskId === 'string' && task.providerTaskId
    ? task.providerTaskId
    : typeof task.id === 'string' && task.id
      ? task.id
      : '';
  if (!id) return null;
  return {
    providerTaskId: id,
    statusUrl: typeof task.statusUrl === 'string' && task.statusUrl ? task.statusUrl : null,
    responseUrl: typeof task.responseUrl === 'string' && task.responseUrl ? task.responseUrl : null,
  };
}
