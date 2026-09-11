import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { isValidator, type AdminRole } from '../creators/data';
import { firebaseConfig, usingEmulators } from '../firebase';
import { Alert, Kbd, Spinner } from '../ui/primitives';
import { fetchOperationsSnapshot, type OperationsSnapshot } from './data';

/** How often the queue totals re-read themselves while the console is open. */
const AUTO_REFRESH_MS = 120_000;

interface QueueCard {
  key: keyof Omit<OperationsSnapshot, 'capturedAt'>;
  label: string;
  body: string;
  path: string;
  action: string;
  tone: 'gold' | 'clay' | 'green' | 'indigo';
}

const queues: QueueCard[] = [
  {
    key: 'reviewQueue',
    label: 'Content awaiting review',
    body: 'Kasem words, stories and creator work ready for a custodian decision.',
    path: '/creators',
    action: 'Open review queue',
    tone: 'gold',
  },
  {
    key: 'creatorApplications',
    label: 'Creator applications',
    body: 'Submitted or in-review applications waiting for the next decision.',
    path: '/creators',
    action: 'Review applications',
    tone: 'indigo',
  },
  {
    key: 'openReports',
    label: 'Community reports',
    body: 'Open and actively reviewing moderation cases from the community.',
    path: '/reports',
    action: 'Moderate reports',
    tone: 'clay',
  },
  {
    key: 'newInterests',
    label: 'New form responses',
    body: 'Website enquiries, community interests and Founding Tester claims still needing attention.',
    path: '/interests',
    action: 'Open forms & claims',
    tone: 'green',
  },
];

const workspaces = [
  {
    path: '/learning',
    eyebrow: 'Teach',
    title: 'Kasem learning',
    body: 'Publish lessons, exercises and the guided learning path.',
  },
  {
    path: '/collection',
    eyebrow: 'Share',
    title: 'Cultural collection',
    body: 'Curate apps, books, music, heroes and the community shop.',
  },
  {
    path: '/messaging',
    eyebrow: 'Reach',
    title: 'Community messaging',
    body: 'Send governed announcements and manage contact groups.',
  },
  {
    path: '/audit',
    eyebrow: 'Protect',
    title: 'Governance trail',
    body: 'Inspect the permanent record of privileged decisions.',
  },
] as const;

function QueueSkeleton() {
  return (
    <div className="queue-card queue-card--loading" aria-hidden="true">
      <span className="skeleton skeleton--number" />
      <span className="skeleton skeleton--line" />
      <span className="skeleton skeleton--line skeleton--short" />
    </div>
  );
}

export function ConsoleHome({
  role,
  onNavigate,
}: {
  role: AdminRole;
  onNavigate: (to: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async () => {
    if (!isValidator(role)) return;
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchOperationsSnapshot());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The live queue totals could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* A console left open on a second monitor should not quietly show yesterday's
     queue. The totals are five aggregate reads, so re-running them every couple
     of minutes costs almost nothing — and it can be switched off. */
  useEffect(() => {
    if (!autoRefresh || !isValidator(role)) return;
    const timer = window.setInterval(() => void refresh(), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh, role]);

  const totalAttention = useMemo(
    () =>
      snapshot
        ? queues.reduce((total, queue) => total + snapshot[queue.key], 0)
        : 0,
    [snapshot],
  );
  const open = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(path);
  };

  return (
    <div className="console-home">
      <section className="console-hero">
        <div className="console-hero__copy">
          <p className="console-eyebrow">PROJECT KASSENA · OPERATIONS</p>
          <h1>Keep Kasem living, useful and community-owned.</h1>
          <p>
            Review contributions, care for the community and publish the learning
            experiences that carry language, stories and identity forward.
          </p>
          <div className="console-hero__status">
            <span className="live-dot" aria-hidden="true" />
            <strong>{role ? role.replace('_', ' ') : 'Access not provisioned'}</strong>
            <span aria-hidden="true">·</span>
            <span>{firebaseConfig.projectId}</span>
            <span aria-hidden="true">·</span>
            <span>{usingEmulators ? 'emulator suite' : 'production workspace'}</span>
            <span aria-hidden="true">·</span>
            <span><Kbd>⌘K</Kbd> to jump anywhere</span>
          </div>
        </div>
        <div className="console-hero__mark" aria-hidden="true">
          <span>KA</span>
          <span>SEM</span>
        </div>
      </section>

      {!isValidator(role) ? (
        <section className="panel access-callout">
          <span className="access-callout__icon" aria-hidden="true">!</span>
          <div>
            <h2>Your account is signed in, but has no staff role</h2>
            <p>
              Ask a super administrator to grant a reviewer or administrator role,
              then sign out and back in to refresh your access token.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="section-block" aria-labelledby="attention-heading">
            <div className="section-heading-row">
              <div>
                <p className="section-kicker">LIVE OPERATIONS</p>
                <h2 id="attention-heading">Needs attention</h2>
                <p>Current Firestore totals—no sample or estimated figures.</p>
              </div>
              <div className="section-heading-row__actions">
                {snapshot ? (
                  <span className="snapshot-time">
                    Updated {snapshot.capturedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : null}
                <label className="filter">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(event) => setAutoRefresh(event.target.checked)}
                  />
                  Auto-refresh
                </label>
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => void refresh()}
                  disabled={loading}
                >
                  {loading ? <><Spinner /> Refreshing…</> : 'Refresh totals'}
                </button>
              </div>
            </div>

            {error ? (
              <Alert
                title="Live totals unavailable."
                action={<button type="button" className="button button--small" onClick={() => void refresh()}>Try again</button>}
              >
                {error}
              </Alert>
            ) : null}

            <div className="queue-grid" aria-busy={loading && !snapshot}>
              {loading && !snapshot
                ? queues.map((queue) => <QueueSkeleton key={queue.key} />)
                : queues.map((queue) => (
                    <a
                      key={queue.key}
                      href={queue.path}
                      onClick={open(queue.path)}
                      className={`queue-card queue-card--${queue.tone}`}
                    >
                      <span className={snapshot ? 'queue-card__number' : 'queue-card__number queue-card__number--unknown'}>
                        {snapshot?.[queue.key] ?? 'no data'}
                      </span>
                      <span className="queue-card__label">{queue.label}</span>
                      <span className="queue-card__body">{queue.body}</span>
                      <span className="queue-card__action">{queue.action} <span aria-hidden="true">→</span></span>
                    </a>
                  ))}
            </div>

            {snapshot ? (
              <p className="attention-summary">
                <strong>{totalAttention}</strong> open items across the four primary queues
                <span aria-hidden="true"> · </span>
                <a href="/team-sites" onClick={open('/team-sites')}>{snapshot.teamSiteRequests} team site request{snapshot.teamSiteRequests === 1 ? '' : 's'}</a>
              </p>
            ) : null}
          </section>

          <section className="section-block" aria-labelledby="workspaces-heading">
            <div className="section-heading-row">
              <div>
                <p className="section-kicker">PROJECT WORKSPACES</p>
                <h2 id="workspaces-heading">Manage the ecosystem</h2>
                <p>Move directly into a publishing, communication or governance task.</p>
              </div>
            </div>
            <div className="workspace-grid">
              {workspaces.map((workspace) => (
                <a
                  key={workspace.path}
                  href={workspace.path}
                  className="workspace-card"
                  onClick={open(workspace.path)}
                >
                  <span className="workspace-card__eyebrow">{workspace.eyebrow}</span>
                  <strong>{workspace.title}</strong>
                  <span>{workspace.body}</span>
                  <span className="workspace-card__arrow" aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
