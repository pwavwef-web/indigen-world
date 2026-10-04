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

/* Shared building blocks for the contributor workspace. Styling lives in
   contributor.css under the `cw-` prefix; tones map onto the console kit's
   signal colours so a status reads the same here as in the admin console. */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export { Icon, type IconName } from '../interface/icons';
import { Icon, type IconName } from '../interface/icons';

export function BrandMark() {
  return (
    <span className="cw-brand__mark" aria-hidden="true">
      <svg viewBox="0 0 64 64"><path d="M15 47V23l17-9 17 9v24" /><path d="M24 44V29m8 15V24m8 20V29" /><circle cx="32" cy="14" r="4" /></svg>
    </span>
  );
}

export function PageHeader({ kicker, title, description, actions, breadcrumb, id }: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  id?: string;
}) {
  return (
    <header className="cw-page-head">
      {breadcrumb ? <nav className="cw-breadcrumb" aria-label="Breadcrumb">{breadcrumb}</nav> : null}
      <div className="cw-page-head__row">
        <div className="cw-page-head__copy">
          {kicker && kicker !== title ? <p className="cw-kicker">{kicker}</p> : null}
          <h1 id={id} tabIndex={-1}>{title}</h1>
          {description ? <p className="cw-page-head__description">{description}</p> : null}
        </div>
        {actions ? <div className="cw-page-head__actions">{actions}</div> : null}
      </div>
    </header>
  );
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
  const Element = as;
  return (
    <Element className={cx('cw-card', className)} aria-labelledby={labelledBy}>
      {title || actions ? (
        <div className="cw-card__head">
          <div className="cw-card__title">
            {title ? <h2 id={labelledBy}>{title}</h2> : null}
            {meta ? <p className="cw-card__meta">{meta}</p> : null}
          </div>
          {actions ? <div className="cw-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Element>
  );
}

export function Chip({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('cw-chip', `cw-chip--${tone}`, className)}>{children}</span>;
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
    <div className="cw-segments">
      <div
        className="cw-segments__bar"
        role="img"
        aria-label={`${label}: ${done} of ${metrics.total} sent and not returned. ${segments.filter((segment) => segment.value).map((segment) => `${segment.value} ${segment.label}`).join(', ')}; ${metrics.notStarted} not started.`}
      >
        {segments.map((segment) => segment.value ? (
          <span key={segment.key} className={`cw-segments__part cw-segments__part--${segment.key}`} style={{ width: `${(segment.value / total) * 100}%` }} />
        ) : null)}
      </div>
      {showLegend ? (
        <ul className="cw-segments__legend">
          {segments.filter((segment) => segment.value).map((segment) => (
            <li key={segment.key}><span className={`cw-dot cw-dot--${segment.key}`} aria-hidden="true" />{segment.value} {segment.label}</li>
          ))}
          {metrics.notStarted ? <li><span className="cw-dot cw-dot--empty" aria-hidden="true" />{metrics.notStarted} not started</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function MetricTiles({ metrics }: { metrics: Metrics }) {
  const tiles = [
    { key: 'submitted', label: 'Submitted', value: metrics.submitted, note: 'Sent for review', icon: 'contributions' as const },
    { key: 'awaiting', label: 'Awaiting review', value: metrics.awaiting, note: 'With the reviewers', icon: 'clock' as const },
    { key: 'approved', label: 'Approved', value: metrics.approved, note: 'Accepted by a reviewer', icon: 'check' as const },
    { key: 'returned', label: 'To revisit', value: metrics.returned, note: metrics.returned ? 'Reviewer feedback awaits' : 'Nothing to revise', icon: 'assignments' as const },
  ];
  return (
    <dl className="cw-metrics">
      {tiles.map((tile) => (
        <div key={tile.key} className={cx('cw-metric', `cw-metric--${tile.key}`, tile.key === 'returned' && tile.value > 0 && 'is-attention')}>
          <dt><span className="cw-metric__icon"><Icon name={tile.icon} /></span>{tile.label}</dt>
          <dd><span className="cw-metric__value">{tile.value}</span><span className="cw-metric__note">{tile.note}</span></dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = 'info', title, children, action, role }: {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  const icon: IconName = tone === 'success' ? 'check' : tone === 'info' || tone === 'neutral' ? 'help' : 'alert';
  return (
    <div className={cx('cw-notice', `cw-notice--${tone}`)} role={role ?? (tone === 'danger' ? 'alert' : undefined)}>
      <Icon name={icon} className="cw-notice__icon" />
      <div className="cw-notice__body">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="cw-notice__action">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ error, onRetry, title }: { error: FriendlyError; onRetry?: () => void; title?: string }) {
  return (
    <Notice tone="danger" title={title} role="alert" action={onRetry ? <button type="button" onClick={onRetry}>Try again</button> : undefined}>
      <p>{error.message}</p>
      {error.reference && !error.message.includes(error.reference) ? <p className="cw-muted">Reference {error.reference}</p> : null}
    </Notice>
  );
}

export function EmptyNote({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="cw-empty">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div className="cw-skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - index * 14}%` }} />)}
    </div>
  );
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
  return (
    <Card
      className="cw-pulse"
      title="Community today"
      labelledBy="cw-pulse-title"
      actions={<span className={cx('cw-live', `cw-live--${pulse.state}`)}><span aria-hidden="true" />{liveLabel}</span>}
    >
      {pulse.state === 'unavailable' ? (
        <p className="cw-muted">
          {pulse.reason === 'permission'
            ? 'Community activity is not available to this account yet. Your own work and progress are unaffected.'
            : 'Community activity could not be loaded. It will reconnect on its own when the connection returns.'}
        </p>
      ) : pulse.state === 'loading' ? <Skeleton lines={3} label="Loading community activity" /> : (
        <>
          <dl className="cw-pulse__totals">
            <div><dt>Sent for review</dt><dd>{pulse.totals?.submitted ?? 0}</dd></div>
            <div><dt>Approved</dt><dd>{pulse.totals?.approved ?? 0}</dd></div>
            <div><dt>Contributors</dt><dd>{pulse.totals?.contributors ?? 0}</dd></div>
          </dl>
          {entries.length ? (
            <ol className="cw-pulse__feed" aria-live="polite" aria-label="Recent community activity">
              {entries.slice(0, 6).map((entry) => (
                <li key={entry.id} className="cw-pulse__row">
                  <span className={cx('cw-pulse__avatar', !entry.label && 'is-anonymous')} aria-hidden="true">{entry.label ? entry.label[0].toUpperCase() : <Icon name="user" />}</span>
                  <span className="cw-pulse__text">
                    <strong>{entry.label ?? 'A contributor'}</strong>{' '}
                    {entry.submitted ? `sent ${entry.submitted} expression${entry.submitted === 1 ? '' : 's'} for review` : ''}
                    {entry.submitted && entry.approved ? ' and ' : ''}
                    {entry.approved ? `had ${entry.approved} approved` : ''}
                  </span>
                  <time dateTime={entry.updatedAt} title={formatDateTime(entry.updatedAt)}>{relativeTime(entry.updatedAt, now)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="cw-muted">No contributions yet today. Work sent for review appears here as it happens.</p>
          )}
        </>
      )}
      {onPrivacy ? <button type="button" className="cw-link-button cw-pulse__privacy" onClick={onPrivacy}>How you appear here</button> : null}
    </Card>
  );
}

const ACTIVITY_ICON: Record<ActivityEvent['kind'], IconName> = {
  submitted: 'arrow', resubmitted: 'arrow', approved: 'check', returned: 'alert', in_review: 'clock',
  archived: 'doc', assigned: 'assignments', payment: 'bank',
};

export function ActivityList({ events, onOpen, now = Date.now(), emptyText = 'Nothing here yet.' }: {
  events: ActivityEvent[];
  onOpen?: (event: ActivityEvent) => void;
  now?: number;
  emptyText?: string;
}) {
  if (!events.length) return <p className="cw-muted">{emptyText}</p>;
  return (
    <ol className="cw-activity">
      {events.map((event) => {
        const openable = Boolean(onOpen && (event.item || event.work || event.link));
        const body = (
          <>
            <span className={cx('cw-activity__icon', `cw-activity__icon--${event.kind}`)} aria-hidden="true"><Icon name={ACTIVITY_ICON[event.kind]} /></span>
            <span className="cw-activity__copy">
              <span className="cw-activity__title">{event.title}</span>
              {event.detail ? <span className="cw-activity__detail">{event.detail}</span> : null}
            </span>
            <time dateTime={event.at} title={formatDateTime(event.at)}>{relativeTime(event.at, now)}</time>
          </>
        );
        return (
          <li key={event.id}>
            {openable ? <button type="button" className="cw-activity__row" onClick={() => onOpen?.(event)}>{body}</button> : <div className="cw-activity__row">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}
