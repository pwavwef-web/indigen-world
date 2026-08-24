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

async function waitFor(check, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
}

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
  await assert.rejects(
    call(validatorApp, 'decideSubmission')({ submissionId: 'sub-e2e', decision: 'UNPUBLISH', feedback: '' }),
    (err) => err?.code === 'functions/failed-precondition',
  );
  assert.equal((await db.doc('submissions/sub-e2e').get()).get('status'), 'SUBMITTED');

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

  await call(validatorApp, 'decideSubmission')({ submissionId: 'sub-e2e', decision: 'UNPUBLISH', feedback: '' });
  assert.equal((await db.doc('publishedContent/pub_sub-e2e').get()).get('publicationStatus'), 'unpublished');
  assert.equal((await db.doc('submissions/sub-e2e').get()).get('status'), 'APPROVED');
});

test('collection submission rejects missing governance answers', async () => {
  await assert.rejects(
    call(creatorApp, 'submitCollectionContribution')({
      collectionKind: 'music',
      title: 'Incomplete disclosure',
      body: 'This must not enter review with guessed governance answers.',
      format: 'Song',
      dialect: 'Navrongo',
      source: 'E2E contributor',
      mediaUrl: '',
      notes: '',
      relatedEntryId: null,
      rightsConfirmed: true,
      publicationPermission: false,
    }),
    (err) => err?.code === 'functions/invalid-argument',
  );
});

test('mobile Literature contribution enters review and publishes its complete body', async () => {
  const body = 'A complete community folktale body that must not be discarded during publication.';
  const created = await call(creatorApp, 'submitCollectionContribution')({
    collectionKind: 'literature',
    title: 'The Baobab Promise',
    body,
    format: 'Folktale',
    dialect: 'Navrongo',
    source: 'E2E Community Storyteller',
    mediaUrl: '',
    notes: 'Review spelling before publication.',
    relatedEntryId: null,
    involvesMinors: false,
    usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
    rightsConfirmed: true,
    publicationPermission: true,
  });
  assert.equal(created.data.status, 'SUBMITTED');
  assert.equal(created.data.contributionId, created.data.submissionId);

  const submissionId = created.data.submissionId;
  const queued = await db.doc(`submissions/${submissionId}`).get();
  assert.equal(queued.get('campaign.id'), 'collection-contributions');
  assert.equal(queued.get('collectionKind'), 'literature');
  assert.equal(queued.get('body'), body);

  await assert.rejects(
    call(validatorApp, 'decideSubmission')({
      submissionId,
      decision: 'REQUEST_REVISION',
      feedback: 'Please revise this work.',
    }),
    (err) => err?.code === 'functions/failed-precondition',
  );

  await call(validatorApp, 'decideSubmission')({ submissionId, decision: 'APPROVE', feedback: '' });
  assert.equal((await db.doc(`collectionContributions/${submissionId}`).get()).get('status'), 'approved');

  await call(validatorApp, 'decideSubmission')({ submissionId, decision: 'PUBLISH', feedback: '' });
  const published = await db.doc(`publishedContent/pub_${submissionId}`).get();
  assert.equal(published.get('publicationStatus'), 'published');
  assert.equal(published.get('collectionKind'), 'literature');
  assert.equal(published.get('body'), body);
  assert.equal(published.get('description'), body);
  assert.equal((await db.doc(`collectionContributions/${submissionId}`).get()).get('status'), 'published');

  await assert.rejects(
    call(validatorApp, 'withdrawCollectionContribution')({ contributionId: submissionId }),
    (err) => err?.code === 'functions/permission-denied',
  );
  const withdrawn = await call(creatorApp, 'withdrawCollectionContribution')({ contributionId: submissionId });
  assert.equal(withdrawn.data.status, 'WITHDRAWN');
  assert.equal(withdrawn.data.unpublished, true);
  assert.equal(withdrawn.data.alreadyWithdrawn, false);
  assert.equal((await db.doc(`publishedContent/pub_${submissionId}`).get()).get('publicationStatus'), 'unpublished');
  assert.equal((await db.doc(`publishedContent/pub_${submissionId}`).get()).get('correctionState'), 'removed');
  assert.equal((await db.doc(`collectionContributions/${submissionId}`).get()).get('status'), 'withdrawn');
  assert.equal((await db.doc(`submissions/${submissionId}`).get()).get('status'), 'WITHDRAWN');
  assert.equal((await db.doc(`submissions/${submissionId}`).get()).get('permissions.publication'), false);

  const repeated = await call(creatorApp, 'withdrawCollectionContribution')({ contributionId: submissionId });
  assert.equal(repeated.data.alreadyWithdrawn, true);
  assert.equal(repeated.data.unpublished, false);
  await assert.rejects(
    call(validatorApp, 'decideSubmission')({ submissionId, decision: 'APPROVE', feedback: '' }),
    (err) => err?.code === 'functions/failed-precondition',
  );
  assert.equal((await db.doc(`submissions/${submissionId}`).get()).get('status'), 'WITHDRAWN');
});

test('published Audiobooks keep their submitted recording URL and media type', async () => {
  const mediaUrl = 'https://media.example.org/folktale.mp3';
  const created = await call(creatorApp, 'submitCollectionContribution')({
    collectionKind: 'audiobooks',
    title: 'Night Stories',
    body: 'A narrated collection of community stories.',
    format: 'Story reading',
    dialect: 'Paga',
    source: 'E2E Narrator',
    mediaUrl,
    notes: '',
    relatedEntryId: null,
    involvesMinors: false,
    usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
    rightsConfirmed: true,
    publicationPermission: true,
  });
  const submissionId = created.data.submissionId;
  await call(validatorApp, 'decideSubmission')({ submissionId, decision: 'APPROVE', feedback: '' });
  await call(validatorApp, 'decideSubmission')({ submissionId, decision: 'PUBLISH', feedback: '' });
  const published = await db.doc(`publishedContent/pub_${submissionId}`).get();
  assert.equal(published.get('collectionKind'), 'audiobooks');
  assert.equal(published.get('mediaType'), 'audio');
  assert.equal(published.get('mediaUrl'), mediaUrl);
});

test('published Dictionary contribution enters the existing dictionary collection', async () => {
  const created = await call(creatorApp, 'submitCollectionContribution')({
    collectionKind: 'dictionary',
    title: 'Water',
    body: 'na',
    format: 'Noun',
    dialect: 'Navrongo',
    source: 'E2E Kasem speaker',
    mediaUrl: '',
    notes: '',
    relatedEntryId: null,
    involvesMinors: false,
    usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
    kasemExample: 'M ba na de.',
    englishExample: 'I drink water.',
    rightsConfirmed: true,
    publicationPermission: true,
  });
  const submissionId = created.data.submissionId;
  await call(validatorApp, 'decideSubmission')({ submissionId, decision: 'APPROVE', feedback: '' });
  await call(validatorApp, 'decideSubmission')({ submissionId, decision: 'PUBLISH', feedback: '' });
  const dictionary = await db.doc(`dictionaryEntries/collection_${submissionId}`).get();
  assert.equal(dictionary.get('isPublished'), true);
  assert.equal(dictionary.get('kasemText'), 'na');
  assert.equal(dictionary.get('englishText'), 'Water');
  assert.equal(dictionary.get('kasemExample'), 'M ba na de.');
  assert.equal(dictionary.get('englishExample'), 'I drink water.');
  assert.equal(dictionary.get('sourceContribution.id'), submissionId);
  assert.equal((await db.doc(`publishedContent/pub_${submissionId}`).get()).exists, false);

  const withdrawn = await call(creatorApp, 'withdrawCollectionContribution')({ contributionId: submissionId });
  assert.equal(withdrawn.data.unpublished, true);
  assert.equal((await db.doc(`dictionaryEntries/collection_${submissionId}`).get()).get('isPublished'), false);
});

test('approved Collection work without publication permission can be archived', async () => {
  const created = await call(creatorApp, 'submitCollectionContribution')({
    collectionKind: 'music',
    title: 'Private praise song',
    body: 'Review is allowed but public release is not.',
    format: 'Song',
    dialect: 'Paga',
    source: 'E2E singer',
    mediaUrl: '',
    notes: '',
    relatedEntryId: null,
    involvesMinors: false,
    usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
    rightsConfirmed: true,
    publicationPermission: false,
  });
  const submissionId = created.data.submissionId;
  await call(validatorApp, 'decideSubmission')({ submissionId, decision: 'APPROVE', feedback: '' });
  const archived = await call(validatorApp, 'decideSubmission')({ submissionId, decision: 'ARCHIVE', feedback: '' });
  assert.equal(archived.data.newStatus, 'ARCHIVED');
  assert.equal((await db.doc(`submissions/${submissionId}`).get()).get('status'), 'ARCHIVED');
  assert.equal((await db.doc(`collectionContributions/${submissionId}`).get()).get('status'), 'archived');
  assert.equal((await db.doc(`publishedContent/pub_${submissionId}`).get()).get('publicationStatus'), 'unpublished');
});

test('review rejects a forged Collection link instead of trusting the submission pointer', async () => {
  await db.doc('collectionContributions/forged-link').set({
    id: 'forged-link',
    submissionId: 'forged-submission',
    authUid: 'attacker',
    collectionKind: 'literature',
    status: 'submitted',
  });
  await db.doc('submissions/forged-submission').set({
    id: 'forged-submission',
    authUid: 'victim',
    campaign: { collection: 'campaigns', id: 'collection-contributions' },
    creator: { collection: 'creatorProfiles', id: 'victim' },
    collectionContribution: { collection: 'collectionContributions', id: 'forged-link' },
    collectionKind: 'literature',
    category: 'literature',
    status: 'SUBMITTED',
    title: 'Forged link',
    disclosures: { involvesMinors: false, usesThirdPartyMaterial: false },
    permissions: { review: true, publication: true, promotion: false, aiTraining: false },
    lifecycle: life(),
  });
  await assert.rejects(
    call(validatorApp, 'decideSubmission')({
      submissionId: 'forged-submission',
      decision: 'APPROVE',
      feedback: '',
    }),
    (err) => err?.code === 'functions/failed-precondition',
  );
});

test('withdrawing an ordinary open post removes its public projection', async () => {
  const submissionId = 'open-withdraw-e2e';
  await db.doc(`submissions/${submissionId}`).set({
    id: submissionId,
    authUid: 'open-creator',
    campaign: null,
    creator: { collection: 'creatorProfiles', id: 'open-creator' },
    status: 'SUBMITTED',
    studioType: 'writing',
    title: 'An open community post',
    category: 'literature',
    body: 'This post starts public and is then withdrawn.',
    description: 'This post starts public and is then withdrawn.',
    primaryLanguage: 'xsm',
    dialect: 'Navrongo',
    disclosures: { involvesMinors: false, usesThirdPartyMaterial: false },
    permissions: { review: true, publication: true, promotion: false, aiTraining: false },
    lifecycle: life(),
  });
  await waitFor(
    async () => (await db.doc(`publishedContent/pub_${submissionId}`).get()).get('publicationStatus') === 'published',
    'open submission was not published by onSubmissionWritten',
  );

  await db.doc(`submissions/${submissionId}`).update({
    status: 'WITHDRAWN',
    'lifecycle.updatedAt': new Date().toISOString(),
  });
  await waitFor(
    async () => (await db.doc(`publishedContent/pub_${submissionId}`).get()).get('publicationStatus') === 'unpublished',
    'withdrawn open submission remained public',
  );
  assert.equal((await db.doc(`publishedContent/pub_${submissionId}`).get()).get('correctionState'), 'removed');
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
