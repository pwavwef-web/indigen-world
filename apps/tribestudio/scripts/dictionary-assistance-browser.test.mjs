import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { dictionaryCandidates, createDictionaryIndex, dictionaryMatches, sourceRecommendations } from '../../../services/functions/lib/dictionary-assistance.js';

const base = process.env.STUDIO_PREVIEW_URL ?? 'http://127.0.0.1:5199';
const fixture = JSON.parse(readFileSync(new URL('../../../firebase/tests/fixtures/translation-dictionary.json', import.meta.url)));
const entries = fixture.entries.flatMap(({ id, ...data }) => dictionaryCandidates(id, data));
const index = createDictionaryIndex(entries);
const output = resolve('apps/updates-blog/posts/2026-10-18-dictionary-guided-translations/screens');
mkdirSync(output, { recursive: true });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    let fail = false, delay = false, pending = false, submitted;
    let releaseLookup;
    const calls = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.pathname.endsWith('/getKasemDictionaryAssistance')) {
        const { source = '', terms = [] } = route.request().postDataJSON().data; calls.push({ source, terms });
        if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Test outage' } }) });
        if (delay && terms.length) await new Promise(resolve => { releaseLookup = resolve; });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { results: dictionaryMatches(terms, index, true), recommendations: sourceRecommendations(source, entries), complete: true } }) });
      }
      if (url.pathname.endsWith('/getKasemWordSubmissionStatus')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { status: pending ? 'pending' : 'available' } }) });
      if (url.pathname.endsWith('/submitCollectionContribution')) { submitted = route.request().postDataJSON().data; pending = true; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { status: 'SUBMITTED' } }) }); }
      return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/contributor/preview/assignment/everyday?item=e9');
    await page.getByRole('button', { name: 'Insert Bakeira: Boy', exact: true }).waitFor();
    await page.screenshot({ path: resolve(output, `dictionary-words-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    const field = page.locator('.cw-translation');
    // Insertion also opens the Translate section and preserves native history.
    await page.getByRole('button', { name: 'Insert Bakeira: Boy', exact: true }).click();
    await field.waitFor({ state: 'visible' }); assert.equal(await field.inputValue(), 'Bakeira');
    await field.press('Control+z'); assert.equal(await field.inputValue(), '');
    await field.press('Control+Shift+z'); assert.equal(await field.inputValue(), 'Bakeira');
    await field.fill('vei vei, deem.');
    await page.waitForFunction(() => document.querySelectorAll('.ks-missing').length === 3);
    const beforeCalls = calls.filter(c => c.terms.length).length;
    await field.focus(); await field.evaluate(el => el.setSelectionRange(4, 4));
    await page.getByRole('button', { name: 'Insert sɔŋɔ: home', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cw-translation')?.value === 'vei sɔŋɔ vei, deem.');
    assert.equal(await field.inputValue(), 'vei sɔŋɔ vei, deem.', 'insert at stored cursor, not end');
    await field.press('Control+z'); assert.equal(await field.inputValue(), 'vei vei, deem.');
    await page.waitForFunction(() => document.querySelectorAll('.ks-missing').length === 3);
    await field.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const box = await page.locator('.ks-missing').nth(1).boundingBox();
    if (mobile) await page.touchscreen.tap(box.x + 8, box.y + 8); else await page.mouse.click(box.x + 8, box.y + 8);
    const popup = page.getByRole('dialog', { name: 'Dictionary assistance for vei', exact: true }); await popup.waitFor();
    assert.ok(await popup.getByRole('button', { name: 'Replace this occurrence with vei', exact: true }).count() === 2, 'same spelling retains separate meanings');
    await popup.getByText('went, past', { exact: true }).waitFor();
    assert.ok(await popup.locator('mark').count() >= 2, 'actual tone graphemes emphasized');
    await page.screenshot({ path: resolve(output, `tone-review-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    await popup.getByRole('button', { name: 'Replace this occurrence with vèi', exact: true }).click();
    assert.equal(await field.inputValue(), 'vei vèi, deem.', 'only second occurrence before punctuation replaced');
    await field.press('Control+z'); assert.equal(await field.inputValue(), 'vei vei, deem.');
    await field.press('Control+Shift+z'); assert.equal(await field.inputValue(), 'vei vèi, deem.');
    await field.evaluate(el => el.setSelectionRange(0, 0)); await field.press('Alt+ArrowDown');
    await page.getByRole('button', { name: 'Keep my spelling for this occurrence', exact: true }).click();
    assert.equal(await field.inputValue(), 'vei vèi, deem.');
    await page.waitForFunction(() => document.querySelectorAll('.ks-missing').length === 1);
    await field.press('End'); await field.press('Space'); await field.press('x');
    await page.waitForTimeout(750);
    assert.equal(await page.locator('.ks-missing').filter({ hasText: /^vei$/ }).count(), 0, 'dismissed occurrence stays quiet through unrelated edits');
    // Toggle preferences while editing; no sentence rewrite.
    const settings = page.locator('.da-settings'); await settings.locator('summary').click();
    await settings.getByLabel('Tone-mark highlighting', { exact: true }).uncheck(); assert.equal(await page.locator('.ks-missing').count(), 0);
    const unchanged = await field.inputValue(); await settings.getByLabel('Dictionary suggestions', { exact: true }).uncheck(); assert.equal(await field.inputValue(), unchanged);
    await settings.getByLabel('Dictionary suggestions', { exact: true }).check(); await settings.getByLabel('Tone-mark highlighting', { exact: true }).check();
    await settings.locator('summary').click();
    // A late reply cannot paint removed words or replace a changed selection.
    delay = true; await field.fill('deem veinew');
    await page.waitForTimeout(850); await field.fill('');
    releaseLookup?.(); delay = false; await page.waitForTimeout(300); assert.equal(await page.locator('.ks-missing').count(), 0);
    // Offline is unknown, never a false dictionary gap, and writing remains usable.
    fail = true; await field.fill('offlinefixture'); await page.waitForTimeout(850);
    assert.equal(await page.locator('.ks-missing').count(), 0); assert.equal(await field.inputValue(), 'offlinefixture');
    fail = false; await field.fill('vei Newwordfixture');
    await page.waitForFunction(() => document.querySelectorAll('.ks-missing').length === 2);
    await field.dispatchEvent('compositionstart'); assert.equal(await page.locator('.ks-missing').count(), 0);
    await field.dispatchEvent('compositionend');
    // The normal review stage remains available with unknown words.
    await page.getByRole('button', { name: /4 Check & send/ }).click();
    const review = page.locator('#contribution-section-3 .da-review'); await review.getByText('◉ Review suggested: 1', { exact: true }).waitFor();
    await review.getByRole('button', { name: 'Nominate “Newwordfixture”', exact: true }).click();
    const form = page.locator('.ks-word-dialog');
    await form.getByLabel('Kasem word', { exact: true }).fill('Newwordfixture');
    await form.getByLabel('Meaning in English').fill('TEST ONLY nomination; no live record');
    await form.getByLabel('Word class').selectOption('noun'); await form.getByLabel(/^Dialect/).selectOption('Navrongo');
    await form.getByLabel('Source and attribution').fill('TEST ONLY browser exercise');
    await form.getByLabel(/I have permission/).check(); await form.getByRole('button', { name: 'Submit word for review', exact: true }).click();
    await form.getByText(/Sent for review/).waitFor(); assert.equal(submitted.body, 'Newwordfixture'); assert.equal(submitted.spellingAssistance, true);
    await form.getByRole('button', { name: 'Return to my contribution' }).click();
    assert.equal(await field.inputValue(), 'vei Newwordfixture', 'nomination never rewrites translation');
    await page.screenshot({ path: resolve(output, `dictionary-review-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    await page.getByLabel('I have permission to share this expression').check();
    const submit = page.getByRole('button', { name: 'Submit for review →', exact: true });
    await submit.click(); await page.getByRole('dialog', { name: 'Review your submission' }).waitFor();
    const refreshedSource = page.waitForRequest(request => request.url().endsWith('/getKasemDictionaryAssistance') && Boolean(request.postDataJSON()?.data?.source) && request.postDataJSON().data.source !== 'The boy is going home.');
    await page.getByRole('button', { name: 'Confirm submission', exact: true }).click();
    await page.locator('.cq-confirmation').waitFor();
    await refreshedSource;
    assert.ok(calls.filter(c => c.terms.length).every(c => c.terms.length <= 80));
    assert.ok(beforeCalls <= 2, 'coalesced debounced lookups');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow');
    assert.ok(calls.some(c => c.source && c.source !== 'The boy is going home.'), 'source recommendations refresh after normal submit-and-next');
    fail = true;
    await page.goto(base + '/contributor/preview/assignment/everyday?item=e7');
    await page.getByText('Dictionary help is unavailable. You can keep writing and submit.', { exact: false }).waitFor();
    fail = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByText('No close English meaning matches found. Translate in your own words.', { exact: true }).waitFor();
    console.log(`${mobile ? 'Mobile 390px' : 'Desktop 1440px'}: actual vocabulary, cursor insertion, tone ambiguity, selected occurrence, punctuation, undo/redo, dismissal, settings, stale reply, offline, IME, nomination and normal review submission passed`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
