import { useWorkspace } from './workspace';
import type { Item } from './model';
function date(value: string | null | undefined) { const parsed=value?new Date(value):null; return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}) : null; }
export function ReviewTiming({item}: {item:Item}) {
 const data=useWorkspace();
 if(!item.submissionId)return null;
 const round=data.rounds.find(x=>x.id===item.submissionId);
 const submitted=date(round?.createdAt||item.submittedAt);
 const reviewed=date(round?.decidedAt||item.reviewedAt);
 return <div className="cw-review-timing"><p>Submitted: {submitted|| (data.roundsState==='loading'?'Loading…':'Date unavailable')}</p><p>{reviewed?'Latest review: '+reviewed:['submitted','resubmitted'].includes(item.status)?'Awaiting review — no decision yet.':'Review status: '+item.status.replaceAll('_',' ')}</p>{['submitted','resubmitted'].includes(item.status)&&<small>We’ll show the decision here when your work is reviewed.</small>}</div>;
}
