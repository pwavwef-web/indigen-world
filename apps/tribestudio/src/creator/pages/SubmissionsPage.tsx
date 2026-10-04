import { useEffect, useState } from 'react';
import type { Campaign, Submission } from '@indigen-world/contracts/creator-models';
import { Link, useQueryParam, useRoute } from '../../router';
import { useAuth } from '../../auth';
import { fetchMySubmissions, fetchPublicCampaigns, submissionsOpen } from '../data';
import { DataTable, type DataColumn } from '@indigen-world/console-ui';
import { LoadError, StatusPill, SUBMISSION_STATUS_LABELS, useReloadable } from '../components';
import { ButtonLink, EmptyState, FilterChips, Icon, PageHeader, Skeleton, type IconName } from '../../ui';

export function SubmissionsPage() {
  const { user } = useAuth();
  const { navigate } = useRoute();
  const selectedStatus = useQueryParam('status') ?? '';
  const status = Object.hasOwn(SUBMISSION_STATUS_LABELS, selectedStatus) ? selectedStatus : '';

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

  const filtered = subs.filter((s) => !status || s.status === status);

  // An expression is followed on its own page, which shows the reviewer's
  // answer and offers the correction; it is named by its Kasem, not its gloss.
  const collectionDestination = (s: Submission) => s.collectionKind === 'dictionary' ? '/studio/dictionary' : s.collectionKind === 'expressions' ? '/studio/expressions' : null;
  const formatIcon = (s: Submission): IconName => s.collectionKind === 'dictionary' ? 'book' : s.collectionKind === 'expressions' ? 'quote' : ({ writing:'doc',image:'image',audio:'audio',video:'video',translation:'translation' } as Record<string,IconName>)[s.studioType || 'writing'] || 'doc';
  const isExpression = (s: Submission) => s.collectionKind === 'expressions';
  const titleOf = (s: Submission) => (isExpression(s) ? s.expression?.phrase ?? s.body ?? s.title : s.title) || 'Untitled';
  const kindOf = (s: Submission) => (s.collectionKind === 'dictionary' ? 'Dictionary word' : isExpression(s) ? 'Expression' : s.category || '—');

  const columns: DataColumn<Submission>[] = [
    {
      id: 'title',
      header: 'Title',
      cell: (s) => (
        <Link className="cr-title-cell" to={collectionDestination(s) || `/studio/submissions/${s.id}`}>
          <span className="cr-title-cell__icon" aria-hidden="true"><Icon name={formatIcon(s)} /></span>
          <span className="cr-title-cell__text">{titleOf(s)}</span>
        </Link>
      ),
      sort: (s) => titleOf(s),
      search: (s) => `${titleOf(s)} ${s.title ?? ''}`,
    },
    {
      id: 'category',
      header: 'Category',
      width: '150px',
      cell: (s) => kindOf(s),
      sort: (s) => s.category ?? '',
      search: (s) => s.category ?? '',
    },
    {
      id: 'submitted',
      header: 'Started',
      width: '130px',
      mono: true,
      cell: (s) => (s.lifecycle.createdAt ? new Date(s.lifecycle.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
      sort: (s) => (s.lifecycle.createdAt ? new Date(s.lifecycle.createdAt).getTime() : 0),
    },
    {
      id: 'status',
      header: 'Status',
      width: '190px',
      cell: (s) => <StatusPill status={s.status} labels={SUBMISSION_STATUS_LABELS} />,
      sort: (s) => SUBMISSION_STATUS_LABELS[s.status] ?? s.status,
      search: (s) => SUBMISSION_STATUS_LABELS[s.status] ?? s.status,
    },
    {
      id: 'open',
      header: 'Open',
      headerLabel: 'Open',
      align: 'end',
      width: '120px',
      cell: (s) => (
        <span className="dt-actions">
          {collectionDestination(s) ? (
            <Link to={collectionDestination(s)!} className="ts-btn ts-btn--secondary ts-btn--sm">Open</Link>
          ) : ['DRAFT', 'NEEDS_REVISION'].includes(s.status) ? (
            <Link to={`/studio/submissions/${s.id}/edit`} className="ts-btn ts-btn--primary ts-btn--sm">Continue</Link>
          ) : (
            <Link to={`/studio/submissions/${s.id}`} className="ts-btn ts-btn--secondary ts-btn--sm">Open</Link>
          )}
        </span>
      ),
    },
  ];

  const counts = new Map<string, number>();
  for (const s of subs) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
  const statusOptions = [
    { value: '', label: 'All content', count: subs.length },
    ...Object.entries(SUBMISSION_STATUS_LABELS)
      .filter(([value]) => counts.has(value) || value === status)
      .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 })),
  ];

  const header = (
    <PageHeader
      kicker="Your work"
      title="Content library"
      description="Every post, entry and language contribution you have started, and where each one stands."
      actions={(
        <>
          {openCampaign ? <ButtonLink to={`/studio/submissions/new?campaign=${openCampaign.id}`} variant="secondary" icon="opportunities">Enter campaign</ButtonLink> : null}
          <ButtonLink to="/studio/submissions/new" variant="primary" icon="plus">New post</ButtonLink>
        </>
      )}
    />
  );

  if (failed) return <div className="ts-page">{header}<LoadError title="Could not load your content" onRetry={retry} /></div>;
  if (loading) return <div className="ts-page">{header}<div className="ts-panel"><Skeleton lines={6} label="Loading your content" /></div></div>;

  return (
    <div className="ts-page cr-library">
      {header}

      {subs.length === 0 ? (
        <EmptyState
          boxed
          icon="doc"
          title="Create your first post"
          body="Post a video, a photo story, a recording or a piece of writing. Open posts publish to Explore after your preview; campaign entries are reviewed first."
          actions={<ButtonLink to="/studio/submissions/new" variant="primary" icon="plus">Create your first post</ButtonLink>}
        />
      ) : (
        <>
          <div className="cr-library__filters">
            <FilterChips
              scroll
              label="Publication status"
              options={statusOptions}
              value={status}
              onChange={(value) => navigate(`/studio/submissions${value ? `?status=${value}` : ''}`)}
            />
            <Link className="ts-link cr-library__public" to="/studio/published">Public links<Icon name="arrow" /></Link>
          </div>
          <p className="ts-hint">Approved work has passed review. Published work has completed publication.</p>
          <section className="ts-panel ts-panel--flush cr-library__table" aria-label="Your content">
            <DataTable
              caption="Your content"
              columns={columns}
              rows={filtered}
              rowKey={(s) => s.id}
              searchable
              searchPlaceholder="Search by title or category…"
              initialSort={{ columnId: 'submitted', direction: 'desc' }}
              pageSize={20}
              empty={{ title: status ? `Nothing is ${SUBMISSION_STATUS_LABELS[status]?.toLowerCase() ?? 'here'} right now` : 'Nothing matches that search' }}
            />
          </section>
        </>
      )}
    </div>
  );
}
