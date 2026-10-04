const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('C:/Users/Francis Onai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dist = 'C:/Users/Francis Onai/.codex/worktrees/kassena-animation-release/indigen-world/apps/website/dist';
(async () => {
 for (const name of fs.readdirSync(path.join(dist, 'assets')).filter(name => name.startsWith('ProjectKasenaPage-') || /^index-.*\.css$/.test(name))) {
  const response = await fetch('https://indigenworld.com/assets/' + name);
  assert.equal(response.status, 200, 'Live asset ' + name);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(dist, 'assets', name)), 'Live asset matches release build');
 }
 const browser = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
 try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://indigenworld.com/project-kassena', {waitUntil: 'domcontentloaded'});
  await page.locator('.module-preview .page-motion--inline svg').waitFor();
  for (const width of [360, 900, 999, 1000, 1440, 1920]) {
   await page.setViewportSize({width, height: 1000});
   await page.waitForTimeout(800);
   const art = await page.locator('.page-motion').boundingBox();
   for (const selector of ['.kasena-copy', '.module-preview__header', '.module-preview__list', '.module-preview__note', '.module-preview__button']) {
    const content = await page.locator(selector).boundingBox();
    assert(art.x + art.width <= content.x + 1 || content.x + content.width <= art.x + 1 || art.y + art.height <= content.y + 1 || content.y + content.height <= art.y + 1, selector + ' overlaps at ' + width);
   }
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow at ' + width);
   if (width === 1440) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: 'output/kassena-layout/live-desktop.png'});
   }
   console.log('Live overlap and overflow checks passed at ' + width + 'px.');
  }
  await page.getByRole('button', {name: 'Pause animations', exact: true}).click();
  await page.getByRole('button', {name: 'Resume animations', exact: true}).waitFor();
  await page.getByRole('link', {name: 'Open the Kasem dictionary', exact: true}).click();
  await page.waitForURL('https://indigenworld.com/dictionary');
  assert.deepEqual(errors, []);
  console.log('Live release assets match; animation control and dictionary navigation pass.');
 } finally {await browser.close();}
})();
