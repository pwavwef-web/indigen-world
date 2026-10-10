import { PageHeader } from './components';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useRoute } from '../router';
import { friendlyError, type Item } from './model';
import { useWorkspace } from './workspace';
import { TableShell } from '@indigen-world/console-ui';
import { Badge, Button, Dialog, EmptyState, Icon, Notice, Segmented, StatCard, StatGrid, type IconName } from '../ui';
import {
  DEFAULT_AWARD_POLICY, DEFAULT_REDEMPTION_POLICY, quotePoints, type DataBundle, type QualityBand, type RedemptionBand, type RedemptionPolicyConfig,
} from './reward-policy';
import './rewards.css';

/* ==========================================================================
   Points & rewards for invited contributors.

   Every number here comes from the server. The live preview in the redeem
   card uses the same arithmetic module as the server (a generated copy), but
   it is informational: "Review redemption" asks the server for a quote, and
   only that quote can be confirmed. Pending assessments are shown as
   estimates and never added to the available balance.
   ========================================================================== */

export type RequestStatus = 'submitted' | 'approved' | 'needs_reconciliation' | 'fulfilled' | 'paid' | 'failed' | 'rejected' | 'cancelled';
export type PaymentRequest = {
  id: string; status: RequestStatus; points: number; amountMinor: number; baseMinor: number | null; bonusMinor: number | null;
  kind?: 'airtime' | 'data'; network?: string; phoneNumber?: string; bundle?: { label: string; priceMinor: number; residualMinor?: number } | null;
  createdAt: string; adminNote?: string; paidAt?: string | null; paymentReference?: string; settlementPath?: 'ledger-v1' | 'legacy';
};
export type AwardView = {
  id: string; category: string; categoryLabel: string; title: string; kasem: string; status: string; statusLabel: string; statusDetail: string;
  points: number | null; settledPoints: number | null; estimate: { points: number; label: string } | null; calculation: string;
  calc: { basePoints: number; effortPoints: number; multiplierBps: number } | null; band: string; feedback: string; ineligibleReason: string;
  improvement: string[]; clarification: string; reviewRequestOpen: boolean; canRequestReview: boolean; canRespond: boolean; createdAt: string;
};
type PublicRedemptionPolicy = Pick<RedemptionPolicyConfig, 'basePoints' | 'baseAmountMinor' | 'bands' | 'minimumPoints' | 'maximumPoints' | 'quoteTtlSeconds' | 'airtime'> & {
  id: string; version: number; basis: string; dataBundles: (DataBundle & { points: number; valueMinor: number; residualMinor: number })[];
};
type PublicAwardPolicy = { id: string; version: number; basis: string; bands: QualityBand[];
  categories: { key: string; label: string; basePoints: number; minPoints: number; maxPoints: number; note: string; examples: { band: string; multiplierBps: number; points: number }[] }[] };
export type Streak = { current: number; best: number; lastDay: string; activeToday: boolean };
export type RewardView = {
  mode: { awardMode: 'legacy-flat' | 'assessed'; assessmentWorker: 'off' | 'on'; redemptionsOpen: boolean };
  balance: { available: number; reserved: number; lifetimeEarned: number; lifetimeRedeemed: number; pendingEstimate: number; pendingCount: number };
  awards: AwardView[]; requests: PaymentRequest[]; streak: Streak;
  redemptionPolicy: PublicRedemptionPolicy; awardPolicy: PublicAwardPolicy; legacyAward: { pointsPerExpression: number; dailyCap: number } | null;
};
export type QuoteRequest = { kind: 'airtime' | 'data'; network?: string; points?: number; bundleId?: string };
export type Quote = { quoteId: string; expiresAt: string; kind: 'airtime' | 'data'; network: string; points: number; baseMinor: number; bonusMinor: number;
  totalMinor: number; bundle: (DataBundle & { residualMinor: number }) | null; policyVersion: number; remainingAfter: number };
export type ContributorPaymentService = {
  load: () => Promise<{ data: RewardView }>;
  quote?: (input: QuoteRequest) => Promise<{ data: Quote }>;
  redeem?: (input: { quoteId: string; phoneNumber: string; idempotencyKey: string }) => Promise<{ data: { requestId: string } }>;
  cancel?: (requestId: string) => Promise<unknown>;
  respond?: (input: { assessmentId: string; kind: 'clarification' | 'review'; message: string }) => Promise<unknown>;
};

const call = <I, O>(name: string) => httpsCallable<I, O>(functions, name);
export const livePaymentService: ContributorPaymentService = {
  load: () => call<Record<string, never>, RewardView>('getContributorRewards')({}),
  quote: input => call<QuoteRequest, Quote>('quoteContributorRedemption')(input),
  redeem: input => call<typeof input, { requestId: string }>('redeemContributorPoints')(input),
  cancel: requestId => call<{ requestId: string }, unknown>('cancelContributorRedemption')({ requestId }),
  respond: input => call<typeof input, unknown>('respondToRewardAssessment')(input),
};

/* -- Sample data for the staff preview of the portal (clearly labelled there) -- */

const previewPolicy: PublicRedemptionPolicy = { id: 'sample', version: 1, basis: 'proposed-default', ...DEFAULT_REDEMPTION_POLICY, dataBundles: [] };
const sampleAward = (id: string, title: string, band: string, multiplierBps: number, status = 'awarded'): AwardView => ({
  id, category: 'expressions', categoryLabel: 'Everyday expression', title, kasem: '[Kasem sample]', status, statusLabel: status === 'awarded' ? 'Points awarded' : 'Under validator review',
  statusDetail: '', points: status === 'awarded' ? Math.round(20 * multiplierBps / 10000) : null, settledPoints: null,
  estimate: status === 'awarded' ? null : { points: 20, label: 'Estimate from automatic checks — not confirmed, not spendable' },
  calculation: status === 'awarded' ? `20 category points × ${(multiplierBps / 10000).toFixed(2)} ${band.toLowerCase()}-quality multiplier = ${Math.round(20 * multiplierBps / 10000)} points` : '',
  calc: status === 'awarded' ? { basePoints: 20, effortPoints: 0, multiplierBps } : null, band, feedback: status === 'awarded' ? 'Accurate meaning with a clear situation of use.' : '',
  ineligibleReason: '', improvement: [], clarification: '', reviewRequestOpen: false, canRequestReview: status === 'awarded', canRespond: false, createdAt: new Date().toISOString(),
});
const previewState: RewardView = {
  mode: { awardMode: 'assessed', assessmentWorker: 'on', redemptionsOpen: true },
  balance: { available: 1200, reserved: 0, lifetimeEarned: 1500, lifetimeRedeemed: 300, pendingEstimate: 20, pendingCount: 1 },
  awards: [sampleAward('s1', 'Sample prompt: greeting an elder', 'Strong', 12500), sampleAward('s2', 'Sample prompt: thanking a host', 'Exceptional', 15000),
    sampleAward('s3', 'Sample prompt: asking the way', 'Standard', 10000, 'validator_review')],
  requests: [{ id: 'sample-delivered', status: 'fulfilled', points: 300, amountMinor: 500, baseMinor: 500, bonusMinor: 0, kind: 'airtime', network: 'MTN',
    phoneNumber: '+233000000000', createdAt: new Date().toISOString(), paymentReference: 'SAMPLE' }],
  streak: { current: 3, best: 5, lastDay: new Date(Date.now() - 86400000).toISOString().slice(0, 10), activeToday: false },
  redemptionPolicy: previewPolicy,
  awardPolicy: { id: 'sample', version: 1, basis: 'proposed-default', bands: DEFAULT_AWARD_POLICY.bands, categories: [{ key: 'expressions', label: 'Everyday expression', basePoints: 20, minPoints: 20, maxPoints: 40, note: '', examples: [] }] },
  legacyAward: null,
};
export const previewService: ContributorPaymentService = {
  load: async () => ({ data: structuredClone(previewState) }),
  quote: async input => {
    const q = quotePoints(input.points ?? 0, DEFAULT_REDEMPTION_POLICY);
    return { data: { quoteId: 'sample-quote', expiresAt: new Date(Date.now() + 900_000).toISOString(), kind: 'airtime', network: input.network ?? 'MTN', points: q.points,
      baseMinor: q.baseMinor, bonusMinor: q.bonusMinor, totalMinor: q.totalMinor, bundle: null, policyVersion: 1, remainingAfter: previewState.balance.available - q.points } };
  },
  redeem: async () => { throw new Error('This is a preview with sample data. Nothing is sent.'); },
};

/* -- Formatting -------------------------------------------------------------- */

export const ghs = (minor: number) => `GH₵${(minor / 100).toFixed(2)}`;
const pts = (n: number) => n.toLocaleString('en-GB');
const dateShort = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`;

const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: 'info' | 'success' | 'danger' | 'accent' | 'warning' | 'neutral'; detail: string }> = {
  submitted: { label: 'Waiting for Finance', tone: 'info', detail: 'Your points are reserved while Finance checks the request.' },
  approved: { label: 'Approved · awaiting top-up', tone: 'accent', detail: 'Finance will send it by hand and record the reference. Delivery is not instant.' },
  needs_reconciliation: { label: 'Checking delivery', tone: 'warning', detail: 'The top-up result was unclear. Your points stay reserved until Finance confirms what happened.' },
  fulfilled: { label: 'Delivered', tone: 'success', detail: 'Finance recorded the delivery reference.' },
  paid: { label: 'Delivered', tone: 'success', detail: 'Finance recorded the delivery reference.' },
  failed: { label: 'Not delivered · points returned', tone: 'danger', detail: 'The provider confirmed nothing was delivered, so your points came back.' },
  rejected: { label: 'Declined · points returned', tone: 'danger', detail: 'Your points came back to your balance.' },
  cancelled: { label: 'Cancelled · points returned', tone: 'neutral', detail: 'You cancelled this request; your points came back.' },
};

const AWARD_TONE: Record<string, 'info' | 'success' | 'danger' | 'warning' | 'neutral' | 'accent'> = {
  queued: 'info', assessing: 'info', validator_review: 'info', needs_clarification: 'warning', eligible: 'accent', awarded: 'success', ineligible: 'danger', superseded: 'neutral',
};

/* -- Page ------------------------------------------------------------------- */

export function RewardsPage({ streak = false, history = false }: { streak?: boolean; history?: boolean }) {
  const data = useWorkspace(); const { navigate } = useRoute();
  const service = data.preview ? previewService : livePaymentService;
  const onOpenTasks = () => navigate(data.paths.section('assignments'));
  const [howOpen, setHowOpen] = useState(false);
  return (
    <div className="ts-page contributor-rewards-page">
      <PageHeader
        kicker="Recognition"
        title={streak ? 'Activity streak' : 'Points & rewards'}
        description={streak ? 'Days in a row with at least one new submission, counted in UTC.' : 'Useful contributions. Clear rewards. Points are redeemed for airtime or mobile data; they are not cash.'}
        actions={streak ? undefined : <Button icon="info" onClick={() => setHowOpen(true)}>How points work</Button>}
      />
      {streak ? <ContributorStreak service={service} onOpenTasks={onOpenTasks} />
        : <ContributorRewards service={service} onOpenTasks={onOpenTasks} focusHistory={history} howOpen={howOpen} onCloseHow={() => setHowOpen(false)} />}
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
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  useEffect(() => {
    try { setDismissedId(window.localStorage.getItem(`contributor-delivery-seen:${accountId}`)); } catch { setDismissedId(null); }
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
          <p style={{ fontSize: 'var(--fs-sm)' }}>At least one expression sent for review for the first time that day (UTC). The streak is a habit tracker; it does not earn points.</p>
        </div>
      </div>
    </section>
  );
}

/* -- Rewards ----------------------------------------------------------------- */

export function ContributorRewards({ service = livePaymentService, onOpenTasks, focusHistory = false, howOpen = false, onCloseHow = () => undefined }: {
  service?: ContributorPaymentService; onOpenTasks: () => void; focusHistory?: boolean; howOpen?: boolean; onCloseHow?: () => void;
}) {
  const [view, setView] = useState<RewardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const historyRef = useRef<HTMLElement>(null);
  const refresh = async () => {
    setLoading(true); setError('');
    try { setView((await service.load()).data); }
    catch (reason) { setError(friendlyError(reason, 'Your points').message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [service]);
  useEffect(() => { if (focusHistory && view) historyRef.current?.scrollIntoView({ block: 'start' }); }, [focusHistory, Boolean(view)]);
  const b = view?.balance;
  const openRequest = view?.requests.find(r => ['submitted', 'approved', 'needs_reconciliation'].includes(r.status)) ?? null;

  return (
    <section className="ts-stack rw" aria-label="Contributor rewards">
      {error ? <Notice tone="danger" role="alert" action={<Button size="sm" icon="refresh" onClick={() => void refresh()}>Try again</Button>}>{error}</Notice> : null}
      {notice ? <Notice tone="success" role="status">{notice}</Notice> : null}
      <StatGrid label="Your points" columns={3}>
        <StatCard icon="wallet" label="Available points" value={loading && !b ? '…' : b ? pts(b.available) : '—'} hint="Ready to redeem" />
        <StatCard icon="hourglass" label="Pending review" value={loading && !b ? '…' : b ? pts(b.pendingEstimate) : '—'}
          hint={b?.pendingCount ? `Estimate for ${b.pendingCount} ${b.pendingCount === 1 ? 'contribution' : 'contributions'} · not yet available` : 'Not yet available'} />
        <StatCard icon="lock" label="Reserved points" value={loading && !b ? '…' : b ? pts(b.reserved) : '—'} hint="Held for a redemption in progress" />
      </StatGrid>
      {view && !view.mode.redemptionsOpen ? <Notice tone="warning" title="New redemptions are paused">Finance has paused new requests for now. Your points are safe and requests already made continue.</Notice> : null}
      {view?.mode.awardMode === 'legacy-flat' && view.legacyAward ? (
        <Notice tone="info" title="Quality-based awards are not switched on yet">
          Approved expressions still earn {view.legacyAward.pointsPerExpression} points each under the previous rule. Validator assessments below are already recorded; a contribution is never paid twice when the new rule starts.
        </Notice>
      ) : null}
      {view ? (
        <div className="ts-split rw-layout">
          <div className="ts-stack">
            <AwardsPanel view={view} service={service} onChanged={async message => { setNotice(message); await refresh(); }} onOpenTasks={onOpenTasks} />
            <HistoryPanel ref={historyRef} requests={view.requests} service={service} onChanged={async message => { setNotice(message); await refresh(); }} />
          </div>
          <RedeemPanel view={view} service={service} openRequest={openRequest}
            onRedeemed={async message => { setNotice(message); await refresh(); window.dispatchEvent(new Event('contributor-rewards-updated')); historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
        </div>
      ) : loading ? <div className="ts-panel"><div className="ts-skeleton" role="status" aria-label="Loading your points"><span className="ts-skel ts-skel--title" /><span className="ts-skel ts-skel--line" /><span className="ts-skel ts-skel--line" /></div></div> : null}
      {howOpen && view ? <HowPointsWork view={view} onClose={onCloseHow} /> : null}
    </section>
  );
}

function categoryIcon(category: string): IconName {
  return category === 'audiobooks' || category === 'music' ? 'mic' : category === 'video' ? 'video' : 'doc';
}

function AwardsPanel({ view, service, onChanged, onOpenTasks }: { view: RewardView; service: ContributorPaymentService; onChanged: (m: string) => Promise<void>; onOpenTasks: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rows = view.awards.filter(a => a.status !== 'superseded');
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section className="ts-panel ts-panel--flush rw-card" aria-labelledby="rw-awards-title">
      <header className="rw-card__head">
        <div><h2 id="rw-awards-title">Recent point awards</h2><p className="ts-muted">Quality checked by a validator</p></div>
      </header>
      {rows.length ? (
        <>
          <TableShell label="Recent point awards" className="rw-scroll">
          <table className="ts-table rw-table">
            <thead><tr><th scope="col">Contribution</th><th scope="col" className="rw-hide-sm">Details</th><th scope="col" className="rw-hide-sm">Calculation</th><th scope="col" className="rw-num">Points</th></tr></thead>
            <tbody>
              {shown.map(a => {
                const expanded = open === a.id;
                const calc = a.calc ? `${a.calc.basePoints + a.calc.effortPoints} × ${(a.calc.multiplierBps / 10000).toFixed(2)}` : '—';
                return (
                  <FragmentRow key={a.id}>
                    <tr className={expanded ? 'is-open' : undefined}>
                      <td>
                        <button type="button" className="rw-row-button" aria-expanded={expanded} aria-controls={`award-${a.id}`} onClick={() => setOpen(expanded ? null : a.id)}>
                          <span className="rw-row-icon" aria-hidden="true"><Icon name={categoryIcon(a.category)} /></span>
                          <span className="rw-row-copy">
                            <strong>{a.title || a.categoryLabel}</strong>
                            <span className="rw-row-status"><span className={`rw-dot rw-dot--${AWARD_TONE[a.status] ?? 'neutral'}`} aria-hidden="true" />{a.band && a.status === 'awarded' ? `${a.band} quality · ${a.statusLabel}` : a.statusLabel}</span>
                          </span>
                        </button>
                      </td>
                      <td className="rw-hide-sm ts-muted">{a.categoryLabel}</td>
                      <td className="rw-hide-sm rw-calc">{calc}</td>
                      <td className="rw-num">
                        {a.points !== null ? <strong className="rw-plus">+{pts(a.points)} pts</strong>
                          : a.estimate ? <span className="rw-estimate" title={a.estimate.label}>≈ {a.estimate.points} est.</span>
                            : <span className="ts-muted">—</span>}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="rw-detail-row"><td colSpan={4} id={`award-${a.id}`}><AwardDetail award={a} service={service} onChanged={onChanged} /></td></tr>
                    ) : null}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
          </TableShell>
          {rows.length > 6 ? <div className="rw-card__foot"><Button size="sm" variant="ghost" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Button></div> : null}
        </>
      ) : (
        <EmptyState compact icon="award" title="No assessed contributions yet" body="When a validator checks your submitted expressions as training data, each one appears here with its points and the reason for them."
          actions={<Button size="sm" variant="primary" iconRight="arrow" onClick={onOpenTasks}>Open assignments</Button>} />
      )}
    </section>
  );
}

function FragmentRow({ children }: { children: ReactNode }) { return <>{children}</>; }

function AwardDetail({ award, service, onChanged }: { award: AwardView; service: ContributorPaymentService; onChanged: (m: string) => Promise<void> }) {
  const [mode, setMode] = useState<'clarification' | 'review' | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!mode || !service.respond || message.trim().length < 10) { setError('Write at least 10 characters.'); return; }
    setBusy(true); setError('');
    try {
      await service.respond({ assessmentId: award.id, kind: mode, message: message.trim() });
      await onChanged(mode === 'review' ? 'Review requested. A validator will look again; your points do not change unless they decide so.' : 'Thank you. Your answer went to the validator.');
    } catch (reason) { setError(friendlyError(reason, 'Your message').message); } finally { setBusy(false); }
  };
  return (
    <div className="rw-explain">
      <span className="rw-explain__icon" aria-hidden="true"><Icon name="shield" /></span>
      <div className="rw-explain__body">
        {award.points !== null ? <p className="rw-explain__title">Why +{award.points} points?</p> : <p className="rw-explain__title">{award.statusLabel}</p>}
        <p className="ts-muted">{award.calculation || award.statusDetail}</p>
        {award.estimate ? <p className="ts-hint">{award.estimate.label}.</p> : null}
        {award.feedback ? <p><strong>Validator:</strong> {award.feedback}</p> : null}
        {award.ineligibleReason ? <p><strong>Why not:</strong> {award.ineligibleReason}</p> : null}
        {award.clarification ? <p><strong>Question for you:</strong> {award.clarification}</p> : null}
        {award.improvement.length ? <ul className="rw-tips">{award.improvement.map(tip => <li key={tip}>{tip}</li>)}</ul> : null}
        {award.reviewRequestOpen ? <p className="ts-hint">You asked for a review. A validator will look again.</p> : null}
        <div className="ts-cluster">
          {award.canRespond && service.respond ? <Button size="sm" variant="primary" onClick={() => setMode('clarification')}>Answer the question</Button> : null}
          {award.canRequestReview && service.respond ? <Button size="sm" onClick={() => setMode('review')}>Request a review</Button> : null}
        </div>
        {mode ? (
          <form className="ts-stack ts-stack--sm rw-respond" onSubmit={e => void submit(e)}>
            <label className="ts-field">
              <span className="ts-label">{mode === 'review' ? 'What should the validator look at again?' : 'Your answer'}</span>
              <textarea className="ts-textarea" rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} />
            </label>
            {error ? <p role="alert" className="ts-error"><Icon name="alert" />{error}</p> : null}
            <div className="ts-cluster"><Button type="submit" size="sm" variant="primary" busy={busy}>Send</Button><Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button></div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

const HistoryPanel = ({ ref, requests, service, onChanged }: { ref: RefObject<HTMLElement | null>; requests: PaymentRequest[]; service: ContributorPaymentService; onChanged: (m: string) => Promise<void> }) => {
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const [confirming, setConfirming] = useState<PaymentRequest | null>(null);
  const cancel = async (request: PaymentRequest) => {
    if (!service.cancel) return;
    setBusy(request.id); setError('');
    try { await service.cancel(request.id); setConfirming(null); await onChanged(`Cancelled. ${pts(request.points)} points are back in your balance.`); }
    catch (reason) { setError(friendlyError(reason, 'Cancelling').message); setConfirming(null); } finally { setBusy(null); }
  };
  return (
    <section ref={ref} className="ts-panel ts-panel--flush rw-card" aria-labelledby="rw-history-title">
      <header className="rw-card__head"><div><h2 id="rw-history-title">Redemption history</h2></div></header>
      {error ? <div className="rw-card__body"><Notice tone="danger" role="alert">{error}</Notice></div> : null}
      {requests.length ? (
        <TableShell label="Redemption history" className="rw-scroll">
          <table className="ts-table rw-table">
            <thead><tr><th scope="col">Reward</th><th scope="col" className="rw-num">Points</th><th scope="col">Status</th><th scope="col" className="rw-hide-sm">Date</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {requests.map(r => {
                const meta = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.submitted;
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="rw-row-button rw-row-button--static">
                        <span className="rw-row-icon" aria-hidden="true"><Icon name={r.kind === 'data' ? 'globe' : 'phone'} /></span>
                        <span className="rw-row-copy">
                          <strong>{r.bundle ? r.bundle.label : `${ghs(r.amountMinor)} airtime`}</strong>
                          <span className="ts-muted">{r.network}{r.bonusMinor ? ` · includes ${ghs(r.bonusMinor)} bonus` : ''}{r.settlementPath === 'legacy' ? ' · original terms' : ''}</span>
                        </span>
                      </span>
                    </td>
                    <td className="rw-num">{pts(r.points)} pts</td>
                    <td><Badge tone={meta.tone} dot title={meta.detail}>{meta.label}</Badge>{r.status === 'rejected' && r.adminNote ? <small className="rw-note">{r.adminNote}</small> : null}</td>
                    <td className="rw-hide-sm ts-muted">{dateShort(r.createdAt)}</td>
                    <td className="rw-num">{r.status === 'submitted' && service.cancel ? <Button size="sm" variant="ghost" onClick={() => setConfirming(r)}>Cancel</Button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      ) : <EmptyState compact icon="clock" title="No redemptions yet" body="Requests appear here with honest status updates: reserved, approved, delivered or returned." />}
      {confirming ? (
        <Dialog title="Cancel this redemption?" lede={`${pts(confirming.points)} points return to your available balance.`} onClose={() => setConfirming(null)} busy={busy === confirming.id}
          footer={<><Button onClick={() => setConfirming(null)}>Keep it</Button><Button variant="danger" busy={busy === confirming.id} onClick={() => void cancel(confirming)}>Cancel request</Button></>}>
          <p>You can cancel until Finance approves it. Nothing has been sent yet.</p>
        </Dialog>
      ) : null}
    </section>
  );
};

/* -- Redeem ------------------------------------------------------------------- */

function newKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function nextBandText(bands: RedemptionBand[], points: number): string | null {
  let start = 0, current = bands[0]?.bonusBps ?? 0;
  for (const band of bands) {
    const end = band.upToPoints ?? Infinity;
    if (points > start) current = band.bonusBps;
    else if (band.bonusBps > current) return `Points after the first ${pts(start)} in one redemption earn +${pct(band.bonusBps)}. Bands restart with each redemption.`;
    start = end;
  }
  return null;
}

function RedeemPanel({ view, service, openRequest, onRedeemed }: { view: RewardView; service: ContributorPaymentService; openRequest: PaymentRequest | null; onRedeemed: (m: string) => Promise<void> }) {
  const policy = view.redemptionPolicy;
  const config = policy as unknown as RedemptionPolicyConfig;
  const available = view.balance.available;
  const maxRedeemable = Math.min(available, policy.maximumPoints);
  const bundles = policy.dataBundles;
  const [kind, setKind] = useState<'airtime' | 'data'>('airtime');
  const [raw, setRaw] = useState(String(Math.min(Math.max(policy.minimumPoints, 900 <= maxRedeemable ? 900 : policy.minimumPoints), Math.max(maxRedeemable, policy.minimumPoints))));
  const lastPhone = view.requests.find(r => r.phoneNumber)?.phoneNumber ?? '';
  const [network, setNetwork] = useState(policy.airtime.networks[0] ?? 'MTN');
  const [phone, setPhone] = useState(lastPhone.startsWith('+233') ? `0${lastPhone.slice(4)}` : '');
  const [bundleId, setBundleId] = useState(bundles[0]?.id ?? '');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const points = kind === 'data' ? bundles.find(b => b.id === bundleId)?.points ?? 0 : Number(raw);
  const blocked = !view.mode.redemptionsOpen ? 'New redemptions are paused by Finance.'
    : openRequest ? 'You have a redemption in progress. You can request another once it is delivered or closed.'
      : available < policy.minimumPoints ? `Redeem from ${pts(policy.minimumPoints)} points. You have ${pts(available)}.` : null;
  const valid = !blocked && Number.isSafeInteger(points) && points >= policy.minimumPoints && points <= policy.maximumPoints && points <= available;
  const preview = Number.isSafeInteger(points) && points > 0 ? quotePoints(points, config) : null;
  const phoneOk = /^(\+?233|0)\d{9}$/.test(phone.replace(/[\s-]/g, ''));
  const problem = blocked ?? (kind === 'airtime'
    ? (!/^\d+$/.test(raw) ? 'Enter a whole number of points.' : points < policy.minimumPoints ? `The minimum is ${pts(policy.minimumPoints)} points.`
      : points > available ? `You have ${pts(available)} points available.` : points > policy.maximumPoints ? `The most in one redemption is ${pts(policy.maximumPoints)} points.` : null)
    : !bundles.length ? 'Mobile data is not offered yet.' : points > available ? `This bundle needs ${pts(points)} points.` : null);
  const quick = [...new Set([policy.minimumPoints, 900, 1800].filter(p => p >= policy.minimumPoints && p <= maxRedeemable))].slice(0, 2);
  const hint = preview && kind === 'airtime' && !blocked ? nextBandText(policy.bands, points) : null;

  const review = async () => {
    if (!service.quote || problem || !phoneOk) return;
    setBusy(true); setError('');
    try {
      const result = await service.quote(kind === 'airtime' ? { kind, network, points } : { kind, bundleId });
      setQuote(result.data);
    } catch (reason) { setError(friendlyError(reason, 'The quote').message); } finally { setBusy(false); }
  };

  return (
    <aside className="ts-panel rw-redeem" aria-labelledby="rw-redeem-title">
      <h2 id="rw-redeem-title" className="rw-redeem__title">Redeem your points</h2>
      <Segmented label="Reward type" block value={kind} onChange={value => { setKind(value); setError(''); }} options={[
        { value: 'airtime', label: 'Airtime', icon: 'phone', disabled: !policy.airtime.enabled },
        { value: 'data', label: 'Data', icon: 'globe' },
      ]} />
      {kind === 'airtime' ? (
        <div className="ts-stack ts-stack--sm">
          <label className="ts-field">
            <span className="ts-label">Points to redeem</span>
            <span className="rw-points-input">
              <input className="ts-input" inputMode="numeric" pattern="[0-9]*" aria-describedby="rw-points-help" value={raw} disabled={Boolean(blocked)}
                onChange={e => setRaw(e.target.value.replace(/[^\d]/g, '').slice(0, 7))} />
              <span aria-hidden="true">pts</span>
            </span>
          </label>
          <div className="rw-quick" role="group" aria-label="Quick amounts">
            {quick.map(q => <button key={q} type="button" className="rw-quick__btn" aria-pressed={points === q} disabled={Boolean(blocked)} onClick={() => setRaw(String(q))}>{pts(q)}</button>)}
            <button type="button" className="rw-quick__btn" aria-pressed={points === maxRedeemable && maxRedeemable >= policy.minimumPoints} disabled={Boolean(blocked) || maxRedeemable < policy.minimumPoints}
              onClick={() => setRaw(String(maxRedeemable))}>{available > policy.maximumPoints ? `Maximum (${pts(policy.maximumPoints)})` : 'All available'}</button>
          </div>
        </div>
      ) : bundles.length ? (
        <fieldset className="rw-bundles" disabled={Boolean(blocked)}>
          <legend className="ts-label">Bundle</legend>
          {bundles.map(b => (
            <label key={b.id} className={`rw-bundle${bundleId === b.id ? ' is-selected' : ''}`}>
              <input type="radio" name="bundle" value={b.id} checked={bundleId === b.id} onChange={() => setBundleId(b.id)} />
              <span><strong>{b.label}</strong><small>{b.network} · {ghs(b.priceMinor)} · {pts(b.points)} points</small>
                {b.residualMinor > 0 ? <small>{ghs(b.residualMinor)} of the points' value is above the bundle price and is not paid out.</small> : null}</span>
            </label>
          ))}
        </fieldset>
      ) : <Notice tone="info">Mobile data is not offered yet. Finance adds real bundles from the provider they use; until then, airtime is available.</Notice>}

      <div className="ts-stack ts-stack--sm">
        <div className="rw-recipient">
          {kind === 'airtime' ? (
            <label className="ts-field rw-recipient__network"><span className="ts-label">Network</span>
              <select className="ts-select" value={network} onChange={e => setNetwork(e.target.value as typeof network)}>{policy.airtime.networks.map(n => <option key={n}>{n}</option>)}</select>
            </label>
          ) : null}
          <label className="ts-field rw-recipient__phone"><span className="ts-label">Recipient number</span>
            <input className="ts-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="024 000 0000" value={phone} onChange={e => setPhone(e.target.value)} />
          </label>
        </div>
      </div>

      <dl className="rw-sum" aria-live="polite">
        <div><dt>Base value</dt><dd>{preview && valid ? ghs(preview.baseMinor) : '—'}</dd></div>
        <div><dt>Bonus value</dt><dd>{preview && valid ? `+ ${ghs(preview.bonusMinor)}` : '—'}</dd></div>
        <div className="rw-sum__total"><dt>You receive</dt><dd>{preview && valid ? (kind === 'data' ? bundles.find(b => b.id === bundleId)?.label : ghs(preview.totalMinor)) : '—'}</dd></div>
      </dl>
      <p className="ts-hint" id="rw-points-help">{valid ? `${pts(available - points)} points remain available.` : problem ?? ''}</p>
      {hint ? <p className="rw-band-hint"><Icon name="info" /><span>{hint}</span></p> : null}
      {error ? <p role="alert" className="ts-error"><Icon name="alert" />{error}</p> : null}
      {!phoneOk && phone ? <p className="ts-error"><Icon name="alert" />Enter a Ghana mobile number.</p> : null}
      <Button variant="primary" block iconRight="arrow" busy={busy} disabled={Boolean(problem) || !phoneOk || !service.quote} onClick={() => void review()}>Review redemption</Button>
      <p className="ts-hint rw-center">You’ll confirm the exact amount before anything is submitted.</p>
      {quote ? <ConfirmDialog quote={quote} phone={phone} service={service} onClose={() => setQuote(null)} onRequote={() => { setQuote(null); void review(); }} onDone={async message => { setQuote(null); await onRedeemed(message); }} /> : null}
    </aside>
  );
}

function ConfirmDialog({ quote, phone, service, onClose, onRequote, onDone }: { quote: Quote; phone: string; service: ContributorPaymentService; onClose: () => void; onRequote: () => void; onDone: (m: string) => Promise<void> }) {
  const key = useRef(newKey());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false);
  const minutes = Math.max(1, Math.round((Date.parse(quote.expiresAt) - Date.now()) / 60000));
  const confirm = async () => {
    if (!service.redeem) return;
    setBusy(true); setError('');
    try {
      await service.redeem({ quoteId: quote.quoteId, phoneNumber: phone, idempotencyKey: key.current });
      await onDone(`Requested ${quote.bundle ? quote.bundle.label : `${ghs(quote.totalMinor)} of ${quote.network} airtime`}. ${pts(quote.points)} points are reserved until Finance records the delivery.`);
    } catch (reason) {
      const f = friendlyError(reason, 'The redemption');
      setStale(f.code === 'aborted');
      setError(f.message);
    } finally { setBusy(false); }
  };
  return (
    <Dialog title="Confirm your redemption" lede={`${pts(quote.points)} points · quote valid for about ${minutes} min`} onClose={onClose} busy={busy}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Back</Button>
        {stale ? <Button variant="primary" onClick={onRequote}>Get the current amount</Button> : <Button variant="primary" busy={busy} onClick={() => void confirm()}>Confirm redemption</Button>}
      </>}>
      <div className="ts-stack">
        {error ? <Notice tone={stale ? 'warning' : 'danger'} role="alert">{error}</Notice> : null}
        <dl className="rw-sum rw-sum--dialog">
          <div><dt>Reward</dt><dd>{quote.bundle ? `${quote.bundle.label} (${quote.network})` : `${quote.network} airtime`}</dd></div>
          <div><dt>Recipient</dt><dd>{phone}</dd></div>
          <div><dt>Base value</dt><dd>{ghs(quote.baseMinor)}</dd></div>
          <div><dt>Bonus value</dt><dd>+ {ghs(quote.bonusMinor)}</dd></div>
          <div className="rw-sum__total"><dt>Total value</dt><dd>{ghs(quote.totalMinor)}</dd></div>
          {quote.bundle && quote.bundle.residualMinor > 0 ? <div><dt>Not paid out</dt><dd>{ghs(quote.bundle.residualMinor)} above the bundle price</dd></div> : null}
          <div><dt>Points left after</dt><dd>{pts(quote.remainingAfter)}</dd></div>
        </dl>
        <p className="ts-consequence"><Icon name="info" /><span>Your points are reserved now. Finance tops up by hand and records the reference — this is not instant. If it can’t be delivered, the points come back. You can cancel until Finance approves it.</span></p>
      </div>
    </Dialog>
  );
}

/* -- Explainer ------------------------------------------------------------------ */

function HowPointsWork({ view, onClose }: { view: RewardView; onClose: () => void }) {
  const p = view.redemptionPolicy;
  const config = p as unknown as RedemptionPolicyConfig;
  let start = 0;
  return (
    <Dialog size="lg" title="How points work" lede="These rates are proposed settings Finance can recalibrate; every change is versioned, and requests already made keep their agreed value." onClose={onClose}>
      <div className="ts-stack rw-how">
        <section>
          <h3>Earning</h3>
          <p>A fluent validator checks each contribution as training data. Points are credited only after that check — automatic checks and Kawuri’s suggestions help the validator but never decide.</p>
          <TableShell label="Points by category and band"><table className="ts-table ts-table--compact">
            <thead><tr><th scope="col">Category</th><th scope="col" className="rw-num">Base</th>{view.awardPolicy.bands.map(b => <th key={b.id} scope="col" className="rw-num">{b.label} ×{(b.multiplierBps / 10000).toFixed(2)}</th>)}</tr></thead>
            <tbody>{view.awardPolicy.categories.map(c => <tr key={c.key}><td>{c.label}</td><td className="rw-num">{c.basePoints}</td>{c.examples.map(e => <td key={e.band} className="rw-num">{e.points}</td>)}</tr>)}</tbody>
          </table></TableShell>
          <p className="ts-hint">Quality bands: {view.awardPolicy.bands.map(b => `${b.label} from ${b.minScore}`).join(' · ')}. Below {view.awardPolicy.bands[0]?.minScore} there is no award; the validator explains what would help. Length, repetition and expensive equipment earn nothing extra; an edit is re-assessed, not paid again.</p>
        </section>
        <section>
          <h3>Redeeming</h3>
          <p>{pts(p.basePoints)} points = {ghs(p.baseAmountMinor)} base value. Inside one redemption, points in higher bands earn a small bonus on top — only those points, not the whole amount:</p>
          <ul className="rw-tips">{p.bands.map((b, i) => { const from = start + 1; start = b.upToPoints ?? start; return <li key={i}>{b.upToPoints ? `Points ${pts(from)}–${pts(b.upToPoints)}` : `Above ${pts(from - 1)}`}: {b.bonusBps ? `+${pct(b.bonusBps)}` : 'base value'}</li>; })}</ul>
          <TableShell label="Example redemptions"><table className="ts-table ts-table--compact">
            <thead><tr><th scope="col">Redeem</th><th scope="col" className="rw-num">Base</th><th scope="col" className="rw-num">Bonus</th><th scope="col" className="rw-num">Total</th></tr></thead>
            <tbody>{[300, 900, 1800, 3000].filter(n => n >= p.minimumPoints && n <= p.maximumPoints).map(n => { const q = quotePoints(n, config); return <tr key={n}><td>{pts(n)} pts</td><td className="rw-num">{ghs(q.baseMinor)}</td><td className="rw-num">{ghs(q.bonusMinor)}</td><td className="rw-num"><strong>{ghs(q.totalMinor)}</strong></td></tr>; })}</tbody>
          </table></TableShell>
          <p className="ts-hint">The bands restart with each redemption, so combining points into one larger redemption gives a slightly better effective rate. Minimum {pts(p.minimumPoints)}, maximum {pts(p.maximumPoints)} points per request. Airtime and mobile data only — no cash or MoMo withdrawals. Finance delivers by hand.</p>
        </section>
      </div>
    </Dialog>
  );
}
