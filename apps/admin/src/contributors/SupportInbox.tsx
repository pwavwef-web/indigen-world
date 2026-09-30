import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
type Case = { id: string; reference: string; name?: string; email?: string; phone?: string; category: string; channel: string; status: string; assignedTo?: string; updatedAt: string; needsAttention?: boolean; deliveryProblem?: string };
type Message = { id: string; author: string; text: string; createdAt: string; delivery?: string };
type Details = { messages: Message[]; account: { disabled: boolean; emailVerified: boolean; invited: boolean; status: string; activationPending: boolean; lastSignIn: string } | null };
const list = httpsCallable<{}, { cases: Case[]; whatsapp: { enabled: boolean; number: string } }>(functions, 'listSupportCases');
const get = httpsCallable<{ id: string }, Details>(functions, 'getSupportCase');
const update = httpsCallable(functions, 'updateSupportCase');
export function SupportInbox() {
  const [cases, setCases] = useState<Case[]>([]), [selected, setSelected] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [whatsapp, setWhatsapp] = useState('');
  const [filter, setFilter] = useState('active');
  async function refresh() {
    setBusy(true); setError('');
    try { const { data } = await list({}); setCases(data.cases); setWhatsapp(data.whatsapp.enabled ? `WhatsApp connected: ${data.whatsapp.number}` : 'WhatsApp is awaiting setup. Website cases are handled in this inbox.'); }
    catch { setError('Support cases could not be loaded. Retry.'); } finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const active = cases.find(item => item.id === selected);
  return <section className="contributor-issue"><h2>Support inbox</h2><p>Help requested before sign-in, plus connected WhatsApp conversations. Latest 100 cases. Close only after resolution is confirmed.</p><p>{whatsapp}</p>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><button disabled={busy} onClick={() => void refresh()}>Refresh support</button><label>Show <select value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Open cases</option><option value="all">All recent cases</option></select></label></div>
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 24, marginTop: 20 }}>
      <div>{cases.filter(item => filter === 'all' || item.status !== 'resolved').map(item => <button key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} style={{ display: 'block', textAlign: 'left', width: '100%', marginBottom: 10, padding: 14 }}><strong>{item.reference} · {item.category.replaceAll('_', ' ')}</strong><br />{item.name || item.phone || 'Contributor'} · {item.status.replaceAll('_', ' ')}<br /><small>{item.channel} · {new Date(item.updatedAt).toLocaleString()}{item.needsAttention ? ' · Delivery needs attention' : ''}</small></button>)}{!busy && !error && !cases.some(item => filter === 'all' || item.status !== 'resolved') && <p>No cases in this view.</p>}</div>
      {active ? <SupportCase key={active.id} item={active} reload={refresh} /> : <p>Select a case to read messages and reply.</p>}
    </div>
  </section>;
}
function SupportCase({ item, reload }: { item: Case; reload: () => Promise<void> }) {
  const [details, setDetails] = useState<Details | null>(null), [status, setStatus] = useState(item.status), [reply, setReply] = useState(''), [resolution, setResolution] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [assign, setAssign] = useState(false);
  const requestId = useRef<{ fingerprint: string; id: string } | null>(null);
  async function refresh() { setDetails((await get({ id: item.id })).data); }
  useEffect(() => { let alive = true; void get({ id: item.id }).then(result => { if (alive) setDetails(result.data); }).catch(() => { if (alive) setError('Could not load conversation.'); }); return () => { alive = false; }; }, [item.id, item.updatedAt]);
  return <article><h3>{item.reference}</h3><p>{item.email || item.phone} · {item.channel}</p><p><strong>Identity is unverified.</strong> A matching email does not prove the requester owns the account. Never send reset links, passwords, private account information or payment details here.</p>
    {item.assignedTo && <p>Assigned to: {item.assignedTo}</p>}{item.deliveryProblem && <p role="status">Delivery: {item.deliveryProblem.replaceAll('_', ' ')}</p>}
    {details?.account && <details><summary>Private account checks — team only</summary><p>Invitation: {details.account.invited ? details.account.status : 'None'} · Account: {details.account.disabled ? 'Disabled' : 'Enabled'} · Activation: {details.account.activationPending ? 'Pending' : 'Not pending'}</p><p>Last sign-in: {details.account.lastSignIn || 'No recorded sign-in'} · Email verified: {details.account.emailVerified ? 'Yes' : 'No'}</p></details>}
    {details?.messages.map(message => <blockquote key={message.id} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>{message.author}</strong><p>{message.text}</p><small>{new Date(message.createdAt).toLocaleString()}{message.delivery ? ` · ${message.delivery} (accepted means queued by provider, not confirmed delivery)` : ''}</small></blockquote>)}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <form style={{ display: 'grid', gap: 12 }} onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setNotice('');
      const fingerprint = JSON.stringify([status, reply, resolution, assign]);
      if (requestId.current?.fingerprint !== fingerprint) requestId.current = { fingerprint, id: crypto.randomUUID() };
      try { await update({ id: item.id, requestId: requestId.current.id, status, reply, resolution, assignToMe: assign }); requestId.current = null; setReply(''); setNotice('Saved. Check delivery status after refreshing.'); await reload(); await refresh(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Update could not be confirmed. Retry the same action.'); }
      finally { setBusy(false); }
    }}>
      <label>Status<select disabled={busy} value={status} onChange={e => setStatus(e.target.value)}>{['open', 'in_progress', 'awaiting_member', 'resolved'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label><input type="checkbox" checked={assign} onChange={e => setAssign(e.target.checked)} /> Assign to me</label>
      {status === 'resolved' && <label>How was resolution confirmed?<input required minLength={8} maxLength={300} value={resolution} onChange={e => setResolution(e.target.value)} /></label>}
      <label>Reply<textarea disabled={busy} rows={4} maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} /></label>
      <button disabled={busy || !details}>{busy ? 'Saving…' : reply.trim() ? 'Save and send reply' : 'Save case'}</button>
    </form>
  </article>;
}
