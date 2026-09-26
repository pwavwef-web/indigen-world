import { ContributorIssues } from './ContributorIssues';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { confirmPasswordReset, sendPasswordResetEmail, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { signOutUser, useAuth } from '../auth';
import { matchRoute, useRoute } from '../router';
import './contributor.css';

export type Item = { id: string; expression: string; translation: string; alternatives: string[];
  revision: number; status: string; unsure?: boolean; submissionId?: string; feedback?: string; reviewedAt?: string | null };
type Work = { id: string; title: string; createdAt: string; instructions?: string; dialect?: string; tone?: string; deadline?: string; helpContact?: string };
type Status = 'Not started' | 'Drafts' | 'Submitted' | 'Needs revision' | 'I’m not sure';
export function expressionView(item: Item): 'untranslated' | 'translated' | 'reviewed' {
  if (item.reviewedAt || ['verified', 'rejected', 'needs_revision', 'archived'].includes(item.status)) return 'reviewed';
  return item.translation.trim() || item.submissionId ? 'translated' : 'untranslated';
}
const save = httpsCallable<Record<string, unknown>, { revision: number; submissionId?: string }>(functions, 'saveExpressionAnswer');
export type PayoutProfile = { bankName: string; accountName: string; accountNumber: string; branch: string; currency: 'GHS'; verificationStatus: 'pending' | 'verified' | 'rejected'; verificationNote?: string; updatedAt: string };
export type PaymentRequest = { id: string; amountMinor: number; currency: 'GHS'; description: string; status: 'submitted' | 'approved' | 'rejected' | 'paid' | 'fulfilled'; points?: number; kind?: 'airtime' | 'data'; network?: string; phoneNumber?: string; createdAt: string; adminNote?: string; paidAt?: string | null; paymentReference?: string };
type Rewards = { balance: number; lifetime: number; pointsPerExpression: number; dailyCap: number; redemptionMinimum: number; cedisPerRedemption: number };
export type Streak = { current: number; best: number; lastDay: string; activeToday: boolean };
const loadPayments = httpsCallable<Record<string, never>, { profile: PayoutProfile | null; requests: PaymentRequest[]; rewards: Rewards; streak: Streak }>(functions, 'getContributorPayments');
const savePayoutProfile = httpsCallable<Record<string, string>, { verificationStatus: PayoutProfile['verificationStatus'] }>(functions, 'saveContributorPayoutProfile');
export type RedemptionChoice = { points: number; kind: 'airtime' | 'data'; network: 'MTN' | 'Telecel' | 'AT'; phoneNumber: string };
const redeemPoints = httpsCallable<RedemptionChoice, { requestId: string }>(functions, 'requestContributorPayment');


export function submittedCount(items: Item[]) {
  return items.filter(item => Boolean(item.submissionId) && !['rejected', 'needs_revision'].includes(item.status)).length;
}
export function nextContribution(items: Item[]) {
  return items.find(item => ['rejected', 'needs_revision'].includes(item.status))
    ?? items.find(item => !item.submissionId && !item.unsure)
    ?? items.find(item => !item.submissionId);
}
export function ContributorPortal() {
  const { user, ready } = useAuth();
  const { path, search, navigate } = useRoute();
  const params = matchRoute('/contributor/:uid/:work', path);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [access, setAccess] = useState<'loading' | 'active' | 'denied'>('loading');
  const [works, setWorks] = useState<Work[]>([]);
  const [worksLoaded, setWorksLoaded] = useState(false);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [activeTab, setActiveTab] = useState<'expressions' | 'rewards' | 'streak'>('expressions');
  const [rewardsInitialView, setRewardsInitialView] = useState<'redeem' | 'history'>('redeem');
  const code = new URLSearchParams(search).get('oobCode');
  useEffect(() => {
    if (!user || code) return;
    return onSnapshot(doc(db, 'contributorAccounts', user.uid), account => {
      if (account.get('status') !== 'active') {
        setAccess('denied'); setItems([]); setWorks([]); return;
      }
      setNeedsActivation(account.get('requiresPasswordChange') === true);
      setAccess('active');
      if (!params && account.get('defaultWork')) navigate('/contributor/' + user.uid + '/' + account.get('defaultWork'), { replace: true });
    }, () => { setAccess('denied'); setItems([]); setError('Unable to verify your contributor invitation.'); });
  }, [user?.uid, code, params?.uid, navigate]);
  useEffect(() => {
    if (!user || access !== 'active' || code) return;
    return onSnapshot(collection(db, 'contributorAccounts', user.uid, 'works'), snapshot => {
      setWorks(snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Work).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setWorksLoaded(true);
    }, () => setError('Unable to load your assignments. Please retry.'));
  }, [user?.uid, access, code]);
  useEffect(() => {
    if (!user || !params || user.uid !== params.uid || code || access !== 'active') return;
    setLoaded(false);
    return onSnapshot(collection(db, `contributorAccounts/${user.uid}/works/${params.work}/items`), snapshot => {
      setItems(snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Item)); setLoaded(true);
    }, e => { setError(e.message); setLoaded(true); });
  }, [user?.uid, params?.uid, params?.work, code, access]);
  const activeWork = works.find(w => w.id === params?.work);
  const submitted = submittedCount(items);
  return <div className="contributor-portal"><ContributorHeader title={activeWork?.title} completed={submitted} total={items.length} pending={pending}
    paymentsEnabled={access === 'active' && !needsActivation && !code} accountId={user?.uid} onSignOut={() => void signOutUser()} />
    <main id="main-content" tabIndex={-1}>
      {error && <p role="alert">{error} <button onClick={() => window.location.reload()}>Retry</button></p>}
      {!ready ? <p>Opening your portal…</p> : code || !user ? <ContributorSignIn code={code} />
        : params && user.uid !== params.uid ? <p role="alert">This invitation belongs to another account. Sign out and use the invited email address.</p>
        : access === 'denied' ? <p role="alert">This portal is available only to invited contributors. Contact the team for an invitation.</p>
        : access === 'active' && needsActivation ? <ContributorActivation />
        : access !== 'active' || !params || !loaded || !worksLoaded ? <p>Loading your expressions…</p>
        : !works.some(w => w.id === params.work) ? <EmptyState title="Assignment unavailable" body="This assignment is not available to your account. Contact the team if you think this is a mistake." /> : <>
          <ContributorActivityNotice items={items} accountId={user.uid} onOpenTasks={() => setActiveTab('expressions')} onOpenHistory={() => { setRewardsInitialView('history'); setActiveTab('rewards'); }} />
          <ContributorTabs active={activeTab} onChange={setActiveTab} pending={pending} completed={submitted} total={items.length} />
          {activeTab === 'rewards' ? <div role="tabpanel" id="contributor-panel-rewards" aria-labelledby="contributor-tab-rewards"><ContributorRewards initialView={rewardsInitialView} onOpenTasks={() => setActiveTab('expressions')} /></div> : activeTab === 'streak' ? <div role="tabpanel" id="contributor-panel-streak" aria-labelledby="contributor-tab-streak"><ContributorStreak onOpenTasks={() => setActiveTab('expressions')} /></div> : <div role="tabpanel" id="contributor-panel-expressions" aria-labelledby="contributor-tab-expressions">
            <AssignmentSelector works={works} active={params.work} itemCount={items.length} completed={submitted} pending={pending}
              onChange={work => navigate('/contributor/' + user.uid + '/' + work)} />
            <ContributionWorkspace guidance={activeWork} accountId={user.uid} key={user.uid + params.work} items={items} work={params.work} onPending={setPending} />
          </div>}
        </>}
    </main></div>;
}

export function ContributorHeader({ title, completed, total, accountId, pending, onSignOut, paymentsEnabled = false, paymentService }: { paymentService?: ContributorPaymentService; paymentsEnabled?: boolean; title?: string; completed: number; total: number; accountId?: string; pending: boolean; onSignOut: () => void }) {
  const paymentDialog = useRef<HTMLDialogElement>(null);
  const [showPayments, setShowPayments] = useState(false);
  return <header className="contributor-header"><div className="contributor-heading"><span className="contributor-kicker">INDIGEN WORLD · CONTRIBUTORS</span><h1>Your contributions</h1>
    {title && <p>{title}</p>}</div><div className="contributor-header-actions">{total > 0 && <span className="contributor-header-progress">{completed} / {total} submitted</span>}
      {accountId && <details className="contributor-account"><summary aria-label="Open account details"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></summary>
        <div><strong>Contributor account</strong><p className="contributor-identity">ID: <code>{accountId}</code></p><button hidden={!paymentsEnabled} onClick={() => { setShowPayments(true); paymentDialog.current?.showModal(); }}>Payment profile</button><button disabled={pending} onClick={onSignOut}>Sign out</button></div></details>}</div>{paymentsEnabled && <dialog ref={paymentDialog} className="contributor-payment-dialog" aria-label="Payment profile" onCancel={() => setShowPayments(false)}><div className="contributor-payment-dialog-heading"><h2>Payment profile</h2><button aria-label="Close payment profile" onClick={() => { paymentDialog.current?.close(); setShowPayments(false); }}>Close</button></div>{showPayments && <ContributorPayments service={paymentService} />}</dialog>}</header>;
}

type ContributorTab = 'expressions' | 'rewards' | 'streak';
export function ContributorTabs({ active, onChange, pending = false, completed = 0, total = 0, paymentService = livePaymentService }: { active: ContributorTab; onChange: (tab: ContributorTab) => void; pending?: boolean; completed?: number; total?: number; paymentService?: ContributorPaymentService }) {
  const [points, setPoints] = useState<number | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  useEffect(() => {
    let current = true;
    const refresh = () => { void paymentService.load().then(result => { if (current) { setPoints(result.data.rewards?.balance ?? null); setStreak(result.data.streak ?? null); } }).catch(() => { if (current) { setPoints(null); setStreak(null); } }); };
    refresh(); window.addEventListener('contributor-rewards-updated', refresh);
    return () => { current = false; window.removeEventListener('contributor-rewards-updated', refresh); };
  }, [active, paymentService]);
  const tabs: { id: ContributorTab; label: string; value: string; icon: string }[] = [
    { id: 'expressions', label: 'Tasks', value: total ? `${completed}/${total}` : 'Open', icon: '✎' },
    { id: 'rewards', label: 'Points', value: points === null ? '—' : points.toLocaleString(), icon: '✦' },
    { id: 'streak', label: 'Streak', value: streak === null ? '—' : `${streak.current} ${streak.current === 1 ? 'day' : 'days'}`, icon: '●' },
  ];
  return <div className="contributor-tab-navigation"><div className="contributor-tabs" role="tablist" aria-label="Contributor portal sections">{tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`contributor-tab-${tab.id}`} aria-controls={`contributor-panel-${tab.id}`} aria-selected={active === tab.id} disabled={pending && tab.id !== 'expressions'} onClick={() => onChange(tab.id)}><span className={`contributor-tab-icon is-${tab.id}`} aria-hidden="true">{tab.icon}</span><span className="contributor-tab-copy"><span>{tab.label}</span><strong>{tab.value}</strong></span></button>)}</div></div>;
}

export function AssignmentSelector({ works, active, completed, itemCount, pending, onChange }: { works: Work[]; active: string; completed: number; itemCount: number; pending: boolean; onChange: (id: string) => void }) {
  const work = works.find(w => w.id === active);
  return <section className="contributor-assignment" aria-label="Current assignment"><div><span className="contributor-label">Assignment</span><strong>{work?.title}</strong>
    <small>{work?.deadline ? `Due ${formatDeadline(work.deadline)}` : 'No deadline'} · {completed}/{itemCount} submitted</small></div>
    {works.length > 1 && <label><span className="sr-only">Choose assignment</span><select value={active} disabled={pending} onChange={e => onChange(e.target.value)}>
      {works.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}</select></label>}</section>;
}

export function AssignmentGuidance({ work }: { work: Work }) {

  const summary = work.instructions || 'Translate each expression naturally into Kasem. Add alternatives when useful.';
  return <details className="contributor-guidance"><summary><span><strong>Assignment guidance</strong><small>{summary.length > 150 ? summary.slice(0, 147) + '…' : summary}</small></span><span aria-hidden="true">⌄</span></summary>
    <div>{work.instructions && <p>{work.instructions}</p>}{work.dialect && <p><strong>Dialect:</strong> {work.dialect}</p>}{work.tone && <p><strong>Tone:</strong> {work.tone}</p>}{work.deadline && <p><strong>Due:</strong> {formatDeadline(work.deadline)}</p>}<p><strong>Contact:</strong> {work.helpContact || 'Contact the team member who sent your invitation for assignment help.'}</p></div></details>;
}


export type ContributorPaymentService = {
  load: () => Promise<{ data: { profile: PayoutProfile | null; requests: PaymentRequest[]; rewards?: Rewards; streak?: Streak } }>;
  save: (details: Record<string, string>) => Promise<unknown>;
  redeem?: (choice: RedemptionChoice) => Promise<unknown>;
};
const livePaymentService: ContributorPaymentService = {
  load: () => loadPayments({}), save: details => savePayoutProfile(details), redeem: choice => redeemPoints(choice),
};
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
export function ContributorPayments({ service = livePaymentService }: { service?: ContributorPaymentService }) {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<PayoutProfile | null>(null);
  const [bankName, setBankName] = useState(''), [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState(''), [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const result = await service.load();
      setProfile(result.data.profile);
      if (result.data.profile) {
        setBankName(result.data.profile.bankName); setAccountName(result.data.profile.accountName);
        setAccountNumber(result.data.profile.accountNumber); setBranch(result.data.profile.branch ?? '');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment details could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  return <section className="contributor-payments">
    <p className="contributor-payment-summary">{loading ? 'Loading payment profile…' : 'Manage your bank details and verification status.'}</p>
    <div className="contributor-payments__body">
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <section><h2>Bank account</h2><p className="muted">These details are private and available only to authorised administrators handling contributor payments.</p>
        {profile && <><p className={`payment-status status-${profile.verificationStatus}`}>{profile.verificationStatus}</p><p>{profile.verificationStatus === 'verified' ? 'Your bank details have been verified. Editing them may require a new review.' : profile.verificationStatus === 'pending' ? 'Your bank details are awaiting administrator review. No action is needed unless the team contacts you.' : 'Your bank details need correction. Review the feedback, update your details, and save them for another review.'}</p>{profile.verificationNote && <p role="status">{profile.verificationNote}</p>}</>}
        {profile && !editing ? <div className="contributor-bank-summary"><p>{profile.bankName}</p><p>{profile.accountName}</p><p>Account ending in {profile.accountNumber.slice(-4)}</p>{profile.branch && <p>{profile.branch}</p>}<button onClick={() => setEditing(true)}>Edit bank details</button></div> : !loading && <form className="contributor-payment-form" onSubmit={async event => {
          event.preventDefault(); setBusy(true); setError(''); setNotice('');
          try {
            await service.save({ bankName, accountName, accountNumber, branch });
            setNotice('Bank details saved and sent for verification.'); await refresh(); setEditing(false);
          } catch (reason) { setError(reason instanceof Error ? reason.message : 'Bank details could not be saved.'); }
          finally { setBusy(false); }
        }}>
          <label>Bank name<input required maxLength={120} autoComplete="organization" value={bankName} onChange={event => setBankName(event.target.value)} /></label>
          <label>Account holder name<input required maxLength={160} autoComplete="name" value={accountName} onChange={event => setAccountName(event.target.value)} /></label>
          <label>Account number<input required minLength={6} maxLength={34} inputMode="numeric" autoComplete="off" value={accountNumber} onChange={event => setAccountNumber(event.target.value)} /></label>
          <label>Branch <small>(optional)</small><input maxLength={160} value={branch} onChange={event => setBranch(event.target.value)} /></label>
          {profile && <p className={`payment-status status-${profile.verificationStatus}`}>Verification: <strong>{profile.verificationStatus}</strong>{profile.verificationNote ? ` · ${profile.verificationNote}` : ''}</p>}
          <button className="button--primary" disabled={busy}>{busy ? 'Saving…' : profile ? 'Update bank details' : 'Save bank details'}</button>
          {profile && <button type="button" disabled={busy} onClick={() => { setBankName(profile.bankName); setAccountName(profile.accountName); setAccountNumber(profile.accountNumber); setBranch(profile.branch); setEditing(false); }}>Cancel</button>}
        </form>}
      </section>
    </div>
  </section>;
}

function EmptyState({ title, body }: { title: string; body: string }) { return <section className="contributor-empty"><span aria-hidden="true">○</span><h2>{title}</h2><p>{body}</p></section>; }
function formatDeadline(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }).format(date); }

function ContributorActivation() {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form className="contributor-auth" onSubmit={async e => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const email = auth.currentUser?.email;
      await httpsCallable(functions, 'activateExpressionContributor')({ password });
      if (email) await signInWithEmailAndPassword(auth, email, password);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to activate. Please retry.'); }
    finally { setBusy(false); }
  }}><h2>Activate your account</h2><p>Choose your own password to finish activation and open your assignments. If you signed in with your phone number, replace it here.</p>
    <label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
    <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Activating…' : 'Activate and open assignments'}</button>
  </form>;
}

function ContributorSignIn({ code }: { code: string | null }) {
  const { path, navigate } = useRoute();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { if (code) void verifyPasswordResetCode(auth, code).then(setEmail).catch(() => setError('This activation link has expired or was already used. Sign in with your password, or request a fresh invitation.')); }, [code]);
  return <form className="contributor-auth" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (reset) {
        await sendPasswordResetEmail(auth, email.trim(), { url: window.location.origin + '/contributor' });
        setNotice('If this email has an account, a password reset link is on its way. Check your inbox and spam folder.');
        return;
      }
      if (code) await confirmPasswordReset(auth, code, password);
      await signInWithEmailAndPassword(auth, email, password);
      navigate(path, { replace: true });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }}><h2>{code ? 'Set your password' : reset ? 'Reset your password' : 'Welcome back'}</h2>
    <p>New account? Sign in with your invited email and your phone number as the temporary password, including the country code (for example +233241234567). If you already had an Indigen World account, use your existing password. After activation, use the password you chose.</p>
    <label>Email<input type="email" autoComplete="username" required value={email} readOnly={Boolean(code)} onChange={e => setEmail(e.target.value)} /></label>
    {!reset && <label>{code ? 'Set a password' : 'Password (phone number for first sign-in)'}<input type="password" minLength={code ? 8 : undefined} required autoComplete={code ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}<button type="submit" disabled={busy || !email}>{busy ? 'Please wait…' : reset ? 'Send reset link' : code ? 'Save password and sign in' : 'Sign in'}</button>
    {!code && <button type="button" disabled={busy} onClick={() => { setReset(!reset); setError(''); setNotice(''); }}>{reset ? 'Back to sign in' : 'Forgot password?'}</button>}
    {code && <button type="button" onClick={() => navigate(path, { replace: true })}>Already activated? Sign in</button>}
  </form>;
}

export function readLocalDraft(key: string): { translation: string; alternatives: string; revision: number } | null {
  if (!key) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return value && typeof value.translation === 'string' && value.translation.length <= 2000
      && typeof value.alternatives === 'string' && value.alternatives.length <= 3500
      && Number.isInteger(value.revision) ? value : null;
  } catch { return null; }
}

type SaveAnswer = (data: Record<string, unknown>) => Promise<{ data: { revision: number; submissionId?: string } }>;
export function contributionState(item: Item) {
  if (item.unsure) return 'I’m not sure';
  if (['needs_revision', 'rejected'].includes(item.status)) return 'Needs revision';
  if (item.submissionId) return 'Submitted';
  return item.translation.trim() || item.alternatives?.some(v => v.trim()) ? 'Drafts' : 'Not started';
}
export function ContributionWorkspace({ items, work, guidance, onPending, accountId, saveAnswer = save }: {
  items: Item[]; work: string; guidance?: Work; accountId?: string; onPending: (pending: boolean) => void; saveAnswer?: SaveAnswer;
}) {
  const positionKey = accountId ? `contributor-position:${accountId}:${work}` : '';
  const [selected, setSelected] = useState(() => { try { return positionKey ? window.localStorage.getItem(positionKey) ?? '' : ''; } catch { return ''; } });
  useEffect(() => { if (positionKey && selected) { try { window.localStorage.setItem(positionKey, selected); } catch { /* Position memory is optional. */ } } }, [positionKey, selected]);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [mobileEditor, setMobileEditor] = useState(Boolean(selected));
  const [confirmation, setConfirmation] = useState('');
  const visible = items.filter(i => (filter === 'All' || contributionState(i) === filter) &&
    [i.expression, i.translation, ...i.alternatives].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const item = items.find(i => i.id === selected) ?? visible[0];
  const submitted = submittedCount(items);
  const approved = items.filter(i => i.status === 'verified').length;
  const nextItem = nextContribution(items);
  const drafts = items.filter(i => contributionState(i) === 'Drafts').length;
  const unsure = items.filter(i => i.unsure).length;
  const revisions = items.filter(i => contributionState(i) === 'Needs revision').length;
  const currentIndex = item ? items.findIndex(i => i.id === item.id) : -1;
  const hasNextIncomplete = items.some((candidate, index) => index !== currentIndex && contributionState(candidate) !== 'Submitted');
  const support = <details className="contributor-support"><summary>Help &amp; support</summary><div>{guidance && <AssignmentGuidance work={guidance} />}<ContributorIssues work={work} item={item?.id} preview={accountId === 'preview-contributor'} /></div></details>;
  if (!items.length) return <EmptyState title="No expressions yet" body="There are no expressions in this assignment. Please check back later or contact the team." />;
  if (submitted === items.length) return <>{support}<section className="contributor-complete"><span aria-hidden="true">🎉</span><h2>All expressions submitted</h2><p>You’ve submitted all {items.length} expressions; {approved} approved by the Review Desk. Thank you for helping Kasem grow.</p><dl className="contributor-completion-stats"><div><dt>Submitted</dt><dd>{submitted}</dd></div><div><dt>Awaiting review</dt><dd>{submitted - approved}</dd></div><div><dt>Approved</dt><dd>{approved}</dd></div><div><dt>Returned for revision</dt><dd>{revisions}</dd></div></dl><p>Check back for reviewer feedback. Returned expressions will reopen in your assignment.</p></section></>;
  return <>
    {support}
    <section className="contributor-progress" aria-label="Assignment progress">
      <div><span>Progress</span><strong>{submitted} / {items.length} submitted</strong></div>
      <progress aria-label="Expressions submitted" value={submitted} max={items.length || 1} />
      <p><span>{approved} approved</span><span className="status-dot status-draft" />{drafts} drafts <span className="status-dot status-unsure" />{unsure} unsure <span className="status-dot status-revision" />{revisions} need revision <span>{Math.max(0, items.length - submitted)} remaining</span></p>
    </section>
    {nextItem && <button className="contributor-continue" disabled={pending} onClick={() => { setFilter('All'); setQuery(''); setSelected(nextItem.id); setMobileEditor(true); }}>Continue translating{revisions > 0 ? ' · Review revisions first' : ''} →</button>}
    {confirmation && <p className="contributor-confirmation" role="status">{confirmation}</p>}
    <div className={'contributor-workspace' + (mobileEditor ? ' is-editing' : '')}>
      <section className="contributor-expression-list" aria-label="Find expressions">
        <label className="contributor-search"><span className="sr-only">Search expressions</span><span aria-hidden="true">⌕</span><input type="search" value={query} disabled={pending} onChange={e => { setQuery(e.target.value); setSelected(''); }} placeholder="Search expressions" /></label>
        <nav aria-label="Expression filters">{(['All', 'Not started', 'Drafts', 'Submitted', 'Needs revision', 'I’m not sure'] as const).map(label => <button key={label} disabled={pending} aria-pressed={filter === label} onClick={() => { setFilter(label); setSelected(''); }}>{label === 'I’m not sure' ? 'Unsure' : label}</button>)}</nav>
        <aside aria-label="Expressions">{visible.map((i) => { const state = contributionState(i); return <button key={i.id} className={`expression-card state-${statusSlug(state)}`} disabled={pending} aria-current={item?.id === i.id ? 'true' : undefined} onClick={() => { setSelected(i.id); setMobileEditor(true); }}><span className="expression-card-icon" aria-hidden="true">{statusIcon(state)}</span><span><strong>{i.expression}</strong><small>{state === 'Drafts' ? 'Draft saved' : state}{i.status === 'verified' ? ' · Verified' : ''}{accountId && readLocalDraft(`contributor-draft:${accountId}:${work}:${i.id}`) ? ' · Recovery copy' : ''}</small></span><span className="expression-arrow" aria-hidden="true">›</span></button>; })}
          {!visible.length && <p>No expressions match. Try another search or filter.</p>}</aside>
      </section>
      <div className="contributor-editor-pane"><button className="contributor-back" disabled={pending} onClick={() => setMobileEditor(false)}>← Expressions</button>
        {item ? <ExpressionEditor accountId={accountId} key={item.id} item={item} itemNumber={currentIndex + 1} itemTotal={items.length} hasNextIncomplete={hasNextIncomplete} work={work} saveAnswer={saveAnswer} onPending={value => { setPending(value); onPending(value); if (value) setSelected(item.id); }} onSkipped={() => {
          const index = items.findIndex(i => i.id === item.id);
          const remaining = [...items.slice(index + 1), ...items.slice(0, index)].find(i => contributionState(i) === 'Not started');
          setConfirmation('“' + item.expression + '” was flagged as unsure. No answer was submitted.' + (!remaining ? ' No new expressions remain. You can return to flagged expressions at any time.' : ''));
          if (remaining) { setFilter('All'); setQuery(''); setSelected(remaining.id); }
          else setMobileEditor(false);
        }} onSubmitted={next => {
          const index = items.findIndex(i => i.id === item.id);
          const remaining = [...items.slice(index + 1), ...items.slice(0, index)].find(i => contributionState(i) === 'Not started');
          setConfirmation('“' + item.expression + '” was sent to the Review Desk.' + (next && !remaining ? ' No untranslated expressions remain. Check Drafts for unfinished work.' : ''));
          if (next && remaining) { setFilter('All'); setQuery(''); setSelected(remaining.id); }
        }} /> : <p>Select an expression to begin.</p>}
      </div>
    </div>
  </>;
}

function statusSlug(status: Status) { return status.toLocaleLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, ''); }
function statusIcon(status: Status) { return status === 'Submitted' ? '✓' : status === 'Needs revision' ? '!' : status === 'Drafts' ? '✎' : status === 'I’m not sure' ? '?' : '□'; }

function ExpressionEditor({ item, itemNumber = 1, itemTotal = 1, hasNextIncomplete = false, work, onPending, onSubmitted, onSkipped, accountId, saveAnswer = save }: { item: Item; itemNumber?: number; itemTotal?: number; hasNextIncomplete?: boolean; work: string; accountId?: string; onPending: (pending: boolean) => void; onSubmitted?: (next: boolean) => void; onSkipped?: () => void; saveAnswer?: SaveAnswer }) {
  const [translation, setTranslation] = useState(item.translation), [alternatives, setAlternatives] = useState(item.alternatives.join('\n'));
  const [alternativeCount, setAlternativeCount] = useState(item.alternatives.length);
  const [publication, setPublication] = useState(false), [training, setTraining] = useState(false);
  const [status, setStatus] = useState('Saved'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const revision = useRef(item.revision), chain = useRef(Promise.resolve()), dirty = useRef(false), blocked = useRef(false);
  const payload = useRef({ translation, alternatives }); payload.current = { translation, alternatives };
  const submitting = useRef(false);
  const activeField = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [sent, setSent] = useState(false);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const reviewNext = useRef(false);
  const revising = ['rejected', 'needs_revision'].includes(item.status);
  useEffect(() => { if (['rejected', 'needs_revision'].includes(item.status)) setSent(false); }, [item.status]);
  const locked = (Boolean(item.submissionId) && !revising) || sent;
  const storageKey = accountId ? `contributor-draft:${accountId}:${work}:${item.id}` : '';
  const [recovery, setRecovery] = useState(() => readLocalDraft(storageKey));
  const [storageError, setStorageError] = useState('');
  const keepLocal = (answer: { translation: string; alternatives: string }) => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ...answer, revision: revision.current })); setStorageError(''); }
    catch { setStorageError('This browser cannot keep a recovery copy. Keep this page open until Saved appears.'); }
  };
  const changeAnswer = (field: 'translation' | 'alternatives', value: string) => {
    payload.current = { ...payload.current, [field]: value };
    keepLocal(payload.current); dirty.current = true; onPending(true);
    setStatus(blocked.current ? 'Couldn’t save' : 'Saving…');
    if (field === 'translation') setTranslation(value); else setAlternatives(value);
  };
  const persist = (submit = false, skip = false) => {
    const answer = { ...payload.current };
    chain.current = chain.current.then(async () => {
      if (blocked.current) throw new Error('Reload to recover this draft before continuing.');
      const result = await saveAnswer({ work, item: item.id, revision: revision.current, translation: answer.translation,
        alternatives: answer.alternatives.split('\n').filter(v => v.trim()), submit, skip, publicationPermission: publication, aiTraining: training });
      revision.current = result.data.revision;
      if (payload.current.translation === answer.translation && payload.current.alternatives === answer.alternatives) dirty.current = false;
      if (dirty.current) keepLocal(payload.current);
      else { try { if (storageKey) window.localStorage.removeItem(storageKey); } catch { /* Keep the acknowledged server copy. */ } }
      onPending(dirty.current || submitting.current);
      setStatus(submit ? 'Sent to the Review Desk' : skip ? 'Flagged as unsure — not submitted' : dirty.current ? 'Saving…' : 'Saved');
    }).catch(e => { blocked.current = true; setError(e.message); setStatus('Couldn’t save'); throw e; });
    return chain.current;
  };
  useEffect(() => {
    if (!dirty.current || locked || busy || recovery || blocked.current) return;
    setStatus('Saving…');
    const timer = window.setTimeout(() => { void persist().catch(() => undefined); }, 700);
    return () => window.clearTimeout(timer);
  }, [translation, alternatives, locked, busy, recovery]);
  useEffect(() => {
    const guard = (e: Event) => { if (dirty.current) { e.preventDefault(); if (e instanceof BeforeUnloadEvent) e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); window.addEventListener('studio:before-navigate', guard);
    return () => { window.removeEventListener('beforeunload', guard); window.removeEventListener('studio:before-navigate', guard);
      // Changes are copied to browser storage synchronously while typing.
    };
  }, []);
  const savedAlternatives = alternatives ? alternatives.split('\n') : [];
  const alternativeValues = Array.from({ length: Math.max(alternativeCount, savedAlternatives.length) }, (_, index) => savedAlternatives[index] ?? '');
  const updateAlternative = (index: number, value: string) => { const next = [...alternativeValues]; next[index] = value.replace(/\n/g, ' '); setAlternativeCount(next.length); changeAnswer('alternatives', next.join('\n')); };
  const removeAlternative = (index: number) => { const next = alternativeValues.filter((_, current) => current !== index); setAlternativeCount(next.length); changeAnswer('alternatives', next.join('\n')); };
  const cannotSubmit = !translation.trim() ? 'Enter a Kasem translation to submit.' : !publication ? 'Confirm publication permission to submit.' : blocked.current ? 'Retry saving your draft before submitting.' : '';
  const sendReviewedAnswer = async () => {
    if (locked || recovery || blocked.current || cannotSubmit || busy || submitting.current) return;
    submitting.current = true; setBusy(true); onPending(true);
    try { await persist(true); setSent(true); reviewDialog.current?.close(); onSubmitted?.(reviewNext.current); }
    catch { reviewDialog.current?.close(); }
    finally { submitting.current = false; setBusy(false); onPending(dirty.current); }
  };
  return <form className="contributor-editor" onSubmit={e => {
    e.preventDefault(); if (locked || recovery || blocked.current || cannotSubmit || busy || submitting.current) return;
    reviewNext.current = (e.nativeEvent as SubmitEvent | undefined)?.submitter?.getAttribute('value') === 'next';
    reviewDialog.current?.showModal();
  }}>
    <dialog ref={reviewDialog} className="contributor-payment-dialog contributor-review-dialog" aria-labelledby="review-answer-title" onCancel={e => { if (busy) e.preventDefault(); }}>
      <h2 id="review-answer-title">Review your submission</h2>
      <p>{item.expression}</p><h3>Kasem translation</h3><p className="review-answer-text">{translation}</p>
      <h3>Alternative translations</h3>{savedAlternatives.filter(value => value.trim()).length ? <ul>{savedAlternatives.filter(value => value.trim()).map((value, index) => <li key={index}>{value}</li>)}</ul> : <p>None added.</p>}
      <h3>Permissions</h3><p>Publication permission: {publication ? 'Granted' : 'Not granted'}</p><p>Optional AI training: {training ? 'Allowed' : 'Not allowed'}</p>
      <div className="contributor-review-actions"><button type="button" autoFocus disabled={busy} onClick={() => reviewDialog.current?.close()}>Back to editing</button><button type="button" disabled={busy || Boolean(cannotSubmit)} onClick={() => void sendReviewedAnswer()}>{busy ? 'Submitting…' : 'Confirm submission'}</button></div>
    </dialog><header className="editor-heading"><div><span className="contributor-kicker">EXPRESSION {itemNumber} OF {itemTotal}</span><h2>{item.expression}</h2></div><span className={`status-badge state-${statusSlug(contributionState(item))}`}>{statusIcon(contributionState(item))} {contributionState(item)}</span></header>
    {item.feedback && <section className="contributor-feedback"><strong>Reviewer note</strong><p>{item.feedback}</p>{revising && <small>Update your translation below, then resubmit it for review.</small>}</section>}
    {recovery && <section className="contributor-feedback"><strong>Unsaved draft found on this device</strong><p>{recovery.revision !== item.revision ? 'The saved version has changed since this copy was made. Compare both before restoring.' : 'Your previous edits can be recovered.'}</p><pre className="contributor-recovery-text">{recovery.translation}{recovery.alternatives ? '\nAlternatives:\n' + recovery.alternatives : ''}</pre>
      {!locked && <button type="button" onClick={() => { revision.current = item.revision; changeAnswer('translation', recovery.translation); changeAnswer('alternatives', recovery.alternatives); setRecovery(null); }}>Restore draft</button>}
      <button type="button" onClick={() => { try { window.localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ } setRecovery(null); }}>Discard recovery copy</button></section>}
    {storageError && <p role="alert">{storageError}</p>}
    <div className="editor-save-state"><span className={`save-indicator ${status === 'Couldn’t save' ? 'is-error' : ''}`} aria-hidden="true">{status === 'Saving…' ? '•' : status === 'Couldn’t save' ? '!' : '✓'}</span><span role="status" aria-live="polite">{locked ? 'Submitted' : status}</span>{error && !locked && <button type="button" disabled={busy} onClick={() => { blocked.current = false; chain.current = Promise.resolve(); setError(''); setStatus('Saving…'); void persist().catch(() => undefined); }}>Retry save now</button>}</div>
    <label className="translation-field">Kasem translation <span aria-hidden="true">*</span><textarea ref={node => { if (node && !activeField.current) activeField.current = node; }} onFocus={e => { activeField.current = e.currentTarget; }} required maxLength={2000} disabled={locked || busy || Boolean(recovery)} value={translation} placeholder="Enter the natural Kasem expression" aria-describedby="translation-help" onChange={e => changeAnswer('translation', e.target.value)} /><small id="translation-help">Translate the meaning naturally, rather than word for word.</small></label>
    {!locked && <div className="contributor-characters" role="group" aria-label="Kasem characters"><small>Kasem characters</small><div>{Array.from('ɛƐəƏɣƔɩƖŋŊɔƆʋƲ').map(char => <button type="button" key={char} aria-label={`Insert ${char}`} disabled={busy || Boolean(recovery)} onMouseDown={e => e.preventDefault()} onClick={() => {
      const field = activeField.current;
      if (!field) return;
      const start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
      const value = field.value.slice(0, start) + char + field.value.slice(end);
      if (value.length > field.maxLength) return;
      const alternativeIndex = field.dataset.alternativeIndex;
      if (field.name === 'alternatives' && alternativeIndex !== undefined) updateAlternative(Number(alternativeIndex), value);
      else changeAnswer('translation', value);
      window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + char.length, start + char.length); });
    }}>{char}</button>)}</div></div>}
    <section className="alternative-translations"><div><strong>Alternative translations</strong><small>Optional · up to 12</small></div>{alternativeValues.map((value, index) => <label key={index}>Alternative {index + 1}<span><input name="alternatives" data-alternative-index={index} maxLength={500} disabled={locked || busy || Boolean(recovery)} value={value} placeholder="Another natural way to say it" onFocus={e => { activeField.current = e.currentTarget; }} onChange={e => updateAlternative(index, e.target.value)} /><button type="button" aria-label={`Remove alternative ${index + 1}`} disabled={busy} onClick={() => removeAlternative(index)}>×</button></span></label>)}
      {!locked && alternativeValues.length < 12 && <button className="add-alternative" type="button" disabled={busy || Boolean(recovery)} onClick={() => setAlternativeCount(count => Math.min(12, count + 1))}>+ Add another way of saying this</button>}</section>
    {!locked && <><details className="permission-section"><summary>Permissions &amp; AI usage <span aria-hidden="true">⌄</span></summary><div><label className="contributor-check"><input type="checkbox" required checked={publication} onChange={e => setPublication(e.target.checked)} />I have permission to share this expression for review and dictionary publication.</label>
      <label className="contributor-check"><input type="checkbox" checked={training} onChange={e => setTraining(e.target.checked)} />Allow an approved translation to be used for Kawuri AI training <strong>(optional)</strong>.</label></div></details>
      {error && <div role="alert"><p>Your text is still here. Check your connection and retry. {error} If another device changed this draft, copy your text before reloading.</p>
        <button type="button" onClick={() => { blocked.current = false; chain.current = Promise.resolve(); setError('');
          setStatus('Saving…'); void persist().catch(() => undefined); }}>Retry save</button></div>}
      <section className="unsure-section"><div><strong>Not sure about this translation?</strong><p>Your work will be kept as a draft so you can return later.</p></div><button type="button" disabled={busy || Boolean(recovery) || blocked.current} onClick={async () => {
        submitting.current = true; setBusy(true); onPending(true);
        try { await persist(false, true); onSkipped?.(); }
        catch { /* Keep the expression open for retry. */ }
        finally { submitting.current = false; setBusy(false); onPending(dirty.current); }
      }}>Skip / I’m not sure →</button></section>
      <div className="contributor-submit-wrap">{cannotSubmit && <p id="submit-help">{cannotSubmit}</p>}<div className="contributor-submit-actions"><button type="button" disabled={busy || Boolean(recovery) || blocked.current || !dirty.current} onClick={() => void persist().catch(() => undefined)}>Save draft</button><button value={hasNextIncomplete ? 'next' : 'submit'} aria-describedby={cannotSubmit ? 'submit-help' : undefined} disabled={busy || Boolean(recovery) || Boolean(cannotSubmit)}>{busy ? 'Submitting…' : revising ? 'Review resubmission →' : 'Review submission →'}</button></div></div></>}
    {locked && <p role="status">{item.status === 'verified' ? 'Verified by the Review Desk' : `Review status: ${item.status}`}</p>}
  </form>;
}
