import type { ReactNode } from 'react';
import { Link } from '../router';
import { BrandMark } from './BrandMark';
import { DisplayControl } from './display';
import { Icon, type IconName } from './icons';
import { WORKSPACES, type WorkspaceId } from './AppShell';
import { cx } from './primitives';

/**
 * The frame for signing in and for every access state in front of a
 * workspace, after Comitia's staff sign-in: grid ground, the mark, one card.
 */
export function AuthScreen({ workspace = 'create', title, lede, children, wide = false, note, journey }: {
  workspace?: WorkspaceId;
  /** Omit when the form inside owns its heading (its title follows its state). */
  title?: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  wide?: boolean;
  note?: ReactNode;
  /** A three-step glimpse of what follows signing in. */
  journey?: { icon: IconName; label: string }[];
}) {
  const meta = WORKSPACES[workspace];
  return (
    <div className="ts-auth" data-workspace={workspace}>
      <div className="ts-auth__vignette" aria-hidden="true" />
      <a href="#main-content" className="ts-skip">Skip to the form</a>
      <main id="main-content" tabIndex={-1} className={cx('ts-auth__inner', wide && 'ts-auth__inner--wide')}>
        <BrandMark size="3.5rem" draw className="ts-auth__mark" />
        <section className="ts-auth__card" aria-labelledby="auth-title">
          <span className="ts-auth__workspace"><Icon name={meta.icon} />{meta.name}</span>
          {title ? (
            <div className="ts-auth__head">
              <h1 id="auth-title" className="ts-auth__title" tabIndex={-1}>{title}</h1>
              {lede ? <p className="ts-auth__lede">{lede}</p> : null}
            </div>
          ) : null}
          {children}
        </section>
        {journey?.length ? (
          <ol className="ts-auth__journey" aria-label="What happens next">
            {journey.map((step) => <li key={step.label}><Icon name={step.icon} /><span>{step.label}</span></li>)}
          </ol>
        ) : null}
        {note ? <p className="ts-auth__note">{note}</p> : null}
      </main>
      <AuthFooter />
    </div>
  );
}

export function AuthFooter() {
  return (
    <footer className="ts-auth-foot">
      <div className="ts-auth-foot__brand">
        <BrandMark size="2rem" />
        <span>
          <strong>TribeStudio</strong>
          <span>Indigen World’s workspaces</span>
        </span>
      </div>
      <nav aria-label="Help and policies">
        <Link to="/creators/guidelines">Creator guidelines</Link>
        <a href="/contributor/support">Sign-in support</a>
        <a href="https://indigenworld.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
        <a href="https://indigenworld.com" target="_blank" rel="noopener noreferrer">Indigen World</a>
      </nav>
      <div className="ts-row">
        <DisplayControl inline />
        <span>© {new Date().getFullYear()} Indigen World</span>
      </div>
    </footer>
  );
}

/** Google's sign-in button, in the product's secondary style. */
export function GoogleButton({ onClick, busy = false, label = 'Continue with Google' }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <button type="button" className="ts-btn ts-btn--secondary ts-btn--lg ts-btn--block ts-auth__google" onClick={onClick} disabled={busy} aria-busy={busy || undefined}>
      <span className="ts-btn__spinner" aria-hidden="true" />
      {!busy ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
        </svg>
      ) : null}
      <span>{busy ? 'Opening Google…' : label}</span>
    </button>
  );
}

/** A quiet status line inside the card (checking access, opening…). */
export function AuthWaiting({ children }: { children: ReactNode }) {
  return (
    <div className="ts-auth__state" role="status" aria-live="polite">
      <span className="ts-spinner" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
