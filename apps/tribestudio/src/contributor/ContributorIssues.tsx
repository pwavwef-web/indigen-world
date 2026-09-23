import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
type Issue = { id: string; category: string; description: string; status: string; work: string; item: string; createdAt: string; replies: { text: string; createdAt: string }[] };
const report = httpsCallable<Record<string, string>, { id: string }>(functions, 'reportContributorIssue');
const list = httpsCallable<{}, { issues: Issue[] }>(functions, 'getContributorIssues');
export function ContributorIssues({ work, item, preview = false }: { work: string; item?: string; preview?: boolean }) {
  const [mode, setMode] = useState<'report' | 'history'>('report');
  const dialog = useRef<HTMLDialogElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]), [category, setCategory] = useState('translation'), [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const refresh = async () => {
    if (preview) return;
    setBusy(true); setError('');
    try { setIssues((await list({})).data.issues); } catch { setError('Reports could not be loaded. Please retry.'); } finally { setBusy(false); }
  };
  return <><button onClick={() => { setMode('report'); dialog.current?.showModal(); }}>Report an issue</button>
    <dialog ref={dialog} className="contributor-payment-dialog" aria-label={mode === 'report' ? 'Report an issue' : 'My reports'} onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="contributor-payment-dialog-heading"><h2>{mode === 'report' ? 'Report an issue' : 'My reports'}</h2><button disabled={busy} onClick={() => dialog.current?.close()}>Close</button></div>
      {mode === 'report' && <p>Attached context: assignment {work}{item ? ` · expression ${item}` : ''}. Only these IDs and what you write below are sent. Do not include bank details or passwords.</p>}
      {preview && <p>Preview only — reports stay in this sample session and are not sent to administrators.</p>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {mode === 'report' && <form className="contributor-payment-form" onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
        try {
          const data = { category, description, work, item: item ?? '', requestId: requestId.current };
          const id = preview ? `DEMO-${Date.now()}` : (await report(data)).data.id;
          if (preview) setIssues(current => [{ ...data, id, status: 'open', createdAt: new Date().toISOString(), replies: [] }, ...current]);
          setMode('history'); setNotice(`Issue reported. Reference: ${id}`); setDescription(''); requestId.current = crypto.randomUUID();
          if (!preview) { try { setIssues((await list({})).data.issues); } catch { setError('Report saved. Refresh reports to load the updated list.'); } }
        } catch { setError('Could not confirm your report. Your text is kept; retry to check the same reference.'); } finally { setBusy(false); }
      }}>
        <label>Issue type<select disabled={busy} value={category} onChange={e => setCategory(e.target.value)}>{['translation', 'assignment', 'saving', 'account', 'other'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Description<textarea required minLength={1} maxLength={2000} disabled={busy} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <button disabled={busy || !description.trim()}>{busy ? 'Sending…' : 'Send report'}</button>
      </form>}
      {mode === 'history' && <><h3>My reports</h3><button disabled={busy} onClick={() => void refresh()}>Refresh reports</button>
      {!issues.length && <p>No reports loaded.</p>}{issues.map(issue => <article className="contributor-issue" key={issue.id}><strong>{issue.category} · {issue.status.replace('_', ' ')}</strong><small>Reference: {issue.id}</small><p>{issue.description}</p>{issue.replies.map((reply, i) => <blockquote key={i}><strong>Admin reply</strong><p>{reply.text}</p><time>{new Date(reply.createdAt).toLocaleString()}</time></blockquote>)}</article>)}
      </>}
    </dialog></>;
}
