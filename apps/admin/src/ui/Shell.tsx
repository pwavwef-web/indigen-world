import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BrandMark } from '../../../tribestudio/src/ui/BrandMark';
import { countValue, useAttention } from '../attention';
import { Link, useRouter } from '../router';
import {
  sectionEntry,
  toolPath,
  visibleSections,
  visibleTools,
  type SectionDef,
  type ToolDef,
} from '../routes';
import { useSession } from '../session';
import { useDisplay, type DisplayPreferences } from './display';
import { Icon, type IconName } from './icons';
import { Avatar, Badge, Count, cx } from './primitives';

/* ==========================================================================
   The console's frame: one top bar everywhere (brand, search, the bell and
   the signed-in person), a card launcher at home, and inside a section a
   quiet sidebar with the way back and that section's tools.
   ========================================================================== */

function roleLabel(role: string | null, superAdmin: boolean): string {
  if (superAdmin || role === 'super_admin') return 'Super administrator';
  if (role === 'admin') return 'Administrator';
  if (role === 'validator') return 'Validator';
  if (role === 'reviewer') return 'Reviewer';
  if (role) return role[0].toUpperCase() + role.slice(1);
  return 'No staff role';
}

/** A disclosure panel: Escape and outside clicks close it and focus returns to its button. */
function usePopover(): { open: boolean; setOpen: (open: boolean) => void; button: RefObject<HTMLButtonElement | null>; panel: RefObject<HTMLDivElement | null> } {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);
  return { open, setOpen, button, panel };
}

/* -- Notifications --------------------------------------------------------------- */

/**
 * The bell lists the operational queues this person can act on, counted live.
 * Nothing here is a stored notification, so there is no unread state to fake:
 * the dot means "something is waiting", and it goes when the queues are clear.
 */
function NotificationsButton() {
  const { counts, items, refresh } = useAttention();
  const { open, setOpen, button, panel } = usePopover();
  const id = useId();
  const waiting = items.filter((item) => (countValue(counts[item.key]) ?? 0) > 0);
  const total = waiting.reduce((sum, item) => sum + (countValue(counts[item.key]) ?? 0), 0);
  const failed = items.filter((item) => counts[item.key]?.state === 'error');
  const loading = items.some((item) => counts[item.key]?.state === 'loading');
  return (
    <div className="ad-pop">
      <button
        ref={button}
        type="button"
        className="ts-btn ts-btn--ghost ts-btn--icon ts-bell ad-topbar__icon"
        aria-label={total ? `Needs attention: ${total} ${total === 1 ? 'item' : 'items'}` : 'Needs attention'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => { if (!open) refresh(); setOpen(!open); }}
      >
        <Icon name="bell" />
        {total ? <span className="ts-bell__dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div ref={panel} id={id} className="ad-pop__panel ad-notify" role="dialog" aria-label="Needs attention">
          <div className="ad-pop__head">
            <strong>Needs attention</strong>
            <span className="ts-muted">Live queue counts</span>
          </div>
          {items.length === 0 ? <p className="ad-pop__empty">Your role has no review queues.</p> : null}
          {waiting.length ? (
            <ul className="ad-notify__list">
              {waiting.map((item) => {
                const value = countValue(counts[item.key]) ?? 0;
                return (
                  <li key={item.key}>
                    <Link to={item.to} className="ad-notify__item" onClick={() => setOpen(false)}>
                      <span className="ad-notify__icon"><Icon name={item.icon as IconName} /></span>
                      <span className="ad-notify__copy">{item.label(value)}</span>
                      <Count value={value} tone="warning" label={`${value} waiting`} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : !loading && items.length ? (
            <p className="ad-pop__empty"><Icon name="check-circle" /> Every queue you can act on is clear.</p>
          ) : null}
          {loading && !waiting.length ? <p className="ad-pop__empty">Checking the queues…</p> : null}
          {failed.length ? (
            <p className="ad-pop__note" role="status">
              <Icon name="alert" /> {failed.length === 1 ? 'One queue' : `${failed.length} queues`} could not be counted.{' '}
              <button type="button" className="ts-link" onClick={refresh}>Retry</button>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* -- Profile ---------------------------------------------------------------------- */

const THEMES: { id: DisplayPreferences['theme']; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Device' },
];
const MOTION: { id: DisplayPreferences['motion']; label: string }[] = [
  { id: 'system', label: 'Device' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
];
const SIZES: { id: DisplayPreferences['fontScale']; label: string }[] = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Default' },
  { id: 'lg', label: 'Large' },
];

function ProfileMenu() {
  const { user, access, signOut } = useSession();
  const [preferences, setPreferences] = useDisplay();
  const { open, setOpen, button, panel } = usePopover();
  const id = useId();
  const name = user.displayName || user.email || 'Staff member';
  const set = (patch: Partial<DisplayPreferences>) => setPreferences((current) => ({ ...current, ...patch }));
  return (
    <div className="ad-pop">
      <button ref={button} type="button" className="ad-profile" aria-expanded={open} aria-controls={id} aria-label={`Account: ${name}`} onClick={() => setOpen(!open)}>
        <Avatar name={name} src={user.photoURL} />
        <Icon name="chevron-down" className="ad-profile__chev" />
      </button>
      {open ? (
        <div ref={panel} id={id} className="ad-pop__panel ad-account" role="dialog" aria-label="Account and preferences">
          <div className="ad-account__who">
            <Avatar name={name} src={user.photoURL} size="lg" />
            <div>
              <strong>{user.displayName || 'Signed in'}</strong>
              {user.email ? <span>{user.email}</span> : null}
              <span className="ad-account__badges">
                <Badge tone="accent">{roleLabel(access.role, access.superAdmin)}</Badge>
                {access.finance ? <Badge tone="success">Finance</Badge> : null}
              </span>
            </div>
          </div>
          <fieldset className="ad-account__pref">
            <legend>Colour mode</legend>
            <div className="ad-account__options">
              {THEMES.map((option) => <button key={option.id} type="button" className="ts-display__option" aria-pressed={preferences.theme === option.id} onClick={() => set({ theme: option.id })}>{option.label}</button>)}
            </div>
          </fieldset>
          <fieldset className="ad-account__pref">
            <legend>Text size</legend>
            <div className="ad-account__options">
              {SIZES.map((option) => <button key={option.id} type="button" className="ts-display__option" aria-pressed={preferences.fontScale === option.id} onClick={() => set({ fontScale: option.id })}>{option.label}</button>)}
            </div>
          </fieldset>
          <fieldset className="ad-account__pref">
            <legend>Animations</legend>
            <div className="ad-account__options">
              {MOTION.map((option) => <button key={option.id} type="button" className="ts-display__option" aria-pressed={preferences.motion === option.id} onClick={() => set({ motion: option.id })}>{option.label}</button>)}
            </div>
          </fieldset>
          <label className="ts-switch ad-account__switch">
            <input type="checkbox" role="switch" checked={preferences.contrast} onChange={(event) => set({ contrast: event.target.checked })} />
            <span className="ts-switch__track" aria-hidden="true" />
            <span className="ts-check__copy"><strong>High contrast</strong></span>
          </label>
          <button type="button" className="ts-btn ts-btn--secondary ts-btn--block" onClick={() => { setOpen(false); signOut(); }}>
            <span className="ts-btn__spinner" aria-hidden="true" />
            <Icon name="logout" /><span>Sign out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* -- Top bar ----------------------------------------------------------------------- */

export function TopBar({ onSearch, onMenu, menuOpen }: { onSearch: () => void; onMenu?: () => void; menuOpen?: boolean }) {
  return (
    <header className="ad-topbar">
      <div className="ad-topbar__inner">
        {onMenu ? (
          <button type="button" className="ts-btn ts-btn--ghost ts-btn--icon ad-topbar__menu" aria-label="Open section menu" aria-expanded={menuOpen} onClick={onMenu}>
            <Icon name="menu" />
          </button>
        ) : null}
        <Link to="/" className="ad-brand" aria-label="Indigen World Administration home">
          <BrandMark size="2.25rem" />
          <span className="ad-brand__name">Indigen World</span>
          <span className="ad-brand__divider" aria-hidden="true" />
          <span className="ad-brand__sub">Administration</span>
        </Link>
        <button type="button" className="ad-search" onClick={onSearch} aria-keyshortcuts="Control+K Meta+K" aria-label="Search across Indigen World Administration">
          <Icon name="search" />
          <span className="ad-search__text">Search across Indigen World…</span>
          <kbd className="ts-kbd">Ctrl K</kbd>
        </button>
        <div className="ad-topbar__actions">
          <NotificationsButton />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

/* -- Section frame ----------------------------------------------------------------- */

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="ad-crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {index > 0 ? <Icon name="chevron" className="ad-crumbs__sep" /> : null}
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Jump straight to another section without going home first. */
function SectionSwitcher({ current }: { current: SectionDef }) {
  const { access } = useSession();
  const { navigate } = useRouter();
  const sections = visibleSections(access);
  return (
    <label className="ad-switcher">
      <span className="sr-only">Switch section</span>
      <span className="ad-switcher__icon" aria-hidden="true"><Icon name={current.icon as IconName} /></span>
      <select className="ts-select ts-select--sm" value={current.id} onChange={(event) => {
        const next = sections.find((section) => section.id === event.target.value);
        if (next) navigate(sectionEntry(next, access));
      }}>
        {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
      </select>
    </label>
  );
}

/** The tools of one section, with live counts beside the ones that have a queue. */
export function SectionSidebar({ section, tool, badges, onNavigate }: {
  section: SectionDef;
  tool: ToolDef | null;
  badges?: Partial<Record<string, number | null>>;
  onNavigate?: () => void;
}) {
  const { access } = useSession();
  const tools = visibleTools(section, access);
  return (
    <nav className="ad-side" aria-label={`${section.label} tools`}>
      <Link to="/" className="ad-side__back" onClick={onNavigate}>
        <Icon name="back" /><span>Back to home</span>
      </Link>
      <SectionSwitcher current={section} />
      <p className="ts-nav__heading ad-side__heading">{section.label}</p>
      <div className="ad-side__links">
        {tools.map((item) => {
          const badge = badges?.[item.id];
          return (
            <Link
              key={item.id}
              to={toolPath(section, item)}
              className="ts-nav__link"
              aria-current={tool?.id === item.id ? 'page' : undefined}
              title={item.hint}
              onClick={onNavigate}
            >
              <Icon name={item.icon as IconName} />
              <span>{item.label}</span>
              {badge ? <span className="ts-count ts-count--warning" aria-label={`${badge} waiting`}>{badge}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SectionFrame({ section, tool, badges, children }: {
  section: SectionDef;
  tool: ToolDef | null;
  badges?: Partial<Record<string, number | null>>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useRouter();
  const drawer = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>('a, select')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className="ad-section" data-section={section.id}>
      <aside className="ad-section__side">
        <SectionSidebar section={section} tool={tool} badges={badges} />
      </aside>
      {open ? (
        <div className="ad-drawer" role="dialog" aria-modal="true" aria-label={`${section.label} tools`}>
          <button type="button" className="ad-drawer__scrim" aria-label="Close section menu" onClick={() => setOpen(false)} />
          <div ref={drawer} className="ad-drawer__panel">
            <SectionSidebar section={section} tool={tool} badges={badges} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
      <div className="ad-section__main">
        <div className="ad-section__bar">
          <button type="button" className="ts-btn ts-btn--secondary ts-btn--sm ad-section__tools" aria-expanded={open} onClick={() => setOpen(true)}>
            <span className="ts-btn__spinner" aria-hidden="true" />
            <Icon name="menu" /><span>{section.label} tools</span>
          </button>
          <Breadcrumbs items={[
            { label: 'Home', to: '/' },
            ...(tool && tool.slug ? [{ label: section.label, to: section.base }] : []),
            { label: tool ? (tool.slug ? tool.label : section.label) : section.label },
          ]} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function ShellClass({ children, home }: { children: ReactNode; home: boolean }) {
  return <div className={cx('ad-app', home && 'ad-app--home')}>{children}</div>;
}
