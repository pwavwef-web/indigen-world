import { Suspense, lazy, useEffect, useRef, useState, type ComponentType } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ToastProvider } from '@indigen-world/web-ui';
import { Link, RouterProvider, matchRoute, useRoute } from './router';
import { canMakeVideo, signIn, useAuth } from './auth';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFoundPage } from './NotFoundPage';
import { FullPageLoader, RouteLoader } from './LoadingScreen';
import { CreatorProvider } from './creator/CreatorProvider';
import { PublicLayout } from './creator/PublicLayout';
import { StudioLayout } from './creator/StudioLayout';
import { ApplicationStatusGate } from './creator/CreatorAccess';
import { WorkspaceEntry } from './interface/WorkspaceFrame';

// Route-based code-splitting: each page (and the heavy Lexicon workspace) loads
// as its own chunk behind the <Suspense> boundaries in the layouts, so the
// public landing route no longer ships the entire studio up front.
const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[key] as ComponentType })));

const LexiconWorkspace = named(() => import('./workspace/LexiconWorkspace'), 'LexiconWorkspace');
const KnowledgePreview = import.meta.env.DEV ? named(() => import('./knowledge/KnowledgePreview'), 'KnowledgePreview') : null;
const ContributorPreview = import.meta.env.DEV ? named(() => import('./contributor/ContributorPreview'), 'ContributorPreview') : null;
const ContributorPortal = named(() => import('./contributor/ContributorPortal'), 'ContributorPortal');
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
const StudioVideoJobsPage = named(() => import('./creator/pages/StudioVideoJobsPage'), 'StudioVideoJobsPage');
const VideoEditorPage = named(() => import('./creator/editor/EditorPage'), 'EditorPage');
const VideoProjectsPage = named(() => import('./creator/editor/ProjectsPage'), 'ProjectsPage');
const PublishedPage = named(() => import('./creator/pages/PublishedPage'), 'PublishedPage');
const DictionaryPage = named(() => import('./creator/pages/DictionaryPage'), 'DictionaryPage');
const ExpressionsPage = named(() => import('./creator/pages/ExpressionsPage'), 'ExpressionsPage');
const NotificationsPage = named(() => import('./creator/pages/NotificationsPage'), 'NotificationsPage');
const HelpPage = named(() => import('./creator/pages/HelpPage'), 'HelpPage');

/**
 * The sign-in wall in front of the studio.
 *
 * Somebody arriving from the website's "Share an expression" button is told
 * what they are signing in *for*, and why an account is needed at all: it is
 * what lets them see the review status of what they send.
 */
function SignInGate({ path }: { path: string }) {
  const forExpressions = path.startsWith('/studio/expressions');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return (
    <WorkspaceEntry title={forExpressions ? 'Share language with context.' : undefined} description={forExpressions ? 'Send an expression, follow its review and keep control of your permissions.' : undefined}>
        <p className="iw-entry-kicker">Create · Sign in</p>
        <h1>{forExpressions ? 'Share a Kasem expression' : 'Welcome to TribeStudio'}</h1>
        {forExpressions ? (
          <p>Sign in to send an expression, follow reviewer feedback and withdraw your contribution when needed.</p>
        ) : (
          <p>Sign in to save your draft and share your work. You can preview your post before publishing.</p>
        )}
        {error ? <p role="alert" className="iw-entry-error">{error}</p> : null}
        <button type="button" className="cw-auth__primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await signIn(); } catch { setError('Sign-in did not complete. Check your connection and try again.'); } finally { setBusy(false); } }}>
          {busy ? 'Opening sign-in…' : 'Sign in with Google'}
        </button>
    </WorkspaceEntry>
  );
}

/**
 * Shown where the AI video pages would be for an account without an approved
 * membership. The callables behind those pages require a role claim only
 * approval grants, so rendering them would have offered a form whose every
 * request came back permission-denied.
 */
function VideoNotYetAvailable() {
  return (
    <div className="page">
      <h1>Video making opens with approval</h1>
      <div className="callout callout--info">
        <strong>Everything else in the studio is already yours.</strong> Posting to Explore, the
        dictionary desk and your profile need no approval. Making a video does, because each one
        buys a generation from a video provider.
      </div>
      <p className="muted">
        If you have applied already, approval is the only thing outstanding — you will see this
        section appear on its own. Your current status is on your profile.
      </p>
      <p className="section__more">
        <Link to="/studio/profile" className="button button--primary button--small">Check your status</Link>{' '}
        <Link to="/studio/submissions/new" className="button button--ghost-dark button--small">Post something now</Link>
      </p>
    </div>
  );
}

function renderStudio(path: string, canVideo: boolean) {
  if (path === '/studio') return <DashboardPage />;
  if (path === '/studio/profile') return <ProfilePage />;
  if (path === '/studio/opportunities') return <OpportunitiesPage />;
  if (matchRoute('/studio/opportunities/:id', path)) return <OpportunityDetailPage />;
  if (path === '/studio/submissions') return <SubmissionsPage />;
  if (path === '/studio/published') return <PublishedPage />;
  // Editing personal footage is available to every creator. Only paid AI
  // generation (a scene's "Make with AI", and the pages below) needs the
  // approved-creator role.
  if (path === '/studio/editor') return <VideoProjectsPage />;
  const editorRoute = matchRoute('/studio/editor/:projectId', path);
  if (editorRoute) return <VideoEditorPage key={editorRoute.projectId} />;
  if (path === '/studio/submissions/new') return <SubmissionNewPage />;
  // Before the :id route, which would otherwise swallow "/edit" as an id.
  if (matchRoute('/studio/submissions/:id/edit', path)) return <SubmissionNewPage />;
  if (matchRoute('/studio/submissions/:id', path)) return <SubmissionDetailPage />;
  if (path === '/studio/video' || path === '/studio/video/jobs') {
    if (!canVideo) return <VideoNotYetAvailable />;
    return path === '/studio/video' ? <StudioVideoPage /> : <StudioVideoJobsPage />;
  }
  if (path === '/studio/dictionary') return <DictionaryPage />;
  if (path === '/studio/expressions' || path === '/studio/expressions/new') return <ExpressionsPage />;
  if (path === '/studio/notifications') return <NotificationsPage />;
  if (path === '/studio/help') return <HelpPage />;
  return <NotFoundPage variant="studio" />;
}

function Routed() {
  const { path, navigate } = useRoute();
  const { user, ready, role } = useAuth();
  const hasMounted = useRef(false);
  const [contributorCheck, setContributorCheck] = useState('');
  const [contributorError, setContributorError] = useState(false);
  const contributorRoute = path === '/contributor' || path.startsWith('/contributor/');
  useEffect(() => {
    if (!user || contributorRoute) return;
    let active = true;
    setContributorError(false);
    void getDoc(doc(db, 'contributorAccounts', user.uid)).then(account => {
      if (!active) return;
      // Invited contributors land on their workspace overview, which leads
      // with the assignment to continue. Deep links to an assignment
      // (/contributor/{uid}/{work}) are untouched: they are contributor routes.
      if (account.get('status') === 'active' && account.get('defaultWork')) {
        navigate('/contributor', { replace: true });
      }
      setContributorCheck(user.uid);
    }).catch(() => { if (active) setContributorError(true); });
    return () => { active = false; };
  }, [user?.uid, contributorRoute, navigate]);

  // Move keyboard/screen-reader focus to the main region on route change so
  // navigation is announced and the skip link lands somewhere focusable.
  useEffect(() => {
    if (hasMounted.current) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    } else {
      hasMounted.current = true;
    }
  }, [path]);

  if (path === '/contributor/preview/corpus' && KnowledgePreview) return <Suspense fallback={<FullPageLoader />}><KnowledgePreview /></Suspense>;
  if ((path === '/contributor/preview' || path.startsWith('/contributor/preview/')) && ContributorPreview) {
    return <Suspense fallback={<FullPageLoader />}><ContributorPreview /></Suspense>;
  }
  // Keyed by account only: moving between workspace sections keeps its
  // listeners and state; signing in as someone else starts afresh.
  if (contributorRoute) return <Suspense fallback={<FullPageLoader />}><ContributorPortal key={user?.uid ?? 'guest'} /></Suspense>;
  if (user && contributorCheck !== user.uid) {
    if (contributorError) return <div className="signin"><p>Unable to check your account. <button onClick={() => window.location.reload()}>Retry</button></p></div>;
    return <FullPageLoader note="Opening your account…" />;
  }
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
    if (!ready) return <FullPageLoader />;
    if (!user) return <SignInGate path={path} />;
    if (isWorkspace) {
      return (
        <StudioLayout>
          <Suspense fallback={<RouteLoader note="Opening the lexicon workspace" />}>
            <LexiconWorkspace />
          </Suspense>
        </StudioLayout>
      );
    }
    return (
      <ApplicationStatusGate>
        <StudioLayout immersive={path.startsWith('/studio/editor/')}>{renderStudio(path, canMakeVideo(role))}</StudioLayout>
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
