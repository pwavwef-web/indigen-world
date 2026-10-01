import { useMemo } from 'react';
import { useRoute } from '../../router';
import {
  ActivityList,
  Badge,
  EmptyState,
  Icon,
  Notice,
  PageHeader,
  Panel,
  PulsePanel,
  SegmentBar,
  Skeleton,
  StatList,
  cx,
  useNow,
  type StatItem,
} from '../components';
import {
  WORK_STATE_META,
  dueInfo,
  metricsFor,
  nextContribution,
  pluralise,
  workState,
  type Item,
  type Work,
} from '../model';
import { ACTION_LABEL, STATE_META, TYPE_META, sentRows, summarise, type SubmissionRow } from '../submissions';
import { loadExpressionDraft } from '../../creator/expressions-data';
import { GUIDE } from '../guide';
import { PortalLink, paymentsNeedAttention, useShared, useWorkspace } from '../workspace';
import { DailyBatch } from '../DailyTasks';

/**
 * The first screen after sign-in. It answers three questions, in order:
 * what needs my attention, what should I do next, and where does my work
 * stand. Personal figures come only from the contributor's own records;
 * community figures appear only when the live feed has something to show.
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

/** Where a row's next action leads. */
export function rowActionHref(row: SubmissionRow, paths: ReturnType<typeof useWorkspace>['paths']): string {
  if (row.type === 'assigned' && row.work) return paths.work(row.work, row.item);
  if (row.action === 'correct' && row.id) return paths.section('contribute', { type: 'expression', correct: row.id });
  if (row.action === 'record_again') return paths.section('contribute', { type: 'recording' });
  return paths.section('contributions', { view: row.key });
}

export function OverviewPage() {
  const data = useWorkspace();
  const { self, payments, rewards, rows, revisions, events } = useShared();
  const { navigate } = useRoute();
  const now = useNow();
  const work = useMemo(() => currentAssignment(data.works, data.items), [data.items, data.works]);
  const workItems = work ? data.items[work.id] ?? [] : [];
  const workMetrics = metricsFor(workItems);
  const state = workState(workItems);
  const next = nextContribution(workItems);
  const due = work ? dueInfo(work.deadline, state === 'complete' || state === 'awaiting_review', new Date(now)) : null;
  const summary = useMemo(() => summarise(rows), [rows]);
  const sent = useMemo(() => sentRows(rows), [rows]);
  const name = (self.value?.profile.displayName || data.displayName || '').trim();
  const loading = data.worksState === 'loading' || (data.worksState === 'ready' && data.itemsState === 'loading');
  const attentionPayments = paymentsNeedAttention(payments.value);
  const localDraft = useMemo(() => loadExpressionDraft(data.uid), [data.uid]);
  const attentionCount = revisions.length + (attentionPayments ? 1 : 0);

  const openEvent = (event: { work?: string; item?: string; link?: string }) => {
    if (event.link) navigate(event.link);
    else if (event.work) navigate(data.paths.work(event.work, event.item));
  };

  const stats: StatItem[] = [
    { key: 'drafts', label: 'Drafts', value: summary.drafts, hint: 'Saved, not sent', href: data.paths.section('contributions', { status: 'drafts' }) },
    { key: 'review', label: 'Awaiting review', value: summary.inReview, hint: 'With reviewers', href: data.paths.section('contributions', { status: 'in_review' }) },
    { key: 'action', label: 'Needs your action', value: summary.action, hint: summary.action ? 'Reviewer feedback waiting' : 'Nothing to revise', href: data.paths.section('revisions'), attention: summary.action > 0 },
    { key: 'approved', label: 'Approved', value: summary.approved + summary.published, hint: summary.published ? `${summary.published} published` : 'Accepted by a reviewer', href: data.paths.section('contributions', { status: 'approved' }) },
  ].map((item) => ({ ...item, onOpen: () => navigate(item.href) }));

  return (
    <div className="cw-page cw-overview">
      <PageHeader
        title="Overview"
        description={name ? `Signed in as ${name}. Your tasks, submissions and reviewer feedback in one place.` : 'Your tasks, submissions and reviewer feedback in one place.'}
        actions={<PortalLink to={data.paths.section('contribute')} className={cx('cw-btn', attentionCount ? '' : 'cw-btn--primary')}><Icon name="plus" />Start a contribution</PortalLink>}
      />

      {data.worksState === 'error' || data.itemsState === 'error' ? (
        <Notice tone="danger" title="Your tasks could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>Check your connection. Drafts you have already saved are safe on the server.</p>
        </Notice>
      ) : null}

      <div className="cw-overview__grid">
        <div className="cw-overview__main">
          {attentionCount ? (
            <Panel title="Needs your attention" description={`${pluralise(attentionCount, 'item')} waiting for you`} flush className="cw-attention">
              <ul className="cw-list-rows">
                {revisions.slice(0, 3).map((row) => (
                  <li key={row.key} className="cw-row-item">
                    <span className="cw-row-item__icon cw-row-item__icon--warning" aria-hidden="true"><Icon name="revisions" /></span>
                    <div className="cw-row-item__copy">
                      <strong><span lang={row.titleLang}>{row.title}</span> · {STATE_META[row.state].label.toLowerCase()}</strong>
                      <span>{row.feedback ? <>Reviewer: “{truncate(row.feedback, 140)}”</> : TYPE_META[row.type].label}</span>
                    </div>
                    <PortalLink to={rowActionHref(row, data.paths)} className="cw-btn cw-btn--primary cw-btn--sm">{row.action ? ACTION_LABEL[row.action] : 'Open'}</PortalLink>
                  </li>
                ))}
                {revisions.length > 3 ? (
                  <li className="cw-row-item cw-row-item--more">
                    <span />
                    <span className="cw-muted">{pluralise(revisions.length - 3, 'more revision request')}</span>
                    <PortalLink to={data.paths.section('revisions')} className="cw-text-link">View all<Icon name="arrow" /></PortalLink>
                  </li>
                ) : null}
                {attentionPayments ? (
                  <li className="cw-row-item">
                    <span className="cw-row-item__icon cw-row-item__icon--warning" aria-hidden="true"><Icon name="bank" /></span>
                    <div className="cw-row-item__copy">
                      <strong>Your payment details need attention</strong>
                      <span>{payments.value?.bank?.nextStep || payments.value?.momo?.nextStep || 'A finance reviewer needs something from you.'}</span>
                    </div>
                    <PortalLink to={data.paths.account('payments')} className="cw-btn cw-btn--sm">Open payment details</PortalLink>
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}

          <Panel
            title="Continue where you left off"
            actions={data.works.length > 1 ? <PortalLink to={data.paths.section('assignments')} className="cw-text-link">All {data.works.length} tasks<Icon name="arrow" /></PortalLink> : undefined}
          >
            {loading ? <Skeleton lines={4} label="Loading your current task" /> : work ? (
              <div className="cw-current">
                <div className="cw-current__head">
                  <div className="cw-current__title">
                    <h3>{work.title}</h3>
                    <p className="cw-page-head__meta">
                      <span className={cx(due && `cw-due cw-due--${due.tone}`)}><Icon name="clock" className="cw-icon--sm" />{due ? due.label : 'No due date'}</span>
                      <span>{pluralise(workItems.length, 'expression')}</span>
                      {work.dialect ? <span>{work.dialect}</span> : null}
                    </p>
                  </div>
                  <Badge tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Badge>
                </div>
                <SegmentBar metrics={workMetrics} label={`Progress on ${work.title}`} />
                <div className="cw-inline-actions">
                  {next ? (
                    <PortalLink to={data.paths.work(work.id, next.id)} className="cw-btn cw-btn--primary">
                      {['rejected', 'needs_revision'].includes(next.status) ? 'Revise returned expression' : next.translation.trim() ? 'Continue translating' : 'Start translating'}
                      <Icon name="arrow" />
                    </PortalLink>
                  ) : null}
                  <PortalLink to={data.paths.work(work.id)} className="cw-btn">Open task</PortalLink>
                </div>
                {localDraft ? (
                  <p className="cw-current__extra"><Icon name="edit" className="cw-icon--sm" />You also have an unsent everyday expression saved in this browser. <PortalLink to={data.paths.section('contribute', { type: 'expression' })} className="cw-text-link">Continue it</PortalLink></p>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title={localDraft ? 'You have an unsent expression' : 'No tasks assigned yet'}
                icon="assignments"
                variant="bare"
                actions={<>
                  <PortalLink to={data.paths.section('contribute', { type: 'expression' })} className="cw-btn cw-btn--primary">{localDraft ? 'Continue your expression' : 'Share an everyday expression'}</PortalLink>
                  <PortalLink to={data.paths.section('guide', { section: 'assignments' })} className="cw-btn">How tasks work</PortalLink>
                </>}
              >
                The team sends translation tasks to invited contributors. While you wait, you can share an everyday Kasem expression you know well.
              </EmptyState>
            )}
          </Panel>

          {sent.length || summary.drafts ? (
            <Panel
              title="Your submissions"
              description="Across tasks, expressions, words and recordings"
              flush
              actions={<PortalLink to={data.paths.section('contributions')} className="cw-text-link">My submissions<Icon name="arrow" /></PortalLink>}
            >
              <StatList items={stats} label="Your submissions by status" />
            </Panel>
          ) : !loading && data.receiptsState !== 'loading' ? (
            <Panel title="How your work moves">
              <ol className="cw-steps">
                <li><span className="cw-steps__n">1</span><div><strong>Translate or share</strong><p>Work on an assigned task, or share an expression, word or recording you know.</p></div></li>
                <li><span className="cw-steps__n">2</span><div><strong>A reviewer checks it</strong><p>Kasem-speaking reviewers approve it or explain what to change.</p></div></li>
                <li><span className="cw-steps__n">3</span><div><strong>You see the decision</strong><p>Every decision and its feedback appears in My submissions.</p></div></li>
              </ol>
            </Panel>
          ) : null}

          <Panel
            title="Recent activity"
            flush
            actions={<PortalLink to={data.paths.section('activity')} className="cw-text-link">All updates<Icon name="arrow" /></PortalLink>}
          >
            {data.roundsState === 'loading' ? <div className="cw-panel__pad"><Skeleton lines={3} label="Loading your activity" /></div> : data.roundsState === 'error' ? (
              <p className="cw-muted cw-panel__pad">Your review history could not be loaded just now. Your tasks above are up to date.</p>
            ) : <ActivityList events={events.slice(0, 5)} onOpen={openEvent} now={now} emptyText="Submissions and reviewer decisions will appear here." />}
          </Panel>
        </div>

        <aside className="cw-overview__side" aria-label="More for you">
          <DailyBatch compact />
          {rewards.value ? (
            <Panel
              title="Points"
              actions={<PortalLink to={data.paths.section('rewards')} className="cw-text-link">Rewards<Icon name="arrow" /></PortalLink>}
            >
              <div className="cw-points-mini">
                <span className="cw-points-mini__value">{rewards.value.rewards.balance.toLocaleString()}</span>
                <span className="cw-muted">points available</span>
              </div>
              <p className="cw-muted cw-small">Each approved assigned translation earns {rewards.value.rewards.pointsPerExpression} points, up to {rewards.value.rewards.dailyCap} a day. Points are not cash.</p>
            </Panel>
          ) : null}
          <PulsePanel pulse={data.pulse} onPrivacy={() => navigate(data.paths.account('notifications'))} />
          <Panel title="Guidelines">
            <ul className="cw-link-list">
              {GUIDE.slice(0, 4).map((section) => (
                <li key={section.id}><PortalLink to={data.paths.section('guide', { section: section.id })}>{section.title}<Icon name="chevron" /></PortalLink></li>
              ))}
              <li><PortalLink to={data.paths.section('kawuri', work ? { work: work.id, ...(next ? { item: next.id } : {}) } : undefined)}>Ask Kawuri about a task<Icon name="chevron" /></PortalLink></li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}
