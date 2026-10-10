import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { checkKasemSpelling, getKasemWordSubmissionStatus, approvedSpellingSnapshot } from '../../services/functions/lib/kasem-spelling.js';
import { submitCollectionContribution } from '../../services/functions/lib/collection-contributions.js';
import { backfillSpellingKeys } from '../../services/functions/scripts/backfill-spelling-keys.mjs';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Use the Firestore emulator only');
const projectId = 'demo-indigen-spelling-tests';
let app, db;
const request = (uid, data) => ({ auth: { uid, token: {} }, data });
before(async () => {
  app = initializeApp({ projectId }); db = getFirestore();
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  await db.doc('dictionaryEntries/approved').set({ isPublished: true, lexicalKind: 'word', kasemText: 'Ɛ́ŋɔ', translations: ['Ni'] });
  await db.doc('dictionaryEntries/unreviewed').set({ isPublished: false, kasemText: 'Nii' });
});
after(async () => { await deleteApp(app); });

test('authenticated, bounded lookup only returns approved suggestions and status', async () => {
  await assert.rejects(checkKasemSpelling.run({ data: { words: ['Ni'] } }), error => error.code === 'unauthenticated');
  await assert.rejects(checkKasemSpelling.run(request('speaker', { words: Array(81).fill('Ni') })), error => error.code === 'invalid-argument');
  const result = await checkKasemSpelling.run(request('speaker', { words: ['ɛ\u0301ŋɔ', 'NI', 'Nii'] }));
  assert.deepEqual(result.results.map(row => row.status), ['approved', 'approved', 'missing']);
  assert.deepEqual(result.results[2].suggestions, [{ id: 'approved', word: 'Ni' }]);
});

test('compact submissions preserve the canonical review workflow and cannot publish or award points', async () => {
  const input = { requestId: 'spelling-test-request-one', spellingAssistance: true, collectionKind: 'dictionary', lexicalKind: 'word',
    title: 'TEST ONLY meaning', body: 'Nii', format: 'noun', dialect: 'Navrongo', source: 'TEST ONLY source',
    rightsConfirmed: true, publicationPermission: true, usesThirdPartyMaterial: false, participantConsentConfirmed: true };
  await assert.rejects(submitCollectionContribution.run(request('speaker', { ...input, participantConsentConfirmed: false })), error => error.code === 'failed-precondition');
  await assert.rejects(submitCollectionContribution.run(request('speaker', { ...input, body: 'Ni' })), error => error.code === 'already-exists');
  const concurrent = await Promise.allSettled([
    submitCollectionContribution.run(request('speaker', input)),
    submitCollectionContribution.run(request('speaker', { ...input, requestId: 'spelling-test-request-two' })),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(result => result.status === 'rejected' && result.reason.code === 'already-exists').length, 1);
  const receipt = concurrent.find(result => result.status === 'fulfilled').value;
  const canonical = (await db.doc(`submissions/${receipt.submissionId}`).get()).data();
  assert.equal(canonical.status, 'SUBMITTED'); assert.equal(canonical.collectionKind, 'dictionary');
  assert.equal(canonical.lexicalKind, 'word'); assert.equal(canonical.permissions.review, true);
  assert.equal((await db.doc(`collectionContributions/${receipt.contributionId}`).get()).get('spellingKey'), 'nii');
  assert.equal((await db.collection('dictionaryEntries').where('isPublished', '==', true).get()).size, 1);
  assert.equal((await db.collection('contributionEvents').get()).size, 0);
  assert.equal((await getKasemWordSubmissionStatus.run(request('speaker', { word: 'NII' }))).status, 'pending');
  assert.equal((await getKasemWordSubmissionStatus.run(request('other-speaker', { word: 'Nii' }))).status, 'pending');
  // A network retry of the actual successful request is idempotent.
  const winner = concurrent[0].status === 'fulfilled' ? input : { ...input, requestId: 'spelling-test-request-two' };
  assert.equal((await submitCollectionContribution.run(request('speaker', winner))).contributionId, receipt.contributionId);
});

test('legacy pending submissions and newly approved words are detected without exposing private records', async () => {
  await db.doc('collectionContributions/legacy').set({ authUid: 'speaker', collectionKind: 'dictionary', body: 'Legacy\u0301', status: 'under_review' });
  assert.deepEqual(await getKasemWordSubmissionStatus.run(request('speaker', { word: 'LEGACÝ' })), { status: 'pending' });
  assert.ok((await backfillSpellingKeys(db)).changed > 0);
  assert.equal((await db.doc('collectionContributions/legacy').get()).get('spellingKey'), undefined);
  await backfillSpellingKeys(db, true);
  assert.equal((await backfillSpellingKeys(db, true)).changed, 0);
  assert.deepEqual(await getKasemWordSubmissionStatus.run(request('other-speaker', { word: 'LEGACÝ' })), { status: 'pending' });
  await db.doc('dictionaryEntries/new').set({ isPublished: true, kasemText: 'Nii' });
  await approvedSpellingSnapshot(true);
  assert.deepEqual(await getKasemWordSubmissionStatus.run(request('speaker', { word: 'Nii' })), { status: 'approved' });
});
