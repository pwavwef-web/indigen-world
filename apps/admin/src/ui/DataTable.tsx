import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, EmptyState, SearchInput, Spinner, TableShell, cx } from './primitives';

/* ==========================================================================
   DataTable
   --------------------------------------------------------------------------
   One table for the whole console. A screen describes its columns and hands
   over its rows; sorting, searching, paging, selection, the empty state and
   the scroll containment are the table's problem, not the screen's.

   Sorting and paging are client-side on purpose: every admin list here is a
   bounded page of Firestore documents that has already been fetched, and a
   round trip per column click would be slower and no more correct.
   ========================================================================== */

export type ColumnAlign = 'start' | 'center' | 'end';

export interface DataColumn<T> {
  /** Stable key, also used as the sort identifier. */
  id: string;
  header: ReactNode;
  /** Accessible header text when `header` is an icon or control. */
  headerLabel?: string;
  cell: (row: T) => ReactNode;
  /** Return a comparable value to make the column sortable. */
  sort?: (row: T) => string | number | Date | null | undefined;
  /** Extra text folded into the search index for this row. */
  search?: (row: T) => string | null | undefined;
  width?: string;
  align?: ColumnAlign;
  mono?: boolean;
  /** Let the cell wrap onto several lines instead of staying on one. */
  wrap?: boolean;
  className?: string;
}

export interface DataTableSelection<T> {
  selectedIds: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Accessible label for a row's checkbox. */
  rowLabel?: (row: T) => string;
}

export interface DataTableProps<T> {
  /** Names the table for assistive technology. Required — tables are data. */
  caption: string;
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; body?: string; action?: ReactNode };
  /** Client-side search across every column that defines `search`. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Controls rendered on the left of the table's own bar. */
  filters?: ReactNode;
  /** Controls rendered on the right of the bar, before the row count. */
  actions?: ReactNode;
  initialSort?: { columnId: string; direction: 'asc' | 'desc' };
  /** 0 disables paging. */
  pageSize?: number;
  selection?: DataTableSelection<T>;
  rowClassName?: (row: T) => string | undefined;
  /** Rendered under a row when it is expanded by the screen. */
  renderDetail?: (row: T) => ReactNode;
  expandedId?: string | null;
  footNote?: ReactNode;
  className?: string;
}

type Density = 'comfortable' | 'compact';
const DENSITY_KEY = 'indigen-admin-table-density';

/** Row height is a per-operator preference, so it is remembered per browser
 * and shared by every table in the console rather than set per screen. */
function useDensity(): [Density, (next: Density) => void] {
  const [density, setDensity] = useState<Density>(() =>
    (window.localStorage.getItem(DENSITY_KEY) as Density) === 'compact' ? 'compact' : 'comfortable',
  );
  const update = (next: Density) => {
    setDensity(next);
    try {
      window.localStorage.setItem(DENSITY_KEY, next);
    } catch {
      // A blocked storage quota must not stop the table rendering.
    }
  };
  return [density, update];
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const ordered = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  ordered.forEach((page, index) => {
    if (index > 0 && page - (ordered[index - 1] ?? 0) > 1) out.push('gap');
    out.push(page);
  });
  return out;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  empty,
  searchable = false,
  searchPlaceholder,
  filters,
  actions,
  initialSort,
  pageSize = 25,
  selection,
  rowClassName,
  renderDetail,
  expandedId = null,
  footNote,
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(
    initialSort ?? null,
  );
  const [page, setPage] = useState(1);
  const [density, setDensity] = useDensity();

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    const terms = needle.split(/\s+/);
    return rows.filter((row) => {
      const haystack = columns
        .map((column) => (column.search ? column.search(row) : null))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [columns, query, rows]);

  const sorted = useMemo(() => {
    if (!sort) return searched;
    const column = columns.find((entry) => entry.id === sort.columnId);
    if (!column?.sort) return searched;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...searched].sort((a, b) => compare(column.sort?.(a), column.sort?.(b)) * direction);
  }, [columns, searched, sort]);

  const paged = pageSize > 0 ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;

  // A filter that shortens the list must never strand the reader on page 9.
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(sorted.length / (pageSize || 1)))));
  }, [pageSize, sorted.length]);

  const toggleSort = (columnId: string) => {
    setSort((current) => {
      if (current?.columnId !== columnId) return { columnId, direction: 'asc' };
      if (current.direction === 'asc') return { columnId, direction: 'desc' };
      return null;
    });
    setPage(1);
  };

  const pageIds = paged.map(rowKey);
  const allOnPageSelected =
    selection !== undefined && pageIds.length > 0 && pageIds.every((id) => selection.selectedIds.has(id));

  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    selection.onChange(next);
  };

  const toggleOne = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };

  const columnCount = columns.length + (selection ? 1 : 0);
  const showingFrom = sorted.length === 0 ? 0 : (page - 1) * (pageSize || sorted.length) + 1;
  const showingTo = pageSize > 0 ? Math.min(page * pageSize, sorted.length) : sorted.length;

  const cellClass = (column: DataColumn<T>) =>
    cx(
      column.align === 'end' && 'dt-col--end',
      column.align === 'center' && 'dt-col--center',
      column.mono && 'dt-col--mono',
      column.wrap ? 'dt-col--wrap' : 'dt-col--tight',
      column.className,
    );

  return (
    <div className={cx('dt', density === 'compact' && 'dt--compact', className)}>
      {searchable || filters || actions ? (
        <div className="dt__bar">
          <div className="dt__bar-group">
            {searchable ? (
              <SearchInput
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
                label={`Search ${caption.toLowerCase()}`}
                placeholder={searchPlaceholder ?? 'Search…'}
              />
            ) : null}
            {filters}
          </div>
          <div className="dt__bar-group">
            {actions}
            <button
              type="button"
              className="dt__density"
              aria-pressed={density === 'compact'}
              title={density === 'compact' ? 'Switch to comfortable rows' : 'Switch to compact rows'}
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
            >
              <span className="sr-only">Row density</span>
              <span aria-hidden="true" className="dt__density-mark" />
            </button>
            <span className="iwx-toolbar__count">
              {loading ? <Spinner /> : null}
              <strong>{sorted.length}</strong>
              {sorted.length === rows.length ? ' rows' : ` of ${rows.length}`}
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <Alert
          title="This list could not be loaded."
          action={onRetry ? <button type="button" className="button button--small" onClick={onRetry}>Try again</button> : undefined}
        >
          {error}
        </Alert>
      ) : null}

      <TableShell label={caption}>
        <table className="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selection ? (
                <th className="dt-col--check" scope="col">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label={allOnPageSelected ? 'Clear selection on this page' : 'Select every row on this page'}
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const isSorted = sort?.columnId === column.id;
                const ariaSort = isSorted ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : 'none';
                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={column.width ? { width: column.width, minWidth: column.width } : undefined}
                    className={cellClass(column)}
                    aria-sort={column.sort ? ariaSort : undefined}
                  >
                    {column.sort ? (
                      <button type="button" className="dt__sort" aria-sort={ariaSort} onClick={() => toggleSort(column.id)}>
                        {column.header}
                        <span className="dt__caret" aria-hidden="true" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0
              ? Array.from({ length: 4 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} aria-hidden="true">
                    {Array.from({ length: columnCount }).map((__, cell) => (
                      <td key={`skeleton-cell-${cell}`}>
                        <span className="dt__skeleton" style={{ width: `${55 + ((cell * 13) % 40)}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : null}

            {!loading && paged.length === 0 ? (
              <tr>
                <td colSpan={columnCount} style={{ padding: 0 }}>
                  <EmptyState
                    title={query ? 'Nothing matches that search' : empty?.title ?? 'Nothing here yet'}
                    body={
                      query
                        ? `No row in ${caption.toLowerCase()} contains “${query.trim()}”.`
                        : empty?.body
                    }
                    action={
                      query ? (
                        <button type="button" className="button button--small" onClick={() => setQuery('')}>
                          Clear search
                        </button>
                      ) : (
                        empty?.action
                      )
                    }
                  />
                </td>
              </tr>
            ) : null}

            {paged.map((row) => {
              const id = rowKey(row);
              const isSelected = selection?.selectedIds.has(id) ?? false;
              const isExpanded = expandedId === id;
              return (
                <Fragment key={id}>
                  <tr className={cx(isSelected && 'is-selected', isExpanded && 'is-expanded', rowClassName?.(row))}>
                    {selection ? (
                      <td className="dt-col--check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(id)}
                          aria-label={selection.rowLabel ? `Select ${selection.rowLabel(row)}` : 'Select row'}
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td key={column.id} className={cellClass(column)}>
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && renderDetail ? (
                    <tr className="is-expanded">
                      <td colSpan={columnCount}>{renderDetail(row)}</td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableShell>

      {(pageSize > 0 && sorted.length > pageSize) || footNote ? (
        <div className="dt__foot">
          <span>
            {footNote ?? `Rows ${showingFrom}–${showingTo} of ${sorted.length}`}
          </span>
          {pageSize > 0 && sorted.length > pageSize ? (
          <div className="dt__pager">
            <button
              type="button"
              className="dt__page"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              ‹
            </button>
            {pageWindow(page, pageCount).map((entry, index) =>
              entry === 'gap' ? (
                <span className="dt__gap" key={`gap-${index}`} aria-hidden="true">…</span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  className="dt__page"
                  aria-current={entry === page ? 'page' : undefined}
                  aria-label={`Page ${entry}`}
                  onClick={() => setPage(entry)}
                >
                  {entry}
                </button>
              ),
            )}
            <button
              type="button"
              className="dt__page"
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              disabled={page === pageCount}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
