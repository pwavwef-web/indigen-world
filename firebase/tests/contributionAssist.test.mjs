// A second pair of eyes on a contribution, before it is sent.
//
//   npm run build:functions && node --test firebase/tests/contributionAssist.test.mjs
//
// The property these tests defend is not accuracy, it is restraint. Every
// check here is advice a contributor may ignore, and the worst failure this
// module can have is not missing something — it is telling a Kasem speaker
// that their own word is wrong. So the assertions are mostly about what it
// declines to say: no severity above 'ask', nothing that reads as a rejection,
// and no false "that is English" aimed at a real Kasem word.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deterministicChecks } from '../../services/functions/lib/contribution-assist.js';

function peer(id, kasem, english, homographIndex = 0) {
  return { id, kasem, english, homographIndex };
}

function check(input) {
  return deterministicChecks({
    kasem: '',
    english: '',
    partOfSpeech: 'noun',
    peers: [],
    knownKasem: new Set(),
    ...input,
  });
}

function ids(checks) {
  return checks.map((row) => row.id);
}

test('a clean first-of-its-kind entry is flagged for nothing', () => {
  const checks = check({ kasem: 'kana', english: 'hunger' });
  assert.deepEqual(ids(checks), []);
});

test('nothing is said about a half-filled form', () => {
  // The form calls this while somebody is still typing. Advice about a field
  // they have not reached yet is noise.
  assert.deepEqual(check({ kasem: 'kana', english: '' }), []);
  assert.deepEqual(check({ kasem: '', english: 'hunger' }), []);
});

test('an existing word with the same meaning is raised as a question', () => {
  const checks = check({
    kasem: 'nia',
    english: 'water',
    peers: [peer('e1', 'nia', 'water', 1)],
  });
  assert.deepEqual(ids(checks), ['duplicate']);
  // A question, never a refusal. The contributor is the one who knows whether
  // it is the same word.
  assert.equal(checks[0].severity, 'ask');
  assert.equal(checks[0].entries.length, 1);
  assert.match(checks[0].detail, /correction/);
});

test('an existing spelling with a different meaning is a homograph, not a clash', () => {
  // The case nobody was ever asked about. 478 of the 1200 published entries
  // share a spelling; a contributor sending a ninth `ni` had no way to know.
  const checks = check({
    kasem: 'ni',
    english: 'to see',
    peers: [peer('e1', 'ni', 'mother', 1), peer('e2', 'ni', 'cow', 2)],
  });
  assert.deepEqual(ids(checks), ['homograph']);
  assert.equal(checks[0].severity, 'ask');
  assert.match(checks[0].title, /2 other words are spelled/);
  // The existing senses are named with their numbers, so the contributor can
  // go and look at them.
  assert.match(checks[0].detail, /ni¹, ni²/);
  assert.match(checks[0].detail, /Nothing is overwritten/);
});

test('the spelling is matched case- and space-insensitively', () => {
  const checks = check({
    kasem: '  NI ',
    english: 'to see',
    peers: [peer('e1', 'ni', 'mother', 1)],
  });
  assert.deepEqual(ids(checks), ['homograph']);
});

test('a peer under a different spelling is not a peer', () => {
  // Diacritics are NOT folded here: in a tonal language the mark is often the
  // only thing separating two words, and merging them would be the exact
  // error homograph numbering exists to prevent.
  const checks = check({
    kasem: 'dɩ',
    english: 'to eat',
    peers: [peer('e1', 'di', 'something else', 1)],
  });
  assert.deepEqual(ids(checks), []);
});

test('the two boxes holding the same text is worth mentioning', () => {
  const checks = check({ kasem: 'water', english: 'water' });
  assert.ok(ids(checks).includes('identical-sides'));
  assert.equal(checks.find((row) => row.id === 'identical-sides').severity, 'warn');
});

test('an obvious English word in the Kasem box is caught', () => {
  const checks = check({ kasem: 'water', english: 'nia' });
  assert.ok(ids(checks).includes('english-in-kasem-box'));
});

test('a real Kasem word is never called English', () => {
  // The failure that matters. A false "you have put English in the Kasem box"
  // aimed at a speaker writing their own language is far worse than missing a
  // genuine slip, which is why the word list is tiny and all function words.
  for (const word of ['kana', 'jege', 'bakeira', 'kamunu', 'kom', 'mage']) {
    const checks = check({ kasem: word, english: 'something' });
    assert.ok(
      !ids(checks).includes('english-in-kasem-box'),
      `${word} was wrongly called English`,
    );
  }
});

test('a Kasem word carrying its own letters is never called English', () => {
  // Belt and braces: even if a spelling collided with the English list, the
  // presence of a Kasem-only letter settles it.
  const checks = check({ kasem: 'nɩa', english: 'water' });
  assert.ok(!ids(checks).includes('english-in-kasem-box'));
});

test('Kasem letters in the English box are caught', () => {
  const checks = check({ kasem: 'nia', english: 'nɩʋ' });
  assert.ok(ids(checks).includes('kasem-in-english-box'));
});

test('a missing word class is a note, not a warning', () => {
  // It is genuinely optional, and the form must not imply otherwise.
  const checks = check({ kasem: 'kana', english: 'hunger', partOfSpeech: '' });
  const note = checks.find((row) => row.id === 'word-class');
  assert.ok(note);
  assert.equal(note.severity, 'note');
});

test('a recognised word class raises nothing', () => {
  for (const value of ['noun', 'Noun', 'verb']) {
    const checks = check({ kasem: 'kana', english: 'hunger', partOfSpeech: value });
    assert.ok(!ids(checks).includes('word-class'), `${value} was not recognised`);
  }
});

test('nothing this module produces is a refusal', () => {
  // There is no 'block' severity and there must never be one. A form that
  // could refuse to send would be this module deciding what enters the
  // archive, which is a thing no model or heuristic here is permitted to do.
  const checks = check({
    kasem: 'water',
    english: 'water',
    peers: [peer('e1', 'water', 'water', 1)],
    partOfSpeech: '',
    knownKasem: new Set(['water']),
  });
  assert.ok(checks.length >= 3);
  for (const row of checks) {
    assert.ok(
      ['ask', 'warn', 'note'].includes(row.severity),
      `${row.id} carries severity ${row.severity}`,
    );
    assert.ok(row.title.length > 0);
    assert.ok(row.detail.length > 0);
  }
});
