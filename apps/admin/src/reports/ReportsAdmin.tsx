import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@indigen-world/web-ui';
import {
  listCommunityReports,
  REPORT_STATUSES,
  setCommunityReportStatus,
  setCommunitySpaceStatus,
  type CommunityReport,
  type ReportedCommunity,
  type ReportStatus,
  type ReportTarget,
  type ReportedMedia,
} from './data';
import './reports.css';
import { Loading } from '@indigen-world/console-ui';

type StatusFilter = ReportStatus | 'all';
type TargetFilter = ReportTarget | 'all';

const TARGET_FILTERS: { id: TargetFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'post', label: 'Posts' },
  { id: 'community', label: 'Communities' },
];

function formatDate(report: CommunityReport): string {
  return report.createdAt?.toDate().toLocaleString() ?? 'Date unavailable';
}

function MediaPreview({ media }: { media: ReportedMedia }) {
  if (media.type === 'image') {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className="report-media__item">
        <img src={media.url} alt="Attachment on the reported post" loading="lazy" />
      </a>
    );
  }
  return (
    <a href={media.url} target="_blank" rel="noreferrer" className="report-media__item report-media__file">
      <span aria-hidden="true">{media.type === 'video' ? '▶' : '♪'}</span>
      Open {media.type}
    </a>
  );
}

/** A reported community: what it says about itself, and the staff action. */
function ReportedCommunityPanel({
  community,
  communityId,
  busy,
  onSetStatus,
}: {
  community: ReportedCommunity | null;
  communityId: string;
  busy: boolean;
  onSetStatus: (community: ReportedCommunity, status: 'active' | 'removed') => void;
}) {
  if (!community) {
    return (
      <div className="reported-post">
        <span className="reported-post__label">Reported community</span>
        <p className="reported-post__missing">
          This community no longer exists (<code>{communityId || 'no id'}</code>).
        </p>
      </div>
    );
  }
  const statusLabel = community.status === 'active'
    ? 'Live'
    : community.status === 'closed' ? 'Closed by its owner' : 'Removed by staff';
  return (
    <div className="reported-post reported-community">
      <span className="reported-post__label">Reported community</span>
      <div className="reported-community__head">
        {community.avatarUrl ? (
          <img className="reported-community__avatar" src={community.avatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="reported-community__avatar" aria-hidden="true">
            {community.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <strong>{community.name}</strong>
          <span>
            communities/{community.id} · {community.visibility === 'private' ? 'Private' : 'Public'} ·{' '}
            {community.memberCount === 1 ? '1 member' : `${community.memberCount} members`}
          </span>
        </div>
        <span className={`report-status report-status--community-${community.status}`}>{statusLabel}</span>
      </div>
      <p className="reported-post__text">{community.description || 'No description.'}</p>
      {community.rules.length ? (
        <ol className="reported-community__rules">
          {community.rules.map((rule, index) => <li key={`${index}-${rule}`}>{rule}</li>)}
        </ol>
      ) : null}
      <div className="reported-community__actions">
        {community.status === 'active' ? (
          <Button variant="danger" disabled={busy} onClick={() => onSetStatus(community, 'removed')}>
            Remove community
          </Button>
        ) : null}
        {community.status === 'removed' ? (
          <Button variant="ghost" disabled={busy} onClick={() => onSetStatus(community, 'active')}>
            Restore community
          </Button>
        ) : null}
        <p>
          Removing hides it in the app and on the website. Posts and members are kept, so
          it can be restored.
        </p>
      </div>
    </div>
  );
}

export function ReportsAdmin() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('open');
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReports(await listCommunityReports());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load community reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const targeted = useMemo(() => (
    targetFilter === 'all' ? reports : reports.filter((report) => report.target === targetFilter)
  ), [reports, targetFilter]);
  const counts = useMemo(() => Object.fromEntries(
    REPORT_STATUSES.map(({ id }) => [id, targeted.filter((report) => report.status === id).length]),
  ) as Record<ReportStatus, number>, [targeted]);
  const visibleReports = filter === 'all'
    ? targeted
    : targeted.filter((report) => report.status === filter);

  const changeCommunityStatus = async (
    report: CommunityReport,
    community: ReportedCommunity,
    status: 'active' | 'removed',
  ) => {
    const verb = status === 'removed' ? 'Remove' : 'Restore';
    if (!window.confirm(`${verb} ${community.name} (communities/${community.id})?`)) return;
    setUpdatingId(report.id);
    setError(null);
    try {
      await setCommunitySpaceStatus(community.id, status);
      // Every report about the same community shows the same community.
      setReports((current) => current.map((item) => (
        item.community?.id === community.id && item.community
          ? { ...item, community: { ...item.community, status } }
          : item
      )));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the community.');
    } finally {
      setUpdatingId(null);
    }
  };

  const changeStatus = async (report: CommunityReport, status: ReportStatus) => {
    if (report.status === status) return;
    setUpdatingId(report.id);
    setError(null);
    try {
      await setCommunityReportStatus(report.id, status);
      setReports((current) => current.map((item) => (
        item.id === report.id ? { ...item, status } : item
      )));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the report.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="reports-page">
      <section className="panel reports-hero">
        <div>
          <p className="reports-eyebrow">Community safety</p>
          <h1>Reports</h1>
          <p>Review posts and communities flagged by members, and track each report through resolution.</p>
        </div>
        <div className="reports-summary" aria-label={`${counts.open} open reports`}>
          <strong>{counts.open}</strong>
          <span>Open</span>
        </div>
      </section>

      <section className="panel">
        <div className="reports-toolbar">
          <div className="reports-filters" role="group" aria-label="Filter reports by what was reported">
            {TARGET_FILTERS.map((target) => (
              <button
                type="button"
                key={target.id}
                aria-pressed={targetFilter === target.id}
                className={targetFilter === target.id ? 'report-filter is-active' : 'report-filter'}
                onClick={() => setTargetFilter(target.id)}
              >
                {target.label}{' '}
                <span>
                  {target.id === 'all'
                    ? reports.length
                    : reports.filter((report) => report.target === target.id).length}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="reports-toolbar">
          <div className="reports-filters" role="group" aria-label="Filter reports by status">
            <button
              type="button"
              className={filter === 'all' ? 'report-filter is-active' : 'report-filter'}
              onClick={() => setFilter('all')}
            >
              All <span>{targeted.length}</span>
            </button>
            {REPORT_STATUSES.map((status) => (
              <button
                type="button"
                key={status.id}
                className={filter === status.id ? 'report-filter is-active' : 'report-filter'}
                onClick={() => setFilter(status.id)}
              >
                {status.label} <span>{counts[status.id]}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>Refresh</Button>
        </div>

        {error ? <p className="error-line" role="alert">{error}</p> : null}
        {loading ? <Loading label="Loading reports" /> : null}
        {!loading && visibleReports.length === 0 ? (
          <div className="reports-empty">
            <span aria-hidden="true">✓</span>
            <strong>No {filter === 'all' ? '' : `${filter} `}reports</strong>
            <p>There is nothing in this part of the moderation queue.</p>
          </div>
        ) : null}

        {!loading ? (
          <div className="reports-list" aria-live="polite">
            {visibleReports.map((report) => {
              const reporterName = report.reporter?.displayName ?? 'Unknown member';
              const reporterHandle = report.reporter?.username ? `@${report.reporter.username}` : report.reporterId;
              const authorHandle = report.post?.authorUsername ? `@${report.post.authorUsername}` : report.post?.authorId;
              return (
                <article className="report-card" key={report.id}>
                  <header className="report-card__head">
                    <div>
                      <span className={`report-status report-status--${report.status}`}>{report.status}</span>
                      <span className="report-target">{report.target === 'community' ? 'Community' : 'Post'}</span>
                      <time dateTime={report.createdAt?.toDate().toISOString()}>{formatDate(report)}</time>
                    </div>
                    <label className="report-status-control">
                      <span>Report status</span>
                      <select
                        value={report.status}
                        disabled={updatingId === report.id}
                        aria-label={`Status for report ${report.id}`}
                        onChange={(event) => void changeStatus(report, event.target.value as ReportStatus)}
                      >
                        {REPORT_STATUSES.map((status) => (
                          <option key={status.id} value={status.id}>{status.label}</option>
                        ))}
                      </select>
                    </label>
                  </header>

                  <div className="report-reason">
                    <span>Reason given</span>
                    <blockquote>{report.reason || 'No reason was provided.'}</blockquote>
                  </div>

                  {report.target === 'community' ? (
                    <ReportedCommunityPanel
                      community={report.community}
                      communityId={report.communityId}
                      busy={updatingId === report.id}
                      onSetStatus={(community, status) => void changeCommunityStatus(report, community, status)}
                    />
                  ) : (
                  <div className="reported-post">
                    <span className="reported-post__label">
                      Reported post
                      {report.community ? (
                        <>
                          {' '}in <strong>{report.community.name}</strong>
                          {report.community.visibility === 'private' ? ' (private)' : ''}
                        </>
                      ) : null}
                    </span>
                    {report.post ? (
                      <>
                        <div className="reported-post__author">
                          <strong>{report.post.authorName}</strong>
                          <span>{authorHandle}</span>
                          {report.post.createdAt ? <time>{report.post.createdAt.toDate().toLocaleString()}</time> : null}
                        </div>
                        <p className="reported-post__text">
                          {report.post.text || (report.post.media.length ? 'Media-only post' : 'Empty post')}
                        </p>
                        {report.post.media.length ? (
                          <div className="report-media">
                            {report.post.media.map((media, index) => (
                              <MediaPreview media={media} key={`${media.url}-${index}`} />
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="reported-post__missing">This post is no longer available.</p>
                    )}
                  </div>
                  )}

                  <footer className="report-card__footer">
                    <div>
                      Reported by <strong>{reporterName}</strong> <span>{reporterHandle}</span>
                    </div>
                    <details>
                      <summary>Record IDs</summary>
                      <dl>
                        <div><dt>Report</dt><dd><code>{report.id}</code></dd></div>
                        {report.postId ? <div><dt>Post</dt><dd><code>{report.postId}</code></dd></div> : null}
                        {report.communityId ? (
                          <div><dt>Community</dt><dd><code>{report.communityId}</code></dd></div>
                        ) : null}
                        <div><dt>Reporter</dt><dd><code>{report.reporterId}</code></dd></div>
                      </dl>
                    </details>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
