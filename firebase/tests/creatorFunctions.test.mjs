// End-to-end tests of the trusted creator Cloud Functions against the Auth,
// Firestore and Functions emulators:
//
//   npm run test:e2e      (from the repo root)
//
// Covers: application submission mints a profile + reference and blocks
// duplicates; a normal creator cannot moderate; approval creates a controlled
// publishedContent record and publishing is idempotent (no duplicate public
// records); content is never public before an approval decision.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { initializeApp as adminInit, deleteApp as adminDelete } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp as clientInit } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = 'demo-indigen-world';
const CAMPAIGN = 'kasem-creator-challenge';

let adminApp;
let creatorApp;
let validatorApp;
let adminClientApp;
let db;

const life = () => ({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1 });

async function clientFor(uid, claims) {
  const app = clientInit({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, `c-${uid}`);
  connectAuthEmulator(clientAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  const token = await adminAuth(adminApp).createCustomToken(uid, claims);
  await signInWithCustomToken(clientAuth(app), token);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  return app;
}

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID });
  db = adminFirestore(adminApp);
  await db.doc(`campaigns/${CAMPAIGN}`).set({
    id: CAMPAIGN, slug: CAMPAIGN, title: 'Kasem Creator Challenge', initiative: 'Project Kasena',
    status: 'WAITLIST_OPEN', visibility: 'public', lifecycle: life(),
  });
  creatorApp = await clientFor('creator-e2e', {});
  validatorApp = await clientFor('validator-e2e', { role: 'validator' });
  adminClientApp = await clientFor('admin-e2e', { role: 'admin' });
});

after(async () => {
  if (creatorApp) await deleteApp(creatorApp);
  if (validatorApp) await deleteApp(validatorApp);
  if (adminClientApp) await deleteApp(adminClientApp);
  if (adminApp) await adminDelete(adminApp);
});

const call = (app, name) => httpsCallable(getFunctions(app), name);

const applicationPayload = () => ({
  campaignId: CAMPAIGN,
  profile: {
    public: { displayName: 'E2E Creator', username: 'e2e-creator', country: 'GH', region: 'Navrongo', kasemProficiency: 'native', dialect: 'navrongo', interests: ['storytelling'] },
    contact: { email: 'e2e@example.com', phone: '+233200000001', preferredContactMethod: 'whatsapp', preferredLanguage: 'en' },
    fullName: 'E2E Creator',
    ageConfirmed: true,
    isMinor: false,
  },
  consent: { termsAccepted: true, privacyAccepted: true, communicationsAccepted: true, accuracyConfirmed: true, termsVersion: 'creator-terms-2026-08' },
});

test('submitCreatorApplication mints a profile + reference and blocks duplicates', async () => {
  const res = await call(creatorApp, 'submitCreatorApplication')(applicationPayload());
  assert.equal(res.data.status, 'SUBMITTED');
  assert.match(res.data.reference, /^[A-Z]{2,6}-\d{4}-\d{4}$/);

  const profile = await db.doc('creatorProfiles/creator-e2e').get();
  assert.ok(profile.exists, 'a creator profile is created');
  assert.equal(profile.get('reference'), res.data.reference);

  // A second submission to the same campaign is rejected.
  await assert.rejects(
    call(creatorApp, 'submitCreatorApplication')(applicationPayload()),
    (err) => err?.code === 'functions/already-exists',
  );
});

test('admin approval creates an approved membership and creator claim', async () => {
  const res = await call(adminClientApp, 'decideCreatorApplication')({
    applicationId: `creator-e2e__${CAMPAIGN}`,
    decision: 'APPROVE',
    reason: '',
    assignedLanguages: ['xsm'],
    assignedCommunities: ['Kasena'],
    assignedCampaigns: [CAMPAIGN],
    permissions: ['profile:write', 'submission:write'],
  });
  assert.equal(res.data.newStatus, 'APPROVED');
  assert.equal(res.data.membershipStatus, 'approved');

  const membership = await db.doc('creatorMemberships/creator-e2e').get();
  assert.equal(membership.get('status'), 'approved');
  assert.deepEqual(membership.get('roles'), ['creator']);

  const user = await adminAuth(adminApp).getUser('creator-e2e');
  assert.equal(user.customClaims.creatorStatus, 'approved');
  assert.deepEqual(user.customClaims.creatorRoles, ['creator']);
});

test('a normal creator cannot moderate a submission', async () => {
  await db.doc('submissions/sub-e2e').set({
    id: 'sub-e2e', authUid: 'other-creator', campaign: { collection: 'campaigns', id: CAMPAIGN },
    creator: { collection: 'creatorProfiles', id: 'other-creator' }, status: 'SUBMITTED', title: 'A piece',
    disclosures: { involvesMinors: false, usesThirdPartyMaterial: false },
    permissions: { review: true, publication: true, promotion: false, aiTraining: false },
    lifecycle: life(),
  });
  await assert.rejects(
    call(creatorApp, 'decideSubmission')({ submissionId: 'sub-e2e', decision: 'APPROVE', feedback: '' }),
    (err) => err?.code === 'functions/permission-denied',
  );
});

test('content is not public before approval, and publishing is idempotent', async () => {
  // Before any decision, no published record exists.
  const before = await db.doc('publishedContent/pub_sub-e2e').get();
  assert.equal(before.exists, false, 'no public record before approval');

  // Approve -> creates an unpublished controlled record.
  await call(validatorApp, 'decideSubmission')({ submissionId: 'sub-e2e', decision: 'APPROVE', feedback: '' });
  const approved = await db.doc('publishedContent/pub_sub-e2e').get();
  assert.ok(approved.exists, 'approval creates a publishedContent record');
  assert.equal(approved.get('publicationStatus'), 'unpublished');
  assert.equal((await db.doc('submissions/sub-e2e').get()).get('status'), 'APPROVED');

  // Publish twice -> single record, status published (idempotent).
  await call(validatorApp, 'decideSubmission')({ submissionId: 'sub-e2e', decision: 'PUBLISH', feedback: '' });
  await call(validatorApp, 'decideSubmission')({ submissionId: 'sub-e2e', decision: 'PUBLISH', feedback: '' });
  const published = await db.collection('publishedContent').where('submission.id', '==', 'sub-e2e').get();
  assert.equal(published.size, 1, 'publishing never creates duplicate public records');
  assert.equal(published.docs[0].get('publicationStatus'), 'published');
});

test('a reviewer cannot decide on their own submission', async () => {
  await db.doc('submissions/sub-self').set({
    id: 'sub-self', authUid: 'validator-e2e', campaign: { collection: 'campaigns', id: CAMPAIGN },
    creator: { collection: 'creatorProfiles', id: 'validator-e2e' }, status: 'SUBMITTED', title: 'Mine',
    disclosures: { involvesMinors: false, usesThirdPartyMaterial: false },
    permissions: { review: true, publication: true, promotion: false, aiTraining: false },
    lifecycle: life(),
  });
  await assert.rejects(
    call(validatorApp, 'decideSubmission')({ submissionId: 'sub-self', decision: 'APPROVE', feedback: '' }),
    (err) => err?.code === 'functions/permission-denied',
  );
});
