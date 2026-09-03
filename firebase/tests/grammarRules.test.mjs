// Pure unit tests for the grammar notes Kawuri answers function words from.
//
//   npm run build:functions && node --test firebase/tests/grammarRules.test.mjs
//
// The seam being tested is easy to state and easy to break: the dictionary
// throws away exactly the words the grammar exists to answer. `the`, `a`,
// `of`, `to`, `in`, `and`, `is` are stop words in kawuri-dictionary.ts — quite
// correctly, they carry no meaning to look up — and the result was that "how do
// you say the in Kasem" produced no briefing at all and a model with no
// briefing answers from memory. That is the failure this module prevents, and
// the tests below are mostly about making sure the two halves keep dividing
// the question space between them exactly, with no word falling down the gap.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  grammarTerms,
  translationTerms,
} from '../../services/functions/lib/kawuri-dictionary.js';

import {
  grammarBriefing,
  grammarRecordFrom,
  matchGrammar,
} from '../../services/functions/lib/kawuri-grammar.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const seed = JSON.parse(
  readFileSync(join(root, 'data', 'grammar-seed', 'grammar-rules.json'), 'utf8'),
);

/** A published rule, in the shape seed-grammar.mjs writes. */
function rule(overrides = {}) {
  return grammarRecordFrom('definiteness', {
    topic: 'definiteness',
    title: 'Saying "the" — it is part of the noun',
    summary: 'There is no Kasem word for "the". Definiteness is marked on the noun itself.',
    pattern: '<noun in its definite form>',
    englishTriggers: ['the'],
    examples: [],
    nounClasses: [],
    ...overrides,
  });
}

// ── The seam: every function word reaches exactly one of the two lookups ────

test('the words the dictionary discards are the ones the grammar keeps', () => {
  for (const word of ['the', 'a', 'of', 'to', 'in', 'and', 'is']) {
    const question = `How do you say ${word} in Kasem?`;
    // The dictionary correctly finds nothing to look up...
    assert.deepEqual(translationTerms(question), [], `dictionary took "${word}"`);
    // ...and the grammar picks it up instead. Before this module, both were
    // empty and the question reached the model with no briefing at all.
    assert.deepEqual(grammarTerms(question), [word], `grammar missed "${word}"`);
  }
});

test('a real word still goes to the dictionary and not to the grammar', () => {
  const question = 'How do you say water in Kasem?';
  assert.deepEqual(translationTerms(question), ['water']);
  assert.deepEqual(grammarTerms(question), []);
});

test('the article is not stripped off the very word being asked about', () => {
  // kawuri-dictionary's extractor strips a leading "the" as filler, which is
  // right for "the Kasem word for water" and fatal when the term IS "the".
  assert.deepEqual(grammarTerms('What is the Kasem word for "the"?'), ['the']);
  assert.deepEqual(grammarTerms('what does "of" mean'), ['of']);
});

test('a question about nothing in particular costs neither lookup anything', () => {
  for (const question of ['', '   ', 'Hello', 'Tell me about Kassena history']) {
    assert.deepEqual(grammarTerms(question), []);
    assert.deepEqual(translationTerms(question), []);
  }
});

// ── Matching ────────────────────────────────────────────────────────────────

test('a rule is found by the words it was written to answer', () => {
  const records = [rule()];
  assert.equal(matchGrammar(records, ['the'])[0]?.id, 'definiteness');
  assert.equal(matchGrammar(records, ['THE'])[0]?.id, 'definiteness');
  assert.deepEqual(matchGrammar(records, ['water']), []);
  assert.deepEqual(matchGrammar(records, []), []);
});

test('a rule is matched on its trigger list, not on its prose', () => {
  // The summary contains the word "noun". A rule that answered every question
  // mentioning a word in its own explanation would answer most questions.
  assert.deepEqual(matchGrammar([rule()], ['noun']), []);
});

test('the term the member led with is the rule that leads the answer', () => {
  const indefinite = rule({ topic: 'indefiniteness', englishTriggers: ['a', 'an'] });
  const matched = matchGrammar([rule(), indefinite], ['a', 'the']);
  assert.equal(matched[0].topic, 'indefiniteness');
  assert.equal(matched[1].topic, 'definiteness');
});

// ── What may be quoted ──────────────────────────────────────────────────────

test('a draft with nothing written in it is not a rule anybody can be told', () => {
  // Several seeded rows exist only to carry the triggers that take an
  // unanswerable word out of the word queue. Quoting one would put a blank
  // answer in front of a member as though it were an answer.
  assert.equal(grammarRecordFrom('prepositions', { topic: 'preposition', summary: '' }), null);
  assert.equal(grammarRecordFrom('prepositions', { topic: 'preposition' }), null);
});

test('a miss says so, loudly, instead of leaving the model to fill the silence', () => {
  const briefing = grammarBriefing(['of'], []);
  assert.match(briefing, /NO rule/);
  assert.match(briefing, /not written this rule down yet/);
  // The instruction that does the actual work.
  assert.match(briefing, /Do not describe Kasem grammar from your own memory/);
  assert.equal(grammarBriefing([], []), '');
});

test('a hit quotes the rule and forbids extending it', () => {
  const briefing = grammarBriefing(['the'], [rule()]);
  assert.match(briefing, /There is no Kasem word for "the"/);
  assert.match(briefing, /<noun in its definite form>/);
  assert.match(briefing, /not a separate word in Kasem/);
  assert.match(briefing, /do not illustrate it with a Kasem word that is not printed above/);
});

test('an empty class inventory is reported as unrecorded, not omitted', () => {
  // The classes are being collected from contributed definite forms. A blank
  // where a marker should be is the honest state; a plausible marker is not.
  const withClasses = rule({
    topic: 'noun-class',
    nounClasses: [{ id: 'class-1', definiteMarker: '', pluralMarker: '' }],
  });
  assert.match(grammarBriefing(['the'], [withClasses]), /Class class-1: definite \(not recorded\)/);
});

// ── The seed file itself ────────────────────────────────────────────────────

test('the seeded rules cover the seven words at the head of the queue', () => {
  // Ranks 1-7 of wordQueue. Every one must be claimed by some rule, or it stays
  // in front of members as a question with no answer.
  const claimed = new Set(seed.flatMap((row) => row.englishTriggers ?? []));
  for (const word of ['the', 'of', 'to', 'and', 'a', 'in', 'is']) {
    assert.ok(claimed.has(word), `nothing claims "${word}"`);
  }
});

test('no two rules claim the same English word', () => {
  // retire-grammar-words.mjs throws on this, so catching it here means the
  // failure lands in CI rather than halfway through a production run.
  const seen = new Set();
  for (const row of seed) {
    for (const trigger of row.englishTriggers ?? []) {
      assert.equal(seen.has(trigger), false, `"${trigger}" is claimed twice`);
      seen.add(trigger);
    }
  }
});

test('a published rule always says something; a draft need not', () => {
  for (const row of seed) {
    if (row.status === 'published') {
      assert.ok(row.summary.trim().length > 0, `${row.id} is published and empty`);
    }
  }
  // And the ones that are empty are honestly marked as drafts rather than
  // shipped as published blanks.
  const empty = seed.filter((row) => !row.summary.trim());
  for (const row of empty) assert.equal(row.status, 'draft', `${row.id} is an empty non-draft`);
});
