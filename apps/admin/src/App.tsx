import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { Button } from '@indigen-world/web-ui';
import { auth, firebaseConfig, usingEmulators } from './firebase';
import { useAdminAuth } from './creators/data';
import { TeamSiteIntakePage } from './team-sites/TeamSiteIntake';
import { SCREENS, screenForPath, type ViewId } from './navigation';
import { useRouter } from './router';
import { AdminNotFoundPage } from './NotFoundPage';
import { type Command, CommandPalette, Kbd, useCommandPalette } from '@indigen-world/console-ui';

const provider = new GoogleAuthProvider();
const navigationGroups = ['Overview', 'Publishing', 'Community', 'Governance'] as const;

const iconPaths: Record<ViewId | 'menu' | 'collapse' | 'logout' | 'search' | 'power', ReactNode> = {
  console: <><path d="M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-3H4zM14 7h6V4h-6z" /></>,
  creators: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  learning: <><path d="m2 3 8 3 8-3 4 2-8 3-8-3z" /><path d="M6 7v8c3 2 5 2 8 0V7M18 8v7" /></>,
  collection: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h6M7 16h4" /></>,
  reports: <><path d="M12 22a10 10 0 1 0-10-10 10.7 10.7 0 0 0 1 4.5L2 22l5.5-1a10.7 10.7 0 0 0 4.5 1Z" /><path d="M12 8v4M12 16h.01" /></>,
  interests: <><path d="M12 21s-7-4.35-7-11a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 6.65-7 11-7 11Z" /></>,
  teamSites: <><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></>,
  messaging: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 10h8M8 14h5" /></>,
  audit: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></>,
  exports: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  collapse: <><path d="m15 18-6-6 6-6" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  power: <><path d="M12 3v9" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></>,
};

function Icon({ name }: { name: keyof typeof iconPaths }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{iconPaths[name]}</svg>;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M15 47V23l17-9 17 9v24" /><path d="M24 44V29m8 15V24m8 20V29" /><circle cx="32" cy="14" r="4" /></svg></span>;
}

function Notice({ title, body }: { title: string; body: string }) {
  return <section className="panel panel--notice"><h1>{title}</h1><p>{body}</p></section>;
}

/** One-line description of each screen, used by the palette and nav tooltips. */
const SCREEN_HINTS: Record<ViewId, string> = {
  console: 'Live queue totals and workspace shortcuts',
  creators: 'Applications, memberships, campaigns and the review desk',
  learning: 'Units, lessons and the Kasem learning path',
  collection: 'Apps, books, music, heroes, names and the shop',
  reports: 'Community moderation queue',
  interests: 'Website form responses and Founding Tester claims',
  teamSites: 'Team site intake responses',
  messaging: 'Announcements, contact groups and SMS balance',
  audit: 'The permanent record of privileged actions',
  exports: 'Permission-safe governed data packages',
};

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function App() {
  const { user, role, ready } = useAdminAuth();
  const { pathname, navigate } = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navFilter, setNavFilter] = useState('');
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('indigen-admin-sidebar') === 'collapsed');
  const palette = useCommandPalette();
  const clock = useClock();
  const online = useOnline();
  const navFilterRef = useRef<HTMLInputElement>(null);

  const signOutNow = useCallback(async () => {
    setError(null);
    try { await signOut(auth); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-out failed.'); }
  }, []);

  useEffect(() => setSidebarOpen(false), [pathname]);
  useEffect(() => window.localStorage.setItem('indigen-admin-sidebar', collapsed ? 'collapsed' : 'expanded'), [collapsed]);

  const activeScreen = screenForPath(pathname);
  const visibleScreens = useMemo(
    () => SCREENS.filter((screen) => !screen.canAccess || screen.canAccess(role)),
    [role],
  );

  const commands = useMemo<Command[]>(() => {
    const navigation: Command[] = visibleScreens.map((screen) => ({
      id: `go-${screen.id}`,
      group: 'Go to',
      label: screen.label,
      hint: SCREEN_HINTS[screen.id],
      icon: <Icon name={screen.id} />,
      trail: screen.path,
      keywords: `${screen.group} ${screen.path}`,
      run: () => navigate(screen.path),
    }));
    return [
      ...navigation,
      {
        id: 'action-collapse',
        group: 'Workspace',
        label: collapsed ? 'Expand the navigation rail' : 'Collapse the navigation rail',
        icon: <Icon name="collapse" />,
        keywords: 'sidebar rail width',
        run: () => setCollapsed((value) => !value),
      },
      {
        id: 'action-reload',
        group: 'Workspace',
        label: 'Reload this screen',
        hint: 'Re-fetches every live figure on the page',
        icon: <Icon name="power" />,
        keywords: 'refresh reload data',
        run: () => window.location.reload(),
      },
      {
        id: 'action-signout',
        group: 'Session',
        label: 'Sign out',
        hint: user?.email ?? undefined,
        icon: <Icon name="logout" />,
        keywords: 'log out leave exit',
        run: () => void signOutNow(),
      },
    ];
  }, [collapsed, navigate, signOutNow, user?.email, visibleScreens]);

  /* `/` focuses the rail's filter, the way it does in a repository browser —
     but only when the reader is not already typing somewhere. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setSidebarOpen(true);
      navFilterRef.current?.focus();
      navFilterRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (window.location.pathname === '/team-site-intake') return <TeamSiteIntakePage />;

  const handleSignIn = async () => {
    setError(null);
    try { await signInWithPopup(auth, provider); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.'); }
  };
  const linkHandler = (to: string) => (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };

  const canAccessActive = activeScreen ? !activeScreen.canAccess || activeScreen.canAccess(role) : false;
  const accountLabel = user?.displayName ?? user?.email ?? 'Admin user';
  const accountInitials = accountLabel.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'IW';
  const roleLabel = role ? role.replaceAll('_', ' ') : 'Access pending';
  const needle = navFilter.trim().toLowerCase();
  const matchedScreens = needle
    ? visibleScreens.filter((screen) =>
        `${screen.label} ${screen.group} ${SCREEN_HINTS[screen.id]}`.toLowerCase().includes(needle))
    : visibleScreens;

  if (!ready || !user) {
    return <div className="auth-shell"><div className="auth-card"><BrandMark /><p className="auth-eyebrow">INDIGEN WORLD</p><h1>Administration</h1><p>Sign in with an authorised staff account to manage the Indigen World ecosystem.</p>{error ? <p className="error-line" role="alert">{error}</p> : null}<Button variant="primary" onClick={handleSignIn} disabled={!ready}>{ready ? 'Sign in with Google' : 'Loading…'}</Button><span className="auth-security">Protected internal workspace</span></div></div>;
  }

  return (
    <div className={`admin-app-shell iwx${collapsed ? ' sidebar-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to dashboard content</a>
      <button className="mobile-menu-button" type="button" aria-label={sidebarOpen ? 'Close admin menu' : 'Open admin menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((value) => !value)}><Icon name="menu" /></button>
      {sidebarOpen ? <button type="button" className="sidebar-backdrop" aria-label="Close admin menu" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`admin-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <div className="sidebar-brand">
          <BrandMark />
          <span className="sidebar-brand__copy"><strong>Indigen World</strong><small>Admin console</small></span>
        </div>

        <div className="sidebar-filter">
          <svg viewBox="0 0 24 24" aria-hidden="true">{iconPaths.search}</svg>
          <input
            ref={navFilterRef}
            type="search"
            value={navFilter}
            aria-label="Filter admin screens"
            placeholder="Filter screens"
            onChange={(event) => setNavFilter(event.target.value)}
          />
          <Kbd>/</Kbd>
        </div>

        <button type="button" className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Icon name="collapse" /><span>{collapsed ? 'Expand' : 'Collapse'}</span></button>

        <nav className="admin-sidebar__inner" aria-label="Administration">
          {navigationGroups.map((group) => {
            const screens = matchedScreens.filter((screen) => screen.group === group);
            if (screens.length === 0) return null;
            return (
              <div className="sidebar-group" key={group}>
                <span className="sidebar-group__label">{group}</span>
                <div className="sidebar-group__links">
                  {screens.map((screen) => (
                    <a
                      key={screen.id}
                      href={screen.path}
                      title={SCREEN_HINTS[screen.id]}
                      className={activeScreen?.id === screen.id ? 'sidebar-link is-active' : 'sidebar-link'}
                      aria-current={activeScreen?.id === screen.id ? 'page' : undefined}
                      onClick={linkHandler(screen.path)}
                    >
                      <Icon name={screen.id} />
                      <span className="sidebar-link__label">{screen.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
          {matchedScreens.length === 0 ? <p className="sidebar-empty">No screen matches “{navFilter.trim()}”.</p> : null}
        </nav>

        <div className="sidebar-account">
          <span className="account-orb" aria-hidden="true">{user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : accountInitials}</span>
          <span className="account-name"><strong>{accountLabel}</strong><small>{roleLabel}</small></span>
          <button type="button" className="signout-button" onClick={() => void signOutNow()} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="workspace-header">
          <div className="workspace-header__identity">
            <p className="workspace-path">
              <a href="/" onClick={linkHandler('/')}>admin</a>
              <span className="workspace-path__sep" aria-hidden="true">/</span>
              <span className="workspace-path__current">
                {activeScreen ? activeScreen.path.replace(/^\//, '') || 'console' : pathname.replace(/^\//, '')}
              </span>
            </p>
            <h1>{activeScreen?.label ?? 'Page not found'}</h1>
          </div>
          <div className="workspace-header__tools">
            <button type="button" className="command-trigger" onClick={() => palette.setOpen(true)}>
              <Icon name="search" />
              <span>Search or jump to…</span>
              <Kbd>⌘K</Kbd>
            </button>
            <span className={role ? 'workspace-role' : 'workspace-role workspace-role--none'}>{roleLabel}</span>
          </div>
        </header>

        <main id="main-content" className="content" tabIndex={-1}>
          {error ? <p className="error-line" role="alert">{error}</p> : null}
          {!activeScreen
            ? <AdminNotFoundPage onGoHome={linkHandler('/')} />
            : canAccessActive
              ? activeScreen.render({ role, navigate })
              : <Notice title={activeScreen.deny?.title ?? 'Access required'} body={activeScreen.deny?.body ?? 'Your account does not have access to this screen.'} />}
        </main>

        {/* The status rail: environment, identity and connection, always in the
            same place, the way a developer console reports its own state. */}
        <div className="status-rail" role="status" aria-label="Workspace status">
          <span className="status-rail__item">
            <span className={online ? 'status-rail__dot' : 'status-rail__dot status-rail__dot--idle'} aria-hidden="true" />
            {online ? 'connected' : 'offline'}
          </span>
          <span className="status-rail__item">project <strong>{firebaseConfig.projectId}</strong></span>
          <span className="status-rail__item">env <strong>{usingEmulators ? 'emulators' : 'production'}</strong></span>
          <span className="status-rail__item">role <strong>{role ?? 'none'}</strong></span>
          <span className="status-rail__item status-rail__item--push">
            <Kbd>⌘K</Kbd> commands
          </span>
          <span className="status-rail__item">{clock}</span>
        </div>

        <footer className="footer"><p>© {new Date().getFullYear()} Indigen World · Secure administration workspace</p></footer>
      </div>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={commands} />
    </div>
  );
}

export default App;
