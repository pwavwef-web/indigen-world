import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { queuesChanged } from '../attention';
import { fetchContributorDirectory, fetchContributorPayments, type ContributorDirectoryRow, type ContributorPayments } from '../contributors/data';
import { ContributorPaymentsDesk } from '../contributors/ContributorPaymentsDesk';
import { Link, useLeaveGuard, useRouter } from '../router';
import { hasFinanceAccess } from '../routes';
import { useSession } from '../session';
import { confirmAction } from '../ui/dialogs';
import { Icon, type IconName } from '../ui/icons';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  LoadFailure,
  Notice,
  PageHeader,
  PermissionState,
  SearchField,
  Segmented,
  Select,
  Skeleton,
  Toast,
  cx,
} from '../ui/primitives';
import {
  KIND_LABEL,
  NETWORKS,
  STATUS_META,
  dateOnly,
  dateTime,
  decideRedemption,
  errorMessage,
  formatGhs,
  formatPhone,
  formatPoints,
  isStaleDecision,
  loadRedemptionLedger,
  maskPhone,
  saveRewardSettings,
  valueOfPoints,
  type Redemption,
  type RedemptionAction,
  type RedemptionLedger,
  type RedemptionStatus,
  type RewardSettings,
} from './data';

/* ==========================================================================
   Finance owns staff management of point redemptions. Contributors ask for
   airtime or data in TribeStudio; the decisions here change the same
   records, and TribeStudio shows the outcome on the contributor's own page.

   Nothing on these screens moves money. Approving a request only marks it
   ready; someone sends the airtime or data outside this system and records
   the delivery reference here.
   ========================================================================== */

type LoadState<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'denied'; message: string } | { state: 'error'; message: string };

function codeOf(error: unknown): string {
  return (error as { code?: string } | null)?.code ?? '';
}

function asFailure<T>(error: unknown, fallback: string): LoadState<T> {
  return /permission-denied|unauthenticated/.test(codeOf(error))
    ? { state: 'denied', message: errorMessage(error, fallback) }
    : { state: 'error', message: errorMessage(error, fallback) };
}

/** The ledger plus the contributor directory, so requests carry a person's name. */
function useLedger() {
  const [ledger, setLedger] = useState<LoadState<RedemptionLedger>>({ state: 'loading' });
  const [people, setPeople] = useState<ContributorDirectoryRow[] | null>(null);
  const [peopleError, setPeopleError] = useState(false);
  const load = useCallback(async () => {
    try {
      setLedger({ state: 'ready', data: await loadRedemptionLedger() });
    } catch (error) {
      setLedger(asFailure(error, 'Redemptions could not be loaded.'));
    }
  }, []);
  useEffect(() => {
    void load();
    fetchContributorDirectory().then((rows) => { setPeople(rows); setPeopleError(false); }, () => setPeopleError(true));
  }, [load]);
  const personFor = useCallback((uid: string) => people?.find((row) => row.authUid === uid || row.id === uid) ?? null, [people]);
  return { ledger, load, personFor, peopleError };
}

function StatusBadge({ status }: { status: RedemptionStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

function Tile({ icon, tone, label, value, hint, to }: { icon: IconName; tone?: 'success' | 'warning' | 'danger'; label: string; value: string; hint: string; to?: string }) {
  const body = (
    <>
      <span className={cx('ad-tile__icon', tone && `ad-tile__icon--${tone}`)} aria-hidden="true"><Icon name={icon} /></span>
      <span className="ad-tile__copy">
        <span className="ad-tile__label">{label}</span>
        <span className="ad-tile__value">{value}</span>
        <span className="ad-tile__hint">{hint}</span>
      </span>
      {to ? <Icon name="arrow" className="ad-tile__go" /> : <span />}
    </>
  );
  return to ? <Link to={to} className="ad-tile">{body}</Link> : <div className="ad-tile">{body}</div>;
}

function LedgerGate({ ledger, onRetry }: { ledger: LoadState<RedemptionLedger>; onRetry: () => void }) {
  if (ledger.state === 'loading') return <div className="ad-card-box ad-card-box__body" style={{ paddingTop: 'var(--space-5)' }}><Skeleton title lines={5} label="Loading redemptions" /></div>;
  if (ledger.state === 'denied') return <PermissionState body="Point redemptions need an admin role. The server refused this account." />;
  if (ledger.state === 'error') return <LoadFailure title="Redemptions could not be loaded" body={ledger.message} onRetry={onRetry} compact={false} />;
  return null;
}

/* -- Overview ------------------------------------------------------------------------ */

export function FinanceOverview() {
  const { ledger, load, personFor } = useLedger();
  const { access } = useSession();
  const data = ledger.state === 'ready' ? ledger.data : null;
  const summary = data?.summary ?? null;
  const recent = data?.requests.slice(0, 5) ?? [];
  // Without the server's aggregates only the loaded page is known; say so.
  const fromPage = (status: RedemptionStatus) => {
    const rows = data?.requests.filter((row) => row.status === status) ?? [];
    return { count: rows.length, points: rows.reduce((sum, row) => sum + row.points, 0), amountMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0) };
  };
  const totals = (status: RedemptionStatus) => summary?.[status] ?? fromPage(status);
  const partial = !summary && Boolean(data?.truncated);
  const reservedPoints = totals('submitted').points + totals('approved').points;

  return (
    <div className="ad-page">
      <PageHeader
        title="Finance"
        description="Point redemptions, reward settings and payout records."
        actions={<>
          <Button icon="refresh" onClick={() => void load()} disabled={ledger.state === 'loading'}>Refresh</Button>
          <ButtonLink to="/finance/redemptions" variant="primary" icon="gift">Open redemptions</ButtonLink>
        </>}
      />
      <LedgerGate ledger={ledger} onRetry={() => void load()} />
      {data ? (
        <>
          {partial ? <Notice tone="warning" title="Totals cover the newest 500 requests only">The server could not count the full ledger just now. Figures below are from the loaded requests.</Notice> : null}
          <div className="ad-tiles ts-stagger">
            <Tile icon="clock" tone="warning" label="Pending requests" value={String(totals('submitted').count)} hint={`${formatPoints(totals('submitted').points)} reserved`} to="/finance/redemptions?status=submitted" />
            <Tile icon="send" label="Awaiting delivery" value={String(totals('approved').count)} hint={`${formatGhs(totals('approved').amountMinor)} to send`} to="/finance/redemptions?status=approved" />
            <Tile icon="check-circle" tone="success" label="Delivered rewards" value={formatGhs(totals('fulfilled').amountMinor)} hint={`${totals('fulfilled').count} ${totals('fulfilled').count === 1 ? 'delivery' : 'deliveries'} recorded`} to="/finance/redemptions?status=fulfilled" />
          </div>

          <section className="ad-card-box" aria-labelledby="by-status">
            <div className="ad-card-box__head">
              <div>
                <h2 id="by-status">Values by status</h2>
                <p className="ts-muted">{summary ? 'Every airtime and data request, counted on the server.' : partial ? 'From the loaded requests.' : 'Every request.'}</p>
              </div>
            </div>
            <div className="ad-table-scroll">
              <table className="ad-table ad-table--static">
                <thead><tr><th scope="col">Status</th><th scope="col">Requests</th><th scope="col">Points</th><th scope="col">Reward value</th><th scope="col">What it means</th></tr></thead>
                <tbody>
                  {(Object.keys(STATUS_META) as RedemptionStatus[]).map((status) => (
                    <tr key={status}>
                      <td><StatusBadge status={status} /></td>
                      <td className="ad-table__num">{totals(status).count}</td>
                      <td className="ad-table__num">{totals(status).points.toLocaleString('en-GB')}</td>
                      <td className="ad-table__num">{formatGhs(totals(status).amountMinor)}</td>
                      <td className="ts-muted">{STATUS_META[status].description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ad-card-box__body ad-summary-line">
              <Icon name="info" /> <span><strong>{formatPoints(reservedPoints)}</strong> are reserved in pending and approved requests. Points are not cash; a rejected request returns its points.</span>
            </div>
          </section>

          <section className="ad-card-box" aria-labelledby="recent">
            <div className="ad-card-box__head">
              <h2 id="recent">Recent requests</h2>
              <ButtonLink to="/finance/redemptions" size="sm" iconRight="arrow" variant="ghost">All requests</ButtonLink>
            </div>
            {recent.length ? (
              <div className="ad-table-scroll">
                <table className="ad-table">
                  <thead><tr><th scope="col">Contributor</th><th scope="col">Reward</th><th scope="col">Value</th><th scope="col">Requested</th><th scope="col">Status</th></tr></thead>
                  <tbody>
                    {recent.map((row) => {
                      const person = personFor(row.contributorId);
                      return (
                        <tr key={row.id}>
                          <td><Link to={`/finance/redemptions?request=${row.id}`} className="ad-person"><Avatar name={person?.displayName ?? 'Contributor'} src={person?.photoUrl} size="sm" /><span><strong>{person?.displayName ?? 'Contributor'}</strong><small>{formatPoints(row.points)}</small></span></Link></td>
                          <td>{KIND_LABEL[row.kind]} · {row.network}</td>
                          <td className="ad-table__num">{formatGhs(row.amountMinor)}</td>
                          <td className="ad-table__num">{dateOnly(row.createdAt)}</td>
                          <td><StatusBadge status={row.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState compact icon="gift" title="No redemption requests yet" body="Contributors request airtime or data from their rewards page in TribeStudio." />}
          </section>

          <div className="ad-tiles">
            <Tile icon="settings" label="Point settings" value={data.rewards ? `${data.rewards.redemptionMinimum} pts` : '—'} hint={data.rewards ? `= ${formatGhs(data.rewards.cedisPerRedemption * 100)} · ${data.rewards.pointsPerExpression} per approved expression` : 'Settings unavailable'} to="/finance/settings" />
            {hasFinanceAccess(access) ? <Tile icon="bank" label="Payout records" value="Bank & MoMo" hint="Payout verification and payment requests" to="/finance/payouts" /> : null}
          </div>

          <p className="ad-footnote"><Icon name="info" /><span>Finance shows only what the system records: point redemptions and contributor payout records. Membership income, bank balances and payment-provider settlements are not connected to this console.</span></p>
        </>
      ) : null}
    </div>
  );
}

/* -- Point redemptions ------------------------------------------------------------------ */

type StatusFilter = 'all' | RedemptionStatus;
type DateFilter = 'all' | 'today' | '7' | '30' | 'month';

function withinDate(createdAt: string, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const time = Date.parse(createdAt);
  if (Number.isNaN(time)) return false;
  const now = new Date();
  if (filter === 'today') return new Date(time).toDateString() === now.toDateString();
  if (filter === 'month') return new Date(time).getMonth() === now.getMonth() && new Date(time).getFullYear() === now.getFullYear();
  return time >= now.getTime() - Number(filter) * 86_400_000;
}

const STATUS_PARAM = new Set<StatusFilter>(['all', 'submitted', 'approved', 'fulfilled', 'rejected']);

export function RedemptionsDesk() {
  const { ledger, load, personFor, peopleError } = useLedger();
  const { params, setParams } = useRouter();
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null);
  const status = (STATUS_PARAM.has(params.get('status') as StatusFilter) ? params.get('status') : 'all') as StatusFilter;
  const kind = params.get('kind') ?? 'all';
  const network = params.get('network') ?? 'all';
  const when = (params.get('date') ?? 'all') as DateFilter;
  const contributor = params.get('contributor') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const selectedId = params.get('request');

  const rows = ledger.state === 'ready' ? ledger.data.requests : [];
  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (kind !== 'all' && row.kind !== kind) return false;
    if (network !== 'all' && row.network !== network) return false;
    if (contributor && row.contributorId !== contributor) return false;
    if (!withinDate(row.createdAt, when)) return false;
    if (!needle) return true;
    const person = personFor(row.contributorId);
    return [row.id, row.paymentReference, row.contributorId, row.phoneNumber, row.phoneNumber.replace('+233', '0'), person?.displayName, person?.email, person?.phone]
      .some((value) => value?.toLowerCase().includes(needle));
  }), [contributor, kind, needle, network, personFor, rows, status, when]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const counts = (value: RedemptionStatus) => rows.filter((row) => row.status === value).length;
  const filtersOn = status !== 'all' || kind !== 'all' || network !== 'all' || when !== 'all' || Boolean(contributor) || Boolean(needle);
  const contributorPerson = contributor ? personFor(contributor) : null;

  const select = (row: Redemption | null) => setParams({ request: row?.id ?? null });
  const afterDecision = async (message: string, tone: 'success' | 'info' = 'success') => {
    setToast({ message, tone });
    await load();
    queuesChanged();
  };

  return (
    <div className="ad-page">
      <PageHeader
        title="Point redemptions"
        description="Approve, deliver or reject airtime and data requests."
        actions={<Button icon="refresh" onClick={() => void load()} disabled={ledger.state === 'loading'}>Refresh</Button>}
      />
      <LedgerGate ledger={ledger} onRetry={() => void load()} />
      {ledger.state === 'ready' ? (
        <>
          {ledger.data.truncated ? <Notice tone="info">Showing the newest {rows.length} requests. Totals on the Finance overview count every request.</Notice> : null}
          {peopleError ? <Notice tone="warning">Contributor names could not be loaded, so requests show account IDs.</Notice> : null}
          <div className={cx('ad-desk', !selected && 'ad-desk--single')}>
            <section className="ad-card-box" aria-labelledby="requests-title">
              <div className="ad-card-box__head">
                <h2 id="requests-title">Requests</h2>
                <Segmented<StatusFilter> label="Request status" value={status} onChange={(value) => setParams({ status: value === 'all' ? null : value })} options={[
                  { value: 'all', label: 'All', count: rows.length },
                  { value: 'submitted', label: 'Pending', count: counts('submitted') },
                  { value: 'approved', label: 'Awaiting delivery', count: counts('approved') },
                  { value: 'fulfilled', label: 'Delivered', count: counts('fulfilled') },
                  { value: 'rejected', label: 'Rejected', count: counts('rejected') },
                ]} />
              </div>
              <div className="ad-card-box__body ad-toolbar">
                <SearchField label="Search requests" placeholder="Name, phone, request ID or delivery reference" value={search} onChange={(value) => { setSearch(value); setParams({ q: value || null }); }} />
                <Select label="Reward type" value={kind} onChange={(value) => setParams({ kind: value === 'all' ? null : value })} options={[{ value: 'all', label: 'Airtime and data' }, { value: 'airtime', label: 'Airtime' }, { value: 'data', label: 'Mobile data' }]} />
                <Select label="Network" value={network} onChange={(value) => setParams({ network: value === 'all' ? null : value })} options={[{ value: 'all', label: 'All networks' }, ...NETWORKS.map((item) => ({ value: item, label: item }))]} />
                <Select label="Requested" value={when} onChange={(value) => setParams({ date: value === 'all' ? null : value })} options={[{ value: 'all', label: 'Any date' }, { value: 'today', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: 'month', label: 'This month' }]} />
              </div>
              {contributor ? (
                <div className="ad-card-box__body">
                  <Badge tone="accent">Showing {contributorPerson?.displayName ?? 'one contributor'}’s requests</Badge>{' '}
                  <button type="button" className="ts-link" onClick={() => setParams({ contributor: null })}>Show everyone</button>
                </div>
              ) : null}
              {filtered.length ? (
                <div className="ad-table-scroll">
                  <table className="ad-table" aria-labelledby="requests-title">
                    <thead>
                      <tr>
                        <th scope="col">Contributor</th>
                        <th scope="col">Points</th>
                        <th scope="col">Reward</th>
                        <th scope="col">Value</th>
                        <th scope="col">Network</th>
                        <th scope="col">Requested</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => {
                        const person = personFor(row.contributorId);
                        const name = person?.displayName ?? row.contributorId;
                        return (
                          <tr key={row.id} aria-selected={row.id === selectedId} onClick={() => select(row)}>
                            <td>
                              <button type="button" className="ad-row-button ad-person" aria-label={`Open ${name}’s request for ${formatPoints(row.points)}`} onClick={(event) => { event.stopPropagation(); select(row); }}>
                                <Avatar name={name} src={person?.photoUrl} size="sm" />
                                <span><strong>{name}</strong><small>{person?.email || maskPhone(row.phoneNumber)}</small></span>
                              </button>
                            </td>
                            <td className="ad-table__num">{row.points.toLocaleString('en-GB')}</td>
                            <td>{KIND_LABEL[row.kind]}</td>
                            <td className="ad-table__num"><strong>{formatGhs(row.amountMinor)}</strong></td>
                            <td>{row.network}</td>
                            <td className="ad-table__num">{dateOnly(row.createdAt)}</td>
                            <td><StatusBadge status={row.status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : rows.length ? (
                <EmptyState compact icon="search" title="No requests match" body="Try another search or clear the filters."
                  actions={filtersOn ? <Button size="sm" onClick={() => { setSearch(''); setParams({ status: null, kind: null, network: null, date: null, contributor: null, q: null }); }}>Clear filters</Button> : undefined} />
              ) : (
                <EmptyState compact icon="gift" title="No redemption requests yet" body="When a contributor redeems points for airtime or data in TribeStudio, the request appears here." />
              )}
            </section>
            {selected ? (
              <RedemptionDetail
                key={`${selected.id}-${selected.status}`}
                request={selected}
                person={personFor(selected.contributorId)}
                onClose={() => select(null)}
                onDecided={(message) => afterDecision(message)}
                onStale={async () => { await load(); setToast({ message: 'This request changed since you opened it. The latest version is shown.', tone: 'info' }); }}
              />
            ) : selectedId ? (
              <Notice tone="warning" title="That request is not in the loaded list">It may be older than the newest {rows.length} requests or the link may be wrong. <button type="button" className="ts-link" onClick={() => select(null)}>Close</button></Notice>
            ) : null}
          </div>
        </>
      ) : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ad-fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

function RedemptionDetail({ request, person, onClose, onDecided, onStale }: {
  request: Redemption;
  person: ContributorDirectoryRow | null;
  onClose: () => void;
  onDecided: (message: string) => Promise<void>;
  onStale: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dialog, setDialog] = useState<RedemptionAction | null>(null);
  const name = person?.displayName ?? 'Contributor';
  const meta = STATUS_META[request.status];

  return (
    <aside className="ad-detail" aria-labelledby="request-detail-title">
      <div className="ad-detail__head">
        <div>
          <h2 id="request-detail-title">Request details</h2>
          <p className="ts-muted">{formatPoints(request.points)} for {KIND_LABEL[request.kind].toLowerCase()}</p>
        </div>
        <IconButton icon="close" label="Close request details" onClick={onClose} />
      </div>

      <div className="ad-facts">
        <StatusBadge status={request.status} />
        <p className="ts-muted">{meta.description}</p>
      </div>

      <div className="ad-detail__section">
        <h3>Contributor</h3>
        <div className="ad-person">
          <Avatar name={name} src={person?.photoUrl} />
          <span><strong>{name}</strong><small>{person?.email || request.contributorId}</small></span>
        </div>
        <div className="ad-detail__actions">
          <Link to={`/finance/redemptions?contributor=${encodeURIComponent(request.contributorId)}`} className="ts-link">All their requests</Link>
          {person ? <Link to={`/contributors?contributor=${encodeURIComponent(person.id)}`} className="ts-link">Contributor profile</Link> : null}
        </div>
      </div>

      <div className="ad-detail__section">
        <h3>Reward</h3>
        <dl className="ad-facts ad-facts--grid">
          <Fact label="Points redeemed">{request.points.toLocaleString('en-GB')}</Fact>
          <Fact label="Value at request">{formatGhs(request.amountMinor)}</Fact>
          <Fact label="Type">{KIND_LABEL[request.kind]}</Fact>
          <Fact label="Network">{request.network}</Fact>
        </dl>
        <dl className="ad-facts">
          <Fact label="Send to">
            <span className="ad-reveal">
              <code>{revealed ? formatPhone(request.phoneNumber) : maskPhone(request.phoneNumber)}</code>
              <button type="button" className="ts-link" aria-pressed={revealed} onClick={() => setRevealed((value) => !value)}>{revealed ? 'Hide number' : 'Show number'}</button>
              {revealed ? (
                <button type="button" className="ts-link" onClick={() => void navigator.clipboard?.writeText(request.phoneNumber).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy'}</button>
              ) : null}
            </span>
          </Fact>
        </dl>
        <p className="ts-hint">The value was fixed when the request was made; later setting changes do not alter it.</p>
      </div>

      <div className="ad-detail__section">
        <h3>History</h3>
        <ol className="ad-timeline">
          <li className="is-done"><span>Requested<time>{dateTime(request.createdAt)}</time></span></li>
          {request.status !== 'submitted' && request.decidedAt ? (
            <li className="is-done"><span>{request.status === 'rejected' ? 'Rejected · points returned' : 'Approved'}<time>{dateTime(request.decidedAt)}</time></span></li>
          ) : null}
          {request.status === 'fulfilled' ? <li className="is-done"><span>Delivery recorded<time>{dateTime(request.paidAt)}</time></span></li> : null}
          {request.status === 'rejected' && !request.decidedAt ? <li className="is-done"><span>Rejected · points returned<time>{dateTime(request.updatedAt)}</time></span></li> : null}
        </ol>
        {request.paymentReference ? <dl className="ad-facts"><Fact label="Delivery reference"><code>{request.paymentReference}</code></Fact></dl> : null}
        {request.adminNote ? <dl className="ad-facts"><Fact label={request.status === 'rejected' ? 'Reason given to the contributor' : 'Staff note'}>{request.adminNote}</Fact></dl> : null}
        <dl className="ad-facts"><Fact label="Request ID"><code>{request.id}</code></Fact></dl>
      </div>

      {request.status === 'submitted' || request.status === 'approved' ? (
        <div className="ad-detail__section">
          <h3>Decision</h3>
          <div className="ad-detail__actions">
            {request.status === 'submitted' ? <Button variant="primary" icon="check" onClick={() => setDialog('approve')}>Approve</Button> : null}
            {request.status === 'approved' ? <Button variant="primary" icon="send" onClick={() => setDialog('fulfill')}>Record delivery</Button> : null}
            <Button variant="danger-ghost" onClick={() => setDialog('reject')}>{request.status === 'approved' ? 'Reject and return points' : 'Reject'}</Button>
          </div>
        </div>
      ) : null}

      {dialog ? (
        <DecisionDialog
          request={request}
          name={name}
          action={dialog}
          onClose={() => setDialog(null)}
          onDone={async (message) => { setDialog(null); await onDecided(message); }}
          onStale={async () => { setDialog(null); await onStale(); }}
        />
      ) : null}
    </aside>
  );
}

function DecisionDialog({ request, name, action, onClose, onDone, onStale }: {
  request: Redemption;
  name: string;
  action: RedemptionAction;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  onStale: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const what = `${formatGhs(request.amountMinor)} of ${request.network} ${request.kind === 'airtime' ? 'airtime' : 'mobile data'}`;
  const problems = {
    note: action === 'reject' && !note.trim() ? 'Give the contributor a reason.' : '',
    reference: action === 'fulfill' && !reference.trim() ? 'Enter the delivery reference.' : '',
    confirm: action === 'fulfill' && !confirmed ? 'Confirm the delivery was sent.' : '',
  };
  const invalid = Boolean(problems.note || problems.reference || problems.confirm);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (invalid || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await decideRedemption({ request, action, note: note.trim(), paymentReference: action === 'fulfill' ? reference.trim() : undefined });
      await onDone(action === 'approve'
        ? `Approved. ${name}’s request is now awaiting delivery.`
        : action === 'fulfill'
          ? `Delivery recorded for ${name} (${reference.trim()}).`
          : `Rejected. ${formatPoints(result.pointsReturned ?? request.points)} returned to ${name}.`);
    } catch (reason) {
      if (isStaleDecision(reason)) {
        await onStale();
        return;
      }
      setError(errorMessage(reason, 'The decision could not be saved. Nothing was changed.'));
      setBusy(false);
    }
  };

  const title = action === 'approve' ? 'Approve this request?' : action === 'fulfill' ? 'Record delivery' : request.status === 'approved' ? 'Reject and return points?' : 'Reject this request?';
  const formId = `redemption-${action}`;
  return (
    <Dialog
      title={title}
      lede={`${name} · ${formatPoints(request.points)} · ${what}`}
      onClose={onClose}
      busy={busy}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" form={formId} busy={busy} variant={action === 'reject' ? 'danger' : 'primary'}>
          {action === 'approve' ? 'Approve request' : action === 'fulfill' ? 'Record delivery' : 'Reject request'}
        </Button>
      </>}
    >
      <form id={formId} className="ts-stack" onSubmit={(event) => void submit(event)} noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {action === 'approve' ? (
          <Notice tone="info">Approving does not send anything. The request moves to <strong>Awaiting delivery</strong>; send the {request.kind === 'airtime' ? 'airtime' : 'data'} yourself, then record the delivery reference.</Notice>
        ) : null}
        {action === 'reject' ? (
          <Notice tone="warning">{formatPoints(request.points)} will be returned to {name}’s balance once. The contributor sees your reason in TribeStudio.</Notice>
        ) : null}
        {action === 'fulfill' ? (
          <>
            <Notice tone="info">Recording a delivery does not send airtime or data. Only record it after you have sent <strong>{what}</strong> to <strong>{formatPhone(request.phoneNumber)}</strong>.</Notice>
            <Field label="Delivery reference" required hint="The transaction or voucher reference from the provider you used." error={touched ? problems.reference : undefined} counter={`${reference.length} / 160`}>
              <input className="ts-input ts-input--mono" value={reference} maxLength={160} autoFocus onChange={(event) => setReference(event.target.value)} />
            </Field>
            <label className="ts-check ts-check--card">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span className="ts-check__copy"><strong>I sent {what} to {formatPhone(request.phoneNumber)}</strong><small>The contributor will see this request as delivered.</small></span>
            </label>
            {touched && problems.confirm ? <p className="ts-error" role="alert"><Icon name="alert" />{problems.confirm}</p> : null}
          </>
        ) : null}
        <Field
          label={action === 'reject' ? 'Reason shown to the contributor' : 'Staff note'}
          required={action === 'reject'}
          optional={action !== 'reject'}
          error={touched ? problems.note : undefined}
          counter={`${note.length} / 1,000`}
        >
          <textarea className="ts-textarea" rows={3} maxLength={1000} value={note} autoFocus={action !== 'fulfill'} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/* -- Point settings ---------------------------------------------------------------------- */

const SETTING_FIELDS: { key: keyof RewardSettings; label: string; hint: string; suffix: string }[] = [
  { key: 'pointsPerExpression', label: 'Points per approved expression', hint: 'Credited once when an expression is approved.', suffix: 'points' },
  { key: 'dailyCap', label: 'Daily point cap', hint: 'The most a contributor can earn in one UTC day.', suffix: 'points' },
  { key: 'redemptionMinimum', label: 'Minimum redemption', hint: 'The fewest points a contributor can redeem at once.', suffix: 'points' },
  { key: 'cedisPerRedemption', label: 'Value of the minimum redemption', hint: 'Ghana cedis paid for the minimum number of points.', suffix: 'GH₵' },
];

function settingsProblem(settings: Record<keyof RewardSettings, string>): Partial<Record<keyof RewardSettings, string>> {
  const problems: Partial<Record<keyof RewardSettings, string>> = {};
  for (const field of SETTING_FIELDS) {
    const value = Number(settings[field.key]);
    if (!/^\d+$/.test(settings[field.key].trim()) || !Number.isSafeInteger(value) || value < 1 || value > 100000) problems[field.key] = 'Use a whole number from 1 to 100,000.';
  }
  if (!problems.dailyCap && !problems.pointsPerExpression && Number(settings.dailyCap) < Number(settings.pointsPerExpression)) {
    problems.dailyCap = 'The daily cap must cover at least one expression.';
  }
  return problems;
}

export function PointSettings() {
  const [saved, setSaved] = useState<LoadState<RewardSettings>>({ state: 'loading' });
  const [draft, setDraft] = useState<Record<keyof RewardSettings, string> | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const load = useCallback(async () => {
    setSaved({ state: 'loading' });
    try {
      const ledger = await loadRedemptionLedger();
      if (!ledger.rewards) throw new Error('The server did not return the reward settings.');
      setSaved({ state: 'ready', data: ledger.rewards });
      setDraft(Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, String(ledger.rewards![field.key])])) as Record<keyof RewardSettings, string>);
    } catch (reason) {
      setSaved(asFailure(reason, 'Point settings could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const current = saved.state === 'ready' ? saved.data : null;
  const dirty = Boolean(current && draft && SETTING_FIELDS.some((field) => String(current[field.key]) !== draft[field.key].trim()));
  useLeaveGuard(dirty, 'Your point settings are not saved. Leave without saving?');
  const problems = draft ? settingsProblem(draft) : {};
  const parsed: RewardSettings | null = draft && Object.keys(problems).length === 0
    ? Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, Number(draft[field.key])])) as unknown as RewardSettings
    : null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!parsed || !current || !dirty) return;
    const changes = SETTING_FIELDS.filter((field) => current[field.key] !== parsed[field.key]);
    const ok = await confirmAction({
      title: 'Save point settings?',
      body: (
        <>
          <ul className="ts-list">
            {changes.map((field) => <li key={field.key}>{field.label}: <strong>{current[field.key]}</strong> → <strong>{parsed[field.key]}</strong></li>)}
          </ul>
          <p>New earning and redemption rules apply from now on. Requests already made keep their points and value.</p>
        </>
      ),
      confirmLabel: 'Save settings',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const result = await saveRewardSettings(parsed);
      setSaved({ state: 'ready', data: result });
      setDraft(Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, String(result[field.key])])) as Record<keyof RewardSettings, string>);
      setTouched(false);
      setToast('Point settings saved.');
    } catch (reason) {
      setError(errorMessage(reason, 'The settings could not be saved. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-page">
      <PageHeader title="Point settings" description="How contributors earn points and what the points are worth." />
      {saved.state === 'loading' ? <div className="ad-card-box ad-card-box__body" style={{ paddingTop: 'var(--space-5)' }}><Skeleton title lines={6} label="Loading point settings" /></div> : null}
      {saved.state === 'denied' ? <PermissionState body="Point settings need an admin role." /> : null}
      {saved.state === 'error' ? <LoadFailure title="Point settings could not be loaded" body={saved.message} onRetry={() => void load()} compact={false} /> : null}
      {current && draft ? (
        <div className="ad-desk">
          <form className="ad-card-box" onSubmit={(event) => void save(event)} noValidate aria-labelledby="settings-title">
            <div className="ad-card-box__head"><h2 id="settings-title">Earning and redemption</h2>{dirty ? <Badge tone="warning">Unsaved changes</Badge> : <Badge tone="success" dot>Saved</Badge>}</div>
            <div className="ad-card-box__body ts-stack">
              {error ? <Notice tone="danger">{error}</Notice> : null}
              {SETTING_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint} required error={touched || draft[field.key] !== String(current[field.key]) ? problems[field.key] : undefined}>
                  <input className="ts-input" inputMode="numeric" value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value.replace(/[^\d]/g, '') })} aria-label={`${field.label} (${field.suffix})`} />
                </Field>
              ))}
              <div className="ad-detail__actions">
                <Button type="submit" variant="primary" busy={busy} disabled={!dirty || !parsed}>Save settings</Button>
                <Button disabled={!dirty || busy} onClick={() => { setDraft(Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, String(current[field.key])])) as Record<keyof RewardSettings, string>); setTouched(false); }}>Discard changes</Button>
              </div>
            </div>
          </form>
          <aside className="ad-detail" aria-labelledby="effect-title">
            <h2 id="effect-title">Effective conversion</h2>
            {parsed ? (
              <>
                <p className="ad-tile__value">{parsed.redemptionMinimum.toLocaleString('en-GB')} pts = {formatGhs(parsed.cedisPerRedemption * 100)}</p>
                <dl className="ad-facts">
                  <Fact label="One approved expression">{formatPoints(parsed.pointsPerExpression)} ≈ {formatGhs(valueOfPoints(parsed.pointsPerExpression, parsed))}</Fact>
                  <Fact label="A full day at the cap">{formatPoints(parsed.dailyCap)} ≈ {formatGhs(valueOfPoints(parsed.dailyCap, parsed))}</Fact>
                  <Fact label="Expressions to reach the minimum">{Math.ceil(parsed.redemptionMinimum / parsed.pointsPerExpression)}</Fact>
                </dl>
                <p className="ts-hint">Values are rounded to the pesewa, the same way the server values each request.</p>
              </>
            ) : <p className="ts-muted">Fix the highlighted fields to see the conversion.</p>}
            <div className="ad-detail__section">
              <h3>What changes</h3>
              <p className="ts-muted">Saved settings apply to future approvals and new redemption requests. Every existing request keeps the points and cedi value it was made with.</p>
            </div>
          </aside>
        </div>
      ) : null}
      {toast ? <Toast message={toast} onDone={() => setToast('')} /> : null}
    </div>
  );
}

/* -- Payout records ------------------------------------------------------------------------ */

export function PayoutRecords() {
  const [payments, setPayments] = useState<LoadState<ContributorPayments>>({ state: 'loading' });
  const [people, setPeople] = useState<ContributorDirectoryRow[]>([]);
  const [toast, setToast] = useState('');
  const load = useCallback(async () => {
    try { setPayments({ state: 'ready', data: await fetchContributorPayments() }); }
    catch (reason) { setPayments(asFailure(reason, 'Payout records could not be loaded.')); }
  }, []);
  useEffect(() => {
    void load();
    fetchContributorDirectory().then(setPeople, () => undefined);
  }, [load]);
  return (
    <div className="ad-page">
      <PageHeader title="Payout records" description="Contributor payout verification and payment requests. Finance permission only." />
      {payments.state === 'loading' ? <div className="ad-card-box ad-card-box__body" style={{ paddingTop: 'var(--space-5)' }}><Skeleton title lines={5} label="Loading payout records" /></div> : null}
      {payments.state === 'denied' ? <PermissionState body="Payout records need the finance permission on an admin account. A super administrator can grant it." /> : null}
      {payments.state === 'error' ? <LoadFailure title="Payout records could not be loaded" body={payments.message} onRetry={() => void load()} compact={false} /> : null}
      {payments.state === 'ready' ? (
        <ContributorPaymentsDesk payments={payments.data} contributors={people} loading={false} canReview
          onReload={load} onNotice={setToast} />
      ) : null}
      {toast ? <Toast message={toast} tone="info" onDone={() => setToast('')} /> : null}
    </div>
  );
}
