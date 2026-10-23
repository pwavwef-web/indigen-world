import { useEffect, useState, type ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth';
import { functions } from '../firebase';
import { portalMessage } from './portal-data';
/** Uses the existing server-owned MFA flow; never creates a client-side bypass. */
export function ReviewVerification({ children }: { children: ReactNode }) {
  const { user } = useAuth(), [verified, setVerified] = useState(false), [enrolled, setEnrolled] = useState(true);
  const [code, setCode] = useState(''), [recovery, setRecovery] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(true), [attempt, setAttempt] = useState(0);
  const call = async (action: string, data: Record<string, unknown> = {}) => (await httpsCallable(functions, 'staffMfa')({ action, ...data })).data as { verified: boolean; enrolled: boolean };
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    call('status').then(async status => { if (!active) return; if (status.verified) await user?.getIdToken(true); if (active) { setVerified(status.verified); setEnrolled(status.enrolled); } }).catch(e => { if (active) setError(portalMessage(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [user?.uid, attempt]);
  if (verified) return <>{children}</>;
  return <section className="pw-card"><h2>Verify this review sign-in</h2><p>Private material and administrative exports require the existing two-step verification. No review data is loaded before verification.</p>{!enrolled ? <p>Set up your authenticator in the <a href="https://admin.indigenworld.com" target="_blank" rel="noreferrer">Administration console</a>, then return here to verify this sign-in.</p> : null}<form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await call('verify', recovery ? { recoveryCode: code } : { code }); await user?.getIdToken(true); setCode(''); setVerified(true); } catch (reason) { setError(portalMessage(reason)); } finally { setBusy(false); } }}><label className="pw-field"><span>{recovery ? 'Recovery code' : 'Authenticator code'}</span><input autoComplete={recovery ? 'off' : 'one-time-code'} value={code} onChange={e => setCode(e.target.value)} maxLength={recovery ? 20 : 6} /></label><div className="pw-actions"><button type="submit" disabled={busy || !code} className="ts-btn ts-btn--primary">Verify sign-in</button><button type="button" className="ts-btn ts-btn--secondary" onClick={() => { setRecovery(v => !v); setCode(''); }}>{recovery ? 'Use authenticator' : 'Use recovery code'}</button><button type="button" className="ts-link" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Check again</button></div></form>{busy ? <p role="status">Checking verification…</p> : null}{error ? <p role="alert">{error}</p> : null}</section>;
}
