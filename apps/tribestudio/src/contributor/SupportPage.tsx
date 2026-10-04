import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icons';

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
  return <section className="ts-auth__form cw-support" aria-labelledby="auth-title">
    <div className="ts-auth__head">
      <h1 id="auth-title" className="ts-auth__title">Let’s get you unstuck</h1>
      <p className="ts-auth__lede">Help with your account and your work. You do not need to sign in.</p>
    </div>
    <p className="ts-notice ts-notice--warning"><Icon name="lock" className="ts-notice__icon" /><span>Keep passwords, reset links, verification codes and payment details out of messages.</span></p>
    {error && <p role="alert" className="ts-notice ts-notice--danger">{error}</p>}
    {notice && <p role="status" className="ts-notice ts-notice--success">{notice}</p>}
    {!access ? <form className="ts-stack ts-stack--md" onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
      try {
        const key = creationKey.current;
        const result = await request<{ id: string }>({ action: 'create', key, category, name: form.get('name'), email: form.get('email'), description: form.get('description'), website: form.get('website'), consent: form.get('consent') === 'on' });
        window.history.replaceState({}, '', `${window.location.pathname}#case=${result.id}&key=${key}`);
        setAccess({ id: result.id, key });
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Please retry.'); }
      finally { setBusy(false); }
    }}>
      <label className="ts-field"><span className="ts-label">What do you need help with?</span><select className="ts-select" value={category} onChange={e => setCategory(e.target.value)}>{categories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div className="cw-form-grid">
        <label className="ts-field"><span className="ts-label">Your name</span><input className="ts-input" name="name" autoComplete="name" required maxLength={100} /></label>
        <label className="ts-field"><span className="ts-label">Email from your invitation</span><input className="ts-input" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      </div>
      <label className="ts-field"><span className="ts-label">What happened?</span><textarea className="ts-textarea" name="description" required minLength={8} maxLength={2000} rows={3} placeholder="Tell us what you tried and the error you saw." /></label>
      <label className="cw-support__trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="ts-check ts-check--card"><input type="checkbox" name="consent" required /><span className="ts-check__copy"><strong>Contact me about this case</strong><small>I agree to the team using these details to help with this case and contact me by email.</small></span></label>
      <button className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" disabled={busy} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><span>{busy ? 'Opening your case…' : 'Get help'}</span></button>
      <small className="ts-hint">Your messages are stored for the support team. Read our <a href="https://indigenworld.com/privacy" target="_blank" rel="noreferrer">privacy policy</a>.</small>
    </form> : <>
      <div className="cw-support__case"><span className="ts-card__icon" aria-hidden="true"><Icon name="inbox" /></span><span><strong>{ticket?.reference || 'Your case'}</strong><small>{ticket?.status.replaceAll('_', ' ') || 'Loading…'}</small></span></div>
      <p className="ts-hint"><strong>Keep this page’s private link.</strong> Bookmark it to return to your case. Anyone with this link can read and reply, so keep it private.</p>
      <div className="ts-cluster"><button type="button" className="ts-btn ts-btn--sm" disabled={busy} onClick={() => { setError(''); void refresh().catch(() => setError('Could not refresh. Please retry.')); }}><Icon name="refresh" />Refresh replies</button><button type="button" className="ts-btn ts-btn--sm" disabled={busy} onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setNotice('Private link copied. Keep it somewhere safe.')).catch(() => setNotice('Copy the address from your browser and keep it private.'))}><Icon name="copy" />Copy private link</button></div>
      <div className="cw-support__messages" aria-label="Case messages">{ticket?.messages.map(message => <article key={message.id} className={`cw-support__message cw-support__message--${message.author}`}><header><strong>{message.author === 'member' ? 'You' : message.author === 'assistant' ? 'Automatic guidance' : 'Support team'}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></header><p>{message.text}</p></article>)}</div>
      {ticket && <>
        {ticket.status !== 'resolved' && <div className="ts-cluster"><button type="button" className="ts-btn ts-btn--sm" disabled={busy} onClick={() => void act('reset')}><Icon name="key" />Request password-reset email</button><button type="button" className="ts-btn ts-btn--sm" disabled={busy || ticket.humanRequested} onClick={() => void act('human')}><Icon name="users" />{ticket.humanRequested ? 'Waiting for the team' : 'Ask a person'}</button><button type="button" className="ts-btn ts-btn--sm" disabled={busy} onClick={() => void act('resolve')}><Icon name="check" />My problem is solved</button></div>}
        <form className="ts-stack ts-stack--md" onSubmit={event => { event.preventDefault(); void act('reply', reply); }}><label className="ts-field"><span className="ts-label">{ticket.status === 'resolved' ? 'Still need help? Reply to reopen this case.' : 'Reply to the team'}</span><textarea className="ts-textarea" value={reply} onChange={e => setReply(e.target.value)} required minLength={2} maxLength={2000} rows={3} /></label><button className="ts-btn ts-btn--primary ts-btn--block" disabled={busy} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><span>{busy ? 'Saving…' : 'Send reply'}</span></button></form>
      </>}
    </>}
    <footer className="ts-cluster cw-support__foot"><a href="/contributor" className="ts-link"><Icon name="back" />Back to sign in</a><a href="mailto:hi@indigenworld.com" className="ts-link">Email support</a>{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="ts-link">WhatsApp support</a>}</footer>
  </section>;
}
