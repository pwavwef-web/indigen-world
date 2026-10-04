import { useEffect, useState } from 'react';
import type { CreatorProfile } from '@indigen-world/contracts/creator-models';
import { enums } from '@indigen-world/contracts';
import { useAuth } from '../../auth';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';
import { fetchMyProfile, updateMyProfile } from '../data';
import { Field, LoadError, useReloadable } from '../components';
import { Badge, Button, ButtonLink, EmptyState, Icon, KeyValue, PageHeader, Panel, ProgressBar, Skeleton, Switch } from '../../ui';

const SECTIONS = [
  ['profile-public', 'Public identity'],
  ['profile-creator', 'Creator focus'],
  ['profile-contact', 'Contact'],
  ['profile-preferences', 'Preferences'],
] as const;

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ProfilePage() {
  const { user } = useAuth();
  const { config } = useConfig();
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastFailed, setToastFailed] = useState(false);
  const [active, setActive] = useState<string>(SECTIONS[0][0]);

  // Editable local copy of the public + contact fields.
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [region, setRegion] = useState('');
  const [locationPrivacy, setLocationPrivacy] = useState<CreatorProfile['locationPrivacy']>('region_only');
  const [dialect, setDialect] = useState('');
  const [proficiency, setProficiency] = useState('learning');
  const [interests, setInterests] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [communities, setCommunities] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [experience, setExperience] = useState('');
  const [motivation, setMotivation] = useState('');
  const [equipment, setEquipment] = useState('');
  const [social, setSocial] = useState('');
  const [phone, setPhone] = useState('');
  const [contactMethod, setContactMethod] = useState('whatsapp');
  const [availability, setAvailability] = useState('');
  const [emailPref, setEmailPref] = useState(true);
  const [inAppPref, setInAppPref] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    setLoading(true);
    void fetchMyProfile(user.uid).then((p) => {
      if (!active) return;
      setProfile(p);
      if (p) {
        setBio(p.public.bio ?? '');
        setIsPublic(p.public.isPublic ?? false);
        setRegion(p.public.region ?? '');
        setLocationPrivacy(p.locationPrivacy ?? 'region_only');
        setDialect(p.public.dialect ?? '');
        setProficiency(p.public.kasemProficiency ?? 'learning');
        setInterests(p.public.interests ?? []);
        setFormats(p.public.formats ?? []);
        setCommunities((p.culturalCommunities ?? []).join(', '));
        setSkills(p.skills ?? p.public.interests ?? []);
        setExperience(p.experience ?? '');
        setMotivation(p.motivation ?? '');
        setEquipment(p.equipment ?? '');
        setSocial((p.public.socialLinks ?? []).map((s) => s.url).join(', '));
        setPhone(p.contact?.phone ?? '');
        setContactMethod(p.contact?.preferredContactMethod ?? 'whatsapp');
        setAvailability(p.availability ?? '');
        setEmailPref(p.notificationPreferences?.email ?? true);
        setInAppPref(p.notificationPreferences?.inApp ?? true);
      }
      setLoading(false);
    }).catch(() => {
      if (active) { setFailed(true); setLoading(false); }
    });
    return () => { active = false; };
  }, [user, reloadKey, setFailed]);

  // The section navigation follows the reader down the form.
  useEffect(() => {
    if (loading || !profile || typeof IntersectionObserver === 'undefined') return;
    const sections = SECTIONS.map(([id]) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-20% 0px -65% 0px' });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [loading, profile]);

  const save = async () => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      await updateMyProfile(user.uid, profile, {
        public: {
          isPublic,
          bio,
          region,
          dialect,
          kasemProficiency: proficiency as never,
          interests,
          formats,
          socialLinks: social.split(',').map((s) => s.trim()).filter(Boolean).map((url) => ({ platform: 'link', url })),
        },
        contact: { phone, preferredContactMethod: contactMethod as never },
        culturalCommunities: communities.split(',').map((s) => s.trim()).filter(Boolean),
        skills,
        experience,
        motivation,
        equipment,
        locationPrivacy,
        availability,
        notificationPreferences: { email: emailPref, inApp: inAppPref },
      });
      trackEvent('profile_completed');
      setToastFailed(false);
      setToast('Profile saved.');
      window.setTimeout(() => setToast(null), 3000);
      setProfile(await fetchMyProfile(user.uid));
    } catch (err) {
      setToastFailed(true);
      setToast(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const header = <PageHeader kicker="Account" title="Your profile" />;

  if (failed) {
    return <div className="ts-page">{header}<LoadError title="Could not load your profile" onRetry={retry} /></div>;
  }

  if (loading) {
    return <div className="ts-page">{header}<div className="ts-panel"><Skeleton lines={8} title label="Loading your profile" /></div></div>;
  }

  if (!profile) {
    return (
      <div className="ts-page ts-page--medium">
        {header}
        <EmptyState boxed icon="user" title="No creator profile yet" body="Your profile is created when you join the founding creator programme."
          actions={<ButtonLink to="/creators/join" variant="primary" iconRight="arrow">Join the programme</ButtonLink>} />
      </div>
    );
  }

  const dialects = config?.dialects ?? [];
  const categories = config?.contentCategories ?? [];
  const contentFormats = config?.contentFormats ?? [];
  const previewInitials = profile.public.initials
    ?? profile.public.displayName.slice(0, 2).toUpperCase();
  const completionSignals: Array<string | number | boolean> = [
    bio.trim(),
    region.trim(),
    dialect,
    interests.length,
    skills.length,
    experience.trim(),
    phone.trim(),
    availability.trim(),
  ];
  if (contentFormats.length > 0) completionSignals.push(formats.length);
  const profileCompletion = Math.round(
    (completionSignals.filter(Boolean).length / completionSignals.length) * 100,
  );
  const previewMeta = [region, dialect].filter(Boolean).join(' · ') || 'Kassena community';
  const statusLabel = profile.status ?? 'waitlisted';

  return (
    <div className="ts-page cr-profile">
      <header className="profile-hero">
        <div className="profile-hero__identity">
          <div className="profile-avatar" aria-hidden="true">
            {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : previewInitials}
          </div>
          <div className="profile-hero__copy">
            <p className="ts-kicker">Creator identity</p>
            <h1 className="ts-page-head__title" id="page-title" tabIndex={-1}>{profile.public.displayName}</h1>
            <p className="profile-hero__handle">
              <span>{profile.public.username ? `@${profile.public.username}` : 'Username pending'}</span>
              <Badge tone={statusLabel === 'active' ? 'success' : statusLabel === 'suspended' ? 'danger' : 'neutral'} dot caps>{statusLabel}</Badge>
              {profile.reference ? <span className="profile-hero__reference ts-mono">{profile.reference}</span> : null}
            </p>
          </div>
        </div>
        <div className="profile-hero__progress">
          <div className="profile-hero__progress-head">
            <span>Profile strength</span>
            <strong className="ts-num">{profileCompletion}%</strong>
          </div>
          <ProgressBar value={profileCompletion} label="Profile completion" tone={profileCompletion === 100 ? 'success' : undefined} />
          <small>Complete your details to help reviewers and communities understand your work.</small>
        </div>
      </header>

      <nav className="profile-nav" aria-label="Profile sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={active === id ? 'is-active' : undefined} aria-current={active === id ? 'true' : undefined}>{label}</a>
        ))}
      </nav>

      <div className="profile-layout">
        <div className="profile-form">
          <section className="ts-panel profile-section" id="profile-public" aria-labelledby="profile-public-title">
            <div className="profile-section__head">
              <span className="profile-section__index" aria-hidden="true">01</span>
              <div>
                <p className="ts-overline">Visible attribution</p>
                <h2 id="profile-public-title">Public identity <Badge tone="accent">Public</Badge></h2>
                <p>Shape how your name, language background, and community appear beside published work.</p>
              </div>
            </div>
            <div className="field-row">
              <Field label="Display name" htmlFor="displayName" hint="Set at registration; contact support to change.">
                <input id="displayName" className="ts-input" value={profile.public.displayName} disabled />
              </Field>
              <Field label="Username" htmlFor="username" hint="Reserved during application review.">
                <input id="username" className="ts-input" value={profile.public.username ? `@${profile.public.username}` : 'Not set'} disabled />
              </Field>
            </div>
            <label className="ts-check ts-check--card">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              <span className="ts-check__copy">
                <strong>Show my creator profile publicly</strong>
                <small>Your profile becomes visible only after programme approval.</small>
              </span>
            </label>
            <Field label="Short bio" htmlFor="bio">
              <textarea id="bio" className="ts-textarea" value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} />
            </Field>
            <p className="ts-counter" aria-live="polite">{bio.length} / 600</p>
            <div className="field-row">
              <Field label="Region / community" htmlFor="region">
                <input id="region" className="ts-input" value={region} onChange={(e) => setRegion(e.target.value)} />
              </Field>
              <Field label="Location privacy" htmlFor="locationPrivacy">
                <select id="locationPrivacy" className="ts-select" value={locationPrivacy} onChange={(e) => setLocationPrivacy(e.target.value as CreatorProfile['locationPrivacy'])}>
                  <option value="public">Show country and region</option>
                  <option value="region_only">Show region only</option>
                  <option value="private">Keep private</option>
                </select>
              </Field>
            </div>
            <Field label="Cultural communities represented" htmlFor="communities" hint="Comma-separated.">
              <input id="communities" className="ts-input" value={communities} onChange={(e) => setCommunities(e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Kasem proficiency" htmlFor="prof">
                <select id="prof" className="ts-select" value={proficiency} onChange={(e) => setProficiency(e.target.value)}>
                  {enums.kasemProficiency.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Dialect / variant" htmlFor="dialect">
                <select id="dialect" className="ts-select" value={dialect} onChange={(e) => setDialect(e.target.value)}>
                  <option value="">Select…</option>
                  {dialects.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
                </select>
              </Field>
            </div>
          </section>

          <section className="ts-panel profile-section" id="profile-creator" aria-labelledby="profile-creator-title">
            <div className="profile-section__head">
              <span className="profile-section__index" aria-hidden="true">02</span>
              <div>
                <p className="ts-overline">Creative practice</p>
                <h2 id="profile-creator-title">Creator focus</h2>
                <p>Tell the team what you know, what you make, and which opportunities fit you best.</p>
              </div>
            </div>
            <fieldset className="cr-fieldset">
              <legend className="ts-label">Interests</legend>
              <div className="ts-chips">
                {categories.map((c) => (
                  <button key={c.slug} type="button" className="ts-chip" aria-pressed={interests.includes(c.slug)} onClick={() => setInterests(toggle(interests, c.slug))}>{interests.includes(c.slug) ? <Icon name="check" /> : null}{c.label}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="cr-fieldset">
              <legend className="ts-label">Skills</legend>
              <div className="ts-chips">
                {categories.map((c) => (
                  <button key={c.slug} type="button" className="ts-chip" aria-pressed={skills.includes(c.slug)} onClick={() => setSkills(toggle(skills, c.slug))}>{skills.includes(c.slug) ? <Icon name="check" /> : null}{c.label}</button>
                ))}
              </div>
            </fieldset>
            {contentFormats.length > 0 ? (
              <fieldset className="cr-fieldset">
                <legend className="ts-label">Formats</legend>
                <div className="ts-chips">
                  {contentFormats.map((f) => (
                    <button key={f} type="button" className="ts-chip" aria-pressed={formats.includes(f)} onClick={() => setFormats(toggle(formats, f))}>{formats.includes(f) ? <Icon name="check" /> : null}{f}</button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {categories.length === 0 ? <p className="ts-hint">Interest and skill categories appear here once the programme publishes them.</p> : null}
            <Field label="Portfolio / social links" htmlFor="social" hint="Comma-separated URLs">
              <input id="social" className="ts-input" value={social} onChange={(e) => setSocial(e.target.value)} />
            </Field>
            <Field label="Relevant experience" htmlFor="experience">
              <textarea id="experience" className="ts-textarea" value={experience} onChange={(e) => setExperience(e.target.value)} />
            </Field>
            <Field label="Motivation" htmlFor="motivation">
              <textarea id="motivation" className="ts-textarea" value={motivation} onChange={(e) => setMotivation(e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Availability" htmlFor="avail">
                <input id="avail" className="ts-input" value={availability} onChange={(e) => setAvailability(e.target.value)} />
              </Field>
              <Field label="Equipment" htmlFor="equipment">
                <input id="equipment" className="ts-input" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="ts-panel profile-section" id="profile-contact" aria-labelledby="profile-contact-title">
            <div className="profile-section__head">
              <span className="profile-section__index" aria-hidden="true">03</span>
              <div>
                <p className="ts-overline">Protected details</p>
                <h2 id="profile-contact-title">Contact information <Badge tone="neutral"><Icon name="lock" />Private</Badge></h2>
                <p>Used only for programme communication and support from authorised staff.</p>
              </div>
            </div>
            <Field label="Email" htmlFor="email">
              <input id="email" className="ts-input" value={profile.contact?.email ?? user?.email ?? ''} disabled />
            </Field>
            <div className="field-row">
              <Field label="Phone" htmlFor="phone">
                <input id="phone" className="ts-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Preferred contact" htmlFor="cm">
                <select id="cm" className="ts-select" value={contactMethod} onChange={(e) => setContactMethod(e.target.value)}>
                  {enums.contactMethod.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
          </section>

          <section className="ts-panel profile-section" id="profile-preferences" aria-labelledby="profile-preferences-title">
            <div className="profile-section__head">
              <span className="profile-section__index" aria-hidden="true">04</span>
              <div>
                <p className="ts-overline">Stay connected</p>
                <h2 id="profile-preferences-title">Communication preferences</h2>
                <p>Choose which first-party programme updates should reach you.</p>
              </div>
            </div>
            <div className="cr-checks">
              <Switch checked={inAppPref} onChange={setInAppPref} label="In-app notifications" hint="Shown in the studio’s notification list." />
              <Switch checked={emailPref} onChange={setEmailPref} label="Email notifications" hint="Sent to the address on your account." />
            </div>
            <p className="ts-hint">WhatsApp Channel updates are external and opt-in.</p>
          </section>
        </div>

        <aside className="profile-sidebar" aria-label="Profile preview">
          <section className="ts-panel profile-preview" aria-labelledby="profile-preview-title">
            <div className="profile-preview__cover" aria-hidden="true" />
            <div className="profile-preview__head">
              <div>
                <p className="ts-overline">Live preview</p>
                <h2 id="profile-preview-title">Public attribution</h2>
              </div>
              <Badge tone={isPublic ? 'success' : 'neutral'} dot>{isPublic ? 'Public' : 'Private'}</Badge>
            </div>
            <div className="profile-preview__identity">
              <div className="profile-avatar profile-avatar--sm" aria-hidden="true">
                {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : previewInitials}
              </div>
              <div>
                <strong>{profile.public.displayName}</strong>
                <small>{profile.public.username ? `@${profile.public.username}` : 'Creator'}</small>
              </div>
            </div>
            <p className="profile-preview__meta"><Icon name="pin" />{previewMeta}</p>
            <p className="profile-preview__bio">{bio.trim() || 'Your short bio will appear here once you add it.'}</p>
            {interests.length > 0 ? (
              <div className="ts-cluster">
                {interests.slice(0, 3).map((interest) => <Badge key={interest} tone="accent">{interest}</Badge>)}
              </div>
            ) : null}
            <p className="ts-hint">This is how attribution can appear in the Indigen World mobile app.</p>
          </section>

          <Panel title="Consent history" variant="tight" actions={<Badge tone="neutral"><Icon name="lock" />Private</Badge>}>
            <KeyValue items={[
              { label: 'Registration terms', value: 'Accepted' },
              { label: 'Publication', value: 'Per submission' },
              { label: 'AI training', value: 'Off by default' },
            ]} />
          </Panel>

          <Panel title="Account & security" variant="tight">
            <KeyValue items={[
              { label: 'Signed in as', value: <span className="ts-break">{user?.email}</span> },
              { label: 'Account status', value: statusLabel },
              { label: 'Creator reference', value: <span className="ts-mono">{profile.reference}</span> },
            ]} />
          </Panel>
        </aside>
      </div>

      <div className="profile-savebar">
        <div className="profile-savebar__copy">
          <strong>Keep your creator identity current</strong>
          <span>Changes stay private until you save them.</span>
        </div>
        {toast ? <span className={toastFailed ? 'ts-save is-error' : 'ts-save'} role="status"><span className="ts-save__mark" aria-hidden="true"><Icon name={toastFailed ? 'alert' : 'check'} /></span>{toast}</span> : null}
        <Button variant="primary" icon="check" busy={saving} onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </div>
  );
}
