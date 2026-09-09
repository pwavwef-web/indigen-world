// Editing a published word, and folding two of them into one.
//
//   npm run build:functions && node --test firebase/tests/dictionaryEdits.test.mjs
//
// Three properties are under test, and each of them is the difference between
// a tool a validator can be trusted with and one that quietly loses somebody's
// work:
//
//   1. A patch changes what it names and nothing else. The editor posts the
//      fields a reviewer touched; a field they never opened must come out the
//      other side identical, not blanked.
//   2. A merge fills blanks and never overwrites an answer unless asked. The
//      target keeps its id, so it keeps its citations — and it keeps what it
//      said, so merging the wrong pair is recoverable.
//   3. A duplicate check reports near misses as near. In a tone language the
//      extended letter is often the only thing separating two words, so a
//      check that folded ɩ into i would invite a reviewer to merge two
//      different lexemes and call it tidying up.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DUPLICATE_SIMILARITY_FLOOR,
  applyEntryPatch,
  headwordSimilarity,
  mergeEntryDocuments,
  mergePreview,
  parseEntryPatch,
  rankDuplicates,
  renumberOnRespell,
} from '../../services/functions/lib/dictionary-edits.js';

/** A published entry, in the shape `creators.ts` writes. */
function entry(overrides = {}) {
  return {
    id: 'collection_abc',
    kasemText: 'bakeira',
    headwordKey: 'bakeira',
    homographIndex: 1,
    englishText: 'bottle',
    englishTranslations: ['bottle'],
    translations: ['bakeira'],
    partOfSpeech: 'Noun',
    partOfSpeechId: 'noun',
    dialect: 'Navrongo',
    isPublished: true,
    contributorId: 'con_014',
    createdAt: 'yesterday',
    audioUrl: 'https://example.invalid/bakeira.m4a',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A patch names what it changes
// ---------------------------------------------------------------------------

test('an absent key leaves the field alone', () => {
  const patch = parseEntryPatch({ englishText: 'bottle, flask' });
  const result = applyEntryPatch(entry(), patch);

  assert.equal(result.update.englishText, 'bottle, flask');
  // The etymology was never in the patch, so it is not in the update — which is
  // what stops a reviewer who opened the editor to fix a gloss from blanking
  // the paragraph somebody else wrote.
  assert.equal('etymology' in result.update, false);
  assert.equal('dialect' in result.update, false);
  assert.equal('audioUrl' in result.update, false);
});

test('provenance is not editable at all', () => {
  const patch = parseEntryPatch({
    contributorId: 'con_999',
    homographIndex: 7,
    approvedBy: 'somebody-else',
    createdAt: 'today',
    audioUrl: 'https://example.invalid/not-their-voice.m4a',
    englishText: 'bottle, flask',
  });
  const result = applyEntryPatch(entry(), patch);

  // Only the one legitimate field survived the parse. The rest are not
  // rejected loudly — they are simply not fields this editor has.
  assert.deepEqual(Object.keys(result.update).sort(), ['englishText', 'englishTranslations']);
});

test('a headword cannot be cleared', () => {
  const patch = parseEntryPatch({ kasemText: '   ' });
  assert.equal(patch.has('kasemText'), false);
  // An entry with no headword cannot be looked up and is dropped on parse by
  // the phone, so clearing one withdraws a word nobody asked to withdraw.
});

test('respelling moves the grouping key and asks for a new number', () => {
  const patch = parseEntryPatch({ kasemText: 'bakɛira' });
  const result = applyEntryPatch(entry(), patch);

  assert.equal(result.update.kasemText, 'bakɛira');
  assert.equal(result.update.headwordKey, 'bakɛira');
  assert.equal(result.newHeadwordKey, 'bakɛira');
  assert.equal(renumberOnRespell(result), true);
});

test('a cosmetic respelling keeps the number', () => {
  // Capitalisation and doubled spaces fold away in `headwordKey`, so the entry
  // has not moved groups and its citation is untouched.
  const result = applyEntryPatch(entry(), parseEntryPatch({ kasemText: 'Bakeira' }));
  assert.equal(result.newHeadwordKey, null);
  assert.equal(renumberOnRespell(result), false);
});

test('a legacy row with no grouping key gains one on its first edit', () => {
  const legacy = entry({ headwordKey: undefined });
  delete legacy.headwordKey;
  const result = applyEntryPatch(legacy, parseEntryPatch({ kasemText: 'bakeira' }));

  // The spelling did not change, so nothing is renumbered — but the row is now
  // visible to every duplicate check and to homograph numbering, which is
  // exactly the population where the duplicates accumulated.
  assert.equal(result.update.headwordKey, 'bakeira');
  assert.equal(result.newHeadwordKey, null);
});

test('the English summary and its split list are recomputed together', () => {
  const result = applyEntryPatch(entry(), parseEntryPatch({ englishText: 'bottle, flask, jar' }));
  assert.deepEqual(result.update.englishTranslations, ['bottle', 'flask', 'jar']);
});

test('changing the word class rewrites the stable id beside the free text', () => {
  const result = applyEntryPatch(entry(), parseEntryPatch({ partOfSpeech: 'Verb' }));
  assert.equal(result.update.partOfSpeech, 'Verb');
  assert.equal(result.update.partOfSpeechId, 'verb');
});

test('forms are stored for the class the entry ends up claiming', () => {
  // Changed to a verb in the same patch, so the tenses land and the plural —
  // which belongs to a noun — is dropped rather than stored on a verb.
  const result = applyEntryPatch(
    entry(),
    parseEntryPatch({
      partOfSpeech: 'Verb',
      forms: { present: 'di', past: 'diga', plural: 'not-a-verb-form' },
    }),
  );
  assert.deepEqual(result.update.forms, { present: 'di', past: 'diga' });
});

test('a noun class typed by a validator is marked as theirs', () => {
  const result = applyEntryPatch(entry(), parseEntryPatch({ nounClass: 'ka' }));
  // `creators.ts` reads this on re-publish and carries the human answer forward
  // rather than re-inducing over it.
  assert.equal(result.update.nounClassSource, 'validator');
});

test('an edit that changes nothing produces no update', () => {
  const result = applyEntryPatch(entry(), parseEntryPatch({ englishText: 'bottle' }));
  assert.deepEqual(result.update, {});
  assert.deepEqual(result.changes, []);
});

// ---------------------------------------------------------------------------
// A merge fills blanks
// ---------------------------------------------------------------------------

test('the target keeps every answer it already had', () => {
  const target = entry({ englishText: 'bottle', kasemExample: 'A ba nɔ bakeira.' });
  const source = entry({ id: 'collection_dup', englishText: 'flask', kasemExample: 'Different sentence.' });
  const merged = mergeEntryDocuments({ target, source });

  assert.equal('englishText' in merged.update, false);
  assert.equal('kasemExample' in merged.update, false);
  assert.deepEqual(merged.kept.includes('englishText'), true);
  assert.deepEqual(merged.kept.includes('kasemExample'), true);
});

test('a blank on the target is filled from the source', () => {
  const target = entry({ ipa: '', etymology: '' });
  const source = entry({ id: 'collection_dup', ipa: 'bàkéːrà', etymology: 'From the Hausa.' });
  const merged = mergeEntryDocuments({ target, source });

  assert.equal(merged.update.ipa, 'bàkéːrà');
  assert.equal(merged.update.etymology, 'From the Hausa.');
});

test('a reviewer can take the source’s answer field by field', () => {
  const target = entry({ englishText: 'bottel' });
  const source = entry({ id: 'collection_dup', englishText: 'bottle' });
  const merged = mergeEntryDocuments({ target, source, choices: { englishText: 'source' } });

  assert.equal(merged.update.englishText, 'bottle');
});

test('lists union rather than choose', () => {
  // Two members each gave one meaning. That is two meanings for the word, and
  // picking a side would throw one of them away.
  const target = entry({ englishTranslations: ['bottle'] });
  const source = entry({ id: 'collection_dup', englishTranslations: ['flask'] });
  const merged = mergeEntryDocuments({ target, source });

  assert.deepEqual(merged.update.englishTranslations, ['bottle', 'flask']);
});

test('the paradigm merges slot by slot', () => {
  // One member said "the boy", the other said "two boys". Choosing a side here
  // discards exactly the form the merge was worth doing for.
  const target = entry({ forms: { definite: 'bu kam' } });
  const source = entry({ id: 'collection_dup', forms: { counted: 'buga balei' } });
  const merged = mergeEntryDocuments({ target, source });

  assert.deepEqual(merged.update.forms, { definite: 'bu kam', counted: 'buga balei' });
});

test('a conflicting form slot is kept and reported', () => {
  const target = entry({ forms: { definite: 'bu kam' } });
  const source = entry({ id: 'collection_dup', forms: { definite: 'bu kom' } });
  const merged = mergeEntryDocuments({ target, source });

  assert.equal('forms' in merged.update, false);
  assert.equal(merged.kept.includes('forms.definite'), true);
});

test('merging the same pair twice is a no-op', () => {
  const target = entry({ ipa: '' });
  const source = entry({ id: 'collection_dup', ipa: 'bàkéːrà' });
  const once = mergeEntryDocuments({ target, source });
  const twice = mergeEntryDocuments({ target: { ...target, ...once.update }, source });

  assert.deepEqual(twice.update, {});
});

test('the compare screen shows both sides of every field either one filled', () => {
  const rows = mergePreview(
    entry({ ipa: '', englishText: 'bottle' }),
    entry({ id: 'collection_dup', ipa: 'bàkéːrà', englishText: 'flask' }),
  );
  const byField = Object.fromEntries(rows.map((row) => [row.field, row]));

  assert.equal(byField.englishText.conflict, true);
  assert.equal(byField.ipa.conflict, false);
  assert.equal(byField.ipa.source, 'bàkéːrà');
  // A field neither side filled is not drawn — a compare screen of forty empty
  // rows is one nobody reads to the bottom of.
  assert.equal('etymology' in byField, false);
});

// ---------------------------------------------------------------------------
// Finding the duplicate
// ---------------------------------------------------------------------------

test('an identical spelling is exact whatever its case', () => {
  const matches = rankDuplicates('Bakeira', [entry(), entry({ id: 'other', kasemText: 'nia' })]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].exact, true);
  assert.equal(matches[0].id, 'collection_abc');
});

test('an extended letter is a different word, not a near-enough one', () => {
  // `foldForSearch` on the phone folds ɩ to i so a learner who cannot type ɩ
  // still finds the word. Doing that here would report `dɩ` and `di` as the
  // same entry and invite a reviewer to merge two different lexemes.
  assert.equal(headwordSimilarity('dɩ', 'di'), 0.5);
  assert.ok(0.5 < DUPLICATE_SIMILARITY_FLOOR);
  assert.deepEqual(rankDuplicates('dɩ', [entry({ id: 'x', kasemText: 'di' })]), []);
});

test('a one-letter slip in a longer word is offered as a near miss', () => {
  const matches = rankDuplicates('bakeria', [entry()]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].exact, false);
  assert.ok(matches[0].similarity >= DUPLICATE_SIMILARITY_FLOOR);
});

test('the entry being reviewed is never offered as its own duplicate', () => {
  const matches = rankDuplicates('bakeira', [entry()], { excludeId: 'collection_abc' });
  assert.deepEqual(matches, []);
});

test('exact matches lead, then published ones, then the sense number', () => {
  const matches = rankDuplicates('bakeira', [
    entry({ id: 'c', kasemText: 'bakeira', homographIndex: 2, isPublished: true }),
    entry({ id: 'b', kasemText: 'bakeira', homographIndex: 1, isPublished: false }),
    entry({ id: 'a', kasemText: 'bakeira', homographIndex: 1, isPublished: true }),
    entry({ id: 'near', kasemText: 'bakeiro', isPublished: true }),
  ]);
  assert.deepEqual(matches.map((row) => row.id), ['a', 'c', 'b', 'near']);
});

test('a withdrawn entry still counts as existing', () => {
  // Its homograph number is spent and a reviewer about to publish a second copy
  // of it needs to know it is there.
  const matches = rankDuplicates('bakeira', [entry({ isPublished: false })]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].isPublished, false);
});
