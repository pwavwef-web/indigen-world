import { useEffect, useRef, useState } from 'react';
import './support.css';

type Access = { id: string; key: string };
type Ticket = { reference: string; status: string; humanRequested: boolean; messages: { id: string; author: string; text: string; createdAt: string }[] };
const categories = [['login', 'I cannot sign in'], ['reset_email', 'My reset email has not arrived'], ['activation', 'I cannot activate my account'], ['assignment', 'My assignment is missing'], ['saving', 'My work will not save'], ['payment', 'Payment help'], ['other', 'Something else']];
const endpoint = import.meta.env.VITE_USE_EMULATORS === 'true' ? 'http://127.0.0.1:5001/demo-indigen-world/us-central1/supportPortal' : '/api/support';
function privateAccess(): Access | null {
  const value = new URLSearchParams(window.location.hash.slice(1));
  const id = value.get('case') || '', key = value.get('key') || '';
  return /^[a-f0-9]{32}$/.test(id) && /^[a-f0-9]{64}$/.test(key) ? { id, key } : null;
}
async function request<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'We could not save this request. Please try again.');
  return data as T;
}
export function SupportPage() {
  const [access, setAccess] = useState(privateAccess), [ticket, setTicket] = useState<Ticket | null>(null);
  const [category, setCategory] = useState('login'), [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  // A retry keeps the same key/request id, including when the response was lost.
  const creationKey = useRef(Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''));
  const pending = useRef<{ fingerprint: string; id: string } | null>(null);
  async function refresh(current = access) {
    if (current) setTicket(await request<Ticket>({ action: 'get', ...current }));
  }
  useEffect(() => { void request<{ whatsappUrl: string | null }>({ action: 'config' }).then(data => setWhatsapp(data.whatsappUrl)).catch(() => {}); }, []);
  useEffect(() => { if (access) void refresh(access).catch(() => setError('This case could not be opened. Check your connection and retry, or email the team.')); }, [access?.id]);
  async function act(action: string, text = '') {
    if (!access) return;
    setBusy(true); setError(''); setNotice('');
    const fingerprint = JSON.stringify([action, text]);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const result = await request<{ notice?: string }>({ action, ...access, text, requestId: pending.current.id });
      pending.current = null;
      if (action === 'reply') setReply('');
      setNotice(result.notice || (action === 'human' ? 'Your case is with the team. You can return to this private link for replies.' : 'Saved.'));
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Please retry.'); }
    finally { setBusy(false); }
  }
  return <section className="iw-support contributor-auth" aria-labelledby="support-title">
    <span className="cw-kicker">CONTRIBUTOR SUPPORT</span>
    <h1 id="support-title">Let’s get you unstuck.</h1>
    <p>Help with your account and your work. You do not need to sign in.</p>
    <p className="iw-support__privacy">Keep passwords, reset links, verification codes and payment details out of messages.</p>
    {error && <p role="alert" className="cw-auth__error">{error}</p>}
    {notice && <p role="status" className="iw-support__notice">{notice}</p>}
    {!access ? <form onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
      try {
        const key = creationKey.current;
        const result = await request<{ id: string }>({ action: 'create', key, category, name: form.get('name'), email: form.get('email'), description: form.get('description'), website: form.get('website'), consent: form.get('consent') === 'on' });
        window.history.replaceState({}, '', `${window.location.pathname}#case=${result.id}&key=${key}`);
        setAccess({ id: result.id, key });
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Please retry.'); }
      finally { setBusy(false); }
    }}>
      <label>What do you need help with?<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Your name<input name="name" autoComplete="name" required maxLength={100} /></label>
      <label>Email from your invitation<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>What happened?<textarea name="description" required minLength={8} maxLength={2000} rows={3} placeholder="Tell us what you tried and the error you saw." /></label>
      <label className="iw-support__trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="iw-support__consent"><input type="checkbox" name="consent" required />I agree to the team using these details to help with this case and contact me by email.</label>
      <button className="cw-auth__primary" disabled={busy}>{busy ? 'Opening your case…' : 'Get help'}</button>
      <small>Your messages are stored for the support team. Read our <a href="https://indigenworld.com/privacy" target="_blank" rel="noreferrer">privacy policy</a>.</small>
    </form> : <>
      <div className="iw-support__case"><strong>{ticket?.reference || 'Your case'}</strong><span>{ticket?.status.replaceAll('_', ' ') || 'Loading…'}</span></div>
      <p><strong>Keep this page’s private link.</strong> Bookmark it to return to your case. Anyone with this link can read and reply, so keep it private.</p>
      <div className="iw-support__actions"><button disabled={busy} onClick={() => { setError(''); void refresh().catch(() => setError('Could not refresh. Please retry.')); }}>Refresh replies</button><button disabled={busy} onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setNotice('Private link copied. Keep it somewhere safe.')).catch(() => setNotice('Copy the address from your browser and keep it private.'))}>Copy private link</button></div>
      <div className="iw-support__messages" aria-label="Case messages">{ticket?.messages.map(message => <article key={message.id} className={`iw-support__message iw-support__message--${message.author}`}><header><strong>{message.author === 'member' ? 'You' : message.author === 'assistant' ? 'Automatic guidance' : 'Support team'}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></header><p>{message.text}</p></article>)}</div>
      {ticket && <>
        {ticket.status !== 'resolved' && <div className="iw-support__actions"><button disabled={busy} onClick={() => void act('reset')}>Request password-reset email</button><button disabled={busy || ticket.humanRequested} onClick={() => void act('human')}>{ticket.humanRequested ? 'Waiting for the team' : 'Ask a person'}</button><button disabled={busy} onClick={() => void act('resolve')}>My problem is solved</button></div>}
        <form onSubmit={event => { event.preventDefault(); void act('reply', reply); }}><label>{ticket.status === 'resolved' ? 'Still need help? Reply to reopen this case.' : 'Reply to the team'}<textarea value={reply} onChange={e => setReply(e.target.value)} required minLength={2} maxLength={2000} rows={3} /></label><button className="cw-auth__primary" disabled={busy}>{busy ? 'Saving…' : 'Send reply'}</button></form>
      </>}
    </>}
    <footer><a href="/contributor">Back to sign in</a><a href="mailto:hi@indigenworld.com">Email support</a>{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp support</a>}</footer>
  </section>;
}
