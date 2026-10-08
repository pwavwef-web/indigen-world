import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const origin=process.env.ORTHOGRAPHY_PREVIEW_URL || 'http://127.0.0.1:5180';
const images='apps/updates-blog/posts/2026-10-08-kasem-orthography-book/images';
mkdirSync(images,{recursive:true});
const browser=await chromium.launch({executablePath,headless:true});
try {
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/spelling-guide.html');
    assert.equal(await page.locator('#rules details').count(),28);
    await page.locator('#alphabet summary').click();
    await page.screenshot({path:images+'/spelling-guide-'+name+'.png',fullPage:false});
    await page.locator('#word-filter').fill('manlaataŋa');
    assert.ok(await page.locator('#word-table tbody tr:visible').count()>=1);
    await page.locator('#word-filter').fill('this-is-not-a-word');
    assert.equal(await page.locator('#word-table tbody tr:visible').count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page fits viewport');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Verified 28 spelling rules, vocabulary filtering, mobile width and desktop/mobile screenshots.');
}finally{await browser.close();}
