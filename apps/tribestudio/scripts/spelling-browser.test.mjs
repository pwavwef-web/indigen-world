import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { spellingKey } from '@indigen-world/contracts/kasem-spelling';

const base = process.env.STUDIO_PREVIEW_URL ?? 'http://127.0.0.1:5199';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const output = resolve(import.meta.dirname, '../../updates-blog/posts/2026-10-10-kasem-dictionary-assistance/images');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const fixture = new Set(['ni', 'ɛ́ŋɔ']);
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 1000 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    let fail = false, pending = false, submitted;
    const calls = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.pathname.endsWith('/checkKasemSpelling')) {
        const words = route.request().postDataJSON().data.words; calls.push(words);
        if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Test outage' } }) });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { results: words.map(word => ({ key: spellingKey(word), status: fixture.has(spellingKey(word)) ? 'approved' : 'missing', suggestions: word === 'nii' ? [{ id: 'fixture-ni', word: 'Ni' }] : [] })) } }) });
      }
      if (url.pathname.endsWith('/getKasemWordSubmissionStatus')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { status: pending ? 'pending' : 'available' } }) });
      if (url.pathname.endsWith('/submitCollectionContribution')) {
        submitted = route.request().postDataJSON().data; pending = true;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { status: 'SUBMITTED' } }) });
      }
      return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/contributor/preview/assignment/everyday?item=e6');
    const field = page.locator('.cw-translation'); await field.waitFor();
    await field.fill('Ni Nii Nii, ɛ\u0301ŋɔ.');
    await page.waitForFunction(() => document.querySelectorAll('.ks-missing').length === 2);
    assert.equal(await field.getAttribute('spellcheck'), 'false');
    assert.equal(await field.getAttribute('autocorrect'), 'off');
    assert.equal(await field.getAttribute('autocapitalize'), 'none');
    assert.equal(calls.length, 1, 'one debounced request');
    const wordRect = await page.locator('.ks-missing').nth(1).boundingBox();
    if (mobile) await page.touchscreen.tap(wordRect.x + 8, wordRect.y + 8); else await page.mouse.click(wordRect.x + 8, wordRect.y + 8);
    await page.getByRole('dialog', { name: 'Dictionary assistance for Nii' }).waitFor();
    await page.getByRole('button', { name: 'Replace this occurrence with Ni', exact: true }).click();
    assert.equal(await field.inputValue(), 'Ni Nii Ni, ɛ\u0301ŋɔ.', 'only the selected occurrence changes');
    await field.press('Control+z');
    assert.equal(await field.inputValue(), 'Ni Nii Nii, ɛ\u0301ŋɔ.', 'native undo restores suggestion replacement');
    await field.press('Control+Shift+z');
    assert.equal(await field.inputValue(), 'Ni Nii Ni, ɛ\u0301ŋɔ.', 'native redo retains surrounding text');
    await field.press('Alt+ArrowDown');
    await page.getByRole('dialog', { name: 'Dictionary assistance for Nii' }).waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.ks-popup').count(), 0);
    assert.equal(await field.evaluate(input => input === document.activeElement), true);
    await field.press('Alt+ArrowDown');
    await page.screenshot({ path: resolve(output, `dictionary-assistance-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('button', { name: 'Add to dictionary', exact: true }).click();
    const wordForm = page.locator('.ks-word-dialog'); await wordForm.getByLabel('Meaning in English').fill('Test fixture meaning');
    await wordForm.getByLabel('Word class').selectOption('noun'); await wordForm.getByLabel('Dialect').selectOption('Navrongo');
    await wordForm.getByLabel('Source and attribution').fill('TEST ONLY — browser fixture');
    await wordForm.getByLabel(/I have permission/).check();
    await wordForm.getByRole('button', { name: 'Submit word for review', exact: true }).click();
    await wordForm.getByText(/Sent for review/).waitFor();
    assert.equal(submitted.body, 'Nii'); assert.equal(submitted.lexicalKind, 'word');
    assert.equal(submitted.spellingAssistance, true); assert.equal(submitted.participantConsentConfirmed, true);
    await wordForm.getByRole('button', { name: 'Return to my contribution', exact: true }).click();
    assert.equal(await field.inputValue(), 'Ni Nii Ni, ɛ\u0301ŋɔ.', 'parent state survives submission');
    await field.press('Alt+ArrowDown'); await page.getByRole('button', { name: 'Add to dictionary', exact: true }).click();
    await wordForm.getByText(/already has a submission awaiting review/).waitFor();
    assert.equal(await wordForm.getByRole('button', { name: 'Submit word for review', exact: true }).count(), 0);
    await wordForm.getByRole('button', { name: 'Return to my contribution', exact: true }).click();
    fail = true; await field.fill('Outagefixture');
    await page.waitForTimeout(1200); assert.equal(await page.locator('.ks-missing').count(), 0, 'outage does not underline an unchecked word');
    fail = false; await field.fill('Newfixture');
    await page.waitForFunction(() => document.querySelectorAll('.ks-missing').length === 1);
    await field.dispatchEvent('compositionstart'); assert.equal(await page.locator('.ks-missing').count(), 0, 'composition suppresses decorations');
    await field.dispatchEvent('compositionend');
    console.log(`${mobile ? 'Mobile' : 'Desktop'}: click/tap, replacement, undo/redo, keyboard, submission, preservation, pending, outage and IME passed`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
