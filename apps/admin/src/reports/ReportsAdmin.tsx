import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@indigen-world/web-ui';
import {
  listCommunityReports,
  REPORT_STATUSES,
  setCommunityReportStatus,
  type CommunityReport,
  type ReportStatus,
  type ReportedMedia,
} from './data';
import './reports.css';

type StatusFilter = ReportStatus | 'all';

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

export function ReportsAdmin() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('open');
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

  const counts = useMemo(() => Object.fromEntries(
    REPORT_STATUSES.map(({ id }) => [id, reports.filter((report) => report.status === id).length]),
  ) as Record<ReportStatus, number>, [reports]);
  const visibleReports = filter === 'all'
    ? reports
    : reports.filter((report) => report.status === filter);

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
          <p>Review posts flagged by community members and track each report through resolution.</p>
        </div>
        <div className="reports-summary" aria-label={`${counts.open} open reports`}>
          <strong>{counts.open}</strong>
          <span>Open</span>
        </div>
      </section>

      <section className="panel">
        <div className="reports-toolbar">
          <div className="reports-filters" role="group" aria-label="Filter reports by status">
            <button
              type="button"
              className={filter === 'all' ? 'report-filter is-active' : 'report-filter'}
              onClick={() => setFilter('all')}
            >
              All <span>{reports.length}</span>
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
        {loading ? <p className="muted">Loading reports…</p> : null}
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

                  <div className="reported-post">
                    <span className="reported-post__label">Reported post</span>
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

                  <footer className="report-card__footer">
                    <div>
                      Reported by <strong>{reporterName}</strong> <span>{reporterHandle}</span>
                    </div>
                    <details>
                      <summary>Record IDs</summary>
                      <dl>
                        <div><dt>Report</dt><dd><code>{report.id}</code></dd></div>
                        <div><dt>Post</dt><dd><code>{report.postId}</code></dd></div>
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
