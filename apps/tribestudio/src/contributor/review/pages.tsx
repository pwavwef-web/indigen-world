import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableShell } from '@indigen-world/console-ui';
import {
  Avatar,
  Badge,
  EmptyState,
  Facts,
  Icon,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  SearchField,
  SelectField,
  Skeleton,
  cx,
  paginate,
  useNow,
} from '../components';
import { formatDateTime, pluralise, relativeTime } from '../model';
import { RouteLink } from '../shell';
import { REVIEW_GUIDE } from './guide';
import { DESKS, OVERVIEW_QUEUES, ageLabel, statusLabel, viewFor, type Desk } from './model';
import type { DecisionRecord } from './services';
import { useReview } from './ReviewDesk';

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

type CountState = { state: 'loading' } | { state: 'ready'; count: number } | { state: 'error' };

/**
 * What is waiting, counted on the server for each queue, and the reviewer's
 * own recent decisions. No totals are estimated: a queue that cannot be
 * counted says so, and an empty queue reads as empty.
 */
export function ReviewOverviewPage() {
  const review = useReview();
  const now = useNow();
  const [counts, setCounts] = useState<Record<string, CountState>>({});
  const [oldest, setOldest] = useState<number | null | undefined>(undefined);
  const [decisions, setDecisions] = useState<DecisionRecord[] | null | 'error'>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setCounts(Object.fromEntries(OVERVIEW_QUEUES.map((entry) => [`${entry.desk}:${entry.view}`, { state: 'loading' } as CountState])));
    for (const entry of OVERVIEW_QUEUES) {
      const key = `${entry.desk}:${entry.view}`;
      review.services.countQueue(entry.desk, viewFor(entry.desk, entry.view).statuses)
        .then((count) => { if (active) setCounts((current) => ({ ...current, [key]: { state: 'ready', count } })); })
        .catch(() => { if (active) setCounts((current) => ({ ...current, [key]: { state: 'error' } })); });
    }
    review.services.oldestWaiting('contributions', viewFor('contributions', 'waiting').statuses)
      .then((value) => { if (active) setOldest(value); })
      .catch(() => { if (active) setOldest(null); });
    return () => { active = false; };
  }, [attempt, review.services]);

  useEffect(() => {
    let active = true;
    setDecisions(null);
    review.services.myDecisions(review.uid)
      .then((rows) => { if (active) setDecisions(rows); })
      .catch(() => { if (active) setDecisions('error'); });
    return () => { active = false; };
  }, [attempt, review.services, review.uid]);

  const ready = OVERVIEW_QUEUES.map((entry) => ({ ...entry, result: counts[`${entry.desk}:${entry.view}`] ?? { state: 'loading' } as CountState }));
  const failed = ready.filter((entry) => entry.result.state === 'error').length;
  const actionable = ready.filter((entry) => entry.result.state === 'ready' && entry.result.count > 0 && entry.primary);
  const waitingTotal = actionable.reduce((sum, entry) => sum + (entry.result.state === 'ready' ? entry.result.count : 0), 0);
  const loading = ready.some((entry) => entry.result.state === 'loading');
  const start = actionable[0];
  const startHref = start ? review.paths.queue({ desk: start.desk, view: start.view }) : review.paths.queue();

  return (
    <div className="cw-page">
      <PageHeader
        title="Overview"
        description={review.name ? `Signed in as ${review.name}. What is waiting for a decision, across every queue.` : 'What is waiting for a decision, across every queue.'}
        actions={<RouteLink to={startHref} className="cw-btn cw-btn--primary"><Icon name="queue" />{start ? 'Start reviewing' : 'Open the review queue'}</RouteLink>}
      />

      {failed ? (
        <Notice tone="warning" title={failed === ready.length ? 'The queues could not be counted' : `${pluralise(failed, 'queue')} could not be counted`} action={<button type="button" onClick={() => setAttempt((count) => count + 1)}>Try again</button>}>
          <p>Check your connection. You can still open the review queue.</p>
        </Notice>
      ) : null}

      <div className="cw-overview__grid">
        <div className="cw-overview__main">
          <Panel
            title="Waiting for a decision"
            description={loading ? 'Counting…' : waitingTotal ? `${pluralise(waitingTotal, 'item')} waiting across the queues` : 'Nothing is waiting in the review queues'}
            flush
            className={cx(waitingTotal > 0 && 'cw-attention')}
          >
            <ul className="cw-list-rows rv-waiting">
              {ready.map((entry) => {
                const desk = DESKS[entry.desk];
                const view = viewFor(entry.desk, entry.view);
                const count = entry.result.state === 'ready' ? entry.result.count : null;
                const waitingLong = entry.desk === 'contributions' && entry.view === 'waiting' && typeof oldest === 'number' && count;
                return (
                  <li key={`${entry.desk}:${entry.view}`} className="cw-row-item">
                    <span className={cx('cw-row-item__icon', count ? `cw-row-item__icon--${entry.tone}` : '')} aria-hidden="true"><Icon name={desk.icon} /></span>
                    <div className="cw-row-item__copy">
                      <strong>{entry.label}</strong>
                      <span>{waitingLong ? `Oldest has waited ${ageLabel(oldest as number, now)}` : entry.hint}</span>
                    </div>
                    <span className="rv-waiting__count">
                      {entry.result.state === 'loading' ? <span className="cw-skeleton-inline" aria-label="Counting" /> : entry.result.state === 'error' ? <span className="cw-muted cw-small">Unavailable</span> : (
                        <RouteLink to={review.paths.queue({ desk: entry.desk, view: view.id })} className={cx('cw-btn cw-btn--sm rv-count', !count && 'is-zero')} aria-label={`${entry.label}: ${count}. Open the queue`}>
                          <span className="cw-tabular">{count?.toLocaleString()}</span><Icon name="chevron" className="cw-icon--sm" />
                        </RouteLink>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel
            title="Your recent decisions"
            flush
            actions={<RouteLink to={review.paths.history()} className="cw-text-link">Review history<Icon name="arrow" /></RouteLink>}
          >
            {decisions === null ? <div className="cw-panel__pad"><Skeleton lines={3} label="Loading your decisions" /></div>
              : decisions === 'error' ? <p className="cw-muted cw-panel__pad">Your decisions could not be loaded just now.</p>
                : !decisions.length ? <p className="cw-muted cw-activity__empty">Decisions you record will appear here.</p> : (
                  <ul className="cw-list-rows">
                    {decisions.slice(0, 5).map((entry) => {
                      const status = statusLabel(entry.status);
                      return (
                        <li key={`${entry.desk}:${entry.id}`} className="cw-row-item">
                          <span className="cw-row-item__icon" aria-hidden="true"><Icon name={DESKS[entry.desk].icon} /></span>
                          <div className="cw-row-item__copy">
                            <strong><RouteLink to={review.paths.item(entry.desk, entry.id)} className="cw-row-link" ><span lang="xsm">{entry.title}</span></RouteLink></strong>
                            <span>{DESKS[entry.desk].label} · {entry.decidedAt ? <time dateTime={new Date(entry.decidedAt).toISOString()} title={formatDateTime(new Date(entry.decidedAt).toISOString())}>{relativeTime(new Date(entry.decidedAt).toISOString(), now)}</time> : 'Date not recorded'}</span>
                          </div>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
          </Panel>
        </div>

        <aside className="cw-overview__side" aria-label="Reviewing well">
          <Panel title="Before you decide">
            <ul className="cw-link-list">
              {REVIEW_GUIDE.slice(0, 5).map((section) => (
                <li key={section.id}><RouteLink to={review.paths.guide(section.id)}>{section.title}<Icon name="chevron" /></RouteLink></li>
              ))}
            </ul>
          </Panel>
          <Panel title="How decisions are protected">
            <ul className="rv-safeguards">
              <li><Icon name="shield" className="cw-icon--sm" />You cannot decide your own work.</li>
              <li><Icon name="lock" className="cw-icon--sm" />If someone decides an item first, your decision is refused instead of overwriting theirs.</li>
              <li><Icon name="check" className="cw-icon--sm" />Every decision is confirmed before it is recorded.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HISTORY_PAGE = 25;

/** Decisions this reviewer recorded, from the review records themselves. */
export function ReviewHistoryPage() {
  const review = useReview();
  const now = useNow();
  const [rows, setRows] = useState<DecisionRecord[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [desk, setDesk] = useState<'all' | Desk>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(false);
    review.services.myDecisions(review.uid)
      .then((next) => { if (active) setRows(next); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt, review.services, review.uid]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (rows ?? []).filter((row) => (desk === 'all' || row.desk === desk) && (!needle || row.title.toLocaleLowerCase().includes(needle)));
  }, [desk, rows, search]);
  const view = paginate(filtered, page, HISTORY_PAGE);
  const desks = useMemo(() => [...new Set((rows ?? []).map((row) => row.desk))], [rows]);
  const clear = useCallback(() => { setSearch(''); setDesk('all'); setPage(1); }, []);

  return (
    <div className="cw-page">
      <PageHeader title="Review history" description="Items where the latest recorded decision is yours, newest first." />
      <Panel flush>
        <div className="cw-filterbar" role="search">
          <SearchField id="history-search" label="Search" value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Kasem or title" />
          <SelectField<'all' | Desk> id="history-desk" label="Queue" value={desk} onChange={(value) => { setDesk(value); setPage(1); }} options={[{ value: 'all', label: 'All queues' }, ...desks.map((value) => ({ value, label: DESKS[value].label }))]} disabled={!rows?.length} />
        </div>
        {error ? (
          <div className="cw-panel__pad">
            <Notice tone="danger" title="Your history could not be loaded" action={<button type="button" onClick={() => setAttempt((count) => count + 1)}>Try again</button>}><p>Check your connection.</p></Notice>
          </div>
        ) : rows === null ? <div className="cw-panel__pad"><Skeleton lines={6} label="Loading your decisions" /></div> : !rows.length ? (
          <EmptyState title="No decisions yet" icon="history" variant="bare" actions={<RouteLink to={review.lastQueue} className="cw-btn cw-btn--primary">Open the review queue</RouteLink>}>
            Decisions you record on contributions, pronunciations and Kasem names will be listed here.
          </EmptyState>
        ) : !filtered.length ? (
          <EmptyState title="No decisions match" icon="search" variant="bare" actions={<button type="button" onClick={clear}>Clear filters</button>} />
        ) : (
          <>
            <TableShell label="Your decisions">
              <table className="cw-table cw-table--stack">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Queue</th>
                    <th scope="col">Status now</th>
                    <th scope="col">Decided</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => {
                    const status = statusLabel(row.status);
                    const at = row.decidedAt ? new Date(row.decidedAt).toISOString() : '';
                    return (
                      <tr key={`${row.desk}:${row.id}`}>
                        <th scope="row"><RouteLink to={review.paths.item(row.desk, row.id)} className="cw-table__primary"><span lang="xsm">{row.title}</span></RouteLink></th>
                        <td data-label="Queue">{DESKS[row.desk].label}</td>
                        <td data-label="Status now"><Badge tone={status.tone}>{status.label}</Badge></td>
                        <td data-label="Decided" className="cw-nowrap">{at ? <time dateTime={at} title={formatDateTime(at)}>{relativeTime(at, now)}</time> : <span className="cw-muted">Not recorded</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
            <Pagination page={view.page} pageCount={view.pageCount} from={view.from} to={view.to} total={filtered.length} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} noun="decisions" />
          </>
        )}
        <p className="cw-small cw-muted cw-panel__pad rv-history-note">
          Lists up to 200 of each kind. An item someone decided after you — for example, published after your approval — is listed under their name. Sentence judgments and advert decisions are not listed here yet.
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guidelines
// ---------------------------------------------------------------------------

export function ReviewGuidePage({ section }: { section: string }) {
  const review = useReview();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const visible = REVIEW_GUIDE.filter((entry) => [entry.title, entry.summary, ...entry.body, ...(entry.points ?? [])].join(' ').toLocaleLowerCase().includes(needle));

  useEffect(() => {
    if (!section) return;
    const target = document.getElementById(`guide-${section}`);
    if (!target) return;
    (target as HTMLDetailsElement).open = true;
    target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  }, [section]);

  return (
    <div className="cw-page">
      <PageHeader title="Review guidelines" description="What each decision does, what to check, and the rules the review service enforces. Each section names where its rules come from." />
      <div className="cw-guide">
        <nav className="cw-guide__toc" aria-label="Guideline sections">
          <label className="cw-search">
            <span className="cw-sr">Search the review guidelines</span>
            <Icon name="search" />
            <input type="search" placeholder="Search the guidelines" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <ol>
            {visible.map((entry) => (
              <li key={entry.id}><RouteLink to={review.paths.guide(entry.id)} className={entry.id === section ? 'is-active' : undefined}>{entry.title}</RouteLink></li>
            ))}
          </ol>
        </nav>
        <div className="cw-guide__body">
          {!visible.length ? (
            <EmptyState title="No matching guidance" icon="search" actions={<button type="button" onClick={() => setQuery('')}>Clear search</button>}>Try another word.</EmptyState>
          ) : visible.map((entry) => (
            <details key={entry.id} id={`guide-${entry.id}`} className="cw-guide-topic" open={Boolean(needle) || entry.id === section || (!section && entry === visible[0])}>
              <summary>
                <span className="cw-guide-topic__copy"><h2 id={`guide-${entry.id}-title`}>{entry.title}</h2><span className="cw-guide__summary">{entry.summary}</span></span>
                <Icon name="chevron-down" className="cw-guide-topic__chevron" />
              </summary>
              <div className="cw-guide__anchor">
                {entry.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {entry.points?.length ? <ul className="cw-guide__points">{entry.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}
                {entry.pending?.map((note) => <Notice key={note} tone="neutral" title="Policy not yet published"><p>{note}</p></Notice>)}
                <p className="cw-guide__source">Source: {entry.source}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

const ROLE_NAMES: Record<string, string> = {
  validator: 'Validator', reviewer: 'Reviewer', admin: 'Administrator', super_admin: 'Super administrator',
};

export function ReviewAccountPage() {
  const review = useReview();
  const [contributor, setContributor] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    review.services.hasContributorAccount(review.uid).then((value) => { if (active) setContributor(value); }).catch(() => { if (active) setContributor(false); });
    return () => { active = false; };
  }, [review.services, review.uid]);

  return (
    <div className="cw-page">
      <PageHeader title="Account" description="Who you are signed in as, and what your review access allows." />
      <div className="cw-stack cw-stack--lg rv-account">
        <Panel title="Signed in as">
          <div className="rv-account__who">
            <Avatar name={review.name || review.email} size="large" />
            <Facts variant="rows" items={[
              { label: 'Name', value: review.name || 'Not set' },
              { label: 'Email', value: review.email || 'Not available' },
              { label: 'Access', value: <Badge tone="info">{ROLE_NAMES[review.role ?? ''] ?? 'Reviewer'}</Badge> },
            ]} />
          </div>
        </Panel>
        <Panel title="What your access allows">
          <ul className="rv-safeguards">
            <li><Icon name="check" className="cw-icon--sm" />Read every review queue: contributions, pronunciations, sentences, Kasem names and adverts.</li>
            <li><Icon name="check" className="cw-icon--sm" />Record decisions. Each one is checked again by the review service and recorded with your account.</li>
            <li><Icon name="lock" className="cw-icon--sm" />Deciding your own work is refused.</li>
            <li><Icon name="lock" className="cw-icon--sm" />Payment details and finance decisions are not part of review access.</li>
          </ul>
          <p className="cw-small cw-muted">Review access is granted by an administrator. To change it, contact the Indigen World team.</p>
        </Panel>
        <Panel title="Contributor workspace">
          {contributor === null ? <Skeleton lines={1} label="Checking for a contributor account" /> : contributor ? (
            <div className="cw-stack cw-stack--sm">
              <p>You also have a contributor account. Your own submissions, tasks and rewards are there.</p>
              <p><RouteLink to={review.contributorHref} className="cw-btn"><Icon name="swap" />Switch to contributing</RouteLink></p>
            </div>
          ) : <p className="cw-muted">This account has no contributor workspace. Contributor accounts are created by invitation.</p>}
        </Panel>
        <Panel title="Sign out">
          <div className="cw-stack cw-stack--sm">
            <p className="cw-small">Signing out ends this session on this device. Decisions you recorded are kept.</p>
            <p><button type="button" onClick={() => void review.services.signOut()}><Icon name="logout" />Sign out</button></p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
