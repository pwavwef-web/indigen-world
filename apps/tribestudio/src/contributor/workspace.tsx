import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRoute } from '../router';
import { canValidate, useAuth } from '../auth';
import { cx, type IconName } from './components';
import { friendlyError, itemStatus, metricsFor, type FriendlyError } from './model';
import type { AccountTab, PaymentsView, Section, SelfView, WorkspaceData } from './types';
import { WorkspaceFrame, type WorkspaceDestination } from '../interface/WorkspaceFrame';
import { NotificationCentre } from './notifications';
import { OverviewPage } from './pages/OverviewPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { AssignmentPage } from './pages/AssignmentPage';
import { ContributionsPage } from './pages/ContributionsPage';
import { ActivityPage } from './pages/ActivityPage';
import { GuidePage } from './pages/GuidePage';
import { KawuriPage } from './pages/KawuriPage';
import { AccountPage } from './pages/AccountPage';
import { RewardsPage } from './rewards';

/**
 * The contributor workspace shell: persistent navigation, the page for the
 * current route, and the two slow reads every page may want (the
 * contributor's own profile and their payment verification status), fetched
 * once and shared.
 *
 * Routes (all under /contributor):
 *   /contributor                         Overview
 *   /contributor/assignments             Assignments
 *   /contributor/{uid}/{work}[?item=]    One assignment — the address every SMS
 *                                        invitation carries, kept as it was
 *   /contributor/contributions           My contributions
 *   /contributor/activity                Activity
 *   /contributor/guide[?section=]        Platform guide
 *   /contributor/kawuri[?work=&item=]    Kawuri Intelligence
 *   /contributor/account[/{tab}]         Account & settings
 */

import { WorkspaceContext, SharedContext } from './context';

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

const SIMPLE_SECTIONS: Section[] = ['assignments', 'contributions', 'activity', 'guide', 'kawuri', 'rewards', 'streak'];
const ACCOUNT_TABS: AccountTab[] = ['profile', 'security', 'notifications', 'payments'];

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
  if (rest.length === 2 && (preview ? first === 'assignment' : true)) {
    return { ...route, section: 'assignments', work: second, item: query.get('item') ?? undefined };
  }
  return { ...route, notFound: true };
}

/**
 * The account an SMS invitation link belongs to: /contributor/{uid}/{work}.
 * Account pages have the same two-segment shape (/contributor/account/{tab}),
 * so they are never read as a link for someone else's account.
 */
export function invitationLinkOwner(path: string): string | null {
  const [root, uid, work, ...extra] = path.split('/').filter(Boolean);
  if (root !== 'contributor' || !uid || !work || extra.length || uid === 'account') return null;
  try {
    return decodeURIComponent(uid);
  } catch {
    return null;
  }
}

interface NavItem {
  section: Section;
  label: string;
  short: string;
  icon: IconName;
}

export const NAV: NavItem[] = [
  { section: 'overview', label: 'Home', short: 'Home', icon: 'overview' },
  { section: 'assignments', label: 'Tasks', short: 'Tasks', icon: 'assignments' },
  { section: 'contributions', label: 'My contributions', short: 'Contributions', icon: 'contributions' },
  { section: 'rewards', label: 'Recognition history', short: 'Recognition', icon: 'activity' },
  { section: 'streak', label: 'Streak', short: 'Streak', icon: 'activity' },
  { section: 'activity', label: 'Activity', short: 'Activity', icon: 'activity' },
  { section: 'guide', label: 'Help & guide', short: 'Help', icon: 'guide' },
  { section: 'kawuri', label: 'Kawuri Intelligence', short: 'Kawuri', icon: 'kawuri' },
  { section: 'account', label: 'Account & settings', short: 'Account', icon: 'account' },
];


// ---------------------------------------------------------------------------
// Shared slow reads
// ---------------------------------------------------------------------------

interface Resource<T> {
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

export interface ShellShared {
  self: Resource<SelfView>;
  payments: Resource<PaymentsView>;
  navigateTo: (to: string) => void;
  /** The phone editor is open: the tab bar steps aside for its sticky actions. */
  setEditing: (editing: boolean) => void;
}



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
  const [editing, setEditing] = useState(false);
  const returned = metricsFor(Object.values(data.items).flat()).returned;
  const openAssignments = data.works.filter(work => (data.items[work.id] ?? []).some(item => ['not_started', 'draft', 'unsure'].includes(itemStatus(item)))).length;
  const shared = useMemo<ShellShared>(() => ({ self, payments, navigateTo: navigate, setEditing }), [self, payments, navigate]);
  const destinations: WorkspaceDestination[] = NAV.map(item => ({
    to: item.section === 'account' ? data.paths.account('profile') : data.paths.section(item.section),
    label: item.section === 'overview' ? 'Overview' : item.section === 'assignments' ? 'Assignments' : item.label,
    icon: item.icon,
    group: ['overview','assignments','contributions','activity'].includes(item.section) ? 'Your work' : ['guide','kawuri'].includes(item.section) ? 'Resources' : 'Account',
    active: item.section === route.section,
    badge: item.section === 'contributions' && returned ? returned : item.section === 'assignments' && openAssignments ? openAssignments : item.section === 'account' && paymentsNeedAttention(payments.value) ? '!' : undefined,
  }));
  if (!data.preview) destinations.push({ to: '/contributor/corpus',label:'Corpus workspace',icon:'guide',group:'Your work' });
  if (!data.preview && canValidate(role)) destinations.push({ to: '/contributor/review', label: 'Review workspace', icon: 'shield', group: 'Resources' });
  return <SharedContext.Provider value={shared}>
    <WorkspaceFrame identity="Contribute" destinations={destinations} account={self.value?.profile.displayName || data.displayName || data.email} photo={self.value?.profile.photoUrl} onSignOut={() => void data.services.signOut()} banner={banner}>
      <div className={cx('cw iwx', editing && 'is-editing')}><div className="cw-content"><NotificationCentre />{route.notFound ? <NotFound /> : <PageFor key={`${data.uid}:${route.section}`} route={route} />}</div></div>
    </WorkspaceFrame>
  </SharedContext.Provider>;
}

function PageFor({ route }: { route: PortalRoute }) {
  switch (route.section) {
    case 'rewards':
      return <RewardsPage history={route.query.get('view') !== 'redeem'} />;
    case 'streak':
      return <RewardsPage streak />;
    case 'assignments':
      return route.work ? <AssignmentPage key={route.work} workId={route.work} itemId={route.item} /> : <AssignmentsPage />;
    case 'contributions':
      return <ContributionsPage initialFilter={route.query.get('filter') ?? ''} />;
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
  const { navigate } = useRoute();
  return (
    <div className="cw-page">
      <div className="cw-empty cw-empty--page">
        <strong>This page does not exist</strong>
        <p>The link may be mistyped or out of date. Your assignments and contributions are unaffected.</p>
        <button type="button" className="button--primary" onClick={() => navigate(paths.section('overview'))}>Go to the overview</button>
      </div>
    </div>
  );
}

/** A plain anchor that navigates inside the workspace without a reload. */
export function PortalLink({ to, children, className, ariaLabel }: { to: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  const { navigate } = useRoute();
  return (
    <a
      href={to}
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function useGuideLink(): (section: string) => string {
  const { paths } = useWorkspace();
  return (section: string) => paths.section('guide', { section });
}
