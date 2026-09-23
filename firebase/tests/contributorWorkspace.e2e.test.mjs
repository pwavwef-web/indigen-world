// End-to-end tests of the contributor workspace backend against the Auth,
// Firestore, Storage and Functions emulators:
//
//   npm run test:contributor-e2e   (from the repo root)
//
// The callables run exactly as deployed. Two things differ in the emulator on
// a demo- project, and the tests assert the honest behaviour for both: no
// Arkesel key is bound, so MoMo codes refuse with "SMS is not configured";
// and Kawuri's Vertex calls are answered by the local stand-in in
// kawuri-vertex.ts. The automated statement check is off (no
// CONTRIBUTOR_STATEMENT_CHECK), as it is by default in production.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { deleteApp as adminDelete, initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp as clientInit } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'demo-indigen-world';
const BUCKET = `${PROJECT_ID}.appspot.com`;
const today = new Date().toISOString().slice(0, 10);

let adminApp;
let db;
const apps = [];
const clients = {};

async function clientFor(uid, claims) {
  const app = clientInit({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com`, storageBucket: BUCKET }, `cw-${uid}`);
  apps.push(app);
  connectAuthEmulator(clientAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  const token = await adminAuth(adminApp).createCustomToken(uid, claims ?? {});
  await signInWithCustomToken(clientAuth(app), token);
  connectFunctionsEmulator(getFunctions(app), '127.0.0.1', 5001);
  connectStorageEmulator(getStorage(app), '127.0.0.1', 9199);
  connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080);
  return app;
}

const call = async (app, name, data = {}) => (await httpsCallable(getFunctions(app), name, { timeout: 120_000 })(data)).data;
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => {
  assert.equal(error?.code, `functions/${code}`, `${error?.code}: ${error?.message}`);
  return true;
});
const until = async (check, label, timeoutMs = 20_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n1 0 obj\n'), Buffer.alloc(4096, 32)]);

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = adminFirestore(adminApp);
  const now = new Date().toISOString();
  await db.doc('contributorAccounts/cw-alice').set({ status: 'active', requiresPasswordChange: false, defaultWork: 'w1', phoneNumber: '+233241234567' });
  await db.doc('contributors/cw-alice').set({
    id: 'cw-alice', authUid: 'cw-alice', status: 'active', publicVisibility: 'hidden', roles: ['translator'],
    public: { displayName: 'Alice Contributor' },
    private: { email: 'alice@example.com', phone: '+233241234567', notes: 'INTERNAL editorial note' },
    permissions: { edit: true, submit: true, review: false, publish: false },
  });
  await db.doc('contributorAccounts/cw-alice/works/w1').set({ id: 'w1', title: 'Everyday', instructions: 'Translate naturally.', createdAt: now, kind: 'expressions', language: 'xsm' });
  await db.doc('contributorAccounts/cw-alice/works/w1/items/i1').set({ id: 'i1', expression: 'How is your family?', translation: '', alternatives: [], revision: 0, status: 'draft', updatedAt: now });
  await db.doc('contributorAccounts/cw-alice/works/w1/items/i2').set({ id: 'i2', expression: 'Please come and sit with us.', translation: '', alternatives: [], revision: 0, status: 'draft', updatedAt: now });
  clients.alice = await clientFor('cw-alice', { role: 'contributor' });
  clients.bob = await clientFor('cw-bob');
  clients.finance = await clientFor('cw-finance', { role: 'admin', finance: true });
  clients.admin = await clientFor('cw-admin', { role: 'admin' });
  clients.validator = await clientFor('cw-validator', { role: 'validator' });
});

after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  if (adminApp) await adminDelete(adminApp);
});

test('payment details: invited contributors only, statement required, masked on the way back', async () => {
  await rejectsWith(call(clients.bob, 'getContributorPayments'), 'permission-denied');
  const empty = await call(clients.alice, 'getContributorPayments');
  assert.equal(empty.bank, null);
  assert.equal(empty.statementCheck, 'off');
  assert.equal(empty.profile, null, 'the legacy key the 2026-09-23 build reads is present');

  await rejectsWith(call(clients.alice, 'submitBankVerification', { bankName: 'Ecobank Ghana', accountName: 'Alice Contributor', accountNumber: '1441000123456' }), 'invalid-argument');
  await uploadBytes(ref(getStorage(clients.alice), 'contributor-payout-statements/cw-alice/upload-e2e-0001/statement.pdf'), PDF, { contentType: 'application/pdf' });
  const view = await call(clients.alice, 'submitBankVerification', {
    bankName: 'Ecobank Ghana', accountName: 'Alice Contributor', accountNumber: '1441 0001 23456', branch: 'Navrongo',
    statement: { uploadId: 'upload-e2e-0001', fileName: 'statement.pdf' },
  });
  assert.equal(view.bank.status, 'pending');
  assert.equal(view.bank.accountNumberMasked, '•••• 3456');
  assert.equal(JSON.stringify(view).includes('1441000123456'), false);
  assert.equal(view.bank.automatedCheck.state, 'off');
  const stored = (await db.doc('contributorPayoutProfiles/cw-alice').get()).data();
  assert.equal(stored.bank.accountNumber, '1441000123456');
  assert.equal(stored.bank.statement.contentType, 'application/pdf');
  await rejectsWith(call(clients.alice, 'saveContributorPayoutProfile', { bankName: 'x' }), 'failed-precondition');
});

test('finance decisions: separation of duties, audit, notification and re-verification on change', async () => {
  await rejectsWith(call(clients.admin, 'listContributorPayments'), 'permission-denied');
  const listed = await call(clients.finance, 'listContributorPayments');
  const profile = listed.profiles.find((entry) => entry.contributorId === 'cw-alice');
  assert.equal(profile.bank.accountNumber, '1441000123456', 'finance reviewers see the full number');
  await rejectsWith(call(clients.admin, 'decidePayoutVerification', { contributorId: 'cw-alice', method: 'bank', decision: 'verify', version: profile.bank.version }), 'permission-denied');
  await rejectsWith(call(clients.finance, 'decidePayoutVerification', { contributorId: 'cw-alice', method: 'bank', decision: 'verify', version: profile.bank.version + 1 }), 'aborted');
  await rejectsWith(call(clients.finance, 'decidePayoutVerification', { contributorId: 'cw-alice', method: 'bank', decision: 'reject', reason: 'no', version: profile.bank.version }), 'invalid-argument');
  const decided = await call(clients.finance, 'decidePayoutVerification', { contributorId: 'cw-alice', method: 'bank', decision: 'verify', reason: 'Statement matches.', version: profile.bank.version });
  assert.equal(decided.status, 'verified');
  const view = await call(clients.alice, 'getContributorPayments');
  assert.equal(view.bank.status, 'verified');
  assert.equal(view.payoutReady, true);
  const notices = await db.collection('notifications').where('authUid', '==', 'cw-alice').get();
  const notice = notices.docs.map((entry) => entry.data()).find((entry) => entry.type === 'payout_verification');
  assert.equal(notice.link, '/contributor/account/payments');
  assert.equal(JSON.stringify(notice).includes('1441000123456'), false);
  const audits = await db.collection('auditLogs').where('action', '==', 'contributor.payout.bank.verify').get();
  assert.ok(audits.docs.some((entry) => entry.get('actor.id') === 'cw-finance'));

  // A change to verified details starts verification again.
  await uploadBytes(ref(getStorage(clients.alice), 'contributor-payout-statements/cw-alice/upload-e2e-0002/statement.pdf'), PDF, { contentType: 'application/pdf' });
  const changed = await call(clients.alice, 'submitBankVerification', {
    bankName: 'Ecobank Ghana', accountName: 'Alice Contributor', accountNumber: '1441000999999', branch: 'Navrongo',
    statement: { uploadId: 'upload-e2e-0002', fileName: 'statement.pdf' },
  });
  assert.equal(changed.bank.status, 'pending');
  assert.equal(changed.payoutReady, false);
  assert.equal(changed.history[0].action, 'bank.resubmitted_after_verification');
});

test('the statement link is finance-only; signing needs the IAM grant the emulator does not have', async () => {
  await rejectsWith(call(clients.alice, 'getPayoutStatementLink', { contributorId: 'cw-alice' }), 'permission-denied');
  try {
    const link = await call(clients.finance, 'getPayoutStatementLink', { contributorId: 'cw-alice' });
    assert.match(link.url, /^https?:\/\//);
  } catch (error) {
    assert.equal(error.code, 'functions/failed-precondition');
    assert.match(error.message, /serviceAccountTokenCreator/);
  }
});

test('MoMo codes refuse honestly when SMS is not configured', async () => {
  await rejectsWith(call(clients.alice, 'startMomoVerification', { network: 'mtn', walletNumber: '0241234567', registeredName: 'Alice Contributor' }), 'failed-precondition');
  await rejectsWith(call(clients.alice, 'confirmMomoVerification', { code: '123456' }), 'not-found');
  await rejectsWith(call(clients.bob, 'startMomoVerification', { network: 'mtn', walletNumber: '0241234567', registeredName: 'Bob' }), 'permission-denied');
});

test('profile and settings: internal notes never reach the contributor; choices are validated', async () => {
  const self = await call(clients.alice, 'getContributorSelf');
  assert.equal(self.profile.displayName, 'Alice Contributor');
  assert.equal(JSON.stringify(self).includes('INTERNAL editorial note'), false);
  assert.equal(self.contact.phoneMasked, '•••• 4567');
  await assert.rejects(getDoc(doc(getFirestore(clients.alice), 'contributors/cw-alice')), 'the profile document itself is staff-only now');
  const updated = await call(clients.alice, 'updateContributorSelf', { displayName: 'Alice K.', location: 'Paga', biography: '', dialect: 'Paga', otherLanguages: 'English', photoUrl: '' });
  assert.equal(updated.profile.displayName, 'Alice K.');
  assert.equal((await db.doc('contributors/cw-alice').get()).get('private.notes'), 'INTERNAL editorial note', 'admin notes survive a self-update');
  await rejectsWith(call(clients.alice, 'updateContributorSelf', { displayName: 'Alice', photoUrl: 'https://example.com/me.jpg' }), 'invalid-argument');
  const settings = await call(clients.alice, 'saveContributorSettings', { activityVisibility: 'name', notifications: { reviewEmail: false, paymentEmail: true, paymentSms: false } });
  assert.equal(settings.activityVisibility, 'name');
  assert.equal((await getDoc(doc(getFirestore(clients.alice), 'contributorSettings/cw-alice'))).get('activityVisibility'), 'name');
  await rejectsWith(call(clients.alice, 'saveContributorSettings', { activityVisibility: 'public', notifications: {} }), 'invalid-argument');
});

test('a submission reaches the live pulse under the chosen name, and a decision links back to the expression', async () => {
  const saved = await call(clients.alice, 'saveExpressionAnswer', { work: 'w1', item: 'i1', revision: 0, translation: '[e2e Kasem]', alternatives: [], context: 'Said to an elder.' });
  const submitted = await call(clients.alice, 'saveExpressionAnswer', { work: 'w1', item: 'i1', revision: saved.revision, translation: '[e2e Kasem]', alternatives: [], context: 'Said to an elder.', submit: true, publicationPermission: true });
  assert.ok(submitted.submissionId);
  assert.equal((await db.doc(`submissions/${submitted.submissionId}`).get()).get('usageContext'), 'Said to an elder.');
  const totals = await until(async () => {
    const snapshot = await db.doc(`contributorPulseTotals/${today}`).get();
    return snapshot.exists && (snapshot.get('submitted') ?? []).length ? snapshot : null;
  }, 'the pulse totals');
  assert.equal(totals.get('submitted').length, 1);
  const entries = await db.collection('contributorPulse').where('day', '==', today).get();
  assert.equal(entries.docs.length, 1);
  assert.equal(entries.docs[0].get('label'), 'Alice K.');
  assert.equal(JSON.stringify(entries.docs[0].data()).includes('cw-alice'), false, 'a pulse row carries no account id');
  const pulse = await getDoc(doc(getFirestore(clients.alice), `contributorPulseTotals/${today}`));
  assert.equal(pulse.exists(), true, 'active contributors can read the pulse');
  await assert.rejects(getDoc(doc(getFirestore(clients.bob), `contributorPulseTotals/${today}`)));

  await call(clients.validator, 'decideSubmission', { submissionId: submitted.submissionId, decision: 'REJECT', feedback: 'Use the everyday greeting, please.' });
  const notice = await until(async () => {
    const found = await db.collection('notifications').where('authUid', '==', 'cw-alice').get();
    return found.docs.map((entry) => entry.data()).find((entry) => entry.type === 'review_decision') ?? null;
  }, 'the decision notification');
  assert.equal(notice.link, '/contributor/cw-alice/w1?item=i1');
  assert.deepEqual(notice.channels, ['in_app'], 'the contributor switched review emails off');
});

test('Kawuri assist: contributors only, sources and checks labelled, nothing written', async () => {
  await rejectsWith(call(clients.bob, 'kawuriContributorAssist', { mode: 'explain_assignment', work: 'w1' }), 'permission-denied');
  await rejectsWith(call(clients.alice, 'kawuriContributorAssist', { mode: 'check_draft', work: 'w1' }), 'invalid-argument');
  await rejectsWith(call(clients.alice, 'kawuriContributorAssist', { mode: 'explain_assignment', work: 'someone-elses' }), 'not-found');
  const before = (await db.doc('contributorAccounts/cw-alice/works/w1/items/i2').get()).data();
  const result = await call(clients.alice, 'kawuriContributorAssist', { mode: 'check_draft', work: 'w1', item: 'i2', draft: { translation: '', alternatives: [], context: '' } });
  assert.equal(result.configured, true);
  assert.deepEqual(result.checks.map((check) => check.id), ['missing-translation', 'no-context']);
  assert.equal(result.sources.assignment.instructions, 'Translate naturally.');
  assert.ok(result.suggestions.length > 0);
  assert.deepEqual((await db.doc('contributorAccounts/cw-alice/works/w1/items/i2').get()).data(), before, 'the draft is untouched');
});
