import { useEffect, useState } from 'react';
import type {
  Campaign,
  CreatorApplication,
  CreatorNotification,
  CreatorProfile,
  Submission,
} from '@indigen-world/contracts/creator-models';
import { ProgressBar, StreakBadge, Badge, Modal } from '@indigen-world/web-ui';
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

interface MilestoneBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  tier: 'bronze' | 'silver' | 'gold';
}

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
  const [selectedBadge, setSelectedBadge] = useState<MilestoneBadge | null>(null);

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

  // Gamification stats calculation
  const validatedCount = submissions.filter((s) => s.status === 'APPROVED').length;
  const totalSubmissions = submissions.length;
  const xpPoints = totalSubmissions * 50 + validatedCount * 150;
  const currentLevel = Math.floor(xpPoints / 300) + 1;
  const nextLevelXp = currentLevel * 300;
  const currentLevelProgress = xpPoints % 300;

  const BADGES: MilestoneBadge[] = [
    {
      id: 'founding-voice',
      name: 'Founding Voice',
      description: 'Applied and accepted into the Indigen World Founding Creator cohort.',
      icon: '🎙️',
      unlocked: application?.status === 'APPROVED' || !!profile,
      tier: 'gold',
    },
    {
      id: 'first-entry',
      name: 'Pioneer Contributor',
      description: 'Submitted your first cultural narrative or lexical recording.',
      icon: '📜',
      unlocked: totalSubmissions >= 1,
      tier: 'bronze',
    },
    {
      id: 'kasem-scholar',
      name: 'Kasem Wordsmith',
      description: 'Contributed 5 or more validated linguistic entries.',
      icon: '🏺',
      unlocked: validatedCount >= 5,
      tier: 'silver',
    },
    {
      id: 'guardian-culture',
      name: 'Dialect Guardian',
      description: 'Earned 500+ XP in language preservation activities.',
      icon: '🛡️',
      unlocked: xpPoints >= 500,
      tier: 'gold',
    },
  ];

  return (
    <div className="page">
      <header className="page__head page__head--spread">
        <div>
          <div className="head-greeting">
            <h1>Welcome, {profile?.public.displayName ?? user?.displayName ?? 'creator'}</h1>
            <StreakBadge count={5} label="Day Streak" />
          </div>
          <p className="muted">Your founding-creator workspace &amp; cultural portfolio.</p>
        </div>
        <div className="head-actions">
          {profile?.reference ? <span className="ref-chip">{profile.reference}</span> : null}
          <Link to="/workspace" className="button button--ghost-dark button--small">
            ✍ Lexicon Studio
          </Link>
        </div>
      </header>

      {!profile ? (
        <div className="callout callout--info">
          <strong>Finish joining the programme.</strong> You have not completed a founding-creator
          application yet.{' '}
          <Link to="/creators/join">Complete your application →</Link>
        </div>
      ) : null}

      {/* Gamification Level & XP Progress Banner */}
      <section className="gamification-banner iw-glass-card">
        <div className="gamification-banner__left">
          <div className="level-badge">
            <span>LVL</span>
            <strong>{currentLevel}</strong>
          </div>
          <div className="level-info">
            <h3>{currentLevel === 1 ? 'Apprentice Storyteller' : currentLevel === 2 ? 'Kasem Wordsmith' : 'Master Custodian'}</h3>
            <p className="tiny muted">{xpPoints} total XP earned • {nextLevelXp - currentLevelProgress} XP to Level {currentLevel + 1}</p>
            <ProgressBar value={currentLevelProgress} max={300} tone="terracotta" />
          </div>
        </div>
        <div className="gamification-banner__badges">
          {BADGES.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`badge-icon ${b.unlocked ? 'is-unlocked' : 'is-locked'}`}
              title={`${b.name} (${b.unlocked ? 'Unlocked' : 'Locked'})`}
              onClick={() => setSelectedBadge(b)}
            >
              <span>{b.icon}</span>
              <small>{b.name}</small>
            </button>
          ))}
        </div>
      </section>

      {/* Stat Tiles */}
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
          <span className="tile__label">Validated Material</span>
          <span className="tile__value">{validatedCount}</span>
        </div>
      </div>

      {/* Quick Creation Suite */}
      <section className="creation-shortcuts">
        <h2>Quick Creation Tools</h2>
        <div className="shortcuts-grid">
          <Link to="/workspace" className="shortcut-card">
            <span className="shortcut-card__icon">🎙️</span>
            <div>
              <strong>Record Kasem Headword</strong>
              <p className="tiny muted">Voice pronunciation with dialect tags</p>
            </div>
          </Link>
          <Link to="/studio/opportunities" className="shortcut-card">
            <span className="shortcut-card__icon">📖</span>
            <div>
              <strong>Folklore &amp; Proverbs</strong>
              <p className="tiny muted">Bilingual cultural storytelling</p>
            </div>
          </Link>
          <Link to="/studio/profile" className="shortcut-card">
            <span className="shortcut-card__icon">🛡️</span>
            <div>
              <strong>Cultural Portfolio</strong>
              <p className="tiny muted">Manage permissions &amp; credentials</p>
            </div>
          </Link>
        </div>
      </section>

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

      {/* Badge Detail Modal */}
      <Modal
        isOpen={!!selectedBadge}
        onClose={() => setSelectedBadge(null)}
        title="Milestone Achievement"
        size="small"
      >
        {selectedBadge ? (
          <div className="badge-modal-content">
            <div className="badge-modal-icon">{selectedBadge.icon}</div>
            <h3>{selectedBadge.name}</h3>
            <p>{selectedBadge.description}</p>
            <div className="badge-modal-status">
              {selectedBadge.unlocked ? (
                <Badge tone="success">✓ Unlocked</Badge>
              ) : (
                <Badge tone="neutral">🔒 In Progress</Badge>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <WhatsAppCard url={whatsappUrl} />
    </div>
  );
}

