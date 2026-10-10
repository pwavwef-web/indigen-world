import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { collection, getCountFromServer, query, where, type QueryConstraint } from 'firebase/firestore';
import { db } from './firebase';
import { loadContributorRewards } from './finance/data';
import { allows, type AccessLevel, type StaffAccess } from './routes';

/**
 * The operational queues staff act on, counted live. Home's badges and its
 * "Needs attention" strip, the notification bell and the section sidebars all
 * read this one source, so they can never disagree.
 *
 * Each queue is loaded on its own and keeps its own state, so one failed or
 * forbidden read shows as "unavailable" beside it — never as a zero.
 */

export type AttentionKey =
  | 'reviewPending'
  | 'creatorApplications'
  | 'openReports'
  | 'newForms'
  | 'redemptionsPending'
  | 'redemptionsAwaitingDelivery';

export type Count =
  | { state: 'loading' }
  | { state: 'ready'; value: number }
  | { state: 'error'; message: string };

export interface AttentionItem {
  key: AttentionKey;
  /** Short operational label, written for a count: "{n} submissions ready for review". */
  label: (value: number) => string;
  to: string;
  icon: string;
  access: AccessLevel;
}

export const ATTENTION_ITEMS: AttentionItem[] = [
  { key: 'reviewPending', label: (n) => `${n === 1 ? 'Submission' : 'Submissions'} ready for review`, to: '/review', icon: 'doc', access: 'validator' },
  { key: 'redemptionsPending', label: (n) => `Point ${n === 1 ? 'redemption' : 'redemptions'} awaiting a decision`, to: '/finance/redemptions?status=submitted', icon: 'gift', access: 'admin' },
  { key: 'redemptionsAwaitingDelivery', label: (n) => `Approved ${n === 1 ? 'redemption' : 'redemptions'} awaiting delivery`, to: '/finance/redemptions?status=approved', icon: 'send', access: 'admin' },
  { key: 'openReports', label: (n) => `Community ${n === 1 ? 'report' : 'reports'} to resolve`, to: '/community/reports', icon: 'shield', access: 'admin' },
  { key: 'creatorApplications', label: (n) => `Creator ${n === 1 ? 'application' : 'applications'} to decide`, to: '/creators/applications', icon: 'inbox', access: 'validator' },
  { key: 'newForms', label: (n) => `New form ${n === 1 ? 'response' : 'responses'}`, to: '/community/forms', icon: 'mail', access: 'validator' },
];

async function count(name: string, ...constraints: QueryConstraint[]): Promise<number> {
  const result = await getCountFromServer(query(collection(db, name), ...constraints));
  return result.data().count;
}

const LOADERS: Record<Exclude<AttentionKey, 'redemptionsPending' | 'redemptionsAwaitingDelivery'>, () => Promise<number>> = {
  reviewPending: () => count('submissions', where('status', 'in', ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'])),
  creatorApplications: () => count('creatorApplications', where('status', 'in', ['SUBMITTED', 'UNDER_REVIEW'])),
  openReports: () => count('communityReports', where('status', 'in', ['open', 'reviewing'])),
  newForms: () => count('publicFormSubmissions', where('status', '==', 'new')),
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unavailable';
}

interface AttentionValue {
  counts: Record<AttentionKey, Count>;
  /** Items this person may act on, in display order. */
  items: AttentionItem[];
  refresh: () => void;
  capturedAt: Date | null;
}

const AttentionContext = createContext<AttentionValue | null>(null);

const REFRESH_MS = 120_000;

export function AttentionProvider({ access, children }: { access: StaffAccess; children: ReactNode }) {
  const items = useMemo(() => ATTENTION_ITEMS.filter((item) => allows(item.access, access)), [access]);
  const initial = useMemo(() => Object.fromEntries(ATTENTION_ITEMS.map((item) => [item.key, { state: 'loading' }])) as Record<AttentionKey, Count>, []);
  const [counts, setCounts] = useState<Record<AttentionKey, Count>>(initial);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const run = ++generation.current;
    const set = (key: AttentionKey, value: Count) => {
      if (run === generation.current) setCounts((current) => ({ ...current, [key]: value }));
    };
    const keys = new Set(items.map((item) => item.key));
    for (const [key, load] of Object.entries(LOADERS) as [keyof typeof LOADERS, () => Promise<number>][]) {
      if (!keys.has(key)) continue;
      load().then((value) => set(key, { state: 'ready', value }), (error) => set(key, { state: 'error', message: messageOf(error) }));
    }
    if (keys.has('redemptionsPending')) {
      loadContributorRewards().then(({ summary, requests, truncated }) => {
        // Exact totals come from the server's aggregates; without them the
        // loaded page is only a floor, so it is reported as unavailable.
        if (summary) {
          set('redemptionsPending', { state: 'ready', value: summary.submitted?.count ?? 0 });
          set('redemptionsAwaitingDelivery', { state: 'ready', value: (summary.approved?.count ?? 0) + (summary.needs_reconciliation?.count ?? 0) });
        } else if (!truncated) {
          set('redemptionsPending', { state: 'ready', value: requests.filter((row) => row.status === 'submitted').length });
          set('redemptionsAwaitingDelivery', { state: 'ready', value: requests.filter((row) => row.status === 'approved').length });
        } else {
          set('redemptionsPending', { state: 'error', message: 'Totals unavailable' });
          set('redemptionsAwaitingDelivery', { state: 'error', message: 'Totals unavailable' });
        }
      }, (error) => {
        set('redemptionsPending', { state: 'error', message: messageOf(error) });
        set('redemptionsAwaitingDelivery', { state: 'error', message: messageOf(error) });
      });
    }
    setCapturedAt(new Date());
  }, [items]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('admin:queues-changed', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('admin:queues-changed', refresh);
    };
  }, [refresh]);

  const value = useMemo(() => ({ counts, items, refresh, capturedAt }), [counts, items, refresh, capturedAt]);
  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}

export function useAttention(): AttentionValue {
  const value = useContext(AttentionContext);
  if (!value) throw new Error('useAttention must be used inside <AttentionProvider>.');
  return value;
}

/** Tell the shared counts that a decision changed a queue. */
export function queuesChanged() {
  window.dispatchEvent(new Event('admin:queues-changed'));
}

/** The number to show, or null while loading or unavailable. */
export function countValue(count: Count | undefined): number | null {
  return count?.state === 'ready' ? count.value : null;
}
