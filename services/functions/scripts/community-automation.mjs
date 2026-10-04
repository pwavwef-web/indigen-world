/** Owner-operated provisioning and verification. Uses the existing Firebase CLI login, never stores credentials. */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { Resvg } from '@resvg/resvg-js';
import { AUTOMATION_ACCOUNTS, AUTOMATION_TIME_ZONE, automationDate, dailyPostId, wordCardSvg } from '../lib/community-automation-policy.js';
import { ensureAutomationProfile, refreshCultureAutomationPost, searchCultureInternet } from '../lib/community-automation.js';

const project = 'project-kassena-7e026';
const REGION = 'us-central1';
const bucketName = `${project}.firebasestorage.app`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const mode = process.argv[2] || '--inspect';
if (!['--inspect', '--prepare', '--publish', '--verify', '--preview-art', '--research-check', '--refresh-culture'].includes(mode)) throw new Error('Unknown mode');
const require = createRequire(resolve(root, 'package.json'));
const cliAuth = require('firebase-tools/lib/auth.js');
const account = cliAuth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Run firebase login on this computer first');
const cliToken = () => cliAuth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
process.env.GCLOUD_PROJECT = project;
// Google clients require standard ADC. Reuse this owner's existing CLI OAuth login in a private,
// short-lived authorized_user file. It is never copied into the repository or uploaded.
const cliApi = require('firebase-tools/lib/api.js');
const credentialDirectory = await mkdtemp(resolve(tmpdir(), 'indigen-bot-adc-'));
const credentialFile = resolve(credentialDirectory, 'adc.json');
await writeFile(credentialFile, JSON.stringify({ type: 'authorized_user', client_id: cliApi.clientId(),
  client_secret: cliApi.clientSecret(), refresh_token: account.tokens.refresh_token }), { mode: 0o600 });
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialFile;
process.on('exit', () => {
  try { unlinkSync(credentialFile); rmdirSync(credentialDirectory); } catch { /* Only this process's exact private paths. */ }
});
initializeApp({ projectId: project, storageBucket: bucketName, credential: applicationDefault() });
const db = getFirestore();
const bucket = getStorage().bucket();

if (mode === '--preview-art') {
  const rows = [];
  for (const [i, bot] of AUTOMATION_ACCOUNTS.entries()) {
    const data = {};
    for (const kind of ['avatar', 'cover']) data[kind] = `data:image/png;base64,${(await readFile(resolve(root, `assets/community-automation/${bot.id}/${kind}.png`))).toString('base64')}`;
    rows.push(`<text x="20" y="${i * 180 + 28}" font-size="18">${bot.name}</text><image x="20" y="${i * 180 + 40}" width="125" height="125" href="${data.avatar}"/><image x="170" y="${i * 180 + 40}" width="550" height="125" href="${data.cover}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="900"><rect width="740" height="900" fill="#FAF6EC"/>${rows.join('')}</svg>`;
  const out = resolve(root, '.tooling/community-automation');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'artwork-review.png'), new Resvg(svg).render().asPng());
  const word = { id: 'preview', kasem: 'kɔ́rɛ', english: 'Illustration preview: exact published text will be used on live cards.' };
  await writeFile(resolve(out, 'word-card-preview.png'), new Resvg(wordCardSvg(AUTOMATION_ACCOUNTS[0], word, '2026-10-02'), {
    font: { loadSystemFonts: false, fontFiles: [resolve(root, 'services/functions/assets/fonts/NotoSans-Regular.ttf')] },
  }).render().asPng());
  console.log('Artwork previews saved under .tooling/community-automation');
} else if (mode === '--inspect') {
  const dictionary = await db.collection('dictionaryEntries').where('isPublished', '==', true).count().get();
  const handles = await Promise.all(AUTOMATION_ACCOUNTS.map(async bot => {
    const [handle, profile] = await Promise.all([db.collection('communityUsernames').doc(bot.username).get(), db.collection('communityProfiles').doc(bot.uid).get()]);
    return { name: bot.name, username: bot.username, handleAvailable: !handle.exists || handle.get('uid') === bot.uid, profileExists: profile.exists };
  }));
  console.log(JSON.stringify({ project, publishedDictionaryEntries: dictionary.data().count, accounts: handles }, null, 2));
} else if (mode === '--prepare') {
  // Preflight every identity before creating any of them.
  for (const bot of AUTOMATION_ACCOUNTS) {
    const [handle, profile] = await Promise.all([db.collection('communityUsernames').doc(bot.username).get(), db.collection('communityProfiles').doc(bot.uid).get()]);
    if (handle.exists && handle.get('uid') !== bot.uid) throw new Error(`Handle collision: ${bot.username}`);
    if (profile.exists && profile.get('automationAccountId') !== bot.id) throw new Error(`Profile collision: ${bot.uid}`);
    await readFile(resolve(root, `assets/community-automation/${bot.id}/avatar.png`));
    await readFile(resolve(root, `assets/community-automation/${bot.id}/cover.png`));
    const identity = await getAuth().getUser(bot.uid).catch(error => {
      if (error.code === 'auth/user-not-found') return null;
      throw error;
    });
    if (identity && identity.customClaims?.automationAccountId !== bot.id) throw new Error(`Auth identity collision: ${bot.uid}`);
  }
  for (const bot of AUTOMATION_ACCOUNTS) {
    const urls = {};
    for (const kind of ['avatar', 'cover']) {
      const path = `${kind === 'avatar' ? 'community-avatars' : 'community-banners'}/${bot.uid}/${kind}.png`;
      const file = bucket.file(path);
      const [exists] = await file.exists();
      const [oldMetadata] = exists ? await file.getMetadata() : [{}];
      const token = oldMetadata.metadata?.firebaseStorageDownloadTokens?.split(',')[0] || randomUUID();
      await file.save(await readFile(resolve(root, `assets/community-automation/${bot.id}/${kind}.png`)), {
        resumable: false, contentType: 'image/png', metadata: { cacheControl: 'public,max-age=86400', metadata: { firebaseStorageDownloadTokens: token, credit: 'Original AI illustration generated with OpenAI imagegen, 2026-10-02' } },
      });
      urls[kind === 'avatar' ? 'avatarUrl' : 'bannerUrl'] = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    }
    const identity = await getAuth().getUser(bot.uid).catch(error => { if (error.code === 'auth/user-not-found') return null; throw error; });
    if (!identity) await getAuth().createUser({ uid: bot.uid, displayName: bot.name, photoURL: urls.avatarUrl, disabled: true });
    else await getAuth().updateUser(bot.uid, { displayName: bot.name, photoURL: urls.avatarUrl, disabled: true });
    await getAuth().setCustomUserClaims(bot.uid, { isAutomated: true, automationAccountId: bot.id });
    await ensureAutomationProfile(bot, urls);
    const configRef = db.collection('communityAutomationAccounts').doc(bot.id);
    const config = await configRef.get();
    await configRef.set({ accountId: bot.id, uid: bot.uid, enabled: config.get('enabled') === true, repliesEnabled: bot.kind === 'enquiry' && config.get('repliesEnabled') === true,
      schedule: `0 ${bot.hour} * * *`, timeZone: AUTOMATION_TIME_ZONE, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log(`Prepared ${bot.name}: @${bot.username}`);
  }
} else if (mode === '--publish' || mode === '--research-check') {
  const token = await cliToken();
  if (mode === '--research-check') {
    const sources = await searchCultureInternet('Kasem language Kassena people');
    console.log(JSON.stringify(sources.map(source => ({ url: source.url, title: source.title, retrievedCharacters: source.text.length })), null, 2));
  } else {
    // Only enable accounts once the corresponding production jobs and trigger are active.
    const response = await fetch(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/us-central1/functions`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const data = await response.json();
    const expected = ['postZemBotarebuDaily', 'postAmoYeiKasemDaily', 'postNNaYeiriSeNBweiDaily', 'postKasemPracticeDaily', 'postIndigenGuideDaily', 'recoverCommunityAutomation', 'onCommunityEnquiryReply'];
    if (!response.ok || expected.some(name => !data.functions?.some(fn => fn.name.endsWith(`/${name}`) && fn.state === 'ACTIVE'))) throw new Error('Deploy and verify all automation functions before enabling posting');
    for (const bot of AUTOMATION_ACCOUNTS) {
      const profile = await db.collection('communityProfiles').doc(bot.uid).get();
      if (!profile.get('avatarUrl') || !profile.get('bannerUrl')) throw new Error(`Prepare artwork first: ${bot.id}`);
    }
    const batch = db.batch();
    for (const bot of AUTOMATION_ACCOUNTS) batch.set(db.collection('communityAutomationAccounts').doc(bot.id), { enabled: true, repliesEnabled: bot.kind === 'enquiry', activatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    const jobsResponse = await fetch(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${REGION}/jobs`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const scheduler = await jobsResponse.json();
    if (!jobsResponse.ok) throw new Error('Cannot read production Scheduler jobs');
    const runJob = async bot => {
      const index = AUTOMATION_ACCOUNTS.findIndex(item => item.id === bot.id);
      const job = scheduler.jobs?.find(item => item.name.includes(`firebase-schedule-${expected[index]}-`) && item.state === 'ENABLED');
      if (!job) throw new Error(`Missing enabled Scheduler job for ${bot.name}`);
      const started = await fetch(`https://cloudscheduler.googleapis.com/v1/${job.name}:run`, { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: '{}' });
      if (!started.ok) throw new Error(`Cannot start ${bot.name}: HTTP ${started.status}`);
      console.log(`Started deployed daily job for ${bot.name}`);
    };
    const waitForPosts = async bots => {
      const deadline = Date.now() + 8 * 60_000;
      const pending = new Map(bots.map(bot => [bot.id, bot]));
      while (pending.size && Date.now() < deadline) {
        for (const [id, bot] of pending) {
          const run = await db.collection('communityAutomationRuns').doc(dailyPostId(bot, automationDate())).get();
          if (run.get('status') === 'published') {
            console.log(JSON.stringify({ name: bot.name, status: 'published', postId: run.get('postId') }));
            pending.delete(id);
          } else if (run.get('status') === 'failed' && Number(run.get('attempts')) >= 3) {
            throw new Error(`${bot.name} exhausted its attempts: ${run.get('lastError')}`);
          }
        }
        if (pending.size) await new Promise(resolve => setTimeout(resolve, 10_000));
      }
      if (pending.size) throw new Error(`Initial posts are still pending: ${[...pending.values()].map(bot => bot.name).join(', ')}`);
    };
    // Finish the first word before the practice account selects a different word.
    await runJob(AUTOMATION_ACCOUNTS[0]);
    await waitForPosts([AUTOMATION_ACCOUNTS[0]]);
    for (const bot of AUTOMATION_ACCOUNTS.slice(1)) await runJob(bot);
    await waitForPosts(AUTOMATION_ACCOUNTS.slice(1));
  }
} else if (mode === '--refresh-culture') {
  console.log(JSON.stringify({ refreshedPostId: await refreshCultureAutomationPost() }));
} else {
  const results = [];
  for (const bot of AUTOMATION_ACCOUNTS) {
    const [identity, profile, config, post] = await Promise.all([getAuth().getUser(bot.uid), db.collection('communityProfiles').doc(bot.uid).get(),
      db.collection('communityAutomationAccounts').doc(bot.id).get(), db.collection('communityPosts').doc(dailyPostId(bot, automationDate())).get()]);
    const media = post.get('media') || [];
    if (bot.kind === 'word' && media[0]?.url) {
      const imageResponse = await fetch(media[0].url, { signal: AbortSignal.timeout(20_000) });
      if (!imageResponse.ok) throw new Error('Published word image unavailable');
      const imageDirectory = resolve(root, '.tooling/community-automation');
      await mkdir(imageDirectory, { recursive: true });
      await writeFile(resolve(imageDirectory, 'live-word-card.png'), Buffer.from(await imageResponse.arrayBuffer()));
    }
    const urls = [profile.get('avatarUrl'), profile.get('bannerUrl'), ...media.map(item => item.url)];
    const assets = await Promise.all(urls.map(async url => {
      if (!url) return { status: 'missing' };
      const response = await fetch(url, { headers: { Range: 'bytes=0-32' }, signal: AbortSignal.timeout(20_000) });
      return { status: response.status, contentType: response.headers.get('content-type') };
    }));
    results.push({ name: bot.name, uid: identity.uid, automatedClaim: identity.customClaims?.isAutomated === true, signInDisabled: identity.disabled,
      enabled: config.get('enabled'), schedule: config.get('schedule'), timeZone: config.get('timeZone'), repliesEnabled: config.get('repliesEnabled'),
      profileReady: !!profile.get('avatarUrl') && !!profile.get('bannerUrl'), firstPostId: post.id, posted: post.exists, postText: post.get('text') || null,
      assets, postLength: post.get('text')?.length, mediaCount: media.length });
  }
  const token = await cliToken();
  const response = await fetch(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${REGION}/jobs`, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const data = await response.json();
  const jobs = data.jobs?.filter(job => /post(ZemBotarebu|AmoYeiKasem|NNaYeiriSeNBwei|KasemPractice|IndigenGuide)Daily|recoverCommunityAutomation/.test(job.name)).map(job => ({ name: job.name.split('/').pop(), schedule: job.schedule, timeZone: job.timeZone, state: job.state }));
  const verification = { verifiedAt: new Date().toISOString(), project, accounts: results, schedulerStatus: response.status, jobs };
  console.log(JSON.stringify(verification, null, 2));
  const out = resolve(root, '.tooling/community-automation');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'live-verification.json'), JSON.stringify(verification, null, 2) + '\n');
  if (results.some(row => !row.posted || !row.profileReady || !row.automatedClaim || !row.enabled || row.assets.some(asset => ![200, 206].includes(asset.status))) || jobs?.length !== 6 || jobs.some(job => job.state !== 'ENABLED')) process.exitCode = 1;
}
