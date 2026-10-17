import test from 'node:test';
import assert from 'node:assert/strict';
import { planDuplicates, duplicateKey, mergeExactDuplicates, applyDuplicatePlan } from '../../services/functions/scripts/deduplicate-dictionary.mjs';
import { sourceEntryIndex, matchSourceEntry } from '../../services/functions/scripts/source-entry-matches.mjs';

const entry = extra => ({ kasemText: 'bakeira', englishText: 'boy', isPublished: true, ...extra });
const row = (id, extra) => ({ id, data: entry(extra) });

test('matches both texts with NFC, case and whitespace normalization only', () => {
  assert.equal(duplicateKey(entry({ kasemText: ' BÁ  KEIRA ', englishText: ' BOY ' })),
    duplicateKey(entry({ kasemText: 'ba\u0301 keira' })));
  assert.notEqual(duplicateKey(entry({ kasemText: 'dɩ' })), duplicateKey(entry({ kasemText: 'di' })));
  assert.notEqual(duplicateKey(entry({ kasemText: 'bá' })), duplicateKey(entry({ kasemText: 'ba' })));
  assert.equal(duplicateKey({ kasemText: 'word', englishText: '' }), null);
});

test('keeps different meanings and ignores retired records', () => {
  assert.deepEqual(planDuplicates([row('a'), row('b', { englishText: 'bottle' }),
    row('c', { mergedInto: { id: 'a' } })]), []);
});

test('keeps published identity, then oldest known identity; supports three-way merges', () => {
  const plan = planDuplicates([row('draft', { isPublished: false, createdAt: '2000-01-01' }),
    row('new', { createdAt: '2026-02-01', audioUrl: 'https://example.com/a.mp3' }),
    row('old', { createdAt: '2026-01-01' })]);
  assert.equal(plan[0].targetId, 'old');
  assert.deepEqual(new Set(plan[0].sourceIds), new Set(['draft', 'new']));
});

test('does not publish unpublished groups and prefers a known word class for undated records', () => {
  const plan = planDuplicates([row('a', { isPublished: false, partOfSpeech: 'Not specified in source' }),
    row('b', { isPublished: false, partOfSpeech: 'n.' })]);
  assert.equal(plan[0].targetId, 'b');
  const update = mergeExactDuplicates(entry({ isPublished: false }), entry({ isPublished: false }));
  assert.equal('isPublished' in update, false);
});

test('unions source references and attestations without caps', () => {
  const left = Array.from({ length: 9 }, (_, i) => `Reference ${i}`);
  const update = mergeExactDuplicates(entry({ sourceRefs: left, sourceAttestations: [{ importId: 'one', sourceRefs: ['p1'] }] }),
    entry({ sourceRefs: ['Reference 0', 'Reference 9'], sourceAttestations: [{ sourceRefs: ['p1'], importId: 'one' }, { importId: 'two' }] }));
  assert.equal(update.sourceRefs.length, 10);
  assert.equal(update.sourceAttestations.length, 2);
});

test('keeps both example sentences under one sense', () => {
  const update = mergeExactDuplicates(entry({ kasemExample: 'First example', englishExample: 'First translation' }),
    entry({ senses: [{ definition: 'Boy', domain: 'kinship', examples: [{ kasem: 'Second example', english: 'Second translation' }] }] }));
  assert.equal(update.senses.length, 1);
  assert.equal(update.senses[0].examples.length, 2);
  assert.equal(update.senses[0].domain, 'kinship');
});

test('keeps legacy target examples when the source has a structured sense', () => {
  const update = mergeExactDuplicates(entry({ kasemExample: 'Original', englishExample: 'Original English' }),
    entry({ senses: [{ definition: 'boy', examples: [{ kasem: 'Original', english: 'Original English' }] }] }));
  assert.equal(update.senses[0].examples.length, 1);
});

test('moves audio with provenance and retains distinct case-sensitive audio URLs', () => {
  const update = mergeExactDuplicates(entry({ pronunciationAudioVariants: [{ url: 'https://example.com/A.mp3' }] }),
    entry({ audioUrl: 'https://example.com/a.mp3', pronunciationAudioProvenance: { source: 'speaker' },
      pronunciationAudioVariants: [{ url: 'https://example.com/a.mp3' }] }));
  assert.equal(update.audioUrl, 'https://example.com/a.mp3');
  assert.deepEqual(update.pronunciationAudioProvenance, { source: 'speaker' });
  assert.equal(update.pronunciationAudioVariants.length, 2);
});

test('preserves identity, publication state and numbered homographs', () => {
  const update = mergeExactDuplicates(entry({ contributorId: 'first', homographIndex: 3, dialect: 'Navrongo' }),
    entry({ contributorId: 'second', homographIndex: 4, dialect: 'Paga', source: 'Source note' }));
  for (const field of ['contributorId', 'homographIndex', 'kasemText', 'isPublished', 'createdAt']) assert.equal(field in update, false);
  assert.equal('dialect' in update, false);
  assert.equal(update.source, 'Source note');
});

test('fills an unknown word class and keeps an additional known word class', () => {
  const update = mergeExactDuplicates(entry({ partOfSpeech: 'Word' }), entry({ partOfSpeech: 'Noun' }));
  assert.equal(update.partOfSpeech, 'Noun');
  assert.equal(update.partOfSpeechId, 'noun');
  const second = mergeExactDuplicates(entry({ partOfSpeech: 'Noun' }), entry({ partOfSpeech: 'Adjective' }));
  assert.deepEqual(second.alsoUsedAs, ['adjective']);
});

test('rejects mismatches, retired records and truncation before writes', () => {
  assert.throws(() => mergeExactDuplicates(entry(), entry({ englishText: 'bottle' })));
  assert.throws(() => mergeExactDuplicates(entry(), entry({ mergedInto: { id: 'other' } })));
  const examples = Array.from({ length: 5 }, (_, i) => ({ kasem: `Kasem ${i}`, english: `English ${i}` }));
  assert.throws(() => mergeExactDuplicates(entry({ senses: [{ definition: 'boy', examples }] }), entry()), /lose data/);
});

function fakeDb(target, source) {
  const records = new Map([['dictionaryEntries/target', target], ['dictionaryEntries/source', source]]);
  const writes = [];
  return {
    writes,
    doc: path => ({ path }),
    runTransaction: callback => callback({
      get: async ref => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }),
      update: (ref, data) => writes.push({ path: ref.path, data }),
      create: (ref, data) => writes.push({ path: ref.path, data }),
    }),
  };
}
const planned = () => [{ key: duplicateKey(entry()), targetId: 'target', sourceIds: ['source'] }];

test('transaction retains full originals in audit and retires with a redirect', async () => {
  const target = entry({ contributorId: 'first' }), source = entry({ contributorId: 'second', sourceRefs: ['p2'] });
  const db = fakeDb(target, source);
  const result = await applyDuplicatePlan(db, planned());
  assert.equal(result[0].alreadyMerged, false);
  assert.equal(db.writes[1].data.isPublished, false);
  assert.deepEqual(db.writes[1].data.mergedInto, { collection: 'dictionaryEntries', id: 'target' });
  assert.deepEqual(db.writes[2].data.before, { target, source });
});

test('retry of an already committed merge is a no-op', async () => {
  const db = fakeDb(entry(), entry({ mergedInto: { id: 'target' }, isPublished: false }));
  const result = await applyDuplicatePlan(db, planned());
  assert.equal(result[0].alreadyMerged, true);
  assert.equal(db.writes.length, 0);
});

test('concurrent content or publication changes fail without writes', async () => {
  for (const [target, source] of [[entry(), entry({ englishText: 'bottle' })],
    [entry({ isPublished: false }), entry()]]) {
    const db = fakeDb(target, source);
    await assert.rejects(applyDuplicatePlan(db, planned()));
    assert.equal(db.writes.length, 0);
  }
});

const sourceDoc = (collection, id, data) => ({ id, ref: { path: `${collection}/${id}`, parent: { id: collection } }, get: key => data[key] });
test('source reimports follow retired IDs to the kept entry and keep collections separate', () => {
  const target = sourceDoc('dictionaryEntries', 'target', entry());
  const source = sourceDoc('dictionaryEntries', 'source', entry({ mergedInto: { collection: 'dictionaryEntries', id: 'target' } }));
  const expression = sourceDoc('expressionEntries', 'expression', entry());
  const index = sourceEntryIndex([target, source, expression]);
  assert.equal(matchSourceEntry(index, 'dictionaryEntries', { id: 'source', headword: 'bakeira', translation: 'boy' }), target);
  assert.equal(matchSourceEntry(index, 'dictionaryEntries', { id: 'unseen', headword: 'bakeira', translation: 'boy' }), target);
  assert.equal(matchSourceEntry(index, 'expressionEntries', { id: 'unseen', headword: 'bakeira', translation: 'boy' }), expression);
});

test('source reimports refuse broken or cyclic merge redirects', () => {
  const missing = sourceDoc('dictionaryEntries', 'source', entry({ mergedInto: { collection: 'dictionaryEntries', id: 'missing' } }));
  assert.throws(() => matchSourceEntry(sourceEntryIndex([missing]), 'dictionaryEntries', { id: 'source' }), /missing/);
  const cyclic = sourceDoc('dictionaryEntries', 'cycle', entry({ mergedInto: { collection: 'dictionaryEntries', id: 'cycle' } }));
  assert.throws(() => matchSourceEntry(sourceEntryIndex([cyclic]), 'dictionaryEntries', { id: 'cycle' }), /Cycle/);
});
