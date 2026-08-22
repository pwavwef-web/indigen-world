import { useEffect, useState } from 'react';
import type { Campaign, Submission } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { fetchMySubmissions, fetchPublicCampaigns, submissionsOpen } from '../data';
import { EmptyState, LoadError, Skeleton, StatusPill, SUBMISSION_STATUS_LABELS, useReloadable } from '../components';

export function SubmissionsPage() {
  const { user } = useAuth();
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [subs, setSubs] = useState<Submission[]>([]);
  const [openCampaign, setOpenCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    setLoading(true);
    void Promise.all([fetchMySubmissions(user.uid), fetchPublicCampaigns()])
      .then(([s, c]) => {
        if (!active) return;
        setSubs(s);
        setOpenCampaign(c.find(submissionsOpen) ?? null);
        setLoading(false);
      })
      .catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [user, reloadKey, setFailed]);

  if (failed) return <div className="page"><h1>Submissions</h1><LoadError onRetry={retry} /></div>;
  if (loading) return <div className="page"><h1>Submissions</h1><Skeleton lines={5} /></div>;

  return (
    <div className="page">
      <header className="page__head">
        <h1>Submissions</h1>
        {openCampaign ? (
          <Link to={`/studio/submissions/new?campaign=${openCampaign.id}`} className="button button--primary button--small">New submission</Link>
        ) : null}
      </header>

      {!openCampaign && subs.length === 0 ? (
        <EmptyState
          title="Submissions aren’t open yet"
          body="When a campaign opens, you’ll be able to create and upload submissions here."
          action={<Link to="/studio/opportunities" className="button button--ghost-dark">View opportunities</Link>}
        />
      ) : subs.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          body="Start your first entry for the open campaign."
          action={<Link to={`/studio/submissions/new?campaign=${openCampaign?.id}`} className="button button--primary">Create submission</Link>}
        />
      ) : (
        <table className="table">
          <thead>
            <tr><th>Title</th><th>Category</th><th>Submitted</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>{s.title || 'Untitled'}</td>
                <td>{s.category || '—'}</td>
                <td>{s.lifecycle.createdAt ? new Date(s.lifecycle.createdAt).toLocaleDateString() : '—'}</td>
                <td><StatusPill status={s.status} labels={SUBMISSION_STATUS_LABELS} /></td>
                <td><Link to={`/studio/submissions/${s.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
