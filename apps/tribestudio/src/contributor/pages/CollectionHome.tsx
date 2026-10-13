import { useMemo } from 'react';
import { useRoute } from '../../router';
import { canValidate, useAuth } from '../../auth';
import { ActivityList, Notice, Skeleton } from '../components';
import { activityFrom, firstName, metricsFor, nextContribution } from '../model';
import { currentAssignment } from './OverviewPage';
import { PageHeader, Icon, CountUp } from '../../ui';
import { PortalLink, useShared, useWorkspace } from '../workspace';
import { DailyTasks } from '../DailyTasks';
import { HomeStreak } from '../HomeStreak';
import { CommunityGoalCard, GrowthCard, ParticipationCard, PracticeCard, QualityMissions, RecognitionCard } from '../Journey';

function CollectionArtwork({ approved, total }: { approved: number; total: number }) {
  const fill = Math.min(1, approved / Math.max(1, total));
  return <div className="cq-art" aria-hidden="true">
    <div className="cq-art-orbit cq-art-orbit--one" /><div className="cq-art-orbit cq-art-orbit--two" />
    <div className="cq-art-label cq-art-label--one"><span>ɛ</span><i /></div><div className="cq-art-label cq-art-label--two"><span>ŋ</span><i /></div>
    <svg className="cq-art-vessel" viewBox="0 0 200 240" fill="none"><defs><linearGradient id="cq-glass" x1="35" x2="170" y1="30" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity=".24" /><stop offset="1" stopColor="#fff" stopOpacity=".04" /></linearGradient><linearGradient id="cq-water" x1="30" y1="100" x2="170" y2="230" gradientUnits="userSpaceOnUse"><stop stopColor="#a8cbff" /><stop offset="1" stopColor="#3b7df5" /></linearGradient><clipPath id="cq-clip"><path d="M63 38h74v32c0 22 35 29 35 59v57c0 25-32 40-72 40s-72-15-72-40v-57c0-30 35-37 35-59V38Z" /></clipPath></defs><g clipPath="url(#cq-clip)"><rect x="20" y="30" width="160" height="200" fill="url(#cq-glass)" /><g className="cq-art-liquid" style={{ ['--fill' as string]: `${190 - fill * 120}px` }}><path d="M-80 0Q-40-15 0 0T80 0T160 0T240 0V240H-80Z" fill="url(#cq-water)" /><path d="M-80 5Q-40 20 0 5T80 5T160 5T240 5V240H-80Z" fill="#7aafff" opacity=".5" /></g><path d="M42 123v61c0 12 11 22 29 27" stroke="#fff" strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" /></g><path d="M63 38h74v32c0 22 35 29 35 59v57c0 25-32 40-72 40s-72-15-72-40v-57c0-30 35-37 35-59V38Z" stroke="#d6e6ff" strokeOpacity=".5" strokeWidth="1.5" fill="none" /><ellipse cx="100" cy="38" rx="38" ry="9" stroke="#d6e6ff" strokeOpacity=".6" fill="#183569" /><path d="m59 132 17 9 24-12 24 12 17-9M59 153l17 9 24-12 24 12 17-9" stroke="#e1edff" strokeOpacity=".35" /></svg>
    <span className="cq-art-caption">Every expression carries a world.</span>
  </div>;
}

export function CollectionHome() {
  const data = useWorkspace(), { self } = useShared(), { role } = useAuth(), { navigate } = useRoute();
  const items = useMemo(() => Object.values(data.items).flat(), [data.items]);
  const metrics = metricsFor(items), work = currentAssignment(data.works, data.items);
  const next = work ? nextContribution(data.items[work.id] ?? []) : undefined;
  const name = firstName(self.value?.profile.displayName || data.displayName);
  const loading = data.worksState !== 'ready' || data.itemsState !== 'ready';
  const events = useMemo(() => activityFrom(data.rounds, data.works, data.paymentNotices), [data.rounds, data.works, data.paymentNotices]);
  const revise = next && ['rejected', 'needs_revision'].includes(next.status);
  return <div className="ts-page cq-home">
    <PageHeader kicker="Your contribution studio" title={name ? `Good to see you, ${name}.` : 'Your words. Our shared world.'} description="Bring everyday Kasem to life, one thoughtful expression at a time." actions={<><HomeStreak />{!data.preview && canValidate(role) ? <PortalLink to="/contributor/review" className="ts-btn ts-btn--secondary"><Icon name="shield" />Review desk</PortalLink> : null}</>} />
    {data.worksState === 'error' || data.itemsState === 'error' ? <Notice tone="danger" title="Your assignments could not be loaded" action={<button type="button" className="ts-btn" onClick={() => window.location.reload()}>Reload</button>}><p>Check your connection and try again.</p></Notice> : null}
    <div className="cq-home-grid">
      <section className="cq-hero" aria-labelledby="studio-next"><div className="cq-hero-main"><span className="cq-eyebrow"><span className="cq-live-dot" />{revise ? 'A chance to make it stronger' : 'Your next contribution'}</span><h2 id="studio-next">{revise ? <>Good work grows<br />through feedback.</> : <>Keep the language<br />in everyday life.</>}</h2>{loading ? <Skeleton lines={2} /> : <p>{next ? <>{revise ? 'A reviewer has a suggestion for ' : 'Continue with '}<strong>“{next.expression}”</strong></> : work ? 'Your expressions are with the reviewers. Follow their decisions below.' : 'Assignments will appear here when the team prepares work for you.'}</p>}<div className="cq-hero-actions"><button type="button" className="cq-primary" disabled={loading || !work || !next} onClick={() => work && next && navigate(data.paths.work(work.id, next.id))}>{revise ? 'Read feedback & revise' : next?.translation.trim() ? 'Continue your draft' : 'Start a small session'}<Icon name="arrow" /></button>{work ? <PortalLink to={data.paths.work(work.id)} className="cq-hero-link">View assignment<Icon name="chevron" /></PortalLink> : <PortalLink to={data.paths.section('guide')} className="cq-hero-link">Explore the guide<Icon name="chevron" /></PortalLink>}</div></div><CollectionArtwork approved={metrics.approved} total={metrics.total} /><dl className="cq-hero-stats">{[{ label: 'Approved', value: metrics.approved, icon: 'check-circle' as const }, { label: 'Awaiting review', value: metrics.awaiting, icon: 'clock' as const }, { label: 'To revisit', value: metrics.returned, icon: 'refresh' as const }].map(stat => <div key={stat.label}><dt><Icon name={stat.icon} />{stat.label}</dt><dd>{loading ? '—' : <CountUp value={stat.value} />}</dd></div>)}</dl></section>
      <ParticipationCard />
      <div className="cq-daily-slot"><DailyTasks /></div><QualityMissions />
      <GrowthCard /><RecognitionCard />
      <CommunityGoalCard /><PracticeCard />
      <section className="cq-card cq-home-activity" aria-labelledby="studio-activity"><div className="cq-card-head"><span className="cq-eyebrow"><Icon name="activity" />The latest</span><PortalLink to={data.paths.section('activity')} className="ts-link">View all<Icon name="arrow" /></PortalLink></div><h2 id="studio-activity">Your work, moving forward.</h2><ActivityList events={events.slice(0, 3)} emptyText="Your first submission will start the story here." onOpen={event => { if (event.link) navigate(event.link); else if (event.work) navigate(data.paths.work(event.work, event.item)); }} /><PortalLink to={data.paths.section('kawuri')} className="cq-help-link"><Icon name="kawuri" /><span>Need help with meaning or context?<strong>Ask Kawuri</strong></span><Icon name="arrow" /></PortalLink></section>
    </div>
  </div>;
}
