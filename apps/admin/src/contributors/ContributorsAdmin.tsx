import { ContributorIssuesAdmin } from './ContributorIssuesAdmin';
import { SupportInbox } from './SupportInbox';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  DataTable,
  PageHeader as KitPageHeader,
  Panel,
  StatusPill,
  toneForStatus,
  type DataColumn,
} from '@indigen-world/console-ui';
import { Link, useRouter } from '../router';
import { askText, confirmAction } from '../ui/dialogs';
import { Icon } from '../ui/icons';
import {
  Avatar as AdminAvatar,
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Notice,
  PageHeader,
  ProgressBar,
  SearchField,
  Segmented as AdminSegmented,
  Select,
  Skeleton as AdminSkeleton,
  Toast,
  cx,
} from '../ui/primitives';
import {
  assignContributorWork,
  prepareDailyTasks,
  cancelContributorInvite,
  fetchContributorAuditEntries,
  fetchContributorDirectory,
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
  type ContributorProfileInput,
  type ContributorRole,
  type ContributorStatus,
  type ContributorSubmission,
  type ContributorWork,
} from './data';
import './contributors.css';

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
    <Dialog title={title} lede={description} onClose={onClose} footer={footer} size="lg" className="contributor-modal">
      {children}
    </Dialog>
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
  return <Panel><KitPageHeader kicker="Work allocation" title="Expression assignments" body="Deadlines, progress and review outcomes for every set of expressions assigned through the contributor portal." /><DataTable caption="Contributor assignments" columns={columns} rows={workRows} rowKey={({ contributor, work }) => `${contributor.id}-${work.id}`} searchable searchPlaceholder="Search assignments or contributors…" initialSort={{ columnId: 'created', direction: 'desc' }} empty={{ title: 'No assignments yet', body: 'Invite a contributor with their first expression set from the directory.' }} /></Panel>;
}

type ContributorView = 'directory' | 'invitations' | 'assignments' | 'history' | 'support';

const VIEW_COPY: Record<ContributorView, { title: string; description: string }> = {
  directory: { title: 'Contributors', description: 'Manage people, invitations and assignments.' },
  invitations: { title: 'Invitations', description: 'Pending and cancelled invitations, with resend and cancel.' },
  assignments: { title: 'Assignments', description: 'Expression work, deadlines and progress.' },
  history: { title: 'Contribution history', description: 'Every contributor submission and its outcome.' },
  support: { title: 'Support & issues', description: 'Help requests and reported issues from contributors.' },
};

function accountTone(contributor: ContributorDirectoryRow): 'success' | 'warning' | 'danger' | 'neutral' {
  if (contributor.accountStatus === 'suspended' || contributor.accountStatus === 'deactivated') return 'danger';
  if (contributor.invitation.status === 'pending') return 'neutral';
  if (contributor.status === 'active' && contributor.accountStatus === 'active') return 'success';
  return 'neutral';
}

function accountLabel(contributor: ContributorDirectoryRow): string {
  if (contributor.accountStatus === 'suspended') return 'Suspended';
  if (contributor.accountStatus === 'deactivated') return 'Deactivated';
  if (contributor.invitation.status === 'pending') return 'Invited';
  if (contributor.status === 'inactive') return 'Inactive';
  if (contributor.accountStatus === 'active') return 'Active';
  return 'Profile only';
}

function activeWorks(contributor: ContributorDirectoryRow): ContributorWork[] {
  return contributor.works.filter((work) => work.submittedCount < work.itemCount);
}

function ProfilePanel({ contributor, submissions, audits, onClose, onEdit, onAssign, onAccess, onResend, onCancel }: {
  contributor: ContributorDirectoryRow;
  submissions: ContributorSubmission[];
  audits: ContributorAuditEntry[];
  onClose: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onAccess: () => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<'profile' | 'history'>('profile');
  const history = submissions.filter((item) => item.contributorId === contributor.id);
  const activity = audits.filter((item) => item.targetId === contributor.id).slice(0, 8);
  const current = activeWorks(contributor)[0] ?? contributor.works[0];
  return (
    <aside className="ad-detail ad-profile-panel" aria-labelledby="profile-title">
      <div className="ad-detail__head">
        <span />
        <IconButton icon="close" label="Close profile" onClick={onClose} />
      </div>
      <div className="ad-profile-panel__who">
        <AdminAvatar name={contributor.displayName} src={contributor.photoUrl} size="lg" />
        <h2 id="profile-title">{contributor.displayName}</h2>
        <p className="ts-muted">{contributor.roles.map((role) => role[0].toUpperCase() + role.slice(1)).join(', ') || 'Contributor'}</p>
        <Badge tone={accountTone(contributor)} dot>{accountLabel(contributor)}</Badge>
      </div>
      <div className="ts-tabs" role="tablist" aria-label="Contributor details">
        <button type="button" role="tab" className={cx('ts-tab', tab === 'profile' && 'is-active')} aria-selected={tab === 'profile'} onClick={() => setTab('profile')}>Profile</button>
        <button type="button" role="tab" className={cx('ts-tab', tab === 'history' && 'is-active')} aria-selected={tab === 'history'} onClick={() => setTab('history')}>History</button>
      </div>
      {tab === 'profile' ? (
        <>
          <dl className="ad-kv">
            <div><dt>Location</dt><dd>{contributor.location || '—'}</dd></div>
            <div><dt>Assignments</dt><dd>{activeWorks(contributor).length} active</dd></div>
            <div><dt>Contributions</dt><dd>{history.length} submitted</dd></div>
            <div><dt>Last active</dt><dd>{dateLabel(contributor.lastActiveAt)}</dd></div>
            <div><dt>Email</dt><dd>{contributor.email || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{contributor.phone || '—'}</dd></div>
            <div><dt>Profile</dt><dd>{contributor.publicVisibility === 'public' ? 'Public' : 'Hidden'}</dd></div>
            <div><dt>Permissions</dt><dd>{(Object.keys(contributor.permissions) as (keyof ContributorPermissions)[]).filter((key) => contributor.permissions[key]).join(', ') || 'None'}</dd></div>
          </dl>
          {contributor.biography ? <p className="ts-muted">{contributor.biography}</p> : null}
          {current ? (
            <div className="ad-detail__section">
              <h3>Current assignment</h3>
              <div className="ad-assignment-card">
                <strong>{current.title}</strong>
                <span className="ts-muted">{current.submittedCount} of {current.itemCount} submitted{current.deadline ? ` · due ${dateLabel(current.deadline)}` : ''}</span>
                <ProgressBar value={current.submittedCount} max={current.itemCount || 1} label={`${current.title}: ${current.submittedCount} of ${current.itemCount} submitted`} small />
              </div>
            </div>
          ) : null}
          <div className="ad-detail__section">
            <h3>Invitation</h3>
            <p className="ts-muted">{contributor.invitation.status.replace('_', ' ')}{contributor.invitation.sentAt ? ` · sent ${dateLabel(contributor.invitation.sentAt)}` : ''}{contributor.invitation.sms ? ` · SMS ${contributor.invitation.sms.status === 'accepted' ? 'accepted by provider' : contributor.invitation.sms.status === 'failed' ? 'failed' : 'not confirmed'}` : ''}</p>
            {contributor.invitation.status === 'pending' ? (
              <div className="ad-detail__actions"><Button size="sm" onClick={onResend}>Resend invitation</Button><Button size="sm" variant="danger-ghost" onClick={onCancel}>Cancel invitation</Button></div>
            ) : null}
          </div>
          <div className="ad-detail__actions ad-profile-panel__actions">
            <Button variant="primary" block onClick={onAssign}>{contributor.accountStatus === 'none' || contributor.invitation.status === 'cancelled' ? 'Invite & assign' : 'Manage assignments'}</Button>
            <Button block onClick={onEdit}>Edit profile</Button>
            <Button block onClick={onAccess}>Access & visibility</Button>
          </div>
          <div className="ad-profile-panel__links">
            <Link to={`/contributors/history?contributor=${encodeURIComponent(contributor.id)}`} className="ts-link">View contribution history</Link>
            {contributor.authUid ? <Link to={`/finance/redemptions?contributor=${encodeURIComponent(contributor.authUid)}`} className="ts-link">Point redemptions in Finance</Link> : null}
          </div>
        </>
      ) : (
        <>
          <div className="ad-detail__section">
            <h3>Recent contributions</h3>
            {history.length ? (
              <ul className="ad-list">
                {history.slice(0, 8).map((item) => (
                  <li key={item.id}><span><strong>{item.title}</strong><small>{dateLabel(item.createdAt)}</small></span><StatusPill tone={toneForStatus(item.status)}>{item.status.replaceAll('_', ' ').toLowerCase()}</StatusPill></li>
                ))}
              </ul>
            ) : <p className="ts-muted">No submissions yet.</p>}
          </div>
          <div className="ad-detail__section">
            <h3>Administrative activity</h3>
            {activity.length ? (
              <ol className="ad-timeline">{activity.map((item) => <li key={item.id} className="is-done"><span>{item.action.replace(/^contributor\./, '').replaceAll('.', ' · ').replaceAll('_', ' ')}<time>{dateLabel(item.occurredAt)}</time></span></li>)}</ol>
            ) : <p className="ts-muted">No contributor-specific records in the latest activity window.</p>}
          </div>
          <Link to={`/contributors/history?contributor=${encodeURIComponent(contributor.id)}`} className="ts-link">Open full contribution history</Link>
        </>
      )}
    </aside>
  );
}

function DirectoryView({ contributors, submissions, audits, loading, onModal, onResend, onCancel }: {
  contributors: ContributorDirectoryRow[];
  submissions: ContributorSubmission[];
  audits: ContributorAuditEntry[];
  loading: boolean;
  onModal: (modal: Modal) => void;
  onResend: (row: ContributorDirectoryRow) => void;
  onCancel: (row: ContributorDirectoryRow) => void;
}) {
  const { params, setParams } = useRouter();
  const [search, setSearch] = useState('');
  const statusFilter = params.get('status') ?? 'ALL';
  const roleFilter = params.get('role') ?? 'ALL';
  const typeFilter = params.get('type') ?? 'ALL';
  const selectedId = params.get('contributor');
  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => contributors.filter((item) =>
    (statusFilter === 'ALL' || item.status === statusFilter || item.accountStatus === statusFilter || item.invitation.status === statusFilter)
    && (roleFilter === 'ALL' || item.roles.includes(roleFilter as ContributorRole))
    && (typeFilter === 'ALL' || item.contributionTypes.includes(typeFilter as ContributionType))
    && (!needle || [item.displayName, item.email, item.phone, item.location].some((value) => value?.toLowerCase().includes(needle))))
    .sort((a, b) => a.displayName.localeCompare(b.displayName)), [contributors, needle, roleFilter, statusFilter, typeFilter]);
  const selected = contributors.find((item) => item.id === selectedId) ?? null;
  const pendingInvites = contributors.filter((item) => item.invitation.status === 'pending').length;
  const active = contributors.reduce((total, item) => total + activeWorks(item).length, 0);

  return (
    <>
      <div className="ad-tiles">
        <div className="ad-tile"><span className="ad-tile__icon" aria-hidden="true"><Icon name="users" /></span><span className="ad-tile__copy"><span className="ad-tile__value">{loading ? '—' : contributors.length}</span><span className="ad-tile__label">contributors</span></span><span /></div>
        <Link to="/contributors/invitations" className="ad-tile"><span className="ad-tile__icon" aria-hidden="true"><Icon name="mail" /></span><span className="ad-tile__copy"><span className="ad-tile__value">{loading ? '—' : pendingInvites}</span><span className="ad-tile__label">invitations pending</span></span><Icon name="arrow" className="ad-tile__go" /></Link>
        <Link to="/contributors/assignments" className="ad-tile"><span className="ad-tile__icon" aria-hidden="true"><Icon name="doc" /></span><span className="ad-tile__copy"><span className="ad-tile__value">{loading ? '—' : active}</span><span className="ad-tile__label">active assignments</span></span><Icon name="arrow" className="ad-tile__go" /></Link>
      </div>
      <div className={cx('ad-desk', !selected && 'ad-desk--single')}>
        <section className="ad-card-box" aria-labelledby="directory-title">
          <h2 id="directory-title" className="sr-only">Contributor directory</h2>
          <div className="ad-card-box__head ad-toolbar">
            <SearchField label="Search contributors" placeholder="Search contributors…" value={search} onChange={setSearch} />
            <Select label="Status" value={statusFilter} onChange={(value) => setParams({ status: value === 'ALL' ? null : value })} options={[
              { value: 'ALL', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'pending', label: 'Invited' }, { value: 'suspended', label: 'Suspended' }, { value: 'deactivated', label: 'Deactivated' },
            ]} />
            <Select label="Role" value={roleFilter} onChange={(value) => setParams({ role: value === 'ALL' ? null : value })} options={[{ value: 'ALL', label: 'All roles' }, ...ROLES.map((role) => ({ value: role.id, label: role.label }))]} />
            <Select label="Contribution type" value={typeFilter} onChange={(value) => setParams({ type: value === 'ALL' ? null : value })} options={[{ value: 'ALL', label: 'All types' }, ...TYPES.map((type) => ({ value: type.id, label: type.label }))]} />
          </div>
          {loading && !contributors.length ? <div className="ad-card-box__body"><AdminSkeleton lines={6} label="Loading contributors" /></div> : rows.length ? (
            <div className="ad-table-scroll">
              <table className="ad-table" aria-labelledby="directory-title">
                <thead><tr><th scope="col">Contributor</th><th scope="col">Status</th><th scope="col">Assignments</th><th scope="col">Last active</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id} aria-selected={item.id === selectedId} onClick={() => setParams({ contributor: item.id })}>
                      <td>
                        <button type="button" className="ad-row-button ad-person" aria-label={`Open ${item.displayName}’s profile`} onClick={(event) => { event.stopPropagation(); setParams({ contributor: item.id }); }}>
                          <AdminAvatar name={item.displayName} src={item.photoUrl} />
                          <span><strong>{item.displayName}</strong><small>{item.roles.map((role) => role[0].toUpperCase() + role.slice(1)).join(', ') || 'Contributor'}</small></span>
                        </button>
                      </td>
                      <td><Badge tone={accountTone(item)} dot>{accountLabel(item)}</Badge></td>
                      <td className="ad-table__num">{activeWorks(item).length} active</td>
                      <td className="ad-table__num">{dateLabel(item.lastActiveAt)}</td>
                      <td className="ad-table__end"><Icon name="chevron" className="ad-row-chevron" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : contributors.length ? (
            <EmptyState title="No contributors match" body="Clear the filters or search for someone else." />
          ) : (
            <EmptyState title="No contributors yet" body="Add a profile, then invite them with their first assignment." />
          )}
        </section>
        {selected ? (
          <ProfilePanel
            key={selected.id}
            contributor={selected}
            submissions={submissions}
            audits={audits}
            onClose={() => setParams({ contributor: null })}
            onEdit={() => onModal({ kind: 'profile', contributor: selected })}
            onAssign={() => onModal({ kind: 'assignment', contributor: selected })}
            onAccess={() => onModal({ kind: 'access', contributor: selected })}
            onResend={() => onResend(selected)}
            onCancel={() => onCancel(selected)}
          />
        ) : null}
      </div>
    </>
  );
}

function InvitationsView({ contributors, loading, onModal, onResend, onCancel }: {
  contributors: ContributorDirectoryRow[];
  loading: boolean;
  onModal: (modal: Modal) => void;
  onResend: (row: ContributorDirectoryRow) => void;
  onCancel: (row: ContributorDirectoryRow) => void;
}) {
  const [scope, setScope] = useState<'pending' | 'uninvited' | 'cancelled' | 'accepted'>('pending');
  const groups = {
    pending: contributors.filter((item) => item.invitation.status === 'pending'),
    uninvited: contributors.filter((item) => item.invitation.status === 'not_invited' && item.accountStatus === 'none'),
    cancelled: contributors.filter((item) => item.invitation.status === 'cancelled'),
    accepted: contributors.filter((item) => item.invitation.status === 'accepted'),
  };
  const rows = groups[scope];
  return (
    <section className="ad-card-box" aria-labelledby="invites-title">
      <div className="ad-card-box__head">
        <h2 id="invites-title">Invitations</h2>
        <AdminSegmented label="Invitation status" value={scope} onChange={setScope} options={[
          { value: 'pending', label: 'Pending', count: groups.pending.length },
          { value: 'uninvited', label: 'Not invited', count: groups.uninvited.length },
          { value: 'cancelled', label: 'Cancelled', count: groups.cancelled.length },
          { value: 'accepted', label: 'Accepted', count: groups.accepted.length },
        ]} />
      </div>
      {loading && !contributors.length ? <div className="ad-card-box__body"><AdminSkeleton lines={4} /></div> : rows.length ? (
        <div className="ad-table-scroll">
          <table className="ad-table ad-table--static">
            <thead><tr><th scope="col">Contributor</th><th scope="col">Sent</th><th scope="col">SMS</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td><Link to={`/contributors?contributor=${encodeURIComponent(item.id)}`} className="ad-person"><AdminAvatar name={item.displayName} src={item.photoUrl} size="sm" /><span><strong>{item.displayName}</strong><small>{item.email || item.phone || 'No contact details'}</small></span></Link></td>
                  <td className="ad-table__num">{dateLabel(item.invitation.resentAt || item.invitation.sentAt)}{item.invitation.resendCount ? ` · resent ${item.invitation.resendCount}×` : ''}</td>
                  <td>{item.invitation.sms ? <Badge tone={item.invitation.sms.status === 'accepted' ? 'success' : item.invitation.sms.status === 'failed' ? 'danger' : 'neutral'}>{item.invitation.sms.status === 'accepted' ? 'Accepted by provider' : item.invitation.sms.status === 'failed' ? 'Failed' : 'Not confirmed'}</Badge> : '—'}</td>
                  <td className="ad-table__end">
                    <div className="ad-detail__actions">
                      {scope === 'pending' ? <><Button size="sm" onClick={() => onResend(item)}>Resend</Button><Button size="sm" variant="danger-ghost" onClick={() => onCancel(item)}>Cancel</Button></> : null}
                      {scope === 'uninvited' || scope === 'cancelled' ? <Button size="sm" variant="primary" onClick={() => onModal({ kind: 'assignment', contributor: item })}>Invite & assign</Button> : null}
                      {scope === 'accepted' ? <Button size="sm" onClick={() => onModal({ kind: 'assignment', contributor: item })}>Assign work</Button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title={scope === 'pending' ? 'No invitations waiting' : 'Nobody here'} body={scope === 'uninvited' ? 'Every profile has an invitation or an account.' : undefined} />}
    </section>
  );
}

function HistoryView({ contributors, submissions, loading }: { contributors: ContributorDirectoryRow[]; submissions: ContributorSubmission[]; loading: boolean }) {
  const { params, setParams } = useRouter();
  const [search, setSearch] = useState('');
  const contributor = params.get('contributor') ?? 'ALL';
  const status = params.get('status') ?? 'ALL';
  const nameFor = (id: string) => contributors.find((item) => item.id === id)?.displayName ?? id;
  const needle = search.trim().toLowerCase();
  const rows = submissions.filter((item) => (contributor === 'ALL' || item.contributorId === contributor)
    && (status === 'ALL' || item.status === status)
    && (!needle || [item.title, item.body, ...item.alternatives].some((value) => value.toLowerCase().includes(needle))));
  const statuses = [...new Set(submissions.map((item) => item.status))].sort();
  return (
    <section className="ad-card-box" aria-labelledby="history-title">
      <h2 id="history-title" className="sr-only">Contribution history</h2>
      <div className="ad-card-box__head ad-toolbar">
        <SearchField label="Search contributions" placeholder="Search English or Kasem…" value={search} onChange={setSearch} />
        <Select label="Contributor" value={contributor} onChange={(value) => setParams({ contributor: value === 'ALL' ? null : value })} options={[{ value: 'ALL', label: 'All contributors' }, ...contributors.map((item) => ({ value: item.id, label: item.displayName }))]} />
        <Select label="Status" value={status} onChange={(value) => setParams({ status: value === 'ALL' ? null : value })} options={[{ value: 'ALL', label: 'All outcomes' }, ...statuses.map((value) => ({ value, label: value.replaceAll('_', ' ').toLowerCase() }))]} />
      </div>
      <p className="ad-card-box__body ts-hint">The latest 400 contributor submissions. Decisions are made in the <Link to="/review" className="ts-link">Review Desk</Link>.</p>
      {loading && !submissions.length ? <div className="ad-card-box__body"><AdminSkeleton lines={6} /></div> : rows.length ? (
        <div className="ad-table-scroll">
          <table className="ad-table ad-table--static">
            <thead><tr><th scope="col">Expression</th><th scope="col">Contributor</th><th scope="col">Permissions</th><th scope="col">Outcome</th><th scope="col">Submitted</th><th scope="col">Reviewed</th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td><div className="ad-table__primary"><strong>{item.title}</strong><small lang="xsm">{item.body || 'No translation'}</small>{item.feedback ? <small>Feedback: {item.feedback}</small> : null}</div></td>
                  <td>{nameFor(item.contributorId)}</td>
                  <td><div className="ad-summary-line"><Badge tone={item.publicationPermission ? 'success' : 'neutral'}>Publish {item.publicationPermission ? 'granted' : 'not granted'}</Badge><Badge tone={item.aiTraining ? 'violet' : 'neutral'}>AI {item.aiTraining ? 'granted' : 'not granted'}</Badge></div></td>
                  <td><StatusPill tone={toneForStatus(item.status)}>{item.status.replaceAll('_', ' ').toLowerCase()}</StatusPill></td>
                  <td className="ad-table__num">{dateLabel(item.createdAt)}</td>
                  <td className="ad-table__num">{dateLabel(item.reviewedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No contributions match" body={submissions.length ? 'Clear the filters to see everything.' : 'Submissions appear here once contributors send their work.'} />}
    </section>
  );
}

export function ContributorsAdmin({ view }: { view: ContributorView }) {
  const [contributors, setContributors] = useState<ContributorDirectoryRow[]>([]);
  const [submissions, setSubmissions] = useState<ContributorSubmission[]>([]);
  const [audits, setAudits] = useState<ContributorAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<Modal>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [directory, contributionHistory, auditHistory] = await Promise.allSettled([
        fetchContributorDirectory(), fetchContributorSubmissions(), fetchContributorAuditEntries(),
      ]);
      if (directory.status === 'fulfilled') setContributors(directory.value);
      if (contributionHistory.status === 'fulfilled') setSubmissions(contributionHistory.value);
      if (auditHistory.status === 'fulfilled') setAudits(auditHistory.value);
      const failures = [
        ['Contributor directory', directory],
        ['Contribution history', contributionHistory],
        ['Audit history', auditHistory],
      ] as const;
      setError(failures.flatMap(([label, result]) => result.status === 'rejected'
        ? [`${label}: ${result.reason instanceof Error ? result.reason.message : 'Could not be loaded.'}`]
        : []).join(' '));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const finishMutation = async (message: string) => { setModal(null); setNotice(message); await load(); };
  const showShare = async (contributor: ContributorDirectoryRow, result: AssignmentResult) => {
    await load(); setModal({ kind: 'share', contributor, result });
  };
  const resend = async (contributor: ContributorDirectoryRow) => {
    if (!(await confirmAction({ title: `Resend ${contributor.displayName}’s invitation?`, body: 'A new SMS goes to the invited number. No new assignment is created.', confirmLabel: 'Resend invitation' }))) return;
    try {
      const result = await resendContributorInvite(contributor.id);
      await showShare(contributor, { contributorId: contributor.id, work: contributor.works[0]?.id ?? '', ...result });
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'The invitation could not be resent.'); }
  };
  const cancel = async (contributor: ContributorDirectoryRow) => {
    const reason = await askText({
      title: `Cancel ${contributor.displayName}’s invitation?`,
      body: 'Login access is revoked. Their profile and assigned work are preserved.',
      label: 'Reason (recorded in the audit trail)',
      required: true,
      multiline: true,
      maxLength: 1000,
      confirmLabel: 'Cancel invitation',
      tone: 'danger',
    });
    if (reason === null) return;
    try { await cancelContributorInvite(contributor.id, reason); await finishMutation('Invitation cancelled; profile and work preserved.'); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : 'The invitation could not be cancelled.'); }
  };

  return (
    <div className="ad-page contributors-admin">
      <PageHeader
        title={VIEW_COPY[view].title}
        description={VIEW_COPY[view].description}
        actions={view === 'support' ? undefined : <>
          <Button icon="refresh" onClick={() => void load()} disabled={loading}>Refresh</Button>
          <Button variant="primary" icon="plus" onClick={() => setModal({ kind: 'profile' })}>{view === 'invitations' ? 'Invite contributor' : 'Add contributor'}</Button>
        </>}
      />
      {error ? <Notice tone="danger" title="Some contributor data could not be loaded" action={<Button size="sm" onClick={() => void load()}>Try again</Button>}>{error}</Notice> : null}
      {view === 'directory' ? <DirectoryView contributors={contributors} submissions={submissions} audits={audits} loading={loading} onModal={setModal} onResend={(row) => void resend(row)} onCancel={(row) => void cancel(row)} /> : null}
      {view === 'invitations' ? <InvitationsView contributors={contributors} loading={loading} onModal={setModal} onResend={(row) => void resend(row)} onCancel={(row) => void cancel(row)} /> : null}
      {view === 'assignments' ? <AssignmentsView rows={contributors} onAssign={(contributor) => setModal({ kind: 'assignment', contributor })} /> : null}
      {view === 'history' ? <HistoryView contributors={contributors} submissions={submissions} loading={loading} /> : null}
      {view === 'support' ? <div className="ad-support"><SupportInbox /><ContributorIssuesAdmin /></div> : null}
      {notice ? <Toast message={notice} tone="info" onDone={() => setNotice('')} /> : null}
      {modal?.kind === 'profile' ? <ProfileModal contributor={modal.contributor} onClose={() => setModal(null)} onSaved={(message) => void finishMutation(message)} /> : null}
      {modal?.kind === 'assignment' ? <AssignmentModal contributor={modal.contributor} onClose={() => setModal(null)} onComplete={(result) => void showShare(modal.contributor, result)} /> : null}
      {modal?.kind === 'access' ? <AccessModal contributor={modal.contributor} onClose={() => setModal(null)} onSaved={(message) => void finishMutation(message)} /> : null}
      {modal?.kind === 'share' ? <ShareModal contributor={modal.contributor} result={modal.result} onClose={() => setModal(null)} /> : null}
    </div>
  );
}
