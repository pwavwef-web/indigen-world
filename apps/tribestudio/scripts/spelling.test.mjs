import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { spellingKey } from '@indigen-world/contracts/kasem-spelling';
const source = readFileSync(new URL('../src/spelling/lookup-cache.ts', import.meta.url), 'utf8');
const { code } = await transformWithOxc(source, 'lookup-cache.ts');
const createSpellingLookup = new Function('spellingKey', code.replace(/^import[^\n]+\n/gm, '').replace(/export /g, '') + ';return createSpellingLookup')(spellingKey);

test('lookups coalesce across fields, normalize Unicode and cache successful results', async () => {
  const calls = []; let time = 0;
  const client = createSpellingLookup(async words => {
    calls.push(words); return words.map(key => ({ key, status: 'approved', suggestions: [] }));
  }, () => time);
  const [a, b] = await Promise.all([client.lookup(['Ɛ\u0301', 'ni']), client.lookup(['ɛ́', 'NI'])]);
  assert.equal(calls.length, 1); assert.equal(calls[0].length, 2); assert.deepEqual(a, b);
  await client.lookup(['NI']); assert.equal(calls.length, 1);
  time = 61_000; await client.lookup(['NI']); assert.equal(calls.length, 2);
});

test('failures, partial replies and unknowns never become missing or poison the cache', async () => {
  let calls = 0;
  const client = createSpellingLookup(async words => {
    if (++calls === 1) throw Error('offline');
    if (calls === 2) return [];
    return words.map(key => ({ key, status: 'missing', suggestions: [] }));
  });
  assert.equal((await client.lookup(['Ni']))[0].status, 'unknown');
  assert.equal((await client.lookup(['Ni']))[0].status, 'unknown');
  assert.equal((await client.lookup(['Ni']))[0].status, 'missing');
  assert.equal(calls, 3);
});

test('long text is served in bounded batches and missing results expire quickly', async () => {
  const calls = []; let time = 0;
  const client = createSpellingLookup(async words => { calls.push(words); return words.map(key => ({ key, status: 'missing', suggestions: [] })); }, () => time);
  const words = Array.from({ length: 170 }, (_, index) => `word${index}`);
  assert.equal((await client.lookup(words)).length, 170);
  assert.deepEqual(calls.map(words => words.length), [80, 80, 10]);
  time = 16_000; await client.lookup([words[0]]); assert.equal(calls.length, 4);
});

test('legacy individual-word requests retain their 100-character bound while phrase assistance permits 160', async () => {
  const calls = [];
  const call = async words => { calls.push(words); return words.map(key => ({ key, status: 'review', suggestions: [] })); };
  const legacy = createSpellingLookup(call), phrases = createSpellingLookup(call, Date.now, 160);
  await legacy.lookup(['Ni', 'a'.repeat(120)]);
  assert.deepEqual(calls[0], ['ni'], 'oversized words cannot poison a legacy batch');
  assert.equal((await phrases.lookup(['a'.repeat(120)]))[0].status, 'review');
  assert.equal(calls[1][0].length, 120);
});
