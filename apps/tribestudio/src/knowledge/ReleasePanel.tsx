import { useRef, useState } from 'react';
import { DESTINATIONS, type Destination } from '@indigen-world/contracts/knowledge';
import type { KnowledgeServices, RecordDetail } from './data';

export function ReleasePanel({ detail, services }: { detail: RecordDetail; services: KnowledgeServices }) {
  const [destination, setDestination] = useState<Destination>('venacula'), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const requests = useRef<Record<string, string>>({});
  const denied = detail.releaseChecks?.[destination] ?? ['Release checks are unavailable. Reopen this record.'];
  const act = async (revoke: boolean) => {
    setBusy(true); setNotice(''); setError('');
    try {
      if (revoke) { await services.revoke(detail.record.id, destination, reason); delete requests.current[destination]; setNotice('Future use through this release is blocked. Prior exports require follow-up.'); }
      else {
        requests.current[destination] ??= crypto.randomUUID();
        const result = await services.release(detail.record.id, detail.record.revision, destination, requests.current[destination]);
        if (!result.active) throw new Error('This earlier release was revoked or superseded. Reopen the record before a new release.');
        setNotice(`Release manifest confirmed for ${destination}, revision ${detail.record.revision}. Consumers recheck eligibility before access.`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'The release operation failed. Retry with this form.'); }
    finally { setBusy(false); }
  };
  return <section className="kw-readiness"><h3>Controlled release</h3><p>Authentication and use permission are checked again on the server. Releasing a phrase does not create a word entry.</p>
    <label className="kw-field"><span>Destination</span><select disabled={busy} value={destination} onChange={e => { setDestination(e.target.value as Destination); setNotice(''); setError(''); }}>{DESTINATIONS.map(d => <option key={d}>{d}</option>)}</select></label>
    {denied.length > 0 && <ul>{denied.map(message => <li key={message}>{message}</li>)}</ul>}
    <button type="button" disabled={busy || denied.length > 0} onClick={() => void act(false)}>Release exact revision</button>
    <label className="kw-field"><span>Revocation reason</span><textarea maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void act(true)}>Revoke destination release</button>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
