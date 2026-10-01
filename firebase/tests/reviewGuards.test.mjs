// Pure unit tests for the guards that keep contributions from being sent twice
// and review decisions from overwriting each other — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/reviewGuards.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DECISION_LOCK_MS,
  parseDecisionExpectation,
  parseRequestId,
  recordingDecisionProblem,
  replayOutcome,
  requestDocumentId,
  requestFingerprint,
  staleDecisionProblem,
} from '../../services/functions/lib/review-guards.js';
import { parseRecordingSubmission } from '../../services/functions/lib/pronunciation-recordings.js';

test('a request id is optional, and must be a plain token when given', () => {
  assert.equal(parseRequestId(undefined), null);
  assert.equal(parseRequestId(''), null);
  assert.equal(parseRequestId('0a1b2c3d4e5f6a7b8c9d0e1f'), '0a1b2c3d4e5f6a7b8c9d0e1f');
  for (const bad of ['short', 'has space in it', 'slash/inside/it', 42, { id: 'x' }, 'x'.repeat(129)]) {
    assert.throws(() => parseRequestId(bad), /request id is not valid/);
  }
});

test('the same caller and request always map to the same record id; others never do', () => {
  const first = requestDocumentId('uid-a', 'expression', 'request-0001');
  assert.equal(first, requestDocumentId('uid-a', 'expression', 'request-0001'));
  assert.match(first, /^[0-9a-f]{28}$/);
  assert.notEqual(first, requestDocumentId('uid-b', 'expression', 'request-0001'), 'another person');
  assert.notEqual(first, requestDocumentId('uid-a', 'recording', 'request-0001'), 'another kind of record');
  assert.notEqual(first, requestDocumentId('uid-a', 'expression', 'request-0002'), 'another request');
});

test('fingerprints ignore key order but not content', () => {
  assert.equal(requestFingerprint({ a: 1, b: { c: [1, 2] } }), requestFingerprint({ b: { c: [1, 2] }, a: 1 }));
  assert.notEqual(requestFingerprint({ phrase: 'Bʋ wʋ' }), requestFingerprint({ phrase: 'Bʋ wʋʋ' }));
  assert.equal(requestFingerprint({ a: 1, b: undefined }), requestFingerprint({ a: 1 }));
});

test('a retry replays the first record; a changed request under the same id is refused', () => {
  const fingerprint = requestFingerprint({ phrase: 'A' });
  assert.equal(replayOutcome(null, 'uid-a', fingerprint), 'create');
  assert.equal(replayOutcome({ authUid: 'uid-a', requestFingerprint: fingerprint }, 'uid-a', fingerprint), 'replay');
  assert.equal(replayOutcome({ uid: 'uid-a', requestFingerprint: fingerprint }, 'uid-a', fingerprint), 'replay', 'recordings store uid');
  assert.equal(replayOutcome({ authUid: 'uid-a', requestFingerprint: 'other' }, 'uid-a', fingerprint), 'conflict', 'edited after the first attempt');
  assert.equal(replayOutcome({ authUid: 'uid-b', requestFingerprint: fingerprint }, 'uid-a', fingerprint), 'conflict', 'never answer with someone else’s record');
  assert.equal(replayOutcome({ authUid: 'uid-a' }, 'uid-a', fingerprint), 'conflict', 'a record made without a request id');
});

test('decision expectations are optional and validated', () => {
  assert.deepEqual(parseDecisionExpectation({}), { status: null, version: null });
  assert.deepEqual(parseDecisionExpectation({ expectedStatus: 'SUBMITTED', expectedVersion: 3 }), { status: 'SUBMITTED', version: 3 });
  assert.deepEqual(parseDecisionExpectation({ expectedStatus: '', expectedVersion: null }), { status: null, version: null });
  assert.throws(() => parseDecisionExpectation({ expectedStatus: 'DROP TABLE' }), /expectedStatus/);
  assert.throws(() => parseDecisionExpectation({ expectedVersion: 1.5 }), /expectedVersion/);
  assert.throws(() => parseDecisionExpectation({ expectedVersion: -1 }), /expectedVersion/);
  assert.throws(() => parseDecisionExpectation({ expectedVersion: '2' }), /expectedVersion/);
});

test('a decision made on what the reviewer saw goes through; a stale one is refused', () => {
  const current = { status: 'SUBMITTED', version: 2 };
  assert.equal(staleDecisionProblem(current, { status: null, version: null }), null, 'older clients send nothing');
  assert.equal(staleDecisionProblem(current, { status: 'SUBMITTED', version: 2 }), null);
  assert.match(staleDecisionProblem({ status: 'APPROVED', version: 3 }, { status: 'SUBMITTED', version: 2 }), /changed while you were reviewing/);
  assert.match(staleDecisionProblem({ status: 'SUBMITTED', version: 3 }, { status: 'SUBMITTED', version: 2 }), /Someone else updated/);
  assert.equal(staleDecisionProblem({ status: 'SUBMITTED' }, { status: 'SUBMITTED', version: 2 }), null, 'records without a version are judged on status');
});

test('a recording is decided once, never by its speaker, and by one reviewer at a time', () => {
  const now = 1_000_000_000;
  const waiting = { status: 'submitted', uid: 'speaker' };
  assert.equal(recordingDecisionProblem(waiting, 'reviewer', now), null);
  assert.equal(recordingDecisionProblem(waiting, 'speaker', now)?.code, 'permission-denied');
  assert.equal(recordingDecisionProblem({ ...waiting, status: 'approved' }, 'reviewer', now)?.code, 'failed-precondition');
  const locked = { ...waiting, decisionLock: { by: 'other-reviewer', at: now - 1_000 } };
  assert.deepEqual(recordingDecisionProblem(locked, 'reviewer', now), { code: 'aborted', message: 'Another reviewer is deciding this recording right now.' });
  assert.match(recordingDecisionProblem({ ...waiting, decisionLock: { by: 'reviewer', at: now - 1_000 } }, 'reviewer', now).message, /still being recorded/);
  assert.equal(recordingDecisionProblem({ ...waiting, decisionLock: { by: 'other-reviewer', at: now - DECISION_LOCK_MS - 1 } }, 'reviewer', now), null, 'an abandoned claim expires');
});

test('a recording submission records where it was made; older clients mean the Learn tab', () => {
  const base = { entryId: 'entry-1', storagePath: 'creator-submissions/uid-a/pronunciations/x/take.webm', durationMs: 1200, publishConsent: true };
  assert.equal(parseRecordingSubmission(base, 'uid-a').source, 'learn_speak');
  assert.equal(parseRecordingSubmission({ ...base, source: 'contributor_portal' }, 'uid-a').source, 'contributor_portal');
  assert.throws(() => parseRecordingSubmission({ ...base, source: 'elsewhere' }, 'uid-a'), /Unknown recording source/);
});
