import { ContributorIssuesAdmin } from './ContributorIssuesAdmin';
import { ContributorPaymentsDesk } from './ContributorPaymentsDesk';
import { ContributorRewardsDesk } from './ContributorRewardsDesk';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  DataTable,
  PageHeader,
  Panel,
  SegmentedControl,
  Spinner,
  Stat,
  StatGrid,
  StatusPill,
  toneForStatus,
  type DataColumn,
} from '@indigen-world/console-ui';
import { decideSubmission, useAdminAuth } from '../creators/data';
import {
  assignContributorWork,
  prepareDailyTasks,
  cancelContributorInvite,
  fetchContributorAuditEntries,
  fetchContributorDirectory,
  fetchContributorPayments,
  fetchContributorSubmissions,
  inviteContributorWithExpressions,
  resendContributorInvite,
  saveContributor,
  setContributorAccess,
  type AssignmentResult,
  type ContributionType,
  type ContributorAccountStatus,
  type ContributorAuditEntry,
  type ContributorDirectoryRow,
  type ContributorPermissions,
  type ContributorPayments,
  type ContributorProfileInput,
  type ContributorRole,
  type ContributorStatus,
  type ContributorSubmission,
  type ContributorWork,
} from './data';
import './contributors.css';

type View = 'directory' | 'assignments' | 'review' | 'payments' | 'issues' | 'rewards';
type Modal =
  | { kind: 'profile'; contributor?: ContributorDirectoryRow }
  | { kind: 'assignment'; contributor: ContributorDirectoryRow }
  | { kind: 'access'; contributor: ContributorDirectoryRow }
  | { kind: 'share'; contributor: ContributorDirectoryRow; result: AssignmentResult }
  | null;

const ROLES: { id: ContributorRole; label: string }[] = [
  { id: 'translator', label: 'Translator' },
  { id: 'storyteller', label: 'Storyteller' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'reviewer', label: 'Reviewer' },
];
const TYPES: { id: ContributionType; label: string }[] = [
  { id: 'expressions', label: 'Expressions' },
  { id: 'articles', label: 'Articles' },
  { id: 'stories', label: 'Stories' },
  { id: 'research', label: 'Research' },
  { id: 'audio', label: 'Audio' },
];
const EXPERTISE = ['language', 'culture', 'history', 'music', 'storytelling', 'research', 'editing'];

function dateLabel(value: string, fallback = '—'): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'IW';
}

function Avatar({ contributor, large = false }: { contributor: ContributorDirectoryRow; large?: boolean }) {
  return (
    <span className={`contributor-avatar${large ? ' contributor-avatar--large' : ''}`} aria-hidden="true">
      {contributor.photoUrl ? <img src={contributor.photoUrl} alt="" /> : initials(contributor.displayName)}
    </span>
  );
}

function ToggleList<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: { id: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset className="contributor-check-grid">
      <legend>{label}</legend>
      {choices.map((choice) => (
        <label key={choice.id}>
          <input
            type="checkbox"
            checked={value.includes(choice.id)}
            onChange={(event) => onChange(event.target.checked
              ? [...value, choice.id]
              : value.filter((item) => item !== choice.id))}
          />
          {choice.label}
        </label>
      ))}
    </fieldset>
  );
}

function ModalShell({ title, description, onClose, children, footer }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="contributor-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="contributor-modal" role="dialog" aria-modal="true" aria-labelledby="contributor-modal-title">
        <header>
          <div><h2 id="contributor-modal-title">{title}</h2>{description ? <p>{description}</p> : null}</div>
          <button type="button" className="contributor-modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="contributor-modal__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

function profileFrom(contributor?: ContributorDirectoryRow): ContributorProfileInput {
  return {
    contributorId: contributor?.id,
    public: {
      displayName: contributor?.displayName ?? '',
      photoUrl: contributor?.photoUrl ?? '',
      biography: contributor?.biography ?? '',
      expertise: contributor?.expertise ?? [],
      location: contributor?.location ?? '',
      website: contributor?.website ?? '',
      socialLinks: contributor?.socialLinks ?? '',
    },
    private: {
      email: contributor?.email ?? '',
      phone: contributor?.phone ?? '',
      notes: contributor?.notes ?? '',
    },
    roles: contributor?.roles ?? ['translator'],
    contributionTypes: contributor?.contributionTypes ?? ['expressions'],
    permissions: contributor?.permissions ?? { submit: true, edit: true, review: false, publish: false },
    publicVisibility: contributor?.publicVisibility ?? 'hidden',
  };
}

function ProfileModal({ contributor, onClose, onSaved }: {
  contributor?: ContributorDirectoryRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState(() => profileFrom(contributor));
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const publicField = (field: keyof ContributorProfileInput['public'], value: string | string[]) =>
    setForm((current) => ({ ...current, public: { ...current.public, [field]: value } }));
  const privateField = (field: keyof ContributorProfileInput['private'], value: string) =>
    setForm((current) => ({ ...current, private: { ...current.private, [field]: value } }));
  const permission = (field: keyof ContributorPermissions, value: boolean) =>
    setForm((current) => ({ ...current, permissions: { ...current.permissions, [field]: value } }));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await saveContributor(form);
      onSaved(contributor ? 'Contributor profile updated.' : 'Profile-only contributor created.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The profile could not be saved.');
    } finally { setBusy(false); }
  };

  return (
    <ModalShell
      title={contributor ? `Edit ${contributor.displayName}` : 'Add contributor'}
      description="Public profile fields are kept separate from private contact and editorial notes."
      onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        {preview
          ? <><button type="button" onClick={() => setPreview(false)} disabled={busy}>Back to edit</button><button type="button" className="button--primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></>
          : <button type="button" className="button--primary" onClick={() => setPreview(true)} disabled={!form.public.displayName.trim()}>Preview changes</button>}
      </>}
    >
      {error ? <Alert>{error}</Alert> : null}
      {preview ? (
        <div className="contributor-preview">
          <p className="contributor-section-label">Public preview</p>
          <div className="contributor-preview-card">
            <span className="contributor-avatar contributor-avatar--large" aria-hidden="true">
              {form.public.photoUrl ? <img src={form.public.photoUrl} alt="" /> : initials(form.public.displayName)}
            </span>
            <div><h3>{form.public.displayName}</h3><p>{form.public.location || 'No public location'}</p></div>
            <p>{form.public.biography || 'No biography has been added.'}</p>
            <div className="contributor-chip-row">{form.public.expertise.map((item) => <span key={item}>{item}</span>)}</div>
            {form.public.website ? <p>{form.public.website}</p> : null}
          </div>
          <div className="contributor-private-preview"><strong>Private — administrators only</strong><p>{form.private.email || 'No email'} · {form.private.phone || 'No phone'}</p><p>{form.private.notes || 'No internal notes.'}</p></div>
          <Alert tone={form.publicVisibility === 'public' ? 'warning' : 'info'} title={form.publicVisibility === 'public' ? 'Will be publicly visible' : 'Will remain hidden'}>
            Account access is managed separately and is not changed by saving this profile.
          </Alert>
        </div>
      ) : (
        <form className="contributor-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset><legend>Public profile</legend><div className="contributor-form-grid">
            <label>Display name<input required maxLength={120} value={form.public.displayName} onChange={(event) => publicField('displayName', event.target.value)} /></label>
            <label>Location<input maxLength={160} value={form.public.location} onChange={(event) => publicField('location', event.target.value)} /></label>
            <label className="contributor-span-2">Profile photo URL<input type="url" maxLength={2000} value={form.public.photoUrl} onChange={(event) => publicField('photoUrl', event.target.value)} /></label>
            <label className="contributor-span-2">Biography<textarea maxLength={2000} rows={4} value={form.public.biography} onChange={(event) => publicField('biography', event.target.value)} /></label>
            <label>Website<input type="url" maxLength={2000} value={form.public.website} onChange={(event) => publicField('website', event.target.value)} /></label>
            <label>Social links<textarea maxLength={3000} rows={3} placeholder="One URL per line" value={form.public.socialLinks} onChange={(event) => publicField('socialLinks', event.target.value)} /></label>
          </div>
          <ToggleList label="Expertise" choices={EXPERTISE.map((item) => ({ id: item, label: item[0].toUpperCase() + item.slice(1) }))} value={form.public.expertise} onChange={(expertise) => publicField('expertise', expertise)} />
          </fieldset>
          <fieldset><legend>Private contact and notes</legend><div className="contributor-form-grid">
            <label>Email<input type="email" maxLength={254} value={form.private.email} onChange={(event) => privateField('email', event.target.value)} /></label>
            <label>Phone<input maxLength={80} value={form.private.phone} onChange={(event) => privateField('phone', event.target.value)} /></label>
            <label className="contributor-span-2">Internal notes<textarea maxLength={5000} rows={4} value={form.private.notes} onChange={(event) => privateField('notes', event.target.value)} /></label>
          </div></fieldset>
          <fieldset><legend>Roles and access</legend>
            <ToggleList label="Contributor roles" choices={ROLES} value={form.roles} onChange={(roles) => setForm((current) => ({ ...current, roles }))} />
            <ToggleList label="Contribution types" choices={TYPES} value={form.contributionTypes} onChange={(contributionTypes) => setForm((current) => ({ ...current, contributionTypes }))} />
            <fieldset className="contributor-check-grid"><legend>Workspace permissions</legend>{(Object.keys(form.permissions) as (keyof ContributorPermissions)[]).map((item) => <label key={item}><input type="checkbox" checked={form.permissions[item]} onChange={(event) => permission(item, event.target.checked)} />{item[0].toUpperCase() + item.slice(1)}</label>)}</fieldset>
            <label>Public profile visibility<select value={form.publicVisibility} onChange={(event) => setForm((current) => ({ ...current, publicVisibility: event.target.value as 'public' | 'hidden' }))}><option value="hidden">Hidden — draft or internal</option><option value="public">Public — publish profile</option></select></label>
          </fieldset>
        </form>
      )}
    </ModalShell>
  );
}

function AssignmentModal({ contributor, onClose, onComplete }: {
  contributor: ContributorDirectoryRow;
  onClose: () => void;
  onComplete: (result: AssignmentResult) => void;
}) {
  const inviting = contributor.accountStatus === 'none' || contributor.invitation.status === 'cancelled';
  const [email, setEmail] = useState(contributor.email);
  const [phoneNumber, setPhoneNumber] = useState(contributor.phone);
  const [requestId] = useState(() => crypto.randomUUID());
  const [daily, setDaily] = useState(true);
  const [day, setDay] = useState(new Date().toISOString().slice(0,10));
  const [title, setTitle] = useState('Everyday expressions');
  const [deadline, setDeadline] = useState('');
  const [instructions, setInstructions] = useState('Translate each English expression naturally into Kasem. Add alternatives when more than one expression is common.');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const expressions = [...new Set(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (daily && (expressions.length !== 30 || new Set(expressions.map(x=>x.toLocaleLowerCase())).size !== 30 || expressions.some(x=>x.length>180))) throw new Error('Provide exactly 30 different expressions, each no longer than 180 characters.');
      const input = { contributorId: contributor.id, displayName: contributor.displayName, email, phoneNumber, requestId,
        title, deadline, instructions, expressions: daily && inviting ? expressions.slice(0,15) : expressions };
      let result = inviting
        ? await inviteContributorWithExpressions(input)
        : daily ? await prepareDailyTasks({contributorId:contributor.id,day,title,instructions,expressions}) : await assignContributorWork({ ...input, contributorId: contributor.id });
      if(daily && inviting) { const prepared=await prepareDailyTasks({contributorId:result.contributorId,day:new Date().toISOString().slice(0,10),title,instructions,expressions,initialWork:result.work}); result={...result,...prepared}; }
      onComplete(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The assignment could not be created.');
    } finally { setBusy(false); }
  };
  return (
    <ModalShell title={inviting ? `Invite ${contributor.displayName}` : `Assign expressions to ${contributor.displayName}`} description={inviting ? 'Sends an SMS with the portal link and sign-in instructions, creates the first assignment, and enables editing and submission.' : 'Adds a new assignment without changing the contributor’s credentials.'} onClose={onClose} footer={<><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="contributor-assignment-form" className="button--primary" disabled={busy || (daily ? expressions.length !== 30 : expressions.length === 0 || expressions.length > 100) || (inviting && (!email || !phoneNumber.trim()))}>{busy ? 'Creating…' : inviting ? 'Invite by SMS' : 'Assign expressions'}</button></>}>
      {error ? <Alert>{error}</Alert> : null}
      <form id="contributor-assignment-form" className="contributor-form" onSubmit={(event) => void submit(event)}>
        {inviting ? <label>Invitation email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label> : null}
        {inviting ? <><label>SMS phone number<input type="tel" required maxLength={80} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="0241234567 or +233241234567" /></label><p className="muted">New accounts use the phone number including +233 as a temporary password, then choose a new password. Existing accounts keep their current password. The invitation goes by SMS.</p></> : null}
        <div className="contributor-form-grid"><label>Assignment title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Deadline <span className="muted">(optional)</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label></div>
        <label>Instructions<textarea rows={4} maxLength={3000} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
        <label><input type="checkbox" checked={daily} onChange={event=>setDaily(event.target.checked)} />Daily batch: 15 first, then 15 on request</label>
        {daily && !inviting && <label>Task date (UTC)<input type="date" required min={new Date().toISOString().slice(0,10)} value={day} onChange={event=>setDay(event.target.value)} /></label>}
        {daily && <p>Prepare exactly 30 unique tasks. The first 15 are released on the chosen day. The contributor can unlock the remaining 15 once that UTC day after submitting all first 15. Invitations start today.</p>}
        <label>Expressions — one per line<textarea className="contributor-expression-input" required rows={12} maxLength={18100} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder={'How are you?\nI will see you tomorrow.\nThank you for your help.'} /></label>
        <p className={expressions.length > 100 ? 'contributor-count contributor-count--error' : 'contributor-count'}>{expressions.length} unique expression{expressions.length === 1 ? '' : 's'} · {daily ? 'exactly 30 for a daily batch' : 'maximum 100'}</p>
      </form>
    </ModalShell>
  );
}

function AccessModal({ contributor, onClose, onSaved }: {
  contributor: ContributorDirectoryRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [profileStatus, setProfileStatus] = useState<ContributorStatus>(contributor.status);
  const [accountStatus, setAccountStatus] = useState<ContributorAccountStatus>(contributor.accountStatus);
  const [visibility, setVisibility] = useState(contributor.publicVisibility);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const restrictive = profileStatus === 'inactive' || accountStatus === 'suspended' || accountStatus === 'deactivated';
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await setContributorAccess({ contributorId: contributor.id, profileStatus,
        accountStatus: accountStatus === 'none' ? undefined : accountStatus, publicVisibility: visibility, reason });
      onSaved('Contributor access and visibility updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Access could not be updated.');
    } finally { setBusy(false); }
  };
  return (
    <ModalShell title={`Access for ${contributor.displayName}`} description="Relationship status, login access and public visibility are independent. Existing credits and published work are always preserved." onClose={onClose} footer={<><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="button--primary" onClick={() => void submit()} disabled={busy || (restrictive && !reason.trim())}>{busy ? 'Saving…' : 'Apply changes'}</button></>}>
      {error ? <Alert>{error}</Alert> : null}
      <div className="contributor-access-grid">
        <label>Contributor relationship<select value={profileStatus} onChange={(event) => setProfileStatus(event.target.value as ContributorStatus)}><option value="active">Active contributor</option><option value="inactive">Inactive / offboarded</option></select><small>Controls the internal directory status.</small></label>
        <label>Login access<select value={accountStatus} disabled={accountStatus === 'none'} onChange={(event) => setAccountStatus(event.target.value as ContributorAccountStatus)}><option value="none">No login account</option><option value="active">Active</option><option value="suspended">Suspended — reversible</option><option value="deactivated">Deactivated — offboarded</option></select><small>Suspension and deactivation revoke sign-in without deleting work.</small></label>
        <label>Public profile<select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'hidden')}><option value="public">Visible</option><option value="hidden">Hidden</option></select><small>Hiding a profile does not change account access.</small></label>
      </div>
      <label className="contributor-form">Reason {restrictive ? '' : <span className="muted">(optional)</span>}<textarea rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Recorded in the contributor record and audit trail" /></label>
      {restrictive ? <Alert tone="warning" title="This change restricts access">Outstanding assignments remain on record and can be reassigned. Published attribution is not removed.</Alert> : null}
    </ModalShell>
  );
}

function ShareModal({ contributor, result, onClose }: {
  contributor: ContributorDirectoryRow;
  result: AssignmentResult;
  onClose: () => void;
}) {
  const url = result.portalUrl;
  const [copied, setCopied] = useState(false);
  const subject = encodeURIComponent(`Your Indigen World expression assignment`);
  const body = encodeURIComponent(`Hello ${contributor.displayName},\n\nYour expression assignment is ready. Open this private link to begin:\n${url}\n\nPlease keep this link private.`);
  return (
    <ModalShell title={result.sms ? 'Invitation saved' : 'Assignment ready'} description="The assignment is saved." onClose={onClose} footer={<button type="button" className="button--primary" onClick={onClose}>Done</button>}>
      {result.sms ? <Alert tone={result.sms.status === 'accepted' ? 'success' : 'warning'} title={result.sms.status === 'accepted' ? 'SMS accepted for delivery' : result.sms.status === 'failed' ? 'SMS could not be sent' : 'SMS delivery not confirmed'}>{result.sms.status === 'accepted' ? `The invitation was accepted by the SMS provider for ${result.sms.to}. Handset delivery may take a moment.` : 'The account and assignment are saved. Use Resend invitation to retry the SMS without creating another assignment.'}</Alert> : <Alert tone="success" title="Assignment created">Share the portal link with the contributor.</Alert>}
      {result.loginMethod && <p>{result.loginMethod === 'phone' ? 'Sign in with the invited email and phone number in international format, then choose a new password.' : 'This person already has an account. They should sign in with their existing password.'}</p>}
      <label className="contributor-form">Private link<input readOnly value={url} onFocus={(event) => event.target.select()} /></label>
      <div className="contributor-share-actions"><button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy link'}</button>{contributor.email ? <a className="button" href={`mailto:${encodeURIComponent(contributor.email)}?subject=${subject}&body=${body}`}>Open email draft</a> : null}</div>
    </ModalShell>
  );
}

function WorkProgress({ work }: { work: ContributorWork }) {
  const complete = work.itemCount ? Math.round((work.submittedCount / work.itemCount) * 100) : 0;
  return <div className="contributor-progress-cell"><span><strong>{work.submittedCount}</strong> / {work.itemCount} submitted</span><progress value={work.submittedCount} max={work.itemCount || 1} /><small>{work.verifiedCount} verified{work.revisionCount ? ` · ${work.revisionCount} need attention` : ''} · {complete}%</small></div>;
}

function ContributorDetail({ contributor, submissions, audits, onEdit, onAssign, onAccess, onResend, onCancel }: {
  contributor: ContributorDirectoryRow;
  submissions: ContributorSubmission[];
  audits: ContributorAuditEntry[];
  onEdit: () => void;
  onAssign: () => void;
  onAccess: () => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  const history = submissions.filter((item) => item.contributorId === contributor.id);
  const activity = audits.filter((item) => item.targetId === contributor.id).slice(0, 8);
  return (
    <div className="contributor-detail">
      <section className="contributor-detail__identity"><Avatar contributor={contributor} large /><div><h3>{contributor.displayName}</h3><p>{contributor.biography || 'No public biography yet.'}</p><div className="contributor-chip-row">{contributor.expertise.map((item) => <span key={item}>{item}</span>)}</div></div><div className="contributor-detail__actions"><button type="button" onClick={onEdit}>Edit profile</button><button type="button" className="button--primary" onClick={onAssign}>{contributor.accountStatus === 'none' ? 'Invite & assign' : 'Assign expressions'}</button><button type="button" onClick={onAccess}>Access & visibility</button></div></section>
      <div className="contributor-detail-grid">
        <section><h4>Public profile</h4><dl><div><dt>Location</dt><dd>{contributor.location || '—'}</dd></div><div><dt>Website</dt><dd>{contributor.website ? <a href={contributor.website} target="_blank" rel="noreferrer">Open website ↗</a> : '—'}</dd></div><div><dt>Visibility</dt><dd><StatusPill tone={contributor.publicVisibility === 'public' ? 'success' : 'neutral'}>{contributor.publicVisibility}</StatusPill></dd></div></dl></section>
        <section className="contributor-private-card"><h4>Private contact</h4><dl><div><dt>Email</dt><dd>{contributor.email || '—'}</dd></div><div><dt>Phone</dt><dd>{contributor.phone || '—'}</dd></div><div><dt>Internal notes</dt><dd>{contributor.notes || '—'}</dd></div></dl></section>
        <section><h4>Roles & permissions</h4><div className="contributor-chip-row">{contributor.roles.length ? contributor.roles.map((role) => <span key={role}>{role}</span>) : <span>no roles</span>}</div><p className="muted">{(Object.keys(contributor.permissions) as (keyof ContributorPermissions)[]).filter((key) => contributor.permissions[key]).join(' · ') || 'No workspace permissions'}</p></section>
        <section><h4>Invitation & account</h4><p><StatusPill tone={toneForStatus(contributor.invitation.status)}>{contributor.invitation.status.replace('_', ' ')}</StatusPill> <StatusPill tone={toneForStatus(contributor.accountStatus)}>{contributor.accountStatus}</StatusPill></p><p className="muted">Sent {dateLabel(contributor.invitation.sentAt)}{contributor.lastActiveAt ? ` · Last active ${dateLabel(contributor.lastActiveAt)}` : ''}</p>{contributor.invitation.sms && <p>SMS: {contributor.invitation.sms.status === 'accepted' ? 'Accepted by provider' : contributor.invitation.sms.status === 'failed' ? 'Failed — resend to retry' : 'Not confirmed'} · {contributor.invitation.sms.to}</p>}{contributor.invitation.status === 'pending' ? <div className="row-actions"><button type="button" onClick={onResend}>Resend invitation</button><button type="button" className="danger" onClick={onCancel}>Cancel invitation</button></div> : null}</section>
      </div>
      <section><h4>Contribution history</h4>{history.length ? <div className="contributor-history-list">{history.slice(0, 8).map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{dateLabel(item.createdAt)} · {item.alternatives.length} alternatives</small></div><StatusPill tone={toneForStatus(item.status)}>{item.status.replaceAll('_', ' ')}</StatusPill></article>)}</div> : <p className="muted">No submissions yet.</p>}</section>
      <section><h4>Recent administrative activity</h4>{activity.length ? <ol className="contributor-activity">{activity.map((item) => <li key={item.id}><span>{item.action.replaceAll('.', ' / ')}</span><time>{dateLabel(item.occurredAt)}</time></li>)}</ol> : <p className="muted">No contributor-specific audit records in the latest activity window.</p>}</section>
    </div>
  );
}

function AssignmentsView({ rows, onAssign }: { rows: ContributorDirectoryRow[]; onAssign: (row: ContributorDirectoryRow) => void }) {
  const workRows = rows.flatMap((contributor) => contributor.works.map((work) => ({ contributor, work })));
  const columns: DataColumn<(typeof workRows)[number]>[] = [
    { id: 'assignment', header: 'Assignment', cell: ({ work }) => <div className="contributor-primary"><strong>{work.title}</strong><small>{work.instructions || 'No additional instructions'}</small></div>, sort: ({ work }) => work.title, search: ({ work }) => `${work.title} ${work.instructions}` },
    { id: 'contributor', header: 'Contributor', cell: ({ contributor }) => contributor.displayName, sort: ({ contributor }) => contributor.displayName, search: ({ contributor }) => `${contributor.displayName} ${contributor.email}` },
    { id: 'deadline', header: 'Deadline', cell: ({ work }) => work.deadline ? <StatusPill tone={new Date(work.deadline).getTime() < Date.now() && work.submittedCount < work.itemCount ? 'danger' : 'neutral'}>{dateLabel(work.deadline)}</StatusPill> : <span className="muted">No deadline</span>, sort: ({ work }) => work.deadline },
    { id: 'progress', header: 'Progress', cell: ({ work }) => <WorkProgress work={work} />, sort: ({ work }) => work.itemCount ? work.submittedCount / work.itemCount : 0, search: ({ work }) => `${work.submittedCount} ${work.verifiedCount}` },
    { id: 'created', header: 'Assigned', cell: ({ work }) => dateLabel(work.createdAt), sort: ({ work }) => work.createdAt },
    { id: 'more', header: 'Next', align: 'end', cell: ({ contributor }) => <button type="button" className="button button--small" onClick={() => onAssign(contributor)}>Assign more</button> },
  ];
  return <Panel><PageHeader kicker="Work allocation" title="Expression assignments" body="Deadlines, progress and review outcomes for every set of expressions assigned through the contributor portal." /><DataTable caption="Contributor assignments" columns={columns} rows={workRows} rowKey={({ contributor, work }) => `${contributor.id}-${work.id}`} searchable searchPlaceholder="Search assignments or contributors…" initialSort={{ columnId: 'created', direction: 'desc' }} empty={{ title: 'No assignments yet', body: 'Invite a contributor with their first expression set from the directory.' }} /></Panel>;
}

function ReviewView({ submissions, contributors, loading, onReload, onNotice }: {
  submissions: ContributorSubmission[];
  contributors: ContributorDirectoryRow[];
  loading: boolean;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [scope, setScope] = useState<'awaiting' | 'all'>('awaiting');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const awaiting = ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW', 'APPROVED'];
  const rows = scope === 'awaiting' ? submissions.filter((item) => awaiting.includes(item.status)) : submissions;
  const nameFor = (id: string) => contributors.find((item) => item.id === id)?.displayName ?? id;
  const decide = async (submission: ContributorSubmission, decision: string, needsFeedback: boolean) => {
    const feedback = needsFeedback ? window.prompt('Feedback for the contributor: what should change before they resubmit?') ?? '' : '';
    if (needsFeedback && !feedback.trim()) return;
    if (!needsFeedback && !window.confirm(`${decision.replace('_', ' ')} “${submission.title}”?`)) return;
    setBusy(submission.id);
    try { await decideSubmission(submission.id, decision, feedback); onNotice(`“${submission.title}” updated.`); await onReload(); }
    catch (reason) { onNotice(reason instanceof Error ? reason.message : 'The review decision failed.'); }
    finally { setBusy(null); }
  };
  const columns: DataColumn<ContributorSubmission>[] = [
    { id: 'expression', header: 'Expression', cell: (item) => <div className="contributor-primary"><strong>{item.title}</strong><small>{item.body || 'No translation'}</small></div>, sort: (item) => item.title, search: (item) => `${item.title} ${item.body} ${item.alternatives.join(' ')}` },
    { id: 'contributor', header: 'Contributor', cell: (item) => nameFor(item.contributorId), sort: (item) => nameFor(item.contributorId), search: (item) => nameFor(item.contributorId) },
    { id: 'consent', header: 'Permissions', cell: (item) => <div className="contributor-permission-pills"><StatusPill tone={item.publicationPermission ? 'success' : 'danger'}>publish {item.publicationPermission ? 'yes' : 'no'}</StatusPill><StatusPill tone={item.aiTraining ? 'violet' : 'neutral'}>AI {item.aiTraining ? 'yes' : 'no'}</StatusPill></div> },
    { id: 'status', header: 'Status', cell: (item) => <StatusPill tone={toneForStatus(item.status)}>{item.status.replaceAll('_', ' ')}</StatusPill>, sort: (item) => item.status, search: (item) => item.status },
    { id: 'submitted', header: 'Submitted', cell: (item) => dateLabel(item.createdAt), sort: (item) => item.createdAt },
    { id: 'review', header: 'Review', align: 'end', cell: (item) => <button type="button" className="button button--small" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{expanded === item.id ? 'Close' : 'Open'}</button> },
  ];
  return <Panel><PageHeader kicker="Editorial review" title="Expression review" body="Approve translations, request a revision with feedback, or reject work. Every decision is recorded in the existing review audit trail." /><DataTable caption="Invited expression submissions" columns={columns} rows={rows} rowKey={(item) => item.id} loading={loading} searchable searchPlaceholder="Search English, Kasem or contributor…" initialSort={{ columnId: 'submitted', direction: 'desc' }} expandedId={expanded} filters={<SegmentedControl label="Review scope" value={scope} onChange={setScope} options={[{ id: 'awaiting', label: 'Awaiting review', count: submissions.filter((item) => awaiting.includes(item.status)).length }, { id: 'all', label: 'All history', count: submissions.length }]} />} empty={{ title: 'The expression review queue is clear', body: 'New contributor submissions appear here automatically.' }} renderDetail={(item) => <div className="contributor-review-detail"><div><span>English expression</span><strong>{item.title}</strong></div><div><span>Kasem translation</span><strong>{item.body}</strong></div>{item.alternatives.length ? <div><span>Other Kasem expressions</span><ul>{item.alternatives.map((alternative) => <li key={alternative}>{alternative}</li>)}</ul></div> : null}{item.usageContext ? <div><span>Contributor’s usage note</span><strong>{item.usageContext}</strong></div> : null}{item.feedback ? <Alert tone="info" title="Previous feedback">{item.feedback}</Alert> : null}<div className="row-actions">{!['APPROVED', 'PUBLISHED', 'ARCHIVED'].includes(item.status) ? <><button type="button" className="button--primary" disabled={busy === item.id} onClick={() => void decide(item, 'APPROVE', false)}>Approve</button><button type="button" className="danger" disabled={busy === item.id} onClick={() => void decide(item, 'REJECT', true)}>Return with feedback</button><small className="muted">Returned expressions reopen for the contributor to revise and resubmit.</small></> : item.status === 'APPROVED' ? <><button type="button" className="button--primary" disabled={busy === item.id} onClick={() => void decide(item, 'PUBLISH', false)}>Publish to Collection</button><button type="button" disabled={busy === item.id} onClick={() => void decide(item, 'ARCHIVE', false)}>Archive</button></> : item.status === 'PUBLISHED' ? <button type="button" className="danger" disabled={busy === item.id} onClick={() => void decide(item, 'UNPUBLISH', false)}>Unpublish</button> : null}</div></div>} /></Panel>;
}


export function ContributorsAdmin() {
  const [view, setView] = useState<View>('directory');
  const [contributors, setContributors] = useState<ContributorDirectoryRow[]>([]);
  const [submissions, setSubmissions] = useState<ContributorSubmission[]>([]);
  const [audits, setAudits] = useState<ContributorAuditEntry[]>([]);
  const [payments, setPayments] = useState<ContributorPayments>({ statementCheck: 'off', profiles: [], requests: [] });
  // Payout detail is finance-only (separation of duties); other admins never request it.
  const adminAuth = useAdminAuth();
  const canReviewPayments = adminAuth.finance || adminAuth.superAdmin || adminAuth.role === 'super_admin';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [directory, contributionHistory, auditHistory, paymentData] = await Promise.allSettled([
        fetchContributorDirectory(), fetchContributorSubmissions(), fetchContributorAuditEntries(),
        canReviewPayments ? fetchContributorPayments() : Promise.resolve<ContributorPayments>({ statementCheck: 'off', profiles: [], requests: [] }),
      ]);
      if (directory.status === 'fulfilled') setContributors(directory.value);
      if (contributionHistory.status === 'fulfilled') setSubmissions(contributionHistory.value);
      if (auditHistory.status === 'fulfilled') setAudits(auditHistory.value);
      if (paymentData.status === 'fulfilled') setPayments(paymentData.value);
      const failures = [
        ['Contributor directory', directory],
        ['Contribution history', contributionHistory],
        ['Audit history', auditHistory],
        ['Payments', paymentData],
      ] as const;
      setError(failures.flatMap(([label, result]) => result.status === 'rejected'
        ? [`${label}: ${result.reason instanceof Error ? result.reason.message : 'Could not be loaded.'}`]
        : []).join(' '));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Contributor data could not be loaded.');
    } finally { setLoading(false); }
  }, [canReviewPayments]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const locations = useMemo(() => [...new Set(contributors.map((item) => item.location).filter(Boolean))].sort(), [contributors]);
  const filtered = useMemo(() => contributors.filter((item) =>
    (statusFilter === 'ALL' || item.status === statusFilter || item.accountStatus === statusFilter || item.invitation.status === statusFilter)
    && (roleFilter === 'ALL' || item.roles.includes(roleFilter as ContributorRole))
    && (locationFilter === 'ALL' || item.location === locationFilter)
    && (typeFilter === 'ALL' || item.contributionTypes.includes(typeFilter as ContributionType))),
  [contributors, locationFilter, roleFilter, statusFilter, typeFilter]);
  const openReview = submissions.filter((item) => ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(item.status)).length;
  const works = contributors.reduce((total, item) => total + item.works.length, 0);
  const pendingInvites = contributors.filter((item) => item.invitation.status === 'pending').length;
  const openPayments = payments.requests.filter(item => ['submitted', 'approved'].includes(item.status)).length
    + payments.profiles.filter(item => item.bank?.status === 'pending' || item.momo?.ownershipStatus === 'pending').length;

  const finishMutation = async (message: string) => { setModal(null); setNotice(message); await load(); };
  const showShare = async (contributor: ContributorDirectoryRow, result: AssignmentResult) => {
    await load(); setModal({ kind: 'share', contributor, result });
  };
  const resend = async (contributor: ContributorDirectoryRow) => {
    try {
      const result = await resendContributorInvite(contributor.id);
      await showShare(contributor, { contributorId: contributor.id, work: contributor.works[0]?.id ?? '', ...result });
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'The invitation could not be resent.'); }
  };
  const cancel = async (contributor: ContributorDirectoryRow) => {
    const reason = window.prompt('Why is this invitation being cancelled? This is recorded in the audit trail.') ?? '';
    if (!reason.trim()) return;
    if (!window.confirm(`Cancel ${contributor.displayName}’s pending invitation and revoke login access? Their profile and assigned work will be preserved.`)) return;
    try { await cancelContributorInvite(contributor.id, reason); await finishMutation('Invitation cancelled; profile and work preserved.'); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : 'The invitation could not be cancelled.'); }
  };

  const columns: DataColumn<ContributorDirectoryRow>[] = [
    { id: 'contributor', header: 'Contributor', width: '240px', cell: (item) => <div className="contributor-person"><Avatar contributor={item} /><span><strong>{item.displayName}</strong><small>{item.email || 'Profile only · no email'}</small></span></div>, sort: (item) => item.displayName, search: (item) => `${item.displayName} ${item.email} ${item.phone}` },
    { id: 'standing', header: 'Standing', cell: (item) => <div className="contributor-status-stack"><StatusPill tone={toneForStatus(item.status)}>{item.status}</StatusPill><small>{item.publicVisibility} profile</small></div>, sort: (item) => item.status, search: (item) => `${item.status} ${item.publicVisibility} ${item.accountStatus}` },
    { id: 'roles', header: 'Role & type', cell: (item) => <div className="contributor-primary"><strong>{item.roles.join(', ') || 'Unassigned'}</strong><small>{item.contributionTypes.join(', ') || 'No types'}</small></div>, sort: (item) => item.roles.join(' '), search: (item) => `${item.roles.join(' ')} ${item.contributionTypes.join(' ')}` },
    { id: 'location', header: 'Location', cell: (item) => item.location || <span className="muted">Not recorded</span>, sort: (item) => item.location, search: (item) => item.location },
    { id: 'work', header: 'Assignments', align: 'center', cell: (item) => <div className="contributor-work-count"><strong>{item.works.length}</strong><small>{item.works.reduce((sum, work) => sum + work.submittedCount, 0)} submitted</small></div>, sort: (item) => item.works.length },
    { id: 'invitation', header: 'Account', cell: (item) => <div className="contributor-status-stack"><StatusPill tone={toneForStatus(item.invitation.status)}>{item.invitation.status.replace('_', ' ')}</StatusPill><small>{item.accountStatus}</small></div>, sort: (item) => item.invitation.status, search: (item) => `${item.invitation.status} ${item.accountStatus}` },
    { id: 'actions', header: 'Actions', align: 'end', cell: (item) => <div className="row-actions"><button type="button" className="button button--small" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{expanded === item.id ? 'Close' : 'Manage'}</button><button type="button" className="button button--small button--primary" onClick={() => setModal({ kind: 'assignment', contributor: item })}>{item.accountStatus === 'none' ? 'Invite' : 'Assign'}</button></div> },
  ];

  return <div className="contributors-admin">
    {notice ? <div className="contributor-toast" role="status">{notice}</div> : null}
    <Panel>
      <PageHeader level="h1" kicker="People & editorial operations" title="Contributors" body="Manage contributor profiles, account access and expression assignments without separating the people from the work they have already done." actions={<><button type="button" onClick={() => void load()} disabled={loading}>{loading ? <><Spinner /> Refreshing</> : 'Refresh'}</button><button type="button" className="button--primary" onClick={() => setModal({ kind: 'profile' })}>Add contributor</button></>} />
      <StatGrid><Stat label="Contributors" value={contributors.length} note={`${contributors.filter((item) => item.status === 'active').length} active`} tone="accent" /><Stat label="Pending invitations" value={pendingInvites} note="Activation not yet confirmed" tone={pendingInvites ? 'warning' : 'default'} /><Stat label="Expression assignments" value={works} note="Across all contributors" /><Stat label="Awaiting review" value={openReview} note="Submitted or approved" tone={openReview ? 'warning' : 'success'} /></StatGrid>
      <SegmentedControl label="Contributor workspace" value={view} onChange={setView} options={[{ id: 'directory', label: 'Directory', count: contributors.length }, { id: 'assignments', label: 'Assignments', count: works }, { id: 'review', label: 'Review', count: openReview }, { id: 'payments', label: 'Payments', count: openPayments }, { id: 'rewards', label: 'Points & redemptions' }, { id: 'issues', label: 'Issues' }]} />
    </Panel>
    {error ? <Alert title="Some contributor data could not be loaded" action={<button type="button" onClick={() => void load()}>Try again</button>}>{error}</Alert> : null}
    {view === 'directory' ? <Panel><DataTable caption="Contributor directory" columns={columns} rows={filtered} rowKey={(item) => item.id} loading={loading} searchable searchPlaceholder="Search name, email or phone…" initialSort={{ columnId: 'contributor', direction: 'asc' }} expandedId={expanded} filters={<><label className="filter"><span className="sr-only">Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="pending">Invitation pending</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select></label><label className="filter"><span className="sr-only">Role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="ALL">All roles</option>{ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label><label className="filter"><span className="sr-only">Location</span><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option value="ALL">All locations</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label><label className="filter"><span className="sr-only">Contribution type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">All contribution types</option>{TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label></>} empty={{ title: 'No contributors match', body: 'Clear the filters or add a profile-only contributor.' }} renderDetail={(item) => <ContributorDetail contributor={item} submissions={submissions} audits={audits} onEdit={() => setModal({ kind: 'profile', contributor: item })} onAssign={() => setModal({ kind: 'assignment', contributor: item })} onAccess={() => setModal({ kind: 'access', contributor: item })} onResend={() => void resend(item)} onCancel={() => void cancel(item)} />} /></Panel> : null}
    {view === 'assignments' ? <AssignmentsView rows={contributors} onAssign={(contributor) => setModal({ kind: 'assignment', contributor })} /> : null}
    {view === 'review' ? <ReviewView submissions={submissions} contributors={contributors} loading={loading} onReload={async () => { setSubmissions(await fetchContributorSubmissions()); }} onNotice={setNotice} /> : null}
    {view === 'issues' ? <ContributorIssuesAdmin /> : null}
    {view === 'rewards' ? <ContributorRewardsDesk contributors={contributors} /> : null}
    {view === 'payments' ? <ContributorPaymentsDesk payments={payments} contributors={contributors} loading={loading} canReview={canReviewPayments} onReload={async () => { setPayments(await fetchContributorPayments()); }} onNotice={setNotice} /> : null}
    {modal?.kind === 'profile' ? <ProfileModal contributor={modal.contributor} onClose={() => setModal(null)} onSaved={(message) => void finishMutation(message)} /> : null}
    {modal?.kind === 'assignment' ? <AssignmentModal contributor={modal.contributor} onClose={() => setModal(null)} onComplete={(result) => void showShare(modal.contributor, result)} /> : null}
    {modal?.kind === 'access' ? <AccessModal contributor={modal.contributor} onClose={() => setModal(null)} onSaved={(message) => void finishMutation(message)} /> : null}
    {modal?.kind === 'share' ? <ShareModal contributor={modal.contributor} result={modal.result} onClose={() => setModal(null)} /> : null}
  </div>;
}
