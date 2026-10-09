/** Browser regression checks against a running Vite development server. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright-core');
const executablePath = process.env.CHROMIUM_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(file => fs.existsSync(file));
const origin = process.env.PROGRESS_PREVIEW_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ executablePath, headless: true });
const screenshotDir = process.env.PROGRESS_SCREENSHOTS;
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
const capture = async (page, name) => {
  if (screenshotDir) {
    await page.waitForTimeout(300); // Let the native popup entrance finish before the still capture.
    await page.screenshot({ path: path.join(screenshotDir, name + '.png'), fullPage: !name.includes('popup') });
  }
};
const errors = [];
async function samplePage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  if(process.env.PROGRESS_BLOCK_EXTERNAL === 'true') await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    try { localStorage.setItem('iw_progress_vessel_view_mode', 'vertical'); localStorage.setItem('iw_progress_motion_paused', 'false'); } catch { /* storage unavailable */ }
    window.__pulses = 0;
    new MutationObserver(() => {
      const pulse = document.querySelector('.pipe-pulse:not([data-seen])');
      if (pulse) { pulse.dataset.seen = '1'; window.__pulses += 1; }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(origin + '/progress');
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await page.getByRole('button', { name: 'Preview sample targets', exact: true }).click();
  await page.locator('.pipeline-status[data-state="sample"]').waitFor();
  return { context, page };
}
async function noOverflow(page) {
  const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(size.document <= size.viewport + 1, `page overflow: ${JSON.stringify(size)}`);
}
async function allMotionStopped(page) {
  const running = await page.locator('.progress-observatory').evaluate(root => [...root.querySelectorAll('*')].filter(node => getComputedStyle(node).animationName !== 'none').map(node => node.className.baseVal ?? node.className));
  assert.deepEqual(running, [], 'pause/reduced motion stops all decorative motion');
}
/** Every inlet meets a tube end, and no tube or fitting crosses text or a control. */
async function pipesAreConnectedAndClear(page, label) {
  await page.waitForTimeout(400);
  const report = await page.evaluate(() => {
    const stage = document.querySelector('.pipeline-stage');
    const svg = stage.querySelector('.pipe-network');
    if (!svg) return { missing: true };
    const box = stage.getBoundingClientRect();
    const tube = parseFloat(svg.style.getPropertyValue('--tube')) || 10;
    const lines = [...svg.querySelectorAll('.pipe-tube__glass')].map(line => ['x1', 'y1', 'x2', 'y2'].map(key => Number(line.getAttribute(key))));
    const inlets = [...stage.querySelectorAll('[data-pipe-inlet]')].map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.getAttribute('data-pipe-inlet'), x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top };
    });
    const unjoined = inlets.filter(inlet => !lines.some(([x1, y1, x2, y2]) => (Math.hypot(x1 - inlet.x, y1 - inlet.y) < 1.5) || (Math.hypot(x2 - inlet.x, y2 - inlet.y) < 1.5))).map(inlet => inlet.id);
    const blockers = [...stage.querySelectorAll('.vessel-title, .vessel-counter, .vessel-target, .floating-vessel-cta, .vessel-readout, .pipeline-status, .tribe-pump__label')]
      .map(node => { const rect = node.getBoundingClientRect(); return { name: node.className, l: rect.left - box.left, t: rect.top - box.top, r: rect.right - box.left, b: rect.bottom - box.top }; });
    const pad = tube / 2 + 1;
    const crossings = [];
    for (const [x1, y1, x2, y2] of lines) {
      const l = Math.min(x1, x2) - pad, r = Math.max(x1, x2) + pad, t = Math.min(y1, y2) - pad, b = Math.max(y1, y2) + pad;
      for (const block of blockers) if (l < block.r && r > block.l && t < block.b && b > block.t) crossings.push(block.name);
    }
    return { inlets: inlets.length, lines: lines.length, unjoined, crossings, pointerEvents: getComputedStyle(svg).pointerEvents };
  });
  assert(!report.missing, `${label}: the pipe network renders`);
  assert.equal(report.inlets, 10, `${label}: every collection has an inlet`);
  assert.deepEqual(report.unjoined, [], `${label}: every inlet meets a pipe`);
  assert.deepEqual(report.crossings, [], `${label}: no pipe crosses text or controls`);
  assert.equal(report.pointerEvents, 'none', `${label}: pipes never intercept input`);
}
try {
  const { context, page } = await samplePage();
  assert.equal(await page.locator('.floating-vessel').count(), 10);
  assert.match(await page.locator('.progress-preview-notice').textContent(), /not live progress/);
  assert.equal(await page.getByRole('progressbar').first().getAttribute('aria-valuenow'), '840');
  assert.equal(await page.getByRole('progressbar').nth(1).getAttribute('aria-valuenow'), '250', 'overflow clamps the progressbar to its target');
  assert.match(await page.locator('.vessel-readout').nth(1).textContent(), /106/, 'the real exceeded percentage stays visible');
  const jarFill = await page.locator('.liquid-fill').first().getAttribute('height');
  assert(Math.abs(Number(jarFill) - 209 * .84) < .001, 'jar fill uses the exact approved percentage');
  await pipesAreConnectedAndClear(page, 'jars 1440');

  // The pump is the real studio link, reachable by keyboard.
  const pump = page.getByRole('link', { name: 'TribeStudio, Open studio (opens in a new tab)' });
  assert.equal(await pump.getAttribute('href'), 'https://tribestudio.indigenworld.com/');
  assert.equal(await pump.getAttribute('target'), '_blank');
  await pump.focus();
  assert(await pump.evaluate(node => document.activeElement === node), 'the pump takes keyboard focus');

  // A sample approval plays through the same path a committed one takes.
  await page.evaluate(() => window.scrollTo(0, 460));
  await page.waitForTimeout(600);
  const before = await page.locator('.floating-vessel[data-category="sentences"] .liquid-fill').getAttribute('height');
  await page.evaluate(() => window.__progressSimulateApproval('sentences'));
  assert.equal(await page.locator('.floating-vessel[data-category="sentences"] .vessel-counter strong').textContent(), '241', 'the number updates at once');
  assert.equal(await page.locator('.floating-vessel[data-category="sentences"] .liquid-fill').getAttribute('height'), before, 'the fill waits for the liquid');
  await page.waitForFunction(() => window.__pulses >= 1, null, { timeout: 4000 });
  await page.locator('.floating-vessel[data-category="sentences"] .vessel-arrival-badge').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('.vessel-arrival-badge').count(), 1, 'only the approved collection is cued');
  await capture(page, 'approval-arrival-desktop');
  await page.waitForTimeout(1600);
  assert(Math.abs(Number(await page.locator('.floating-vessel[data-category="sentences"] .liquid-fill').getAttribute('height')) - 209 * 241 / 500) < .01, 'then fills to the exact new total');

  await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
  await page.waitForTimeout(3000);
  await allMotionStopped(page);
  await capture(page, 'floating-jars-desktop');
  const opener = page.getByRole('button', { name: 'Explore Words & Meanings details', exact: true });
  await opener.click();
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  await page.keyboard.press('Escape');
  assert(await opener.evaluate(node => document.activeElement === node), 'Escape restores focus to the vessel');
  for (const name of ['Make a pledge', 'Share progress', 'How we count']) {
    await opener.click();
    await page.getByRole('button', { name, exact: true }).click();
    assert.equal(await page.locator('dialog[open]').count(), 1, 'detail action opens exactly one dialog');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert(await opener.evaluate(node => document.activeElement === node), `${name} returns focus to the vessel`);
  }
  await page.getByRole('button', { name: 'Tanks', exact: true }).click();
  assert.equal(await page.locator('.glass-vessel-svg--tank').count(), 10);
  assert(Math.abs(Number(await page.locator('.liquid-fill').first().getAttribute('width')) - 536 * .84) < .001);
  await pipesAreConnectedAndClear(page, 'tanks 1440');
  await capture(page, 'glowing-tanks-desktop');
  await page.getByRole('button', { name: 'Local pots', exact: true }).click();
  const loaded = await page.locator('.heritage-pot-art img').evaluateAll(async images => {
    await Promise.all(images.map(img => img.decode()));
    return images.every(img => img.naturalWidth > 0);
  });
  assert(loaded, 'both generated pottery assets load');
  assert.equal(await page.locator('.heritage-pot-art svg').count(), 0, 'pottery uses raster artwork');
  await capture(page, 'local-pots-desktop');
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Jars', 'Tanks', 'Local pots', 'Table']) {
      await page.getByRole('button', { name, exact: true }).click();
      await noOverflow(page);
      if (name === 'Jars' || name === 'Local pots') {
        const geometry = await page.locator('.floating-vessel').first().evaluate(root => {
          const stage = root.querySelector('.vessel-stage').getBoundingClientRect();
          const volume = root.querySelector('.vessel-volume').getBoundingClientRect();
          const counter = root.querySelector('.vessel-counter').getBoundingClientRect();
          return { bottom: volume.bottom, stageBottom: stage.bottom, countTop: counter.top };
        });
        assert(geometry.bottom <= geometry.stageBottom + 1 && geometry.bottom < geometry.countTop, 'vessel never overlaps its count');
      }
      if (name === 'Jars' || name === 'Tanks') await pipesAreConnectedAndClear(page, `${name} ${width}`);
      if (name === 'Jars') {
        const scroll = await page.locator('.vessels-gallery--vertical').evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
        assert(scroll.scroll <= scroll.client + 1, `jars at ${width}px need no sideways scrolling`);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Local pots', exact: true }).click();
  await page.getByRole('button', { name: 'Next collections', exact: true }).click();
  await page.waitForTimeout(400);
  assert(await page.locator('.vessels-gallery').evaluate(node => node.scrollLeft > 0), 'mobile next control scrolls the pottery collection');
  await page.getByRole('button', { name: 'Previous collections', exact: true }).click();
  await page.getByRole('button', { name: 'Jars', exact: true }).click();
  await capture(page, 'floating-jars-mobile');
  await page.getByRole('button', { name: 'Explore Words & Meanings details', exact: true }).click();
  await capture(page, 'category-popup-mobile');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+t');
  assert.equal(await page.locator('.progress-data-table').count(), 1, 'Alt+T opens the accessible table');
  await context.close();

  const reduced = await samplePage({ reducedMotion: 'reduce' });
  await allMotionStopped(reduced.page);
  await reduced.page.evaluate(() => window.scrollTo(0, 460));
  await reduced.page.waitForTimeout(600);
  await reduced.page.evaluate(() => window.__progressSimulateApproval('lexicon'));
  await reduced.page.locator('.floating-vessel[data-category="lexicon"] .vessel-arrival-badge').waitFor({ timeout: 3000 });
  assert.equal(await reduced.page.evaluate(() => window.__pulses), 0, 'reduced motion: a static cue, nothing travels');
  assert(Math.abs(Number(await reduced.page.locator('.floating-vessel[data-category="lexicon"] .liquid-fill').getAttribute('height')) - 209 * .841) < .01, 'reduced motion: the fill updates at once');
  await reduced.context.close();
  assert.deepEqual(errors, []);
  console.log('Progress browser checks passed: all views, exact fills, connected pipes clear of text at 320–1440px, the pump link, a sample approval flow, popup/focus workflows, carousel, pause and reduced motion.');
} finally {
  await browser.close();
}
