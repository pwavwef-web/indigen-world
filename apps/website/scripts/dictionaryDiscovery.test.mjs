import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverWords, isDictionaryWord, readSavedWordIds } from '../src/features/dictionary/discovery.ts';

const filters = { query: '', dialect: '', audioOnly: false, savedOnly: false };
// Synthetic search fixtures: these labels do not assert language translations.
const entries = [
  { id: 'related', headword: 'example-a', translation: 'water pot', dialect: 'Region A', audioUrl: '' },
  { id: 'exact', headword: 'example-z', translation: 'water', dialect: 'Region B', audioUrl: '/test-audio.mp3' },
  { id: 'same-spelling', headword: 'example-z', translation: 'another recorded meaning', dialect: 'Region A', audioUrl: '' },
  { id: 'tone', headword: 'éxample-z', translation: 'tone-marked fixture', dialect: 'Region A', audioUrl: '' },
];

test('exact meanings precede partial matches without changing published text', () => {
  const result = discoverWords(entries, { ...filters, query: '  WATER ' }, new Set());
  assert.deepEqual(result.map(group => group.entries[0].id), ['exact', 'related']);
  assert.equal(entries[0].id, 'related', 'the input list is not mutated');
});

test('matching spellings are grouped but every source and meaning stays available', () => {
  const result = discoverWords(entries, filters, new Set());
  const group = result.find(group => group.key === 'example-z');
  assert.equal(group.entries.length, 2);
  assert.deepEqual(new Set(group.entries.map(entry => entry.dialect)), new Set(['Region A', 'Region B']));
  assert.equal(result.reduce((count, group) => count + group.entries.length, 0), entries.length);
  assert.ok(result.some(group => group.key === 'éxample-z'), 'tone marks are not removed');
});

test('Unicode-equivalent spellings match without conflating different tones', () => {
  assert.equal(discoverWords(entries, { ...filters, query: 'e\u0301xample-z' }, new Set())[0].entries[0].id, 'tone');
  assert.equal(discoverWords(entries, { ...filters, query: 'example-z' }, new Set())[0].entries.length, 2);
});

test('saved, recording and dialect filters intersect and never include absent records', () => {
  const result = discoverWords(entries, { ...filters, savedOnly: true, audioOnly: true, dialect: 'Region B' }, new Set(['exact', 'related', 'unpublished']));
  assert.deepEqual(result.flatMap(group => group.entries.map(entry => entry.id)), ['exact']);
  assert.equal(discoverWords(entries, { ...filters, savedOnly: true }, new Set(['unpublished'])).length, 0);
});

test('explicit sentence and expression records stay outside the word collection', () => {
  for (const record of [{ partOfSpeech: 'SENTENCE' }, { lexicalKind: 'proverb' }, { collectionKind: 'sentences' }, { contentKind: 'expression' }, { wordClass: 'Phrase.' }]) {
    assert.equal(isDictionaryWord(record), false);
  }
  assert.equal(isDictionaryWord({ headword: 'two words', partOfSpeech: 'Noun' }), true, 'spaces alone do not make a sentence');
  assert.equal(isDictionaryWord({}), true, 'legacy words with missing classifications remain available');
});

test('blocked and malformed browser storage does not crash saved-word browsing', () => {
  assert.equal(readSavedWordIds({ getItem() { throw new Error('Blocked'); } }, 'words').size, 0);
  assert.equal(readSavedWordIds({ getItem() { return '{broken'; } }, 'words').size, 0);
  assert.deepEqual([...readSavedWordIds({ getItem() { return '["a",false,"a",12,"b"]'; } }, 'words')], ['a', 'b']);
});
