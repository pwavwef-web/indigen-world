import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Card, ErrorNote, Icon, Notice, PageHeader, Skeleton, cx } from '../components';
import { formatDate, formatDateTime, friendlyError, initials, type FriendlyError } from '../model';
import type { AccountTab, ActivityVisibility, ProfileInput, SelfView } from '../types';
import { PortalLink, useShared, useWorkspace } from '../workspace';
import { PaymentsPanel } from './PaymentsPanel';

const TABS: { id: AccountTab; label: string; icon: 'user' | 'lock' | 'bell' | 'bank' }[] = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'security', label: 'Sign-in & security', icon: 'lock' },
  { id: 'notifications', label: 'Notifications & visibility', icon: 'bell' },
  { id: 'payments', label: 'Payment details', icon: 'bank' },
];

const DIALECTS = ['Navrongo', 'Paga', 'Chiana', 'Other', 'Not sure'];

/**
 * Account & settings: four separate sections, each with its own save, so a
 * change to notifications never rides along with a change to payment
 * details. Everything is validated again on the server.
 */
export function AccountPage({ tab }: { tab: AccountTab }) {
  const data = useWorkspace();
  const { payments, navigateTo } = useShared();
  const attention = payments.value && (['needs_action', 'rejected'].includes(payments.value.bank?.status ?? '')
    || ['needs_action', 'rejected'].includes(payments.value.momo?.ownershipStatus ?? ''));
  return (
    <div className="ts-page">
      <PageHeader
        kicker="Account"
        title="Account & settings"
        id="page-title"
        description="Your profile, sign-in, notifications and payment details. Each section saves on its own."
      />
      <label className="cw-account-select">
        <span className="sr-only">Account section</span>
        <select className="ts-select" value={tab} onChange={event => navigateTo(data.paths.account(event.target.value as AccountTab))}>
          {TABS.map(entry => <option value={entry.id} key={entry.id}>{entry.label}{entry.id === 'payments' && attention ? ' — needs attention' : ''}</option>)}
        </select>
      </label>
      <div className="cw-account">
        <nav className="cw-account__tabs" aria-label="Account sections">
          {TABS.map((entry) => (
            <PortalLink key={entry.id} to={data.paths.account(entry.id)} className={cx('cw-account__tab', entry.id === tab && 'is-active')} ariaLabel={entry.id === 'payments' && attention ? `${entry.label}, needs attention` : undefined}>
              <Icon name={entry.icon} /><span>{entry.label}</span>{entry.id === 'payments' && attention ? <span className="ts-nav__badge" aria-hidden="true">!</span> : null}
            </PortalLink>
          ))}
        </nav>
        <div className="cw-account__panel ts-enter" key={tab}>
          {tab === 'profile' ? <ProfilePanel /> : tab === 'security' ? <SecurityPanel /> : tab === 'notifications' ? <NotificationsPanel /> : (
            <div className="ts-stack">
              <Notice tone="neutral" title="Bank and MoMo payments">
                <p>These details are for separately arranged payments. Airtime and data rewards use the recipient number entered in Recognition → Redeem; they do not need a bank statement.</p>
              </Notice>
              <PaymentsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SelfGate({ children }: { children: (self: SelfView) => ReactNode }) {
  const { self } = useShared();
  if (self.state === 'loading' && !self.value) return <Card><Skeleton lines={5} label="Loading your account" /></Card>;
  if (!self.value) return <ErrorNote title="Your account details could not be loaded" error={self.error ?? { message: 'Try again in a moment.', reference: null, code: '' }} onRetry={self.refresh} />;
  return <>{children(self.value)}</>;
}

function profileFrom(self: SelfView): ProfileInput {
  return {
    displayName: self.profile.displayName,
    location: self.profile.location,
    biography: self.profile.biography,
    dialect: self.profile.dialect,
    otherLanguages: self.profile.otherLanguages,
    photoUrl: self.profile.photoUrl,
  };
}

function ProfilePanel() {
  return <SelfGate>{(self) => <ProfileForm self={self} />}</SelfGate>;
}

function ProfileForm({ self }: { self: SelfView }) {
  const data = useWorkspace();
  const shared = useShared();
  const [form, setForm] = useState<ProfileInput>(() => profileFrom(self));
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const field = (key: keyof ProfileInput, value: string) => { setForm((current) => ({ ...current, [key]: value })); setSaved(''); };
  const nameProblem = form.displayName.trim().length < 2 ? 'Enter a display name of at least 2 characters.' : '';
  const changed = JSON.stringify(form) !== JSON.stringify(profileFrom(self));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (nameProblem || busy) return;
    setBusy(true); setError(null); setSaved('');
    try {
      const next = await data.services.updateSelf(form);
      shared.self.set(next);
      setForm(profileFrom(next));
      setSaved('Profile saved.');
    } catch (reason) {
      setError(friendlyError(reason, 'Saving your profile'));
    } finally {
      setBusy(false);
    }
  };
  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true); setError(null);
    try {
      field('photoUrl', await data.services.uploadPhoto(file));
    } catch (reason) {
      setError(friendlyError(reason, 'Uploading your photo'));
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <form className="ts-panel cw-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="ts-panel__head"><div className="ts-panel__heading"><h2 className="ts-panel__title">Profile</h2><p className="ts-panel__desc">How the team and, where you allow it, other contributors know you.</p></div></div>
      {error ? <ErrorNote error={error} /> : null}
      <div className="cw-photo-row">
        <span className="ts-avatar ts-avatar--lg" aria-hidden="true">{form.photoUrl ? <img src={form.photoUrl} alt="" /> : initials(form.displayName)}</span>
        <div>
          <span className="ts-label">Photo <small>(optional)</small></span>
          <p className="ts-hint">JPEG, PNG or WebP, up to 5 MB. Shown on your contributor profile if the team makes it public.</p>
          <div className="ts-cluster">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="profile-photo" tabIndex={-1} aria-hidden="true" onChange={(event) => void uploadPhoto(event.target.files?.[0])} />
            <button type="button" className="ts-btn ts-btn--sm" disabled={photoBusy} aria-busy={photoBusy || undefined} onClick={() => fileInput.current?.click()}><span className="ts-btn__spinner" aria-hidden="true" />{!photoBusy ? <Icon name="upload" /> : null}{photoBusy ? 'Uploading…' : form.photoUrl ? 'Change photo' : 'Upload photo'}</button>
            {form.photoUrl ? <button type="button" className="ts-link" onClick={() => field('photoUrl', '')}>Remove photo</button> : null}
          </div>
        </div>
      </div>
      <div className="cw-form-grid">
        <label className="ts-field">
          <span className="ts-label">Display name <span className="ts-required" aria-hidden="true">*</span></span>
          <input value={form.displayName} maxLength={80} required autoComplete="name" aria-invalid={Boolean(nameProblem)} aria-describedby="display-name-help" onChange={(event) => field('displayName', event.target.value)} />
          <small id="display-name-help">{nameProblem || 'Used in the workspace, and in community activity only if you choose to be named.'}</small>
        </label>
        <label className="ts-field">
          <span className="ts-label">Town or region</span>
          <input value={form.location} maxLength={120} autoComplete="address-level2" placeholder="For example, Navrongo" onChange={(event) => field('location', event.target.value)} />
        </label>
        <label className="ts-field">
          <span className="ts-label">Kasem variety you speak</span>
          <select value={form.dialect} onChange={(event) => field('dialect', event.target.value)}>
            <option value="">Not stated</option>
            {DIALECTS.map((dialect) => <option key={dialect} value={dialect}>{dialect}</option>)}
          </select>
          <small>“Other” and “Not sure” are both fine.</small>
        </label>
        <label className="ts-field">
          <span className="ts-label">Other languages</span>
          <input value={form.otherLanguages} maxLength={200} placeholder="For example, English, Twi, French" onChange={(event) => field('otherLanguages', event.target.value)} />
        </label>
        <label className="ts-field cw-field--wide">
          <span className="ts-label">About you <small>(optional)</small></span>
          <textarea value={form.biography} maxLength={1000} rows={3} placeholder="A sentence or two about your connection to Kasem." onChange={(event) => field('biography', event.target.value)} />
        </label>
      </div>
      <dl className="ts-kv">
        <div>
          <dt>Contributor ID</dt>
          <dd><code>{self.contributorId}</code> <button type="button" className="ts-link" onClick={() => { void navigator.clipboard?.writeText(self.contributorId).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? 'Copied' : 'Copy'}</button></dd>
        </div>
        <div><dt>Roles</dt><dd>{self.profile.roles.join(', ') || 'Translator'}</dd></div>
        <div><dt>Public profile</dt><dd>{self.profile.publicVisibility === 'public' ? 'Visible — managed by the team' : 'Hidden — managed by the team'}</dd></div>
        {!self.permissions.submit || !self.permissions.edit ? <div><dt>Workspace access</dt><dd>{!self.permissions.edit ? 'Editing is paused for your account. ' : ''}{!self.permissions.submit ? 'Submitting is paused for your account. ' : ''}Contact the team.</dd></div> : null}
      </dl>
      <div className="cw-form__actions">
        {saved ? <span role="status" className="ts-save"><span className="ts-save__mark" aria-hidden="true"><Icon name="check" /></span>{saved}</span> : null}
        <button type="submit" className="ts-btn ts-btn--primary" disabled={busy || !changed || Boolean(nameProblem)}>{busy ? 'Saving…' : 'Save profile'}</button>
      </div>
    </form>
  );
}

function SecurityPanel() {
  return <SelfGate>{(self) => <SecurityForm self={self} />}</SelfGate>;
}

function SecurityForm({ self }: { self: SelfView }) {
  const data = useWorkspace();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [notice, setNotice] = useState('');
  const problem = next && next.length < 8 ? 'Use at least 8 characters.' : confirm && next !== confirm ? 'The two new passwords do not match.' : '';

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || problem || !current || !next) return;
    setBusy(true); setError(null); setNotice('');
    try {
      await data.services.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setNotice('Password changed. Use the new one next time you sign in.');
    } catch (reason) {
      setError(friendlyError(reason, 'Changing your password'));
    } finally {
      setBusy(false);
    }
  };
  const sendReset = async () => {
    setBusy(true); setError(null); setNotice('');
    try {
      await data.services.sendPasswordReset();
      setNotice(`A reset link is on its way to ${self.contact.email || data.email}. Check your spam folder if it does not arrive.`);
    } catch (reason) {
      setError(friendlyError(reason, 'Sending a reset link'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ts-stack">
      <Card title="How you sign in" meta="Your contributor account uses email and password.">
        <dl className="ts-kv">
          <div><dt>Email</dt><dd>{self.contact.email || data.email}</dd></div>
          <div><dt>Phone on file</dt><dd>{self.contact.phoneMasked || 'None'} <span className="ts-hint">— from your invitation. Contact the team to change it.</span></dd></div>
          <div><dt>Last sign-in</dt><dd>{self.account.lastSignInAt ? formatDateTime(self.account.lastSignInAt) : '—'}</dd></div>
          <div><dt>Account activated</dt><dd>{self.account.activatedAt ? formatDate(self.account.activatedAt, true) : 'Activated with an existing Indigen World account'}</dd></div>
        </dl>
        <p className="ts-hint">To change your email address, contact the team: it is how your invitation and password resets reach you.</p>
      </Card>
      <form className="ts-panel cw-form" onSubmit={(event) => void changePassword(event)}>
        <div className="ts-panel__head"><div className="ts-panel__heading"><h2 className="ts-panel__title">Change password</h2><p className="ts-panel__desc">You will be asked for your current password first.</p></div></div>
        {error ? <ErrorNote error={error} /> : null}
        {notice ? <Notice tone="success" role="status">{notice}</Notice> : null}
        <input type="email" autoComplete="username" value={self.contact.email || data.email} readOnly hidden />
        <div className="cw-form-grid">
          <label className="ts-field cw-field--wide">
            <span className="ts-label">Current password</span>
            <input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
          </label>
          <label className="ts-field">
            <span className="ts-label">New password</span>
            <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={next} onChange={(event) => setNext(event.target.value)} aria-describedby="new-password-help" required />
            <small id="new-password-help">At least 8 characters. Do not reuse your phone number.</small>
          </label>
          <label className="ts-field">
            <span className="ts-label">Confirm new password</span>
            <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} aria-invalid={Boolean(problem)} required />
            {problem ? <small className="ts-error">{problem}</small> : null}
          </label>
        </div>
        <div className="cw-form__actions">
          <button type="button" className="ts-link" disabled={busy} onClick={() => void sendReset()}>Email me a reset link instead</button>
          <button type="submit" className="ts-btn ts-btn--primary" disabled={busy || Boolean(problem) || !current || !next || !confirm}>{busy ? 'Working…' : 'Change password'}</button>
        </div>
      </form>
      <Card title="Staying safe">
        <ul className="cw-guide__points">
          <li>Indigen World never asks for your password or a verification code by phone, SMS or WhatsApp.</li>
          <li>Sign out on shared computers.</li>
        </ul>
        <button type="button" className="ts-btn ts-btn--danger-ghost" onClick={() => void data.services.signOut()}><Icon name="logout" />Sign out on this device</button>
      </Card>
    </div>
  );
}

function NotificationsPanel() {
  return <SelfGate>{(self) => <NotificationsForm self={self} />}</SelfGate>;
}

const VISIBILITY: { id: ActivityVisibility; label: string; example: (name: string) => string }[] = [
  { id: 'anonymous', label: 'Anonymously', example: () => '“A contributor sent 12 expressions for review”' },
  { id: 'name', label: 'By my display name', example: (name) => `“${name || 'Your name'} sent 12 expressions for review”` },
  { id: 'hidden', label: 'Do not include me', example: () => 'No row about you. Your work still counts in the day’s totals.' },
];

function NotificationsForm({ self }: { self: SelfView }) {
  const data = useWorkspace();
  const shared = useShared();
  const [visibility, setVisibility] = useState(self.settings.activityVisibility);
  const [notifications, setNotifications] = useState(self.settings.notifications);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState('');
  useEffect(() => {
    setVisibility(self.settings.activityVisibility);
    setNotifications(self.settings.notifications);
  }, [self.settings]);
  const changed = visibility !== self.settings.activityVisibility || JSON.stringify(notifications) !== JSON.stringify(self.settings.notifications);
  const toggle = (key: keyof typeof notifications) => { setNotifications((current) => ({ ...current, [key]: !current[key] })); setSaved(''); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null); setSaved('');
    try {
      const settings = await data.services.saveSettings({ activityVisibility: visibility, notifications });
      shared.self.set({ ...self, settings });
      setSaved('Preferences saved.');
    } catch (reason) {
      setError(friendlyError(reason, 'Saving your preferences'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ts-stack" onSubmit={(event) => void submit(event)}>
      {error ? <ErrorNote error={error} /> : null}
      <Card title="Community activity" meta="How you appear in “Community today” on the Overview and Activity pages.">
        <fieldset className="cw-choice-group">
          <legend className="sr-only">Show my contributions in community activity</legend>
          {VISIBILITY.map((option) => (
            <label key={option.id} className="ts-check ts-check--card">
              <input type="radio" name="visibility" value={option.id} checked={visibility === option.id} onChange={() => { setVisibility(option.id); setSaved(''); }} />
              <span className="ts-check__copy"><strong>{option.label}{option.id === 'anonymous' ? ' (default)' : ''}</strong><small>{option.example(self.profile.displayName)}</small></span>
            </label>
          ))}
        </fieldset>
        <p className="ts-hint">Only counts are shared — never the expressions, your translations or your assignments. <PortalLink to={data.paths.section('guide', { section: 'privacy' })} className="ts-link">Privacy in the guide</PortalLink></p>
      </Card>
      <Card title="Updates" meta="In-app updates always appear in Activity.">
        <div className="ts-stack ts-stack--md">
          <Switch checked={notifications.reviewEmail} onChange={() => toggle('reviewEmail')} label="Email me when a reviewer decides on my work" hint={`Sent to ${self.contact.email || data.email}.`} />
          <Switch checked={notifications.paymentEmail} onChange={() => toggle('paymentEmail')} label="Email me about payment verification" hint="When a finance reviewer verifies your details or needs something from you." />
          <Switch checked={notifications.paymentSms} onChange={() => toggle('paymentSms')} label="Text me about payment verification" hint={self.contact.phoneMasked ? `Sent to ${self.contact.phoneMasked} by SMS.` : 'Needs a phone number on file; ask the team to add one.'} disabled={!self.contact.phoneMasked} />
        </div>
      </Card>
      <div className="cw-form__actions">
        {saved ? <span role="status" className="ts-save"><span className="ts-save__mark" aria-hidden="true"><Icon name="check" /></span>{saved}</span> : null}
        <button type="submit" className="ts-btn ts-btn--primary" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save preferences'}</button>
      </div>
    </form>
  );
}

function Switch({ checked, onChange, label, hint, disabled = false }: { checked: boolean; onChange: () => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className={cx('ts-switch', disabled && 'is-disabled')}>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="ts-switch__track" aria-hidden="true" />
      <span className="ts-check__copy"><strong>{label}</strong><small>{hint}</small></span>
    </label>
  );
}
