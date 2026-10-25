import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRoute } from '../router';
import { type IconName } from './components';
import { friendlyError, itemStatus, metricsFor, type FriendlyError } from './model';
import type { AccountTab, PaymentsView, Section, SelfView, WorkspaceData } from './types';
import { AppShell, EmptyState, Button, Page, Skeleton, type NavItem } from '../ui';
import { canValidate, useAuth } from '../auth';
import { ContributionWorkspace } from './ContributionWorkspace';
import './portal.css';
import { CollectionHome } from './pages/CollectionHome';
import { JourneyProvider } from './Journey';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { AssignmentPage } from './pages/AssignmentPage';
import { ContributionsPage } from './pages/ContributionsPage';
import { ActivityPage } from './pages/ActivityPage';
import { GuidePage } from './pages/GuidePage';
import { KawuriPage } from './pages/KawuriPage';
import { AccountPage } from './pages/AccountPage';
import { RewardsPage } from './rewards';
import { useFormsAttention } from './forms/forms-data';

// Indigen Forms carry the form renderer and the shared rules engine; they load
// only when a contributor opens them.
const FormsPage = lazy(() => import('./forms/FormsPage').then((module) => ({ default: module.FormsPage })));

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
 *   /contributor/forms[?tab=mine]        Available forms / my form responses
 *   /contributor/forms/{formId}          Fill a form (?response= continues one, ?new=1 starts another)
 *   /contributor/forms/submissions/{id}  One of my form responses
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
  /** Indigen Forms: the form being filled (/forms/{formId}). */
  formId?: string;
  /** Indigen Forms: the response being viewed (/forms/submissions/{id}). */
  submissionId?: string;
  accountTab: AccountTab;
  query: URLSearchParams;
  notFound: boolean;
}

const SIMPLE_SECTIONS: Section[] = ['assignments', 'contributions', 'activity', 'guide', 'kawuri', 'rewards', 'streak', 'translations', 'words', 'audio', 'stories', 'documents', 'corrections', 'forms'];
/** Form and response ids as the server issues them; anything else is not a link we made. */
const FORM_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ACCOUNT_TABS: AccountTab[] = ['profile', 'security', 'notifications', 'payments'];

export function parsePortalRoute(path: string, search: string, base: string, preview: boolean): PortalRoute {
  const query = new URLSearchParams(search);
  const route: PortalRoute = { section: 'overview', accountTab: 'profile', query, notFound: false };
  const rest = path === base ? [] : path.slice(base.length).split('/').filter(Boolean);
  if (rest.length === 0) return route;
  const [first, second] = rest;
  if (rest.length === 1 && SIMPLE_SECTIONS.includes(first as Section)) return { ...route, section: first as Section };
  // Forms come before the two-segment assignment rule: /contributor/forms/{id}
  // has the shape of an SMS link (/contributor/{uid}/{work}) but is not one.
  if (first === 'forms') {
    if (rest.length === 2 && second === 'submissions') return { ...route, section: 'forms', query: new URLSearchParams({ ...Object.fromEntries(query), tab: 'mine' }) };
    if (rest.length === 2 && FORM_ID.test(second)) return { ...route, section: 'forms', formId: second };
    if (rest.length === 3 && second === 'submissions' && FORM_ID.test(rest[2])) return { ...route, section: 'forms', submissionId: rest[2] };
    return { ...route, notFound: true };
  }
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
 * Account pages (/contributor/account/{tab}) and forms
 * (/contributor/forms/{formId}) have the same two-segment shape, so they are
 * never read as a link for someone else's account.
 */
const NOT_ACCOUNTS = ['account', 'forms'];
export function invitationLinkOwner(path: string): string | null {
  const [root, uid, work, ...extra] = path.split('/').filter(Boolean);
  if (root !== 'contributor' || !uid || !work || extra.length || NOT_ACCOUNTS.includes(uid)) return null;
  try {
    return decodeURIComponent(uid);
  } catch {
    return null;
  }
}

interface SectionEntry {
  section: Section;
  label: string;
  short: string;
  icon: IconName;
  group: string;
  dock?: boolean;
  hint?: string;
}

/** The contributor portal's sections, in the order they appear in the sidebar. */
export const NAV: SectionEntry[] = [
  { section: 'overview', label: 'Home', short: 'Home', icon: 'home', group: '' },
  { section: 'translations', label: 'Translate sentences', short: 'Translate', icon: 'translation', group: 'Contribute' },
  { section: 'words', label: 'Words & expressions', short: 'Words', icon: 'book', group: 'Contribute' },
  { section: 'audio', label: 'Audio & transcripts', short: 'Audio', icon: 'mic', group: 'Contribute' },
  { section: 'stories', label: 'Stories & culture', short: 'Stories', icon: 'library', group: 'Contribute' },
  { section: 'documents', label: 'Documents & research', short: 'Documents', icon: 'doc', group: 'Contribute' },
  { section: 'corrections', label: 'Corrections', short: 'Corrections', icon: 'pen', group: 'Contribute' },
  { section: 'forms', label: 'Available forms', short: 'Forms', icon: 'list', group: 'Contribute', hint: 'Forms from the Indigen World team' },
  { section: 'account', label: 'Account & settings', short: 'Account', icon: 'settings', group: 'Account' },
];

/**
 * The portal's destinations for the shell. `extras` adds per-section badges
 * (open assignments, returned work, payment attention).
 */
export function contributorNav({ path, paths, extras = [], active, reviewer = false }: {
  path: string;
  paths?: { section(section: Section): string; account(tab: AccountTab): string };
  extras?: { section: Section; badge?: ReactNode }[];
  active?: Section;
  reviewer?: boolean;
}): NavItem[] {
  const to = (section: Section) => paths
    ? (section === 'account' ? paths.account('profile') : paths.section(section))
    : section === 'overview' ? '/contributor' : section === 'account' ? '/contributor/account/profile' : `/contributor/${section}`;
  const items: NavItem[] = NAV.map((entry) => ({
    to: to(entry.section),
    label: entry.label,
    short: entry.short,
    icon: entry.icon,
    group: entry.group,
    dock: entry.dock,
    hint: entry.hint,
    active: entry.section === active,
    badge: extras.find((extra) => extra.section === entry.section)?.badge,
  }));
  if (reviewer) items.splice(items.length - 1, 0, { to: '/contributor/review', label: 'Review contributions', icon: 'shield', group: 'Contribute', active: path === '/contributor/review' });
  return items;
}


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
  const formsAttention = useFormsAttention(data.preview);
  const nav = contributorNav({
    path,
    paths: data.paths,
    active: route.notFound ? undefined : route.section === 'assignments' ? 'translations' : route.section,
    reviewer: canValidate(role),
    extras: [
      { section: 'assignments', badge: openAssignments || undefined },
      { section: 'contributions', badge: returned || undefined },
      { section: 'account', badge: paymentsNeedAttention(payments.value) ? '!' : undefined },
      { section: 'forms', badge: formsAttention || undefined },
    ],
  }).filter((item) => !data.preview || item.to !== '/contributor/corpus');
  const workTitle = route.section === 'assignments' && route.work ? data.works.find((work) => work.id === route.work)?.title : undefined;
  return (
    <SharedContext.Provider value={shared}><JourneyProvider>
      <AppShell
        workspace="contribute"
        nav={nav}
        title={workTitle}
        account={{ name: self.value?.profile.displayName || data.displayName || data.email || 'Contributor', photo: self.value?.profile.photoUrl, role: 'Invited contributor' }}
        onSignOut={() => void data.services.signOut()}
        banner={banner}
        dockHidden={editing}
        bell={{ to: data.paths.base + '?panel=notifications', label: 'Feedback and notifications' }}
      >
        <div className="cw">
          {/* A different form or response is a different page: it must not inherit the previous one's answers. */}
          {route.notFound ? <NotFound /> : <PageFor key={`${data.uid}:${route.section}:${route.formId ?? ''}:${route.submissionId ?? ''}`} route={route} />}
        </div>
      </AppShell>
    </JourneyProvider></SharedContext.Provider>
  );
}

function PageFor({ route }: { route: PortalRoute }) {
  switch (route.section) {
    case 'translations': case 'words': case 'audio': case 'stories': case 'documents': case 'corrections':
      return <ContributionWorkspace type={route.section} />;
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
    case 'forms':
      return (
        <Suspense fallback={<div className="ts-page"><Skeleton title lines={4} label="Opening forms" /></div>}>
          <FormsPage formId={route.formId} submissionId={route.submissionId} query={route.query} />
        </Suspense>
      );
    default:
      return <CollectionHome />;
  }
}

function NotFound() {
  const { paths } = useWorkspace();
  const { navigate } = useRoute();
  return (
    <Page width="medium">
      <EmptyState
        boxed
        icon="map"
        title="This page does not exist"
        body="The link may be mistyped or out of date. Your assignments and contributions are unaffected."
        actions={<Button variant="primary" icon="home" onClick={() => navigate(paths.section('overview'))}>Go to the overview</Button>}
      />
    </Page>
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
