/**
 * The Indigen Forms review desk in a real browser, against the development
 * preview (/contributor/preview/forms-review, fixture in
 * src/contributor/forms/review/review-preview.ts). Needs the dev server:
 *
 *   npm run dev --workspace @indigen-world/tribestudio -- --host 127.0.0.1 --port 5199 --strictPort
 *   node apps/tribestudio/scripts/forms-review-browser.test.mjs
 *
 * Every request that is not to the local dev server is aborted. The "[test]"
 * strings are runs of letters and tone marks, not invented Kasem words.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.STUDIO_PREVIEW_URL ?? 'http://127.0.0.1:5199';
const desk = `${base}/contributor/preview/forms-review?desk=forms`;
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const output = resolve(import.meta.dirname, '../../../outputs/indigen-forms-review');
mkdirSync(output, { recursive: true });

// The fixture's tone run, and feedback typed with a tone mark, a decomposed letter and a trailing space.
const TONE_RUN = '[test] \u025B\u0301 \u0254\u0300 \u014B \u028B\u0301 \u0269\u0300 \u00E0 a\u0300';
const FEEDBACK = 'Please add the author\u2019s written permission, and say which page is which. [test] \u025B\u0301 a\u0300 ';

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
    return route.abort();
  });
  const page = await context.newPage();
  const state = { leave: false };
  page.on('pageerror', (error) => errors.push(`${viewport.width}px: ${error.message}`));
  page.on('dialog', (dialog) => { dialogs.push(dialog.message()); void (state.leave ? dialog.accept() : dialog.dismiss()); });
  await page.goto(desk);
  await page.getByRole('heading', { level: 1, name: 'Form responses' }).waitFor();
  return { context, page, state };
}

async function noSideScroll(page, label) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 0.5);
  assert.equal(ok, true, `${label}: the page must not scroll sideways`);
}

const fixture = (page) => page.evaluate(() => window.__iwfReviewPreview.decisions());
const focusedId = (page) => page.evaluate(() => document.activeElement?.id ?? '');
const shot = (page, name) => page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false });
const queueItem = (page, reference) => page.locator('.rv-queue__item', { hasText: reference });
const choice = (page, label) => page.locator('.rv-choice', { hasText: label });
const decideButton = (page) => page.locator('.fr-decide button[type="submit"]');

async function openItem(page, reference, title) {
  await queueItem(page, reference).click();
  await page.getByRole('heading', { level: 2, name: title }).waitFor();
  await page.locator('[data-testid="review-reference"]', { hasText: reference }).waitFor();
}

async function queueReferences(page) {
  await page.locator('.rv-queue__item').first().waitFor();
  return page.locator('.rv-queue__item .fr-ref').allInnerTexts();
}

/* -- Desktop: the whole review flow ---------------------------------------------------------------- */
{
  const label = '1366px';
  const { context, page, state } = await open({ width: 1366, height: 900 });

  // Queue: waiting responses only, oldest first; own work and another group's form are not listed.
  assert.deepEqual(await queueReferences(page), ['IWF-PREV-0101', 'IWF-PREV-0102', 'IWF-PREV-0103'], `${label}: open queue, oldest first`);
  assert.equal(await page.getByRole('button', { name: /^Awaiting review/ }).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.ts-chip[aria-pressed="true"] .ts-count').innerText(), /^3$/);
  // Search by reference id.
  await page.getByRole('searchbox', { name: 'Search by reference ID' }).fill('prev-0103');
  assert.deepEqual(await page.locator('.rv-queue__item .fr-ref').allInnerTexts(), ['IWF-PREV-0103'], `${label}: search by reference id`);
  await page.getByRole('searchbox', { name: 'Search by reference ID' }).fill('');
  await noSideScroll(page, `${label} queue`);
  await shot(page, 'queue-1366');
  pass(`${label}: the queue lists waiting responses oldest first and searches by reference ID`);

  // Open the word collection response.
  await openItem(page, 'IWF-PREV-0101', 'Kasem word collection');
  assert.match(page.url(), /[?&]item=preview_rv_word(&|$)/, `${label}: the open response is in the address`);
  const instructions = await page.locator('.fr-instructions__text').textContent();
  assert.equal(instructions, 'Check the spelling and tone marks against the contributor\u2019s variety. Request changes rather than correcting the spelling yourself.', `${label}: review instructions verbatim`);
  assert.ok(await page.evaluate((run) => document.querySelector('.iwf-view')?.textContent?.includes(run), TONE_RUN), `${label}: answers keep tone marks byte for byte`);
  assert.equal(await page.locator('.fr-consent', { hasText: 'Internal review' }).locator('.fr-consent__wording').textContent(),
    'I agree that Indigen World reviewers may assess this word, its examples and any recording.', `${label}: consent wording as shown on the form`);
  assert.match(await page.locator('.fr-consent', { hasText: 'Public sharing' }).innerText(), /Not granted/);
  await page.locator('.fm-timeline__item', { hasText: 'Submitted' }).first().waitFor();
  pass(`${label}: the response shows instructions, exact answers, consent wording and history`);

  // Attachments open through attachmentLink in a new tab.
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Open pronunciation.webm' }).click(),
  ]);
  await popup.waitForURL(/^blob:/);
  await popup.close();
  pass(`${label}: an attachment opens through a short-lived link in a new tab`);

  // Approve is blocked until every reviewer check is ticked.
  await choice(page, 'Approve').click();
  await page.locator('.fr-points', { hasText: '+5 points on approval' }).waitFor();
  assert.match(await page.locator('.fr-effect').innerText(), /dictionary candidate is added to the review desk/);
  await decideButton(page).click();
  await page.locator('.fr-checks .ts-error', { hasText: 'Tick all 3 reviewer checks before approving.' }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, `${label}: no confirmation while checks are missing`);
  assert.match(await focusedId(page), /-check-spelling$/, `${label}: focus moves to the first unticked check`);
  await page.getByRole('checkbox', { name: 'Spelling and tone marks checked' }).check();
  await page.getByRole('checkbox', { name: 'Meaning is accurate' }).check();
  await decideButton(page).click();
  await page.locator('.fr-checks .ts-error', { hasText: 'Still to confirm: Examples use the word correctly.' }).waitFor();
  assert.match(await focusedId(page), /-check-example$/);
  assert.equal((await fixture(page)).length, 0, `${label}: nothing recorded while blocked`);
  await page.getByRole('checkbox', { name: 'Examples use the word correctly' }).check();
  assert.equal(await page.locator('.fr-checks .ts-error').count(), 0, `${label}: the error clears once every check is ticked`);
  await shot(page, 'approve-checks-1366');
  await decideButton(page).click();
  const approveDialog = page.getByRole('dialog', { name: 'Approve?' });
  await approveDialog.waitFor();
  assert.match(await approveDialog.innerText(), /\+5 points for the contributor/);
  await approveDialog.getByRole('button', { name: 'Approve response' }).click();
  await page.locator('.fr-notice', { hasText: 'Approved: IWF-PREV-0101' }).waitFor();
  let recorded = await fixture(page);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].decision, 'approve');
  assert.deepEqual(recorded[0].checks, ['spelling', 'meaning', 'example']);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('fr-notice')), true, `${label}: the result is announced where focus lands`);
  await page.getByRole('heading', { level: 2, name: 'Research and documents' }).waitFor();
  assert.match(page.url(), /[?&]item=preview_rv_documents(&|$)/, `${label}: the desk moves on to the next response`);
  await page.waitForFunction(() => document.querySelectorAll('.rv-queue__item').length === 2);
  assert.deepEqual(await queueReferences(page), ['IWF-PREV-0102', 'IWF-PREV-0103'], `${label}: the queue refreshed`);
  assert.match(await page.locator('.ts-chip[aria-pressed="true"] .ts-count').innerText(), /^2$/, `${label}: the count refreshed`);
  pass(`${label}: approval needs every check, confirms, records once and moves to the next response`);

  // Request changes needs feedback; a lost reply is retried with the same request id.
  await choice(page, 'Request changes').click();
  await decideButton(page).click();
  const feedback = page.getByRole('textbox', { name: /Feedback to the contributor/ });
  await page.locator('.fr-feedback-field .ts-error', { hasText: 'Write feedback for the contributor' }).waitFor();
  assert.equal(await feedback.getAttribute('aria-invalid'), 'true');
  assert.equal(await feedback.evaluate((element) => element === document.activeElement), true, `${label}: focus moves to the feedback`);
  assert.ok((await feedback.getAttribute('aria-describedby')).includes('-feedback-error'), `${label}: the error is announced with the field`);
  await feedback.fill('ok');
  await page.locator('.fr-feedback-field .ts-error', { hasText: 'at least 5 characters. It is 2 now.' }).waitFor();
  assert.match(await page.locator('.fr-counter').innerText(), /2 of at least 5 characters/);
  assert.equal(await page.getByRole('dialog').count(), 0);
  await feedback.fill(FEEDBACK);
  assert.equal(await feedback.inputValue(), FEEDBACK, `${label}: feedback is kept exactly as typed`);
  assert.equal(await page.locator('.fr-feedback-field .ts-error').count(), 0);
  await page.evaluate(() => window.__iwfReviewPreview.loseNextReply());
  await decideButton(page).click();
  const changesDialog = page.getByRole('dialog', { name: 'Request changes?' });
  await changesDialog.waitFor();
  assert.ok((await changesDialog.locator('.fm-multiline').textContent()).includes(FEEDBACK.trimEnd()), `${label}: the confirmation quotes the feedback`);
  await changesDialog.getByRole('button', { name: 'Send the request' }).click();
  await page.locator('.fr-decide .ts-notice', { hasText: 'Not confirmed yet' }).waitFor();
  assert.equal(await feedback.inputValue(), FEEDBACK, `${label}: the notes survive a failed send`);
  await page.getByRole('button', { name: 'Send again' }).click();
  await page.locator('.fr-notice', { hasText: 'Changes requested: IWF-PREV-0102' }).waitFor();
  assert.match(await page.locator('.fr-notice').innerText(), /nothing was recorded twice/);
  recorded = await fixture(page);
  assert.equal(recorded.length, 2, `${label}: a retried decision is recorded once`);
  assert.equal(recorded[1].decision, 'request_changes');
  assert.equal(recorded[1].feedback, FEEDBACK, `${label}: feedback reaches the server byte for byte`);
  pass(`${label}: request changes needs 5+ characters of feedback; a lost reply is resent with the same request id`);

  // The resubmitted translation: revision switcher and changed answers.
  await page.getByRole('heading', { level: 2, name: 'Sentence translation' }).waitFor();
  assert.ok(await page.locator('.iwf-changed').count() >= 2, `${label}: changed answers are marked`);
  const revision = page.getByRole('combobox', { name: 'Show revision' });
  await revision.selectOption('1');
  await page.getByRole('heading', { level: 3, name: 'Answers · revision 1' }).waitFor();
  assert.equal(await page.locator('.iwf-changed').count(), 0, `${label}: the first revision has nothing to compare`);
  await revision.selectOption('2');
  await page.getByRole('heading', { level: 3, name: 'Answers · revision 2' }).waitFor();
  pass(`${label}: revisions can be switched and changes are marked against the previous one`);

  // Leaving with a typed note asks first.
  const note = 'This translation keeps the meaning, but the tone marks are inconsistent.';
  await choice(page, 'Reject').click();
  await page.getByRole('textbox', { name: /Feedback to the contributor/ }).fill(note);
  const before = dialogs.length;
  await page.getByRole('button', { name: /^Approved/ }).click();
  assert.equal(dialogs.length, before + 1, `${label}: the leave guard asks`);
  assert.match(dialogs.at(-1), /feedback you typed has not been sent/);
  assert.match(page.url(), /[?&]item=preview_rv_translation(&|$)/, `${label}: staying keeps the response open`);
  assert.equal(await page.getByRole('textbox', { name: /Feedback to the contributor/ }).inputValue(), note);
  pass(`${label}: leaving with typed feedback asks first`);

  // Someone else changes it: the decision is refused as stale, the note is kept, and the latest version loads.
  await page.evaluate(() => window.__iwfReviewPreview.touch('preview_rv_translation'));
  await decideButton(page).click();
  await page.getByRole('dialog', { name: 'Reject?' }).getByRole('button', { name: 'Reject response' }).click();
  await page.locator('.fr-stale', { hasText: 'This response changed after you opened it' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: /Feedback to the contributor/ }).inputValue(), note, `${label}: the note is kept after a stale refusal`);
  assert.equal(await decideButton(page).isDisabled(), true, `${label}: decisions wait for the latest version`);
  assert.equal((await fixture(page)).length, 2);
  await shot(page, 'stale-1366');
  // Offered beside the decision, where the reviewer is, as well as above the response.
  assert.equal(await page.locator('.fr-stale').getByRole('button', { name: 'Load latest version' }).count(), 1);
  await page.locator('.fr-decide').getByRole('button', { name: 'Load latest version' }).click();
  await page.locator('.fr-stale').waitFor({ state: 'detached' });
  await page.locator('.fr-head .ts-badge', { hasText: 'Under review' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: /Feedback to the contributor/ }).inputValue(), note, `${label}: the note survives Load latest`);
  assert.equal(await page.getByRole('radio', { name: 'Reject' }).isChecked(), true);
  await decideButton(page).click();
  await page.getByRole('dialog', { name: 'Reject?' }).getByRole('button', { name: 'Reject response' }).click();
  await page.locator('.fr-notice', { hasText: 'Rejected: IWF-PREV-0103' }).waitFor();
  recorded = await fixture(page);
  assert.equal(recorded.length, 3);
  assert.equal(recorded[2].decision, 'reject');
  await page.locator('.rv-queue', { hasText: 'Nothing here: awaiting review' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('item'), null, `${label}: no response left to open`);
  pass(`${label}: a stale decision keeps the notes, Load latest refreshes, and the decision then records`);

  // Approved responses show their outcome.
  state.leave = true;
  await page.getByRole('button', { name: /^Approved/ }).click();
  await openItem(page, 'IWF-PREV-0101', 'Kasem word collection');
  await page.locator('.fr-outcome', { hasText: '5 points awarded to the contributor' }).waitFor();
  assert.match(await page.locator('.fr-outcome').innerText(), /Filed in Dictionary candidate entries/);
  await page.locator('.fr-decide-none', { hasText: 'No decision to make' }).waitFor();
  await shot(page, 'approved-outcome-1366');
  pass(`${label}: an approved response shows its points and filing`);

  // Direct links the reviewer may not open.
  await page.goto(`${desk}&item=preview_rv_admins`);
  await page.getByRole('alert').filter({ hasText: 'Another reviewer group reviews this form' }).waitFor();
  await page.goto(`${desk}&item=preview_rv_own`);
  await page.getByRole('alert').filter({ hasText: 'You cannot review your own response' }).waitFor();
  pass(`${label}: another group's form and the reviewer's own response are refused with an explanation`);

  await noSideScroll(page, `${label} end`);
  await context.close();
}

/* -- Phones: stacked queue and response, no sideways scrolling --------------------------------------- */
for (const width of [390, 360]) {
  const label = `${width}px`;
  const { context, page } = await open({ width, height: 844 });
  await noSideScroll(page, `${label} queue`);
  await openItem(page, 'IWF-PREV-0101', 'Kasem word collection');
  assert.equal(await page.locator('.rv-queue').isVisible(), false, `${label}: the queue gives way to the response`);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName === 'H2'), true, `${label}: focus moves to the response heading`);
  await noSideScroll(page, `${label} response`);
  if (width === 390) await shot(page, 'response-390');
  await choice(page, 'Approve').click();
  for (const name of ['Spelling and tone marks checked', 'Meaning is accurate', 'Examples use the word correctly']) {
    await page.getByRole('checkbox', { name }).check();
  }
  await decideButton(page).click();
  await page.getByRole('dialog', { name: 'Approve?' }).waitFor();
  await noSideScroll(page, `${label} confirmation`);
  if (width === 390) await shot(page, 'confirm-390');
  await page.getByRole('dialog', { name: 'Approve?' }).getByRole('button', { name: 'Approve response' }).click();
  await page.locator('.fr-notice', { hasText: 'Approved: IWF-PREV-0101' }).waitFor();
  await page.getByRole('heading', { level: 2, name: 'Research and documents' }).waitFor();
  assert.equal((await fixture(page)).length, 1);
  await page.getByRole('button', { name: 'Back to the queue' }).first().click();
  await page.locator('.rv-queue__item').first().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-response-id')), 'preview_rv_documents', `${label}: Back returns focus to the response left`);
  await noSideScroll(page, `${label} queue after a decision`);
  pass(`${label}: stacked queue and response with a back button, no sideways scrolling`);
  await context.close();
}

await browser.close();
assert.deepEqual(errors, [], 'no page errors');
for (const label of checks) console.log(`ok - ${label}`);
console.log(`\n${checks.length} checks passed; screenshots in ${output}`);
