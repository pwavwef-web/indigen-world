// Pure tests of the course illustration desk's rules — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/learnIllustrations.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COURSE_STYLE,
  ILLUSTRATION_ASPECT_RATIOS,
  ILLUSTRATION_SIZES,
  attributionFor,
  canGenerateIllustrations,
  canReviewIllustrations,
  composeIllustrationPrompt,
  draftPath,
  illustrationIdFor,
  imageSizeFor,
  modelLabel,
  modelsForQuality,
  newIllustrationRecord,
  parseIllustrationRequest,
  parseIllustrationReview,
  publishedPath,
  readIllustrationConfig,
  referencePathFor,
  targetCollection,
} from '../../services/functions/lib/learn-illustration-policy.js';

const uid = 'staff-1';

function reasonOf(fn) {
  try {
    fn();
  } catch (error) {
    return error?.details?.reason ?? error?.code ?? 'threw';
  }
  return null;
}

test('standard is Nano Banana 2 and best is Nano Banana Pro, each replaceable by environment', () => {
  const defaults = readIllustrationConfig({}, 'demo-project');
  assert.equal(defaults.project, 'demo-project');
  assert.equal(defaults.location, 'global');
  assert.deepEqual(modelsForQuality(defaults, 'standard'), ['gemini-3.1-flash-image', 'gemini-2.5-flash-image']);
  assert.deepEqual(modelsForQuality(defaults, 'best'), ['gemini-3-pro-image', 'gemini-3.1-flash-image'],
    'best quality falls back to Nano Banana 2, never silently to 2.5');

  const configured = readIllustrationConfig({
    VERTEX_IMAGE_MODEL: 'gemini-3.1-flash-image',
    VERTEX_IMAGE_PRO_MODEL: 'gemini-3-pro-image-preview',
  }, 'p');
  assert.equal(configured.bestModels[0], 'gemini-3-pro-image-preview');

  assert.equal(modelLabel('gemini-3-pro-image'), 'Nano Banana Pro');
  assert.equal(modelLabel('gemini-3.1-flash-image'), 'Nano Banana 2');
  assert.equal(imageSizeFor('gemini-3-pro-image', '2K'), '2K');
  assert.equal(imageSizeFor('gemini-2.5-flash-image', '2K'), null, '2.5 rejects imageSize');
});

test('a request names its shape, size, quality and target, and nothing else gets through', () => {
  const base = { requestId: 'ill_00000001', prompt: 'A family outside a painted compound', aspectRatio: '16:9' };
  const ok = parseIllustrationRequest(base, uid);
  assert.equal(ok.quality, 'standard');
  assert.equal(ok.imageSize, '1K');
  assert.equal(ok.style, 'course', 'the house style is on unless turned off');
  assert.deepEqual(ok.target, { kind: 'none', id: '' });
  assert.deepEqual([...ILLUSTRATION_ASPECT_RATIOS], ['1:1', '4:3', '16:9', '9:16']);

  assert.equal(parseIllustrationRequest({ ...base, quality: 'best', imageSize: '4K' }, uid).imageSize, '4K');
  assert.equal(reasonOf(() => parseIllustrationRequest({ ...base, imageSize: '4K' }, uid)), 'INVALID_REQUEST',
    '4K is a best-quality size');
  assert.deepEqual([...ILLUSTRATION_SIZES.standard], ['1K', '2K']);
  assert.equal(reasonOf(() => parseIllustrationRequest({ ...base, aspectRatio: '3:2' }, uid)), 'INVALID_REQUEST');
  assert.equal(reasonOf(() => parseIllustrationRequest({ ...base, prompt: '' }, uid)), 'INVALID_REQUEST');
  assert.equal(reasonOf(() => parseIllustrationRequest({ ...base, requestId: 'x' }, uid)), 'INVALID_REQUEST');
  assert.equal(reasonOf(() => parseIllustrationRequest({ ...base, mode: 'edit' }, uid)), 'INVALID_REQUEST',
    'an edit needs something to edit');
  assert.equal(parseIllustrationRequest({ ...base, mode: 'edit', sourceIllustrationId: 'abc_123' }, uid).sourceIllustrationId, 'abc_123');

  const unit = parseIllustrationRequest({ ...base, target: { kind: 'unit', id: 'unit-2' } }, uid);
  assert.deepEqual(unit.target, { kind: 'unit', id: 'unit-2' });
  assert.equal(reasonOf(() => parseIllustrationRequest({ ...base, target: { kind: 'unit', id: '../x' } }, uid)), 'INVALID_REQUEST');
});

test('reference images must be the staff member’s own desk uploads', () => {
  const own = `learn-illustrations/references/${uid}/up1/wall.png`;
  assert.equal(referencePathFor(own, uid), own);
  assert.equal(reasonOf(() => referencePathFor('learn-illustrations/references/other/up1/wall.png', uid)), 'INVALID_REQUEST');
  assert.equal(reasonOf(() => referencePathFor(`learn-illustrations/references/${uid}/../../x.png`, uid)), 'INVALID_REQUEST');
  assert.equal(reasonOf(() => referencePathFor('published-media/x.png', uid)), 'INVALID_REQUEST');
  assert.equal(
    reasonOf(() => parseIllustrationRequest({
      requestId: 'ill_00000001', prompt: 'x', aspectRatio: '1:1',
      referenceImagePaths: [own, own.replace('up1', 'up2'), own.replace('up1', 'up3'), own.replace('up1', 'up4')],
    }, uid)),
    'INVALID_REQUEST',
    'at most three references',
  );
});

test('the house style frames every course prompt and forbids text and sacred material', () => {
  const composed = composeIllustrationPrompt({ prompt: 'A market at dusk', style: 'course', mode: 'generate', referenceCount: 0 });
  assert.ok(composed.startsWith(COURSE_STYLE));
  assert.ok(composed.endsWith('A market at dusk'));
  assert.match(COURSE_STYLE, /Kassena/);
  assert.match(COURSE_STYLE, /any written text/);
  assert.match(COURSE_STYLE, /masks, shrines/);
  assert.match(COURSE_STYLE, /any age/);

  const edit = composeIllustrationPrompt({ prompt: 'Make it morning', style: 'none', mode: 'edit', referenceCount: 1 });
  assert.doesNotMatch(edit, /House style/);
  assert.match(edit, /Edit the first attached image/);
});

test('editors generate, only administrators approve', () => {
  for (const role of ['validator', 'reviewer', 'admin', 'super_admin']) {
    assert.equal(canGenerateIllustrations(role), true, role);
  }
  for (const role of [undefined, null, 'contributor', 'creator', 'learner']) {
    assert.equal(canGenerateIllustrations(role), false, String(role));
  }
  assert.equal(canReviewIllustrations('admin'), true);
  assert.equal(canReviewIllustrations('super_admin'), true);
  assert.equal(canReviewIllustrations('validator'), false);
  assert.equal(canReviewIllustrations('reviewer'), false);
  assert.equal(canReviewIllustrations(undefined, true), true, 'the superAdmin claim counts');
});

test('a review approves or rejects, and a rejection says why', () => {
  assert.equal(parseIllustrationReview({ illustrationId: 'a_1', decision: 'approve' }).target, null);
  assert.deepEqual(
    parseIllustrationReview({ illustrationId: 'a_1', decision: 'approve', target: { kind: 'lesson', id: 'unit1-say-hello' } }).target,
    { kind: 'lesson', id: 'unit1-say-hello' },
  );
  assert.equal(reasonOf(() => parseIllustrationReview({ illustrationId: 'a_1', decision: 'reject' })), 'INVALID_REQUEST');
  assert.equal(parseIllustrationReview({ illustrationId: 'a_1', decision: 'reject', note: 'Clothing is wrong for the region' }).note,
    'Clothing is wrong for the region');
  assert.equal(reasonOf(() => parseIllustrationReview({ illustrationId: 'a_1', decision: 'publish' })), 'INVALID_REQUEST');
});

test('records start as generating drafts with provenance, stored privately until approved', () => {
  const request = parseIllustrationRequest({ requestId: 'ill_00000001', prompt: 'A family', aspectRatio: '16:9', target: { kind: 'unit', id: 'unit-2' } }, uid);
  const id = illustrationIdFor(uid, request.requestId);
  const record = newIllustrationRecord({ id, uid, creatorName: 'Ama', request, composedPrompt: 'styled', now: '2026-09-14T12:00:00.000Z' });
  assert.equal(record.status, 'generating');
  assert.equal(record.aiGenerated, true);
  assert.equal(record.prompt, 'A family');
  assert.equal(record.composedPrompt, 'styled');
  assert.equal(record.creatorUid, uid);
  assert.equal(record.createdAt, '2026-09-14T12:00:00.000Z');
  assert.equal(record.publicUrl, null);
  assert.equal(record.reviewedBy, null);

  assert.equal(draftPath(id, 'image/png'), `learn-illustrations/drafts/${id}/image.png`);
  assert.equal(publishedPath(id, 'image/jpeg'), `published-media/learn-illustrations/${id}.jpg`);
  assert.equal(targetCollection('unit'), 'learnUnits');
  assert.equal(targetCollection('lesson'), 'learnLessons');
  assert.equal(targetCollection('course'), 'learnCourses');
  assert.equal(targetCollection('none'), null);
  assert.equal(attributionFor('gemini-3-pro-image', 'Francis'), 'AI illustration (Nano Banana Pro, Vertex AI) · reviewed by Francis');
});

// ── Pronunciation recordings from Speak practice ───────────────────────────

const recordings = await import('../../services/functions/lib/pronunciation-recordings.js');

test('a recording belongs to its maker, names a word, and says whether it may be published', () => {
  const base = {
    entryId: 'entry-1',
    storagePath: 'creator-submissions/learner-1/collection/abc/pronunciation.m4a',
    durationMs: 1800,
    publishConsent: false,
  };
  assert.deepEqual(recordings.parseRecordingSubmission(base, 'learner-1'), base);
  assert.throws(() => recordings.parseRecordingSubmission(base, 'learner-2'), /Upload the recording/);
  assert.throws(() => recordings.parseRecordingSubmission({ ...base, durationMs: 90_000 }, 'learner-1'), /30 seconds/);
  assert.throws(() => recordings.parseRecordingSubmission({ ...base, publishConsent: 'yes' }, 'learner-1'), /publish/);
  assert.throws(() => recordings.parseRecordingSubmission({ ...base, entryId: '../x' }, 'learner-1'), /published word/);
});

test('approval never replaces a published recording and never publishes without consent', () => {
  assert.equal(recordings.approvalOutcome({ publishConsent: true, entryHasAudio: false }), 'attach_to_entry');
  assert.equal(recordings.approvalOutcome({ publishConsent: true, entryHasAudio: true }), 'keep_as_additional');
  assert.equal(recordings.approvalOutcome({ publishConsent: false, entryHasAudio: false }), 'approve_without_publishing');
  assert.throws(() => recordings.parseRecordingDecision({ recordingId: 'r1', decision: 'reject' }), /Say why/);
  assert.equal(recordings.parseRecordingDecision({ recordingId: 'r1', decision: 'approve' }).note, '');
});
