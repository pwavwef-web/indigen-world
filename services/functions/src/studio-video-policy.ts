import { HttpsError } from 'firebase-functions/v2/https';

export const STUDIO_VIDEO_PRICING_VERSION = '2026-09-01';

export const RUNWAY_VIDEO_MODELS = ['gen4_turbo', 'gen4.5'] as const;
export const FAL_LIPSYNC_MODELS = ['lipsync-2', 'lipsync-2-pro'] as const;
export const VIDEO_RATIOS = ['1280:720', '720:1280', '960:960'] as const;

export type RunwayVideoModel = (typeof RUNWAY_VIDEO_MODELS)[number];
export type FalLipsyncModel = (typeof FAL_LIPSYNC_MODELS)[number];
export type StudioVideoRatio = (typeof VIDEO_RATIOS)[number];

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
  durationSeconds: 5 | 10;
  governance: StudioVideoGovernance;
  kasem: KasemContext;
}

export interface GenerateVisualInput extends StudioVideoInputBase {
  operation: 'generate_visual';
  provider: 'runway';
  model: RunwayVideoModel;
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
  const validationRef = textField(data, 'validationRef', 240, Boolean(transcript));
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
  const durationSeconds = data.durationSeconds;
  if (durationSeconds !== 5 && durationSeconds !== 10) {
    throw new HttpsError('invalid-argument', 'durationSeconds must be 5 or 10.');
  }
  const governance = parseGovernance(data.governance, operation);
  const kasem = parseKasem(data.kasem, operation);

  if (operation === 'generate_visual') {
    if (data.provider !== 'runway') {
      throw new HttpsError('invalid-argument', 'Visual generation uses the Runway provider.');
    }
    if (!(RUNWAY_VIDEO_MODELS as readonly unknown[]).includes(data.model)) {
      throw new HttpsError('invalid-argument', 'Unknown Runway video model.');
    }
    if (!(VIDEO_RATIOS as readonly unknown[]).includes(data.ratio)) {
      throw new HttpsError('invalid-argument', 'Unsupported video ratio.');
    }
    const reference = typeof data.referenceImageStoragePath === 'string'
      ? data.referenceImageStoragePath.trim()
      : '';
    if (data.model === 'gen4_turbo' && !reference) {
      throw new HttpsError('failed-precondition', 'Gen-4 Turbo requires a reference image.');
    }
    if (!reference && data.ratio === '960:960') {
      throw new HttpsError(
        'invalid-argument',
        'Text-only Gen-4.5 supports landscape or portrait; square requires a reference image.',
      );
    }
    return {
      operation,
      provider: 'runway',
      model: data.model as RunwayVideoModel,
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

export function estimateStudioVideoCost(input: StudioVideoInput): StudioVideoCostEstimate {
  const rateUsd = input.operation === 'generate_visual'
    ? RUNWAY_RATE_USD_PER_SECOND[input.model]
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
        provider: 'runway',
        models: RUNWAY_VIDEO_MODELS.map((model) => ({
          id: model,
          estimatedUsdPerSecond: RUNWAY_RATE_USD_PER_SECOND[model],
          requiresReferenceImage: model === 'gen4_turbo',
          textRatios: model === 'gen4.5' ? ['1280:720', '720:1280'] : [],
          imageRatios: VIDEO_RATIOS,
        })),
      },
      {
        operation: 'lip_sync',
        provider: 'fal',
        models: FAL_LIPSYNC_MODELS.map((model) => ({
          id: model,
          estimatedUsdPerSecond: FAL_RATE_USD_PER_SECOND[model],
        })),
      },
    ],
  };
}
