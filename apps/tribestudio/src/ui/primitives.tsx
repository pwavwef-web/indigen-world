import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from '../router';
import { Icon, type IconName } from './icons';
import { CountUp, spotlight, useIndicator } from './motion';

/* ==========================================================================
   The studio's component kit. Everything visible on a workspace screen is
   built from these, so a status, a field or a card reads the same in the
   creator studio, the contributor portal and the review desk.
   ========================================================================== */

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

/* -- Buttons ------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'danger-ghost' | 'dark' | 'on-dark' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonLook {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
}

function buttonClass({ variant = 'secondary', size = 'md', block }: ButtonLook, className?: string, iconOnly = false) {
  return cx('ts-btn', `ts-btn--${variant}`, size !== 'md' && `ts-btn--${size}`, block && 'ts-btn--block', iconOnly && 'ts-btn--icon', className);
}

function ButtonContent({ icon, iconRight, children }: { icon?: IconName; iconRight?: IconName; children?: ReactNode }) {
  return (
    <>
      <span className="ts-btn__spinner" aria-hidden="true" />
      {icon ? <Icon name={icon} /> : null}
      {children !== undefined && children !== null && children !== false ? <span>{children}</span> : null}
      {iconRight ? <Icon name={iconRight} /> : null}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & ButtonLook & { busy?: boolean }>(
  function Button({ variant, size, icon, iconRight, block, busy = false, className, children, type = 'button', disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonClass({ variant, size, block }, className)}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...rest}
      >
        <ButtonContent icon={busy ? undefined : icon} iconRight={iconRight}>{children}</ButtonContent>
      </button>
    );
  },
);

/** An in-app link that looks like a button. */
export function ButtonLink({ to, variant, size, icon, iconRight, block, className, children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & ButtonLook & { to: string }) {
  return (
    <Link to={to} className={buttonClass({ variant, size, block }, className)} {...rest}>
      <ButtonContent icon={icon} iconRight={iconRight}>{children}</ButtonContent>
    </Link>
  );
}

/** A link to another site or a file, styled as a button. */
export function ButtonAnchor({ href, variant, size, icon, iconRight, block, className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & ButtonLook) {
  return (
    <a href={href} className={buttonClass({ variant, size, block }, className)} {...rest}>
      <ButtonContent icon={icon} iconRight={iconRight}>{children}</ButtonContent>
    </a>
  );
}

/** A square icon button; the label is its accessible name and tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: ButtonVariant; size?: ButtonSize }>(
  function IconButton({ icon, label, variant = 'ghost', size = 'md', className, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} aria-label={label} title={label} className={buttonClass({ variant, size }, className, true)} {...rest}>
        <Icon name={icon} />
      </button>
    );
  },
);

/* -- Headings ------------------------------------------------------------------- */

export function PageHeader({ kicker, title, description, actions, breadcrumb, meta, id = 'page-title' }: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  meta?: ReactNode;
  id?: string;
}) {
  return (
    <header className="ts-page-head ts-enter">
      <div className="ts-page-head__copy">
        {breadcrumb ? <nav className="ts-breadcrumb" aria-label="Breadcrumb">{breadcrumb}</nav> : null}
        {kicker ? <p className="ts-kicker">{kicker}</p> : null}
        <h1 className="ts-page-head__title" id={id} tabIndex={-1}>{title}</h1>
        {description ? <p className="ts-page-head__desc">{description}</p> : null}
        {meta ? <div className="ts-page-head__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="ts-page-head__actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({ title, description, actions, as: Tag = 'h2', id }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h2' | 'h3';
  id?: string;
}) {
  return (
    <div className="ts-section-head">
      <div className="ts-section-head__copy">
        <Tag id={id} className="ts-section-head__title">{title}</Tag>
        {description ? <p className="ts-section-head__desc">{description}</p> : null}
      </div>
      {actions ? <div className="ts-cluster">{actions}</div> : null}
    </div>
  );
}

/* -- Panels and cards ----------------------------------------------------------------- */

export type PanelVariant = 'default' | 'flush' | 'tight' | 'tint' | 'dashed' | 'dark' | 'accent' | 'warning';

export function Panel({ title, description, actions, footer, children, variant = 'default', as: Tag = 'section', className, id, labelledBy, reveal = false, ...rest }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  variant?: PanelVariant | PanelVariant[];
  as?: 'section' | 'article' | 'div' | 'aside' | 'form';
  className?: string;
  id?: string;
  labelledBy?: string;
  reveal?: boolean;
  [key: string]: unknown;
}) {
  const generated = useId();
  const headingId = labelledBy ?? (title ? `panel-${generated.replace(/:/g, '')}` : undefined);
  const variants = (Array.isArray(variant) ? variant : [variant]).filter((value) => value !== 'default');
  return (
    <Tag
      id={id}
      className={cx('ts-panel', ...variants.map((value) => `ts-panel--${value}`), reveal && 'ts-reveal', className)}
      aria-labelledby={title ? headingId : undefined}
      {...rest}
    >
      {title || actions ? (
        <div className="ts-panel__head">
          <div className="ts-panel__heading">
            {title ? <h2 className="ts-panel__title" id={headingId}>{title}</h2> : null}
            {description ? <p className="ts-panel__desc">{description}</p> : null}
          </div>
          {actions ? <div className="ts-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? <div className="ts-panel__foot">{footer}</div> : null}
    </Tag>
  );
}

/** A destination or action card: icon, short title, one line, and where it goes. */
export function ActionCard({ to, onClick, icon, title, body, go, badge, tone = 'accent', disabled = false, className }: {
  to?: string;
  onClick?: () => void;
  icon: IconName;
  title: ReactNode;
  body?: ReactNode;
  go?: ReactNode;
  badge?: ReactNode;
  tone?: 'accent' | 'ws';
  disabled?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <div className="ts-row ts-row--between ts-row--start">
        <span className={cx('ts-card__icon', tone === 'ws' && 'ts-card__icon--ws')}><Icon name={icon} /></span>
        {badge}
      </div>
      <h3 className="ts-card__title">{title}</h3>
      {body ? <p className="ts-card__body">{body}</p> : null}
      {go ? <span className="ts-card__go">{go}<Icon name="arrow" /></span> : null}
    </>
  );
  if (to && !disabled) {
    return <Link to={to} className={cx('ts-card ts-spotlight', className)} onPointerMove={spotlight}>{content}</Link>;
  }
  return <button type="button" className={cx('ts-card ts-spotlight', className)} onClick={onClick} disabled={disabled} onPointerMove={spotlight}>{content}</button>;
}

/* -- Stats -------------------------------------------------------------------------------- */

export function StatCard({ label, value, hint, icon, to, onClick, attention = false, animate = true, className }: {
  label: ReactNode;
  value: number | string;
  hint?: ReactNode;
  icon?: IconName;
  to?: string;
  onClick?: () => void;
  attention?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span className="ts-stat__label">{icon ? <Icon name={icon} /> : null}<span className="ts-truncate">{label}</span></span>
      <span className="ts-stat__value">{typeof value === 'number' && animate ? <CountUp value={value} /> : value}</span>
      {hint ? <span className="ts-stat__hint">{hint}</span> : null}
    </>
  );
  const classes = cx('ts-stat', attention && 'ts-stat--attention', className);
  if (to) return <Link to={to} className={cx(classes, 'ts-spotlight')} onPointerMove={spotlight}>{body}</Link>;
  if (onClick) return <button type="button" className={cx(classes, 'ts-spotlight')} onClick={onClick} onPointerMove={spotlight}>{body}</button>;
  return <div className={classes}>{body}</div>;
}

export function StatGrid({ children, columns = 4, label }: { children: ReactNode; columns?: number; label?: string }) {
  return <div className="ts-stats ts-stagger" style={{ ['--cols' as string]: columns } as CSSProperties} role={label ? 'group' : undefined} aria-label={label}>{children}</div>;
}

/* -- Status ---------------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet' | 'ws';

export function Badge({ tone = 'neutral', dot = false, live = false, caps = false, children, className, title }: {
  tone?: Tone;
  dot?: boolean;
  live?: boolean;
  caps?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cx('ts-badge', tone !== 'neutral' && `ts-badge--${tone}`, live && 'ts-badge--live', caps && 'ts-badge--caps', className)} title={title}>
      {dot || live ? <span className="ts-badge__dot" aria-hidden="true" /> : null}
      <span>{children}</span>
    </span>
  );
}

export function Count({ value, tone = 'accent' }: { value: ReactNode; tone?: 'accent' | 'quiet' | 'warning' | 'danger' }) {
  return <span className={cx('ts-count', tone !== 'accent' && `ts-count--${tone}`)}>{value}</span>;
}

const NOTICE_ICON: Record<string, IconName> = { info: 'info', success: 'check-circle', warning: 'alert', danger: 'alert', neutral: 'info' };

export function Notice({ tone = 'info', title, children, action, role, icon, className }: {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'alert' | 'status';
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={cx('ts-notice', `ts-notice--${tone}`, className)} role={role ?? (tone === 'danger' ? 'alert' : undefined)}>
      <Icon name={icon ?? NOTICE_ICON[tone]} className="ts-notice__icon" />
      <div className="ts-notice__body">
        {title ? <strong className="ts-notice__title">{title}</strong> : null}
        {children}
      </div>
      {action ? <div className="ts-notice__action">{action}</div> : null}
    </div>
  );
}

/** What happens after this action: shown beside consequential controls. */
export function Consequence({ children, icon = 'shield' }: { children: ReactNode; icon?: IconName }) {
  return <div className="ts-consequence" role="status"><Icon name={icon} /><div>{children}</div></div>;
}

export function EmptyState({ icon = 'inbox', tone, title, body, actions, boxed = false, compact = false, className }: {
  icon?: IconName;
  tone?: 'warning' | 'danger' | 'success';
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  boxed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('ts-empty', boxed && 'ts-empty--boxed', compact && 'ts-empty--compact', 'ts-enter', className)}>
      <span className={cx('ts-empty__icon', tone && `ts-empty__icon--${tone}`)} aria-hidden="true"><Icon name={icon} /></span>
      <p className="ts-empty__title">{title}</p>
      {body ? <p className="ts-empty__body">{body}</p> : null}
      {actions ? <div className="ts-empty__actions">{actions}</div> : null}
    </div>
  );
}

/** A failed load, with the way back. */
export function LoadFailure({ title = 'This could not be loaded', body = 'Check your connection and try again. Nothing you saved has been lost.', onRetry, compact = true }: {
  title?: ReactNode;
  body?: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div role="alert">
      <EmptyState icon="wifi-off" tone="danger" title={title} body={body} compact={compact}
        actions={onRetry ? <Button variant="primary" icon="refresh" onClick={onRetry}>Try again</Button> : undefined} />
    </div>
  );
}

/* -- Loading ------------------------------------------------------------------------------ */

export function Skeleton({ lines = 3, label = 'Loading', title = false }: { lines?: number; label?: string; title?: boolean }) {
  return (
    <div className="ts-skeleton" role="status" aria-label={label}>
      {title ? <span className="ts-skel ts-skel--title" /> : null}
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="ts-skel ts-skel--line" style={{ width: `${94 - ((index * 17) % 38)}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <div className="ts-grid ts-grid--3" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="ts-panel ts-panel--tight" aria-hidden="true">
          <span className="ts-skel ts-skel--circle" />
          <span className="ts-skel ts-skel--title" style={{ width: '62%' }} />
          <span className="ts-skel ts-skel--line" />
          <span className="ts-skel ts-skel--line" style={{ width: '78%' }} />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ small = false, label }: { small?: boolean; label?: string }) {
  return <span className={cx('ts-spinner', small && 'ts-spinner--sm')} role={label ? 'status' : undefined} aria-label={label} />;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="ts-loading" role="status" aria-live="polite"><Spinner /><span>{label}</span></div>;
}

/* -- Forms --------------------------------------------------------------------------------- */

export function Field({ label, hint, error, required = false, optional = false, htmlFor, counter, children, className }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  htmlFor?: string;
  counter?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const generated = useId();
  const id = htmlFor ?? `field-${generated.replace(/:/g, '')}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  // Wire the first control to its label, hint and error without every caller
  // repeating the ids.
  const control = Children.only(children);
  const wired = isValidElement(control) && !htmlFor
    ? cloneElement(control as ReactElement<Record<string, unknown>>, {
      id: (control.props as { id?: string }).id ?? id,
      'aria-describedby': (control.props as { 'aria-describedby'?: string })['aria-describedby'] ?? describedBy,
      'aria-invalid': error ? true : (control.props as { 'aria-invalid'?: boolean })['aria-invalid'],
      'aria-required': required || undefined,
    })
    : control;
  return (
    <div className={cx('ts-field', className)}>
      <label className="ts-label" htmlFor={id}>
        {label}
        {required ? <span className="ts-required" aria-hidden="true">*</span> : null}
        {optional ? <span className="ts-optional">Optional</span> : null}
      </label>
      {wired}
      {hint ? <p className="ts-hint" id={hintId}>{hint}</p> : null}
      {error ? <p className="ts-error" id={errorId} role="alert"><Icon name="alert" />{error}</p> : null}
      {counter ? <span className="ts-counter">{counter}</span> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint, disabled = false }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx('ts-switch', disabled && 'is-disabled')}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="ts-switch__track" aria-hidden="true" />
      <span className="ts-check__copy"><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

export function CheckRow({ checked, onChange, label, hint, disabled = false, required = false, card = true, name, value, type = 'checkbox' }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  card?: boolean;
  name?: string;
  value?: string;
  type?: 'checkbox' | 'radio';
}) {
  return (
    <label className={cx('ts-check', card && 'ts-check--card', required && 'ts-check--required')}>
      <input type={type} name={name} value={value} checked={checked} disabled={disabled} required={required} onChange={(event) => onChange(event.target.checked)} />
      <span className="ts-check__copy"><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  icon?: IconName;
  disabled?: boolean;
}

/** Comitia's compact segmented control, with a thumb that glides to the selection. */
export function Segmented<T extends string>({ options, value, onChange, label, block = false, className }: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  block?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const style = useIndicator(ref, '[aria-pressed="true"]', [value, options.length], 'x');
  return (
    <div ref={ref} className={cx('ts-seg', block && 'ts-seg--block', style && 'has-indicator', className)} role="group" aria-label={label}>
      {style ? <span className="ts-seg__indicator" style={style} aria-hidden="true" /> : null}
      {options.map((option) => (
        <button key={option.value} type="button" className="ts-seg__item" aria-pressed={option.value === value} disabled={option.disabled} onClick={() => onChange(option.value)}>
          {option.icon ? <Icon name={option.icon} /> : null}
          <span>{option.label}</span>
          {option.count !== undefined ? <span className="ts-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Filter chips: several states of one list, each with its count. */
export function FilterChips<T extends string>({ options, value, onChange, label, scroll = false }: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  scroll?: boolean;
}) {
  return (
    <div className={cx('ts-chips', scroll && 'ts-chips--scroll')} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className="ts-chip" aria-pressed={option.value === value} disabled={option.disabled} onClick={() => onChange(option.value)}>
          {option.icon ? <Icon name={option.icon} /> : null}
          {option.label}
          {option.count !== undefined ? <span className="ts-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, label, placeholder, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="ts-search">
      <span className="sr-only">{label}</span>
      <Icon name="search" />
      <input type="search" value={value} disabled={disabled} placeholder={placeholder ?? label} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/* -- Navigation pieces ---------------------------------------------------------------------- */

export function Tabs({ items, label }: {
  items: { id: string; label: ReactNode; to?: string; onSelect?: () => void; active: boolean; icon?: IconName; badge?: ReactNode }[];
  label: string;
}) {
  return (
    <nav className="ts-tabs" aria-label={label}>
      {items.map((item) => {
        const body = <>{item.icon ? <Icon name={item.icon} /> : null}{item.label}{item.badge}</>;
        return item.to ? (
          <Link key={item.id} to={item.to} className={cx('ts-tab', item.active && 'is-active')} aria-current={item.active ? 'page' : undefined}>{body}</Link>
        ) : (
          <button key={item.id} type="button" className={cx('ts-tab', item.active && 'is-active')} aria-pressed={item.active} onClick={item.onSelect}>{body}</button>
        );
      })}
    </nav>
  );
}

export interface StepItem {
  title: ReactNode;
  detail?: ReactNode;
  icon?: IconName;
}

/** The map: where this work is in its process, and what comes next. */
export function Steps({ steps, current, label, compact = false, className }: {
  steps: StepItem[];
  current?: number;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <ol className={cx('ts-steps', compact && 'ts-steps--compact', className)} aria-label={label}>
      {steps.map((step, index) => {
        const state = current === undefined ? 'is-upcoming' : index < current ? 'is-done' : index === current ? 'is-current' : 'is-upcoming';
        return (
          <li key={index} className={cx('ts-step', current === undefined ? 'is-guide' : state)} aria-current={index === current ? 'step' : undefined}>
            <span className="ts-step__marker" aria-hidden="true">
              {current !== undefined && index < current ? <Icon name="check" /> : step.icon ? <Icon name={step.icon} /> : index + 1}
            </span>
            <span className="ts-step__copy">
              <span className="ts-step__title">{step.title}</span>
              {step.detail ? <span className="ts-step__detail">{step.detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Breadcrumb({ items }: { items: { label: ReactNode; to?: string }[] }) {
  return (
    <>
      {items.map((item, index) => (
        <span key={index} className="ts-row" style={{ gap: '0.35rem' }}>
          {index > 0 ? <Icon name="chevron" className="ts-faint" /> : null}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </>
  );
}

/* -- Data display ------------------------------------------------------------------------------ */

export function ProgressBar({ value, max = 100, active = false, label, tone, small = false }: {
  value: number;
  max?: number;
  active?: boolean;
  label: string;
  tone?: 'success';
  small?: boolean;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx('ts-progress', active && 'ts-progress--active', tone && `ts-progress--${tone}`, small && 'ts-progress--sm')}
      role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div className="ts-progress__bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function KeyValue({ items, stacked = false, className }: { items: { label: ReactNode; value: ReactNode; hidden?: boolean }[]; stacked?: boolean; className?: string }) {
  return (
    <dl className={cx('ts-kv', stacked && 'ts-kv--stacked', className)}>
      {items.filter((item) => !item.hidden).map((item, index) => (
        <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>
      ))}
    </dl>
  );
}

export function Facts({ items }: { items: { label: ReactNode; value: ReactNode; hidden?: boolean }[] }) {
  return (
    <dl className="ts-facts">
      {items.filter((item) => !item.hidden).map((item, index) => (
        <div key={index} className="ts-fact"><dt>{item.label}</dt><dd>{item.value}</dd></div>
      ))}
    </dl>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cx('ts-avatar', size !== 'md' && `ts-avatar--${size}`)} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initialsOf(name)}
    </span>
  );
}

/** A picture, video poster or file type in one fixed frame; missing media shows its kind. */
export function MediaFrame({ src, kind = 'image', alt = '', ratio = '16 / 10', label, children }: {
  src?: string | null;
  kind?: 'image' | 'video' | 'audio' | 'doc' | 'translation';
  alt?: string;
  ratio?: string;
  label?: ReactNode;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const icon: IconName = kind === 'video' ? 'film' : kind === 'audio' ? 'audio' : kind === 'doc' ? 'doc' : kind === 'translation' ? 'translation' : 'image';
  return (
    <div className="ts-media" style={{ ['--ratio' as string]: ratio } as CSSProperties}>
      {src && !failed && kind === 'image' ? <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : null}
      {src && !failed && kind === 'video' ? <video src={src} muted playsInline preload="metadata" aria-label={alt} onError={() => setFailed(true)} /> : null}
      {!src || failed || (kind !== 'image' && kind !== 'video') ? (
        <span className="ts-media__fallback"><Icon name={icon} />{label}</span>
      ) : null}
      {children}
    </div>
  );
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function SaveState({ status, label }: { status: SaveStatus; label?: ReactNode }) {
  const text = label ?? (status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : status === 'saved' ? 'Saved' : 'No changes');
  return (
    <span className={cx('ts-save', status === 'saving' && 'is-saving', status === 'error' && 'is-error')} role="status" aria-live="polite">
      <span className="ts-save__mark" aria-hidden="true"><Icon name={status === 'error' ? 'alert' : 'check'} /></span>
      <span className="ts-truncate">{text}</span>
    </span>
  );
}

/* -- Disclosure and dialogs -------------------------------------------------------------------- */

export function Disclosure({ summary, hint, icon, children, defaultOpen = false, open, onToggle, quiet = false, id, className }: {
  summary: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  quiet?: boolean;
  id?: string;
  className?: string;
}) {
  // React leaves <details open> alone until the value changes, so a constant
  // default behaves as an initial state the visitor can toggle.
  return (
    <details id={id} className={cx('ts-disclosure', quiet && 'ts-disclosure--quiet', className)} open={open ?? defaultOpen}
      onToggle={(event) => onToggle?.((event.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        {icon ? <Icon name={icon} /> : null}
        <span>{summary}{hint ? <small>{hint}</small> : null}</span>
        <Icon name="chevron" className="ts-disclosure__chev" />
      </summary>
      <div className="ts-disclosure__body">{children}</div>
    </details>
  );
}

/**
 * A native modal dialog: the browser supplies the focus trap, Escape and the
 * return of focus to whatever opened it. While `busy`, it cannot be dismissed.
 */
export function Dialog({ title, lede, children, footer, onClose, busy = false, size = 'md', labelledBy, className }: {
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: 'md' | 'lg' | 'xl';
  labelledBy?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const generated = useId();
  const titleId = labelledBy ?? `dialog-${generated.replace(/:/g, '')}`;
  useEffect(() => {
    const node = ref.current;
    if (node && !node.open) node.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={cx('ts-dialog', size !== 'md' && `ts-dialog--${size}`, className)}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) close.current(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) close.current(); }}
    >
      <div className="ts-dialog__head">
        <div>
          <h2 className="ts-dialog__title" id={titleId}>{title}</h2>
          {lede ? <p className="ts-dialog__lede">{lede}</p> : null}
        </div>
        <button type="button" className="ts-dialog__close" aria-label="Close dialog" disabled={busy} onClick={() => close.current()}>
          <Icon name="close" />
        </button>
      </div>
      {children ? <div className="ts-dialog__body">{children}</div> : null}
      {footer ? <div className="ts-dialog__foot">{footer}</div> : null}
    </dialog>
  );
}
