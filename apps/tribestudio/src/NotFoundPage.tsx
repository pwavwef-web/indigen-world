import { Link } from './router';

interface NotFoundPageProps {
  variant?: 'public' | 'studio';
}

/** Shared, branded recovery state for unknown public and workspace routes. */
export function NotFoundPage({ variant = 'public' }: NotFoundPageProps) {
  const inStudio = variant === 'studio';

  return (
    <section className={`not-found-page not-found-page--${variant}`} aria-labelledby="not-found-title">
      <div className="not-found-page__halo" aria-hidden="true" />
      <div className="not-found-page__code" aria-label="Error 404">
        <span>4</span>
        <span className="not-found-page__orb">TS</span>
        <span>4</span>
      </div>
      <p className="not-found-page__eyebrow">This path is outside the map</p>
      <h1 id="not-found-title">Page not found</h1>
      <p>
        The page may have moved as TribeStudio grows. Head back to a familiar workspace and
        continue creating.
      </p>
      <div className="not-found-page__actions">
        <Link to={inStudio ? '/studio' : '/creators'} className="button button--primary">
          {inStudio ? 'Back to dashboard' : 'Back to creator programme'}
        </Link>
        <Link to={inStudio ? '/studio/help' : '/creators/faq'} className="button button--glass">
          {inStudio ? 'Open help' : 'Visit the FAQ'}
        </Link>
      </div>
    </section>
  );
}
