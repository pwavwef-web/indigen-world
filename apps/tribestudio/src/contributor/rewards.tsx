import { PageHeader } from './components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useRoute } from '../router';
import { friendlyError, type Item } from './model';
import { useWorkspace } from './workspace';
import { Badge, Button, Dialog, EmptyState, Icon, Notice, Segmented, StatCard, StatGrid, Steps } from '../ui';

export type PaymentRequest = { id: string; amountMinor: number; currency: 'GHS'; description: string; status: 'submitted' | 'approved' | 'rejected' | 'paid' | 'fulfilled'; points?: number; kind?: 'airtime' | 'data'; network?: string; phoneNumber?: string; createdAt: string; adminNote?: string; paidAt?: string | null; paymentReference?: string };
type Rewards = { balance: number; lifetime: number; pointsPerExpression: number; dailyCap: number; redemptionMinimum: number; cedisPerRedemption: number };
export type Streak = { current: number; best: number; lastDay: string; activeToday: boolean };
type RewardView = { requests: PaymentRequest[]; rewards: Rewards; streak: Streak };
export type RedemptionChoice = { points: number; kind: 'airtime' | 'data'; network: 'MTN' | 'Telecel' | 'AT'; phoneNumber: string };
export type ContributorPaymentService = { load: () => Promise<{ data: RewardView }>; redeem?: (choice: RedemptionChoice) => Promise<unknown> };
const loadRewards = httpsCallable<Record<string, never>, RewardView>(functions, 'getContributorRewards');
const redeemPoints = httpsCallable<RedemptionChoice, { requestId: string }>(functions, 'redeemContributorPoints');
export const livePaymentService: ContributorPaymentService = { load: () => loadRewards({}), redeem: choice => redeemPoints(choice) };
const previewState: RewardView = { rewards: { balance: 900, lifetime: 1200, pointsPerExpression: 10, dailyCap: 300, redemptionMinimum: 300, cedisPerRedemption: 5 }, streak: { current: 3, best: 5, lastDay: new Date(Date.now() - 86400000).toISOString().slice(0, 10), activeToday: false }, requests: [{ id: 'sample-delivered', points: 300, amountMinor: 500, currency: 'GHS', description: '300 points for airtime', kind: 'airtime', network: 'MTN', phoneNumber: '+233241234567', status: 'fulfilled', createdAt: new Date().toISOString(), paymentReference: 'SAMPLE-DELIVERY' }] };
export const previewService: ContributorPaymentService = { load: async () => ({ data: structuredClone(previewState) }), redeem: async choice => { if (choice.points > previewState.rewards.balance) throw new Error('Not enough points.'); previewState.rewards.balance -= choice.points; previewState.requests.unshift({ ...choice, id: `sample-${Date.now()}`, amountMinor: Math.round(choice.points / 300 * 500), currency: 'GHS', description: `${choice.points} points for ${choice.kind}`, status: 'submitted', createdAt: new Date().toISOString() }); } };

export function RewardsPage({ streak = false, history = false }: { streak?: boolean; history?: boolean }) {
  const data = useWorkspace(); const { navigate } = useRoute();
  const service = data.preview ? previewService : livePaymentService;
  const onOpenTasks = () => navigate(data.paths.section('assignments'));
  return (
    <div className="ts-page contributor-rewards-page">
      <PageHeader
        kicker="Recognition"
        title={streak ? 'Activity streak' : 'Points & redemptions'}
        description={streak ? 'Days in a row with at least one new submission, counted in UTC.' : 'Points come from approved expressions and can be redeemed for airtime or mobile data. They are not cash.'}
      />
      {streak ? <ContributorStreak service={service} onOpenTasks={onOpenTasks} /> : <ContributorRewards service={service} onOpenTasks={onOpenTasks} initialView={history ? 'history' : 'redeem'} />}
    </div>
  );
}

export function RewardNotices() {
  const data = useWorkspace(); const { navigate, path } = useRoute();
  const items = useMemo(() => Object.values(data.items).flat(), [data.items]);
  return <ContributorActivityNotice items={path === data.paths.base ? [] : items} accountId={data.uid} service={data.preview ? previewService : livePaymentService} onOpenTasks={() => navigate(data.paths.section('contributions', { filter: 'returned' }))} onOpenHistory={() => navigate(data.paths.section('rewards', { view: 'history' }))} />;
}

export function ContributorActivityNotice({ items, accountId, service = livePaymentService, onOpenTasks, onOpenHistory }: {
  items: Item[]; accountId: string; service?: ContributorPaymentService; onOpenTasks: () => void; onOpenHistory: () => void;
}) {
  const [latestDelivery, setLatestDelivery] = useState<PaymentRequest | null>(null);
  const [dismissedId, setDismissedId] = useState(() => {
    try { return window.localStorage.getItem(`contributor-delivery-seen:${accountId}`); } catch { return null; }
  });
  useEffect(() => {
    try { setDismissedId(window.localStorage.getItem(`contributor-delivery-seen:${accountId}`)); }
    catch { setDismissedId(null); }
  }, [accountId]);
  useEffect(() => {
    let current = true;
    setLatestDelivery(null);
    const refresh = () => { void service.load().then(result => {
      if (current) setLatestDelivery(result.data.requests.find(request => request.status === 'fulfilled' && Boolean(request.kind)) ?? null);
    }).catch(() => { /* Keep task notices available if rewards cannot be loaded. */ }); };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { current = false; window.clearInterval(timer); };
  }, [service, accountId]);
  const revisions = items.filter(item => ['rejected', 'needs_revision'].includes(item.status)).length;
  const showDelivery = latestDelivery && latestDelivery.id !== dismissedId;
  if (!revisions && !showDelivery) return null;
  return (
    <div className="ts-stack ts-stack--sm" aria-label="Contributor updates">
      {revisions > 0 ? (
        <Notice tone="warning" title={`${revisions} ${revisions === 1 ? 'expression needs' : 'expressions need'} revision`} action={<Button size="sm" onClick={onOpenTasks}>View tasks</Button>}>
          <p>Reviewer feedback is ready.</p>
        </Notice>
      ) : null}
      {showDelivery && latestDelivery ? (
        <Notice tone="success" title={`${latestDelivery.kind === 'airtime' ? 'Airtime' : 'Mobile data'} delivered`} action={<>
          <Button size="sm" onClick={onOpenHistory}>View history</Button>
          <button type="button" className="ts-btn ts-btn--ghost ts-btn--icon ts-btn--sm" aria-label="Dismiss delivery update" onClick={() => { setDismissedId(latestDelivery.id); try { window.localStorage.setItem(`contributor-delivery-seen:${accountId}`, latestDelivery.id); } catch { /* Dismiss for this session. */ } }}><Icon name="close" /></button>
        </>}>
          <p>See the delivery details in your redemption history.</p>
        </Notice>
      ) : null}
    </div>
  );
}

export function ContributorStreak({ service = livePaymentService, onOpenTasks }: { service?: ContributorPaymentService; onOpenTasks: () => void }) {
  const [streak, setStreak] = useState<Streak | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void service.load().then(result => { if (current) setStreak(result.data.streak ?? { current: 0, best: 0, lastDay: '', activeToday: false }); })
      .catch(() => { if (current) setError('Your streak could not be loaded. Try again later.'); });
    return () => { current = false; };
  }, [service]);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const last = streak?.lastDay ? Date.parse(`${streak.lastDay}T00:00:00Z`) : NaN;
  const recent = Array.from({ length: 7 }, (_, index) => {
    const day = today - (6 - index) * 86400000;
    const earned = Boolean(streak?.current && day <= last && day > last - streak.current * 86400000);
    return { label: new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(new Date(day)), earned, today: index === 6 };
  });
  return (
    <section className="ts-split ts-split--even" aria-label="Contribution streak">
      <div className="ts-panel cw-streak-hero">
        {error ? <p role="alert" className="ts-notice ts-notice--danger">{error}</p> : null}
        <div className="cw-streak-hero__count">
          <span className={`cw-streak-hero__flame${streak?.activeToday ? ' is-lit' : ''}`} aria-hidden="true"><Icon name="flame" /></span>
          <div>
            <p className="ts-overline">Current streak</p>
            <p className="cw-streak-hero__value">{streak ? streak.current : '—'} <small>{streak?.current === 1 ? 'day' : 'days'}</small></p>
          </div>
        </div>
        <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>
          {streak?.activeToday ? 'Today is complete. Come back tomorrow to keep it going.' : streak?.current ? 'Submit a new expression today to continue your streak.' : 'Submit a new expression today to start a streak.'}
        </p>
        <ol className="cw-week" aria-label="Last seven UTC days">
          {recent.map((day, index) => (
            <li key={index} className={day.earned ? 'is-earned' : day.today ? 'is-today' : ''}>
              <span aria-label={`${day.label}: ${day.earned ? 'contributed' : 'no submission'}`}>{day.earned ? <Icon name="check" /> : null}</span>
              <small>{day.today ? 'Today' : day.label}</small>
            </li>
          ))}
        </ol>
        {streak && !streak.activeToday ? <Button variant="primary" iconRight="arrow" onClick={onOpenTasks}>Go to assignments</Button> : null}
      </div>
      <div className="ts-stack">
        <StatGrid columns={2}>
          <StatCard icon="award" label="Best streak" value={streak ? streak.best : '—'} hint={streak?.best === 1 ? 'day' : 'days'} />
          <StatCard icon="calendar" label="Counted in" value="UTC" animate={false} hint="A new day starts at 00:00 UTC" />
        </StatGrid>
        <div className="ts-panel ts-panel--tint">
          <p className="ts-overline">What counts</p>
          <p style={{ fontSize: 'var(--fs-sm)' }}>At least one expression sent for review for the first time that day (UTC). Approval is not needed; resubmitting a returned expression does not count.</p>
        </div>
      </div>
    </section>
  );
}

const REQUEST_STATUS: Record<PaymentRequest['status'], { label: string; tone: 'info' | 'success' | 'danger' | 'accent' }> = {
  submitted: { label: 'Pending review', tone: 'info' },
  approved: { label: 'Approved · awaiting delivery', tone: 'accent' },
  rejected: { label: 'Rejected · points returned', tone: 'danger' },
  paid: { label: 'Delivered', tone: 'success' },
  fulfilled: { label: 'Delivered', tone: 'success' },
};

export function ContributorRewards({ service = livePaymentService, onOpenTasks, initialView = 'redeem' }: { service?: ContributorPaymentService; onOpenTasks: () => void; initialView?: 'redeem' | 'history' }) {
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [kind, setKind] = useState<'airtime' | 'data'>('airtime');
  const [selectedKind, setSelectedKind] = useState<'airtime' | 'data' | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const lastSelectRef = useRef<HTMLButtonElement | null>(null);
  const [view, setView] = useState<'earn' | 'redeem' | 'history'>(initialView);
  useEffect(() => setView(initialView), [initialView]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [network, setNetwork] = useState<'MTN' | 'Telecel' | 'AT'>('MTN');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [points, setPoints] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const result = await service.load();
      setRewards(result.data.rewards ?? null); setRequests(result.data.requests);
      if (result.data.rewards) setPoints(String(result.data.rewards.redemptionMinimum));
    } catch (reason) { setError(friendlyError(reason, 'Your points').message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!selectedKind) return;
    dialogRef.current?.querySelector('select')?.focus();
    return () => lastSelectRef.current?.focus();
  }, [selectedKind]);
  const pendingRequest = requests.some(request => ['submitted', 'approved'].includes(request.status));
  const pointAmount = Number(points);
  const eligible = Boolean(rewards && rewards.balance >= rewards.redemptionMinimum && !pendingRequest && service.redeem);
  const canRedeem = Boolean(eligible && rewards && Number.isSafeInteger(pointAmount) && pointAmount >= rewards.redemptionMinimum && pointAmount <= rewards.balance);
  const amountMinor = rewards && Number.isSafeInteger(pointAmount) && pointAmount >= rewards.redemptionMinimum && pointAmount <= rewards.balance
    ? Math.round(pointAmount / rewards.redemptionMinimum * rewards.cedisPerRedemption * 100) : 0;
  const redemptions = requests.filter(request => request.kind === 'airtime' || request.kind === 'data');
  const matchingRedemptions = redemptions.filter(request => {
    const status = request.status === 'submitted' ? 'pending' : ['fulfilled', 'paid'].includes(request.status) ? 'delivered' : request.status;
    const query = historySearch.trim().toLowerCase();
    return (historyStatus === 'all' || historyStatus === status)
      && (!query || [request.id, request.description, request.kind, request.network, request.phoneNumber, request.paymentReference].some(value => String(value ?? '').toLowerCase().includes(query)));
  });

  return (
    <section className="ts-stack" aria-label="Contributor rewards">
      {error ? <Notice tone="danger" role="alert" action={<Button size="sm" icon="refresh" onClick={() => void refresh()}>Try again</Button>}>{error}</Notice> : null}
      {notice ? <Notice tone="success" role="status">{notice}</Notice> : null}
      <StatGrid label="Your points">
        <StatCard icon="award" label="Available points" value={loading && !rewards ? '…' : rewards?.balance ?? '—'} hint={rewards ? `Redeemable from ${rewards.redemptionMinimum}` : undefined} />
        <StatCard icon="layers" label="Earned in total" value={loading && !rewards ? '…' : rewards?.lifetime ?? '—'} hint="Including points already redeemed" />
        <StatCard icon="check-circle" label="Per approved expression" value={rewards?.pointsPerExpression ?? '—'} hint="Credited once, on approval" />
        <StatCard icon="calendar" label="Daily limit" value={rewards?.dailyCap ?? '—'} hint="Points per approval day (UTC)" />
      </StatGrid>

      {rewards ? (
        <>
          <Segmented
            label="Reward options"
            value={view}
            onChange={setView}
            options={[
              { value: 'earn', label: 'How points work', icon: 'info' },
              { value: 'redeem', label: 'Redeem', icon: 'gift' },
              { value: 'history', label: 'History', icon: 'clock', count: redemptions.length },
            ]}
          />

          {view === 'earn' ? (
            <div className="ts-panel ts-enter" role="tabpanel">
              <Steps label="How points work" steps={[
                { title: 'An expression is approved', detail: `${rewards.pointsPerExpression} points, credited once per expression. Revisions do not earn again.`, icon: 'check' },
                { title: `Up to ${rewards.dailyCap} a day`, detail: 'Counted by approval date in UTC.', icon: 'calendar' },
                { title: `Redeem from ${rewards.redemptionMinimum}`, detail: `Every ${rewards.redemptionMinimum} points = GH₵${rewards.cedisPerRedemption} of airtime or mobile data.`, icon: 'gift' },
                { title: 'Reviewed, then delivered', detail: 'The team approves each request and records delivery.', icon: 'send' },
              ]} />
              <div className="ts-cluster">
                <Button variant="primary" iconRight="arrow" onClick={onOpenTasks}>Open assignments</Button>
                <span className="ts-hint">Points are redeemed for airtime or mobile data only.</span>
              </div>
            </div>
          ) : view === 'history' ? (
            <div className="ts-stack ts-enter" role="tabpanel">
              <div className="ts-toolbar">
                <label className="ts-search">
                  <span className="sr-only">Search redemptions</span>
                  <Icon name="search" />
                  <input type="search" placeholder="Search request ID or recipient" value={historySearch} onChange={event => setHistorySearch(event.target.value)} />
                </label>
                <label>
                  <span className="sr-only">Filter redemption status</span>
                  <select className="ts-select ts-select--sm" value={historyStatus} onChange={event => setHistoryStatus(event.target.value)}>
                    <option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="delivered">Delivered</option><option value="rejected">Rejected</option>
                  </select>
                </label>
                <span className="ts-toolbar__count">{matchingRedemptions.length} of {redemptions.length}</span>
                <Button size="sm" icon="refresh" busy={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
              </div>
              {matchingRedemptions.length ? (
                <div className="ts-stack ts-stack--sm ts-stagger">
                  {matchingRedemptions.map(request => {
                    const meta = REQUEST_STATUS[request.status];
                    return (
                      <article key={request.id} className="ts-panel ts-panel--tight cw-redemption">
                        <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap' }}>
                          <span className="ts-row">
                            <span className="ts-card__icon" aria-hidden="true"><Icon name={request.kind === 'airtime' ? 'phone' : 'globe'} /></span>
                            <span className="ts-stack" style={{ ['--gap' as string]: '0.1rem' }}>
                              <strong>{request.kind === 'airtime' ? 'Airtime' : 'Mobile data'} · GH₵{(request.amountMinor / 100).toFixed(2)}</strong>
                              <small className="ts-muted">{request.points ?? '—'} points · {new Date(request.createdAt).toLocaleString()}</small>
                            </span>
                          </span>
                          <Badge tone={meta.tone} dot>{meta.label}</Badge>
                        </div>
                        <dl className="ts-facts">
                          <div className="ts-fact"><dt>Network</dt><dd>{request.network || '—'}</dd></div>
                          <div className="ts-fact"><dt>Recipient</dt><dd>{request.phoneNumber || '—'}</dd></div>
                          <div className="ts-fact"><dt>Request ID</dt><dd><code>{request.id}</code></dd></div>
                          {request.paymentReference ? <div className="ts-fact"><dt>Delivery reference</dt><dd><code>{request.paymentReference}</code></dd></div> : null}
                        </dl>
                        <p className="ts-hint">
                          {request.status === 'submitted' ? 'Waiting for the team to review your request.'
                            : request.status === 'approved' ? 'Approved and waiting for delivery.'
                              : request.status === 'rejected' ? (request.adminNote || 'Your points have been returned to your balance.')
                                : 'Delivery has been recorded.'}
                        </p>
                      </article>
                    );
                  })}
                </div>
              ) : <EmptyState boxed compact icon="clock" title={redemptions.length ? 'No match' : 'No redemptions yet'} body={redemptions.length ? 'No redemptions match your search or status filter.' : 'Your requests will appear here with their review and delivery status.'} />}
            </div>
          ) : (
            <div className="ts-stack ts-enter" role="tabpanel">
              <div className="ts-panel">
                <div className="cw-redeem">
                  <label className="ts-field cw-redeem__amount">
                    <span className="ts-label">Points to redeem</span>
                    <input className="ts-input" type="number" min={rewards.redemptionMinimum} max={rewards.balance} step="1" inputMode="numeric" value={points} disabled={!eligible} onChange={event => setPoints(event.target.value)} />
                    <small>{canRedeem ? `Worth GH₵${(amountMinor / 100).toFixed(2)} of airtime or data` : rewards.balance < rewards.redemptionMinimum ? `${rewards.redemptionMinimum} points required · ${rewards.balance} available` : `Choose ${rewards.redemptionMinimum}–${rewards.balance} available points`}</small>
                  </label>
                  <p className="ts-hint cw-redeem__rate">Every {rewards.redemptionMinimum} points is worth GH₵{rewards.cedisPerRedemption} of airtime or mobile data.</p>
                </div>
                <div className="ts-grid ts-grid--2">
                  {(['airtime', 'data'] as const).map(option => (
                    <article key={option} className={`ts-card cw-reward-option${selectedKind === option ? ' is-selected' : ''}`}>
                      <span className="ts-row">
                        <span className="ts-card__icon" aria-hidden="true"><Icon name={option === 'airtime' ? 'phone' : 'globe'} /></span>
                        <span className="ts-stack" style={{ ['--gap' as string]: '0.1rem' }}>
                          <h3 className="ts-card__title">{option === 'airtime' ? 'Airtime' : 'Mobile data'}</h3>
                          <span className="ts-card__body">GH₵{(canRedeem ? amountMinor / 100 : rewards.cedisPerRedemption).toFixed(2)} · {canRedeem ? pointAmount : rewards.redemptionMinimum} points</span>
                        </span>
                      </span>
                      <button type="button" className="ts-btn ts-btn--primary ts-btn--sm" disabled={!eligible} onClick={event => { lastSelectRef.current = event.currentTarget; setKind(option); setError(''); setSelectedKind(option); }}>Choose {option === 'airtime' ? 'airtime' : 'data'}</button>
                    </article>
                  ))}
                </div>
                {pendingRequest ? <p className="ts-hint">Your current redemption is being processed. You can request another after it is delivered or rejected.</p> : null}
                {rewards.balance < rewards.redemptionMinimum ? <p className="ts-hint">Earn {rewards.redemptionMinimum - rewards.balance} more points to redeem.</p> : null}
              </div>
              <div className="ts-panel ts-panel--tint">
                <p className="ts-overline">Requests and delivery</p>
                <p style={{ fontSize: 'var(--fs-sm)' }}>Each request is reviewed by the team. Approval and delivery are separate steps; follow both under History.</p>
              </div>
              {selectedKind && eligible ? (
                <Dialog
                  title={`${kind === 'airtime' ? 'Airtime' : 'Data'} delivery details`}
                  lede={`${pointAmount} points · GH₵${(amountMinor / 100).toFixed(2)} of ${kind === 'airtime' ? 'airtime' : 'mobile data'}`}
                  busy={busy}
                  onClose={() => setSelectedKind(null)}
                >
                  <form ref={dialogRef} className="ts-stack ts-stack--md" onSubmit={async event => {
                    event.preventDefault();
                    if (busy || !service.redeem || !canRedeem) return;
                    setBusy(true); setError('');
                    try {
                      await service.redeem({ points: pointAmount, kind, network, phoneNumber });
                      setNotice(`${kind === 'airtime' ? 'Airtime' : 'Data'} redemption requested. The team will review and deliver it.`);
                      setSelectedKind(null);
                      await refresh();
                      setView('history');
                      window.dispatchEvent(new Event('contributor-rewards-updated'));
                    } catch (reason) {
                      setError(friendlyError(reason, 'The redemption service').message);
                    } finally { setBusy(false); }
                  }}>
                    {error ? <p role="alert" className="ts-notice ts-notice--danger">{error}</p> : null}
                    <label className="ts-field"><span className="ts-label">Mobile network</span><select className="ts-select" value={network} onChange={event => setNetwork(event.target.value as 'MTN' | 'Telecel' | 'AT')}><option>MTN</option><option>Telecel</option><option>AT</option></select></label>
                    <label className="ts-field"><span className="ts-label">Ghana mobile number</span><input className="ts-input" type="tel" required inputMode="tel" autoComplete="tel" placeholder="0241234567" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} /><small>The number that receives the {kind === 'airtime' ? 'airtime' : 'data'}.</small></label>
                    <p className="ts-consequence"><Icon name="info" /><span>Next: the team reviews the request, then records delivery. Delivery is not instant; your points are returned if a request is rejected.</span></p>
                    <button type="submit" className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" disabled={busy || !canRedeem} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><span>{busy ? 'Requesting…' : 'Request redemption'}</span></button>
                  </form>
                </Dialog>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
