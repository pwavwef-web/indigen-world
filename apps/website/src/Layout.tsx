import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BrandMark, Icon } from './components';

const navigation = [
  ['Project Kasena', '/project-kasena'],
  ['Stories', '/stories'],
  ['Impact', '/impact'],
  ['Partners', '/partners'],
] as const;

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close the menu and re-run reveal animations whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);

    const revealItems = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [location.pathname]);

  const currentYear = new Date().getFullYear();

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <Link className="brand" to="/" aria-label="Indigen World home">
            <BrandMark />
            <span className="brand__text">
              <strong>Indigen World</strong>
              <small>Culture belongs in the future</small>
            </span>
          </Link>

          <nav className="desktop-nav" aria-label="Primary navigation">
            {navigation.map(([label, href]) => (
              <NavLink key={href} to={href} className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="site-header__actions">
            <Link className="header-cta" to="/partners">
              Partner with us
            </Link>
            <button
              className="menu-button"
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} />
            </button>
          </div>
        </div>

        <div id="mobile-navigation" className={`mobile-nav${menuOpen ? ' mobile-nav--open' : ''}`}>
          <nav className="container" aria-label="Mobile navigation">
            {navigation.map(([label, href]) => (
              <Link key={href} to={href} onClick={() => setMenuOpen(false)}>
                {label}
                <Icon name="arrow" size={18} />
              </Link>
            ))}
            <Link to="/partners" onClick={() => setMenuOpen(false)}>
              Partner with us
              <Icon name="arrow" size={18} />
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer__top">
          <div className="footer-brand">
            <Link className="brand brand--footer" to="/" aria-label="Back to home">
              <BrandMark />
              <span className="brand__text">
                <strong>Indigen World</strong>
                <small>Culture belongs in the future</small>
              </span>
            </Link>
            <p>
              A cultural technology ecosystem for language preservation, cultural learning, storytelling and
              creator enablement.
            </p>
          </div>
          <div className="footer-links">
            <div>
              <strong>Explore</strong>
              <Link to="/project-kasena">Project Kasena</Link>
              <Link to="/stories">Stories</Link>
              <Link to="/impact">Impact</Link>
            </div>
            <div>
              <strong>Get involved</strong>
              <Link to="/partners">Partnerships</Link>
              <Link to="/partners">Support the pilot</Link>
              <a href="mailto:pwavwef@gmail.com">Contact</a>
            </div>
            <div>
              <strong>Programme</strong>
              <Link to="/project-kasena">Kasem language cell</Link>
              <span>Northern Ghana</span>
            </div>
          </div>
        </div>
        <div className="container site-footer__bottom">
          <p>© {currentYear} Indigen World. Cultural materials may carry distinct permissions.</p>
          <p>Project Kasena is an Indigen World programme.</p>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
