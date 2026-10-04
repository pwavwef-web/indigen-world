import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CommandPalette, useCommandPalette, type Command } from '@indigen-world/console-ui';
import { canValidate, useAuth } from '../auth';
import { Link, useRoute } from '../router';
import { BrandMark } from './BrandMark';
import { DisplayControl } from './display';
import { Icon, type IconName } from './icons';
import { useIndicator } from './motion';
import { useWorkspaceAccess } from './access';
import { Avatar, IconButton, cx } from './primitives';

/* ==========================================================================
   The shell every workspace screen sits in. It answers "where am I" twice —
   the sidebar's highlighted destination and the header card — and keeps
   the way back one click away: the workspace switcher, the breadcrumb trail,
   Ctrl K to jump anywhere, and on a phone the dock at the bottom.
   ========================================================================== */

export type WorkspaceId = 'create' | 'contribute' | 'review';

export const WORKSPACES: Record<WorkspaceId, { name: string; short: string; role: string; icon: IconName; home: string; blurb: string }> = {
  create: { name: 'Creator studio', short: 'Create', role: 'Creator', icon: 'pen', home: '/studio', blurb: 'Posts, videos and language work' },
  contribute: { name: 'Contributor portal', short: 'Contribute', role: 'Contributor', icon: 'translation', home: '/contributor', blurb: 'Assignments and corpus records' },
  review: { name: 'Validator portal', short: 'Review', role: 'Validator', icon: 'shield', home: '/contributor/review', blurb: 'Review queues and decisions' },
};

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  group: string;
  active?: boolean;
  /** A count, or "!" for something that needs action. */
  badge?: ReactNode;
  hint?: string;
  /** Shown in the phone dock (up to four). */
  dock?: boolean;
  /** The dock's one-word label, when the full label is longer. */
  short?: string;
  disabled?: boolean;
}

const COLLAPSE_KEY = 'tribestudio.sidebar';

function useDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(() => window.matchMedia?.(query).matches ?? true);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return desktop;
}

/** Leaving through the shell asks open editors first, like any navigation. */
function mayLeave(): boolean {
  return window.dispatchEvent(new Event('studio:before-navigate', { cancelable: true }));
}

export function AppShell({ workspace, nav, title, trail, primary, account, onSignOut, immersive = false, dockHidden = false, banner, bell, children }: {
  workspace: WorkspaceId;
  nav: NavItem[];
  /** The page's own name in the header card; defaults to the active destination. */
  title?: string;
  /** Extra breadcrumb parts after the destination, e.g. a record's title. */
  trail?: string[];
  primary?: { to: string; label: string; icon?: IconName };
  account: { name: string; photo?: string | null; role?: string };
  onSignOut: () => void;
  immersive?: boolean;
  /** A phone editor with its own sticky actions asks the dock to step aside. */
  dockHidden?: boolean;
  banner?: ReactNode;
  bell?: { to: string; unread?: number; label?: string };
  children: ReactNode;
}) {
  const { path, navigate } = useRoute();
  const { role } = useAuth();
  const access = useWorkspaceAccess();
  const desktop = useDesktop();
  const palette = useCommandPalette();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'collapsed'; } catch { return false; }
  });
  const [online, setOnline] = useState(() => navigator.onLine);
  const navRef = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const previousPath = useRef(path);
  const meta = WORKSPACES[workspace];
  const current = nav.find((item) => item.active);
  const pageTitle = title ?? current?.label ?? meta.name;
  const indicator = useIndicator(navRef, '.ts-nav__link[aria-current="page"]', [path, current?.to, collapsed, nav.length]);
  const groups = [...new Set(nav.map((item) => item.group))];
  const dockItems = nav.filter((item) => item.dock).slice(0, 4);

  const workspaces = (Object.keys(WORKSPACES) as WorkspaceId[]).filter((id) =>
    id === workspace || id === 'create' || (id === 'review' && canValidate(role)) || (id === 'contribute' && access.contributor === true));

  // Route changes: close the drawer, name the tab, and move focus to the
  // content so the change is announced.
  useEffect(() => {
    setOpen(false);
    document.title = `${pageTitle} · ${meta.short} · TribeStudio`;
    if (previousPath.current !== path) document.getElementById('main-content')?.focus({ preventScroll: true });
    previousPath.current = path;
  }, [path, pageTitle, meta.short]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? 'collapsed' : 'open'); } catch { /* Optional. */ }
  }, [collapsed]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  // The phone drawer behaves like a dialog: focus moves in, Escape closes it,
  // and the page behind cannot be reached until it does.
  useEffect(() => {
    if (desktop || !open) return;
    const body = document.querySelector<HTMLElement>('.ts-body');
    const dock = document.querySelector<HTMLElement>('.ts-dock');
    body?.setAttribute('inert', '');
    dock?.setAttribute('inert', '');
    const first = sidebar.current?.querySelector<HTMLElement>('a[aria-current="page"], a, button');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      body?.removeAttribute('inert');
      dock?.removeAttribute('inert');
      document.removeEventListener('keydown', onKey);
    };
  }, [open, desktop]);

  const signOut = () => { if (mayLeave()) onSignOut(); };

  const commands = useMemo<Command[]>(() => [
    ...nav.filter((item) => !item.disabled).map((item) => ({
      id: `nav:${item.to}`, label: item.label, group: item.group, hint: item.hint, icon: <Icon name={item.icon} />, run: () => navigate(item.to),
    })),
    ...workspaces.filter((id) => id !== workspace).map((id) => ({
      id: `ws:${id}`, label: `Open the ${WORKSPACES[id].name.toLowerCase()}`, group: 'Workspaces', hint: WORKSPACES[id].blurb, icon: <Icon name={WORKSPACES[id].icon} />, run: () => navigate(WORKSPACES[id].home),
    })),
    { id: 'display', label: 'Display preferences', group: 'Settings', hint: 'Colour mode, animations and text size', icon: <Icon name="contrast" />, run: () => window.dispatchEvent(new Event('ts:open-display')) },
    { id: 'signout', label: 'Sign out', group: 'Settings', icon: <Icon name="logout" />, run: signOut },
  ], [nav, workspaces.join(','), workspace, navigate]);

  const breadcrumb = [ 'TribeStudio', meta.short, ...(current && current.label !== pageTitle ? [current.label] : []), pageTitle, ...(trail ?? []) ];

  return (
    <div
      className="ts-app"
      data-workspace={workspace}
      data-collapsed={collapsed && desktop ? 'true' : undefined}
      data-immersive={immersive ? 'true' : undefined}
      data-has-dock={dockItems.length ? 'true' : undefined}
      data-dock={dockHidden ? 'hidden' : undefined}
    >
      <div className="ts-ambient" aria-hidden="true" />
      <a href="#main-content" className="ts-skip">Skip to workspace content</a>

      {open && !desktop ? <button type="button" className="ts-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}

      <aside
        ref={sidebar}
        className="ts-sidebar"
        data-open={open || desktop ? 'true' : 'false'}
        aria-label={`${meta.name} navigation`}
        aria-hidden={!desktop && !open ? true : undefined}
        inert={!desktop && !open ? true : undefined}
      >
        <div className="ts-row ts-row--between">
          <Link to={meta.home} className="ts-brand" aria-label={`TribeStudio · ${meta.name} home`}>
            <BrandMark size="2.4rem" live />
            <span className="ts-brand__copy">
              <span className="ts-brand__name">TribeStudio</span>
              <span className="ts-brand__sub">{meta.name}</span>
            </span>
          </Link>
          {!desktop ? <IconButton icon="close" label="Close navigation" onClick={() => { setOpen(false); menuButton.current?.focus(); }} /> : null}
        </div>

        <div className="ts-switcher" role="navigation" aria-label="Workspaces">
          <span className="ts-switcher__label">Workspace</span>
          <div className="ts-switcher__options">
            {workspaces.map((id) => (
              <Link key={id} to={WORKSPACES[id].home} className="ts-switcher__option" aria-current={id === workspace ? 'true' : undefined} title={WORKSPACES[id].blurb}>
                <span className="ts-switcher__glyph"><Icon name={WORKSPACES[id].icon} /></span>
                <span>{WORKSPACES[id].name}</span>
              </Link>
            ))}
          </div>
        </div>

        {primary ? (
          <Link to={primary.to} className="ts-btn ts-btn--primary ts-sidebar__primary" title={primary.label}>
            <Icon name={primary.icon ?? 'plus'} />
            <span>{primary.label}</span>
          </Link>
        ) : null}

        <nav ref={navRef} className={cx('ts-nav', indicator && 'has-indicator')} aria-label={`${meta.name} sections`}>
          {indicator ? <span className="ts-nav__indicator" style={indicator} aria-hidden="true" /> : null}
          {groups.map((group) => (
            <div key={group} className="ts-nav__group">
              <p className="ts-nav__heading">{group}</p>
              {nav.filter((item) => item.group === group).map((item) => (
                <Link
                  key={item.to + item.label}
                  to={item.to}
                  className={cx('ts-nav__link', item.disabled && 'is-disabled')}
                  aria-current={item.active ? 'page' : undefined}
                  title={collapsed && desktop ? item.label : item.hint}
                  aria-disabled={item.disabled || undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge !== null && item.badge !== false ? (
                    item.badge === '!' ? <span className="ts-nav__badge" aria-label="Needs attention">!</span> : <span className="ts-count ts-count--quiet" aria-label={`${item.badge} to act on`}>{item.badge}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="ts-account">
          <Avatar name={account.name} src={account.photo} size="sm" />
          <span className="ts-account__copy">
            <span className="ts-account__name">{account.name}</span>
            <span className="ts-account__role">{account.role ?? meta.role}</span>
          </span>
          <IconButton icon="logout" label="Sign out" className="ts-account__out" onClick={signOut} size="sm" />
        </div>
        {!desktop ? <DisplayControl inline /> : null}
        <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm ts-collapse" onClick={() => setCollapsed((value) => !value)} aria-pressed={collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Icon name="sidebar" />
          <span className={collapsed ? 'sr-only' : undefined}>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
        </button>
      </aside>

      <div className="ts-body">
        <header className="ts-topbar">
          <div className="ts-topbar__card">
            <IconButton ref={menuButton} icon="menu" label="Open navigation" className="ts-topbar__menu" aria-expanded={open} onClick={() => setOpen(true)} />
            <div className="ts-topbar__where">
              <span className="ts-topbar__kicker"><i aria-hidden="true" />{meta.name}</span>
              <span className="ts-topbar__title" key={pageTitle}>{pageTitle}</span>
            </div>
            <span className="ts-topbar__trail" aria-hidden="true">{breadcrumb.join(' / ')} · {account.role ?? meta.role}</span>
            <div className="ts-topbar__actions">
              <button type="button" className="ts-jump" aria-label="Go to a page" aria-keyshortcuts="Control+K Meta+K" onClick={() => palette.setOpen(true)}>
                <Icon name="search" />
                <span>Go to…</span>
                <kbd className="ts-kbd">Ctrl K</kbd>
              </button>
              {desktop ? <DisplayControl bar /> : null}
              {bell ? (
                <Link to={bell.to} className="ts-btn ts-btn--ghost ts-btn--icon ts-bell" aria-label={bell.unread ? `${bell.label ?? 'Notifications'}: ${bell.unread} unread` : bell.label ?? 'Notifications'} title={bell.label ?? 'Notifications'}>
                  <Icon name="bell" />
                  {bell.unread ? <span className="ts-bell__dot" aria-hidden="true" /> : null}
                </Link>
              ) : null}
            </div>
          </div>
          {!online ? (
            <div className="ts-offline" role="status">
              <Icon name="wifi-off" />
              <span>You’re offline. Keep this page open — saving and uploads resume when the connection returns.</span>
            </div>
          ) : null}
        </header>
        {banner}
        <main id="main-content" className="ts-main" tabIndex={-1}>
          {children}
        </main>
      </div>

      {dockItems.length ? (
        <nav className="ts-dock" aria-label="Quick navigation" style={{ ['--dock-cols' as string]: dockItems.length + 1 }}>
          {dockItems.map((item) => (
            <Link key={item.to} to={item.to} className="ts-dock__item" aria-current={item.active ? 'page' : undefined}>
              <Icon name={item.icon} />
              {item.badge && item.badge !== '!' ? <span className="ts-dock__badge" aria-hidden="true">{item.badge}</span> : null}
              <span>{item.short ?? item.label}</span>
            </Link>
          ))}
          <button type="button" className="ts-dock__item" aria-label="More destinations" onClick={() => setOpen(true)}>
            <Icon name="menu" />
            <span>More</span>
          </button>
        </nav>
      ) : null}

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={commands} />
    </div>
  );
}

/** The content area's standard page: entry motion and consistent spacing. */
export function Page({ children, width, className }: { children: ReactNode; width?: 'narrow' | 'medium'; className?: string }) {
  return <div className={cx('ts-page ts-enter', width && `ts-page--${width}`, className)}>{children}</div>;
}
