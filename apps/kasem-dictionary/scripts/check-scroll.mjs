/** Browser regression checks against a running dictionary preview and its published entries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright-core');
const executablePath = process.env.CHROMIUM_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(file => fs.existsSync(file));
if (!executablePath) throw new Error('Set CHROMIUM_EXECUTABLE to a Chrome or Edge installation to run these browser checks.');
const origin = process.env.SCROLL_PREVIEW_URL || 'http://127.0.0.1:5175';
const imageDir = fileURLToPath(new URL('../../updates-blog/posts/2026-10-04-dictionary-steady-scrolling/images/', import.meta.url));
const browser = await chromium.launch({ executablePath, headless: true });
const screenshots = process.argv.includes('--screenshots');
const baselineCss = process.env.SCROLL_BASELINE_CSS;
const errors = [];
async function open(page) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.word-card').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  if (baselineCss) await page.addStyleTag({ content: fs.readFileSync(baselineCss, 'utf8') });
  await page.waitForTimeout(400);
}
async function observe(page) {
  await page.evaluate(() => {
    window.scrollCheck = { transitions: [], frames: [] };
    const shell = document.querySelector('.app-shell');
    new MutationObserver(() => window.scrollCheck.transitions.push(shell.classList.contains('header-hidden')))
      .observe(shell, { attributes: true, attributeFilter: ['class'] });
  });
}
async function wheel(page, selector, delta) {
  const box = await page.locator(selector).boundingBox();
  assert(box, `${selector} is present`);
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height - 30, box.height / 2));
  await page.evaluate(() => {
    window.scrollCheck.transitions = [];
    window.scrollCheck.frames = [];
    const deadline = performance.now() + 1000;
    const sample = () => {
      const app = document.querySelector('.dictionary-app').getBoundingClientRect();
      const panel = document.querySelector('.definition-panel').getBoundingClientRect();
      window.scrollCheck.frames.push({ top: app.top, height: app.height, panelTop: panel.top, panelHeight: panel.height });
      if (performance.now() < deadline) requestAnimationFrame(sample);
    };
    sample();
  });
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(1100);
  const evidence = await page.evaluate(() => window.scrollCheck);
  for (const key of ['top', 'height', 'panelTop', 'panelHeight']) {
    const positions = evidence.frames.map(frame => frame[key]);
    assert(Math.max(...positions) - Math.min(...positions) <= 0.5,
      `${selector}: header visibility must preserve ${key}; range ${Math.min(...positions)}–${Math.max(...positions)}`);
  }
  assert(evidence.transitions.length <= 1, `${selector}: a wheel action triggered repeated header toggles: ${JSON.stringify(evidence.transitions)}`);
  const settled = await page.locator(selector).evaluate(el => el.scrollTop);
  await page.waitForTimeout(350);
  assert.equal(await page.locator(selector).evaluate(el => el.scrollTop), settled, `${selector}: position stays still after scrolling ends`);
  return evidence;
}
async function screenshot(page, name) {
  if (!screenshots) return;
  fs.mkdirSync(imageDir, { recursive: true });
  await page.screenshot({ path: path.join(imageDir, name) });
}
try {
  for (const [width, height, reducedMotion] of [[1918, 880, false], [1600, 720, false], [900, 720, false], [1600, 720, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    await open(page);
    await page.locator('.word-card').first().click();
    await page.waitForTimeout(400);
    await observe(page);
    const down = await wheel(page, '.definition-panel', 500);
    assert.deepEqual(down.transitions, [true], 'Scrolling to the bottom hides the header once');
    assert(await page.locator('.app-shell').evaluate(el => el.classList.contains('header-hidden')), 'Header stays hidden after the bottom clamp');
    const up = await wheel(page, '.definition-panel', -50);
    assert.deepEqual(up.transitions, [false], 'Scrolling up shows the header once');
    for (let cycle = 0; cycle < 2; cycle++) {
      assert.deepEqual((await wheel(page, '.definition-panel', 500)).transitions, [true], 'Repeated downward scrolling hides the header once');
      assert.deepEqual((await wheel(page, '.definition-panel', 500)).transitions, [], 'Scrolling past a panel boundary keeps the header and geometry steady');
      assert.deepEqual((await wheel(page, '.definition-panel', -50)).transitions, [false], 'Repeated upward scrolling shows the header once');
    }
    await wheel(page, '.browse-panel', 600);
    await wheel(page, '.browse-panel', -60);
    await page.keyboard.press('Control+k');
    assert(await page.getByPlaceholder('Search Kasem or English').evaluate(el => el === document.activeElement), 'Search shortcut focuses the field');
    assert.equal(await page.locator('.browse-panel').evaluate(el => el.scrollTop), 0, 'Search shortcut returns to search');
    for (const name of ['Proverbs', 'Names', 'Common phrases', 'Words']) {
      await page.getByRole('button', { name, exact: true }).click();
      assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true', `${name} collection remains selectable`);
      await page.waitForFunction(() => document.activeElement === document.querySelector('input[placeholder="Search Kasem or English"]'));
      assert(await page.getByPlaceholder('Search Kasem or English').evaluate(el => el === document.activeElement), `${name} returns keyboard focus to search`);
    }
    await page.locator('.word-card').first().waitFor({ timeout: 30000 });
    await page.locator('.word-card').first().click();
    await page.waitForTimeout(400);
    if (width === 1600 && !reducedMotion) await screenshot(page, 'dictionary-desktop.png');
    console.log(`Stable desktop/tablet panel geometry, bottom clamp, upward scrolling, collections and search at ${width}×${height}${reducedMotion ? " with reduced motion" : ""}.`);
    await page.close();
  }
  for (const width of [390, 360]) {
    const mobile = await browser.newPage({ viewport: { width, height: 844 } });
    await open(mobile);
    await observe(mobile);
    await mobile.mouse.move(200,600);
    await mobile.mouse.wheel(0,900);
    await mobile.waitForTimeout(600);
    const visibleIndex = await mobile.locator('.word-card').evaluateAll(cards => cards.findIndex(card => {
      const box = card.getBoundingClientRect();
      return box.top > 150 && box.bottom < innerHeight - 30;
    }));
    assert(visibleIndex >= 0, 'Mobile scrolling exposes a result');
    const before = await mobile.evaluate(() => scrollY);
    await mobile.locator('.word-card').nth(visibleIndex).click();
    await mobile.waitForTimeout(400);
    assert.equal(await mobile.locator('.definition-panel').getAttribute('aria-modal'), 'true', 'Mobile details remain a modal');
    if (width === 390) await screenshot(mobile, 'dictionary-mobile-detail.png');
    await mobile.getByRole('button', { name: 'Next word' }).click();
    await mobile.getByRole('button', { name: 'Previous word' }).click();
    await mobile.getByRole('button', { name: 'Results', exact: false }).click();
    await mobile.waitForTimeout(450);
    assert.equal(await mobile.evaluate(() => scrollY), before, 'Returning from mobile details preserves the results position');
    assert(await mobile.locator('.word-card').nth(visibleIndex).evaluate(el => el === document.activeElement), 'Returning restores focus to the selected result');
    await mobile.keyboard.press('Control+k');
    await mobile.waitForTimeout(400);
    assert.equal(await mobile.evaluate(() => scrollY), 0, 'Mobile search shortcut returns to the top');
    if (width === 390) await screenshot(mobile, 'dictionary-mobile.png');
    await mobile.close();
  }
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('Mobile result position, return focus and search shortcut passed; no uncaught browser errors.');
} finally {
  await browser.close();
}



