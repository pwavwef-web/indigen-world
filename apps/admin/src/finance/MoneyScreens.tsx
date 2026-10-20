import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { queuesChanged } from '../attention';
import { Link, useRouter } from '../router';
import { useSession } from '../session';
import { askText, confirmAction } from '../ui/dialogs';
import { Icon, type IconName } from '../ui/icons';
import {
  Badge, Button, ButtonLink, Dialog, EmptyState, Field, LoadFailure, Notice, PageHeader, PermissionState, ProgressBar, SearchField, Segmented, Select, Skeleton, Toast, cx,
} from '../ui/primitives';
import { BalanceChart, BarList, InOut, MonthlyChart } from './charts';
import {
  ACCOUNT_TYPES, CURRENCIES, CURRENCY_DIGITS, FREQUENCY_LABEL, PLATFORM_LABEL, SOURCE_KINDS, STATUS_META, TYPE_OPTIONS, accountTypeLabel, base64Bytes, day, download,
  errorText, fileSize, finance, ghs, isDenied, money, openAttachment, parseMoney, pct, toInput, uploadReceipt, when,
  type AuditRow, type Config, type FundingSource, type LedgerPage, type Overview, type PlatformKey, type Recurring, type Txn, type TxnStatus, type TxnType,
} from './money';
import { Amount, StatusBadge, TransactionDetail, TransactionForm, actionLabel, changeText, type TxnPrefill } from './TransactionPanels';
import './money.css';

/* ==========================================================================
   Finance: Indigen World's project money.

   How much came in, from whom, what was spent and on what, who recorded and
   approved it, and what remains — every figure computed on the server from
   posted ledger entries. Drafts, pending approvals and unpaid commitments
   are shown as such and never mixed into the balance.
   ========================================================================== */

type Load<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'denied'; message: string } | { state: 'error'; message: string };

function useLoad<T>(loader: () => Promise<T>, deps: unknown[]): [Load<T>, () => Promise<void>, (data: T) => void] {
  const [state, setState] = useState<Load<T>>({ state: 'loading' });
  const run = useCallback(async () => {
    try { setState({ state: 'ready', data: await loader() }); }
    catch (error) { setState(isDenied(error) ? { state: 'denied', message: errorText(error) } : { state: 'error', message: errorText(error) }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void run(); }, [run]);
  return [state, run, (data: T) => setState({ state: 'ready', data })];
}

const useConfig = () => useLoad(() => finance<Config>('config'), []);

function Gate<T>({ state, label, onRetry }: { state: Load<T>; label: string; onRetry: () => void }) {
  if (state.state === 'loading') return <div className="ad-card-box ad-card-box__body fm-pad"><Skeleton title lines={5} label={`Loading ${label}`} /></div>;
  if (state.state === 'denied') return <PermissionState body="Project finance needs a finance role (viewer, editor or finance administrator). A finance administrator can grant it under Finance settings." />;
  if (state.state === 'error') return <LoadFailure title={`${label[0].toUpperCase()}${label.slice(1)} could not be loaded`} body={state.message} onRetry={onRetry} compact={false} />;
  return null;
}

function Card({ title, sub, actions, children, className, id }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={cx('ad-card-box fm-card', className)} aria-labelledby={id}>
      <div className="ad-card-box__head"><div><h2 id={id}>{title}</h2>{sub ? <p className="ts-muted">{sub}</p> : null}</div>{actions ? <div className="fm-card__actions">{actions}</div> : null}</div>
      <div className="fm-card__body">{children}</div>
    </section>
  );
}

function Kpi({ icon, tone, label, value, hint, help }: { icon: IconName; tone: 'in' | 'out' | 'balance' | 'neutral'; label: string; value: ReactNode; hint: ReactNode; help?: string }) {
  return (
    <div className={`fm-kpi fm-kpi--${tone}`} title={help}>
      <span className="fm-kpi__icon" aria-hidden="true"><Icon name={icon} /></span>
      <div className="fm-kpi__copy">
        <span className="fm-kpi__label">{label}</span>
        <span className="fm-kpi__value">{value}</span>
        <span className="fm-kpi__hint">{hint}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'in' | 'out' | 'warn' }) {
  return <div className={cx('fm-stat', tone && `fm-stat--${tone}`)}><span className="fm-stat__label">{label}</span><span className="fm-stat__value">{value}</span>{hint ? <span className="fm-stat__hint">{hint}</span> : null}</div>;
}

/** Add-transaction and transaction-detail dialogs shared by every screen. */
function useTxnDialogs(config: Config | null, onChanged: () => void) {
  const [form, setForm] = useState<{ prefill?: TxnPrefill; existing?: Txn } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null);
  const changed = (message: string) => { setToast({ message, tone: 'success' }); onChanged(); queuesChanged(); };
  const node = config ? (
    <>
      {form ? <TransactionForm config={config} prefill={form.prefill} existing={form.existing} onClose={() => setForm(null)}
        onSaved={(message, id) => { setForm(null); changed(message); setOpenId(id); }} /> : null}
      {openId && !form ? <TransactionDetail key={openId} id={openId} config={config} onClose={() => setOpenId(null)} onChanged={changed}
        onEdit={(txn) => setForm({ existing: txn })} onOpen={setOpenId} /> : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </>
  ) : null;
  return { add: (prefill?: TxnPrefill) => setForm({ prefill }), open: setOpenId, node, notify: (message: string, tone: 'success' | 'danger' | 'info' = 'success') => setToast({ message, tone }) };
}

const RANGES = [
  { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: 'year', label: 'This year' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom' },
] as const;

function RangePicker({ value, from, to, onChange }: { value: string; from: string; to: string; onChange: (next: { range: string; from: string; to: string }) => void }) {
  return (
    <div className="fm-range">
      <Segmented label="Reporting period" value={value as typeof RANGES[number]['value']} onChange={(range) => onChange({ range, from, to })} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
      {value === 'custom' ? (
        <div className="fm-range__custom">
          <label><span className="sr-only">From</span><input className="ts-input" type="date" value={from} onChange={(e) => onChange({ range: 'custom', from: e.target.value, to })} /></label>
          <span aria-hidden="true">–</span>
          <label><span className="sr-only">To</span><input className="ts-input" type="date" value={to} onChange={(e) => onChange({ range: 'custom', from, to: e.target.value })} /></label>
        </div>
      ) : null}
    </div>
  );
}

function TxnTable({ rows, onOpen, showBalance = true, compact = false }: { rows: Txn[]; onOpen: (id: string) => void; showBalance?: boolean; compact?: boolean }) {
  return (
    <div className="ad-table-scroll">
      <table className={cx('ad-table fm-table', compact && 'fm-table--compact')}>
        <thead>
          <tr>
            <th scope="col">Date</th><th scope="col">Entry</th><th scope="col">Description</th>{compact ? null : <th scope="col">Category</th>}
            <th scope="col" className="ad-table__num">Amount</th>{showBalance ? <th scope="col" className="ad-table__num">Balance</th> : null}
            {compact ? null : <th scope="col">Recorded by</th>}<th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={cx(t.isReversal && 'fm-row--reversal', !['posted', 'reversed'].includes(t.status) && 'fm-row--off')}>
              <td className="fm-nowrap">{day(t.date)}</td>
              <td><button type="button" className="ts-link fm-mono" onClick={() => onOpen(t.id)}>{t.number}</button><small className="fm-sub">{t.typeLabel}</small></td>
              <td className="fm-desc"><span>{t.description}</span>{t.counterparty ? <small className="fm-sub">{t.counterparty}</small> : null}{t.source.kind === 'platform' ? <Badge tone="info">Platform</Badge> : null}{t.attachments.length ? <span title={`${t.attachments.length} document(s)`} className="fm-clip"><Icon name="doc" /></span> : null}</td>
              {compact ? null : <td><span className="fm-chip">{t.type === 'transfer' ? `${t.accountName} → ${t.toAccountName ?? '—'}` : t.categoryName}</span></td>}
              <td className="ad-table__num fm-nowrap">{t.type === 'transfer' ? <span className="fm-amt fm-amt--flat">{ghs(t.amountMinor)}</span> : <Amount minor={t.signedMinor} />}</td>
              {showBalance ? <td className="ad-table__num fm-nowrap">{t.runningBalanceMinor !== null ? ghs(t.runningBalanceMinor) : <span className="ts-muted" title="Not in the books">—</span>}</td> : null}
              {compact ? null : <td className="fm-nowrap">{t.recordedBy.name}</td>}
              <td><StatusBadge status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ==========================================================================
   Overview
   ========================================================================== */

export function MoneyOverview() {
  const { params, setParams } = useRouter();
  const range = params.get('range') ?? 'all';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const [config, reloadConfig] = useConfig();
  const [data, reload] = useLoad(() => finance<Overview>('overview', { range: range === 'custom' && !(from && to) ? 'all' : range, from, to }), [range, from, to]);
  const cfg = config.state === 'ready' ? config.data : null;
  const dialogs = useTxnDialogs(cfg, () => { void reload(); void reloadConfig(); });
  const o = data.state === 'ready' ? data.data : null;
  const canRecord = cfg && cfg.level !== 'viewer';

  return (
    <div className="ad-page fm-page">
      <PageHeader
        title="Finance"
        description="Every amount entering and leaving Indigen World: what came in, what was spent, and what remains."
        actions={<>
          <Button icon="refresh" onClick={() => { void reload(); void reloadConfig(); }} disabled={data.state === 'loading'}>Refresh</Button>
          {canRecord ? <Button variant="primary" icon="plus" onClick={() => dialogs.add()}>Add transaction</Button> : null}
        </>}
      />
      <Gate state={data} label="the finance overview" onRetry={() => void reload()} />
      {o ? (
        <>
          {o.workflow.pendingApproval ? (
            <Notice tone="warning" title={`${o.workflow.pendingApproval} ${o.workflow.pendingApproval === 1 ? 'entry is' : 'entries are'} waiting for approval`}
              action={<ButtonLink to="/finance/transactions?status=pending_approval" size="sm" variant="ghost" iconRight="arrow">Review</ButtonLink>}>
              They are not in the balance until a finance administrator approves them.{o.workflow.platformPending ? ` ${o.workflow.platformPending} came in automatically from platform payments.` : ''}
            </Notice>
          ) : null}

          <div className="fm-kpis ts-stagger">
            <Kpi icon="up" tone="in" label="Total funding received" value={ghs(o.lifetime.netIncomeMinor)} hint={`${o.lifetime.counts.income} ${o.lifetime.counts.income === 1 ? 'income entry' : 'income entries'}${o.lifetime.refundsOutMinor ? ` · net of ${ghs(o.lifetime.refundsOutMinor)} refunded` : ''}`} help="All posted income, all time, less refunds paid back." />
            <Kpi icon="down" tone="out" label="Total expenditure" value={ghs(o.lifetime.netExpenseMinor)} hint={`${o.lifetime.counts.expense} ${o.lifetime.counts.expense === 1 ? 'expense' : 'expenses'}${o.lifetime.refundsInMinor ? ` · net of ${ghs(o.lifetime.refundsInMinor)} refunds received` : ''}`} help="All posted expenses, all time, less refunds received." />
            <Kpi icon="wallet" tone="balance" label="Available project balance" value={ghs(o.lifetime.closingMinor)} hint={o.lifetime.adjustmentsMinor ? `Income − expenses ${o.lifetime.adjustmentsMinor > 0 ? '+' : '−'} ${ghs(Math.abs(o.lifetime.adjustmentsMinor))} opening/adjustments` : 'Income minus expenses'} help="Derived from posted ledger entries only." />
            <Kpi icon="list" tone="neutral" label="Total transactions" value={String(o.lifetime.counts.posted)} hint={`${o.lifetime.counts.income} income · ${o.lifetime.counts.expense} expense${o.lifetime.counts.transfer ? ` · ${o.lifetime.counts.transfer} transfer` : ''}${o.lifetime.counts.reversed ? ` · ${o.lifetime.counts.reversed} reversed` : ''}`} help="Posted entries in the books, all time. An entry cancelled by a reversal is counted as reversed, not here." />
          </div>

          <div className="fm-strip">
            <Stat label="This month in" value={ghs(o.month.netIncomeMinor)} tone="in" />
            <Stat label="This month out" value={ghs(o.month.netExpenseMinor)} tone="out" />
            <Stat label="Net this month" value={<Amount minor={o.month.netMovementMinor} />} />
            <Stat label="Share of funds spent" value={pct(o.spentShareBps)} hint="Expenditure ÷ money received" />
            <Stat label="Approved, not yet paid" value={ghs(o.commitments.internalApprovedMinor + o.commitments.redemptionsMinor + o.commitments.payoutsMinor)} hint={o.commitments.redemptionsMinor || o.commitments.payoutsMinor ? `incl. ${ghs(o.commitments.redemptionsMinor + o.commitments.payoutsMinor)} contributor rewards & payouts` : o.commitments.platformAvailable ? 'Committed, not spent' : 'Platform commitments unavailable'} tone="warn" />
            <Stat label="Reserved for renewals" value={ghs(o.commitments.upcomingRecurringMinor)} hint={`Due in ${cfg?.settings.upcomingWindowDays ?? 30} days`} />
            <Stat label="Available after commitments" value={<strong className={o.availableAfterCommitmentsMinor < 0 ? 'fm-amt--out' : ''}>{ghs(o.availableAfterCommitmentsMinor)}</strong>} hint="Balance − unpaid approvals − renewals due" />
          </div>

          <div className="fm-toolbar">
            <RangePicker value={range} from={from || o.range.from || o.today} to={to || o.today} onChange={(next) => setParams({ range: next.range === 'all' ? null : next.range, from: next.range === 'custom' ? next.from : null, to: next.range === 'custom' ? next.to : null })} />
            <span className="ts-muted fm-range__label">Charts below: <strong>{o.range.label}</strong>. Cards above are all-time.</span>
          </div>

          <div className="fm-grid-2">
            <Card id="fm-balance" title="Balance over time" sub={`Project balance after each posting · ${o.range.label}`}>
              {o.balanceSeries.length > 1 || o.lifetime.counts.posted ? <BalanceChart points={o.balanceSeries} label={`Project balance, ${o.range.label}`} /> : <EmptyState compact icon="chart" title="No balance history yet" body="Post the first income or opening balance to start the chart." />}
            </Card>
            <Card id="fm-inout" title="Income vs expenditure" sub={o.range.label}>
              <InOut incomeMinor={o.period.netIncomeMinor} expenseMinor={o.period.netExpenseMinor} label={`Money in and out, ${o.range.label}`} />
              <dl className="fm-mini">
                <div><dt>Opening</dt><dd>{ghs(o.period.openingMinor)}</dd></div>
                <div><dt>Adjustments</dt><dd>{ghs(o.period.adjustmentsMinor, { signed: true })}</dd></div>
                <div><dt>Closing</dt><dd><strong>{ghs(o.period.closingMinor)}</strong></dd></div>
              </dl>
            </Card>
          </div>

          <div className="fm-grid-2">
            <Card id="fm-cats" title="Spending by category" sub={o.range.label} actions={<ButtonLink to="/finance/expenses" size="sm" variant="ghost" iconRight="arrow">Expenses</ButtonLink>}>
              <BarList label="Spending by category" tone="out" rows={o.categories.map((c) => ({ id: c.categoryId, name: c.name, amountMinor: c.amountMinor, shareBps: c.shareBps, note: `${c.count} ${c.count === 1 ? 'payment' : 'payments'}` }))} empty="No spending recorded in this period." />
            </Card>
            <Card id="fm-sources" title="Funding sources" sub={`${o.range.label} · where the money came from`} actions={<ButtonLink to="/finance/funding" size="sm" variant="ghost" iconRight="arrow">Funders</ButtonLink>}>
              <BarList label="Funding by source" tone="in" rows={o.sources.filter((s) => s.totalMinor > 0).map((s) => ({ id: s.sourceId, name: s.name, amountMinor: s.totalMinor, shareBps: s.shareBps, note: `${s.contributions} ${s.contributions === 1 ? 'contribution' : 'contributions'}` }))} empty="No income linked to a funding source in this period." />
            </Card>
          </div>

          <Card id="fm-monthly" title="Monthly financial activity" sub="Money in above the line, money out below; the dash marks the net movement">
            {o.monthly.some((m) => m.incomeMinor || m.expenseMinor) ? <MonthlyChart months={o.monthly} /> : <EmptyState compact icon="chart" title="No posted activity in this period" />}
          </Card>

          <div className="fm-grid-4">
            <Card id="fm-insights" title="Financial insights" sub="Computed from the posted records — no estimates, no AI.">
              <ul className="fm-insights">{o.insights.map((i) => <li key={i.id} className={`fm-insight fm-insight--${i.tone}`}><Icon name={i.tone === 'danger' || i.tone === 'warning' ? 'alert' : i.tone === 'success' ? 'check-circle' : 'info'} /><span>{i.text}</span></li>)}</ul>
            </Card>
            <Card id="fm-upcoming" title="Upcoming expenses" sub="Scheduled — not spent until a payment is posted" actions={<ButtonLink to="/finance/expenses?tab=recurring" size="sm" variant="ghost" iconRight="arrow">Subscriptions</ButtonLink>}>
              {o.upcoming.length ? (
                <ul className="fm-due">
                  {o.upcoming.map((u) => (
                    <li key={u.id}><span><strong>{u.name}</strong><small className="fm-sub">{u.overdue ? `Overdue since ${day(u.dueDate)}` : u.daysAway === 0 ? 'Due today' : `Due ${day(u.dueDate)} · in ${u.daysAway} ${u.daysAway === 1 ? 'day' : 'days'}`}</small></span><span className={cx('fm-due__amt', u.overdue && 'fm-amt--out')}>{ghs(u.amountMinor)}</span></li>
                  ))}
                </ul>
              ) : <p className="fm-empty">Nothing due in the next {cfg?.settings.upcomingWindowDays ?? 30} days.</p>}
            </Card>
            <Card id="fm-budgets" title="Budgets" sub="Allocated, spent and committed" actions={<ButtonLink to="/finance/expenses?tab=budgets" size="sm" variant="ghost" iconRight="arrow">Budgets</ButtonLink>}>
              {o.budgets.length ? (
                <ul className="fm-budgets">{o.budgets.map((b) => <BudgetLine key={b.id} b={b} />)}</ul>
              ) : <p className="fm-empty">No budgets set. A finance administrator can add them under Expenses & budgets.</p>}
            </Card>
            <Card id="fm-accts" title="Accounts" sub="Where the money is held" actions={<ButtonLink to="/finance/accounts" size="sm" variant="ghost" iconRight="arrow">Accounts</ButtonLink>}>
              {o.accounts.length ? (
                <ul className="fm-accts">
                  {o.accounts.filter((a) => a.status === 'active' || a.balanceMinor !== 0).map((a) => <li key={a.id}><span><strong>{a.name}</strong><small className="fm-sub">{accountTypeLabel(a.type)}</small></span><span>{ghs(a.balanceMinor)}</span></li>)}
                  {o.unassignedMinor ? <li><span><strong>Unassigned</strong><small className="fm-sub">Older entries without an account</small></span><span>{ghs(o.unassignedMinor)}</span></li> : null}
                </ul>
              ) : <p className="fm-empty">No accounts yet. Add the bank, Mobile Money or cash accounts that hold project money.</p>}
            </Card>
          </div>

          <Card id="fm-recent" title="Recent transactions" sub="Latest posted entries" actions={<ButtonLink to="/finance/transactions" size="sm" variant="ghost" iconRight="arrow">Full ledger</ButtonLink>}>
              {o.recent.length ? <TxnTable rows={o.recent} onOpen={dialogs.open} /> : (
                <EmptyState compact icon="coins" title="No transactions yet" body="Record money received (for example a sponsor’s contribution) or an opening balance to begin."
                  actions={canRecord ? <Button variant="primary" icon="plus" onClick={() => dialogs.add()}>Add transaction</Button> : undefined} />
              )}
            </Card>
          <p className="ad-footnote"><Icon name="info" /><span>Figures come only from posted ledger entries, in Ghana cedis, dated in Africa/Accra time. Paystack advertising and shop payments, airtime redemptions and contributor payouts are logged automatically once the platform confirms them, and wait for approval unless auto-posting is set. Membership income from app stores is recorded by hand when the payout arrives. As of {when(o.asOf)}.</span></p>
        </>
      ) : null}
      {dialogs.node}
    </div>
  );
}

function BudgetLine({ b }: { b: Overview['budgets'][number] }) {
  return (
    <li className={`fm-budget fm-budget--${b.state}`}>
      <div className="fm-budget__head"><strong>{b.name}</strong><span>{ghs(b.actualMinor + b.committedMinor)} of {ghs(b.allocatedMinor)}</span></div>
      <ProgressBar small value={Math.min(b.utilisedBps, 10_000)} max={10_000} label={`${b.name}: ${pct(b.utilisedBps)} used`} />
      <div className="fm-budget__foot">
        <span>{pct(b.utilisedBps)} used{b.committedMinor ? ` · ${ghs(b.committedMinor)} committed` : ''}</span>
        <span className={b.remainingMinor < 0 ? 'fm-amt--out' : ''}>{b.remainingMinor < 0 ? `${ghs(-b.remainingMinor)} over` : `${ghs(b.remainingMinor)} left`}</span>
      </div>
      {b.state !== 'ok' ? <span className="fm-budget__flag"><Icon name="alert" />{b.state === 'over' ? 'Over allocation' : `Past the ${pct(b.alertAtBps)} alert`}</span> : null}
    </li>
  );
}

/* ==========================================================================
   Transactions: the ledger
   ========================================================================== */

const STATUS_TABS: { value: string; label: string; statuses: TxnStatus[] | 'books' | 'all' }[] = [
  { value: 'books', label: 'In the books', statuses: 'books' },
  { value: 'pending_approval', label: 'Pending', statuses: ['pending_approval'] },
  { value: 'approved', label: 'Approved · unpaid', statuses: ['approved'] },
  { value: 'draft', label: 'Drafts', statuses: ['draft'] },
  { value: 'rejected', label: 'Rejected', statuses: ['rejected', 'discarded'] },
  { value: 'all', label: 'All', statuses: 'all' },
];
const PAGE = 25;

export function TransactionsScreen() {
  const { params, setParams } = useRouter();
  const status = params.get('status') ?? 'books';
  const [q, setQ] = useState(params.get('q') ?? '');
  const filters = {
    type: params.get('type') ?? '', category: params.get('category') ?? '', source: params.get('source') ?? '', account: params.get('account') ?? '',
    from: params.get('from') ?? '', to: params.get('to') ?? '', sort: params.get('sort') ?? 'date', order: params.get('order') ?? 'desc', page: Number(params.get('page') ?? '0') || 0,
  };
  const [search, setSearch] = useState(q);
  useEffect(() => { const t = window.setTimeout(() => setSearch(q), 300); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => { setParams({ q: search || null, page: null }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search]);
  const [config, reloadConfig] = useConfig();
  const tab = STATUS_TABS.find((t) => t.value === status) ?? STATUS_TABS[0];
  const [page, reload] = useLoad(() => finance<LedgerPage>('ledger', {
    q: search, statuses: tab.statuses, types: filters.type ? [filters.type] : undefined, categoryId: filters.category || undefined, fundingSourceId: filters.source || undefined,
    accountId: filters.account || undefined, from: filters.from || undefined, to: filters.to || undefined, sort: filters.sort, order: filters.order, offset: filters.page * PAGE, limit: PAGE,
  }), [search, status, filters.type, filters.category, filters.source, filters.account, filters.from, filters.to, filters.sort, filters.order, filters.page]);
  const cfg = config.state === 'ready' ? config.data : null;
  const dialogs = useTxnDialogs(cfg, () => { void reload(); });
  const [exporting, setExporting] = useState<string | null>(null);
  const data = page.state === 'ready' ? page.data : null;
  const filtered = Boolean(search || filters.type || filters.category || filters.source || filters.account || filters.from || filters.to);
  const setFilter = (patch: Record<string, string | null>) => setParams({ ...patch, page: null });

  async function exportLedger(format: 'csv' | 'pdf') {
    setExporting(format);
    try {
      const from = filters.from || '2000-01-01', to = filters.to || cfg?.today || new Date().toISOString().slice(0, 10);
      const r = await finance<{ filename: string; csv?: string; pdfBase64?: string }>('report', { kind: 'transactions', from, to, format });
      if (r.csv) download(r.filename, r.csv, 'text/csv;charset=utf-8'); else download(r.filename, base64Bytes(r.pdfBase64!) as BlobPart, 'application/pdf');
    } catch (error) { dialogs.notify(errorText(error), 'danger'); }
    finally { setExporting(null); }
  }

  return (
    <div className="ad-page fm-page">
      <PageHeader title="Transactions" description="The permanent ledger. Running balances are calculated over the full history, so filters and pages never change them."
        actions={<>
          <Button icon="download" busy={exporting === 'csv'} onClick={() => void exportLedger('csv')}>Export CSV</Button>
          <Button icon="download" busy={exporting === 'pdf'} onClick={() => void exportLedger('pdf')}>PDF</Button>
          {cfg && cfg.level !== 'viewer' ? <Button variant="primary" icon="plus" onClick={() => dialogs.add()}>Add transaction</Button> : null}
        </>} />
      <div className="fm-tabs"><Segmented label="Status" value={status} onChange={(value) => setParams({ status: value === 'books' ? null : value, page: null })} options={STATUS_TABS.map((t) => ({ value: t.value, label: t.label }))} /></div>
      <div className="fm-filters">
        <SearchField value={q} onChange={setQ} label="Search description, reference or entry number" />
        <Select label="Type" value={filters.type} onChange={(v) => setFilter({ type: v || null })} options={[{ value: '', label: 'All types' }, ...TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))]} />
        <Select label="Category" value={filters.category} onChange={(v) => setFilter({ category: v || null })} options={[{ value: '', label: 'All categories' }, ...(cfg?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <Select label="Funding source" value={filters.source} onChange={(v) => setFilter({ source: v || null })} options={[{ value: '', label: 'All funders' }, ...(cfg?.sources ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
        <Select label="Account" value={filters.account} onChange={(v) => setFilter({ account: v || null })} options={[{ value: '', label: 'All accounts' }, ...(cfg?.accounts ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
        <label className="fm-date"><span>From</span><input className="ts-input" type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value || null })} /></label>
        <label className="fm-date"><span>To</span><input className="ts-input" type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value || null })} /></label>
        <Select label="Sort" value={`${filters.sort}:${filters.order}`} onChange={(v) => { const [sort, order] = v.split(':'); setFilter({ sort: sort === 'date' ? null : sort, order: order === 'desc' ? null : order }); }}
          options={[{ value: 'date:desc', label: 'Newest first' }, { value: 'date:asc', label: 'Oldest first' }, { value: 'amount:desc', label: 'Largest amount' }, { value: 'amount:asc', label: 'Smallest amount' }]} />
        {filtered ? <Button size="sm" variant="ghost" onClick={() => { setQ(''); setParams({ q: null, type: null, category: null, source: null, account: null, from: null, to: null, page: null }); }}>Clear filters</Button> : null}
      </div>
      <Gate state={page} label="the ledger" onRetry={() => void reload()} />
      {data ? (
        <section className="ad-card-box">
          {data.rows.length ? (
            <>
              <TxnTable rows={data.rows} onOpen={dialogs.open} />
              <div className="fm-pager">
                <span className="ts-muted">{data.offset + 1}–{data.offset + data.rows.length} of {data.total}{tab.statuses === 'books' && filtered ? ` · net of these entries ${ghs(data.filteredNetMinor, { signed: true })}` : ''}</span>
                <div>
                  <Button size="sm" icon="back" disabled={filters.page === 0} onClick={() => setParams({ page: filters.page - 1 ? String(filters.page - 1) : null })}>Previous</Button>
                  <Button size="sm" iconRight="arrow" disabled={data.offset + data.rows.length >= data.total} onClick={() => setParams({ page: String(filters.page + 1) })}>Next</Button>
                </div>
              </div>
            </>
          ) : <EmptyState compact icon="list" title={filtered ? 'No entries match these filters' : status === 'books' ? 'No posted transactions yet' : `No ${tab.label.toLowerCase()} entries`} />}
        </section>
      ) : null}
      {dialogs.node}
      {config.state === 'error' ? <Notice tone="warning" title="Lists could not be loaded">{config.message} <button type="button" className="ts-link" onClick={() => void reloadConfig()}>Retry</button></Notice> : null}
    </div>
  );
}

/* ==========================================================================
   Funding sources
   ========================================================================== */

interface SourceDetail { source: FundingSource; totals: Overview['sources'][number] | null; transactions: Txn[] }

export function FundingSourcesScreen() {
  const [config, reloadConfig] = useConfig();
  const [overview, reloadOverview] = useLoad(() => finance<Overview>('overview', { range: 'all' }), []);
  const cfg = config.state === 'ready' ? config.data : null;
  const dialogs = useTxnDialogs(cfg, () => { void reloadOverview(); });
  const [editing, setEditing] = useState<FundingSource | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const totals = new Map((overview.state === 'ready' ? overview.data.sources : []).map((s) => [s.sourceId, s]));
  const sources = (cfg?.sources ?? []).slice().sort((a, b) => (totals.get(b.id)?.totalMinor ?? 0) - (totals.get(a.id)?.totalMinor ?? 0));
  return (
    <div className="ad-page fm-page">
      <PageHeader title="Funding sources" description="Sponsors, organisations, grants, donations and platform revenue — what each gave, and what was spent from restricted money."
        actions={cfg && cfg.level !== 'viewer' ? <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add funding source</Button> : null} />
      <Gate state={config} label="funding sources" onRetry={() => void reloadConfig()} />
      {cfg ? (
        <section className="ad-card-box">
          {sources.length ? (
            <div className="ad-table-scroll"><table className="ad-table fm-table">
              <thead><tr><th scope="col">Funder</th><th scope="col">Kind</th><th scope="col" className="ad-table__num">Contributions</th><th scope="col" className="ad-table__num">Received</th><th scope="col" className="ad-table__num">Restricted</th><th scope="col" className="ad-table__num">Spent from restricted</th><th scope="col" className="ad-table__num">Restricted remaining</th><th scope="col">Last</th></tr></thead>
              <tbody>{sources.map((s) => { const t = totals.get(s.id); return (
                <tr key={s.id}>
                  <td><button type="button" className="ts-link" onClick={() => setOpenId(s.id)}>{s.name}</button>{s.purpose ? <small className="fm-sub">{s.purpose}</small> : null}</td>
                  <td>{SOURCE_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}{s.status === 'archived' ? <Badge>Archived</Badge> : null}</td>
                  <td className="ad-table__num">{t?.contributions ?? 0}</td>
                  <td className="ad-table__num">{ghs(t?.totalMinor ?? 0)}</td>
                  <td className="ad-table__num">{t?.restrictedMinor ? ghs(t.restrictedMinor) : '—'}</td>
                  <td className="ad-table__num">{t?.spentMinor ? ghs(t.spentMinor) : '—'}</td>
                  <td className="ad-table__num">{t?.restrictedMinor ? <span className={t.remainingRestrictedMinor < 0 ? 'fm-amt--out' : ''}>{ghs(t.remainingRestrictedMinor)}</span> : '—'}</td>
                  <td className="fm-nowrap">{(t as { lastDate?: string } | undefined)?.lastDate ? day((t as { lastDate?: string }).lastDate) : '—'}</td>
                </tr>
              ); })}</tbody>
            </table></div>
          ) : <EmptyState compact icon="users" title="No funding sources yet" body="Add a sponsor, organisation or grant, then link income to them when you record it." />}
          <p className="ad-footnote fm-pad"><Icon name="info" /><span>Spending is charged to a funder only when an expense is explicitly allocated to their restricted money. Unrestricted contributions pay for the project as a whole.</span></p>
        </section>
      ) : null}
      {editing && cfg ? <SourceForm source={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); dialogs.notify(m); void reloadConfig(); }} /> : null}
      {openId && cfg ? <SourceDetailDialog id={openId} config={cfg} onClose={() => setOpenId(null)} onEdit={(s) => { setOpenId(null); setEditing(s); }} onOpenTxn={(id) => { setOpenId(null); dialogs.open(id); }}
        onRecord={(sourceId) => { setOpenId(null); dialogs.add({ type: 'income', fundingSourceId: sourceId, counterparty: cfg.sources.find((s) => s.id === sourceId)?.name, categoryId: 'project-funding' }); }} /> : null}
      {dialogs.node}
    </div>
  );
}

function SourceForm({ source, onClose, onSaved }: { source: FundingSource | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [form, setForm] = useState({ name: source?.name ?? '', kind: source?.kind ?? 'individual', purpose: source?.purpose ?? '', contact: source?.contact ?? '', notes: source?.notes ?? '', status: source?.status ?? 'active' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await finance('saveSource', { id: source?.id, ...form }); onSaved(`${form.name} saved.`); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog title={source ? `Edit ${source.name}` : 'Add funding source'} onClose={onClose} busy={busy}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="fm-source" busy={busy} disabled={form.name.trim().length < 2}>Save</Button></>}>
      <form id="fm-source" className="fm-form fm-form--single" onSubmit={submit}>
        {error ? <Notice tone="danger" title="Not saved">{error}</Notice> : null}
        <Field label="Name" required><input className="ts-input" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Person or organisation" /></Field>
        <Field label="Kind" required><select className="ts-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{SOURCE_KINDS.filter((k) => k.value !== 'platform').map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></Field>
        <Field label="Funding purpose" optional><textarea className="ts-textarea" rows={2} maxLength={500} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
        <Field label="Contact" optional hint="Only what the team needs to reach them."><input className="ts-input" value={form.contact} maxLength={160} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
        <Field label="Notes" optional><textarea className="ts-textarea" rows={2} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {source ? <label className="ts-check"><input type="checkbox" checked={form.status === 'archived'} onChange={(e) => setForm({ ...form, status: e.target.checked ? 'archived' : 'active' })} /> <span>Archived (kept with its history, hidden from new entries)</span></label> : null}
      </form>
    </Dialog>
  );
}

function SourceDetailDialog({ id, config, onClose, onEdit, onOpenTxn, onRecord }: { id: string; config: Config; onClose: () => void; onEdit: (s: FundingSource) => void; onOpenTxn: (id: string) => void; onRecord: (id: string) => void }) {
  const { user } = useSession();
  const [detail, reload] = useLoad(() => finance<SourceDetail>('source', { id }), [id]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const d = detail.state === 'ready' ? detail.data : null;
  const contributions = d?.transactions.filter((t) => t.fundingSourceId === id) ?? [];
  const allocated = d?.transactions.filter((t) => t.fundedBy === id) ?? [];
  return (
    <Dialog size="lg" title={d?.source.name ?? 'Funding source'} lede={d ? `${SOURCE_KINDS.find((k) => k.value === d.source.kind)?.label ?? d.source.kind}${d.source.purpose ? ` · ${d.source.purpose}` : ''}` : undefined} onClose={onClose}>
      <Gate state={detail} label="this funding source" onRetry={() => void reload()} />
      {d ? (
        <div className="fm-detail__body">
          {error ? <Notice tone="danger" title="That did not work">{error}</Notice> : null}
          <div className="fm-strip fm-strip--tight">
            <Stat label="Total contributed" value={ghs(d.totals?.totalMinor ?? 0)} tone="in" />
            <Stat label="Contributions" value={String(d.totals?.contributions ?? 0)} />
            <Stat label="Restricted" value={ghs(d.totals?.restrictedMinor ?? 0)} />
            <Stat label="Spent from restricted" value={ghs(d.totals?.spentMinor ?? 0)} tone="out" />
            <Stat label="Restricted remaining" value={ghs(d.totals?.remainingRestrictedMinor ?? 0)} />
          </div>
          <h3 className="fm-h3">Contributions</h3>
          {contributions.length ? <TxnTable rows={contributions} onOpen={onOpenTxn} compact /> : <p className="ts-muted">No income recorded from this funder yet.</p>}
          <h3 className="fm-h3">Spending allocated to their restricted funds</h3>
          {allocated.length ? <TxnTable rows={allocated} onOpen={onOpenTxn} compact /> : <p className="ts-muted">None. Unallocated spending is not attributed to any funder.</p>}
          {!d.source.system ? (
            <>
              <h3 className="fm-h3">Agreements and documents</h3>
              {d.source.attachments?.length ? <ul className="fm-files">{d.source.attachments.map((a) => <li key={a.id}><Icon name="doc" /><span><strong>{a.name}</strong><small className="fm-sub">{fileSize(a.size)} · {when(a.uploadedAt)}</small></span><Button size="sm" variant="ghost" icon="eye" onClick={() => openAttachment({ targetType: 'source', targetId: id }, a).catch((e) => setError(errorText(e)))}>Open</Button></li>)}</ul> : <p className="ts-muted">No agreements attached.</p>}
            </>
          ) : null}
          {config.level !== 'viewer' ? (
            <div className="fm-detail__actions">
              {!d.source.system ? <Button size="sm" icon="edit" onClick={() => onEdit(d.source)}>Edit</Button> : null}
              {!d.source.system ? (
                <label className="ts-btn ts-btn--secondary ts-btn--sm fm-upload"><Icon name="upload" /><span>{busy ? 'Uploading…' : 'Attach agreement'}</span>
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
                    setBusy(true); setError('');
                    try { await uploadReceipt(user.uid, f, { targetType: 'source', targetId: id }); await reload(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
                  }} />
                </label>
              ) : null}
              <Button size="sm" variant="primary" icon="plus" onClick={() => onRecord(id)}>Record a contribution</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/* ==========================================================================
   Expenses & budgets: categories, budgets, recurring subscriptions
   ========================================================================== */

export function ExpensesScreen() {
  const { params, setParams } = useRouter();
  const tab = params.get('tab') ?? 'spending';
  const [config, reloadConfig] = useConfig();
  const [overview, reloadOverview] = useLoad(() => finance<Overview>('overview', { range: 'year' }), []);
  const cfg = config.state === 'ready' ? config.data : null;
  const reloadAll = () => { void reloadConfig(); void reloadOverview(); };
  const dialogs = useTxnDialogs(cfg, reloadAll);
  const [budget, setBudget] = useState<Config['budgets'][number] | 'new' | null>(null);
  const [recurring, setRecurring] = useState<Recurring | 'new' | null>(null);
  const [category, setCategory] = useState<Config['categories'][number] | 'new' | null>(null);
  const admin = cfg?.level === 'admin';
  const editor = cfg && cfg.level !== 'viewer';
  const o = overview.state === 'ready' ? overview.data : null;
  return (
    <div className="ad-page fm-page">
      <PageHeader title="Expenses & budgets" description="Where the money goes: spending by category, budgets with alerts, and the subscriptions Indigen World pays for."
        actions={<>
          {tab === 'budgets' && admin ? <Button variant="primary" icon="plus" onClick={() => setBudget('new')}>Add budget</Button> : null}
          {tab === 'recurring' && editor ? <Button variant="primary" icon="plus" onClick={() => setRecurring('new')}>Add recurring expense</Button> : null}
          {tab === 'categories' && admin ? <Button variant="primary" icon="plus" onClick={() => setCategory('new')}>Add category</Button> : null}
          {tab === 'spending' && editor ? <Button variant="primary" icon="plus" onClick={() => dialogs.add({ type: 'expense' })}>Record expense</Button> : null}
        </>} />
      <div className="fm-tabs"><Segmented label="View" value={tab} onChange={(value) => setParams({ tab: value === 'spending' ? null : value })}
        options={[{ value: 'spending', label: 'Spending' }, { value: 'budgets', label: 'Budgets' }, { value: 'recurring', label: 'Subscriptions & recurring' }, { value: 'categories', label: 'Categories' }]} /></div>
      <Gate state={config} label="expenses" onRetry={reloadAll} />
      {cfg && tab === 'spending' ? (
        <>
          {o ? (
            <div className="fm-grid-2">
              <Card id="fm-spend-cat" title="Spending by category" sub={o.range.label}>
                <BarList label="Spending by category" tone="out" rows={o.categories.map((c) => ({ id: c.categoryId, name: c.name, amountMinor: c.amountMinor, shareBps: c.shareBps, note: `${c.count} ${c.count === 1 ? 'payment' : 'payments'}` }))} empty="No spending recorded this year." />
              </Card>
              <Card id="fm-spend-month" title="Monthly trend" sub={o.range.label}>{o.monthly.some((m) => m.expenseMinor || m.incomeMinor) ? <MonthlyChart months={o.monthly} /> : <EmptyState compact icon="chart" title="No activity this year" />}</Card>
            </div>
          ) : <Gate state={overview} label="spending" onRetry={() => void reloadOverview()} />}
          {o ? (
            <Card id="fm-spend-table" title="Category totals" sub={`${o.range.label} · open a category to see its transactions`}>
              <div className="ad-table-scroll"><table className="ad-table ad-table--static fm-table">
                <thead><tr><th scope="col">Category</th><th scope="col" className="ad-table__num">Payments</th><th scope="col" className="ad-table__num">Spent</th><th scope="col" className="ad-table__num">Share</th><th scope="col" /></tr></thead>
                <tbody>{o.categories.length ? o.categories.map((c) => <tr key={c.categoryId}><td>{c.name}</td><td className="ad-table__num">{c.count}</td><td className="ad-table__num">{ghs(c.amountMinor)}</td><td className="ad-table__num">{pct(c.shareBps)}</td><td><Link className="ts-link" to={`/finance/transactions?category=${encodeURIComponent(c.categoryId)}&from=${o.range.from ?? ''}`}>Transactions</Link></td></tr>) : <tr><td colSpan={5} className="ts-muted">No spending recorded this year.</td></tr>}</tbody>
              </table></div>
            </Card>
          ) : null}
        </>
      ) : null}
      {cfg && tab === 'budgets' ? (
        <Card id="fm-budget-list" title="Budgets" sub="Alerts never stop a valid payment unless the budget has a spending control">
          {cfg.budgets.length ? <ul className="fm-budgets fm-budgets--wide">{cfg.budgets.map((b) => (
            <li key={b.id} className="fm-budget-wrap">
              <BudgetLine b={b} />
              <div className="fm-budget__meta"><span>{day(b.from)} – {day(b.to)} · {b.categoryIds.map((id) => cfg.categories.find((c) => c.id === id)?.name ?? id).join(', ')}</span><span>{b.control === 'block' ? <Badge tone="danger">Spending control</Badge> : <Badge>Warn only</Badge>}{b.status === 'archived' ? <Badge>Archived</Badge> : null}</span>
                {admin ? <Button size="sm" variant="ghost" icon="edit" onClick={() => setBudget(b)}>Edit</Button> : null}</div>
            </li>
          ))}</ul> : <EmptyState compact icon="target" title="No budgets yet" body="Set an allocation for an activity, choose its categories, and get a warning as spending approaches it." actions={admin ? <Button variant="primary" icon="plus" onClick={() => setBudget('new')}>Add budget</Button> : undefined} />}
        </Card>
      ) : null}
      {cfg && tab === 'recurring' ? (
        <Card id="fm-recurring" title="Subscriptions & recurring expenses" sub="Reminders only: a renewal becomes spending when its payment is recorded and posted">
          {cfg.recurring.length ? (
            <div className="ad-table-scroll"><table className="ad-table fm-table">
              <thead><tr><th scope="col">Service</th><th scope="col" className="ad-table__num">Amount</th><th scope="col">Billing</th><th scope="col">Next payment</th><th scope="col">Category · account</th><th scope="col">Status</th><th scope="col" /></tr></thead>
              <tbody>{cfg.recurring.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong>{r.vendor ? <small className="fm-sub">{r.vendor}</small> : null}</td>
                  <td className="ad-table__num">{money(r.amountMinor, r.currency)}{r.currency !== 'GHS' ? <small className="fm-sub">≈ {ghs(r.ghsEstimateMinor)}</small> : null}</td>
                  <td>{FREQUENCY_LABEL[r.frequency]}{r.paymentMethod ? <small className="fm-sub">{r.paymentMethod}</small> : null}</td>
                  <td className="fm-nowrap">{day(r.nextDueDate)}<small className={cx('fm-sub', r.overdue && 'fm-amt--out')}>{r.status !== 'active' ? '' : r.overdue ? 'Overdue' : r.daysAway === 0 ? 'Today' : `in ${r.daysAway} days`}</small></td>
                  <td>{cfg.categories.find((c) => c.id === r.categoryId)?.name ?? '—'}<small className="fm-sub">{cfg.accounts.find((a) => a.id === r.accountId)?.name ?? 'No account set'}</small></td>
                  <td><Badge tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status === 'active' ? 'Active' : r.status === 'paused' ? 'Paused' : 'Cancelled'}</Badge></td>
                  <td className="fm-nowrap">
                    {editor && r.status === 'active' ? <Button size="sm" variant="secondary" icon="check" onClick={() => dialogs.add({
                      type: 'expense', description: `${r.name} ${FREQUENCY_LABEL[r.frequency].toLowerCase()} payment`, categoryId: r.categoryId, accountId: r.accountId, counterparty: r.vendor || r.name,
                      paymentMethod: r.paymentMethod, date: cfg.today, currency: r.currency, amountMinor: r.currency === 'GHS' ? r.amountMinor : undefined, originalMinor: r.currency === 'GHS' ? undefined : r.amountMinor,
                      rate: r.estimateRate, recurringId: r.id, recurringDueDate: r.nextDueDate,
                    })}>Record payment</Button> : null}
                    {editor ? <Button size="sm" variant="ghost" icon="edit" onClick={() => setRecurring(r)}>Edit</Button> : null}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <EmptyState compact icon="calendar" title="No recurring expenses yet" body="Register Claude, Google Cloud, Firebase, domain renewals and other regular costs to see them coming." actions={editor ? <Button variant="primary" icon="plus" onClick={() => setRecurring('new')}>Add recurring expense</Button> : undefined} />}
        </Card>
      ) : null}
      {cfg && tab === 'categories' ? (
        <Card id="fm-categories" title="Financial categories" sub="Every income and expense needs one. Categories are archived, never deleted, so history keeps its labels.">
          <div className="ad-table-scroll"><table className="ad-table ad-table--static fm-table">
            <thead><tr><th scope="col">Category</th><th scope="col">Used for</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col" /></tr></thead>
            <tbody>{cfg.categories.map((c) => <tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.kind === 'both' ? 'Income and expenses' : c.kind === 'income' ? 'Income' : 'Expenses'}</td><td className="ts-muted">{c.description || '—'}</td><td>{c.active ? <Badge tone="success">Active</Badge> : <Badge>Archived</Badge>}</td><td>{admin ? <Button size="sm" variant="ghost" icon="edit" onClick={() => setCategory(c)}>Edit</Button> : null}</td></tr>)}</tbody>
          </table></div>
        </Card>
      ) : null}
      {budget && cfg ? <BudgetForm config={cfg} budget={budget === 'new' ? null : budget} onClose={() => setBudget(null)} onSaved={(m) => { setBudget(null); dialogs.notify(m); reloadAll(); }} /> : null}
      {recurring && cfg ? <RecurringForm config={cfg} item={recurring === 'new' ? null : recurring} onClose={() => setRecurring(null)} onSaved={(m) => { setRecurring(null); dialogs.notify(m); reloadAll(); }} /> : null}
      {category && cfg ? <CategoryForm category={category === 'new' ? null : category} onClose={() => setCategory(null)} onSaved={(m) => { setCategory(null); dialogs.notify(m); reloadAll(); }} /> : null}
      {dialogs.node}
    </div>
  );
}

function FormDialog({ id, title, busy, error, onClose, canSave, children, lede }: { id: string; title: string; busy: boolean; error: string; onClose: () => void; canSave: boolean; children: ReactNode; lede?: ReactNode }) {
  return (
    <Dialog title={title} lede={lede} onClose={onClose} busy={busy}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={id} busy={busy} disabled={!canSave}>Save</Button></>}>
      {error ? <Notice tone="danger" title="Not saved">{error}</Notice> : null}
      {children}
    </Dialog>
  );
}

function useSaver(onSaved: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (operation: string, data: Record<string, unknown>, message: string) => {
    setBusy(true); setError('');
    try { await finance(operation, data); onSaved(message); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return { busy, error, save };
}

function BudgetForm({ config, budget, onClose, onSaved }: { config: Config; budget: Config['budgets'][number] | null; onClose: () => void; onSaved: (m: string) => void }) {
  const year = config.today.slice(0, 4);
  const [f, setF] = useState({ name: budget?.name ?? '', categoryIds: budget?.categoryIds ?? [] as string[], from: budget?.from ?? `${year}-01-01`, to: budget?.to ?? `${year}-12-31`,
    amount: toInput(budget?.allocatedMinor), alert: String((budget?.alertAtBps ?? 8000) / 100), control: budget?.control ?? 'warn', archived: budget?.status === 'archived' });
  const { busy, error, save } = useSaver(onSaved);
  const allocated = parseMoney(f.amount);
  const ok = f.name.trim().length >= 2 && f.categoryIds.length > 0 && allocated !== null && allocated > 0 && f.from <= f.to;
  return (
    <FormDialog id="fm-budget" title={budget ? `Edit ${budget.name}` : 'Add budget'} busy={busy} error={error} onClose={onClose} canSave={ok}>
      <form id="fm-budget" className="fm-form" onSubmit={(e) => { e.preventDefault(); void save('saveBudget', { id: budget?.id, name: f.name, categoryIds: f.categoryIds, from: f.from, to: f.to, allocatedMinor: allocated, alertAtBps: Math.round(Number(f.alert) * 100), control: f.control, status: f.archived ? 'archived' : 'active' }, `${f.name} saved.`); }}>
        <Field label="Budget name" required className="fm-form__wide"><input className="ts-input" value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Budget name" /></Field>
        <Field label="Allocated (GH₵)" required><input className="ts-input fm-num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="2,000.00" /></Field>
        <Field label="Warn at (% used)" required><input className="ts-input fm-num" type="number" min={10} max={100} value={f.alert} onChange={(e) => setF({ ...f, alert: e.target.value })} /></Field>
        <Field label="From" required><input className="ts-input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To" required><input className="ts-input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <fieldset className="fm-form__wide fm-checks"><legend className="ts-label">Expense categories</legend>
          {config.categories.filter((c) => c.kind !== 'income' && c.active).map((c) => <label key={c.id} className="ts-check"><input type="checkbox" checked={f.categoryIds.includes(c.id)} onChange={(e) => setF({ ...f, categoryIds: e.target.checked ? [...f.categoryIds, c.id] : f.categoryIds.filter((x) => x !== c.id) })} /> <span>{c.name}</span></label>)}
        </fieldset>
        <Field label="When spending passes the allocation" className="fm-form__wide" hint="A spending control refuses expenses that would take the budget over. Leave it on warnings unless that is the agreed policy.">
          <select className="ts-select" value={f.control} onChange={(e) => setF({ ...f, control: e.target.value as 'warn' | 'block' })}><option value="warn">Warn finance administrators (recommended)</option><option value="block">Spending control: refuse the expense</option></select>
        </Field>
        {budget ? <label className="ts-check fm-form__wide"><input type="checkbox" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} /> <span>Archived</span></label> : null}
      </form>
    </FormDialog>
  );
}

function RecurringForm({ config, item, onClose, onSaved }: { config: Config; item: Recurring | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ name: item?.name ?? '', vendor: item?.vendor ?? '', currency: item?.currency ?? 'GHS', amount: toInput(item?.amountMinor, CURRENCY_DIGITS[item?.currency ?? 'GHS']), rate: item?.estimateRate ?? '',
    frequency: item?.frequency ?? 'monthly', nextDueDate: item?.nextDueDate ?? config.today, paymentMethod: item?.paymentMethod ?? '', categoryId: item?.categoryId ?? 'ai-tools',
    accountId: item?.accountId ?? '', status: item?.status ?? 'active', reminderDays: String(item?.reminderDays ?? 7), notes: item?.notes ?? '' });
  const { busy, error, save } = useSaver(onSaved);
  const amount = parseMoney(f.amount, CURRENCY_DIGITS[f.currency] ?? 2);
  const ok = f.name.trim().length >= 2 && amount !== null && amount > 0 && (f.currency === 'GHS' || /^\d+(\.\d+)?$/.test(f.rate.trim())) && Boolean(f.categoryId);
  return (
    <FormDialog id="fm-recurring-form" title={item ? `Edit ${item.name}` : 'Add recurring expense'} lede="A reminder of a regular cost. It is not counted as spending until a payment is recorded." busy={busy} error={error} onClose={onClose} canSave={ok}>
      <form id="fm-recurring-form" className="fm-form" onSubmit={(e) => { e.preventDefault(); void save('saveRecurring', { id: item?.id, ...f, amountMinor: amount, estimateRate: f.rate, reminderDays: Number(f.reminderDays) }, `${f.name} saved.`); }}>
        <Field label="Service" required><input className="ts-input" value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Service name" /></Field>
        <Field label="Vendor" optional><input className="ts-input" value={f.vendor} maxLength={80} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="Company billed by" /></Field>
        <Field label="Billing amount" required>
          <div className="fm-money"><select className="ts-select" aria-label="Currency" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c === 'GHS' ? 'GH₵' : c}</option>)}</select>
            <input className="ts-input fm-num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        </Field>
        {f.currency !== 'GHS' ? <Field label={`Estimated rate (GH₵ per ${f.currency})`} required hint="Used only to show the upcoming cost in cedis."><input className="ts-input fm-num" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field> : null}
        <Field label="Billing frequency" required><select className="ts-select" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Recurring['frequency'] })}>{Object.entries(FREQUENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Next payment date" required><input className="ts-input" type="date" value={f.nextDueDate} onChange={(e) => setF({ ...f, nextDueDate: e.target.value })} /></Field>
        <Field label="Expense category" required><select className="ts-select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{config.categories.filter((c) => c.kind !== 'income' && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Paid from" optional><select className="ts-select" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}><option value="">Not set</option>{config.accounts.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Payment method" optional><input className="ts-input" value={f.paymentMethod} maxLength={60} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })} placeholder="Card" /></Field>
        <Field label="Remind me (days before)"><input className="ts-input fm-num" type="number" min={0} max={60} value={f.reminderDays} onChange={(e) => setF({ ...f, reminderDays: e.target.value })} /></Field>
        <Field label="Status"><select className="ts-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Recurring['status'] })}><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></Field>
        <Field label="Notes" optional className="fm-form__wide"><textarea className="ts-textarea" rows={2} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </form>
    </FormDialog>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: Config['categories'][number] | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ name: category?.name ?? '', kind: category?.kind ?? 'expense', description: category?.description ?? '', active: category?.active ?? true, order: String(category?.order ?? 50) });
  const { busy, error, save } = useSaver(onSaved);
  return (
    <FormDialog id="fm-category" title={category ? `Edit ${category.name}` : 'Add category'} busy={busy} error={error} onClose={onClose} canSave={f.name.trim().length >= 2}>
      <form id="fm-category" className="fm-form fm-form--single" onSubmit={(e) => { e.preventDefault(); void save('saveCategory', { id: category?.id, ...f, order: Number(f.order) }, `${f.name} saved.`); }}>
        <Field label="Name" required><input className="ts-input" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Used for" required><select className="ts-select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'income' | 'expense' | 'both' })}><option value="expense">Expenses</option><option value="income">Income</option><option value="both">Both</option></select></Field>
        <Field label="Description" optional><input className="ts-input" value={f.description} maxLength={200} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Sort order"><input className="ts-input fm-num" type="number" min={0} max={999} value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></Field>
        <label className="ts-check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> <span>Active (archived categories stay on past entries)</span></label>
      </form>
    </FormDialog>
  );
}

/* ==========================================================================
   Accounts and reconciliation
   ========================================================================== */

export function AccountsScreen() {
  const [config, reload] = useConfig();
  const cfg = config.state === 'ready' ? config.data : null;
  const dialogs = useTxnDialogs(cfg, () => void reload());
  const [editing, setEditing] = useState<Config['accounts'][number] | 'new' | null>(null);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const admin = cfg?.level === 'admin';
  const total = (cfg?.accounts ?? []).reduce((s, a) => s + a.balanceMinor, 0) + (cfg?.unassignedMinor ?? 0);
  return (
    <div className="ad-page fm-page">
      <PageHeader title="Accounts" description="The bank, Mobile Money, cash and processor balances that hold project money, and reconciliation against their statements."
        actions={<>
          {cfg && cfg.level !== 'viewer' ? <Button icon="refresh" onClick={() => dialogs.add({ type: 'transfer', description: 'Transfer between project accounts' })}>Record transfer</Button> : null}
          {admin ? <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add account</Button> : null}
        </>} />
      <Gate state={config} label="accounts" onRetry={() => void reload()} />
      {cfg ? (
        <>
          {cfg.accounts.length ? (
            <div className="fm-acct-grid ts-stagger">
              {cfg.accounts.map((a) => (
                <article key={a.id} className={cx('fm-acct', a.status === 'archived' && 'fm-acct--archived')}>
                  <div className="fm-acct__head"><span className="fm-kpi__icon" aria-hidden="true"><Icon name={a.type === 'bank' ? 'bank' : a.type === 'mobile_money' ? 'phone' : 'wallet'} /></span>
                    <div><h3>{a.name}</h3><p className="fm-sub">{accountTypeLabel(a.type)}{a.institution ? ` · ${a.institution}` : ''}{a.identifier ? ` · ${a.identifier}` : ''}</p></div></div>
                  <p className="fm-acct__balance">{ghs(a.balanceMinor)}</p>
                  <p className="fm-sub">{a.entries} {a.entries === 1 ? 'entry' : 'entries'}{a.status === 'archived' ? ' · archived' : ''}</p>
                  <div className="fm-acct__actions">
                    <Link className="ts-link" to={`/finance/transactions?account=${a.id}`}>Transactions</Link>
                    {cfg.level !== 'viewer' && a.status === 'active' ? <Button size="sm" variant="secondary" onClick={() => setReconciling(a.id)}>Reconcile</Button> : null}
                    {admin ? <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(a)}>Edit</Button> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState boxed icon="bank" title="No accounts yet" body="Add the accounts that hold project money — for example the project MoMo wallet, a bank account, cash, or the Paystack balance." actions={admin ? <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add account</Button> : undefined} />}
          <p className="ts-muted">Across all accounts: <strong>{ghs(total)}</strong> — always equal to the project balance, because transfers move money without creating it.{cfg.unassignedMinor ? ` ${ghs(cfg.unassignedMinor)} sits on entries without an account.` : ''}</p>
          <Card id="fm-recon" title="Reconciliation" sub="Compare the books with a bank, MoMo or provider statement. Differences are flagged until explained or adjusted for.">
            {cfg.reconciliations.length ? (
              <div className="ad-table-scroll"><table className="ad-table ad-table--static fm-table">
                <thead><tr><th scope="col">Account</th><th scope="col">Statement date</th><th scope="col" className="ad-table__num">Statement</th><th scope="col" className="ad-table__num">Books</th><th scope="col" className="ad-table__num">Difference</th><th scope="col">Status</th><th scope="col">By</th><th scope="col" /></tr></thead>
                <tbody>{cfg.reconciliations.map((r) => (
                  <tr key={r.id}>
                    <td>{cfg.accounts.find((a) => a.id === r.accountId)?.name ?? r.accountId}</td><td className="fm-nowrap">{day(r.statementDate)}</td>
                    <td className="ad-table__num">{ghs(r.statementBalanceMinor)}</td><td className="ad-table__num">{ghs(r.recordedBalanceMinor)}</td>
                    <td className="ad-table__num">{r.differenceMinor ? <Amount minor={r.differenceMinor} /> : '—'}</td>
                    <td>{r.status === 'matched' ? <Badge tone="success" dot>Matched</Badge> : r.status === 'open' ? <Badge tone="warning" dot>Difference flagged</Badge> : <Badge tone="info" dot title={r.resolution}>Resolved</Badge>}{r.resolution ? <small className="fm-sub">{r.resolution}</small> : null}</td>
                    <td className="fm-nowrap">{r.createdBy?.name}<small className="fm-sub">{when(r.createdAt)}</small></td>
                    <td className="fm-nowrap">{admin && r.status === 'open' ? <>
                      <Button size="sm" variant="ghost" onClick={async () => { const reason = await askText({ title: 'Explain the difference', label: 'Explanation', body: 'For a timing difference or a statement error. No entry is created.', required: true, minLength: 5, multiline: true }); if (reason) { try { await finance('resolveReconciliation', { id: r.id, action: 'explain', resolution: reason }); dialogs.notify('Reconciliation resolved.'); void reload(); } catch (e) { dialogs.notify(errorText(e), 'danger'); } } }}>Explain</Button>
                      <Button size="sm" variant="secondary" onClick={async () => { const reason = await askText({ title: 'Record an adjustment', label: 'What caused the difference?', body: `Creates a ${ghs(Math.abs(r.differenceMinor))} reconciliation adjustment for approval, linked to this record.`, required: true, minLength: 5, multiline: true }); if (reason) { try { const res = await finance<{ adjustmentId: string }>('resolveReconciliation', { id: r.id, action: 'adjust', resolution: reason }); dialogs.notify('Adjustment submitted for approval.'); void reload(); if (res.adjustmentId) dialogs.open(res.adjustmentId); } catch (e) { dialogs.notify(errorText(e), 'danger'); } } }}>Adjust</Button>
                    </> : null}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <p className="fm-empty">No reconciliations yet. Use Reconcile on an account when a statement arrives.</p>}
          </Card>
        </>
      ) : null}
      {editing && cfg ? <AccountForm account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); dialogs.notify(m); void reload(); }} /> : null}
      {reconciling && cfg ? <ReconcileForm config={cfg} accountId={reconciling} onClose={() => setReconciling(null)} onSaved={(m) => { setReconciling(null); dialogs.notify(m); void reload(); }} /> : null}
      {dialogs.node}
    </div>
  );
}

function AccountForm({ account, onClose, onSaved }: { account: Config['accounts'][number] | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ name: account?.name ?? '', type: account?.type ?? 'mobile_money', institution: account?.institution ?? '', identifier: '', notes: account?.notes ?? '', archived: account?.status === 'archived' });
  const { busy, error, save } = useSaver(onSaved);
  return (
    <FormDialog id="fm-account" title={account ? `Edit ${account.name}` : 'Add account'} busy={busy} error={error} onClose={onClose} canSave={f.name.trim().length >= 2}>
      <form id="fm-account" className="fm-form fm-form--single" onSubmit={(e) => { e.preventDefault(); void save('saveAccount', { id: account?.id, ...f, identifier: f.identifier || (account?.identifier ? account.identifier.replace(/\D/g, '') : ''), status: f.archived ? 'archived' : 'active' }, `${f.name} saved.`); }}>
        <Field label="Account name" required><input className="ts-input" value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Project MTN MoMo" /></Field>
        <Field label="Kind" required><select className="ts-select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
        <Field label="Bank or provider" optional><input className="ts-input" value={f.institution} maxLength={80} onChange={(e) => setF({ ...f, institution: e.target.value })} /></Field>
        <Field label="Account or wallet number" optional hint={account?.identifier ? `On file as ${account.identifier}. Only the last four characters are ever stored.` : 'Only the last four characters are stored.'}><input className="ts-input ts-input--mono" value={f.identifier} maxLength={40} autoComplete="off" onChange={(e) => setF({ ...f, identifier: e.target.value })} /></Field>
        <Field label="Notes" optional><textarea className="ts-textarea" rows={2} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {account ? <label className="ts-check"><input type="checkbox" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} /> <span>Archived (kept with its history; no new entries)</span></label> : null}
      </form>
    </FormDialog>
  );
}

function ReconcileForm({ config, accountId, onClose, onSaved }: { config: Config; accountId: string; onClose: () => void; onSaved: (m: string) => void }) {
  const account = config.accounts.find((a) => a.id === accountId)!;
  const [f, setF] = useState({ date: config.today, balance: '', negative: false, note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const minor = parseMoney(f.balance);
  return (
    <FormDialog id="fm-reconcile" title={`Reconcile ${account.name}`} lede="Enter the closing balance shown on the statement. The books are read as at the same day." busy={busy} error={error} onClose={onClose} canSave={minor !== null}>
      <form id="fm-reconcile" className="fm-form fm-form--single" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        try {
          const r = await finance<{ status: string; differenceMinor: number }>('reconcile', { accountId, statementDate: f.date, statementBalanceMinor: (f.negative ? -1 : 1) * (minor ?? 0), note: f.note });
          onSaved(r.status === 'matched' ? 'The statement matches the books.' : `Difference of ${ghs(r.differenceMinor, { signed: true })} flagged for investigation.`);
        } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
      }}>
        <Field label="Statement date" required><input className="ts-input" type="date" max={config.today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Statement balance (GH₵)" required><input className="ts-input fm-num" inputMode="decimal" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} /></Field>
        <label className="ts-check"><input type="checkbox" checked={f.negative} onChange={(e) => setF({ ...f, negative: e.target.checked })} /> <span>The statement balance is overdrawn (negative)</span></label>
        <Field label="Note" optional><textarea className="ts-textarea" rows={2} maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Statement reference, period…" /></Field>
      </form>
    </FormDialog>
  );
}

/* ==========================================================================
   Audit trail
   ========================================================================== */

export function FinanceAuditTrail() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [state, setState] = useState<Load<true>>({ state: 'loading' });
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState('all');
  const [config] = useConfig();
  const cfg = config.state === 'ready' ? config.data : null;
  const dialogs = useTxnDialogs(cfg, () => void load());
  const load = useCallback(async (before?: string) => {
    try {
      const page = await finance<{ rows: AuditRow[] }>('audit', before ? { before } : {});
      setRows((prev) => before ? [...(prev ?? []), ...page.rows] : page.rows);
      setMore(page.rows.length === 100);
      setState({ state: 'ready', data: true });
    } catch (e) { setState(isDenied(e) ? { state: 'denied', message: errorText(e) } : { state: 'error', message: errorText(e) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = (rows ?? []).filter((r) => filter === 'all' || (filter === 'decisions' ? /approved|posted|rejected|reversed|paid|discarded/.test(r.action) : filter === 'platform' ? r.action.startsWith('platform') : r.targetType === filter));
  return (
    <div className="ad-page fm-page">
      <PageHeader title="Audit trail" description="A permanent, server-written record of every financial action: who created, changed, approved, rejected or reversed what, and when. It cannot be edited from the console." />
      <div className="fm-tabs"><Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Everything' }, { value: 'decisions', label: 'Approvals & reversals' }, { value: 'transaction', label: 'Transactions' }, { value: 'platform', label: 'Platform' }, { value: 'reconciliation', label: 'Reconciliation' }, { value: 'settings', label: 'Settings & reports' }]} /></div>
      <Gate state={state} label="the audit trail" onRetry={() => void load()} />
      {rows ? (
        <section className="ad-card-box">
          {shown.length ? (
            <ol className="fm-timeline fm-timeline--page">
              {shown.map((r) => (
                <li key={r.id}>
                  <span className="fm-timeline__dot" aria-hidden="true" />
                  <div>
                    <p><strong>{actionLabel(r.action)}</strong>{r.targetNumber ? <> · <button type="button" className="ts-link fm-mono" onClick={() => dialogs.open(r.targetId)}>{r.targetNumber}</button></> : r.targetType !== 'transaction' ? <> · <span className="fm-chip">{r.targetType}</span></> : null} · {r.actor?.name}</p>
                    <p className="fm-sub">{when(r.at)}{r.statusAfter && r.statusBefore !== r.statusAfter ? ` · ${r.statusBefore ? STATUS_META[r.statusBefore as TxnStatus]?.label ?? r.statusBefore : 'new'} → ${STATUS_META[r.statusAfter as TxnStatus]?.label ?? r.statusAfter}` : ''}</p>
                    {r.reason ? <p className="fm-quote">“{r.reason}”</p> : null}
                    {r.changes?.length && !r.action.includes('created') ? <ul className="fm-changes">{r.changes.slice(0, 8).map((c) => <li key={c.field}>{changeText(c.field, c.before, c.after)}</li>)}</ul> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : <EmptyState compact icon="shield" title="Nothing recorded yet" />}
          {more ? <div className="ad-card-box__body"><Button size="sm" onClick={() => void load(rows.at(-1)?.at)}>Load older</Button></div> : null}
        </section>
      ) : null}
      {dialogs.node}
    </div>
  );
}

/* ==========================================================================
   Reports
   ========================================================================== */

const REPORTS: { kind: string; title: string; body: string; icon: IconName }[] = [
  { kind: 'monthly', title: 'Monthly financial statement', body: 'Opening and closing balance, income and spending by category, every transaction.', icon: 'calendar' },
  { kind: 'income_expenditure', title: 'Income and expenditure', body: 'Money in and out by category and by month for any period.', icon: 'chart' },
  { kind: 'transactions', title: 'Transaction history', body: 'Every posted entry with its running balance.', icon: 'list' },
  { kind: 'funding_sources', title: 'Funding sources', body: 'What each funder gave and what was spent from restricted money.', icon: 'users' },
  { kind: 'categories', title: 'Expense categories', body: 'Spending by category, with the monthly trend.', icon: 'tag' },
  { kind: 'annual', title: 'Annual summary', body: 'The year by month, with income and spending by category.', icon: 'book' },
  { kind: 'audit', title: 'Audit trail', body: 'Every recorded action in the period, with who and why.', icon: 'shield' },
];

interface ReportPreview { report: { title: string; from: string; to: string; generatedAt: string; summary: Overview['period'] | null; tables: { title: string; columns: { key: string; label: string; numeric?: boolean; money?: boolean }[]; rows: Record<string, unknown>[] }[]; notes: string[] } }

export function ReportsScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState('monthly');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ReportPreview['report'] | null>(null);
  const period = useMemo(() => {
    if (kind === 'monthly') { const [y, m] = month.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }; }
    if (kind === 'annual') return { from: `${year}-01-01`, to: `${year}-12-31` };
    return { from, to };
  }, [kind, month, year, from, to]);
  const run = async (format: 'json' | 'csv' | 'pdf') => {
    setBusy(format); setError('');
    try {
      const r = await finance<{ filename?: string; csv?: string; pdfBase64?: string; report?: ReportPreview['report'] }>('report', { kind, ...period, format });
      if (format === 'json') setPreview(r.report ?? null);
      else if (r.csv) download(r.filename!, r.csv, 'text/csv;charset=utf-8');
      else if (r.pdfBase64) download(r.filename!, base64Bytes(r.pdfBase64) as BlobPart, 'application/pdf');
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };
  useEffect(() => { setPreview(null); }, [kind, period.from, period.to]);
  return (
    <div className="ad-page fm-page">
      <PageHeader title="Reports" description="Statements built from the posted ledger, with the period, opening and closing balances and entry references. Download as PDF or CSV." />
      <div className="fm-report-kinds">
        {REPORTS.map((r) => (
          <button key={r.kind} type="button" className={cx('fm-report-kind', kind === r.kind && 'fm-report-kind--on')} aria-pressed={kind === r.kind} onClick={() => setKind(r.kind)}>
            <Icon name={r.icon} /><span><strong>{r.title}</strong><small>{r.body}</small></span>
          </button>
        ))}
      </div>
      <section className="ad-card-box fm-pad fm-report-bar">
        {kind === 'monthly' ? <Field label="Month"><input className="ts-input" type="month" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></Field>
          : kind === 'annual' ? <Field label="Year"><input className="ts-input fm-num" type="number" min={2020} max={Number(today.slice(0, 4))} value={year} onChange={(e) => setYear(e.target.value)} /></Field>
            : <><Field label="From"><input className="ts-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input className="ts-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
        <div className="fm-report-bar__actions">
          <Button icon="eye" busy={busy === 'json'} onClick={() => void run('json')}>Preview</Button>
          <Button icon="download" busy={busy === 'csv'} onClick={() => void run('csv')}>CSV</Button>
          <Button variant="primary" icon="download" busy={busy === 'pdf'} onClick={() => void run('pdf')}>Download PDF</Button>
        </div>
      </section>
      {error ? <Notice tone="danger" title="The report could not be built">{error}</Notice> : null}
      {preview ? (
        <section className="ad-card-box fm-report">
          <div className="fm-report__head"><div><p className="fm-kicker">Indigen World</p><h2>{preview.title}</h2><p className="ts-muted">{day(preview.from)} – {day(preview.to)} · generated {when(preview.generatedAt)}</p></div></div>
          {preview.summary ? (
            <div className="fm-strip fm-strip--tight">
              <Stat label="Opening balance" value={ghs(preview.summary.openingMinor)} />
              <Stat label="Income" value={ghs(preview.summary.incomeMinor)} tone="in" />
              <Stat label="Expenditure" value={ghs(preview.summary.expenseMinor)} tone="out" />
              <Stat label="Refunds (in / out)" value={`${ghs(preview.summary.refundsInMinor)} / ${ghs(preview.summary.refundsOutMinor)}`} />
              <Stat label="Adjustments" value={ghs(preview.summary.adjustmentsMinor, { signed: true })} />
              <Stat label="Closing balance" value={<strong>{ghs(preview.summary.closingMinor)}</strong>} />
            </div>
          ) : null}
          {preview.tables.map((table) => (
            <div key={table.title} className="fm-report__table">
              <h3 className="fm-h3">{table.title}</h3>
              {table.rows.length ? <div className="ad-table-scroll"><table className="ad-table ad-table--static fm-table">
                <thead><tr>{table.columns.map((c) => <th key={c.key} scope="col" className={c.numeric ? 'ad-table__num' : undefined}>{c.label}</th>)}</tr></thead>
                <tbody>{table.rows.slice(0, 200).map((row, i) => <tr key={i}>{table.columns.map((c) => <td key={c.key} className={c.numeric ? 'ad-table__num fm-nowrap' : undefined}>{c.money ? (row[c.key] == null ? '—' : ghs(Number(row[c.key]))) : String(row[c.key] ?? '')}</td>)}</tr>)}</tbody>
              </table></div> : <p className="ts-muted">No records in this period.</p>}
              {table.rows.length > 200 ? <p className="ts-hint">Showing 200 of {table.rows.length}; the download has every row.</p> : null}
            </div>
          ))}
          {preview.notes.length ? <ul className="fm-notes">{preview.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
        </section>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Settings: platform auto-logging, notifications, access
   ========================================================================== */

interface Person { uid: string; email: string; name: string; level: 'admin' | 'editor' | 'viewer'; role: string | null }

export function FinanceSettingsScreen() {
  const [config, reload] = useConfig();
  const cfg = config.state === 'ready' ? config.data : null;
  const admin = cfg?.level === 'admin';
  const [draft, setDraft] = useState<Config['settings'] | null>(null);
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [grant, setGrant] = useState({ email: '', level: 'viewer' });
  useEffect(() => { if (cfg) { setDraft(cfg.settings); setEmails(cfg.settings.notifyEmails.join(', ')); } }, [cfg]);
  const loadPeople = useCallback(async () => { try { setPeople((await finance<{ people: Person[] }>('people')).people); } catch { setPeople([]); } }, []);
  useEffect(() => { if (admin) void loadPeople(); }, [admin, loadPeople]);
  const say = (message: string, tone: 'success' | 'danger' | 'info' = 'success') => setToast({ message, tone });

  const saveSettings = async () => {
    if (!draft) return;
    setBusy('settings');
    try { await finance('saveSettings', { autoPost: draft.autoPost, notifyEmails: emails.split(/[,\s]+/).filter(Boolean), requireSecondApprover: draft.requireSecondApprover, upcomingWindowDays: draft.upcomingWindowDays }); say('Finance settings saved.'); await reload(); }
    catch (e) { say(errorText(e), 'danger'); } finally { setBusy(null); }
  };

  return (
    <div className="ad-page fm-page">
      <PageHeader title="Finance settings" description="How platform payments reach the ledger, who is told about renewals and budgets, and who may see or record project money." />
      <Gate state={config} label="finance settings" onRetry={() => void reload()} />
      {cfg && draft ? (
        <>
          <Card id="fm-platform" title="Platform payments" sub="Money the platform itself confirms is logged automatically, once, keyed to its own record.">
            <p className="ts-hint">By default each logged payment waits in <Link className="ts-link" to="/finance/transactions?status=pending_approval">Pending</Link> for a finance administrator to check it and confirm the account. Turn on auto-posting for a source only once its account is chosen and you trust every record it produces.</p>
            <div className="fm-platform">
              {(Object.keys(PLATFORM_LABEL) as PlatformKey[]).map((key) => (
                <div key={key} className="fm-platform__row">
                  <div><strong>{PLATFORM_LABEL[key].label}</strong><small className="fm-sub">{PLATFORM_LABEL[key].hint}</small></div>
                  <select className="ts-select" aria-label={`Account for ${PLATFORM_LABEL[key].label}`} disabled={!admin} value={draft.autoPost[key].accountId ?? ''} onChange={(e) => setDraft({ ...draft, autoPost: { ...draft.autoPost, [key]: { ...draft.autoPost[key], accountId: e.target.value || null, post: e.target.value ? draft.autoPost[key].post : false } } })}>
                    <option value="">Account: decide on approval</option>
                    {cfg.accounts.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <label className="ts-check"><input type="checkbox" disabled={!admin || !draft.autoPost[key].accountId} checked={draft.autoPost[key].post} onChange={(e) => setDraft({ ...draft, autoPost: { ...draft.autoPost, [key]: { ...draft.autoPost[key], post: e.target.checked } } })} /> <span>Post automatically</span></label>
                </div>
              ))}
            </div>
            {admin ? <div className="fm-row-actions"><Button icon="refresh" busy={busy === 'sync'} onClick={async () => {
              setBusy('sync');
              try { const r = await finance<Record<PlatformKey, { seen: number; created: number }>>('syncPlatform'); const created = Object.values(r).reduce((s, x) => s + x.created, 0); say(created ? `${created} new platform ${created === 1 ? 'payment' : 'payments'} logged.` : 'Up to date: nothing new to log.', 'info'); queuesChanged(); }
              catch (e) { say(errorText(e), 'danger'); } finally { setBusy(null); }
            }}>Check platform payments now</Button><span className="ts-hint">This also runs every morning at 07:00.</span></div> : null}
            <p className="ts-hint">Not connected: membership revenue from Google Play arrives as a monthly payout net of fees — record that payout as income (Membership Revenue) when it lands.</p>
          </Card>
          <Card id="fm-controls" title="Controls and notifications">
            <div className="fm-form fm-form--single">
              <label className="ts-check"><input type="checkbox" disabled={!admin} checked={draft.requireSecondApprover} onChange={(e) => setDraft({ ...draft, requireSecondApprover: e.target.checked })} /> <span><strong>Two-person approval</strong> — a finance administrator cannot approve or post their own entries.</span></label>
              <Field label="Upcoming-expense window (days)" hint="How far ahead renewals count as reserved on the overview."><input className="ts-input fm-num" type="number" min={7} max={120} disabled={!admin} value={draft.upcomingWindowDays} onChange={(e) => setDraft({ ...draft, upcomingWindowDays: Number(e.target.value) })} /></Field>
              <Field label="Daily finance digest to" optional hint="Up to ten addresses, comma-separated. Sent at 07:00 only when approvals, renewals, budget alerts or reconciliation differences need attention; nothing is sent while this is empty."><input className="ts-input" disabled={!admin} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="finance@indigenworld.com" /></Field>
            </div>
            {admin ? <div className="fm-row-actions"><Button variant="primary" busy={busy === 'settings'} onClick={() => void saveSettings()}>Save settings</Button></div> : <p className="ts-hint">Only a finance administrator can change these.</p>}
          </Card>
          <Card id="fm-access" title="Finance access" sub="Viewer: reads everything here. Editor: records drafts, submits them, uploads receipts. Finance administrator: approves, posts, reverses and manages settings.">
            {admin ? (
              <>
                {people ? (people.length ? (
                  <div className="ad-table-scroll"><table className="ad-table ad-table--static fm-table">
                    <thead><tr><th scope="col">Person</th><th scope="col">Finance level</th><th scope="col">Console role</th><th scope="col" /></tr></thead>
                    <tbody>{people.map((p) => <tr key={p.uid}><td>{p.name || p.email}<small className="fm-sub">{p.email}</small></td><td><Badge tone={p.level === 'admin' ? 'accent' : p.level === 'editor' ? 'info' : 'neutral'}>{p.level === 'admin' ? 'Finance administrator' : p.level === 'editor' ? 'Editor' : 'Viewer'}</Badge></td><td>{p.role ?? '—'}</td>
                      <td>{p.level !== 'admin' || cfg.superAdmin ? <Button size="sm" variant="danger-ghost" onClick={async () => {
                        if (!(await confirmAction({ title: `Remove finance access for ${p.email}?`, body: 'They keep any other console role.', confirmLabel: 'Remove', tone: 'danger' }))) return;
                        try { await finance('setRole', { email: p.email, level: 'none' }); say('Access removed. It takes effect when they next sign in.'); void loadPeople(); } catch (e) { say(errorText(e), 'danger'); }
                      }}>Remove</Button> : null}</td></tr>)}</tbody>
                  </table></div>
                ) : <p className="fm-empty">No one has finance access yet.</p>) : <Skeleton lines={3} label="Loading people" />}
                <form className="fm-grant" onSubmit={async (e) => {
                  e.preventDefault(); setBusy('grant');
                  try { await finance('setRole', grant); say(`${grant.email} is now a finance ${grant.level === 'admin' ? 'administrator' : grant.level}. They need to sign out and in again.`); setGrant({ email: '', level: 'viewer' }); void loadPeople(); }
                  catch (err) { say(errorText(err), 'danger'); } finally { setBusy(null); }
                }}>
                  <Field label="Email of an existing account"><input className="ts-input" type="email" required value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} /></Field>
                  <Field label="Level"><select className="ts-select" value={grant.level} onChange={(e) => setGrant({ ...grant, level: e.target.value })}><option value="viewer">Viewer</option><option value="editor">Editor</option>{cfg.superAdmin ? <option value="admin">Finance administrator</option> : null}</select></Field>
                  <Button type="submit" variant="primary" busy={busy === 'grant'} disabled={!grant.email}>Grant access</Button>
                </form>
                {!cfg.superAdmin ? <p className="ts-hint">Only a super administrator can make someone a finance administrator.</p> : null}
              </>
            ) : <p className="ts-muted">You have <strong>{cfg.level}</strong> access. A finance administrator manages who else can see project finance.</p>}
          </Card>
        </>
      ) : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

export type { TxnType };
