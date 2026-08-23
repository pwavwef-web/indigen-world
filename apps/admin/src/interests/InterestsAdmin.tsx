import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAdmin, type AdminRole } from '../creators/data';
import {
  deletePublicSubmission,
  fetchPublicSubmissions,
  formatSubmissionDate,
  INTEREST_ROUTES,
  SUBMISSION_STATUSES,
  updateSubmissionStatus,
  type ContactPayload,
  type GetInvolvedPayload,
  type PublicFormSubmission,
  type SubmissionStatus,
} from './data';
import './interests.css';

function getRouteBadgeClass(route: string): string {
  const r = route.toLowerCase();
  if (r.includes('contributor')) return 'route-badge route-badge--contributor';
  if (r.includes('validator') || r.includes('elder') || r.includes('teacher')) return 'route-badge route-badge--validator';
  if (r.includes('researcher')) return 'route-badge route-badge--researcher';
  if (r.includes('school') || r.includes('educator')) return 'route-badge route-badge--school';
  if (r.includes('sponsor') || r.includes('partner')) return 'route-badge route-badge--sponsor';
  if (r.includes('volunteer')) return 'route-badge route-badge--volunteer';
  return 'route-badge';
}

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function exportSubmissionsCsv(items: PublicFormSubmission[], filename: string) {
  const headers = ['ID', 'Form', 'Status', 'Date Received', 'Name', 'Contact', 'Country', 'Organisation', 'Route', 'Note / Message'];
  const rows = items.map((item) => {
    const isGetInvolved = item.form === 'get-involved';
    const payload = item.payload as GetInvolvedPayload & ContactPayload;
    return [
      escapeCsv(item.id),
      escapeCsv(item.form),
      escapeCsv(item.status),
      escapeCsv(formatSubmissionDate(item.receivedAt)),
      escapeCsv(payload.name || ''),
      escapeCsv(payload.contact || payload.email || ''),
      escapeCsv(payload.country || ''),
      escapeCsv(payload.organisation || ''),
      escapeCsv(isGetInvolved ? payload.route : payload.subject || ''),
      escapeCsv(payload.note || payload.message || ''),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function InterestDetailModal({
  submission,
  role,
  onClose,
  onStatusChange,
  onDelete,
}: {
  submission: PublicFormSubmission;
  role: AdminRole;
  onClose: () => void;
  onStatusChange: (id: string, newStatus: SubmissionStatus) => void;
  onDelete: (id: string) => void;
}) {
  const isGetInvolved = submission.form === 'get-involved';
  const payload = submission.payload as GetInvolvedPayload & ContactPayload;
  const isPhone = payload.contact && !payload.contact.includes('@');
  const emailAddr = payload.email || (payload.contact && payload.contact.includes('@') ? payload.contact : '');
  const [currentStatus, setCurrentStatus] = useState<SubmissionStatus>(submission.status || 'new');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleStatusSelect = async (newStatus: SubmissionStatus) => {
    setCurrentStatus(newStatus);
    setUpdating(true);
    try {
      await updateSubmissionStatus(submission.id, newStatus);
      onStatusChange(submission.id, newStatus);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="interest-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="interest-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interest-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="interest-modal__head">
          <div>
            <h3 id="interest-modal-title">{payload.name || 'Submission'}</h3>
            <p className="interest-modal__meta">
              Form: <strong>{submission.form}</strong> &middot; Received: {formatSubmissionDate(submission.receivedAt)}
            </p>
          </div>
          <button type="button" className="interest-modal__close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </header>

        <div className="interest-modal__body">
          <div className="interest-status-updater">
            <div>
              <strong>Lifecycle Status:</strong>{' '}
              <span className={`status-badge status-badge--${currentStatus}`}>{currentStatus}</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              Change status:
              <select
                className="interests-select"
                value={currentStatus}
                disabled={updating}
                onChange={(e) => void handleStatusSelect(e.target.value as SubmissionStatus)}
              >
                {SUBMISSION_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="interest-detail-grid">
            <div className="interest-detail-item">
              <dt>Full Name</dt>
              <dd>{payload.name || '—'}</dd>
            </div>
            <div className="interest-detail-item">
              <dt>Contact</dt>
              <dd>
                {emailAddr ? (
                  <a href={`mailto:${emailAddr}`} className="contact-link">
                    ✉ {emailAddr}
                  </a>
                ) : isPhone ? (
                  <a href={`tel:${payload.contact}`} className="contact-link">
                    ☎ {payload.contact}
                  </a>
                ) : (
                  payload.contact || '—'
                )}
              </dd>
            </div>
            <div className="interest-detail-item">
              <dt>Country</dt>
              <dd>{payload.country || '—'}</dd>
            </div>
            {isGetInvolved ? (
              <>
                <div className="interest-detail-item">
                  <dt>Organisation</dt>
                  <dd>{payload.organisation || '— (Individual)'}</dd>
                </div>
                <div className="interest-detail-item" style={{ gridColumn: 'span 2' }}>
                  <dt>Reaching Out As</dt>
                  <dd>
                    <span className={getRouteBadgeClass(payload.route || '')}>{payload.route || '—'}</span>
                  </dd>
                </div>
              </>
            ) : (
              <div className="interest-detail-item" style={{ gridColumn: 'span 2' }}>
                <dt>Subject</dt>
                <dd>{payload.subject || '—'}</dd>
              </div>
            )}
          </div>

          <div className="interest-note-section">
            <h4>{isGetInvolved ? 'Submitted Note / Proposal' : 'Message'}</h4>
            <div className="interest-note-box">{payload.note || payload.message || 'No additional note provided.'}</div>
          </div>
        </div>

        <footer className="interest-modal__foot">
          <div className="interest-modal__foot-actions">
            {emailAddr ? (
              <a
                href={`mailto:${emailAddr}?subject=${encodeURIComponent(
                  `Regarding your Indigen World interest submission (${payload.route || 'Involvement'})`
                )}`}
                className="button button--primary"
              >
                ✉ Reply via Email
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => exportSubmissionsCsv([submission], `interest-${submission.id}.csv`)}
            >
              Export CSV
            </button>
          </div>
          <div className="interest-modal__foot-actions">
            {isAdmin(role) ? (
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  if (window.confirm('Delete this submission permanently? This cannot be undone.')) {
                    onDelete(submission.id);
                  }
                }}
              >
                Delete
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function InterestsAdmin({ role }: { role: AdminRole }) {
  const [submissions, setSubmissions] = useState<PublicFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [formFilter, setFormFilter] = useState<'get-involved' | 'contact' | 'ALL'>('get-involved');
  const [routeFilter, setRouteFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeSubmission, setActiveSubmission] = useState<PublicFormSubmission | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [busyBatch, setBusyBatch] = useState(false);

  const notify = (msg: string) => {
    setFlashMessage(msg);
    setTimeout(() => setFlashMessage(null), 3500);
  };

  const loadSubmissions = useCallback(() => {
    setLoading(true);
    setSelectedIds(new Set());
    fetchPublicSubmissions(formFilter)
      .then((data) => {
        setSubmissions(data);
      })
      .catch((err) => {
        notify(`Failed to load submissions: ${err instanceof Error ? err.message : 'Error'}`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [formFilter]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Filtered submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((item) => {
      // Form filter
      if (formFilter !== 'ALL' && item.form !== formFilter) return false;

      // Status filter
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;

      // Route filter (only applies to get-involved)
      const payload = item.payload as GetInvolvedPayload & ContactPayload;
      if (routeFilter !== 'ALL' && item.form === 'get-involved' && payload.route !== routeFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        const name = (payload.name || '').toLowerCase();
        const contact = (payload.contact || payload.email || '').toLowerCase();
        const country = (payload.country || '').toLowerCase();
        const org = (payload.organisation || '').toLowerCase();
        const route = (payload.route || '').toLowerCase();
        const note = (payload.note || payload.message || '').toLowerCase();
        const match =
          name.includes(queryLower) ||
          contact.includes(queryLower) ||
          country.includes(queryLower) ||
          org.includes(queryLower) ||
          route.includes(queryLower) ||
          note.includes(queryLower);
        if (!match) return false;
      }

      return true;
    });
  }, [submissions, formFilter, statusFilter, routeFilter, searchQuery]);

  // Metrics computation
  const metrics = useMemo(() => {
    const getInvolvedItems = submissions.filter((s) => s.form === 'get-involved');
    const newCount = getInvolvedItems.filter((s) => s.status === 'new').length;
    const contactedCount = getInvolvedItems.filter((s) => s.status === 'contacted' || s.status === 'in_progress').length;
    const resolvedCount = getInvolvedItems.filter((s) => s.status === 'resolved').length;

    // Count by route
    const routesCount: Record<string, number> = {};
    for (const item of getInvolvedItems) {
      const r = (item.payload as GetInvolvedPayload).route || 'Unspecified';
      routesCount[r] = (routesCount[r] ?? 0) + 1;
    }

    return {
      total: getInvolvedItems.length,
      newCount,
      contactedCount,
      resolvedCount,
      routesCount,
    };
  }, [submissions]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSubmissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSubmissions.map((s) => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStatusChange = (id: string, newStatus: SubmissionStatus) => {
    setSubmissions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
    notify('Status updated.');
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePublicSubmission(id);
      setSubmissions((prev) => prev.filter((item) => item.id !== id));
      if (activeSubmission?.id === id) setActiveSubmission(null);
      notify('Submission deleted.');
    } catch (err) {
      notify(`Delete failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  const handleBatchStatus = async (newStatus: SubmissionStatus) => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      `Mark all ${selectedIds.size} selected submissions as "${newStatus}"?`
    );
    if (!confirmed) return;

    setBusyBatch(true);
    try {
      for (const id of selectedIds) {
        await updateSubmissionStatus(id, newStatus);
      }
      setSubmissions((prev) =>
        prev.map((item) => (selectedIds.has(item.id) ? { ...item, status: newStatus } : item))
      );
      notify(`Updated ${selectedIds.size} submissions to "${newStatus}".`);
      setSelectedIds(new Set());
    } catch (err) {
      notify(`Batch update failed: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setBusyBatch(false);
    }
  };

  return (
    <div className="interests-admin">
      <div className="tab-head">
        <div>
          <h2>Get Involved &amp; Interests Intake</h2>
          <p className="muted">
            Submitted interests, contributor applications, partner proposals, and public intake from the website.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => exportSubmissionsCsv(filteredSubmissions, `indigen-world-interests-${new Date().toISOString().slice(0, 10)}.csv`)}
            disabled={filteredSubmissions.length === 0}
          >
            Export Filtered CSV
          </button>
          <button type="button" onClick={loadSubmissions} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {flashMessage ? <div className="admin-flash">{flashMessage}</div> : null}

      {/* Metrics Summary Grid */}
      <div className="interests-metrics">
        <div className="interest-metric-card">
          <span className="metric-val">{metrics.total}</span>
          <span className="metric-lbl">Total Interests</span>
        </div>
        <div className="interest-metric-card interest-metric-card--highlight">
          <span className="metric-val">{metrics.newCount}</span>
          <span className="metric-lbl">New Submissions</span>
        </div>
        <div className="interest-metric-card">
          <span className="metric-val">{metrics.contactedCount}</span>
          <span className="metric-lbl">In Progress / Contacted</span>
        </div>
        <div className="interest-metric-card">
          <span className="metric-val">{metrics.resolvedCount}</span>
          <span className="metric-lbl">Resolved</span>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="interests-toolbar">
        <div className="interests-filters">
          <input
            type="search"
            className="interests-search-input"
            placeholder="Search by name, contact, country, note…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            Form:
            <select
              className="interests-select"
              value={formFilter}
              onChange={(e) => setFormFilter(e.target.value as 'get-involved' | 'contact' | 'ALL')}
            >
              <option value="get-involved">Get Involved (Interests)</option>
              <option value="contact">Contact messages</option>
              <option value="ALL">All public forms</option>
            </select>
          </label>

          {formFilter === 'get-involved' || formFilter === 'ALL' ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              Route:
              <select
                className="interests-select"
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
              >
                <option value="ALL">All routes</option>
                {INTEREST_ROUTES.map((route) => (
                  <option key={route} value={route}>
                    {route}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            Status:
            <select
              className="interests-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              {SUBMISSION_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <span className="tiny muted">Showing {filteredSubmissions.length} of {submissions.length}</span>
      </div>

      {/* Batch Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="batch-toolbar">
          <span>
            <strong>{selectedIds.size}</strong> item(s) selected
          </span>
          <div className="batch-actions">
            <button
              type="button"
              className="button button--small"
              disabled={busyBatch}
              onClick={() => void handleBatchStatus('contacted')}
            >
              Mark Contacted
            </button>
            <button
              type="button"
              className="button button--small"
              disabled={busyBatch}
              onClick={() => void handleBatchStatus('resolved')}
            >
              Mark Resolved
            </button>
            <button
              type="button"
              className="button button--small"
              disabled={busyBatch}
              onClick={() => void handleBatchStatus('archived')}
            >
              Archive
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      {loading ? (
        <p className="muted">Loading submitted interests…</p>
      ) : filteredSubmissions.length === 0 ? (
        <p className="muted">No submissions found matching the criteria.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '36px' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredSubmissions.length && filteredSubmissions.length > 0}
                  onChange={toggleSelectAll}
                  aria-label="Select all rows"
                />
              </th>
              <th>Received</th>
              <th>Name &amp; Organisation</th>
              <th>Reaching out as</th>
              <th>Contact</th>
              <th>Country</th>
              <th>Note preview</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubmissions.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const isGetInvolved = item.form === 'get-involved';
              const payload = item.payload as GetInvolvedPayload & ContactPayload;
              const contactText = payload.contact || payload.email || '—';
              const isPhone = payload.contact && !payload.contact.includes('@');
              const emailAddr = payload.email || (payload.contact && payload.contact.includes('@') ? payload.contact : '');

              return (
                <tr key={item.id} className={isSelected ? 'is-selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      aria-label={`Select ${payload.name}`}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="row-select"
                      onClick={() => setActiveSubmission(item)}
                      title="View full submission details"
                    >
                      {formatSubmissionDate(item.receivedAt)}
                    </button>
                  </td>
                  <td>
                    <strong>{payload.name || '—'}</strong>
                    {payload.organisation ? (
                      <div className="tiny muted">{payload.organisation}</div>
                    ) : null}
                  </td>
                  <td>
                    {isGetInvolved && payload.route ? (
                      <span className={getRouteBadgeClass(payload.route)}>{payload.route}</span>
                    ) : (
                      <span className="tiny muted">{payload.subject || item.form}</span>
                    )}
                  </td>
                  <td>
                    {emailAddr ? (
                      <a href={`mailto:${emailAddr}`} className="contact-link">
                        {emailAddr}
                      </a>
                    ) : isPhone ? (
                      <a href={`tel:${payload.contact}`} className="contact-link">
                        {payload.contact}
                      </a>
                    ) : (
                      contactText
                    )}
                  </td>
                  <td>{payload.country || '—'}</td>
                  <td>
                    <div className="note-snippet" title={payload.note || payload.message || ''}>
                      {payload.note || payload.message || '—'}
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge status-badge--${item.status || 'new'}`}>
                      {item.status || 'new'}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button type="button" onClick={() => setActiveSubmission(item)}>
                      View
                    </button>
                    <select
                      className="interests-select"
                      value={item.status || 'new'}
                      onChange={(e) => {
                        const newSt = e.target.value as SubmissionStatus;
                        void updateSubmissionStatus(item.id, newSt).then(() => {
                          handleStatusChange(item.id, newSt);
                        });
                      }}
                      style={{ fontSize: '0.78rem', padding: '2px 4px' }}
                    >
                      {SUBMISSION_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Detail Modal */}
      {activeSubmission ? (
        <InterestDetailModal
          submission={activeSubmission}
          role={role}
          onClose={() => setActiveSubmission(null)}
          onStatusChange={handleStatusChange}
          onDelete={(id) => void handleDelete(id)}
        />
      ) : null}
    </div>
  );
}
