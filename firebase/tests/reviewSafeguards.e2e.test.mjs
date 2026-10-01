// End-to-end tests of the review safeguards against the Auth, Firestore and
// Functions emulators:
//
//   npm run test:e2e      (from the repo root)
//
// A contributor's retried send creates one record, not two; a reviewer's
// decision made on an out-of-date view is refused without changing anything;
// and a pronunciation recording is decided once, never by its own speaker and
// never while another decision holds it.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { initializeApp as adminInit, deleteApp as adminDelete } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp as clientInit } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = 'demo-indigen-world';

let adminApp;
let speakerApp;
let reviewerApp;
let secondReviewerApp;
let db;

async function clientFor(uid, claims) {
  const app = clientInit({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, `safeguards-${uid}`);
  connectAuthEmulator(clientAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  const token = await adminAuth(adminApp).createCustomToken(uid, claims);
  await signInWithCustomToken(clientAuth(app), token);
  connectFunctionsEmulator(getFunctions(app), '127.0.0.1', 5001);
  return app;
}

const call = (app, name) => httpsCallable(getFunctions(app), name);

function expression(overrides = {}) {
  return {
    phrase: '[Safeguard expression]',
    meaning: 'A greeting used when someone returns home.',
    literalTranslation: '',
    context: 'Said by the household to a relative arriving home.',
    expressionKind: 'phrase',
    dialect: 'Navrongo',
    sourceType: 'elder',
    sourceDetail: 'An elder taught it to me.',
    speakerName: 'Elder Abena',
    speakerConsent: true,
    everydayConfirmed: true,
    publicationPermission: true,
    culturalPermissionTier: 'public',
    ...overrides,
  };
}

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID }, 'safeguards-admin');
  db = adminFirestore(adminApp);
  speakerApp = await clientFor('safeguard-speaker', {});
  reviewerApp = await clientFor('safeguard-reviewer', { role: 'validator' });
  secondReviewerApp = await clientFor('safeguard-reviewer-2', { role: 'validator' });
});

after(async () => {
  for (const app of [speakerApp, reviewerApp, secondReviewerApp]) if (app) await deleteApp(app);
  if (adminApp) await adminDelete(adminApp);
});

test('a retried send creates one expression; a changed send under the same request is refused', async () => {
  const payload = expression({ phrase: '[Retried safeguard]', requestId: 'safeguard-retry-0001' });
  const first = await call(speakerApp, 'submitExpression')(payload);
  const second = await call(speakerApp, 'submitExpression')(payload);
  assert.equal(second.data.contributionId, first.data.contributionId);
  assert.equal(second.data.submissionId, first.data.submissionId);
  assert.equal(second.data.replayed, true);
  assert.equal(first.data.replayed, undefined);

  const copies = await db.collection('collectionContributions')
    .where('authUid', '==', 'safeguard-speaker')
    .where('expression.phrase', '==', '[Retried safeguard]')
    .get();
  assert.equal(copies.size, 1, 'one receipt');
  assert.equal((await db.doc(`submissions/${first.data.submissionId}`).get()).get('status'), 'SUBMITTED');
  const notices = await db.collection('notifications').where('authUid', '==', 'safeguard-speaker').where('title', '==', 'Expression received').get();
  assert.equal(notices.size, 1, 'one notice');

  await assert.rejects(call(speakerApp, 'submitExpression')({ ...payload, meaning: 'Something else entirely.' }),
    (error) => error?.code === 'functions/already-exists' && /already sent/.test(error.message));
});

test('a decision made on an out-of-date view is refused, and nothing changes', async () => {
  const sent = await call(speakerApp, 'submitExpression')(expression({ phrase: '[Stale decision safeguard]' }));
  const id = sent.data.submissionId;
  const opened = await db.doc(`submissions/${id}`).get();
  const version = opened.get('lifecycle.version');
  assert.equal(typeof version, 'number');

  await assert.rejects(call(reviewerApp, 'decideSubmission')({
    submissionId: id, decision: 'APPROVE', feedback: '', expectedStatus: 'SUBMITTED', expectedVersion: version + 1,
  }), (error) => error?.code === 'functions/aborted');
  assert.equal((await db.doc(`submissions/${id}`).get()).get('status'), 'SUBMITTED');

  // Both reviewers opened it at the same version; the first decision lands.
  await call(reviewerApp, 'decideSubmission')({ submissionId: id, decision: 'APPROVE', feedback: '', expectedStatus: 'SUBMITTED', expectedVersion: version });
  await assert.rejects(call(secondReviewerApp, 'decideSubmission')({
    submissionId: id, decision: 'REJECT', feedback: 'Please check the spelling of the second word.', expectedStatus: 'SUBMITTED', expectedVersion: version,
  }), (error) => error?.code === 'functions/aborted' && /changed while you were reviewing/.test(error.message));
  const after = await db.doc(`submissions/${id}`).get();
  assert.equal(after.get('status'), 'APPROVED');
  assert.equal(after.get('moderation.reviewer.id'), 'safeguard-reviewer');

  // Older clients send no expectation and keep working.
  await call(secondReviewerApp, 'decideSubmission')({ submissionId: id, decision: 'PUBLISH', feedback: '' });
  assert.equal((await db.doc(`submissions/${id}`).get()).get('status'), 'PUBLISHED');
});

test('a recording is decided once, never by its speaker, and not while another decision holds it', async () => {
  await db.doc('dictionaryEntries/safeguard-entry').set({ id: 'safeguard-entry', kasemText: '[safeguard]', englishText: 'test word', isPublished: true, audioUrl: '' });
  const recording = (id, overrides = {}) => db.doc(`pronunciationRecordings/${id}`).set({
    id, status: 'submitted', source: 'contributor_portal', entryId: 'safeguard-entry', headword: '[safeguard]', meaning: 'test word',
    uid: 'safeguard-speaker', storagePath: `creator-submissions/safeguard-speaker/pronunciations/${id}/take.webm`, mimeType: 'audio/webm',
    durationMs: 1500, publishConsent: false, automatedAssessment: 'none', decidedBy: null, decidedAt: null, decisionNote: null,
    outcome: null, publishedUrl: null, ...overrides,
  });

  await recording('safeguard-own', { uid: 'safeguard-reviewer' });
  await assert.rejects(call(reviewerApp, 'decidePronunciationRecording')({ recordingId: 'safeguard-own', decision: 'approve', note: '' }),
    (error) => error?.code === 'functions/permission-denied');
  assert.equal((await db.doc('pronunciationRecordings/safeguard-own').get()).get('status'), 'submitted');

  await recording('safeguard-held', { decisionLock: { by: 'safeguard-reviewer-2', at: Date.now() } });
  await assert.rejects(call(reviewerApp, 'decidePronunciationRecording')({ recordingId: 'safeguard-held', decision: 'reject', note: 'The word is cut off at the end.' }),
    (error) => error?.code === 'functions/aborted' && /Another reviewer/.test(error.message));
  assert.equal((await db.doc('pronunciationRecordings/safeguard-held').get()).get('status'), 'submitted');

  await recording('safeguard-take');
  const approved = await call(reviewerApp, 'decidePronunciationRecording')({ recordingId: 'safeguard-take', decision: 'approve', note: '' });
  assert.equal(approved.data.outcome, 'approve_without_publishing');
  const decided = await db.doc('pronunciationRecordings/safeguard-take').get();
  assert.equal(decided.get('status'), 'approved');
  assert.equal(decided.get('decidedBy'), 'safeguard-reviewer');
  assert.equal(decided.get('decisionLock'), undefined, 'the claim is released');
  assert.equal((await db.doc('dictionaryEntries/safeguard-entry').get()).get('audioUrl'), '', 'without publication consent nothing is attached');

  await assert.rejects(call(secondReviewerApp, 'decidePronunciationRecording')({ recordingId: 'safeguard-take', decision: 'reject', note: 'Too quiet to hear clearly.' }),
    (error) => error?.code === 'functions/failed-precondition' && /already been decided/.test(error.message));

  await recording('safeguard-reject');
  await call(secondReviewerApp, 'decidePronunciationRecording')({ recordingId: 'safeguard-reject', decision: 'reject', note: 'Too quiet to hear clearly.' });
  const rejected = await db.doc('pronunciationRecordings/safeguard-reject').get();
  assert.equal(rejected.get('status'), 'rejected');
  assert.equal(rejected.get('decisionNote'), 'Too quiet to hear clearly.');
  const audit = await db.collection('auditLogs').where('targetId', '==', 'safeguard-reject').get();
  assert.equal(audit.docs[0]?.get('action'), 'pronunciation.reject');
});
