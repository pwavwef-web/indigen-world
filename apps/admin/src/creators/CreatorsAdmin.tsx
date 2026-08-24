import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Campaign,
  CreatorApplication,
  CreatorMembership,
  PlatformConfiguration,
  Submission,
} from '@indigen-world/contracts/creator-models';
import { enums } from '@indigen-world/contracts';
import {
  createCampaign,
  decideApplication,
  decideSubmission,
  fetchApplications,
  fetchAuditLogs,
  fetchCampaigns,
  fetchConfig,
  fetchCreatorMemberships,
  fetchReviewQueue,
  isAdmin,
  saveConfig,
  updateCampaign,
  type AdminRole,
} from './data';

type Tab = 'overview' | 'applications' | 'creators' | 'campaigns' | 'review' | 'config' | 'audit';

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['applications', 'Applications'],
  ['creators', 'Creators'],
  ['campaigns', 'Campaigns'],
  ['review', 'Review queue'],
  ['config', 'Configuration'],
  ['audit', 'Audit log'],
];

export function CreatorsAdmin({ role }: { role: AdminRole }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [flash, setFlash] = useState<string | null>(null);
  const notify = useCallback((msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 3500);
  }, []);

  return (
    <div className="creators-admin">
      <nav className="subtabs">
        {TABS.filter(([t]) => (t === 'config' || t === 'audit' ? isAdmin(role) : true)).map(([t, label]) => (
          <button key={t} type="button" className={tab === t ? 'subtab is-active' : 'subtab'} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>

      {flash ? <div className="admin-flash">{flash}</div> : null}

      {tab === 'overview' ? <OverviewTab /> : null}
      {tab === 'applications' ? <ApplicationsTab role={role} notify={notify} /> : null}
      {tab === 'creators' ? <CreatorsDirectoryTab role={role} notify={notify} /> : null}
      {tab === 'campaigns' ? <CampaignsTab role={role} notify={notify} /> : null}
      {tab === 'review' ? <ReviewTab notify={notify} /> : null}
      {tab === 'config' && isAdmin(role) ? <ConfigTab notify={notify} /> : null}
      {tab === 'audit' && isAdmin(role) ? <AuditTab /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function OverviewTab() {
  const [apps, setApps] = useState<CreatorApplication[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [queue, setQueue] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([fetchApplications('ALL'), fetchCampaigns(), fetchReviewQueue()])
      .then(([a, c, q]) => { setApps(a); setCampaigns(c); setQueue(q); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const byStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of apps) counts[a.status] = (counts[a.status] ?? 0) + 1;
    return counts;
  }, [apps]);

  if (loading) return <p className="muted">Loading metrics…</p>;

  const metrics: [string, number | string][] = [
    ['Total applications', apps.length],
    ['Submitted', byStatus.SUBMITTED ?? 0],
    ['Waitlisted', byStatus.WAITLISTED ?? 0],
    ['Approved', byStatus.APPROVED ?? 0],
    ['Flagged / needs info', byStatus.NEEDS_INFO ?? 0],
    ['Campaigns', campaigns.length],
    ['In review queue', queue.length],
    ['Suspended', byStatus.SUSPENDED ?? 0],
  ];

  return (
    <div>
      <h2>Creator overview</h2>
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <div key={label} className="metric">
            <span className="metric__value">{value}</span>
            <span className="metric__label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ApplicationsTab({ role, notify }: { role: AdminRole; notify: (m: string) => void }) {
  const [status, setStatus] = useState('ALL');
  const [rows, setRows] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    setSelectedIds(new Set());
    void fetchApplications(status)
      .then((r) => { setRows(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [status]);
  useEffect(load, [load]);

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
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

  const decide = async (app: CreatorApplication, decision: string, needReason: boolean) => {
    if (!isAdmin(role)) { notify('Admin access required.'); return; }
    let reason = '';
    if (needReason) {
      reason = window.prompt(`Reason for ${decision}?`) ?? '';
      if (!reason.trim()) return;
    } else if (!window.confirm(`${decision} this application?`)) {
      return;
    }
    setBusy(app.id);
    try {
      await decideApplication(app.id, decision, reason);
      notify(`Application ${decision.toLowerCase()}d.`);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  const runBatchAction = async (decision: string) => {
    if (!isAdmin(role)) { notify('Admin access required.'); return; }
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`Apply ${decision} to all ${selectedIds.size} selected applications?`);
    if (!confirmed) return;

    setBusy('batch');
    let successCount = 0;
    try {
      for (const id of selectedIds) {
        await decideApplication(id, decision, `Batch ${decision} processed by admin.`);
        successCount++;
      }
      notify(`Batch ${decision} applied to ${successCount} applications.`);
      load();
    } catch (err) {
      notify(`Batch action interrupted: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="tab-head">
        <div>
          <h2>Creator applications &amp; Intake</h2>
          <p className="tiny muted">Select multiple applications for batch review and approval.</p>
        </div>
        <label className="filter">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">All</option>
            {enums.creatorApplicationStatus.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {/* Batch Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="batch-toolbar">
          <span><strong>{selectedIds.size}</strong> application(s) selected</span>
          <div className="batch-actions">
            <button
              type="button"
              className="button button--small button--approve"
              disabled={busy === 'batch'}
              onClick={() => void runBatchAction('APPROVE')}
            >
              ✓ Batch Approve ({selectedIds.size})
            </button>
            <button
              type="button"
              className="button button--small"
              disabled={busy === 'batch'}
              onClick={() => void runBatchAction('WAITLIST')}
            >
              ⏳ Batch Waitlist ({selectedIds.size})
            </button>
            <button
              type="button"
              className="button button--small danger"
              disabled={busy === 'batch'}
              onClick={() => void runBatchAction('REJECT')}
            >
              ✕ Batch Reject ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No applications.</p> : (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '36px' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === rows.length && rows.length > 0}
                  onChange={toggleSelectAll}
                  aria-label="Select all applications"
                />
              </th>
              <th>Reference</th>
              <th>Name</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const isSelected = selectedIds.has(a.id);
              return (
                <tr key={a.id} className={isSelected ? 'is-selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(a.id)}
                      aria-label={`Select application ${a.reference}`}
                    />
                  </td>
                  <td>{a.reference ?? '—'}{a.flaggedForManualReview ? <span className="flag" title="Flagged for manual review"> ⚑</span> : null}</td>
                  <td>{(a.snapshot?.displayName as string) ?? '—'}</td>
                  <td>{[(a.snapshot?.region as string), (a.snapshot?.country as string)].filter(Boolean).join(', ') || '—'}</td>
                  <td><span className="badge2">{a.status}</span></td>
                  <td className="row-actions">
                    <button type="button" disabled={busy === a.id} onClick={() => void decide(a, 'APPROVE', false)}>Approve</button>
                    <button type="button" disabled={busy === a.id} onClick={() => void decide(a, 'WAITLIST', false)}>Waitlist</button>
                    <button type="button" disabled={busy === a.id} onClick={() => void decide(a, 'REQUEST_INFO', true)}>Request info</button>
                    <button type="button" className="danger" disabled={busy === a.id} onClick={() => void decide(a, 'REJECT', true)}>Reject</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CreatorsDirectoryTab({ role, notify }: { role: AdminRole; notify: (m: string) => void }) {
  const [rows, setRows] = useState<CreatorMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void fetchCreatorMemberships().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const decide = async (membership: CreatorMembership, decision: string, needReason: boolean) => {
    if (!isAdmin(role)) { notify('Admin access required.'); return; }
    let reason = '';
    if (needReason) {
      reason = window.prompt(`Reason for ${decision}?`) ?? '';
      if (!reason.trim()) return;
    } else if (!window.confirm(`${decision} ${membership.userId}?`)) {
      return;
    }
    setBusy(membership.userId);
    try {
      await decideApplication(membership.applicationId, decision, reason);
      notify(`Creator ${decision.toLowerCase()} complete.`);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="tab-head">
        <h2>Creator directory</h2>
      </div>
      {loading ? <p className="muted">Loading creators…</p> : rows.length === 0 ? <p className="muted">No creator memberships yet.</p> : (
        <table className="admin-table">
          <thead><tr><th>User</th><th>Status</th><th>Roles</th><th>Assignments</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.userId}>
                <td><strong>{m.userId}</strong><br /><span className="muted">{m.applicationId}</span></td>
                <td><span className="badge2">{m.status}</span></td>
                <td>{m.roles.join(', ') || '—'}</td>
                <td>
                  <span className="muted">{m.assignedLanguages.join(', ') || 'all languages'}</span><br />
                  <span className="muted">{m.assignedCampaigns.join(', ') || 'no campaigns'}</span>
                </td>
                <td>{m.updatedAt.slice(0, 10)}</td>
                <td className="row-actions">
                  <button type="button" disabled={busy === m.userId || m.status === 'approved'} onClick={() => void decide(m, 'RESTORE', false)}>Reactivate</button>
                  <button type="button" disabled={busy === m.userId || m.status === 'suspended'} onClick={() => void decide(m, 'SUSPEND', true)}>Suspend</button>
                  <button type="button" className="danger" disabled={busy === m.userId || m.status === 'revoked'} onClick={() => void decide(m, 'REVOKE', true)}>Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CampaignsTab({ role, notify }: { role: AdminRole; notify: (m: string) => void }) {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [initiative, setInitiative] = useState('Project Kasena');
  const [description, setDescription] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    void fetchCampaigns().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    if (!isAdmin(role)) { notify('Admin access required.'); return; }
    if (!title.trim() || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) { notify('A title and a lowercase slug are required.'); return; }
    try {
      await createCampaign({ title: title.trim(), slug, initiative, description });
      notify('Campaign created as DRAFT.');
      setTitle(''); setSlug(''); setDescription('');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Create failed.');
    }
  };

  const setStatus = async (c: Campaign, statusValue: string) => {
    if (statusValue === 'SUBMISSIONS_OPEN' && !window.confirm(`Open submissions for "${c.title}"? Eligible creators will gain access immediately.`)) return;
    try {
      await updateCampaign(c.id, { status: statusValue as Campaign['status'] });
      notify(`Status → ${statusValue}`);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const setVisibility = async (c: Campaign, visibility: 'public' | 'internal') => {
    try {
      await updateCampaign(c.id, { visibility });
      notify(`Visibility → ${visibility}`);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  return (
    <div>
      <h2>Campaigns</h2>
      <p className="muted">Move a campaign to <strong>Submissions open</strong> to unlock the submission workflow — no redeploy required.</p>
      {loading ? <p className="muted">Loading…</p> : (
        <table className="admin-table">
          <thead><tr><th>Title</th><th>Status</th><th>Visibility</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.title}</strong><br /><span className="muted">{c.slug}</span></td>
                <td>
                  <select value={c.status} onChange={(e) => void setStatus(c, e.target.value)}>
                    {enums.campaignStatus.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  <select value={c.visibility} onChange={(e) => void setVisibility(c, e.target.value as 'public' | 'internal')}>
                    <option value="internal">internal</option>
                    <option value="public">public</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isAdmin(role) ? (
        <section className="admin-form">
          <h3>Create a campaign</h3>
          <div className="form-row">
            <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>Slug<input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="kasem-creator-challenge" /></label>
          </div>
          <div className="form-row">
            <label>Initiative<input value={initiative} onChange={(e) => setInitiative(e.target.value)} /></label>
          </div>
          <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <button type="button" className="primary" onClick={() => void create()}>Create draft</button>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReviewTab({ notify }: { notify: (m: string) => void }) {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void fetchReviewQueue().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const decide = async (s: Submission, decision: string, needFeedback: boolean) => {
    let feedback = '';
    if (needFeedback) {
      feedback = window.prompt(`Feedback for ${decision}?`) ?? '';
      if (!feedback.trim()) return;
    } else if (!window.confirm(`${decision} "${s.title}"?`)) {
      return;
    }
    setBusy(s.id);
    try {
      await decideSubmission(s.id, decision, feedback);
      notify(`Submission: ${decision}.`);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  const isCollectionContribution = (submission: Submission) =>
    submission.collectionContribution?.collection === 'collectionContributions'
    || Boolean(submission.collectionKind);

  const contentDetails = (content: string, label: string) => {
    const preview = content.length > 140 ? `${content.slice(0, 140).trimEnd()}…` : content;
    return (
      <details className="review-content-details">
        <summary aria-label={`Open full ${label.toLowerCase()}`}>{preview}</summary>
        <div className="review-content-details__full">{content}</div>
      </details>
    );
  };

  return (
    <div>
      <h2>Review queue</h2>
      <p className="muted">Campaign and mobile Collection contributions meet here. Approved work stays visible until it is published or archived, and published work can be unpublished here.</p>
      {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">The queue is empty.</p> : (
        <div className="review-cards">
          {rows.map((s) => (
            <article key={s.id} className="review-card">
              <header>
                <strong>{s.title}</strong>
                <span>
                  {s.collectionKind ? <span className="badge2 badge2--collection">{s.collectionKind}</span> : null}
                  <span className="badge2">{s.status}</span>
                </span>
              </header>
              <dl>
                <div><dt>Category</dt><dd>{s.category || '—'}</dd></div>
                {s.format ? <div><dt>Format</dt><dd>{s.format}</dd></div> : null}
                <div><dt>Studio</dt><dd>{s.studioType || '—'}</dd></div>
                <div><dt>Dialect</dt><dd>{s.dialect || '—'}</dd></div>
                {s.body ? <div className="review-card__content"><dt>Body</dt><dd>{contentDetails(s.body, 'body')}</dd></div> : null}
                {s.sourceReferences ? <div><dt>Source / attribution</dt><dd>{s.sourceReferences}</dd></div> : null}
                {s.externalPostUrl ? (
                  <div>
                    <dt>Recording</dt>
                    <dd><a href={s.externalPostUrl} target="_blank" rel="noreferrer">Open submitted link ↗</a></dd>
                  </div>
                ) : null}
                {s.translationNotes ? <div><dt>Reviewer context</dt><dd>{s.translationNotes}</dd></div> : null}
                {s.translation?.translatedContent ? <div className="review-card__content"><dt>Translation</dt><dd>{contentDetails(s.translation.translatedContent, 'translation')}</dd></div> : null}
                <div><dt>English summary</dt><dd>{s.englishSummary || '—'}</dd></div>
                <div><dt>Minors</dt><dd>{s.disclosures?.involvesMinors ? 'Yes' : 'No'}</dd></div>
                <div><dt>Third-party material</dt><dd>{s.disclosures?.usesThirdPartyMaterial ? 'Yes' : 'No'}</dd></div>
                <div><dt>Publication permission</dt><dd>{s.permissions?.publication ? 'Granted' : 'No'}</dd></div>
                <div><dt>AI training</dt><dd>{s.permissions?.aiTraining ? 'Granted' : 'Off'}</dd></div>
              </dl>
              <div className="row-actions">
                {s.status === 'PUBLISHED' ? (
                  <button
                    type="button"
                    className="danger"
                    disabled={busy === s.id}
                    onClick={() => void decide(s, 'UNPUBLISH', false)}
                  >
                    Unpublish
                  </button>
                ) : s.status !== 'APPROVED' ? (
                  <>
                    <button type="button" disabled={busy === s.id} onClick={() => void decide(s, 'APPROVE', false)}>Approve</button>
                    {!isCollectionContribution(s) ? (
                      <button type="button" disabled={busy === s.id} onClick={() => void decide(s, 'REQUEST_REVISION', true)}>Request revision</button>
                    ) : null}
                    <button type="button" className="danger" disabled={busy === s.id} onClick={() => void decide(s, 'REJECT', true)}>Reject</button>
                  </>
                ) : s.permissions?.publication === true ? (
                  <button
                    type="button"
                    className="button--publish"
                    disabled={busy === s.id}
                    title="Publish this approved work"
                    onClick={() => void decide(s, 'PUBLISH', false)}
                  >
                    Publish to Collection
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button--archive"
                    disabled={busy === s.id}
                    title="Archive approved work that cannot be published without contributor permission"
                    onClick={() => void decide(s, 'ARCHIVE', false)}
                  >
                    Archive
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ConfigTab({ notify }: { notify: (m: string) => void }) {
  const [config, setConfig] = useState<PlatformConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [whatsapp, setWhatsapp] = useState('');
  const [support, setSupport] = useState('');
  const [dialects, setDialects] = useState('');
  const [categories, setCategories] = useState('');

  useEffect(() => {
    void fetchConfig().then((c) => {
      setConfig(c);
      if (c) {
        setWhatsapp(c.whatsappChannelUrl ?? '');
        setSupport(c.supportEmail ?? '');
        setDialects((c.dialects ?? []).map((d) => `${d.slug}:${d.label}`).join('\n'));
        setCategories((c.contentCategories ?? []).map((d) => `${d.slug}:${d.label}`).join('\n'));
      }
      setLoading(false);
    });
  }, []);

  const parsePairs = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [slug, ...rest] = l.split(':');
    return { slug: slug.trim(), label: rest.join(':').trim() || slug.trim() };
  });

  const save = async () => {
    if (!config) return;
    try {
      await saveConfig({
        ...config,
        whatsappChannelUrl: whatsapp.trim(),
        supportEmail: support.trim(),
        dialects: parsePairs(dialects),
        contentCategories: parsePairs(categories),
      });
      notify('Configuration saved.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (!config) return <p className="muted">No configuration document found. Run the seed to create it.</p>;

  return (
    <div>
      <h2>Configuration</h2>
      <label className="stack">WhatsApp Channel URL<input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></label>
      <label className="stack">Support email<input value={support} onChange={(e) => setSupport(e.target.value)} /></label>
      <label className="stack">Dialects (one <code>slug:Label</code> per line)<textarea rows={5} value={dialects} onChange={(e) => setDialects(e.target.value)} /></label>
      <label className="stack">Content categories (one <code>slug:Label</code> per line)<textarea rows={6} value={categories} onChange={(e) => setCategories(e.target.value)} /></label>
      <button type="button" className="primary" onClick={() => void save()}>Save configuration</button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AuditTab() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void fetchAuditLogs().then((r) => { setRows(r); setLoading(false); }); }, []);

  if (loading) return <p className="muted">Loading…</p>;
  return (
    <div>
      <h2>Audit log</h2>
      {rows.length === 0 ? <p className="muted">No audit entries.</p> : (
        <table className="admin-table">
          <thead><tr><th>When</th><th>Action</th><th>Target</th><th>Outcome</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{String(r.occurredAt ?? '').slice(0, 19).replace('T', ' ')}</td>
                <td>{String(r.action ?? '')}</td>
                <td>{(r.target as { collection?: string; id?: string })?.id ?? '—'}</td>
                <td>{String(r.outcome ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
