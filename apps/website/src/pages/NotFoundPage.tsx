/**
 * src/pages/NotFoundPage.tsx
 *
 * Rendered by App.tsx whenever the current pathname doesn't match any
 * entry in ROUTES_BY_PATH. The template had no equivalent — a single
 * scrolling page has no concept of "page not found" — but a real
 * multi-page router needs one.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { Link } from "../app/router";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";

export function NotFoundPage() {
  useDocumentMeta("Page not found", "The page you're looking for doesn't exist.", { noindex: true });

  return (
    <section className="section not-found" aria-labelledby="not-found-title">
      <div className="not-found__glow not-found__glow--one" aria-hidden="true" />
      <div className="not-found__glow not-found__glow--two" aria-hidden="true" />
      <div className="container not-found__layout">
        <div className="not-found__card">
          <div className="not-found__code" aria-label="Error 404">
            <span>4</span>
            <span className="not-found__mark"><BrandMark compact /></span>
            <span>4</span>
          </div>
          <p className="eyebrow">This path has gone quiet</p>
          <h1 id="not-found-title">We can't find that page.</h1>
          <p className="not-found__body">
            The page may have moved as Indigen World grows. Choose a path below and keep exploring.
          </p>
          <div className="not-found__actions">
            <Button to="home">Back to home</Button>
            <Button to="ecosystem" variant="secondary">Explore the ecosystem</Button>
          </div>
        </div>

        <nav className="not-found__routes" aria-label="Helpful destinations">
          <Link to="project-kasena" className="not-found__route">
            <Icon name="book" />
            <span><strong>Project Kasena</strong><small>Discover our first language cell</small></span>
            <Icon name="arrow" size={18} />
          </Link>
          <Link to="get-involved" className="not-found__route">
            <Icon name="community" />
            <span><strong>Get involved</strong><small>Find your place in the community</small></span>
            <Icon name="arrow" size={18} />
          </Link>
          <Link to="contact" className="not-found__route">
            <Icon name="globe" />
            <span><strong>Contact us</strong><small>Tell us what you were looking for</small></span>
            <Icon name="arrow" size={18} />
          </Link>
        </nav>
      </div>
    </section>
  );
}
