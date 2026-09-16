import { useEffect, useRef, useState } from 'react';
import { confirmPasswordReset, signInWithEmailAndPassword, verifyPasswordResetCode } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { signOutUser, useAuth } from '../auth';
import { matchRoute, useRoute } from '../router';
import './contributor.css';

type Item = { id: string; expression: string; translation: string; alternatives: string[];
  revision: number; status: string; submissionId?: string; feedback?: string; reviewedAt?: string | null };
type Work = { id: string; title: string; createdAt: string };
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
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('untranslated');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [access, setAccess] = useState<'loading' | 'active' | 'denied'>('loading');
  const [works, setWorks] = useState<Work[]>([]);
  const [worksLoaded, setWorksLoaded] = useState(false);
  const code = new URLSearchParams(search).get('oobCode');
  useEffect(() => {
    if (!user || code) return;
    return onSnapshot(doc(db, 'contributorAccounts', user.uid), account => {
      if (account.get('status') !== 'active') {
        setAccess('denied'); setItems([]); setWorks([]); return;
      }
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
  const visible = items.filter(i => expressionView(i) === tab);
  // Keep the current editor mounted when autosave moves its item to Translated.
  const item = items.find(i => i.id === selected) ?? visible[0];
  useEffect(() => { if (!selected && visible[0]) setSelected(visible[0].id); }, [selected, visible[0]?.id]);
  return <div className="contributor-portal"><header><div><span className="contributor-kicker">INDIGEN WORLD / CONTRIBUTORS</span>
    <h1>Everyday expressions. Living Kasem.</h1></div>{user && <button disabled={pending} onClick={() => void signOutUser()}>Sign out</button>}</header>
    <main id="main-content" tabIndex={-1}>
      {error && <p role="alert">{error} <button onClick={() => window.location.reload()}>Retry</button></p>}
      {!ready ? <p>Opening your portal…</p> : code || !user ? <ContributorSignIn code={code} />
        : params && user.uid !== params.uid ? <p role="alert">This invitation belongs to another account. Sign out and use the invited email address.</p>
        : access === 'denied' ? <p role="alert">This portal is available only to invited contributors. Contact the team for an invitation.</p>
        : error ? null : access !== 'active' || !params || !loaded || !worksLoaded ? <p>Loading your expressions…</p>
        : !works.some(w => w.id === params.work) ? <p role="alert">This assignment is not available to your account.</p> : <>
          <p className="contributor-identity">Contributor ID: <code>{user.uid}</code></p>
          <label className="contributor-assignment">Your assignment<select value={params.work} disabled={pending} onChange={e => navigate('/contributor/' + user.uid + '/' + e.target.value)}>
            {works.map(w => <option key={w.id} value={w.id}>{w.title} · {w.id.slice(0, 8)}</option>)}
          </select></label>
          <p>Translate the meaning as you would naturally say it. Expressions and idioms rarely translate word for word.</p>
          <div className="contributor-stats"><span><strong>{items.filter(i => expressionView(i) === 'untranslated').length}</strong> Untranslated</span>
            <span><strong>{items.filter(i => expressionView(i) === 'translated').length}</strong> Translated</span>
            <span><strong>{items.filter(i => expressionView(i) === 'reviewed').length}</strong> Reviewed / verified</span></div>
          <nav aria-label="Expression views">{[['untranslated', 'Untranslated'], ['translated', 'Translated'], ['reviewed', 'Reviewed / verified']].map(([key, label]) =>
            <button key={key} disabled={pending} aria-pressed={tab === key} onClick={() => { setTab(key); setSelected(''); }}>{label}</button>)}</nav>
          <div className="contributor-workspace"><aside aria-label="Expressions">{visible.map(i => <button key={i.id} disabled={pending}
            aria-current={item?.id === i.id ? 'true' : undefined} onClick={() => setSelected(i.id)}>
            <span>{i.expression}</span><small>{i.submissionId ? i.status : i.translation ? 'Draft saved' : 'Not started'}</small></button>)}
            {!visible.length && <p>{tab === 'untranslated' ? 'No untranslated expressions in this assignment.' : tab === 'translated' ? 'Your saved translations and submissions will appear here.' : 'Reviewed expressions will appear here.'}</p>}</aside>
            {item && <ExpressionEditor key={item.id} item={item} work={params.work} onPending={setPending} />}</div>
        </>}
    </main></div>;
}

function ContributorSignIn({ code }: { code: string | null }) {
  const { path, navigate } = useRoute();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (code) void verifyPasswordResetCode(auth, code).then(setEmail).catch(() => setError('This activation link has expired or was already used. Sign in with your password, or request a fresh invitation.')); }, [code]);
  return <form className="contributor-auth" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (code) await confirmPasswordReset(auth, code, password);
      await signInWithEmailAndPassword(auth, email, password);
      navigate(path, { replace: true });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }}><h2>{code ? 'Activate your contributor account' : 'Welcome back'}</h2>
    <p>Your assigned expressions and saved drafts are waiting here.</p>
    <label>Email<input type="email" autoComplete="username" required value={email} readOnly={Boolean(code)} onChange={e => setEmail(e.target.value)} /></label>
    <label>{code ? 'Set a password' : 'Password'}<input type="password" minLength={code ? 8 : undefined} required autoComplete={code ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}<button type="submit" disabled={busy || !email}>{busy ? 'Opening…' : code ? 'Activate and start translating' : 'Sign in'}</button>
    {code && <button type="button" onClick={() => navigate(path, { replace: true })}>Already activated? Sign in</button>}
  </form>;
}

function ExpressionEditor({ item, work, onPending }: { item: Item; work: string; onPending: (pending: boolean) => void }) {
  const [translation, setTranslation] = useState(item.translation), [alternatives, setAlternatives] = useState(item.alternatives.join('\n'));
  const [publication, setPublication] = useState(false), [training, setTraining] = useState(false);
  const [status, setStatus] = useState('All changes saved'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const revision = useRef(item.revision), chain = useRef(Promise.resolve()), dirty = useRef(false), blocked = useRef(false);
  const payload = useRef({ translation, alternatives }); payload.current = { translation, alternatives };
  const locked = Boolean(item.submissionId);
  const persist = (submit = false) => {
    const answer = { ...payload.current };
    chain.current = chain.current.then(async () => {
      if (blocked.current) throw new Error('Reload to recover this draft before continuing.');
      const result = await save({ work, item: item.id, revision: revision.current, translation: answer.translation,
        alternatives: answer.alternatives.split('\n').filter(v => v.trim()), submit, publicationPermission: publication, aiTraining: training });
      revision.current = result.data.revision;
      if (payload.current.translation === answer.translation && payload.current.alternatives === answer.alternatives) dirty.current = false;
      onPending(dirty.current);
      setStatus(submit ? 'Sent to the Review Desk' : dirty.current ? 'Saving…' : 'All changes saved');
    }).catch(e => { blocked.current = true; setError(e.message); setStatus('Not saved — keep this page open'); throw e; });
    return chain.current;
  };
  useEffect(() => {
    if (!dirty.current || locked || busy) return;
    setStatus('Saving…');
    const timer = window.setTimeout(() => { void persist().catch(() => undefined); }, 700);
    return () => window.clearTimeout(timer);
  }, [translation, alternatives, locked, busy]);
  useEffect(() => {
    const guard = (e: Event) => { if (dirty.current) { e.preventDefault(); if (e instanceof BeforeUnloadEvent) e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); window.addEventListener('studio:before-navigate', guard);
    return () => { window.removeEventListener('beforeunload', guard); window.removeEventListener('studio:before-navigate', guard);
      if (dirty.current && !blocked.current) void persist().catch(() => undefined); };
  }, []);
  return <form className="contributor-editor" onSubmit={async e => { e.preventDefault(); setBusy(true);
    try { await persist(true); } catch { /* Error is retained beside the draft. */ } finally { setBusy(false); }
  }}><span className="contributor-kicker">EXPRESSION · KASEM</span>
    <label>Expression<textarea readOnly value={item.expression} /></label>
    <label>How to say it in Kasem<textarea required maxLength={2000} disabled={locked || busy} value={translation} onChange={e => { dirty.current = true; onPending(true); setTranslation(e.target.value); }} /></label>
    <label>Other ways of saying it in Kasem<textarea maxLength={3500} disabled={locked || busy} value={alternatives} placeholder="One alternative per line (optional; up to 12, 500 characters each)" onChange={e => { dirty.current = true; onPending(true); setAlternatives(e.target.value); }} /></label>
    {item.feedback && <p><strong>Reviewer feedback:</strong> {item.feedback}</p>}
    {!locked && <><label className="contributor-check"><input type="checkbox" required checked={publication} onChange={e => setPublication(e.target.checked)} />I have permission to share this expression for review and dictionary publication.</label>
      <label className="contributor-check"><input type="checkbox" checked={training} onChange={e => setTraining(e.target.checked)} />Also allow approved translations to be used for Kauri AI training (optional).</label>
      <p role="status">{status}</p>{error && <div role="alert"><p>{error} Copy your text before reloading if another device changed the draft.</p>
        <button type="button" onClick={() => { blocked.current = false; chain.current = Promise.resolve(); setError('');
          setStatus('Saving…'); void persist().catch(() => undefined); }}>Retry save</button></div>}
      <button disabled={busy || blocked.current || !translation.trim() || !publication}>{busy ? 'Submitting…' : 'Submit to Review Desk'}</button></>}
    {locked && <p role="status">{item.status === 'verified' ? 'Verified by the Review Desk' : `Review status: ${item.status}`}</p>}
  </form>;
}
