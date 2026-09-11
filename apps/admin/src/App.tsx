import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { Button } from '@indigen-world/web-ui';
import { auth } from './firebase';
import { useAdminAuth } from './creators/data';
import { TeamSiteIntakePage } from './team-sites/TeamSiteIntake';
import { SCREENS, screenForPath, type ViewId } from './navigation';
import { useRouter } from './router';
import { AdminNotFoundPage } from './NotFoundPage';

const provider = new GoogleAuthProvider();
const navigationGroups = ['Overview', 'Publishing', 'Community', 'Governance'] as const;

const iconPaths: Record<ViewId | 'menu' | 'collapse' | 'logout', ReactNode> = {
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

function App() {
  const { user, role, ready } = useAdminAuth();
  const { pathname, navigate } = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('indigen-admin-sidebar') === 'collapsed');

  useEffect(() => setSidebarOpen(false), [pathname]);
  useEffect(() => window.localStorage.setItem('indigen-admin-sidebar', collapsed ? 'collapsed' : 'expanded'), [collapsed]);

  if (window.location.pathname === '/team-site-intake') return <TeamSiteIntakePage />;

  const handleSignIn = async () => {
    setError(null);
    try { await signInWithPopup(auth, provider); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.'); }
  };
  const handleSignOut = async () => {
    setError(null);
    try { await signOut(auth); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-out failed.'); }
  };
  const linkHandler = (to: string) => (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };

  const activeScreen = screenForPath(pathname);
  const canAccessActive = activeScreen ? !activeScreen.canAccess || activeScreen.canAccess(role) : false;
  const visibleScreens = SCREENS.filter((screen) => !screen.canAccess || screen.canAccess(role));
  const accountLabel = user?.displayName ?? user?.email ?? 'Admin user';
  const accountInitials = accountLabel.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'IW';
  const roleLabel = role ? role.replaceAll('_', ' ') : 'Access pending';

  if (!ready || !user) {
    return <div className="auth-shell"><div className="auth-card"><BrandMark /><p className="auth-eyebrow">INDIGEN WORLD</p><h1>Administration</h1><p>Sign in with an authorised staff account to manage the Indigen World ecosystem.</p>{error ? <p className="error-line" role="alert">{error}</p> : null}<Button variant="primary" onClick={handleSignIn} disabled={!ready}>{ready ? 'Sign in with Google' : 'Loading…'}</Button><span className="auth-security">Protected internal workspace</span></div></div>;
  }

  return (
    <div className={`admin-app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to dashboard content</a>
      <button className="mobile-menu-button" type="button" aria-label={sidebarOpen ? 'Close admin menu' : 'Open admin menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((value) => !value)}><Icon name="menu" /></button>
      {sidebarOpen ? <button type="button" className="sidebar-backdrop" aria-label="Close admin menu" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`admin-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <div className="sidebar-brand"><BrandMark /><span className="sidebar-brand__copy"><strong>Indigen World</strong><small>Administration</small></span></div>
        <button type="button" className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Icon name="collapse" /><span>{collapsed ? 'Expand' : 'Collapse'}</span></button>
        <nav className="admin-sidebar__inner" aria-label="Administration">
          {navigationGroups.map((group) => {
            const screens = visibleScreens.filter((screen) => screen.group === group);
            if (screens.length === 0) return null;
            return <div className="sidebar-group" key={group}><span className="sidebar-group__label">{group}</span><div className="sidebar-group__links">{screens.map((screen) => <a key={screen.id} href={screen.path} title={screen.label} className={activeScreen?.id === screen.id ? 'sidebar-link is-active' : 'sidebar-link'} aria-current={activeScreen?.id === screen.id ? 'page' : undefined} onClick={linkHandler(screen.path)}><Icon name={screen.id} /><span className="sidebar-link__label">{screen.label}</span></a>)}</div></div>;
          })}
        </nav>
        <div className="sidebar-account"><span className="account-orb" aria-hidden="true">{user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : accountInitials}</span><span className="account-name"><strong>{accountLabel}</strong><small>{roleLabel}</small></span><button type="button" className="signout-button" onClick={handleSignOut} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button></div>
      </aside>

      <div className="admin-main">
        <header className="workspace-header"><div><p>Admin workspace</p><h1>{activeScreen?.label ?? 'Page not found'}</h1></div><nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/" onClick={linkHandler('/')} className="crumb">Indigen World</a><span className="crumb-sep" aria-hidden="true">/</span><span className="crumb crumb--current" aria-current="page">{activeScreen?.label ?? 'Page not found'}</span><span className="workspace-role">{roleLabel}</span></nav></header>
        <main id="main-content" className="content" tabIndex={-1}>{error ? <p className="error-line" role="alert">{error}</p> : null}{!activeScreen ? <AdminNotFoundPage onGoHome={linkHandler('/')} /> : canAccessActive ? activeScreen.render({ role, navigate }) : <Notice title={activeScreen.deny?.title ?? 'Access required'} body={activeScreen.deny?.body ?? 'Your account does not have access to this screen.'} />}</main>
        <footer className="footer"><p>© {new Date().getFullYear()} Indigen World · Secure administration workspace</p></footer>
      </div>
    </div>
  );
}

export default App;
