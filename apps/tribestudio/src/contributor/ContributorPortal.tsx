import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { confirmPasswordReset, sendPasswordResetEmail, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { signOutUser, useAuth } from '../auth';
import { useRoute } from '../router';
import { BrandMark } from './components';
import { livePaths, liveServices, useLiveWorkspace } from './data';
import { invitationLinkOwner, WorkspaceContext, WorkspaceShell } from './workspace';
import type { AccountSummary, WorkspaceData } from './types';
import './contributor.css';

/**
 * The contributor portal at /contributor.
 *
 * Access is decided exactly as before the rebuild: a signed-in account whose
 * `contributorAccounts/{uid}` record is active. Everything else — the
 * workspace's reads and writes — starts only after that check passes, and
 * the server repeats it on every callable. An invitation link for another
 * account, a revoked invitation and a temporary password each get their own
 * explanation instead of an empty page.
 */
export function ContributorPortal() {
  const { user, ready } = useAuth();
  const { path, search } = useRoute();
  const linkOwner = invitationLinkOwner(path);
  const code = new URLSearchParams(search).get('oobCode');
  const [access, setAccess] = useState<'loading' | 'active' | 'denied'>('loading');
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || code) return;
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
  }, [user?.uid, code]);

  if (!ready) return <AuthFrame><p className="cw-auth__message" role="status">Opening your workspace…</p></AuthFrame>;
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
          <button type="button" className="cw-auth__secondary" onClick={() => void signOutUser()}>Sign out</button>
        </div>
      </AuthFrame>
    );
  }
  if (access === 'loading' || !account) return <AuthFrame><p className="cw-auth__message" role="status">Checking your invitation…</p></AuthFrame>;
  if (account.requiresPasswordChange) return <AuthFrame><ContributorActivation /></AuthFrame>;
  return <ActiveWorkspace uid={user.uid} email={user.email ?? ''} displayName={user.displayName ?? ''} account={account} />;
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="cw-auth iwx">
      <div className="cw-auth__panel">
        <div className="cw-auth__brand">
          <BrandMark />
          <span><strong>Contributor workspace</strong><small>Indigen World · TribeStudio</small></span>
        </div>
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
      <p className="cw-auth__foot">For invited contributors documenting Kasem. Indigen World never asks for your password by phone or SMS.</p>
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
      <p>Replace the temporary password from your invitation with one only you know. Then your assignments open.</p>
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
          : 'New account? Use your invited email and your phone number as the temporary password, including the country code (for example +233241234567). Already activated? Use the password you chose.'}</p>
      <label>Email<input type="email" autoComplete="username" required value={email} readOnly={Boolean(code)} onChange={(event) => setEmail(event.target.value)} /></label>
      {!reset ? <label>{code ? 'New password' : 'Password'}<input type="password" minLength={code ? 8 : undefined} required autoComplete={code ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label> : null}
      {notice ? <p role="status" className="cw-auth__notice">{notice}</p> : null}
      {error ? <p role="alert" className="cw-auth__error">{error}</p> : null}
      <button type="submit" className="cw-auth__primary" disabled={busy || !email}>{busy ? 'Please wait…' : reset ? 'Send reset link' : code ? 'Save password and sign in' : 'Sign in'}</button>
      {!code ? <button type="button" className="cw-auth__secondary" disabled={busy} onClick={() => { setReset(!reset); setError(''); setNotice(''); }}>{reset ? 'Back to sign in' : 'Forgot password?'}</button> : null}
      {code ? <button type="button" className="cw-auth__secondary" onClick={() => navigate(path, { replace: true })}>Already activated? Sign in</button> : null}
    </form>
  );
}

export type { WorkspaceData };
