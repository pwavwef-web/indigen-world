import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { enums, schemas } from '@indigen-world/contracts';
import { Button } from '@indigen-world/web-ui';
import { auth } from './firebase';
import { isValidator, useAdminAuth } from './creators/data';
import { CreatorsAdmin } from './creators/CreatorsAdmin';
import { TeamSiteIntakePage, TeamSiteRequestsAdmin } from './team-sites/TeamSiteIntake';

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

// `planned: true` marks domains whose console UI is not built yet, so the home
// screen doesn't imply capabilities operators can't actually reach here.
const adminDomains: { title: string; body: string; planned?: boolean }[] = [
  { title: 'Roles & access', body: 'Assign and audit role claims for contributors, validators and staff.', planned: true },
  { title: 'Creator management', body: 'Applications, campaigns, submissions, published content and consent for TribeStudio creators.' },
  { title: 'Validation oversight', body: 'Monitor validator queues, escalations and quality across language cells.' },
  { title: 'Moderation', body: 'Review reported content and enforce cultural-permission and consent policy.', planned: true },
  { title: 'Campaigns & rewards', body: 'Oversee bounties, reward settlement and contributor-points integrity.', planned: true },
  { title: 'Audit & accountability', body: 'Inspect the append-only audit log of privileged actions.', planned: true },
];

type View = 'console' | 'creators' | 'teamSites';

function ConsoleHome() {
  const entities = Object.entries(schemas);
  return (
    <>
      <section className="panel panel--notice">
        <h1>Administration console</h1>
        <p>
          The internal admin app for the Indigen World ecosystem — role and access management, creator
          management, validation oversight, moderation, reward integrity and audit. It is separate from{' '}
          <strong>TribeStudio</strong>, the workspace for contributors and creators.
        </p>
      </section>

      <section className="panel">
        <h2>Administrative domains</h2>
        <ul className="entity-grid">
          {adminDomains.map((domain) => (
            <li key={domain.title} className="entity-card">
              <strong>
                {domain.title}
                {domain.planned ? <span className="tag tag--planned">Planned</span> : null}
              </strong>
              <p>{domain.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Validation lifecycle</h2>
        <ol className="pipeline">
          {(enums.validationStatus as string[]).map((status) => (
            <li key={status} className={`pipeline__step pipeline__step--${status}`}>{statusLabels[status] ?? status}</li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2>Shared contract entities</h2>
        <p className="panel__hint">{entities.length} entities from <code>@indigen-world/contracts</code>.</p>
        <ul className="entity-grid">
          {entities.map(([key, schema]) => (
            <li key={key} className="entity-card">
              <strong>{(schema as { title?: string }).title ?? key}</strong>
              <p>{(schema as { description?: string }).description ?? ''}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function App() {
  const { user, role, ready } = useAdminAuth();
  const [view, setView] = useState<View>('console');
  const [error, setError] = useState<string | null>(null);
  const isTeamSiteIntake = window.location.pathname === '/team-site-intake';

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

  if (isTeamSiteIntake) {
    return <TeamSiteIntakePage />;
  }

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
            <strong>Indigen World</strong>
            <small>Admin console</small>
          </span>
        </div>
        <div className="topbar__account">
          {ready && user ? (
            <>
              <span className="account-name">
                {user.displayName ?? user.email}
                {role ? <span className="role-chip">{role}</span> : null}
              </span>
              <Button variant="ghost" onClick={handleSignOut}>Sign out</Button>
            </>
          ) : (
            <Button variant="primary" onClick={handleSignIn} disabled={!ready}>
              {ready ? 'Sign in with Google' : 'Loading…'}
            </Button>
          )}
        </div>
      </header>

      {ready && user ? (
        <nav className="topnav">
          <button type="button" className={view === 'console' ? 'topnav__link is-active' : 'topnav__link'} onClick={() => setView('console')}>Console</button>
          <button type="button" className={view === 'creators' ? 'topnav__link is-active' : 'topnav__link'} onClick={() => setView('creators')}>Creators</button>
          <button type="button" className={view === 'teamSites' ? 'topnav__link is-active' : 'topnav__link'} onClick={() => setView('teamSites')}>Team sites</button>
        </nav>
      ) : null}

      <main id="main-content" className="content">
        {error ? <p className="error-line">{error}</p> : null}
        {!ready ? (
          <p className="muted">Loading…</p>
        ) : !user ? (
          <section className="panel panel--notice">
            <h1>Sign in required</h1>
            <p>Sign in with an authorised staff account to manage the Indigen World ecosystem.</p>
          </section>
        ) : view === 'teamSites' ? (
          isValidator(role) ? (
            <TeamSiteRequestsAdmin />
          ) : (
            <section className="panel panel--notice">
              <h1>Staff access required</h1>
              <p>Your account needs a validator or admin role to review team site responses.</p>
            </section>
          )
        ) : view === 'creators' ? (
          isValidator(role) ? (
            <CreatorsAdmin role={role} />
          ) : (
            <section className="panel panel--notice">
              <h1>Staff access required</h1>
              <p>Your account needs a validator or admin role to manage creators.</p>
            </section>
          )
        ) : (
          <ConsoleHome />
        )}
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Indigen World · Admin console · Internal use only</p>
      </footer>
    </div>
  );
}

export default App;
