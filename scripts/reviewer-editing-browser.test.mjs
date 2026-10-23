import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join, extname } from 'node:path';
import { chromium } from 'playwright-core';
const { build } = createRequire(new URL('../services/functions/package.json', import.meta.url))('esbuild');
const out = resolve('.tooling/reviewer-editing');
const screens = resolve('apps/updates-blog/posts/2026-10-23-reviewer-editing/screens');
await mkdir(out, { recursive: true }); await mkdir(screens, { recursive: true });

// Real review screens and content editor, with synthetic service data only.
const fixture = `
import React from 'react';
import { applySubmissionEdits } from ${JSON.stringify(resolve('packages/contracts/submission-editing.mjs'))};
window.__calls=[];window.__failNext=false;
let record={id:'synthetic-review',authUid:'synthetic-author',creator:{id:'synthetic-author',collection:'creatorProfiles'},campaign:{id:'open'},collectionKind:'expressions',title:'How was your journey?',body:'Synthetic phrase ɛ ɔ ŋ',dialect:'Navrongo',status:'SUBMITTED',expression:{phrase:'Synthetic phrase ɛ ɔ ŋ',meaning:'How was your journey?',context:'Greeting a visitor',kind:'phrase',dialect:'Navrongo',source:{type:'self',detail:'Synthetic local review fixture'},consent:{source:'Synthetic recorded statement',everyday:'Synthetic everyday statement'}},permissions:{review:true,publication:!location.search.includes('no-publication'),aiTraining:false},lifecycle:{version:1,createdAt:'2026-10-23T12:00:00Z',updatedAt:'2026-10-23T12:00:00Z'}};
const listeners=new Set();
export const db={},functions={},storage={},app={};
export const canValidate=()=>true,signOutUser=async()=>{},useAuth=()=>({ready:true,user:{uid:'synthetic-reviewer',displayName:'Synthetic reviewer'},role:'validator'});
export function useRoute(){const [search,setSearch]=React.useState(location.search);return {path:'/contributor/review',search,navigate:path=>{history.pushState({},'',path);setSearch(location.search);}};}
export const Stub=()=>null;
export const Link=({to,children,...props})=><a href={to} {...props}>{children}</a>;
export const useLeaveGuard=()=>{};
export const queuesChanged=()=>{};
export const dateOnly=v=>String(v||'').slice(0,10),dateTime=v=>String(v||''),errorMessage=(e,f)=>e.message||f,isStaleDecision=e=>e.code==='aborted';
export const fetchHeadwordMatches=async()=>[];
export const getStorage=()=>({}),ref=(_,path)=>({path}),getDownloadURL=async()=>'';
export const collection=(_,path)=>({path}),doc=(_,path,id)=>({path:path+'/'+id}),where=(path,op,value)=>({where:true,path,op,value}),orderBy=()=>({}),limit=()=>({}),limitToLast=()=>({});
export const query=(ref,...filters)=>({...ref,filters});
const copy=()=>structuredClone(record);
const snap=()=>({id:record.id,exists:()=>true,data:copy,get:key=>key==='displayName'?'Synthetic Author':undefined});
const rows=q=>{const status=q.filters?.find(f=>f.where&&f.path==='status');return !status||(status.op==='in'?status.value.includes(record.status):status.value===record.status)?[snap()]:[];};
export const getDocs=async q=>({docs:rows(q),size:rows(q).length});
export const getDoc=async()=>snap();
export const getCountFromServer=async q=>({data:()=>({count:rows(q).length})});
export const onSnapshot=(q,next)=>{const notify=()=>next({docs:rows(q)});listeners.add(notify);queueMicrotask(notify);return()=>listeners.delete(notify);};
export function httpsCallable(_,name){return async data=>{window.__calls.push({name,...data});
if(window.__failNext){window.__failNext=false;throw Error('Synthetic connection failure. Try again.');}
if(data.expectedVersion!==record.lifecycle.version)throw Error('This submission changed.');
if(data.edits)record=applySubmissionEdits(record,data.edits).submission;
record.lifecycle.version++;record.lifecycle.updatedAt=new Date().toISOString();
if(['APPROVE_AND_PUBLISH','PUBLISH'].includes(data.decision))record.status='PUBLISHED';
if(data.decision==='APPROVE')record.status='APPROVED';
for(const notify of listeners)notify();return {data:{newStatus:record.status}};};}
window.__setConsent=()=>{record.permissions.publication=false;for(const notify of listeners)notify();};
`;
await writeFile(join(out, 'fixture.jsx'), fixture);
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {ReviewDesk as AdminDesk} from ${JSON.stringify(resolve('apps/admin/src/review/ReviewDesk.tsx'))};
import {RouterProvider} from ${JSON.stringify(resolve('apps/admin/src/router.tsx'))};
import {DialogHost} from ${JSON.stringify(resolve('apps/admin/src/ui/dialogs.tsx'))};
import {ReviewDesk as ValidatorDesk} from ${JSON.stringify(resolve('apps/tribestudio/src/contributor/review/ReviewDesk.tsx'))};
${['tokens','base','motion','components','shell'].map(name => `import ${JSON.stringify(resolve('apps/tribestudio/src/ui/'+name+'.css'))};`).join('\n')}
import ${JSON.stringify(resolve('packages/console-ui/src/kit.css'))};
import ${JSON.stringify(resolve('apps/admin/src/ui/admin.css'))};
import ${JSON.stringify(resolve('apps/admin/src/ui/sections.css'))};
import '@fontsource-variable/inter/wght.css';import '@fontsource-variable/sora/wght.css';
createRoot(document.getElementById('root')).render(<><p className="ts-notice" style={{margin:'1rem'}}>Local product preview · synthetic submission and service responses</p>{location.pathname.startsWith('/admin')?<RouterProvider><AdminDesk scope="pending"/><DialogHost/></RouterProvider>:<ValidatorDesk/>}</>);
`;
await writeFile(join(out, 'entry.jsx'), entry);
await build({ entryPoints: [join(out, 'entry.jsx')], outfile: join(out, 'bundle.js'), bundle: true, format: 'esm', jsx: 'automatic', loader: { '.woff2': 'file', '.ttf': 'file' }, plugins: [{ name: 'synthetic-services', setup(b) {
  b.onResolve({ filter: /^(firebase\/(firestore|functions|storage))$/ }, () => ({ path: join(out, 'fixture.jsx') }));
  b.onResolve({ filter: /^\.\.?\// }, args => {
    const path = resolve(args.resolveDir, args.path).replaceAll('\\', '/');
    if (/apps\/(admin|tribestudio)\/src\/(firebase|auth|attention)$/.test(path)
      || path.endsWith('/apps/tribestudio/src/router') || path.endsWith('/apps/admin/src/finance/data')
      || path.endsWith('/apps/tribestudio/src/creator/dictionary-data')) return { path: join(out, 'fixture.jsx') };
    if (/\/(RewardAssessment|CommunityGoalControl|MaterialReview)$/.test(path)) return { path, namespace: 'stub' };
  });
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const RewardAssessmentPanel=()=>null, CommunityGoalControl=()=>null, MaterialReview=()=>null;', loader: 'js' }));
} }] });
await writeFile(join(out, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review editing · synthetic product preview</title><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const name = path === '/bundle.js' || path === '/bundle.css' || /\.(woff2|ttf)$/.test(path) ? path.slice(1) : 'index.html';
  try { res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(name)] || 'application/octet-stream'); res.end(await readFile(join(out, name))); }
  catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(4198, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const errors = [];
  for (const portal of ['admin', 'validator']) for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1536, height: 1024 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    let acceptDialogs = true;
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => acceptDialogs ? d.accept() : d.dismiss());
    await page.goto('http://127.0.0.1:4198/' + portal);
    if (portal === 'validator') await page.locator('.rv-queue__item').first().click();
    else if (mobile) await page.locator('.ad-queue__item').first().click();
    await page.getByRole('button', { name: 'Edit submission', exact: true }).click();
    const editor = page.getByRole('group', { name: 'Edit submission', exact: true });
    await editor.getByRole('textbox', { name: 'Expression (Kasem) *', exact: true }).fill('vèi sɔ́ŋɔ̀ · synthetic correction');
    await editor.getByRole('textbox', { name: 'Meaning (English) *', exact: true }).fill('Corrected journey greeting');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${portal} fits ${mobile ? 'mobile' : 'desktop'}`);
    if (portal === 'admin' || mobile) {
      acceptDialogs = false;
      await page.getByRole('button', { name: portal === 'admin' ? 'Close submission' : 'Back to the queue', exact: true }).click();
      assert.equal(await editor.count(), 1, 'declining navigation preserves corrections');
      acceptDialogs = true;
    }
    await editor.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screens, `${portal}-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: false });
    await page.evaluate(() => { window.__failNext = true; });
    await page.getByRole('button', { name: 'Save corrections', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Synthetic connection failure' }).first().waitFor();
    assert.equal(await editor.getByRole('textbox', { name: 'Meaning (English) *', exact: true }).inputValue(), 'Corrected journey greeting', 'failed save retains corrections');
    await page.getByRole('button', { name: 'Save corrections', exact: true }).click();
    await page.getByRole('button', { name: 'Edit submission', exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.__calls)).at(-1).decision, 'SAVE_EDITS');
    await page.getByRole('button', { name: 'Edit submission', exact: true }).click();
    await page.getByRole('group', { name: 'Edit submission', exact: true }).getByRole('textbox', { name: 'Expression (Kasem) *', exact: true }).fill('vèi sɔ́ŋɔ̀ · final synthetic correction');
    if (portal === 'admin') {
      await page.getByRole('button', { name: 'Save and publish', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Save and publish', exact: true }).click();
    } else {
      await page.getByRole('radio', { name: 'Approve and publish', exact: true }).focus();
      await page.keyboard.press('Space');
      await page.getByRole('button', { name: 'Record decision', exact: true }).click();
    }
    await page.waitForFunction(() => window.__calls.at(-1)?.decision === 'APPROVE_AND_PUBLISH');
    const call = (await page.evaluate(() => window.__calls)).at(-1);
    assert.equal(call.expectedVersion, 2); assert.equal(call.expectedStatus, 'SUBMITTED');
    assert.equal(call.edits.body, 'vèi sɔ́ŋɔ̀ · final synthetic correction');
    assert.equal(call.name, portal === 'admin' ? 'reviewSubmission' : 'decideSubmission');
    await page.goto('http://127.0.0.1:4198/' + portal + '?no-publication=1');
    if (portal === 'validator') await page.locator('.rv-queue__item').first().click();
    else if (mobile) await page.locator('.ad-queue__item').first().click();
    if (portal === 'admin') assert.equal(await page.getByRole('button', { name: 'Approve and publish', exact: true }).isDisabled(), true);
    else assert.equal(await page.getByRole('radio', { name: 'Approve and publish', exact: true }).count(), 0);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: real admin and validator screens at desktop/mobile widths; Unicode edits, unsaved navigation protection, failed-save recovery, save and continue, guarded atomic save/publish payloads, publication-consent controls, no page overflow. Service data are synthetic.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
