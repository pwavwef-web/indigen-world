import { useEffect, useRef, useState } from 'react';
import { Link, useRoute } from '../app/router';
import { PRIMARY_NAV, STORY_NAV } from '../content/navigation';
import { BrandMark } from './BrandMark';
import { Icon } from './Icon';

export function Header() {
  const { path, search } = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const storyMenu = useRef<HTMLDetailsElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const storyActive = STORY_NAV.some(route => route.path === path);
  useEffect(() => {
    setMenuOpen(false);
    if (storyMenu.current) storyMenu.current.open = false;
  }, [path, search]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (storyMenu.current?.open) {
        storyMenu.current.open = false;
        storyMenu.current.querySelector('summary')?.focus();
      }
      setMenuOpen(current => {
        if (current) menuButton.current?.focus();
        return false;
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && storyMenu.current && !storyMenu.current.contains(event.target)) storyMenu.current.open = false;
    };
    const desktop = matchMedia('(min-width: 1080px)');
    const onResize = () => { setMenuOpen(false); if (storyMenu.current) storyMenu.current.open = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    desktop.addEventListener('change', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      desktop.removeEventListener('change', onResize);
    };
  }, []);
  return <header className="site-header">
    <div className="container site-header__inner">
      <Link to="home" className="brand" aria-label="Indigen World home">
        <BrandMark /><span className="brand__text"><strong>Indigen World</strong><small>Culture belongs in the future</small></span>
      </Link>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {PRIMARY_NAV.map(route => <Link key={route.path} to={route.path} aria-current={path === route.path ? 'page' : undefined}>{route.label}</Link>)}
        <details ref={storyMenu} className="story-nav" onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }}>
          <summary className={storyActive ? 'is-active' : ''}>Our Story <Icon name="chevron" size={16} /></summary>
          <div className="story-nav__panel">
            <p className="eyebrow">Built with communities</p>
            {STORY_NAV.map(route => <Link key={route.path} to={route.path} aria-current={path === route.path ? 'page' : undefined}>
              <strong>{route.label}</strong><span>{route.description}</span>
            </Link>)}
          </div>
        </details>
      </nav>
      <div className="site-header__actions">
        <Link className="header-cta" to="get-involved">Get involved <Icon name="arrow" size={16} /></Link>
        <button ref={menuButton} className="menu-button" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(value => !value)}>
          <Icon name={menuOpen ? 'x' : 'menu'} />
        </button>
      </div>
    </div>
    <div id="mobile-navigation" className={`mobile-nav${menuOpen ? ' mobile-nav--open' : ''}`} inert={!menuOpen}>
      <nav className="container" aria-label="Mobile navigation">
        {PRIMARY_NAV.map(route => <Link key={route.path} to={route.path} aria-current={path === route.path ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{route.label}<Icon name="arrow" size={18} /></Link>)}
        <details className="mobile-story-nav">
          <summary>Our Story <Icon name="chevron" size={18} /></summary>
          {STORY_NAV.map(route => <Link key={route.path} to={route.path} aria-current={path === route.path ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{route.label}<Icon name="arrow" size={18} /></Link>)}
        </details>
        <Link className="mobile-nav__cta" to="get-involved" aria-current={path === 'get-involved' ? 'page' : undefined} onClick={() => setMenuOpen(false)}>Get involved<Icon name="arrow" size={18} /></Link>
      </nav>
    </div>
  </header>;
}
