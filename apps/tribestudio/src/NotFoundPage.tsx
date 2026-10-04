import { ButtonLink, Icon, Page } from './ui';

interface NotFoundPageProps {
  variant?: 'public' | 'studio';
}

/** Shared, branded recovery state for unknown public and workspace routes. */
export function NotFoundPage({ variant = 'public' }: NotFoundPageProps) {
  const inStudio = variant === 'studio';

  return (
    <Page width="medium" className={inStudio ? undefined : 'ts-public-page'}>
      <section aria-labelledby="not-found-title" className="ts-panel ts-panel--dashed">
        <div className="ts-empty">
          <span className="ts-empty__icon" aria-hidden="true"><Icon name="map" /></span>
          <p className="ts-kicker" aria-label="Error 404">404 · Off the map</p>
          <h1 id="not-found-title" className="ts-empty__title" style={{ fontSize: 'var(--fs-2xl)' }}>This page does not exist</h1>
          <p className="ts-empty__body">
            The link may be mistyped or out of date. Your drafts, projects and contributions are unaffected.
          </p>
          <div className="ts-empty__actions">
            <ButtonLink to={inStudio ? '/studio' : '/creators'} variant="primary" icon="home">
              {inStudio ? 'Back to the overview' : 'Back to the creator programme'}
            </ButtonLink>
            <ButtonLink to={inStudio ? '/studio/help' : '/creators/faq'} icon="help">
              {inStudio ? 'Open help' : 'Read the FAQ'}
            </ButtonLink>
          </div>
        </div>
      </section>
    </Page>
  );
}
