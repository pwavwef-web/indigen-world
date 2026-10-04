import { DailyTasks } from '../DailyTasks';
import { HomeStreak } from '../HomeStreak';
import { useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { canValidate, useAuth } from '../../auth';
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
import { Badge, Button, Steps } from '../../ui';
import { PortalLink, paymentsNeedAttention, useShared, useWorkspace } from '../workspace';

/**
 * The first screen after sign-in. It answers three questions, in order: what
 * should I do next, what needs my attention, and where do I stand.
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

const DUE_TONE: Record<string, 'neutral' | 'warning' | 'danger' | 'info'> = { danger: 'danger', warning: 'warning', neutral: 'neutral', info: 'info' };

export function OverviewPage() {
  const data = useWorkspace();
  const { role } = useAuth();
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
  const journeyStep = metrics.submitted > 0 ? 2 : metrics.drafts + metrics.unsure > 0 ? 1 : 0;

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
    <div className="ts-page cw-overview">
      <PageHeader
        kicker="Contributor overview"
        title={name ? `Welcome back, ${name}` : 'Welcome back'}
        description={summary}
        id="page-title"
        actions={<>
          <HomeStreak />
          {!data.preview && canValidate(role) ? <PortalLink to="/contributor/review" className="ts-btn ts-btn--secondary"><Icon name="shield" /><span>Review desk</span></PortalLink> : null}
        </>}
      />

      {data.worksState === 'error' || data.itemsState === 'error' ? (
        <Notice tone="danger" title="Your assignments could not be loaded" action={<button type="button" className="ts-btn ts-btn--sm" onClick={() => window.location.reload()}><Icon name="refresh" /><span>Reload</span></button>}>
          <p>Check your connection. Drafts you have already saved are safe on the server.</p>
        </Notice>
      ) : null}

      {returnedWork || attentionPayments ? (
        <div className="ts-stack ts-stack--sm" aria-label="Needs your attention">
          {returnedWork ? (
            <Notice tone="warning" title={`${pluralise(returnedWork, 'expression')} returned for revision`}
              action={<button type="button" className="ts-btn ts-btn--sm" onClick={() => navigate(data.paths.section('contributions', { filter: 'returned' }))}><span>Read the feedback</span><Icon name="arrow" /></button>}>
              <p>A reviewer asked for changes. Your earlier version and the decision stay on record.</p>
            </Notice>
          ) : null}
          {attentionPayments ? (
            <Notice tone="warning" title="Your payment details need attention"
              action={<button type="button" className="ts-btn ts-btn--sm" onClick={() => navigate(data.paths.account('payments'))}><span>Open payment details</span><Icon name="arrow" /></button>}>
              <p>{payments.value?.bank?.nextStep || payments.value?.momo?.nextStep || 'A finance reviewer needs something from you before payments can be sent.'}</p>
            </Notice>
          ) : null}
        </div>
      ) : null}

      {!onboarded && metrics.submitted === 0 && !loading ? (
        <section className="ts-panel ts-panel--accent cw-onboarding ts-enter" aria-labelledby="getting-started">
          <div className="ts-panel__head">
            <div className="ts-panel__heading">
              <p className="ts-kicker">Getting started</p>
              <h2 className="ts-panel__title" id="getting-started">Three steps from invitation to review</h2>
            </div>
            <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" onClick={() => { setOnboarded(true); try { localStorage.setItem(`contributor-intro:${data.uid}`, 'done'); } catch { /* Optional preference. */ } }}>
              <Icon name="check" /><span>Got it</span>
            </button>
          </div>
          <Steps label="Contribution journey" current={journeyStep} steps={[
            { title: 'Translate', detail: 'Open an assignment; drafts save as you type', icon: 'translation' },
            { title: 'Review & send', detail: 'Check your answer, then send it to reviewers', icon: 'send' },
            { title: 'Follow feedback', detail: 'Decisions and requested changes appear here', icon: 'eye' },
          ]} />
          <div className="ts-cluster">
            <PortalLink to={data.paths.section('assignments')} className="ts-btn ts-btn--primary ts-btn--sm"><span>Open your assignments</span><Icon name="arrow" /></PortalLink>
            <PortalLink to={data.paths.section('guide')} className="ts-btn ts-btn--ghost ts-btn--sm"><Icon name="guide" /><span>Read the contribution guide</span></PortalLink>
          </div>
        </section>
      ) : null}

      {loading ? <Skeleton lines={2} label="Counting your contributions" /> : <MetricTiles metrics={metrics} />}

      <div className="ts-split">
        <div className="ts-stack">
          <Card
            className="cw-current"
            title={work ? 'Continue where you left off' : 'Assignments'}
            labelledBy="current-assignment"
            actions={work ? <Chip tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Chip> : null}
          >
            {loading ? <Skeleton lines={4} label="Loading your current assignment" /> : work ? (
              <div className="ts-stack ts-stack--md">
                <div className="cw-current__title">
                  <span className="ts-card__icon ts-card__icon--ws" aria-hidden="true"><Icon name="assignments" /></span>
                  <div className="ts-stack ts-stack--sm" style={{ ['--gap' as string]: '0.35rem' }}>
                    <h3 className="cw-current__name">{work.title}</h3>
                    <div className="ts-cluster">
                      {due ? <Badge tone={DUE_TONE[due.tone] ?? 'neutral'} dot>{due.label}</Badge> : <Badge>No due date</Badge>}
                      <span className="ts-muted" style={{ fontSize: 'var(--fs-xs)' }}>{pluralise(workItems.length, 'expression')}{work.dialect ? ` · ${work.dialect}` : ''}</span>
                    </div>
                  </div>
                </div>
                <SegmentBar metrics={workMetrics} label={`Progress on ${work.title}`} />
                <div className="ts-cluster">
                  {next ? (
                    <Button variant="primary" iconRight="arrow" onClick={() => navigate(data.paths.work(work.id, next.id))}>
                      {['rejected', 'needs_revision'].includes(next.status) ? 'Revise returned expression' : next.translation.trim() ? 'Continue translating' : 'Start translating'}
                    </Button>
                  ) : null}
                  <PortalLink to={data.paths.work(work.id)} className="ts-btn ts-btn--secondary"><span>View assignment</span></PortalLink>
                  {data.works.length > 1 ? <PortalLink to={data.paths.section('assignments')} className="ts-link">All {data.works.length} assignments<Icon name="arrow" /></PortalLink> : null}
                </div>
              </div>
            ) : (
              <EmptyNote title="No assignments yet" icon="assignments">
                The team assigns sets of expressions to invited contributors. While you wait, read how assignments work in the guide.
              </EmptyNote>
            )}
          </Card>

          <DailyTasks />

          <Card title="Recent activity" labelledBy="recent-activity" actions={<PortalLink to={data.paths.section('activity')} className="ts-link">View all<Icon name="arrow" /></PortalLink>}>
            {data.roundsState === 'loading' ? <Skeleton lines={4} label="Loading your activity" /> : data.roundsState === 'error' ? (
              <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>Your review history could not be loaded just now. Your assignments above are up to date.</p>
            ) : <ActivityList events={events.slice(0, 5)} onOpen={openEvent} now={now} emptyText="Your submissions and review decisions will appear here." />}
          </Card>
        </div>

        <aside className="ts-stack ts-split__rail--sticky" aria-label="Community and help">
          <PulsePanel pulse={data.pulse} onPrivacy={() => navigate(data.paths.account('notifications'))} />
          <Card title="Need a hand?" labelledBy="help-entry">
            <button type="button" className="ts-card ts-card--interactive cw-help-card" onClick={() => navigate(data.paths.section('kawuri', work ? { work: work.id, ...(next ? { item: next.id } : {}) } : undefined))}>
              <span className="ts-row">
                <span className="ts-card__icon" aria-hidden="true"><Icon name="kawuri" /></span>
                <span className="ts-stack" style={{ ['--gap' as string]: '0.1rem' }}>
                  <strong className="ts-card__title">Ask Kawuri</strong>
                  <span className="ts-card__body">Meaning and context help. Your Kasem stays yours.</span>
                </span>
              </span>
            </button>
            <ul className="ts-list">
              {GUIDE.slice(0, 4).map((section) => (
                <li key={section.id}>
                  <PortalLink to={data.paths.section('guide', { section: section.id })} className="ts-list__row">
                    <span className="ts-list__lead" aria-hidden="true"><Icon name="guide" /></span>
                    <span className="ts-list__main"><span className="ts-list__title">{section.title}</span></span>
                    <span className="ts-list__trail"><Icon name="chevron" /></span>
                  </PortalLink>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
