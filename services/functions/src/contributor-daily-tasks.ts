import { createHash } from 'node:crypto';
import { getFirestore, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { guarded, CONTRIBUTOR_CALL_OPTIONS } from './contributor-common.js';
import { consumeRateLimit } from './rate-limit.js';

const dayNow = () => new Date().toISOString().slice(0,10);
function identifier(value: unknown) { if(typeof value!=='string'||!value||value.length>128||value.includes('/'))throw new HttpsError('invalid-argument','Invalid contributor or task identifier.');return value; }
export function dailyPrompts(value: unknown): string[] {
 if(!Array.isArray(value)||value.length!==30||value.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>180))throw new HttpsError('invalid-argument','Prepare exactly 30 unique expressions: 15 first and 15 extra.');
 const prompts=value.map(x=>x.trim());if(new Set(prompts.map(x=>x.toLocaleLowerCase())).size!==30)throw new HttpsError('invalid-argument','All 30 expressions must be different.');return prompts;
}
function addWork(tx:Transaction,ref:DocumentReference,prompts:string[],title:string,instructions:string,day:string,batch:number) {
 const now=new Date().toISOString();
 tx.create(ref,{id:ref.id,title: title+(batch===1?' · First 15':' · Extra 15'),instructions,kind:'expressions',language:'xsm',createdAt:now,dailyDay:day,dailyBatch:batch});
 for(const expression of prompts){const key=createHash('sha256').update(expression).digest('hex').slice(0,24);tx.create(ref.collection('items').doc(key),{id:key,expression,translation:'',alternatives:[],revision:0,status:'draft',updatedAt:now});}
}
export const prepareContributorDailyTasks=onCall(CONTRIBUTOR_CALL_OPTIONS,guarded('prepareContributorDailyTasks',async req=>{
 const actor=requireAuth(req);requireRole(req,'admin');await consumeRateLimit('prepareContributorDailyTasks',actor,30);
 const uid=identifier(req.data?.contributorId), day=String(req.data?.day||dayNow());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day||day<dayNow())throw new HttpsError('invalid-argument','Choose today or a future UTC date.');
 const prompts=dailyPrompts(req.data?.expressions);const title=String(req.data?.title||'Daily tasks').trim().slice(0,120),instructions=String(req.data?.instructions||'Translate naturally into Kasem.').slice(0,3000);
 const db=getFirestore(),account=db.doc('contributorAccounts/'+uid),plan=db.doc('contributorDailyPlans/'+uid+'_'+day);
 const initialWork=req.data?.initialWork?identifier(req.data.initialWork):'';
 const first=account.collection('works').doc(initialWork||'daily-'+day+'-first');
 await db.runTransaction(async tx=>{
 const member=await tx.get(account),existing=await tx.get(plan);
 if(member.get('status')!=='active')throw new HttpsError('failed-precondition','An active contributor is required.');
 if(existing.exists){if(JSON.stringify(existing.get('prompts'))===JSON.stringify(prompts)&&existing.get('firstWork')===first.id)return;throw new HttpsError('already-exists','A daily batch is already prepared for this date.');}
 if(initialWork){const items=await tx.get(first.collection('items'));if(day!==dayNow()||items.size!==15||items.docs.some(x=>!prompts.slice(0,15).includes(x.get('expression'))))throw new HttpsError('failed-precondition','The invitation must contain exactly the first 15 expressions for today.');}
 const released=Boolean(initialWork)||day===dayNow();
 tx.create(plan,{contributorId:uid,day,prompts,title,instructions,firstWork:first.id,firstReleased:released,extraWork:'daily-'+day+'-extra',requestedAt:null,preparedBy:actor,createdAt:new Date().toISOString()});
 if(!initialWork&&released)addWork(tx,first,prompts.slice(0,15),title,instructions,day,1);
 if(initialWork)tx.update(first,{dailyDay:day,dailyBatch:1});
 if(released)tx.update(account,{defaultWork:first.id});
 tx.create(db.collection('auditLogs').doc(),{actor,action:'contributor.daily.prepare',targetId:uid,day,createdAt:new Date().toISOString()});
 });
 return {contributorId:uid,work:first.id,portalUrl:'https://tribestudio.indigenworld.com/contributor/'+uid+'/'+first.id};
}));
async function dailyAccess(uid:string,requestMore:boolean) {
 const db=getFirestore(),day=dayNow(),account=db.doc('contributorAccounts/'+uid),plan=db.doc('contributorDailyPlans/'+uid+'_'+day);
 return db.runTransaction(async tx=>{
 const member=await tx.get(account),snap=await tx.get(plan);
 if(member.get('status')!=='active'||member.get('requiresPasswordChange')===true)throw new HttpsError('permission-denied','Activate your contributor account first.');
 if(!snap.exists){if(requestMore)throw new HttpsError('failed-precondition','The team has not prepared today’s tasks yet.');return {day,status:'not_prepared',submitted:0,firstWork:'',extraWork:''};}
 const first=account.collection('works').doc(snap.get('firstWork'));
 if(!snap.get('firstReleased')){if(requestMore)throw new HttpsError('failed-precondition','Open your first 15 tasks first.');addWork(tx,first,snap.get('prompts').slice(0,15),snap.get('title'),snap.get('instructions'),day,1);tx.update(plan,{firstReleased:true});tx.update(account,{defaultWork:first.id});return {day,status:'in_progress',submitted:0,firstWork:first.id,extraWork:''};}
 const items=await tx.get(first.collection('items'));
 const submitted=items.docs.filter(x=>Boolean(x.get('submissionId'))).length;
 if(snap.get('requestedAt'))return {day,status:'extra_unlocked',submitted,firstWork:first.id,extraWork:snap.get('extraWork')};
 if(requestMore){if(items.size!==15||submitted!==15)throw new HttpsError('failed-precondition','Submit all 15 tasks in the first batch before requesting more.');
 const extra=account.collection('works').doc(snap.get('extraWork'));addWork(tx,extra,snap.get('prompts').slice(15),snap.get('title'),snap.get('instructions'),day,2);tx.update(plan,{requestedAt:new Date().toISOString()});tx.update(account,{defaultWork:extra.id});tx.create(db.collection('auditLogs').doc(),{actor:uid,action:'contributor.daily.request',targetId:uid,day,work:extra.id,createdAt:new Date().toISOString()});
 return {day,status:'extra_unlocked',submitted,firstWork:first.id,extraWork:extra.id};}
 return {day,status:items.size===15&&submitted===15?'eligible':'in_progress',submitted,firstWork:first.id,extraWork:''};
 });
}
export const getContributorDailyTasks=onCall(CONTRIBUTOR_CALL_OPTIONS,guarded('getContributorDailyTasks',async req=>{const uid=requireAuth(req);await consumeRateLimit('getContributorDailyTasks',uid,120);return dailyAccess(uid,false);}));
export const requestMoreContributorTasks=onCall(CONTRIBUTOR_CALL_OPTIONS,guarded('requestMoreContributorTasks',async req=>{const uid=requireAuth(req);await consumeRateLimit('requestMoreContributorTasks',uid,20);return dailyAccess(uid,true);}));
