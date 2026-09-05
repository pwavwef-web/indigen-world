// Two different words spelled the same way.
//
//   npm run build:functions && node --test firebase/tests/kasemHomographs.test.mjs
//
// The property under test is stability, and it is worth saying plainly what
// breaks without it. A homograph number is a citation: a learner writes `mo²`
// in their notes, a member shares an entry, Kawuri quotes a sense in an answer
// somebody screenshots. If publishing a third `mo` can renumber the first two,
// every one of those citations silently starts pointing at a different word —
// and nothing anywhere reports it, because both the old number and the new one
// are perfectly valid numbers.
//
// So most of what follows is the same assertion from different angles: once a
// number is handed out, nothing takes it back.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_HOMOGRAPH_INDEX,
  assignHomographIndex,
  countByHeadword,
  headwordKey,
  homographDisplay,
  shouldNumber,
  superscript,
} from '../../services/functions/lib/kasem-homographs.js';

/** A peer row, in the shape `creators.ts` builds from a Firestore document. */
function peer(id, kasem, homographIndex) {
  return { id, kasem, homographIndex };
}

test('superscript digits are the real characters, not arithmetic on a code point', () => {
  // The obvious implementation is 0x2070 + digit, and it is wrong for exactly
  // one, two and three — U+2071 is a modifier letter I and U+2072 is reserved.
  assert.equal(superscript(1), '¹');
  assert.equal(superscript(2), '²');
  assert.equal(superscript(3), '³');
  assert.equal(superscript(4), '⁴');
  assert.equal(superscript(9), '⁹');
  // Past nine it composes rather than falling over.
  assert.equal(superscript(10), '¹⁰');
  assert.equal(superscript(12), '¹²');
  assert.equal(superscript(99), '⁹⁹');
});

test('superscript refuses nonsense rather than rendering it', () => {
  assert.equal(superscript(-1), '');
  assert.equal(superscript(NaN), '');
  assert.equal(superscript(Infinity), '');
});

test('a headword key folds case and spacing and nothing else', () => {
  assert.equal(headwordKey('Mo'), 'mo');
  assert.equal(headwordKey('  kana   mo '), 'kana mo');
  assert.equal(headwordKey(null), '');
  assert.equal(headwordKey(42), '');
});

test('a diacritic is never folded away', () => {
  // Kasem is tonal. A mark is frequently the ONLY thing separating two words,
  // so folding it would merge exactly the pairs this module exists to keep
  // apart — and it would do it silently, which is the worst version.
  assert.notEqual(headwordKey('nia'), headwordKey('niá'));
  assert.notEqual(headwordKey('ko'), headwordKey('kɔ'));
});

test('the first entry under a spelling is numbered one', () => {
  assert.equal(assignHomographIndex('entry-a', []), 1);
});

test('a new sense takes the next number', () => {
  const peers = [peer('entry-a', 'mo', 1)];
  assert.equal(assignHomographIndex('entry-b', peers), 2);
});

test('re-publishing an entry keeps the number it already had', () => {
  // This is the one that matters most in practice. A reviewer fixing a typo in
  // an example sentence re-runs publication, which re-runs assignment. If that
  // handed out a fresh number, every correction would move the word.
  const peers = [peer('entry-a', 'mo', 1), peer('entry-b', 'mo', 2)];
  assert.equal(assignHomographIndex('entry-a', peers), 1);
  assert.equal(assignHomographIndex('entry-b', peers), 2);
});

test('a withdrawn number is never handed out again', () => {
  // `mo²` has been unpublished. Its row is still in the collection and still
  // carries its 2, so the next `mo` gets 3 and the numbering reads 1, 3.
  //
  // The gap is the correct answer, not a defect. Closing it would mean reusing
  // `mo²` for a different word, which points every existing citation of `mo²`
  // at something it never meant. A visible gap is cheap; a silently rehomed
  // citation is not.
  const peers = [peer('entry-a', 'mo', 1), peer('withdrawn', 'mo', 2)];
  assert.equal(assignHomographIndex('entry-c', peers), 3);
});

test('numbering is stable no matter what order the peers arrive in', () => {
  // Firestore does not promise query result order without an orderBy, so the
  // assignment must not depend on it.
  const forwards = [peer('a', 'mo', 1), peer('b', 'mo', 2), peer('c', 'mo', 3)];
  const backwards = [...forwards].reverse();
  assert.equal(assignHomographIndex('d', forwards), 4);
  assert.equal(assignHomographIndex('d', backwards), 4);
  assert.equal(assignHomographIndex('b', backwards), 2);
});

test('an unnumbered legacy peer does not stop a number being issued', () => {
  // Rows published before this module existed carry no index until
  // `backfill-homographs.mjs` reaches them. A new sense arriving first must
  // still get a usable number rather than colliding on zero.
  const peers = [peer('legacy', 'mo', 0)];
  assert.equal(assignHomographIndex('fresh', peers), 1);
});

test('a legacy entry being republished is treated as new, not as zero', () => {
  const peers = [peer('legacy', 'mo', 0), peer('other', 'mo', 1)];
  assert.equal(assignHomographIndex('legacy', peers), 2);
});

test('the index is capped rather than growing without bound', () => {
  const peers = [peer('a', 'mo', MAX_HOMOGRAPH_INDEX)];
  assert.equal(assignHomographIndex('b', peers), MAX_HOMOGRAPH_INDEX);
});

test('a word alone under its spelling shows no number at all', () => {
  // A solitary `mo¹` promises a `mo²` that does not exist, and a reader who
  // goes looking for it has been misled by a footnote.
  assert.equal(shouldNumber(1, 1), false);
  const display = homographDisplay('mo', 1, 1);
  assert.equal(display.text, 'mo');
  assert.equal(display.spoken, 'mo');
  assert.equal(display.numbered, false);
});

test('the first entry starts showing its number the day a second arrives', () => {
  // Nothing rewrote the document. The index was always 1; only the sibling
  // count changed, and the sibling count is derived per render. This is the
  // whole reason the design is half-stored and half-derived.
  const alone = homographDisplay('mo', 1, 1);
  const joined = homographDisplay('mo', 1, 2);
  assert.equal(alone.text, 'mo');
  assert.equal(joined.text, 'mo¹');
});

test('a numbered headword reads aloud unambiguously', () => {
  // A superscript two is announced as anything from "two" to nothing at all
  // depending on the screen reader, and "mo two" is indistinguishable from a
  // quantity. The spoken form is stated rather than inferred by the renderer.
  const display = homographDisplay('mo', 2, 2);
  assert.equal(display.text, 'mo²');
  assert.equal(display.spoken, 'mo, sense 2');
  assert.equal(display.numbered, true);
});

test('an entry with no index never renders a number, whatever its siblings', () => {
  // A legacy row the backfill has not reached yet. Rendering `mo⁰` or a bare
  // superscript would be worse than showing the plain headword.
  assert.equal(shouldNumber(3, 0), false);
  assert.equal(homographDisplay('mo', 0, 3).text, 'mo');
});

test('headwords are counted under the same folding they are numbered under', () => {
  const counts = countByHeadword([
    { kasem: 'mo' },
    { kasem: 'Mo' },
    { kasem: ' mo ' },
    { kasem: 'kana' },
    { kasem: '' },
  ]);
  assert.equal(counts.get('mo'), 3);
  assert.equal(counts.get('kana'), 1);
  assert.equal(counts.has(''), false);
});

test('the worked example: two senses of mo', () => {
  // The case that prompted all of this. `mo` after a noun and `mo` marking
  // focus are, on the reading currently being checked with speakers, two words.
  const first = { id: 'collection_a', kasem: 'mo', homographIndex: 0 };
  first.homographIndex = assignHomographIndex(first.id, []);

  // Published alone, it is just `mo`.
  assert.equal(homographDisplay(first.kasem, first.homographIndex, 1).text, 'mo');

  const second = { id: 'collection_b', kasem: 'mo', homographIndex: 0 };
  second.homographIndex = assignHomographIndex(second.id, [first]);

  const counts = countByHeadword([first, second]);
  const siblings = counts.get(headwordKey('mo'));
  assert.equal(siblings, 2);
  assert.equal(homographDisplay(first.kasem, first.homographIndex, siblings).text, 'mo¹');
  assert.equal(homographDisplay(second.kasem, second.homographIndex, siblings).text, 'mo²');

  // And the first one's number never moved to get there.
  assert.equal(first.homographIndex, 1);
});
