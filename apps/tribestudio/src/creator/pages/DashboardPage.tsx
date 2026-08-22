import { useEffect, useState } from 'react';
import type {
  Campaign,
  CreatorApplication,
  CreatorNotification,
  CreatorProfile,
  Submission,
} from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { useConfig } from '../CreatorProvider';
import {
  fetchMyApplications,
  fetchMyNotifications,
  fetchMyProfile,
  fetchMySubmissions,
  fetchPublicCampaigns,
  submissionsOpen,
} from '../data';
import {
  APPLICATION_STATUS_LABELS,
  CAMPAIGN_STATUS_LABELS,
  LoadError,
  Skeleton,
  StatusPill,
  SUBMISSION_STATUS_LABELS,
  useReloadable,
  WhatsAppCard,
} from '../components';

export function DashboardPage() {
  const { user } = useAuth();
  const { whatsappUrl } = useConfig();
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [notifications, setNotifications] = useState<CreatorNotification[]>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    setLoading(true);
    void Promise.all([
      fetchMyProfile(user.uid),
      fetchMyApplications(user.uid),
      fetchPublicCampaigns(),
      fetchMySubmissions(user.uid),
      fetchMyNotifications(user.uid),
    ])
      .then(([p, a, c, s, n]) => {
        if (!active) return;
        setProfile(p);
        setApplications(a);
        setCampaigns(c);
        setSubmissions(s);
        setNotifications(n);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [user, reloadKey, setFailed]);

  if (failed) {
    return (
      <div className="page">
        <h1>Welcome back</h1>
        <LoadError onRetry={retry} title="We couldn’t load your dashboard" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Welcome back</h1>
        <Skeleton lines={6} />
      </div>
    );
  }

  const application = applications[0] ?? null;
  const anyOpen = campaigns.some(submissionsOpen);
  const completion = profile?.profileCompletion ?? (profile ? 60 : 0);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Welcome, {profile?.public.displayName ?? user?.displayName ?? 'creator'}</h1>
          <p className="muted">Your founding-creator workspace.</p>
        </div>
        {profile?.reference ? <span className="ref-chip">{profile.reference}</span> : null}
      </header>

      {!profile ? (
        <div className="callout callout--info">
          <strong>Finish joining the programme.</strong> You have not completed a founding-creator
          application yet.{' '}
          <Link to="/creators/join">Complete your application →</Link>
        </div>
      ) : null}

      <div className="tiles">
        <div className="tile">
          <span className="tile__label">Application status</span>
          <span className="tile__value">
            {application ? (
              <StatusPill status={application.status} labels={APPLICATION_STATUS_LABELS} />
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">Profile completion</span>
          <span className="tile__value">{completion}%</span>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${completion}%` }} />
          </div>
        </div>
        <div className="tile">
          <span className="tile__label">Submissions</span>
          <span className="tile__value">{submissions.length}</span>
        </div>
        <div className="tile">
          <span className="tile__label">Account</span>
          <span className="tile__value">{user?.emailVerified ? 'Verified' : 'Unverified'}</span>
        </div>
      </div>

      {!anyOpen ? (
        <div className="prep-state">
          <h2>You’re all set — we’ll tell you when it opens</h2>
          <p>
            Your creator profile is ready. We’ll announce when the Kasem Creator Challenge opens for
            submissions. In the meantime, polish your profile and read the guidelines.
          </p>
          <div className="prep-state__actions">
            <Link to="/studio/profile" className="button button--primary">Complete your profile</Link>
            <Link to="/creators/guidelines" className="button button--ghost-dark">Read the guidelines</Link>
          </div>
        </div>
      ) : (
        <section className="panel">
          <div className="panel__head">
            <h2>Submissions are open</h2>
            <Link to="/studio/opportunities" className="button button--primary button--small">View opportunities</Link>
          </div>
          <p className="muted">One or more campaigns are accepting entries now.</p>
        </section>
      )}

      <div className="cols">
        <section className="panel">
          <h2>Active and upcoming campaigns</h2>
          {campaigns.length === 0 ? (
            <p className="muted">No campaigns announced yet.</p>
          ) : (
            <ul className="mini-list">
              {campaigns.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <Link to={`/studio/opportunities/${c.id}`}>{c.title}</Link>
                  <StatusPill status={c.status} labels={CAMPAIGN_STATUS_LABELS} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Recent notifications</h2>
          {notifications.length === 0 ? (
            <p className="muted">Nothing yet.</p>
          ) : (
            <ul className="mini-list">
              {notifications.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <span className={n.read ? 'muted' : ''}>{n.title}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="section__more">
            <Link to="/studio/notifications">All notifications →</Link>
          </p>
        </section>
      </div>

      {submissions.length > 0 ? (
        <section className="panel">
          <div className="panel__head">
            <h2>Your submissions</h2>
            <Link to="/studio/submissions" className="button button--ghost-dark button--small">Manage</Link>
          </div>
          <ul className="mini-list">
            {submissions.slice(0, 3).map((s) => (
              <li key={s.id}>
                <Link to={`/studio/submissions/${s.id}`}>{s.title || 'Untitled'}</Link>
                <StatusPill status={s.status} labels={SUBMISSION_STATUS_LABELS} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <WhatsAppCard url={whatsappUrl} />
    </div>
  );
}
