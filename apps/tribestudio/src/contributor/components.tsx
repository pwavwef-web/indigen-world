import { useEffect, useState, type ReactNode } from 'react';
import {
  STATUS_META,
  formatDateTime,
  relativeTime,
  type ActivityEvent,
  type FriendlyError,
  type ItemStatus,
  type Metrics,
} from './model';
import type { PulseState, VerificationStatus } from './types';
import {
  Badge,
  EmptyState,
  Notice as KitNotice,
  PageHeader as KitPageHeader,
  Panel,
  Skeleton as KitSkeleton,
  StatCard,
  StatGrid,
  cx,
  type Tone as KitTone,
} from '../ui';

/* Shared building blocks for the contributor workspace, on the studio's
   design system. The names and props are the ones the portal's pages have
   always used; only their look changed. */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

export { cx };
export { Icon, type IconName } from '../ui/icons';
export { BrandMark } from '../ui/BrandMark';
import { Icon, type IconName } from '../ui/icons';

export function PageHeader({ kicker, title, description, actions, breadcrumb, meta, id = 'page-title' }: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  meta?: ReactNode;
  id?: string;
}) {
  return <KitPageHeader kicker={kicker && kicker !== title ? kicker : undefined} title={title} description={description} actions={actions} breadcrumb={breadcrumb} meta={meta} id={id} />;
}

export function Card({ title, meta, actions, children, className, as = 'section', labelledBy }: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
  labelledBy?: string;
}) {
  return <Panel as={as} title={title} description={meta} actions={actions} className={className} labelledBy={labelledBy}>{children}</Panel>;
}

export function Chip({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <Badge tone={tone as KitTone} dot className={className}>{children}</Badge>;
}

export function StatusChip({ status }: { status: ItemStatus }) {
  const meta = STATUS_META[status];
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}

export const VERIFICATION_META: Record<VerificationStatus, { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  pending: { label: 'Pending review', tone: 'info' },
  verified: { label: 'Verified', tone: 'success' },
  needs_action: { label: 'Needs action', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export function VerificationChip({ status, label }: { status: VerificationStatus; label?: string }) {
  const meta = VERIFICATION_META[status];
  return <Chip tone={meta.tone}>{label ?? meta.label}</Chip>;
}

const SEGMENT_COLOUR: Record<string, string> = {
  approved: 'var(--success-dot)',
  awaiting: 'var(--c-blue)',
  returned: 'var(--warning-dot)',
  drafts: 'var(--c-blue-soft)',
  unsure: '#a78bfa',
  other: '#94a3b8',
};

/** Where every expression in a set stands, as one bar and a legend. */
export function SegmentBar({ metrics, label = 'Assignment progress', showLegend = true }: { metrics: Metrics; label?: string; showLegend?: boolean }) {
  const total = Math.max(metrics.total, 1);
  const segments = [
    { key: 'approved', label: 'approved', value: metrics.approved },
    { key: 'awaiting', label: 'awaiting review', value: metrics.awaiting },
    { key: 'returned', label: 'returned', value: metrics.returned },
    { key: 'drafts', label: metrics.drafts === 1 ? 'draft' : 'drafts', value: metrics.drafts },
    { key: 'unsure', label: 'flagged unsure', value: metrics.unsure },
    { key: 'other', label: 'archived', value: metrics.other },
  ];
  const done = metrics.approved + metrics.awaiting;
  return (
    <div className="ts-stack ts-stack--sm">
      <div
        className="ts-meter"
        role="img"
        aria-label={`${label}: ${done} of ${metrics.total} sent and not returned. ${segments.filter((segment) => segment.value).map((segment) => `${segment.value} ${segment.label}`).join(', ')}; ${metrics.notStarted} not started.`}
      >
        {segments.map((segment) => segment.value ? (
          <span key={segment.key} className="ts-meter__part" style={{ width: `${(segment.value / total) * 100}%`, background: SEGMENT_COLOUR[segment.key] }} />
        ) : null)}
      </div>
      {showLegend ? (
        <ul className="ts-legend">
          {segments.filter((segment) => segment.value).map((segment) => (
            <li key={segment.key}><span className="ts-dot" style={{ ['--dot' as string]: SEGMENT_COLOUR[segment.key] }} aria-hidden="true" />{segment.value} {segment.label}</li>
          ))}
          {metrics.notStarted ? <li><span className="ts-dot" style={{ ['--dot' as string]: 'var(--border-strong)' }} aria-hidden="true" />{metrics.notStarted} not started</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function MetricTiles({ metrics }: { metrics: Metrics }) {
  return (
    <StatGrid label="Your contributions across all assignments">
      <StatCard icon="send" label="Submitted" value={metrics.submitted} hint="Sent for review" />
      <StatCard icon="clock" label="Awaiting review" value={metrics.awaiting} hint="With the reviewers" />
      <StatCard icon="check-circle" label="Approved" value={metrics.approved} hint="Accepted by a reviewer" />
      <StatCard icon="refresh" label="To revisit" value={metrics.returned} hint={metrics.returned ? 'Reviewer feedback awaits' : 'Nothing to revise'} attention={metrics.returned > 0} />
    </StatGrid>
  );
}

export function Notice({ tone = 'info', title, children, action, role }: {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  return <KitNotice tone={tone} title={title} action={action} role={role}>{children}</KitNotice>;
}

export function ErrorNote({ error, onRetry, title }: { error: FriendlyError; onRetry?: () => void; title?: string }) {
  return (
    <Notice tone="danger" title={title} role="alert" action={onRetry ? <button type="button" className="ts-btn ts-btn--sm" onClick={onRetry}><Icon name="refresh" /><span>Try again</span></button> : undefined}>
      <p>{error.message}</p>
      {error.reference && !error.message.includes(error.reference) ? <p className="ts-muted">Reference {error.reference}</p> : null}
    </Notice>
  );
}

export function EmptyNote({ title, children, action, icon = 'inbox' }: { title: string; children?: ReactNode; action?: ReactNode; icon?: IconName }) {
  return <EmptyState boxed compact icon={icon} title={title} body={children} actions={action} />;
}

export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return <KitSkeleton lines={lines} label={label} />;
}

/** Ticks once a minute so relative times ("3 min ago") stay true on an open page. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Today across the contributor community, from real events only. The rows
 * come from the backend's pulse (contributor-pulse.ts), labelled with a
 * contributor's chosen display name or "A contributor"; nothing is invented
 * when the day is quiet or the feed cannot be read.
 */
export function PulsePanel({ pulse, onPrivacy }: { pulse: PulseState; onPrivacy?: () => void }) {
  const now = useNow();
  const today = new Date(now).toISOString().slice(0, 10);
  const entries = pulse.entries.filter((entry) => entry.day === today && (entry.submitted || entry.approved));
  const liveLabel = pulse.state === 'live' ? 'Live' : pulse.state === 'cached' ? 'Reconnecting' : pulse.state === 'loading' ? 'Connecting' : 'Unavailable';
  const liveTone = pulse.state === 'live' ? 'success' : pulse.state === 'unavailable' ? 'neutral' : 'warning';
  return (
    <Panel
      className="cw-pulse"
      title="Community today"
      labelledBy="cw-pulse-title"
      actions={<Badge tone={liveTone} live={pulse.state === 'live'} dot>{liveLabel}</Badge>}
    >
      {pulse.state === 'unavailable' ? (
        <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>
          {pulse.reason === 'permission'
            ? 'Community activity is not available to this account yet. Your own work and progress are unaffected.'
            : 'Community activity could not be loaded. It will reconnect on its own when the connection returns.'}
        </p>
      ) : pulse.state === 'loading' ? <Skeleton lines={3} label="Loading community activity" /> : (
        <>
          <dl className="ts-facts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="ts-fact"><dt>Sent</dt><dd className="ts-num">{pulse.totals?.submitted ?? 0}</dd></div>
            <div className="ts-fact"><dt>Approved</dt><dd className="ts-num">{pulse.totals?.approved ?? 0}</dd></div>
            <div className="ts-fact"><dt>People</dt><dd className="ts-num">{pulse.totals?.contributors ?? 0}</dd></div>
          </dl>
          {entries.length ? (
            <ol className="ts-list" aria-live="polite" aria-label="Recent community activity">
              {entries.slice(0, 6).map((entry) => (
                <li key={entry.id} className="ts-list__row ts-fade-in">
                  <span className="ts-avatar ts-avatar--sm" aria-hidden="true">{entry.label ? entry.label[0].toUpperCase() : <Icon name="user" />}</span>
                  <span className="ts-list__main">
                    <span className="ts-list__title ts-list__title--wrap" style={{ fontWeight: 500 }}>
                      <strong>{entry.label ?? 'A contributor'}</strong>{' '}
                      {entry.submitted ? `sent ${entry.submitted} expression${entry.submitted === 1 ? '' : 's'} for review` : ''}
                      {entry.submitted && entry.approved ? ' and ' : ''}
                      {entry.approved ? `had ${entry.approved} approved` : ''}
                    </span>
                  </span>
                  <time className="ts-list__trail" dateTime={entry.updatedAt} title={formatDateTime(entry.updatedAt)}>{relativeTime(entry.updatedAt, now)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>No contributions yet today. Work sent for review appears here as it happens.</p>
          )}
        </>
      )}
      {onPrivacy ? <button type="button" className="ts-link ts-link--quiet" onClick={onPrivacy}><Icon name="eye" />How you appear here</button> : null}
    </Panel>
  );
}

const ACTIVITY_ICON: Record<ActivityEvent['kind'], IconName> = {
  submitted: 'send', resubmitted: 'refresh', approved: 'check', returned: 'alert', in_review: 'clock',
  archived: 'archive', assigned: 'assignments', payment: 'bank',
};

const ACTIVITY_TONE: Partial<Record<ActivityEvent['kind'], { bg: string; fg: string }>> = {
  approved: { bg: 'var(--success-surface)', fg: 'var(--success)' },
  returned: { bg: 'var(--warning-surface)', fg: 'var(--warning)' },
  submitted: { bg: 'var(--accent-soft)', fg: 'var(--accent-text)' },
  resubmitted: { bg: 'var(--accent-soft)', fg: 'var(--accent-text)' },
  payment: { bg: 'var(--violet-surface)', fg: 'var(--violet)' },
};

export function ActivityList({ events, onOpen, now = Date.now(), emptyText = 'Nothing here yet.' }: {
  events: ActivityEvent[];
  onOpen?: (event: ActivityEvent) => void;
  now?: number;
  emptyText?: string;
}) {
  if (!events.length) return <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>{emptyText}</p>;
  return (
    <ol className="ts-list cw-activity">
      {events.map((event) => {
        const openable = Boolean(onOpen && (event.item || event.work || event.link));
        const tone = ACTIVITY_TONE[event.kind];
        const body = (
          <>
            <span className="ts-list__lead" style={tone ? { background: tone.bg, color: tone.fg } : undefined} aria-hidden="true"><Icon name={ACTIVITY_ICON[event.kind]} /></span>
            <span className="ts-list__main">
              <span className="ts-list__title ts-list__title--wrap">{event.title}</span>
              {event.detail ? <span className="ts-list__meta ts-list__meta--wrap ts-clamp-2">{event.detail}</span> : null}
            </span>
            <span className="ts-list__trail">
              <time dateTime={event.at} title={formatDateTime(event.at)}>{relativeTime(event.at, now)}</time>
              {openable ? <Icon name="chevron" /> : null}
            </span>
          </>
        );
        return (
          <li key={event.id}>
            {openable ? <button type="button" className="ts-list__row" onClick={() => onOpen?.(event)}>{body}</button> : <div className="ts-list__row">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}
