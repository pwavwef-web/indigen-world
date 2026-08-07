import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { enums, schemas } from '@indigen-world/contracts';
import { auth } from './firebase';

const provider = new GoogleAuthProvider();

// Human-readable labels for the contract's validation lifecycle.
const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'In review',
  needs_changes: 'Needs changes',
  validated: 'Validated',
  rejected: 'Rejected',
  retired: 'Retired',
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setReady(true);
    });
  }, []);

  const handleSignIn = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOut(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  };

  const entities = Object.entries(schemas);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <path d="M15 47V23l17-9 17 9v24" />
              <path d="M24 44V29m8 15V24m8 20V29" />
              <circle cx="32" cy="14" r="4" />
            </svg>
          </span>
          <span className="brand__text">
            <strong>TribeStudio</strong>
            <small>Indigen World workspace</small>
          </span>
        </div>
        <div className="topbar__account">
          {ready && user ? (
            <>
              <span className="account-name">{user.displayName ?? user.email}</span>
              <button type="button" className="button button--ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button button--primary"
              onClick={handleSignIn}
              disabled={!ready}
            >
              {ready ? 'Sign in with Google' : 'Loading…'}
            </button>
          )}
        </div>
      </header>

      <main id="main-content" className="content">
        <section className="panel panel--notice">
          <h1>Operational workspace scaffold</h1>
          <p>
            TribeStudio is the internal space for creators, contributors, validators and
            administrators. This is the initial shell: authentication is wired, but role claims,
            data access and validator workflows arrive with the Firebase data layer (Phase 2).
          </p>
          <p className="notice-line">
            Firestore is <strong>deny-all by default</strong> until per-collection rules and
            emulator tests are approved. No production content is loaded here.
          </p>
          {error ? <p className="error-line">{error}</p> : null}
        </section>

        <section className="panel">
          <h2>Validation lifecycle</h2>
          <p className="panel__hint">
            The status pipeline every content record moves through, read from the shared contracts.
          </p>
          <ol className="pipeline">
            {(enums.validationStatus as string[]).map((status) => (
              <li key={status} className={`pipeline__step pipeline__step--${status}`}>
                {statusLabels[status] ?? status}
              </li>
            ))}
          </ol>
        </section>

        <section className="panel">
          <h2>Shared contract entities</h2>
          <p className="panel__hint">
            {entities.length} entities from <code>@indigen-world/contracts</code>. TribeStudio,
            the mobile app and Functions all build against these shapes.
          </p>
          <ul className="entity-grid">
            {entities.map(([key, schema]) => (
              <li key={key} className="entity-card">
                <strong>{(schema as { title?: string }).title ?? key}</strong>
                <p>{(schema as { description?: string }).description ?? ''}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Indigen World · TribeStudio · Internal workspace</p>
      </footer>
    </div>
  );
}

export default App;
