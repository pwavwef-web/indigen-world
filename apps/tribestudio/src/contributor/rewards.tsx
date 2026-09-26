import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useRoute } from '../router';
import type { Item } from './model';
import { useWorkspace } from './workspace';
import './rewards.css';

export type PaymentRequest = { id: string; amountMinor: number; currency: 'GHS'; description: string; status: 'submitted' | 'approved' | 'rejected' | 'paid' | 'fulfilled'; points?: number; kind?: 'airtime' | 'data'; network?: string; phoneNumber?: string; createdAt: string; adminNote?: string; paidAt?: string | null; paymentReference?: string };
type Rewards = { balance: number; lifetime: number; pointsPerExpression: number; dailyCap: number; redemptionMinimum: number; cedisPerRedemption: number };
export type Streak = { current: number; best: number; lastDay: string; activeToday: boolean };
type RewardView = { requests: PaymentRequest[]; rewards: Rewards; streak: Streak };
export type RedemptionChoice = { points: number; kind: 'airtime' | 'data'; network: 'MTN' | 'Telecel' | 'AT'; phoneNumber: string };
export type ContributorPaymentService = { load: () => Promise<{ data: RewardView }>; redeem?: (choice: RedemptionChoice) => Promise<unknown> };
const loadRewards = httpsCallable<Record<string, never>, RewardView>(functions, 'getContributorRewards');
const redeemPoints = httpsCallable<RedemptionChoice, { requestId: string }>(functions, 'redeemContributorPoints');
const livePaymentService: ContributorPaymentService = { load: () => loadRewards({}), redeem: choice => redeemPoints(choice) };
const previewState: RewardView = { rewards: { balance: 900, lifetime: 1200, pointsPerExpression: 10, dailyCap: 300, redemptionMinimum: 300, cedisPerRedemption: 5 }, streak: { current: 3, best: 5, lastDay: new Date(Date.now() - 86400000).toISOString().slice(0, 10), activeToday: false }, requests: [{ id: 'sample-delivered', points: 300, amountMinor: 500, currency: 'GHS', description: '300 points for airtime', kind: 'airtime', network: 'MTN', phoneNumber: '+233241234567', status: 'fulfilled', createdAt: new Date().toISOString(), paymentReference: 'SAMPLE-DELIVERY' }] };
const previewService: ContributorPaymentService = { load: async () => ({ data: structuredClone(previewState) }), redeem: async choice => { if (choice.points > previewState.rewards.balance) throw new Error('Not enough points.'); previewState.rewards.balance -= choice.points; previewState.requests.unshift({ ...choice, id: `sample-${Date.now()}`, amountMinor: Math.round(choice.points / 300 * 500), currency: 'GHS', description: `${choice.points} points for ${choice.kind}`, status: 'submitted', createdAt: new Date().toISOString() }); } };
export function RewardsPage({ streak = false, history = false }: { streak?: boolean; history?: boolean }) {
  const data = useWorkspace(); const { navigate } = useRoute();
  const service = data.preview ? previewService : livePaymentService;
  const onOpenTasks = () => navigate(data.paths.section('assignments'));
  return <div className="cw-page contributor-rewards-page">{streak ? <ContributorStreak service={service} onOpenTasks={onOpenTasks} /> : <ContributorRewards service={service} onOpenTasks={onOpenTasks} initialView={history ? 'history' : 'redeem'} />}</div>;
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
  return <div className="contributor-activity-notices" aria-label="Contributor updates">
    {revisions > 0 && <section className="contributor-activity-notice is-revision"><div><strong>{revisions} {revisions === 1 ? 'expression needs' : 'expressions need'} revision</strong><p>Reviewer feedback is ready in Tasks.</p></div><button type="button" onClick={onOpenTasks}>View Tasks</button></section>}
    {showDelivery && <section className="contributor-activity-notice is-delivered"><div><strong>{latestDelivery.kind === 'airtime' ? 'Airtime' : 'Mobile data'} delivered</strong><p>See the delivery details in your redemption history.</p></div><div className="contributor-activity-notice__actions"><button type="button" onClick={onOpenHistory}>View History</button><button type="button" aria-label="Dismiss delivery update" onClick={() => { setDismissedId(latestDelivery.id); try { window.localStorage.setItem(`contributor-delivery-seen:${accountId}`, latestDelivery.id); } catch { /* Dismiss for this session. */ } }}>×</button></div></section>}
  </div>;
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
  return <section className="contributor-streak" aria-label="Contribution streak"><div className="contributor-streak__heading"><span className="contributor-kicker">KEEP CONTRIBUTING</span><h2>Your streak</h2><p>Submit at least one new expression each UTC day to keep your streak going.</p></div>{error && <p role="alert">{error}</p>}<div className="contributor-streak__hero"><span className="contributor-streak__flame" aria-hidden="true">✦</span><div><span>Current streak</span><strong>{streak ? streak.current : '—'} <small>{streak?.current === 1 ? 'day' : 'days'}</small></strong><p>{streak?.activeToday ? 'Today is complete. Come back tomorrow to keep it going.' : streak?.current ? 'Complete an expression today to continue your streak.' : 'Complete an expression today to start a streak.'}</p></div></div><div className="contributor-streak__week" aria-label="Last seven UTC days">{recent.map((day, index) => <div key={index}><span className={day.earned ? 'is-earned' : ''} aria-label={`${day.label}: ${day.earned ? 'completed' : 'not completed'}`}>{day.earned ? '✓' : '·'}</span><small>{day.today ? 'Today' : day.label}</small></div>)}</div><div className="contributor-streak__best"><span>Best streak</span><strong>{streak ? streak.best : '—'} {streak?.best === 1 ? 'day' : 'days'}</strong></div>{streak && !streak.activeToday && <button type="button" className="contributor-streak__tasks" onClick={onOpenTasks}>Go to Tasks <span aria-hidden="true">→</span></button>}</section>;
}
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Rewards could not be loaded.'); }
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
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); setSelectedKind(null); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? []);
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
    else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
  };
  return <section className="contributor-rewards" aria-label="Contributor rewards">
    <div className="contributor-rewards__heading"><div><span className="contributor-rewards__eyebrow">Your contributions</span><h2>Rewards</h2></div></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="contributor-rewards__balance"><div className="contributor-rewards__balance-total"><span>Available points</span><strong><span aria-hidden="true">✦</span>{loading ? '…' : rewards?.balance.toLocaleString() ?? '—'}</strong></div></div>
    {rewards && <>
      <div className="contributor-rewards__tabs" role="tablist" aria-label="Reward options"><button type="button" role="tab" aria-selected={view === 'earn'} onClick={() => setView('earn')}>Earn</button><button type="button" role="tab" aria-selected={view === 'redeem'} onClick={() => setView('redeem')}>Redeem</button><button type="button" role="tab" aria-selected={view === 'history'} onClick={() => setView('history')}>History</button></div>
      {view === 'history' ? <div className="contributor-rewards__history-view" role="tabpanel"><div className="contributor-rewards__history-tools"><label><span className="sr-only">Search redemptions</span><input type="search" placeholder="Search request ID or recipient" value={historySearch} onChange={event => setHistorySearch(event.target.value)} /></label><label><span className="sr-only">Filter redemption status</span><select value={historyStatus} onChange={event => setHistoryStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="delivered">Delivered</option><option value="rejected">Rejected</option></select></label><div className="contributor-rewards__history-meta"><span>Showing {matchingRedemptions.length} of {redemptions.length} redemptions</span><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div></div>{matchingRedemptions.length ? <div className="contributor-rewards__history-list">{matchingRedemptions.map(request => { const status = request.status === 'submitted' ? 'Pending' : request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Rejected' : 'Delivered'; return <article key={request.id}><dl><div><dt>Request ID</dt><dd><code>{request.id}</code></dd></div><div><dt>Reward</dt><dd>{request.kind === 'airtime' ? 'Airtime' : 'Mobile data'}</dd></div><div><dt>Network</dt><dd>{request.network || '—'}</dd></div><div><dt>Recipient</dt><dd>{request.phoneNumber || '—'}</dd></div><div><dt>Points</dt><dd>{request.points ?? '—'}</dd></div><div><dt>Value</dt><dd>GH₵{(request.amountMinor / 100).toFixed(2)}</dd></div><div><dt>Status</dt><dd><span className={`contributor-rewards__request-status is-${request.status}`}>{status}</span></dd></div><div><dt>Requested</dt><dd>{new Date(request.createdAt).toLocaleString()}</dd></div>{request.paymentReference && <div><dt>Delivery reference</dt><dd><code>{request.paymentReference}</code></dd></div>}</dl>{request.status === 'submitted' && <p>Waiting for the team to review your request.</p>}{request.status === 'approved' && <p>Approved and waiting for delivery.</p>}{request.status === 'rejected' && <p>{request.adminNote || 'Your points have been returned to your balance.'}</p>}{request.status === 'fulfilled' && <p>Delivery has been recorded.</p>}</article>; })}</div> : <p className="contributor-rewards__history-empty">{redemptions.length ? 'No redemptions match your search or status filter.' : 'No redemptions yet. Your requests will appear here.'}</p>}</div> : view === 'earn' ? <div className="contributor-rewards__earn" role="tabpanel"><div className="contributor-rewards__tile-icon" aria-hidden="true">✦</div><div><h3>Complete expressions</h3><p>Earn {rewards.pointsPerExpression} points when an expression is approved. Submissions await review; revisions do not earn points again.</p><button className="contributor-rewards__earn-button" type="button" onClick={onOpenTasks}>Earn points <span aria-hidden="true">→</span></button></div></div> : <div role="tabpanel" className="contributor-rewards__catalog"><p className="contributor-rewards__intro">Choose how many points to redeem, starting at {rewards.redemptionMinimum}. Every {rewards.redemptionMinimum} points is worth GH₵{rewards.cedisPerRedemption}.</p><label className="contributor-rewards__amount">Points to redeem<input type="number" min={rewards.redemptionMinimum} max={rewards.balance} step="1" inputMode="numeric" value={points} disabled={!eligible} onChange={event => setPoints(event.target.value)} /><small>{canRedeem ? `Worth GH₵${(amountMinor / 100).toFixed(2)}` : `Choose ${rewards.redemptionMinimum}–${rewards.balance} available points`}</small></label>{(['airtime', 'data'] as const).map(option => <article key={option} className={`contributor-rewards__item ${selectedKind === option ? 'is-selected' : ''}`}><div className={`contributor-rewards__tile-icon is-${option}`} aria-hidden="true">{option === 'airtime' ? '◉' : '▤'}</div><div className="contributor-rewards__item-copy"><h3>{option === 'airtime' ? 'Airtime' : 'Mobile data'}</h3><p>GH₵{(amountMinor / 100).toFixed(2)} value</p><strong><span aria-hidden="true">✦</span> {canRedeem ? pointAmount : rewards.redemptionMinimum} points</strong></div><button type="button" disabled={!eligible} onClick={event => { lastSelectRef.current = event.currentTarget; setKind(option); setError(''); setSelectedKind(option); }}>Select</button></article>)}
        {pendingRequest && <p className="contributor-rewards__hint">Your current redemption is being processed. You can request another after it is delivered or rejected.</p>}{rewards.balance < rewards.redemptionMinimum && <p className="contributor-rewards__hint">Earn {rewards.redemptionMinimum - rewards.balance} more points to redeem.</p>}
        {selectedKind && eligible && <div className="contributor-rewards__dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setSelectedKind(null); }}><form ref={dialogRef} className="contributor-rewards__form contributor-rewards__dialog" role="dialog" aria-modal="true" aria-labelledby="contributor-delivery-title" onKeyDown={handleDialogKeyDown} onSubmit={async event => { event.preventDefault(); if (!service.redeem || !canRedeem) return; setBusy(true); setError(''); try { await service.redeem({ points: pointAmount, kind, network, phoneNumber }); setNotice(`${kind === 'airtime' ? 'Airtime' : 'Data'} redemption requested. The team will review and deliver it.`); setSelectedKind(null); await refresh(); setView('history'); window.dispatchEvent(new Event('contributor-rewards-updated')); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Redemption could not be requested.'); } finally { setBusy(false); } }}><div className="contributor-rewards__dialog-heading"><div><span className="contributor-kicker">REDEEM POINTS</span><h3 id="contributor-delivery-title">{kind === 'airtime' ? 'Airtime' : 'Data'} delivery details</h3></div><button type="button" className="contributor-rewards__dialog-close" aria-label="Close delivery details" disabled={busy} onClick={() => setSelectedKind(null)}>×</button></div><p className="contributor-rewards__dialog-summary">{pointAmount} points · GH₵{(amountMinor / 100).toFixed(2)} {kind === 'airtime' ? 'airtime' : 'mobile data'}</p>{error && <p role="alert">{error}</p>}<label>Mobile network<select value={network} onChange={event => setNetwork(event.target.value as 'MTN' | 'Telecel' | 'AT')}><option>MTN</option><option>Telecel</option><option>AT</option></select></label><label>Ghana mobile number<input type="tel" required inputMode="tel" autoComplete="tel" placeholder="0241234567" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} /></label><button type="submit" disabled={busy || !canRedeem}>{busy ? 'Requesting…' : 'Redeem'}</button><small>The team reviews and delivers redemptions. Delivery is not instant.</small></form></div>}
        <aside className="contributor-rewards__more"><div><span className="contributor-rewards__more-kicker">YOUR POINTS, YOUR PROGRESS</span><h3>We're just getting started</h3><p>Airtime and mobile data are available now. We're exploring other ways to use points, so keep contributing and check back for updates.</p></div><div className="contributor-rewards__more-art" aria-hidden="true"><span>✦</span><span>◈</span><span>✦</span></div></aside></div>}
    </>}
  </section>;
}
