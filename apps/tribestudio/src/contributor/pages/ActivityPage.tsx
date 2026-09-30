import { useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { ActivityList, Card, EmptyNote, Notice, PageHeader, PulsePanel, Skeleton, useNow } from '../components';
import { activityFrom, groupByDay, type ActivityEvent } from '../model';
import { useWorkspace } from '../workspace';

type Filter = 'all' | 'reviews' | 'submissions' | 'assignments' | 'payments';

const FILTERS: { id: Filter; label: string; kinds: ActivityEvent['kind'][] | null }[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'reviews', label: 'Review decisions', kinds: ['approved', 'returned', 'in_review', 'archived'] },
  { id: 'submissions', label: 'Submissions', kinds: ['submitted', 'resubmitted'] },
  { id: 'assignments', label: 'Assignments', kinds: ['assigned'] },
  { id: 'payments', label: 'Payment details', kinds: ['payment'] },
];

export function ActivityPage() {
  const data = useWorkspace();
  const { navigate } = useRoute();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const events = useMemo(() => activityFrom(data.rounds, data.works, data.paymentNotices), [data.paymentNotices, data.rounds, data.works]);
  const kinds = FILTERS.find((entry) => entry.id === filter)!.kinds;
  const visible = kinds ? events.filter((event) => kinds.includes(event.kind)) : events;
  const groups = groupByDay(visible, new Date(now));
  const open = (event: ActivityEvent) => {
    if (event.link) navigate(event.link);
    else if (event.work) navigate(data.paths.work(event.work, event.item));
  };

  return (
    <div className="cw-page">
      <PageHeader
        kicker="Activity"
        title="See your work move forward."
        id="page-title"
        description="Submissions, review decisions and updates, as they happen."
      />
      <div className="cw-two-column">
        <div>
          <div className="cw-toolbar" role="group" aria-label="Filter activity">
            {FILTERS.map((entry) => (
              <button key={entry.id} type="button" className="cw-filter" aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
                {entry.label}<span className="cw-filter__count">{entry.kinds ? events.filter((event) => entry.kinds!.includes(event.kind)).length : events.length}</span>
              </button>
            ))}
          </div>
          {data.roundsState === 'error' ? (
            <Notice tone="warning" title="Your review history could not be loaded">
              <p>New assignments still show below. Reload the page to try again.</p>
            </Notice>
          ) : null}
          {data.roundsState === 'loading' ? <div className="cw-card"><Skeleton lines={6} label="Loading your activity" /></div> : groups.length === 0 ? (
            <EmptyNote title="Nothing here yet">Submissions and reviewer decisions will appear here as they happen.</EmptyNote>
          ) : (
            <div className="cw-timeline">
              {groups.map((group) => (
                <Card key={group.label} title={group.label} className="cw-timeline__day">
                  <ActivityList events={group.events} onOpen={open} now={now} />
                </Card>
              ))}
            </div>
          )}
        </div>
        <aside className="cw-side-stack" aria-label="Community">
          <PulsePanel pulse={data.pulse} onPrivacy={() => navigate(data.paths.account('notifications'))} />
          <Card title="About this feed">
            <p className="cw-muted">Your timeline is private to you. “Community today” shows only counts and the names of contributors who chose to be named; you can change how you appear under Account & settings.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
