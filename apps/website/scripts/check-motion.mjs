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
const routes = ['/', '/about', '/ecosystem', '/project-kassena', '/dictionary', '/learn', '/contribute',
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
  await page.evaluate(() => document.fonts.ready);
  if (route === '/labs/admin') await page.locator('.page-motion__art svg').waitFor();
  else await page.locator('.culture-hero__images img.is-active').waitFor();
  await page.waitForTimeout(800);
}
async function artwork(page) {
  if (await page.locator('.culture-hero').count()) return page.locator('.culture-hero__images img.is-active').evaluate(img => `${img.currentSrc}:${getComputedStyle(img).transform}`);
  return page.locator('.page-motion__art svg').first().evaluate(svg => svg.outerHTML);
}
async function checkBannerLayout(page, route, width) {
  const banner = page.locator('.culture-hero');
  if (!await banner.count()) return false;
  // Read both bounds in the same layout, including when async content changes.
  const bounds = await banner.evaluate(element => ({
    copyBottom: element.querySelector('.culture-hero__content').getBoundingClientRect().bottom,
    footerTop: element.querySelector('.culture-hero__footer').getBoundingClientRect().top,
  }));
  assert(bounds.copyBottom <= bounds.footerTop + 1, route + ': credits do not overlap page content');
  for (const control of await banner.locator('a, button, input').all()) {
    if (await control.isVisible() && await control.isEnabled()) {
      try { await control.click({ trial: true, timeout: 5000 }); }
      catch (error) { throw new Error(`${route} at ${width}px: ${error.message}`); }
    }
  }
  const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(sizes.content <= sizes.viewport + 1, route + ': horizontal overflow at ' + width);
  return true;
}
async function checkKassenaLayout(page, width) {
  const art = await page.locator('.page-motion').boundingBox();
  for (const selector of ['.kasena-copy', '.module-preview__header', '.module-preview__list', '.module-preview__note', '.module-preview__button']) {
    const content = await page.locator(selector).boundingBox();
    assert(art.x + art.width <= content.x + 1 || content.x + content.width <= art.x + 1 ||
      art.y + art.height <= content.y + 1 || content.y + content.height <= art.y + 1,
    `Project Kassena: illustration overlaps ${selector} at ${width}px`);
  }
  for (const name of ['Support the Kasem pilot', 'Open the Kasem dictionary']) {
    await page.getByRole('link', { name, exact: true }).click({ trial: true, timeout: 3000 });
  }
  if (width >= 900) {
    const heading = await page.locator('.kasena-copy .section-heading').boundingBox();
    const copy = await page.locator('.kasena-copy').boundingBox();
    assert(heading.width >= copy.width * 0.95, `Project Kassena: heading unnecessarily narrowed at ${width}px`);
  }
}
try {
  const ctx = await context();
  const page = await ctx.newPage();
  const errors = [];
  const bannerRoutes = new Set();
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 800 });
    for (const route of routes) {
      await open(page, route);
      const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert(sizes.content <= sizes.viewport + 1, `${route} overflows at ${width}px: ${sizes.content}`);
      if (route === '/project-kassena') await checkKassenaLayout(page, width);
      if (await checkBannerLayout(page, route, width)) bannerRoutes.add(route);
      if (route !== '/beyond-the-reef') {
        assert.equal(await page.locator(route === '/labs/admin' ? '.page-motion' : '.culture-hero').count(), 1, `${route}: exactly one page visual`);
        const toggle = page.getByRole('button', { name: 'Pause animations', exact: false }).first();
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
  for (const width of [320, 999, 1000, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of bannerRoutes) {
      await open(page, route);
      await checkBannerLayout(page, route, width);
    }
    console.log(`Checked all ${bannerRoutes.size} banner layouts for overlap and reachable controls at ${width}px.`);
  }
  for (const width of [900, 999, 1000, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, '/project-kassena');
    await checkKassenaLayout(page, width);
  }
  await page.getByRole('link', { name: 'Open the Kasem dictionary', exact: true }).click();
  await page.waitForURL(origin + '/dictionary');
  console.log('Project Kassena text, controls and illustration remain separate across mobile and desktop breakpoints.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, '/');
  await page.mouse.move(1439, 999);
  const moving = await artwork(page); await page.waitForTimeout(240);
  assert.notEqual(await artwork(page), moving, 'Homepage photograph moves while visible');
  await page.getByRole('button', { name: 'Pause animations' }).click();
  await page.waitForTimeout(100);
  const paused = await artwork(page); await page.waitForTimeout(240);
  assert.equal(await artwork(page), paused, 'Pause freezes artwork');
  await page.locator('.story-nav > summary').click();
  await page.locator('.story-nav__panel a[href="/ecosystem"]').click();
  await page.getByRole('button', { name: 'Resume animations' }).waitFor();
  await page.reload(); await page.getByRole('button', { name: 'Resume animations' }).waitFor();
  await page.getByRole('button', { name: 'Resume animations' }).click();
  await open(page, '/');
  await open(page, '/learn');
  const pathCard = page.locator('.learning-resource').first();
  await pathCard.scrollIntoViewIfNeeded(); await page.waitForTimeout(750);
  assert(await pathCard.evaluate(el => el.classList.contains('is-visible')), 'Scrolled cards reveal');
  assert.equal(await pathCard.evaluate(el => getComputedStyle(el).opacity), '1', 'Revealed cards are readable');
  await pathCard.locator('a').first().focus(); await page.waitForTimeout(300);
  assert.equal(await pathCard.evaluate(el => getComputedStyle(el).opacity), '1', 'Keyboard focus keeps the resource readable');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(350);
  const offscreen = await artwork(page); await page.waitForTimeout(240);
  assert.equal(await artwork(page), offscreen, 'Offscreen artwork pauses');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
  await page.mouse.move(1439, 999);
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
  assert.equal(await page.locator('.culture-hero__pause').count(), 0, 'Runtime reduced-motion change removes playback');
  const reducedStill = await artwork(page); await page.waitForTimeout(240);
  assert.equal(await artwork(page), reducedStill, 'Reduced motion is static');
  assert.equal(await page.locator('h1').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.motion-ready:not(.is-visible)').count(), 0, 'Reduced motion reveals all content');
  for (const route of bannerRoutes) {
    await open(page, route);
    await checkBannerLayout(page, route, 1440);
    assert.equal(await page.locator('.page-motion__toggle').count(), 0, `${route}: reduced motion retains a clear static illustration`);
  }
  await ctx.close();

  const reducedContext = await context({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const reducedPage = await reducedContext.newPage(); const motionRequests = [];
  reducedPage.on('request', request => { if (request.url().includes('/RemotionArtwork-')) motionRequests.push(request.url()); });
  await open(reducedPage, '/dictionary');
  assert.deepEqual(motionRequests, [], 'Reduced-motion users do not download the Player chunk');
  await reducedContext.close();

  const fallbackContext = await context();
  await fallbackContext.route('**/images/culture/*.webp', route => route.abort());
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto(origin + '/contact');
  await fallbackPage.locator('h1').waitFor();
  assert(await fallbackPage.locator('h1').isVisible(), 'Text survives failed photograph downloads');
  assert.equal(await fallbackPage.locator('.culture-hero__images img.is-active').count(), 0, 'Unavailable photographs keep the CSS fallback');
  await fallbackContext.close();
  console.log('Playback, pause/navigation/reload persistence, offscreen resume, tab visibility, reduced motion and download fallback passed.');
} finally { await browser.close(); }
