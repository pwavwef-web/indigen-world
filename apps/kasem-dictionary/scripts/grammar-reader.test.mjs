import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dictionaryGuideLayout } from '../../../scripts/dictionary-guide-layout.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const original = read('../../tribestudio/public/grammar-guide.html');
const generated = read('../public/grammar-guide.html');
const chapters = JSON.parse(read('../../../data/grammar-book-seed/book.json')).chapters;

test('reader layout preserves every source table, chapter, rule and figure', () => {
  for (const pattern of [/<table>[\s\S]*?<\/table>/g, /<details[^>]*>[\s\S]*?<\/details>/g, /<figure[^>]*>[\s\S]*?<\/figure>/g]) {
    assert.deepEqual(generated.match(pattern), original.match(pattern));
  }
  assert.deepEqual([...generated.matchAll(/id="block-(\d+)"/g)].map(m => m[1]), [...original.matchAll(/id="block-(\d+)"/g)].map(m => m[1]));
});

test('regeneration retains the reader without altering the other apps', () => {
  assert.equal(dictionaryGuideLayout(original, chapters), generated);
  assert.equal(original.includes('grammar-reader.js'), false);
});
