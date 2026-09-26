import { DailyTasks } from '../DailyTasks';
import { HomeStreak } from '../HomeStreak';
import { useMemo, useState } from 'react';
import { useRoute } from '../../router';
import {
  ActivityList,
  Card,
  Chip,
  EmptyNote,
  Icon,
  MetricTiles,
  Notice,
  PageHeader,
  PulsePanel,
  SegmentBar,
  Skeleton,
  useNow,
} from '../components';
import {
  WORK_STATE_META,
  activityFrom,
  dueInfo,
  firstName,
  formatDate,
  metricsFor,
  nextContribution,
  pluralise,
  workState,
  type Item,
  type Work,
} from '../model';
import { GUIDE } from '../guide';
import { artwork } from '../artwork';
import { PortalLink, paymentsNeedAttention, useShared, useWorkspace } from '../workspace';

/**
 * The first screen after sign-in. It answers three questions, in order: what
 * should I do next, what have I submitted, what needs my attention.
 */

/** The assignment worth continuing: returned work first, then due soonest, then newest. */
export function currentAssignment(works: Work[], items: Record<string, Item[]>): Work | null {
  const open = works.filter((work) => ['needs_attention', 'in_progress', 'not_started'].includes(workState(items[work.id] ?? [])));
  const ranked = [...open].sort((a, b) => {
    const attention = Number(workState(items[b.id] ?? []) === 'needs_attention') - Number(workState(items[a.id] ?? []) === 'needs_attention');
    if (attention) return attention;
    const dueA = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
    const dueB = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return (Number.isNaN(dueA) ? Infinity : dueA) - (Number.isNaN(dueB) ? Infinity : dueB);
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return ranked[0] ?? works[0] ?? null;
}

export function OverviewPage() {
  const data = useWorkspace();
  const [onboarded, setOnboarded] = useState(() => { try { return localStorage.getItem(`contributor-intro:${data.uid}`) === 'done'; } catch { return false; } });
  const { self, payments } = useShared();
  const { navigate } = useRoute();
  const now = useNow();
  const allItems = useMemo(() => Object.values(data.items).flat(), [data.items]);
  const metrics = useMemo(() => metricsFor(allItems), [allItems]);
  const work = useMemo(() => currentAssignment(data.works, data.items), [data.items, data.works]);
  const workItems = work ? data.items[work.id] ?? [] : [];
  const workMetrics = metricsFor(workItems);
  const state = workState(workItems);
  const next = nextContribution(workItems);
  const due = work ? dueInfo(work.deadline, state === 'complete' || state === 'awaiting_review', new Date(now)) : null;
  const events = useMemo(() => activityFrom(data.rounds, data.works, data.paymentNotices), [data.paymentNotices, data.rounds, data.works]);
  const name = firstName(self.value?.profile.displayName || data.displayName || '');
  const loading = data.worksState === 'loading' || (data.worksState === 'ready' && data.itemsState === 'loading');
  const remaining = workMetrics.notStarted + workMetrics.drafts + workMetrics.unsure;
  const returnedWork = metrics.returned;
  const attentionPayments = paymentsNeedAttention(payments.value);

  const summary = loading ? 'Loading your assignments…'
    : !work ? 'You have no assignments yet. When the team assigns expressions to you, they appear here.'
      : returnedWork ? `${pluralise(returnedWork, 'expression')} came back with reviewer feedback. Start there.`
        : remaining ? `${pluralise(remaining, 'expression')} left in “${work.title}”${due && work.deadline ? `, due ${formatDate(work.deadline)}` : ''}.`
          : metrics.awaiting ? 'Everything assigned to you has been submitted. Reviewer decisions will appear here.'
            : 'Everything assigned to you has been reviewed.';

  const openEvent = (event: { work?: string; item?: string; link?: string }) => {
    if (event.link) navigate(event.link);
    else if (event.work) navigate(data.paths.work(event.work, event.item));
  };

  return (
    <div className="cw-page cw-page--home">
      <PageHeader kicker="YOUR WORDS MAKE A WORLD" title={name ? `Welcome back, ${name}.` : 'Welcome back.'} id="page-title"
        actions={<HomeStreak />} />

      <section className="cw-welcome" aria-labelledby="welcome-title">
        <img className="cw-welcome__art" src={artwork.languageStudio} alt="" width="1536" height="1024" fetchPriority="high" />
        <div className="cw-welcome__copy">
          <span className="cw-welcome__eyebrow"><span aria-hidden="true">✦</span> EVERY EXPRESSION MATTERS</span>
          <h2 id="welcome-title">Your words.<br />Our living heritage.</h2>
          <p>A little of your time. A lasting place for Kasem.</p>
          <PortalLink to={work ? data.paths.work(work.id, next?.id) : data.paths.section('guide')} className="cw-welcome__button">
            {work ? next ? 'Continue my work' : 'View my assignment' : 'Explore the guide'}<Icon name="arrow" />
          </PortalLink>
        </div>
        <span className="cw-welcome__caption">LANGUAGE CONNECTS US.</span>
      </section>

      <section className="cw-impact" aria-label="Your contributions across all assignments">
        {loading ? <Skeleton lines={2} label="Counting your contributions" /> : <MetricTiles metrics={metrics} />}
      </section>

      {data.worksState === 'error' || data.itemsState === 'error' ? (
        <Notice tone="danger" title="Your assignments could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>Check your connection. Drafts you have already saved are safe on the server.</p>
        </Notice>
      ) : null}

      {returnedWork || attentionPayments ? (
        <div className="cw-attention" aria-label="Needs your attention">
          {returnedWork ? (
            <Notice tone="warning" title={`${pluralise(returnedWork, 'expression')} returned for revision`}
              action={<button type="button" onClick={() => navigate(data.paths.section('contributions', { filter: 'returned' }))}>Read the feedback</button>}>
            </Notice>
          ) : null}
          {attentionPayments ? (
            <Notice tone="warning" title="Your payment details need attention"
              action={<button type="button" onClick={() => navigate(data.paths.account('payments'))}>Open payment details</button>}>
              <p>{payments.value?.bank?.nextStep || payments.value?.momo?.nextStep || 'A finance reviewer needs something from you before payments can be sent.'}</p>
            </Notice>
          ) : null}
        </div>
      ) : null}

      {!onboarded && metrics.submitted === 0 ? <details className="cw-onboarding" open><summary>Get started</summary><ol><li><PortalLink to={data.paths.section('guide')}>Read the contribution guide</PortalLink></li><li><PortalLink to={data.paths.section('assignments')}>Open your tasks and save a draft</PortalLink></li><li>Submit for review, then follow feedback in My contributions.</li></ol><button type="button" onClick={() => { setOnboarded(true); try { localStorage.setItem(`contributor-intro:${data.uid}`, 'done'); } catch { /* Optional preference. */ } }}>Got it</button></details> : null}
      <div className="cw-overview-grid">
        <Card
          className="cw-current"
          title={work ? 'Current assignment' : 'Assignments'}
          labelledBy="current-assignment"
          actions={work ? <Chip tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Chip> : null}
        >
          {loading ? <Skeleton lines={4} label="Loading your current assignment" /> : work ? (
            <div className="cw-current__body">
              <p className="cw-current__summary">{summary}</p>
              <div className="cw-current__title">
                <h3>{work.title}</h3>
                <p className="cw-meta-row">
                  {due ? <span className={`cw-due cw-due--${due.tone}`}><Icon name="clock" />{due.label}</span> : <span className="cw-due"><Icon name="clock" />No due date</span>}
                  <span>{pluralise(workItems.length, 'expression')}</span>
                </p>
              </div>
              <SegmentBar metrics={workMetrics} label={`Progress on ${work.title}`} />
              <div className="cw-current__actions">
                {next ? (
                  <button type="button" className="button--primary cw-button-lg" onClick={() => navigate(data.paths.work(work.id, next.id))}>
                    {['rejected', 'needs_revision'].includes(next.status) ? 'Revise returned expression' : next.translation.trim() ? 'Continue translating' : 'Start translating'}
                    <Icon name="arrow" />
                  </button>
                ) : null}
                <PortalLink to={data.paths.work(work.id)} className="cw-button-secondary">View assignment</PortalLink>
                {data.works.length > 1 ? <PortalLink to={data.paths.section('assignments')} className="cw-text-link">All {data.works.length} assignments</PortalLink> : null}
              </div>
            </div>
          ) : (
            <EmptyNote title="No assignments yet">
              The team assigns sets of expressions to invited contributors. While you wait, read how assignments work in the Platform guide.
            </EmptyNote>
          )}
        </Card>

        <DailyTasks />

        <Card title="Recent activity" labelledBy="recent-activity" className="cw-activity-card" actions={<PortalLink to={data.paths.section('activity')} className="cw-text-link">View all</PortalLink>}>
          {data.roundsState === 'loading' ? <Skeleton lines={4} label="Loading your activity" /> : data.roundsState === 'error' ? (
            <p className="cw-muted">Your review history could not be loaded just now. Your assignments above are up to date.</p>
          ) : <ActivityList events={events.slice(0, 4)} onOpen={openEvent} now={now} emptyText="Your submissions and review decisions will appear here." />}
        </Card>

        <div className="cw-side-stack">
          <PulsePanel pulse={data.pulse} onPrivacy={() => navigate(data.paths.account('notifications'))} />
          <Card title="Kawuri Intelligence" labelledBy="kawuri-entry" className="cw-kawuri-entry">
            <img className="cw-kawuri-entry__art" src={artwork.livingKnowledge} alt="" width="1536" height="1024" loading="lazy" />
            <p>A fresh perspective when you need one.</p>
            <p className="cw-muted">Help with English meaning and context. Your Kasem stays yours.</p>
            <button type="button" onClick={() => navigate(data.paths.section('kawuri', work ? { work: work.id, ...(next ? { item: next.id } : {}) } : undefined))}><Icon name="kawuri" />Ask Kawuri</button>
          </Card>
          <Card title="Platform guide" labelledBy="guide-entry" className="cw-guide-entry">
            <ul className="cw-guide-links">
              {GUIDE.slice(0, 4).map((section) => (
                <li key={section.id}><PortalLink to={data.paths.section('guide', { section: section.id })}>{section.title}<Icon name="arrow" /></PortalLink></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
