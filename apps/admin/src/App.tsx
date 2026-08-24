import { useState, type MouseEvent } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { Button } from '@indigen-world/web-ui';
import { auth } from './firebase';
import { useAdminAuth } from './creators/data';
import { TeamSiteIntakePage } from './team-sites/TeamSiteIntake';
import { SCREENS, screenForPath } from './navigation';
import { useRouter } from './router';
import { AdminNotFoundPage } from './NotFoundPage';

const provider = new GoogleAuthProvider();

/** A full-panel notice used for the sign-in gate and per-screen access denials. */
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel panel--notice">
      <h1>{title}</h1>
      <p>{body}</p>
    </section>
  );
}

/**
 * Application shell: brand header, account controls, the top navigation, the
 * breadcrumb trail, and the routed content region. Each screen has a real URL
 * (see `navigation.tsx`) so it is deep-linkable and survives a refresh; this
 * component only frames and routes them.
 */
function App() {
  const { user, role, ready } = useAdminAuth();
  const { pathname, navigate } = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Standalone public intake page, rendered outside the authenticated shell.
  if (window.location.pathname === '/team-site-intake') {
    return <TeamSiteIntakePage />;
  }

  const handleSignIn = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  };
  const handleSignOut = async () => {
    setError(null);
    try {
      await signOut(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  };

  // Intercept in-app link clicks for client-side navigation, while leaving
  // modified clicks (new tab, etc.) to the browser.
  const linkHandler = (to: string) => (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };

  const activeScreen = screenForPath(pathname);
  const canAccessActive = activeScreen
    ? !activeScreen.canAccess || activeScreen.canAccess(role)
    : false;
  const accountLabel = user?.displayName ?? user?.email ?? 'Admin user';
  const accountInitials = accountLabel
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'IW';

  return (
    <div className="shell">
      <header className="admin-header">
        <div className="topbar">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 64 64">
                <path d="M15 47V23l17-9 17 9v24" />
                <path d="M24 44V29m8 15V24m8 20V29" />
                <circle cx="32" cy="14" r="4" />
              </svg>
            </span>
            <span className="brand__text">
              <strong>Indigen World</strong>
              <small>Admin console</small>
            </span>
          </div>
          <div className="topbar__account">
            {ready && user ? (
              <>
                <span className="account-orb" aria-hidden="true">
                  {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : accountInitials}
                </span>
                <span className="account-name">
                  <strong>{accountLabel}</strong>
                  {role ? <span className="role-chip">{role}</span> : null}
                </span>
                <Button variant="ghost" onClick={handleSignOut}>Sign out</Button>
              </>
            ) : (
              <Button variant="primary" onClick={handleSignIn} disabled={!ready}>
                {ready ? 'Sign in with Google' : 'Loading…'}
              </Button>
            )}
          </div>
        </div>

        {ready && user ? (
          <nav className="topnav" aria-label="Primary">
            {SCREENS.map((screen) => (
              <a
                key={screen.id}
                href={screen.path}
                className={activeScreen?.id === screen.id ? 'topnav__link is-active' : 'topnav__link'}
                aria-current={activeScreen?.id === screen.id ? 'page' : undefined}
                onClick={linkHandler(screen.path)}
              >
                {screen.label}
              </a>
            ))}
          </nav>
        ) : null}
      </header>

      {(ready && user) || !activeScreen ? (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <a href="/" onClick={linkHandler('/')} className="crumb">Admin console</a>
          {activeScreen?.id !== 'console' ? (
            <>
              <span className="crumb-sep" aria-hidden="true">›</span>
              <span className="crumb crumb--current" aria-current="page">
                {activeScreen?.label ?? 'Page not found'}
              </span>
            </>
          ) : null}
        </nav>
      ) : null}

      <main id="main-content" className="content">
        {error ? <p className="error-line">{error}</p> : null}
        {!activeScreen ? (
          <AdminNotFoundPage onGoHome={linkHandler('/')} />
        ) : !ready ? (
          <p className="muted">Loading…</p>
        ) : !user ? (
          <Notice
            title="Sign in required"
            body="Sign in with an authorised staff account to manage the Indigen World ecosystem."
          />
        ) : canAccessActive ? (
          activeScreen.render({ role })
        ) : (
          <Notice
            title={activeScreen.deny?.title ?? 'Access required'}
            body={activeScreen.deny?.body ?? 'Your account does not have access to this screen.'}
          />
        )}
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Indigen World · Admin console · Internal use only</p>
      </footer>
    </div>
  );
}

export default App;
