import { useMemo } from 'react';
import { useListMemory, useListScroll } from '../listMemory';
import { Badge, EmptyState, FilterChips, Icon, Notice, PageHeader, Panel, SegmentBar, Skeleton, cx, useNow } from '../components';
import { WORK_STATE_META, dueInfo, formatDate, metricsFor, nextContribution, pluralise, workState, type Work, type WorkState } from '../model';
import { DailyBatch } from '../DailyTasks';
import { PortalLink, useWorkspace } from '../workspace';

type Filter = 'open' | 'awaiting' | 'complete' | 'all';

const FILTERS: { id: Filter; label: string; matches: (state: WorkState) => boolean }[] = [
  { id: 'open', label: 'To do', matches: (state) => ['needs_attention', 'in_progress', 'not_started'].includes(state) },
  { id: 'awaiting', label: 'Awaiting review', matches: (state) => state === 'awaiting_review' },
  { id: 'complete', label: 'Complete', matches: (state) => state === 'complete' },
  { id: 'all', label: 'All', matches: () => true },
];

const ORDER: WorkState[] = ['needs_attention', 'in_progress', 'not_started', 'awaiting_review', 'complete', 'empty'];

/**
 * Every translation task assigned to the contributor: what is left in each,
 * when it is due (guidance, never a lock), and the one action that moves it
 * forward. Tasks needing revision sort first.
 */
export function AssignmentsPage() {
  const data = useWorkspace();
  const now = useNow();
  const rows = useMemo(() => data.works.map((work: Work) => {
    const items = data.items[work.id] ?? [];
    const state = workState(items);
    return { work, items, state, metrics: metricsFor(items), next: nextContribution(items) };
  }).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state)
    || (a.work.deadline ?? '9999').localeCompare(b.work.deadline ?? '9999')
    || String(b.work.createdAt).localeCompare(String(a.work.createdAt))), [data.items, data.works]);
  const counts = Object.fromEntries(FILTERS.map((entry) => [entry.id, rows.filter((row) => entry.matches(row.state)).length])) as Record<Filter, number>;
  const [filter, setFilter] = useListMemory<Filter>(`contributor-list:${data.uid}:tasks:view`, 'open', FILTERS.map((entry) => entry.id));
  const visible = rows.filter((row) => FILTERS.find((entry) => entry.id === filter)!.matches(row.state));
  const loading = data.worksState === 'loading' || (data.worksState === 'ready' && data.itemsState === 'loading');
  useListScroll(`contributor-list:${data.uid}:tasks:scroll:${filter}`, !loading);

  return (
    <div className="cw-page">
      <PageHeader
        title="Tasks"
        description="Translation sets the team has assigned to you. Each has its own instructions, and saves as you work."
        actions={<PortalLink to={data.paths.section('guide', { section: 'assignments' })} className="cw-btn"><Icon name="guide" />How tasks work</PortalLink>}
      />
      <DailyBatch />

      {data.worksState === 'error' ? (
        <Notice tone="danger" title="Your tasks could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>Check your connection. Nothing you have saved is lost.</p>
        </Notice>
      ) : loading ? (
        <Panel><Skeleton lines={5} label="Loading tasks" /></Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tasks assigned yet"
          icon="assignments"
          actions={<>
            <PortalLink to={data.paths.section('contribute', { type: 'expression' })} className="cw-btn cw-btn--primary">Share an everyday expression</PortalLink>
            <PortalLink to={data.paths.section('guide', { section: 'assignments' })} className="cw-btn">How tasks work</PortalLink>
          </>}
        >
          When the team assigns a set of expressions to you, it appears here with its instructions and due date. You can still share expressions, words and recordings of your own.
        </EmptyState>
      ) : (
        <Panel
          title="Your tasks"
          flush
          actions={<FilterChips label="Show tasks" value={filter} onChange={setFilter} options={FILTERS.map((entry) => ({ id: entry.id, label: entry.label, count: counts[entry.id] }))} />}
        >
          {visible.length === 0 ? (
            <EmptyState title={filter === 'open' ? 'Nothing left to do' : 'No tasks here'} icon="check" variant="bare" actions={filter !== 'all' ? <button type="button" onClick={() => setFilter('all')}>Show all tasks</button> : undefined}>
              {filter === 'open' ? 'Every task assigned to you has been submitted. Reviewer decisions appear in My submissions.' : 'No task matches this view.'}
            </EmptyState>
          ) : (
            <ul className="cw-task-list">
              {visible.map(({ work, items, state, metrics, next }) => {
                const due = dueInfo(work.deadline, state === 'complete' || state === 'awaiting_review', new Date(now));
                const open = metrics.notStarted + metrics.drafts + metrics.unsure;
                return (
                  <li key={work.id} className={cx('cw-task', state === 'needs_attention' && 'is-attention')}>
                    <div className="cw-task__main">
                      <div className="cw-task__title">
                        <h3><PortalLink to={data.paths.work(work.id)}>{work.title}</PortalLink></h3>
                        <Badge tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Badge>
                      </div>
                      <p className="cw-page-head__meta">
                        <span className={cx(due && `cw-due cw-due--${due.tone}`)}><Icon name="clock" className="cw-icon--sm" />{due ? due.label : 'No due date'}</span>
                        <span>{pluralise(items.length, 'expression')}</span>
                        <span>Assigned {formatDate(work.createdAt)}</span>
                        {work.dialect ? <span>{work.dialect}</span> : null}
                      </p>
                    </div>
                    <div className="cw-task__progress">
                      <SegmentBar metrics={metrics} label={`Progress on ${work.title}`} showLegend={false} />
                      <p className="cw-small cw-muted">
                        {open ? `${open} to do` : 'Nothing left to translate'}
                        {metrics.returned ? <> · <span className="cw-text-warning">{metrics.returned} returned</span></> : null}
                        {metrics.awaiting ? ` · ${metrics.awaiting} awaiting review` : ''}
                        {metrics.approved ? ` · ${metrics.approved} approved` : ''}
                      </p>
                    </div>
                    <div className="cw-task__action">
                      {next ? (
                        <PortalLink to={data.paths.work(work.id, next.id)} className={cx('cw-btn cw-btn--sm', (state === 'needs_attention' || state === 'in_progress' || state === 'not_started') && 'cw-btn--primary')}>
                          {state === 'needs_attention' ? 'Revise' : state === 'not_started' ? 'Start' : 'Continue'}
                        </PortalLink>
                      ) : <PortalLink to={data.paths.work(work.id)} className="cw-btn cw-btn--sm">Open</PortalLink>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
