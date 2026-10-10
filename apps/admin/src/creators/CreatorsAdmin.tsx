import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Campaign,
  CreatorApplication,
  CreatorMembership,
  PlatformConfiguration,
  Submission,
} from '@indigen-world/contracts/creator-models';
import { enums } from '@indigen-world/contracts';
import { auth } from '../firebase';
import {
  createCampaign,
  decideApplication,
  fetchApplications,
  fetchCampaigns,
  fetchConfig,
  fetchCreatorMemberships,
  fetchReviewQueue,
  isAdmin,
  saveConfig,
  fetchCommunityMembers,
  setMemberVerifiedKind,
  updateCampaign,
  VERIFIED_KIND_LABELS,
  VERIFIED_KINDS,
  type AdminRole,
  type CommunityMemberRow,
  type VerifiedKind,
} from './data';
import { EmptyState, Loading, TableShell } from '@indigen-world/console-ui';
import { useSession } from '../session';
import { askText, confirmAction } from '../ui/dialogs';
import { PageHeader, Toast } from '../ui/primitives';

type Tab = 'overview' | 'applications' | 'creators' | 'members' | 'campaigns';

const TAB_COPY: Record<Tab, { title: string; description: string }> = {
  overview: { title: 'Creators', description: 'Applications, profiles, members and campaigns.' },
  applications: { title: 'Applications', description: 'Decide creator applications, one at a time or in a batch.' },
  creators: { title: 'Creator profiles', description: 'Approved creators, with suspension, revocation and reactivation.' },
  members: { title: 'Members', description: 'Community members and the verification marks staff grant.' },
  campaigns: { title: 'Campaigns', description: 'Open, close and publish creator campaigns.' },
};

export function CreatorsAdmin({ tab }: { tab: Tab }) {
  const { access } = useSession();
  const role = access.role;
  const [flash, setFlash] = useState<string | null>(null);
  const notify = useCallback((msg: string) => setFlash(msg), []);

  return (
    <div className="ad-page creators-admin">
      <PageHeader title={TAB_COPY[tab].title} description={TAB_COPY[tab].description} />
      {flash ? <Toast message={flash} tone="info" onDone={() => setFlash(null)} /> : null}
      <div className="panel">
        {tab === 'overview' ? <OverviewTab /> : null}
        {tab === 'applications' ? <ApplicationsTab role={role} notify={notify} /> : null}
        {tab === 'creators' ? <CreatorsDirectoryTab role={role} notify={notify} /> : null}
        {tab === 'members' ? <MembersTab role={role} notify={notify} /> : null}
        {tab === 'campaigns' ? <CampaignsTab role={role} notify={notify} /> : null}
      </div>
    </div>
  );
}

/** Governance → Configuration: dialects, categories and contact links for creators. */
export function PlatformConfiguration() {
  const [flash, setFlash] = useState<string | null>(null);
  return (
    <div className="ad-page creators-admin">
      <PageHeader title="Configuration" description="Dialects, content categories and contact links used across the creator workspace." />
      {flash ? <Toast message={flash} tone="info" onDone={() => setFlash(null)} /> : null}
      <div className="panel"><ConfigTab notify={setFlash} /></div>
    </div>
  );
}

const DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Approve', WAITLIST: 'Waitlist', REQUEST_INFO: 'Request information from', REJECT: 'Reject',
  RESTORE: 'Reactivate', SUSPEND: 'Suspend', REVOKE: 'Revoke',
};

function decisionLabel(decision: string): string {
  return DECISION_LABELS[decision] ?? decision.toLowerCase();
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

  if (loading) return <Loading label="Loading metrics" />;

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
      const answer = await askText({ title: `${decisionLabel(decision)} ${String(app.snapshot?.displayName ?? 'this application')}?`, label: 'Reason shown to the applicant', required: true, multiline: true, maxLength: 1000, confirmLabel: decisionLabel(decision), tone: decision === 'REJECT' ? 'danger' : 'primary' });
      if (answer === null) return;
      reason = answer;
    } else if (!(await confirmAction({ title: `${decisionLabel(decision)} this application?`, body: `${String(app.snapshot?.displayName ?? app.reference ?? '')} — the applicant is notified.`, confirmLabel: decisionLabel(decision) }))) {
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
    const confirmed = await confirmAction({ title: `${decisionLabel(decision)} ${selectedIds.size} applications?`, body: 'Each applicant is notified. Batch decisions are recorded one by one in the audit trail.', confirmLabel: `${decisionLabel(decision)} ${selectedIds.size}`, tone: decision === 'REJECT' ? 'danger' : 'primary' });
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
          <h2 className="sr-only">Applications</h2>
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

      {loading ? <Loading label="Loading" /> : rows.length === 0 ? <EmptyState title="No applications." /> : (
        <TableShell label="Creator applications">
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
        </TableShell>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Community members, and the mark beside their names.
 *
 * Two columns matter here and they answer different questions. **Mark** is what
 * staff grant — the project, a custodian of the language, a published creator.
 * **Phone** is what the member proved for themselves, and a granted mark shows
 * nothing in the app until it is there. Both are on screen together so that
 * "why has their badge not appeared" is answered by looking rather than asking.
 */
function MembersTab({ role, notify }: { role: AdminRole; notify: (m: string) => void }) {
  const [rows, setRows] = useState<CommunityMemberRow[]>([]);
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((search: string) => {
    setLoading(true);
    void fetchCommunityMembers(search)
      .then((r) => { setRows(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => load(''), [load]);

  const grant = async (row: CommunityMemberRow, kind: VerifiedKind) => {
    if (!isAdmin(role)) { notify('Admin access required.'); return; }
    if (!auth.currentUser) { notify('Sign in again.'); return; }
    if (kind === 'project' && !(await confirmAction({ title: `Mark @${row.username} as the project itself?`, body: 'Project accounts show the mark without a verified phone number.', confirmLabel: 'Mark as project' }))) return;
    setBusy(row.uid);
    try {
      await setMemberVerifiedKind(row.uid, kind);
      setRows((current) => current.map((r) => (r.uid === row.uid ? { ...r, verifiedKind: kind } : r)));
      notify(kind ? `@${row.username} is now ${VERIFIED_KIND_LABELS[kind].toLowerCase()}.` : `Mark cleared for @${row.username}.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not change the mark.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <p className="muted">
        A mark is granted here; the phone number behind it is not. Only the project&rsquo;s own accounts
        show a mark without one — everybody else&rsquo;s waits until they have verified a number.
      </p>
      <form
        className="row"
        onSubmit={(event) => { event.preventDefault(); load(handle); }}
      >
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="Find a handle, e.g. amina_paga"
          aria-label="Find a member by handle"
        />
        <button type="submit">Search</button>
        {handle ? (
          <button type="button" onClick={() => { setHandle(''); load(''); }}>Clear</button>
        ) : null}
      </form>

      {loading ? <Loading label="Loading" /> : null}
      {!loading && rows.length === 0 ? <EmptyState title="No members matched." /> : null}
      {!loading && rows.length > 0 ? (
        <TableShell label="Membership lookup results">
          <table className="collection-table">
            <thead>
              <tr><th>Member</th><th>Phone</th><th>Mark</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.uid}>
                  <td>
                    <strong>{row.displayName}</strong>
                    <br />
                    <small className="muted">@{row.username}</small>
                  </td>
                  <td>
                    {row.phoneVerified
                      ? <span>Verified</span>
                      : <span className="muted">Not verified</span>}
                    {!row.phoneVerified && row.verifiedKind && row.verifiedKind !== 'project' ? (
                      <>
                        <br />
                        <small className="muted">Mark is pending</small>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <select
                      value={row.verifiedKind}
                      disabled={busy === row.uid || !isAdmin(role)}
                      aria-label={`Mark for @${row.username}`}
                      onChange={(e) => void grant(row, e.target.value as VerifiedKind)}
                    >
                      {VERIFIED_KINDS.map((kind) => (
                        <option key={kind || 'none'} value={kind}>{VERIFIED_KIND_LABELS[kind]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      ) : null}
    </section>
  );
}

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
      const answer = await askText({ title: `${decisionLabel(decision)} this creator?`, body: membership.userId, label: 'Reason', required: true, multiline: true, maxLength: 1000, confirmLabel: decisionLabel(decision), tone: 'danger' });
      if (answer === null) return;
      reason = answer;
    } else if (!(await confirmAction({ title: `${decisionLabel(decision)} this creator?`, body: membership.userId, confirmLabel: decisionLabel(decision) }))) {
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
        <h2 className="sr-only">Creator directory</h2>
      </div>
      {loading ? <Loading label="Loading creators" /> : rows.length === 0 ? <EmptyState title="No creator memberships yet." /> : (
        <TableShell label="Creator directory">
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
        </TableShell>
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
  const [initiative, setInitiative] = useState('Project Kassena');
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
    if (statusValue === 'SUBMISSIONS_OPEN' && !(await confirmAction({ title: `Open submissions for “${c.title}”?`, body: 'Eligible creators gain access immediately.', confirmLabel: 'Open submissions' }))) return;
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
      <p className="muted">Move a campaign to <strong>Submissions open</strong> to unlock the submission workflow — no redeploy required.</p>
      {loading ? <Loading label="Loading" /> : (
        <TableShell label="Campaigns">
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
        </TableShell>
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

  if (loading) return <Loading label="Loading" />;
  if (!config) return <EmptyState title="No configuration document found. Run the seed to create it." />;

  return (
    <div>
      <label className="stack">WhatsApp Channel URL<input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></label>
      <label className="stack">Support email<input value={support} onChange={(e) => setSupport(e.target.value)} /></label>
      <label className="stack">Dialects (one <code>slug:Label</code> per line)<textarea rows={5} value={dialects} onChange={(e) => setDialects(e.target.value)} /></label>
      <label className="stack">Content categories (one <code>slug:Label</code> per line)<textarea rows={6} value={categories} onChange={(e) => setCategories(e.target.value)} /></label>
      <button type="button" className="primary" onClick={() => void save()}>Save configuration</button>
    </div>
  );
}
