// End-to-end test of the trusted validation path against the Auth, Firestore and
// Functions emulators:
//
//   npm run test:e2e      (from the repo root)
//
// A validator (custom claim role=validator) calls the decideReview callable; we
// assert the target content is validated and that a review and an audit entry are
// written — the privileged transition the Security Rules deny to clients.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { cert, initializeApp as adminInit, deleteApp as adminDelete } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp as clientInit } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = 'demo-indigen-world';
void cert; // (imported for parity; emulator needs no credentials)

let adminApp;
let clientApp;
let callDecideReview;

function seedEntry() {
  return {
    id: 'e2e-entry',
    headword: 'nia',
    partOfSpeech: 'noun',
    senses: [{ definition: 'water', translations: [{ languageCode: 'en', text: 'water' }] }],
    governance: {
      source: 'e2e fixture',
      contributor: { collection: 'contributors', id: 'contrib-e2e' },
      language: { collection: 'languages', id: 'kasem' },
      dialect: null,
      validationStatus: 'submitted',
      validator: null,
      consentStatus: 'granted',
      consent: { collection: 'consentRecords', id: 'consent-contrib-e2e' },
      licence: 'community_restricted',
      culturalPermissionTier: 'public',
    },
    lifecycle: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1 },
  };
}

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID });
  const db = adminFirestore(adminApp);
  await db.doc('lexicalEntries/e2e-entry').set(seedEntry());
  await db.doc('consentRecords/consent-contrib-e2e').set({
    id: 'consent-contrib-e2e',
    subject: { collection: 'contributors', id: 'contrib-e2e' },
    grantedBy: { collection: 'contributors', id: 'contrib-e2e' },
    status: 'granted',
    scope: ['publication'],
    method: 'digital_attestation',
    effectiveFrom: '2026-08-01',
    expiresAt: null,
    lifecycle: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1 },
  });
  await db.doc('validators/validator-e2e').set({
    id: 'validator-e2e',
    contributor: null,
    displayName: 'E2E validator',
    credentials: [{ type: 'linguist' }],
    languages: [{ collection: 'languages', id: 'kasem' }],
    authorityScope: ['lexical'],
    status: 'active',
    lifecycle: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1 },
  });

  clientApp = clientInit({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` });
  connectAuthEmulator(clientAuth(clientApp), 'http://127.0.0.1:9099', { disableWarnings: true });

  // A validator signs in with a role claim.
  const token = await adminAuth(adminApp).createCustomToken('validator-e2e', { role: 'validator' });
  await signInWithCustomToken(clientAuth(clientApp), token);
  const functions = getFunctions(clientApp);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  callDecideReview = httpsCallable(functions, 'decideReview');
});

after(async () => {
  if (clientApp) await deleteApp(clientApp);
  if (adminApp) await adminDelete(adminApp);
});

test('a validator can approve a submitted entry via decideReview', async () => {
  const res = await callDecideReview({
    targetCollection: 'lexicalEntries',
    targetId: 'e2e-entry',
    decision: 'approved',
    notes: 'Confirmed by the assigned language validator.',
  });

  assert.equal(res.data.newStatus, 'validated');
  assert.equal(res.data.previousStatus, 'submitted');

  const db = adminFirestore(adminApp);

  const entry = await db.doc('lexicalEntries/e2e-entry').get();
  assert.equal(entry.get('governance.validationStatus'), 'validated');
  assert.equal(entry.get('governance.validator.id'), 'validator-e2e');

  const reviews = await db.collection('reviews').where('target.id', '==', 'e2e-entry').get();
  assert.ok(reviews.size >= 1, 'a review record should be written');

  const audits = await db.collection('auditLogs').where('target.id', '==', 'e2e-entry').get();
  assert.ok(audits.size >= 1, 'an audit entry should be written');
});

async function expectDecisionDenied(entry, expectedCode = 'functions/failed-precondition') {
  const db = adminFirestore(adminApp);
  await db.doc('lexicalEntries/e2e-entry').set(entry);
  await assert.rejects(
    callDecideReview({
      targetCollection: 'lexicalEntries',
      targetId: 'e2e-entry',
      decision: 'approved',
      notes: 'This reason is long enough for an audited decision.',
    }),
    (error) => error?.code === expectedCode,
  );
}

test('validation rejects unsafe status, licence, scope, ownership, consent, and schema states', async () => {
  await expectDecisionDenied({ ...seedEntry(), governance: { ...seedEntry().governance, validationStatus: 'draft' } });
  await expectDecisionDenied({ ...seedEntry(), governance: { ...seedEntry().governance, licence: 'undetermined' } });
  await expectDecisionDenied(
    { ...seedEntry(), governance: { ...seedEntry().governance, language: { collection: 'languages', id: 'outside-scope' } } },
    'functions/permission-denied',
  );
  await expectDecisionDenied(
    { ...seedEntry(), governance: { ...seedEntry().governance, contributor: { collection: 'contributors', id: 'validator-e2e' } } },
    'functions/permission-denied',
  );

  const db = adminFirestore(adminApp);
  await db.doc('consentRecords/consent-contrib-e2e').update({ status: 'withdrawn' });
  await expectDecisionDenied(seedEntry());
  await db.doc('consentRecords/consent-contrib-e2e').update({ status: 'granted' });

  const { headword: _headword, ...invalidEntry } = seedEntry();
  await expectDecisionDenied(invalidEntry);
});
