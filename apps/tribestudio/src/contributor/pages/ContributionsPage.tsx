import { useMemo, useState } from 'react';
import { TableShell } from '@indigen-world/console-ui';
import { useListMemory, useListScroll } from '../listMemory';
import {
  Badge,
  EmptyState,
  Icon,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  FilterBar,
  SearchField,
  SelectField,
  Skeleton,
  TypeTag,
  paginate,
  useNow,
} from '../components';
import { formatDate, formatDateTime, relativeTime } from '../model';
import {
  ACTION_LABEL,
  STATE_META,
  STATUS_FILTERS,
  TYPE_META,
  filterRows,
  sortRows,
  type ContributionType,
  type SortOrder,
  type StatusFilter,
  type TypeFilter,
} from '../submissions';
import { PortalLink, useShared, useWorkspace } from '../workspace';
import { rowActionHref } from './OverviewPage';
import { SubmissionDetail } from './SubmissionDetail';

const PAGE_SIZE = 25;
const TYPES: ContributionType[] = ['assigned', 'expression', 'word', 'recording'];
const LEGACY_FILTERS: Record<string, StatusFilter> = {
  returned: 'action', draft: 'drafts', awaiting_review: 'in_review', submitted: 'in_review', unsure: 'drafts',
};

/**
 * Everything the contributor has saved or sent, across every kind of work,
 * with where each piece stands and the next step when there is one. A row
 * opens its own page with the material, the feedback and the history.
 */
export function ContributionsPage({ initialFilter, view }: { initialFilter: string; view: string }) {
  if (view) return <SubmissionDetail rowKey={view} />;
  return <SubmissionList initialFilter={initialFilter} />;
}

function SubmissionList({ initialFilter }: { initialFilter: string }) {
  const data = useWorkspace();
  const { rows } = useShared();
  const now = useNow();
  const requested = (LEGACY_FILTERS[initialFilter] ?? initialFilter) as StatusFilter;
  const statusIds = STATUS_FILTERS.map((entry) => entry.id);
  const [status, setStatus] = useListMemory<StatusFilter>(`contributor-list:${data.uid}:submissions:status`, 'all', statusIds, statusIds.includes(requested) ? requested : undefined);
  const [type, setType] = useListMemory<TypeFilter>(`contributor-list:${data.uid}:submissions:type`, 'all', ['all', ...TYPES]);
  const [sort, setSort] = useListMemory<SortOrder>(`contributor-list:${data.uid}:submissions:sort`, 'recent', ['recent', 'oldest']);
  const [query, setQuery] = useListMemory<string>(`contributor-list:${data.uid}:submissions:query`, '');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => sortRows(filterRows(rows, { status, type, query }), sort), [query, rows, sort, status, type]);
  const pageView = paginate(filtered, page, PAGE_SIZE);
  const loading = data.worksState === 'loading' || (data.worksState === 'ready' && data.itemsState === 'loading')
    || data.receiptsState === 'loading' || data.recordingsState === 'loading';
  const failed = [
    data.worksState === 'error' || data.itemsState === 'error' ? 'assigned tasks' : '',
    data.receiptsState === 'error' ? 'expressions and words' : '',
    data.recordingsState === 'error' ? 'recordings' : '',
  ].filter(Boolean);
  const filtering = status !== 'all' || type !== 'all' || query.trim() !== '';
  useListScroll(`contributor-list:${data.uid}:submissions:scroll:${status}:${type}`, !loading);
  const clear = () => { setStatus('all'); setType('all'); setQuery(''); setPage(1); };

  return (
    <div className="cw-page">
      <PageHeader
        title="My submissions"
        description="Everything you have saved or sent for review, with each reviewer’s decision and what happens next."
        actions={<PortalLink to={data.paths.section('contribute')} className="cw-btn"><Icon name="plus" />Start a contribution</PortalLink>}
      />

      {failed.length ? (
        <Notice tone="danger" title="Some of your submissions could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>Could not load your {failed.join(' or ')}. The list below may be incomplete. Nothing you have saved is lost.</p>
        </Notice>
      ) : null}

      {loading && !rows.length ? (
        <Panel><Skeleton lines={6} label="Loading your submissions" /></Panel>
      ) : !rows.length ? (
        <EmptyState
          title="Nothing saved or submitted yet"
          icon="contributions"
          actions={<>
            <PortalLink to={data.paths.section('assignments')} className="cw-btn cw-btn--primary">Open your tasks</PortalLink>
            <PortalLink to={data.paths.section('contribute')} className="cw-btn">Start a contribution</PortalLink>
          </>}
        >
          Drafts and submissions appear here as soon as you start. Each one shows its review status and the reviewer’s feedback.
        </EmptyState>
      ) : (
        <Panel flush className="cw-submissions">
          <FilterBar
            id="submission-filters"
            active={[type !== 'all', status !== 'all', sort !== 'recent'].filter(Boolean).length}
            search={<SearchField id="submission-search" label="Search" value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="English, Kasem, task or feedback" />}
          >
            <SelectField<TypeFilter>
              id="submission-type"
              label="Type"
              value={type}
              onChange={(value) => { setType(value); setPage(1); }}
              options={[{ value: 'all', label: 'All types' }, ...TYPES.map((entry) => ({ value: entry as TypeFilter, label: TYPE_META[entry].plural }))]}
            />
            <SelectField<StatusFilter>
              id="submission-status"
              label="Status"
              value={status}
              onChange={(value) => { setStatus(value); setPage(1); }}
              options={STATUS_FILTERS.map((entry) => ({ value: entry.id, label: entry.label }))}
            />
            <SelectField<SortOrder>
              id="submission-sort"
              label="Sort"
              value={sort}
              onChange={(value) => { setSort(value); setPage(1); }}
              options={[{ value: 'recent', label: 'Latest activity first' }, { value: 'oldest', label: 'Oldest submitted first' }]}
            />
          </FilterBar>
          <div className="cw-resultbar">
            <span aria-live="polite">{filtered.length === rows.length ? `${rows.length} in total` : `${filtered.length} of ${rows.length} match`}</span>
            {filtering ? <button type="button" className="cw-link-button" onClick={clear}>Clear filters</button> : null}
          </div>
          {!filtered.length ? (
            <EmptyState title="No submissions match" icon="search" variant="bare" actions={<button type="button" onClick={clear}>Clear filters</button>}>
              Try another word, or show all types and statuses.
            </EmptyState>
          ) : (
            <>
              <TableShell label="Your submissions">
                <table className="cw-table cw-table--stack">
                  <caption className="cw-sr">Your submissions, {STATUS_FILTERS.find((entry) => entry.id === status)?.label.toLowerCase()}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Submission</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                      <th scope="col">Submitted</th>
                      <th scope="col">Last update</th>
                      <th scope="col"><span className="cw-sr">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageView.rows.map((row) => (
                      <tr key={row.key} className={row.action === 'revise' || row.action === 'correct' || row.action === 'record_again' ? 'is-attention' : undefined}>
                        <th scope="row">
                          <PortalLink to={data.paths.section('contributions', { view: row.key })} className="cw-table__primary"><span lang={row.titleLang}>{row.title}</span></PortalLink>
                          {row.subtitle ? <span className="cw-table__sub" lang={row.subtitleLang}>{row.subtitle}</span> : <span className="cw-table__sub">No translation yet</span>}
                          {row.type === 'assigned' ? <span className="cw-table__sub">Task: {row.context}</span> : null}
                          {row.feedback && (row.state === 'returned' || row.state === 'not_accepted') ? <span className="cw-table__feedback"><strong>Reviewer:</strong> {row.feedback}</span> : null}
                        </th>
                        <td data-label="Type"><TypeTag icon={TYPE_META[row.type].icon}>{TYPE_META[row.type].label}</TypeTag></td>
                        <td data-label="Status"><Badge tone={STATE_META[row.state].tone}>{STATE_META[row.state].label}</Badge>{row.rounds > 1 ? <span className="cw-table__sub">Round {row.rounds}</span> : null}</td>
                        <td data-label="Submitted" className="cw-nowrap">{row.submittedAt ? <time dateTime={row.submittedAt} title={formatDateTime(row.submittedAt)}>{formatDate(row.submittedAt)}</time> : <span className="cw-muted">Not sent</span>}</td>
                        <td data-label="Last update" className="cw-nowrap">{row.updatedAt ? <time dateTime={row.updatedAt} title={formatDateTime(row.updatedAt)}>{relativeTime(row.updatedAt, now)}</time> : <span className="cw-muted">—</span>}</td>
                        <td className="cw-table__actions">
                          {row.action ? (
                            <PortalLink to={rowActionHref(row, data.paths)} className={`cw-btn cw-btn--sm${row.action === 'continue' ? '' : ' cw-btn--primary'}`}>{ACTION_LABEL[row.action]}</PortalLink>
                          ) : (
                            <PortalLink to={data.paths.section('contributions', { view: row.key })} className="cw-btn cw-btn--sm cw-btn--ghost">Details</PortalLink>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
              <Pagination page={pageView.page} pageCount={pageView.pageCount} from={pageView.from} to={pageView.to} total={filtered.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} noun="submissions" />
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
