import { useWorkspace } from './workspace';
import type { Item } from './model';
import { Icon } from '../ui/icons';

function date(value: string | null | undefined) { const parsed = value ? new Date(value) : null; return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null; }

/** When an expression was sent and when it was last decided, from the review rounds. */
export function ReviewTiming({ item }: { item: Item }) {
  const data = useWorkspace();
  if (!item.submissionId) return null;
  const round = data.rounds.find(x => x.id === item.submissionId);
  const submitted = date(round?.createdAt || item.submittedAt);
  const reviewed = date(round?.decidedAt || item.reviewedAt);
  const waiting = ['submitted', 'resubmitted'].includes(item.status);
  return (
    <div className="cw-review-timing">
      <span><Icon name="send" />Submitted {submitted || (data.roundsState === 'loading' ? '…' : 'date unavailable')}</span>
      <span><Icon name={waiting ? 'hourglass' : 'check-circle'} />{reviewed ? `Latest review ${reviewed}` : waiting ? 'Awaiting review — no decision yet' : `Review status: ${item.status.replaceAll('_', ' ')}`}</span>
      {waiting ? <small>The decision will appear here when your work is reviewed.</small> : null}
    </div>
  );
}
