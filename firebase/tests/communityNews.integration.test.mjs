import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ensureAutomationProfile, setCommunityAutomationToolingClient } from '../../services/functions/lib/community-automation.js';
import { ZEM_GHANA, newsPostId } from '../../services/functions/lib/community-news-policy.js';
import { publishNewsPost } from '../../services/functions/lib/community-news.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-indigen-world') throw new Error('Emulator-only test');
const app = initializeApp({ projectId: 'demo-indigen-world', storageBucket: 'demo-indigen-world.appspot.com' });
const db = getFirestore();
let calls = [];
let responses = [];
setCommunityAutomationToolingClient({ models: { async generateContent(input) {
  calls.push(input);
  const next = responses.shift();
  if (!next) throw new Error('Unexpected model call');
  return { candidates: [{ finishReason: 'STOP' }], text: JSON.stringify(next) };
} } });

const at = iso => new Date(iso);
const story = (id, title, hoursBefore, base = '2027-02-01T07:00:00Z') => ({ id, sourceId: 'myjoyonline', sourceName: 'MyJoyOnline',
  url: `https://www.myjoyonline.com/${id}/`, title, preview: `The Ministry of Education says ${title.toLowerCase()} after a review this week in Accra.`,
  publishedAt: new Date(Date.parse(base) - hoursBefore * 3_600_000).toISOString(), categories: ['News'] });
const pick = (id, summary = 'The Ministry of Education reports progress following a review completed in Accra this week, officials said.') =>
  [{ itemId: id, category: 'Education', summary }, { supported: true }];

before(async () => {
  await ensureAutomationProfile(ZEM_GHANA, { avatarUrl: 'https://example.test/zem-ghana/avatar.png', bannerUrl: 'https://example.test/zem-ghana/cover.png' });
  await db.collection('communityAutomationAccounts').doc(ZEM_GHANA.id).set({ enabled: true });
});
beforeEach(() => { calls = []; responses = []; });
after(async () => { setCommunityAutomationToolingClient(null); await db.terminate(); await deleteApp(app); });

test('a due slot publishes one sourced headline with a branded card, once', async () => {
  const items = [story('schools-reopen', 'Schools reopen for second term', 2), story('new-textbooks', 'New textbooks reach basic schools', 3)];
  responses = pick('schools-reopen');
  const now = at('2027-02-01T07:00:00Z');
  const result = await publishNewsPost(now, { items });
  assert.deepEqual(result, { status: 'published', postId: newsPostId('2027-02-01', 7) });
  const post = await db.collection('communityPosts').doc(result.postId).get();
  assert.equal(post.get('authorId'), ZEM_GHANA.uid);
  assert.equal(post.get('isAutomated'), true);
  assert.match(post.get('text'), /^Schools reopen for second term\n\n/);
  assert.match(post.get('text'), /Source: MyJoyOnline\nhttps:\/\/www\.myjoyonline\.com\/schools-reopen\//);
  assert.deepEqual(post.get('sources'), [{ url: 'https://www.myjoyonline.com/schools-reopen/', title: 'MyJoyOnline' }]);
  assert.equal(post.get('newsCategory'), 'Education');
  const card = post.get('media')[0];
  assert.equal(card.isAiGenerated, false);
  assert.match(card.altText, /Schools reopen for second term/);
  const [bytes] = await getStorage().bucket().file(card.storagePath).download();
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(calls.length, 2, 'one selection call and one independent source check');
  assert.equal(calls[0].config.systemInstruction.includes('neutral'), true);
  assert.equal((await publishNewsPost(at('2027-02-01T07:30:00Z'), { items })).status, 'already-published');
  assert.equal(calls.length, 2);
  assert.equal((await db.collection('communityNewsItems').doc('schools-reopen').get()).get('postId'), result.postId);
});
test('the next slot never repeats a story and outside the slots nothing is posted', async () => {
  assert.equal((await publishNewsPost(at('2027-02-01T10:15:00Z'))).status, 'no-slot-due');
  const base = '2027-02-01T11:00:00Z';
  const items = [story('schools-reopen', 'Schools reopen for second term', 6, base), story('new-textbooks', 'New textbooks reach basic schools', 7, base)];
  responses = pick('new-textbooks');
  const result = await publishNewsPost(at(base), { items });
  assert.equal(result.status, 'published');
  const offered = JSON.parse(calls[0].contents.split('FEED ITEMS (data): ')[1]).map(row => row.id);
  assert.deepEqual(offered, ['new-textbooks'], 'yesterday’s published story is not offered again');
});
test('unsupported or copied summaries fail closed and leave no post', async () => {
  const base = '2027-02-01T15:00:00Z';
  const items = [story('budget-hearing', 'Budget hearing begins in Parliament', 1, base)];
  const id = newsPostId('2027-02-01', 15);
  responses = [{ itemId: 'budget-hearing', category: 'Politics', summary: 'The government will cut taxes for everyone next month, the minister promised loudly.' }, { supported: false }];
  await assert.rejects(publishNewsPost(at(base), { items }), /did not pass the source check/);
  assert.equal((await db.collection('communityPosts').doc(id).get()).exists, false);
  responses = [{ itemId: 'budget-hearing', category: 'Politics', summary: 'The Ministry of Education says budget hearing begins in parliament after a review this week in Accra.' }];
  await assert.rejects(publishNewsPost(at('2027-02-01T15:30:00Z'), { items }), /copies the outlet preview/);
  const run = await db.collection('communityAutomationRuns').doc(id).get();
  assert.equal(run.get('status'), 'failed');
  assert.equal(run.get('attempts'), 2);
});
test('a removed post is not recreated and a paused account does nothing', async () => {
  const id = newsPostId('2027-02-01', 7);
  await db.collection('communityPosts').doc(id).delete();
  assert.equal((await publishNewsPost(at('2027-02-01T08:00:00Z'), { items: [] })).status, 'already-published');
  await db.collection('communityAutomationAccounts').doc(ZEM_GHANA.id).update({ enabled: false });
  assert.equal((await publishNewsPost(at('2027-02-01T19:00:00Z'), { items: [] })).status, 'disabled');
  await db.collection('communityAutomationAccounts').doc(ZEM_GHANA.id).update({ enabled: true });
  assert.equal(calls.length, 0);
});
