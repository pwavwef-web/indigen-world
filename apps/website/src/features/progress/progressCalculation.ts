/**
 * src/features/progress/progressCalculation.ts
 *
 * Pure, reliable calculations for launch targets, velocity run-rate,
 * and visual liquid fill.
 * Follows core project invariants:
 *  - Launch progress strictly counts approved, usable contributions.
 *  - Visual fill is the exact approved total over the actual target, clamped
 *    to [0, 100]%; the true count and true percentage are preserved.
 *  - Empty vessels (0%) display 0% fill with no phantom liquid, and tiny
 *    totals get their true sliver, never a fake minimum.
 *  - A count that could not be read stays unknown (null), never 0.
 *  - Missing targets honestly return isTargetSetting: true and null percentage.
 *  - Incompatible units are never combined into a single fictitious overall percentage.
 */

import {
  CONTRIBUTION_CATEGORIES,
  SAMPLE_COMMUNITY_PLEDGES,
  SAMPLE_SPARKLINE_DATA,
  SAMPLE_WEEKLY_VELOCITIES,
} from './progressConfig';
import type {
  CategoryDefinition,
  CategoryProgress,
  ContributionCategoryId,
  LaunchProgressConfig,
} from './progressTypes';

export function calculateCategoryProgress(
  category: CategoryDefinition,
  approvedCount: number | null | undefined,
  target: number | null,
  awaitingReviewCount?: number | null,
  velocityWeek?: number | null,
  sparklineData?: number[] | null,
  pledgeCount?: number | null,
): CategoryProgress {
  const isCountKnown = typeof approvedCount === 'number' && Number.isFinite(approvedCount);
  const safeCount = isCountKnown ? Math.max(0, Math.floor(approvedCount)) : null;
  const safeReview = awaitingReviewCount != null ? Math.max(0, Math.floor(awaitingReviewCount)) : null;
  // Unknown live measurements must not inherit demonstration history or commitments.
  const safeVelocity = velocityWeek != null ? Math.max(0, Math.floor(velocityWeek)) : 0;
  const safeSparkline = sparklineData && sparklineData.length > 0 ? sparklineData : [];
  const safePledges = pledgeCount != null ? Math.max(0, Math.floor(pledgeCount)) : 0;
  const shared = {
    category,
    approvedCount: safeCount,
    isCountKnown,
    awaitingReviewCount: safeReview,
    velocityWeek: safeVelocity,
    sparklineData: safeSparkline,
    pledgeCount: safePledges,
  };

  if (target === null || target === undefined || !Number.isFinite(target) || target <= 0) {
    return {
      ...shared,
      target: null,
      percentage: null,
      fillPercentage: 0,
      isTargetReached: false,
      isBeyondTarget: false,
      isTargetSetting: true,
      needsContributions: false,
    };
  }

  if (safeCount === null) {
    return {
      ...shared,
      target,
      percentage: null,
      fillPercentage: 0,
      isTargetReached: false,
      isBeyondTarget: false,
      isTargetSetting: false,
      needsContributions: false,
    };
  }

  // Exact, unrounded: 357 of 200,000 is 0.1785%. Display rounding lives in progressFormat.
  const percentage = (safeCount / target) * 100;
  // Visual fill is clamped between 0 and 100%
  const fillPercentage = Math.min(100, Math.max(0, percentage));
  const isTargetReached = safeCount >= target;
  const isBeyondTarget = safeCount > target;

  return {
    ...shared,
    target,
    percentage,
    fillPercentage,
    isTargetReached,
    isBeyondTarget,
    isTargetSetting: false,
    needsContributions: !isTargetReached,
  };
}

export function buildProgressList(
  counts: Partial<Record<ContributionCategoryId, number | null>>,
  config: LaunchProgressConfig,
  awaitingCounts?: Record<ContributionCategoryId, number>,
  useFixtures = false,
): CategoryProgress[] {
  const items = CONTRIBUTION_CATEGORIES.map((category) => {
    const approved = counts[category.id] ?? null;
    const target = config.categoryTargets[category.id] ?? null;
    const awaiting = awaitingCounts ? awaitingCounts[category.id] : null;
    const velocity = useFixtures ? SAMPLE_WEEKLY_VELOCITIES[category.id] ?? 0 : 0;
    const sparkline = useFixtures ? SAMPLE_SPARKLINE_DATA[category.id] ?? [] : [];
    const pledges = useFixtures ? SAMPLE_COMMUNITY_PLEDGES[category.id] ?? 0 : 0;

    return calculateCategoryProgress(
      category,
      approved,
      target,
      awaiting,
      velocity,
      sparkline,
      pledges,
    );
  });

  // Genuinely identify which category needs help the most based on remaining progress
  let lowestPercent = Infinity;
  let mostNeededId: ContributionCategoryId | null = null;

  for (const item of items) {
    if (!item.isTargetSetting && !item.isTargetReached && item.percentage !== null) {
      if (item.percentage < lowestPercent) {
        lowestPercent = item.percentage;
        mostNeededId = item.category.id;
      }
    }
  }

  return items.map((item) => ({
    ...item,
    needsContributions: item.category.id === mostNeededId && !item.isTargetReached,
  }));
}

/**
 * Computes an honest summary such as "3 of 8 targets reached" without
 * combining incompatible units (e.g. words + minutes of video).
 */
export function calculateTargetsSummary(categories: CategoryProgress[]): {
  reachedCount: number;
  totalWithTargets: number;
  settingCount: number;
} {
  let reachedCount = 0;
  let totalWithTargets = 0;
  let settingCount = 0;

  for (const cat of categories) {
    if (cat.isTargetSetting) {
      settingCount += 1;
    } else {
      totalWithTargets += 1;
      if (cat.isTargetReached) {
        reachedCount += 1;
      }
    }
  }

  return {
    reachedCount,
    totalWithTargets,
    settingCount,
  };
}

/**
 * Computes projected days to target based on current weekly velocity.
 * Returns null if target is not configured or already reached.
 */
export function calculateProjectedDays(
  approvedCount: number | null,
  target: number | null,
  velocityWeek: number,
): number | null {
  if (approvedCount === null || target === null || target <= approvedCount || velocityWeek <= 0) {
    return null;
  }
  const remaining = target - approvedCount;
  const dailyRate = velocityWeek / 7;
  return Math.ceil(remaining / dailyRate);
}
