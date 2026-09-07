// The several things one word means — the server half.
//
// These test the boundary rather than the getters. `parseSenses` runs in the
// contribution callable, in the publication projection and in the review desk's
// projection, so a parser that threw on junk in the last of those would fail a
// re-publish for data that was accepted months earlier.

import assert from 'node:assert/strict';
import test from 'node:test';

const {
  MAX_SENSES,
  SENSE_DOMAINS,
  SENSE_REGISTERS,
  hasSenses,
  parseSenses,
  sensesAddDetail,
  sensesOrLegacy,
  sensesToTranslations,
  storableSenses,
} = await import('../../services/functions/lib/lexical-senses.js');

test('a sense without a definition is dropped, never kept as a blank row', () => {
  // A sense IS its definition. An entry rendering "2." with nothing after it
  // is worse than an entry with one sense.
  assert.deepEqual(parseSenses([{}, { definition: '   ' }, { definition: null }]), []);
  assert.deepEqual(parseSenses(null), []);
  assert.deepEqual(parseSenses('water'), []);
  assert.deepEqual(parseSenses([42, null, 'water']), []);
});

test('the same definition twice is one sense', () => {
  // "1. water 2. water" tells a learner there is a distinction to find and
  // then does not show it.
  const senses = parseSenses([
    { definition: 'water' },
    { definition: 'Water' },
    { definition: 'rain' },
  ]);
  assert.equal(senses.length, 2);
  assert.deepEqual(senses.map((s) => s.definition), ['water', 'rain']);
});

test('an unknown register or domain is dropped rather than stored', () => {
  // A closed list that quietly accepts anything is a free-text field wearing a
  // dropdown's clothes, and the browse-by-subject query it exists for stops
  // working the first time somebody sends "farm".
  const [sense] = parseSenses([
    { definition: 'water', register: 'sarcastic', domain: 'cryptocurrency' },
  ]);
  assert.equal(sense.register, '');
  assert.equal(sense.domain, '');

  const [known] = parseSenses([
    { definition: 'water', register: 'AVOIDED', domain: ' farming ' },
  ]);
  assert.equal(known.register, 'avoided');
  assert.equal(known.domain, 'farming');
});

test('an unknown word class on a sense is dropped, a known one canonicalised', () => {
  const [bad] = parseSenses([{ definition: 'water', partOfSpeech: 'wibble' }]);
  assert.equal(bad.partOfSpeech, '');
  const [good] = parseSenses([{ definition: 'to water', partOfSpeech: 'Verb' }]);
  assert.equal(good.partOfSpeech, 'verb');
});

test('an example needs one half, not both', () => {
  const [sense] = parseSenses([
    {
      definition: 'water',
      examples: [
        { kasem: 'Nia pe yogo.', english: 'The water is cold.' },
        { kasem: 'Nia to.' },
        { english: 'Only the English survived review.' },
        { kasem: '', english: '' },
        'a bare string is not an object here',
      ],
    },
  ]);
  assert.equal(sense.examples.length, 3);
  assert.equal(sense.examples[1].english, '');
  assert.equal(sense.examples[2].kasem, '');
});

test('cross-references accept a string or a list and are de-duplicated', () => {
  const [fromString] = parseSenses([{ definition: 'water', synonyms: 'nia, nyu, Nia' }]);
  assert.deepEqual(fromString.synonyms, ['nia', 'nyu']);
  const [fromList] = parseSenses([{ definition: 'water', antonyms: ['bo', 'bo', 'ka'] }]);
  assert.deepEqual(fromList.antonyms, ['bo', 'ka']);
});

test('the sense list is capped', () => {
  const many = Array.from({ length: MAX_SENSES + 6 }, (_, i) => ({ definition: `meaning ${i}` }));
  assert.equal(parseSenses(many).length, MAX_SENSES);
});

test('storable senses carry no empty keys', () => {
  // Nine keys of which the median sense fills two would put seven empty
  // strings on every row, and make "nobody has said" indistinguishable from
  // "somebody said nothing" — which is the distinction the record turns on.
  const [stored] = storableSenses(parseSenses([{ definition: 'water', register: 'everyday' }]));
  assert.deepEqual(Object.keys(stored).sort(), ['definition', 'register']);
});

test('the flat English projection is derived, never asked for twice', () => {
  const senses = parseSenses([
    { definition: 'plaything' },
    { definition: 'trinket' },
    { definition: 'small breed of dog' },
  ]);
  assert.deepEqual(sensesToTranslations(senses), [
    'plaything',
    'trinket',
    'small breed of dog',
  ]);
});

test('a legacy contribution lifts into exactly one sense', () => {
  // Nothing is migrated: the lift happens on read, which is why an entry
  // approved last year still publishes byte-for-byte as it did.
  const lifted = sensesOrLegacy({
    senses: [],
    translations: ['water', 'rain water'],
    kasemExample: 'Nia pe yogo.',
    englishExample: 'The water is cold.',
    kasemDefinition: 'Nia yi...',
  });
  assert.equal(lifted.length, 1);
  assert.equal(lifted[0].definition, 'water, rain water');
  assert.equal(lifted[0].kasemDefinition, 'Nia yi...');
  assert.deepEqual(lifted[0].examples, [
    { kasem: 'Nia pe yogo.', english: 'The water is cold.' },
  ]);
});

test('a legacy contribution with no meaning lifts into nothing', () => {
  assert.deepEqual(sensesOrLegacy({ senses: [], translations: [] }), []);
});

test('real senses are never overwritten by the legacy lift', () => {
  const real = parseSenses([{ definition: 'plaything' }, { definition: 'trinket' }]);
  const result = sensesOrLegacy({ senses: real, translations: ['ignored'] });
  assert.deepEqual(result, real);
});

test('a single bare sense is not worth storing', () => {
  // It says exactly what `englishText` already says, and storing it would put
  // an array on fifteen thousand rows to repeat one string.
  assert.equal(sensesAddDetail(parseSenses([{ definition: 'water' }])), false);
  assert.equal(sensesAddDetail([]), false);
  assert.equal(
    sensesAddDetail(parseSenses([{ definition: 'water' }, { definition: 'rain' }])),
    true,
  );
  assert.equal(
    sensesAddDetail(parseSenses([{ definition: 'water', domain: 'weather' }])),
    true,
  );
  assert.equal(
    sensesAddDetail(
      parseSenses([{ definition: 'water', examples: [{ kasem: 'Nia to.' }] }]),
    ),
    true,
  );
});

test('hasSenses is about presence, not about detail', () => {
  assert.equal(hasSenses(parseSenses([{ definition: 'water' }])), true);
  assert.equal(hasSenses([]), false);
});

test('the register and domain lists have unique ids and real labels', () => {
  for (const list of [SENSE_REGISTERS, SENSE_DOMAINS]) {
    const ids = list.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
    for (const entry of list) {
      assert.ok(entry.id && entry.label, `${entry.id} has a label`);
      assert.equal(entry.id, entry.id.toLowerCase(), 'ids are lowercase');
    }
  }
});

test('over-long prose is truncated rather than rejected', () => {
  // Failing the whole submission over one long field costs a member on a
  // metered connection their entire contribution, including the good senses
  // beside it.
  const [sense] = parseSenses([
    { definition: 'x'.repeat(900), usageNote: 'y'.repeat(2000) },
  ]);
  assert.equal(sense.definition.length, 300);
  assert.equal(sense.usageNote.length, 600);
});
