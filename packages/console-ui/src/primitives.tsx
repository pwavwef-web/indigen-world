import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

/* ==========================================================================
   Surfaces
   ========================================================================== */
export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** `flush` removes padding for surfaces whose child is a table. */
  variant?: 'default' | 'flush' | 'tint';
  as?: 'section' | 'div' | 'article';
  children: ReactNode;
}

export function Panel({ variant = 'default', as = 'section', className, children, ...rest }: PanelProps) {
  const Tag = as;
  return (
    <Tag
      className={cx('panel', variant === 'flush' && 'iwx-surface--flush', variant === 'tint' && 'iwx-surface--tint', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ==========================================================================
   Page header
   ========================================================================== */
export interface PageHeaderProps {
  kicker?: string;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  /** Renders the title as an `h1`; screens nested inside tabs pass `h2`. */
  level?: 'h1' | 'h2';
  id?: string;
}

export function PageHeader({ kicker, title, body, actions, level = 'h2', id }: PageHeaderProps) {
  const Heading = level;
  return (
    <header className="iwx-head">
      <div className="iwx-head__copy">
        {kicker ? <p className="iwx-kicker">{kicker}</p> : null}
        <Heading id={id}>{title}</Heading>
        {body ? <p className="iwx-head__body">{body}</p> : null}
      </div>
      {actions ? <div className="iwx-head__actions">{actions}</div> : null}
    </header>
  );
}

/* ==========================================================================
   Toolbar & search
   ========================================================================== */
export function Toolbar({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('iwx-toolbar', className)} {...rest}>
      {children}
    </div>
  );
}

export function ToolbarGroup({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('iwx-toolbar__group', className)} {...rest}>
      {children}
    </div>
  );
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder, label, className }: SearchInputProps) {
  return (
    <div className={cx('iwx-search', className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder ?? label}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/* ==========================================================================
   Segmented control
   ========================================================================== */
export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cx('iwx-seg', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="iwx-seg__option"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count === undefined ? null : <span className="iwx-seg__count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ==========================================================================
   Status pill
   ========================================================================== */
export type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

export function StatusPill({
  tone = 'neutral',
  dot = true,
  children,
  className,
  ...rest
}: { tone?: PillTone; dot?: boolean; children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('iwx-pill', `iwx-pill--${tone}`, !dot && 'iwx-pill--plain', className)} {...rest}>
      {children}
    </span>
  );
}

/** Maps the status vocabularies already used across the console onto a tone. */
export function toneForStatus(status: string | undefined): PillTone {
  const value = (status ?? '').toLowerCase();
  if (/(approved|published|live|resolved|sent|active|success|granted|complete)/.test(value)) return 'success';
  if (/(rejected|failed|denied|open|suspended|error|blocked|danger)/.test(value)) return 'danger';
  if (/(pending|review|waitlist|progress|draft|scheduled|partial|contacted|revision)/.test(value)) return 'warning';
  if (/(archived|retired|dismissed|closed|inactive)/.test(value)) return 'neutral';
  return 'info';
}

/* ==========================================================================
   Stats
   ========================================================================== */
export interface StatProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
}

export function Stat({ label, value, note, tone = 'default' }: StatProps) {
  return (
    <div className={cx('iwx-stat', tone !== 'default' && `iwx-stat--${tone}`)}>
      <span className="iwx-stat__value">{value}</span>
      <span className="iwx-stat__label">{label}</span>
      {note ? <span className="iwx-stat__note">{note}</span> : null}
    </div>
  );
}

export function StatGrid({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('iwx-stats', className)} {...rest}>
      {children}
    </div>
  );
}

/* ==========================================================================
   Empty / alert states
   ========================================================================== */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="iwx-empty">
      <span className="iwx-empty__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M3 10h18M9 10v10" />
        </svg>
      </span>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function Alert({
  tone = 'danger',
  title,
  children,
  action,
}: {
  tone?: 'danger' | 'info' | 'success' | 'warning';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const marks = { danger: '!', info: 'i', success: '✓', warning: '!' } as const;
  return (
    <div className={cx('iwx-alert', tone !== 'danger' && `iwx-alert--${tone}`)} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="iwx-alert__mark" aria-hidden="true">{marks[tone]}</span>
      <span className="iwx-alert__body">
        {title ? <strong>{title}</strong> : null}
        {children}
      </span>
      {action}
    </div>
  );
}

/** The console's one loading line: a spinner and what is being waited on. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="iwx-loading" role="status">
      <span className="iwx-spin" aria-hidden="true" />
      {label}
    </p>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('iwx-spin', className)} aria-hidden="true" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/* ==========================================================================
   Copyable identifier
   --------------------------------------------------------------------------
   Document IDs, UIDs and storage paths are the currency of this console, and
   transcribing one by eye is how the wrong record gets edited. Every ID is a
   button that puts itself on the clipboard.
   ========================================================================== */
export function CopyId({ value, label, truncate = 18 }: { value: string; label?: string; truncate?: number }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be denied; the full value stays in the title.
    }
  }, [value]);

  const shown = value.length > truncate ? `${value.slice(0, truncate - 2)}…` : value;

  return (
    <span className="iwx-id">
      <button
        type="button"
        className="iwx-copy"
        onClick={() => void copy()}
        title={`Copy ${label ?? 'identifier'}: ${value}`}
      >
        <span className="iwx-copy__text">{shown}</span>
      </button>
      {copied ? <span className="iwx-copy__state" role="status">copied</span> : null}
    </span>
  );
}

/* ==========================================================================
   Table shell
   --------------------------------------------------------------------------
   The single place a table is allowed to be wider than the page. It reports
   whether it is actually overflowing so the edge fade only appears when there
   is something hidden to scroll to.
   ========================================================================== */
export interface TableShellProps extends HTMLAttributes<HTMLDivElement> {
  /** Names the scrollable region for screen readers and keyboard users. */
  label?: string;
}

export function TableShell({ label, children, className, ...rest }: TableShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const overflowing = element.scrollWidth - element.clientWidth > 2;
      const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
      setScrollable(overflowing && !atEnd);
    };
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const table = element.querySelector('table');
    if (table) observer.observe(table);
    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={ref}
      className={cx('table-shell', scrollable && 'table-shell--scrollable', className)}
      tabIndex={0}
      role={label ? 'region' : undefined}
      aria-label={label}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Stable ids for label/description wiring inside generated controls. */
export function useFieldId(prefix: string): string {
  const id = useId();
  return `${prefix}-${id.replace(/[:]/g, '')}`;
}
