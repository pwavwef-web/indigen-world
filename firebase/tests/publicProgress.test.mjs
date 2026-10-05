import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import {
  MAX_PUBLIC_EVENTS,
  PROGRESS_CATEGORIES,
  changedCategories,
  countsToward,
  parseStoredProgress,
  planProgressUpdate,
  publicProgressFields,
} from '../../services/functions/lib/public-progress.js';

const now = Date.parse('2026-10-04T12:00:00Z');
const at = (seconds, nanoseconds = 0) => new Timestamp(1_790_000_000 + seconds, nanoseconds);
const count = (category, total, seconds, nanoseconds = 0) => ({ category, total, readTime: at(seconds, nanoseconds) });
const initialised = (totals = {}) => planProgressUpdate(null, PROGRESS_CATEGORIES.map((category) => count(category, totals[category] ?? 0, 0)), 'reconcile').next;

test('each category counts only its own reviewed, public records', () => {
  assert.equal(countsToward('lexicon', { isPublished: true }, now), true);
  assert.equal(countsToward('lexicon', { isPublished: false, mergedInto: 'other' }, now), false, 'a merged entry no longer counts');
  assert.equal(countsToward('pronunciation', { isPublished: true, audioUrl: 'https://x/a.m4a' }, now), true);
  assert.equal(countsToward('pronunciation', { isPublished: true, audioUrl: '' }, now), false);
  assert.equal(countsToward('pronunciation', { isPublished: false, audioUrl: 'https://x/a.m4a' }, now), false);
  assert.equal(countsToward('pronunciation', { isPublished: true }, now), false, 'a word is not a pronunciation');

  assert.equal(countsToward('expressions', { isPublished: true, expressionKind: 'phrase' }, now), true);
  assert.equal(countsToward('expressions', { isPublished: true }, now), true, 'older expressions without a kind are expressions');
  assert.equal(countsToward('expressions', { isPublished: true, expressionKind: 'proverb' }, now), false, 'a proverb is not counted twice');
  assert.equal(countsToward('proverbs', { isPublished: true, expressionKind: 'proverb' }, now), true);
  assert.equal(countsToward('proverbs', { isPublished: false, expressionKind: 'proverb' }, now), false);

  const sentence = { status: 'confirmed', projectionVersion: 2, expiresAtMillis: null };
  assert.equal(countsToward('sentences', sentence, now), true);
  assert.equal(countsToward('sentences', { ...sentence, expiresAtMillis: now + 1 }, now), true);
  assert.equal(countsToward('sentences', { ...sentence, expiresAtMillis: now }, now), false, 'expired consent leaves the public corpus');
  assert.equal(countsToward('sentences', { ...sentence, projectionVersion: 1 }, now), false, 'only the projection the rules serve');
  assert.equal(countsToward('sentences', { ...sentence, status: 'submitted' }, now), false);

  assert.equal(countsToward('grammar', { status: 'published' }, now), true);
  assert.equal(countsToward('grammar', { status: 'draft' }, now), false);

  const song = { publicationStatus: 'published', collectionKind: 'music' };
  assert.equal(countsToward('music', { ...song, publicationRoute: 'collection_review' }, now), true);
  assert.equal(countsToward('music', { ...song, publicationRoute: 'reviewed' }, now), true);
  assert.equal(countsToward('music', song, now), true, 'records older than the route field still count');
  assert.equal(countsToward('music', { ...song, publicationRoute: 'open' }, now), false, 'open posts were never reviewed');
  assert.equal(countsToward('music', { ...song, publicationStatus: 'unpublished' }, now), false);
  assert.equal(countsToward('literature', song, now), false, 'one kind never fills another');
  assert.equal(countsToward('audiobooks', { publicationStatus: 'published', collectionKind: 'audiobooks', publicationRoute: 'admin' }, now), true);

  for (const category of PROGRESS_CATEGORIES) {
    assert.equal(countsToward(category, undefined, now), false, `${category}: a deleted record counts nowhere`);
  }
});

test('only a change in eligibility asks for a recount, in the right categories', () => {
  assert.deepEqual(changedCategories('dictionaryEntries', { isPublished: false }, { isPublished: true }, now), ['lexicon']);
  assert.deepEqual(
    changedCategories('dictionaryEntries', undefined, { isPublished: true, audioUrl: 'https://x/a.m4a' }, now),
    ['lexicon', 'pronunciation'],
  );
  assert.deepEqual(
    changedCategories('dictionaryEntries', { isPublished: true, englishText: 'old' }, { isPublished: true, englishText: 'edit' }, now),
    [],
    'editing an approved record, or approving it again, changes no total',
  );
  assert.deepEqual(changedCategories('dictionaryEntries', { isPublished: true }, { isPublished: true, audioUrl: 'u' }, now), ['pronunciation']);
  assert.deepEqual(changedCategories('dictionaryEntries', { isPublished: true }, undefined, now), ['lexicon']);
  assert.deepEqual(changedCategories('dictionaryEntries', undefined, { isPublished: false }, now), [], 'an unapproved draft changes nothing');
  assert.deepEqual(
    changedCategories('expressionEntries', { isPublished: true, expressionKind: 'phrase' }, { isPublished: true, expressionKind: 'proverb' }, now),
    ['expressions', 'proverbs'],
  );
  assert.deepEqual(
    changedCategories('publishedContent', undefined, { publicationStatus: 'published', collectionKind: 'music', publicationRoute: 'open' }, now),
    [],
    'an open post fills nothing',
  );
  assert.deepEqual(
    changedCategories('publishedContent', undefined, { publicationStatus: 'published', collectionKind: 'video', publicationRoute: 'collection_review' }, now),
    ['video'],
  );
  assert.deepEqual(changedCategories('kasemSentences', undefined, { status: 'confirmed', projectionVersion: 2, expiresAtMillis: null }, now), ['sentences']);
  assert.deepEqual(changedCategories('grammarRules', { status: 'draft' }, { status: 'published' }, now), ['grammar']);
});

test('the first projection is history: exact totals, revision 1, no events', () => {
  const doc = initialised({ lexicon: 357, expressions: 105 });
  assert.equal(doc.revision, 1);
  assert.deepEqual(doc.events, []);
  assert.equal(doc.categories.lexicon.total, 357);
  assert.equal(doc.categories.expressions.total, 105);
  assert.equal(Object.keys(doc.categories).length, PROGRESS_CATEGORIES.length);
});

test('an approval becomes one sanitized event; a redelivery and a stale count do nothing', () => {
  const stored = initialised({ lexicon: 357 });
  const approved = planProgressUpdate(stored, [count('lexicon', 358, 10)], 'trigger');
  assert.equal(approved.next.revision, 2);
  assert.equal(approved.next.categories.lexicon.total, 358);
  assert.deepEqual(approved.events.map((event) => [event.id, event.category, event.delta, event.total, event.kind]), [
    ['2.lexicon', 'lexicon', 1, 358, 'approval'],
  ]);
  assert.equal(approved.next.categories.expressions.total, stored.categories.expressions.total, 'other categories are untouched');

  // The same event delivered again recounts the same number later.
  const redelivered = planProgressUpdate(approved.next, [count('lexicon', 358, 11)], 'trigger');
  assert.equal(redelivered.next.revision, 2, 'no new revision');
  assert.deepEqual(redelivered.events, [], 'no second approval');
  assert.equal(redelivered.next.categories.lexicon.countedAt.seconds, at(11).seconds, 'the newer read time is kept');

  // An older count that arrives late cannot roll the total back.
  assert.equal(planProgressUpdate(redelivered.next, [count('lexicon', 357, 9)], 'trigger'), null);
  assert.equal(planProgressUpdate(redelivered.next, [count('lexicon', 357, 11)], 'trigger'), null, 'an equal read time is not newer');
  assert.ok(planProgressUpdate(redelivered.next, [count('lexicon', 359, 11, 1)], 'trigger'), 'nanoseconds order counts');
});

test('concurrent approvals are counted once, by whichever recount reads last', () => {
  const stored = initialised({ expressions: 105 });
  // Two approvals commit; trigger B counts after both, trigger A counted after one but arrives second.
  const b = planProgressUpdate(stored, [count('expressions', 107, 20)], 'trigger');
  assert.deepEqual(b.events.map((event) => event.delta), [2], 'a truthful batch of two');
  assert.equal(planProgressUpdate(b.next, [count('expressions', 106, 19)], 'trigger'), null);
  // Or A first, then B: two events of one each. Either way the total is 107.
  const a = planProgressUpdate(stored, [count('expressions', 106, 19)], 'trigger');
  const then = planProgressUpdate(a.next, [count('expressions', 107, 20)], 'trigger');
  assert.equal(then.next.categories.expressions.total, 107);
  assert.deepEqual([...a.events, ...then.events].map((event) => event.delta), [1, 1]);
});

test('retractions are corrections, and a reconcile corrects silently', () => {
  const stored = initialised({ lexicon: 358 });
  const retracted = planProgressUpdate(stored, [count('lexicon', 357, 30)], 'trigger');
  assert.deepEqual(retracted.events.map((event) => [event.delta, event.kind]), [[-1, 'correction']]);

  const reconciled = planProgressUpdate(retracted.next, [count('lexicon', 360, 40), count('grammar', 0, 40)], 'reconcile');
  assert.equal(reconciled.next.categories.lexicon.total, 360, 'missed approvals are caught up');
  assert.equal(reconciled.next.revision, retracted.next.revision + 1, 'the cursor still moves');
  assert.deepEqual(reconciled.events, [], 'but nothing is presented as happening now');
  assert.deepEqual(reconciled.next.events.map((event) => event.id), retracted.next.events.map((event) => event.id), 'earlier events are kept');
});

test('a category first seen later is a baseline, never a giant approval', () => {
  const partial = planProgressUpdate(null, [count('lexicon', 357, 0)], 'trigger').next;
  const later = planProgressUpdate(partial, [count('pronunciation', 93, 5)], 'trigger');
  assert.equal(later.next.categories.pronunciation.total, 93);
  assert.deepEqual(later.events, []);
});

test('the event ring is bounded and parsing drops anything malformed', () => {
  let doc = initialised();
  for (let index = 1; index <= MAX_PUBLIC_EVENTS + 6; index += 1) {
    doc = planProgressUpdate(doc, [count('grammar', index, index)], 'trigger').next;
  }
  assert.equal(doc.events.length, MAX_PUBLIC_EVENTS);
  assert.equal(doc.events.at(-1).total, MAX_PUBLIC_EVENTS + 6);

  const parsed = parseStoredProgress({
    revision: 4,
    updatedAt: at(1),
    categories: { lexicon: { total: 3, countedAt: at(1) }, bogus: { total: 1, countedAt: at(1) }, grammar: { total: -1, countedAt: at(1) } },
    events: [
      { revision: 4, category: 'lexicon', delta: 1, total: 3, at: at(1), contributorName: 'Never copied' },
      { revision: 4, category: 'lexicon', delta: 0, total: 3, at: at(1) },
      { revision: 4, category: 'unknown', delta: 1, total: 3, at: at(1) },
    ],
  });
  assert.deepEqual(Object.keys(parsed.categories), ['lexicon']);
  assert.equal(parsed.events.length, 1);
  assert.equal('contributorName' in parsed.events[0], false);
});

test('the public document holds only category keys, numbers and times', () => {
  const doc = planProgressUpdate(initialised({ lexicon: 1 }), [count('lexicon', 2, 3)], 'trigger').next;
  const fields = publicProgressFields(doc);
  assert.deepEqual(Object.keys(fields).sort(), ['categories', 'events', 'revision', 'schemaVersion', 'updatedAt']);
  for (const [category, value] of Object.entries(fields.categories)) {
    assert.ok(PROGRESS_CATEGORIES.includes(category));
    assert.deepEqual(Object.keys(value).sort(), ['changedAt', 'countedAt', 'total']);
  }
  for (const event of fields.events) {
    assert.deepEqual(Object.keys(event).sort(), ['at', 'category', 'delta', 'id', 'kind', 'revision', 'total']);
    assert.match(event.id, /^\d+\.[a-z]+$/);
  }
});
