/**
 * src/features/progress/progressData.ts
 *
 * Where the progress page's numbers come from.
 *
 *   Live      `publicProgress/current`, written only by the backend
 *             (services/functions/src/public-progress.ts) from server-side
 *             counts. A snapshot listener delivers its totals and the
 *             sanitized ring of recent changes the page animates.
 *   Snapshot  When that document is missing or unreadable (before the backend
 *             is deployed, or if the listener fails) the same rules are
 *             measured with aggregate count queries and refreshed on a timer.
 *             This is labelled "Updated hh:mm", never "Live".
 *   Cache     The last numbers this device saw, shown while connecting and
 *             labelled as cached.
 *
 * Only aggregate counts and the public projection are ever requested: no
 * contribution record, contributor or note is downloaded into the browser.
 */

import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  where,
  type Firestore,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { DEFAULT_PRODUCTION_CONFIG } from './progressConfig';
import { parsePublicProgress, PROGRESS_CATEGORY_IDS, type PublicProgressView } from './liveProgressModel';
import type { ContributionCategoryId, LaunchProgressConfig } from './progressTypes';

const CACHE_KEY = 'iw_launch_progress_cache_v2';

export type NullableTotals = Partial<Record<ContributionCategoryId, number | null>>;

export interface CachedProgress {
  totals: NullableTotals;
  savedAtMs: number;
}

export function loadCachedProgress(): CachedProgress | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProgress>;
    if (!parsed || typeof parsed.savedAtMs !== 'number' || !parsed.totals || typeof parsed.totals !== 'object') return null;
    const totals: NullableTotals = {};
    for (const id of PROGRESS_CATEGORY_IDS) {
      const value = (parsed.totals as Record<string, unknown>)[id];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) totals[id] = value;
    }
    return Object.keys(totals).length ? { totals, savedAtMs: parsed.savedAtMs } : null;
  } catch {
    return null;
  }
}

export function saveCachedProgress(totals: NullableTotals): void {
  try {
    const known = Object.fromEntries(Object.entries(totals).filter(([, value]) => typeof value === 'number'));
    if (!Object.keys(known).length) return;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ totals: known, savedAtMs: Date.now() }));
  } catch {
    // Ignore storage quota or disabled storage
  }
}

/** Launch targets: the admin-managed `platformConfiguration/launch`, over the production defaults. */
export function parseLaunchConfig(data: Record<string, unknown> | undefined): LaunchProgressConfig {
  if (!data) return DEFAULT_PRODUCTION_CONFIG;
  const targets = { ...DEFAULT_PRODUCTION_CONFIG.categoryTargets };
  const overrides = data.categoryTargets && typeof data.categoryTargets === 'object' ? data.categoryTargets as Record<string, unknown> : {};
  for (const id of PROGRESS_CATEGORY_IDS) {
    const value = overrides[id];
    // null deliberately means "target being set"; anything else invalid keeps the default.
    if (value === null) targets[id] = null;
    else if (typeof value === 'number' && Number.isFinite(value) && value > 0) targets[id] = value;
  }
  return {
    launchWindowLabel: typeof data.launchWindowLabel === 'string' && data.launchWindowLabel ? data.launchWindowLabel : DEFAULT_PRODUCTION_CONFIG.launchWindowLabel,
    launchTargetDate: typeof data.launchTargetDate === 'string' && data.launchTargetDate ? data.launchTargetDate : null,
    categoryTargets: targets,
    notes: typeof data.notes === 'string' && data.notes ? data.notes : DEFAULT_PRODUCTION_CONFIG.notes,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

/** Targets follow the configuration live, so a changed target is reconciled without any approval cue. */
export function subscribeLaunchConfig(db: Firestore, onConfig: (config: LaunchProgressConfig) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'platformConfiguration', 'launch'),
    (snapshot) => onConfig(parseLaunchConfig(snapshot.exists() ? snapshot.data() : undefined)),
    () => onConfig(DEFAULT_PRODUCTION_CONFIG),
  );
}

export interface ProjectionSnapshotMeta {
  /** True when the SDK served a local copy: never treated as live. */
  fromCache: boolean;
}

export function subscribePublicProgress(
  db: Firestore,
  onNext: (view: PublicProgressView | null, meta: ProjectionSnapshotMeta) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'publicProgress', 'current'),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.exists() ? parsePublicProgress(snapshot.data()) : null, { fromCache: snapshot.metadata.fromCache }),
    onError,
  );
}

/**
 * The canonical counting rules as aggregate queries a visitor's browser is
 * allowed to run. They mirror `countPlan` in public-progress.ts, with one
 * limit: expired sentence consent cannot be excluded from the browser, which
 * is one reason the live projection is preferred whenever it exists.
 */
function snapshotPlan(db: Firestore, id: ContributionCategoryId): { add: Query[]; subtract: Query[] } {
  const published = (kind: string) => query(
    collection(db, 'publishedContent'),
    where('publicationStatus', '==', 'published'),
    where('collectionKind', '==', kind),
  );
  switch (id) {
    case 'lexicon':
      return { add: [query(collection(db, 'dictionaryEntries'), where('isPublished', '==', true))], subtract: [] };
    case 'pronunciation':
      return { add: [query(collection(db, 'dictionaryEntries'), where('isPublished', '==', true), where('audioUrl', '>', ''))], subtract: [] };
    case 'expressions': {
      const all = query(collection(db, 'expressionEntries'), where('isPublished', '==', true));
      return { add: [all], subtract: [query(all, where('expressionKind', '==', 'proverb'))] };
    }
    case 'proverbs':
      return { add: [query(collection(db, 'expressionEntries'), where('isPublished', '==', true), where('expressionKind', '==', 'proverb'))], subtract: [] };
    case 'sentences':
      return { add: [query(collection(db, 'kasemSentences'), where('status', '==', 'confirmed'), where('projectionVersion', '==', 2))], subtract: [] };
    case 'grammar':
      return { add: [query(collection(db, 'grammarRules'), where('status', '==', 'published'))], subtract: [] };
    case 'music':
      return { add: [published('music')], subtract: [] };
    default:
      return { add: [published(id)], subtract: [query(published(id), where('publicationRoute', '==', 'open'))] };
  }
}

/** One aggregate count per rule; a category that cannot be measured is null, never 0. */
export async function fetchSnapshotCounts(db: Firestore): Promise<NullableTotals> {
  const results = await Promise.all(PROGRESS_CATEGORY_IDS.map(async (id) => {
    try {
      const plan = snapshotPlan(db, id);
      const [added, subtracted] = await Promise.all([
        Promise.all(plan.add.map((item) => getCountFromServer(item))),
        Promise.all(plan.subtract.map((item) => getCountFromServer(item))),
      ]);
      const sum = (snapshots: typeof added) => snapshots.reduce((total, snapshot) => total + snapshot.data().count, 0);
      return [id, Math.max(0, sum(added) - sum(subtracted))] as const;
    } catch {
      return [id, null] as const;
    }
  }));
  return Object.fromEntries(results) as NullableTotals;
}
