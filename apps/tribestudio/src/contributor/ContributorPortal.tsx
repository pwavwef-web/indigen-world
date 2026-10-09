import { studioReturn } from '../authReturn';
import { WorkspaceContext } from './context';
import { KnowledgeWorkspace } from '../knowledge/KnowledgeWorkspace';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { confirmPasswordReset, sendPasswordResetEmail, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { canValidate, signIn, signOutUser, useAuth } from '../auth';
import { ReviewDesk } from './review/ReviewDesk';
import { reviewNav } from './review/nav';
import { useRoute } from '../router';
import { livePaths, liveServices, useLiveWorkspace } from './data';
import { contributorNav, invitationLinkOwner, WorkspaceShell } from './workspace';
import type { AccountSummary, WorkspaceData } from './types';
import { AppShell, AuthScreen, AuthWaiting, GoogleButton, Icon, useWorkspaceAccess, type WorkspaceId } from '../ui';
import { SupportPage } from './SupportPage';
import { CONTRIBUTOR_TRAINING_NOTICE, CONTRIBUTOR_TRAINING_TERMS_VERSION } from './trainingTerms';
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
  const { user, ready, role, refreshToken } = useAuth();
  const { path, search, navigate } = useRoute();
  const linkOwner = invitationLinkOwner(path);
  const code = new URLSearchParams(search).get('oobCode');
  const returnTo = studioReturn(new URLSearchParams(search).get('returnTo'));
  useEffect(() => { if (ready && user && returnTo && !code && !linkOwner) navigate(returnTo, { replace: true }); }, [ready, user?.uid, returnTo, code, linkOwner]);
  const corpusRoute = path === '/contributor/corpus';
  const reviewRoute = path === '/contributor/review';
  const [access, setAccess] = useState<'loading' | 'active' | 'denied'>('loading');
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user || code || reviewRoute || corpusRoute) return;
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
        trainingTermsVersion: String(snapshot.get('trainingAgreement.version') ?? ''),
        phoneMasked: '',
      });
      setAccess('active');
    }, () => {
      setAccess('denied');
      setAccount(null);
      setError('Your contributor invitation could not be checked just now.');
    });
  }, [user?.uid, code, reviewRoute, corpusRoute]);

  // Google sign-in is offered where validators and corpus reviewers arrive;
  // invited contributors use the email from their invitation.
  const google = () => (
    <>
      <p className="ts-auth__or">or</p>
      <GoogleButton busy={googleBusy} label={reviewRoute ? 'Validators: continue with Google' : 'Continue with Google'} onClick={() => {
        setGoogleBusy(true);
        setError('');
        void signIn().catch(() => setError('Google sign-in did not complete. Try again.')).finally(() => setGoogleBusy(false));
      }} />
      {error ? <p role="alert" className="ts-error"><Icon name="alert" />{error}</p> : null}
    </>
  );

  if (path === '/contributor/support') return <AuthFrame wide><SupportPage /></AuthFrame>;
  if (!ready) return <AuthFrame title="Opening your workspace"><AuthWaiting>Checking your sign-in…</AuthWaiting></AuthFrame>;
  if (corpusRoute && !user && !code) return <AuthFrame><ContributorSignIn code={null} />{google()}</AuthFrame>;
  if (corpusRoute && user && !code) return <CorpusShell />;
  if (reviewRoute && !code) {
    if (!user) return <AuthFrame><ContributorSignIn code={null} />{google()}</AuthFrame>;
    if (!canValidate(role)) {
      return (
        <AuthFrame title="Validator access required" lede="The review desk opens for accounts with review permission. If you were given that permission recently, refresh your access; otherwise contact the team.">
          <div className="ts-auth__form">
            <button type="button" className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" disabled={refreshing} aria-busy={refreshing || undefined} onClick={async () => { setRefreshing(true); try { await refreshToken(); } finally { setRefreshing(false); } }}>
              <span className="ts-btn__spinner" aria-hidden="true" /><span>{refreshing ? 'Checking…' : 'Refresh access'}</span>
            </button>
            <button type="button" className="ts-btn ts-btn--ghost ts-btn--block" onClick={() => void signOutUser()}><span>Sign out</span></button>
          </div>
        </AuthFrame>
      );
    }
    return <ReviewDesk key={user.uid} />;
  }
  if (code || !user) return <AuthFrame><ContributorSignIn code={code} /></AuthFrame>;
  if (linkOwner && user.uid !== linkOwner) {
    return (
      <AuthFrame title="This link belongs to another account" lede={`You are signed in as ${user.email ?? 'a different account'}. Sign out, then sign in with the email address the invitation was sent to.`}>
        <div className="ts-auth__form" role="alert">
          <button type="button" className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" onClick={() => void signOutUser()}><Icon name="logout" /><span>Sign out and switch account</span></button>
        </div>
      </AuthFrame>
    );
  }
  if (access === 'denied') {
    return (
      <AuthFrame
        title={error ? 'We could not check your invitation' : 'This workspace is for invited contributors'}
        lede={error
          ? `${error} Check your connection and try again. If it keeps happening, contact the team member who invited you.`
          : 'This account does not have an active contributor invitation. If you expected one, contact the team member who invited you.'}
      >
        <div className="ts-auth__form" role="alert">
          {error ? <button type="button" className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" onClick={() => window.location.reload()}><Icon name="refresh" /><span>Try again</span></button> : null}
          <a className="ts-btn ts-btn--secondary ts-btn--block" href="/studio"><Icon name="pen" /><span>Open the creator studio instead</span></a>
          <button type="button" className="ts-btn ts-btn--ghost ts-btn--block" onClick={() => void signOutUser()}><span>Sign out</span></button>
        </div>
      </AuthFrame>
    );
  }
  if (access === 'loading' || !account) return <AuthFrame title="Opening your workspace"><AuthWaiting>Checking your invitation…</AuthWaiting></AuthFrame>;
  if (account.requiresPasswordChange) return <AuthFrame><ContributorActivation /></AuthFrame>;
  if (account.trainingTermsVersion !== CONTRIBUTOR_TRAINING_TERMS_VERSION) return <AuthFrame wide><ContributorTrainingAgreement /></AuthFrame>;
  return <ActiveWorkspace uid={user.uid} email={user.email ?? ''} displayName={user.displayName ?? ''} account={account} />;
}

/**
 * Every state in front of the contributor and validator workspaces, in the
 * sign-in frame of the workspace being entered. Declared at module level so
 * a form inside keeps what was typed when the portal re-renders.
 */
function AuthFrame({ children, title, lede, wide = false }: { children: ReactNode; title?: ReactNode; lede?: ReactNode; wide?: boolean }) {
  const { path } = useRoute();
  const review = path === '/contributor/review';
  const support = path === '/contributor/support';
  const workspace: WorkspaceId = review ? 'review' : 'contribute';
  return (
    <AuthScreen
      workspace={workspace}
      title={title}
      lede={lede}
      wide={wide}
      journey={!title && !wide && !support
        ? review
          ? [{ icon: 'inbox', label: 'Choose a queue' }, { icon: 'eye', label: 'Inspect the evidence' }, { icon: 'shield', label: 'Record a decision' }]
          : [{ icon: 'assignments', label: 'Open an assignment' }, { icon: 'translation', label: 'Translate and check' }, { icon: 'send', label: 'Send for review' }]
        : undefined}
      note={support ? undefined : (
        <>
          {review ? 'Access is limited to accounts with review permission.' : 'For invited contributors documenting Kasem.'}{' '}
          Indigen World never asks for your password by phone or SMS. <a href="/contributor/support">Need help signing in?</a>
        </>
      )}
    >
      {children}
    </AuthScreen>
  );
}

/** The corpus workspace for any signed-in account: its own records, and a review queue for qualified reviewers. */
function CorpusShell() {
  const { user, role } = useAuth();
  const { path } = useRoute();
  const access = useWorkspaceAccess();
  // Corpus records belong to two portals: contributors write them and
  // validators review them. A validator who is not also an invited
  // contributor stays inside the validator portal's map.
  const reviewing = !access.contributor && canValidate(role);
  const nav = access.contributor
    ? contributorNav({ path, extras: [] }).map((item) => ({ ...item, active: item.to === '/contributor/corpus' }))
    : reviewing
      ? reviewNav({ path })
      : [
        { to: '/contributor/corpus', label: 'Corpus records', icon: 'database' as const, group: 'Your work', active: true, dock: true },
        { to: '/contributor/support', label: 'Help & support', icon: 'help' as const, group: 'Help', dock: true },
      ];
  return (
    <AppShell
      workspace={reviewing ? 'review' : 'contribute'}
      nav={nav}
      account={{ name: user?.displayName || user?.email || (reviewing ? 'Validator' : 'Contributor'), photo: user?.photoURL, role: reviewing ? 'Validator' : 'Contributor' }}
      onSignOut={() => void signOutUser()}
    >
      <KnowledgeWorkspace key={user?.uid} />
    </AppShell>
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
  const [accepted, setAccepted] = useState(false);
  return (
    <form className="ts-auth__form contributor-auth" onSubmit={async (event) => {
      event.preventDefault();
      if (password !== confirm) { setError('The two passwords do not match.'); return; }
      if (!accepted) { setError('Accept the contributor training agreement to continue.'); return; }
      setBusy(true); setError('');
      try {
        const email = auth.currentUser?.email;
        await httpsCallable(functions, 'activateExpressionContributor')({ password, acceptTrainingTerms: true, trainingTermsVersion: CONTRIBUTOR_TRAINING_TERMS_VERSION });
        if (email) await signInWithEmailAndPassword(auth, email, password);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Activation did not complete. Please try again.');
      } finally { setBusy(false); }
    }}>
      <div className="ts-auth__head">
        <h1 id="auth-title" className="ts-auth__title">Choose your password</h1>
        <p className="ts-auth__lede">Replace the temporary password from your invitation with one only you know. Your assignments open straight after.</p>
      </div>
      <label className="ts-field"><span className="ts-label">New password</span><input className="ts-input" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="activation-password-hint" /><span className="ts-hint" id="activation-password-hint">At least 8 characters. Do not reuse your phone number.</span></label>
      <label className="ts-field"><span className="ts-label">Confirm password</span><input className="ts-input" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} aria-invalid={Boolean(confirm && confirm !== password) || undefined} /></label>
      <TrainingTerms accepted={accepted} onChange={setAccepted} busy={busy} />
      {error ? <p role="alert" className="ts-notice ts-notice--danger">{error}</p> : null}
      <button className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" disabled={busy || !accepted} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><span>{busy ? 'Activating…' : 'Agree and activate my workspace'}</span></button>
      <button type="button" className="ts-btn ts-btn--ghost ts-btn--block" disabled={busy} onClick={() => void signOutUser()}><span>Leave contributor portal</span></button>
    </form>
  );
}

export function ContributorSignIn({ code }: { code: string | null }) {
  const { path, navigate, search } = useRoute();
  const destination = studioReturn(new URLSearchParams(search).get('returnTo')) ?? (code ? path : path + search);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false), [notice, setNotice] = useState('');
  const review = path === '/contributor/review';
  useEffect(() => {
    if (code) void verifyPasswordResetCode(auth, code).then(setEmail).catch(() => setError('This link has expired or was already used. Sign in with your password, or ask for a fresh invitation.'));
  }, [code]);
  return (
    <form className="ts-auth__form contributor-auth" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        if (reset) {
          await sendPasswordResetEmail(auth, email.trim(), { url: window.location.origin + '/contributor' + (studioReturn(new URLSearchParams(search).get('returnTo')) ? '?returnTo=' + encodeURIComponent(destination) : '') });
          setNotice('If this email has an account, a reset link is on its way. Check your inbox and spam folder.');
          return;
        }
        if (code) await confirmPasswordReset(auth, code, password);
        await signInWithEmailAndPassword(auth, email, password);
        navigate(destination, { replace: true });
      } catch (reason) {
        const codeName = (reason as { code?: string })?.code ?? '';
        setError(['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(codeName)
          ? 'That email and password do not match. New accounts use the phone number from the invitation, with the country code.'
          : codeName === 'auth/too-many-requests' ? 'Too many attempts. Wait a few minutes, then try again.'
            : codeName === 'auth/network-request-failed' ? 'You appear to be offline. Check your connection and try again.'
              : reason instanceof Error ? reason.message.replace(/^Firebase: /, '') : 'Sign-in did not complete.');
      } finally { setBusy(false); }
    }}>
      <div className="ts-auth__head">
        <h1 id="auth-title" className="ts-auth__title">{code ? 'Set your password' : reset ? 'Reset your password' : review ? 'Validator sign-in' : 'Contributor sign-in'}</h1>
        <p className="ts-auth__lede">{code
          ? 'Choose a password for your contributor account.'
          : reset
            ? 'Enter the email your invitation was sent to. We will email you a link to choose a new password.'
            : review ? 'Sign in to your review desk.' : 'Sign in to pick up where you left off.'}</p>
      </div>
      {!reset && !review ? (
        <p className="ts-notice ts-notice--info ts-notice--plain" style={{ fontSize: 'var(--fs-xs)' }}>
          Contributor submissions are used to train and evaluate our language models. You will read and accept the full agreement before contributing.
        </p>
      ) : null}
      <label className="ts-field"><span className="ts-label">Email</span><input className="ts-input" type="email" autoComplete="username" required value={email} readOnly={Boolean(code)} onChange={(event) => setEmail(event.target.value)} /></label>
      {!reset ? (
        <label className="ts-field">
          <span className="ts-auth__label-row">
            <span className="ts-label">{code ? 'New password' : 'Password'}</span>
            {!code ? <button type="button" className="ts-link" style={{ fontSize: 'var(--fs-xs)' }} disabled={busy} onClick={() => { setReset(true); setError(''); setNotice(''); }}>Forgot password?</button> : null}
          </span>
          <input className="ts-input" type="password" minLength={code ? 8 : undefined} required autoComplete={code ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
      ) : null}
      {!code && !reset && !review ? (
        <details className="ts-auth__help">
          <summary><Icon name="chevron" />First time here?</summary>
          <p>Use your invited email and your phone number as the temporary password, including the country code (for example +233241234567). You’ll choose your own password after signing in.</p>
        </details>
      ) : null}
      {notice ? <p role="status" className="ts-notice ts-notice--success">{notice}</p> : null}
      {error ? <p role="alert" className="ts-notice ts-notice--danger">{error}</p> : null}
      <button type="submit" className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" disabled={busy || !email} aria-busy={busy || undefined}>
        <span className="ts-btn__spinner" aria-hidden="true" />
        <span>{busy ? 'Please wait…' : reset ? 'Send reset link' : code ? 'Save password and sign in' : 'Sign in'}</span>
      </button>
      {reset ? <button type="button" className="ts-btn ts-btn--ghost ts-btn--block" disabled={busy} onClick={() => { setReset(false); setError(''); setNotice(''); }}>Back to sign in</button> : null}
      {code ? <button type="button" className="ts-btn ts-btn--ghost ts-btn--block" onClick={() => navigate(path, { replace: true })}>Already activated? Sign in</button> : null}
    </form>
  );
}

export type { WorkspaceData };

function TrainingTerms({ accepted, onChange, busy }: { accepted: boolean; onChange: (value: boolean) => void; busy: boolean }) {
  return (
    <section className="ts-auth__terms" aria-labelledby="training-terms-title">
      <h2 id="training-terms-title"><Icon name="shield" /> Contributing helps train our models</h2>
      <p>{CONTRIBUTOR_TRAINING_NOTICE}</p>
      <label className="ts-check ts-check--card ts-check--required">
        <input type="checkbox" required checked={accepted} disabled={busy} onChange={event => onChange(event.target.checked)} />
        <span className="ts-check__copy"><strong>I agree</strong><small>All my future contributor submissions will be used for model training and evaluation, and I have permission to contribute this content.</small></span>
      </label>
    </section>
  );
}

function ContributorTrainingAgreement() {
  const [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return (
    <form className="ts-auth__form contributor-auth" onSubmit={async event => {
      event.preventDefault();
      if (!accepted) return;
      setBusy(true); setError('');
      try {
        await httpsCallable(functions, 'acceptContributorTrainingTerms')({ acceptTrainingTerms: true, trainingTermsVersion: CONTRIBUTOR_TRAINING_TERMS_VERSION });
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'The agreement could not be saved. Try again.'); }
      finally { setBusy(false); }
    }}>
      <div className="ts-auth__head">
        <h1 id="auth-title" className="ts-auth__title">Before you continue contributing</h1>
        <p className="ts-auth__lede">The contributor agreement changed. It applies to new submissions; earlier submissions keep their recorded permissions.</p>
      </div>
      <TrainingTerms accepted={accepted} onChange={setAccepted} busy={busy} />
      {error ? <p role="alert" className="ts-notice ts-notice--danger">{error}</p> : null}
      <button className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" disabled={busy || !accepted} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><span>{busy ? 'Saving…' : 'Agree and open my workspace'}</span></button>
      <button type="button" className="ts-btn ts-btn--ghost ts-btn--block" disabled={busy} onClick={() => void signOutUser()}>Leave contributor portal</button>
    </form>
  );
}
