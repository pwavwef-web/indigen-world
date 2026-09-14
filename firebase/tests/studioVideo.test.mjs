import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  approvedKasemScriptMatches,
  durationsForVisualModel,
  estimateStudioVideoCost,
  isTerminalStudioVideoStatus,
  parseStudioVideoInput,
  providerStateToJobStatus,
  ratiosForVisualModel,
  readStoredProviderTask,
  studioVideoCapabilities,
} from '../../services/functions/lib/studio-video-policy.js';
import {
  pollFalLipSync,
  pollGeminiVisual,
  submitFalLipSync,
  submitGeminiVisual,
  submitRunwayVisual,
} from '../../services/functions/lib/studio-video-providers.js';

const uid = 'creator-1';

function governance(overrides = {}) {
  return {
    aiProcessingPermission: true,
    rightsConfirmed: true,
    culturalPermissionConfirmed: true,
    participantConsentConfirmed: false,
    voiceConsentConfirmed: false,
    likenessConsentConfirmed: false,
    containsRecognisablePerson: false,
    involvesMinors: false,
    usesThirdPartyMaterial: false,
    consentVersion: 'studio-video-v1',
    ...overrides,
  };
}

function kasem(overrides = {}) {
  return {
    languageCode: 'xsm',
    dialect: 'Navrongo',
    transcript: '',
    validationRef: '',
    ...overrides,
  };
}

function visual(overrides = {}) {
  return {
    operation: 'generate_visual',
    provider: 'runway',
    model: 'gen4.5',
    prompt: 'A respectful wide shot of a community courtyard at sunrise.',
    ratio: '1280:720',
    durationSeconds: 5,
    clientRequestId: 'request_0001',
    governance: governance(),
    kasem: kasem(),
    referenceImageStoragePath: null,
    ...overrides,
  };
}

function lipSync(overrides = {}) {
  return {
    operation: 'lip_sync',
    provider: 'fal',
    model: 'lipsync-2',
    durationSeconds: 10,
    clientRequestId: 'request_0002',
    governance: governance({
      participantConsentConfirmed: true,
      voiceConsentConfirmed: true,
      likenessConsentConfirmed: true,
      containsRecognisablePerson: true,
    }),
    kasem: kasem({
      transcript: 'Creator-written Kasem words.',
      validationRef: '',
    }),
    videoStoragePath: `studio-video-jobs/${uid}/visual-1/output.mp4`,
    audioStoragePath: `creator-submissions/${uid}/studio-video/audio-1/speech.wav`,
    syncMode: 'cut_off',
    ...overrides,
  };
}

test('a visual job keeps Kasem context out of the provider prompt shape', () => {
  const parsed = parseStudioVideoInput(visual(), uid);
  assert.equal(parsed.operation, 'generate_visual');
  assert.equal(parsed.kasem.languageCode, 'xsm');
  assert.equal(parsed.prompt, visual().prompt);
  assert.equal(estimateStudioVideoCost(parsed).amountUsd, 0.6);
});

test('Gen-4 Turbo requires a creator-owned reference image', () => {
  assert.throws(
    () => parseStudioVideoInput(visual({ model: 'gen4_turbo' }), uid),
    (error) => error?.code === 'failed-precondition',
  );
  assert.throws(
    () => parseStudioVideoInput(visual({
      model: 'gen4_turbo',
      referenceImageStoragePath: 'creator-submissions/someone-else/studio-video/a/image.png',
    }), uid),
    (error) => error?.code === 'permission-denied',
  );
  const parsed = parseStudioVideoInput(visual({
    model: 'gen4_turbo',
    referenceImageStoragePath: `creator-submissions/${uid}/studio-video/a/image.png`,
  }), uid);
  assert.equal(estimateStudioVideoCost(parsed).amountUsd, 0.25);
});

test('square Gen-4.5 uses image-to-video because text-only supports two ratios', () => {
  assert.throws(
    () => parseStudioVideoInput(visual({ ratio: '960:960' }), uid),
    (error) => error?.code === 'invalid-argument',
  );
  assert.equal(
    parseStudioVideoInput(visual({
      ratio: '960:960',
      referenceImageStoragePath: `creator-submissions/${uid}/studio-video/a/square.png`,
    }), uid).ratio,
    '960:960',
  );
});

test('lip-sync accepts a creator-written transcript and requires voice plus likeness consent', () => {
  assert.equal(estimateStudioVideoCost(parseStudioVideoInput(lipSync(), uid)).amountUsd, 0.5);
  assert.throws(
    () => parseStudioVideoInput(lipSync({
      governance: governance({
        participantConsentConfirmed: true,
        likenessConsentConfirmed: true,
        containsRecognisablePerson: true,
      }),
    }), uid),
    (error) => error?.code === 'failed-precondition',
  );
  assert.throws(
    () => parseStudioVideoInput(lipSync({ kasem: kasem() }), uid),
    (error) => error?.code === 'invalid-argument',
  );
});

test('a creator-written Kasem script does not require an approved submission reference', () => {
  const parsed = parseStudioVideoInput(lipSync({
    kasem: kasem({ transcript: 'A fresh script written for this video.', validationRef: '' }),
  }), uid);
  assert.equal(parsed.kasem.transcript, 'A fresh script written for this video.');
  assert.equal(parsed.kasem.validationRef, '');
});

test('an approved script match is exact across owner, language, dialect and transcript', () => {
  const parsed = parseStudioVideoInput(lipSync({
    kasem: kasem({ transcript: 'Validated Kasem words.', validationRef: 'submissions/kasem-001' }),
  }), uid);
  const approved = {
    authUid: uid,
    status: 'APPROVED',
    primaryLanguage: 'xsm',
    dialect: 'navrongo',
    body: 'Validated   Kasem words.',
  };
  assert.equal(approvedKasemScriptMatches(parsed.kasem, approved, uid), true);
  assert.equal(approvedKasemScriptMatches(parsed.kasem, { ...approved, authUid: 'other' }, uid), false);
  assert.equal(approvedKasemScriptMatches(parsed.kasem, { ...approved, status: 'SUBMITTED' }, uid), false);
  assert.equal(approvedKasemScriptMatches(parsed.kasem, { ...approved, body: 'Different words.' }, uid), false);
});

test('the first release refuses minors and third-party material', () => {
  for (const patch of [{ involvesMinors: true }, { usesThirdPartyMaterial: true }]) {
    assert.throws(
      () => parseStudioVideoInput(visual({ governance: governance(patch) }), uid),
      (error) => error?.code === 'failed-precondition',
    );
  }
});

test('the capability response exposes versioned estimates, not secrets', () => {
  const capabilities = studioVideoCapabilities();
  assert.equal(capabilities.pricingVersion, '2026-09-01');
  assert.equal(capabilities.limits.languageCode, 'xsm');
  assert.equal(JSON.stringify(capabilities).includes('API_SECRET'), false);
});

// ---------------------------------------------------------------------------
// Job progress
// ---------------------------------------------------------------------------
//
// The video generator shipped unable to finish a single job: submission stored
// the provider handle as `providerTaskId` and the poller read `providerTask.id`,
// so every poll threw before reaching a provider and the browser span a
// spinner over a video that was already made. These tests pin the round trip
// so the two halves cannot drift apart again unnoticed.

/** Replaces global fetch for one call and returns what the provider was sent. */
async function withStubbedFetch(payload, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const body = typeof payload === 'function' ? payload(String(url), calls.length) : payload;
    return {
      ok: body.ok !== false,
      status: body.status ?? 200,
      json: async () => body.json ?? body,
    };
  };
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

test('a Runway submission is readable by the poller that has to find it again', async () => {
  const input = parseStudioVideoInput(visual(), uid);
  const { result: submission } = await withStubbedFetch(
    { id: 'runway-task-123', estimatedCost: { credits: 25 } },
    () => submitRunwayVisual(input, 'test-secret', null),
  );

  // What submission writes into the job document, verbatim.
  const stored = readStoredProviderTask(submission);
  assert.ok(stored, 'the stored provider task must be readable');
  assert.equal(stored.providerTaskId, 'runway-task-123');
});

test('a fal submission is readable by the poller, queue URLs included', async () => {
  const input = parseStudioVideoInput(lipSync(), uid);
  const { result: submission } = await withStubbedFetch(
    {
      request_id: 'fal-req-9',
      status_url: 'https://queue.fal.run/fal-ai/sync-lipsync/requests/fal-req-9/status',
      response_url: 'https://queue.fal.run/fal-ai/sync-lipsync/requests/fal-req-9',
    },
    () => submitFalLipSync(input, 'test-key', 'https://example.com/v.mp4', 'https://example.com/a.mp3'),
  );

  const stored = readStoredProviderTask(submission);
  assert.ok(stored, 'the stored provider task must be readable');
  assert.equal(stored.providerTaskId, 'fal-req-9');
  assert.match(stored.statusUrl, /\/status$/);
  assert.ok(stored.responseUrl);
});

test('reading a provider task tolerates the legacy field and refuses an absent one', () => {
  assert.equal(readStoredProviderTask({ providerTaskId: 'a' }).providerTaskId, 'a');
  // Jobs written before the fix are stranded, not corrupt; they still resolve.
  assert.equal(readStoredProviderTask({ id: 'legacy' }).providerTaskId, 'legacy');
  for (const absent of [null, undefined, {}, { providerTaskId: '' }, [], 'string']) {
    assert.equal(readStoredProviderTask(absent), null);
  }
});

test('every provider state maps to a job status, and only three are terminal', () => {
  assert.equal(providerStateToJobStatus('queued'), 'QUEUED');
  assert.equal(providerStateToJobStatus('running'), 'RUNNING');
  assert.equal(providerStateToJobStatus('succeeded'), 'SUCCEEDED');
  assert.equal(providerStateToJobStatus('failed'), 'FAILED');
  assert.equal(providerStateToJobStatus('cancelled'), 'CANCELLED');

  for (const status of ['SUCCEEDED', 'FAILED', 'CANCELLED']) {
    assert.equal(isTerminalStudioVideoStatus(status), true);
  }
  for (const status of ['SUBMITTING', 'QUEUED', 'RUNNING', 'nonsense', undefined]) {
    assert.equal(isTerminalStudioVideoStatus(status), false);
  }
});

test('a fal run that completed with an error is failed, not left running', async () => {
  const { result } = await withStubbedFetch(
    { status: 'COMPLETED', error: 'No face detected in the source video.' },
    () => pollFalLipSync(
      'https://queue.fal.run/fal-ai/sync-lipsync/requests/r/status',
      'https://queue.fal.run/fal-ai/sync-lipsync/requests/r',
      'test-key',
    ),
  );
  assert.equal(result.state, 'failed');
  assert.equal(result.outputUrl, null);
  assert.match(result.failureReason, /No face detected/);
});

test('a fal result endpoint answering 4xx ends the job instead of throwing forever', async () => {
  const { result } = await withStubbedFetch(
    (url) => (url.endsWith('/status')
      ? { status: 'COMPLETED' }
      : { ok: false, status: 422, json: { detail: [{ loc: ['body', 'audio_url'], msg: 'unreadable audio' }] } }),
    () => pollFalLipSync(
      'https://queue.fal.run/fal-ai/sync-lipsync/requests/r/status',
      'https://queue.fal.run/fal-ai/sync-lipsync/requests/r',
      'test-key',
    ),
  );
  assert.equal(result.state, 'failed');
  assert.match(result.failureReason, /audio_url: unreadable audio/);
});

test('a finished fal run returns the video it produced', async () => {
  const { result } = await withStubbedFetch(
    (url) => (url.endsWith('/status')
      ? { status: 'COMPLETED' }
      : { video: { url: 'https://v3.fal.media/files/out.mp4' } }),
    () => pollFalLipSync(
      'https://queue.fal.run/fal-ai/sync-lipsync/requests/r/status',
      'https://queue.fal.run/fal-ai/sync-lipsync/requests/r',
      'test-key',
    ),
  );
  assert.equal(result.state, 'succeeded');
  assert.equal(result.outputUrl, 'https://v3.fal.media/files/out.mp4');
  assert.equal(result.failureReason, null);
});

test('a queue URL on an unexpected host is refused by name', async () => {
  await assert.rejects(
    () => pollFalLipSync(
      'https://evil.example.com/requests/r/status',
      'https://queue.fal.run/fal-ai/sync-lipsync/requests/r',
      'test-key',
    ),
    (error) => error?.code === 'data-loss' && /evil\.example\.com/.test(error.message),
  );
});

// ---------------------------------------------------------------------------
// Gemini video (Veo on Vertex AI)
// ---------------------------------------------------------------------------

const GEMINI = 'veo-3.1-generate-001';
const GEMINI_FAST = 'veo-3.1-fast-generate-001';

function geminiVisual(overrides = {}) {
  return visual({ provider: 'gemini', model: GEMINI, durationSeconds: 8, ...overrides });
}

test('a Gemini visual job is accepted with its own provider and lengths', () => {
  const parsed = parseStudioVideoInput(geminiVisual(), uid);
  assert.equal(parsed.provider, 'gemini');
  assert.equal(parsed.model, GEMINI);
  assert.equal(parsed.durationSeconds, 8);
});

test('each model states the lengths it will actually make', () => {
  assert.deepEqual([...durationsForVisualModel(GEMINI)], [4, 6, 8]);
  assert.deepEqual([...durationsForVisualModel(GEMINI_FAST)], [4, 6, 8]);
  assert.deepEqual([...durationsForVisualModel('gen4.5')], [5, 10]);

  // A length one model takes and the other does not must be refused for the
  // one that does not, rather than reaching the provider as a 400.
  for (const seconds of [5, 10, 7, 0]) {
    assert.throws(
      () => parseStudioVideoInput(geminiVisual({ durationSeconds: seconds }), uid),
      (error) => error?.code === 'invalid-argument',
      `Gemini must refuse ${seconds}s`,
    );
  }
  assert.throws(
    () => parseStudioVideoInput(visual({ durationSeconds: 8 }), uid),
    (error) => error?.code === 'invalid-argument',
    'Runway must refuse 8s',
  );
});

test('Gemini frames landscape and portrait, never square', () => {
  assert.deepEqual([...ratiosForVisualModel(GEMINI, false)], ['1280:720', '720:1280']);
  // Square stays absent even with a reference image: Veo has no 1:1.
  assert.deepEqual([...ratiosForVisualModel(GEMINI, true)], ['1280:720', '720:1280']);
  assert.throws(
    () => parseStudioVideoInput(geminiVisual({ ratio: '960:960' }), uid),
    (error) => error?.code === 'invalid-argument',
  );
  assert.equal(parseStudioVideoInput(geminiVisual({ ratio: '720:1280' })).ratio, '720:1280');
});

test('a model may not be claimed for the wrong provider', () => {
  assert.throws(
    () => parseStudioVideoInput(geminiVisual({ provider: 'runway' }), uid),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseStudioVideoInput(visual({ provider: 'gemini' }), uid),
    (error) => error?.code === 'invalid-argument',
  );
  assert.throws(
    () => parseStudioVideoInput(geminiVisual({ model: 'veo-9000' }), uid),
    (error) => error?.code === 'invalid-argument',
  );
});

test('Gemini is estimated at its own published rate', () => {
  const standard = estimateStudioVideoCost(parseStudioVideoInput(geminiVisual(), uid));
  assert.equal(standard.rateUsd, 0.4);
  assert.equal(standard.amountUsd, 3.2);
  const fast = estimateStudioVideoCost(
    parseStudioVideoInput(geminiVisual({ model: GEMINI_FAST, durationSeconds: 4 }), uid),
  );
  assert.equal(fast.rateUsd, 0.15);
  assert.equal(fast.amountUsd, 0.6);
});

test('the capability response puts a provider and a length list on every model', () => {
  const capabilities = studioVideoCapabilities();
  const visualModels = capabilities.operations
    .find((item) => item.operation === 'generate_visual').models;
  const ids = visualModels.map((item) => item.id);
  assert.ok(ids.includes(GEMINI), 'Gemini video is offered');
  assert.ok(ids.includes('gen4.5'), 'Runway is still offered');

  for (const model of visualModels) {
    assert.ok(model.provider, `${model.id} names its provider`);
    assert.ok(model.label, `${model.id} has a creator-facing label`);
    assert.ok(model.durationsSeconds.length > 0, `${model.id} states its lengths`);
  }
  const gemini = visualModels.find((item) => item.id === GEMINI);
  assert.equal(gemini.provider, 'gemini');
  assert.deepEqual([...gemini.durationsSeconds], [4, 6, 8]);
  assert.equal(JSON.stringify(capabilities).includes('API_SECRET'), false);
});

test('a Gemini submission stores the operation name the poller needs', async () => {
  const input = parseStudioVideoInput(geminiVisual(), uid);
  const operationName = 'projects/p/locations/us-central1/publishers/google/models/'
    + `${GEMINI}/operations/op-1`;
  const { result: submission, calls } = await withStubbedFetch(
    { name: operationName },
    () => submitGeminiVisual(input, 'ya29.token', 'p', null),
  );

  assert.match(calls[0].url, /:predictLongRunning$/);
  assert.match(calls[0].url, /us-central1-aiplatform\.googleapis\.com/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ya29.token');

  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.instances[0].prompt, input.prompt);
  assert.equal(sent.parameters.aspectRatio, '16:9');
  assert.equal(sent.parameters.durationSeconds, 8);
  assert.equal(sent.parameters.sampleCount, 1);
  // Off on purpose: a generated voice would not be speaking Kasem.
  assert.equal(sent.parameters.generateAudio, false);
  assert.equal(sent.parameters.personGeneration, 'allow_adult');

  const stored = readStoredProviderTask(submission);
  assert.ok(stored, 'the stored provider task must be readable');
  assert.equal(stored.providerTaskId, operationName);
});

test('a portrait Gemini request is sent as 9:16', async () => {
  const input = parseStudioVideoInput(geminiVisual({ ratio: '720:1280' }), uid);
  const { calls } = await withStubbedFetch(
    { name: 'projects/p/operations/op-2' },
    () => submitGeminiVisual(input, 'token', 'p', null),
  );
  assert.equal(JSON.parse(calls[0].init.body).parameters.aspectRatio, '9:16');
});

test('a reference image travels to Vertex as bytes, not as a link', async () => {
  const input = parseStudioVideoInput(
    geminiVisual({ referenceImageStoragePath: `creator-submissions/${uid}/studio-video/a/image-x.png` }),
    uid,
  );
  const { calls } = await withStubbedFetch(
    { name: 'projects/p/operations/op-3' },
    () => submitGeminiVisual(input, 'token', 'p', { base64: 'QUJD', mimeType: 'image/png' }),
  );
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.instances[0].image.bytesBase64Encoded, 'QUJD');
  assert.equal(sent.instances[0].image.mimeType, 'image/png');
});

test('an unfinished Vertex operation reads as running, not as queued forever', async () => {
  const { result } = await withStubbedFetch(
    { name: 'op', done: false },
    () => pollGeminiVisual('op', GEMINI, 'token', 'p'),
  );
  assert.equal(result.state, 'running');
  assert.equal(result.outputUrl, null);
  assert.equal(result.outputBase64, null);
});

test('a finished Vertex operation hands back the video bytes', async () => {
  const { result, calls } = await withStubbedFetch(
    { done: true, response: { videos: [{ bytesBase64Encoded: 'AAAA', mimeType: 'video/mp4' }] } },
    () => pollGeminiVisual('op-name', GEMINI, 'token', 'p'),
  );
  assert.match(calls[0].url, /:fetchPredictOperation$/);
  assert.equal(JSON.parse(calls[0].init.body).operationName, 'op-name');
  assert.equal(result.state, 'succeeded');
  assert.equal(result.outputBase64, 'AAAA');
  assert.equal(result.outputUrl, null);
});

test('an operation that reports its own error is failed, not left running', async () => {
  const { result } = await withStubbedFetch(
    { done: true, error: { code: 3, message: 'The prompt was rejected.' } },
    () => pollGeminiVisual('op', GEMINI, 'token', 'p'),
  );
  assert.equal(result.state, 'failed');
  assert.match(result.failureReason, /prompt was rejected/);
});

test('a prompt Gemini filtered ends the job with the reason it gave', async () => {
  const { result } = await withStubbedFetch(
    {
      done: true,
      response: { videos: [], raiMediaFilteredCount: 1, raiMediaFilteredReasons: ['unsafe content'] },
    },
    () => pollGeminiVisual('op', GEMINI, 'token', 'p'),
  );
  assert.equal(result.state, 'failed');
  assert.match(result.failureReason, /unsafe content/);
});

test('a finished operation with no video at all is still terminal', async () => {
  const { result } = await withStubbedFetch(
    { done: true, response: { videos: [] } },
    () => pollGeminiVisual('op', GEMINI, 'token', 'p'),
  );
  assert.equal(result.state, 'failed');
  assert.ok(result.failureReason);
});

test('Gemini video refuses to run without ambient credentials', async () => {
  const input = parseStudioVideoInput(geminiVisual(), uid);
  await assert.rejects(
    () => submitGeminiVisual(input, '   ', 'p', null),
    (error) => error?.code === 'failed-precondition',
  );
});
