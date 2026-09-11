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
  type TesterRewardPayload,
} from './data';
import { type DataColumn, DataTable, PageHeader, Spinner, Stat, StatGrid, toneForStatus } from '@indigen-world/console-ui';
import './interests.css';

/** Milliseconds for sorting, from any of the three shapes `receivedAt` takes. */
function submissionTime(value: PublicFormSubmission['receivedAt']): number {
  if (!value) return 0;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

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
  const headers = ['ID', 'Form', 'Status', 'Date Received', 'Name', 'Card Name', 'Contact', 'Google Play Email', 'Country', 'Organisation', 'Route / Subject', 'Public Recognition', 'Recognition Name', 'Profile URL', 'Note / Message'];
  const rows = items.map((item) => {
    const isGetInvolved = item.form === 'get-involved';
    const payload = item.payload as GetInvolvedPayload & ContactPayload & TesterRewardPayload;
    return [
      escapeCsv(item.id),
      escapeCsv(item.form),
      escapeCsv(item.status),
      escapeCsv(formatSubmissionDate(item.receivedAt)),
      escapeCsv(payload.name || payload.certificateName || ''),
      escapeCsv(payload.cardName || ''),
      escapeCsv(payload.contact || payload.email || payload.contactEmail || ''),
      escapeCsv(payload.playEmail || ''),
      escapeCsv(payload.country || ''),
      escapeCsv(payload.organisation || ''),
      escapeCsv(isGetInvolved ? payload.route : payload.subject || ''),
      escapeCsv(payload.recognitionChoice || ''),
      escapeCsv(payload.recognitionName || ''),
      escapeCsv(payload.profileUrl || ''),
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
  const isTesterReward = submission.form === 'tester-reward-claim';
  const payload = submission.payload as GetInvolvedPayload & ContactPayload & TesterRewardPayload;
  const isPhone = payload.contact && !payload.contact.includes('@');
  const emailAddr = payload.email || payload.contactEmail || (payload.contact && payload.contact.includes('@') ? payload.contact : '');
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
            <h3 id="interest-modal-title">{payload.name || payload.certificateName || 'Submission'}</h3>
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
              <dt>{isTesterReward ? 'Certificate Name' : 'Full Name'}</dt>
              <dd>{payload.name || payload.certificateName || '—'}</dd>
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
            {isTesterReward ? (
              <>
                <div className="interest-detail-item">
                  <dt>Founding Tester Card</dt>
                  <dd>{payload.cardName || '—'}</dd>
                </div>
                <div className="interest-detail-item">
                  <dt>Google Play Test Email</dt>
                  <dd><a href={`mailto:${payload.playEmail}`} className="contact-link">{payload.playEmail}</a></dd>
                </div>
                <div className="interest-detail-item">
                  <dt>Public Recognition</dt>
                  <dd>{payload.recognitionChoice === 'yes' ? `Yes — ${payload.recognitionName || payload.cardName}` : 'No — keep private'}</dd>
                </div>
                {payload.profileUrl ? <div className="interest-detail-item" style={{ gridColumn: 'span 2' }}><dt>Public Profile</dt><dd><a href={payload.profileUrl} target="_blank" rel="noreferrer" className="contact-link">{payload.profileUrl}</a></dd></div> : null}
                <div className="interest-detail-item" style={{ gridColumn: 'span 2' }}>
                  <dt>Eligibility Confirmations</dt>
                  <dd>Play opt-in · Multiple uses · Official feedback · Honest and specific feedback · Privacy consent</dd>
                </div>
              </>
            ) : isGetInvolved ? (
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
            <h4>{isTesterReward ? 'Additional note' : isGetInvolved ? 'Submitted Note / Proposal' : 'Message'}</h4>
            <div className="interest-note-box">{payload.note || payload.message || 'No additional note provided.'}</div>
          </div>
        </div>

        <footer className="interest-modal__foot">
          <div className="interest-modal__foot-actions">
            {emailAddr ? (
              <a
                href={`mailto:${emailAddr}?subject=${encodeURIComponent(
                  isTesterReward
                    ? 'Regarding your Indigen World Founding Tester reward claim'
                    : `Regarding your Indigen World interest submission (${payload.route || 'Involvement'})`
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
  const [formFilter, setFormFilter] = useState<'get-involved' | 'contact' | 'tester-reward-claim' | 'ALL'>('ALL');
  const [routeFilter, setRouteFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
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

  /* The three select filters narrow the set. Free-text search is deliberately
     not here: the table owns it, so every column that renders a value also
     declares how that value is searched. */
  const filteredSubmissions = useMemo(
    () =>
      submissions.filter((item) => {
        if (formFilter !== 'ALL' && item.form !== formFilter) return false;
        if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
        const payload = item.payload as GetInvolvedPayload;
        if (routeFilter !== 'ALL' && item.form === 'get-involved' && payload.route !== routeFilter) return false;
        return true;
      }),
    [submissions, formFilter, statusFilter, routeFilter],
  );

  // Metrics computation
  const metrics = useMemo(() => {
    const newCount = submissions.filter((s) => s.status === 'new').length;
    const contactedCount = submissions.filter((s) => s.status === 'contacted' || s.status === 'in_progress').length;
    const resolvedCount = submissions.filter((s) => s.status === 'resolved').length;

    // Count by route
    const routesCount: Record<string, number> = {};
    for (const item of submissions.filter((s) => s.form === 'get-involved')) {
      const r = (item.payload as GetInvolvedPayload).route || 'Unspecified';
      routesCount[r] = (routesCount[r] ?? 0) + 1;
    }

    return {
      total: submissions.length,
      newCount,
      contactedCount,
      resolvedCount,
      routesCount,
    };
  }, [submissions]);

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

  const columns: DataColumn<PublicFormSubmission>[] = useMemo(() => {
    const read = (item: PublicFormSubmission) =>
      item.payload as GetInvolvedPayload & ContactPayload & TesterRewardPayload;

    return [
      {
        id: 'received',
        header: 'Received',
        width: '170px',
        mono: true,
        cell: (item) => (
          <button type="button" className="row-select" onClick={() => setActiveSubmission(item)} title="Open the full submission">
            {formatSubmissionDate(item.receivedAt)}
          </button>
        ),
        sort: (item) => submissionTime(item.receivedAt),
        search: (item) => formatSubmissionDate(item.receivedAt),
      },
      {
        id: 'name',
        header: 'Name & details',
        cell: (item) => {
          const payload = read(item);
          const displayName = payload.name || payload.certificateName || '—';
          return (
            <>
              <strong>{displayName}</strong>
              {payload.organisation ? (
                <span className="tiny muted">{payload.organisation}</span>
              ) : item.form === 'tester-reward-claim' && payload.cardName ? (
                <span className="tiny muted">Card: {payload.cardName}</span>
              ) : null}
            </>
          );
        },
        sort: (item) => read(item).name || read(item).certificateName || '',
        search: (item) => `${read(item).name ?? ''} ${read(item).certificateName ?? ''} ${read(item).organisation ?? ''} ${read(item).cardName ?? ''}`,
      },
      {
        id: 'route',
        header: 'Form / route',
        cell: (item) => {
          const payload = read(item);
          if (item.form === 'get-involved' && payload.route) {
            return <span className={getRouteBadgeClass(payload.route)}>{payload.route}</span>;
          }
          if (item.form === 'tester-reward-claim') return <span className="route-badge">Tester reward</span>;
          return <span className="tiny muted">{payload.subject || item.form}</span>;
        },
        sort: (item) => read(item).route || item.form,
        search: (item) => `${item.form} ${read(item).route ?? ''} ${read(item).subject ?? ''}`,
      },
      {
        id: 'contact',
        header: 'Contact',
        cell: (item) => {
          const payload = read(item);
          const email = payload.email || payload.contactEmail || (payload.contact?.includes('@') ? payload.contact : '');
          if (email) return <a href={`mailto:${email}`} className="contact-link">{email}</a>;
          if (payload.contact) return <a href={`tel:${payload.contact}`} className="contact-link">{payload.contact}</a>;
          return <span className="muted">—</span>;
        },
        sort: (item) => read(item).contact || read(item).email || '',
        search: (item) => `${read(item).contact ?? ''} ${read(item).email ?? ''} ${read(item).contactEmail ?? ''} ${read(item).playEmail ?? ''}`,
      },
      {
        id: 'country',
        header: 'Country',
        width: '110px',
        cell: (item) => read(item).country || '—',
        sort: (item) => read(item).country ?? '',
        search: (item) => read(item).country ?? '',
      },
      {
        id: 'note',
        header: 'Note preview',
        cell: (item) => {
          const payload = read(item);
          const note = payload.note || payload.message
            || (item.form === 'tester-reward-claim' ? `Public recognition: ${payload.recognitionChoice}` : '');
          return note ? <span className="dt-clamp" title={note}>{note}</span> : <span className="muted">—</span>;
        },
        search: (item) => `${read(item).note ?? ''} ${read(item).message ?? ''}`,
      },
      {
        id: 'status',
        header: 'Status',
        width: '150px',
        cell: (item) => {
          const status = item.status ?? 'new';
          return (
            <label className={`dt-status dt-status--${toneForStatus(status)}`}>
              <span className="sr-only">Status for this submission</span>
              <select
                value={status}
                onChange={(event) => {
                  const next = event.target.value as SubmissionStatus;
                  void updateSubmissionStatus(item.id, next).then(() => handleStatusChange(item.id, next));
                }}
              >
                {SUBMISSION_STATUSES.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </label>
          );
        },
        sort: (item) => item.status ?? 'new',
        search: (item) => item.status ?? 'new',
      },
      {
        id: 'actions',
        header: 'Open',
        align: 'end',
        width: '86px',
        cell: (item) => (
          <span className="dt-actions">
            <button type="button" className="button button--small" onClick={() => setActiveSubmission(item)}>View</button>
          </span>
        ),
      },
    ];
    // `handleStatusChange` only ever writes to state through a setter.
  }, []);

  return (
    <div className="interests-admin">
      <PageHeader
        level="h1"
        kicker="Community intake"
        title="Form responses & tester claims"
        body="Every website response lands here. Filter by form to isolate Founding Tester reward claims, then work the queue down to zero."
        actions={
          <>
            <button
              type="button"
              onClick={() => exportSubmissionsCsv(filteredSubmissions, `indigen-world-interests-${new Date().toISOString().slice(0, 10)}.csv`)}
              disabled={filteredSubmissions.length === 0}
            >
              Export filtered CSV
            </button>
            <button type="button" className="button--primary" onClick={loadSubmissions} disabled={loading}>
              {loading ? <><Spinner /> Refreshing…</> : 'Refresh'}
            </button>
          </>
        }
      />

      {flashMessage ? <div className="admin-flash" role="status">{flashMessage}</div> : null}

      <StatGrid>
        <Stat label="Total in view" value={metrics.total} />
        <Stat label="New submissions" value={metrics.newCount} tone="warning" note="Nobody has replied to these yet." />
        <Stat label="Contacted / in progress" value={metrics.contactedCount} tone="accent" />
        <Stat label="Resolved" value={metrics.resolvedCount} tone="success" />
      </StatGrid>

      {selectedIds.size > 0 ? (
        <div className="batch-toolbar" role="region" aria-label="Batch actions">
          <span><strong>{selectedIds.size}</strong> selected</span>
          <div className="batch-actions">
            <button type="button" className="button button--small" disabled={busyBatch} onClick={() => void handleBatchStatus('contacted')}>Mark contacted</button>
            <button type="button" className="button button--small" disabled={busyBatch} onClick={() => void handleBatchStatus('resolved')}>Mark resolved</button>
            <button type="button" className="button button--small" disabled={busyBatch} onClick={() => void handleBatchStatus('archived')}>Archive</button>
            <button type="button" className="button button--small" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        </div>
      ) : null}

      <DataTable
        caption="Public form submissions"
        columns={columns}
        rows={filteredSubmissions}
        rowKey={(item) => item.id}
        loading={loading}
        searchable
        searchPlaceholder="Search name, contact, country, note…"
        initialSort={{ columnId: 'received', direction: 'desc' }}
        pageSize={25}
        selection={{
          selectedIds,
          onChange: setSelectedIds,
          rowLabel: (item) => {
            const payload = item.payload as GetInvolvedPayload & TesterRewardPayload;
            return payload.name || payload.certificateName || 'this submission';
          },
        }}
        empty={{
          title: 'No submissions match these filters',
          body: 'Responses from the public website appear here as soon as they are submitted.',
        }}
        filters={
          <>
            <label className="filter">
              <span className="sr-only">Form</span>
              <select
                value={formFilter}
                onChange={(event) => setFormFilter(event.target.value as typeof formFilter)}
              >
                <option value="ALL">All form responses</option>
                <option value="get-involved">Get Involved responses</option>
                <option value="contact">Contact messages</option>
                <option value="tester-reward-claim">Founding Tester reward claims</option>
              </select>
            </label>

            {formFilter === 'get-involved' || formFilter === 'ALL' ? (
              <label className="filter">
                <span className="sr-only">Route</span>
                <select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}>
                  <option value="ALL">All routes</option>
                  {INTEREST_ROUTES.map((route) => (
                    <option key={route} value={route}>{route}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="filter">
              <span className="sr-only">Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="ALL">All statuses</option>
                {SUBMISSION_STATUSES.map((status) => (
                  <option key={status.id} value={status.id}>{status.label}</option>
                ))}
              </select>
            </label>
          </>
        }
      />

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
