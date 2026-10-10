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
  Avatar, Badge, Button, ButtonLink, Dialog, EmptyState, Field, IconButton, LoadFailure, Notice, PageHeader, PermissionState,
  SearchField, Segmented, Select, Skeleton, Toast, cx,
} from '../ui/primitives';
import {
  DIMENSIONS, DIMENSION_LABELS, ENTRY_LABEL, KIND_LABEL, NETWORKS, PolicyError, REWARD_CATEGORIES, STATUSES, STATUS_META,
  adjustPoints, computeAward, dateOnly, dateTime, decideRedemption, errorMessage, formatGhs, formatPhone, formatPoints, isStaleDecision,
  loadAudit, loadLedger, loadPolicies, loadRedemptionLedger, maskPhone, newKey, parseAwardPolicy, parseRedemptionPolicy, previewPolicy,
  quotePoints, saveFlags, savePolicy,
  type AuditRow, type AwardPolicyConfig, type ContributorLedger, type Flags, type PolicyOverview, type Redemption, type RedemptionAction,
  type RedemptionLedger, type RedemptionPolicyConfig, type RedemptionStatus,
} from './data';
import './finance.css';

/* ==========================================================================
   Finance owns money: redemption rates, award policies, the points ledger,
   liability and fulfilment. Validators own linguistic judgement on
   TribeStudio's Rewards desk; nothing here can score a contribution.

   Nothing on these screens moves money by itself. Approving only marks a
   request ready; someone tops up outside this system and records the
   outcome. Every decision, policy save, flag change and adjustment is
   enforced and audited on the server.
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

function usePeople() {
  const [people, setPeople] = useState<ContributorDirectoryRow[] | null>(null);
  const [peopleError, setPeopleError] = useState(false);
  useEffect(() => { fetchContributorDirectory().then((rows) => { setPeople(rows); setPeopleError(false); }, () => setPeopleError(true)); }, []);
  const personFor = useCallback((uid: string) => people?.find((row) => row.authUid === uid || row.id === uid) ?? null, [people]);
  return { people, personFor, peopleError };
}

/** The ledger plus the contributor directory, so requests carry a person's name. */
function useLedger() {
  const [ledger, setLedger] = useState<LoadState<RedemptionLedger>>({ state: 'loading' });
  const { personFor, peopleError } = usePeople();
  const load = useCallback(async () => {
    try { setLedger({ state: 'ready', data: await loadRedemptionLedger() }); }
    catch (error) { setLedger(asFailure(error, 'Redemptions could not be loaded.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { ledger, load, personFor, peopleError };
}

function StatusBadge({ status }: { status: RedemptionStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.submitted;
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

function Gate<T>({ state, label, onRetry, denied }: { state: LoadState<T>; label: string; onRetry: () => void; denied: string }) {
  if (state.state === 'loading') return <div className="ad-card-box ad-card-box__body" style={{ paddingTop: 'var(--space-5)' }}><Skeleton title lines={5} label={`Loading ${label}`} /></div>;
  if (state.state === 'denied') return <PermissionState body={denied} />;
  if (state.state === 'error') return <LoadFailure title={`${label[0].toUpperCase()}${label.slice(1)} could not be loaded`} body={state.message} onRetry={onRetry} compact={false} />;
  return null;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ad-fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

const AWARD_MODE: Record<Flags['awardMode'], string> = { 'legacy-flat': 'Previous flat rule', assessed: 'Assessed by validators' };

/* -- Overview ------------------------------------------------------------------------ */

export function FinanceOverview() {
  const { ledger, load, personFor } = useLedger();
  const { access } = useSession();
  const data = ledger.state === 'ready' ? ledger.data : null;
  const summary = data?.summary ?? null;
  const recent = data?.requests.slice(0, 5) ?? [];
  const fromPage = (status: RedemptionStatus) => {
    const rows = data?.requests.filter((row) => row.status === status) ?? [];
    return { count: rows.length, points: rows.reduce((sum, row) => sum + row.points, 0), amountMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0) };
  };
  const totals = (status: RedemptionStatus) => summary?.[status] ?? fromPage(status);
  const partial = !summary && Boolean(data?.truncated);
  const l = data?.liability;
  const redemption = data?.redemptionPolicy;

  return (
    <div className="ad-page">
      <PageHeader
        title="Finance"
        description="Manage points, rewards and redemptions."
        actions={<>
          <Button icon="refresh" onClick={() => void load()} disabled={ledger.state === 'loading'}>Refresh</Button>
          <ButtonLink to="/finance/redemptions" variant="primary" icon="gift">Open redemptions</ButtonLink>
        </>}
      />
      <Gate state={ledger} label="redemptions" onRetry={() => void load()} denied="Finance needs an admin role. The server refused this account." />
      {data ? (
        <>
          {partial ? <Notice tone="warning" title="Totals cover the newest 500 requests only">The server could not count the full ledger just now.</Notice> : null}
          {data.flags && !data.flags.redemptionsOpen ? <Notice tone="warning" title="New redemptions are paused">Contributors cannot request new redemptions. Open requests still need decisions.</Notice> : null}
          <div className="ad-tiles ts-stagger">
            <Tile icon="clock" tone="warning" label="Pending requests" value={String(totals('submitted').count)} hint={`${formatPoints(totals('submitted').points)} reserved`} to="/finance/redemptions?status=submitted" />
            <Tile icon="send" label="Awaiting top-up" value={String(totals('approved').count)} hint={`${formatGhs(totals('approved').amountMinor)} to send`} to="/finance/redemptions?status=approved" />
            <Tile icon="alert" tone={totals('needs_reconciliation').count ? 'danger' : undefined} label="Needs reconciliation" value={String(totals('needs_reconciliation').count)} hint="Unclear outcomes; points held" to="/finance/redemptions?status=needs_reconciliation" />
          </div>

          <div className="fin-grid">
            <section className="ad-card-box" aria-labelledby="liability">
              <div className="ad-card-box__head"><div><h2 id="liability">Reward liability</h2><p className="ts-muted">From actual balances at the current rate (v{redemption?.version}).</p></div></div>
              {l ? (
                <div className="ad-card-box__body">
                  <dl className="ad-facts ad-facts--grid">
                    <Fact label="Available points">{l.points.toLocaleString('en-GB')} <small className="ts-muted">across {l.accounts} {l.accounts === 1 ? 'account' : 'accounts'}</small></Fact>
                    <Fact label="At base value">{formatGhs(l.atBaseMinor)}</Fact>
                    <Fact label="Upper estimate">{formatGhs(l.upperMinor)} <small className="ts-muted">if each balance is redeemed in the largest allowed requests</small></Fact>
                    <Fact label="Reserved in open requests">{l.reservedPoints.toLocaleString('en-GB')} pts{l.openRequestsMinor !== null ? ` · ${formatGhs(l.openRequestsMinor)} agreed` : ''}</Fact>
                    <Fact label="Below the minimum">{l.belowMinimumPoints.toLocaleString('en-GB')} pts</Fact>
                    <Fact label="Possible future awards">{data.pendingAwards ? `${(data.pendingAwards.validator_review.points + data.pendingAwards.eligible.points).toLocaleString('en-GB')} pts (estimates and confirmed, not yet settled)` : '—'}</Fact>
                  </dl>
                  {l.unopenedAccounts ? <p className="ts-hint">{l.unopenedAccounts} balances are still on the previous system’s fields; they open in the ledger on first use or when the migration runs.</p> : null}
                  {l.truncated ? <p className="ts-hint">Only the first 5,000 accounts were read.</p> : null}
                </div>
              ) : <div className="ad-card-box__body ts-muted">Unavailable.</div>}
            </section>
            <section className="ad-card-box" aria-labelledby="rollout">
              <div className="ad-card-box__head"><div><h2 id="rollout">Reward system</h2><p className="ts-muted">Versioned policies and rollout switches.</p></div>
                <ButtonLink to="/finance/settings" size="sm" variant="ghost" iconRight="arrow">Policies</ButtonLink></div>
              {data.flags ? (
                <dl className="ad-card-box__body ad-facts">
                  <Fact label="Awards">{AWARD_MODE[data.flags.awardMode]}</Fact>
                  <Fact label="Assessment worker">{data.flags.assessmentWorker === 'on' ? 'On (recommendations only)' : 'Off — validators assess directly'}</Fact>
                  <Fact label="Rates">{redemption ? `${redemption.config.basePoints} pts = ${formatGhs(redemption.config.baseAmountMinor)} · v${redemption.version}` : '—'} {redemption?.basis === 'proposed-default' ? <Badge tone="info">Proposed defaults</Badge> : null}</Fact>
                  <Fact label="Award policy">{data.awardPolicy ? `v${data.awardPolicy.version}` : '—'} {data.awardPolicy?.basis === 'proposed-default' ? <Badge tone="info">Proposed defaults</Badge> : null}</Fact>
                </dl>
              ) : null}
            </section>
          </div>

          <section className="ad-card-box" aria-labelledby="by-status">
            <div className="ad-card-box__head"><div><h2 id="by-status">Values by status</h2><p className="ts-muted">{summary ? 'Every airtime and data request, counted on the server.' : 'From the loaded requests.'}</p></div></div>
            <div className="ad-table-scroll">
              <table className="ad-table ad-table--static">
                <thead><tr><th scope="col">Status</th><th scope="col">Requests</th><th scope="col">Points</th><th scope="col">Agreed value</th><th scope="col">What it means</th></tr></thead>
                <tbody>
                  {STATUSES.map((status) => (
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
          </section>

          <section className="ad-card-box" aria-labelledby="recent">
            <div className="ad-card-box__head"><h2 id="recent">Recent requests</h2><ButtonLink to="/finance/redemptions" size="sm" iconRight="arrow" variant="ghost">All requests</ButtonLink></div>
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
                          <td>{row.bundle ? row.bundle.label : KIND_LABEL[row.kind]} · {row.network}</td>
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
            <Tile icon="list" label="Points ledger" value="Balances" hint="Every movement, with reasoned adjustments" to="/finance/ledger" />
            <Tile icon="archive" label="Audit history" value="Changes" hint="Policies, flags, decisions and adjustments" to="/finance/audit" />
            {hasFinanceAccess(access) ? <Tile icon="bank" label="Payout records" value="Bank & MoMo" hint="Payout verification and payment requests" to="/finance/payouts" /> : null}
          </div>
          <p className="ad-footnote"><Icon name="info" /><span>Finance shows only what the system records. Membership income, bank balances and provider settlements are not connected to this console, and no airtime or data is sent from here.</span></p>
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

const STATUS_PARAM = new Set<string>(['all', ...STATUSES]);

export function RedemptionsDesk() {
  const { ledger, load, personFor, peopleError } = useLedger();
  const { params, setParams } = useRouter();
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null);
  const status = (STATUS_PARAM.has(params.get('status') ?? '') ? params.get('status') : 'all') as StatusFilter;
  const kind = params.get('kind') ?? 'all';
  const network = params.get('network') ?? 'all';
  const when = (params.get('date') ?? 'all') as DateFilter;
  const contributor = params.get('contributor') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const selectedId = params.get('request');
  const rows = ledger.state === 'ready' ? ledger.data.requests : [];
  const canDecide = ledger.state === 'ready' && ledger.data.canDecide === true;
  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (kind !== 'all' && row.kind !== kind) return false;
    if (network !== 'all' && row.network !== network) return false;
    if (contributor && row.contributorId !== contributor) return false;
    if (!withinDate(row.createdAt, when)) return false;
    if (!needle) return true;
    const person = personFor(row.contributorId);
    return [row.id, row.paymentReference, row.contributorId, row.phoneNumber, row.phoneNumber?.replace('+233', '0'), person?.displayName, person?.email, person?.phone]
      .some((value) => value?.toLowerCase().includes(needle));
  }), [contributor, kind, needle, network, personFor, rows, status, when]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const counts = (value: RedemptionStatus) => rows.filter((row) => row.status === value).length;
  const filtersOn = status !== 'all' || kind !== 'all' || network !== 'all' || when !== 'all' || Boolean(contributor) || Boolean(needle);
  const contributorPerson = contributor ? personFor(contributor) : null;
  const select = (row: Redemption | null) => setParams({ request: row?.id ?? null });

  return (
    <div className="ad-page">
      <PageHeader title="Point redemptions" description="Approve, top up, reconcile or return airtime and data requests." actions={<Button icon="refresh" onClick={() => void load()} disabled={ledger.state === 'loading'}>Refresh</Button>} />
      <Gate state={ledger} label="redemptions" onRetry={() => void load()} denied="Point redemptions need an admin role. The server refused this account." />
      {ledger.state === 'ready' ? (
        <>
          {!canDecide ? <Notice tone="info">You can view requests. Decisions need the finance permission (a super administrator can grant it).</Notice> : null}
          {ledger.data.truncated ? <Notice tone="info">Showing the newest {rows.length} requests. Totals on the Finance overview count every request.</Notice> : null}
          {peopleError ? <Notice tone="warning">Contributor names could not be loaded, so requests show account IDs.</Notice> : null}
          <div className={cx('ad-desk', !selected && 'ad-desk--single')}>
            <section className="ad-card-box" aria-labelledby="requests-title">
              <div className="ad-card-box__head">
                <h2 id="requests-title">Requests</h2>
                <Segmented<StatusFilter> label="Request status" value={status} onChange={(value) => setParams({ status: value === 'all' ? null : value })} options={[
                  { value: 'all', label: 'All', count: rows.length },
                  { value: 'submitted', label: 'Pending', count: counts('submitted') },
                  { value: 'approved', label: 'Awaiting top-up', count: counts('approved') },
                  { value: 'needs_reconciliation', label: 'Reconcile', count: counts('needs_reconciliation') },
                  { value: 'fulfilled', label: 'Delivered', count: counts('fulfilled') },
                ]} />
              </div>
              <div className="ad-card-box__body ad-toolbar">
                <SearchField label="Search requests" placeholder="Name, phone, request ID or reference" value={search} onChange={(value) => { setSearch(value); setParams({ q: value || null }); }} />
                <Select label="Status" value={status} onChange={(value) => setParams({ status: value === 'all' ? null : value })} options={[{ value: 'all', label: 'Any status' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))]} />
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
                    <thead><tr><th scope="col">Contributor</th><th scope="col">Points</th><th scope="col">Reward</th><th scope="col">Value</th><th scope="col">Requested</th><th scope="col">Status</th></tr></thead>
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
                            <td>{row.bundle ? row.bundle.label : KIND_LABEL[row.kind]} · {row.network}{row.settlementPath === 'legacy' ? <> <Badge tone="neutral">Legacy</Badge></> : null}</td>
                            <td className="ad-table__num"><strong>{formatGhs(row.amountMinor)}</strong></td>
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
              ) : <EmptyState compact icon="gift" title="No redemption requests yet" body="When a contributor redeems points in TribeStudio, the request appears here." />}
            </section>
            {selected ? (
              <RedemptionDetail key={`${selected.id}-${selected.status}`} request={selected} person={personFor(selected.contributorId)} canDecide={canDecide}
                onClose={() => select(null)}
                onDecided={async (message) => { setToast({ message, tone: 'success' }); await load(); queuesChanged(); }}
                onStale={async () => { await load(); setToast({ message: 'This request changed since you opened it. The latest version is shown.', tone: 'info' }); }} />
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

const ACTIONS_FOR: Partial<Record<RedemptionStatus, RedemptionAction[]>> = {
  submitted: ['approve', 'reject'],
  approved: ['fulfill', 'mark_ambiguous', 'fail', 'reject'],
  needs_reconciliation: ['fulfill', 'fail'],
};
const ACTION_LABEL: Record<RedemptionAction, string> = {
  approve: 'Approve', reject: 'Reject and return points', fulfill: 'Record delivery', fail: 'Record definite failure', mark_ambiguous: 'Outcome unclear',
};

function RedemptionDetail({ request, person, canDecide, onClose, onDecided, onStale }: {
  request: Redemption; person: ContributorDirectoryRow | null; canDecide: boolean; onClose: () => void; onDecided: (message: string) => Promise<void>; onStale: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dialog, setDialog] = useState<RedemptionAction | null>(null);
  const name = person?.displayName ?? 'Contributor';
  const meta = STATUS_META[request.status];
  const actions = ACTIONS_FOR[request.status] ?? [];
  return (
    <aside className="ad-detail" aria-labelledby="request-detail-title">
      <div className="ad-detail__head">
        <div><h2 id="request-detail-title">Request details</h2><p className="ts-muted">{formatPoints(request.points)} for {request.bundle ? request.bundle.label : KIND_LABEL[request.kind].toLowerCase()}</p></div>
        <IconButton icon="close" label="Close request details" onClick={onClose} />
      </div>
      <div className="ad-facts"><StatusBadge status={request.status} /><p className="ts-muted">{meta.description}</p></div>
      <div className="ad-detail__section">
        <h3>Contributor</h3>
        <div className="ad-person"><Avatar name={name} src={person?.photoUrl} /><span><strong>{name}</strong><small>{person?.email || request.contributorId}</small></span></div>
        <div className="ad-detail__actions">
          <Link to={`/finance/redemptions?contributor=${encodeURIComponent(request.contributorId)}`} className="ts-link">All their requests</Link>
          <Link to={`/finance/ledger?contributor=${encodeURIComponent(request.contributorId)}`} className="ts-link">Points ledger</Link>
        </div>
      </div>
      <div className="ad-detail__section">
        <h3>Agreed value</h3>
        <dl className="ad-facts ad-facts--grid">
          <Fact label="Points">{request.points.toLocaleString('en-GB')}</Fact>
          <Fact label="Total">{formatGhs(request.amountMinor)}</Fact>
          {request.baseMinor !== null ? <Fact label="Base">{formatGhs(request.baseMinor)}</Fact> : null}
          {request.bonusMinor !== null ? <Fact label="Bonus">{formatGhs(request.bonusMinor)}</Fact> : null}
          <Fact label="Network">{request.network}</Fact>
          <Fact label="Terms">{request.settlementPath === 'legacy' ? 'Legacy (original rate)' : `Quoted · rates v${request.policyVersion}`}</Fact>
        </dl>
        {request.bundle ? <p className="ts-hint">Bundle {request.bundle.label}, price {formatGhs(request.bundle.priceMinor)}{request.bundle.residualMinor ? `; ${formatGhs(request.bundle.residualMinor)} above the price was disclosed as not paid out` : ''}.</p> : null}
        <dl className="ad-facts">
          <Fact label="Send to">
            <span className="ad-reveal">
              <code>{revealed ? formatPhone(request.phoneNumber) : maskPhone(request.phoneNumber)}</code>
              <button type="button" className="ts-link" aria-pressed={revealed} onClick={() => setRevealed((value) => !value)}>{revealed ? 'Hide number' : 'Show number'}</button>
              {revealed ? <button type="button" className="ts-link" onClick={() => void navigator.clipboard?.writeText(request.phoneNumber).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy'}</button> : null}
            </span>
          </Fact>
        </dl>
        <p className="ts-hint">The value was fixed when the contributor accepted the quote; later rate changes do not alter it.</p>
      </div>
      <div className="ad-detail__section">
        <h3>History</h3>
        <ol className="ad-timeline">
          <li className="is-done"><span>Requested<time>{dateTime(request.createdAt)}</time></span></li>
          {(request.history ?? []).filter((h) => h.status !== 'submitted').map((h, index) => (
            <li key={index} className="is-done"><span>{STATUS_META[h.status as RedemptionStatus]?.label ?? h.status}{h.note ? ` — ${h.note}` : ''}<time>{dateTime(h.at)}</time></span></li>
          ))}
        </ol>
        {request.paymentReference ? <dl className="ad-facts"><Fact label="Delivery reference"><code>{request.paymentReference}</code></Fact></dl> : null}
        {request.adminNote ? <dl className="ad-facts"><Fact label="Note">{request.adminNote}</Fact></dl> : null}
        <dl className="ad-facts"><Fact label="Request ID"><code>{request.id}</code></Fact></dl>
      </div>
      {actions.length && canDecide ? (
        <div className="ad-detail__section">
          <h3>Decision</h3>
          <div className="ad-detail__actions">
            {actions.map((action) => (
              <Button key={action} variant={action === 'approve' || action === 'fulfill' ? 'primary' : action === 'reject' || action === 'fail' ? 'danger-ghost' : 'secondary'}
                icon={action === 'approve' ? 'check' : action === 'fulfill' ? 'send' : action === 'mark_ambiguous' ? 'clock' : undefined} onClick={() => setDialog(action)}>{ACTION_LABEL[action]}</Button>
            ))}
          </div>
        </div>
      ) : null}
      {dialog ? <DecisionDialog request={request} name={name} action={dialog} onClose={() => setDialog(null)}
        onDone={async (message) => { setDialog(null); await onDecided(message); }} onStale={async () => { setDialog(null); await onStale(); }} /> : null}
    </aside>
  );
}

function DecisionDialog({ request, name, action, onClose, onDone, onStale }: {
  request: Redemption; name: string; action: RedemptionAction; onClose: () => void; onDone: (message: string) => Promise<void>; onStale: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const what = request.bundle ? `${request.bundle.label} (${request.network})` : `${formatGhs(request.amountMinor)} of ${request.network} ${request.kind === 'airtime' ? 'airtime' : 'mobile data'}`;
  const problems = {
    note: action === 'reject' && !note.trim() ? 'Give the contributor a reason.'
      : (action === 'fail' || action === 'mark_ambiguous') && note.trim().length < 10 ? 'Describe what happened (at least 10 characters).' : '',
    reference: action === 'fulfill' && !reference.trim() ? 'Enter the delivery reference.' : '',
    confirm: (action === 'fulfill' || action === 'fail') && !confirmed ? (action === 'fulfill' ? 'Confirm the delivery was sent.' : 'Confirm the provider says nothing was delivered.') : '',
  };
  const invalid = Boolean(problems.note || problems.reference || problems.confirm);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (invalid || busy) return;
    setBusy(true); setError('');
    try {
      const result = await decideRedemption({ request, action, note: note.trim(), paymentReference: action === 'fulfill' ? reference.trim() : undefined, definitive: action === 'fail' ? true : undefined });
      await onDone(action === 'approve' ? `Approved. ${name}’s request is awaiting top-up.`
        : action === 'fulfill' ? `Delivery recorded for ${name} (${reference.trim()}).`
          : action === 'mark_ambiguous' ? 'Marked for reconciliation. The points stay reserved.'
            : `${action === 'fail' ? 'Failure recorded' : 'Rejected'}. ${formatPoints(result.pointsReturned ?? request.points)} returned to ${name}.`);
    } catch (reason) {
      if (isStaleDecision(reason) && /changed|updated/i.test(errorMessage(reason, ''))) { await onStale(); return; }
      setError(errorMessage(reason, 'The decision could not be saved. Nothing was changed.'));
      setBusy(false);
    }
  };
  const formId = `redemption-${action}`;
  return (
    <Dialog title={`${ACTION_LABEL[action]}?`} lede={`${name} · ${formatPoints(request.points)} · ${what}`} onClose={onClose} busy={busy}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form={formId} busy={busy} variant={action === 'reject' || action === 'fail' ? 'danger' : 'primary'}>{ACTION_LABEL[action]}</Button></>}>
      <form id={formId} className="ts-stack" onSubmit={(event) => void submit(event)} noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {action === 'approve' ? <Notice tone="info">Approving does not send anything. The request moves to <strong>Awaiting top-up</strong>; send it yourself, then record the outcome.</Notice> : null}
        {action === 'reject' ? <Notice tone="warning">{formatPoints(request.points)} will be returned to {name} exactly once. The contributor sees your reason.</Notice> : null}
        {action === 'mark_ambiguous' ? <Notice tone="info">Use this for a timeout or a missing receipt. Points stay reserved, so a late success can never be paid and refunded. Reconcile it later as delivered or definitively failed.</Notice> : null}
        {action === 'fail' ? <Notice tone="warning">Only when the provider confirms nothing was delivered. The points are released once; if a success shows up later it is flagged, not paid again.</Notice> : null}
        {action === 'fulfill' ? (
          <>
            <Notice tone="info">Recording a delivery does not send anything. Only record it after you have sent <strong>{what}</strong> to <strong>{formatPhone(request.phoneNumber)}</strong>.</Notice>
            <Field label="Delivery reference" required hint="The transaction or voucher reference from the top-up channel." error={touched ? problems.reference : undefined} counter={`${reference.length} / 160`}>
              <input className="ts-input ts-input--mono" value={reference} maxLength={160} autoFocus onChange={(event) => setReference(event.target.value)} />
            </Field>
          </>
        ) : null}
        {action === 'fulfill' || action === 'fail' ? (
          <label className="ts-check ts-check--card">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span className="ts-check__copy"><strong>{action === 'fulfill' ? `I sent ${what} to ${formatPhone(request.phoneNumber)}` : 'The provider confirmed nothing was delivered'}</strong></span>
          </label>
        ) : null}
        {touched && problems.confirm ? <p className="ts-error" role="alert"><Icon name="alert" />{problems.confirm}</p> : null}
        <Field label={action === 'reject' ? 'Reason shown to the contributor' : action === 'approve' || action === 'fulfill' ? 'Staff note' : 'What happened'} required={action !== 'approve' && action !== 'fulfill'}
          optional={action === 'approve' || action === 'fulfill'} error={touched ? problems.note : undefined} counter={`${note.length} / 1,000`}>
          <textarea className="ts-textarea" rows={3} maxLength={1000} value={note} autoFocus={action !== 'fulfill'} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/* -- Reward policies -------------------------------------------------------------------- */

type PolicyTab = 'redemption' | 'award' | 'rollout' | 'versions';

export function PointSettings() {
  const [state, setState] = useState<LoadState<PolicyOverview>>({ state: 'loading' });
  const { params, setParams } = useRouter();
  const tab = (['redemption', 'award', 'rollout', 'versions'].includes(params.get('tab') ?? '') ? params.get('tab') : 'redemption') as PolicyTab;
  const [toast, setToast] = useState('');
  const load = useCallback(async () => {
    try { setState({ state: 'ready', data: await loadPolicies() }); }
    catch (error) { setState(asFailure(error, 'Reward policies could not be loaded.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const data = state.state === 'ready' ? state.data : null;
  return (
    <div className="ad-page">
      <PageHeader title="Reward policies" description="Versioned rules for earning and redeeming points. Every change is previewed, explained and audited." />
      <Gate state={state} label="reward policies" onRetry={() => void load()} denied="Reward policies need an admin role." />
      {data ? (
        <>
          {!data.canEdit ? <Notice tone="info">You can read the policies. Changing them needs the finance permission.</Notice> : null}
          <Notice tone="info" title="These numbers are calibration settings">The defaults are proposals, not measured evidence of Kasem data quality or a proven sustainable payout rate. Calibrate them against reviewer-labelled samples and actual budget. Accepted requests keep their agreed value.</Notice>
          <Segmented<PolicyTab> label="Policy area" value={tab} onChange={(value) => setParams({ tab: value === 'redemption' ? null : value })} options={[
            { value: 'redemption', label: 'Redemption rates' }, { value: 'award', label: 'Contribution awards' }, { value: 'rollout', label: 'Rollout' }, { value: 'versions', label: 'Versions', count: data.history.length },
          ]} />
          {tab === 'redemption' ? <RedemptionPolicyEditor key={data.redemption.id} overview={data} onSaved={async (m) => { setToast(m); await load(); }} /> : null}
          {tab === 'award' ? <AwardPolicyEditor key={data.award.id} overview={data} onSaved={async (m) => { setToast(m); await load(); }} /> : null}
          {tab === 'rollout' ? <RolloutPanel overview={data} onSaved={async (m) => { setToast(m); await load(); }} /> : null}
          {tab === 'versions' ? <VersionsPanel overview={data} /> : null}
        </>
      ) : null}
      {toast ? <Toast message={toast} onDone={() => setToast('')} /> : null}
    </div>
  );
}

function SaveBar({ dirty, canEdit, busy, problem, onSave, onReset, onPreview, previewBusy }: {
  dirty: boolean; canEdit: boolean; busy: boolean; problem: string; onSave: () => void; onReset: () => void; onPreview: () => void; previewBusy: boolean;
}) {
  return (
    <div className="ad-detail__actions fin-savebar">
      {problem ? <p className="ts-error" role="alert"><Icon name="alert" />{problem}</p> : null}
      <Button icon="eye" onClick={onPreview} busy={previewBusy} disabled={Boolean(problem) || !canEdit}>Preview impact</Button>
      <Button variant="primary" onClick={onSave} busy={busy} disabled={!dirty || Boolean(problem) || !canEdit}>Save as new version</Button>
      <Button variant="ghost" onClick={onReset} disabled={!dirty || busy}>Discard changes</Button>
    </div>
  );
}

async function askReason(title: string, body: ReactNode): Promise<string | null> {
  let reason = '';
  const ok = await confirmAction({
    title,
    body: <>{body}<label className="ts-field" style={{ marginTop: 'var(--space-3)' }}><span className="ts-label">Reason for the audit history (required)</span>
      <textarea className="ts-textarea" rows={3} maxLength={1000} onChange={(event) => { reason = event.target.value; }} /></label></>,
    confirmLabel: 'Save new version',
  });
  if (!ok) return null;
  return reason.trim();
}

const pesewas = (value: string) => Math.round(Number(value) * 100);
const cedisText = (minor: number) => (minor / 100).toFixed(2);

function RedemptionPolicyEditor({ overview, onSaved }: { overview: PolicyOverview; onSaved: (message: string) => Promise<void> }) {
  const active = overview.redemption;
  const [draft, setDraft] = useState<RedemptionPolicyConfig>(() => structuredClone(active.config));
  const [preview, setPreview] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false), [previewBusy, setPreviewBusy] = useState(false), [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(active.config);
  useLeaveGuard(dirty, 'Your rate changes are not saved. Leave without saving?');
  let problem = '';
  try { parseRedemptionPolicy(draft); } catch (e) { problem = e instanceof PolicyError ? e.message : 'Check the highlighted values.'; }
  const set = (patch: Partial<RedemptionPolicyConfig>) => { setDraft({ ...draft, ...patch }); setPreview(null); };
  const examples = [draft.minimumPoints, 300, 900, 1800, 3000, draft.maximumPoints].filter((p, i, a) => a.indexOf(p) === i && p >= draft.minimumPoints && p <= draft.maximumPoints).sort((a, b) => a - b);
  const runPreview = async () => {
    setPreviewBusy(true); setError('');
    try { setPreview(await previewPolicy('redemption', draft)); } catch (e) { setError(errorMessage(e, 'Preview failed.')); } finally { setPreviewBusy(false); }
  };
  const save = async () => {
    const reason = await askReason('Save new redemption rates?', <p>New quotes use version {active.version + 1}. Unused quotes under v{active.version} must be re-confirmed; accepted requests keep their value.</p>);
    if (reason === null) return;
    if (reason.length < 10) { setError('Give a reason of at least 10 characters. Nothing was saved.'); return; }
    setBusy(true); setError('');
    try { const r = await savePolicy('redemption', draft, reason, active.id); await onSaved(`Redemption rates v${r.version} saved.`); }
    catch (e) { setError(errorMessage(e, 'The rates could not be saved. Nothing was changed.')); } finally { setBusy(false); }
  };
  let start = 0;
  return (
    <div className="ad-desk">
      <section className="ad-card-box" aria-labelledby="rates-title">
        <div className="ad-card-box__head"><div><h2 id="rates-title">Redemption rates</h2><p className="ts-muted">Active v{active.version} · {dateOnly(active.createdAt)}</p></div>{active.basis === 'proposed-default' ? <Badge tone="info">Proposed defaults</Badge> : <Badge tone="success" dot>Finance-set</Badge>}</div>
        <div className="ad-card-box__body ts-stack">
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="fin-row">
            <Field label="Base points"><input className="ts-input" inputMode="numeric" value={draft.basePoints} onChange={(e) => set({ basePoints: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
            <Field label="= base value (GH₵)"><input className="ts-input" inputMode="decimal" defaultValue={cedisText(draft.baseAmountMinor)} onChange={(e) => set({ baseAmountMinor: pesewas(e.target.value) })} /></Field>
          </div>
          <div>
            <p className="ts-label">Bonus bands inside one redemption (marginal)</p>
            <div className="ad-table-scroll"><table className="ad-table ad-table--static fin-bands">
              <thead><tr><th scope="col">Points in this redemption</th><th scope="col">Up to</th><th scope="col">Bonus %</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{draft.bands.map((band, index) => {
                const from = start + 1; start = band.upToPoints ?? start; const last = index === draft.bands.length - 1;
                return (
                  <tr key={index}>
                    <td>{band.upToPoints ? `${from.toLocaleString('en-GB')}–${band.upToPoints.toLocaleString('en-GB')}` : `Above ${(from - 1).toLocaleString('en-GB')}`}</td>
                    <td>{last ? <span className="ts-muted">no limit</span> : <input className="ts-input fin-num" inputMode="numeric" aria-label={`Band ${index + 1} end`} value={band.upToPoints ?? ''}
                      onChange={(e) => set({ bands: draft.bands.map((b, i) => i === index ? { ...b, upToPoints: Number(e.target.value.replace(/\D/g, '')) } : b) })} />}</td>
                    <td><input className="ts-input fin-num" inputMode="decimal" aria-label={`Band ${index + 1} bonus percent`} defaultValue={band.bonusBps / 100}
                      onChange={(e) => set({ bands: draft.bands.map((b, i) => i === index ? { ...b, bonusBps: Math.round(Number(e.target.value) * 100) } : b) })} /></td>
                    <td>{draft.bands.length > 1 && !last ? <IconButton icon="trash" label={`Remove band ${index + 1}`} size="sm" variant="ghost" onClick={() => set({ bands: draft.bands.filter((_, i) => i !== index) })} /> : null}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            {draft.bands.length < 8 ? <Button size="sm" variant="ghost" icon="plus" onClick={() => { const bands = [...draft.bands]; const last = bands.pop()!; const prev = bands.at(-1)?.upToPoints ?? 0; set({ bands: [...bands, { upToPoints: prev + 300, bonusBps: last.bonusBps }, last] }); }}>Add band</Button> : null}
          </div>
          <div className="fin-row">
            <Field label="Minimum points" hint="Must cover the first band so splitting can never pay more."><input className="ts-input" inputMode="numeric" value={draft.minimumPoints} onChange={(e) => set({ minimumPoints: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
            <Field label="Maximum points per request"><input className="ts-input" inputMode="numeric" value={draft.maximumPoints} onChange={(e) => set({ maximumPoints: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
            <Field label="Quote valid for (minutes)"><input className="ts-input" inputMode="numeric" value={Math.round(draft.quoteTtlSeconds / 60)} onChange={(e) => set({ quoteTtlSeconds: Number(e.target.value.replace(/\D/g, '')) * 60 })} /></Field>
            <Field label="Monthly budget (GH₵)" optional hint="Requests beyond it are refused until next month."><input className="ts-input" inputMode="decimal" defaultValue={draft.monthlyBudgetMinor === null ? '' : cedisText(draft.monthlyBudgetMinor)} onChange={(e) => set({ monthlyBudgetMinor: e.target.value.trim() ? pesewas(e.target.value) : null })} /></Field>
          </div>
          <fieldset className="fin-fieldset">
            <legend className="ts-label">Airtime (manual top-up by Finance)</legend>
            <label className="ts-check"><input type="checkbox" checked={draft.airtime.enabled} onChange={(e) => set({ airtime: { ...draft.airtime, enabled: e.target.checked } })} /><span>Offer airtime</span></label>
            <div className="ts-cluster">{NETWORKS.map((n) => <label key={n} className="ts-check"><input type="checkbox" checked={draft.airtime.networks.includes(n)}
              onChange={(e) => set({ airtime: { ...draft.airtime, networks: e.target.checked ? [...draft.airtime.networks, n] : draft.airtime.networks.filter((x) => x !== n) } })} /><span>{n}</span></label>)}</div>
          </fieldset>
          <fieldset className="fin-fieldset">
            <legend className="ts-label">Data bundles (only real bundles you can buy)</legend>
            {draft.dataBundles.length ? draft.dataBundles.map((b, index) => (
              <div key={index} className="fin-bundle">
                <input className="ts-input" aria-label="Bundle id" placeholder="id e.g. mtn-1gb" value={b.id} onChange={(e) => set({ dataBundles: draft.dataBundles.map((x, i) => i === index ? { ...x, id: e.target.value.toLowerCase() } : x) })} />
                <select className="ts-select" aria-label="Network" value={b.network} onChange={(e) => set({ dataBundles: draft.dataBundles.map((x, i) => i === index ? { ...x, network: e.target.value as typeof b.network } : x) })}>{NETWORKS.map((n) => <option key={n}>{n}</option>)}</select>
                <input className="ts-input" aria-label="Provider's bundle name" placeholder="Name as the provider lists it" value={b.label} onChange={(e) => set({ dataBundles: draft.dataBundles.map((x, i) => i === index ? { ...x, label: e.target.value } : x) })} />
                <input className="ts-input fin-num" aria-label="Price in GH₵" inputMode="decimal" defaultValue={cedisText(b.priceMinor)} onChange={(e) => set({ dataBundles: draft.dataBundles.map((x, i) => i === index ? { ...x, priceMinor: pesewas(e.target.value) } : x) })} />
                <IconButton icon="trash" label="Remove bundle" size="sm" variant="ghost" onClick={() => set({ dataBundles: draft.dataBundles.filter((_, i) => i !== index) })} />
              </div>
            )) : <p className="ts-hint">No bundles: contributors see that mobile data is not offered yet.</p>}
            <Button size="sm" variant="ghost" icon="plus" onClick={() => set({ dataBundles: [...draft.dataBundles, { id: '', network: 'MTN', label: '', priceMinor: 500 }] })}>Add bundle</Button>
          </fieldset>
          <SaveBar dirty={dirty} canEdit={overview.canEdit} busy={busy} problem={problem} onSave={() => void save()} onReset={() => { setDraft(structuredClone(active.config)); setPreview(null); }} onPreview={() => void runPreview()} previewBusy={previewBusy} />
        </div>
      </section>
      <aside className="ad-detail" aria-labelledby="rates-effect">
        <h2 id="rates-effect">Example quotes</h2>
        {!problem ? (
          <div className="ad-table-scroll"><table className="ad-table ad-table--static">
            <thead><tr><th scope="col">Points</th><th scope="col">Base</th><th scope="col">Total</th></tr></thead>
            <tbody>{examples.map((p) => { const q = quotePoints(p, draft); return <tr key={p}><td className="ad-table__num">{p.toLocaleString('en-GB')}</td><td className="ad-table__num">{formatGhs(q.baseMinor)}</td><td className="ad-table__num"><strong>{formatGhs(q.totalMinor)}</strong><small className="fin-sub">+{formatGhs(q.bonusMinor)} bonus</small></td></tr>; })}</tbody>
          </table></div>
        ) : <p className="ts-muted">Fix the rates to see quotes.</p>}
        <p className="ts-hint">Each band’s value is calculated separately, summed and rounded once to the pesewa. The bands restart with each redemption. Saving is refused if any split could pay more than one combined request.</p>
        {preview ? (
          <div className="ad-detail__section">
            <h3>Impact on today’s balances</h3>
            <dl className="ad-facts">
              <Fact label="Upper liability now">{formatGhs(preview.liability.current.upperMinor)}</Fact>
              <Fact label="Upper liability with this version">{formatGhs(preview.liability.proposed.upperMinor)}</Fact>
              <Fact label="Change">{formatGhs(preview.liability.proposed.upperMinor - preview.liability.current.upperMinor)}</Fact>
            </dl>
            {preview.bundles?.length ? <ul className="ts-list">{preview.bundles.map((b: Record<string, any>) => <li key={b.id}>{b.label}: {b.points} pts ({formatGhs(b.valueMinor)}, {formatGhs(b.residualMinor)} not paid out)</li>)}</ul> : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function AwardPolicyEditor({ overview, onSaved }: { overview: PolicyOverview; onSaved: (message: string) => Promise<void> }) {
  const active = overview.award;
  const [draft, setDraft] = useState<AwardPolicyConfig>(() => structuredClone(active.config));
  const [preview, setPreview] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false), [previewBusy, setPreviewBusy] = useState(false), [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(active.config);
  useLeaveGuard(dirty, 'Your award policy changes are not saved. Leave without saving?');
  let problem = '';
  try { parseAwardPolicy(draft); } catch (e) { problem = e instanceof PolicyError ? e.message : 'Check the values.'; }
  type Category = (typeof REWARD_CATEGORIES)[number];
  const setCategory = (key: Category, patch: Partial<AwardPolicyConfig['categories'][Category]>) => { setDraft({ ...draft, categories: { ...draft.categories, [key]: { ...draft.categories[key], ...patch } } }); setPreview(null); };
  const num = (value: string) => Number(value.replace(/\D/g, ''));
  const save = async () => {
    const reason = await askReason('Save a new award policy?', <p>Applies to validator decisions from now on. Settled awards are not recalculated; an authorised change is a ledger adjustment.</p>);
    if (reason === null) return;
    if (reason.length < 10) { setError('Give a reason of at least 10 characters. Nothing was saved.'); return; }
    setBusy(true); setError('');
    try { const r = await savePolicy('award', draft, reason, active.id); await onSaved(`Award policy v${r.version} saved.`); }
    catch (e) { setError(errorMessage(e, 'The policy could not be saved. Nothing was changed.')); } finally { setBusy(false); }
  };
  return (
    <div className="ad-desk">
      <section className="ad-card-box" aria-labelledby="award-title">
        <div className="ad-card-box__head"><div><h2 id="award-title">Contribution reward policy</h2><p className="ts-muted">Category points × verified quality multiplier · active v{active.version}</p></div>{active.basis === 'proposed-default' ? <Badge tone="info">Proposed defaults</Badge> : <Badge tone="success" dot>Finance-set</Badge>}</div>
        <div className="ad-card-box__body ts-stack">
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="ad-table-scroll"><table className="ad-table ad-table--static fin-award">
            <thead><tr><th scope="col">Category</th><th scope="col">Rewarded</th><th scope="col">Base</th><th scope="col">Min</th><th scope="col">Max</th>{DIMENSIONS.map((d) => <th key={d} scope="col" title={DIMENSION_LABELS[d]}>{d} wt</th>)}</tr></thead>
            <tbody>{REWARD_CATEGORIES.map((key) => { const c = draft.categories[key]; return (
              <tr key={key}>
                <td><strong>{c.label}</strong>{c.effortUnit ? <small className="ts-muted"> · +{c.effortUnit.pointsPerUnit}/{c.effortUnit.unitSize}{c.effortUnit.kind === 'verifiedAlignedAudioSeconds' ? 's' : ' seg'} verified, max {c.effortUnit.maxUnits}</small> : null}</td>
                <td><input type="checkbox" aria-label={`Reward ${c.label}`} checked={c.enabled} onChange={(e) => setCategory(key, { enabled: e.target.checked })} /></td>
                <td><input className="ts-input fin-num" aria-label={`${c.label} base points`} value={c.basePoints} onChange={(e) => setCategory(key, { basePoints: num(e.target.value) })} /></td>
                <td><input className="ts-input fin-num" aria-label={`${c.label} minimum`} value={c.minPoints} onChange={(e) => setCategory(key, { minPoints: num(e.target.value) })} /></td>
                <td><input className="ts-input fin-num" aria-label={`${c.label} maximum`} value={c.maxPoints} onChange={(e) => setCategory(key, { maxPoints: num(e.target.value) })} /></td>
                {DIMENSIONS.map((d) => <td key={d}><input className="ts-input fin-num" aria-label={`${c.label} ${d} weight`} value={c.weights[d]} onChange={(e) => setCategory(key, { weights: { ...c.weights, [d]: num(e.target.value) } })} /></td>)}
              </tr>
            ); })}</tbody>
          </table></div>
          <p className="ts-hint">Weights are relative; 0 marks a dimension not applicable and the rest are renormalised. Accuracy always applies. Consent and training permission are eligibility gates, never weights. Only expressions are collected through the portal today.</p>
          <div className="fin-row">{draft.bands.map((band, index) => (
            <fieldset key={band.id} className="fin-fieldset fin-band">
              <legend className="ts-label">{band.label}</legend>
              <Field label="From score"><input className="ts-input" inputMode="numeric" value={band.minScore} onChange={(e) => { setDraft({ ...draft, bands: draft.bands.map((b, i) => i === index ? { ...b, minScore: num(e.target.value) } : b) }); setPreview(null); }} /></Field>
              <Field label="Multiplier ×"><input className="ts-input" inputMode="decimal" defaultValue={(band.multiplierBps / 10000).toFixed(2)} onChange={(e) => { setDraft({ ...draft, bands: draft.bands.map((b, i) => i === index ? { ...b, multiplierBps: Math.round(Number(e.target.value) * 10000) } : b) }); setPreview(null); }} /></Field>
            </fieldset>
          ))}</div>
          <p className="ts-hint"><Icon name="lock" /> Validator confirmation is required for every language judgment, and automatic settlement stays off until a reviewer-labelled shadow calibration is recorded.</p>
          <SaveBar dirty={dirty} canEdit={overview.canEdit} busy={busy} problem={problem} onSave={() => void save()} onReset={() => { setDraft(structuredClone(active.config)); setPreview(null); }}
            onPreview={() => { setPreviewBusy(true); setError(''); previewPolicy('award', draft).then(setPreview, (e) => setError(errorMessage(e, 'Preview failed.'))).finally(() => setPreviewBusy(false)); }} previewBusy={previewBusy} />
        </div>
      </section>
      <aside className="ad-detail" aria-labelledby="award-effect">
        <h2 id="award-effect">What each band pays</h2>
        {!problem ? (
          <div className="ad-table-scroll"><table className="ad-table ad-table--static">
            <thead><tr><th scope="col">Category</th>{draft.bands.map((b) => <th key={b.id} scope="col">{b.label}</th>)}</tr></thead>
            <tbody>{REWARD_CATEGORIES.filter((k) => draft.categories[k].enabled).map((k) => <tr key={k}><td>{draft.categories[k].label}</td>{draft.bands.map((b) => <td key={b.id} className="ad-table__num">{computeAward(draft, k, { accuracy: b.minScore, completeness: b.minScore, technical: b.minScore, metadata: b.minScore }).points}</td>)}</tr>)}</tbody>
          </table></div>
        ) : <p className="ts-muted">Fix the policy to see awards.</p>}
        <p className="ts-hint">Example: {(() => { try { return computeAward(draft, 'expressions', { accuracy: draft.bands[1]?.minScore ?? 80, completeness: draft.bands[1]?.minScore ?? 80, technical: draft.bands[1]?.minScore ?? 80, metadata: draft.bands[1]?.minScore ?? 80 }).calculation; } catch { return '—'; } })()}</p>
        {preview ? (
          <div className="ad-detail__section"><h3>Impact on open assessments</h3>
            <dl className="ad-facts"><Fact label="Open assessments">{preview.pending.assessments} ({preview.pending.scored} scored)</Fact>
              <Fact label="Points under current policy">{preview.pending.currentPoints.toLocaleString('en-GB')}</Fact>
              <Fact label="Points under this version">{preview.pending.proposedPoints.toLocaleString('en-GB')}</Fact></dl>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function RolloutPanel({ overview, onSaved }: { overview: PolicyOverview; onSaved: (message: string) => Promise<void> }) {
  const [flags, setFlags] = useState<Flags>(overview.flags);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dirty = JSON.stringify(flags) !== JSON.stringify(overview.flags);
  const save = async () => {
    const switching = flags.awardMode !== overview.flags.awardMode;
    let reason = '';
    const ok = await confirmAction({
      title: 'Change the reward system?',
      body: <>{switching ? <p>{flags.awardMode === 'assessed' ? 'Publication approval stops paying flat points. Validator-confirmed assessments settle now and from here on. Contributions already paid under the flat rule are never paid again.' : 'Approval pays the previous flat amount again; validator confirmations are recorded but not settled.'}</p> : null}
        <label className="ts-field"><span className="ts-label">Reason (required)</span><textarea className="ts-textarea" rows={3} onChange={(e) => { reason = e.target.value; }} /></label></>,
      confirmLabel: 'Apply',
    });
    if (!ok) return;
    if (reason.trim().length < 10) { setError('Give a reason of at least 10 characters. Nothing was changed.'); return; }
    setBusy(true); setError('');
    try {
      const result = await saveFlags(flags, reason.trim());
      await onSaved(result.settledOnSwitch ? `Saved. ${result.settledOnSwitch.settled} confirmed awards settled.` : 'Saved.');
    } catch (e) { setError(errorMessage(e, 'Nothing was changed.')); } finally { setBusy(false); }
  };
  const c = overview.calibration;
  return (
    <section className="ad-card-box" aria-labelledby="rollout-title">
      <div className="ad-card-box__head"><h2 id="rollout-title">Rollout switches</h2></div>
      <div className="ad-card-box__body ts-stack">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="How contributions earn" hint="Exactly one rule pays at a time; both refuse a contribution the other already paid.">
          <select className="ts-select" value={flags.awardMode} disabled={!overview.canEdit} onChange={(e) => setFlags({ ...flags, awardMode: e.target.value as Flags['awardMode'] })}>
            <option value="legacy-flat">Previous flat rule (paid on publication approval)</option><option value="assessed">Assessed by validators (category × quality)</option>
          </select>
        </Field>
        <Field label="Python assessment worker" hint="Proposes checks and a band for validators; it never settles points.">
          <select className="ts-select" value={flags.assessmentWorker} disabled={!overview.canEdit} onChange={(e) => setFlags({ ...flags, assessmentWorker: e.target.value as Flags['assessmentWorker'] })}>
            <option value="off">Off — validators assess directly</option><option value="on">On — queue a job for each revision</option>
          </select>
        </Field>
        <label className="ts-check ts-check--card"><input type="checkbox" checked={flags.redemptionsOpen} disabled={!overview.canEdit} onChange={(e) => setFlags({ ...flags, redemptionsOpen: e.target.checked })} />
          <span className="ts-check__copy"><strong>Accept new redemption requests</strong><small>Turning this off pauses new requests only; open requests still drain.</small></span></label>
        <div className="ad-summary-line"><Icon name="lock" /><span><strong>Automatic settlement: off.</strong> {c.note} So far {c.agreed ?? '—'} assessments agreed with the validator’s band and {c.disagreed ?? '—'} did not.</span></div>
        <div className="ad-detail__actions"><Button variant="primary" busy={busy} disabled={!dirty || !overview.canEdit} onClick={() => void save()}>Apply changes</Button><Button variant="ghost" disabled={!dirty} onClick={() => setFlags(overview.flags)}>Discard</Button></div>
      </div>
    </section>
  );
}

function VersionsPanel({ overview }: { overview: PolicyOverview }) {
  return (
    <section className="ad-card-box" aria-labelledby="versions-title">
      <div className="ad-card-box__head"><h2 id="versions-title">Saved versions</h2></div>
      {overview.history.length ? (
        <div className="ad-table-scroll"><table className="ad-table ad-table--static">
          <thead><tr><th scope="col">Policy</th><th scope="col">Version</th><th scope="col">Saved</th><th scope="col">By</th><th scope="col">Reason</th></tr></thead>
          <tbody>{overview.history.map((row) => <tr key={row.id}><td>{row.kind === 'award' ? 'Contribution awards' : 'Redemption rates'}{row.id === overview.award.id || row.id === overview.redemption.id ? <> <Badge tone="success" dot>Active</Badge></> : null}</td>
            <td className="ad-table__num">v{row.version}</td><td>{dateTime(row.createdAt)}</td><td><code>{row.createdBy.slice(0, 10)}</code></td><td className="ts-muted">{row.reason}</td></tr>)}</tbody>
        </table></div>
      ) : <EmptyState compact icon="archive" title="Still on the proposed defaults" body="The first saved version appears here with who saved it and why." />}
    </section>
  );
}

/* -- Points ledger ------------------------------------------------------------------------ */

export function PointsLedger() {
  const { params, setParams } = useRouter();
  const { access } = useSession();
  const { people, personFor } = usePeople();
  const contributor = params.get('contributor') ?? '';
  const [state, setState] = useState<LoadState<ContributorLedger> | null>(null);
  const [toast, setToast] = useState('');
  const load = useCallback(async () => {
    if (!contributor) { setState(null); return; }
    setState({ state: 'loading' });
    try { setState({ state: 'ready', data: await loadLedger(contributor) }); } catch (e) { setState(asFailure(e, 'The ledger could not be loaded.')); }
  }, [contributor]);
  useEffect(() => { void load(); }, [load]);
  const data = state?.state === 'ready' ? state.data : null;
  const person = contributor ? personFor(contributor) : null;
  return (
    <div className="ad-page">
      <PageHeader title="Points ledger" description="Every points movement, append-only. Corrections are new, reasoned entries — nothing is edited or deleted." />
      <section className="ad-card-box"><div className="ad-card-box__body ad-toolbar">
        <Select label="Contributor" value={contributor} onChange={(value) => setParams({ contributor: value || null })}
          options={[{ value: '', label: people ? 'Choose a contributor' : 'Loading contributors…' }, ...(people ?? []).filter((p) => p.authUid).map((p) => ({ value: p.authUid as string, label: p.displayName || p.email || p.id }))]} />
      </div></section>
      {state ? <Gate state={state} label="the ledger" onRetry={() => void load()} denied="The ledger needs an admin role." /> : <EmptyState boxed icon="list" title="Choose a contributor" body="Their balance, every ledger entry, assessments needing Finance attention and their requests appear here." />}
      {data ? (
        <>
          <div className="ad-tiles">
            <Tile icon="wallet" label="Available" value={data.account.available.toLocaleString('en-GB')} hint={data.account.ledgerOpen ? 'From the ledger' : 'Not opened yet (legacy balance)'} />
            <Tile icon="lock" label="Reserved" value={data.account.reserved.toLocaleString('en-GB')} hint="Open redemption requests" />
            <Tile icon="award" label="Earned in total" value={data.account.lifetimeEarned.toLocaleString('en-GB')} hint={`${data.account.lifetimeRedeemed.toLocaleString('en-GB')} redeemed through the ledger`} />
          </div>
          {data.assessments.filter((a) => a.financeAttention).map((a) => <Notice key={a.id} tone="warning" title={`Finance attention: ${a.title || a.id}`}>{a.financeAttention}</Notice>)}
          <div className="ad-desk">
            <section className="ad-card-box" aria-labelledby="entries-title">
              <div className="ad-card-box__head"><div><h2 id="entries-title">Entries</h2><p className="ts-muted">{person?.displayName ?? contributor} · newest first</p></div></div>
              {data.entries.length ? (
                <div className="ad-table-scroll"><table className="ad-table ad-table--static">
                  <thead><tr><th scope="col">#</th><th scope="col">Type</th><th scope="col">Available</th><th scope="col">Reserved</th><th scope="col">Balance after</th><th scope="col">Reason</th><th scope="col">When</th></tr></thead>
                  <tbody>{data.entries.map((e) => <tr key={e.id}>
                    <td className="ad-table__num">{e.sequence}</td><td>{ENTRY_LABEL[e.type] ?? e.type}<small className="ts-muted"> · {e.actor.kind}</small></td>
                    <td className="ad-table__num">{e.availableDelta > 0 ? '+' : ''}{e.availableDelta.toLocaleString('en-GB')}</td>
                    <td className="ad-table__num">{e.reservedDelta > 0 ? '+' : ''}{e.reservedDelta.toLocaleString('en-GB')}</td>
                    <td className="ad-table__num">{e.after.available.toLocaleString('en-GB')}</td>
                    <td className="ts-muted">{e.reason}{e.refs?.discrepancy ? <><br /><Badge tone="warning">Opening discrepancy</Badge> {String(e.refs.discrepancy)}</> : null}</td>
                    <td>{dateTime(e.createdAt)}</td>
                  </tr>)}</tbody>
                </table></div>
              ) : <EmptyState compact icon="list" title="No ledger entries yet" body={`The account opens from the previous balance (${data.legacy.rewardBalance ?? 0} points) on first use or when the migration runs.`} />}
            </section>
            <AdjustmentForm contributorId={contributor} canAdjust={hasFinanceAccess(access)} onDone={async (m) => { setToast(m); await load(); }} />
          </div>
        </>
      ) : null}
      {toast ? <Toast message={toast} onDone={() => setToast('')} /> : null}
    </div>
  );
}

function AdjustmentForm({ contributorId, canAdjust, onDone }: { contributorId: string; canAdjust: boolean; onDone: (message: string) => Promise<void> }) {
  const [points, setPoints] = useState(''), [direction, setDirection] = useState<'add' | 'remove'>('add'), [reason, setReason] = useState(''), [assessmentId, setAssessmentId] = useState('');
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const amount = Number(points);
  const problem = !Number.isSafeInteger(amount) || amount <= 0 ? 'Enter a whole number of points.' : reason.trim().length < 10 ? 'Give a reason of at least 10 characters.' : '';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem || busy) return;
    const signed = direction === 'add' ? amount : -amount;
    if (!(await confirmAction({ title: `${direction === 'add' ? 'Add' : 'Remove'} ${formatPoints(amount)}?`, body: <p>This appends an adjustment entry with your reason. It cannot be edited or deleted; a mistake is corrected with another adjustment.</p>, confirmLabel: 'Record adjustment' }))) return;
    setBusy(true); setError('');
    try {
      await adjustPoints({ contributorId, points: signed, reason: reason.trim(), idempotencyKey: key, assessmentId: assessmentId.trim() || undefined });
      setPoints(''); setReason(''); setAssessmentId(''); setKey(newKey());
      await onDone('Adjustment recorded.');
    } catch (e) { setError(errorMessage(e, 'The adjustment could not be recorded. Nothing was changed.')); } finally { setBusy(false); }
  };
  return (
    <aside className="ad-detail" aria-labelledby="adjust-title">
      <h2 id="adjust-title">Reasoned adjustment</h2>
      {!canAdjust ? <p className="ts-muted">Adjustments need the finance permission.</p> : (
        <form className="ts-stack" onSubmit={(e) => void submit(e)} noValidate>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Segmented<'add' | 'remove'> label="Direction" value={direction} onChange={setDirection} options={[{ value: 'add', label: 'Add' }, { value: 'remove', label: 'Remove' }]} />
          <Field label="Points"><input className="ts-input" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Assessment ID" optional hint="Link the contribution this corrects, if any."><input className="ts-input ts-input--mono" value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} /></Field>
          <Field label="Reason" required counter={`${reason.length} / 1,000`}><textarea className="ts-textarea" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <p className="ts-hint">Linguistic award changes belong to validators on the Rewards desk. Use this for corrections Finance owns, such as a late provider success after a refund.</p>
          <Button type="submit" variant="primary" busy={busy} disabled={Boolean(problem)}>Record adjustment</Button>
        </form>
      )}
    </aside>
  );
}

/* -- Audit history ------------------------------------------------------------------------ */

export function RewardAudit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [state, setState] = useState<LoadState<true>>({ state: 'loading' });
  const [more, setMore] = useState(false);
  const load = useCallback(async (before?: string) => {
    try {
      const page = await loadAudit(before);
      setRows((prev) => before ? [...(prev ?? []), ...page] : page);
      setMore(page.length === 100);
      setState({ state: 'ready', data: true });
    } catch (e) { setState(asFailure(e, 'Audit history could not be loaded.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="ad-page">
      <PageHeader title="Audit history" description="Policy versions, rollout switches, validator decisions, redemption decisions and ledger adjustments." />
      <Gate state={state} label="audit history" onRetry={() => void load()} denied="Audit history needs an admin role." />
      {rows ? (
        <section className="ad-card-box">
          {rows.length ? (
            <div className="ad-table-scroll"><table className="ad-table ad-table--static">
              <thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">By</th><th scope="col">Target</th><th scope="col">Reason</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}><td>{dateTime(r.occurredAt)}</td><td><code>{r.action.replace(/^contributor\./, '')}</code></td><td><code>{r.actor?.id?.slice(0, 10)}</code></td>
                <td><code>{r.target?.collection}/{r.target?.id?.slice(0, 12)}</code></td><td className="ts-muted">{r.reason}</td></tr>)}</tbody>
            </table></div>
          ) : <EmptyState compact icon="archive" title="No reward changes recorded yet" />}
          {more ? <div className="ad-card-box__body"><Button size="sm" onClick={() => void load(rows.at(-1)?.occurredAt)}>Load older</Button></div> : null}
        </section>
      ) : null}
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
  useEffect(() => { void load(); fetchContributorDirectory().then(setPeople, () => undefined); }, [load]);
  return (
    <div className="ad-page">
      <PageHeader title="Payout records" description="Contributor payout verification and payment requests. Finance permission only." />
      <Gate state={payments} label="payout records" onRetry={() => void load()} denied="Payout records need the finance permission on an admin account. A super administrator can grant it." />
      {payments.state === 'ready' ? <ContributorPaymentsDesk payments={payments.data} contributors={people} loading={false} canReview onReload={load} onNotice={setToast} /> : null}
      {toast ? <Toast message={toast} tone="info" onDone={() => setToast('')} /> : null}
    </div>
  );
}
