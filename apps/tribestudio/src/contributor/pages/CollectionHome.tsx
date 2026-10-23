import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { PORTAL_TYPES, type PortalType } from '@indigen-world/contracts/portal-contributions';
import { useRoute } from '../../router';
import { Dialog, Icon, type IconName } from '../../ui';
import { metricsFor, firstName } from '../model';
import { PortalLink, useShared, useWorkspace } from '../workspace';
import { livePaymentService, previewService, type RewardView } from '../rewards';
import { portalCall, portalMessage, type PortalSummary } from '../portal-data';
import { portalDrafts } from '../ContributionWorkspace';
import { PortalHistory } from '../PortalHistory';
import { ContributionsPage } from './ContributionsPage';
import { ActivityPage } from './ActivityPage';
import { GuidePage } from './GuidePage';
import { PulsePanel } from '../components';
const Community = lazy(() => import('../PortalCommunity'));
const titles: Record<string, string> = { start: 'Choose a contribution', submissions: 'My submissions', drafts: 'Drafts', attention: 'Needs my attention', notifications: 'Feedback & notifications', impact: 'My impact', guides: 'Guides & help', community: 'Community & opportunities' };

export function CollectionHome() {
  const data = useWorkspace(), { self } = useShared(), { search, navigate } = useRoute();
  const params = new URLSearchParams(search), panel = params.get('panel') || '';
  const [summary, setSummary] = useState<PortalSummary | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [rewards, setRewards] = useState<RewardView | null>(null), [rewardError, setRewardError] = useState(false), [legacy, setLegacy] = useState(false);
  const items = useMemo(() => Object.values(data.items).flat(), [data.items]), metrics = metricsFor(items), localDrafts = portalDrafts(data.uid);
  useEffect(() => { let active = true; setError(''); portalCall<PortalSummary>(data.preview, 'summary').then(s => { if (active) setSummary(s); }).catch(e => { if (active) setError(portalMessage(e)); }); return () => { active = false; }; }, [data.uid, data.preview, attempt]);
  useEffect(() => { let active = true; (data.preview ? previewService : livePaymentService).load().then(r => { if (active) setRewards(r.data); }).catch(() => { if (active) setRewardError(true); }); return () => { active = false; }; }, [data.uid, data.preview]);
  useEffect(() => { const changed = () => setAttempt(n => n + 1); window.addEventListener('portal:changed', changed); return () => window.removeEventListener('portal:changed', changed); }, []);
  const open = (next: string) => { setLegacy(false); navigate(data.paths.base + '?panel=' + next); };
  const assignmentReady = data.itemsState === 'ready' && data.worksState === 'ready';
  const count = (status: string, previous = 0) => summary && assignmentReady ? summary.counts[status] + previous : null;
  const submitted = summary && assignmentReady ? Object.entries(summary.counts).filter(([k]) => k !== 'draft').reduce((n, [, v]) => n + v, 0) + metrics.submitted : null;
  const approved = count('approved', metrics.approved), draftCount = count('draft', metrics.drafts);
  const cards: { id: string; title: string; icon: IconName; color: string; detail: string; action: string }[] = [
    { id: 'submissions', title: 'My submissions', icon: 'doc', color: 'blue', detail: summary && assignmentReady ? `${count('submitted', metrics.awaiting)} awaiting review` : 'Loading submission counts…', action: 'View submissions' },
    { id: 'drafts', title: 'Drafts', icon: 'doc', color: 'indigo', detail: summary && assignmentReady ? `${draftCount} account drafts · ${localDrafts.length} device workspaces` : 'Loading account drafts…', action: 'Continue draft' },
    { id: 'attention', title: 'Needs my attention', icon: 'alert', color: 'amber', detail: summary && assignmentReady ? `${summary.counts.changes_requested + summary.failed + metrics.returned} changes requested or failed jobs` : 'Loading review and upload status…', action: 'Review feedback' },
    { id: 'notifications', title: 'Feedback', icon: 'message', color: 'violet', detail: summary ? `${summary.unread} unread review updates` : 'Loading updates…', action: 'Open updates' },
    { id: 'impact', title: 'My impact', icon: 'opportunities', color: 'green', detail: approved == null ? 'Loading reviewed contributions…' : `${approved} approved contributions`, action: 'View impact' },
    { id: 'rewards', title: 'Rewards & earnings', icon: 'gift', color: 'red', detail: rewards ? `${rewards.balance.available.toLocaleString()} available points` : rewardError ? 'Balance unavailable · open to retry' : 'Loading your balance…', action: 'Open rewards' },
    { id: 'guides', title: 'Guides & help', icon: 'book', color: 'blue', detail: 'Examples for every contribution', action: 'Browse guides' },
    { id: 'community', title: 'Community', icon: 'users', color: 'green', detail: 'Shared goals and current opportunities', action: 'View opportunities' },
  ];
  return <div className="ts-page pw-home"><header className="pw-welcome"><div><h1>{firstName(self.value?.profile.displayName || data.displayName) ? `Welcome back, ${firstName(self.value?.profile.displayName || data.displayName)}` : 'Welcome to your contributor portal'}</h1><p>Share what you know. Help your language grow.</p></div><div className="pw-actions"><button className="ts-btn ts-btn--primary" onClick={() => open('start')}>Start contributing</button>{localDrafts.length || (draftCount ?? 0) > 0 ? <button className="ts-btn ts-btn--secondary" onClick={() => open('drafts')}>Continue draft</button> : null}</div></header>
    {error ? <p role="alert" className="ts-notice ts-notice--danger">Contribution totals could not be refreshed. {error} <button className="ts-link" onClick={() => setAttempt(n => n + 1)}>Retry</button></p> : null}
    {data.itemsState === 'error' || data.worksState === 'error' ? <p role="alert">Assigned-work counts are unavailable. Reload to retry.</p> : null}
    <div className="pw-home-grid">{cards.map(c => <section className="pw-home-card" key={c.id}><span className={`pw-card-icon pw-card-icon--${c.color}`}><Icon name={c.icon} /></span><h2>{c.title}</h2><p>{c.detail}</p>{c.id === 'attention' && items.find(i => ['rejected', 'needs_revision'].includes(i.status))?.feedback ? <blockquote><span>{items.find(i => ['rejected', 'needs_revision'].includes(i.status))!.feedback}</span></blockquote> : null}{c.id === 'rewards' ? <PortalLink to={data.paths.section('rewards')} className="pw-card-action">{c.action}<Icon name="arrow" /></PortalLink> : <button type="button" className="pw-card-action" onClick={() => open(c.id)}>{c.action}<Icon name="arrow" /></button>}</section>)}</div>
    <p className="pw-home-note">Careful contributions matter. Submitted work and approved records are counted separately. Your existing assignments, corpus records, and rewards remain available.</p>
    {titles[panel] ? <Dialog title={titles[panel]} size="xl" className="pw-sheet" onClose={() => { setAttempt(n => n + 1); navigate(data.paths.base); }}>
      {panel === 'start' ? <div className="pw-type-grid">{(Object.entries(PORTAL_TYPES) as [PortalType, typeof PORTAL_TYPES[PortalType]][]).map(([type, m]) => <PortalLink className="pw-type-link" key={type} to={data.paths.base + '/' + type}><Icon name={m.icon as IconName} /><span><strong>{m.label}</strong><small>{m.description}</small></span><Icon name="arrow" /></PortalLink>)}</div> : null}
      {['submissions', 'drafts', 'attention', 'notifications'].includes(panel) ? <><div className="pw-tabs"><button type="button" className="ts-btn ts-btn--secondary" aria-pressed={!legacy} onClick={() => setLegacy(false)}>All-round contributions</button><button type="button" className="ts-btn ts-btn--secondary" aria-pressed={legacy} onClick={() => setLegacy(true)}>Assigned translations</button><PortalLink to="/contributor/corpus" className="ts-link">Corpus records<Icon name="arrow" /></PortalLink></div>{panel === 'drafts' && !legacy ? <section><h3>On this device · grouped by workspace</h3>{localDrafts.length ? localDrafts.map(d => <div className="pw-draft" key={d.type}><PortalLink to={data.paths.base + '/' + d.type} className="ts-link">{PORTAL_TYPES[d.type].label}: {d.title}<Icon name="arrow" /></PortalLink><button className="ts-link" onClick={() => { if (window.confirm('Discard this device draft? Account drafts and uploaded originals remain unchanged.')) { localStorage.removeItem(`tribestudio:recovery:v1:${encodeURIComponent(data.uid)}:portal-${d.type}`); setAttempt(n => n + 1); } }}>Discard device draft</button></div>) : <p>No unfinished device workspaces. Start with any contribution type.</p>}<h3>Saved account drafts</h3></section> : null}{legacy ? panel === 'notifications' ? <ActivityPage /> : <ContributionsPage initialFilter={panel === 'drafts' ? 'draft' : panel === 'attention' ? 'returned' : ''} /> : <PortalHistory key={panel} mode={panel} selectedId={params.get('record') ?? undefined} onChanged={() => setAttempt(n => n + 1)} />}</> : null}
      {panel === 'impact' ? <><div className="pw-impact"><div><strong>{submitted ?? '—'}</strong><span>submitted at least once</span></div><div><strong>{approved ?? '—'}</strong><span>approved by reviewers</span></div><div><strong>{count('changes_requested', metrics.returned) ?? '—'}</strong><span>changes requested</span></div></div><p>Totals cover your all-round contributions and assigned translations. Source-document approval does not approve derived records. Validated audio duration is not available in these records.</p><PortalLink to="/contributor/corpus" className="ts-link">Open governed corpus records<Icon name="arrow" /></PortalLink></> : null}
      {panel === 'guides' ? <><div className="pw-type-grid">{Object.entries(PORTAL_TYPES).map(([type, m]) => <article className="pw-card" key={type}><h3>{m.label}</h3><p>{m.example}</p><PortalLink to={data.paths.base + '/' + type} className="ts-link">Start this contribution<Icon name="arrow" /></PortalLink></article>)}</div><p><PortalLink to={data.paths.section('kawuri')} className="ts-link">Ask Kawuri about meaning or context<Icon name="arrow" /></PortalLink></p><GuidePage section="" /></> : null}
      {panel === 'community' ? <><PulsePanel pulse={data.pulse} /><Suspense fallback={<p>Loading opportunities…</p>}><Community /></Suspense><PortalLink to={data.paths.section('assignments')} className="ts-link">Current assigned work<Icon name="arrow" /></PortalLink></> : null}
    </Dialog> : null}</div>;
}
