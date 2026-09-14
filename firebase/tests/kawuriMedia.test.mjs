// Pure tests of Kawuri's media policy and its Vertex adapter — no emulator,
// no network. The adapter is driven through a fake Gen AI client.
//
//   npm run build:functions && node --test firebase/tests/kawuriMedia.test.mjs

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  ENGLISH_ONLY_MESSAGE,
  INLINE_MEDIA_MAX_BYTES,
  MEDIA_LIMITS,
  TASK_TIMEOUT_MS,
  actionsForTask,
  analysisInstruction,
  assertUploadPath,
  audioSecondsFromUsage,
  buildCapabilities,
  categoryForTask,
  checkStoredMedia,
  classifyVertexError,
  creationPath,
  imageAspectRatiosFor,
  imageDimensions,
  isListedTask,
  isOwnCreationPath,
  mediaDurationSeconds,
  newTaskRecord,
  normaliseMimeType,
  parseAnalysisRequest,
  parseImageGenerationRequest,
  parseTranscriptionRequest,
  parseVideoGenerationRequest,
  publicTask,
  readImageResponse,
  readKawuriMediaConfig,
  readModeration,
  readVideoOperation,
  reasonOf,
  scanMp4Duration,
  staleOutcome,
  taskIdFor,
  thinkingConfigFor,
  validateAnalysis,
  validateTranscript,
  videoCostCents,
  videoDurationsFor,
} from '../../services/functions/lib/kawuri-media-policy.js';
import {
  generateImage,
  generateStructured,
  locationOfOperation,
  pollVideo,
  screenGenerationRequest,
  setGenAiFactoryForTests,
  startVideo,
  unhealthyModels,
  usesEmulatorFake,
} from '../../services/functions/lib/kawuri-vertex.js';
import { VIDEO_SPEND_LIMITS, vertexVideoRateUsdPerSecond } from '../../services/functions/lib/studio-video-policy.js';
import { dictionaryBriefing, dictionaryRecordFrom } from '../../services/functions/lib/kawuri-dictionary.js';

const uid = 'member-1';
const other = 'member-2';
const config = readKawuriMediaConfig({}, 'demo-project');

function reasonFrom(fn) {
  try {
    fn();
  } catch (error) {
    return reasonOf(error);
  }
  return null;
}

afterEach(() => setGenAiFactoryForTests(null));

// ---------------------------------------------------------------------------
// Configuration and capabilities
// ---------------------------------------------------------------------------

test('configuration defaults to the models confirmed on the project, each replaceable', () => {
  assert.equal(config.location, 'global');
  assert.equal(config.videoLocation, 'us-central1');
  assert.deepEqual(config.imageModels, ['gemini-3.1-flash-image', 'gemini-2.5-flash-image']);
  assert.equal(config.videoModel, 'veo-3.1-fast-generate-001');
  assert.deepEqual(config.transcriptionModels, ['gemini-3.8-flash', 'gemini-2.5-flash']);
  assert.deepEqual(config.analysisModels, ['gemini-3.8-flash', 'gemini-2.5-flash']);

  const custom = readKawuriMediaConfig({
    VERTEX_IMAGE_MODEL: 'gemini-3-pro-image',
    VERTEX_IMAGE_FALLBACK_MODEL: 'gemini-3-pro-image',
    VERTEX_TRANSCRIPTION_MODEL: 'gemini-2.5-flash',
    VERTEX_VIDEO_MODEL: 'veo-3.1-generate-001',
    GOOGLE_CLOUD_LOCATION: 'us-central1',
    KAWURI_DISABLED_CAPABILITIES: 'videoGeneration, nonsense',
  }, 'p');
  assert.deepEqual(custom.imageModels, ['gemini-3-pro-image'], 'duplicates collapse');
  assert.deepEqual(custom.transcriptionModels, ['gemini-2.5-flash']);
  assert.equal(custom.videoModel, 'veo-3.1-generate-001');
  assert.equal(custom.location, 'us-central1');
  assert.deepEqual([...custom.disabled], ['videoGeneration']);
});

test('capabilities advertise only what configuration and eligibility support', () => {
  const signedIn = buildCapabilities({
    config, signedIn: true, videoEligible: true, videoPlanModelAllowed: false, unhealthy: new Set(),
  });
  assert.equal(signedIn.imageGeneration, true);
  assert.equal(signedIn.videoGeneration, true);
  assert.equal(signedIn.speechToText, true);
  assert.equal(signedIn.mediaAnalysis, true);
  assert.deepEqual(signedIn.speechToTextLanguages, ['en']);
  assert.deepEqual(signedIn.imageAspectRatios, ['1:1', '3:4', '4:3', '9:16', '16:9']);
  assert.deepEqual(signedIn.videoAspectRatios, ['9:16', '16:9']);
  assert.deepEqual(signedIn.videoDurations, [4, 6, 8]);
  assert.deepEqual(signedIn.videoQualityOptions, ['fast']);
  assert.deepEqual(signedIn.imageOutputCounts, [1]);

  const guest = buildCapabilities({
    config, signedIn: false, videoEligible: false, videoPlanModelAllowed: false, unhealthy: new Set(),
  });
  assert.equal(guest.chat, true);
  assert.equal(guest.imageGeneration, false);
  assert.equal(guest.unavailableReasons.imageGeneration, 'sign_in_required');
  assert.deepEqual(guest.imageAspectRatios, [], 'no options for a tool that is off');

  const ineligible = buildCapabilities({
    config, signedIn: true, videoEligible: false, videoPlanModelAllowed: false, unhealthy: new Set(),
  });
  assert.equal(ineligible.videoGeneration, false);
  assert.equal(ineligible.unavailableReasons.videoGeneration, 'not_eligible');
  assert.deepEqual(ineligible.videoDurations, []);

  const plan = buildCapabilities({
    config, signedIn: true, videoEligible: true, videoPlanModelAllowed: true, unhealthy: new Set(),
  });
  assert.deepEqual(plan.videoQualityOptions, ['fast', 'plan']);
});

test('capabilities go dark when a tool is disabled, unconfigured or every model is failing', () => {
  const disabled = buildCapabilities({
    config: readKawuriMediaConfig({ KAWURI_DISABLED_CAPABILITIES: 'speechToText' }, 'p'),
    signedIn: true, videoEligible: true, videoPlanModelAllowed: false, unhealthy: new Set(),
  });
  assert.equal(disabled.speechToText, false);
  assert.equal(disabled.unavailableReasons.speechToText, 'disabled');
  assert.deepEqual(disabled.speechToTextLanguages, []);

  const noProject = buildCapabilities({
    config: readKawuriMediaConfig({}, ''),
    signedIn: true, videoEligible: true, videoPlanModelAllowed: false, unhealthy: new Set(),
  });
  assert.equal(noProject.chat, false);
  assert.equal(noProject.unavailableReasons.mediaAnalysis, 'not_configured');

  const sick = buildCapabilities({
    config, signedIn: true, videoEligible: true, videoPlanModelAllowed: false,
    unhealthy: new Set(['gemini-3.1-flash-image', 'gemini-2.5-flash-image']),
  });
  assert.equal(sick.imageGeneration, false);
  assert.equal(sick.unavailableReasons.imageGeneration, 'model_unavailable');
  const halfSick = buildCapabilities({
    config, signedIn: true, videoEligible: true, videoPlanModelAllowed: false,
    unhealthy: new Set(['gemini-3.1-flash-image']),
  });
  assert.equal(halfSick.imageGeneration, true, 'a working fallback keeps the tool on');

  const unpriced = buildCapabilities({
    config: readKawuriMediaConfig({ VERTEX_VIDEO_MODEL: 'veo-9-unpriced' }, 'p'),
    signedIn: true, videoEligible: true, videoPlanModelAllowed: false, unhealthy: new Set(),
  });
  assert.equal(unpriced.videoGeneration, false, 'a video model with no price cannot be held to the spend ceiling');
});

test('model knowledge: image ratios, video durations, prices and thinking settings', () => {
  assert.deepEqual(imageAspectRatiosFor('gemini-2.5-flash-image'), ['1:1', '3:4', '4:3', '9:16', '16:9']);
  assert.deepEqual(imageAspectRatiosFor('gemini-2.5-flash'), [], 'a text model is not an image model');
  assert.deepEqual(videoDurationsFor('veo-3.1-fast-generate-001'), [4, 6, 8]);
  assert.deepEqual(videoDurationsFor('veo-9'), []);
  assert.equal(videoCostCents('veo-3.1-fast-generate-001', 8), 120);
  assert.equal(videoCostCents('veo-9', 8), null);
  assert.equal(vertexVideoRateUsdPerSecond('gen4.5'), null);
  assert.equal(VIDEO_SPEND_LIMITS.creatorDailySpendCents, 2000, 'the Studio ceiling is shared, not restated');
  assert.deepEqual(thinkingConfigFor('gemini-3.8-flash'), { thinkingLevel: 'LOW' });
  assert.deepEqual(thinkingConfigFor('gemini-2.5-flash'), { thinkingBudget: 0 });
  assert.equal(thinkingConfigFor('gemini-2.5-flash-image'), undefined);
});

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const ratios = ['1:1', '3:4', '4:3', '9:16', '16:9'];

test('image requests need a request id, a prompt and a supported shape', () => {
  const ok = parseImageGenerationRequest({
    requestId: 'req_00000001', prompt: '  A painted wall  ', aspectRatio: '3:4',
  }, uid, ratios);
  assert.equal(ok.prompt, 'A painted wall');
  assert.equal(ok.referenceImagePath, null);

  assert.equal(reasonFrom(() => parseImageGenerationRequest({ prompt: 'x', aspectRatio: '1:1' }, uid, ratios)), 'INVALID_REQUEST');
  assert.equal(reasonFrom(() => parseImageGenerationRequest({ requestId: 'req_00000001', prompt: '', aspectRatio: '1:1' }, uid, ratios)), 'INVALID_REQUEST');
  assert.equal(reasonFrom(() => parseImageGenerationRequest({ requestId: 'req_00000001', prompt: 'x', aspectRatio: '21:9' }, uid, ratios)), 'INVALID_REQUEST');
  assert.equal(reasonFrom(() => parseImageGenerationRequest({
    requestId: 'req_00000001', prompt: 'x'.repeat(MEDIA_LIMITS.promptChars + 1), aspectRatio: '1:1',
  }, uid, ratios)), 'INVALID_REQUEST');
});

test('a reference image must be the caller’s own upload or creation', () => {
  const own = parseImageGenerationRequest({
    requestId: 'req_00000001', prompt: 'x', aspectRatio: '1:1',
    referenceImagePath: `kawuri-uploads/${uid}/reference/up1/photo.jpg`,
  }, uid, ratios);
  assert.equal(own.referenceImagePath, `kawuri-uploads/${uid}/reference/up1/photo.jpg`);
  const creation = parseImageGenerationRequest({
    requestId: 'req_00000001', prompt: 'x', aspectRatio: '1:1',
    referenceImagePath: `kawuri-creations/${uid}/${uid}_req_00000000/image-1.png`,
  }, uid, ratios);
  assert.ok(creation.referenceImagePath);

  for (const path of [
    `kawuri-uploads/${other}/reference/up1/photo.jpg`,
    `kawuri-creations/${other}/${other}_x/image-1.png`,
    `kawuri-uploads/${uid}/reference/../../${other}/photo.jpg`,
    `community-media/${uid}/post/photo.jpg`,
    `kawuri-uploads/${uid}/audio/up1/photo.jpg`,
  ]) {
    assert.equal(reasonFrom(() => parseImageGenerationRequest({
      requestId: 'req_00000001', prompt: 'x', aspectRatio: '1:1', referenceImagePath: path,
    }, uid, ratios)), 'PERMISSION_DENIED', path);
  }
});

test('video requests require explicit spend confirmation and the model’s own options', () => {
  const base = {
    requestId: 'vid_00000001', prompt: 'A slow pan across a market', aspectRatio: '16:9',
    durationSeconds: 8, confirmSpend: true,
  };
  const ok = parseVideoGenerationRequest(base, uid, [4, 6, 8]);
  assert.equal(ok.resolution, '720p', 'defaults to the first resolution for the shape');
  assert.equal(ok.quality, 'fast');
  assert.equal(parseVideoGenerationRequest({ ...base, resolution: '1080p' }, uid, [4, 6, 8]).resolution, '1080p');

  assert.equal(reasonFrom(() => parseVideoGenerationRequest({ ...base, confirmSpend: false }, uid, [4, 6, 8])), 'CONFIRMATION_REQUIRED');
  assert.equal(reasonFrom(() => parseVideoGenerationRequest({ ...base, confirmSpend: 'yes' }, uid, [4, 6, 8])), 'CONFIRMATION_REQUIRED');
  assert.equal(reasonFrom(() => parseVideoGenerationRequest({ ...base, durationSeconds: 5 }, uid, [4, 6, 8])), 'INVALID_REQUEST');
  assert.equal(reasonFrom(() => parseVideoGenerationRequest({ ...base, aspectRatio: '1:1' }, uid, [4, 6, 8])), 'INVALID_REQUEST');
  assert.equal(
    reasonFrom(() => parseVideoGenerationRequest({ ...base, aspectRatio: '9:16', resolution: '1080p' }, uid, [4, 6, 8])),
    'INVALID_REQUEST',
    'portrait stays at 720p, as in the Studio',
  );
  assert.equal(reasonFrom(() => parseVideoGenerationRequest(base, uid, [])), 'INVALID_REQUEST');
});

test('speech-to-text is English only, bounded in length, and reads only the caller’s audio uploads', () => {
  const path = `kawuri-uploads/${uid}/audio/rec1/voice.m4a`;
  const ok = parseTranscriptionRequest({ requestId: 'stt_00000001', storagePath: path, language: 'en', durationSeconds: 12 }, uid);
  assert.equal(ok.language, 'en');
  assert.equal(parseTranscriptionRequest({ requestId: 'stt_00000001', storagePath: path, language: 'en-GH', durationSeconds: 3 }, uid).language, 'en');

  for (const language of ['xsm', 'fr', 'tw', '', undefined]) {
    let caught;
    try {
      parseTranscriptionRequest({ requestId: 'stt_00000001', storagePath: path, language, durationSeconds: 3 }, uid);
    } catch (error) {
      caught = error;
    }
    assert.equal(reasonOf(caught), 'UNSUPPORTED_LANGUAGE', String(language));
    assert.equal(caught.message, ENGLISH_ONLY_MESSAGE);
  }
  assert.equal(reasonFrom(() => parseTranscriptionRequest({
    requestId: 'stt_00000001', storagePath: path, language: 'en', durationSeconds: MEDIA_LIMITS.transcriptionSeconds + 1,
  }, uid)), 'INVALID_MEDIA');
  assert.equal(reasonFrom(() => parseTranscriptionRequest({
    requestId: 'stt_00000001', storagePath: `kawuri-uploads/${other}/audio/rec1/voice.m4a`, language: 'en', durationSeconds: 3,
  }, uid)), 'PERMISSION_DENIED');
  assert.equal(reasonFrom(() => parseTranscriptionRequest({
    requestId: 'stt_00000001', storagePath: `kawuri-uploads/${uid}/media/rec1/voice.m4a`, language: 'en', durationSeconds: 3,
  }, uid)), 'PERMISSION_DENIED', 'audio for transcription lives under the audio purpose');
});

test('media analysis owns its media and its follow-ups', () => {
  const fresh = parseAnalysisRequest({
    requestId: 'ana_00000001', intention: 'describe', storagePath: `kawuri-uploads/${uid}/media/u1/clip.mp4`,
  }, uid);
  assert.equal(fresh.followUpTaskId, '');
  const followUp = parseAnalysisRequest({
    requestId: 'ana_00000002', intention: 'summarise', question: 'And the colours?', followUpTaskId: `${uid}_ana_00000001`,
  }, uid);
  assert.equal(followUp.storagePath, null);

  assert.equal(reasonFrom(() => parseAnalysisRequest({
    requestId: 'ana_00000002', intention: 'describe', followUpTaskId: `${other}_ana_00000001`,
  }, uid)), 'PERMISSION_DENIED', 'another member’s analysis cannot be continued');
  assert.equal(reasonFrom(() => parseAnalysisRequest({
    requestId: 'ana_00000002', intention: 'describe', storagePath: `kawuri-uploads/${other}/media/u1/clip.mp4`,
  }, uid)), 'PERMISSION_DENIED');
  assert.equal(reasonFrom(() => parseAnalysisRequest({ requestId: 'ana_00000002', intention: 'describe' }, uid)), 'INVALID_MEDIA');
  assert.equal(reasonFrom(() => parseAnalysisRequest({
    requestId: 'ana_00000002', intention: 'identify_person', storagePath: `kawuri-uploads/${uid}/media/u1/a.jpg`,
  }, uid)), 'INVALID_REQUEST');
});

test('stored media is checked against its real type, extension and size', () => {
  const maxBytes = (kind) => MEDIA_LIMITS.analysisBytes[kind];
  const ok = checkStoredMedia({ contentType: 'audio/x-m4a', size: '2048', fileName: 'voice.m4a', allowedKinds: ['audio'], maxBytes });
  assert.deepEqual(ok, { mimeType: 'audio/mp4', kind: 'audio', sizeBytes: 2048 });

  assert.equal(reasonFrom(() => checkStoredMedia({ contentType: 'application/pdf', size: 10, fileName: 'a.pdf', allowedKinds: ['image'], maxBytes })), 'INVALID_MEDIA', 'unsupported MIME');
  assert.equal(reasonFrom(() => checkStoredMedia({ contentType: 'image/gif', size: 10, fileName: 'a.gif', allowedKinds: ['image'], maxBytes })), 'INVALID_MEDIA', 'unsupported image type');
  assert.equal(reasonFrom(() => checkStoredMedia({ contentType: 'video/mp4', size: 10, fileName: 'clip.mp4', allowedKinds: ['audio'], maxBytes })), 'INVALID_MEDIA', 'wrong kind for the purpose');
  assert.equal(reasonFrom(() => checkStoredMedia({ contentType: 'image/png', size: 10, fileName: 'photo.exe', allowedKinds: ['image'], maxBytes })), 'INVALID_MEDIA', 'extension must match');
  assert.equal(reasonFrom(() => checkStoredMedia({
    contentType: 'image/jpeg', size: MEDIA_LIMITS.analysisBytes.image + 1, fileName: 'big.jpg', allowedKinds: ['image'], maxBytes,
  })), 'INVALID_MEDIA', 'oversized upload');
  assert.equal(reasonFrom(() => checkStoredMedia({ contentType: 'image/jpeg', size: 0, fileName: 'empty.jpg', allowedKinds: ['image'], maxBytes })), 'UPLOAD_MISSING');
  assert.equal(normaliseMimeType('image/jpg; charset=binary'), 'image/jpeg');
  assert.equal(normaliseMimeType('text/html'), '');
});

// ---------------------------------------------------------------------------
// Storage paths
// ---------------------------------------------------------------------------

test('storage paths: temporary uploads and permanent creations are separate, per member', () => {
  const parsed = assertUploadPath(`kawuri-uploads/${uid}/media/u-1/clip.mov`, uid, ['media']);
  assert.deepEqual(parsed, { path: `kawuri-uploads/${uid}/media/u-1/clip.mov`, purpose: 'media', uploadId: 'u-1', fileName: 'clip.mov' });
  assert.equal(creationPath(uid, 't1', 'image-1.png'), `kawuri-creations/${uid}/t1/image-1.png`);
  assert.equal(isOwnCreationPath(`kawuri-creations/${uid}/t1/image-1.png`, uid), true);
  assert.equal(isOwnCreationPath(`kawuri-creations/${uid}/t1/image-1.png`, other), false);
  assert.equal(isOwnCreationPath(`kawuri-creations/${uid}/t1/sub/image-1.png`, uid), false);
  assert.equal(reasonFrom(() => assertUploadPath(`kawuri-uploads/${uid}/media/u-1/.hidden`, uid, ['media'])), 'PERMISSION_DENIED');
  assert.equal(reasonFrom(() => assertUploadPath(`kawuri-uploads/${uid}/media/u-1/a/b.mp4`, uid, ['media'])), 'PERMISSION_DENIED');
  assert.equal(taskIdFor(uid, 'req_00000001'), `${uid}_req_00000001`);
});

// ---------------------------------------------------------------------------
// Responses: safety, transcripts, analysis
// ---------------------------------------------------------------------------

test('image responses: images, safety refusals and empty answers are told apart', () => {
  const ok = readImageResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] });
  assert.equal(ok.kind, 'images');
  assert.equal(ok.images.length, 1);

  assert.deepEqual(readImageResponse({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }), { kind: 'rejected', reason: 'PROHIBITED_CONTENT' });
  assert.deepEqual(readImageResponse({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }), { kind: 'rejected', reason: 'IMAGE_SAFETY' });
  assert.deepEqual(readImageResponse({ candidates: [{ finishReason: 'NO_IMAGE', content: { parts: [{ text: 'sorry' }] } }] }), { kind: 'empty', reason: 'NO_IMAGE' });
});

test('the pre-generation screen fails closed', () => {
  assert.deepEqual(readModeration({ allowed: true, category: 'none', reason: '' }), { allowed: true, category: 'none' });
  assert.deepEqual(readModeration({ allowed: false, category: 'real_person', reason: 'x' }), { allowed: false, category: 'real_person' });
  assert.deepEqual(readModeration({ allowed: true, category: 'minor', reason: 'x' }), { allowed: false, category: 'minor' }, 'a named problem is a refusal');
  assert.equal(reasonFrom(() => readModeration(null)), 'GENERATION_FAILED');
  assert.equal(reasonFrom(() => readModeration({ category: 'none' })), 'GENERATION_FAILED');
});

test('transcripts: English enforced on what was spoken, and unclear speech is kept, not invented', () => {
  const result = validateTranscript({ transcript: ' Hello there. ', language: 'en', unclearSegments: ['[unclear] after hello'] }, 4.4);
  assert.deepEqual(result, { transcript: 'Hello there.', language: 'en', unclearSegments: ['[unclear] after hello'], durationSeconds: 4 });
  assert.equal(reasonFrom(() => validateTranscript({ transcript: 'Ba wo na', language: 'xsm', unclearSegments: [] }, 3)), 'UNSUPPORTED_LANGUAGE');
  assert.equal(reasonFrom(() => validateTranscript({ transcript: '', language: 'fr', unclearSegments: [] }, 3)), 'UNSUPPORTED_LANGUAGE');
  assert.equal(reasonFrom(() => validateTranscript({ transcript: '', language: 'en', unclearSegments: [] }, 3)), 'GENERATION_FAILED');
  assert.equal(reasonFrom(() => validateTranscript(null, 3)), 'GENERATION_FAILED');
  assert.equal(audioSecondsFromUsage({ promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 3840 }] }), 120);
});

test('analysis keeps observation, interpretation and uncertainty apart, and cannot waive verification', () => {
  const instruction = analysisInstruction('cultural_context');
  for (const phrase of ['observations: only what is directly visible', 'possibleContext', 'confidenceNotes', 'ethnic group', 'which language', 'sacred object', 'historical event', 'never be invented']) {
    assert.ok(instruction.includes(phrase), phrase);
  }
  const result = validateAnalysis({
    summary: 'A courtyard.', observations: ['Clay pots.'], possibleContext: ['May be a family compound.'],
    detectedText: [], suggestedLanguages: [], suggestedTopics: [], confidenceNotes: [],
    requiresCommunityVerification: false,
  });
  assert.equal(result.requiresCommunityVerification, true);
  assert.equal(reasonFrom(() => validateAnalysis({ summary: '', observations: [] })), 'GENERATION_FAILED');
  const capped = validateAnalysis({ summary: 'x', observations: Array.from({ length: 50 }, (_, i) => `o${i}`) });
  assert.equal(capped.observations.length, 20);
});

// ---------------------------------------------------------------------------
// Video operations, timeouts and failure mapping
// ---------------------------------------------------------------------------

test('video operations: running, finished, filtered and failed are read correctly', () => {
  assert.deepEqual(readVideoOperation({ name: 'op', done: false }), { state: 'running', progress: null }, 'no invented progress');
  assert.deepEqual(readVideoOperation({ done: false, metadata: { progressPercent: 42 } }), { state: 'running', progress: 42 });
  assert.deepEqual(
    readVideoOperation({ done: true, response: { generatedVideos: [{ video: { videoBytes: 'AAAA', mimeType: 'video/mp4' } }] } }),
    { state: 'succeeded', base64: 'AAAA', uri: null, mimeType: 'video/mp4' },
  );
  assert.deepEqual(readVideoOperation({ done: true, response: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ['person'] } }), { state: 'rejected', reasons: ['person'] });
  assert.equal(readVideoOperation({ done: true, error: { code: 8, message: 'quota' } }).code, 'QUOTA_EXCEEDED');
  assert.equal(readVideoOperation({ done: true, error: { code: 13, message: 'boom' } }).code, 'GENERATION_FAILED');
  assert.equal(readVideoOperation({ done: true, response: {} }).state, 'failed', 'done without a video is terminal');
  assert.equal(locationOfOperation('projects/p/locations/us-central1/publishers/google/models/veo/operations/1'), 'us-central1');
});

test('a task never stays in flight forever', () => {
  const created = Date.parse('2026-09-14T10:00:00Z');
  const task = (overrides) => ({ status: 'generating', type: 'image_generation', createdAt: new Date(created).toISOString(), ...overrides });
  assert.equal(staleOutcome(task(), created + TASK_TIMEOUT_MS.image_generation - 1), null);
  assert.equal(staleOutcome(task(), created + TASK_TIMEOUT_MS.image_generation + 1).errorCode, 'OPERATION_TIMEOUT');
  assert.equal(staleOutcome(task({ status: 'ready' }), created + 10 * TASK_TIMEOUT_MS.video_generation), null);
  const unsubmitted = staleOutcome(task({ type: 'video_generation', status: 'queued', operationName: null }), created + 6 * 60_000);
  assert.equal(unsubmitted.errorCode, 'GENERATION_FAILED');
  assert.equal(staleOutcome(task({ type: 'video_generation', operationName: 'op' }), created + 6 * 60_000), null);
  assert.equal(staleOutcome(task({ type: 'video_generation', operationName: 'op' }), created + 31 * 60_000).errorCode, 'OPERATION_TIMEOUT');
});

test('Vertex failures map to stable codes', () => {
  assert.equal(classifyVertexError({ status: 401 }), 'VERTEX_AUTH_FAILED');
  assert.equal(classifyVertexError({ status: 403, message: 'Vertex AI API has not been used in project' }), 'VERTEX_API_DISABLED');
  assert.equal(classifyVertexError({ status: 403, message: 'Permission denied' }), 'VERTEX_AUTH_FAILED');
  assert.equal(classifyVertexError({ status: 404, message: 'Publisher model `projects/p/locations/x/publishers/google/models/m` was not found' }), 'MODEL_UNAVAILABLE');
  assert.equal(classifyVertexError({ status: 400, message: 'Location us-east9 is not supported' }), 'UNSUPPORTED_REGION');
  assert.equal(classifyVertexError({ status: 400, message: 'The prompt violated our usage guidelines' }), 'SAFETY_REJECTED');
  assert.equal(classifyVertexError({ status: 400, message: 'bad field' }), 'INVALID_REQUEST');
  assert.equal(classifyVertexError({ status: 429 }), 'QUOTA_EXCEEDED');
  assert.equal(classifyVertexError({ name: 'AbortError' }), 'OPERATION_TIMEOUT');
  assert.equal(classifyVertexError({ status: 503 }), 'GENERATION_FAILED');
  assert.equal(classifyVertexError(new TypeError('fetch failed')), 'GENERATION_FAILED');
});

// ---------------------------------------------------------------------------
// Adapter behaviour through a fake SDK
// ---------------------------------------------------------------------------

function fakeClient(handlers) {
  const calls = [];
  const client = {
    models: {
      generateContent: async (params) => { calls.push(['generateContent', params]); return handlers.generateContent(params); },
      generateVideos: async (params) => { calls.push(['generateVideos', params]); return handlers.generateVideos(params); },
    },
    operations: {
      getVideosOperation: async (params) => { calls.push(['getVideosOperation', params]); return handlers.getVideosOperation(params); },
    },
  };
  setGenAiFactoryForTests(() => client);
  return calls;
}

test('an unavailable image model falls back to the next, and is remembered', async () => {
  const calls = fakeClient({
    generateContent: async (params) => {
      if (params.model === 'gemini-3.1-flash-image') throw Object.assign(new Error('not found'), { status: 404 });
      return { candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] };
    },
  });
  const result = await generateImage({ project: 'p', location: 'global', models: config.imageModels, prompt: 'x', aspectRatio: '1:1', reference: null });
  assert.equal(result.model, 'gemini-2.5-flash-image');
  assert.equal(result.outcome.kind, 'images');
  assert.ok(unhealthyModels().has('gemini-3.1-flash-image'));
  const request = calls[0][1];
  assert.deepEqual(request.config.responseModalities, ['IMAGE']);
  assert.equal(request.config.imageConfig.aspectRatio, '1:1');
  assert.equal(request.config.imageConfig.personGeneration, 'ALLOW_ADULT');
  assert.equal(request.config.httpOptions.retryOptions, undefined, 'a generation is never retried by the SDK');
  assert.equal(request.config.labels.feature, 'kawuri');
});

test('quota and safety do not fall back to another model', async () => {
  fakeClient({ generateContent: async () => { throw Object.assign(new Error('quota'), { status: 429 }); } });
  await assert.rejects(
    generateImage({ project: 'p', location: 'global', models: config.imageModels, prompt: 'x', aspectRatio: '1:1', reference: null }),
    (error) => reasonOf(error) === 'QUOTA_EXCEEDED',
  );
  assert.equal(unhealthyModels().size, 0);

  fakeClient({ generateContent: async () => { throw Object.assign(new Error('not found'), { status: 404 }); } });
  await assert.rejects(
    generateImage({ project: 'p', location: 'global', models: config.imageModels, prompt: 'x', aspectRatio: '1:1', reference: null }),
    (error) => reasonOf(error) === 'MODEL_UNAVAILABLE',
    'every model unavailable is a capability-unavailable answer',
  );
});

test('video start returns the full operation name, and status checks resume from it alone', async () => {
  const name = 'projects/p/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/abc';
  const calls = fakeClient({
    generateVideos: async () => ({ name }),
    getVideosOperation: async ({ operation }) => ({ name: operation.name, done: true, response: { generatedVideos: [{ video: { videoBytes: 'AAAA' } }] } }),
  });
  const started = await startVideo({
    project: 'p', location: 'us-central1', model: 'veo-3.1-fast-generate-001', prompt: 'x', negativePrompt: 'text',
    aspectRatio: '9:16', durationSeconds: 4, resolution: '720p', image: { mimeType: 'image/png', base64: 'AAAA' },
  });
  assert.equal(started.operationName, name);
  const [, request] = calls[0];
  assert.equal(request.config.generateAudio, false);
  assert.equal(request.config.numberOfVideos, 1);
  assert.equal(request.config.negativePrompt, 'text');
  assert.deepEqual(request.source.image, { imageBytes: 'AAAA', mimeType: 'image/png' });

  // A different "instance": new factory, nothing in memory but the name.
  setGenAiFactoryForTests(null);
  const recovered = fakeClient({
    getVideosOperation: async ({ operation }) => ({ name: operation.name, done: true, response: { generatedVideos: [{ video: { videoBytes: 'AAAA' } }] } }),
  });
  const outcome = await pollVideo({ project: 'p', fallbackLocation: 'europe-west4', operationName: name });
  assert.equal(outcome.state, 'succeeded');
  assert.equal(recovered[0][1].operation.name, name);
  assert.ok(recovered[0][1].config.httpOptions.retryOptions, 'status checks may retry');
});

test('the screen refuses before any generation and says why', async () => {
  fakeClient({
    generateContent: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"allowed":false,"category":"real_person","reason":"x"}' }] } }] }),
  });
  await assert.rejects(
    screenGenerationRequest({ project: 'p', location: 'global', models: ['m'], capability: 'image_generation', prompt: 'the president', negativePrompt: '', reference: null }),
    (error) => reasonOf(error) === 'SAFETY_REJECTED' && error.details.category === 'real_person' && /real, identifiable people/.test(error.message),
  );
});

test('structured calls refuse blocked prompts and parse JSON answers', async () => {
  fakeClient({ generateContent: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
  await assert.rejects(
    generateStructured({ project: 'p', location: 'global', models: ['m'], capability: 'image_analysis', systemInstruction: 's', contents: [], schema: {}, maxOutputTokens: 10, temperature: 0, timeoutMs: 1000 }),
    (error) => reasonOf(error) === 'SAFETY_REJECTED',
  );
  fakeClient({ generateContent: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking', thought: true }, { text: '```json\n{"a":1}\n```' }] } }] }) });
  const { json } = await generateStructured({ project: 'p', location: 'global', models: ['gemini-3.8-flash'], capability: 'x', systemInstruction: 's', contents: [], schema: {}, maxOutputTokens: 10, temperature: 0, timeoutMs: 1000 });
  assert.deepEqual(json, { a: 1 });
});

test('the emulator stand-in can never be selected outside a demo emulator project', () => {
  const previous = process.env.FUNCTIONS_EMULATOR;
  delete process.env.FUNCTIONS_EMULATOR;
  assert.equal(usesEmulatorFake('demo-indigen-world'), false);
  process.env.FUNCTIONS_EMULATOR = 'true';
  assert.equal(usesEmulatorFake('project-kassena-7e026'), false);
  assert.equal(usesEmulatorFake('demo-indigen-world'), true);
  if (previous === undefined) delete process.env.FUNCTIONS_EMULATOR;
  else process.env.FUNCTIONS_EMULATOR = previous;
});

// ---------------------------------------------------------------------------
// Media inspection
// ---------------------------------------------------------------------------

test('image dimensions and recording lengths are read from the file itself', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  assert.deepEqual(imageDimensions(png), { width: 1, height: 1 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03]);
  assert.deepEqual(imageDimensions(jpeg), { width: 640, height: 480 });
  assert.equal(imageDimensions(Buffer.from('not an image')), null);

  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0); wavHeader.write('WAVE', 8); wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); wavHeader.writeUInt32LE(48000, 28); wavHeader.write('data', 36); wavHeader.writeUInt32LE(48000 * 3, 40);
  // fmt chunk: byte rate lives at offset 28 overall (12 + 8 + 8).
  assert.equal(mediaDurationSeconds(wavHeader), 3);

  const mp4 = Buffer.from('000000186674797069736f6d0000000069736f6d6d703432000000746d6f6f760000006c6d766864000000000000000000000000000003e800000fa0' + '0'.repeat(160), 'hex');
  assert.equal(mediaDurationSeconds(mp4), 4);
  assert.equal(scanMp4Duration(Buffer.alloc(10), mp4.subarray(24)), 4, 'found in a tail chunk');
  assert.ok(INLINE_MEDIA_MAX_BYTES < MEDIA_LIMITS.analysisBytes.video, 'large media goes by Cloud Storage URI');
});

// ---------------------------------------------------------------------------
// Tasks and Recent creations
// ---------------------------------------------------------------------------

test('task records carry the shared shape, and the app never sees internals', () => {
  const record = newTaskRecord({
    id: `${uid}_req_00000001`, uid, type: 'video_generation', requestId: 'req_00000001', conversationId: 'c1',
    status: 'queued', model: 'veo-3.1-fast-generate-001', prompt: 'Festival story', aspectRatio: '9:16', duration: 8,
    resolution: '720p', now: '2026-09-14T10:00:00.000Z',
  });
  for (const key of ['id', 'userId', 'conversationId', 'type', 'status', 'model', 'provider', 'prompt', 'negativePrompt', 'sourceMedia', 'outputMedia', 'operationName', 'progress', 'aspectRatio', 'duration', 'language', 'errorCode', 'errorMessage', 'moderationStatus', 'createdAt', 'updatedAt', 'completedAt']) {
    assert.ok(key in record, key);
  }
  assert.equal(record.provider, 'vertex');
  assert.equal(record.category, 'video');
  assert.equal(record.listed, true);
  assert.equal(record.aiGenerated, true);

  const shown = publicTask({ ...record, operationName: 'projects/p/locations/l/operations/secret', advanceLeaseUntil: 'x', billed: true, billableAttempts: 1, estimatedCostCents: 120 });
  assert.equal(shown.operationName, true, 'the app learns an operation exists, not its name');
  for (const hidden of ['advanceLeaseUntil', 'billed', 'billableAttempts', 'estimatedCostCents', 'requestId']) {
    assert.equal(hidden in shown, false, hidden);
  }
});

test('recent creations: categories, listing and valid actions per state', () => {
  assert.equal(categoryForTask('image_generation'), 'image');
  assert.equal(categoryForTask('audio_analysis'), 'analysis');
  assert.equal(isListedTask('speech_to_text'), false, 'dictation is not a creation');
  assert.deepEqual(actionsForTask({ type: 'video_generation', status: 'generating' }), ['cancel']);
  assert.ok(actionsForTask({ type: 'video_generation', status: 'ready' }).includes('use_in_reel'));
  assert.ok(actionsForTask({ type: 'image_generation', status: 'ready' }).includes('use_as_reel_cover'));
  assert.deepEqual(actionsForTask({ type: 'image_generation', status: 'rejected' }), ['retry', 'edit_prompt', 'delete']);
  assert.deepEqual(actionsForTask({ type: 'image_analysis', status: 'ready' }), ['ask_follow_up', 'delete']);
  assert.equal(actionsForTask({ type: 'image_generation', status: 'failed' }).includes('download'), false);
});

// ---------------------------------------------------------------------------
// Dictionary grounding
// ---------------------------------------------------------------------------

test('translation is grounded in the dictionary first, inference is labelled, and verification is offered', () => {
  const water = dictionaryRecordFrom('w1', { kasemText: 'na', englishText: 'water', isPublished: true });
  const hit = dictionaryBriefing(['water'], [water]);
  assert.match(hit, /ONLY Kasem you may state as confirmed/);
  assert.match(hit, /Never contradict, respell, reinterpret/);
  assert.match(hit, /Not verified:/);
  assert.match(hit, /community/i);
  const miss = dictionaryBriefing(['sky'], []);
  assert.match(miss, /NO entry/);
  assert.match(miss, /verified by the community/);
});
