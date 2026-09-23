import { useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { Chip, EmptyNote, Icon, Notice, PageHeader, SegmentBar, Skeleton, useNow } from '../components';
import { WORK_STATE_META, dueInfo, formatDate, metricsFor, nextContribution, pluralise, workState, type Work, type WorkState } from '../model';
import { PortalLink, useWorkspace } from '../workspace';

type Filter = 'all' | 'open' | 'awaiting' | 'complete';

const FILTERS: { id: Filter; label: string; matches: (state: WorkState) => boolean }[] = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'open', label: 'To do', matches: (state) => ['needs_attention', 'in_progress', 'not_started'].includes(state) },
  { id: 'awaiting', label: 'Awaiting review', matches: (state) => state === 'awaiting_review' },
  { id: 'complete', label: 'Complete', matches: (state) => state === 'complete' },
];

const ORDER: WorkState[] = ['needs_attention', 'in_progress', 'not_started', 'awaiting_review', 'complete', 'empty'];

export function AssignmentsPage() {
  const data = useWorkspace();
  const { navigate } = useRoute();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => data.works.map((work: Work) => {
    const items = data.items[work.id] ?? [];
    const state = workState(items);
    return { work, items, state, metrics: metricsFor(items), next: nextContribution(items) };
  }).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state)
    || (a.work.deadline ?? '9999').localeCompare(b.work.deadline ?? '9999')
    || String(b.work.createdAt).localeCompare(String(a.work.createdAt))), [data.items, data.works]);
  const visible = rows.filter((row) => FILTERS.find((entry) => entry.id === filter)!.matches(row.state));
  const loading = data.worksState === 'loading' || (data.worksState === 'ready' && data.itemsState === 'loading');

  return (
    <div className="cw-page">
      <PageHeader
        kicker="Assignments"
        title="Assignments"
        id="page-title"
        description="Sets of English expressions the team has asked you to translate into Kasem. Open one to read its instructions and work through it."
        actions={<PortalLink to={data.paths.section('guide', { section: 'assignments' })} className="cw-button-secondary"><Icon name="guide" />How assignments work</PortalLink>}
      />
      <div className="cw-toolbar" role="group" aria-label="Filter assignments">
        {FILTERS.map((entry) => {
          const count = rows.filter((row) => entry.matches(row.state)).length;
          return (
            <button key={entry.id} type="button" className="cw-filter" aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
              {entry.label}<span className="cw-filter__count">{count}</span>
            </button>
          );
        })}
      </div>

      {data.worksState === 'error' ? (
        <Notice tone="danger" title="Assignments could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>Check your connection. Nothing you have saved is lost.</p>
        </Notice>
      ) : loading ? <div className="cw-card"><Skeleton lines={5} label="Loading assignments" /></div> : rows.length === 0 ? (
        <EmptyNote title="No assignments yet">When the team assigns expressions to you, each set appears here with its instructions and due date.</EmptyNote>
      ) : visible.length === 0 ? (
        <EmptyNote title="Nothing here">No assignment matches this filter.</EmptyNote>
      ) : (
        <ul className="cw-assignment-list">
          {visible.map(({ work, items, state, metrics, next }) => {
            const due = dueInfo(work.deadline, state === 'complete' || state === 'awaiting_review', new Date(now));
            return (
              <li key={work.id} className="cw-assignment">
                <div className="cw-assignment__main">
                  <div className="cw-assignment__title">
                    <h2><PortalLink to={data.paths.work(work.id)}>{work.title}</PortalLink></h2>
                    <Chip tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Chip>
                  </div>
                  {work.instructions ? <p className="cw-assignment__instructions">{work.instructions}</p> : null}
                  <p className="cw-meta-row">
                    {due ? <span className={`cw-due cw-due--${due.tone}`}><Icon name="clock" />{due.label}</span> : <span className="cw-due"><Icon name="clock" />No due date</span>}
                    <span>{pluralise(items.length, 'expression')}</span>
                    <span>Assigned {formatDate(work.createdAt)}</span>
                    {work.dialect ? <span>{work.dialect}</span> : null}
                  </p>
                  <SegmentBar metrics={metrics} label={`Progress on ${work.title}`} showLegend={false} />
                  <p className="cw-assignment__progress">
                    <strong>{metrics.awaiting + metrics.approved} of {items.length}</strong> sent and not returned
                    {metrics.approved ? ` · ${metrics.approved} approved` : ''}
                    {metrics.returned ? <span className="cw-text-warning"> · {metrics.returned} returned</span> : ''}
                    {metrics.drafts ? ` · ${metrics.drafts} draft${metrics.drafts === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="cw-assignment__actions">
                  {next ? (
                    <button type="button" className={state === 'needs_attention' || state === 'in_progress' ? 'button--primary' : ''} onClick={() => navigate(data.paths.work(work.id, next.id))}>
                      {state === 'needs_attention' ? 'Revise' : state === 'not_started' ? 'Start' : 'Continue'}<Icon name="arrow" />
                    </button>
                  ) : null}
                  <PortalLink to={data.paths.work(work.id)} className="cw-button-secondary">Open</PortalLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
