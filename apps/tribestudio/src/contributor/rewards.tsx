import { useMemo, useState, type FormEvent } from 'react';
import { TableShell } from '@indigen-world/console-ui';
import {
  Badge,
  ConfirmDialog,
  ErrorNote,
  FilterChips,
  Icon,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  Skeleton,
  StatList,
  VerificationChip,
  paginate,
  type Tone,
} from './components';
import { formatDate, formatDateTime, friendlyError, type Item, type Work } from './model';
import type { RedemptionChoice, RedemptionRequest, RewardCredit } from './types';
import { PortalLink, useShared, useWorkspace } from './workspace';

/**
 * Rewards, as an account of what happened rather than a game.
 *
 * Everything shown comes from the backend's own records:
 *   - the balance, lifetime total and award rules from getContributorRewards
 *     (`settings/contributorRewards`, defaults 10 points per approval and a
 *     300-point daily limit);
 *   - each award from contributorAccounts/{uid}/rewardCredits, written when a
 *     reviewer approves an assigned translation, once per task item;
 *   - each redemption request and its delivery from contributorRedemptions.
 * Points are not money: there is no cash balance, and the only exchange the
 * backend offers is airtime or mobile data, reviewed and delivered by hand.
 */

export type LedgerKind = 'earned' | 'redeemed' | 'returned';

export interface LedgerRow {
  id: string;
  at: string;
  kind: LedgerKind;
  title: string;
  detail: string;
  points: number;
  status: { label: string; tone: Tone };
}

const REDEMPTION_STATUS: Record<string, { label: string; tone: Tone; next: string }> = {
  submitted: { label: 'Waiting for review', tone: 'info', next: 'The team reviews each request before delivering it.' },
  approved: { label: 'Approved, not yet delivered', tone: 'info', next: 'Approved and waiting to be sent.' },
  fulfilled: { label: 'Delivered', tone: 'success', next: 'Delivery has been recorded.' },
  paid: { label: 'Delivered', tone: 'success', next: 'Delivery has been recorded.' },
  rejected: { label: 'Not approved', tone: 'warning', next: 'The points were returned to your balance.' },
};

function maskPhone(phone = ''): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : phone;
}

/** Awards and redemptions as one dated account, newest first. */
export function ledgerFrom(credits: RewardCredit[], requests: (RedemptionRequest & { decidedAt?: string | null })[], works: Work[], items: Record<string, Item[]>): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const credit of credits) {
    const item = (items[credit.work] ?? []).find((entry) => entry.id === credit.item);
    const work = works.find((entry) => entry.id === credit.work);
    rows.push({
      id: `credit:${credit.id}`,
      at: credit.createdAt,
      kind: 'earned',
      title: item ? `Approved: “${item.expression}”` : 'Approved assigned translation',
      detail: work ? `Task: ${work.title}` : '',
      points: credit.points,
      status: credit.points > 0 ? { label: 'Added', tone: 'success' } : { label: 'Daily limit reached', tone: 'neutral' },
    });
  }
  for (const request of requests) {
    if (request.kind !== 'airtime' && request.kind !== 'data') continue;
    const status = REDEMPTION_STATUS[request.status] ?? { label: request.status, tone: 'neutral' as Tone, next: '' };
    const what = request.kind === 'airtime' ? 'airtime' : 'mobile data';
    rows.push({
      id: `request:${request.id}`,
      at: request.createdAt,
      kind: 'redeemed',
      title: `Requested GH₵${(request.amountMinor / 100).toFixed(2)} of ${what}`,
      detail: [request.network, maskPhone(request.phoneNumber), request.paymentReference ? `Reference ${request.paymentReference}` : ''].filter(Boolean).join(' · '),
      points: -(request.points ?? 0),
      status: { label: status.label, tone: status.tone },
    });
    if (request.status === 'rejected') {
      rows.push({
        id: `return:${request.id}`,
        at: request.decidedAt || request.createdAt,
        kind: 'returned',
        title: 'Points returned',
        detail: request.adminNote ? `Reason: ${request.adminNote}` : 'The request was not approved.',
        points: request.points ?? 0,
        status: { label: 'Returned', tone: 'neutral' },
      });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/** Whether a redemption may be requested now, and why not when it may not. */
export function redemptionEligibility(balance: number, minimum: number, requests: RedemptionRequest[]): { eligible: boolean; checks: { label: string; met: boolean }[] } {
  const pending = requests.some((request) => (request.kind === 'airtime' || request.kind === 'data') && ['submitted', 'approved'].includes(request.status));
  const checks = [
    { label: `At least ${minimum.toLocaleString()} points available (you have ${balance.toLocaleString()})`, met: balance >= minimum },
    { label: 'No other request waiting to be delivered', met: !pending },
  ];
  return { eligible: checks.every((check) => check.met), checks };
}

type LedgerFilter = 'all' | 'earned' | 'redemptions';

export function RewardsPage({ history = false }: { history?: boolean }) {
  const data = useWorkspace();
  const { rewards, payments, rows } = useShared();
  const view = rewards.value;
  const [filter, setFilter] = useState<LedgerFilter>(history ? 'redemptions' : 'all');
  const [page, setPage] = useState(1);
  const awaiting = rows.filter((row) => row.type === 'assigned' && (row.state === 'awaiting_review' || row.state === 'specialist_review')).length;
  const ledger = useMemo(() => ledgerFrom(data.credits, view?.requests ?? [], data.works, data.items), [data.credits, data.items, data.works, view?.requests]);
  const visible = ledger.filter((row) => filter === 'all' || (filter === 'earned' ? row.kind === 'earned' : row.kind !== 'earned'));
  const pageView = paginate(visible, page, 20);

  if (!view) {
    return (
      <div className="cw-page">
        <PageHeader title="Rewards" description="Points you earn when reviewers approve your assigned translations, and how you can use them." />
        {rewards.state === 'error' && rewards.error ? <ErrorNote title="Your points could not be loaded" error={rewards.error} onRetry={rewards.refresh} /> : <Panel><Skeleton lines={5} label="Loading your points" /></Panel>}
      </div>
    );
  }

  const { rewards: balance, streak } = view;
  const eligibility = redemptionEligibility(balance.balance, balance.redemptionMinimum, view.requests);
  const stats = [
    { key: 'available', label: 'Available', value: <>{balance.balance.toLocaleString()} <span className="cw-stat__unit">points</span></>, hint: 'Ready to use' },
    { key: 'lifetime', label: 'Earned in total', value: <>{balance.lifetime.toLocaleString()} <span className="cw-stat__unit">points</span></>, hint: 'Since your first approval' },
    { key: 'awaiting', label: 'Awaiting review', value: <>{awaiting} <span className="cw-stat__unit">{awaiting === 1 ? 'translation' : 'translations'}</span></>, hint: 'No points until approved' },
    { key: 'cash', label: 'Cash balance', value: 'None', hint: 'Points are not money' },
  ];

  return (
    <div className="cw-page cw-rewards">
      <PageHeader
        title="Rewards"
        description="Points you earn when reviewers approve your assigned translations, and how you can use them."
        actions={<PortalLink to={data.paths.section('guide', { section: 'point-rewards' })} className="cw-btn"><Icon name="guide" />Points in the guidelines</PortalLink>}
      />

      <Panel flush title="Your points" description={streak.current ? `You have sent new work on ${streak.current} day${streak.current === 1 ? '' : 's'} in a row (best: ${streak.best}).` : undefined}>
        <StatList items={stats} label="Your points" />
      </Panel>

      <div className="cw-rewards__grid">
        <Panel title="How points work">
          <ul className="cw-rules">
            <li><Icon name="check" className="cw-icon--sm" /><span>Each assigned translation a reviewer approves earns <strong>{balance.pointsPerExpression} points</strong>.</span></li>
            <li><Icon name="clock" className="cw-icon--sm" /><span>Points are added when a reviewer approves, not when you submit.</span></li>
            <li><Icon name="calendar" className="cw-icon--sm" /><span>You can earn up to <strong>{balance.dailyCap} points a day</strong> (UTC). Approvals beyond that on the same day are recorded with no points.</span></li>
            <li><Icon name="revisions" className="cw-icon--sm" /><span>A revised and re-approved translation does not earn points a second time.</span></li>
            <li><Icon name="info" className="cw-icon--sm" /><span>Everyday expressions, dictionary words and recordings are reviewed and credited to you, but do not add to this balance.</span></li>
          </ul>
        </Panel>

        <RedeemPanel minimum={balance.redemptionMinimum} cedis={balance.cedisPerRedemption} balance={balance.balance} eligibility={eligibility} />
      </div>

      <Panel
        title="Points activity"
        description="Every award and redemption, with its date and status"
        flush
        actions={<FilterChips label="Show activity" value={filter} onChange={(value) => { setFilter(value); setPage(1); }} options={[
          { id: 'all', label: 'All', count: ledger.length },
          { id: 'earned', label: 'Earned', count: ledger.filter((row) => row.kind === 'earned').length },
          { id: 'redemptions', label: 'Redemptions', count: ledger.filter((row) => row.kind !== 'earned').length },
        ]} />}
      >
        {data.creditsState === 'error' ? <div className="cw-panel__pad"><Notice tone="warning" title="Point awards could not be loaded">Redemptions below are up to date. Reload to try the awards again.</Notice></div> : null}
        {!visible.length ? (
          <p className="cw-muted cw-panel__pad">{filter === 'redemptions' ? 'No redemption requests yet.' : 'No points yet. Points appear here when a reviewer approves one of your assigned translations.'}</p>
        ) : (
          <>
            <TableShell label="Points activity">
              <table className="cw-table cw-table--stack">
                <thead><tr><th scope="col">Date</th><th scope="col">Activity</th><th scope="col">Status</th><th scope="col" className="cw-table__num">Points</th></tr></thead>
                <tbody>
                  {pageView.rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Date" className="cw-nowrap"><time dateTime={row.at} title={formatDateTime(row.at)}>{formatDate(row.at, true)}</time></td>
                      <th scope="row"><span className="cw-table__primary">{row.title}</span>{row.detail ? <span className="cw-table__sub">{row.detail}</span> : null}</th>
                      <td data-label="Status"><Badge tone={row.status.tone}>{row.status.label}</Badge></td>
                      <td data-label="Points" className={`cw-table__num cw-points cw-points--${row.points > 0 ? 'plus' : row.points < 0 ? 'minus' : 'zero'}`}>{row.points > 0 ? `+${row.points}` : row.points < 0 ? `−${Math.abs(row.points)}` : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
            <Pagination page={pageView.page} pageCount={pageView.pageCount} from={pageView.from} to={pageView.to} total={visible.length} onPage={setPage} noun="entries" />
          </>
        )}
      </Panel>

      <Panel title="Cash payments" description="Separate from points">
        <div className="cw-stack cw-stack--sm">
          <p>Indigen World has not published rates or schedules for paying invited contributors, and submitting or having work approved does not by itself mean a payment. If the team arranges a payment with you, it is sent only to a bank account or MoMo wallet that a finance reviewer has verified.</p>
          <div className="cw-row">
            <span className="cw-small cw-muted">Bank account</span>{payments.value?.bank ? <VerificationChip status={payments.value.bank.status} /> : <Badge tone="neutral">Not added</Badge>}
            <span className="cw-small cw-muted">MoMo wallet</span>{payments.value?.momo ? <VerificationChip status={payments.value.momo.ownershipStatus} /> : <Badge tone="neutral">Not added</Badge>}
          </div>
          <div><PortalLink to={data.paths.account('payments')} className="cw-text-link">Manage payment details<Icon name="arrow" /></PortalLink></div>
        </div>
      </Panel>
    </div>
  );
}

const NETWORKS: RedemptionChoice['network'][] = ['MTN', 'Telecel', 'AT'];

function RedeemPanel({ minimum, cedis, balance, eligibility }: { minimum: number; cedis: number; balance: number; eligibility: ReturnType<typeof redemptionEligibility> }) {
  const data = useWorkspace();
  const { rewards } = useShared();
  const [kind, setKind] = useState<'airtime' | 'data'>('airtime');
  const [points, setPoints] = useState(String(minimum));
  const [network, setNetwork] = useState<RedemptionChoice['network']>('MTN');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const amount = Number(points);
  const pointsProblem = !Number.isSafeInteger(amount) ? 'Enter a whole number of points.'
    : amount < minimum ? `Redeem at least ${minimum} points.`
      : amount > balance ? `You have ${balance} points available.` : '';
  const digits = phone.replace(/\D/g, '');
  const phoneProblem = !/^(0\d{9}|233\d{9})$/.test(digits) ? 'Enter a Ghana mobile number, such as 0241234567.' : '';
  const value = pointsProblem ? 0 : (amount / minimum) * cedis;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (pointsProblem || phoneProblem) return;
    setError('');
    setConfirming(true);
  };

  const redeem = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await data.services.redeem({ points: amount, kind, network, phoneNumber: phone });
      setConfirming(false);
      setNotice(`Your ${kind === 'airtime' ? 'airtime' : 'mobile data'} request was sent. The team reviews and delivers each request by hand; it is not instant.`);
      setPhone('');
      setTouched(false);
      rewards.refresh();
    } catch (reason) {
      setError(friendlyError(reason, 'Your request').message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Use your points" description={`${minimum.toLocaleString()} points = GH₵${cedis} of airtime or mobile data`}>
      <div className="cw-stack">
        <p className="cw-small">You can exchange points for airtime or mobile data on a Ghana number. The team reviews each request and delivers it by hand, so it is not instant.</p>
        <ul className="cw-checklist" aria-label="Before you can request">
          {eligibility.checks.map((check) => (
            <li key={check.label} className={check.met ? 'is-met' : 'is-unmet'}>
              <Icon name={check.met ? 'check' : 'close'} className="cw-icon--sm" /><span>{check.label}<span className="cw-sr">{check.met ? ' — met' : ' — not yet'}</span></span>
            </li>
          ))}
        </ul>
        {notice ? <Notice tone="success" role="status" title="Request sent">{notice}</Notice> : null}
        {eligibility.eligible ? (
          <form className="cw-form cw-redeem" noValidate onSubmit={submit}>
            <fieldset className="cw-field">
              <legend className="cw-field-label">Reward</legend>
              <div className="cw-choices cw-choices--2">
                <label className="cw-choice-card"><input type="radio" name="redeem-kind" checked={kind === 'airtime'} onChange={() => setKind('airtime')} /><span><strong>Airtime</strong></span></label>
                <label className="cw-choice-card"><input type="radio" name="redeem-kind" checked={kind === 'data'} onChange={() => setKind('data')} /><span><strong>Mobile data</strong></span></label>
              </div>
            </fieldset>
            <div className="cw-form-grid">
              <div className="cw-field">
                <label className="cw-field-label" htmlFor="redeem-points">Points to use</label>
                <input id="redeem-points" type="number" inputMode="numeric" min={minimum} max={balance} step={1} value={points} aria-invalid={touched && Boolean(pointsProblem)} aria-describedby="redeem-points-hint" onChange={(event) => setPoints(event.target.value)} />
                <p id="redeem-points-hint" className={touched && pointsProblem ? 'cw-field__error' : 'cw-field__hint'}>{touched && pointsProblem ? pointsProblem : value ? `Worth GH₵${value.toFixed(2)}` : `Between ${minimum} and ${balance}`}</p>
              </div>
              <div className="cw-field">
                <label className="cw-field-label" htmlFor="redeem-network">Mobile network</label>
                <select id="redeem-network" value={network} onChange={(event) => setNetwork(event.target.value as RedemptionChoice['network'])}>
                  {NETWORKS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </div>
              <div className="cw-field cw-field--wide">
                <label className="cw-field-label" htmlFor="redeem-phone">Ghana mobile number to receive it</label>
                <input id="redeem-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0241234567" value={phone} aria-invalid={touched && Boolean(phoneProblem)} aria-describedby="redeem-phone-hint" onChange={(event) => setPhone(event.target.value)} />
                <p id="redeem-phone-hint" className={touched && phoneProblem ? 'cw-field__error' : 'cw-field__hint'}>{touched && phoneProblem ? phoneProblem : 'Check the number carefully — delivery goes to this number.'}</p>
              </div>
            </div>
            <div className="cw-form__actions"><button type="submit" className="button--primary">Review request</button></div>
          </form>
        ) : (
          <p className="cw-muted cw-small">{balance < minimum ? `Requests open at ${minimum.toLocaleString()} points. You need ${(minimum - balance).toLocaleString()} more.` : 'You can make a new request once your current one is delivered or declined.'}</p>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title="Send this request?"
        confirmLabel="Send request"
        busy={busy}
        error={error || undefined}
        onCancel={() => { setConfirming(false); setError(''); }}
        onConfirm={() => void redeem()}
      >
        <dl className="cw-review-list">
          <div><dt>Reward</dt><dd>GH₵{value.toFixed(2)} of {kind === 'airtime' ? 'airtime' : 'mobile data'}</dd></div>
          <div><dt>Points used</dt><dd>{amount.toLocaleString()} (leaving {(balance - amount).toLocaleString()})</dd></div>
          <div><dt>Network</dt><dd>{network}</dd></div>
          <div><dt>Number</dt><dd>{phone}</dd></div>
        </dl>
        <p className="cw-small cw-muted">The points leave your balance now. If the team declines the request, they come back.</p>
      </ConfirmDialog>
    </Panel>
  );
}
