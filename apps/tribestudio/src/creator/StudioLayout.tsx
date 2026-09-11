import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CommandPalette, Kbd, useCommandPalette, type Command } from '@indigen-world/console-ui';
import { Link, useRoute } from '../router';
import { canContribute, signOutUser, useAuth } from '../auth';
import { firebaseConfig } from '../firebase';

type StudioIcon = 'dashboard' | 'profile' | 'opportunities' | 'submissions' | 'dictionary' | 'video' | 'notifications' | 'help' | 'lexicon' | 'menu' | 'collapse' | 'logout' | 'search';

const ICON_PATHS: Record<StudioIcon, ReactNode> = {
  dashboard: <><path d="M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-3H4zM14 7h6V4h-6z" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  opportunities: <><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" /><circle cx="12" cy="12" r="4" /></>,
  submissions: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14a2 2 0 0 0 2-2v-3M3 15v3a2 2 0 0 0 2 2" /></>,
  dictionary: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z" /><path d="M4 6.5v13M8 8h8M8 12h6" /></>,
  video: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3z" /></>,
  notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 1 1 5.4 1.8c-1.5 1-2.5 1.7-2.5 3.2M12 18h.01" /></>,
  lexicon: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z" /><path d="M8 8h8M8 12h6M15 17v4M12 19h6" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  collapse: <><path d="m15 18-6-6 6-6" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
};

interface NavItem {
  to: string;
  label: string;
  icon: StudioIcon;
  group: string;
  /** One line on what the destination is for; used by the palette and tooltips. */
  hint: string;
}

const STUDIO_NAV: NavItem[] = [
  { to: '/studio', label: 'Dashboard', icon: 'dashboard', group: 'Workspace', hint: 'Your standing, streak and what needs doing' },
  { to: '/studio/opportunities', label: 'Opportunities', icon: 'opportunities', group: 'Workspace', hint: 'Open campaigns and bounties to enter' },
  { to: '/studio/submissions', label: 'Submissions', icon: 'submissions', group: 'Create', hint: 'Everything you have posted, and its status' },
  { to: '/studio/dictionary', label: 'Dictionary', icon: 'dictionary', group: 'Create', hint: 'The Kasem entry desk, with the letter palette' },
  { to: '/studio/video', label: 'AI Video', icon: 'video', group: 'Create', hint: 'Draft a Kasem video with assistance' },
  { to: '/studio/profile', label: 'Profile', icon: 'profile', group: 'Account', hint: 'Your public creator identity and permissions' },
  { to: '/studio/notifications', label: 'Notifications', icon: 'notifications', group: 'Account', hint: 'Decisions, campaign news and reminders' },
  { to: '/studio/help', label: 'Help', icon: 'help', group: 'Account', hint: 'How the studio works, and who to ask' },
];

const LEXICON_ITEM: NavItem = {
  to: '/workspace',
  label: 'Lexicon workspace',
  icon: 'lexicon',
  group: 'Tools',
  hint: 'Bulk lexicon entry for contributors',
};

const NAV_GROUPS = ['Workspace', 'Create', 'Account', 'Tools'] as const;

function Icon({ name }: { name: StudioIcon }) {
  return <svg className="studio__nav-icon" viewBox="0 0 24 24" aria-hidden="true">{ICON_PATHS[name]}</svg>;
}

function BrandMark() {
  return <span className="studio__brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M15 47V23l17-9 17 9v24" /><path d="M24 44V29m8 15V24m8 20V29" /><circle cx="32" cy="14" r="4" /></svg></span>;
}

function isActive(path: string, to: string): boolean {
  if (to === '/studio') return path === '/studio';
  return path === to || path.startsWith(`${to}/`);
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

export function StudioLayout({ children }: { children: ReactNode }) {
  const { path, navigate } = useRoute();
  const { user, role } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navFilter, setNavFilter] = useState('');
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('tribestudio-sidebar') === 'collapsed');
  const palette = useCommandPalette();
  const online = useOnline();
  const filterRef = useRef<HTMLInputElement>(null);

  const accountLabel = user?.displayName ?? user?.email ?? 'Creator';
  const accountInitials = accountLabel.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TS';
  const items = useMemo(
    () => (canContribute(role) ? [...STUDIO_NAV, LEXICON_ITEM] : STUDIO_NAV),
    [role],
  );
  const activeItem = path === '/workspace'
    ? LEXICON_ITEM
    : [...items].sort((a, b) => b.to.length - a.to.length).find((item) => isActive(path, item.to));
  const roleLabel = role ? `${role} workspace` : 'Creator workspace';

  useEffect(() => setSidebarOpen(false), [path]);
  useEffect(() => window.localStorage.setItem('tribestudio-sidebar', collapsed ? 'collapsed' : 'expanded'), [collapsed]);

  /* `/` focuses the rail's filter, the way it does in a repository browser —
     but only when the creator is not already typing somewhere. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setSidebarOpen(true);
      filterRef.current?.focus();
      filterRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const commands = useMemo<Command[]>(() => [
    ...items.map((item) => ({
      id: `go-${item.to}`,
      group: 'Go to',
      label: item.label,
      hint: item.hint,
      icon: <Icon name={item.icon} />,
      trail: item.to,
      keywords: item.group,
      run: () => navigate(item.to),
    })),
    {
      id: 'action-new-post',
      group: 'Create',
      label: 'Start a new post',
      hint: 'Opens the submission wizard',
      icon: <Icon name="submissions" />,
      keywords: 'submission upload publish write',
      run: () => navigate('/studio/submissions/new'),
    },
    {
      id: 'action-collapse',
      group: 'Workspace',
      label: collapsed ? 'Expand the navigation rail' : 'Collapse the navigation rail',
      icon: <Icon name="collapse" />,
      keywords: 'sidebar rail width',
      run: () => setCollapsed((value) => !value),
    },
    {
      id: 'action-signout',
      group: 'Session',
      label: 'Sign out',
      hint: user?.email ?? undefined,
      icon: <Icon name="logout" />,
      keywords: 'log out leave exit',
      run: () => void signOutUser(),
    },
  ], [collapsed, items, navigate, user?.email]);

  const needle = navFilter.trim().toLowerCase();
  const matched = needle
    ? items.filter((item) => `${item.label} ${item.group} ${item.hint}`.toLowerCase().includes(needle))
    : items;

  return (
    <div className={`studio iwx${collapsed ? ' studio--collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to workspace content</a>
      <button type="button" className="studio__menu-button" aria-label={sidebarOpen ? 'Close workspace menu' : 'Open workspace menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((value) => !value)}><Icon name="menu" /></button>
      {sidebarOpen ? <button type="button" className="studio__backdrop" aria-label="Close workspace menu" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`studio__side${sidebarOpen ? ' is-open' : ''}`}>
        <Link to="/studio" className="studio__brand">
          <BrandMark />
          <span className="studio__brand-copy"><strong>TribeStudio</strong><small>Creator workspace</small></span>
        </Link>

        <div className="studio__filter">
          <svg viewBox="0 0 24 24" aria-hidden="true">{ICON_PATHS.search}</svg>
          <input
            ref={filterRef}
            type="search"
            value={navFilter}
            aria-label="Filter workspace sections"
            placeholder="Filter sections"
            onChange={(event) => setNavFilter(event.target.value)}
          />
          <Kbd>/</Kbd>
        </div>

        <button type="button" className="studio__collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Icon name="collapse" /><span>{collapsed ? 'Expand' : 'Collapse'}</span></button>

        <nav className="studio__nav" aria-label="Workspace">
          {NAV_GROUPS.map((group) => {
            const groupItems = matched.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div className="studio__nav-group" key={group}>
                <span className="studio__nav-label">{group}</span>
                <div className="studio__nav-links">
                  {groupItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={item.hint}
                      className={isActive(path, item.to) ? 'studio__link is-active' : 'studio__link'}
                      aria-current={isActive(path, item.to) ? 'page' : undefined}
                    >
                      <Icon name={item.icon} />
                      <span className="studio__link-label">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          {matched.length === 0 ? <p className="studio__nav-empty">No section matches “{navFilter.trim()}”.</p> : null}
        </nav>

        <div className="studio__account">
          <span className="studio__account-orb" aria-hidden="true">{user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : accountInitials}</span>
          <span className="studio__account-copy"><strong className="studio__user">{accountLabel}</strong><small>{roleLabel}</small></span>
          <button type="button" className="studio__signout" onClick={() => void signOutUser()} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>

      <div className="studio__content-shell">
        <header className="studio__workspace-header">
          <div>
            <p>
              <Link to="/studio">studio</Link>
              <span aria-hidden="true">/</span>
              <span>{activeItem ? activeItem.to.replace(/^\/(studio\/?)?/, '') || 'dashboard' : path.replace(/^\//, '')}</span>
            </p>
            <h1>{activeItem?.label ?? 'TribeStudio'}</h1>
          </div>
          <div className="studio__tools">
            <button type="button" className="studio__command" onClick={() => palette.setOpen(true)}>
              <Icon name="search" />
              <span>Search or jump to…</span>
              <Kbd>⌘K</Kbd>
            </button>
            <span className="studio__role">{role ?? 'creator'}</span>
          </div>
        </header>

        <main id="main-content" className="studio__main" tabIndex={-1}>
          <Suspense fallback={<div className="loading">Loading…</div>}>{children}</Suspense>
        </main>

        {/* The status rail: connection, project and identity, always in the same
            place, the way a developer console reports its own state. */}
        <div className="studio__status" role="status" aria-label="Workspace status">
          <span className="studio__status-item">
            <span className={online ? 'studio__status-dot' : 'studio__status-dot studio__status-dot--offline'} aria-hidden="true" />
            {online ? 'connected' : 'offline'}
          </span>
          <span className="studio__status-item">project <strong>{firebaseConfig.projectId}</strong></span>
          <span className="studio__status-item">role <strong>{role ?? 'creator'}</strong></span>
          <span className="studio__status-item studio__status-item--push">
            <Kbd>⌘K</Kbd> commands
          </span>
        </div>

        <footer className="studio__footer">© {new Date().getFullYear()} Indigen World · TribeStudio creator workspace</footer>
      </div>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} commands={commands} />
    </div>
  );
}
