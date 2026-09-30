import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
function harness(){
 const records=new Map([['contributorAccounts/alice',{status:'active'}]]);let clock='2026-09-26T10:00:00Z',serial=0,queue=Promise.resolve();
 const ref=path=>({path,id:path.split('/').at(-1),collection:name=>collection(path+'/'+name)});
 const snapshot=reference=>({exists:records.has(reference.path),id:reference.id,get:key=>records.get(reference.path)?.[key],data:()=>records.get(reference.path)});
 const collection=path=>({path,query:true,doc:(id='generated-'+(++serial))=>ref(path+'/'+id)});
 const db={doc:ref,collection,runTransaction:fn=>{const task=queue.then(async()=>{const writes=[];const result=await fn({get:async r=>r.query?(()=>{const docs=[...records.keys()].filter(p=>p.startsWith(r.path+'/')&&p.split('/').length===r.path.split('/').length+1).map(p=>snapshot(ref(p)));return {docs,size:docs.length};})():snapshot(r),create:(r,v)=>writes.push(()=>{assert.ok(!records.has(r.path),'duplicate create '+r.path);records.set(r.path,v);}),update:(r,v)=>writes.push(()=>{assert.ok(records.has(r.path));records.set(r.path,{...records.get(r.path),...v});})});writes.forEach(f=>f());return result;});queue=task.catch(()=>{});return task;}};
 class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}}
 const source=readFileSync(new URL('../../services/functions/lib/contributor-daily-tasks.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/\bexport (?=(?:async )?function|const)/g,'');
 const api=runInNewContext(source+'\n;({prepareContributorDailyTasks,getContributorDailyTasks,requestMoreContributorTasks,dailyPrompts})',{Date:Clock,createHash,HttpsError,getFirestore:()=>db,requireAuth:r=>{if(!r.auth)throw new HttpsError('unauthenticated','Sign in');return r.auth.uid;},requireRole:r=>{if(r.auth?.role!=='admin')throw new HttpsError('permission-denied','Admin only');},guarded:(_n,f)=>f,CONTRIBUTOR_CALL_OPTIONS:{},onCall:(_o,f)=>f,consumeRateLimit:async()=>{}});
 const req={auth:{uid:'alice'},data:{}};const prompts=Array.from({length:30},(_,i)=>'Expression '+i);const admin={auth:{uid:'admin',role:'admin'},data:{contributorId:'alice',expressions:prompts,day:'2026-09-26'}};
 return {...api,records,req,admin,setDay:value=>{clock=value;},submitFirst:()=>{for(const [p,v]of records)if(p.includes('daily-2026-09-26-first/items/'))records.set(p,{...v,submissionId:'sent-'+v.id,status:'submitted'});}};
}
test('first 15 visible; extra 15 private until all first tasks submitted, with idempotent concurrent requests',async()=>{
 const h=harness();await h.prepareContributorDailyTasks(h.admin);
 assert.equal([...h.records.keys()].filter(p=>p.includes('/items/')).length,15);
 await assert.rejects(h.requestMoreContributorTasks(h.req),/Submit all 15/);
 h.submitFirst();const status=await h.getContributorDailyTasks(h.req);assert.equal(status.status,'eligible');
 const [a,b]=await Promise.all([h.requestMoreContributorTasks(h.req),h.requestMoreContributorTasks(h.req)]);assert.equal(a.extraWork,b.extraWork);
 assert.equal([...h.records.keys()].filter(p=>p.includes('/items/')).length,30);
 await h.requestMoreContributorTasks(h.req);assert.equal([...h.records.keys()].filter(p=>p.includes('/items/')).length,30);
});
test('preparation is admin only, exact and duplicate-safe; suspended accounts cannot unlock',async()=>{
 const h=harness();await assert.rejects(h.prepareContributorDailyTasks({...h.admin,auth:{uid:'alice'}}),/Admin only/);
 assert.throws(()=>h.dailyPrompts(Array(30).fill('same')),/different/);assert.throws(()=>h.dailyPrompts(['one']),/exactly 30/);
 await h.prepareContributorDailyTasks(h.admin);await h.prepareContributorDailyTasks(h.admin);
 await assert.rejects(h.prepareContributorDailyTasks({...h.admin,data:{...h.admin.data,expressions:Array.from({length:30},(_,i)=>'Changed '+i)}}),/already prepared/);
 h.submitFirst();h.records.set('contributorAccounts/alice',{status:'suspended'});await assert.rejects(h.requestMoreContributorTasks(h.req),/Activate/);
});
test('future batches release only on their UTC date; yesterday does not unlock today',async()=>{
 const h=harness();await h.prepareContributorDailyTasks({...h.admin,data:{...h.admin.data,day:'2026-09-27'}});
 assert.equal([...h.records.keys()].filter(p=>p.includes('/items/')).length,0);
 assert.equal((await h.getContributorDailyTasks(h.req)).status,'not_prepared');
 await assert.rejects(h.requestMoreContributorTasks(h.req),/not prepared/);
 h.setDay('2026-09-27T00:00:01Z');assert.equal((await h.getContributorDailyTasks(h.req)).submitted,0);
 assert.equal([...h.records.keys()].filter(p=>p.includes('/items/')).length,15);
 h.setDay('2026-09-28T00:00:01Z');assert.equal((await h.getContributorDailyTasks(h.req)).status,'not_prepared');
});
test('skipped/draft tasks do not count as submitted; missing first items cannot unlock',async()=>{
 const h=harness();await h.prepareContributorDailyTasks(h.admin);h.submitFirst();const key=[...h.records.keys()].find(p=>p.includes('/items/'));h.records.set(key,{...h.records.get(key),submissionId:undefined,unsure:true});
 await assert.rejects(h.requestMoreContributorTasks(h.req),/Submit all 15/);h.records.delete(key);await assert.rejects(h.requestMoreContributorTasks(h.req),/Submit all 15/);
});


test('an invitation first batch is reused without duplicating its tasks',async()=>{
 const h=harness();const path='contributorAccounts/alice/works/invited';h.records.set(path,{title:'Invitation'});
 h.admin.data.expressions.slice(0,15).forEach((expression,i)=>h.records.set(path+'/items/'+i,{expression}));
 await h.prepareContributorDailyTasks({...h.admin,data:{...h.admin.data,initialWork:'invited'}});
 assert.equal([...h.records.keys()].filter(p=>p.includes('/items/')).length,15);
 assert.equal((await h.getContributorDailyTasks(h.req)).firstWork,'invited');
 await h.prepareContributorDailyTasks({...h.admin,data:{...h.admin.data,initialWork:'invited'}});
 assert.equal([...h.records.keys()].filter(p=>p.includes('/items/')).length,15);
});
