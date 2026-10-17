import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const base = process.env.STUDIO_PREVIEW_URL ?? 'http://127.0.0.1:5204';
const output = resolve(import.meta.dirname, '../../updates-blog/posts/2026-10-13-contribution-studio/screens');
mkdirSync(output, { recursive: true });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
try {
  for (const width of [1440, 768, 390, 360]) {
    const mobile = width < 760;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 1050 }, reducedMotion: 'reduce', isMobile: mobile, hasTouch: mobile });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.pathname.endsWith('/checkKasemSpelling')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { results: route.request().postDataJSON().data.words.map(word => ({ key: word.toLocaleLowerCase().normalize('NFC'), status: 'approved', suggestions: [] })) } }) });
      return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.setDefaultNavigationTimeout(60000);
    await page.goto(base + '/contributor/preview', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'A little, often.' }).waitFor();
    const brand = await page.locator('.ts-app').evaluate(node => {
      const style = getComputedStyle(node), root = getComputedStyle(document.documentElement);
      return { accent: style.getPropertyValue('--accent').trim(), workspace: style.getPropertyValue('--ws').trim(), blue: root.getPropertyValue('--c-blue-fill').trim() };
    });
    assert.equal(brand.accent, brand.blue, 'the contributor studio inherits the shared blue brand');
    assert.equal(brand.workspace, brand.blue, 'navigation and workspace accents stay blue');
    await page.getByLabel('Weekly participation goal').selectOption('4');
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Try the practice' }).click();
    await page.getByRole('radio', { name: 'A host warmly invites a visiting neighbour to join the family.' }).check();
    await page.getByRole('button', { name: 'Complete practice' }).click();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole('button', { name: 'Practise again' }).count(), 1);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `studio-home-${width}.png`), fullPage: true });
    if (width === 1440 || width === 390) await page.screenshot({ path: resolve(output, width === 1440 ? 'studio-home-desktop.png' : 'studio-home-phone.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `home overflow at ${width}`);
    await page.goto(base + '/contributor/preview/assignment/everyday?item=e6', { waitUntil: 'domcontentloaded' });
    await page.getByRole('navigation', { name: 'Contribution sections' }).waitFor();
    await page.getByRole('button', { name: /Translate/ }).click();
    await page.locator('.cw-translation').fill('[Browser test translation ɛ́ŋɔ]');
    await page.getByRole('button', { name: /Context/ }).click();
    await page.getByLabel('Who says it?').fill('A family member');
    await page.getByLabel('To whom?').fill('A younger relative');
    await page.getByLabel('In what situation?').fill('Sharing advice at home');
    await page.getByLabel('Usage note', { exact: false }).fill('TEST FIXTURE ONLY. Describes a family conversation.');
    await page.getByRole('button', { name: 'Add an alternative' }).click();
    await page.getByLabel('Alternative 1', { exact: true }).fill('[Browser test alternative]');
    await page.getByLabel('Difference for alternative 1').selectOption('polite');
    await page.getByText('Saved', { exact: true }).waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `studio-context-${width}.png`), fullPage: true });
    if (width === 1440 || width === 390) {
      await page.locator('.cq-editor-nav').evaluate(node => scrollTo(0, node.getBoundingClientRect().top + scrollY - 90));
      await page.screenshot({ path: resolve(output, width === 1440 ? 'studio-context-desktop.png' : 'studio-context-phone.png') });
    }
    await page.getByRole('button', { name: /Check & send/ }).click();
    await page.getByLabel('I have permission to share this expression').check();
    await page.getByText('Saved', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `editor overflow at ${width}`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `studio-check-${width}.png`), fullPage: true });
    if (width === 390) { await page.locator('.cq-editor-nav').evaluate(node => scrollTo(0, node.getBoundingClientRect().top + scrollY - 90)); await page.screenshot({ path: resolve(output, 'studio-check-phone.png') }); }
    await page.getByRole('button', { name: 'Submit for review' }).click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Back to editing' }).click();
    assert.equal(await page.locator('.contributor-review-dialog').isVisible(), false);
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await dialog.getByRole('button', { name: 'Confirm submission' }).click();
    await page.getByText('“We learn from those who came before us.” was sent to the Review Desk.').waitFor();
    await page.getByRole('button', { name: /Context/ }).click();
    await page.screenshot({ path: resolve(output, `studio-editor-${width}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `next expression overflow at ${width}`);
    if (width === 1440 || width === 390) {
      for (let index = 0; index < 2; index++) {
        await page.getByRole('button', { name: /Translate/ }).click();
        await page.locator('.cw-translation').fill(`[Sample session translation ${index + 2}]`);
        await page.getByRole('button', { name: /Check & send/ }).click();
        await page.getByLabel('I have permission to share this expression').check();
        await page.getByText('Saved', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Submit for review' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Confirm submission' }).click();
        if (index === 0) await page.getByText('“I will see you tomorrow.” was sent to the Review Desk.').waitFor();
      }
      await page.getByRole('heading', { name: 'A thoughtful session, complete.' }).waitFor();
      await page.getByRole('button', { name: 'Start another session' }).click();
      await page.getByText('Reviewer feedback', { exact: true }).waitFor();
      assert.equal(await page.locator('.cq-session-complete').count(), 0);
      assert.ok(await page.locator('.cw-editor__expression').innerText().then(text => text.includes('Please come and sit with us.')));
    }
    if (width < 1024) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.locator('.ts-sidebar a[href="/contributor/preview"]').click();
    await page.getByRole('heading', { name: 'A little, often.' }).waitFor();
    await page.waitForTimeout(200);
    assert.equal(await page.getByLabel('Weekly participation goal').inputValue(), '3', 'assignment preview started with its own fresh sample state');
    if (width === 1440) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('.ts-topbar__display').click();
      const preferences = page.getByRole('complementary', { name: 'Display preferences' });
      await preferences.getByRole('button', { name: 'On', exact: true }).click();
      await page.waitForFunction(() => document.documentElement.dataset.motion === 'on');
      assert.equal(await page.locator('.cq-art-liquid path').first().evaluate(node => getComputedStyle(node).animationName), 'cq-wave', 'normal motion animates the approved-work vessel');
      await preferences.getByRole('button', { name: 'Dark', exact: true }).click();
      await preferences.getByRole('button', { name: 'Off', exact: true }).click();
      await page.waitForFunction(() => document.documentElement.dataset.motion === 'off');
      await preferences.getByRole('button', { name: 'Close display preferences' }).click();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: resolve(output, 'studio-home-dark.png'), fullPage: true });
      assert.equal(await page.locator('.cq-art-liquid path').first().evaluate(node => getComputedStyle(node).animationName), 'none', 'motion-off stops decorative animation');
    }
    await context.close();
    console.log(`Verified home, practice, section editing, autosave, review confirmation and next task at ${width}px.`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
