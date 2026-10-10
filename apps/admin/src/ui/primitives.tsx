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
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from '../router';
import { Icon, type IconName } from './icons';

/* ==========================================================================
   The console's component kit. It renders TribeStudio's markup — the same
   `ts-*` classes from the studio's own stylesheet — so a button, a status,
   a field or a dialog reads identically in both products. Only the pieces
   that need the router are re-implemented here; the studio's versions link
   through the studio's router.
   ========================================================================== */

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

/* -- Buttons ------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'danger-ghost' | 'link';
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
      <button ref={ref} type={type} className={buttonClass({ variant, size, block }, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
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

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: ButtonVariant; size?: ButtonSize }>(
  function IconButton({ icon, label, variant = 'ghost', size = 'md', className, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} aria-label={label} title={label} className={buttonClass({ variant, size }, className, true)} {...rest}>
        <Icon name={icon} />
      </button>
    );
  },
);

/* -- Headings and panels --------------------------------------------------------- */

export function PageHeader({ title, description, actions, meta, kicker }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  kicker?: ReactNode;
}) {
  return (
    <header className="ts-page-head ts-enter ad-page-head">
      <div className="ts-page-head__copy">
        {kicker ? <p className="ts-kicker">{kicker}</p> : null}
        <h1 className="ts-page-head__title" id="page-title" tabIndex={-1}>{title}</h1>
        {description ? <p className="ts-page-head__desc">{description}</p> : null}
        {meta ? <div className="ts-page-head__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="ts-page-head__actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, description, actions, children, className, tight = false, flush = false, as: Tag = 'section', id }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  tight?: boolean;
  flush?: boolean;
  as?: 'section' | 'div' | 'aside' | 'article';
  id?: string;
}) {
  const generated = useId();
  const headingId = title ? `panel-${generated.replace(/:/g, '')}` : undefined;
  return (
    <Tag id={id} className={cx('ts-panel', tight && 'ts-panel--tight', flush && 'ts-panel--flush', className)} aria-labelledby={headingId}>
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
    </Tag>
  );
}

/* -- Status ------------------------------------------------------------------------ */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

/** A status pill. The words carry the meaning; the colour only repeats it. */
export function Badge({ tone = 'neutral', dot = false, children, className, title }: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cx('ts-badge', tone !== 'neutral' && `ts-badge--${tone}`, className)} title={title}>
      {dot ? <span className="ts-badge__dot" aria-hidden="true" /> : null}
      <span>{children}</span>
    </span>
  );
}

export function Count({ value, tone = 'accent', label }: { value: ReactNode; tone?: 'accent' | 'quiet' | 'warning' | 'danger'; label?: string }) {
  return <span className={cx('ts-count', tone !== 'accent' && `ts-count--${tone}`)} aria-label={label}>{value}</span>;
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
        {/* One block, so inline emphasis stays inside its sentence. */}
        {children !== undefined && children !== null ? <div>{children}</div> : null}
      </div>
      {action ? <div className="ts-notice__action">{action}</div> : null}
    </div>
  );
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
export function LoadFailure({ title = 'This could not be loaded', body, onRetry, compact = true }: {
  title?: ReactNode;
  body?: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div role="alert">
      <EmptyState icon="wifi-off" tone="danger" title={title} body={body ?? 'Check your connection and try again.'} compact={compact}
        actions={onRetry ? <Button variant="primary" icon="refresh" onClick={onRetry}>Try again</Button> : undefined} />
    </div>
  );
}

export function PermissionState({ title = 'You don’t have access to this', body }: { title?: ReactNode; body: ReactNode }) {
  return <EmptyState boxed icon="lock" tone="warning" title={title} body={body} />;
}

/* -- Loading ---------------------------------------------------------------------- */

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

export function Spinner({ small = false, label }: { small?: boolean; label?: string }) {
  return <span className={cx('ts-spinner', small && 'ts-spinner--sm')} role={label ? 'status' : undefined} aria-label={label} />;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="ts-loading" role="status" aria-live="polite"><Spinner /><span>{label}</span></div>;
}

/* -- Forms ---------------------------------------------------------------------------- */

export function Field({ label, hint, error, required = false, optional = false, counter, children, className }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  counter?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const generated = useId();
  const id = `field-${generated.replace(/:/g, '')}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = Children.only(children);
  const props = isValidElement(control) ? control.props as Record<string, unknown> : {};
  const controlId = (props.id as string | undefined) ?? id;
  const wired = isValidElement(control)
    ? cloneElement(control as ReactElement<Record<string, unknown>>, {
      id: controlId,
      'aria-describedby': (props['aria-describedby'] as string | undefined) ?? describedBy,
      'aria-invalid': error ? true : props['aria-invalid'],
      'aria-required': required || undefined,
    })
    : control;
  return (
    <div className={cx('ts-field', className)}>
      <label className="ts-label" htmlFor={controlId}>
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

export function SearchField({ value, onChange, label, placeholder }: { value: string; onChange: (value: string) => void; label: string; placeholder?: string }) {
  return (
    <label className="ts-search">
      <span className="sr-only">{label}</span>
      <Icon name="search" />
      <input type="search" value={value} placeholder={placeholder ?? label} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function Select({ value, onChange, label, options, className }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cx('ad-select', className)}>
      <span className="sr-only">{label}</span>
      <select className="ts-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="ts-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className="ts-seg__item" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          <span>{option.label}</span>
          {option.count !== undefined ? <span className="ts-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* -- Data display ------------------------------------------------------------------------ */

export function KeyValue({ items, stacked = false, className }: { items: { label: ReactNode; value: ReactNode; hidden?: boolean }[]; stacked?: boolean; className?: string }) {
  return (
    <dl className={cx('ts-kv', stacked && 'ts-kv--stacked', className)}>
      {items.filter((item) => !item.hidden).map((item, index) => (
        <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, max = 100, label, small = false }: { value: number; max?: number; label: string; small?: boolean }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx('ts-progress', small && 'ts-progress--sm')} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div className="ts-progress__bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** A profile photo, or the person's initials when there is none or it fails to load. */
export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cx('ts-avatar', size !== 'md' && `ts-avatar--${size}`)} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initialsOf(name)}
    </span>
  );
}

/* -- Dialogs ------------------------------------------------------------------------------ */

/**
 * A native modal dialog: the browser supplies the focus trap, Escape and the
 * return of focus to whatever opened it. While `busy`, it cannot be dismissed.
 */
export function Dialog({ title, lede, children, footer, onClose, busy = false, size = 'md', className }: {
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const generated = useId();
  const titleId = `dialog-${generated.replace(/:/g, '')}`;
  useEffect(() => {
    const node = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    if (node && !node.open) node.showModal();
    return () => {
      node?.close();
      // Native dialogs restore focus themselves; this covers a dialog that
      // unmounts before the browser does it.
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={cx('ts-dialog', size !== 'md' && `ts-dialog--${size}`, className)}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busyRef.current) close.current(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busyRef.current) close.current(); }}
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

/** A short-lived confirmation that a change was saved, announced to screen readers. */
export function Toast({ message, tone = 'success', onDone }: { message: string; tone?: 'success' | 'danger' | 'info'; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, tone === 'danger' ? 7000 : 4200);
    return () => window.clearTimeout(timer);
  }, [message, onDone, tone]);
  return (
    <div className={cx('ad-toast', `ad-toast--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'danger' ? 'alert' : tone === 'info' ? 'info' : 'check-circle'} />
      <span>{message}</span>
      <button type="button" className="ad-toast__close" aria-label="Dismiss" onClick={onDone}><Icon name="close" /></button>
    </div>
  );
}
