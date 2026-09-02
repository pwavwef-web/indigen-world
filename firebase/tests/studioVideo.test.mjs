import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  approvedKasemScriptMatches,
  estimateStudioVideoCost,
  parseStudioVideoInput,
  studioVideoCapabilities,
} from '../../services/functions/lib/studio-video-policy.js';

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
