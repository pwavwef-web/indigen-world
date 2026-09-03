// Pure unit tests for Kasem noun morphology — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/kasemMorphology.test.mjs
//
// The subject is the small module that lets the dictionary stop asking members
// for the Kasem for "the". Two things here are load-bearing and neither is
// obvious from the function signatures:
//
//   * The indefinite is DERIVED and never stored, so a rule stays one rule
//     instead of becoming fifteen thousand copies of itself.
//   * A noun class is INDUCED from a form a speaker gave, and returns null
//     rather than a guess. That second one is the test that matters most: a
//     fabricated class in a language with few written sources gets published,
//     taught and repeated, and nothing downstream can tell it from a real one.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KASEM_INDEFINITE_PARTICLE,
  MAX_FORM_LENGTH,
  NOUN_CLASSES,
  hasNounForms,
  indefiniteForm,
  induceNounClass,
  parseNounForms,
} from '../../services/functions/lib/kasem-morphology.js';

// ── The rule that needs no data ─────────────────────────────────────────────

test('the indefinite is the noun and then mo, for any noun', () => {
  assert.equal(KASEM_INDEFINITE_PARTICLE, 'mo');
  assert.equal(indefiniteForm('bu'), 'bu mo');
  assert.equal(indefiniteForm('  nia  '), 'nia mo');
  assert.equal(indefiniteForm('rain water'), 'rain water mo');
});

test('an entry with no headword gets no indefinite rather than a bare particle', () => {
  // "mo" on its own is not the indefinite of anything, and rendering it would
  // state something false about the language on an entry nobody can fix.
  assert.equal(indefiniteForm(''), '');
  assert.equal(indefiniteForm('   '), '');
  assert.equal(indefiniteForm(null), '');
  assert.equal(indefiniteForm(undefined), '');
  assert.equal(indefiniteForm(42), '');
  assert.equal(indefiniteForm({}), '');
});

test('deriving is total, so a legacy row cannot take a screen down', () => {
  // Every noun already in dictionaryEntries gets its indefinite form the day
  // the client ships, with no backfill. That only holds if this never throws.
  for (const input of [[], {}, 0, false, NaN, Symbol.iterator.toString()]) {
    assert.doesNotThrow(() => indefiniteForm(input));
  }
});

// ── The class table, and the refusal to invent one ──────────────────────────

test('the class table is well-formed however many entries it has', () => {
  // Deliberately empty today — see the comment on NOUN_CLASSES. This test is
  // written to grow teeth on its own: the moment somebody adds an attested
  // class, these invariants start being checked against it.
  const ids = new Set();
  for (const entry of NOUN_CLASSES) {
    assert.equal(typeof entry.id, 'string');
    assert.ok(entry.id.length > 0, 'a class needs a storable id');
    assert.equal(entry.id, entry.id.toLowerCase(), 'ids are stored and queried');
    assert.ok(entry.label.length > 0, 'a class needs a label somebody can read');
    assert.ok(entry.definiteMarker.length > 0, 'a class without its marker cannot be induced');
    assert.equal(ids.has(entry.id), false, `duplicate class id: ${entry.id}`);
    ids.add(entry.id);
  }
});

test('an unrecognised ending yields null, never a fallback class', () => {
  // THE guard. If this ever starts returning a class for nonsense, somebody
  // has added a default and the dictionary has begun manufacturing grammar.
  assert.equal(induceNounClass('bu', 'zzqxvw'), null);
  assert.equal(induceNounClass('bu', 'bu-something-nobody-said'), null);
  assert.equal(induceNounClass('', ''), null);
  assert.equal(induceNounClass('bu', null), null);
  assert.equal(induceNounClass(null, undefined), null);
});

test('an echoed headword is not evidence of anything', () => {
  // A member who retypes the word into "say it with the" has told us nothing.
  // Treating that as a match would file the whole dictionary under whichever
  // class happened to be listed first.
  assert.equal(induceNounClass('bu', 'bu'), null);
  assert.equal(induceNounClass('Bu', '  bu  '), null);
});

test('every attested class is recoverable from a form built with its marker', () => {
  // Vacuous while NOUN_CLASSES is empty, and self-checking afterwards: it
  // proves induction can actually find each class that has been written down,
  // both suffixed and written as a separate word, which are the two spellings
  // members use.
  for (const entry of NOUN_CLASSES) {
    assert.deepEqual(induceNounClass('stem', `stem${entry.definiteMarker}`), {
      id: entry.id,
      marker: entry.definiteMarker,
    });
    assert.deepEqual(induceNounClass('stem', `stem ${entry.definiteMarker}`), {
      id: entry.id,
      marker: entry.definiteMarker,
    });
  }
});

// ── What the contribution form is allowed to record ─────────────────────────

test('forms are read for a noun and quietly dropped for anything else', () => {
  const given = { definite: 'bukam', plural: 'buga' };
  assert.deepEqual(parseNounForms(given, 'noun'), given);

  // Not an error. The fields only render for Noun, so their presence elsewhere
  // is stale client state, and a member's good answer must not fail over it.
  for (const other of ['verb', 'adjective', 'ideophone', 'proverb', 'unknown', '', null]) {
    assert.deepEqual(parseNounForms(given, other), { definite: '', plural: '' });
  }
});

test('a stored indefinite is refused even when a client offers one', () => {
  // It is derived. Accepting a copy would let the two disagree, and the copy
  // would win on the display path.
  const parsed = parseNounForms(
    { definite: 'bukam', plural: 'buga', indefinite: 'bu mo' },
    'noun',
  );
  assert.deepEqual(parsed, { definite: 'bukam', plural: 'buga' });
  assert.equal('indefinite' in parsed, false);
});

test('junk in the forms map is nothing, not a crash', () => {
  const empty = { definite: '', plural: '' };
  assert.deepEqual(parseNounForms(null, 'noun'), empty);
  assert.deepEqual(parseNounForms('bukam', 'noun'), empty);
  assert.deepEqual(parseNounForms(42, 'noun'), empty);
  assert.deepEqual(parseNounForms({ definite: 7, plural: [] }, 'noun'), empty);
  assert.deepEqual(parseNounForms({}, 'noun'), empty);
});

test('whitespace is collapsed and a pasted paragraph is truncated', () => {
  assert.deepEqual(
    parseNounForms({ definite: '  bu   kam ', plural: '\tbuga\n' }, 'noun'),
    { definite: 'bu kam', plural: 'buga' },
  );
  const long = parseNounForms({ definite: 'x'.repeat(400), plural: '' }, 'noun');
  assert.equal(long.definite.length, MAX_FORM_LENGTH);
});

test('nothing worth storing is reported as nothing to store', () => {
  // What keeps an empty `forms: {}` map off every verb in the collection.
  assert.equal(hasNounForms({ definite: '', plural: '' }), false);
  assert.equal(hasNounForms({ definite: 'bukam', plural: '' }), true);
  assert.equal(hasNounForms({ definite: '', plural: 'buga' }), true);
});
