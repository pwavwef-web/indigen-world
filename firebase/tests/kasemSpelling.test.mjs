import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spellingKey, kasemTokens, spellingDistance, similarSpellings, replaceOccurrence } from '@indigen-world/contracts/kasem-spelling';
import { approvedSpellings, checkSpellings } from '../../services/functions/lib/kasem-spelling.js';

test('Unicode comparison preserves Kasem letters, tone and original UTF-16 offsets', () => {
  const text = '“Ɛ\u0301ŋɔ”, ɛ́ŋɔ! A’ŋa; a-ŋa. 42';
  const tokens = kasemTokens(text);
  assert.equal(tokens.length, 4);
  assert.equal(tokens[0].key, tokens[1].key);
  assert.equal(tokens[0].text, 'Ɛ\u0301ŋɔ');
  for (const token of tokens) assert.equal(text.slice(token.start, token.end), token.text);
  assert.notEqual(spellingKey('ɛ'), spellingKey('e'));
  assert.notEqual(spellingKey('ɔ'), spellingKey('o'));
  assert.notEqual(spellingKey('á'), spellingKey('a'));
  assert.equal(spellingKey('A’ŋa'), spellingKey("a'ŋa"));
});

test('only approved single-word entries and explicitly recorded forms can match', () => {
  const words = approvedSpellings('entry', { isPublished: true, lexicalKind: 'word', kasemText: 'Ɛ́ŋɔ', translations: ['Ni'], forms: { plural: 'Nia' }, kasemExample: 'Invented example only' });
  assert.deepEqual(checkSpellings(['ɛ\u0301ŋɔ', 'NI', 'Nia', 'other'], words, true).map(row => row.status), ['approved', 'approved', 'approved', 'missing']);
  assert.deepEqual(approvedSpellings('pending', { isPublished: false, kasemText: 'other' }), []);
  assert.deepEqual(approvedSpellings('phrase', { isPublished: true, lexicalKind: 'phrase', kasemText: 'Ni' }), []);
  assert.deepEqual(approvedSpellings('merged', { isPublished: true, mergedIntoId: 'another', kasemText: 'Ni' }), []);
  assert.equal(checkSpellings(['other'], words, false)[0].status, 'unknown');
});

test('suggestions use graphemes, rank transpositions and return approved rows only', () => {
  assert.equal(spellingDistance('ɛ\u0301ŋɔ', 'ɛ́ŋɔ'), 0);
  assert.equal(spellingDistance('á', 'a'), 1);
  assert.equal(spellingDistance('na', 'an'), 1);
  const approved = [{ id: 'a', word: 'Nia' }, { id: 'b', word: 'Ni' }, { id: 'same', word: 'NI' }, { id: 'far', word: 'Abcdefgh' }];
  const suggestions = similarSpellings('Nii', approved);
  assert.deepEqual(suggestions.map(row => row.word).sort(), ['Ni', 'Nia']);
  assert.ok(suggestions.every(row => approved.some(entry => entry.id === row.id && entry.word === row.word)));
});

test('replacement changes only the selected occurrence and rejects stale offsets', () => {
  const text = '“Nii,” Nii!\nƐ\u0301ŋɔ.';
  assert.equal(replaceOccurrence(text, kasemTokens(text)[1], 'Ni'), '“Nii,” Ni!\nƐ\u0301ŋɔ.');
  assert.equal(replaceOccurrence('changed ' + text, kasemTokens(text)[1], 'Ni'), null);
  assert.equal(replaceOccurrence(text, kasemTokens(text)[2], 'ɔ'), '“Nii,” Nii!\nɔ.');
});
