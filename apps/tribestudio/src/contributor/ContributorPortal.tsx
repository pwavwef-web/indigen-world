import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { confirmPasswordReset, sendPasswordResetEmail, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { canValidate, signIn, signOutUser, useAuth } from '../auth';
import { ReviewDesk } from './lazy';
import { useRoute } from '../router';
import { BrandMark, Icon } from './components';
import { livePaths, liveServices, useLiveWorkspace } from './data';
import { invitationLinkOwner, WorkspaceContext, WorkspaceShell } from './workspace';
import type { AccountSummary, WorkspaceData } from './types';
import './styles/portal.css';
import './styles/shell.css';
import './styles/pages.css';
import { SupportPage } from './SupportPage';

/**
 * The contributor portal at /contributor.
 *
 * Access is decided exactly as before the redesign: a signed-in account whose
 * `contributorAccounts/{uid}` record is active. Everything else — the
 * workspace's reads and writes — starts only after that check passes, and
 * the server repeats it on every callable. An invitation link for another
 * account, a revoked invitation and a temporary password each get their own
 * explanation instead of an empty page.
 *
 * /contributor/review and everything under it is the review workspace. It
 * needs a review role, not a contributor invitation, and never starts the
 * contributor's own reads.
 */
export function ContributorPortal() {
  const { user, ready, role, refreshToken } = useAuth();
  const { path, search } = useRoute();
  const linkOwner = invitationLinkOwner(path);
  const code = new URLSearchParams(search).get('oobCode');
  const reviewRoute = path === '/contributor/review' || path.startsWith('/contributor/review/');
  const [access, setAccess] = useState<'loading' | 'active' | 'denied'>('loading');
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || code || reviewRoute) return;
    return onSnapshot(doc(db, 'contributorAccounts', user.uid), (snapshot) => {
      if (snapshot.get('status') !== 'active') {
        setAccess('denied');
        setAccount(null);
        return;
      }
      setAccount({
        status: 'active',
        requiresPasswordChange: snapshot.get('requiresPasswordChange') === true,
        defaultWork: String(snapshot.get('defaultWork') ?? ''),
        activatedAt: String(snapshot.get('activatedAt') ?? ''),
        phoneMasked: '',
      });
      setAccess('active');
    }, () => {
      setAccess('denied');
      setAccount(null);
      setError('Your contributor invitation could not be checked just now.');
    });
  }, [user?.uid, code, reviewRoute]);

  if (path === '/contributor/support') return <AuthFrame><SupportPage /></AuthFrame>;
  if (!ready) return <AuthFrame><p className="cw-auth__message" role="status">Opening your workspace…</p></AuthFrame>;
  if (reviewRoute && !code) {
    if (!user) {
      return (
        <AuthFrame review>
          <ContributorSignIn code={null} />
          <button type="button" className="cw-auth__secondary" onClick={() => void signIn().catch(() => setError('Google sign-in did not complete. Try again.'))}>Sign in with Google</button>
          {error ? <p role="alert" className="cw-auth__error">{error}</p> : null}
        </AuthFrame>
      );
    }
    if (!canValidate(role)) {
      return (
        <AuthFrame review>
          <div className="cw-auth__message" role="alert">
            <h1>Reviewer access required</h1>
            <p>The review workspace is open to accounts the team has given review permission. Signed in as {user.email ?? 'this account'}. If you were given access recently, refresh it.</p>
          </div>
          <div className="cw-auth__actions">
            <button type="button" className="cw-auth__primary" onClick={() => void refreshToken()}>Refresh access</button>
            <a className="cw-btn cw-auth__secondary" href="/contributor">Go to the contributor workspace</a>
            <button type="button" className="cw-auth__secondary" onClick={() => void signOutUser()}>Sign out</button>
          </div>
        </AuthFrame>
      );
    }
    return <ReviewDesk key={user.uid} />;
  }
  if (code || !user) return <AuthFrame><ContributorSignIn code={code} /></AuthFrame>;
  if (linkOwner && user.uid !== linkOwner) {
    return (
      <AuthFrame>
        <div className="cw-auth__message" role="alert">
          <strong>This invitation link belongs to another account</strong>
          <p>You are signed in as {user.email ?? 'a different account'}. Sign out, then sign in with the email address the invitation was sent to.</p>
        </div>
        <button type="button" className="cw-auth__secondary" onClick={() => void signOutUser()}>Sign out</button>
      </AuthFrame>
    );
  }
  if (access === 'denied') {
    return (
      <AuthFrame>
        <div className="cw-auth__message" role="alert">
          <strong>{error ? 'We could not check your invitation' : 'This workspace is for invited contributors'}</strong>
          <p>{error
            ? `${error} Check your connection and try again. If it keeps happening, contact the team member who invited you.`
            : 'This account does not have an active contributor invitation. If you expected one, contact the team member who invited you.'}</p>
        </div>
        <div className="cw-auth__actions">
          {error ? <button type="button" className="cw-auth__primary" onClick={() => window.location.reload()}>Try again</button> : null}
          {canValidate(role) ? <a className="cw-btn cw-auth__secondary" href="/contributor/review">Open the review workspace</a> : null}
          <button type="button" className="cw-auth__secondary" onClick={() => void signOutUser()}>Sign out</button>
        </div>
      </AuthFrame>
    );
  }
  if (access === 'loading' || !account) return <AuthFrame><p className="cw-auth__message" role="status">Checking your invitation…</p></AuthFrame>;
  if (account.requiresPasswordChange) return <AuthFrame><ContributorActivation /></AuthFrame>;
  return <ActiveWorkspace uid={user.uid} email={user.email ?? ''} displayName={user.displayName ?? ''} account={account} />;
}

/**
 * The frame around sign-in and access messages: a quiet identity panel on
 * wide screens, and the form on its own on a phone.
 */
function AuthFrame({ children, review = false }: { children: ReactNode; review?: boolean }) {
  const { path } = useRoute();
  return (
    <div className="cw-auth">
      <aside className="cw-auth__story" aria-label="About this workspace">
        <div className="cw-auth__mark">
          <BrandMark />
          <span><strong>TribeStudio</strong><small>Indigen World</small></span>
        </div>
        <div className="cw-auth__statement">
          <h2>{review ? 'Review Kasem contributions with care.' : 'Document Kasem with care.'}</h2>
          <p>{review
            ? 'The review workspace is for people the team has asked to check contributions before anything is published.'
            : 'This workspace is for invited contributors working with Indigen World on the Kasem language.'}</p>
          <ul className="cw-auth__points">
            {(review ? [
              'Every decision is recorded with the reviewer and the reason.',
              'Contributors see your feedback and can revise their work.',
              'You cannot decide on your own submissions.',
            ] : [
              'Translate the expressions assigned to you. Drafts save as you type.',
              'Kasem-speaking reviewers check every submission and explain their decisions.',
              'Nothing is published until a reviewer approves it.',
            ]).map((point) => <li key={point}><Icon name="check" />{point}</li>)}
          </ul>
        </div>
        <p className="cw-auth__story-foot">Indigen World never asks for your password or a code by phone, SMS or WhatsApp.</p>
      </aside>
      <div className="cw-auth__entry">
        <div className="cw-auth__panel">
          <div className="cw-auth__brand">
            <BrandMark />
            <span><strong>TribeStudio</strong><small>{review ? 'Review workspace' : 'Contributor workspace'}</small></span>
          </div>
          <main id="main-content" tabIndex={-1}>{children}</main>
        </div>
        {path !== '/contributor/support' ? <p className="cw-auth__support">Trouble signing in? <a href="/contributor/support">Contact support</a></p> : null}
        <p className="cw-auth__foot">For invited contributors documenting Kasem. Indigen World never asks for your password by phone or SMS.</p>
      </div>
    </div>
  );
}

function ActiveWorkspace({ uid, email, displayName, account }: { uid: string; email: string; displayName: string; account: AccountSummary }) {
  const live = useLiveWorkspace(uid);
  const services = useMemo(() => liveServices(uid, email), [uid, email]);
  const paths = useMemo(() => livePaths(uid), [uid]);
  const value = useMemo<WorkspaceData>(() => ({
    uid, email, displayName, account, services, paths, preview: false, ...live,
  }), [account, displayName, email, live, paths, services, uid]);
  return <WorkspaceContext.Provider value={value}><WorkspaceShell /></WorkspaceContext.Provider>;
}

export function ContributorActivation() {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return (
    <form className="contributor-auth" onSubmit={async (event) => {
      event.preventDefault();
      if (password !== confirm) { setError('The two passwords do not match.'); return; }
      setBusy(true); setError('');
      try {
        const email = auth.currentUser?.email;
        await httpsCallable(functions, 'activateExpressionContributor')({ password });
        if (email) await signInWithEmailAndPassword(auth, email, password);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Activation did not complete. Please try again.');
      } finally { setBusy(false); }
    }}>
      <h1>Choose your password</h1>
      <p>Replace the temporary password from your invitation with one only you know. Use at least 8 characters, and not your phone number.</p>
      <label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      {error ? <p role="alert" className="cw-auth__error">{error}</p> : null}
      <button className="cw-auth__primary" disabled={busy}>{busy ? 'Activating…' : 'Activate and open my workspace'}</button>
    </form>
  );
}

export function ContributorSignIn({ code }: { code: string | null }) {
  const { path, navigate } = useRoute();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => {
    if (code) void verifyPasswordResetCode(auth, code).then(setEmail).catch(() => setError('This link has expired or was already used. Sign in with your password, or ask for a fresh invitation.'));
  }, [code]);
  return (
    <form className="contributor-auth" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        if (reset) {
          await sendPasswordResetEmail(auth, email.trim(), { url: window.location.origin + '/contributor' });
          setNotice('If this email has an account, a reset link is on its way. Check your inbox and spam folder.');
          return;
        }
        if (code) await confirmPasswordReset(auth, code, password);
        await signInWithEmailAndPassword(auth, email, password);
        navigate(path, { replace: true });
      } catch (reason) {
        const codeName = (reason as { code?: string })?.code ?? '';
        setError(['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(codeName)
          ? 'That email and password do not match. New accounts use the phone number from the invitation, with the country code.'
          : codeName === 'auth/too-many-requests' ? 'Too many attempts. Wait a few minutes, then try again.'
            : codeName === 'auth/network-request-failed' ? 'You appear to be offline. Check your connection and try again.'
              : reason instanceof Error ? reason.message.replace(/^Firebase: /, '') : 'Sign-in did not complete.');
      } finally { setBusy(false); }
    }}>
      <h1>{code ? 'Set your password' : reset ? 'Reset your password' : 'Sign in'}</h1>
      <p>{code
        ? 'Choose a password for your contributor account.'
        : reset
          ? 'Enter the email your invitation was sent to. We will email you a link to choose a new password.'
          : 'Use the email address your invitation was sent to.'}</p>
      <label>Email<input type="email" autoComplete="username" required value={email} readOnly={Boolean(code)} onChange={(event) => setEmail(event.target.value)} /></label>
      {!reset ? <label>{code ? 'New password' : 'Password'}<input type="password" minLength={code ? 8 : undefined} required autoComplete={code ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label> : null}
      {!code && !reset ? <details className="cw-auth__help"><summary>First time signing in?</summary><p>Use your invited email, and your phone number as the temporary password, including the country code (for example +233241234567). You will choose your own password straight after.</p></details> : null}
      {notice ? <p role="status" className="cw-auth__notice">{notice}</p> : null}
      {error ? <p role="alert" className="cw-auth__error">{error}</p> : null}
      <button type="submit" className="cw-auth__primary" disabled={busy || !email}>{busy ? 'Please wait…' : reset ? 'Send reset link' : code ? 'Save password and sign in' : 'Sign in'}</button>
      {!code ? <button type="button" className="cw-auth__secondary" disabled={busy} onClick={() => { setReset(!reset); setError(''); setNotice(''); }}>{reset ? 'Back to sign in' : 'Forgot password?'}</button> : null}
      {code ? <button type="button" className="cw-auth__secondary" onClick={() => navigate(path, { replace: true })}>Already activated? Sign in</button> : null}
    </form>
  );
}

export type { WorkspaceData };
