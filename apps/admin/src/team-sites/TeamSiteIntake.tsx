import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTeamSiteRequest,
  deleteTeamSiteRequest,
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

/** Flatten a request into ordered [label, value] rows used by the detail view and both exports. */
function requestRows(request: TeamSiteRequest): [string, string][] {
  const rows: [string, string][] = [['Submitted', formatDate(request.submittedAt)], ['Status', request.status]];
  for (const [key, value] of Object.entries(request.fields)) {
    rows.push([fieldLabels[key as keyof TeamSiteRequest['fields']], value || '-']);
  }
  rows.push(['Pages needed', request.desiredPages.join(', ') || '-']);
  rows.push(['Extra features', request.features.join(', ') || '-']);
  return rows;
}

/** Safe, human-readable base filename for a downloaded response. */
function exportFileBase(request: TeamSiteRequest): string {
  const name = request.fields.siteName || request.fields.fullName || request.fields.displayName || 'response';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'response';
  return `team-site-${slug}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a tick to start the download before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export a single response as an Excel-openable spreadsheet (HTML table with the .xls Excel MIME type). */
function exportResponseExcel(request: TeamSiteRequest) {
  const title = request.fields.siteName || 'Team site response';
  const body = requestRows(request)
    .map(([label, value]) => `<tr><th style="text-align:left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8" /></head>` +
    `<body><table border="1"><thead><tr><th colspan="2">${escapeHtml(title)}</th></tr>` +
    `<tr><th>Field</th><th>Response</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
  triggerDownload(new Blob([html], { type: 'application/vnd.ms-excel' }), `${exportFileBase(request)}.xls`);
}

/** Export a single response as PDF by opening a styled print window and letting the browser save to PDF. */
function exportResponsePdf(request: TeamSiteRequest) {
  const title = request.fields.siteName || 'Team site response';
  const body = requestRows(request)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  const html =
    `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(exportFileBase(request))}</title>` +
    `<style>` +
    `body{font-family:Arial,Helvetica,sans-serif;color:#15233f;margin:32px;}` +
    `h1{font-size:20px;margin:0 0 4px;}` +
    `.meta{color:#6b7280;font-size:12px;margin:0 0 20px;}` +
    `table{width:100%;border-collapse:collapse;}` +
    `th,td{border:1px solid #d9d4c6;padding:8px 10px;font-size:12px;vertical-align:top;text-align:left;}` +
    `th{width:32%;background:#f6eddb;color:#15233f;}` +
    `td{white-space:pre-wrap;overflow-wrap:anywhere;}` +
    `@media print{body{margin:12mm;}}` +
    `</style></head><body>` +
    `<h1>${escapeHtml(title)}</h1>` +
    `<p class="meta">Indigen World team site response &middot; submitted ${escapeHtml(formatDate(request.submittedAt))}</p>` +
    `<table><tbody>${body}</tbody></table>` +
    `<script>window.onload=function(){window.focus();window.print();};<\/script>` +
    `</body></html>`;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!win) {
    alert('Please allow pop-ups for this site to export the response as PDF.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function ResponseModal({
  request,
  onClose,
  onDelete,
}: {
  request: TeamSiteRequest;
  onClose: () => void;
  onDelete: (request: TeamSiteRequest) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="response-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="response-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="response-modal__head">
          <div>
            <h3 id="response-modal-title">{request.fields.siteName || 'Untitled site'}</h3>
            <p className="response-modal__meta">
              {request.fields.fullName || request.fields.displayName || 'Unknown'} &middot; {formatDate(request.submittedAt)}
            </p>
          </div>
          <button type="button" className="response-modal__close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </header>

        <div className="response-modal__body">
          <dl>
            {requestRows(request)
              .filter(([label]) => label !== 'Submitted' && label !== 'Status')
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </div>

        <footer className="response-modal__foot">
          <div className="response-modal__actions">
            <button type="button" onClick={() => exportResponseExcel(request)}>Export Excel</button>
            <button type="button" onClick={() => exportResponsePdf(request)}>Export PDF</button>
          </div>
          <div className="response-modal__actions">
            <button type="button" className="btn-danger" onClick={() => onDelete(request)}>Delete</button>
            <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function TeamSiteRequestsAdmin() {
  const [rows, setRows] = useState<TeamSiteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<TeamSiteRequest | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    void fetchTeamSiteRequests()
      .then((requests) => setRows(requests))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = useCallback(async (request: TeamSiteRequest) => {
    if (!window.confirm('Delete this response permanently? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteTeamSiteRequest(request.id);
      setRows((current) => current.filter((row) => row.id !== request.id));
      setActive(null);
    } catch {
      alert('Could not delete the response. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, []);

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
        <table className="admin-table">
          <thead>
            <tr><th>Submitted</th><th>Name</th><th>Site</th><th>Purpose</th></tr>
          </thead>
          <tbody>
            {rows.map((request) => (
              <tr key={request.id} className={active?.id === request.id ? 'is-selected' : ''}>
                <td>
                  {/* Real button so the row is keyboard- and screen-reader-operable,
                      not mouse-only. It opens the response in a modal dialog. */}
                  <button type="button" className="row-select" onClick={() => setActive(request)}>
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
      )}

      {active ? (
        <ResponseModal
          request={active}
          onClose={() => (deleting ? undefined : setActive(null))}
          onDelete={(request) => void handleDelete(request)}
        />
      ) : null}
    </div>
  );
}
