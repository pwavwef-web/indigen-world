import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join, extname } from 'node:path';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const { build } = createRequire(new URL('../../../services/functions/package.json', import.meta.url))('esbuild');
const out = resolve('.tooling/integrated-upgrade/browser');
const screens = resolve('apps/updates-blog/posts/2026-10-16-connected-mobile-workflows/screens');
await mkdir(out, { recursive: true }); await mkdir(screens, { recursive: true });
const photo = 'data:image/jpeg;base64,' + (await readFile('apps/mobile/assets/places/paga-pond.jpg')).toString('base64');
const fixture = `
window.__calls=[];
const asset={id:'12345678-1234-1234-1234-123456789abc',url:${JSON.stringify(photo)},thumbnailUrl:${JSON.stringify(photo)},alt:'Paga pond photograph used in a synthetic archive-print fixture',credit:'Dieu-Donné Gameli · CC BY-SA 3.0',rights:'CC BY-SA 3.0',status:'published'};
let product={id:'review-print',name:'Archive print · review fixture',description:'Synthetic catalogue item for local review only.',summary:'An archive image for your space.',category:'Prints',maker:'Indigen World',priceMode:'fixed',priceMinor:2400,currency:'GHS',kind:'physical',published:false,inStock:true,order:1,status:'draft',gallery:[asset],imageUrl:asset.url,variants:[]};
const order={id:'review-order',uid:'review-member',email:'member@example.test',paymentStatus:'paid',fulfillmentStatus:'packing',refundedMinor:0,totalMinor:2900,items:[{productId:'review-print',variantId:'default',name:product.name,quantity:1,priceMinor:2400,sku:'REVIEW-PRINT'}],address:{recipient:'Review member',country:'GH',city:'Fixture town',street:'Synthetic pickup address'},delivery:{name:'Configured pickup · fixture',estimate:'A store-configured estimate'},timeline:[{event:'Payment verified · synthetic provider fixture',at:'2026-10-16T12:00:00Z'}]};
let campaigns=[]; let request={id:'review-request',kind:'support',message:'Synthetic support request for checking the staff workflow.',status:'open'};
export const functions={};export const storage={};export const auth={currentUser:{uid:'review-admin'}};
export function httpsCallable(_,name){return async data=>{window.__calls.push({name,...data});let result={};
if(name==='collectionMedia'){result=data.operation==='library'?{items:[asset]}:data.operation==='pending'?{items:[]}:data.operation==='begin'?{id:asset.id,storagePath:'synthetic-private-path'}:data.operation==='status'?{status:'ready'}:{...asset,alt:data.alt||asset.alt,credit:data.credit||asset.credit,rights:data.rights||asset.rights};}
if(name==='shopAdmin'){
if(data.operation==='readiness')result={settings:{storeName:'Indigen World',currency:'GHS',checkoutEnabled:false},tasks:['Configure store policies','Verify delivery coverage','Complete provider test before enabling checkout']};
if(data.operation==='list')result={items:data.section==='products'?[product]:data.section==='orders'?[order]:data.section==='inventory'?[{id:'review-print__default',name:product.name,onHand:10,reserved:1}]:[],cursor:null};
if(data.operation==='save'){product={...product,...data.value};result={id:product.id};}
if(data.operation==='requests')result={items:[request],notes:[{id:'note',text:'Review fixture: packaging checked.',actorUid:'review-admin',createdAt:'2026-10-16'}]};
if(data.operation==='resolveRequest')request={...request,status:data.status,resolution:data.message};
if(data.operation==='fulfill')order.fulfillmentStatus=data.status;
}
if(name==='notificationCampaignAdmin'){
if(data.operation==='list')result={items:campaigns};
if(data.operation==='save'){const c={...data.value,id:'review-campaign',revision:'review-revision',status:'draft'};campaigns=[c];result={id:c.id,revision:c.revision};}
if(data.operation==='testSelf'||data.operation==='queue'){campaigns[0].status='scheduled';result={status:'scheduled'};}
if(data.operation==='cancel'){campaigns[0].status='cancelled';}
}
return{data:result}}}
export function ref(_,path){return{path}}
export function uploadBytesResumable(){return{on(event,next,error,done){queueMicrotask(()=>{next({bytesTransferred:1,totalBytes:2});next({bytesTransferred:2,totalBytes:2});done()})},pause(){},resume(){},cancel(){}}}
`;
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{RouterProvider}from'./apps/admin/src/router';import{ShopWorkspace}from'./apps/admin/src/shop/ShopWorkspace';import{NotificationComposer}from'./apps/admin/src/messaging/NotificationComposer';import'@fontsource-variable/sora/wght.css';import'@fontsource-variable/inter/wght.css';import'./apps/tribestudio/src/ui/tokens.css';import'./apps/tribestudio/src/ui/base.css';import'./apps/tribestudio/src/ui/components.css';import'./apps/admin/src/ui/admin.css';import'./apps/admin/src/ui/legacy.css';const view=new URLSearchParams(location.search).get('view');createRoot(document.getElementById('root')).render(<RouterProvider>{view==='push'?<NotificationComposer/>:<ShopWorkspace initialTab="Products"/>}</RouterProvider>);`;
await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outdir: out, entryNames: 'review', loader: { '.ttf': 'file', '.woff2': 'file' }, jsx: 'automatic', plugins: [{ name: 'synthetic-service', setup(b) { b.onResolve({ filter: /^(?:\.\.\/firebase|firebase\/functions|firebase\/storage)$/ }, () => ({ path: 'fixture', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, loader: 'js' })); } }] });
await writeFile(join(out, 'index.html'), `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="/review.css"><style>body{margin:0;background:#f4f7fc}body>header{background:#0d1d35;color:white;padding:18px 32px;font-weight:650}main{padding:28px;max-width:1440px;margin:auto}.review-banner{padding:10px 0;color:#52647c;font-size:12px}*{box-sizing:border-box}</style></head><body><header>Indigen World · Admin</header><main><p class="review-banner">LOCAL REVIEW FIXTURE · synthetic products, orders and messages · nothing is charged or sent</p><div id="root"></div></main><script src="/review.js"></script></body></html>`);
const server = createServer(async (req, res) => { try { const pathname = new URL(req.url, 'http://127.0.0.1').pathname, target = resolve(out, '.' + (pathname === '/' ? '/index.html' : pathname)); if (!target.startsWith(out + '\\')) throw Error('Denied'); res.setHeader('Content-Type', ({ '.css': 'text/css', '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.woff2': 'font/woff2' })[extname(target)] || 'application/octet-stream'); res.end(await readFile(target)); } catch { res.statusCode = 404; res.end(); } });
await new Promise((r) => server.listen(4197, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4197'); await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('heading', { name: 'Edit record' }).waitFor(); await page.screenshot({ path: join(screens, 'admin-product-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await page.getByRole('button', { name: 'Paga pond photograph used in a synthetic archive-print fixture' }).click();
  await page.getByLabel('name', { exact: true }).fill('Archive print · updated review fixture');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('heading', { name: 'Archive print · updated review fixture' }).waitFor();
  await page.getByRole('button', { name: 'Orders', exact: true }).click(); await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('heading', { name: 'Customer requests' }).waitFor(); await page.screenshot({ path: join(screens, 'admin-order-desktop.png'), fullPage: true });
  await page.getByLabel('Resolution for support').fill('Synthetic resolution saved persistently in the local service fixture.'); await page.getByRole('button', { name: 'resolved', exact: true }).click();
  assert.ok((await page.evaluate(() => window.__calls)).some((r) => r.operation === 'resolveRequest' && r.status === 'resolved'));
  await page.setViewportSize({ width: 820, height: 1180 }); await page.getByRole('button', { name: 'Products', exact: true }).click(); await page.getByRole('button', { name: 'Open', exact: true }).click(); await page.screenshot({ path: join(screens, 'admin-product-tablet.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.goto('http://127.0.0.1:4197/?view=push'); await page.getByLabel('title', { exact: true }).fill('A new story is ready · review fixture'); await page.getByLabel('body', { exact: true }).fill('Discover the newest reviewed story in the collections. This is a local test message.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await page.getByText('Draft saved. Review the preview before queuing or sending a test.').waitFor();
  await page.setViewportSize({ width: 1440, height: 1080 }); await page.screenshot({ path: join(screens, 'admin-notification-composer.png'), fullPage: true });
  await page.getByRole('button', { name: 'Queue test to myself', exact: true }).click(); await page.getByRole('button', { name: 'Cancel before dispatch', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS: product media selection/save, order resolution, saved notification review/test/cancel, desktop/tablet layout; synthetic services only.');
} finally { await browser.close(); await new Promise((r) => server.close(r)); }
