import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium } from 'playwright-core';
import { decideSubmission } from '../services/functions/lib/creators.js';

if(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('Auth and Firestore emulators required; use .shipping-browser.firebase.json.');
const projectId='demo-indigen-shipping-browser',root=resolve(import.meta.dirname,'..');
const app=initializeApp({projectId});
const db=getFirestore(),auth=getAuth();
const uid='synthetic-reviewer';
await auth.createUser({uid,email:'reviewer@invalid.example',password:'synthetic-only-password'});
await auth.setCustomUserClaims(uid,{role:'validator'});
const created='2026-10-09T00:00:00.000Z';
for(let i=1;i<=3;i++) await db.doc('submissions/review-'+i).set({id:'review-'+i,authUid:'synthetic-author',creator:{id:'synthetic-author'},campaign:{id:'open'},studioType:'writing',category:'storytelling',title:'TEST ONLY · Source '+i,body:'Synthetic source wording ɛ ɔ ŋ. No private corpus is used.',dialect:'Navrongo',sourceReferences:'https://example.org/synthetic-source',permissions:{review:true,publication:false},status:'SUBMITTED',lifecycle:{version:1,createdAt:created,updatedAt:created},privateContact:'MUST NEVER APPEAR IN THE PANEL'});

// Published synthetic fixtures exercise both source-book selectors without raw corpus.
for (const [id, title, importId, sourceRefs] of [
 ['synthetic-grammar-word', 'Synthetic grammar word', 'gillbt-basic-grammar-1983-2014', ['DOCX block 530']],
 ['synthetic-spelling-word', 'Synthetic spelling word', 'bgl-kasem-orthography-1997', ['Section 2']],
]) await db.doc('dictionaryEntries/'+id).set({isPublished:true,kasemText:'TEST ONLY ɛ ɔ ŋ '+id,englishText:title,importId,sourceRefs,dialect:'Navrongo'});
await db.doc('dictionaryEntries/synthetic-restricted-word').set({isPublished:false,kasemText:'TEST ONLY restricted',englishText:'Restricted fixture',culturalPermissionTier:'restricted'});
await db.doc('expressionEntries/synthetic-expression').set({isPublished:true,phrase:'TEST ONLY ɛ ɔ ŋ whole expression',meaning:'Synthetic whole expression',expressionKind:'phrase',context:'Synthetic recorded context'});
await db.doc('kasemSentences/synthetic-sentence').set({status:'confirmed',projectionVersion:2,expiresAtMillis:null,kasem:'TEST ONLY ɛ ɔ ŋ whole sentence',english:'Synthetic whole sentence',importId:'gillbt-basic-grammar-1983-2014',sourceRefs:['DOCX block 530']});
await db.doc('grammarRules/synthetic-rule').set({status:'published',title:'Synthetic grammar rule',summary:'Synthetic rule summary',importId:'gillbt-basic-grammar-1983-2014',sourceRefs:['DOCX block 530'],examples:[{kasem:'TEST ONLY ɛ ɔ ŋ',english:'Synthetic complete example'}]});

const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5203','--strictPort'],{cwd:resolve(root,'apps/tribestudio'),windowsHide:true,env:{...process.env,VITE_USE_EMULATORS:'true',VITE_EMULATOR_PROJECT_ID:projectId,VITE_AUTH_EMULATOR_PORT:'9388',VITE_FIRESTORE_EMULATOR_PORT:'8388'},stdio:'ignore'});
const readerServer=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5204','--strictPort'],{cwd:resolve(root,'apps/kasem-dictionary'),windowsHide:true,env:{...process.env,VITE_USE_EMULATORS:'true',VITE_EMULATOR_PROJECT_ID:projectId,VITE_FIRESTORE_EMULATOR_PORT:'8388'},stdio:'ignore'});
const origin='http://127.0.0.1:5203';
const output=process.env.SHIPPING_EVIDENCE_DIR || resolve(root,'.tooling/ten-shipping/screenshots');mkdirSync(output,{recursive:true});
const chrome=process.env.CHROMIUM_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
let browser;
try {
 let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch(origin)).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,500));}assert(ready,'local preview server started');
 browser=await chromium.launch({executablePath:chrome,headless:true});
 const context=await browser.newContext({reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage();
 await page.goto(origin+'/contributor/review');
 await page.getByLabel('Email',{exact:true}).fill('reviewer@invalid.example');
 await page.locator('input[type=password]').fill('synthetic-only-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.locator('.rv-queue__item').first().waitFor();
 assert.equal(await page.locator('.rv-queue__item').count(),3);
 await page.locator('.rv-queue__item').first().focus();await page.keyboard.press('ArrowDown');
 assert.equal(await page.locator('.rv-queue__item').nth(1).evaluate(node=>node===document.activeElement),true);
 await page.keyboard.press('Enter');await page.locator('.rv-detail').waitFor();
 assert.doesNotMatch(await page.locator('.rv-detail').innerText(),/MUST NEVER APPEAR/);
 assert.match(await page.locator('.rv-detail').innerText(),/Navrongo/);
 for(const [label,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]) {
  await page.setViewportSize({width,height});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'review fits '+label);
  await page.screenshot({path:resolve(output,'review-'+label+'.png'),fullPage:true});
 }
 // Another authorized reviewer uses the actual trusted transaction, not a UI stub.
 await decideSubmission.run({auth:{uid:'second-reviewer',token:{role:'validator'}},data:{submissionId:'review-2',decision:'REQUEST_REVISION',feedback:'TEST ONLY: clarify source context.',expectedStatus:'SUBMITTED',expectedVersion:1}});
 await page.getByRole('button',{name:'Load the latest version first',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Load the latest version first',exact:true}).isDisabled(),true);
 assert.equal(await page.locator('.rv-queue__item').count(),2);
 await page.getByRole('button',{name:'Back to the queue',exact:true}).click();
 await page.locator('.ts-toolbar__count').filter({hasText:'2 in this queue'}).waitFor();
 const reader=await context.newPage();
 let readerReady=false; for(let i=0;i<60;i++){try{readerReady=(await fetch('http://127.0.0.1:5204')).ok;}catch{}if(readerReady)break;await new Promise(resolve=>setTimeout(resolve,500));}assert(readerReady,'local dictionary emulator preview started');
 for(const [search,source,anchor] of [['Synthetic grammar word','A Basic Grammar of Kasem','grammar-guide.html#block-530'],['Synthetic spelling word','Kasem orthography','spelling-guide.html']]) {
  await reader.goto('http://127.0.0.1:5204/?collection=words');
  await reader.getByPlaceholder('Search Kasem or English').fill(search);
  await reader.locator('.word-card').first().waitFor();
  assert.equal(await reader.locator('.word-card').count(),1);
  await reader.locator('.word-card').first().click();
  await reader.locator('.source-note summary').click();
  assert.match(await reader.locator('.source-note').innerText(),new RegExp(source));
  assert((await reader.getByRole('link',{name:'Open the book reference and its illustrations in context'}).getAttribute('href')).endsWith(anchor));
  const stable=await reader.getByRole('link',{name:'Link to this record',exact:true}).getAttribute('href');
  await reader.goto('http://127.0.0.1:5204/'+stable);
  await reader.locator('.detail h2').filter({hasText:'TEST ONLY ɛ ɔ ŋ'}).waitFor();
 }
 await reader.getByPlaceholder('Search Kasem or English').fill('Restricted fixture');
 await reader.getByRole('heading',{name:'No matching entries',exact:true}).waitFor();
 assert.equal(await reader.locator('.word-card').count(),0);
 for(const [category,title] of [['phrases','TEST ONLY ɛ ɔ ŋ whole expression'],['sentences','TEST ONLY ɛ ɔ ŋ whole sentence'],['grammar','Synthetic grammar rule']]) {
  await reader.goto('http://127.0.0.1:5204/?collection='+category);
  await reader.locator('.detail h2').filter({hasText:title}).waitFor();
  assert.equal(await reader.locator('.word-card').count(),1);
 }
 await context.close();console.log('Passed: real Auth/Firestore reviewer access, focused queue keyboard navigation, evidence privacy, three widths, concurrent verdict lock and queue preservation. Published dictionary/source fixtures from both books, stable URLs, whole expressions/sentences/rules and restricted-record exclusion also passed. HTTPS and App Check transport are not exercised by this capture harness.');
} finally {await browser?.close();server.kill();readerServer.kill();await db.terminate();await deleteApp(app);}
