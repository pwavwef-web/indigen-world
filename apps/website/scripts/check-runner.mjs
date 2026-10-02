import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const website = path.join(root, 'apps/website');
const harness = path.join(website, '.runner-preview.html');
const entry = path.join(website, '.runner-preview.tsx');
const images = path.join(root, 'apps/updates-blog/posts/2026-10-02-word-trail/images');
const origin = process.env.RUNNER_PREVIEW_URL || 'http://127.0.0.1:5175';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
assert(executablePath, 'Chromium browser required');
fs.writeFileSync(harness, '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#eef1e5"><div id="root"></div><script type="module" src="/.runner-preview.tsx"></script></body></html>');
fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{RunnerWorkspace}from'/src/features/labs/runner';import'/src/features/labs/labs.css';createRoot(document.getElementById('root')).render(<div className="labs-root" style={{minHeight:'100vh',padding:'24px 16px',background:'#eef1e5'}}><main style={{maxWidth:700,margin:'auto',fontFamily:'Arial,sans-serif'}}><p style={{fontSize:10,letterSpacing:1.5}}>LOCAL PREVIEW · SIMULATED ACCOUNT & QUEUE</p><h1 style={{fontSize:36,marginBottom:8}}>Word Trail</h1><p>Run the trail. Keep your language moving.</p><section style={{padding:20,background:'#fffdf6',borderRadius:20}}><RunnerWorkspace/></section></main></div>);`);
const mock = `
import {LABS_REGISTRY} from '/@fs/${root.replaceAll('\\', '/')}/packages/contracts/labs.mjs';
const previewUser={uid:'local-preview',displayName:'Local development fixture'};
export function useLabsAccount(){return{user:previewUser,ready:true};}
export const loginGoogle=async()=>{};export const loginEmail=async()=>{};export const logout=async()=>{};
const word=(id='demo-river')=>({id,word:id==='demo-river'?'river':'tree',sentence:'Local development fixture: illustrative English prompt.',sentenceSource:'unattributed',attribution:null,tier:'core',rank:1,pendingCount:0});
const fresh=()=>({id:crypto.randomUUID(),uid:'local-preview',version:'0.1.0',section:1,phase:'ready',score:0,checkpoints:0,word:null,skippedWordIds:[],startedAt:null,updatedAt:new Date().toISOString(),lastReceipt:null});
export const errorMessage=e=>e.message;
export async function labsCall(action,data={}){
if(action==='bootstrap')return{experiments:LABS_REGISTRY,invited:[],canAdmin:false,aiEnabled:false,development:true};
let run=JSON.parse(localStorage.getItem('preview-trail')||'null')||fresh();
if(action==='runner'&&data.restart)run=fresh();
if(action==='beginRunnerSection')run.phase='running';
if(action==='runnerCheckpoint'){run.phase='checkpoint';run.score+=data.score;run.word=word();}
if(action==='runnerWord'){run.word=window.__empty?null:word('demo-tree');}
if(action==='submitRunnerWord'){
 if(window.__failSave)throw new Error('Simulated connection failure. Retry safely.');
 run.lastReceipt={section:run.section,wordId:run.word.id,contributionId:'preview-receipt',submissionId:'preview-receipt',translations:[data.translations],status:'SUBMITTED'};
 run.phase='ready';run.section++;run.score+=100;run.checkpoints++;run.word=null;
}
localStorage.setItem('preview-trail',JSON.stringify(run));return{run};}
`;
let browser;
try {
  fs.mkdirSync(images, { recursive: true });
  browser = await chromium.launch({ executablePath, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1250 } });
  await ctx.route('**/src/features/labs/api.ts*', route => route.fulfill({ contentType: 'application/javascript', body: mock }));
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${origin}/.runner-preview.html`);
  await page.getByRole('button', { name: 'Run section 1' }).waitFor();
  await page.getByRole('button', { name: 'Run section 1' }).click();
  await page.clock.runFor(2000);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedDistance = await page.locator('.trail-stats>div').nth(2).innerText();
  await page.clock.runFor(1000);
  assert.equal(await page.locator('.trail-stats>div').nth(2).innerText(), pausedDistance, 'Pause stops progress');
  await page.getByRole('button', { name: 'Resume run' }).click();
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Resume run' }).waitFor();
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Resume run' }).click();
  // Drive a safe lane through the deterministic first-section obstacle pattern.
  let lane = 1;
  for (let tenth = 20; tenth < 308; tenth += 2) {
    const time = tenth / 10, wave = Math.max(0, Math.floor((time - 4.1) / 1.8));
    const safe = ((wave * 2 + 1) % 3 + 1) % 3;
    while (lane < safe) { await page.keyboard.press('ArrowRight'); lane++; }
    while (lane > safe) { await page.keyboard.press('ArrowLeft'); lane--; }
    await page.clock.runFor(200);
    if (tenth === 60) await page.screenshot({ path: path.join(images, 'word-trail-desktop.png'), fullPage: true });
  }
  await page.getByRole('heading', { name: 'A word opens the way.' }).waitFor();
  assert.equal(await page.locator('.trail-controls').count(), 0, 'No movement controls at the gate');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile gate fits viewport');
  await page.screenshot({ path: path.join(images, 'word-trail-checkpoint-mobile.png'), fullPage: true });
  await page.getByLabel('Kasem translation', { exact: true }).fill('DEVELOPMENT ANSWER');
  await page.getByLabel('Word class', { exact: true }).selectOption('noun');
  await page.getByLabel('Dialect or community', { exact: true }).fill('Local fixture');
  await page.evaluate(() => { window.__failSave = true; });
  await page.getByRole('button', { name: 'Save translation & open trail' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Kasem translation', { exact: true }).inputValue(), 'DEVELOPMENT ANSWER', 'Failed save retains writing');
  await page.evaluate(() => { window.__failSave = false; });
  await page.getByRole('button', { name: 'Save translation & open trail' }).click();
  await page.getByRole('button', { name: 'Run section 2' }).waitFor();
  await page.reload(); await page.getByRole('button', { name: 'Run section 2' }).waitFor();
  assert.match(await page.locator('.trail-stats>div').nth(1).innerText(), /1/, 'Saved checkpoint survives reload');
  // Recreate a gated fixture to verify unknown-word and empty-queue states.
  await page.evaluate(() => { const run=JSON.parse(localStorage.getItem('preview-trail'));run.phase='checkpoint';run.word={id:'demo-river',word:'river',sentence:'Local development fixture.',attribution:null};localStorage.setItem('preview-trail',JSON.stringify(run)); });
  await page.reload(); await page.getByRole('heading', { name: 'A word opens the way.' }).waitFor();
  await page.getByRole('button', { name: 'I’m unsure' }).click();
  await page.getByRole('heading', { name: 'tree', exact: true }).waitFor();
  await page.evaluate(() => { window.__empty = true; });
  await page.getByRole('button', { name: 'I’m unsure' }).click();
  await page.getByRole('heading', { name: 'No queue word is available right now.' }).waitFor();
  await page.getByRole('button', { name: 'Check the word queue again' }).click();
  assert.equal(await page.locator('.trail-controls').count(), 0, 'Empty queue stays gated');
  assert.deepEqual(errors, [], 'No uncaught component errors');
  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport:{ width:360,height:800 } });
  await reduced.route('**/src/features/labs/api.ts*', route => route.fulfill({ contentType:'application/javascript',body:mock }));
  const mobile = await reduced.newPage(); await mobile.goto(`${origin}/.runner-preview.html`);
  await mobile.getByRole('button', { name:'Run section 1' }).waitFor();
  assert(await mobile.getByLabel('Calm scenery').isChecked(), 'Reduced motion defaults to calm scenery');
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '360px game fits viewport');
  await mobile.getByRole('button', { name:'Run section 1' }).click();
  await mobile.getByRole('button', { name:'Move right' }).click();
  await mobile.getByRole('button', { name:'Jump' }).click();
  await mobile.getByRole('button', { name:'Pause',exact:true }).click();
  await mobile.getByRole('button', { name:'Resume run' }).waitFor();
  const integrated = await ctx.newPage();
  await integrated.goto(`${origin}/labs/word-trail`);
  await integrated.locator('.word-trail').waitFor();
  for (const width of [1440, 390, 360]) {
    await integrated.setViewportSize({width,height:1000});
    assert(await integrated.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Full Labs page fits ${width}px`);
  }
  await integrated.goto(`${origin}/labs/experiments`);
  await integrated.getByRole('link', { name:'Word Trail',exact:true }).waitFor();
  console.log('Word Trail UI passed: gameplay checkpoint, pause, mobile controls, failed-save retention, retry, reload, alternate word, empty gate, reduced motion and 360/390px overflow.');
} finally {
  await browser?.close();
  // These exact temporary harness files belong to this checker.
  fs.rmSync(harness, { force:true }); fs.rmSync(entry, { force:true });
}
