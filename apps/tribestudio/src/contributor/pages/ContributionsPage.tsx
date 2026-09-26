import { ReviewTiming } from '../ReviewTiming';
import { useListMemory, useListScroll } from '../listMemory';
import { useMemo } from 'react';
import { TableShell } from '@indigen-world/console-ui';
import { useRoute } from '../../router';
import { EmptyNote, Icon, Notice, PageHeader, Skeleton, StatusChip, useNow } from '../components';
import { itemStatus, relativeTime, type Item, type ItemStatus } from '../model';
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

  useListScroll(`contributor-list:${data.uid}:contributions:scroll:${filter}:${query}`, !loading);
  return (
    <div className="cw-page">
      <PageHeader
        kicker="My contributions"
        title="My contributions"
        id="page-title"
        description="Every expression you have written, with its current review status. Open one to read reviewer feedback or keep working on it."
      />
      <div className="cw-toolbar cw-toolbar--split">
        <div className="cw-filters" role="group" aria-label="Filter contributions">
          {[...FILTERS].sort((a,b)=>['all','returned','draft','awaiting_review','approved','submitted','unsure'].indexOf(a.id)-['all','returned','draft','awaiting_review','approved','submitted','unsure'].indexOf(b.id)).filter(entry=>!['submitted','unsure'].includes(entry.id)).map((entry) => (
            <button key={entry.id} type="button" className="cw-filter" aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
              {entry.label}<span className="cw-filter__count">{rows.filter((row) => entry.matches(row.item, row.status)).length}</span>
            </button>
          ))}
          <label><span className="cw-sr">More filters</span><select value={['submitted','unsure'].includes(filter)?filter:''} onChange={e=>{if(e.target.value)setFilter(e.target.value as Filter);}}><option value="">More filters</option><option value="submitted">All submitted</option><option value="unsure">Flagged unsure</option></select></label>
        </div>
        <label className="cw-search cw-search--compact">
          <span className="cw-sr">Search contributions</span>
          <Icon name="search" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search English, Kasem or assignment" />
        </label>
      </div>

      {data.worksState === 'error' || data.itemsState === 'error' ? (
        <Notice tone="danger" title="Your contributions could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>Check your connection. Nothing you have saved is lost.</p>
        </Notice>
      ) : loading ? <div className="cw-card"><Skeleton lines={6} label="Loading your contributions" /></div> : rows.length === 0 ? (
        <EmptyNote title="No contributions yet" action={<button type="button" className="button--primary" onClick={() => navigate(data.paths.section('assignments'))}>Go to your assignments</button>}>
          Drafts and submissions appear here once you start translating.
        </EmptyNote>
      ) : visible.length === 0 ? (
        <EmptyNote title="Nothing matches">Try another filter or search.</EmptyNote>
      ) : (
        <div className="cw-card cw-card--flush">
          <TableShell label="Your contributions">
          <table className="cw-table">
            <caption className="cw-sr">Your contributions, {active.label.toLowerCase()}</caption>
            <thead>
              <tr><th scope="col">Expression</th><th scope="col">Your Kasem</th><th scope="col">Assignment</th><th scope="col">Status</th><th scope="col">Updated</th></tr>
            </thead>
            <tbody>
              {visible.map(({ work, item, status }) => (
                <tr key={`${work}:${item.id}`} className={status === 'returned' ? 'is-attention' : undefined}>
                  <th scope="row" data-label="Expression">
                    <PortalLink to={data.paths.work(work, item.id)} className="cw-table__primary">{item.expression}</PortalLink>
                    {status === 'returned' && item.feedback ? <span className="cw-table__feedback"><strong>Reviewer:</strong> {item.feedback}</span> : null}
                  </th>
                  <td data-label="Your Kasem" lang="xsm">{item.translation || <span className="cw-muted">—</span>}{item.alternatives.length ? <span className="cw-table__sub">+{item.alternatives.length} alternative{item.alternatives.length === 1 ? '' : 's'}</span> : null}</td>
                  <td data-label="Assignment">{titles.get(work)}</td>
                  <td data-label="Status"><StatusChip status={status} /></td>
                  <td data-label="Updated"><ReviewTiming item={item} />{relativeTime(item.reviewedAt || item.updatedAt, now) || <span className="cw-muted">—</span>}</td>
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
