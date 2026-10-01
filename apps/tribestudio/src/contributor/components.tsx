import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
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

/* Shared building blocks for the contributor and validator workspaces.
   Styling lives in styles/portal.css under the `cw-` prefix. Pages compose
   these instead of styling themselves, so a status, a field or an empty
   state reads the same on every screen. */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Icons — one stroke set, 24px grid, currentColor
// ---------------------------------------------------------------------------

export type IconName =
  | 'overview' | 'assignments' | 'contribute' | 'contributions' | 'revisions' | 'rewards' | 'activity' | 'guide'
  | 'kawuri' | 'account' | 'more' | 'logout' | 'arrow' | 'back' | 'check' | 'alert' | 'clock' | 'lock' | 'bank'
  | 'phone' | 'upload' | 'shield' | 'help' | 'external' | 'close' | 'spark' | 'search' | 'user' | 'bell' | 'doc'
  | 'mic' | 'play' | 'pause' | 'stop' | 'trash' | 'refresh' | 'queue' | 'history' | 'chevron' | 'chevron-down'
  | 'plus' | 'flag' | 'word' | 'expression' | 'translate' | 'calendar' | 'edit' | 'swap' | 'sentence' | 'name'
  | 'advert' | 'info' | 'filter' | 'award' | 'send' | 'save' | 'eye';

const ICONS: Record<IconName, ReactNode> = {
  overview: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></>,
  assignments: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  contribute: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  contributions: <><path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5" /><path d="M4 13.5 6.5 5h11l2.5 8.5" /><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" /></>,
  revisions: <><path d="M4 12a8 8 0 0 1 14-5.3L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-14 5.3L4 16" /><path d="M4 20v-4h4" /></>,
  rewards: <><circle cx="12" cy="9" r="5.5" /><path d="m9 13.6-1.5 7.4 4.5-2.5 4.5 2.5L15 13.6" /></>,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="m9 13.6-1.5 7.4 4.5-2.5 4.5 2.5L15 13.6" /></>,
  activity: <><path d="M3 12h4l3 8 4-16 3 8h4" /></>,
  guide: <><path d="M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2Z" /><path d="M12 6.5v14" /></>,
  kawuri: <><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11l5.6-2Z" /><path d="M19 3v3M17.5 4.5h3" /></>,
  account: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H4M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  back: <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  alert: <><path d="M12 9v4M12 16.5h.01" /><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  lock: <><rect x="4.5" y="11" width="15" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>,
  bank: <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>,
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2" /><path d="M11 18h2" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 4.8 3.2 8 7.5 9 4.3-1 7.5-4.2 7.5-9V6Z" /><path d="m9 12 2 2 4-4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.2 9a2.9 2.9 0 1 1 5.2 1.8c-1.4 1-2.4 1.6-2.4 3.2M12 17h.01" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  spark: <><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11l5.6-2Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 6.5-2.5 8-2.5 8h17S18 15.5 18 9" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" /></>,
  play: <><path d="M8 5.5v13l10.5-6.5Z" /></>,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  stop: <><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  queue: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  'chevron-down': <><path d="m6 9 6 6 6-6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  flag: <><path d="M5 21V4.5M5 4.5h11.5l-2 4 2 4H5" /></>,
  word: <><path d="M4 19 9 5h1l5 14M6 14.5h7" /><path d="M17 11.5c2.2-1.2 4 0 4 2.5V19M21 15.5c-1.5-.6-4-.5-4 1.5 0 1.5 1.2 2 2 2 1 0 2-.6 2-2" /></>,
  expression: <><path d="M5 17.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3.5Z" /><path d="M9 10h6M9 13h3.5" /></>,
  translate: <><path d="M4 5h8M8 3v2M10.5 5c-1 4-3.5 7-6.5 8.5M6 9c1 2 2.6 3.5 5 4.5" /><path d="m13 21 4-9 4 9M14.5 18h5" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  edit: <><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14 8 3 3" /></>,
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h13" /><path d="m17 20 4-4-4-4" /><path d="M21 16H8" /></>,
  sentence: <><path d="M4 6h16M4 10h16M4 14h11M4 18h7" /></>,
  name: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16.2a3.5 3.5 0 0 1 6.4 0M14 10h4M14 13.5h3" /></>,
  advert: <><path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></>,
  filter: <><path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z" /></>,
  send: <><path d="m21 3-9.5 9.5M21 3l-6 18-3.5-8.5L3 9Z" /></>,
  save: <><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
};

export function Icon({ name, className, label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg className={cx('cw-icon', className)} viewBox="0 0 24 24" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label} focusable="false">
      {ICONS[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <span className="cw-brand__mark" aria-hidden="true">
      <svg viewBox="0 0 64 64"><path d="M15 47V23l17-9 17 9v24" /><path d="M24 44V29m8 15V24m8 20V29" /><circle cx="32" cy="14" r="4" /></svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

/** Every page opens the same way: where you are, what this is, what you can do. */
export function PageHeader({ title, description, actions, breadcrumb, meta, id = 'page-title' }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  meta?: ReactNode;
  id?: string;
}) {
  return (
    <header className="cw-page-head">
      {breadcrumb ? <nav className="cw-breadcrumb" aria-label="Breadcrumb">{breadcrumb}</nav> : null}
      <div className="cw-page-head__row">
        <div className="cw-page-head__copy">
          <h1 id={id} tabIndex={-1}>{title}</h1>
          {description ? <p className="cw-page-head__description">{description}</p> : null}
          {meta ? <div className="cw-page-head__meta">{meta}</div> : null}
        </div>
        {actions ? <div className="cw-page-head__actions">{actions}</div> : null}
      </div>
    </header>
  );
}

/** A titled section of a page. `flush` lets tables and lists run edge to edge. */
export function Panel({ title, description, actions, children, footer, flush = false, className, as = 'section', id }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  className?: string;
  as?: 'section' | 'article' | 'div';
  id?: string;
}) {
  const Element = as;
  const generated = useId();
  const titleId = id ?? `panel-${generated.replace(/:/g, '')}`;
  return (
    <Element className={cx('cw-panel', className)} aria-labelledby={title ? titleId : undefined}>
      {title || actions ? (
        <div className="cw-panel__head">
          <div className="cw-panel__title">
            {title ? <h2 id={titleId}>{title}</h2> : null}
            {description ? <p className="cw-panel__meta">{description}</p> : null}
          </div>
          {actions ? <div className="cw-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx('cw-panel__body', flush && 'cw-panel__body--flush')}>{children}</div>
      {footer ? <div className="cw-panel__footer">{footer}</div> : null}
    </Element>
  );
}

/** The older card, kept for modules that predate Panel. Same surface. */
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

export function SectionHead({ title, description, action, id }: { title: ReactNode; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="cw-section-head">
      <div>
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function Badge({ tone = 'neutral', children, className, plain = false }: { tone?: Tone; children: ReactNode; className?: string; plain?: boolean }) {
  return <span className={cx('cw-badge', `cw-badge--${tone}`, plain && 'cw-badge--plain', className)}>{children}</span>;
}

/** Kept under its old name: a status label with a coloured dot. */
export function Chip({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <Badge tone={tone} className={className}>{children}</Badge>;
}

export function StatusChip({ status }: { status: ItemStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
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
  return <Badge tone={meta.tone}>{label ?? meta.label}</Badge>;
}

export function TypeTag({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return <span className="cw-tag">{icon ? <Icon name={icon} /> : null}{children}</span>;
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

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="cw-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export interface StatItem {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  href?: string;
  onOpen?: () => void;
  attention?: boolean;
}

/** A compact row of figures in one panel — never a wall of big tiles. */
export function StatList({ items, label }: { items: StatItem[]; label: string }) {
  return (
    <dl className="cw-stats" aria-label={label} style={{ ['--cw-stats-columns' as string]: String(items.length) }}>
      {items.map((item) => {
        const body = (
          <>
            <dt className="cw-stat__label">{item.icon ? <Icon name={item.icon} className="cw-icon--sm" /> : null}{item.label}</dt>
            <dd className="cw-stat__value">{item.value}</dd>
            {item.hint ? <dd className="cw-stat__hint">{item.hint}</dd> : null}
          </>
        );
        return item.href ? (
          <a
            key={item.key}
            href={item.href}
            className={cx('cw-stat', item.attention && 'cw-stat--attention')}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              if (!item.onOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              event.preventDefault();
              item.onOpen();
            }}
          >
            {body}
          </a>
        ) : <div key={item.key} className={cx('cw-stat', item.attention && 'cw-stat--attention')}>{body}</div>;
      })}
    </dl>
  );
}

/** A definition list of labelled facts. */
export function Facts({ items, variant }: { items: { label: string; value: ReactNode; lang?: string }[]; variant?: 'rows' | 'compact' }) {
  const visible = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== '');
  if (!visible.length) return null;
  return (
    <dl className={cx('cw-facts', variant && `cw-facts--${variant}`)}>
      {visible.map((item) => (
        <div key={item.label}><dt>{item.label}</dt><dd lang={item.lang}>{item.value}</dd></div>
      ))}
    </dl>
  );
}

export interface TimelineEntry {
  id: string;
  at: string;
  title: ReactNode;
  detail?: ReactNode;
  tone?: Tone;
}

export function Timeline({ entries, now = Date.now() }: { entries: TimelineEntry[]; now?: number }) {
  if (!entries.length) return null;
  return (
    <ol className="cw-timeline">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className={cx('cw-timeline__dot', entry.tone && `cw-timeline__dot--${entry.tone}`)} aria-hidden="true" />
          <div className="cw-timeline__body">
            <div className="cw-timeline__head">
              <strong>{entry.title}</strong>
              {entry.at ? <time dateTime={entry.at} title={formatDateTime(entry.at)}>{relativeTime(entry.at, now)}</time> : null}
            </div>
            {entry.detail ? <div className="cw-timeline__detail">{entry.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Notices and states
// ---------------------------------------------------------------------------

export function Notice({ tone = 'info', title, children, action, role }: {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  const icon: IconName = tone === 'success' ? 'check' : tone === 'info' || tone === 'neutral' ? 'info' : 'alert';
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

/** Nothing here yet: say why, and offer the next step. */
export function EmptyState({ title, children, actions, icon = 'contributions', variant }: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
  variant?: 'inline' | 'bare';
}) {
  return (
    <div className={cx('cw-empty', variant && `cw-empty--${variant}`)}>
      <span className="cw-empty__icon" aria-hidden="true"><Icon name={icon} /></span>
      <strong className="cw-empty__title">{title}</strong>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="cw-empty__actions">{actions}</div> : null}
    </div>
  );
}

/** The older empty state, now drawn by EmptyState. */
export function EmptyNote({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <EmptyState title={title} actions={action} variant="inline">{children}</EmptyState>;
}

export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div className="cw-skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - index * 14}%` }} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/** Ids for a field's helper text, so the control can point at them. */
export function describedBy(id: string, parts: { hint?: ReactNode; error?: ReactNode; example?: ReactNode }): string | undefined {
  const ids = [parts.error ? `${id}-error` : parts.hint ? `${id}-hint` : '', parts.example ? `${id}-example` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/**
 * A labelled control with its hint, an optional worked example, and an
 * error that replaces the hint when there is one. Required and optional are
 * always said in words, never by colour alone.
 */
export function Field({ id, label, required = false, optional = false, hint, example, error, counter, children, className }: {
  id: string;
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  example?: ReactNode;
  error?: ReactNode;
  counter?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('cw-field', className)}>
      <label className="cw-field-label" htmlFor={id}>
        {label}
        {required ? <span className="cw-field__tag">Required</span> : optional ? <span className="cw-field__tag">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <p className="cw-field__error" id={`${id}-error`}><Icon name="alert" />{error}</p>
      ) : hint ? <p className="cw-field__hint" id={`${id}-hint`}>{hint}</p> : null}
      {example ? <p className="cw-field__example" id={`${id}-example`}>{example}</p> : null}
      {counter}
    </div>
  );
}

export function Counter({ value, max }: { value: string; max: number }) {
  const near = value.length > max * 0.9;
  return <span className={cx('cw-field__counter', near && 'cw-text-warning')} aria-live={near ? 'polite' : undefined}>{value.length.toLocaleString()} / {max.toLocaleString()}</span>;
}

export function SearchField({ id, label, value, onChange, placeholder, disabled }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="cw-field">
      <label className="cw-field-label" htmlFor={id}>{label}</label>
      <span className="cw-search">
        <Icon name="search" />
        <input id={id} type="search" value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </span>
    </div>
  );
}

export function SelectField<T extends string>({ id, label, value, options, onChange, disabled }: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cw-field">
      <label className="cw-field-label" htmlFor={id}>{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
    </div>
  );
}

/**
 * A list's search box and its filters. On wide screens everything sits in one
 * row; on phones the filters fold behind a "Filters" button, showing how many
 * are in use, so the list itself is visible without scrolling past them.
 */
export function FilterBar({ id, search, active, children, className }: {
  id: string;
  search: ReactNode;
  /** How many filters differ from their defaults. */
  active: number;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx('cw-filterbar', open && 'is-open', className)} role="search">
      {search}
      <button type="button" className="cw-filterbar__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        <Icon name="filter" className="cw-icon--sm" />Filters{active ? <span className="cw-filterbar__count" aria-label={`, ${active} in use`}>{active}</span> : null}
      </button>
      <div id={id} className="cw-filterbar__more">{children}</div>
    </div>
  );
}

/** Filter buttons with counts; `aria-pressed` marks the active one. */
export function FilterChips<T extends string>({ label, value, options, onChange, disabled }: {
  label: string;
  value: T;
  options: { id: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cw-filters" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" className="cw-filter" aria-pressed={value === option.id} disabled={disabled} onClick={() => onChange(option.id)}>
          {option.label}
          {option.count !== undefined ? <span className="cw-filter__count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

const KASEM_LETTERS = Array.from('ɛƐəƏɣƔɩƖŋŊɔƆʋƲ');

/**
 * Buttons that insert the Kasem letters a keyboard lacks into whichever field
 * last had focus. `onMouseDown` is cancelled so the field keeps its caret.
 */
export function LetterPalette({ onInsert, disabled = false, label = 'Insert a Kasem letter' }: { onInsert: (letter: string) => void; disabled?: boolean; label?: string }) {
  return (
    <div className="cw-letters" role="group" aria-label={label}>
      <span className="cw-letters__label" aria-hidden="true">Kasem letters</span>
      {KASEM_LETTERS.map((letter) => (
        <button key={letter} type="button" aria-label={`Insert ${letter}`} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(letter)}>{letter}</button>
      ))}
    </div>
  );
}

/** Inserts text at the caret of an input or textarea and returns the new value. */
export function insertAtCaret(field: HTMLInputElement | HTMLTextAreaElement, text: string): { value: string; caret: number } {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  return { value: field.value.slice(0, start) + text + field.value.slice(end), caret: start + text.length };
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

/**
 * A deliberate confirmation. The cancel button takes focus first, Escape
 * cancels unless work is in flight, and the confirm button cannot be pressed
 * twice while `busy`.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancel', tone = 'primary', busy = false, error, onConfirm, onCancel, wide = false }: {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `confirm-${useId().replace(/:/g, '')}`;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cx('cw-dialog', wide && 'cw-dialog--wide')}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    >
      <div className="cw-dialog__head"><h2 id={titleId}>{title}</h2></div>
      <div className="cw-dialog__body">
        {children}
        {error ? <div role="alert" className="cw-inline-alert">{error}</div> : null}
      </div>
      <div className="cw-dialog__foot">
        <button type="button" autoFocus disabled={busy} onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={tone === 'danger' ? 'cw-btn--danger-solid' : 'button--primary'} disabled={busy} aria-busy={busy} onClick={onConfirm}>
          {busy ? <><span className="cw-spinner" aria-hidden="true" />Working…</> : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function paginate<T>(rows: T[], page: number, pageSize: number): { rows: T[]; page: number; pageCount: number; from: number; to: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return { rows: slice, page: current, pageCount, from: rows.length ? start + 1 : 0, to: start + slice.length };
}

export function Pagination({ page, pageCount, from, to, total, onPage, noun = 'items' }: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  if (total === 0) return null;
  return (
    <nav className="cw-pagination" aria-label="Pages">
      <span aria-live="polite">Showing {from}–{to} of {total.toLocaleString()} {noun}</span>
      {pageCount > 1 ? (
        <span className="cw-pagination__pages">
          <button type="button" className="cw-btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="back" className="cw-icon--sm" />Previous</button>
          <span className="cw-tabular">Page {page} of {pageCount}</span>
          <button type="button" className="cw-btn--sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next<Icon name="arrow" className="cw-icon--sm" /></button>
        </span>
      ) : null}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function Avatar({ name, photoUrl, size }: { name: string; photoUrl?: string; size?: 'small' | 'large' }) {
  const letters = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'IW';
  return (
    <span className={cx('cw-avatar', size && `cw-avatar--${size}`)} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" /> : letters}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Ticks once a minute so relative times ("3 min ago") stay true on an open page. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// ---------------------------------------------------------------------------
// Community and activity
// ---------------------------------------------------------------------------

/**
 * Today across the contributor community, from real events only. The rows
 * come from the backend's pulse (contributor-pulse.ts), labelled with a
 * contributor's chosen display name or "A contributor"; nothing is invented.
 * The panel is drawn only when the pulse is connected and the day has
 * activity — a dashboard of zeros tells nobody anything.
 */
export function PulsePanel({ pulse, onPrivacy }: { pulse: PulseState; onPrivacy?: () => void }) {
  const now = useNow();
  const today = new Date(now).toISOString().slice(0, 10);
  if (!['live', 'cached'].includes(pulse.state) || !pulse.totals || (!pulse.totals.submitted && !pulse.totals.approved)) return null;
  const entries = pulse.entries.filter((entry) => entry.day === today && (entry.submitted || entry.approved));
  return (
    <Panel
      title="Community today"
      description={pulse.state === 'cached' ? 'Reconnecting — showing the last figures received.' : 'Across all invited contributors, since midnight UTC.'}
      className="cw-pulse"
      footer={onPrivacy ? <button type="button" className="cw-link-button" onClick={onPrivacy}>How you appear here</button> : undefined}
    >
      <dl className="cw-pulse__totals">
        <div><dt>Sent for review</dt><dd>{pulse.totals.submitted}</dd></div>
        <div><dt>Approved</dt><dd>{pulse.totals.approved}</dd></div>
        <div><dt>Contributors</dt><dd>{pulse.totals.contributors}</dd></div>
      </dl>
      {entries.length ? (
        <ol className="cw-pulse__feed" aria-label="Recent community activity">
          {entries.slice(0, 4).map((entry) => (
            <li key={entry.id}>
              <span><strong>{entry.label ?? 'A contributor'}</strong>{' '}
                {entry.submitted ? `sent ${entry.submitted} for review` : ''}
                {entry.submitted && entry.approved ? ' · ' : ''}
                {entry.approved ? `${entry.approved} approved` : ''}
              </span>
              <time dateTime={entry.updatedAt} title={formatDateTime(entry.updatedAt)}>{relativeTime(entry.updatedAt, now)}</time>
            </li>
          ))}
        </ol>
      ) : null}
    </Panel>
  );
}

const ACTIVITY_ICON: Record<ActivityEvent['kind'], IconName> = {
  submitted: 'send', resubmitted: 'send', approved: 'check', returned: 'revisions', in_review: 'clock',
  archived: 'doc', assigned: 'assignments', payment: 'bank',
};

const ACTIVITY_TONE: Record<ActivityEvent['kind'], string> = {
  submitted: 'info', resubmitted: 'info', approved: 'success', returned: 'warning', in_review: 'info',
  archived: 'neutral', assigned: 'neutral', payment: 'neutral',
};

export function ActivityList({ events, onOpen, now = Date.now(), emptyText = 'Nothing here yet.' }: {
  events: ActivityEvent[];
  onOpen?: (event: ActivityEvent) => void;
  now?: number;
  emptyText?: string;
}) {
  if (!events.length) return <p className="cw-muted cw-activity__empty">{emptyText}</p>;
  return (
    <ol className="cw-activity">
      {events.map((event) => {
        const openable = Boolean(onOpen && (event.item || event.work || event.link));
        const body = (
          <>
            <span className={cx('cw-row-item__icon', `cw-row-item__icon--${ACTIVITY_TONE[event.kind]}`)} aria-hidden="true"><Icon name={ACTIVITY_ICON[event.kind]} className="cw-icon--sm" /></span>
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
