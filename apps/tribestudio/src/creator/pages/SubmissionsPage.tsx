import { useEffect, useState } from 'react';
import type { Campaign, Submission } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { fetchMySubmissions, fetchPublicCampaigns, submissionsOpen } from '../data';
import { DataTable, type DataColumn } from '@indigen-world/console-ui';
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

  const columns: DataColumn<Submission>[] = [
    {
      id: 'title',
      header: 'Title',
      cell: (s) => (
        <Link to={`/studio/submissions/${s.id}`}>{s.title || 'Untitled'}</Link>
      ),
      sort: (s) => s.title || 'Untitled',
      search: (s) => s.title || 'Untitled',
    },
    {
      id: 'category',
      header: 'Category',
      width: '150px',
      cell: (s) => s.category || '—',
      sort: (s) => s.category ?? '',
      search: (s) => s.category ?? '',
    },
    {
      id: 'submitted',
      header: 'Submitted',
      width: '140px',
      mono: true,
      cell: (s) => (s.lifecycle.createdAt ? new Date(s.lifecycle.createdAt).toLocaleDateString() : '—'),
      sort: (s) => (s.lifecycle.createdAt ? new Date(s.lifecycle.createdAt).getTime() : 0),
    },
    {
      id: 'status',
      header: 'Status',
      width: '160px',
      cell: (s) => <StatusPill status={s.status} labels={SUBMISSION_STATUS_LABELS} />,
      sort: (s) => SUBMISSION_STATUS_LABELS[s.status] ?? s.status,
      search: (s) => SUBMISSION_STATUS_LABELS[s.status] ?? s.status,
    },
    {
      id: 'open',
      header: 'Open',
      align: 'end',
      width: '86px',
      cell: (s) => (
        <span className="dt-actions">
          <Link to={`/studio/submissions/${s.id}`} className="button button--small">Open</Link>
        </span>
      ),
    },
  ];

  if (failed) return <div className="page"><h1>Submissions</h1><LoadError onRetry={retry} /></div>;
  if (loading) return <div className="page"><h1>Submissions</h1><Skeleton lines={5} /></div>;

  return (
    <div className="page">
      <header className="page__head">
        <h1>Your work</h1>
        <div className="page__head-actions">
          {openCampaign ? (
            <Link to={`/studio/submissions/new?campaign=${openCampaign.id}`} className="button button--ghost-dark button--small">Enter campaign</Link>
          ) : null}
          <Link to="/studio/submissions/new" className="button button--primary button--small">New post</Link>
        </div>
      </header>

      {subs.length === 0 ? (
        <EmptyState
          title="Nothing published yet"
          body="Post a video, a photo story, a recording or a piece of writing and it goes straight to the Explore feed — no queue, no approval. Campaigns are the exception: those are reviewed."
          action={<Link to="/studio/submissions/new" className="button button--primary">Create your first post</Link>}
        />
      ) : (
        <DataTable
          caption="Your submissions"
          columns={columns}
          rows={subs}
          rowKey={(s) => s.id}
          searchable
          searchPlaceholder="Search by title or category…"
          initialSort={{ columnId: 'submitted', direction: 'desc' }}
          pageSize={20}
          empty={{ title: 'Nothing matches that search' }}
        />
      )}
    </div>
  );
}
