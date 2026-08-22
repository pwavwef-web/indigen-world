import { useEffect, useState } from 'react';
import type { CreatorProfile } from '@indigen-world/contracts/creator-models';
import { enums } from '@indigen-world/contracts';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';
import { fetchMyProfile, updateMyProfile } from '../data';
import { Field, LoadError, Skeleton, useReloadable } from '../components';

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
      setToast('Profile saved.');
      window.setTimeout(() => setToast(null), 3000);
      setProfile(await fetchMyProfile(user.uid));
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (failed) {
    return <div className="page"><h1>Your profile</h1><LoadError onRetry={retry} /></div>;
  }

  if (loading) {
    return <div className="page"><h1>Your profile</h1><Skeleton lines={8} /></div>;
  }

  if (!profile) {
    return (
      <div className="page">
        <h1>Your profile</h1>
        <div className="callout callout--info">
          You have not created a creator profile yet. <Link to="/creators/join">Join the programme →</Link>
        </div>
      </div>
    );
  }

  const dialects = config?.dialects ?? [];
  const categories = config?.contentCategories ?? [];
  const contentFormats = config?.contentFormats ?? [];

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Your profile</h1>
          <p className="muted">Public information is shown once your content is published. Private details are visible only to you and staff.</p>
        </div>
        <span className="ref-chip">{profile.reference}</span>
      </header>

      <div className="cols">
        <div>
          <section className="panel">
            <h2>Public profile <span className="tag tag--public">Public</span></h2>
            <Field label="Display name" hint="Set at registration; contact support to change.">
              <input value={profile.public.displayName} disabled />
            </Field>
            <Field label="Username" hint="Reserved during application review.">
              <input value={profile.public.username ? `@${profile.public.username}` : 'Not set'} disabled />
            </Field>
            <Field label="Public profile preference">
              <label className="checkbox">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Allow a public creator profile after programme approval.
              </label>
            </Field>
            <Field label="Short bio" htmlFor="bio">
              <textarea id="bio" value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Region / community" htmlFor="region">
                <input id="region" value={region} onChange={(e) => setRegion(e.target.value)} />
              </Field>
              <Field label="Location privacy" htmlFor="locationPrivacy">
                <select id="locationPrivacy" value={locationPrivacy} onChange={(e) => setLocationPrivacy(e.target.value as CreatorProfile['locationPrivacy'])}>
                  <option value="public">Show country and region</option>
                  <option value="region_only">Show region only</option>
                  <option value="private">Keep private</option>
                </select>
              </Field>
            </div>
            <Field label="Cultural communities represented" htmlFor="communities" hint="Comma-separated.">
              <input id="communities" value={communities} onChange={(e) => setCommunities(e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Kasem proficiency" htmlFor="prof">
                <select id="prof" value={proficiency} onChange={(e) => setProficiency(e.target.value)}>
                  {enums.kasemProficiency.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Dialect / variant" htmlFor="dialect">
                <select id="dialect" value={dialect} onChange={(e) => setDialect(e.target.value)}>
                  <option value="">Select…</option>
                  {dialects.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Interests">
              <div className="chips">
                {categories.map((c) => (
                  <button key={c.slug} type="button" className={interests.includes(c.slug) ? 'chip is-on' : 'chip'} aria-pressed={interests.includes(c.slug)} onClick={() => setInterests(toggle(interests, c.slug))}>{c.label}</button>
                ))}
              </div>
            </Field>
            <Field label="Skills">
              <div className="chips">
                {categories.map((c) => (
                  <button key={c.slug} type="button" className={skills.includes(c.slug) ? 'chip is-on' : 'chip'} aria-pressed={skills.includes(c.slug)} onClick={() => setSkills(toggle(skills, c.slug))}>{c.label}</button>
                ))}
              </div>
            </Field>
            {contentFormats.length > 0 ? (
              <Field label="Formats">
                <div className="chips">
                  {contentFormats.map((f) => (
                    <button key={f} type="button" className={formats.includes(f) ? 'chip is-on' : 'chip'} aria-pressed={formats.includes(f)} onClick={() => setFormats(toggle(formats, f))}>{f}</button>
                  ))}
                </div>
              </Field>
            ) : null}
            <Field label="Portfolio / social links" htmlFor="social" hint="Comma-separated URLs">
              <input id="social" value={social} onChange={(e) => setSocial(e.target.value)} />
            </Field>
            <Field label="Relevant experience" htmlFor="experience">
              <textarea id="experience" value={experience} onChange={(e) => setExperience(e.target.value)} />
            </Field>
            <Field label="Motivation" htmlFor="motivation">
              <textarea id="motivation" value={motivation} onChange={(e) => setMotivation(e.target.value)} />
            </Field>
          </section>

          <section className="panel">
            <h2>Contact information <span className="tag tag--private">Private</span></h2>
            <Field label="Email">
              <input value={profile.contact?.email ?? user?.email ?? ''} disabled />
            </Field>
            <div className="field-row">
              <Field label="Phone" htmlFor="phone">
                <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Preferred contact" htmlFor="cm">
                <select id="cm" value={contactMethod} onChange={(e) => setContactMethod(e.target.value)}>
                  {enums.contactMethod.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Availability" htmlFor="avail">
              <input id="avail" value={availability} onChange={(e) => setAvailability(e.target.value)} />
            </Field>
            <Field label="Equipment" htmlFor="equipment">
              <input id="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
            </Field>
          </section>

          <section className="panel">
            <h2>Communication preferences</h2>
            <label className="checkbox"><input type="checkbox" checked={inAppPref} onChange={(e) => setInAppPref(e.target.checked)} /> In-app notifications</label>
            <label className="checkbox"><input type="checkbox" checked={emailPref} onChange={(e) => setEmailPref(e.target.checked)} /> Email notifications</label>
            <p className="tiny">WhatsApp Channel updates are external and opt-in.</p>
          </section>

          <div className="page__actions">
            <button type="button" className="button button--primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            {toast ? <span className="save-toast" role="status">{toast}</span> : null}
          </div>
        </div>

        <aside>
          <section className="panel panel--preview">
            <h2>Public attribution preview</h2>
            <p className="tiny">How you’ll appear in the Indigen World mobile app.</p>
            <div className="attrib">
              <div className="attrib__avatar" aria-hidden="true">{profile.public.initials ?? profile.public.displayName.slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{profile.public.displayName}</strong>
                <p className="muted">{[region, dialect].filter(Boolean).join(' · ') || 'Kasena community'}</p>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Consent history <span className="tag tag--private">Private</span></h2>
            <ul className="mini-list">
              <li><span>Registration terms</span><span className="muted">accepted</span></li>
              <li><span>Publication</span><span className="muted">per submission</span></li>
              <li><span>AI training</span><span className="muted">off by default</span></li>
            </ul>
          </section>

          <section className="panel">
            <h2>Account &amp; security</h2>
            <p className="tiny">Signed in as {user?.email}.</p>
            <p className="tiny">Account status: {profile.status ?? 'waitlisted'}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
