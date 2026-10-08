import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const origin=process.env.GRAMMAR_PREVIEW_URL || 'http://127.0.0.1:5180';
const images='apps/updates-blog/posts/2026-10-08-kasem-basic-grammar-book/images';
const book=JSON.parse(readFileSync('data/grammar-book-seed/book.json','utf8'));
mkdirSync(images,{recursive:true});
const browser=await chromium.launch({executablePath,headless:true});
try {
  for(const [name,width,height] of [['desktop',1440,1050],['mobile',390,844]]) {
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/grammar-guide.html');
    assert.equal(await page.locator('#rules details').count(),56);
    assert.equal(await page.locator('#chapters details[id^=chapter]').count(),9);
    assert.equal(await page.locator('#chapters table').count(),12);
    assert.equal(await page.locator('#example-table tbody tr').count(),book.examples.length);
    assert.equal(await page.locator('#word-table tbody tr').count(),book.entries.length);
    await page.screenshot({path:images+'/grammar-guide-'+name+'.png'});
    await page.locator('#rule-future-continuous summary').click();
    assert.match(await page.locator('#rule-future-continuous').innerText(),/wó ta/);
    if(name==='desktop')await page.locator('#rule-future-continuous').screenshot({path:images+'/future-continuous-rule.png'});
    await page.locator('#example-filter').fill('I didn’t sweep');
    assert.equal(await page.locator('#example-table tbody tr:visible').count(),1);
    await page.locator('#example-filter').fill('no such printed sentence');
    assert.equal(await page.locator('#example-table tbody tr:visible').count(),0);
    await page.locator('#word-filter').fill('badwoni');
    assert.ok(await page.locator('#word-table tbody tr:visible').count()>0);
    await page.locator('#word-filter').fill('no such word');
    assert.equal(await page.locator('#word-table tbody tr:visible').count(),0);
    await page.locator('#chapter-8 summary').click();
    assert.equal(await page.locator('#chapter-8 table tbody tr').count(),19);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page fits viewport, including source tables');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log(`Verified 56 rules, nine chapters, twelve tables, ${book.examples.length} examples, ${book.entries.length} word/form records, filtering and phone width. Saved actual product screenshots.`);
}finally{await browser.close();}
