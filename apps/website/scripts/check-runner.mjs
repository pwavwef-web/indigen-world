import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const origin=process.env.RUNNER_PREVIEW_URL||'http://127.0.0.1:5175';
const images=path.join(root,'apps/updates-blog/posts/2026-10-14-word-trail-blue-horizon/screens');
const diagnostics=path.join(root,'outputs/word-trail-2026-10-14');
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
assert(executablePath,'Chromium browser required');
const mock=`
import {LABS_REGISTRY} from '/@fs/${root.replaceAll('\\','/')}/packages/contracts/labs.mjs';
const fixtureUser={uid:'local-fixture',displayName:'QA fixture'};
export function useLabsAccount(){return {user:window.__guest?null:fixtureUser,ready:true};}
export const loginGoogle=async()=>{};export const loginEmail=async()=>{};export const logout=async()=>{};
export const errorMessage=e=>e.message;
const word=(id='fixture-about')=>({id,word:id==='fixture-about'?'about':'river',sentence:'QA English context: tell me about your journey.',sentenceSource:'unattributed',attribution:null,tier:'core',rank:1,pendingCount:0});
const fresh=()=>({id:'fixture-run',uid:'local-fixture',version:'0.1.0',section:1,phase:'ready',score:0,checkpoints:0,word:null,skippedWordIds:[],startedAt:null,updatedAt:new Date().toISOString(),lastReceipt:null});
export async function labsCall(action,data={}){
  window.__calls??=[];window.__calls.push({action,data});
  if(action==='bootstrap')return {experiments:LABS_REGISTRY,invited:[],canAdmin:false,aiEnabled:false,development:true};
  let run=JSON.parse(localStorage.getItem('qa-trail')||'null')||fresh();
  if(action==='runner'&&data.restart)run=fresh();
  if(action==='beginRunnerSection'){if(window.__authExpired)throw Error('Sign-in expired. Your checkpoint is saved.');run.phase='running';}
  if(action==='runnerCheckpoint'){if(window.__gateFail)throw Error('Checkpoint connection failed.');if(run.phase!=='checkpoint'){run.phase='checkpoint';run.score+=data.score;run.word=window.__empty?null:word();}}
  if(action==='runnerWord'){
    run.word=window.__empty?null:word('fixture-river');
    if(window.__wordResponseLost){window.__wordResponseLost=false;localStorage.setItem('qa-trail',JSON.stringify(run));throw Error('Word response lost after queue changed.');}
  }
  if(action==='submitRunnerWord'){
    const expected=run.lastReceipt?.section===data.section?run.lastReceipt.wordId:run.word?.id;
    if(data.expectedWordId!==expected)throw Error('The checkpoint word changed. Reload the saved checkpoint.');
    if(window.__failSave)throw Error('Simulated connection failure. Retry safely.');
    if(run.lastReceipt?.section!==data.section){
      run.lastReceipt={section:run.section,wordId:run.word.id,contributionId:'fixture-receipt',submissionId:'fixture-receipt',translations:[data.translations],status:'SUBMITTED'};
      run.phase='ready';run.section++;run.score+=100;run.checkpoints++;run.word=null;
    }
    localStorage.setItem('qa-trail',JSON.stringify(run));
    if(window.__uncertain){window.__uncertain=false;throw Error('Response lost after saving. Retry returns the same receipt.');}
  }
  localStorage.setItem('qa-trail',JSON.stringify(run));return {run};
}`;
const browser=await chromium.launch({executablePath,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
console.log('Browser launched; testing actual Labs route with synthetic callables.');
fs.mkdirSync(images,{recursive:true});
fs.mkdirSync(diagnostics,{recursive:true});
const errors=[];
async function context(options={}){
  const ctx=await browser.newContext({viewport:{width:1100,height:780},reducedMotion:'reduce',...options});
  ctx.setDefaultTimeout(60000);
  await ctx.route('**/src/features/labs/api.ts*',r=>r.fulfill({contentType:'application/javascript',body:mock}));
  // Test-only instrumentation: not compiled into the product or served to real users.
  await ctx.route('**/src/features/labs/runner-engine.ts*',async route=>{
    const response=await route.fetch();
    const code=(await response.text()).replace('function tickTrail(state, delta) {','function tickTrail(state, delta) { window.__trail = state;');
    assert(code.includes('window.__trail = state'),'Vite simulation instrumentation matched');
    await route.fulfill({response,body:code});
  });
  return ctx;
}
async function open(ctx,practice=false){
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&m.text().includes('THREE.'))errors.push(m.text());});
  await p.goto(origin+'/labs/word-trail');
  console.log('Launch page loaded.');
  await p.getByRole('button',{name:practice?'Try practice · no sign-in':'Play Word Trail',exact:practice}).click();
  await p.locator('.trail-shell[data-mode="ready"]').waitFor();
  console.log('3D scene ready.');
  await p.clock.install();
  await p.clock.pauseAt(await p.evaluate(()=>new Date(Date.now()+60000).toISOString()));
  return p;
}
async function start(p){
  await p.getByRole('button',{name:'Start running'}).click();await p.clock.runFor(3200);
  assert.equal(await p.locator('.trail-shell').getAttribute('data-mode'),'running');
}
async function safeSection(p){
  for(let i=0;i<230;i++){
    const s=await p.evaluate(()=>window.__trail?{lane:window.__trail.lane,status:window.__trail.status,items:window.__trail.items}:null);
    if(s&&s.status!=='running')break;
    const danger=s?.items.filter(x=>x.kind!=='spark'&&!x.hit&&x.z<14).sort((a,b)=>a.z-b.z)[0];
    if(danger){
      const safe=(danger.lane+1)%3;
      if(safe!==s.lane){const k=safe>s.lane?'ArrowRight':'ArrowLeft';for(let j=0;j<Math.abs(safe-s.lane);j++)await p.locator('.trail-shell').press(k);}
    }
    await p.clock.runFor(250);
  }
  await p.locator('.trail-shell[data-mode="checkpoint"]').waitFor();
}
function mode(p){return p.locator('.trail-shell').getAttribute('data-mode');}
async function gateFixture(p,{empty=false}={}){
  await p.clock.resume();
  await p.evaluate(empty=>{
    const run=JSON.parse(localStorage.getItem('qa-trail'));run.phase='checkpoint';
    run.word=empty?null:{id:'fixture-about',word:'about',sentence:'QA English context: tell me about your journey.',sentenceSource:'unattributed',attribution:null};
    localStorage.setItem('qa-trail',JSON.stringify(run));
  },empty);
  await p.reload();await p.getByRole('button',{name:'Play Word Trail'}).click();await p.locator('.trail-shell[data-mode="checkpoint"]').waitFor();
  await p.clock.pauseAt(await p.evaluate(()=>new Date(Date.now()+60000).toISOString()));
}
try {
  const ctx=await context();const p=await open(ctx);
  await start(p);await p.clock.runFor(2000);
  await p.locator('.trail-shell').press('d');await p.clock.runFor(250);
  assert.equal(await p.evaluate(()=>window.__trail.lane),2);
  await p.locator('.trail-shell').press('a');await p.locator('.trail-shell').press('Space');await p.clock.runFor(200);
  assert(await p.evaluate(()=>window.__trail.jump>0),'Space visibly jumps');
  await p.clock.runFor(1100);await p.locator('.trail-shell').press('s');await p.clock.runFor(150);
  assert(await p.evaluate(()=>window.__trail.slide>0),'S slides');
  await p.clock.runFor(1200);
  await p.getByRole('button',{name:'Pause',exact:true}).click();
  const paused=await p.evaluate(()=>({d:window.__trail.distance,h:window.__trail.lives,c:window.__trail.coins}));
  await p.clock.runFor(1000);assert.deepEqual(await p.evaluate(()=>({d:window.__trail.distance,h:window.__trail.lives,c:window.__trail.coins})),paused);
  await p.getByLabel('Reduced camera motion').check();
  await p.getByRole('button',{name:'Resume run'}).click();await p.clock.runFor(3200);
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await mode(p),'paused');
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await p.getByRole('button',{name:'Resume run'}).click();await p.clock.runFor(3200);
  await p.clock.runFor(200);await p.screenshot({path:path.join(images,'game-desktop.png')});
  await safeSection(p);
  const stopped=await p.evaluate(()=>({d:window.__trail.distance,h:window.__trail.lives,c:window.__trail.coins}));
  await p.clock.runFor(2000);assert.deepEqual(await p.evaluate(()=>({d:window.__trail.distance,h:window.__trail.lives,c:window.__trail.coins})),stopped,'Question freezes the complete simulation');
  await p.setViewportSize({width:390,height:844});
  await p.screenshot({path:path.join(images,'checkpoint-phone.png')});
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.getByLabel('Kasem translation',{exact:true}).fill('QA ONLY · ɛɔŋ');
  await p.getByLabel('Kasem translation',{exact:true}).press('a');await p.getByLabel('Kasem translation',{exact:true}).press('Space');
  assert.deepEqual(await p.evaluate(()=>({d:window.__trail.distance,h:window.__trail.lives,c:window.__trail.coins})),stopped,'Typing does not move the runner');
  await p.getByLabel('Word class',{exact:true}).selectOption('noun');await p.getByLabel('Dialect or community',{exact:true}).fill('QA fixture');
  await p.getByRole('button',{name:'Pause & settings',exact:true}).click();
  await p.getByRole('button',{name:'Resume run'}).click();
  assert.equal(await p.getByLabel('Kasem translation',{exact:true}).inputValue().then(v=>v.includes('QA ONLY')),true,'Checkpoint settings retain the draft');
  await p.setViewportSize({width:390,height:430});
  await p.getByRole('button',{name:'Submit translation'}).scrollIntoViewIfNeeded();
  await p.clock.runFor(50); const submitBounds=await p.getByRole('button',{name:'Submit translation'}).boundingBox();
  assert(submitBounds.y>=0&&submitBounds.y+submitBounds.height<=430,'Submit stays reachable in a keyboard-height viewport');
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{window.__failSave=true;});
  await p.getByRole('button',{name:'Submit translation'}).click();await p.getByRole('alert').waitFor();
  assert((await p.getByLabel('Kasem translation',{exact:true}).inputValue()).includes('QA ONLY'));
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('qa-trail')).checkpoints),0);
  await p.evaluate(()=>{window.__failSave=false;window.__uncertain=true;});
  await p.getByRole('button',{name:'Submit translation'}).click();await p.getByRole('alert').waitFor();
  const committed=await p.evaluate(()=>JSON.parse(localStorage.getItem('qa-trail')));
  const callsBeforeRetry=await p.evaluate(()=>window.__calls.filter(x=>x.action==='submitRunnerWord').length);
  await p.evaluate(()=>{const form=document.querySelector('.trail-modal form');form.requestSubmit();form.requestSubmit();});
  await p.locator('.trail-shell[data-mode="feedback"]').waitFor();
  const retried=await p.evaluate(()=>JSON.parse(localStorage.getItem('qa-trail')));
  assert.equal(retried.checkpoints,1);assert.equal(retried.score,committed.score,'Uncertain retry does not double award');
  assert.equal(await p.evaluate(()=>window.__calls.filter(x=>x.action==='submitRunnerWord').length),callsBeforeRetry+1,'Double submit is locked before the network request');
  assert.match(await p.locator('.trail-modal h1').innerText(),/Saved for\s+community review\./);
  const hearts=stopped.h;
  await p.getByRole('button',{name:'Continue running'}).click();await p.clock.runFor(3200);
  assert.equal(await p.evaluate(()=>window.__trail.lives),hearts,'Health carries through checkpoint');
  assert.equal(await p.evaluate(()=>window.__trail.section),2);assert(await p.evaluate(()=>window.__trail.totalDistance>=300));
  await p.getByRole('button',{name:'Pause',exact:true}).click();await p.locator('.trail-modal-exit').click();
  assert.equal(await p.evaluate(()=>document.body.style.overflow),'');assert.equal(await p.evaluate(()=>document.getElementById('root').inert),false);
  await gateFixture(p);
  await p.getByLabel('Kasem translation',{exact:true}).fill('QA DRAFT FOR ABOUT');
  await p.getByLabel('Word class',{exact:true}).selectOption('noun');await p.getByLabel('Dialect or community',{exact:true}).fill('QA fixture');
  await p.evaluate(()=>{window.__wordResponseLost=true;});
  await p.getByRole('button',{name:"I don't know"}).click();await p.getByRole('alert').waitFor();
  await p.getByRole('button',{name:'Submit translation'}).click();
  assert.equal(await p.getByLabel('Kasem translation',{exact:true}).inputValue(),'QA DRAFT FOR ABOUT');
  await p.getByRole('button',{name:'Reload saved checkpoint'}).click();
  await p.getByRole('heading',{name:'river',exact:true}).waitFor();
  await p.getByText('Previous unsent draft for about',{exact:true}).click();
  assert.equal(await p.getByLabel('Previous translation',{exact:true}).inputValue(),'QA DRAFT FOR ABOUT');
  assert.equal(await p.getByLabel('Kasem translation',{exact:true}).inputValue(),'','Recovered prompt never silently reuses an answer for a different word');
  await p.getByRole('button',{name:"I don't know"}).click();await p.getByRole('heading',{name:'river',exact:true}).waitFor();
  await p.evaluate(()=>{window.__empty=true;});await p.getByRole('button',{name:"I don't know"}).click();
  await p.getByRole('heading',{name:'No queue word is available right now.'}).waitFor();
  await p.getByRole('button',{name:'Check the word queue again'}).click();
  await p.getByRole('button',{name:'Continue without contributing'}).click();await p.clock.runFor(3200);
  assert.equal(await p.locator('.trail-shell').getAttribute('data-practice'),'true');
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('qa-trail')).phase),'checkpoint','Practice preserves account gate');
  await p.getByRole('button',{name:'Pause',exact:true}).click();await p.locator('.trail-modal-exit').click();
  await p.clock.resume();await p.goto(origin+'/labs/experiments');await p.getByRole('heading',{name:'Word Trail',exact:true}).waitFor();await p.screenshot({path:path.join(images,'labs-blue.png'),fullPage:true});
  // Portrait/landscape inputs, loss/retry, resize without restart, reduced-motion defaults.
  const mobileCtx=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await mobileCtx.addInitScript(()=>{window.__guest=true;});
  const m=await open(mobileCtx,true);await start(m);
  await m.getByRole('button',{name:'Move right',exact:true}).tap();await m.clock.runFor(100);
  assert.equal(await m.evaluate(()=>window.__trail.lane),2);
  const r=await m.locator('.trail-world').boundingBox();
  const touchSession=await mobileCtx.newCDPSession(m);
  async function swipeTo(dx,dy){const x=r.width/2,y=r.height/2;await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy,id:1}]});await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await swipeTo(-100,0);
  await m.clock.runFor(100);assert.equal(await m.evaluate(()=>window.__trail.lane),1,'Swipe left changes one lane');
  await swipeTo(0,-100);
  await m.clock.runFor(100);assert(await m.evaluate(()=>window.__trail.jump>0));
  await m.clock.runFor(1100);await swipeTo(0,100);await m.clock.runFor(100);assert(await m.evaluate(()=>window.__trail.slide>0));
  await m.screenshot({path:path.join(images,'game-phone.png')});
  const metres=await m.evaluate(()=>window.__trail.distance);
  await m.setViewportSize({width:844,height:390});await m.clock.runFor(100);
  assert(await m.evaluate(()=>window.__trail.distance>=0&&window.__trail.distance<30),'Orientation does not restart');
  assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await m.getByRole('button',{name:'Pause',exact:true}).click();
  assert(await m.getByLabel('Reduced camera motion').isChecked());
  await m.screenshot({path:path.join(images,'pause-landscape.png')});
  await m.setViewportSize({width:568,height:320});await m.clock.runFor(100);
  assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Compact landscape phone fits without forced orientation');
  await m.setViewportSize({width:844,height:390});await m.clock.runFor(100);
  await m.getByRole('button',{name:'Resume run'}).click();await m.clock.runFor(3200);
  // Force known contact events in this test-only instrumented state, then verify the actual UI retry.
  await m.evaluate(()=>{window.__trail.lives=1;window.__trail.invincible=0;window.__trail.jump=0;window.__trail.slide=0;window.__trail.x=0;window.__trail.lane=1;window.__trail.items=[{id:999,lane:1,z:.56,kind:'rock',hit:false}];});
  await m.clock.runFor(100);await m.locator('.trail-shell[data-mode="crashed"]').waitFor();
  await m.getByRole('button',{name:'Retry section'}).click();await m.clock.runFor(3200);
  assert.equal(await m.evaluate(()=>window.__trail.lives),3);
  for(let i=0;i<3;i++){
    await m.getByRole('button',{name:'Pause',exact:true}).click();await m.locator('.trail-modal-exit').click();
    await m.getByRole('button',{name:'Try practice · no sign-in',exact:true}).click();await m.clock.runFor(100);await m.getByRole('button',{name:'Start running'}).click();await m.clock.runFor(4200);
    assert(await m.evaluate(()=>window.__trail.distance<8),'Restart does not multiply simulation speed');
  }
  // Real wall-clock observation, separate from accelerated simulation checks.
  await m.clock.resume();
  const soakStart=Date.now();let milestone=0,checkpoints=0,retries=0;
  while(Date.now()-soakStart<180000){
    const s=await m.evaluate(()=>({lane:window.__trail.lane,status:window.__trail.status,mode:document.querySelector('.trail-shell').dataset.mode,items:window.__trail.items,distance:window.__trail.totalDistance}));
    if(s.mode==='checkpoint'){
      await m.getByRole('button',{name:'Keep running'}).click();checkpoints++;
    }else if(s.mode==='crashed'){
      await m.getByRole('button',{name:'Retry section'}).click();retries++;
    }else if(s.mode==='paused'){
      await m.getByRole('button',{name:'Resume run'}).click();
    }else if(s.mode==='running'){
      const danger=s.items.filter(x=>x.kind!=='spark'&&!x.hit&&x.z<40).sort((a,b)=>a.z-b.z)[0];
      if(danger){const safe=(danger.lane+1)%3;for(let i=0;i<Math.abs(safe-s.lane);i++)await m.locator('.trail-shell').press(safe>s.lane?'ArrowRight':'ArrowLeft');}
    }
    assert(s.items.length<24,'Object population remains bounded during continuous play');
    const elapsed=Date.now()-soakStart;
    if(elapsed>milestone+30000){milestone=elapsed;console.log('Real-time soak:',Math.round(elapsed/1000)+' seconds,',Math.floor(s.distance)+' metres,',checkpoints+' continuations,',retries+' retries');}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.deepEqual(errors,[]);
  console.log('Browser QA passed: desktop keyboard, mobile inputs, portrait/landscape resize, true checkpoint freeze, failed/uncertain save retry, duplicate bonus prevention, alternate/empty queue, separate practice, health carryover, game-over/retry, pause/visibility, reduced motion and repeated mount cleanup. Screenshots use synthetic local data.');
} catch (error) {
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
    console.log('Failure state:',await p.locator('body').innerText().catch(()=> 'unavailable'));
    await p.screenshot({path:path.join(diagnostics,'qa-failure.png'),timeout:10000}).catch(()=>{});
  }
  throw error;
} finally { await browser.close(); }
