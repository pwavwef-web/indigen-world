/**
 * src/components/Header.tsx
 *
 * Site header: brand, compact primary nav, "Get involved" CTA, and the
 * mobile menu. The uploaded template's mobile nav used a neat
 * `grid-template-rows: 0fr -> 1fr` collapse animation instead of the
 * more common `position: fixed` overlay — that's kept as-is here
 * (see .mobile-nav in styles/header.css), since it sidesteps the
 * fixed-position/backdrop-filter containing-block bug entirely and is
 * a nicer effect besides.
 *
 * The one real change from the template: every nav link now points at
 * an in-app route via <Link to="..."> instead of an anchor hash
 * (`href="#vision"`) — because those sections are now separate pages,
 * not scroll targets on one long page.
 */
import { useEffect, useState } from "react";
import { Link, useRoute } from "../app/router";
import { NAV_ROUTES } from "../content/navigation";
import { BrandMark } from "./BrandMark";
import { Icon } from "./Icon";

export function Header() {
  const { path } = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on route change, and on Escape
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="home" className="brand" aria-label="Indigen World home">
          <BrandMark />
          <span className="brand__text">
            <strong>Indigen World</strong>
            <small>Culture belongs in the future</small>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {NAV_ROUTES.map((route) => (
            <Link key={route.path} to={route.path} aria-current={path === route.path ? "page" : undefined}>
              {route.navLabel}
            </Link>
          ))}
        </nav>

        <div className="site-header__actions">
          <Link className="header-cta" to="get-involved">
            Get involved
          </Link>
          <button
            className="menu-button"
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Icon name={menuOpen ? "x" : "menu"} />
          </button>
        </div>
      </div>

      <div
        id="mobile-navigation"
        className={`mobile-nav${menuOpen ? " mobile-nav--open" : ""}`}
        inert={!menuOpen}
      >
        <nav className="container" aria-label="Mobile navigation">
          {NAV_ROUTES.map((route) => (
            <Link
              key={route.path}
              to={route.path}
              aria-current={path === route.path ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {route.navLabel}
              <Icon name="arrow" size={18} />
            </Link>
          ))}
          <Link
            className="mobile-nav__cta"
            to="get-involved"
            aria-current={path === "get-involved" ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            Get involved
            <Icon name="arrow" size={18} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
