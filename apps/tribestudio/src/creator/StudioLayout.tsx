import { Suspense, type ReactNode } from 'react';
import { Link, useRoute } from '../router';
import { canContribute, signOutUser, useAuth } from '../auth';

const STUDIO_NAV = [
  { to: '/studio', label: 'Dashboard', icon: '◆' },
  { to: '/studio/profile', label: 'Profile', icon: '☺' },
  { to: '/studio/opportunities', label: 'Opportunities', icon: '✦' },
  { to: '/studio/submissions', label: 'Submissions', icon: '⬆' },
  { to: '/studio/notifications', label: 'Notifications', icon: '◈' },
  { to: '/studio/help', label: 'Help', icon: '?' },
];

function isActive(path: string, to: string): boolean {
  if (to === '/studio') return path === '/studio';
  return path === to || path.startsWith(`${to}/`);
}

/** Authenticated workspace chrome with lighter TribeStudio identity. */
export function StudioLayout({ children }: { children: ReactNode }) {
  const { path } = useRoute();
  const { user, role } = useAuth();
  const accountLabel = user?.displayName ?? user?.email ?? 'Creator';
  const accountInitials = accountLabel
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TS';

  return (
    <div className="studio">
      <aside className="studio__side">
        <Link to="/studio" className="brand brand--studio">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <path d="M15 47V23l17-9 17 9v24" />
              <path d="M24 44V29m8 15V24m8 20V29" />
              <circle cx="32" cy="14" r="4" />
            </svg>
          </span>
          <span className="brand__text">
            <strong>TribeStudio</strong>
            <small>Creator workspace</small>
          </span>
        </Link>
        <nav className="studio__nav" aria-label="Workspace">
          {STUDIO_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={isActive(path, item.to) ? 'studio__link is-active' : 'studio__link'}
              aria-current={isActive(path, item.to) ? 'page' : undefined}
            >
              <span className="studio__icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
          {canContribute(role) ? (
            <Link to="/workspace" className="studio__link studio__link--muted">
              <span className="studio__icon" aria-hidden="true">
                ✍
              </span>
              Lexicon workspace
            </Link>
          ) : null}
        </nav>
        <div className="studio__account">
          <span className="studio__account-orb" aria-hidden="true">
            {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : accountInitials}
          </span>
          <span className="studio__account-copy">
            <strong className="studio__user">{accountLabel}</strong>
            <small>{role ? `${role} workspace` : 'Creator workspace'}</small>
          </span>
          <button type="button" className="button button--ghost-dark button--small" onClick={() => void signOutUser()}>
            Sign out
          </button>
        </div>
      </aside>
      <main id="main-content" className="studio__main" tabIndex={-1}>
        <Suspense fallback={<div className="loading">Loading…</div>}>{children}</Suspense>
      </main>
    </div>
  );
}
