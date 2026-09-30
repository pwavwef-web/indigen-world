import { useEffect, useState } from 'react';
import { useWorkspace, PortalLink } from './workspace';
import { livePaymentService, previewService } from './rewards';
export function NotificationCentre() {
 const data=useWorkspace(); const [deliveries,setDeliveries]=useState<{id:string;kind?:string}[]>([]); const [seen,setSeen]=useState<string[]>([]); const [failed,setFailed]=useState(false);
 const key='contributor-notifications:'+data.uid;
 useEffect(()=>{try{setSeen(JSON.parse(localStorage.getItem(key)||'[]'));}catch{setSeen([]);}},[key]);
 useEffect(()=>{let active=true; const refresh=()=>{void (data.preview?previewService:livePaymentService).load().then(r=>{if(active){setDeliveries(r.data.requests.filter(x=>x.status==='fulfilled'));setFailed(false);}}).catch(()=>{if(active)setFailed(true);});};refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[data.uid,data.preview]);
 const returned=Object.values(data.items).flat().filter(x=>['rejected','needs_revision'].includes(x.status));
 const unread=deliveries.filter(x=>!seen.includes(x.id)).length;
 return <details className="cw-notifications"><summary>Updates {unread>0&&<span className="cw-nav__badge">{unread} new</span>}{returned.length>0&&<span> · {returned.length} need revision</span>}</summary><div className="cw-stack">
 {returned.length>0&&<PortalLink to={data.paths.section('contributions',{filter:'returned'})}>Read feedback on {returned.length} returned tasks</PortalLink>}
 {deliveries.map(x=><p key={x.id}><PortalLink to={data.paths.section('rewards',{view:'history'})}>{x.kind==='airtime'?'Airtime':'Mobile data'} delivered</PortalLink>{!seen.includes(x.id)&&' · New'}</p>)}
 {failed ? <p>Delivery updates could not be loaded. Open Points → History to try again.</p> : !returned.length&&!deliveries.length&&<p>No task or delivery updates yet.</p>}
 <PortalLink to={data.paths.section('activity')}>View all activity</PortalLink>
 {unread>0&&<button type="button" onClick={()=>{const ids=deliveries.map(x=>x.id);setSeen(ids);try{localStorage.setItem(key,JSON.stringify(ids));}catch{}}}>Mark delivery updates read</button>}
 </div></details>;
}
