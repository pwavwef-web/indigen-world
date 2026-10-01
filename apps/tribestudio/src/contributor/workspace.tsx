import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRoute } from '../router';
import { canValidate, useAuth } from '../auth';
import { EmptyState, PageHeader } from './components';
import { activityFrom, friendlyError, itemStatus, type ActivityEvent, type FriendlyError } from './model';
import { assignedRows, receiptRows, recordingRows, revisionRows, type SubmissionRow } from './submissions';
import type { AccountTab, DailyTasks, PaymentsView, RewardView, Section, SelfView, WorkspaceData } from './types';
import { AppShell, RouteLink, type NavEntry } from './shell';
import { OverviewPage } from './pages/OverviewPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { AssignmentPage } from './pages/AssignmentPage';
import { ContributionsPage } from './pages/ContributionsPage';
import { RevisionsPage } from './pages/RevisionsPage';
import { ActivityPage } from './pages/ActivityPage';
import { GuidePage } from './pages/GuidePage';
import { KawuriPage } from './pages/KawuriPage';
import { AccountPage, ContributePage } from './lazy';
import { RewardsPage } from './rewards';

/**
 * The contributor workspace shell: navigation, the page for the current
 * route, and the slower reads several pages share (profile, payment
 * verification, points, today's batch), fetched once.
 *
 * Routes (all under /contributor):
 *   /contributor                         Overview
 *   /contributor/assignments             Tasks
 *   /contributor/{uid}/{work}[?item=]    One task — the address every SMS
 *                                        invitation carries, kept as it was
 *   /contributor/contribute[?type=]      Start a contribution
 *   /contributor/contributions[?view=]   My submissions, and one submission
 *   /contributor/revisions               Revision requests
 *   /contributor/rewards                 Points and redemption (/streak lands here)
 *   /contributor/activity                Updates
 *   /contributor/guide[?section=]        Guidelines
 *   /contributor/kawuri[?work=&item=]    Kawuri assistant
 *   /contributor/account[/{tab}]         Profile and settings
 */

export const WorkspaceContext = createContext<WorkspaceData | null>(null);

export function useWorkspace(): WorkspaceData {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside the contributor workspace.');
  return value;
}

export interface PortalRoute {
  section: Section;
  work?: string;
  item?: string;
  accountTab: AccountTab;
  query: URLSearchParams;
  notFound: boolean;
}

const SIMPLE_SECTIONS: Section[] = ['assignments', 'contribute', 'contributions', 'revisions', 'activity', 'guide', 'kawuri', 'rewards', 'streak'];
const ACCOUNT_TABS: AccountTab[] = ['profile', 'security', 'notifications', 'payments'];
/** First path segments that are workspace pages, never an account id. */
const RESERVED = new Set(['account', 'review', 'preview', 'support', ...SIMPLE_SECTIONS]);

export function parsePortalRoute(path: string, search: string, base: string, preview: boolean): PortalRoute {
  const query = new URLSearchParams(search);
  const route: PortalRoute = { section: 'overview', accountTab: 'profile', query, notFound: false };
  const rest = path === base ? [] : path.slice(base.length).split('/').filter(Boolean);
  if (rest.length === 0) return route;
  const [first, second] = rest;
  if (rest.length === 1 && SIMPLE_SECTIONS.includes(first as Section)) return { ...route, section: first as Section };
  if (first === 'account' && rest.length <= 2) {
    const tab = ACCOUNT_TABS.includes(second as AccountTab) ? second as AccountTab : 'profile';
    return { ...route, section: 'account', accountTab: tab, notFound: Boolean(second) && tab !== second };
  }
  // Live: /contributor/{uid}/{work}. Preview: /contributor/preview/assignment/{work}.
  if (rest.length === 2 && (preview ? first === 'assignment' : !RESERVED.has(first))) {
    return { ...route, section: 'assignments', work: second, item: query.get('item') ?? undefined };
  }
  return { ...route, notFound: true };
}

/**
 * The account an SMS invitation link belongs to: /contributor/{uid}/{work}.
 * Workspace pages can have the same two-segment shape (/contributor/account/
 * {tab}, /contributor/review/queue), so they are never read as a link for
 * someone else's account.
 */
export function invitationLinkOwner(path: string): string | null {
  const [root, uid, work, ...extra] = path.split('/').filter(Boolean);
  if (root !== 'contributor' || !uid || !work || extra.length || RESERVED.has(uid)) return null;
  try {
    return decodeURIComponent(uid);
  } catch {
    return null;
  }
}

export const SECTION_TITLES: Record<Section, string> = {
  overview: 'Overview',
  assignments: 'Tasks',
  contribute: 'Start a contribution',
  contributions: 'My submissions',
  revisions: 'Revisions',
  rewards: 'Rewards',
  streak: 'Rewards',
  activity: 'Updates',
  guide: 'Guidelines',
  kawuri: 'Kawuri assistant',
  account: 'Profile and settings',
};

// ---------------------------------------------------------------------------
// Shared slow reads
// ---------------------------------------------------------------------------

export interface Resource<T> {
  value: T | null;
  state: 'loading' | 'ready' | 'error';
  error: FriendlyError | null;
  refresh: () => void;
  set: (value: T) => void;
}

function useResource<T>(load: () => Promise<T>, what: string): Resource<T> {
  const [value, setValue] = useState<T | null>(null);
  const [state, setState] = useState<Resource<T>['state']>('loading');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let active = true;
    setState((current) => (current === 'ready' ? current : 'loading'));
    loader.current().then((next) => {
      if (!active) return;
      setValue(next);
      setState('ready');
      setError(null);
    }).catch((reason) => {
      if (!active) return;
      setError(friendlyError(reason, what));
      setState('error');
    });
    return () => { active = false; };
  }, [attempt, what]);
  const refresh = useCallback(() => setAttempt((count) => count + 1), []);
  const set = useCallback((next: T) => {
    setValue(next);
    setState('ready');
    setError(null);
  }, []);
  return { value, state, error, refresh, set };
}

interface ShellShared {
  self: Resource<SelfView>;
  payments: Resource<PaymentsView>;
  rewards: Resource<RewardView>;
  daily: Resource<DailyTasks>;
  /** Every piece of work the contributor has touched, in one vocabulary. */
  rows: SubmissionRow[];
  revisions: SubmissionRow[];
  events: ActivityEvent[];
  unseenUpdates: number;
  markUpdatesSeen: () => void;
  navigateTo: (to: string) => void;
  /** The phone editor is open: the tab bar steps aside for its sticky actions. */
  setEditing: (editing: boolean) => void;
}

const SharedContext = createContext<ShellShared | null>(null);

export function useShared(): ShellShared {
  const value = useContext(SharedContext);
  if (!value) throw new Error('useShared must be used inside the contributor workspace.');
  return value;
}

/** Payment attention for badges: anything a contributor must act on. */
export function paymentsNeedAttention(payments: PaymentsView | null): boolean {
  if (!payments) return false;
  return payments.bank?.status === 'needs_action' || payments.bank?.status === 'rejected'
    || payments.momo?.ownershipStatus === 'needs_action' || payments.momo?.ownershipStatus === 'rejected'
    || Boolean(payments.bank?.legacy && !payments.bank.statement);
}

/** Events that tell the contributor something new — not the record of what they did themselves. */
const NEWS: ActivityEvent['kind'][] = ['approved', 'returned', 'in_review', 'archived', 'assigned', 'payment'];

function useUpdatesSeen(uid: string): [string, () => void] {
  const key = `contributor-updates-seen:${uid}`;
  const [seen, setSeen] = useState(() => { try { return window.localStorage.getItem(key) ?? ''; } catch { return ''; } });
  const mark = useCallback(() => {
    const now = new Date().toISOString();
    setSeen(now);
    try { window.localStorage.setItem(key, now); } catch { /* A per-browser convenience only. */ }
  }, [key]);
  return [seen, mark];
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function WorkspaceShell({ banner }: { banner?: ReactNode }) {
  const data = useWorkspace();
  const { role } = useAuth();
  const { path, search, navigate } = useRoute();
  const route = useMemo(() => parsePortalRoute(path, search, data.paths.base, data.preview), [path, search, data.paths.base, data.preview]);
  const self = useResource(data.services.loadSelf, 'Your profile');
  const payments = useResource(data.services.loadPayments, 'Payment settings');
  const rewards = useResource(data.services.loadRewards, 'Your points');
  const daily = useResource(data.services.loadDaily, 'Today’s tasks');
  const [editing, setEditing] = useState(false);
  const [seen, markSeen] = useUpdatesSeen(data.uid);

  // Approvals add credits and submissions change today's batch; refresh the
  // two callables when the records they summarise move, not on a timer.
  const creditKey = data.credits.map((credit) => credit.id).join(',');
  const submittedKey = Object.values(data.items).flat().filter((item) => item.submissionId).length;
  const refreshRewards = rewards.refresh;
  const refreshDaily = daily.refresh;
  const firstCredit = useRef(true);
  useEffect(() => { if (firstCredit.current) { firstCredit.current = false; return; } refreshRewards(); }, [creditKey, refreshRewards]);
  const firstSubmit = useRef(true);
  useEffect(() => { if (firstSubmit.current) { firstSubmit.current = false; return; } refreshDaily(); }, [submittedKey, data.works.length, refreshDaily]);

  const rows = useMemo(() => [
    ...assignedRows(data.works, data.items, data.rounds),
    ...receiptRows(data.receipts),
    ...recordingRows(data.recordings),
  ], [data.items, data.receipts, data.recordings, data.rounds, data.works]);
  const revisions = useMemo(() => revisionRows(rows), [rows]);
  const events = useMemo(() => activityFrom(data.rounds, data.works, data.paymentNotices), [data.paymentNotices, data.rounds, data.works]);
  const unseenUpdates = useMemo(() => events.filter((event) => NEWS.includes(event.kind) && (!seen || event.at > seen)).length, [events, seen]);
  const openTasks = useMemo(() => data.works.filter((work) => (data.items[work.id] ?? [])
    .some((item) => ['not_started', 'draft', 'unsure'].includes(itemStatus(item)))).length, [data.items, data.works]);
  const paymentAttention = paymentsNeedAttention(payments.value);

  const shared = useMemo<ShellShared>(() => ({
    self, payments, rewards, daily, rows, revisions, events, unseenUpdates, markUpdatesSeen: markSeen, navigateTo: navigate, setEditing,
  }), [self, payments, rewards, daily, rows, revisions, events, unseenUpdates, markSeen, navigate]);

  const href = (section: Section) => (section === 'account' ? data.paths.account('profile') : data.paths.section(section));
  const nav: NavEntry[] = [
    { id: 'overview', label: 'Overview', short: 'Overview', href: href('overview'), icon: 'overview' },
    { id: 'assignments', label: 'Tasks', short: 'Tasks', href: href('assignments'), icon: 'assignments',
      badge: openTasks ? { text: String(openTasks), tone: 'info', label: `${openTasks} with work remaining` } : null },
    { id: 'contributions', label: 'My submissions', short: 'Submissions', href: href('contributions'), icon: 'contributions' },
    { id: 'revisions', label: 'Revisions', short: 'Revisions', href: href('revisions'), icon: 'revisions',
      badge: revisions.length ? { text: String(revisions.length), tone: 'warning', label: `${revisions.length} waiting for you` } : null },
    { id: 'rewards', label: 'Rewards', short: 'Rewards', href: href('rewards'), icon: 'rewards' },
  ];
  const secondary = {
    label: 'Help',
    items: [
      { id: 'guide', label: 'Guidelines', href: href('guide'), icon: 'guide' as const },
      { id: 'kawuri', label: 'Kawuri assistant', href: href('kawuri'), icon: 'kawuri' as const },
    ],
  };
  const activeId = route.notFound ? null : route.section === 'streak' ? 'rewards' : route.section;
  const title = route.notFound ? 'Page not found' : SECTION_TITLES[route.section];
  const work = route.work ? data.works.find((entry) => entry.id === route.work) : undefined;
  const trail = [
    { label: 'Contributor workspace', href: data.paths.base },
    ...(route.section === 'overview' && !route.notFound ? [] : [{ label: route.work ? 'Tasks' : title, href: route.work ? href('assignments') : undefined }]),
    ...(route.work ? [{ label: work?.title ?? 'Task' }] : []),
    ...(route.section === 'contributions' && route.query.get('view') ? [{ label: 'Submission' }] : []),
  ];
  const displayName = self.value?.profile.displayName || data.displayName || data.email;

  return (
    <SharedContext.Provider value={shared}>
      <AppShell
        workspaceLabel="Contributor workspace"
        homeHref={data.paths.base}
        nav={nav}
        secondary={secondary}
        activeId={activeId}
        primaryAction={{ id: 'contribute', label: 'Start a contribution', short: 'Contribute', href: href('contribute'), icon: 'plus' }}
        roles={data.preview
          ? { current: 'contributor', contributorHref: data.paths.base, validatorHref: `${data.paths.base}/review` }
          : canValidate(role) ? { current: 'contributor', contributorHref: data.paths.base, validatorHref: '/contributor/review' } : null}
        user={{
          name: displayName,
          email: data.email,
          photoUrl: self.value?.profile.photoUrl,
          accountHref: data.paths.account('profile'),
          accountLabel: paymentAttention ? 'Profile and settings — payment details need attention' : 'Profile and settings',
        }}
        updates={{ href: href('activity'), count: unseenUpdates }}
        trail={trail}
        mobileTabs={['overview', 'assignments', 'contributions', 'revisions']}
        title={title}
        banner={banner}
        editing={editing}
        wide={Boolean(route.work)}
        onSignOut={() => void data.services.signOut()}
      >
        {route.notFound ? <NotFound /> : <PageFor key={`${data.uid}:${route.section}`} route={route} />}
      </AppShell>
    </SharedContext.Provider>
  );
}

function PageFor({ route }: { route: PortalRoute }) {
  switch (route.section) {
    case 'rewards':
    case 'streak':
      return <RewardsPage history={route.query.get('view') === 'history'} />;
    case 'assignments':
      return route.work ? <AssignmentPage key={route.work} workId={route.work} itemId={route.item} /> : <AssignmentsPage />;
    case 'contribute':
      return <ContributePage type={route.query.get('type') ?? ''} correct={route.query.get('correct') ?? ''} entry={route.query.get('entry') ?? ''} />;
    case 'contributions':
      return <ContributionsPage initialFilter={route.query.get('filter') ?? route.query.get('status') ?? ''} view={route.query.get('view') ?? ''} />;
    case 'revisions':
      return <RevisionsPage />;
    case 'activity':
      return <ActivityPage />;
    case 'guide':
      return <GuidePage section={route.query.get('section') ?? ''} />;
    case 'kawuri':
      return <KawuriPage initialWork={route.query.get('work') ?? ''} initialItem={route.query.get('item') ?? ''} initialMode={route.query.get('mode') ?? ''} />;
    case 'account':
      return <AccountPage tab={route.accountTab} />;
    default:
      return <OverviewPage />;
  }
}

function NotFound() {
  const { paths } = useWorkspace();
  return (
    <div className="cw-page">
      <PageHeader title="This page does not exist" description="The link may be mistyped or out of date. Your tasks and submissions are unaffected." />
      <EmptyState title="Nothing at this address" icon="search" actions={<PortalLink to={paths.base} className="cw-btn cw-btn--primary">Go to the overview</PortalLink>}>
        Use the navigation to find your tasks, submissions and rewards.
      </EmptyState>
    </div>
  );
}

/** A plain anchor that navigates inside the workspace without a reload. */
export function PortalLink({ to, children, className, ariaLabel }: { to: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  return <RouteLink to={to} className={className} ariaLabel={ariaLabel}>{children}</RouteLink>;
}

export function useGuideLink(): (section: string) => string {
  const { paths } = useWorkspace();
  return (section: string) => paths.section('guide', { section });
}
