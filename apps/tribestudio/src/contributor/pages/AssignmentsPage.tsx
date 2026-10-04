import { DailyTasks } from '../DailyTasks';
import { useListMemory, useListScroll } from '../listMemory';
import { useMemo } from 'react';
import { useRoute } from '../../router';
import { Chip, EmptyNote, Icon, Notice, PageHeader, SegmentBar, Skeleton, useNow } from '../components';
import { WORK_STATE_META, dueInfo, formatDate, metricsFor, nextContribution, pluralise, workState, type Work, type WorkState } from '../model';
import { Badge, Button, FilterChips } from '../../ui';
import { PortalLink, useWorkspace } from '../workspace';

type Filter = 'all' | 'open' | 'awaiting' | 'complete';

const FILTERS: { id: Filter; label: string; matches: (state: WorkState) => boolean }[] = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'open', label: 'To do', matches: (state) => ['needs_attention', 'in_progress', 'not_started'].includes(state) },
  { id: 'awaiting', label: 'Awaiting review', matches: (state) => state === 'awaiting_review' },
  { id: 'complete', label: 'Complete', matches: (state) => state === 'complete' },
];

const ORDER: WorkState[] = ['needs_attention', 'in_progress', 'not_started', 'awaiting_review', 'complete', 'empty'];
const DUE_TONE: Record<string, 'neutral' | 'warning' | 'danger' | 'info'> = { danger: 'danger', warning: 'warning', neutral: 'neutral', info: 'info' };

export function AssignmentsPage() {
  const data = useWorkspace();
  const { navigate } = useRoute();
  const now = useNow();
  const [filter, setFilter] = useListMemory<Filter>(`contributor-list:${data.uid}:tasks:filter`, 'all', FILTERS.map(x=>x.id));
  const rows = useMemo(() => data.works.map((work: Work) => {
    const items = data.items[work.id] ?? [];
    const state = workState(items);
    return { work, items, state, metrics: metricsFor(items), next: nextContribution(items) };
  }).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state)
    || (a.work.deadline ?? '9999').localeCompare(b.work.deadline ?? '9999')
    || String(b.work.createdAt).localeCompare(String(a.work.createdAt))), [data.items, data.works]);
  const visible = rows.filter((row) => FILTERS.find((entry) => entry.id === filter)!.matches(row.state));
  const loading = data.worksState === 'loading' || (data.worksState === 'ready' && data.itemsState === 'loading');
  const toDo = rows.filter((row) => FILTERS[1].matches(row.state)).length;
  const awaiting = rows.filter((row) => row.state === 'awaiting_review').length;

  useListScroll(`contributor-list:${data.uid}:tasks:scroll:${filter}`, !loading);
  return (
    <div className="ts-page">
      <PageHeader
        kicker="Your work"
        title="Assignments"
        id="page-title"
        description={loading ? 'Loading your assignments…' : rows.length ? `${pluralise(toDo, 'assignment')} to work on · ${awaiting} awaiting review` : 'Sets of expressions the team assigns to you appear here.'}
        actions={<PortalLink to={data.paths.section('guide', { section: 'assignments' })} className="ts-btn ts-btn--ghost"><Icon name="guide" /><span>How assignments work</span></PortalLink>}
      />
      <DailyTasks />
      <div className="ts-toolbar">
        <FilterChips
          label="Filter assignments"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((entry) => ({ value: entry.id, label: entry.label, count: rows.filter((row) => entry.matches(row.state)).length }))}
        />
      </div>

      {data.worksState === 'error' ? (
        <Notice tone="danger" title="Assignments could not be loaded" action={<button type="button" className="ts-btn ts-btn--sm" onClick={() => window.location.reload()}><Icon name="refresh" /><span>Reload</span></button>}>
          <p>Check your connection. Nothing you have saved is lost.</p>
        </Notice>
      ) : loading ? <div className="ts-panel"><Skeleton lines={5} label="Loading assignments" /></div> : rows.length === 0 ? (
        <EmptyNote title="No assignments yet" icon="assignments">When the team assigns expressions to you, each set appears here with its instructions and due date.</EmptyNote>
      ) : visible.length === 0 ? (
        <EmptyNote title="Nothing here" icon="filter">No assignment matches this filter.</EmptyNote>
      ) : (
        <ul className="cw-assignments ts-stagger">
          {visible.map(({ work, items, state, metrics, next }) => {
            const due = dueInfo(work.deadline, state === 'complete' || state === 'awaiting_review', new Date(now));
            return (
              <li key={work.id} className={`cw-assignment${state === 'needs_attention' ? ' is-attention' : ''}`}>
                <div className="cw-assignment__main">
                  <div className="cw-assignment__head">
                    <span className="ts-card__icon ts-card__icon--ws" aria-hidden="true"><Icon name={state === 'complete' ? 'check-circle' : 'assignments'} /></span>
                    <div className="cw-assignment__title">
                      <h2><PortalLink to={data.paths.work(work.id)}>{work.title}</PortalLink></h2>
                      <div className="ts-cluster">
                        {due ? <Badge tone={DUE_TONE[due.tone] ?? 'neutral'} dot>{due.label}</Badge> : <Badge>No due date</Badge>}
                        <span className="ts-muted cw-assignment__meta">{pluralise(items.length, 'expression')} · Assigned {formatDate(work.createdAt)}{work.dialect ? ` · ${work.dialect}` : ''}</span>
                      </div>
                    </div>
                    <Chip tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Chip>
                  </div>
                  <SegmentBar metrics={metrics} label={`Progress on ${work.title}`} showLegend={false} />
                  <p className="cw-assignment__progress">
                    <span><strong>{metrics.approved}</strong> approved</span>
                    <span><strong>{metrics.awaiting}</strong> awaiting review</span>
                    {metrics.returned ? <span className="cw-text-warning"><strong>{metrics.returned}</strong> returned</span> : null}
                    {metrics.drafts ? <span><strong>{metrics.drafts}</strong> draft{metrics.drafts === 1 ? '' : 's'}</span> : null}
                    {metrics.notStarted ? <span><strong>{metrics.notStarted}</strong> not started</span> : null}
                  </p>
                  {work.instructions ? (
                    <details className="ts-disclosure ts-disclosure--quiet cw-assignment__brief">
                      <summary><Icon name="doc" /><span>Read the brief</span><Icon name="chevron" className="ts-disclosure__chev" /></summary>
                      <div className="ts-disclosure__body"><p>{work.instructions}</p></div>
                    </details>
                  ) : null}
                </div>
                <div className="cw-assignment__actions">
                  {next ? (
                    <Button variant={state === 'needs_attention' || state === 'in_progress' ? 'primary' : 'secondary'} iconRight="arrow" onClick={() => navigate(data.paths.work(work.id, next.id))}>
                      {state === 'needs_attention' ? 'Revise' : state === 'not_started' ? 'Start' : 'Continue'}
                    </Button>
                  ) : null}
                  <PortalLink to={data.paths.work(work.id)} className="ts-btn ts-btn--ghost"><span>Open</span></PortalLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
