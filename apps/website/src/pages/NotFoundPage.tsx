/**
 * src/pages/NotFoundPage.tsx
 *
 * Rendered by App.tsx whenever the current pathname doesn't match any
 * entry in ROUTES_BY_PATH. The template had no equivalent — a single
 * scrolling page has no concept of "page not found" — but a real
 * multi-page router needs one.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { Button } from "../components/Button";

export function NotFoundPage() {
  useDocumentMeta("Page not found", "The page you're looking for doesn't exist.");

  return (
    <section className="section section--white not-found">
      <div className="container text-center">
        <p className="eyebrow">404</p>
        <h1>We can't find that page.</h1>
        <p className="not-found__body">
          The link you followed may be broken, or the page may have moved. Here's how to get back
          on track.
        </p>
        <Button to="home">Back to home</Button>
      </div>
    </section>
  );
}
