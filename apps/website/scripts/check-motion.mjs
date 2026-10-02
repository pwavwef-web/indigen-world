/** Production-preview browser checks. Run with a local Chrome/Edge installation. */
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
const origin = process.env.MOTION_PREVIEW_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch({ executablePath, headless: true });
const routes = ['/', '/about', '/ecosystem', '/project-kassena', '/dictionary', '/contribute',
  '/impact-governance', '/get-involved', '/contact', '/privacy', '/terms', '/post', '/communities',
  '/ads/payment-complete', '/founding-tester-claim-7q4m9x2k', '/labs', '/labs/experiments',
  '/labs/kasem-practice', '/labs/cultural-story', '/labs/culture-quest', '/labs/word-trail', '/labs/activity',
  '/labs/updates', '/labs/admin', '/beyond-the-reef', '/not-a-public-page'];
const screenshots = process.argv.includes('--screenshots');
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const imageDir = path.join(repoRoot, 'apps/updates-blog/posts/2026-10-02-public-website-in-motion/images');
async function context(options = {}) {
  const ctx = await browser.newContext(options);
  // The independent Blogger feed is outside these local animation checks.
  await ctx.route('https://updates.indigenworld.com/**', route => route.abort());
  return ctx;
}
async function open(page, route) {
  await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor({ state: 'attached' });
  if (route === '/privacy') await page.locator('.privacy-hero__art img').waitFor();
  else if (route !== '/beyond-the-reef') await page.locator('.page-motion__art svg').waitFor();
  await page.waitForTimeout(800);
}
async function artwork(page) { return page.locator('.page-motion__art svg').first().evaluate(svg => svg.outerHTML); }
try {
  const ctx = await context();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 800 });
    for (const route of routes) {
      await open(page, route);
      const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert(sizes.content <= sizes.viewport + 1, `${route} overflows at ${width}px: ${sizes.content}`);
      if (route !== '/beyond-the-reef') {
        assert.equal(await page.locator(route === '/privacy' ? '.privacy-hero' : '.page-motion').count(), 1, `${route}: exactly one page illustration`);
        const toggle = page.getByRole('button', { name: 'Pause animations', exact: false });
        await toggle.scrollIntoViewIfNeeded();
        assert(await toggle.isVisible(), `${route}: accessible motion control`);
        await toggle.click({ trial: true, timeout: 3000 });
        const box = await toggle.boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width + 1, `${route}: motion control outside viewport`);
      }
      if (screenshots && ((width === 1440 && ['/', '/ecosystem', '/labs'].includes(route)) || (width === 360 && route === '/labs/kasem-practice'))) {
        fs.mkdirSync(imageDir, { recursive: true });
        await page.evaluate(() => window.scrollTo(0, 0));
        const name = route === '/' ? 'home-desktop' : route === '/labs/kasem-practice' ? 'practice-mobile' : `${route.slice(1)}-desktop`;
        await page.screenshot({ path: path.join(imageDir, `${name}.png`) });
      }
    }
    console.log(`Checked all ${routes.length} routes at ${width}px.`);
  }
  assert.deepEqual(errors, [], 'No uncaught page errors');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, '/');
  const moving = await artwork(page); await page.waitForTimeout(240);
  assert.notEqual(await artwork(page), moving, 'Remotion advances while visible');
  await page.getByRole('button', { name: 'Pause animations' }).click();
  await page.waitForTimeout(100);
  const paused = await artwork(page); await page.waitForTimeout(240);
  assert.equal(await artwork(page), paused, 'Pause freezes artwork');
  await page.getByLabel('Primary navigation', { exact: true }).getByRole('link', { name: 'Ecosystem', exact: true }).click();
  await page.getByRole('button', { name: 'Resume animations' }).waitFor();
  await page.reload(); await page.getByRole('button', { name: 'Resume animations' }).waitFor();
  await page.getByRole('button', { name: 'Resume animations' }).click();
  await open(page, '/');
  const pathCard = page.locator('.today-path').first();
  await pathCard.scrollIntoViewIfNeeded(); await page.waitForTimeout(750);
  assert(await pathCard.evaluate(el => el.classList.contains('is-visible')), 'Scrolled cards reveal');
  assert.equal(await pathCard.evaluate(el => getComputedStyle(el).opacity), '1', 'Revealed cards are readable');
  await pathCard.locator('a').first().focus(); await page.waitForTimeout(300);
  assert.equal(await pathCard.evaluate(el => getComputedStyle(el).translate), '0px -4px', 'Keyboard focus activates card motion');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(350);
  const offscreen = await artwork(page); await page.waitForTimeout(240);
  assert.equal(await artwork(page), offscreen, 'Offscreen artwork pauses');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
  const returned = await artwork(page); await page.waitForTimeout(240);
  assert.notEqual(await artwork(page), returned, 'Artwork resumes on return');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const hidden = await artwork(page); await page.waitForTimeout(240);
  assert.equal(await artwork(page), hidden, 'Visibility handler pauses hidden tabs');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
  assert.equal(await page.locator('.page-motion__toggle').count(), 0, 'Runtime reduced-motion change removes playback');
  const reducedStill = await artwork(page); await page.waitForTimeout(240);
  assert.equal(await artwork(page), reducedStill, 'Reduced motion is static');
  assert.equal(await page.locator('h1').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.motion-ready:not(.is-visible)').count(), 0, 'Reduced motion reveals all content');
  await ctx.close();

  const reducedContext = await context({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const reducedPage = await reducedContext.newPage(); const motionRequests = [];
  reducedPage.on('request', request => { if (request.url().includes('/RemotionArtwork-')) motionRequests.push(request.url()); });
  await open(reducedPage, '/dictionary');
  assert.deepEqual(motionRequests, [], 'Reduced-motion users do not download the Player chunk');
  await reducedContext.close();

  const privacyContext = await context();
  const privacyPage = await privacyContext.newPage();
  await open(privacyPage, '/privacy');
  await privacyPage.waitForFunction(() => document.querySelector('.privacy-hero video')?.currentTime > 0.1);
  await privacyPage.getByRole('button', { name: 'Pause animations' }).click();
  assert(await privacyPage.locator('.privacy-hero video').evaluate(video => video.paused), 'Privacy video shares pause control');
  const privacyTime = await privacyPage.locator('.privacy-hero video').evaluate(video => video.currentTime);
  await privacyPage.waitForTimeout(240);
  assert(Math.abs(await privacyPage.locator('.privacy-hero video').evaluate(video => video.currentTime) - privacyTime) < 0.04, 'Privacy video stays paused');
  await open(privacyPage, '/ecosystem');
  await privacyPage.getByRole('button', { name: 'Resume animations' }).waitFor();
  await open(privacyPage, '/privacy');
  assert(await privacyPage.locator('.privacy-hero video').evaluate(video => video.paused), 'Privacy respects saved site preference');
  await privacyPage.getByRole('button', { name: 'Resume animations' }).click();
  await privacyPage.waitForFunction(() => document.querySelector('.privacy-hero video')?.paused === false);
  await privacyPage.emulateMedia({ reducedMotion: 'reduce' });
  await privacyPage.waitForFunction(() => !document.querySelector('.privacy-hero video'));
  assert(await privacyPage.locator('.privacy-hero__art img').isVisible(), 'Privacy keeps its still under reduced motion');
  await privacyContext.close();

  const fallbackContext = await context();
  await fallbackContext.route('**/RemotionArtwork-*.js', route => route.abort());
  const fallbackPage = await fallbackContext.newPage();
  await open(fallbackPage, '/contact');
  assert(await fallbackPage.locator('h1').isVisible(), 'Text survives a failed animation download');
  assert.equal(await fallbackPage.locator('.page-motion__art svg').count(), 1, 'Failed animation keeps static illustration');
  await fallbackContext.close();
  console.log('Playback, pause/navigation/reload persistence, offscreen resume, tab visibility, reduced motion and download fallback passed.');
} finally { await browser.close(); }
