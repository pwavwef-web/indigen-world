import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useRoute } from '../router';
import { BrandMark, Icon, cx, type IconName } from './components';
import { friendlyError, initials, itemStatus, metricsFor, type FriendlyError } from './model';
import type { AccountTab, PaymentsView, Section, SelfView, WorkspaceData } from './types';
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
  { section: 'rewards', label: 'Points', short: 'Points', icon: 'spark' },
  { section: 'streak', label: 'Streak', short: 'Streak', icon: 'activity' },
  { section: 'activity', label: 'Activity', short: 'Activity', icon: 'activity' },
  { section: 'guide', label: 'Help & guide', short: 'Help', icon: 'guide' },
  { section: 'kawuri', label: 'Kawuri Intelligence', short: 'Kawuri', icon: 'kawuri' },
  { section: 'account', label: 'Account & settings', short: 'Account', icon: 'account' },
];

const MOBILE_PRIMARY: Section[] = ['overview', 'assignments', 'contributions', 'rewards'];

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

interface ShellShared {
  self: Resource<SelfView>;
  payments: Resource<PaymentsView>;
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

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function WorkspaceShell({ banner }: { banner?: ReactNode }) {
  const data = useWorkspace();
  const { path, search, navigate } = useRoute();
  const route = useMemo(() => parsePortalRoute(path, search, data.paths.base, data.preview), [path, search, data.paths.base, data.preview]);
  const self = useResource(data.services.loadSelf, 'Your profile');
  const payments = useResource(data.services.loadPayments, 'Payment settings');
  const moreDialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);

  const allItems = useMemo(() => Object.values(data.items).flat(), [data.items]);
  const returned = useMemo(() => metricsFor(allItems).returned, [allItems]);
  const openAssignments = useMemo(() => data.works.filter((work) => (data.items[work.id] ?? [])
    .some((item) => ['not_started', 'draft', 'unsure'].includes(itemStatus(item)))).length, [data.items, data.works]);
  const paymentAttention = paymentsNeedAttention(payments.value);
  const displayName = self.value?.profile.displayName || data.displayName || data.email;

  const shared = useMemo<ShellShared>(() => ({ self, payments, navigateTo: navigate, setEditing }), [self, payments, navigate]);
  const hrefFor = (section: Section) => (section === 'account' ? data.paths.account('profile') : data.paths.section(section));
  const go = (section: Section) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    moreDialog.current?.close();
    navigate(hrefFor(section));
  };
  const badge = (section: Section): { text: string; tone: 'warning' | 'info' | 'danger'; label: string } | null => {
    if (section === 'contributions' && returned) return { text: String(returned), tone: 'warning', label: `${returned} returned for revision` };
    if (section === 'assignments' && openAssignments) return { text: String(openAssignments), tone: 'info', label: `${openAssignments} with work remaining` };
    if (section === 'account' && paymentAttention) return { text: '!', tone: 'danger', label: 'payment details need attention' };
    return null;
  };
  const current = NAV.find((item) => item.section === route.section) ?? NAV[0];

  useEffect(() => { document.title = `${current.label} · Contributor workspace`; }, [current.label]);

  const link = (item: NavItem, variant: 'side' | 'bottom' | 'sheet') => {
    const active = item.section === route.section;
    const count = badge(item.section);
    return (
      <a
        key={item.section}
        href={hrefFor(item.section)}
        onClick={go(item.section)}
        className={cx(`cw-nav__link cw-nav__link--${variant}`, active && 'is-active')}
        aria-current={active ? 'page' : undefined}
      >
        <Icon name={item.icon} />
        <span className="cw-nav__label">{variant === 'bottom' ? item.short : item.label}</span>
        {count ? <span className={cx('cw-nav__badge', `cw-nav__badge--${count.tone}`)}><span aria-hidden="true">{count.text}</span><span className="cw-sr">{count.label}</span></span> : null}
      </a>
    );
  };

  return (
    <SharedContext.Provider value={shared}>
      <div className={cx('cw iwx', editing && 'is-editing')}>
        <a href="#main-content" className="cw-skip">Skip to content</a>
        <aside className="cw-side" aria-label="Contributor workspace">
          <div className="cw-brand">
            <BrandMark />
            <span className="cw-brand__copy"><strong>Contributor workspace</strong><small>Indigen World · TribeStudio</small></span>
          </div>
          <nav className="cw-nav" aria-label="Workspace sections">
            {NAV.map((item) => link(item, 'side'))}
          </nav>
          <div className="cw-side__footer">
            <span className="cw-avatar" aria-hidden="true">
              {self.value?.profile.photoUrl ? <img src={self.value.profile.photoUrl} alt="" /> : initials(displayName)}
            </span>
            <span className="cw-side__who"><strong>{displayName}</strong><small>{data.email}</small></span>
            <button type="button" className="cw-icon-button" onClick={() => void data.services.signOut()} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
          </div>
        </aside>

        <header className="cw-topbar">
          <div className="cw-topbar__brand"><BrandMark /><span>{current.label}</span></div>
          <a href={data.paths.account('profile')} onClick={go('account')} className="cw-topbar__account" aria-label={`Account and settings${paymentAttention ? ', payment details need attention' : ''}`}>
            <span className="cw-avatar cw-avatar--small" aria-hidden="true">
              {self.value?.profile.photoUrl ? <img src={self.value.profile.photoUrl} alt="" /> : initials(displayName)}
            </span>
            {paymentAttention ? <span className="cw-topbar__dot" aria-hidden="true" /> : null}
          </a>
        </header>

        <div className="cw-main">
          {banner}
          <main id="main-content" tabIndex={-1} className="cw-content">
            <NotificationCentre />
            {route.notFound ? <NotFound /> : <PageFor key={`${data.uid}:${route.section}`} route={route} />}
          </main>
        </div>

        <nav className="cw-bottom" aria-label="Workspace sections">
          {NAV.filter((item) => MOBILE_PRIMARY.includes(item.section)).map((item) => link(item, 'bottom'))}
          <button type="button" className={cx('cw-nav__link cw-nav__link--bottom', !MOBILE_PRIMARY.includes(route.section) && 'is-active')} onClick={() => moreDialog.current?.showModal()} aria-haspopup="dialog">
            <Icon name="more" />
            <span className="cw-nav__label">More</span>
            {paymentAttention ? <span className="cw-nav__badge cw-nav__badge--danger"><span aria-hidden="true">!</span><span className="cw-sr">payment details need attention</span></span> : null}
          </button>
        </nav>
        <dialog ref={moreDialog} className="cw-sheet" aria-label="More sections">
          <div className="cw-sheet__head">
            <strong>More</strong>
            <button type="button" className="cw-icon-button" onClick={() => moreDialog.current?.close()} aria-label="Close"><Icon name="close" /></button>
          </div>
          <nav className="cw-sheet__nav" aria-label="More sections">
            {NAV.filter((item) => !MOBILE_PRIMARY.includes(item.section)).map((item) => link(item, 'sheet'))}
          </nav>
          <button type="button" className="cw-sheet__signout" onClick={() => void data.services.signOut()}><Icon name="logout" />Sign out</button>
        </dialog>
      </div>
    </SharedContext.Provider>
  );
}

function PageFor({ route }: { route: PortalRoute }) {
  switch (route.section) {
    case 'rewards':
      return <RewardsPage history={route.query.get('view') === 'history'} />;
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
