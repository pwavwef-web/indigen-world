import { useEffect, useState, type ReactNode } from 'react';
import type { CreatorApplication, CreatorMembership, CreatorProfile } from '@indigen-world/contracts/creator-models';
import { Link, RouterProvider, matchRoute, useRoute } from './router';
import { signIn, useAuth } from './auth';
import { CreatorProvider } from './creator/CreatorProvider';
import { PublicLayout } from './creator/PublicLayout';
import { StudioLayout } from './creator/StudioLayout';
import { LexiconWorkspace } from './workspace/LexiconWorkspace';
import { LandingPage } from './creator/pages/LandingPage';
import { JoinPage } from './creator/pages/JoinPage';
import { SuccessPage } from './creator/pages/SuccessPage';
import { GuidelinesPage } from './creator/pages/GuidelinesPage';
import { FaqPage } from './creator/pages/FaqPage';
import { DashboardPage } from './creator/pages/DashboardPage';
import { ProfilePage } from './creator/pages/ProfilePage';
import { OpportunitiesPage } from './creator/pages/OpportunitiesPage';
import { OpportunityDetailPage } from './creator/pages/OpportunityDetailPage';
import { SubmissionsPage } from './creator/pages/SubmissionsPage';
import { SubmissionNewPage } from './creator/pages/SubmissionNewPage';
import { SubmissionDetailPage } from './creator/pages/SubmissionDetailPage';
import { NotificationsPage } from './creator/pages/NotificationsPage';
import { HelpPage } from './creator/pages/HelpPage';
import { fetchMyApplications, fetchMyMembership, fetchMyProfile } from './creator/data';
import { StatusPill, WhatsAppCard } from './creator/components';
import { useConfig } from './creator/CreatorProvider';

function BrandMark() {
  return (
    <span className="brand__mark" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M15 47V23l17-9 17 9v24" />
        <path d="M24 44V29m8 15V24m8 20V29" />
        <circle cx="32" cy="14" r="4" />
      </svg>
    </span>
  );
}

function SignInGate() {
  return (
    <div className="signin">
      <div className="signin__card">
        <BrandMark />
        <h1>TribeStudio</h1>
        <p>Sign in to reach your founding-creator workspace.</p>
        <button type="button" className="button button--primary" onClick={() => void signIn()}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p className="muted">The page you’re looking for doesn’t exist.</p>
    </div>
  );
}

function ApplicationStatusGate({ children, path }: { children: ReactNode; path: string }) {
  const { user, creatorStatus, refreshToken } = useAuth();
  const { whatsappUrl } = useConfig();
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<CreatorMembership | null>(null);
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void Promise.all([
      fetchMyMembership(user.uid),
      fetchMyApplications(user.uid),
      fetchMyProfile(user.uid),
    ]).then(async ([m, a, p]) => {
      if (!active) return;
      setMembership(m);
      setApplications(a);
      setProfile(p);
      if (m?.status === 'approved' && creatorStatus !== 'approved') {
        await refreshToken();
      }
      if (active) setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user, creatorStatus, refreshToken]);

  if (loading) {
    return <div className="loading">Checking creator access…</div>;
  }

  if (membership?.status === 'approved') {
    return <>{children}</>;
  }

  const application = applications[0] ?? null;
  const status = membership?.status ?? application?.status ?? profile?.status ?? 'not_started';
  const blocked = ['rejected', 'suspended', 'revoked', 'REJECTED', 'SUSPENDED'].includes(status);

  if (!blocked && profile && path === '/studio/profile') {
    return (
      <PublicLayout>
        <div className="status-screen status-screen--profile">
          <section className="status-screen__panel">
            <p className="hero__eyebrow">Application status</p>
            <h1>Profile details</h1>
            <p className="muted">
              You can keep your permitted profile details current while your application is reviewed.
              The private production studio opens only after approval.
            </p>
            <StatusPill status={String(status).toUpperCase()} labels={STATUS_LABELS} />
          </section>
          <ProfilePage />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="status-screen">
        <section className="status-screen__panel">
          <p className="hero__eyebrow">Creator access</p>
          <h1>{blocked ? 'Studio access is not available' : 'Your application is being reviewed'}</h1>
          <p className="muted">
            Approved creators can enter the private TribeStudio workspace. Until then, you can review your
            status, update permitted profile details and follow the official creator channel.
          </p>
          <dl className="success__meta">
            <div>
              <dt>Status</dt>
              <dd><StatusPill status={String(status).toUpperCase()} labels={STATUS_LABELS} /></dd>
            </div>
            {application?.reference || profile?.reference ? (
              <div>
                <dt>Reference</dt>
                <dd>{application?.reference ?? profile?.reference}</dd>
              </div>
            ) : null}
          </dl>
          <div className="success__actions">
            {!application && !profile ? (
              <Link to="/creators/join" className="button button--primary">Join the waitlist</Link>
            ) : (
              <Link to="/studio/profile" className="button button--ghost-dark">Update profile details</Link>
            )}
            <button type="button" className="button button--ghost-dark" onClick={() => void refreshToken()}>
              Refresh access
            </button>
          </div>
          <WhatsAppCard url={whatsappUrl} compact />
          <p className="tiny">Submitting the waitlist form does not automatically grant creator access.</p>
        </section>
      </div>
    </PublicLayout>
  );
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'Pending review',
  WAITLISTED: 'Waitlisted',
  APPROVED: 'Approved',
  REJECTED: 'Not selected',
  SUSPENDED: 'Suspended',
  REVOKED: 'Revoked',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_INFO: 'More information requested',
  ACTIVE: 'Active',
  WITHDRAWN: 'Withdrawn',
};

function renderStudio(path: string) {
  if (path === '/studio') return <DashboardPage />;
  if (path === '/studio/profile') return <ProfilePage />;
  if (path === '/studio/opportunities') return <OpportunitiesPage />;
  if (matchRoute('/studio/opportunities/:id', path)) return <OpportunityDetailPage />;
  if (path === '/studio/submissions') return <SubmissionsPage />;
  if (path === '/studio/submissions/new') return <SubmissionNewPage />;
  if (matchRoute('/studio/submissions/:id', path)) return <SubmissionDetailPage />;
  if (path === '/studio/notifications') return <NotificationsPage />;
  if (path === '/studio/help') return <HelpPage />;
  return <NotFound />;
}

function Routed() {
  const { path } = useRoute();
  const { user, ready } = useAuth();

  // ---- Public creator surfaces (no authentication required) ----
  if (path === '/' || path === '/creators') return <PublicLayout><LandingPage /></PublicLayout>;
  if (path === '/creators/guidelines') return <PublicLayout><GuidelinesPage /></PublicLayout>;
  if (path === '/creators/faq') return <PublicLayout><FaqPage /></PublicLayout>;
  if (path === '/creators/join') return <PublicLayout><JoinPage /></PublicLayout>;
  if (path === '/creators/join/success') return <PublicLayout><SuccessPage /></PublicLayout>;

  // ---- Authenticated workspace ----
  const isStudio = path === '/studio' || path.startsWith('/studio/');
  const isWorkspace = path === '/workspace';
  if (isStudio || isWorkspace) {
    if (!ready) return <div className="loading">Loading…</div>;
    if (!user) return <SignInGate />;
    if (isWorkspace) return <LexiconWorkspace />;
    return (
      <ApplicationStatusGate path={path}>
        <StudioLayout>{renderStudio(path)}</StudioLayout>
      </ApplicationStatusGate>
    );
  }

  return <PublicLayout><NotFound /></PublicLayout>;
}

function App() {
  return (
    <RouterProvider>
      <CreatorProvider>
        <Routed />
      </CreatorProvider>
    </RouterProvider>
  );
}

export default App;
