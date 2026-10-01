import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { canValidate, useAuth, type Role } from '../../auth';
import { useRoute } from '../../router';
import { EmptyState, PageHeader } from '../components';
import { AppShell, RouteLink } from '../shell';
import { isDesk, type Desk } from './model';
import { liveReviewServices, type ReviewServices } from './services';
import { ReviewOverviewPage, ReviewHistoryPage, ReviewGuidePage, ReviewAccountPage } from './pages';
import { QueuePage } from './QueuePage';
import { ItemPage } from './ItemPage';
import '../styles/review.css';

/**
 * The review workspace at /contributor/review.
 *
 *   /contributor/review                    Overview: what is waiting, your recent decisions
 *   /contributor/review/queue[?desk=…]     Review queue with filters, sorting and pages
 *   /contributor/review/{desk}/{id}        One item: the material, its history, the decision
 *   /contributor/review/history            Decisions you recorded
 *   /contributor/review/guide              How to review, and what each decision does
 *   /contributor/review/account            Who you are signed in as
 *
 * Access needs a review role (validator, reviewer, admin). The check here is
 * for the interface only: every decision callable repeats it on the server
 * and refuses decisions on the reviewer's own work.
 */

export interface ReviewPaths {
  base: string;
  overview(): string;
  queue(params?: Record<string, string>): string;
  item(desk: Desk, id: string): string;
  history(): string;
  guide(section?: string): string;
  account(): string;
}

export function reviewPaths(base: string): ReviewPaths {
  const withQuery = (path: string, params?: Record<string, string>) => {
    const search = params ? new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString() : '';
    return search ? `${path}?${search}` : path;
  };
  return {
    base,
    overview: () => base,
    queue: (params) => withQuery(`${base}/queue`, params),
    item: (desk, id) => `${base}/${desk}/${encodeURIComponent(id)}`,
    history: () => `${base}/history`,
    guide: (section) => withQuery(`${base}/guide`, section ? { section } : undefined),
    account: () => `${base}/account`,
  };
}

export type ReviewPage = 'overview' | 'queue' | 'item' | 'history' | 'guide' | 'account';

export interface ReviewRoute {
  page: ReviewPage;
  desk?: Desk;
  id?: string;
  query: URLSearchParams;
  notFound: boolean;
}

export function parseReviewRoute(path: string, search: string, base: string): ReviewRoute {
  const query = new URLSearchParams(search);
  const rest = path === base ? [] : path.slice(base.length).split('/').filter(Boolean);
  if (!rest.length) return { page: 'overview', query, notFound: false };
  if (rest.length === 1 && ['queue', 'history', 'guide', 'account'].includes(rest[0])) return { page: rest[0] as ReviewPage, query, notFound: false };
  if (rest.length === 2 && isDesk(rest[0])) {
    try { return { page: 'item', desk: rest[0], id: decodeURIComponent(rest[1]), query, notFound: false }; } catch { /* Fall through. */ }
  }
  return { page: 'overview', query, notFound: true };
}

export interface ReviewData {
  uid: string;
  email: string;
  name: string;
  role: Role;
  services: ReviewServices;
  paths: ReviewPaths;
  preview: boolean;
  /** Where "Switch to contributing" goes. */
  contributorHref: string;
  /** The order of the queue the reviewer last looked at, for "next item". */
  queueOrder: { desk: Desk; id: string }[];
  setQueueOrder: (order: { desk: Desk; id: string }[]) => void;
  /** The queue address the reviewer last used, with its filters. */
  lastQueue: string;
  setLastQueue: (href: string) => void;
}

const ReviewContext = createContext<ReviewData | null>(null);

export function useReview(): ReviewData {
  const value = useContext(ReviewContext);
  if (!value) throw new Error('useReview must be used inside the review workspace.');
  return value;
}

/** Only the authorized child mounts Firestore subscriptions. Direct URLs use the same guard. */
export function ReviewDesk() {
  const { ready, user, role } = useAuth();
  if (!ready) return <p role="status" className="cw-auth__message">Checking review access…</p>;
  if (!user || !canValidate(role)) return <p role="alert" className="cw-auth__message">Reviewer access required.</p>;
  return (
    <ValidatorWorkspace
      key={user.uid}
      uid={user.uid}
      email={user.email ?? ''}
      name={user.displayName ?? ''}
      role={role}
      services={liveReviewServices}
      base="/contributor/review"
    />
  );
}

export function ValidatorWorkspace({ uid, email, name, role, services, base, preview = false, banner, contributorHref = '/contributor' }: {
  uid: string;
  email: string;
  name: string;
  role: Role;
  services: ReviewServices;
  base: string;
  preview?: boolean;
  banner?: ReactNode;
  contributorHref?: string;
}) {
  const { path, search } = useRoute();
  const paths = useMemo(() => reviewPaths(base), [base]);
  const route = useMemo(() => parseReviewRoute(path, search, base), [base, path, search]);
  const [queueOrder, setQueueOrder] = useState<{ desk: Desk; id: string }[]>([]);
  const [lastQueue, setLastQueue] = useState(() => paths.queue());
  const [contributor, setContributor] = useState(false);

  useEffect(() => {
    let active = true;
    void services.hasContributorAccount(uid).then((has) => { if (active) setContributor(has); });
    return () => { active = false; };
  }, [services, uid]);

  const value = useMemo<ReviewData>(() => ({
    uid, email, name, role, services, paths, preview, contributorHref, queueOrder, setQueueOrder, lastQueue, setLastQueue,
  }), [contributorHref, email, lastQueue, name, paths, preview, queueOrder, role, services, uid]);

  const titles: Record<ReviewPage, string> = {
    overview: 'Overview', queue: 'Review queue', item: 'Review', history: 'Review history', guide: 'Review guidelines', account: 'Account',
  };
  const title = route.notFound ? 'Page not found' : titles[route.page];
  const activeId = route.notFound ? null : route.page === 'item' ? 'queue' : route.page;
  const trail = [
    { label: 'Review workspace', href: paths.base },
    ...(route.page === 'overview' && !route.notFound ? [] : [{ label: route.page === 'item' ? 'Review queue' : title, href: route.page === 'item' ? lastQueue : undefined }]),
    ...(route.page === 'item' ? [{ label: 'Item' }] : []),
  ];

  return (
    <ReviewContext.Provider value={value}>
      <AppShell
        className="cw--review"
        workspaceLabel="Review workspace"
        homeHref={paths.base}
        nav={[
          { id: 'overview', label: 'Overview', href: paths.overview(), icon: 'overview' },
          { id: 'queue', label: 'Review queue', short: 'Queue', href: lastQueue, icon: 'queue' },
          { id: 'history', label: 'Review history', short: 'History', href: paths.history(), icon: 'history' },
        ]}
        secondary={{ label: 'Help', items: [{ id: 'guide', label: 'Review guidelines', href: paths.guide(), icon: 'guide' }] }}
        activeId={activeId}
        roles={contributor ? { current: 'validator', contributorHref, validatorHref: paths.base } : null}
        user={{ name: name || email, email, accountHref: paths.account(), accountLabel: 'Account' }}
        trail={trail}
        mobileTabs={['overview', 'queue', 'history']}
        title={title}
        banner={banner}
        wide={route.page === 'item' || route.page === 'queue'}
        onSignOut={() => void services.signOut()}
      >
        {route.notFound ? <ReviewNotFound /> : <ReviewPageFor route={route} />}
      </AppShell>
    </ReviewContext.Provider>
  );
}

function ReviewPageFor({ route }: { route: ReviewRoute }) {
  switch (route.page) {
    case 'queue':
      return <QueuePage query={route.query} />;
    case 'item':
      return route.desk && route.id ? <ItemPage key={`${route.desk}:${route.id}`} desk={route.desk} id={route.id} /> : <ReviewNotFound />;
    case 'history':
      return <ReviewHistoryPage />;
    case 'guide':
      return <ReviewGuidePage section={route.query.get('section') ?? ''} />;
    case 'account':
      return <ReviewAccountPage />;
    default:
      return <ReviewOverviewPage />;
  }
}

function ReviewNotFound() {
  const { paths } = useReview();
  return (
    <div className="cw-page">
      <PageHeader title="This page does not exist" description="The link may be mistyped or out of date." />
      <EmptyState title="Nothing at this address" icon="search" actions={<RouteLink to={paths.queue()} className="cw-btn cw-btn--primary">Open the review queue</RouteLink>} />
    </div>
  );
}

