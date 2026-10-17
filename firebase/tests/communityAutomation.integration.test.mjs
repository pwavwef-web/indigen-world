import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGenAiFactoryForTests } from '../../services/functions/lib/kawuri-vertex.js';
import { AUTOMATION_ACCOUNTS, automationDate, dailyPostId } from '../../services/functions/lib/community-automation-policy.js';
import { answerEnquiryReply, ensureAutomationProfile, publishAutomationPost, refreshWordAutomationIllustration, setCommunityAutomationToolingClient } from '../../services/functions/lib/community-automation.js';

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
beforeEach(() => { responseFor = () => ({ text: 'Which dictionary improvement would help you most?' }); });
after(async () => { setCommunityAutomationToolingClient(null); setGenAiFactoryForTests(null); await db.terminate(); await deleteApp(app); });

const imagePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
test('word publication buys a real image response, uploads it and retries idempotently', async () => {
  const bot = AUTOMATION_ACCOUNTS[0];
  await db.collection('dictionaryEntries').doc('word_run').set({ isPublished: true, kasemText: 'test-run', englishText: 'to run', partOfSpeech: 'verb' });
  responseFor = () => ({ entryId: 'word_run', invitationId: 0 });
  let images = 0;
  setGenAiFactoryForTests((project, location) => ({ models: { async generateContent(input) {
    images++;
    assert.equal(location, 'global');
    assert.deepEqual(input.config.responseModalities, ['IMAGE']);
    assert.match(input.contents[0].parts[0].text, /"partOfSpeech":"verb"/);
    return { candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: imagePng } }] } }] };
  } } }));
  const date = new Date('2027-01-01T07:00:00Z');
  const result = await publishAutomationPost(bot, date);
  assert.equal(result.status, 'published');
  const post = await db.collection('communityPosts').doc(result.postId).get();
  assert.match(post.get('text'), /AI-generated illustration with Gemini/);
  const media = post.get('media')[0];
  assert.equal(media.isAiGenerated, true);
  assert.match(media.altText, /to run/);
  const [bytes] = await getStorage().bucket().file(media.storagePath).download();
  assert.equal(bytes.toString('base64'), imagePng);
  assert.equal((await publishAutomationPost(bot, date)).status, 'already-published');
  assert.equal(images, 1);
});
test('missing generated picture fails closed; completed uploads survive publication retries', async () => {
  const bot = AUTOMATION_ACCOUNTS[0];
  responseFor = () => ({ entryId: 'word_run', invitationId: 1 });
  const date = new Date('2027-01-02T07:00:00Z');
  let images = 0;
  setGenAiFactoryForTests(() => ({ models: { async generateContent() { images++; return { candidates: [{ finishReason: 'IMAGE_SAFETY' }] }; } } }));
  await assert.rejects(publishAutomationPost(bot, date), /did not return a word illustration/);
  const postRef = db.collection('communityPosts').doc(dailyPostId(bot, automationDate(date)));
  assert.equal((await postRef.get()).exists, false);
  setGenAiFactoryForTests(() => ({ models: { async generateContent() {
    images++;
    await db.collection('communityAutomationAccounts').doc(bot.id).update({ enabled: false });
    return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: imagePng } }] } }] };
  } } }));
  await assert.rejects(publishAutomationPost(bot, date), /Publication cancelled/);
  assert.equal((await postRef.get()).exists, false);
  await db.collection('communityAutomationAccounts').doc(bot.id).update({ enabled: true });
  assert.equal((await publishAutomationPost(bot, date)).status, 'published');
  assert.equal(images, 2, 'third attempt reuses the uploaded second-attempt image');
});
test('existing card upgrades once, preserves counters and never recreates a removed post', async () => {
  const bot = AUTOMATION_ACCOUNTS[0];
  const date = '2027-01-03';
  const id = dailyPostId(bot, date);
  await db.collection('communityPosts').doc(id).set({ dictionaryEntryId: 'word_run', text: 'Word of the day: test-run — to run.\n\nPublished dictionary · Automated with Vertex AI.', media: [{ url: 'old-card' }], likeCount: 12 });
  await db.collection('communityAutomationRuns').doc(id).set({ status: 'published' });
  let images = 0;
  setGenAiFactoryForTests(() => ({ models: { async generateContent() {
    images++;
    return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: imagePng } }] } }] };
  } } }));
  assert.equal((await publishAutomationPost(bot, new Date(`${date}T07:00:00Z`))).status, 'illustration-updated');
  assert.equal(await refreshWordAutomationIllustration(date), id);
  assert.equal(images, 1);
  const post = await db.collection('communityPosts').doc(id).get();
  assert.equal(post.get('likeCount'), 12);
  assert.equal(post.get('media')[0].isAiGenerated, true);
  const revisions = await db.collection('communityAutomationRuns').doc(id).collection('imageRevisions').get();
  assert.equal(revisions.docs[0].get('media')[0].url, 'old-card');
  await post.ref.delete();
  await assert.rejects(refreshWordAutomationIllustration(date), /No enabled published word post/);
  assert.equal((await post.ref.get()).exists, false);
});

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
