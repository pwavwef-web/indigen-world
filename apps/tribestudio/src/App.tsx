import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { CreatorApplication, CreatorMembership, CreatorProfile } from '@indigen-world/contracts/creator-models';
import { ToastProvider } from '@indigen-world/web-ui';
import { RouterProvider, matchRoute, useRoute } from './router';
import { signIn, useAuth } from './auth';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFoundPage } from './NotFoundPage';
import { CreatorProvider } from './creator/CreatorProvider';
import { PublicLayout } from './creator/PublicLayout';
import { StudioLayout } from './creator/StudioLayout';
import { ensureCreatorProfile, fetchMyApplications, fetchMyMembership, fetchMyProfile } from './creator/data';
import { StatusPill, WhatsAppCard } from './creator/components';
import { useConfig } from './creator/CreatorProvider';

// Route-based code-splitting: each page (and the heavy Lexicon workspace) loads
// as its own chunk behind the <Suspense> boundaries in the layouts, so the
// public landing route no longer ships the entire studio up front.
const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[key] as ComponentType })));

const LexiconWorkspace = named(() => import('./workspace/LexiconWorkspace'), 'LexiconWorkspace');
const LandingPage = named(() => import('./creator/pages/LandingPage'), 'LandingPage');
const JoinPage = named(() => import('./creator/pages/JoinPage'), 'JoinPage');
const SuccessPage = named(() => import('./creator/pages/SuccessPage'), 'SuccessPage');
const GuidelinesPage = named(() => import('./creator/pages/GuidelinesPage'), 'GuidelinesPage');
const FaqPage = named(() => import('./creator/pages/FaqPage'), 'FaqPage');
const DashboardPage = named(() => import('./creator/pages/DashboardPage'), 'DashboardPage');
const ProfilePage = named(() => import('./creator/pages/ProfilePage'), 'ProfilePage');
const OpportunitiesPage = named(() => import('./creator/pages/OpportunitiesPage'), 'OpportunitiesPage');
const OpportunityDetailPage = named(() => import('./creator/pages/OpportunityDetailPage'), 'OpportunityDetailPage');
const SubmissionsPage = named(() => import('./creator/pages/SubmissionsPage'), 'SubmissionsPage');
const SubmissionNewPage = named(() => import('./creator/pages/SubmissionNewPage'), 'SubmissionNewPage');
const SubmissionDetailPage = named(() => import('./creator/pages/SubmissionDetailPage'), 'SubmissionDetailPage');
const StudioVideoPage = named(() => import('./creator/pages/StudioVideoPage'), 'StudioVideoPage');
const NotificationsPage = named(() => import('./creator/pages/NotificationsPage'), 'NotificationsPage');
const HelpPage = named(() => import('./creator/pages/HelpPage'), 'HelpPage');

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

/**
 * Guards the studio.
 *
 * The gate used to be "approved creators only", which locked everyday people
 * out of publishing anything at all. Publishing to Explore is now open to any
 * signed-in account: the studio opens for everybody, and approval means only
 * what it should mean - eligibility for campaigns, which carry rewards.
 *
 * The one thing still turned away here is an account that has been suspended,
 * revoked or rejected. That is a moderation outcome, and it has to hold.
 */
function ApplicationStatusGate({ children }: { children: ReactNode }) {
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

  // Membership status is lowercase, application status is UPPERCASE, and profile
  // status is lowercase - normalize once so no blocked state slips through the
  // case mismatch (previously WITHDRAWN/REVOKED were misclassified as active).
  const application = applications[0] ?? null;
  const status = String(
    membership?.status ?? application?.status ?? profile?.status ?? 'not_started',
  ).toUpperCase();
  const blocked = ['REJECTED', 'SUSPENDED', 'REVOKED', 'WITHDRAWN'].includes(status);

  // Mint a minimal creator profile for anyone arriving without one, so their
  // first post has something to attribute itself to. Runs after the initial
  // read, and never for a blocked account.
  useEffect(() => {
    if (loading || blocked || !user || profile) return;
    let active = true;
    void ensureCreatorProfile(
      user.uid,
      user.displayName ?? user.email ?? '',
      user.photoURL ?? null,
    ).then((created) => {
      if (active && created) setProfile(created);
    });
    return () => {
      active = false;
    };
  }, [loading, blocked, user, profile]);

  if (loading) {
    return <div className="loading">Opening your studio...</div>;
  }

  if (!blocked) {
    return <>{children}</>;
  }

  return (
    <PublicLayout>
      <div className="status-screen">
        <section className="status-screen__panel">
          <p className="hero__eyebrow">Creator access</p>
          <h1>Studio access is not available</h1>
          <p className="muted">
            This account cannot publish to Indigen World at the moment. If you think that
            is a mistake, reply on the official creator channel and the team will look
            at it.
          </p>
          <dl className="success__meta">
            <div>
              <dt>Status</dt>
              <dd><StatusPill status={status} labels={STATUS_LABELS} /></dd>
            </div>
            {application?.reference || profile?.reference ? (
              <div>
                <dt>Reference</dt>
                <dd>{application?.reference ?? profile?.reference}</dd>
              </div>
            ) : null}
          </dl>
          <div className="success__actions">
            <button type="button" className="button button--ghost-dark" onClick={() => void refreshToken()}>
              Refresh access
            </button>
          </div>
          <WhatsAppCard url={whatsappUrl} compact />
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
  if (path === '/studio/video') return <StudioVideoPage />;
  if (path === '/studio/notifications') return <NotificationsPage />;
  if (path === '/studio/help') return <HelpPage />;
  return <NotFoundPage variant="studio" />;
}

function Routed() {
  const { path } = useRoute();
  const { user, ready } = useAuth();
  const hasMounted = useRef(false);

  // Move keyboard/screen-reader focus to the main region on route change so
  // navigation is announced and the skip link lands somewhere focusable.
  useEffect(() => {
    if (hasMounted.current) {
      document.getElementById('main-content')?.focus();
    } else {
      hasMounted.current = true;
    }
  }, [path]);

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
    if (isWorkspace) {
      return (
        <Suspense fallback={<div className="loading">Loading…</div>}>
          <LexiconWorkspace />
        </Suspense>
      );
    }
    return (
      <ApplicationStatusGate>
        <StudioLayout>{renderStudio(path)}</StudioLayout>
      </ApplicationStatusGate>
    );
  }

  return <PublicLayout><NotFoundPage /></PublicLayout>;
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <RouterProvider>
          <CreatorProvider>
            <Routed />
          </CreatorProvider>
        </RouterProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
