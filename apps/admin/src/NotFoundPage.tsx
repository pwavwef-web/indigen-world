import type { MouseEventHandler } from 'react';

interface AdminNotFoundPageProps {
  onGoHome: MouseEventHandler<HTMLAnchorElement>;
}

/** Branded recovery state for URLs that are not part of the admin console. */
export function AdminNotFoundPage({ onGoHome }: AdminNotFoundPageProps) {
  return (
    <section className="admin-not-found" aria-labelledby="admin-not-found-title">
      <div className="admin-not-found__halo" aria-hidden="true" />
      <div className="admin-not-found__code" aria-label="Error 404">
        <span>4</span>
        <span className="admin-not-found__orb">IW</span>
        <span>4</span>
      </div>
      <p className="admin-not-found__eyebrow">Route not recognised</p>
      <h1 id="admin-not-found-title">That admin page doesn’t exist.</h1>
      <p>
        The address may be outdated or incomplete. Return to the console and choose a verified
        workspace from the navigation.
      </p>
      <a className="admin-not-found__action" href="/" onClick={onGoHome}>
        Return to admin console
        <span aria-hidden="true">→</span>
      </a>
    </section>
  );
}
