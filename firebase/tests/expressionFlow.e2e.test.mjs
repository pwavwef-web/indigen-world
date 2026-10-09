// End-to-end test of the everyday-expressions flow against the Auth, Firestore
// and Functions emulators:
//
//   npm run test:e2e      (from the repo root)
//
// A signed-in member sends an expression with `submitExpression`; a validator
// approves and publishes it with `decideSubmission`; the member withdraws it.
// At every step the member's own receipt says where the review stands, and the
// published record lands in `expressionEntries` — never in `dictionaryEntries`.

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
let otherApp;
let validatorApp;
let db;

async function clientFor(uid, claims) {
  const app = clientInit({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, `x-${uid}`);
  connectAuthEmulator(clientAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  const token = await adminAuth(adminApp).createCustomToken(uid, claims);
  await signInWithCustomToken(clientAuth(app), token);
  connectFunctionsEmulator(getFunctions(app), '127.0.0.1', 5001);
  return app;
}

const call = (app, name) => httpsCallable(getFunctions(app), name);

async function waitFor(check, message, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail(message);
}

function expression(overrides = {}) {
  return {
    phrase: '[Kasem expression e2e]',
    meaning: 'Welcome back from your journey.',
    literalTranslation: '',
    context: 'Said by the household to a relative arriving home.',
    expressionKind: 'phrase',
    dialect: 'Navrongo',
    sourceType: 'elder',
    sourceDetail: 'An elder in Navrongo taught it to me.',
    speakerName: 'Elder Abena',
    speakerConsent: true,
    everydayConfirmed: true,
    publicationPermission: true,
    culturalPermissionTier: 'public',
    ...overrides,
  };
}

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID });
  db = adminFirestore(adminApp);
  await db.doc('creatorProfiles/speaker-e2e').set({ id: 'speaker-e2e', public: { displayName: 'Speaker E2E' } });
  speakerApp = await clientFor('speaker-e2e', {});
  otherApp = await clientFor('other-e2e', {});
  validatorApp = await clientFor('reviewer-e2e', { role: 'validator' });
});

after(async () => {
  for (const app of [speakerApp, otherApp, validatorApp]) if (app) await deleteApp(app);
  if (adminApp) await adminDelete(adminApp);
});

test('an expression is refused until the five pieces and consent are there', async () => {
  await assert.rejects(call(speakerApp, 'submitExpression')(expression({ context: '' })),
    (error) => error?.code === 'functions/invalid-argument' && /when the expression is used/.test(error.message));
  await assert.rejects(call(speakerApp, 'submitExpression')(expression({ speakerConsent: false })),
    (error) => error?.code === 'functions/failed-precondition');
  // The generic Collection door does not take expressions.
  await assert.rejects(call(speakerApp, 'submitCollectionContribution')({
    collectionKind: 'expressions', title: 'Meaning', body: 'Phrase', format: 'Phrase', dialect: 'Navrongo',
    source: 'Me', rightsConfirmed: true, publicationPermission: true, usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
  }), (error) => error?.code === 'functions/invalid-argument');
});

test('sent, approved, published as an expression, then withdrawn — with the status recorded at each step', async () => {
  const sent = await call(speakerApp, 'submitExpression')(expression({ aiTraining: false }));
  const id = sent.data.contributionId;
  assert.equal(sent.data.status, 'SUBMITTED');

  const receipt = () => db.doc(`collectionContributions/${id}`).get();
  let mine = await receipt();
  assert.equal(mine.get('authUid'), 'speaker-e2e');
  assert.equal(mine.get('collectionKind'), 'expressions');
  assert.equal(mine.get('status'), 'submitted');
  assert.equal(mine.get('expression.phrase'), '[Kasem expression e2e]');
  assert.equal(mine.get('expression.context'), 'Said by the household to a relative arriving home.');
  assert.equal(mine.get('expression.source.type'), 'elder');
  assert.equal(mine.get('expression.consent.source'), 'The person I learned it from agreed that I may share it.');
  const submission = await db.doc(`submissions/${id}`).get();
  assert.equal(submission.get('status'), 'SUBMITTED');
  assert.equal(submission.get('collectionKind'), 'expressions');
  assert.equal(submission.get('permissions.aiTraining'), false);
  const received = await db.collection('notifications').where('authUid', '==', 'speaker-e2e').where('title', '==', 'Expression received').get();
  assert.equal(received.size, 1);

  // Nobody else can review it, and the contributor cannot review their own.
  await assert.rejects(call(otherApp, 'decideSubmission')({ submissionId: id, decision: 'APPROVE', feedback: '' }),
    (error) => error?.code === 'functions/permission-denied');

  await call(validatorApp, 'decideSubmission')({ submissionId: id, decision: 'APPROVE', feedback: '' });
  mine = await receipt();
  assert.equal(mine.get('status'), 'approved');

  await call(validatorApp, 'decideSubmission')({ submissionId: id, decision: 'PUBLISH', feedback: '' });
  mine = await receipt();
  assert.equal(mine.get('status'), 'published');
  assert.deepEqual(mine.get('publicationTarget'), { collection: 'expressionEntries', id: `expr_${id}` });

  const entry = await db.doc(`expressionEntries/expr_${id}`).get();
  assert.equal(entry.get('isPublished'), true);
  assert.equal(entry.get('phrase'), '[Kasem expression e2e]');
  assert.equal(entry.get('meaning'), 'Welcome back from your journey.');
  assert.equal(entry.get('context'), 'Said by the household to a relative arriving home.');
  assert.equal(entry.get('source.speakerName'), 'Elder Abena');
  assert.equal(entry.get('contributor.displayName'), 'Speaker E2E');
  assert.equal((await db.doc(`dictionaryEntries/collection_${id}`).get()).exists, false,
    'an expression never becomes a dictionary entry');

  const published = await db.collection('notifications').where('authUid', '==', 'speaker-e2e').where('title', '==', 'Expression published').get();
  assert.equal(published.size, 1);
  assert.equal(published.docs[0].get('link'), '/studio/expressions');

  const withdrawn = await call(speakerApp, 'withdrawCollectionContribution')({ contributionId: id });
  assert.equal(withdrawn.data.unpublished, true);
  assert.equal((await db.doc(`expressionEntries/expr_${id}`).get()).get('isPublished'), false);
  assert.equal((await receipt()).get('status'), 'withdrawn');
});

test('a declined expression carries the reviewer’s reason and can be corrected and sent again', async () => {
  const first = await call(speakerApp, 'submitExpression')(expression({ phrase: '[Declined e2e]' }));
  const id = first.data.contributionId;
  await call(validatorApp, 'decideSubmission')({ submissionId: id, decision: 'REJECT', feedback: 'Please check the spelling of the second word.' });
  const declined = await db.doc(`collectionContributions/${id}`).get();
  assert.equal(declined.get('status'), 'rejected');
  assert.equal(declined.get('reviewFeedback'), 'Please check the spelling of the second word.');

  // Only its own author may correct it.
  await assert.rejects(call(otherApp, 'submitExpression')(expression({ revisionOf: id })),
    (error) => error?.code === 'functions/failed-precondition');
  const again = await call(speakerApp, 'submitExpression')(expression({ phrase: '[Corrected e2e]', revisionOf: id }));
  const corrected = await db.doc(`collectionContributions/${again.data.contributionId}`).get();
  assert.equal(corrected.get('revisionOf'), id);
  assert.equal(corrected.get('status'), 'submitted');
  assert.equal((await db.doc(`submissions/${again.data.contributionId}`).get()).get('revisionOf'), id);
  // One correction per declined expression.
  assert.equal((await db.doc(`collectionContributions/${id}`).get()).get('correctedBy'), again.data.contributionId);
  await assert.rejects(call(speakerApp, 'submitExpression')(expression({ phrase: '[Second fix e2e]', revisionOf: id })),
    (error) => error?.code === 'functions/failed-precondition' && /already been corrected/.test(error.message));
});

// Last, because the scoring trigger's worker can cold-start well after the
// callables it follows; the tests above give it that time.
test('an accepted expression is counted as accepted work, but never as a word', async () => {
  await waitFor(async () => Number((await db.doc('contributorScores/speaker-e2e').get()).get('approvedCount') ?? 0) >= 1,
    'the approval was never scored', 150_000);
  const score = await db.doc('contributorScores/speaker-e2e').get();
  assert.equal(score.get('wordCount') ?? 0, 0);
  assert.equal(score.get('otherCount'), 1);
  assert.equal(score.get('points'), 10);
});
