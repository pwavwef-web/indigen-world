import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { toneKey, missingToneMatch, dictionarySpans, reviewedSpans, rebaseDecisions } from '@indigen-world/contracts/dictionary-assistance';
import { kasemTokens, replaceOccurrence } from '@indigen-world/contracts/kasem-spelling';
import { dictionaryCandidates, createDictionaryIndex, dictionaryMatches, sourceRecommendations } from '../../services/functions/lib/dictionary-assistance.js';
import { parseExpressionAnswer } from '../../services/functions/lib/contributor-portal.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/translation-dictionary.json', import.meta.url)));
const candidates = fixture.entries.flatMap(({ id, ...entry }) => dictionaryCandidates(id, entry));
const index = createDictionaryIndex(candidates);

test('actual dictionary: single tonal equivalent and all ambiguous forms retain record IDs and meanings', () => {
  const [single, multiple, marked, absent] = dictionaryMatches(['deem', 'vei', 'véi', 'not-a-dictionary-fixture'], index, true);
  assert.equal(single.status, 'review'); assert.deepEqual(single.suggestions.map(e => e.word), ['deém']);
  assert.equal(multiple.status, 'review');
  assert.deepEqual(new Set(multiple.suggestions.map(e => e.word)), new Set(['vei', 'véi', 'vèi']));
  assert.equal(multiple.suggestions.filter(e => e.word === 'vei').length, 2, 'same spelling with distinct recorded meanings stays distinct');
  assert.ok(multiple.suggestions.every(e => fixture.entries.some(row => row.id === e.id) && e.meaning && e.publicationLabel));
  assert.equal(marked.status, 'approved'); assert.equal(marked.suggestions.length, 0);
  assert.equal(absent.status, 'missing'); assert.equal(dictionaryMatches(['newword'], index, false)[0].status, 'unknown');
});
test('comparison removes only configured acute/grave; NFC, nasalization and vowel distinctions survive', () => {
  assert.equal(toneKey('véi'), toneKey('ve\u0301i'));
  for (const [a, b] of [['ɛ', 'e'], ['ɔ', 'o'], ['ã', 'a'], ['ā', 'a'], ['ä', 'a']]) assert.notEqual(toneKey(a), toneKey(b));
  assert.equal(missingToneMatch('vèi', 'véi'), false, 'never change an existing tone');
  assert.equal(missingToneMatch('deem', 'deém'), true);
  // Synthetic Unicode stress strings, not Kasem vocabulary.
  assert.equal(missingToneMatch('a\u0303', 'a\u0303\u0301'), true);
  const text = '“vei,” vei! a\u0303.';
  assert.equal(replaceOccurrence(text, kasemTokens(text)[1], 'vèi'), '“vei,” vèi! a\u0303.');
  assert.equal(replaceOccurrence(text, kasemTokens(text)[2], 'a\u0303\u0301'), '“vei,” vei! a\u0303\u0301.');
  assert.equal(replaceOccurrence('changed ' + text, kasemTokens(text)[1], 'vèi'), null);
});
test('actual source matches whole English senses and conservative inflections, not superficial substrings', () => {
  const entries = sourceRecommendations('The boy is going home.', candidates);
  assert.ok(entries.some(e => e.word === 'Bakeira'));
  assert.ok(entries.some(e => e.word === 'sɔŋɔ'));
  assert.ok(entries.some(e => e.word === 'véi'));
  assert.equal(sourceRecommendations('The goat likes homeopathy.', candidates).length, 0);
  assert.equal(sourceRecommendations('The bulb.', candidates)[0].word, 'ampʋlɩ bu');
  assert.ok(sourceRecommendations('The boy.', candidates).every(e => e.word === 'Bakeira'), 'sentence changes produce fresh matches');
});
test('published record forms, meanings, pronunciation and scope are reused, unapproved entries never leak', () => {
  const data = { isPublished: true, kasemText: 'véi', englishText: 'go', senses: [{ definition: 'imperative' }], partOfSpeech: 'verb', ipa: 'source IPA', audioUrl: 'https://example.org/recording.wav', forms: { past: 'vèi' } };
  const entries = dictionaryCandidates('test', data);
  assert.equal(entries[0].audioUrl, data.audioUrl); assert.equal(entries[1].audioUrl, '');
  assert.match(entries[0].meaning, /imperative/); assert.equal(entries[0].ipa, 'source IPA');
  assert.equal(entries[0].verified, false, 'publication alone does not invent reviewer verification');
  assert.equal(dictionaryCandidates('test', { ...data, approvedBy: 'reviewer' })[0].verified, true);
  assert.equal(dictionaryCandidates('test', { ...data, publicationMode: 'owner-direct-source' })[0].publicationLabel, 'Published source record');
  for (const patch of [{ isPublished: false }, { mergedIntoId: 'other' }, { lexicalKind: 'sentence' }, { culturalPermissionTier: 'restricted' }]) assert.deepEqual(dictionaryCandidates('test', { ...data, ...patch }), []);
});
test('actual phrases match without splitting at punctuation, retain offsets and cover their constituent words', () => {
  const text = '“ampʋlɩ  bu,” vei.';
  const spans = dictionarySpans(text);
  const result = dictionaryMatches(spans.map(t => t.key), index, true);
  const reviewed = reviewedSpans(text, result);
  assert.equal(reviewed[0].text, 'ampʋlɩ  bu'); assert.equal(reviewed[0].result.status, 'approved');
  assert.equal(text.slice(reviewed[0].start, reviewed[0].end), 'ampʋlɩ  bu');
  assert.equal(dictionarySpans('ampʋlɩ, bu').some(t => t.text === 'ampʋlɩ, bu'), false);
});
test('dismissal and accepted occurrence follow unrelated edits without suppressing identical words', () => {
  const text = 'vei vei!', first = kasemTokens(text)[0];
  const kept = rebaseDecisions(text, 'x ' + text, [first]);
  assert.equal(kept.length, 1); assert.equal(kept[0].start, 2);
  assert.equal(kept.some(t => t.start === 6), false);
  assert.deepEqual(rebaseDecisions(text, 'vèi vei!', [first]), [], 'editing the reviewed occurrence invalidates its decision');
});
test('submission parser preserves exact Unicode and surrounding whitespace; dictionary gaps never block it', () => {
  const translation = '  vei, dee\u0301m!\nNewWord\u0303  ';
  const parsed = parseExpressionAnswer({ translation, alternatives: [], context: '' });
  assert.equal(parsed.translation, translation);
  assert.equal(parsed.translation.normalize('NFC') === parsed.translation, false);
});
test('indexed term matching remains lightweight at the bounded archive size', () => {
  const large = createDictionaryIndex(Array.from({ length: 25000 }, (_, i) => ({ ...candidates[0], id: `stress-${i}`, word: `entry${i}` })));
  const start = performance.now();
  for (let i = 0; i < 200; i++) dictionaryMatches(Array.from({ length: 80 }, (_, n) => `entry${n}`), large, true);
  assert.ok(performance.now() - start < 3000, '16,000 indexed lookups within a generous CI bound');
});
