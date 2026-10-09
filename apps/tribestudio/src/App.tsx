import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ToastProvider } from '@indigen-world/web-ui';
import { RouterProvider, matchRoute, useRoute } from './router';
import { canMakeVideo, signIn, signOutUser, useAuth } from './auth';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFoundPage } from './NotFoundPage';
import { FullPageLoader, RouteLoader } from './LoadingScreen';
import { CreatorProvider } from './creator/CreatorProvider';
import { PublicLayout } from './creator/PublicLayout';
import { StudioLayout } from './creator/StudioLayout';
import { ApplicationStatusGate } from './creator/CreatorAccess';
import { AuthScreen, Button, ButtonLink, EmptyState, GoogleButton, Notice, Page, WorkspaceAccessContext } from './ui';

// Route-based code-splitting: each page (and the heavy Lexicon workspace) loads
// as its own chunk behind the <Suspense> boundaries in the layouts, so the
// public landing route no longer ships the entire studio up front.
const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[key] as ComponentType })));

const LexiconWorkspace = named(() => import('./workspace/LexiconWorkspace'), 'LexiconWorkspace');
const KnowledgePreview = import.meta.env.DEV ? named(() => import('./knowledge/KnowledgePreview'), 'KnowledgePreview') : null;
const KnowledgeWorkspace = named(() => import('./knowledge/KnowledgeWorkspace'), 'KnowledgeWorkspace');
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
  const start = async () => {
    setBusy(true);
    setError('');
    try {
      await signIn();
    } catch {
      setError('Sign-in did not complete. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthScreen
      workspace="create"
      title={forExpressions ? 'Share a Kasem expression' : 'Sign in to TribeStudio'}
      lede={forExpressions
        ? 'Sign in to send an expression, follow reviewer feedback and withdraw it whenever you need to.'
        : 'Your drafts, posts and video projects are saved to your Indigen World account.'}
      journey={forExpressions
        ? [{ icon: 'pen', label: 'Write the expression' }, { icon: 'send', label: 'Send for review' }, { icon: 'eye', label: 'Follow the decision' }]
        : [{ icon: 'pen', label: 'Create a draft' }, { icon: 'eye', label: 'Preview it' }, { icon: 'send', label: 'Publish or submit' }]}
      note="Invited contributors and validators sign in from their own invitation link."
    >
      <div className="ts-auth__form">
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        <GoogleButton onClick={() => void start()} busy={busy} />
        <p className="ts-hint" style={{ textAlign: 'center' }}>
          Contributor or validator? <a href={`/contributor?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Sign in with your email</a>
        </p>
      </div>
    </AuthScreen>
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
    <Page width="medium">
      <EmptyState
        boxed
        icon="lock"
        title="Video generation opens with approval"
        body="Posting to Explore, editing your own footage, the dictionary desk and your profile need no approval. Generating a video does, because each one buys a render from a video provider. If you have applied, approval is the only thing outstanding — this section appears on its own once it is granted."
        actions={<>
          <ButtonLink to="/studio/profile" variant="primary" icon="user">Check your status</ButtonLink>
          <ButtonLink to="/studio/editor" icon="film">Edit your own footage</ButtonLink>
        </>}
      />
    </Page>
  );
}

function renderStudio(path: string, canVideo: boolean) {
  if (path === '/studio/knowledge') return <KnowledgeWorkspace />;
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
  const [contributorActive, setContributorActive] = useState<{ uid: string; active: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const contributorRoute = path === '/contributor' || path.startsWith('/contributor/');
  useEffect(() => {
    if (!user) return;
    let active = true;
    setContributorError(false);
    void getDoc(doc(db, 'contributorAccounts', user.uid)).then(account => {
      if (!active) return;
      const isActive = account.get('status') === 'active';
      setContributorActive({ uid: user.uid, active: isActive });
      // Invited contributors land on their workspace overview, which leads
      // with the assignment to continue. Deep links to an assignment
      // (/contributor/{uid}/{work}) are untouched: they are contributor routes.
      const contributionDestination = /^\/studio\/(dictionary|expressions|knowledge|submissions\/new)(?:\/|$)/.test(path);
      if (!contributorRoute && !contributionDestination && isActive && account.get('defaultWork')) {
        navigate('/contributor', { replace: true });
      }
      setContributorCheck(user.uid);
    }).catch(() => { if (active) setContributorError(true); });
    return () => { active = false; };
    // The check runs once per account (and on retry); moving between
    // contributor and studio routes must not re-read or re-redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, attempt, navigate]);

  // Move keyboard/screen-reader focus to the main region on route change so
  // navigation is announced and the skip link lands somewhere focusable.
  useEffect(() => {
    if (hasMounted.current) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    } else {
      hasMounted.current = true;
    }
  }, [path]);

  const access = useMemo(() => ({ contributor: user && contributorActive?.uid === user.uid ? contributorActive.active : null }), [user, contributorActive]);

  const content = (() => {
    if (path === '/contributor/preview/corpus' && KnowledgePreview) return <Suspense fallback={<FullPageLoader />}><KnowledgePreview /></Suspense>;
    if ((path === '/contributor/preview' || path.startsWith('/contributor/preview/')) && ContributorPreview) {
      return <Suspense fallback={<FullPageLoader />}><ContributorPreview /></Suspense>;
    }
    // Keyed by account only: moving between workspace sections keeps its
    // listeners and state; signing in as someone else starts afresh.
    if (contributorRoute) return <Suspense fallback={<FullPageLoader />}><ContributorPortal key={user?.uid ?? 'guest'} /></Suspense>;
    if (user && contributorCheck !== user.uid) {
      if (contributorError) {
        return (
          <AuthScreen workspace="create" title="We could not open your account" lede="Your account details did not load. Nothing has changed; check your connection and try again.">
            <div className="ts-auth__form">
              <Button variant="primary" size="lg" block icon="refresh" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
              <Button variant="ghost" block onClick={() => void signOutUser()}>Sign out</Button>
            </div>
          </AuthScreen>
        );
      }
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
          <StudioLayout key={user.uid} immersive={path.startsWith('/studio/editor/')}>{renderStudio(path, canMakeVideo(role))}</StudioLayout>
        </ApplicationStatusGate>
      );
    }

    return <PublicLayout><NotFoundPage /></PublicLayout>;
  })();

  return <WorkspaceAccessContext.Provider value={access}>{content}</WorkspaceAccessContext.Provider>;
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
