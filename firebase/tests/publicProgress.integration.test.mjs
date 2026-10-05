import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import * as progress from '../../services/functions/lib/public-progress.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Use the Firestore emulator.');
const projectId = 'demo-indigen-progress-tests';
let app;
let db;
let rules;

/** The CloudEvent shape the v2 trigger handler reads. */
const change = (recordId, beforeData, afterData) => ({
  id: randomUUID(),
  params: { recordId },
  data: {
    before: { exists: beforeData !== undefined, data: () => beforeData },
    after: { exists: afterData !== undefined, data: () => afterData },
  },
});
const current = async () => (await db.doc(progress.PUBLIC_PROGRESS_DOC).get()).data();
const totals = (data) => Object.fromEntries(Object.entries(data.categories).map(([key, value]) => [key, value.total]));

const PRIVATE = { authUid: 'uid-private-123', contributorName: 'Private Person', reviewerNote: 'secret reviewer note' };

before(async () => {
  app = initializeApp({ projectId });
  db = getFirestore();
  rules = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await rules.clearFirestore();
  const now = Date.now();
  const seed = {
    'dictionaryEntries/collection_secret1': { isPublished: true, kasemText: 'zamborɔ', ...PRIVATE },
    'dictionaryEntries/collection_secret2': { isPublished: true, kasemText: 'buri', audioUrl: 'https://example.test/buri.m4a' },
    'dictionaryEntries/project_3': { isPublished: true, kasemText: 'nawe' },
    'dictionaryEntries/draft_4': { isPublished: false, kasemText: 'unreviewed' },
    'dictionaryEntries/merged_5': { isPublished: false, mergedInto: 'project_3', audioUrl: 'https://example.test/old.m4a' },
    'expressionEntries/e1': { isPublished: true, expressionKind: 'phrase', ...PRIVATE },
    'expressionEntries/e2': { isPublished: true, expressionKind: 'idiom' },
    'expressionEntries/p1': { isPublished: true, expressionKind: 'proverb' },
    'expressionEntries/e3': { isPublished: false, expressionKind: 'phrase' },
    'kasemSentences/s1': { status: 'confirmed', projectionVersion: 2, expiresAtMillis: null },
    'kasemSentences/s2': { status: 'confirmed', projectionVersion: 2, expiresAtMillis: now - 60_000 },
    'kasemSentences/s3': { status: 'confirmed' },
    'kasemSentences/s4': { status: 'submitted', projectionVersion: 2, expiresAtMillis: null },
    'grammarRules/g1': { status: 'published' },
    'grammarRules/g2': { status: 'draft' },
    'publishedContent/pub_story': { publicationStatus: 'published', collectionKind: 'literature' },
    'publishedContent/pub_open_song': { publicationStatus: 'published', collectionKind: 'music', publicationRoute: 'open', ...PRIVATE },
    'publishedContent/pub_reviewed_song': { publicationStatus: 'published', collectionKind: 'music', publicationRoute: 'collection_review' },
    'publishedContent/pub_video_draft': { publicationStatus: 'unpublished', collectionKind: 'video', publicationRoute: 'reviewed' },
    'submissions/pending': { status: 'SUBMITTED', collectionKind: 'music', ...PRIVATE },
  };
  const batch = db.batch();
  for (const [path, data] of Object.entries(seed)) batch.set(db.doc(path), data);
  await batch.commit();
});

after(async () => {
  await rules?.cleanup();
  if (app) await deleteApp(app);
});

test('the first projection holds exact historical totals and no events', async () => {
  const outcome = await progress.refreshPublicProgress(db, progress.PROGRESS_CATEGORIES, 'reconcile');
  assert.equal(outcome.written, true);
  assert.deepEqual(outcome.failed, []);
  const data = await current();
  assert.equal(data.revision, 1);
  assert.deepEqual(data.events, []);
  assert.deepEqual(totals(data), {
    lexicon: 3, pronunciation: 1, expressions: 2, proverbs: 1, sentences: 1,
    grammar: 1, literature: 1, music: 1, audiobooks: 0, video: 0,
  });
});

test('a committed approval produces one matching event and changes nothing else', async () => {
  const before = totals(await current());
  const record = { isPublished: true, kasemText: 'kambon', ...PRIVATE };
  await db.doc('dictionaryEntries/collection_new').set(record);
  const event = change('collection_new', { isPublished: false, kasemText: 'kambon' }, record);
  await progress.onDictionaryEntryProgress.run(event);

  const data = await current();
  assert.equal(data.revision, 2);
  assert.deepEqual(data.events.map((item) => [item.category, item.delta, item.total, item.kind]), [['lexicon', 1, 4, 'approval']]);
  assert.deepEqual(totals(data), { ...before, lexicon: 4 });

  // At-least-once delivery: the identical event arrives again.
  await progress.onDictionaryEntryProgress.run(event);
  const again = await current();
  assert.equal(again.revision, 2, 'a redelivered event changes nothing');
  assert.equal(again.events.length, 1);
  assert.equal(again.categories.lexicon.total, 4);
});

test('unapproved work and failed transactions never increase progress', async () => {
  const before = await current();
  await db.doc('dictionaryEntries/draft_6').set({ isPublished: false, kasemText: 'pending' });
  await progress.onDictionaryEntryProgress.run(change('draft_6', undefined, { isPublished: false }));

  // A review transaction that throws after staging its write commits nothing.
  await assert.rejects(db.runTransaction(async (tx) => {
    tx.set(db.doc('dictionaryEntries/collection_rolled_back'), { isPublished: true });
    throw new Error('validator lost the race');
  }));
  // Even a trigger claiming that approval is measured against what committed.
  await progress.onDictionaryEntryProgress.run(change('collection_rolled_back', undefined, { isPublished: true }));

  const data = await current();
  assert.equal(data.revision, before.revision);
  assert.deepEqual(totals(data), totals(before));
});

test('concurrent approvals are counted once each, with truthful batch deltas', async () => {
  const before = await current();
  const first = { isPublished: true, expressionKind: 'phrase' };
  const second = { isPublished: true, expressionKind: 'idiom' };
  await Promise.all([db.doc('expressionEntries/c1').set(first), db.doc('expressionEntries/c2').set(second)]);
  await Promise.all([
    progress.onExpressionEntryProgress.run(change('c1', undefined, first)),
    progress.onExpressionEntryProgress.run(change('c2', undefined, second)),
  ]);
  const data = await current();
  assert.equal(data.categories.expressions.total, before.categories.expressions.total + 2);
  const fresh = data.events.filter((item) => item.revision > before.revision);
  assert.ok(fresh.every((item) => item.category === 'expressions' && item.delta > 0));
  assert.equal(fresh.reduce((sum, item) => sum + item.delta, 0), 2, 'two approvals, never three');
  assert.equal(data.categories.proverbs.total, before.categories.proverbs.total, 'proverbs untouched');
});

test('a retraction is a correction, not an approval', async () => {
  const before = await current();
  await db.doc('dictionaryEntries/collection_new').update({ isPublished: false });
  await progress.onDictionaryEntryProgress.run(change('collection_new', { isPublished: true }, { isPublished: false }));
  const data = await current();
  assert.equal(data.categories.lexicon.total, before.categories.lexicon.total - 1);
  assert.deepEqual(data.events.at(-1).kind, 'correction');
  assert.equal(data.events.at(-1).delta, -1);
});

test('an open post fills nothing; a reviewed one fills only its own vessel', async () => {
  const before = await current();
  const open = { publicationStatus: 'published', collectionKind: 'video', publicationRoute: 'open' };
  await db.doc('publishedContent/pub_open_video').set(open);
  await progress.onPublishedContentProgress.run(change('pub_open_video', undefined, open));
  assert.equal((await current()).revision, before.revision);

  const reviewed = { publicationStatus: 'published', collectionKind: 'video', publicationRoute: 'collection_review' };
  await db.doc('publishedContent/pub_reviewed_video').set(reviewed);
  await progress.onPublishedContentProgress.run(change('pub_reviewed_video', undefined, reviewed));
  const data = await current();
  assert.deepEqual(totals(data), { ...totals(before), video: 1 });
});

test('a missed trigger is caught up by the reconcile without a fresh event', async () => {
  const before = await current();
  await db.doc('grammarRules/g3').set({ status: 'published' });
  await db.doc('kasemSentences/s1').update({ expiresAtMillis: Date.now() - 1 });
  const outcome = await progress.refreshPublicProgress(db, progress.PROGRESS_CATEGORIES, 'reconcile');
  assert.deepEqual(outcome.events, []);
  const data = await current();
  assert.equal(data.categories.grammar.total, before.categories.grammar.total + 1);
  assert.equal(data.categories.sentences.total, 0, 'expired consent leaves the count');
  assert.equal(data.events.length, before.events.length);
  assert.equal(data.revision, before.revision + 1);
});

test('anyone may read the projection; no client, not even an admin, may write it', async () => {
  const guest = rules.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(guest, 'publicProgress/current')));
  await assertFails(setDoc(doc(guest, 'publicProgress/current'), { revision: 999 }));
  const admin = rules.authenticatedContext('admin-1', { role: 'super_admin', superAdmin: true }).firestore();
  await assertFails(setDoc(doc(admin, 'publicProgress/current'), { revision: 999 }));
  await assertFails(setDoc(doc(admin, 'publicProgress/other'), { revision: 1 }));
});

test('nothing private reaches the public document', async () => {
  const data = await current();
  const serialised = JSON.stringify(data);
  for (const secret of [...Object.values(PRIVATE), 'collection_secret1', 'pub_open_song', 'zamborɔ', 'kambon', 'example.test']) {
    assert.equal(serialised.includes(secret), false, `public projection leaks ${secret}`);
  }
  assert.deepEqual(Object.keys(data).sort(), ['categories', 'events', 'revision', 'schemaVersion', 'updatedAt']);
});
