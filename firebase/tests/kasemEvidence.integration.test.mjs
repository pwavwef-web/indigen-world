import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { submitGrammarNote, decideGrammarNote, reviseGrammarNote, withdrawGrammarNote, readGrammarAudio } from '../../services/functions/lib/grammar-contributions.js';
import { corpusContextFor } from '../../services/functions/lib/kawuri-corpus.js';
import { buildDataset, DEFAULT_CONFIG } from '../../services/functions/lib/kasem-dataset.js';
import { submitGrammarClaim, decideGrammarClaim } from '../../services/functions/lib/kasem-claims.js';
import { grammarContextFor } from '../../services/functions/lib/kawuri-grammar.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const projectId = 'demo-indigen-world';
let app, db, env;
const request = (uid, data, role = 'validator') => ({ auth: { uid, token: { role } }, data });
const payload = {
  schemaVersion: 2, requestId: 'synthetic-e2e', mode: 'comparison', title: 'Synthetic evidence integration',
  permissions: { review: true, sourceConfirmed: true, publication: true, providerRetrieval: true, modelTraining: true, evaluation: true },
  context: { situation: 'Synthetic test context.' },
  examples: [
    { kasem: 'synthetic fluent', english: 'The dog followed the cat.', dialect: 'synthetic' },
    { kasem: 'synthetic awkward', english: 'The dog followed the cat.', dialect: 'synthetic' },
  ],
};
const good = { meaning: 'faithful', grammar: 'acceptable', naturalness: 'natural', contextFit: 'fits', explanation: '', annotationApproved: false };
const judgments = [good, { ...good, naturalness: 'awkward', explanation: 'Understandable but not natural in this context.' }];
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run this test inside the Firestore emulator.');
  app = initializeApp({ projectId, storageBucket: projectId + '.appspot.com' }); db = getFirestore(app);
  env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8') } });
  await env.clearFirestore();
});
after(async () => { await env?.cleanup(); if (app) await deleteApp(app); });

test('submission, simultaneous independent reviews, public projection, retrieval and export', async () => {
  const first = await submitGrammarNote.run(request('author', payload, 'contributor'));
  const again = await submitGrammarNote.run(request('author', payload, 'contributor'));
  assert.equal(first.id, again.id);
  await assert.rejects(() => decideGrammarNote.run(request('author', { noteId: first.id, revision: 1, dialectCompetent: true, judgments })), /contributor/);
  const review = { noteId: first.id, revision: 1, dialectCompetent: true, judgments, preference: 'first' };
  await Promise.all([decideGrammarNote.run(request('reviewer1', review)), decideGrammarNote.run(request('reviewer2', review))]);
  await decideGrammarNote.run(request('reviewer1', review));
  const note = (await db.doc('kasemEvidence/' + first.id).get()).data();
  assert.equal(note.reviews.length, 2); assert.equal(note.status, 'reviewed');
  const rows = await db.collection('kasemSentences').get(); assert.equal(rows.size, 1);
  assert.equal(rows.docs[0].data().contributorUid, undefined);
  const brief = await corpusContextFor('How do you say "The dog followed the cat." in Kasem?', 'Synthetic test context.');
  assert.match(brief, /synthetic fluent/); assert.doesNotMatch(brief, /synthetic awkward/);
  const release = buildDataset([note], { ...DEFAULT_CONFIG, releaseId: 'synthetic', asOf: new Date().toISOString(), trainPercent: 100, validationPercent: 0 });
  assert.match(release.files['train-preference.jsonl'], /synthetic awkward/);
  assert.doesNotMatch(release.files['train-translation.jsonl'], /synthetic awkward/);
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, 'kasemSentences/' + first.id + '-0')));
  await assertFails(getDoc(doc(anon, 'kasemEvidence/' + first.id)));
  const reviewer = env.authenticatedContext('reviewer3', { role: 'validator' }).firestore();
  await assertFails(getDoc(doc(reviewer, 'kasemEvidence/' + first.id)));
  await assertSucceeds(getDoc(doc(reviewer, 'grammarNotes/' + first.id)));
  await assertFails(setDoc(doc(reviewer, 'kasemSentences/fabricated'), { status: 'confirmed' }));
  // Same text, a different dialect, is independent evidence rather than a merge.
  const different = await submitGrammarNote.run(request('author2', { ...payload, requestId: 'different', examples: payload.examples.map(e => ({ ...e, dialect: 'synthetic-other' })) }, 'contributor'));
  assert.notEqual(first.id, different.id);
  assert.equal((await db.doc('kasemEvidence/' + first.id).get()).get('examples')[0].dialect, 'synthetic');
});

test('editing invalidates old review, held-out reservations block retrieval, withdrawal blocks export', async () => {
  const created = await submitGrammarNote.run(request('revision-author', { ...payload, requestId: 'revision', mode: 'sentence', examples: [payload.examples[0]] }, 'contributor'));
  const review = { noteId: created.id, revision: 1, dialectCompetent: true, judgments: [good] };
  await decideGrammarNote.run(request('r3', review)); await decideGrammarNote.run(request('r4', review));
  await db.doc('kasemEvidence/' + created.id).update({ reservedSplit: 'test' });
  // Withdraw the first test's matching sentence so only the held-out one remains.
  const originals = await db.collection('kasemEvidence').where('authorUid', '==', 'author').get();
  for (const doc of originals.docs) await withdrawGrammarNote.run(request('author', { noteId: doc.id }, 'contributor'));
  const brief = await corpusContextFor('How do you say "The dog followed the cat." in Kasem?', 'Synthetic test context.');
  assert.doesNotMatch(brief, /Kasem: synthetic fluent/);
  await reviseGrammarNote.run(request('revision-author', { ...payload, noteId: created.id, revision: 1, mode: 'sentence', examples: [payload.examples[0]] }, 'contributor'));
  assert.equal((await db.doc('kasemSentences/' + created.id + '-0').get()).exists, false);
  await assert.rejects(() => decideGrammarNote.run(request('r5', review)), /changed/);
  await withdrawGrammarNote.run(request('revision-author', { noteId: created.id }, 'contributor'));
  const n = (await db.doc('kasemEvidence/' + created.id).get()).data();
  assert.equal(n.permissions.status, 'withdrawn'); assert.equal(n.reservedSplit, 'test');
  assert.equal((await db.doc('kasemEvidence/' + created.id + '/revisions/1').get()).get('revision'), 1);
  const release = buildDataset([n], { ...DEFAULT_CONFIG, releaseId: 'withdrawn', asOf: new Date().toISOString() });
  assert.equal(release.files['test-translation.jsonl'], '');
});

test('legacy public documents are withheld and source permission is not inferred', async () => {
  await db.doc('kasemSentences/legacy').set({ status: 'confirmed', contributorUid: 'private-author' });
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'kasemSentences/legacy')));
  const result = await submitGrammarNote.run(request('legacy-author', { examples: [payload.examples[0]] }, 'contributor'));
  const n = (await db.doc('kasemEvidence/' + result.id).get()).data();
  assert.equal(n.permissions.modelTraining, false); assert.equal(n.status, 'needs-permission');
});

test('grammar hypotheses need independent support and lose retrieval when evidence is withdrawn', async () => {
  const created = await submitGrammarNote.run(request('claim-source', { ...payload, requestId: 'claim-source', mode: 'sentence',
    examples: [{ ...payload.examples[0], kasem: 'unique claim example', english: 'Birds sing at dawn.' }] }, 'contributor'));
  const review = { noteId: created.id, revision: 1, dialectCompetent: true, judgments: [good] };
  await decideGrammarNote.run(request('cr1', review)); await decideGrammarNote.run(request('cr2', review));
  const claim = await submitGrammarClaim.run(request('claim-author', { title: 'Synthetic focus claim', summary: 'SYNTHETIC CLAIM CONTENT',
    scope: 'This synthetic context only.', dialect: 'synthetic', triggers: 'mo', evidenceIds: [created.id] }));
  const decision = { claimId: claim.id, version: 1, decision: 'supported', reason: 'Synthetic independent evidence judgment.' };
  await assert.rejects(() => decideGrammarClaim.run(request('claim-author', decision)), /independent/);
  assert.equal((await decideGrammarClaim.run(request('claim-r1', decision))).status, 'hypothesis');
  await decideGrammarClaim.run(request('claim-r1', decision));
  assert.equal((await decideGrammarClaim.run(request('claim-r2', decision))).status, 'supported');
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'grammarRules/claim-' + claim.id)));
  assert.match(await grammarContextFor('What does mo mean?'), /SYNTHETIC CLAIM CONTENT/);
  const events = await db.collection('kasemClaimReviews/' + claim.id + '/events').get();
  assert.equal(events.size, 2);
  await withdrawGrammarNote.run(request('claim-source', { noteId: created.id }, 'contributor'));
  assert.doesNotMatch(await grammarContextFor('What does mo mean?'), /SYNTHETIC CLAIM CONTENT/);
  assert.equal((await decideGrammarClaim.run(request('claim-r1', { ...decision, decision: 'retired' }, 'admin'))).status, 'retired');
});

test('registered Firestore release locks partitions, verifies files, and invalidates on withdrawal', async () => {
  const created = await submitGrammarNote.run(request('export-source', { ...payload, requestId: 'export-source', mode: 'sentence',
    examples: [{ ...payload.examples[0], kasem: 'release unique target', english: 'Rain brings fresh water.' }] }, 'contributor'));
  const review = { noteId: created.id, revision: 1, dialectCompetent: true, judgments: [good] };
  await decideGrammarNote.run(request('export-r1', review)); await decideGrammarNote.run(request('export-r2', review));
  const claim = await submitGrammarClaim.run(request('export-claim-author', { title: 'Exported synthetic claim', summary: 'Synthetic exported claim.',
    scope: 'Synthetic test context only.', dialect: 'synthetic', triggers: 'mo', evidenceIds: [created.id] }));
  const claimReview = { claimId: claim.id, version: 1, decision: 'supported', reason: 'Synthetic independent support.' };
  await decideGrammarClaim.run(request('export-claim-r1', claimReview));
  await decideGrammarClaim.run(request('export-claim-r2', claimReview));
  const directory = join(mkdtempSync(join(tmpdir(), 'kasem-release-e2e-')), 'release');
  const cli = (...args) => promisify(execFile)(process.execPath, ['services/functions/scripts/kasem-dataset.mjs', ...args], { timeout: 60000 });
  await cli('export', '--firestore', '--project', projectId, '--commit', '--release', 'synthetic-registered', '--output', directory, '--train-percent', '100', '--validation-percent', '0');
  assert.equal((await db.doc('kasemEvidence/' + created.id).get()).get('datasetSplit'), 'train');
  const manifest = join(directory, 'manifest.json');
  const exported = JSON.parse(readFileSync(manifest, 'utf8'));
  assert.equal(exported.claimLineage.some(item => item.claimId === claim.id), true);
  await cli('verify', '--project', projectId, '--manifest', manifest, '--run', 'synthetic-preflight', '--model', 'synthetic-model', '--prompt', 'synthetic-prompt', '--commit');
  assert.equal((await db.doc('kasemModelRuns/synthetic-preflight').get()).get('status'), 'preflight-passed');
  await decideGrammarClaim.run(request('export-claim-r3', { ...claimReview, decision: 'disputed', reason: 'Synthetic scope concern.' }));
  assert.equal((await db.doc('kasemDatasetReleases/synthetic-registered').get()).get('status'), 'invalidated');
  await assert.rejects(() => cli('verify', '--project', projectId, '--manifest', manifest), /registered ready release/);
  await withdrawGrammarNote.run(request('export-source', { noteId: created.id }, 'contributor'));
  assert.equal((await db.doc('kasemDatasetReleases/synthetic-registered').get()).get('status'), 'invalidated');
  await assert.rejects(() => cli('verify', '--project', projectId, '--manifest', manifest), /registered ready release/);
});

test('reviewer audio checks exact object generation, revision and current permission', { skip: !process.env.STORAGE_EMULATOR_HOST && !process.env.FIREBASE_STORAGE_EMULATOR_HOST }, async () => {
  const path = 'grammarAudio/audio-author/private.mp3';
  const file = getStorage(app).bucket().file(path);
  await file.save(Buffer.from('synthetic-audio'), { metadata: { contentType: 'audio/mpeg' }, resumable: false });
  const created = await submitGrammarNote.run(request('audio-author', { ...payload, requestId: 'audio', mode: 'sentence',
    permissions: { ...payload.permissions, audio: true }, examples: [{ ...payload.examples[0], audioPath: path }] }, 'contributor'));
  const data = { noteId: created.id, revision: 1, example: 0 };
  await assert.rejects(() => readGrammarAudio.run(request('listener', data, 'contributor')), /validator access/i);
  const response = await readGrammarAudio.run(request('audio-reviewer', data));
  assert.equal(Buffer.from(response.audio, 'base64').toString(), 'synthetic-audio');
  await file.save(Buffer.from('replacement'), { metadata: { contentType: 'audio/mpeg' }, resumable: false });
  await assert.rejects(() => readGrammarAudio.run(request('audio-reviewer', data)), /recording changed/i);
  await withdrawGrammarNote.run(request('audio-author', { noteId: created.id }, 'contributor'));
  await assert.rejects(() => readGrammarAudio.run(request('audio-reviewer', data)), /no longer available/);
});
