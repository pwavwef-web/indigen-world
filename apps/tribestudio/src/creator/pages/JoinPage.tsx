import { useEffect, useMemo, useState } from 'react';
import type { Campaign } from '@indigen-world/contracts/creator-models';
import { enums } from '@indigen-world/contracts';
import { signIn, useAuth } from '../../auth';
import { useRoute } from '../../router';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';
import { fetchPublicCampaigns, submitApplication, waitlistOpen, submissionsOpen, type ApplicationPayload } from '../data';
import { Field, Stepper, WhatsAppCard } from '../components';

const STEPS = ['Account', 'About you', 'Language', 'Interests', 'Consent'];

const COUNTRIES = [
  ['GH', 'Ghana'],
  ['NG', 'Nigeria'],
  ['BF', 'Burkina Faso'],
  ['TG', 'Togo'],
  ['CI', "Côte d'Ivoire"],
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['ZZ', 'Other'],
];

const PROFICIENCY_LABELS: Record<string, string> = {
  native: 'Native / fluent',
  advanced: 'Advanced',
  intermediate: 'Intermediate',
  learning: 'Learning',
};

interface FormState {
  fullName: string;
  displayName: string;
  preferredUsername: string;
  phone: string;
  country: string;
  region: string;
  preferredContactMethod: string;
  preferredLanguage: string;
  ageConfirmed: boolean;
  isMinor: boolean;
  languagesSpoken: string;
  kasemProficiency: string;
  dialect: string;
  canWriteKasem: boolean;
  canTranslateToEnglish: boolean;
  culturalCommunities: string;
  communityRelationship: string;
  interests: string[];
  formats: string[];
  socialLinks: string;
  experience: string;
  motivation: string;
  recordingAccess: string[];
  equipment: string;
  availability: string;
  referralSource: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  communicationsAccepted: boolean;
  accuracyConfirmed: boolean;
}

const EMPTY: FormState = {
  fullName: '',
  displayName: '',
  preferredUsername: '',
  phone: '',
  country: 'GH',
  region: '',
  preferredContactMethod: 'whatsapp',
  preferredLanguage: 'en',
  ageConfirmed: false,
  isMinor: false,
  languagesSpoken: '',
  kasemProficiency: 'learning',
  dialect: '',
  canWriteKasem: false,
  canTranslateToEnglish: false,
  culturalCommunities: '',
  communityRelationship: '',
  interests: [],
  formats: [],
  socialLinks: '',
  experience: '',
  motivation: '',
  recordingAccess: [],
  equipment: '',
  availability: '',
  referralSource: '',
  termsAccepted: false,
  privacyAccepted: false,
  communicationsAccepted: true,
  accuracyConfirmed: false,
};

const RECORDING_OPTIONS = ['Smartphone', 'Camera', 'Audio recorder', 'None yet'];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function JoinPage() {
  const { user, ready } = useAuth();
  const { config, whatsappUrl } = useConfig();
  const { navigate } = useRoute();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const draftKey = user ? `creator-join-draft:${user.uid}` : null;

  // Load open campaign to apply to.
  useEffect(() => {
    void fetchPublicCampaigns().then((list) => {
      setCampaign(list.find((c) => waitlistOpen(c) || submissionsOpen(c)) ?? list[0] ?? null);
      setCampaignsLoaded(true);
    });
  }, []);

  // Restore draft.
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setForm({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* ignore malformed drafts */
    }
  }, [draftKey]);

  // Persist draft.
  useEffect(() => {
    if (!draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(form));
    } catch {
      /* storage may be unavailable */
    }
  }, [draftKey, form]);

  const dialects = config?.dialects ?? [];
  const categories = config?.contentCategories ?? [];
  const formats = config?.contentFormats ?? [];

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validateStep = (index: number): boolean => {
    const next: Record<string, string> = {};
    if (index === 1) {
      if (form.fullName.trim().length < 2) next.fullName = 'Please enter your full name.';
      if (form.displayName.trim().length < 2) next.displayName = 'Please enter a public display name.';
      if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(form.preferredUsername.trim().toLowerCase())) next.preferredUsername = 'Use 3–30 lowercase letters, numbers or hyphens.';
      if (!/^\+?[0-9\s-]{6,20}$/.test(form.phone.trim())) next.phone = 'Enter a phone number with country code.';
      if (!form.region.trim()) next.region = 'Tell us your region, town or community.';
      if (!form.ageConfirmed && !form.isMinor) next.ageConfirmed = 'Please confirm your age.';
    }
    if (index === 2) {
      if (!form.kasemProficiency) next.kasemProficiency = 'Select your Kasem proficiency.';
    }
    if (index === 3) {
      if (form.interests.length === 0) next.interests = 'Choose at least one interest.';
      if (form.motivation.trim().length < 20) next.motivation = 'Tell us briefly why you want to join.';
    }
    if (index === 4) {
      if (!form.termsAccepted) next.termsAccepted = 'You must accept the Creator Programme Terms.';
      if (!form.privacyAccepted) next.privacyAccepted = 'You must accept the Privacy Notice.';
      if (!form.accuracyConfirmed) next.accuracyConfirmed = 'Please confirm your information is accurate.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    trackEvent('signup_step_completed', { step: STEPS[step] });
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep(4) || !user || !campaign) return;
    setSubmitting(true);
    setSubmitError(null);
    const payload: ApplicationPayload = {
      campaignId: campaign.id,
      profile: {
        public: {
          displayName: form.displayName.trim(),
          username: form.preferredUsername.trim().toLowerCase(),
          country: form.country,
          region: form.region.trim(),
          languagesSpoken: form.languagesSpoken.split(',').map((s) => s.trim()).filter(Boolean),
          kasemProficiency: form.kasemProficiency as never,
          dialect: form.dialect,
          canWriteKasem: form.canWriteKasem,
          canTranslateToEnglish: form.canTranslateToEnglish,
          interests: form.interests,
          formats: form.formats,
          socialLinks: form.socialLinks
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((url) => ({ platform: 'link', url })),
        },
        contact: {
          email: user.email ?? '',
          phone: form.phone.trim(),
          preferredContactMethod: form.preferredContactMethod as never,
          preferredLanguage: form.preferredLanguage,
        },
        fullName: form.fullName.trim(),
        communityRelationship: form.communityRelationship.trim(),
        culturalCommunities: form.culturalCommunities.split(',').map((s) => s.trim()).filter(Boolean),
        skills: form.interests,
        experience: form.experience.trim(),
        motivation: form.motivation.trim(),
        equipment: form.equipment.trim(),
        locationPrivacy: 'region_only',
        ageConfirmed: form.ageConfirmed,
        isMinor: form.isMinor,
        recordingAccess: form.recordingAccess,
        availability: form.availability,
        referralSource: form.referralSource,
      },
      consent: {
        termsAccepted: form.termsAccepted,
        privacyAccepted: form.privacyAccepted,
        communicationsAccepted: form.communicationsAccepted,
        accuracyConfirmed: form.accuracyConfirmed,
        termsVersion: config?.termsVersion ?? 'creator-terms-unversioned',
      },
    };
    try {
      const result = await submitApplication(payload);
      trackEvent('signup_completed');
      if (draftKey) localStorage.removeItem(draftKey);
      navigate(`/creators/join/success?ref=${encodeURIComponent(result.reference)}&flagged=${result.flaggedForManualReview ? '1' : '0'}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'We could not submit your application. Please try again.');
      setSubmitting(false);
    }
  };

  const registrationClosed = useMemo(
    () => campaignsLoaded && campaign != null && !waitlistOpen(campaign) && !submissionsOpen(campaign),
    [campaignsLoaded, campaign],
  );

  if (!ready) return <div className="join"><p className="muted">Loading…</p></div>;

  // Step 1: account gate.
  if (!user) {
    return (
      <div className="join">
        <div className="join__card join__card--center">
          <Stepper steps={STEPS} current={0} />
          <h1>Create your account</h1>
          <p className="muted">
            Founding-creator registration starts with a verified account. Sign in with Google to
            continue — your email is verified automatically.
          </p>
          <button type="button" className="button button--primary button--lg" onClick={() => void signIn()}>
            Sign in with Google
          </button>
          <p className="tiny">
            Joining is free. By continuing you can prepare your profile before submissions open.
          </p>
        </div>
      </div>
    );
  }

  if (campaignsLoaded && !campaign) {
    return (
      <div className="join">
        <div className="join__card join__card--center">
          <h1>No campaign is open yet</h1>
          <p className="muted">Registration will open with the next campaign. Follow the channel to hear first.</p>
          <WhatsAppCard url={whatsappUrl} />
        </div>
      </div>
    );
  }

  return (
    <div className="join">
      <div className="join__head">
        <h1>Join the Founding Creators</h1>
        {campaign ? <p className="muted">Applying to {campaign.title}</p> : null}
      </div>
      <Stepper steps={STEPS} current={step} />

      {registrationClosed ? (
        <div className="callout callout--warn">Registration for this campaign is currently closed.</div>
      ) : null}

      <div className="join__card">
        {step === 0 ? (
          <section aria-labelledby="s-account">
            <h2 id="s-account">Account</h2>
            <p className="muted">
              Signed in as <strong>{user.email}</strong>
              {user.emailVerified ? ' · verified' : ' · not verified'}.
            </p>
            <p>Your account is ready. Continue to build your creator profile.</p>
          </section>
        ) : null}

        {step === 1 ? (
          <section aria-labelledby="s-basic">
            <h2 id="s-basic">About you</h2>
            <Field label="Full name" htmlFor="fullName" hint="Private; used for application review." error={errors.fullName}>
              <input id="fullName" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="Your legal or everyday full name" />
            </Field>
            <Field label="Public display name" htmlFor="displayName" error={errors.displayName}>
              <input id="displayName" value={form.displayName} onChange={(e) => update('displayName', e.target.value)} placeholder="e.g. Ama the Storyteller" />
            </Field>
            <Field label="Preferred username" htmlFor="preferredUsername" hint="Lowercase letters, numbers and hyphens." error={errors.preferredUsername}>
              <input id="preferredUsername" value={form.preferredUsername} onChange={(e) => update('preferredUsername', e.target.value.toLowerCase())} placeholder="ama-storyteller" />
            </Field>
            <Field label="Phone number (with country code)" htmlFor="phone" hint="Used for campaign coordination only." error={errors.phone}>
              <input id="phone" inputMode="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+233 20 000 0000" />
            </Field>
            <div className="field-row">
              <Field label="Country" htmlFor="country">
                <select id="country" value={form.country} onChange={(e) => update('country', e.target.value)}>
                  {COUNTRIES.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Region, town or community" htmlFor="region" error={errors.region}>
                <input id="region" value={form.region} onChange={(e) => update('region', e.target.value)} placeholder="e.g. Navrongo" />
              </Field>
            </div>
            <div className="field-row">
              <Field label="Preferred contact method" htmlFor="contact">
                <select id="contact" value={form.preferredContactMethod} onChange={(e) => update('preferredContactMethod', e.target.value)}>
                  {enums.contactMethod.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred interface language" htmlFor="lang">
                <select id="lang" value={form.preferredLanguage} onChange={(e) => update('preferredLanguage', e.target.value)}>
                  <option value="en">English</option>
                  <option value="xsm">Kasem</option>
                </select>
              </Field>
            </div>
            <Field label="Age" error={errors.ageConfirmed}>
              <label className="checkbox">
                <input type="checkbox" checked={form.ageConfirmed} onChange={(e) => { update('ageConfirmed', e.target.checked); if (e.target.checked) update('isMinor', false); }} />
                I confirm I am 18 or older.
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={form.isMinor} onChange={(e) => { update('isMinor', e.target.checked); if (e.target.checked) update('ageConfirmed', false); }} />
                I am under 18 (a guardian-consent step will be required).
              </label>
            </Field>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="s-lang">
            <h2 id="s-lang">Language and cultural background</h2>
            <Field label="Languages you speak" htmlFor="langs" hint="Comma-separated, e.g. Kasem, English">
              <input id="langs" value={form.languagesSpoken} onChange={(e) => update('languagesSpoken', e.target.value)} placeholder="Kasem, English" />
            </Field>
            <Field label="Cultural community or communities represented" htmlFor="communities" hint="Comma-separated, e.g. Kassena, Navrongo">
              <input id="communities" value={form.culturalCommunities} onChange={(e) => update('culturalCommunities', e.target.value)} placeholder="Kassena" />
            </Field>
            <Field label="Kasem proficiency" htmlFor="prof" error={errors.kasemProficiency}>
              <select id="prof" value={form.kasemProficiency} onChange={(e) => update('kasemProficiency', e.target.value)}>
                {enums.kasemProficiency.map((p) => (
                  <option key={p} value={p}>{PROFICIENCY_LABELS[p] ?? p}</option>
                ))}
              </select>
            </Field>
            <Field label="Kasem dialect or community variant" htmlFor="dialect">
              <select id="dialect" value={form.dialect} onChange={(e) => update('dialect', e.target.value)}>
                <option value="">Select…</option>
                {dialects.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Kasem skills">
              <label className="checkbox">
                <input type="checkbox" checked={form.canWriteKasem} onChange={(e) => update('canWriteKasem', e.target.checked)} />
                I can write in Kasem.
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={form.canTranslateToEnglish} onChange={(e) => update('canTranslateToEnglish', e.target.checked)} />
                I can provide an English translation or summary.
              </label>
            </Field>
            <Field label="Your relationship to the community" htmlFor="rel">
              <textarea id="rel" value={form.communityRelationship} onChange={(e) => update('communityRelationship', e.target.value)} placeholder="e.g. Born and raised in Navrongo" />
            </Field>
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-labelledby="s-interests">
            <h2 id="s-interests">Creator interests</h2>
            <Field label="What do you want to create?" error={errors.interests} hint="Choose all that apply.">
              <div className="chips">
                {categories.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    className={form.interests.includes(c.slug) ? 'chip is-on' : 'chip'}
                    aria-pressed={form.interests.includes(c.slug)}
                    onClick={() => update('interests', toggle(form.interests, c.slug))}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>
            {formats.length > 0 ? (
              <Field label="Preferred content formats">
                <div className="chips">
                  {formats.map((f) => (
                    <button key={f} type="button" className={form.formats.includes(f) ? 'chip is-on' : 'chip'} aria-pressed={form.formats.includes(f)} onClick={() => update('formats', toggle(form.formats, f))}>
                      {f}
                    </button>
                  ))}
                </div>
              </Field>
            ) : null}
            <Field label="Portfolio or social-media links (optional)" htmlFor="social" hint="Comma-separated URLs">
              <input id="social" value={form.socialLinks} onChange={(e) => update('socialLinks', e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Relevant experience" htmlFor="experience" hint="Short-form video, teaching, translation, audio, writing, community work, etc.">
              <textarea id="experience" value={form.experience} onChange={(e) => update('experience', e.target.value)} />
            </Field>
            <Field label="Motivation for joining" htmlFor="motivation" error={errors.motivation}>
              <textarea id="motivation" value={form.motivation} onChange={(e) => update('motivation', e.target.value)} placeholder="What would you like to help create or preserve?" />
            </Field>
            <Field label="Recording access">
              <div className="chips">
                {RECORDING_OPTIONS.map((r) => (
                  <button key={r} type="button" className={form.recordingAccess.includes(r) ? 'chip is-on' : 'chip'} aria-pressed={form.recordingAccess.includes(r)} onClick={() => update('recordingAccess', toggle(form.recordingAccess, r))}>
                    {r}
                  </button>
                ))}
              </div>
            </Field>
            <div className="field-row">
              <Field label="Available equipment (optional)" htmlFor="equipment">
                <input id="equipment" value={form.equipment} onChange={(e) => update('equipment', e.target.value)} placeholder="Phone, microphone, camera…" />
              </Field>
              <Field label="Availability for upcoming campaigns" htmlFor="avail">
                <input id="avail" value={form.availability} onChange={(e) => update('availability', e.target.value)} placeholder="e.g. Weekends" />
              </Field>
            </div>
            <div className="field-row">
              <Field label="How did you hear about Indigen World?" htmlFor="ref">
                <input id="ref" value={form.referralSource} onChange={(e) => update('referralSource', e.target.value)} placeholder="e.g. WhatsApp, a friend" />
              </Field>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section aria-labelledby="s-consent">
            <h2 id="s-consent">Consent and confirmation</h2>
            <p className="muted">
              Content-use and AI-training permissions are <strong>not</strong> requested here — those are
              asked separately for each submission.
            </p>
            <Field label="Creator Programme Terms" error={errors.termsAccepted}>
              <label className="checkbox">
                <input type="checkbox" checked={form.termsAccepted} onChange={(e) => update('termsAccepted', e.target.checked)} />
                I agree to the Creator Programme Terms{config?.termsVersion ? ` (${config.termsVersion})` : ''}.
              </label>
            </Field>
            <Field label="Privacy Notice" error={errors.privacyAccepted}>
              <label className="checkbox">
                <input type="checkbox" checked={form.privacyAccepted} onChange={(e) => update('privacyAccepted', e.target.checked)} />
                I have read the Privacy Notice.
              </label>
            </Field>
            <Field label="Communications">
              <label className="checkbox">
                <input type="checkbox" checked={form.communicationsAccepted} onChange={(e) => update('communicationsAccepted', e.target.checked)} />
                Send me communication related to my application and campaigns.
              </label>
            </Field>
            <Field label="Accuracy" error={errors.accuracyConfirmed}>
              <label className="checkbox">
                <input type="checkbox" checked={form.accuracyConfirmed} onChange={(e) => update('accuracyConfirmed', e.target.checked)} />
                I confirm the information I have submitted is accurate.
              </label>
            </Field>
            {submitError ? <div className="callout callout--warn" role="alert">{submitError}</div> : null}
          </section>
        ) : null}

        <div className="join__actions">
          {step > 0 ? (
            <button type="button" className="button button--ghost-dark" onClick={goBack} disabled={submitting}>
              Back
            </button>
          ) : <span />}
          {step < STEPS.length - 1 ? (
            <button type="button" className="button button--primary" onClick={goNext} disabled={registrationClosed}>
              Continue
            </button>
          ) : (
            <button type="button" className="button button--primary" onClick={() => void handleSubmit()} disabled={submitting || registrationClosed}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
