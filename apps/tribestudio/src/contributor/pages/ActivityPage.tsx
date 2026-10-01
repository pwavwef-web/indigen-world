import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { ActivityList, EmptyState, FilterChips, Notice, PageHeader, Panel, Skeleton, useNow } from '../components';
import { groupByDay, type ActivityEvent } from '../model';
import { useShared, useWorkspace } from '../workspace';

type Filter = 'all' | 'reviews' | 'submissions' | 'assignments' | 'payments';

const FILTERS: { id: Filter; label: string; kinds: ActivityEvent['kind'][] | null }[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'reviews', label: 'Reviewer decisions', kinds: ['approved', 'returned', 'in_review', 'archived'] },
  { id: 'submissions', label: 'Your submissions', kinds: ['submitted', 'resubmitted'] },
  { id: 'assignments', label: 'New tasks', kinds: ['assigned'] },
  { id: 'payments', label: 'Payment details', kinds: ['payment'] },
];

/**
 * Updates: reviewer decisions, new tasks and payment-verification notices,
 * with the contributor's own submissions for context. Built only from records
 * the workspace already reads; nothing is inferred. Opening the page marks
 * the updates as seen in this browser.
 */
export function ActivityPage() {
  const data = useWorkspace();
  const { events, markUpdatesSeen } = useShared();
  const { navigate } = useRoute();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => { markUpdatesSeen(); }, [markUpdatesSeen]);
  const kinds = FILTERS.find((entry) => entry.id === filter)!.kinds;
  const visible = useMemo(() => (kinds ? events.filter((event) => kinds.includes(event.kind)) : events), [events, kinds]);
  const groups = groupByDay(visible, new Date(now));
  const open = (event: ActivityEvent) => {
    if (event.link) navigate(event.link);
    else if (event.work) navigate(data.paths.work(event.work, event.item));
  };

  return (
    <div className="cw-page">
      <PageHeader title="Updates" description="Reviewer decisions, new tasks and payment-detail notices, newest first. Your own submissions are listed for context." />
      <FilterChips label="Show updates" value={filter} onChange={setFilter} options={FILTERS.map((entry) => ({
        id: entry.id, label: entry.label, count: entry.kinds ? events.filter((event) => entry.kinds!.includes(event.kind)).length : events.length,
      }))} />
      {data.roundsState === 'error' ? (
        <Notice tone="warning" title="Your review history could not be loaded">
          <p>New tasks still show below. Reload the page to try again.</p>
        </Notice>
      ) : null}
      {data.roundsState === 'loading' ? <Panel><Skeleton lines={6} label="Loading updates" /></Panel> : groups.length === 0 ? (
        <EmptyState title={filter === 'all' ? 'No updates yet' : 'Nothing here yet'} icon="bell">
          Reviewer decisions and new tasks appear here as they happen. Decisions on everyday expressions, words and recordings are shown on each submission.
        </EmptyState>
      ) : (
        <div className="cw-stack">
          {groups.map((group) => (
            <Panel key={group.label} title={group.label} flush>
              <ActivityList events={group.events} onOpen={open} now={now} />
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
