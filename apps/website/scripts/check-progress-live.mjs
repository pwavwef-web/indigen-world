/**
 * Live approval flow, end to end, against the Firestore emulator.
 *
 * The page's real snapshot listener watches the projection written by the
 * real backend code (services/functions/lib/public-progress.js), whose trigger
 * handlers this script invokes exactly as Cloud Functions would after each
 * committed write. Nothing on the page is simulated.
 *
 * Needs, already running:
 *   firebase emulators:start --only firestore --project demo-indigen-world
 *   the "website-emulators" preview (.claude/launch.json), on PROGRESS_LIVE_URL
 * and a built backend (npm run build:functions).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const projectId = process.env.PROGRESS_LIVE_PROJECT || 'demo-indigen-world';
const origin = process.env.PROGRESS_LIVE_URL || 'http://localhost:5196';
const screenshotDir = process.env.PROGRESS_SCREENSHOTS;
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright-core');
const { initializeApp, deleteApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const progress = await import(new URL('../../../services/functions/lib/public-progress.js', import.meta.url).href);

const executablePath = process.env.CHROMIUM_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((file) => fs.existsSync(file));

// The trigger handlers use the default app, exactly as in Cloud Functions.
const app = initializeApp({ projectId });
const db = getFirestore(app);
const handlers = {
  dictionaryEntries: progress.onDictionaryEntryProgress,
  expressionEntries: progress.onExpressionEntryProgress,
  grammarRules: progress.onGrammarRuleProgress,
  publishedContent: progress.onPublishedContentProgress,
  kasemSentences: progress.onKasemSentenceProgress,
};
/** Commit a write, then deliver its trigger event as Cloud Functions would. */
async function commit(collection, id, after, { deliver = 1 } = {}) {
  const ref = db.collection(collection).doc(id);
  const before = (await ref.get()).data();
  if (after === undefined) await ref.delete();
  else await ref.set(after);
  const event = {
    id: randomUUID(),
    params: { recordId: id },
    data: { before: { exists: before !== undefined, data: () => before }, after: { exists: after !== undefined, data: () => after } },
  };
  for (let attempt = 0; attempt < deliver; attempt += 1) await handlers[collection].run(event);
  return event;
}
const projection = async () => (await db.doc(progress.PUBLIC_PROGRESS_DOC).get()).data();

async function clearEmulator() {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(response.ok, `emulator reset failed: ${response.status}`);
}

async function seed() {
  const batch = db.batch();
  for (let index = 0; index < 12; index += 1) {
    batch.set(db.doc(`dictionaryEntries/seed_word_${index}`), { isPublished: true, kasemText: `word ${index}`, ...(index < 3 ? { audioUrl: `https://example.test/${index}.m4a` } : {}) });
  }
  batch.set(db.doc('dictionaryEntries/seed_draft'), { isPublished: false, kasemText: 'draft' });
  for (let index = 0; index < 5; index += 1) batch.set(db.doc(`expressionEntries/seed_phrase_${index}`), { isPublished: true, expressionKind: 'phrase' });
  batch.set(db.doc('expressionEntries/seed_proverb'), { isPublished: true, expressionKind: 'proverb' });
  batch.set(db.doc('grammarRules/seed_rule'), { status: 'published' });
  batch.set(db.doc('publishedContent/seed_story'), { publicationStatus: 'published', collectionKind: 'literature' });
  batch.set(db.doc('publishedContent/seed_open_song'), { publicationStatus: 'published', collectionKind: 'music', publicationRoute: 'open' });
  // Small targets so fills are visible; the page follows this document live.
  batch.set(db.doc('platformConfiguration/launch'), { categoryTargets: { lexicon: 40, expressions: 20, pronunciation: 10, grammar: 5 } });
  await batch.commit();
  await progress.refreshPublicProgress(db, progress.PROGRESS_CATEGORIES, 'reconcile');
}

const browser = await chromium.launch({ executablePath, headless: true });
const pageErrors = [];
const results = [];
const step = (name) => results.push(name);
try {
  await clearEmulator();
  await seed();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('iw_launch_progress_cache_v2');
      localStorage.setItem('iw_progress_vessel_view_mode', 'vertical');
      localStorage.setItem('iw_progress_motion_paused', 'false');
    } catch { /* storage unavailable */ }
    // Record every pulse and arrival cue as it appears, so nothing slips between probes.
    window.__pulses = [];
    window.__badges = [];
    new MutationObserver(() => {
      const pulse = document.querySelector('.pipe-pulse');
      if (pulse && !pulse.dataset.seen) {
        pulse.dataset.seen = '1';
        window.__pulses.push({ at: performance.now() });
      }
      for (const badge of document.querySelectorAll('.vessel-arrival-badge:not([data-seen])')) {
        badge.dataset.seen = '1';
        window.__badges.push({ category: badge.closest('[data-category]')?.dataset.category, text: badge.textContent });
      }
    }).observe(document, { childList: true, subtree: true });
    window.__states = [];
    new MutationObserver(() => {
      const state = document.querySelector('.pipeline-status')?.dataset.state;
      if (state && state !== window.__states.at(-1)?.state) window.__states.push({ state, at: Math.round(performance.now()) });
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-state'], childList: true });
  });
  const counter = (id) => page.locator(`.floating-vessel[data-category="${id}"] .vessel-counter strong`).textContent();
  const readout = (id) => page.locator(`.floating-vessel[data-category="${id}"] .vessel-readout`).textContent();
  const pulses = () => page.evaluate(() => window.__pulses.length);
  const badges = () => page.evaluate(() => window.__badges.map((badge) => badge.category));
  const lastBadge = () => page.evaluate(() => window.__badges.at(-1)?.text ?? '');
  const waitForBadges = (count) => page.waitForFunction((n) => window.__badges.length >= n, count, { timeout: 9000 });
  const status = () => page.locator('.pipeline-status').getAttribute('data-state');
  const capture = async (name) => {
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
    }
  };

  await page.goto(`${origin}/progress`);
  await page.locator('.pipeline-status[data-state="live"]').waitFor({ timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, 470));
  assert.equal(await counter('lexicon'), '12');
  assert.equal(await counter('expressions'), '5', 'the proverb is not an everyday expression');
  assert.equal(await counter('proverbs'), '1');
  assert.equal(await counter('music'), '0', 'an open post never fills a vessel');
  assert.equal(await counter('pronunciation'), '3');
  assert.equal((await readout('expressions')).replace(/\s/g, ''), '25%', 'live targets are applied');
  await page.waitForTimeout(2500);
  assert.equal(await pulses(), 0, 'history is not replayed on load');
  assert.deepEqual(await badges(), []);
  step('initial load: live, exact totals, nothing replayed');

  // A committed approval: one flow, into its own vessel only.
  const approval = await commit('expressionEntries', 'live_phrase_1', { isPublished: true, expressionKind: 'phrase' });
  await page.waitForFunction(() => document.querySelector('.floating-vessel[data-category="expressions"] .vessel-counter strong')?.textContent === '6', null, { timeout: 8000 });
  const heldFill = await page.locator('.floating-vessel[data-category="expressions"] .liquid-fill').getAttribute('height');
  assert.equal(Number(heldFill).toFixed(2), (209 * 5 / 20).toFixed(2), 'the fill waits for the liquid to arrive');
  await page.waitForFunction(() => window.__pulses.length >= 1, null, { timeout: 4000 });
  await capture('live-approval-travel');
  await waitForBadges(1);
  assert.match(await lastBadge(), /\+1 approved/);
  assert.deepEqual(await badges(), ['expressions'], 'other vessels stay quiet');
  await page.waitForTimeout(2500);
  assert.equal(Number(await page.locator('.floating-vessel[data-category="expressions"] .liquid-fill').getAttribute('height')).toFixed(2), (209 * 6 / 20).toFixed(2), 'then eases to the exact new total');
  assert.equal(await pulses(), 1);
  step('approval: count immediate, one pulse, badge on expressions only, exact fill');

  // At-least-once delivery: the same event again changes nothing.
  await handlers.expressionEntries.run(approval);
  await page.waitForTimeout(3500);
  assert.equal(await counter('expressions'), '6');
  assert.equal(await pulses(), 1, 'a redelivered event plays nothing');
  step('duplicate delivery: no second pulse, no double count');

  // Unapproved work never moves anything.
  const revisionBefore = (await projection()).revision;
  await commit('dictionaryEntries', 'live_draft', { isPublished: false, kasemText: 'pending' });
  await page.waitForTimeout(2500);
  assert.equal((await projection()).revision, revisionBefore);
  assert.equal(await counter('lexicon'), '12');
  assert.equal(await pulses(), 1);
  step('unapproved draft: no change');

  // A retraction: a correction, never a positive flow.
  await commit('expressionEntries', 'live_phrase_1', { isPublished: false, expressionKind: 'phrase' });
  await page.waitForFunction(() => document.querySelector('.floating-vessel[data-category="expressions"] .vessel-counter strong')?.textContent === '5', null, { timeout: 8000 });
  await page.waitForTimeout(2000);
  assert.equal(await pulses(), 1, 'a retraction plays no approval');
  assert.deepEqual(await badges(), ['expressions'], 'no new cue for a retraction');
  step('retraction: count falls, no flow');

  // A busy burst: batched truthfully.
  await Promise.all([1, 2, 3].map((index) => db.doc(`grammarRules/burst_${index}`).set({ status: 'published' })));
  await Promise.all([1, 2, 3].map((index) => handlers.grammarRules.run({
    id: randomUUID(), params: { recordId: `burst_${index}` },
    data: { before: { exists: false, data: () => undefined }, after: { exists: true, data: () => ({ status: 'published' }) } },
  })));
  await page.waitForFunction(() => document.querySelector('.floating-vessel[data-category="grammar"] .vessel-counter strong')?.textContent === '4', null, { timeout: 8000 });
  await waitForBadges(2);
  await page.waitForTimeout(4500);
  const burstCues = await page.evaluate(() => window.__badges.slice(1));
  assert.ok(burstCues.every((cue) => cue.category === 'grammar'), 'the burst cues only its own vessel');
  const burstTotal = burstCues.reduce((sum, cue) => sum + Number(cue.text.match(/\+(\d+)/)[1]), 0);
  assert.equal(burstTotal, 3, 'the cues add up to exactly three approvals');
  assert.equal(await counter('grammar'), '4');
  step(`burst of three: total exact, cues ${burstCues.map((cue) => `"${cue.text.trim()}"`).join(' + ')}`);

  // Switching view mid-flow: the effect is cancelled, the snapshot is exact, nothing replays.
  const pulsesBeforeSwitch = await pulses();
  await commit('dictionaryEntries', 'live_word_switch', { isPublished: true, kasemText: 'switch' });
  await page.waitForFunction((n) => window.__pulses.length > n, pulsesBeforeSwitch, { timeout: 6000 })
    .catch(async (error) => {
      console.error('diagnostics', await page.evaluate(() => ({ now: Math.round(performance.now()), states: window.__states, pulses: window.__pulses, badges: window.__badges, status: document.querySelector('.pipeline-status')?.dataset.state, lexicon: document.querySelector('[data-category="lexicon"] .vessel-counter strong')?.textContent })));
      throw error;
    });
  await page.getByRole('button', { name: 'Tanks', exact: true }).click();
  await page.waitForTimeout(2500);
  assert.equal(await counter('lexicon'), '13');
  assert.equal(await pulses(), pulsesBeforeSwitch + 1, 'the cancelled flow is not replayed in the new view');
  assert.equal(Number(await page.locator('.floating-vessel[data-category="lexicon"] .liquid-fill').getAttribute('width')).toFixed(2), (536 * 13 / 40).toFixed(2), 'tanks show the exact snapshot');
  await page.getByRole('button', { name: 'Jars', exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(await pulses(), pulsesBeforeSwitch + 1);
  step('view switch mid-flow: cancelled cleanly, exact snapshot, no replay');

  // Offline, approvals land elsewhere, then reconnect: caught up, not replayed.
  await page.evaluate(() => window.scrollTo(0, 470));
  await context.setOffline(true);
  await page.waitForFunction(() => document.querySelector('.pipeline-status')?.dataset.state === 'offline', null, { timeout: 8000 });
  await commit('dictionaryEntries', 'live_word_offline_1', { isPublished: true, kasemText: 'offline one' });
  await commit('dictionaryEntries', 'live_word_offline_2', { isPublished: true, kasemText: 'offline two' });
  assert.equal(await counter('lexicon'), '13', 'offline numbers are not invented');
  const pulsesBeforeReconnect = await pulses();
  await context.setOffline(false);
  await page.waitForFunction(() => document.querySelector('.floating-vessel[data-category="lexicon"] .vessel-counter strong')?.textContent === '15', null, { timeout: 30_000 });
  await page.locator('.pipeline-status[data-state="live"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  assert.equal(await pulses(), pulsesBeforeReconnect, 'approvals missed while offline are caught up silently');
  step('offline → reconnect: status honest, counts caught up, no replay');

  // A hidden tab updates numbers silently and does not replay on return.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await commit('grammarRules', 'hidden_rule', { status: 'published' });
  await page.waitForFunction(() => document.querySelector('.floating-vessel[data-category="grammar"] .vessel-counter strong')?.textContent === '5', null, { timeout: 8000 });
  const pulsesWhileHidden = await pulses();
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(2500);
  assert.equal(await pulses(), pulsesWhileHidden, 'nothing replays when the tab returns');
  step('hidden tab: counted silently, no replay on resume');

  // An approval for a vessel scrolled out of view updates its number only.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const pulsesBeforeOffscreen = await pulses();
  // An already-published word gains its recording: only Pronunciation changes.
  await commit('dictionaryEntries', 'seed_word_5', { isPublished: true, kasemText: 'word 5', audioUrl: 'https://example.test/5.m4a' });
  await page.waitForFunction(() => document.querySelector('.floating-vessel[data-category="pronunciation"] .vessel-counter strong')?.textContent === '4', null, { timeout: 8000 });
  await page.waitForTimeout(2500);
  assert.equal(await pulses(), pulsesBeforeOffscreen, 'off-screen vessels play no effect');
  assert.equal(await counter('lexicon'), '15', 'a recording added to a word is not a new word');
  step('off-screen approval: number updated, no effect');

  // A changed target reconciles the percentage without any approval cue.
  await page.evaluate(() => window.scrollTo(0, 470));
  const pulsesBeforeTarget = await pulses();
  await db.doc('platformConfiguration/launch').set({ categoryTargets: { lexicon: 40, expressions: 10, pronunciation: 10, grammar: 5 } });
  await page.waitForFunction(() => document.querySelector('.floating-vessel[data-category="expressions"] .vessel-readout')?.textContent.replace(/\s/g, '') === '50%', null, { timeout: 8000 });
  await page.waitForTimeout(1500);
  assert.equal(await pulses(), pulsesBeforeTarget);
  step('target change: percentage reconciled, no cue');

  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log(`Live progress checks passed:\n  - ${results.join('\n  - ')}`);
} finally {
  await browser.close();
  await deleteApp(app);
}
