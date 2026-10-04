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
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/progress');
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await page.getByRole('button', { name: 'Preview sample targets', exact: true }).click();
  await page.locator('.floating-vessel').first().waitFor();
  return { context, page };
}
async function noOverflow(page) {
  const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(size.document <= size.viewport + 1, `page overflow: ${JSON.stringify(size)}`);
}
async function allMotionStopped(page) {
  const running = await page.locator('.progress-observatory').evaluate(root => [...root.querySelectorAll('*')].filter(node => getComputedStyle(node).animationName !== 'none').map(node => node.className));
  assert.deepEqual(running, [], 'pause/reduced motion stops all decorative motion');
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
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
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
  await capture(page, 'glowing-tanks-desktop');
  await page.getByRole('button', { name: 'Local pots', exact: true }).click();
  const loaded = await page.locator('.heritage-pot-art img').evaluateAll(async images => {
    await Promise.all(images.map(img => img.decode()));
    return images.every(img => img.naturalWidth > 0);
  });
  assert(loaded, 'both generated pottery assets load');
  assert.equal(await page.locator('.heritage-pot-art svg').count(), 0, 'pottery uses raster artwork');
  await capture(page, 'local-pots-desktop');
  for (const width of [320, 390, 768, 1440]) {
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
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Jars', exact: true }).click();
  await page.getByRole('button', { name: 'Next collections', exact: true }).click();
  assert(await page.locator('.vessels-gallery').evaluate(node => node.scrollLeft > 0), 'mobile next control scrolls the collection');
  await page.getByRole('button', { name: 'Previous collections', exact: true }).click();
  await capture(page, 'floating-jars-mobile');
  await opener.click();
  await capture(page, 'category-popup-mobile');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+t');
  assert.equal(await page.locator('.progress-data-table').count(), 1, 'Alt+T opens the accessible table');
  await context.close();
  const reduced = await samplePage({ reducedMotion: 'reduce' });
  await allMotionStopped(reduced.page);
  await reduced.context.close();
  assert.deepEqual(errors, []);
  console.log('Progress browser checks passed: all views, exact fills, popup/focus workflows, 320–1440px layouts, carousel, pause and reduced motion.');
} finally {
  await browser.close();
}
