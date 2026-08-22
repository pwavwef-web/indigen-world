import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createTeamSiteRequest,
  fetchTeamSiteRequests,
  type TeamSiteRequest,
  type TeamSiteRequestInput,
} from '../creators/data';

const fieldLabels: Record<keyof TeamSiteRequest['fields'], string> = {
  fullName: 'Full name',
  displayName: 'Preferred display name',
  roleTitle: 'Role or title',
  teamCompany: 'Team or company name',
  email: 'Email',
  phone: 'Phone or WhatsApp',
  location: 'Location',
  sitePurpose: 'Main purpose',
  audience: 'Audience',
  visitorAction: 'Primary visitor action',
  siteName: 'Site name or title',
  tagline: 'Tagline or short intro',
  brandColors: 'Brand colors',
  preferredStyle: 'Preferred style',
  inspirationLinks: "Sites you'd like yours modeled after",
  shortBio: 'Bio or about section',
  services: 'Services, skills, or offerings',
  projects: 'Projects, products, or work samples',
  testimonials: 'Testimonials or quotes',
  achievements: 'Achievements or experience',
  logoAvailable: 'Logo available',
  profilePhotoAvailable: 'Profile photo available',
  mediaNotes: 'Other media notes',
  socialLinks: 'Social links',
  bookingLink: 'Booking link',
  paymentLink: 'Payment link',
  portfolioLinks: 'Portfolio, GitHub, or LinkedIn links',
  contactFields: 'Contact form fields',
  submissionDestination: 'Where submissions should go',
  extraNotes: 'Specific requests',
  exclusions: 'What to avoid',
  deadline: 'Deadline or priority',
};

const initialFields: TeamSiteRequest['fields'] = {
  fullName: '',
  displayName: '',
  roleTitle: '',
  teamCompany: '',
  email: '',
  phone: '',
  location: '',
  sitePurpose: '',
  audience: '',
  visitorAction: '',
  siteName: '',
  tagline: '',
  brandColors: '',
  preferredStyle: '',
  inspirationLinks: '',
  shortBio: '',
  services: '',
  projects: '',
  testimonials: '',
  achievements: '',
  logoAvailable: '',
  profilePhotoAvailable: '',
  mediaNotes: '',
  socialLinks: '',
  bookingLink: '',
  paymentLink: '',
  portfolioLinks: '',
  contactFields: '',
  submissionDestination: '',
  extraNotes: '',
  exclusions: '',
  deadline: '',
};

const pageOptions = ['Home', 'About', 'Services', 'Portfolio/Projects', 'Products', 'Contact', 'Blog/Updates', 'Gallery', 'FAQ'];
const featureOptions = [
  'Contact form',
  'Newsletter signup',
  'Booking button',
  'WhatsApp button',
  'Payment or donation button',
  'Gallery',
  'Blog or posts',
  'Testimonials',
  'Admin dashboard',
  'Login or accounts',
  'File downloads',
];

const requiredFields: (keyof TeamSiteRequest['fields'])[] = [
  'fullName',
  'email',
  'sitePurpose',
  'audience',
  'visitorAction',
  'siteName',
  'shortBio',
];

function TextInput({
  name,
  value,
  onChange,
  multiline = false,
  required = false,
  type = 'text',
}: {
  name: keyof TeamSiteRequest['fields'];
  value: string;
  onChange: (name: keyof TeamSiteRequest['fields'], value: string) => void;
  multiline?: boolean;
  required?: boolean;
  type?: string;
}) {
  const id = `team-site-${name}`;
  return (
    <label className={multiline ? 'intake-field intake-field--wide' : 'intake-field'} htmlFor={id}>
      <span>
        {fieldLabels[name]}
        {required ? <strong aria-hidden="true"> *</strong> : null}
      </span>
      {multiline ? (
        <textarea id={id} value={value} onChange={(e) => onChange(name, e.target.value)} rows={4} required={required} />
      ) : (
        <input id={id} type={type} value={value} onChange={(e) => onChange(name, e.target.value)} required={required} />
      )}
    </label>
  );
}

function CheckboxGrid({
  legend,
  options,
  values,
  onChange,
}: {
  legend: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="intake-checks">
      <legend>{legend}</legend>
      <div>
        {options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={(e) => {
                onChange(e.target.checked ? [...values, option] : values.filter((item) => item !== option));
              }}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TeamSiteIntakePage() {
  const [fields, setFields] = useState(initialFields);
  const [desiredPages, setDesiredPages] = useState<string[]>(['Home', 'Contact']);
  const [features, setFeatures] = useState<string[]>(['Contact form']);
  const [state, setState] = useState<'idle' | 'saving' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const updateField = (name: keyof TeamSiteRequest['fields'], value: string) => {
    setFields((current) => ({ ...current, [name]: value }));
  };

  const canSubmit = useMemo(
    () => requiredFields.every((key) => fields[key].trim().length > 0) && desiredPages.length > 0,
    [desiredPages.length, fields],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setState('saving');
    setError(null);
    const payload: TeamSiteRequestInput = {
      formVersion: 1,
      status: 'new',
      submittedAt: new Date().toISOString(),
      fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()])) as TeamSiteRequest['fields'],
      desiredPages,
      features,
    };
    try {
      await createTeamSiteRequest(payload);
      setState('sent');
      setFields(initialFields);
      setDesiredPages(['Home', 'Contact']);
      setFeatures(['Contact form']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the form. Please try again.');
      setState('idle');
    }
  };

  return (
    <div className="intake-page">
      <header className="intake-hero">
        <div>
          <p>Indigen World team sites</p>
          <h1>Website intake form</h1>
        </div>
        <a href="/" aria-label="Open admin sign in">Admin</a>
      </header>

      {state === 'sent' ? (
        <section className="intake-success">
          <h2>Response received</h2>
          <p>Thank you. The admin team can now review your details and prepare your site.</p>
          <button type="button" onClick={() => setState('idle')}>Submit another response</button>
        </section>
      ) : (
        <form className="intake-form" onSubmit={(event) => void submit(event)}>
          <section>
            <h2>Basic info</h2>
            <div className="intake-grid">
              <TextInput name="fullName" value={fields.fullName} onChange={updateField} required />
              <TextInput name="displayName" value={fields.displayName} onChange={updateField} />
              <TextInput name="roleTitle" value={fields.roleTitle} onChange={updateField} />
              <TextInput name="teamCompany" value={fields.teamCompany} onChange={updateField} />
              <TextInput name="email" value={fields.email} onChange={updateField} type="email" required />
              <TextInput name="phone" value={fields.phone} onChange={updateField} type="tel" />
              <TextInput name="location" value={fields.location} onChange={updateField} />
            </div>
          </section>

          <section>
            <h2>Site direction</h2>
            <div className="intake-grid">
              <TextInput name="sitePurpose" value={fields.sitePurpose} onChange={updateField} multiline required />
              <TextInput name="audience" value={fields.audience} onChange={updateField} multiline required />
              <TextInput name="visitorAction" value={fields.visitorAction} onChange={updateField} multiline required />
              <TextInput name="siteName" value={fields.siteName} onChange={updateField} required />
              <TextInput name="tagline" value={fields.tagline} onChange={updateField} />
              <TextInput name="brandColors" value={fields.brandColors} onChange={updateField} />
              <TextInput name="preferredStyle" value={fields.preferredStyle} onChange={updateField} />
              <TextInput name="inspirationLinks" value={fields.inspirationLinks} onChange={updateField} multiline />
            </div>
          </section>

          <section>
            <h2>Content</h2>
            <div className="intake-grid">
              <TextInput name="shortBio" value={fields.shortBio} onChange={updateField} multiline required />
              <TextInput name="services" value={fields.services} onChange={updateField} multiline />
              <TextInput name="projects" value={fields.projects} onChange={updateField} multiline />
              <TextInput name="testimonials" value={fields.testimonials} onChange={updateField} multiline />
              <TextInput name="achievements" value={fields.achievements} onChange={updateField} multiline />
            </div>
          </section>

          <section>
            <CheckboxGrid legend="Pages needed" options={pageOptions} values={desiredPages} onChange={setDesiredPages} />
            <CheckboxGrid legend="Extra features" options={featureOptions} values={features} onChange={setFeatures} />
          </section>

          <section>
            <h2>Media, links, and final notes</h2>
            <div className="intake-grid">
              <TextInput name="logoAvailable" value={fields.logoAvailable} onChange={updateField} />
              <TextInput name="profilePhotoAvailable" value={fields.profilePhotoAvailable} onChange={updateField} />
              <TextInput name="mediaNotes" value={fields.mediaNotes} onChange={updateField} multiline />
              <TextInput name="socialLinks" value={fields.socialLinks} onChange={updateField} multiline />
              <TextInput name="bookingLink" value={fields.bookingLink} onChange={updateField} />
              <TextInput name="paymentLink" value={fields.paymentLink} onChange={updateField} />
              <TextInput name="portfolioLinks" value={fields.portfolioLinks} onChange={updateField} multiline />
              <TextInput name="contactFields" value={fields.contactFields} onChange={updateField} multiline />
              <TextInput name="submissionDestination" value={fields.submissionDestination} onChange={updateField} />
              <TextInput name="extraNotes" value={fields.extraNotes} onChange={updateField} multiline />
              <TextInput name="exclusions" value={fields.exclusions} onChange={updateField} multiline />
              <TextInput name="deadline" value={fields.deadline} onChange={updateField} />
            </div>
          </section>

          {error ? <p className="error-line">{error}</p> : null}
          <div className="intake-actions">
            <button type="submit" disabled={!canSubmit || state === 'saving'}>{state === 'saving' ? 'Submitting...' : 'Submit response'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function TeamSiteRequestsAdmin() {
  const [rows, setRows] = useState<TeamSiteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TeamSiteRequest | null>(null);

  const load = () => {
    setLoading(true);
    void fetchTeamSiteRequests()
      .then((requests) => {
        setRows(requests);
        setSelected((current) => current ?? requests[0] ?? null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="team-sites-admin">
      <div className="tab-head">
        <div>
          <h2>Team site responses</h2>
          <p className="muted">Responses from the shareable intake page at <code>/team-site-intake</code>.</p>
        </div>
        <button type="button" onClick={load}>Refresh</button>
      </div>

      {loading ? <p className="muted">Loading responses...</p> : rows.length === 0 ? <p className="muted">No team site responses yet.</p> : (
        <div className="request-layout">
          <table className="admin-table">
            <thead>
              <tr><th>Submitted</th><th>Name</th><th>Site</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              {rows.map((request) => (
                <tr
                  key={request.id}
                  className={selected?.id === request.id ? 'is-selected' : ''}
                >
                  <td>
                    {/* Real button so the row is keyboard- and screen-reader-operable,
                        not mouse-only. aria-pressed reflects the current selection. */}
                    <button
                      type="button"
                      className="row-select"
                      aria-pressed={selected?.id === request.id}
                      onClick={() => setSelected(request)}
                    >
                      {formatDate(request.submittedAt)}
                    </button>
                  </td>
                  <td>{request.fields.fullName || request.fields.displayName || '-'}</td>
                  <td>{request.fields.siteName || '-'}</td>
                  <td>{request.fields.sitePurpose || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {selected ? (
            <article className="request-detail">
              <header>
                <h3>{selected.fields.siteName || 'Untitled site'}</h3>
                <span>{selected.status}</span>
              </header>
              <dl>
                {Object.entries(selected.fields).map(([key, value]) => (
                  <div key={key}>
                    <dt>{fieldLabels[key as keyof TeamSiteRequest['fields']]}</dt>
                    <dd>{value || '-'}</dd>
                  </div>
                ))}
                <div>
                  <dt>Pages needed</dt>
                  <dd>{selected.desiredPages.join(', ') || '-'}</dd>
                </div>
                <div>
                  <dt>Extra features</dt>
                  <dd>{selected.features.join(', ') || '-'}</dd>
                </div>
              </dl>
            </article>
          ) : null}
        </div>
      )}
    </div>
  );
}
