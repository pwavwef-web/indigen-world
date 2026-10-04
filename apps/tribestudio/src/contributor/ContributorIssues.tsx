import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { Icon } from '../ui/icons';

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
export function ContributorIssues({ work = '', item, preview = false, disabled = false, accountId = '', showHistory = false }: { work?: string; item?: string; preview?: boolean; disabled?: boolean; accountId?: string; showHistory?: boolean }) {
  const [mode, setMode] = useState<'report' | 'history'>('report');
  const dialog = useRef<HTMLDialogElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [category, setCategory] = useState(work ? 'translation' : 'account');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const refresh = async () => {
    if (preview) return;
    setBusy(true); setError('');
    try { setIssues((await list({})).data.issues); } catch { setError('Your reports could not be loaded. Try again in a moment.'); } finally { setBusy(false); }
  };
  const seenKey = 'contributor-report-replies:' + accountId;
  const [seenReplies, setSeenReplies] = useState(() => { try { return Number(localStorage.getItem(seenKey) || 0); } catch { return 0; } });
  const replyCount = issues.reduce((sum, issue) => sum + issue.replies.length, 0);
  useEffect(() => { if (!showHistory) return; void refresh(); const timer = setInterval(() => void refresh(), 60000); return () => clearInterval(timer); }, [showHistory]);
  const newReplies = replyCount > seenReplies ? replyCount - seenReplies : 0;
  return (
    <>
      <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm cw-report-button" disabled={disabled} onClick={() => { setMode('report'); setNotice(''); setError(''); dialog.current?.showModal(); }}>
        <Icon name="flag" />Report a problem
      </button>
      <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" disabled={disabled} onClick={() => { setMode('history'); setSeenReplies(replyCount); try { localStorage.setItem(seenKey, String(replyCount)); } catch { /* Optional. */ } void refresh(); dialog.current?.showModal(); }}>
        <Icon name="inbox" />My reports{newReplies ? <span className="ts-count">{newReplies} new</span> : null}
      </button>
      <dialog ref={dialog} className="ts-dialog" aria-labelledby="report-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <div className="ts-dialog__head">
          <div>
            <h2 id="report-title" className="ts-dialog__title">{mode === 'report' ? 'Report a problem' : 'My reports'}</h2>
            {mode === 'report' ? <p className="ts-dialog__lede">The team sees {work ? 'the linked task and ' : ''}what you write below. Never include bank details, passwords or codes.</p> : <p className="ts-dialog__lede">Your reports and the team’s replies.</p>}
          </div>
          <button type="button" className="ts-dialog__close" disabled={busy} onClick={() => dialog.current?.close()} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="ts-dialog__body ts-stack ts-stack--md">
          {preview ? <p className="ts-banner" style={{ margin: 0 }}>Preview only — reports stay in this sample session and are not sent.</p> : null}
          {error ? <p role="alert" className="ts-notice ts-notice--danger">{error}</p> : null}
          {notice ? <p role="status" className="ts-notice ts-notice--success">{notice}</p> : null}
          {mode === 'report' ? (
            <form className="ts-stack ts-stack--md" onSubmit={async (event) => {
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
              <label className="ts-field">
                <span className="ts-label">What is it about?</span>
                <select className="ts-select" disabled={busy} value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORIES.filter(entry => work || ['account', 'other'].includes(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
              </label>
              <label className="ts-field">
                <span className="ts-label">What happened?</span>
                <textarea className="ts-textarea" required minLength={1} maxLength={2000} rows={5} disabled={busy} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What you expected, and what happened instead." />
                <span className="ts-counter">{description.length}/2000</span>
              </label>
              <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="ts-link" disabled={busy} onClick={() => { setMode('history'); void refresh(); }}>My reports</button>
                <button type="submit" className="ts-btn ts-btn--primary" disabled={busy || !description.trim()} aria-busy={busy || undefined}><span className="ts-btn__spinner" aria-hidden="true" /><Icon name="send" /><span>{busy ? 'Sending…' : 'Send report'}</span></button>
              </div>
            </form>
          ) : (
            <div className="ts-stack ts-stack--md">
              <div className="ts-cluster">
                <button type="button" className="ts-btn ts-btn--sm" disabled={busy} onClick={() => void refresh()}><Icon name="refresh" /><span>Refresh</span></button>
                <button type="button" className="ts-link" disabled={busy} onClick={() => setMode('report')}><Icon name="plus" />Report another problem</button>
              </div>
              {!issues.length ? <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>{busy ? 'Loading…' : 'No reports yet.'}</p> : null}
              {issues.map((issue) => (
                <article className="cw-issue" key={issue.id}>
                  <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap' }}>
                    <strong>{CATEGORIES.find((entry) => entry.id === issue.category)?.label ?? issue.category}</strong>
                    <span className={`ts-badge ts-badge--${issue.status === 'resolved' ? 'success' : 'info'}`}><span className="ts-badge__dot" aria-hidden="true" /><span>{issue.status.replace('_', ' ')}</span></span>
                  </div>
                  <small className="ts-muted">Reference {issue.id.slice(0, 12)} · {new Date(issue.createdAt).toLocaleDateString()}</small>
                  <p>{issue.description}</p>
                  {issue.replies.map((reply, index) => (
                    <blockquote key={index} className="ts-quote"><strong>Reply from the team</strong><p>{reply.text}</p><time className="ts-hint">{new Date(reply.createdAt).toLocaleString()}</time></blockquote>
                  ))}
                </article>
              ))}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
