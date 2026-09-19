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
  vertexVideoRateUsdPerSecond,
} from '../../services/functions/lib/studio-video-policy.js';
import {
  OMNI_ADULTS_ONLY_INSTRUCTION,
  OMNI_SILENCE_INSTRUCTION,
  omniPrompt,
  omniRateUsdPerSecond,
  omniRequestBody,
  readOmniInteraction,
} from '../../services/functions/lib/omni-video.js';
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
  assert.equal(capabilities.pricingVersion, '2026-09-19');
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
// Gemini video (Gemini Omni on Vertex AI; Veo before 2026-09-19)
// ---------------------------------------------------------------------------

const GEMINI = 'gemini-omni-1.1-flash-preview';
const VEO = 'veo-3.1-generate-001';
const VEO_FAST = 'veo-3.1-fast-generate-001';

function geminiVisual(overrides = {}) {
  return visual({ provider: 'gemini', model: GEMINI, durationSeconds: 8, ...overrides });
}

test('a Gemini visual job is accepted with its own provider and lengths', () => {
  const parsed = parseStudioVideoInput(geminiVisual(), uid);
  assert.equal(parsed.provider, 'gemini');
  assert.equal(parsed.model, GEMINI);
  assert.equal(parsed.durationSeconds, 8);
  assert.equal(parseStudioVideoInput(geminiVisual({ durationSeconds: 10 }), uid).durationSeconds, 10);
});

test('each model states the lengths it will actually make', () => {
  assert.deepEqual([...durationsForVisualModel(GEMINI)], [4, 6, 8, 10]);
  assert.deepEqual([...durationsForVisualModel(VEO)], [4, 6, 8], 'retired, still described');
  assert.deepEqual([...durationsForVisualModel('gen4.5')], [5, 10]);

  // A length one model takes and the other does not must be refused for the
  // one that does not, rather than reaching the provider as a 400.
  for (const seconds of [5, 7, 3, 11, 0]) {
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
  // Square stays absent even with a reference image: Omni has no 1:1.
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
    () => parseStudioVideoInput(geminiVisual({ model: 'gemini-omni-9000' }), uid),
    (error) => error?.code === 'invalid-argument',
  );
});

test('Veo is no longer sold, and a page still offering it is told why', () => {
  for (const model of [VEO, VEO_FAST]) {
    assert.throws(
      () => parseStudioVideoInput(geminiVisual({ model }), uid),
      (error) => error?.code === 'invalid-argument' && /Gemini Omni/.test(error.message),
    );
  }
});

test('Gemini is estimated at the 1080p Omni rate the Studio renders at', () => {
  const eight = estimateStudioVideoCost(parseStudioVideoInput(geminiVisual(), uid));
  assert.equal(eight.rateUsd, 0.155);
  assert.equal(eight.amountUsd, 1.24);
  assert.equal(eight.pricingVersion, '2026-09-19');
  const ten = estimateStudioVideoCost(parseStudioVideoInput(geminiVisual({ durationSeconds: 10 }), uid));
  assert.equal(ten.amountUsd, 1.55);
});

test('Omni is priced per resolution, above what Google charges for the video alone', () => {
  // 5,792 and 8,688 video tokens a second at $17.50 per million.
  assert.ok(omniRateUsdPerSecond('720p') > 5_792 * 17.5 / 1_000_000);
  assert.ok(omniRateUsdPerSecond('1080p') > 8_688 * 17.5 / 1_000_000);
  assert.equal(omniRateUsdPerSecond('4k'), null, 'not offered, so not priced');
  assert.equal(vertexVideoRateUsdPerSecond(GEMINI, { resolution: '720p' }), 0.104);
  assert.equal(vertexVideoRateUsdPerSecond(GEMINI), 0.155, 'no resolution named: the dearest one');
  assert.equal(vertexVideoRateUsdPerSecond(VEO_FAST), 0.15, 'Veo keeps its own rate');
  assert.equal(vertexVideoRateUsdPerSecond('gen4.5'), null);
});

test('the capability response puts a provider and a length list on every model', () => {
  const capabilities = studioVideoCapabilities();
  const visualModels = capabilities.operations
    .find((item) => item.operation === 'generate_visual').models;
  const ids = visualModels.map((item) => item.id);
  assert.ok(ids.includes(GEMINI), 'Gemini Omni is offered');
  assert.ok(!ids.includes(VEO) && !ids.includes(VEO_FAST), 'Veo is not');
  assert.ok(ids.includes('gen4.5'), 'Runway is still offered');

  for (const model of visualModels) {
    assert.ok(model.provider, `${model.id} names its provider`);
    assert.ok(model.label, `${model.id} has a creator-facing label`);
    assert.ok(model.durationsSeconds.length > 0, `${model.id} states its lengths`);
  }
  const gemini = visualModels.find((item) => item.id === GEMINI);
  assert.equal(gemini.provider, 'gemini');
  assert.equal(gemini.label, 'Gemini Omni');
  assert.equal(gemini.estimatedUsdPerSecond, 0.155);
  assert.deepEqual([...gemini.durationsSeconds], [4, 6, 8, 10]);
  assert.equal(JSON.stringify(capabilities).includes('API_SECRET'), false);
});

test('a Gemini submission starts a background interaction and stores its id', async () => {
  const input = parseStudioVideoInput(geminiVisual(), uid);
  const { result: submission, calls } = await withStubbedFetch(
    { id: 'omni-interaction-1', status: 'in_progress', object: 'interaction' },
    () => submitGeminiVisual(input, 'ya29.token', 'p', null),
  );

  assert.equal(
    calls[0].url,
    'https://aiplatform.googleapis.com/v1beta1/projects/p/locations/global/interactions',
  );
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ya29.token');

  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.model, GEMINI);
  assert.equal(sent.background, true, 'answered at once, collected later');
  assert.equal(sent.input.length, 1);
  assert.equal(sent.input[0].type, 'text');
  assert.ok(sent.input[0].text.startsWith(input.prompt), 'the creator\'s words come first');
  // Silent on purpose: a generated voice would not be speaking Kasem.
  assert.ok(sent.input[0].text.includes(OMNI_SILENCE_INSTRUCTION));
  // The governance model refuses minors, and Omni has no setting to say so.
  assert.ok(sent.input[0].text.includes(OMNI_ADULTS_ONLY_INSTRUCTION));
  assert.deepEqual(sent.response_format, [
    { type: 'video', aspect_ratio: '16:9', resolution: '1080p', duration: '8s' },
  ]);
  assert.equal(sent.generation_config.video_config.task, 'text_to_video');

  const stored = readStoredProviderTask(submission);
  assert.ok(stored, 'the stored provider task must be readable');
  assert.equal(stored.providerTaskId, 'omni-interaction-1');
  assert.equal(submission.state, 'running');
});

test('a portrait Gemini request is sent as 9:16 at 1080p', async () => {
  const input = parseStudioVideoInput(geminiVisual({ ratio: '720:1280' }), uid);
  const { calls } = await withStubbedFetch(
    { id: 'omni-2', status: 'in_progress' },
    () => submitGeminiVisual(input, 'token', 'p', null),
  );
  const format = JSON.parse(calls[0].init.body).response_format[0];
  assert.equal(format.aspect_ratio, '9:16');
  assert.equal(format.resolution, '1080p');
});

test('a reference image travels to Vertex as bytes, as the opening frame', async () => {
  const input = parseStudioVideoInput(
    geminiVisual({ referenceImageStoragePath: `creator-submissions/${uid}/studio-video/a/image-x.png` }),
    uid,
  );
  const { calls } = await withStubbedFetch(
    { id: 'omni-3', status: 'in_progress' },
    () => submitGeminiVisual(input, 'token', 'p', { base64: 'QUJD', mimeType: 'image/png' }),
  );
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.input[1], { type: 'image', data: 'QUJD', mime_type: 'image/png' });
  assert.equal(sent.generation_config.video_config.task, 'image_to_video');
});

test('a create Vertex refuses is reported with Google\'s own reason', async () => {
  const input = parseStudioVideoInput(geminiVisual(), uid);
  await assert.rejects(
    withStubbedFetch(
      { ok: false, status: 400, json: { error: { message: 'Unsupported model interaction: x', code: 'invalid_request' } } },
      () => submitGeminiVisual(input, 'token', 'p', null),
    ),
    (error) => error?.code === 'unavailable' && /Unsupported model interaction/.test(error.message),
  );
});

test('an unfinished interaction reads as running, not as queued forever', async () => {
  const { result, calls } = await withStubbedFetch(
    { id: 'omni-1', status: 'in_progress' },
    () => pollGeminiVisual('omni-1', GEMINI, 'token', 'p'),
  );
  assert.equal(
    calls[0].url,
    'https://aiplatform.googleapis.com/v1beta1/projects/p/locations/global/interactions/omni-1',
  );
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(result.state, 'running');
  assert.equal(result.outputUrl, null);
  assert.equal(result.outputBase64, null);
});

test('a finished interaction hands back the video bytes', async () => {
  const { result } = await withStubbedFetch(
    {
      id: 'omni-1',
      status: 'completed',
      steps: [
        { type: 'user_input', content: [{ type: 'text', text: 'x' }] },
        { type: 'thought', summary: [{ type: 'text', text: 'thinking' }] },
        { type: 'model_output', content: [{ type: 'video', data: 'AAAA', mime_type: 'video/mp4' }] },
      ],
    },
    () => pollGeminiVisual('omni-1', GEMINI, 'token', 'p'),
  );
  assert.equal(result.state, 'succeeded');
  assert.equal(result.outputBase64, 'AAAA');
  assert.equal(result.outputUrl, null);
});

test('a refused prompt ends the job with a reason that says to rephrase', async () => {
  const { result } = await withStubbedFetch(
    {
      id: 'omni-1',
      status: 'failed',
      errors: [{
        message: 'Request blocked for an unspecified policy reason. Please modify your input and retry.',
        code: 'content_blocked',
      }],
    },
    () => pollGeminiVisual('omni-1', GEMINI, 'token', 'p'),
  );
  assert.equal(result.state, 'failed');
  assert.match(result.failureReason, /^Gemini declined this prompt: Request blocked/);
});

test('an interaction that fails for any other reason is failed, not left running', async () => {
  const { result } = await withStubbedFetch(
    {
      id: 'omni-1',
      status: 'failed',
      errors: [{ message: 'Generation duration 99 exceeds maximum duration 10.', code: 'invalid_request' }],
    },
    () => pollGeminiVisual('omni-1', GEMINI, 'token', 'p'),
  );
  assert.equal(result.state, 'failed');
  assert.match(result.failureReason, /exceeds maximum duration/);
});

test('a completed interaction with no video at all is still terminal', async () => {
  const { result } = await withStubbedFetch(
    { id: 'omni-1', status: 'completed', steps: [{ type: 'thought' }] },
    () => pollGeminiVisual('omni-1', GEMINI, 'token', 'p'),
  );
  assert.equal(result.state, 'failed');
  assert.ok(result.failureReason);
});

test('a Veo job started before the switch is still collected from its operation', async () => {
  const operationName = `projects/p/locations/us-central1/publishers/google/models/${VEO}/operations/op-1`;
  const { result, calls } = await withStubbedFetch(
    { done: true, response: { videos: [{ bytesBase64Encoded: 'AAAA', mimeType: 'video/mp4' }] } },
    () => pollGeminiVisual(operationName, VEO, 'token', 'p'),
  );
  assert.match(calls[0].url, /us-central1-aiplatform\.googleapis\.com/);
  assert.match(calls[0].url, /:fetchPredictOperation$/);
  assert.equal(JSON.parse(calls[0].init.body).operationName, operationName);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.outputBase64, 'AAAA');
});

test('a Veo operation that reports its own error is failed, not left running', async () => {
  const { result } = await withStubbedFetch(
    { done: true, error: { code: 3, message: 'The prompt was rejected.' } },
    () => pollGeminiVisual('op', VEO, 'token', 'p'),
  );
  assert.equal(result.state, 'failed');
  assert.match(result.failureReason, /prompt was rejected/);
});

test('a prompt Veo filtered ends the job with the reason it gave', async () => {
  const { result } = await withStubbedFetch(
    {
      done: true,
      response: { videos: [], raiMediaFilteredCount: 1, raiMediaFilteredReasons: ['unsafe content'] },
    },
    () => pollGeminiVisual('op', VEO, 'token', 'p'),
  );
  assert.equal(result.state, 'failed');
  assert.match(result.failureReason, /unsafe content/);
});

test('Gemini video refuses to run without ambient credentials', async () => {
  const input = parseStudioVideoInput(geminiVisual(), uid);
  await assert.rejects(
    () => submitGeminiVisual(input, '   ', 'p', null),
    (error) => error?.code === 'failed-precondition',
  );
});

// ---------------------------------------------------------------------------
// Omni's request and response shapes, shared with Kawuri
// ---------------------------------------------------------------------------

test('the Omni prompt says what the model has no parameters for', () => {
  assert.equal(omniPrompt({ prompt: '  A river at dawn.  ', sound: 'natural' }), 'A river at dawn.');
  const all = omniPrompt({
    prompt: 'A river at dawn.',
    negativePrompt: 'text on screen, watermarks.',
    sound: 'silent',
    adultsOnly: true,
  });
  assert.equal(
    all,
    [
      'A river at dawn.',
      'Do not include: text on screen, watermarks.',
      OMNI_ADULTS_ONLY_INSTRUCTION,
      OMNI_SILENCE_INSTRUCTION,
    ].join('\n\n'),
  );
});

test('an Omni request is a background interaction with the video described in full', () => {
  const body = omniRequestBody({
    model: GEMINI,
    prompt: 'p',
    aspectRatio: '9:16',
    resolution: '720p',
    durationSeconds: 6,
    image: { mimeType: 'image/png', gcsUri: 'gs://b/i.png' },
  });
  assert.deepEqual(body, {
    model: GEMINI,
    background: true,
    input: [{ type: 'text', text: 'p' }, { type: 'image', uri: 'gs://b/i.png', mime_type: 'image/png' }],
    response_format: [{ type: 'video', aspect_ratio: '9:16', resolution: '720p', duration: '6s' }],
    generation_config: { video_config: { task: 'image_to_video' } },
  });
});

test('reading an interaction: every status ends somewhere', () => {
  assert.deepEqual(readOmniInteraction({ status: 'in_progress' }), { state: 'running' });
  assert.deepEqual(readOmniInteraction({}), { state: 'running' }, 'an unknown status waits for the timeout');
  // The SDK's convenience copy counts as the video too.
  assert.deepEqual(
    readOmniInteraction({ status: 'completed', output_video: { type: 'video', data: 'AA', mime_type: 'video/mp4' } }),
    { state: 'succeeded', base64: 'AA', uri: null, mimeType: 'video/mp4' },
  );
  assert.equal(readOmniInteraction({ status: 'failed', errors: [{ code: 'content_blocked', message: '' }] }).state, 'rejected');
  assert.equal(readOmniInteraction({ status: 'failed', error: { message: 'Blocked by safety filters' } }).state, 'rejected');
  const quota = readOmniInteraction({ status: 'failed', errors: [{ code: 'resource_exhausted', message: 'Quota exceeded' }] });
  assert.equal(quota.state, 'failed');
  assert.equal(quota.quota, true);
  assert.equal(readOmniInteraction({ status: 'incomplete' }).state, 'failed');
  assert.equal(readOmniInteraction({ status: 'requires_action' }).state, 'failed');
  assert.equal(readOmniInteraction({ status: 'cancelled' }).state, 'cancelled');
});
