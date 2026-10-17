/** Real-browser checks for discovery, navigation, compact task pages and mobile dictionary use. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.WEBSITE_REFRESH_URL || 'http://127.0.0.1:5174';
const executablePath = process.env.CHROMIUM_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(file => fs.existsSync(file));
const imageDir = path.resolve(import.meta.dirname, '../../updates-blog/posts/2026-10-12-easier-website-discovery/images');
const screenshots = process.argv.includes('--screenshots');
if (screenshots) fs.mkdirSync(imageDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
async function open(page, route) {
  await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function layout(page, route, width) {
  const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(sizes.content <= sizes.viewport + 1, `${route}: overflow at ${width}px (${sizes.content})`);
  const hero = page.locator('.culture-hero');
  if (await hero.count()) {
    const bounds = await hero.evaluate(element => ({
      copyBottom: element.querySelector('.culture-hero__content').getBoundingClientRect().bottom,
      footerTop: element.querySelector('.culture-hero__footer').getBoundingClientRect().top,
    }));
    assert(bounds.copyBottom <= bounds.footerTop + 1, `${route}: photo credits overlap content`);
  }
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // The separate Blogger service is outside these website checks.
  await context.route('https://updates.indigenworld.com/**', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await open(page, '/');
  assert.equal(await page.locator('.desktop-nav > a').count(), 3);
  const story = page.locator('.story-nav > summary');
  await story.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.story-nav').getAttribute('open'), '');
  assert.equal(await page.locator('.story-nav__panel a').count(), 5);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.story-nav').getAttribute('open'), null);
  assert(await story.evaluate(element => element === document.activeElement));
  await story.click();
  await page.locator('h1').click();
  assert.equal(await page.locator('.story-nav').getAttribute('open'), null);
  await page.locator('#home-dictionary-query').fill('nɛ́ & home');
  await page.locator('.home-search button').click();
  await page.locator('.dictionary-toolbar input[type=search]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'nɛ́ & home');
  assert.equal(await page.locator('.dictionary-toolbar input[type=search]').inputValue(), 'nɛ́ & home');
  console.log('Desktop navigation and Unicode search round-trip passed.');

  const routes = ['/', '/dictionary', '/learn', '/contribute', '/about', '/ecosystem', '/project-kassena', '/impact-governance', '/get-involved', '/contact', '/privacy', '/terms'];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    for (const route of routes) {
      await open(page, route);
      await layout(page, route, width);
      if (['/dictionary', '/learn', '/contribute'].includes(route)) {
        const box = await page.locator('.culture-hero').boundingBox();
        assert(box.height < (width >= 768 ? 550 : 600), `${route}: task banner is too tall at ${width}px (${box.height})`);
      }
    }
    console.log(`Responsive layout passed for ${routes.length} routes at ${width}px.`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/dictionary');
  const filterToggle = page.locator('.dictionary-filter-toggle');
  assert.equal(await page.locator('#dictionary-filter-options').isVisible(), false);
  await filterToggle.click();
  assert.equal(await page.locator('#dictionary-filter-options').isVisible(), true);
  await page.getByRole('checkbox', { name: 'With a recording' }).check();
  await filterToggle.click();
  assert.equal(await filterToggle.getAttribute('aria-expanded'), 'false');
  await page.evaluate(() => scrollTo(0, 600));
  const toolbar = await page.locator('.dictionary-toolbar').boundingBox();
  assert(toolbar.y >= 88 && toolbar.y <= 100, 'Mobile search remains below the header while scrolling');
  await page.locator('.menu-button').click();
  await page.locator('.mobile-story-nav > summary').click();
  await page.locator('.mobile-story-nav a[href="/about"]').click();
  await page.locator('h1').waitFor();
  assert.equal(new URL(page.url()).pathname, '/about');
  assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'), 'false');
  await page.locator('.menu-button').click();
  await page.keyboard.press('Escape');
  assert(await page.locator('.menu-button').evaluate(element => element === document.activeElement));
  console.log('Mobile grouped navigation, filter toggle and sticky search passed.');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, '/');
  await page.locator('.home-discovery').waitFor();
  await page.waitForFunction(() => !document.querySelector('.home-discovery')?.textContent.includes('Finding a'), null, { timeout: 45000 });
  const preview = await page.locator('.home-discovery').innerText();
  console.log(`Public preview state: ${preview.includes('could not load') ? 'fallback' : 'loaded'}.`);
  for (const audio of await page.locator('.home-discovery audio').all()) assert(await audio.evaluate(element => element.paused), 'Preview audio never autoplays');
  if (screenshots) {
    await page.getByRole('button', { name: 'Pause animations', exact: false }).first().click();
    await page.locator('.culture-hero__images img.is-active').waitFor();
    await page.screenshot({ path: path.join(imageDir, 'home-desktop.png') });
    await page.locator('.home-discovery').screenshot({ path: path.join(imageDir, 'language-previews.png') });
  }
  const wordLink = page.locator('.discovery-card--word a[href*="entry="]');
  if (await wordLink.count()) {
    await wordLink.click();
    await page.locator('.dictionary-detail h2').waitFor();
    console.log('Featured public word opens its dictionary entry.');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/dictionary');
  await page.locator('.dictionary-entry-card').first().waitFor({ timeout: 45000 });
  const first = page.locator('.dictionary-entry-card').first();
  const headword = await first.locator('strong').innerText();
  await first.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await page.locator('.dictionary-toolbar').evaluate(element => element.inert), true);
  await dialog.getByRole('button', { name: 'Save word', exact: true }).click();
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('indigen-world:saved-dictionary-entries') || '[]').length > 0));
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.dictionary-toolbar').evaluate(element => element.inert), false);
  assert(await first.evaluate(element => element === document.activeElement));
  await filterToggle.click();
  await page.getByRole('button', { name: 'Saved words', exact: true }).click();
  assert((await page.locator('.dictionary-entry-list').innerText()).includes(headword));
  await filterToggle.click();
  if (screenshots) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(imageDir, 'dictionary-mobile.png') });
    await open(page, '/learn');
    await page.screenshot({ path: path.join(imageDir, 'learn-mobile.png') });
  }
  console.log('Public dictionary entry, save, dialog isolation and focus restoration passed.');
  await context.close();

  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 600 } });
  const reducedPage = await reduced.newPage();
  await open(reducedPage, '/');
  assert.equal(await reducedPage.locator('.site-motion').getAttribute('data-motion-paused'), 'true');
  await layout(reducedPage, '/', 390);
  await reduced.close();
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`Website discovery checks passed at ${origin}.`);
} finally {
  await browser.close();
}
