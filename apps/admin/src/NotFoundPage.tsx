import { useRouter } from './router';
import { ButtonLink } from './ui/primitives';
import { Icon } from './ui/icons';

/** Explicit recovery for addresses that are not part of the console. */
export function AdminNotFoundPage() {
  const { pathname } = useRouter();
  return (
    <section className="ad-not-found ts-enter" aria-labelledby="page-title">
      <span className="ad-not-found__icon" aria-hidden="true"><Icon name="compass" /></span>
      <p className="ad-not-found__code" aria-label="Error 404">404</p>
      <h1 id="page-title" tabIndex={-1}>That admin page doesn’t exist</h1>
      <p>
        <code>{pathname}</code> is not an address in Administration. It may be outdated or mistyped.
      </p>
      <div className="ad-not-found__actions">
        <ButtonLink to="/" variant="primary" icon="home">Back to home</ButtonLink>
      </div>
      <p className="ts-muted">Tip: press <kbd className="ts-kbd">Ctrl K</kbd> to search every workspace.</p>
    </section>
  );
}
