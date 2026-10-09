import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const chrome=process.env.CHROMIUM_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!chrome) throw Error('Set CHROMIUM_EXECUTABLE to a local Chromium browser.');
const studio=process.env.STUDIO_PREVIEW_URL || 'http://127.0.0.1:5199';
const reader=process.env.DICTIONARY_PREVIEW_URL || 'http://127.0.0.1:5201';
const website=process.env.PROGRESS_PREVIEW_URL || 'http://127.0.0.1:5200';
const output=process.env.SHIPPING_EVIDENCE_DIR || resolve(import.meta.dirname,'../.tooling/ten-shipping/screenshots');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:chrome,headless:true});
const errors=[];
const capture=async(page,name)=>{await page.screenshot({path:resolve(output,name+'.png'),fullPage:!name.startsWith('draft-recovery') && !name.startsWith('reference-phone'),timeout:90_000});};
const fits=async page=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document must fit viewport');
try {
 for(const [label,width,height] of [['phone',390,844],['tablet',768,1024],['desktop',1440,1000]]) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  // No production Firebase, analytics or private data are contacted by captures.
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(studio+'/contributor/preview/contributions');
  await page.locator('.cw-timeline').first().waitFor();
  await page.getByRole('button',{name:/^Needs revision/}).first().click();
  await page.locator('.cw-timeline summary').first().click();
  assert.match(await page.locator('.cw-timeline').first().innerText(),/Rejected/);
  await fits(page);await capture(page,'contributions-'+label);
  await page.goto(studio+'/contributor/preview/corpus');
  await page.getByRole('button',{name:'New record',exact:true}).click();
  await page.getByLabel('Original Kasem', {exact:false}).fill('TEST ONLY ɛ ɔ ŋ');
  await page.reload();
  await page.getByRole('button',{name:'New record',exact:true}).click();
  await page.getByRole('button',{name:'Continue draft',exact:true}).click();
  assert.equal(await page.getByLabel('Original Kasem', {exact:false}).inputValue(),'TEST ONLY ɛ ɔ ŋ');
  assert.equal(await page.locator('#kw-permissions-sourceConfirmed').isChecked(),false);
  await fits(page);await capture(page,'draft-recovery-'+label);
  await page.goto(reader+'/?collection=illustrations');
  await page.locator('.word-card').first().waitFor();
  if(width<701) await page.locator('.word-card').first().click();
  await page.locator('.source-note summary').click();
  const link=page.getByRole('link',{name:'Open the book reference and its illustrations in context'});
  await link.waitFor();assert.match(await link.getAttribute('href'),/grammar-guide\.html#block-530/);
  await fits(page);await capture(page,'reference-'+label);
  if(width<701) {
   assert.equal(await page.locator('.browse-panel').evaluate(node=>node.inert),true,'modal background is inert');
   await page.locator('.definition-panel .knowledge-link').focus(); await page.keyboard.press('Tab');
   assert.equal(await page.getByRole('button',{name:'← Results',exact:true}).evaluate(node=>node===document.activeElement),true,'Tab wraps within the source modal');
   await page.getByRole('button',{name:'← Results',exact:true}).click();
   assert.equal(await page.getByRole('dialog').count(),0);
  }
  await page.keyboard.press('Control+k');
  assert.equal(await page.getByPlaceholder('Search Kasem or English').evaluate(node=>node===document.activeElement),true);
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await context.addInitScript(()=>localStorage.setItem('iw_progress_vessel_view_mode','vertical'));
 const page=await context.newPage();
 await page.goto(website+'/progress');
 await page.locator('.progress-offline-contributions a').first().waitFor();
 assert.equal(await page.locator('.progress-offline-contributions a').count(),10,'offline counts retain all contribution paths');
 await page.getByRole('button',{name:'Options',exact:true}).click();
 await page.getByRole('button',{name:'Preview sample targets',exact:true}).click();
 await page.locator('.floating-vessel').first().waitFor();
 const routes=await page.locator('.floating-vessel-cta').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.getAttribute('href')).filter(Boolean))]);
 assert.equal(routes.length,10,'every jar has its own configured destination');
 for(const href of routes) {
  const destination=new URL(href);
  assert.match(destination.pathname,/^\/studio\/(dictionary|expressions|knowledge|submissions\/new)$/);
  await page.goto(studio+destination.pathname+destination.search);
  await page.getByRole('button',{name:/Google/}).first().waitFor();
  assert.equal(new URL(page.url()).search,destination.search,'sign-in retains category destination');
 }
 await context.close();
 assert.deepEqual(errors,[],'no page exceptions');
 console.log('Passed: three widths, explicit refresh recovery, original Unicode, consent reset, timeline, source anchors, modal return, keyboard search, ten signed-out CTA destinations and reduced-motion contexts. Captures use existing synthetic previews; authenticated server decisions are covered separately in the emulator.');
} finally {await browser.close();}
