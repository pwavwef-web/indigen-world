// Pure unit tests for the sentence corpus Kawuri answers whole clauses from.
//
//   npm run build:functions && node --test firebase/tests/kasemCorpus.test.mjs
//
// ── The bug these are about ─────────────────────────────────────────────────
// A member asks for "the big boy is hungry". The dictionary holds `bakeira`,
// `kamunu` and `kana` and hands all three over as confirmed, because they are.
// Nothing holds the *order*, so the model lays them out the way English did
// and produces `bakeira kamunu kom kana` — every word attested, every spelling
// right, the sentence invented.
//
// That is a worse failure than an invented word and it is the reason this
// module exists, because it hides: an invented word can be checked against the
// dictionary and found missing, while an invented sentence passes every check
// a per-word archive can make.
//
// The fixtures below are the real thing rather than made-up Kasem. They are
// the three sentences a speaker used to report this, and between them they
// carry the whole problem: the same particle `mo` in three positions, an
// experiencer construction where English uses a copula, and a minimal pair
// that shows the particle is not simply an article.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  grammarTerms,
  sentenceRequest,
  translationTerms,
} from '../../services/functions/lib/kawuri-dictionary.js';

import {
  alignGloss,
  canonicalConstruction,
  contentWords,
  glossTokens,
  parseAttestedSentence,
  sentenceOverlap,
  unknownWords,
} from '../../services/functions/lib/kasem-corpus.js';

import {
  corpusBriefing,
  corpusRecordFrom,
  matchCorpus,
} from '../../services/functions/lib/kawuri-corpus.js';

/** "the big boy is hungry" — hunger has the big boy. */
const HUNGRY_BOY = {
  kasem: 'kana mo jege bakeira kamunu kom',
  english: 'the big boy is hungry',
  literal: 'hunger a has boy big the',
  note: 'The sensation is the subject and the person is the object.',
  constructions: ['experiencer', 'word-order'],
};

/** "I am hungry" — the same frame with a pronoun object and no final particle. */
const HUNGRY_ME = {
  kasem: 'kana mo jege ne',
  english: 'i am hungry',
  literal: 'hunger a has me',
  constructions: ['experiencer', 'pronoun'],
};

/** "he beat me" — the other half of the minimal pair, particle at the end. */
const BEAT_ME = {
  kasem: 'o mage ne mo',
  english: 'he beat me',
  literal: 'he beat me a',
  constructions: ['pronoun', 'focus'],
};

function record(row, overrides = {}) {
  const parsed = parseAttestedSentence(row);
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.reason);
  return corpusRecordFrom('id', { ...parsed.sentence, ...overrides });
}

// ── Alignment ───────────────────────────────────────────────────────────────

test('a gloss is only kept when the two lines line up', () => {
  const good = alignGloss(HUNGRY_BOY.kasem, HUNGRY_BOY.literal);
  assert.equal(good.ok, true);
  assert.deepEqual(good.gloss[0], { kasem: 'kana', english: 'hunger' });
  assert.deepEqual(good.gloss[3], { kasem: 'bakeira', english: 'boy' });
  assert.equal(good.gloss.length, 6);
});

test('a mismatched gloss is refused, and the refusal carries both counts', () => {
  const result = alignGloss(HUNGRY_BOY.kasem, 'hunger a has boy big');
  assert.equal(result.ok, false);
  // The member has to know which line to fix. "They do not line up" does not
  // tell them; "6 against 5" does.
  assert.match(result.reason, /6 Kasem words against 5 English/);
});

test('a hyphen joins two English words into one gloss cell', () => {
  // This is how a glosser keeps one Kasem token over one English cell, and
  // splitting on it would break every alignment that needed it.
  const result = alignGloss('bakeira kom', 'boy the-one');
  assert.equal(result.ok, true);
  assert.deepEqual(result.gloss[1], { kasem: 'kom', english: 'the-one' });
});

test('sentence punctuation does not become a token', () => {
  assert.deepEqual(glossTokens('kana mo jege ne.'), ['kana', 'mo', 'jege', 'ne']);
});

test('a natural sentence can be recorded with an unexplained particle', () => {
  const result = parseAttestedSentence({
    kasem: HUNGRY_ME.kasem,
    english: HUNGRY_ME.english,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.sentence.gloss, []);
});

test('unknown construction tags are dropped rather than stored', () => {
  assert.equal(canonicalConstruction('Word Order'), 'word-order');
  assert.equal(canonicalConstruction('focus'), 'focus');
  assert.equal(canonicalConstruction('vibes'), null);

  const parsed = parseAttestedSentence({ ...HUNGRY_BOY, constructions: ['focus', 'vibes'] });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.sentence.constructions, ['focus']);
});

// ── The three-way split of "how do you say X in Kasem?" ─────────────────────
//
// One phrasing, three answers, decided entirely by what X is. These tests
// exist because the split is the whole design and nothing in the type system
// enforces it: a question that falls down the gap between two extractors gets
// no briefing at all, and a model with no briefing answers from memory.

test('a clause reaches the corpus and a single word does not', () => {
  assert.equal(
    sentenceRequest('How do you say the big boy is hungry in Kasem?'),
    'the big boy is hungry',
  );
  assert.equal(sentenceRequest('How do you say water in Kasem?'), '');
});

test('a two-word phrase stays with the dictionary', () => {
  // "good morning" is a phrase a lexicon genuinely holds. Three tokens is the
  // boundary; length would have been the wrong measure, because "the big boy
  // is hungry" is twenty-one characters and unmistakably a sentence.
  assert.equal(sentenceRequest('What is the Kasem for good morning?'), '');
  assert.ok(translationTerms('What is the Kasem for good morning?').includes('good morning'));
});

test('a sentence request still lets the dictionary answer for its words', () => {
  // Deliberately NOT exclusive, unlike the dictionary/grammar split. A member
  // asking for a clause we do not hold is still owed the words we do hold.
  const asked = 'How do you say the big boy is hungry in Kasem?';
  assert.ok(sentenceRequest(asked));
  const terms = translationTerms(asked);
  assert.ok(terms.includes('boy'));
  assert.ok(terms.includes('hungry'));
});

test('a function word still reaches the grammar and not the corpus', () => {
  assert.deepEqual(grammarTerms('How do you say the in Kasem?'), ['the']);
  assert.equal(sentenceRequest('How do you say the in Kasem?'), '');
});

test('the bare fallback cannot swallow the question it was asked in', () => {
  // Run unconditionally, "X in Kasem" matches the tail of every phrasing above
  // it and returns "how do you say the big boy is hungry" — four tokens of
  // interrogative wrapping around the two that matter.
  const asked = 'How do you say the big boy is hungry in Kasem?';
  assert.equal(sentenceRequest(asked), 'the big boy is hungry');

  // And it still works when nothing else matched.
  assert.equal(sentenceRequest('the big boy is hungry in Kasem'), 'the big boy is hungry');
});

// ── Retrieval ───────────────────────────────────────────────────────────────

test('the sentence that was asked for is marked exact; a relative is not', () => {
  const records = [record(HUNGRY_BOY), record(HUNGRY_ME), record(BEAT_ME)];

  const [best] = matchCorpus(records, 'the big boy is hungry');
  assert.equal(best.exact, true);
  assert.equal(best.record.kasem, HUNGRY_BOY.kasem);

  // "the boy is hungry" is not recorded. It must retrieve the construction
  // without ever being reported as a translation of what was asked.
  const near = matchCorpus(records, 'the boy is hungry');
  assert.ok(near.length > 0);
  assert.equal(near.every((match) => !match.exact), true);
});

test('an unrelated question retrieves nothing rather than the nearest row', () => {
  const records = [record(HUNGRY_BOY), record(HUNGRY_ME), record(BEAT_ME)];
  assert.deepEqual(matchCorpus(records, 'where is the market'), []);
});

test('two equally relevant sentences are ordered by how many speakers confirmed', () => {
  const once = record(HUNGRY_ME, { confirmations: 1 });
  const thrice = record({ ...HUNGRY_ME, kasem: 'kana mo jege me' }, { confirmations: 3 });
  const [first] = matchCorpus([once, thrice], HUNGRY_ME.english);
  assert.equal(first.record.confirmations, 3);
});

test('overlap ignores the words that cannot tell two sentences apart', () => {
  assert.deepEqual(contentWords('the big boy is hungry').sort(), ['big', 'boy', 'hungry']);
  assert.equal(sentenceOverlap('i am hungry', 'the big boy is hungry') < 1, true);
  assert.equal(sentenceOverlap('he beat me', 'he beat me'), 1);
});

test('a row missing either side is not a record', () => {
  assert.equal(corpusRecordFrom('x', { kasem: 'kana mo jege ne' }), null);
  assert.equal(corpusRecordFrom('x', { english: 'i am hungry' }), null);
});

// ── The briefing, which is where the bug is actually fixed ──────────────────

test('a miss forbids assembling a sentence out of confirmed words', () => {
  const briefing = corpusBriefing('the big boy is hungry', []);
  assert.match(briefing, /holds NO attested Kasem sentence/);
  assert.match(briefing, /must not build one/i);
  // The specific trap: a DICTIONARY LOOKUP block sits directly above this one
  // with real words in it, and putting those words in English order is the
  // failure. The instruction has to name that, or it reads as a restatement of
  // "do not invent words" — which the model believes it is already obeying.
  assert.match(briefing, /DICTIONARY LOOKUP/);
  assert.match(briefing, /still a fabrication/);
});

test('a near miss is quoted but may not be adapted into the answer', () => {
  const records = [record(HUNGRY_BOY)];
  const briefing = corpusBriefing('the boy is hungry', matchCorpus(records, 'the boy is hungry'));
  assert.match(briefing, /does NOT hold it/);
  assert.match(briefing, /DO NOT adapt/);
  assert.match(briefing, /Related example, NOT a translation/);
});

test('an exact hit carries the word-for-word line, which is the teaching', () => {
  const records = [record(HUNGRY_BOY)];
  const briefing = corpusBriefing(
    'the big boy is hungry',
    matchCorpus(records, 'the big boy is hungry'),
  );
  assert.match(briefing, /kana mo jege bakeira kamunu kom/);
  assert.match(briefing, /hunger a has boy big the/);
  assert.match(briefing, /This is the sentence that was asked for/);
  assert.match(briefing, /Speaker's note/);
});

test('no sentence was asked for, so the prompt is charged nothing', () => {
  assert.equal(corpusBriefing('', []), '');
});

// ── Harvesting ──────────────────────────────────────────────────────────────

test('words the dictionary has never seen arrive with their meaning attached', () => {
  const parsed = parseAttestedSentence(HUNGRY_BOY);
  assert.equal(parsed.ok, true);

  const known = new Set(['kana', 'mo']);
  const found = unknownWords(parsed.sentence, known);
  const kasem = found.map((word) => word.kasem);

  assert.deepEqual(kasem, ['jege', 'bakeira', 'kamunu', 'kom']);
  // This is the payoff of having insisted on alignment: a word nobody has
  // contributed comes out of the gloss already glossed, and already reviewed
  // by whoever confirmed the sentence it sat in.
  assert.deepEqual(found[1], { kasem: 'bakeira', english: 'boy' });
});

test('a grammatical label in the gloss is not filed as a definition', () => {
  const parsed = parseAttestedSentence({
    kasem: 'o mage ne mo',
    english: 'he beat me',
    literal: 'he beat me FOC',
  });
  assert.equal(parsed.ok, true);

  const found = unknownWords(parsed.sentence, new Set());
  // FOC names a function, not a meaning. It belongs in a grammar rule; a
  // dictionary entry reading "mo — FOC" is one no reader could use.
  assert.equal(found.some((word) => word.kasem === 'mo'), false);
  assert.equal(found.some((word) => word.kasem === 'mage'), true);
});

test('the same word twice in one sentence is harvested once', () => {
  const parsed = parseAttestedSentence({
    kasem: 'ne jege ne',
    english: 'i have me',
    literal: 'me has me',
  });
  assert.equal(parsed.ok, true);
  const found = unknownWords(parsed.sentence, new Set());
  assert.equal(found.filter((word) => word.kasem === 'ne').length, 1);
});
