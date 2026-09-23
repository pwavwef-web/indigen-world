import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
type Issue = { id: string; contributorId: string; work: string; item: string; category: string; description: string; status: string; replies: { text: string; createdAt: string }[] };
const list = httpsCallable<{}, { issues: Issue[] }>(functions, 'listContributorIssues');
const update = httpsCallable(functions, 'updateContributorIssue');
export function ContributorIssuesAdmin() {
  const [issues, setIssues] = useState<Issue[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const refresh = async () => { setLoading(true); setError(''); try { setIssues((await list({})).data.issues); } catch { setError('Could not load reports. Retry.'); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  return <section><h2>Contributor issues</h2><p>The latest 200 reports. Replies are visible to the reporting contributor.</p><button disabled={loading} onClick={() => void refresh()}>Refresh reports</button>{error && <p role="alert">{error}</p>}{!loading && !issues.length && !error && <p>No issue reports yet.</p>}{issues.map(issue => <IssueCard key={issue.id} issue={issue} reload={refresh} />)}</section>;
}
function IssueCard({ issue, reload }: { issue: Issue; reload: () => Promise<void> }) {
  const [status, setStatus] = useState(issue.status), [reply, setReply] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => setStatus(issue.status), [issue.status]);
  return <article className="contributor-issue"><h3>{issue.category} · {issue.status.replace('_', ' ')}</h3><p>Reference: {issue.id}</p><p>Contributor: {issue.contributorId} · Assignment: {issue.work}{issue.item ? ` · Expression: ${issue.item}` : ''}</p><p>{issue.description}</p>{issue.replies.map((entry, i) => <blockquote key={i}>{entry.text}<small>{new Date(entry.createdAt).toLocaleString()}</small></blockquote>)}
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await update({ id: issue.id, status, reply }); setReply(''); await reload(); } catch { setError('Update could not be confirmed. Refresh before retrying to avoid duplicate replies.'); } finally { setBusy(false); } }}>
      <label>Status<select disabled={busy} value={status} onChange={e => setStatus(e.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label>
      <label>Reply to contributor<textarea disabled={busy} maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Saving…' : 'Save status / Send reply'}</button>
    </form></article>;
}
