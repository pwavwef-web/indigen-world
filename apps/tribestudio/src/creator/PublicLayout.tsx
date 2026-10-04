import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, useRoute } from '../router';
import { signIn, useAuth } from '../auth';
import { RouteLoader } from '../LoadingScreen';
import { BrandMark, DisplayControl, Icon } from '../ui';
import './creator.css';
import './public.css';

const NAV = [
  { to: '/creators', label: 'Programme' },
  { to: '/creators/guidelines', label: 'Guidelines' },
  { to: '/creators/faq', label: 'FAQ' },
];

/** Chrome for the public, co-branded founding-creator pages. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const { path } = useRoute();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (to: string) => {
    if (to === '/creators') {
      return path === '/' || path === '/creators' || path.startsWith('/creators/join');
    }
    return path === to;
  };

  const account = ready && user ? (
    <Link to="/studio" className="ts-btn ts-btn--primary ts-btn--sm">
      <span>My workspace</span><Icon name="arrow" />
    </Link>
  ) : (
    <button type="button" className="ts-btn ts-btn--primary ts-btn--sm" onClick={() => void signIn()}>
      Sign in
    </button>
  );

  return (
    <div className="pub">
      <a className="ts-skip" href="#main-content">Skip to content</a>
      <div className="pub__ground" aria-hidden="true" />
      <header className={scrolled ? 'pub__bar is-scrolled' : 'pub__bar'}>
        <div className="pub__bar-inner">
          <Link to="/creators" className="pub__brand" aria-label="Indigen World Creators home">
            <BrandMark />
            <span className="pub__brand-text">
              <strong>Indigen World Creators</strong>
              <small>Project Kassena · TribeStudio</small>
            </span>
          </Link>
          <nav className={menu ? 'pub__nav is-open' : 'pub__nav'} id="pub-nav" aria-label="Primary">
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
            <span className="pub__nav-account">{account}</span>
          </nav>
          <div className="pub__bar-actions">
            <span className="pub__bar-account">{account}</span>
            <button
              type="button"
              className="ts-btn ts-btn--ghost ts-btn--icon pub__menu"
              aria-expanded={menu}
              aria-controls="pub-nav"
              aria-label={menu ? 'Close menu' : 'Open menu'}
              onClick={() => setMenu((value) => !value)}
            >
              <Icon name={menu ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" className="pub__main" tabIndex={-1}>
        <Suspense fallback={<RouteLoader />}>{children}</Suspense>
      </main>
      <footer className="pub__footer">
        <div className="pub__footer-inner">
          <div className="pub__brand pub__brand--footer">
            <BrandMark />
            <span className="pub__brand-text">
              <strong>Indigen World</strong>
              <small>Cultural technology for indigenous languages</small>
            </span>
          </div>
          <nav className="pub__footer-nav" aria-label="Footer">
            <Link to="/creators">Founding Creators</Link>
            <Link to="/creators/guidelines">Guidelines</Link>
            <Link to="/creators/faq">FAQ</Link>
            <Link to="/contributor">Contributor portal</Link>
          </nav>
          <div className="pub__footer-end">
            <DisplayControl inline />
            <p className="pub__copy">© {new Date().getFullYear()} Indigen World · Project Kassena</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
