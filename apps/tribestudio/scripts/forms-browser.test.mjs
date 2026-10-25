/**
 * Indigen Forms in the contributor portal, in a real browser, against the
 * development preview (/contributor/preview/forms, fixture in
 * src/contributor/forms/forms-preview.ts). Needs the dev server running:
 *
 *   npm run dev --workspace @indigen-world/tribestudio -- --host 127.0.0.1 --port 5199 --strictPort
 *   node apps/tribestudio/scripts/forms-browser.test.mjs
 *
 * Every request that is not to the local dev server is aborted, apart from
 * the two Kasem spelling callables, which are answered here. The Kasem text
 * typed below is a run of letters and tone marks, not an invented word.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { spellingKey } from '@indigen-world/contracts/kasem-spelling';

const base = process.env.STUDIO_PREVIEW_URL ?? 'http://127.0.0.1:5199';
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const output = resolve(import.meta.dirname, '../../../outputs/indigen-forms-contributor');
mkdirSync(output, { recursive: true });

// ɛ́ ɔ̀ ŋ ʋ́ ɩ̀, a precomposed à and a decomposed a + combining grave: they must survive byte for byte.
const TYPED = '[test] \u025B\u0301 \u0254\u0300 \u014B \u028B\u0301 \u0269\u0300 \u00E0 a\u0300 ';
// The letter bar then adds ɔ and a high tone mark at the caret.
const KASEM = `${TYPED}\u0254\u0301`;

const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const dialogs = [];
const checks = [];
const pass = (label) => checks.push(label);

async function open(viewport) {
  const mobile = viewport.width < 600;
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.pathname.endsWith('/checkKasemSpelling') || url.pathname.endsWith('/getKasemDictionaryAssistance')) {
      const data = route.request().postDataJSON()?.data ?? {};
      const words = data.words ?? data.terms ?? [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { results: words.map((word) => ({ key: spellingKey(word), status: 'approved', suggestions: [] })), recommendations: [], complete: true } }) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${viewport.width}px: ${error.message}`));
  page.on('dialog', (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  return { context, page };
}

async function noSideScroll(page, label) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 0.5);
  assert.equal(ok, true, `${label}: the page must not scroll sideways`);
}

const fixture = (page) => page.evaluate(() => window.__iwfFormsPreview.responses());
const shot = (page, name) => page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false });

/** Start the word collection and answer page by page; returns the reference id shown at the end. */
async function answerWordCollection(page, width, label, { upload = false } = {}) {
  await page.getByRole('link', { name: 'Start: Kasem word collection' }).click();
  await page.getByRole('heading', { level: 1, name: 'Kasem word collection' }).waitFor();
  await page.locator('.fm-sheet__where', { hasText: 'Section 1 of 3' }).waitFor();

  // Next on an empty page: the error summary takes focus and the question is marked invalid.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const summary = page.locator('.iwf-summary');
  await summary.waitFor();
  assert.match(await summary.innerText(), /Fix \d+ problems before you continue/);
  assert.equal(await summary.evaluate((element) => element === document.activeElement), true, `${label}: a failed Next focuses the error summary`);
  const word = page.getByRole('textbox', { name: 'Kasem word', exact: true });
  assert.equal(await word.getAttribute('aria-invalid'), 'true', `${label}: the word is marked invalid`);
  assert.ok((await word.getAttribute('aria-describedby') ?? '').includes('-err'), `${label}: the error is announced with the field`);
  await noSideScroll(page, `${label} errors`);
  if (width >= 1000) await shot(page, `fill-errors-${width}`);
  pass(`${label}: Next shows field errors and focuses the summary`);

  // Kasem with tone marks, typed and inserted from the letter bar, kept exactly.
  await word.fill(TYPED);
  const letters = page.getByRole('group', { name: 'Kasem letters for Kasem word' });
  await letters.getByRole('button', { name: 'open o', exact: true }).click();
  await letters.getByRole('button', { name: /^high tone mark/ }).click();
  assert.equal(await word.inputValue(), KASEM, `${label}: Kasem text is kept byte for byte`);
  assert.equal(await word.evaluate((element) => element === document.activeElement), true, `${label}: the caret returns to the answer`);
  await page.getByRole('textbox', { name: 'English meaning', exact: true }).fill('water (synthetic test answer)');
  await page.getByRole('combobox', { name: 'Kasem variety', exact: true }).selectOption('navrongo');
  // The summary drops problems as they are fixed, without moving focus while typing.
  assert.equal(await word.getAttribute('aria-invalid'), null, `${label}: a fixed answer is no longer invalid`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.fm-sheet__where', { hasText: 'Section 2 of 3' }).waitFor();
  assert.equal(await page.locator('.fm-sheet__where').evaluate((element) => element === document.activeElement), true, `${label}: focus moves to the new section`);

  await page.getByRole('textbox', { name: 'Example in Kasem', exact: true }).fill(`${TYPED}example`);
  await page.getByRole('radio', { name: 'I speak it' }).check();
  if (upload) {
    // The first upload saves a draft to get a response, then sends the file through the adapter.
    const pronunciation = page.locator('[data-field-id="pronunciation"]');
    await pronunciation.locator('input[type="file"]').setInputFiles({ name: 'say-it.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(4096, 7) });
    await pronunciation.getByRole('button', { name: /^Open\s+say-it\.mp3$/ }).waitFor();
    assert.match(page.url(), /\?response=preview_resp_new_\d+$/, `${label}: the upload saved a draft first`);
    pass(`${label}: an upload saves a draft first and attaches the file`);
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.fm-sheet__where', { hasText: 'Section 3 of 3' }).waitFor();

  // Back never loses answers.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('.fm-sheet__where', { hasText: 'Section 2 of 3' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Example in Kasem', exact: true }).inputValue(), `${TYPED}example`, `${label}: Back keeps answers`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.fm-sheet__where', { hasText: 'Section 3 of 3' }).waitFor();
  await page.locator('[data-field-id="consent_review"] input[type="checkbox"]').check();
  // Keeping a recording needs its own permission, asked only when there is one.
  assert.equal(await page.locator('[data-field-id="consent_storage"]').count(), upload ? 1 : 0, `${label}: the storage permission follows the recording`);
  if (upload) await page.locator('[data-field-id="consent_storage"] input[type="checkbox"]').check();
  // A recording also needs the speakers' permission before the dictionary can file it.
  if (upload) await page.locator('[data-field-id="speaker_permission"] input[type="checkbox"]').check();

  // Save draft: the response is created and the address continues it after a reload.
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.locator('.ts-save').getByText(/^Saved at /).waitFor();
  assert.match(page.url(), /\/contributor\/preview\/forms\/preview_words\?response=preview_resp_new_\d+$/, `${label}: the saved response is in the address`);
  pass(`${label}: Save draft creates the response and keeps the page`);

  await page.getByRole('button', { name: 'Review answers', exact: true }).click();
  const reviewTitle = page.getByRole('heading', { name: 'Check your answers before you submit' });
  await reviewTitle.waitFor();
  assert.equal(await reviewTitle.evaluate((element) => element === document.activeElement), true, `${label}: the review step takes focus`);
  assert.equal(await page.locator('.iwf-review').evaluate((element, expected) => element.textContent.includes(expected), KASEM), true, `${label}: the review shows the Kasem text exactly`);
  assert.match(await page.locator('.iwf-review').innerText(), /I agree that Indigen World reviewers may assess this word/, `${label}: consent wording is visible before submitting`);
  await noSideScroll(page, `${label} review`);
  if (width >= 1000) await shot(page, `review-${width}`);

  // A double click submits once.
  await page.getByRole('button', { name: 'Submit', exact: true }).dblclick();
  await page.getByRole('heading', { name: 'Response submitted' }).waitFor();
  const reference = (await page.getByTestId('reference-id').innerText()).trim();
  assert.match(reference, /^IWF-[0-9A-Z]{4}-[0-9A-Z]{4}$/, `${label}: a reference id is shown`);
  const words = (await fixture(page)).filter((row) => row.formId === 'preview_words');
  assert.equal(words.length, 1, `${label}: one response`);
  assert.equal(words[0].status, 'submitted');
  assert.equal(words[0].revision, 1, `${label}: a double click creates one submission`);
  await noSideScroll(page, `${label} confirmation`);
  await shot(page, `confirmation-${width}`);
  pass(`${label}: review, submit and confirmation with ${reference}`);
  return reference;
}

try {
  /* -- Desktop: the whole journey, including a lost reply ------------------------------------------- */
  {
    const width = 1366;
    const { context, page } = await open({ width, height: 900 });
    await page.goto(`${base}/contributor/preview/forms`);
    await page.getByRole('heading', { level: 1, name: 'Available forms' }).waitFor();
    await page.getByRole('heading', { name: 'Kasem word collection' }).waitFor();
    const nav = page.getByRole('navigation', { name: 'Contributor portal sections' });
    const navLink = nav.getByRole('link', { name: /Available forms/ });
    await navLink.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('a')].some((a) => /Available forms/.test(a.textContent ?? '') && /1/.test(a.textContent ?? '') && a.closest('nav')));
    assert.equal(await navLink.getAttribute('aria-current'), 'page', 'the sidebar marks Available forms');
    const translationCard = page.locator('article', { has: page.getByRole('heading', { name: 'Sentence translation' }) });
    assert.match(await translationCard.innerText(), /Changes requested/);
    const feedbackCard = page.locator('article', { has: page.getByRole('heading', { name: 'General feedback' }) });
    assert.match(await feedbackCard.innerText(), /Paused for now/);
    await feedbackCard.getByRole('link', { name: 'Continue draft: General feedback' }).waitFor();
    await noSideScroll(page, 'desktop list');
    await shot(page, `list-${width}`);
    pass('desktop: list shows open, paused and changes-requested forms with the attention badge');

    const reference = await answerWordCollection(page, width, 'desktop', { upload: true });
    assert.match(await page.locator('body').innerText(), /IWF-/);

    // Start another response: a fresh visit, and leaving unsaved answers asks first.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await crumbs.getByRole('link', { name: 'Available forms' }).click();
    await page.getByRole('link', { name: 'Start another response: Kasem word collection' }).click();
    await page.locator('.fm-sheet__where', { hasText: 'Section 1 of 3' }).waitFor();
    const another = page.getByRole('textbox', { name: 'Kasem word', exact: true });
    assert.equal(await another.inputValue(), '', 'another response starts empty');
    await another.fill('[test] ɛ̀');
    await crumbs.getByRole('link', { name: 'Available forms' }).click();
    await page.waitForTimeout(300);
    assert.match(dialogs.pop() ?? '', /not saved yet/, 'leaving with unsaved answers asks first');
    assert.match(page.url(), /\/forms\/preview_words\?new=1$/, 'declining keeps the contributor on the form');
    assert.equal(await another.inputValue(), '[test] ɛ̀');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.locator('.ts-save').getByText(/^Saved at /).waitFor();
    assert.match(page.url(), /\?response=preview_resp_new_\d+$/);
    await crumbs.getByRole('link', { name: 'Available forms' }).click();
    await page.getByRole('heading', { level: 1, name: 'Available forms' }).waitFor();
    assert.equal(dialogs.length, 0, 'a saved form leaves without asking');
    assert.match(await page.locator('article', { has: page.getByRole('heading', { name: 'Kasem word collection' }) }).innerText(), /Draft in progress/);
    pass('desktop: start another response, leave guard, saved draft listed');

    // My submissions → the response that needs changes → revise → resubmit.
    await page.getByRole('navigation', { name: 'Forms' }).getByRole('link', { name: /^My submissions/ }).click();
    await page.getByRole('heading', { name: 'Kasem word collection' }).first().waitFor();
    assert.match(await page.locator('.fm-rows').innerText(), new RegExp(reference));
    await page.getByRole('button', { name: /^Changes requested/ }).click();
    await page.locator('.fm-row--changes_requested').getByRole('link', { name: 'Sentence translation', exact: true }).click();
    await page.getByRole('heading', { level: 1, name: 'Sentence translation' }).waitFor();
    await page.getByRole('heading', { name: 'Feedback from the reviewer' }).waitFor();
    assert.match(await page.locator('.fm-status').innerText(), /asked for changes/);
    await noSideScroll(page, 'desktop detail');
    await shot(page, `detail-changes-${width}`);
    await page.getByRole('link', { name: 'Revise and resubmit' }).click();
    await page.getByRole('heading', { level: 1, name: 'Sentence translation' }).waitFor();
    await page.getByRole('heading', { name: 'Feedback from the reviewer' }).waitFor();
    const translation = page.getByRole('textbox', { name: 'Your translation', exact: true });
    assert.equal(await translation.inputValue(), '[Sample Kasem translation]', 'the submitted answers are loaded for revision');
    await translation.fill(`[Sample Kasem translation] ${TYPED}`);
    await page.getByRole('textbox', { name: 'Notes for reviewers', exact: true }).fill('Said to a guest arriving at home (synthetic note).');
    await page.getByRole('button', { name: 'Review answers', exact: true }).click();
    await page.getByRole('heading', { name: 'Check your answers before you submit' }).waitFor();

    // The reply to Resubmit is lost after the server has made the change: the retry replays the same request.
    await page.evaluate(() => window.__iwfFormsPreview.loseNextReply('submit'));
    await page.getByRole('button', { name: 'Resubmit', exact: true }).click();
    const unconfirmed = page.getByRole('alert').filter({ hasText: 'Your submission was not confirmed' });
    await unconfirmed.waitFor();
    assert.equal(await page.locator('[data-field-id="notes"] textarea').isDisabled(), true, 'the form is locked until the submission is confirmed');
    assert.equal(await page.getByRole('button', { name: 'Resubmit', exact: true }).isDisabled(), true, 'Resubmit waits for the unconfirmed request');
    await shot(page, `lost-reply-${width}`);
    await unconfirmed.getByRole('button', { name: 'Finish submitting' }).click();
    await page.getByRole('heading', { name: 'Response resubmitted' }).waitFor();
    assert.equal((await page.getByTestId('reference-id').innerText()).trim(), 'IWF-PREV-0001', 'a resubmission keeps its reference id');
    const revised = (await fixture(page)).find((row) => row.id === 'preview_resp_changes');
    assert.equal(revised.status, 'submitted');
    assert.equal(revised.revision, 2, 'the retried submit was replayed, not submitted twice');
    pass('desktop: changes requested → revise → resubmit, with a lost reply replayed once');

    // The attention badge clears, and the response page compares the two revisions.
    await page.waitForFunction(() => ![...document.querySelectorAll('nav a')].some((a) => /Available forms/.test(a.textContent ?? '') && /\d/.test(a.textContent ?? '')));
    await page.getByRole('link', { name: 'View this response' }).click();
    await page.getByRole('heading', { name: /Your answers · revision 2/ }).waitFor();
    assert.ok(await page.locator('.iwf-changed').count() >= 2, 'changed answers are marked against revision 1');
    await page.getByRole('combobox', { name: 'Show revision' }).selectOption('1');
    await page.getByRole('heading', { name: /Your answers · revision 1/ }).waitFor();
    assert.match(await page.locator('.fm-timeline').innerText(), /Indigen World reviewer/);
    assert.doesNotMatch(await page.locator('.fm-timeline').innerText(), /Sample Contributor/, 'history shows role names only');
    await noSideScroll(page, 'desktop detail after resubmit');
    await shot(page, `detail-resubmitted-${width}`);
    pass('desktop: response page with status, revisions, comparison and role-only history');

    // A deep link to an unknown form explains itself.
    await page.goto(`${base}/contributor/preview/forms/no_such_form`);
    await page.getByText('This form is not available', { exact: true }).waitFor();
    pass('desktop: unknown form link shows a clear page');
    await context.close();
  }

  /* -- Phones: 390 and 360 px ----------------------------------------------------------------------- */
  for (const width of [390, 360]) {
    const label = `${width}px`;
    const { context, page } = await open({ width, height: 800 });
    await page.goto(`${base}/contributor/preview/forms`);
    await page.getByRole('heading', { name: 'Kasem word collection' }).waitFor();
    await noSideScroll(page, `${label} list`);
    await shot(page, `list-${width}`);
    await answerWordCollection(page, width, label);
    await page.getByRole('link', { name: 'My submissions', exact: true }).first().click();
    await page.locator('.fm-rows').waitFor();
    await noSideScroll(page, `${label} my submissions`);
    await shot(page, `mine-${width}`);
    await page.locator('.fm-row--changes_requested').getByRole('link', { name: 'Sentence translation', exact: true }).click();
    await page.getByRole('heading', { name: 'Feedback from the reviewer' }).waitFor();
    await noSideScroll(page, `${label} detail`);
    await page.getByRole('link', { name: 'Revise and resubmit' }).click();
    await page.getByRole('textbox', { name: 'Your translation', exact: true }).waitFor();
    await noSideScroll(page, `${label} revise`);
    await shot(page, `revise-${width}`);
    pass(`${label}: list, fill, review, confirmation, my submissions, detail and revise fit the screen`);
    await context.close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  assert.deepEqual(dialogs, [], 'no unexpected leave prompts');
  for (const check of checks) console.log(`ok - ${check}`);
  console.log(`Indigen Forms contributor browser checks passed (${checks.length}). Screenshots: ${output}`);
} finally {
  await browser.close();
}
