import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

type Issue = { id: string; category: string; description: string; status: string; work: string; item: string; createdAt: string; replies: { text: string; createdAt: string }[] };
const report = httpsCallable<Record<string, string>, { id: string }>(functions, 'reportContributorIssue');
const list = httpsCallable<Record<string, never>, { issues: Issue[] }>(functions, 'getContributorIssues');

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'translation', label: 'A translation question' },
  { id: 'assignment', label: 'The assignment itself' },
  { id: 'saving', label: 'Saving or submitting' },
  { id: 'account', label: 'My account or payment details' },
  { id: 'other', label: 'Something else' },
];

/**
 * "Report a problem": a short form in a dialog, and the contributor's own
 * reports with the team's replies. Only the assignment and expression ids and
 * what the contributor writes are sent (see reportContributorIssue).
 */
export function ContributorIssues({ work, item, preview = false, disabled = false }: { work: string; item?: string; preview?: boolean; disabled?: boolean }) {
  const [mode, setMode] = useState<'report' | 'history'>('report');
  const dialog = useRef<HTMLDialogElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [category, setCategory] = useState('translation');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const refresh = async () => {
    if (preview) return;
    setBusy(true); setError('');
    try { setIssues((await list({})).data.issues); } catch { setError('Your reports could not be loaded. Try again in a moment.'); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className="cw-report-button" disabled={disabled} onClick={() => { setMode('report'); setNotice(''); setError(''); dialog.current?.showModal(); }}>Report a problem</button>
      <dialog ref={dialog} className="cw-dialog" aria-labelledby="report-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <div className="cw-dialog__head">
          <h2 id="report-title">{mode === 'report' ? 'Report a problem' : 'My reports'}</h2>
          <button type="button" className="cw-icon-button" disabled={busy} onClick={() => dialog.current?.close()} aria-label="Close">×</button>
        </div>
        {mode === 'report' ? <p className="cw-dialog__lede">The team sees which assignment{item ? ' and expression' : ''} this is about, and what you write below. Never include bank details, passwords or codes.</p> : null}
        {preview ? <p className="cw-muted">Preview only — reports stay in this sample session and are not sent.</p> : null}
        {error ? <p role="alert" className="cw-inline-alert">{error}</p> : null}
        {notice ? <p role="status" className="cw-confirmation">{notice}</p> : null}
        {mode === 'report' ? (
          <form className="cw-form" onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true); setError(''); setNotice('');
            try {
              const data = { category, description, work, item: item ?? '', requestId: requestId.current };
              const id = preview ? `DEMO-${Date.now()}` : (await report(data)).data.id;
              if (preview) setIssues((current) => [{ ...data, id, status: 'open', createdAt: new Date().toISOString(), replies: [] }, ...current]);
              setMode('history'); setNotice(`Report sent. Reference: ${id}`); setDescription(''); requestId.current = crypto.randomUUID();
              if (!preview) {
                try { setIssues((await list({})).data.issues); } catch { setError('Your report was sent. Refresh to see the updated list.'); }
              }
            } catch {
              setError('We could not confirm your report was sent. Your text is still here; try again and it will not be duplicated.');
            } finally { setBusy(false); }
          }}>
            <label className="cw-field">
              <span className="cw-field-label">What is it about?</span>
              <select disabled={busy} value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </label>
            <label className="cw-field">
              <span className="cw-field-label">What happened?</span>
              <textarea required minLength={1} maxLength={2000} rows={5} disabled={busy} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What you expected, and what happened instead." />
            </label>
            <div className="cw-form__actions cw-form__actions--spread">
              <button type="button" className="cw-link-button" disabled={busy} onClick={() => { setMode('history'); void refresh(); }}>My reports</button>
              <button type="submit" className="button--primary" disabled={busy || !description.trim()}>{busy ? 'Sending…' : 'Send report'}</button>
            </div>
          </form>
        ) : (
          <div className="cw-stack">
            <div className="cw-inline-actions">
              <button type="button" disabled={busy} onClick={() => void refresh()}>Refresh</button>
              <button type="button" className="cw-link-button" disabled={busy} onClick={() => setMode('report')}>Report another problem</button>
            </div>
            {!issues.length ? <p className="cw-muted">{busy ? 'Loading…' : 'No reports yet.'}</p> : null}
            {issues.map((issue) => (
              <article className="cw-issue" key={issue.id}>
                <strong>{CATEGORIES.find((entry) => entry.id === issue.category)?.label ?? issue.category} · {issue.status.replace('_', ' ')}</strong>
                <small>Reference {issue.id.slice(0, 12)} · {new Date(issue.createdAt).toLocaleDateString()}</small>
                <p>{issue.description}</p>
                {issue.replies.map((reply, index) => (
                  <blockquote key={index}><strong>Reply from the team</strong><p>{reply.text}</p><time>{new Date(reply.createdAt).toLocaleString()}</time></blockquote>
                ))}
              </article>
            ))}
          </div>
        )}
      </dialog>
    </>
  );
}
