import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useRoute } from '../router';
import { useWorkspace } from './workspace';
type Daily = { day:string; status:string; submitted:number; firstWork:string; extraWork:string };
const getDaily=httpsCallable<Record<string,never>,Daily>(functions,'getContributorDailyTasks');
const more=httpsCallable<Record<string,never>,Daily>(functions,'requestMoreContributorTasks');

export function DailyTasks() {
 const data=useWorkspace();const {navigate}=useRoute();const [daily,setDaily]=useState<Daily|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submittedKey=Object.values(data.items).flat().filter(x=>x.submissionId).map(x=>x.submissionId).sort().join(',');
 useEffect(()=>{let active=true;const refresh=()=>{if(data.preview){setDaily({day:new Date().toISOString().slice(0,10),status:data.works.some(x=>x.id==='daily-preview-extra')?'extra_unlocked':(data.items['daily-preview-first']??[]).filter(x=>x.submissionId).length===15?'eligible':'in_progress',submitted:(data.items['daily-preview-first']??[]).filter(x=>x.submissionId).length,firstWork:'daily-preview-first',extraWork:data.works.some(x=>x.id==='daily-preview-extra')?'daily-preview-extra':''});return;}void getDaily({}).then(r=>{if(active){setDaily(r.data);setError('');}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Daily tasks could not be loaded.');});};refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[data.uid,data.preview,submittedKey,data.works.length]);
 const extraItems=daily?.extraWork?data.items[daily.extraWork]:undefined;
 const finished=Boolean(extraItems?.length===15&&extraItems.every(x=>x.submissionId));
 return <section className="cw-card cw-daily-tasks" aria-label="Daily tasks"><h2>Today’s tasks</h2><p>15 to start · Request another 15 once per UTC day after submitting the first batch.</p>
 {error&&<p role="alert">{error}</p>}
 {!daily&&!error&&<p>Loading today’s tasks…</p>}
 {daily?.status==='not_prepared'&&<p>The team has not prepared today’s tasks yet. Your existing work remains available below.</p>}
 {daily?.status==='in_progress'&&<><p>{daily.submitted} of 15 submitted. Approval is not required to request the next batch.</p><button onClick={()=>navigate(data.paths.work(daily.firstWork))}>Continue first 15</button></>}
 {daily?.status==='eligible'&&<><p>Your first 15 are submitted. You can request today’s final 15.</p><button className="button--primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{if(data.preview){data.services.unlockDailyPreview?.();setDaily({...daily,status:'extra_unlocked',extraWork:'daily-preview-extra'});navigate(data.paths.work('daily-preview-extra'));}else{const r=await more({});setDaily(r.data);navigate(data.paths.work(r.data.extraWork));}}catch(e){setError(e instanceof Error?e.message:'Could not unlock tasks. Try again.');}finally{setBusy(false);}}}>{busy?'Unlocking…':'Request 15 more tasks'}</button></>}
 {daily?.status==='extra_unlocked'&&<><p>{finished?'You’re done for today’s batch. Follow review updates in My contributions.':'You’ve used today’s extra request. Your second batch is ready.'}</p>{!finished&&<button onClick={()=>navigate(data.paths.work(daily.extraWork))}>Open extra 15</button>}<p className="cw-muted">A new daily batch depends on tasks prepared by the team.</p></>}
 </section>;
}
