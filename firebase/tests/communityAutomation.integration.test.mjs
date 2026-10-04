import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AUTOMATION_ACCOUNTS, automationDate, dailyPostId } from '../../services/functions/lib/community-automation-policy.js';
import { answerEnquiryReply, ensureAutomationProfile, publishAutomationPost, setCommunityAutomationToolingClient } from '../../services/functions/lib/community-automation.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-indigen-world') throw new Error('Emulator-only test');
const app = initializeApp({ projectId: 'demo-indigen-world', storageBucket: 'demo-indigen-world.appspot.com' });
const db = getFirestore();
let modelCalls = 0;
let responseFor = () => ({ text: 'Which dictionary improvement would help you most?' });
const fakeClient = { models: { async generateContent() {
  modelCalls++;
  return { candidates: [{ finishReason: 'STOP' }], text: JSON.stringify(responseFor()) };
} } };
before(async () => {
  setCommunityAutomationToolingClient(fakeClient);
  for (const bot of AUTOMATION_ACCOUNTS) {
    await ensureAutomationProfile(bot, { avatarUrl: `https://example.test/${bot.id}/avatar.png`, bannerUrl: `https://example.test/${bot.id}/cover.png` });
    await db.collection('communityAutomationAccounts').doc(bot.id).set({ enabled: true, repliesEnabled: bot.kind === 'enquiry' });
  }
});
after(async () => { setCommunityAutomationToolingClient(null); await db.terminate(); await deleteApp(app); });

test('daily retry publishes once and never restores a moderated-away post', async () => {
  const bot = AUTOMATION_ACCOUNTS[2];
  const now = new Date('2026-10-02T13:00:00Z');
  const calls = modelCalls;
  const first = await publishAutomationPost(bot, now);
  assert.equal(first.status, 'published');
  const second = await publishAutomationPost(bot, now);
  assert.equal(second.status, 'already-published');
  assert.equal(modelCalls, calls + 1);
  await db.collection('communityPosts').doc(first.postId).delete();
  assert.equal((await publishAutomationPost(bot, now)).status, 'already-published');
  assert.equal((await db.collection('communityPosts').doc(first.postId).get()).exists, false);
});
test('disabled accounts cannot generate or post', async () => {
  const bot = AUTOMATION_ACCOUNTS[4];
  await db.collection('communityAutomationAccounts').doc(bot.id).set({ enabled: false });
  const calls = modelCalls;
  assert.equal((await publishAutomationPost(bot)).status, 'disabled');
  assert.equal(modelCalls, calls);
});
test('concurrent daily workers share a lease and produce exactly one post', async () => {
  const bot = AUTOMATION_ACCOUNTS[2];
  const now = new Date('2026-10-03T13:00:00Z');
  responseFor = () => ({ text: 'What would make the community more useful for new learners?' });
  const calls = modelCalls;
  const results = await Promise.all([publishAutomationPost(bot, now), publishAutomationPost(bot, now)]);
  assert.equal(results.filter(result => result.status === 'published').length, 1);
  assert.equal(modelCalls, calls + 1);
});
test('invalid model output fails closed and stops paying after three attempts', async () => {
  const bot = AUTOMATION_ACCOUNTS[2];
  const now = new Date('2026-10-04T13:00:00Z');
  responseFor = () => ({ text: 'This is not a question.' });
  const calls = modelCalls;
  for (let i = 0; i < 3; i++) await assert.rejects(publishAutomationPost(bot, now));
  assert.equal((await publishAutomationPost(bot, now)).status, 'attempts-exhausted');
  assert.equal(modelCalls, calls + 3);
  assert.equal((await db.collection('communityPosts').doc(dailyPostId(bot, automationDate(now))).get()).exists, false);
});
test('reply worker is idempotent, increments atomically and ignores a generated reply', async () => {
  const bot = AUTOMATION_ACCOUNTS[2];
  const rootId = 'test_enquiry_root';
  await db.collection('communityPosts').doc(rootId).set({ authorId: bot.uid, automationAccountId: bot.id, text: 'What helps you learn?', isReply: false });
  await db.collection('communityPosts').doc('test_human_reply').set({ authorId: 'test_human', rootId, parentId: rootId, isReply: true, text: 'Listening to speakers helps.', replyCount: 0 });
  responseFor = () => ({ shouldReply: true, text: 'Listening can make practice feel more natural. What kind of recordings do you enjoy?' });
  const calls = modelCalls;
  assert.equal(await answerEnquiryReply('test_human_reply'), 'published');
  assert.equal(await answerEnquiryReply('test_human_reply'), 'already-handled');
  assert.equal(modelCalls, calls + 1);
  assert.equal((await db.collection('communityPosts').doc('test_human_reply').get()).get('replyCount'), 1);
  assert.equal(await answerEnquiryReply('enquiry_test_human_reply'), 'ineligible');
  assert.equal(await answerEnquiryReply('does_not_exist'), 'missing');
});
test('enquiry respects per-member generation caps and replies toggle', async () => {
  const bot = AUTOMATION_ACCOUNTS[2];
  const limit = db.collection('communityAutomationReplyLimits').doc(`member_${automationDate()}_capped_user`);
  await limit.set({ count: 3 });
  await db.collection('communityPosts').doc('test_capped_reply').set({ authorId: 'capped_user', rootId: 'test_enquiry_root', parentId: 'test_enquiry_root', isReply: true, text: 'Can you say more?' });
  assert.equal(await answerEnquiryReply('test_capped_reply'), 'rate-limited');
  await db.collection('communityAutomationAccounts').doc(bot.id).update({ repliesEnabled: false });
  await db.collection('communityPosts').doc('test_disabled_reply').set({ authorId: 'another_user', rootId: 'test_enquiry_root', parentId: 'test_enquiry_root', isReply: true, text: 'I agree.' });
  assert.equal(await answerEnquiryReply('test_disabled_reply'), 'disabled');
});
test('guide tips keep posting after a full rotation without repeating within a week', async () => {
  const bot = AUTOMATION_ACCOUNTS[4];
  await db.collection('communityAutomationAccounts').doc(bot.id).set({ enabled: true });
  const texts = [];
  for (let day = 1; day <= 9; day++) {
    const now = new Date(`2026-11-${String(day).padStart(2, '0')}T19:00:00Z`);
    const result = await publishAutomationPost(bot, now);
    assert.equal(result.status, 'published');
    const post = await db.collection('communityPosts').doc(result.postId).get();
    const text = post.get('text');
    assert.ok(!texts.slice(-7).includes(text));
    texts.push(text);
  }
});
test('muting or blocking the enquiry host prevents generation', async () => {
  const bot = AUTOMATION_ACCOUNTS[2];
  await db.collection('communityAutomationAccounts').doc(bot.id).update({ repliesEnabled: true });
  await db.collection('communityMutes').doc(`muted_user_${bot.uid}`).set({ uid: 'muted_user', targetId: bot.uid });
  await db.collection('communityPosts').doc('test_muted_reply').set({ authorId: 'muted_user', rootId: 'test_enquiry_root', parentId: 'test_enquiry_root', isReply: true, text: 'A comment.' });
  const calls = modelCalls;
  assert.equal(await answerEnquiryReply('test_muted_reply'), 'silenced');
  assert.equal(modelCalls, calls);
});
test('culture publication preserves the exact retrieved excerpt and source link', async () => {
  const bot = AUTOMATION_ACCOUNTS[1];
  const quote = 'Kasem is spoken in northern Ghana and southern Burkina Faso.';
  const originalFetch = globalThis.fetch;
  let stage = 0;
  const responses = [{ query: 'Kasem language geography' }, { fact: 'Kasem speakers live in northern Ghana and southern Burkina Faso.', evidenceId: '0_0' }, { supported: true }];
  responseFor = () => responses[stage++];
  globalThis.fetch = async url => String(url).includes('wikipedia')
    ? new Response(JSON.stringify({ query: { pages: [{ fullurl: 'https://en.wikipedia.org/wiki/Kasena_language', title: 'Kasena language', extract: quote }] } }), { status: 200 })
    : new Response('Source temporarily inaccessible', { status: 403 });
  try {
    const now = new Date('2026-12-01T10:00:00Z');
    const result = await publishAutomationPost(bot, now);
    assert.equal(result.status, 'published');
    const run = await db.collection('communityAutomationRuns').doc(result.postId).get();
    const post = await db.collection('communityPosts').doc(result.postId).get();
    assert.equal(run.get('sourceQuote'), quote);
    assert.equal(post.get('sources')[0].url, 'https://en.wikipedia.org/wiki/Kasena_language');
    assert.equal(post.get('researchVerified'), true);
    assert.match(post.get('text'), /Wikipedia overview/);
    assert.equal(stage, 3);
  } finally { globalThis.fetch = originalFetch; }
});
