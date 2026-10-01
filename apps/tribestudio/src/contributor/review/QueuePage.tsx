import { useEffect, useMemo, useState } from 'react';
import { TableShell } from '@indigen-world/console-ui';
import {
  Badge,
  EmptyState,
  FilterBar,
  Icon,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  SearchField,
  SelectField,
  Skeleton,
  TypeTag,
  paginate,
  useNow,
} from '../components';
import { RouteLink } from '../shell';
import {
  DESKS,
  DESK_ORDER,
  ITEM_TYPES,
  ageLabel,
  dialectsIn,
  filterQueue,
  isDesk,
  itemCreatedAt,
  itemDialect,
  itemSubtitle,
  itemTitle,
  itemType,
  isResubmission,
  statusLabel,
  typesIn,
  viewFor,
  type AgeFilter,
  type Desk,
  type QueueSort,
  type ReviewRecord,
} from './model';
import { QUEUE_LIMIT } from './services';
import { useReview } from './ReviewDesk';

const PAGE_SIZE = 20;

/**
 * The review queue. Filters, sort and page live in the address, so a
 * reviewer can bookmark "escalated expressions in Paga, oldest first" and
 * come back to exactly that. Waiting work sorts oldest first by default:
 * whoever has waited longest is seen first.
 */
export function QueuePage({ query }: { query: URLSearchParams }) {
  const review = useReview();
  const now = useNow();
  const initialDesk = query.get('desk') ?? '';
  const [desk, setDesk] = useState<Desk>(isDesk(initialDesk) ? initialDesk : 'contributions');
  const [viewId, setViewId] = useState(query.get('view') ?? 'waiting');
  const [type, setType] = useState(query.get('type') ?? 'all');
  const [dialect, setDialect] = useState(query.get('dialect') ?? 'all');
  const [age, setAge] = useState<AgeFilter>((['any', '1', '3', '7'].includes(query.get('age') ?? '') ? query.get('age') : 'any') as AgeFilter);
  const [search, setSearch] = useState(query.get('q') ?? '');
  const [sort, setSort] = useState<QueueSort>(query.get('sort') === 'newest' ? 'newest' : 'oldest');
  const [page, setPage] = useState(Math.max(1, Number(query.get('page')) || 1));
  const [rows, setRows] = useState<ReviewRecord[]>([]);
  const [limited, setLimited] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const view = viewFor(desk, viewId);

  useEffect(() => {
    setState('loading');
    setRows([]);
    return review.services.watchQueue(desk, view.statuses, (next, isLimited) => {
      setRows(next);
      setLimited(isLimited);
      setState('ready');
      setError('');
    }, (reason) => {
      setError(reason.message);
      setState('error');
    });
  }, [attempt, desk, review.services, view.id]);

  // Keep the address in step with the filters, without a navigation.
  const href = review.paths.queue({
    desk, view: view.id, type: type !== 'all' ? type : '', dialect: dialect !== 'all' ? dialect : '',
    age: age !== 'any' ? age : '', q: search.trim(), sort: sort !== 'oldest' ? sort : '', page: page > 1 ? String(page) : '',
  });
  const setLastQueue = review.setLastQueue;
  useEffect(() => {
    setLastQueue(href);
    try { window.history.replaceState(window.history.state, '', href); } catch { /* The address is a convenience. */ }
  }, [href, setLastQueue]);

  const filtered = useMemo(() => filterQueue(desk, rows, { type, dialect, age, query: search, sort }, now), [age, desk, dialect, now, rows, search, sort, type]);
  const pageView = paginate(filtered, page, PAGE_SIZE);
  const setQueueOrder = review.setQueueOrder;
  useEffect(() => { setQueueOrder(filtered.map((row) => ({ desk, id: row.id }))); }, [desk, filtered, setQueueOrder]);
  const types = useMemo(() => typesIn(desk, rows), [desk, rows]);
  const dialects = useMemo(() => dialectsIn(rows), [rows]);
  const filtering = type !== 'all' || dialect !== 'all' || age !== 'any' || search.trim() !== '';
  const clear = () => { setType('all'); setDialect('all'); setAge('any'); setSearch(''); setPage(1); };
  const changeDesk = (next: Desk) => { setDesk(next); setViewId('waiting'); clear(); };

  return (
    <div className="cw-page rv-queue">
      <PageHeader
        title="Review queue"
        description="Open an item to read the material, listen to any recording and record a decision. Whoever has waited longest is shown first."
        actions={<RouteLink to={review.paths.guide()} className="cw-btn"><Icon name="guide" />Review guidelines</RouteLink>}
      />

      <nav className="cw-tabs" aria-label="Queues">
        {DESK_ORDER.map((entry) => (
          <button key={entry} type="button" className="cw-tab" aria-pressed={desk === entry} onClick={() => changeDesk(entry)}>
            <Icon name={DESKS[entry].icon} className="cw-icon--sm" />{DESKS[entry].label}
          </button>
        ))}
      </nav>

      <Panel flush>
        <FilterBar
          id="queue-filters"
          className="rv-filterbar"
          active={[view.id !== 'waiting', type !== 'all', dialect !== 'all', age !== 'any', sort !== 'oldest'].filter(Boolean).length}
          search={<SearchField id="queue-search" label="Search" value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Kasem, English or notes" />}
        >
          <SelectField id="queue-view" label="Status" value={view.id} onChange={(value) => { setViewId(value); setPage(1); }} options={DESKS[desk].views.map((entry) => ({ value: entry.id, label: entry.label }))} />
          {desk === 'contributions' ? (
            <SelectField id="queue-type" label="Type" value={type} onChange={(value) => { setType(value); setPage(1); }} options={[{ value: 'all', label: 'All types' }, ...types.map((entry) => ({ value: entry, label: ITEM_TYPES[entry].label }))]} />
          ) : null}
          <SelectField id="queue-dialect" label="Dialect" value={dialect} onChange={(value) => { setDialect(value); setPage(1); }} options={[{ value: 'all', label: 'All dialects' }, ...dialects.map((entry) => ({ value: entry, label: entry }))]} disabled={!dialects.length} />
          <SelectField<AgeFilter> id="queue-age" label="Waiting" value={age} onChange={(value) => { setAge(value); setPage(1); }} options={[
            { value: 'any', label: 'Any time' }, { value: '1', label: 'Over a day' }, { value: '3', label: 'Over 3 days' }, { value: '7', label: 'Over a week' },
          ]} />
          <SelectField<QueueSort> id="queue-sort" label="Sort" value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={[{ value: 'oldest', label: 'Oldest first' }, { value: 'newest', label: 'Newest first' }]} />
        </FilterBar>
        <div className="cw-resultbar">
          <span aria-live="polite">{state === 'ready' ? (filtered.length === rows.length ? `${rows.length} ${rows.length === 1 ? 'item' : 'items'} · ${view.label}` : `${filtered.length} of ${rows.length} match these filters`) : ' '}</span>
          {filtering ? <button type="button" className="cw-link-button" onClick={clear}>Clear filters</button> : null}
        </div>

        {state === 'error' ? (
          <div className="cw-panel__pad">
            <Notice tone="danger" title="This queue could not be loaded" action={<button type="button" onClick={() => setAttempt((count) => count + 1)}>Try again</button>}>
              <p>{error || 'Check your connection.'} Nothing has changed in the queue.</p>
            </Notice>
          </div>
        ) : state === 'loading' ? (
          <div className="cw-panel__pad"><Skeleton lines={6} label="Loading the queue" /></div>
        ) : !rows.length ? (
          <EmptyState title={view.actionable ? 'Nothing waiting here' : 'Nothing here yet'} icon="check" variant="bare">
            {`No ${DESKS[desk].label.toLowerCase()} in “${view.label}” right now.`}
          </EmptyState>
        ) : !filtered.length ? (
          <EmptyState title="No items match these filters" icon="search" variant="bare" actions={<button type="button" onClick={clear}>Clear filters</button>}>
            Try a different type, dialect or waiting time.
          </EmptyState>
        ) : (
          <>
            {limited ? <div className="cw-panel__pad"><Notice tone="neutral" title={`Showing the first ${QUEUE_LIMIT}`}>{DESKS[desk].order ? 'These are the oldest items. Newer ones appear as these are decided.' : 'There may be more. Decided items leave the list and others take their place.'}</Notice></div> : null}
            <TableShell label={`${DESKS[desk].label}: ${view.label}`}>
              <table className="cw-table cw-table--stack rv-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Type</th>
                    <th scope="col">Dialect</th>
                    <th scope="col">Waiting</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="cw-sr">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageView.rows.map((row) => {
                    const kind = itemType(desk, row);
                    const created = itemCreatedAt(row);
                    const own = row.authUid === review.uid || row.uid === review.uid;
                    const status = statusLabel(row.status);
                    return (
                      <tr key={row.id}>
                        <th scope="row">
                          <RouteLink to={review.paths.item(desk, row.id)} className="cw-table__primary"><span lang={kind === 'assigned' ? undefined : 'xsm'}>{itemTitle(desk, row)}</span></RouteLink>
                          {itemSubtitle(desk, row) ? <span className="cw-table__sub" lang={kind === 'assigned' ? 'xsm' : undefined}>{itemSubtitle(desk, row)}</span> : null}
                          <span className="rv-flags">
                            {isResubmission(row) ? <Badge tone="violet" plain>Resubmitted</Badge> : null}
                            {own ? <Badge tone="warning" plain>Your submission</Badge> : null}
                            {row.media?.mediaType === 'audio' || desk === 'recordings' ? <Badge tone="neutral" plain>Audio</Badge> : null}
                          </span>
                        </th>
                        <td data-label="Type"><TypeTag icon={ITEM_TYPES[kind].icon}>{ITEM_TYPES[kind].label}</TypeTag></td>
                        <td data-label="Dialect">{itemDialect(row) || <span className="cw-muted">Not given</span>}</td>
                        <td data-label="Waiting" className="cw-nowrap" title={created ? new Date(created).toLocaleString() : undefined}>{ageLabel(created, now)}</td>
                        <td data-label="Status"><Badge tone={status.tone}>{status.label}</Badge></td>
                        <td className="cw-table__actions"><RouteLink to={review.paths.item(desk, row.id)} className={`cw-btn cw-btn--sm${view.actionable && !own ? ' cw-btn--primary' : ''}`}>{view.actionable && !own ? 'Review' : 'Open'}</RouteLink></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
            <Pagination page={pageView.page} pageCount={pageView.pageCount} from={pageView.from} to={pageView.to} total={filtered.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} noun="items" />
          </>
        )}
      </Panel>
    </div>
  );
}
