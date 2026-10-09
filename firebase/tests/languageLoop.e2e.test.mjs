// End-to-end test of the language loop against the Auth, Firestore and
// Functions emulators:
//
//   npm run test:e2e      (from the repo root)
//
// A member asks for a missing word, answers a queued word, is sent back for
// changes and revises; a reviewer decides the answer becomes a translation
// pair and publishes it; the member withdraws it; training use is refused
// without consent and kept with it.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { initializeApp as adminInit, deleteApp as adminDelete } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp as clientInit } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = 'demo-indigen-world';

/** The seed's queue id, reproduced here so the test does not trust the code it tests. */
function wordQueueId(word) {
  const lower = word.toLowerCase();
  const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'word'}-${createHash('sha1').update(lower).digest('hex').slice(0, 6)}`;
}

let adminApp;
let db;
const apps = [];
const member = {};
const reviewer = {};

async function signedIn(name, uid, claims) {
  const app = clientInit({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` }, name);
  apps.push(app);
  connectAuthEmulator(clientAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  await signInWithCustomToken(clientAuth(app), await adminAuth(adminApp).createCustomToken(uid, claims));
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return (name) => httpsCallable(functions, name);
}

function queueRow(word, sentence) {
  return {
    id: wordQueueId(word), word, lookup: word, sentence,
    sentenceSource: 'tatoeba', tatoebaId: '99', tatoebaContributor: 'CK', licence: 'CC BY 2.0 FR',
    tier: 'core', rank: 40, status: 'open', approvedCount: 0, pendingCount: 0, skipCount: 0,
  };
}

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID }, 'language-loop-admin');
  db = adminFirestore(adminApp);
  await db.doc(`wordQueue/${wordQueueId('water')}`).set(queueRow('water', 'She drank a glass of water.'));
  await db.doc(`wordQueue/${wordQueueId('bread')}`).set(queueRow('bread', 'We bought bread at the market.'));
  member.call = await signedIn('member', 'loop-member', {});
  reviewer.call = await signedIn('reviewer', 'loop-reviewer', { role: 'validator' });
});

after(async () => {
  for (const app of apps) await deleteApp(app);
  await adminDelete(adminApp);
});

test('asking for a missing word creates one queue row, counts one member once, and gathers topics', async () => {
  const request = member.call('requestQueueWord');
  const first = (await request({ word: 'Granary', topic: 'farming', source: 'topic' })).data;
  assert.equal(first.wordId, wordQueueId('granary'));
  assert.equal(first.created, true);
  assert.equal(first.status, 'open');

  const again = (await request({ word: 'granary', topic: 'house', source: 'search' })).data;
  assert.equal(again.wordId, first.wordId);
  assert.equal(again.created, false);

  const row = (await db.doc(`wordQueue/${first.wordId}`).get()).data();
  assert.equal(row.requestCount, 1);
  assert.deepEqual([...row.topics].sort(), ['farming', 'house']);
  assert.equal(row.tier, 'requested');
  assert.equal(JSON.stringify(row).includes('loop-member'), false);
  const asked = (await db.doc(`wordRequests/loop-member_${first.wordId}`).get()).data();
  assert.equal(asked.uid, 'loop-member');

  await assert.rejects(request({ word: 'kɔ' }), (error) => error.code === 'functions/invalid-argument');
});

test('an answer sent back for changes is revised in place and returns to the review desk', async () => {
  const submit = member.call('submitWordTranslation');
  const decide = reviewer.call('decideSubmission');
  const wordId = wordQueueId('water');
  const sent = (await submit({
    wordId, translations: 'na', partOfSpeech: 'noun', dialect: 'Paga',
    origin: 'explore', credit: 'anonymous',
  })).data;
  assert.equal(sent.status, 'SUBMITTED');
  const first = (await db.doc(`collectionContributions/${sent.contributionId}`).get()).data();
  assert.equal(first.wordQueueOrigin, 'explore');
  assert.deepEqual(first.attribution, { preference: 'anonymous' });

  await decide({ submissionId: sent.submissionId, decision: 'REQUEST_REVISION', feedback: 'Please add an example sentence.' });
  assert.equal((await db.doc(`collectionContributions/${sent.contributionId}`).get()).get('status'), 'needs_revision');

  // Only the author, only for this word, only while it is waiting on them.
  await assert.rejects(
    submit({ wordId: wordQueueId('bread'), translations: 'x', partOfSpeech: 'noun', dialect: 'Paga', reviseContributionId: sent.contributionId }),
    (error) => error.code === 'functions/invalid-argument',
  );

  const revised = (await submit({
    wordId, translations: 'na', partOfSpeech: 'noun', dialect: 'Paga',
    kasemExample: 'na bam zura mo', origin: 'explore', reviseContributionId: sent.contributionId,
  })).data;
  assert.equal(revised.revised, true);
  assert.equal(revised.contributionId, sent.contributionId);
  const contribution = (await db.doc(`collectionContributions/${sent.contributionId}`).get()).data();
  assert.equal(contribution.status, 'submitted');
  assert.equal(contribution.body, 'na');
  assert.equal(contribution.revisionCount, 1);
  assert.equal(contribution.revisions[0].reviewerNote, 'Please add an example sentence.');
  assert.equal(contribution.revisions[0].previous.body, 'na');
  const submission = (await db.doc(`submissions/${sent.submissionId}`).get()).data();
  assert.equal(submission.status, 'SUBMITTED');
  assert.equal(submission.revisionCount, 1);

  await assert.rejects(
    submit({ wordId, translations: 'na', partOfSpeech: 'noun', dialect: 'Paga', reviseContributionId: sent.contributionId }),
    (error) => error.code === 'functions/failed-precondition',
  );

  // The reviewer decides it is a translation pair: kept on approval, public on publish.
  await decide({ submissionId: sent.submissionId, decision: 'APPROVE', publishAs: 'translation-pair' });
  const kept = (await db.doc(`languageResources/lr_${sent.submissionId}`).get()).data();
  assert.equal(kept.kind, 'translation-pair');
  assert.equal(kept.isPublished, false);
  assert.equal(kept.credit, 'Indigen World contributor');
  assert.equal(kept.englishSentence, 'She drank a glass of water.');
  assert.equal(kept.kasemSentence, 'na bam zura mo');
  assert.equal(kept.provenance.origin, 'explore');
  assert.equal((await db.doc(`dictionaryEntries/collection_${sent.submissionId}`).get()).exists, false);

  await decide({ submissionId: sent.submissionId, decision: 'PUBLISH' });
  assert.equal((await db.doc(`languageResources/lr_${sent.submissionId}`).get()).get('isPublished'), true);
  const published = (await db.doc(`collectionContributions/${sent.contributionId}`).get()).data();
  assert.equal(published.publishedAs, 'translation-pair');
  assert.deepEqual(published.publicationTarget, { collection: 'languageResources', id: `lr_${sent.submissionId}` });

  // Withdrawal reaches it.
  await member.call('withdrawCollectionContribution')({ contributionId: sent.contributionId });
  assert.equal((await db.doc(`languageResources/lr_${sent.submissionId}`).get()).get('isPublished'), false);
});

test('training material needs the contributor’s consent', async () => {
  const submit = member.call('submitWordTranslation');
  const decide = reviewer.call('decideSubmission');
  const refused = (await submit({ wordId: wordQueueId('bread'), translations: 'test-answer-bread', partOfSpeech: 'noun', dialect: 'Navrongo' })).data;
  await assert.rejects(
    decide({ submissionId: refused.submissionId, decision: 'APPROVE', publishAs: 'training' }),
    (error) => error.code === 'functions/failed-precondition' && /did not agree/.test(error.message),
  );
  // Rejected as a duplicate instead, which needs a real entry to point at.
  await assert.rejects(
    decide({ submissionId: refused.submissionId, decision: 'REJECT', feedback: 'Already in the dictionary.', reason: 'duplicate' }),
    (error) => error.code === 'functions/invalid-argument',
  );
  await decide({ submissionId: refused.submissionId, decision: 'REJECT', feedback: 'Please send it again with the word class.' });

  await db.doc('wordQueue/' + wordQueueId('millet')).set(queueRow('millet', 'Millet grows in the north.'));
  const consented = (await submit({
    wordId: wordQueueId('millet'), translations: 'test-answer-millet', partOfSpeech: 'noun', dialect: 'Navrongo', aiTraining: true,
  })).data;
  await decide({ submissionId: consented.submissionId, decision: 'APPROVE', publishAs: 'training' });
  const pair = (await db.doc(`contributorTrainingPairs/${consented.submissionId}`).get()).data();
  assert.equal(pair.kind, 'word-queue');
  assert.equal(pair.english, 'millet');
  await assert.rejects(
    decide({ submissionId: consented.submissionId, decision: 'PUBLISH' }),
    (error) => error.code === 'functions/failed-precondition',
  );
  // Withdrawing takes the pair back.
  await member.call('withdrawCollectionContribution')({ contributionId: consented.contributionId });
  assert.equal((await db.doc(`contributorTrainingPairs/${consented.submissionId}`).get()).exists, false);
});
