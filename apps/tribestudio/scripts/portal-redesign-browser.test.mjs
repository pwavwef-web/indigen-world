import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const base = process.env.STUDIO_PREVIEW_URL || 'http://127.0.0.1:5199';
const output = resolve('apps/updates-blog/posts/2026-10-23-all-round-contributor-portal/screens');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1536, height: 1024 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    // Development fixture data are explicit. No production reads or writes.
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/contributor/preview');
    await page.getByRole('heading', { name: /Welcome back/ }).waitFor();
    await page.getByText('Loading submission counts…', { exact: true }).waitFor({ state: 'hidden' });
    await page.screenshot({ path: resolve(output, `home-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal page overflow');
    await page.getByRole('button', { name: 'Start contributing', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose a contribution' }); await dialog.waitFor();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'Start contributing', exact: true }).evaluate(el => document.activeElement === el), true, 'dialog restores invoking focus');
    const navigate = async label => {
      if (mobile) await page.getByRole('button', { name: 'Open navigation menu' }).click();
      await page.getByRole('navigation', { name: 'Contributor portal sections' }).getByRole('link', { name: label, exact: true }).click();
    };
    await navigate('Translate sentences');
    await page.getByLabel('Title *', { exact: true }).fill('Synthetic greeting');
    await page.getByLabel('Source sentence *', { exact: true }).fill('Where are you going?');
    await page.getByText('Your translation *', { exact: true }).locator('..').locator('textarea').fill('vèi sɔ́ŋɔ̀');
    await page.getByLabel('Source or author *', { exact: true }).fill('Synthetic preview author');
    await page.getByLabel('Ownership or permission *', { exact: true }).selectOption('own');
    await page.getByLabel('Internal review', { exact: false }).check();
    assert.equal(await page.getByLabel('Model training', { exact: false }).isChecked(), false);
    await navigate('Words & expressions');
    await page.getByLabel('Title *', { exact: true }).fill('Independent word draft');
    await navigate('Translate sentences');
    assert.equal(await page.getByLabel('Title *', { exact: true }).inputValue(), 'Synthetic greeting');
    assert.equal(await page.locator('.pw-editor textarea').nth(1).inputValue(), 'vèi sɔ́ŋɔ̀');
    await page.reload(); await page.getByLabel('Title *', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Title *', { exact: true }).inputValue(), 'Synthetic greeting', 'reload restores distinct workspace draft');
    await page.screenshot({ path: resolve(output, `translation-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    await page.getByRole('button', { name: 'Preview & submit', exact: true }).click();
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await page.getByRole('heading', { name: 'Awaiting review', exact: true }).waitFor();
    await page.getByRole('link', { name: 'View submission & history' }).click();
    await page.getByRole('dialog', { name: 'My submissions' }).waitFor();
    await page.getByText('Receipt', { exact: false }).count();
    await page.getByRole('region', { name: 'Contribution details' }).count();
    await page.screenshot({ path: resolve(output, `submission-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    await page.keyboard.press('Escape');
    await navigate('Documents & research');
    await page.getByLabel('Title *', { exact: true }).fill('Synthetic field notes');
    await page.getByLabel('Material type', { exact: true }).selectOption('Field notes');
    await page.getByLabel('Source or author *', { exact: true }).fill('Synthetic source author');
    await page.locator('input[type=file]').setInputFiles({ name: 'field-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic Kasem field notes: vèi sɔ́ŋɔ̀') });
    await page.getByText('Preview only · selected on this device, not uploaded.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Public sharing', { exact: false }).isChecked(), false);
    await page.screenshot({ path: resolve(output, `documents-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    await page.reload();
    await page.getByText(/Select these unfinished files again/).waitFor();
    assert.equal(await page.getByText('Preview only · selected on this device, not uploaded.', { exact: true }).count(), 0, 'filename never becomes an uploaded file');
    await page.goBack(); await page.goForward();
    await page.getByRole('heading', { name: 'Documents & research', exact: true }).waitFor();
    if (mobile) {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      const drawer = page.getByRole('complementary', { name: 'Contributor portal navigation' });
      const links = drawer.locator('a,button').filter({ visible: true });
      await links.last().focus(); await page.keyboard.press('Tab');
      assert.equal(await links.first().evaluate(el => document.activeElement === el), true, 'mobile drawer traps forward focus');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: 'Open navigation menu' }).evaluate(el => document.activeElement === el), true);
    }
    await page.goto(base + '/contributor/preview/material-review');
    await page.getByRole('heading', { name: 'Synthetic Kasem field notes' }).waitFor();
    await page.getByText('Machine extraction · unverified', { exact: true }).click();
    await page.getByText(/Tone marks stay intact/).waitFor();
    await page.screenshot({ path: resolve(output, `review-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Portal desktop/mobile: navigation, dialogs, focus, distinct Unicode drafts, reload, preview, receipt, upload recovery, back/forward passed.');
} finally { await browser.close(); }
