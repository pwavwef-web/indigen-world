import { useEffect, useRef, useState } from 'react';
import { confirmPasswordReset, sendPasswordResetEmail, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { signOutUser, useAuth } from '../auth';
import { matchRoute, useRoute } from '../router';
import './contributor.css';

export type Item = { id: string; expression: string; translation: string; alternatives: string[];
  revision: number; status: string; unsure?: boolean; submissionId?: string; feedback?: string; reviewedAt?: string | null };
type Work = { id: string; title: string; createdAt: string; instructions?: string; dialect?: string; tone?: string; deadline?: string; helpContact?: string };
export function expressionView(item: Item): 'untranslated' | 'translated' | 'reviewed' {
  if (item.reviewedAt || ['verified', 'rejected', 'needs_revision', 'archived'].includes(item.status)) return 'reviewed';
  return item.translation.trim() || item.submissionId ? 'translated' : 'untranslated';
}
const save = httpsCallable<Record<string, unknown>, { revision: number; submissionId?: string }>(functions, 'saveExpressionAnswer');

export function ContributorPortal() {
  const { user, ready } = useAuth();
  const { path, search, navigate } = useRoute();
  const params = matchRoute('/contributor/:uid/:work', path);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [access, setAccess] = useState<'loading' | 'active' | 'denied'>('loading');
  const [works, setWorks] = useState<Work[]>([]);
  const [worksLoaded, setWorksLoaded] = useState(false);
  const [needsActivation, setNeedsActivation] = useState(false);
  const code = new URLSearchParams(search).get('oobCode');
  useEffect(() => {
    if (!user || code) return;
    return onSnapshot(doc(db, 'contributorAccounts', user.uid), account => {
      if (account.get('status') !== 'active') {
        setAccess('denied'); setItems([]); setWorks([]); return;
      }
      setNeedsActivation(account.get('requiresPasswordChange') === true);
      setAccess('active');
      if (!params && account.get('defaultWork')) navigate('/contributor/' + user.uid + '/' + account.get('defaultWork'), { replace: true });
    }, () => { setAccess('denied'); setItems([]); setError('Unable to verify your contributor invitation.'); });
  }, [user?.uid, code, params?.uid, navigate]);
  useEffect(() => {
    if (!user || access !== 'active' || code) return;
    return onSnapshot(collection(db, 'contributorAccounts', user.uid, 'works'), snapshot => {
      setWorks(snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Work).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setWorksLoaded(true);
    }, () => setError('Unable to load your assignments. Please retry.'));
  }, [user?.uid, access, code]);
  useEffect(() => {
    if (!user || !params || user.uid !== params.uid || code || access !== 'active') return;
    setLoaded(false);
    return onSnapshot(collection(db, `contributorAccounts/${user.uid}/works/${params.work}/items`), snapshot => {
      setItems(snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Item)); setLoaded(true);
    }, e => { setError(e.message); setLoaded(true); });
  }, [user?.uid, params?.uid, params?.work, code, access]);
  return <div className="contributor-portal"><header><div><span className="contributor-kicker">INDIGEN WORLD / CONTRIBUTORS</span>
    <h1>Your contributions</h1><p>{works.find(w => w.id === params?.work)?.title}</p></div>{user && <details><summary>Account details</summary><p className="contributor-identity">Contributor ID: <code>{user.uid}</code></p><button disabled={pending} onClick={() => void signOutUser()}>Sign out</button></details>}</header>
    <main id="main-content" tabIndex={-1}>
      {error && <p role="alert">{error} <button onClick={() => window.location.reload()}>Retry</button></p>}
      {!ready ? <p>Opening your portal…</p> : code || !user ? <ContributorSignIn code={code} />
        : params && user.uid !== params.uid ? <p role="alert">This invitation belongs to another account. Sign out and use the invited email address.</p>
        : access === 'denied' ? <p role="alert">This portal is available only to invited contributors. Contact the team for an invitation.</p>
        : access === 'active' && needsActivation ? <ContributorActivation />
        : access !== 'active' || !params || !loaded || !worksLoaded ? <p>Loading your expressions…</p>
        : !works.some(w => w.id === params.work) ? <p role="alert">This assignment is not available to your account.</p> : <>
          <label className="contributor-assignment">Your assignment<select value={params.work} disabled={pending} onChange={e => navigate('/contributor/' + user.uid + '/' + e.target.value)}>
            {works.map(w => <option key={w.id} value={w.id}>{w.title} · {w.id.slice(0, 8)}</option>)}
          </select></label>
          {works.filter(w => w.id === params.work).map(w => <aside key={w.id} className="contributor-instructions" aria-label="Assignment guidance"><h2>Assignment guidance</h2>{w.instructions && <p>{w.instructions}</p>}{w.dialect && <p>Dialect: {w.dialect}</p>}{w.tone && <p>Tone: {w.tone}</p>}{w.deadline && <p>Deadline: {w.deadline}</p>}{w.helpContact && <p>Need help? {w.helpContact}</p>}</aside>)}
          <ContributionWorkspace accountId={user.uid} key={user.uid + params.work} items={items} work={params.work} onPending={setPending} />
        </>}
    </main></div>;
}

function ContributorActivation() {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form className="contributor-auth" onSubmit={async e => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const email = auth.currentUser?.email;
      await httpsCallable(functions, 'activateExpressionContributor')({ password });
      if (email) await signInWithEmailAndPassword(auth, email, password);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to activate. Please retry.'); }
    finally { setBusy(false); }
  }}><h2>Activate your account</h2><p>Choose your own password to finish activation and open your assignments. If you signed in with your phone number, replace it here.</p>
    <label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
    <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Activating…' : 'Activate and open assignments'}</button>
  </form>;
}

function ContributorSignIn({ code }: { code: string | null }) {
  const { path, navigate } = useRoute();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { if (code) void verifyPasswordResetCode(auth, code).then(setEmail).catch(() => setError('This activation link has expired or was already used. Sign in with your password, or request a fresh invitation.')); }, [code]);
  return <form className="contributor-auth" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (reset) {
        await sendPasswordResetEmail(auth, email.trim(), { url: window.location.origin + '/contributor' });
        setNotice('If this email has an account, a password reset link is on its way. Check your inbox and spam folder.');
        return;
      }
      if (code) await confirmPasswordReset(auth, code, password);
      await signInWithEmailAndPassword(auth, email, password);
      navigate(path, { replace: true });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }}><h2>{code ? 'Set your password' : reset ? 'Reset your password' : 'Welcome back'}</h2>
    <p>New account? Sign in with your invited email and your phone number as the temporary password, including the country code (for example +233241234567). If you already had an Indigen World account, use your existing password. After activation, use the password you chose.</p>
    <label>Email<input type="email" autoComplete="username" required value={email} readOnly={Boolean(code)} onChange={e => setEmail(e.target.value)} /></label>
    {!reset && <label>{code ? 'Set a password' : 'Password (phone number for first sign-in)'}<input type="password" minLength={code ? 8 : undefined} required autoComplete={code ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}<button type="submit" disabled={busy || !email}>{busy ? 'Please wait…' : reset ? 'Send reset link' : code ? 'Save password and sign in' : 'Sign in'}</button>
    {!code && <button type="button" disabled={busy} onClick={() => { setReset(!reset); setError(''); setNotice(''); }}>{reset ? 'Back to sign in' : 'Forgot password?'}</button>}
    {code && <button type="button" onClick={() => navigate(path, { replace: true })}>Already activated? Sign in</button>}
  </form>;
}

export function readLocalDraft(key: string): { translation: string; alternatives: string; revision: number } | null {
  if (!key) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return value && typeof value.translation === 'string' && value.translation.length <= 2000
      && typeof value.alternatives === 'string' && value.alternatives.length <= 3500
      && Number.isInteger(value.revision) ? value : null;
  } catch { return null; }
}

type SaveAnswer = (data: Record<string, unknown>) => Promise<{ data: { revision: number; submissionId?: string } }>;
export function contributionState(item: Item) {
  if (item.unsure) return 'I’m not sure';
  if (['needs_revision', 'rejected'].includes(item.status)) return 'Needs revision';
  if (item.submissionId) return 'Submitted';
  return item.translation.trim() || item.alternatives?.some(v => v.trim()) ? 'Drafts' : 'Not started';
}
export function ContributionWorkspace({ items, work, onPending, accountId, saveAnswer = save }: {
  items: Item[]; work: string; accountId?: string; onPending: (pending: boolean) => void; saveAnswer?: SaveAnswer;
}) {
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const visible = items.filter(i => (filter === 'All' || contributionState(i) === filter) &&
    [i.expression, i.translation, ...i.alternatives].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const item = items.find(i => i.id === selected) ?? visible[0];
  const submitted = items.filter(i => Boolean(i.submissionId)).length;
  return <>
    <section className="contributor-progress" aria-label="Assignment progress">
      <strong>{submitted} of {items.length} submitted</strong>
      <progress aria-label="Expressions submitted" value={submitted} max={items.length || 1} />
      <p>{items.filter(i => contributionState(i) === 'Drafts').length} saved drafts · {items.filter(i => i.unsure).length} unsure · {items.filter(i => contributionState(i) === 'Not started').length} not started · {items.filter(i => contributionState(i) === 'Needs revision').length} need revision</p>
    </section>
    {confirmation && <p className="contributor-confirmation" role="status">{confirmation}</p>}
    <div className={'contributor-workspace' + (mobileEditor ? ' is-editing' : '')}>
      <section className="contributor-expression-list" aria-label="Find expressions">
        <label>Search expressions<input type="search" value={query} disabled={pending} onChange={e => { setQuery(e.target.value); setSelected(''); }} placeholder="Search English or Kasem" /></label>
        <nav aria-label="Expression filters">{['All', 'Not started', 'Drafts', 'Submitted', 'Needs revision', 'I’m not sure'].map(label => <button key={label} disabled={pending} aria-pressed={filter === label} onClick={() => { setFilter(label); setSelected(''); }}>{label}</button>)}</nav>
        <aside aria-label="Expressions">{visible.map(i => <button key={i.id} disabled={pending} aria-current={item?.id === i.id ? 'true' : undefined} onClick={() => { setSelected(i.id); setMobileEditor(true); }}><span>{i.expression}</span><small>{contributionState(i) === 'Drafts' ? 'Draft saved' : contributionState(i)}{i.status === 'verified' ? ' · Verified' : ''}{accountId && readLocalDraft(`contributor-draft:${accountId}:${work}:${i.id}`) ? ' · Recovery copy on this device' : ''}</small></button>)}
          {!visible.length && <p>No expressions match. Try another search or filter.</p>}</aside>
      </section>
      <div className="contributor-editor-pane"><button className="contributor-back" disabled={pending} onClick={() => setMobileEditor(false)}>← Back to expressions</button>
        {item ? <ExpressionEditor accountId={accountId} key={item.id} item={item} work={work} saveAnswer={saveAnswer} onPending={value => { setPending(value); onPending(value); if (value) setSelected(item.id); }} onSkipped={() => {
          const index = items.findIndex(i => i.id === item.id);
          const remaining = [...items.slice(index + 1), ...items.slice(0, index)].find(i => contributionState(i) === 'Not started');
          setConfirmation('“' + item.expression + '” was flagged as unsure. No answer was submitted.' + (!remaining ? ' No new expressions remain. You can return to flagged expressions at any time.' : ''));
          if (remaining) { setFilter('All'); setQuery(''); setSelected(remaining.id); }
          else setMobileEditor(false);
        }} onSubmitted={next => {
          const index = items.findIndex(i => i.id === item.id);
          const remaining = [...items.slice(index + 1), ...items.slice(0, index)].find(i => contributionState(i) === 'Not started');
          setConfirmation('“' + item.expression + '” was sent to the Review Desk.' + (next && !remaining ? ' No untranslated expressions remain. Check Drafts for unfinished work.' : ''));
          if (next && remaining) { setFilter('All'); setQuery(''); setSelected(remaining.id); }
        }} /> : <p>Select an expression to begin.</p>}
      </div>
    </div>
  </>;
}

function ExpressionEditor({ item, work, onPending, onSubmitted, onSkipped, accountId, saveAnswer = save }: { item: Item; work: string; accountId?: string; onPending: (pending: boolean) => void; onSubmitted?: (next: boolean) => void; onSkipped?: () => void; saveAnswer?: SaveAnswer }) {
  const [translation, setTranslation] = useState(item.translation), [alternatives, setAlternatives] = useState(item.alternatives.join('\n'));
  const [publication, setPublication] = useState(false), [training, setTraining] = useState(false);
  const [status, setStatus] = useState('Saved'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const revision = useRef(item.revision), chain = useRef(Promise.resolve()), dirty = useRef(false), blocked = useRef(false);
  const payload = useRef({ translation, alternatives }); payload.current = { translation, alternatives };
  const submitting = useRef(false);
  const activeField = useRef<HTMLTextAreaElement | null>(null);
  const [sent, setSent] = useState(false);
  const revising = ['rejected', 'needs_revision'].includes(item.status);
  useEffect(() => { if (['rejected', 'needs_revision'].includes(item.status)) setSent(false); }, [item.status]);
  const locked = (Boolean(item.submissionId) && !revising) || sent;
  const storageKey = accountId ? `contributor-draft:${accountId}:${work}:${item.id}` : '';
  const [recovery, setRecovery] = useState(() => readLocalDraft(storageKey));
  const [storageError, setStorageError] = useState('');
  const keepLocal = (answer: { translation: string; alternatives: string }) => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ...answer, revision: revision.current })); setStorageError(''); }
    catch { setStorageError('This browser cannot keep a recovery copy. Keep this page open until Saved appears.'); }
  };
  const changeAnswer = (field: 'translation' | 'alternatives', value: string) => {
    payload.current = { ...payload.current, [field]: value };
    keepLocal(payload.current); dirty.current = true; onPending(true);
    setStatus(blocked.current ? 'Couldn’t save' : 'Saving…');
    if (field === 'translation') setTranslation(value); else setAlternatives(value);
  };
  const persist = (submit = false, skip = false) => {
    const answer = { ...payload.current };
    chain.current = chain.current.then(async () => {
      if (blocked.current) throw new Error('Reload to recover this draft before continuing.');
      const result = await saveAnswer({ work, item: item.id, revision: revision.current, translation: answer.translation,
        alternatives: answer.alternatives.split('\n').filter(v => v.trim()), submit, skip, publicationPermission: publication, aiTraining: training });
      revision.current = result.data.revision;
      if (payload.current.translation === answer.translation && payload.current.alternatives === answer.alternatives) dirty.current = false;
      if (dirty.current) keepLocal(payload.current);
      else { try { if (storageKey) window.localStorage.removeItem(storageKey); } catch { /* Keep the acknowledged server copy. */ } }
      onPending(dirty.current || submitting.current);
      setStatus(submit ? 'Sent to the Review Desk' : skip ? 'Flagged as unsure — not submitted' : dirty.current ? 'Saving…' : 'Saved');
    }).catch(e => { blocked.current = true; setError(e.message); setStatus('Couldn’t save'); throw e; });
    return chain.current;
  };
  useEffect(() => {
    if (!dirty.current || locked || busy || recovery || blocked.current) return;
    setStatus('Saving…');
    const timer = window.setTimeout(() => { void persist().catch(() => undefined); }, 700);
    return () => window.clearTimeout(timer);
  }, [translation, alternatives, locked, busy, recovery]);
  useEffect(() => {
    const guard = (e: Event) => { if (dirty.current) { e.preventDefault(); if (e instanceof BeforeUnloadEvent) e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); window.addEventListener('studio:before-navigate', guard);
    return () => { window.removeEventListener('beforeunload', guard); window.removeEventListener('studio:before-navigate', guard);
      // Changes are copied to browser storage synchronously while typing.
    };
  }, []);
  return <form className="contributor-editor" onSubmit={async e => { e.preventDefault(); if (locked || recovery || blocked.current) return; submitting.current = true; setBusy(true); onPending(true);
    try { await persist(true); setSent(true); onSubmitted?.((e.nativeEvent as SubmitEvent | undefined)?.submitter?.getAttribute('value') === 'next'); } catch { /* Error is retained beside the draft. */ } finally { submitting.current = false; setBusy(false); onPending(dirty.current); }
  }}><span className="contributor-kicker">EXPRESSION · KASEM</span>
    <label>Expression<textarea readOnly value={item.expression} /></label>
    {item.feedback && <section className="contributor-feedback"><strong>Reviewer feedback</strong><p>{item.feedback}</p>{revising && <small>Update your translation below, then resubmit it for review.</small>}</section>}
    {recovery && <section className="contributor-feedback"><strong>Unsaved draft found on this device</strong><p>{recovery.revision !== item.revision ? 'The saved version has changed since this copy was made. Compare both before restoring.' : 'Your previous edits can be recovered.'}</p><pre className="contributor-recovery-text">{recovery.translation}{recovery.alternatives ? '\nAlternatives:\n' + recovery.alternatives : ''}</pre>
      {!locked && <button type="button" onClick={() => { revision.current = item.revision; changeAnswer('translation', recovery.translation); changeAnswer('alternatives', recovery.alternatives); setRecovery(null); }}>Restore draft</button>}
      <button type="button" onClick={() => { try { window.localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ } setRecovery(null); }}>Discard recovery copy</button></section>}
    {storageError && <p role="alert">{storageError}</p>}
    <p>Translate the meaning naturally in Kasem. Alternatives are other Kasem ways to express the same meaning, not explanations or English translations.</p>
    <p role="status" aria-live="polite">{locked ? 'Submitted' : status}</p>
    {!locked && <div className="contributor-characters" role="group" aria-label="Kasem characters"><small>Insert a Kasem letter</small>{Array.from('ɛƐɩƖŋŊɔƆʋƲəƏ').map(char => <button type="button" key={char} disabled={busy || Boolean(recovery)} onMouseDown={e => e.preventDefault()} onClick={() => {
      const field = activeField.current;
      if (!field) return;
      const start = field.selectionStart, end = field.selectionEnd;
      const value = field.value.slice(0, start) + char + field.value.slice(end);
      if (value.length > field.maxLength) return;
      changeAnswer(field.name === 'alternatives' ? 'alternatives' : 'translation', value);
      window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + char.length, start + char.length); });
    }}>{char}</button>)}</div>}
    <label>How to say it in Kasem<textarea ref={node => { if (node && !activeField.current) activeField.current = node; }} onFocus={e => { activeField.current = e.currentTarget; }} required maxLength={2000} disabled={locked || busy || Boolean(recovery)} value={translation} onChange={e => changeAnswer('translation', e.target.value)} /></label>
    <label>Other ways of saying it in Kasem<textarea name="alternatives" onFocus={e => { activeField.current = e.currentTarget; }} maxLength={3500} disabled={locked || busy || Boolean(recovery)} value={alternatives} placeholder="One alternative per line (optional; up to 12, 500 characters each)" onChange={e => changeAnswer('alternatives', e.target.value)} /></label>
    {!locked && <><label className="contributor-check"><input type="checkbox" required checked={publication} onChange={e => setPublication(e.target.checked)} />I have permission to share this expression for review and dictionary publication.</label>
      <label className="contributor-check"><input type="checkbox" checked={training} onChange={e => setTraining(e.target.checked)} />Also allow approved translations to be used for Kawuri AI training (optional).</label>
      {error && <div role="alert"><p>Your text is still here. Check your connection and retry. {error} If another device changed this draft, copy your text before reloading.</p>
        <button type="button" onClick={() => { blocked.current = false; chain.current = Promise.resolve(); setError('');
          setStatus('Saving…'); void persist().catch(() => undefined); }}>Retry save</button></div>}
      <p>Unsure? Skip saves your draft privately and flags this expression without submitting it.</p>
      <button type="button" disabled={busy || Boolean(recovery) || blocked.current} onClick={async () => {
        submitting.current = true; setBusy(true); onPending(true);
        try { await persist(false, true); onSkipped?.(); }
        catch { /* Keep the expression open for retry. */ }
        finally { submitting.current = false; setBusy(false); onPending(dirty.current); }
      }}>Skip / I’m not sure →</button>
      <div className="contributor-submit-actions"><button disabled={busy || Boolean(recovery) || blocked.current || !translation.trim() || !publication}>{busy ? 'Submitting…' : revising ? 'Resubmit to Review Desk' : 'Submit to Review Desk'}</button><button value="next" disabled={busy || Boolean(recovery) || blocked.current || !translation.trim() || !publication}>{revising ? 'Resubmit and next →' : 'Submit and next →'}</button></div></>}
    {locked && <p role="status">{item.status === 'verified' ? 'Verified by the Review Desk' : `Review status: ${item.status}`}</p>}
  </form>;
}
