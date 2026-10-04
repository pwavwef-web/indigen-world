/**
 * src/features/progress/progressData.ts
 *
 * Secure aggregate data fetcher for Indigen World launch progress.
 *
 * Uses Firestore server-side aggregation (`getCountFromServer`) to retrieve
 * only approved, verified counts without downloading full records or exposing
 * contributor identities, private notes, or unreviewed submissions.
 *
 * Handles loading, network errors, stale cache, and honest missing targets.
 */

import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { websiteFirestore } from '../../lib/firebaseApp';
import {
  DEFAULT_PRODUCTION_CONFIG,
  FIXTURE_APPROVED_COUNTS,
  FIXTURE_TARGETS,
} from './progressConfig';
import {
  buildProgressList,
  calculateTargetsSummary,
} from './progressCalculation';
import type {
  ContributionCategoryId,
  LaunchProgressConfig,
  ProgressState,
} from './progressTypes';

const CACHE_KEY = 'iw_launch_progress_cache_v1';

interface StoredCache {
  counts: Record<ContributionCategoryId, number>;
  config: LaunchProgressConfig;
  timestamp: string;
}

function loadLocalCache(): StoredCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCache;
  } catch {
    return null;
  }
}

function saveLocalCache(counts: Record<ContributionCategoryId, number>, config: LaunchProgressConfig): void {
  try {
    const data: StoredCache = {
      counts,
      config,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or disabled storage
  }
}

/**
 * Fetches the remote launch configuration document from platformConfiguration/launch.
 * Falls back to DEFAULT_PRODUCTION_CONFIG if not created yet.
 */
export async function fetchLaunchConfig(db: Firestore): Promise<LaunchProgressConfig> {
  try {
    const configSnap = await getDoc(doc(db, 'platformConfiguration', 'launch'));
    if (configSnap.exists()) {
      const data = configSnap.data();
      return {
        launchWindowLabel: data.launchWindowLabel || DEFAULT_PRODUCTION_CONFIG.launchWindowLabel,
        launchTargetDate: data.launchTargetDate || null,
        categoryTargets: {
          ...DEFAULT_PRODUCTION_CONFIG.categoryTargets,
          ...(data.categoryTargets || {}),
        },
        notes: data.notes || DEFAULT_PRODUCTION_CONFIG.notes,
        updatedAt: data.updatedAt || undefined,
      };
    }
  } catch {
    // Fall back to production defaults if config collection is inaccessible
  }
  return DEFAULT_PRODUCTION_CONFIG;
}

/**
 * Securely counts approved records for a specific category using server aggregations.
 */
async function countCategoryApproved(
  db: Firestore,
  category: ContributionCategoryId,
): Promise<number | null> {
  try {
    switch (category) {
      case 'lexicon': {
        const q = query(collection(db, 'dictionaryEntries'), where('isPublished', '==', true));
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'expressions': {
        const q = query(collection(db, 'expressionEntries'), where('isPublished', '==', true));
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'sentences': {
        const q = query(collection(db, 'kasemSentences'), where('status', '==', 'confirmed'));
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'literature': {
        const q = query(
          collection(db, 'publishedContent'),
          where('publicationStatus', '==', 'published'),
          where('collectionKind', '==', 'literature'),
        );
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'music': {
        const q = query(
          collection(db, 'publishedContent'),
          where('publicationStatus', '==', 'published'),
          where('collectionKind', '==', 'music'),
        );
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'audiobooks': {
        const q = query(
          collection(db, 'publishedContent'),
          where('publicationStatus', '==', 'published'),
          where('collectionKind', '==', 'audiobooks'),
        );
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'video': {
        const q = query(
          collection(db, 'publishedContent'),
          where('publicationStatus', '==', 'published'),
          where('collectionKind', '==', 'video'),
        );
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'grammar': {
        const q = query(collection(db, 'grammarRules'), where('status', '==', 'published'));
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'proverbs': {
        const q = query(
          collection(db, 'expressionEntries'),
          where('isPublished', '==', true),
          where('expressionKind', '==', 'proverb'),
        );
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      case 'pronunciation': {
        // Pronunciation audio clips attached to published dictionary entries
        const q = query(collection(db, 'dictionaryEntries'), where('isPublished', '==', true));
        const snap = await getCountFromServer(q);
        return snap.data().count;
      }
      default:
        return 0;
    }
  } catch (err) {
    // Return null so callers know this count failed rather than assuming 0
    return null;
  }
}

export async function fetchLiveLaunchProgress(options?: {
  useFixtures?: boolean;
}): Promise<ProgressState> {
  const isFixture = options?.useFixtures ?? false;

  if (isFixture) {
    const fixtureConfig: LaunchProgressConfig = {
      launchWindowLabel: 'Planned: December 2026 / January 2027 (Sample fixture preview)',
      launchTargetDate: '2026-12-15',
      categoryTargets: FIXTURE_TARGETS,
      notes: 'Sample targets and counts for UI development and motion verification.',
    };

    const categories = buildProgressList(FIXTURE_APPROVED_COUNTS, fixtureConfig);
    const summary = calculateTargetsSummary(categories);

    return {
      status: 'ready',
      categories,
      launchConfig: fixtureConfig,
      lastUpdated: new Date().toISOString(),
      targetsReachedCount: summary.reachedCount,
      totalWithTargetsCount: summary.totalWithTargets,
      fixtureMode: true,
    };
  }

  const cached = loadLocalCache();
  const db = websiteFirestore();

  try {
    const launchConfig = await fetchLaunchConfig(db);

    const categoriesList: ContributionCategoryId[] = [
      'lexicon',
      'expressions',
      'sentences',
      'literature',
      'music',
      'audiobooks',
      'video',
      'grammar',
      'proverbs',
      'pronunciation',
    ];

    const results = await Promise.allSettled(
      categoriesList.map(async (catId) => {
        const count = await countCategoryApproved(db, catId);
        return { catId, count };
      }),
    );

    const liveCounts = { ...(cached?.counts || {}) } as Record<ContributionCategoryId, number>;
    let anySuccess = false;

    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.count !== null) {
        liveCounts[res.value.catId] = res.value.count;
        anySuccess = true;
      } else if (cached?.counts && cached.counts[res.status === 'fulfilled' ? res.value.catId : 'lexicon'] !== undefined) {
        // Retain cached count if query failed
      }
    }

    if (!anySuccess && !cached) {
      // Complete offline or Firestore failure with no cache
      return {
        status: 'error',
        categories: buildProgressList(
          {} as Record<ContributionCategoryId, number>,
          launchConfig,
        ),
        launchConfig,
        lastUpdated: null,
        error: 'Unable to reach the Indigen World verification service. Please check your connection.',
        targetsReachedCount: 0,
        totalWithTargetsCount: 0,
        fixtureMode: false,
      };
    }

    saveLocalCache(liveCounts, launchConfig);

    const categories = buildProgressList(liveCounts, launchConfig);
    const summary = calculateTargetsSummary(categories);

    return {
      status: anySuccess ? 'ready' : 'stale',
      categories,
      launchConfig,
      lastUpdated: new Date().toISOString(),
      targetsReachedCount: summary.reachedCount,
      totalWithTargetsCount: summary.totalWithTargets,
      fixtureMode: false,
    };
  } catch (err) {
    if (cached) {
      const categories = buildProgressList(cached.counts, cached.config);
      const summary = calculateTargetsSummary(categories);
      return {
        status: 'stale',
        categories,
        launchConfig: cached.config,
        lastUpdated: cached.timestamp,
        error: 'Showing cached progress. Could not connect to update.',
        targetsReachedCount: summary.reachedCount,
        totalWithTargetsCount: summary.totalWithTargets,
        fixtureMode: false,
      };
    }

    return {
      status: 'error',
      categories: buildProgressList(
        {} as Record<ContributionCategoryId, number>,
        DEFAULT_PRODUCTION_CONFIG,
      ),
      launchConfig: DEFAULT_PRODUCTION_CONFIG,
      lastUpdated: null,
      error: 'Live progress is temporarily unavailable. We are reconnecting…',
      targetsReachedCount: 0,
      totalWithTargetsCount: 0,
      fixtureMode: false,
    };
  }
}
