import { ReviewTiming } from '../ReviewTiming';
import { useListMemory, useListScroll } from '../listMemory';
import { useMemo } from 'react';
import { TableShell } from '@indigen-world/console-ui';
import { useRoute } from '../../router';
import { EmptyNote, Icon, Notice, PageHeader, Skeleton, StatusChip, useNow } from '../components';
import { itemStatus, relativeTime, type Item, type ItemStatus } from '../model';
import { FilterChips, SearchField } from '../../ui';
import { PortalLink, useWorkspace } from '../workspace';

/**
 * Everything the contributor has written, across assignments. An expression
 * nobody has touched is not a contribution yet, so it lives under Assignments.
 *
 * Filters follow the workflow: a draft is private; "submitted" is everything
 * ever sent for review; the other three split submitted work by the current
 * review round's outcome (see model.ts for the counting rules).
 */

type Filter = 'all' | 'draft' | 'submitted' | 'awaiting_review' | 'approved' | 'returned' | 'unsure';

const FILTERS: { id: Filter; label: string; matches: (item: Item, status: ItemStatus) => boolean }[] = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'draft', label: 'Drafts', matches: (_item, status) => status === 'draft' },
  { id: 'submitted', label: 'Submitted', matches: (item) => Boolean(item.submissionId) },
  { id: 'awaiting_review', label: 'Awaiting review', matches: (_item, status) => status === 'awaiting_review' },
  { id: 'approved', label: 'Approved', matches: (_item, status) => status === 'approved' },
  { id: 'returned', label: 'Needs revision', matches: (item) => Boolean(item.submissionId) && ['rejected', 'needs_revision'].includes(item.status) },
  { id: 'unsure', label: 'Flagged unsure', matches: (_item, status) => status === 'unsure' },
];

const CHIP_ORDER: Filter[] = ['all', 'returned', 'draft', 'awaiting_review', 'approved'];

export function ContributionsPage({ initialFilter }: { initialFilter: string }) {
  const data = useWorkspace();
  const { navigate } = useRoute();
  const now = useNow();
  const [filter, setFilter] = useListMemory<Filter>(`contributor-list:${data.uid}:contributions:filter`, 'all', FILTERS.map(x=>x.id), FILTERS.some(x=>x.id===initialFilter)?initialFilter as Filter:undefined);
  const [query, setQuery] = useListMemory<string>(`contributor-list:${data.uid}:contributions:query`, '');
  const titles = useMemo(() => new Map(data.works.map((work) => [work.id, work.title])), [data.works]);
  const rows = useMemo(() => data.works.flatMap((work) => (data.items[work.id] ?? []).map((item) => ({ work: work.id, item, status: itemStatus(item) })))
    .filter((row) => row.status !== 'not_started')
    .sort((a, b) => String(b.item.reviewedAt || b.item.updatedAt || '').localeCompare(String(a.item.reviewedAt || a.item.updatedAt || ''))), [data.items, data.works]);
  const needle = query.trim().toLocaleLowerCase();
  const active = FILTERS.find((entry) => entry.id === filter)!;
  const visible = rows.filter((row) => active.matches(row.item, row.status)
    && (!needle || [row.item.expression, row.item.translation, ...row.item.alternatives, titles.get(row.work) ?? ''].join(' ').toLocaleLowerCase().includes(needle)));
  const loading = data.worksState === 'loading' || (data.worksState === 'ready' && data.itemsState === 'loading');
  const count = (entry: (typeof FILTERS)[number]) => rows.filter((row) => entry.matches(row.item, row.status)).length;

  useListScroll(`contributor-list:${data.uid}:contributions:scroll:${filter}:${query}`, !loading);
  return (
    <div className="ts-page">
      <PageHeader
        kicker="Your work"
        title="My contributions"
        id="page-title"
        description="Every draft and submission, with its review decision. Returned work comes first under Needs revision."
      />
      <div className="ts-toolbar">
        <FilterChips
          label="Filter contributions"
          value={filter}
          onChange={setFilter}
          options={CHIP_ORDER.map((id) => FILTERS.find((entry) => entry.id === id)!).map((entry) => ({ value: entry.id, label: entry.label, count: count(entry) }))}
        />
        <label className="cw-more-filters">
          <span className="sr-only">More filters</span>
          <select className="ts-select ts-select--sm" value={['submitted', 'unsure'].includes(filter) ? filter : ''} onChange={e => { if (e.target.value) setFilter(e.target.value as Filter); }}>
            <option value="">More filters</option>
            <option value="submitted">All submitted ({count(FILTERS[2])})</option>
            <option value="unsure">Flagged unsure ({count(FILTERS[6])})</option>
          </select>
        </label>
        <span className="ts-toolbar__spacer" />
        <SearchField label="Search contributions" placeholder="Search English, Kasem or task" value={query} onChange={setQuery} />
      </div>

      {data.worksState === 'error' || data.itemsState === 'error' ? (
        <Notice tone="danger" title="Your contributions could not be loaded" action={<button type="button" className="ts-btn ts-btn--sm" onClick={() => window.location.reload()}><Icon name="refresh" /><span>Reload</span></button>}>
          <p>Check your connection. Nothing you have saved is lost.</p>
        </Notice>
      ) : loading ? <div className="ts-panel"><Skeleton lines={6} label="Loading your contributions" /></div> : rows.length === 0 ? (
        <EmptyNote title="No contributions yet" icon="contributions" action={<button type="button" className="ts-btn ts-btn--primary" onClick={() => navigate(data.paths.section('assignments'))}><span>Go to your assignments</span><Icon name="arrow" /></button>}>
          Drafts and submissions appear here once you start translating.
        </EmptyNote>
      ) : visible.length === 0 ? (
        <EmptyNote title="Nothing matches" icon="filter">Try another filter or search.</EmptyNote>
      ) : (
        <div className="ts-panel ts-panel--flush">
          <TableShell label="Your contributions">
          <table className="ts-table cw-table">
            <caption className="sr-only">Your contributions, {active.label.toLowerCase()}</caption>
            <thead>
              <tr><th scope="col">Expression</th><th scope="col">Your Kasem</th><th scope="col">Assignment</th><th scope="col">Status</th><th scope="col">Updated</th></tr>
            </thead>
            <tbody>
              {visible.map(({ work, item, status }) => (
                <tr key={`${work}:${item.id}`} className={status === 'returned' ? 'is-attention' : undefined}>
                  <th scope="row" data-label="Expression">
                    <PortalLink to={data.paths.work(work, item.id)} className="ts-table__primary">{item.expression}</PortalLink>
                    {status === 'returned' && item.feedback ? <span className="cw-table__feedback"><Icon name="message" /><span><strong>Reviewer:</strong> {item.feedback}</span></span> : null}
                  </th>
                  <td data-label="Your Kasem" lang="xsm">{item.translation || <span className="ts-faint">—</span>}{item.alternatives.length ? <span className="ts-table__sub">+{item.alternatives.length} alternative{item.alternatives.length === 1 ? '' : 's'}</span> : null}</td>
                  <td data-label="Assignment">{titles.get(work)}</td>
                  <td data-label="Status"><StatusChip status={status} /></td>
                  <td data-label="Updated" className="cw-table__when"><span className="ts-nowrap">{relativeTime(item.reviewedAt || item.updatedAt, now) || <span className="ts-faint">—</span>}</span><ReviewTiming item={item} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableShell>
        </div>
      )}
    </div>
  );
}
