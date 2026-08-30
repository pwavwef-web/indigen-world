import { enums, schemas } from '@indigen-world/contracts';

// Human-readable labels for the contract's validation lifecycle.
const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'In review',
  needs_changes: 'Needs changes',
  validated: 'Validated',
  rejected: 'Rejected',
  retired: 'Retired',
};

// `planned: true` marks domains whose console UI is not built yet, so the home
// screen doesn't imply capabilities operators can't actually reach here.
const adminDomains: { title: string; body: string; planned?: boolean }[] = [
  { title: 'Roles & access', body: 'Assign and audit role claims for contributors, validators and staff.', planned: true },
  { title: 'Interests & Public Intake', body: 'Review and action submitted interests from the Get Involved form, volunteer requests and public inquiries.' },
  { title: 'Creator management', body: 'Applications, campaigns, submissions, published content and consent for TribeStudio creators.' },
  { title: 'Validation oversight', body: 'Monitor validator queues, escalations and quality across language cells.' },
  { title: 'Moderation', body: 'Review reported content and track community reports through resolution.' },
  { title: 'Campaigns & rewards', body: 'Oversee bounties, reward settlement and contributor-points integrity.', planned: true },
  { title: 'Audit & accountability', body: 'Inspect the append-only audit log of privileged actions.', planned: true },
];

/** Landing screen for the admin console: an overview of domains, the validation
 * lifecycle, and the shared contract entities. */
export function ConsoleHome() {
  const entities = Object.entries(schemas);
  return (
    <>
      <section className="panel panel--notice">
        <h1>Administration console</h1>
        <p>
          The internal admin app for the Indigen World ecosystem — role and access management, creator
          management, validation oversight, moderation, reward integrity and audit. It is separate from{' '}
          <strong>TribeStudio</strong>, the workspace for contributors and creators.
        </p>
      </section>

      {/* Language Cell Health & Quality Visualizer */}
      <section className="panel">
        <h2>Language Cell Health &amp; Operational Analytics</h2>
        <div className="analytics-grid">
          <div className="analytics-card">
            <h3>Submission Velocity</h3>
            <p className="tiny muted">Weekly submissions across Project Kassena</p>
            <div className="mini-chart">
              <svg viewBox="0 0 200 60" className="sparkline-svg">
                <polyline
                  fill="none"
                  stroke="var(--terracotta)"
                  strokeWidth="3"
                  points="10,50 40,42 70,46 100,28 130,32 160,18 190,12"
                />
                <circle cx="190" cy="12" r="4" fill="var(--terracotta)" />
              </svg>
              <div className="sparkline-meta">
                <strong>+48% this month</strong>
                <span className="tiny muted">184 new entries/wk</span>
              </div>
            </div>
          </div>

          <div className="analytics-card">
            <h3>Validation Turnaround</h3>
            <p className="tiny muted">Average time from submission to custodian review</p>
            <div className="metric-large">
              <strong>1.8 days</strong>
              <span className="tiny positive">✓ Under 48h SLA target</span>
            </div>
          </div>

          <div className="analytics-card">
            <h3>Audio Coverage Ratio</h3>
            <p className="tiny muted">% of verified lexical records with native audio</p>
            <div className="metric-large">
              <strong>84.2%</strong>
              <div className="meter" aria-hidden="true">
                <span style={{ width: '84.2%', background: 'var(--success)' }} />
              </div>
            </div>
          </div>

          <div className="analytics-card">
            <h3>Dialect Representation</h3>
            <p className="tiny muted">Distribution of records by regional dialect</p>
            <ul className="mini-dialect-list">
              <li><span>Navrongo (East)</span><strong>48%</strong></li>
              <li><span>Paga (West)</span><strong>32%</strong></li>
              <li><span>Chiana &amp; Katiu</span><strong>12%</strong></li>
              <li><span>Tiébélé / Pô (North)</span><strong>8%</strong></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Administrative domains</h2>
        <ul className="entity-grid">
          {adminDomains.map((domain) => (
            <li key={domain.title} className="entity-card">
              <strong>
                {domain.title}
                {domain.planned ? <span className="tag tag--planned">Planned</span> : null}
              </strong>
              <p>{domain.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Validation lifecycle</h2>
        <ol className="pipeline">
          {(enums.validationStatus as string[]).map((status) => (
            <li key={status} className={`pipeline__step pipeline__step--${status}`}>{statusLabels[status] ?? status}</li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2>Shared contract entities</h2>
        <p className="panel__hint">{entities.length} entities from <code>@indigen-world/contracts</code>.</p>
        <ul className="entity-grid">
          {entities.map(([key, schema]) => (
            <li key={key} className="entity-card">
              <strong>{(schema as { title?: string }).title ?? key}</strong>
              <p>{(schema as { description?: string }).description ?? ''}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
