import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { checkKasemSpelling, getKasemWordSubmissionStatus, approvedSpellingSnapshot } from '../../services/functions/lib/kasem-spelling.js';
import { submitCollectionContribution } from '../../services/functions/lib/collection-contributions.js';
import { backfillSpellingKeys } from '../../services/functions/scripts/backfill-spelling-keys.mjs';
import { getKasemDictionaryAssistance } from '../../services/functions/lib/dictionary-assistance.js';
import { readFileSync } from 'node:fs';
import { saveExpressionAnswer } from '../../services/functions/lib/contributor-portal.js';

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

test('dictionary assistance reads actual-schema word and phrase records without changing review queues or points', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/translation-dictionary.json', import.meta.url)));
  for (const { id, ...data } of fixture.entries) await db.doc(`dictionaryEntries/${id}`).set(data);
  await db.doc('dictionaryEntries/unpublished-tone').set({ isPublished: false, kasemText: 'véi', englishText: 'PRIVATE meaning' });
  await db.doc('dictionaryEntries/restricted-tone').set({ isPublished: true, kasemText: 'véi', englishText: 'PRIVATE meaning', culturalPermissionTier: 'restricted' });
  await approvedSpellingSnapshot(true);
  const before = { submissions: (await db.collection('submissions').get()).size, events: (await db.collection('contributionEvents').get()).size };
  await assert.rejects(getKasemDictionaryAssistance.run({ data: { terms: ['vei'] } }), error => error.code === 'unauthenticated');
  await assert.rejects(getKasemDictionaryAssistance.run(request('speaker', { terms: Array(81).fill('vei') })), error => error.code === 'invalid-argument');
  const result = await getKasemDictionaryAssistance.run(request('speaker', { source: 'The boy is going home.', terms: ['vei', 'deem', 'ampʋlɩ bu'] }));
  assert.deepEqual(result.results.map(row => row.status), ['review', 'review', 'approved']);
  assert.ok(result.recommendations.some(row => row.word === 'Bakeira'));
  assert.ok(result.recommendations.some(row => row.word === 'sɔŋɔ'));
  assert.ok(result.results[0].suggestions.every(row => !row.meaning.includes('PRIVATE')));
  assert.equal((await db.collection('submissions').get()).size, before.submissions);
  assert.equal((await db.collection('contributionEvents').get()).size, before.events);
});

test('assisted translation submits exact Unicode once through the normal review pipeline without points', async () => {
  const uid = 'dictionary-assisted-contributor';
  await db.doc(`contributorAccounts/${uid}`).set({ status: 'active', requiresPasswordChange: false, trainingAgreement: { version: 'contributor-training-v2' } });
  await db.doc(`contributors/${uid}`).set({ permissions: { edit: true, submit: true } });
  const path = `contributorAccounts/${uid}/works/words/items/task`;
  await db.doc(path).set({ expression: 'The boy is going home.', translation: '', alternatives: [], revision: 0, status: 'draft' });
  const translation = '  vei, ve\u0300i! Newwordfixture\n';
  const input = { work: 'words', item: 'task', revision: 0, translation, alternatives: [], publicationPermission: true, submit: true };
  const before = (await db.collection('submissions').get()).size;
  const result = await saveExpressionAnswer.run(request(uid, input));
  assert.equal((await db.doc(path).get()).get('translation'), translation);
  const record = await db.doc(`submissions/${result.submissionId}`).get();
  assert.equal(record.get('status'), 'SUBMITTED'); assert.equal(record.get('expression.phrase'), translation);
  assert.equal(record.get('body'), translation);
  assert.equal((await saveExpressionAnswer.run(request(uid, input))).submissionId, result.submissionId);
  assert.equal((await db.collection('submissions').get()).size, before + 1);
  assert.equal((await db.collection('contributionEvents').get()).size, 0);
  await db.doc(`contributorAccounts/${uid}/works/words/items/blank`).set({ expression: 'Blank test', translation: '', alternatives: [], revision: 0, status: 'draft' });
  await assert.rejects(saveExpressionAnswer.run(request(uid, { ...input, item: 'blank', translation: '  \n ' })), error => error.code === 'failed-precondition');
});
