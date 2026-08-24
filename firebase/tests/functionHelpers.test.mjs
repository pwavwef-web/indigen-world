// Pure unit tests for backend helpers — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/functionHelpers.test.mjs
//
// These four functions decide who gets notified, which publication route a
// submission takes, and what reaches the model. All of them are quiet failure
// modes: a mention parser that misses a handle silently drops somebody's alert,
// and a campaign check that reads the wrong shape silently publishes a
// reviewed entry without review.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mentionedHandles } from '../../services/functions/lib/community-notifications.js';
import { isCampaignSubmission } from '../../services/functions/lib/open-publishing.js';
import { normaliseTurns, replyFromGemini, vertexEndpoint } from '../../services/functions/lib/kawuri.js';

// ── Mentions ────────────────────────────────────────────────────────────────

test('mentionedHandles finds handles wherever they sit in a post', () => {
  assert.deepEqual(mentionedHandles('@amina_paga de zaanem'), ['amina_paga']);
  assert.deepEqual(mentionedHandles('ko gara @nyaaba'), ['nyaaba']);
  assert.deepEqual(mentionedHandles('(@nyaaba) said so'), ['nyaaba']);
  assert.deepEqual(mentionedHandles('@amina and @nyaaba'), ['amina', 'nyaaba']);
});

test('mentionedHandles lowercases and de-duplicates', () => {
  // The username registry is keyed by the lowercase handle, and one post must
  // never notify the same person twice.
  assert.deepEqual(mentionedHandles('@Amina @amina @AMINA'), ['amina']);
});

test('mentionedHandles ignores things that only look like handles', () => {
  assert.deepEqual(mentionedHandles('write to me@example.com'), []);
  assert.deepEqual(mentionedHandles('@ab is too short'), []);
  assert.deepEqual(mentionedHandles('email a@b.c'), []);
  assert.deepEqual(mentionedHandles(''), []);
  assert.deepEqual(mentionedHandles(null), []);
  assert.deepEqual(mentionedHandles(42), []);
});

test('mentionedHandles caps how many people one post can alert', () => {
  // Otherwise a single post is a broadcast weapon.
  const text = Array.from({ length: 40 }, (_, i) => `@member${String(i).padStart(2, '0')}`).join(' ');
  assert.equal(mentionedHandles(text).length, 10);
});

// ── Publication route ───────────────────────────────────────────────────────

test('isCampaignSubmission recognises a real campaign', () => {
  assert.equal(
    isCampaignSubmission({ collection: 'campaigns', id: 'kasem-creator-challenge' }),
    true,
  );
});

test('isCampaignSubmission treats every "no campaign" shape as open', () => {
  // The studio writes 'open'; older or partial documents may carry an empty id
  // or no campaign at all. Reading any of these as a campaign would push an
  // everyday post into the reviewed queue and it would never publish.
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: 'open' }), false);
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: 'OPEN' }), false);
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: '  ' }), false);
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: '' }), false);
  assert.equal(isCampaignSubmission({ collection: 'campaigns', id: 'none' }), false);
  assert.equal(isCampaignSubmission({}), false);
  assert.equal(isCampaignSubmission(null), false);
  assert.equal(isCampaignSubmission(undefined), false);
  assert.equal(isCampaignSubmission({ id: 7 }), false);
});

// ── Kawuri ──────────────────────────────────────────────────────────────────

test('normaliseTurns keeps the recent tail, oldest first', () => {
  const turns = Array.from({ length: 30 }, (_, i) => ({ role: 'user', text: `turn ${i}` }));
  const out = normaliseTurns(turns);
  assert.equal(out.length, 12);
  assert.equal(out[out.length - 1].text, 'turn 29');
});

test('normaliseTurns ends on a user turn, because the model requires it', () => {
  const out = normaliseTurns([
    { role: 'user', text: 'a question' },
    { role: 'model', text: 'an answer' },
  ]);
  assert.deepEqual(out, [{ role: 'user', text: 'a question' }]);
});

test('normaliseTurns drops empty turns and unknown roles default to user', () => {
  assert.deepEqual(
    normaliseTurns([{ role: 'assistant', text: '  hi  ' }, { text: '' }, { role: 'user', text: 'q' }]),
    [{ role: 'user', text: 'hi' }, { role: 'user', text: 'q' }],
  );
});

test('normaliseTurns rejects junk without throwing', () => {
  assert.deepEqual(normaliseTurns(undefined), []);
  assert.deepEqual(normaliseTurns('not an array'), []);
  assert.deepEqual(normaliseTurns([null, 5, 'x']), []);
});

test('vertexEndpoint targets the project it is deployed into', () => {
  // Kawuri authenticates as the function's own service account against Vertex
  // AI, so the project has to come from the runtime rather than from a key.
  const url = vertexEndpoint('project-kassena-7e026');
  assert.match(url, /^https:\/\/[a-z0-9-]+-aiplatform\.googleapis\.com\/v1\//);
  assert.ok(url.includes('/projects/project-kassena-7e026/'));
  assert.ok(url.endsWith(':generateContent'));
  // No key is ever appended — that is the point of the Vertex route.
  assert.ok(!url.includes('key='));
});

test('replyFromGemini pulls the answer out, and survives every empty shape', () => {
  assert.equal(
    replyFromGemini({ candidates: [{ content: { parts: [{ text: 'Elders first.' }] } }] }),
    'Elders first.',
  );
  // Streamed answers arrive as several parts.
  assert.equal(
    replyFromGemini({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }),
    'ab',
  );
  // A blocked generation has candidates but no parts.
  assert.equal(replyFromGemini({ candidates: [{ finishReason: 'SAFETY' }] }), '');
  assert.equal(replyFromGemini({ candidates: [] }), '');
  assert.equal(replyFromGemini({}), '');
  assert.equal(replyFromGemini(null), '');
  assert.equal(replyFromGemini('nonsense'), '');
});
