import { Suspense, type ReactNode } from 'react';
import { Link, useRoute } from '../router';
import { signIn, useAuth } from '../auth';

function BrandMark() {
  return (
    <span className="brand__mark" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M15 47V23l17-9 17 9v24" />
        <path d="M24 44V29m8 15V24m8 20V29" />
        <circle cx="32" cy="14" r="4" />
      </svg>
    </span>
  );
}

const NAV = [
  { to: '/creators', label: 'Programme' },
  { to: '/creators/guidelines', label: 'Guidelines' },
  { to: '/creators/faq', label: 'FAQ' },
];

/** Chrome for the public, co-branded founding-creator marketing pages. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const { path } = useRoute();

  const isActive = (to: string) => {
    if (to === '/creators') {
      return path === '/' || path === '/creators' || path.startsWith('/creators/join');
    }
    return path === to;
  };

  return (
    <div className="public">
      <header className="public__bar">
        <Link to="/creators" className="brand">
          <BrandMark />
          <span className="brand__text">
            <strong>Indigen World Creators</strong>
            <small>Project Kasena · TribeStudio</small>
          </span>
        </Link>
        <nav className="public__nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={isActive(item.to) ? 'is-active' : undefined}
              aria-current={isActive(item.to) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
          {ready && user ? (
            <Link to="/studio" className="button button--primary button--small">
              My workspace
            </Link>
          ) : (
            <button type="button" className="button button--primary button--small" onClick={() => void signIn()}>
              Sign in
            </button>
          )}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Suspense fallback={<div className="loading">Loading…</div>}>{children}</Suspense>
      </main>
      <footer className="public__footer">
        <div className="brand">
          <BrandMark />
          <span className="brand__text">
            <strong>Indigen World</strong>
            <small>Cultural technology for indigenous languages</small>
          </span>
        </div>
        <nav aria-label="Footer">
          <Link to="/creators">Founding Creators</Link>
          <Link to="/creators/guidelines">Guidelines</Link>
          <Link to="/creators/faq">FAQ</Link>
        </nav>
        <p className="public__copy">© {new Date().getFullYear()} Indigen World · Project Kasena</p>
      </footer>
    </div>
  );
}
