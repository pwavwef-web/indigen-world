import { Suspense, lazy, type ComponentProps } from 'react';
import { Skeleton } from './components';

/**
 * Parts of the portal most visits never open, loaded on demand so the
 * workspace stays light on slow connections: the review workspace (reviewers
 * only), the guided contribution forms with the recorder, and profile and
 * payment settings. Each shows a quiet placeholder while its code arrives.
 */

const Review = lazy(() => import('./review/ReviewDesk').then((module) => ({ default: module.ReviewDesk })));
const Contribute = lazy(() => import('./pages/ContributePage').then((module) => ({ default: module.ContributePage })));
const Account = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })));

function PageLoading({ label }: { label: string }) {
  return <div className="cw-page"><Skeleton lines={6} label={label} /></div>;
}

export function ReviewDesk() {
  return (
    <Suspense fallback={<p role="status" className="cw-auth__message">Loading the review workspace…</p>}>
      <Review />
    </Suspense>
  );
}

export function ContributePage(props: ComponentProps<typeof Contribute>) {
  return <Suspense fallback={<PageLoading label="Loading the contribution form" />}><Contribute {...props} /></Suspense>;
}

export function AccountPage(props: ComponentProps<typeof Account>) {
  return <Suspense fallback={<PageLoading label="Loading your profile and settings" />}><Account {...props} /></Suspense>;
}
