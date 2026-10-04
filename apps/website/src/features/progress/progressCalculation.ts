/**
 * src/features/progress/progressCalculation.ts
 *
 * Pure, reliable calculations for launch targets, velocity run-rate,
 * and visual liquid fill.
 * Follows core project invariants:
 *  - Launch progress strictly counts approved, usable contributions.
 *  - Visual fill is clamped to [0, 100]%, while actual count and true percentage are preserved.
 *  - Empty vessels (0%) display 0% fill with no phantom liquid.
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
  approvedCount: number,
  target: number | null,
  awaitingReviewCount?: number | null,
  velocityWeek?: number | null,
  sparklineData?: number[] | null,
  pledgeCount?: number | null,
): CategoryProgress {
  const safeCount = Math.max(0, Math.floor(approvedCount || 0));
  const safeReview = awaitingReviewCount != null ? Math.max(0, Math.floor(awaitingReviewCount)) : null;
  // Unknown live measurements must not inherit demonstration history or commitments.
  const safeVelocity = velocityWeek != null ? Math.max(0, Math.floor(velocityWeek)) : 0;
  const safeSparkline = sparklineData && sparklineData.length > 0 ? sparklineData : [];
  const safePledges = pledgeCount != null ? Math.max(0, Math.floor(pledgeCount)) : 0;

  if (target === null || target === undefined || target <= 0) {
    return {
      category,
      approvedCount: safeCount,
      awaitingReviewCount: safeReview,
      target: null,
      percentage: null,
      fillPercentage: 0,
      isTargetReached: false,
      isBeyondTarget: false,
      isTargetSetting: true,
      needsContributions: false,
      velocityWeek: safeVelocity,
      sparklineData: safeSparkline,
      pledgeCount: safePledges,
    };
  }

  const rawPercent = (safeCount / target) * 100;
  // Round percentage to 1 decimal place for crisp display
  const percentage = Math.round(rawPercent * 10) / 10;
  // Visual fill is clamped between 0 and 100%
  const fillPercentage = Math.min(100, Math.max(0, percentage));
  const isTargetReached = safeCount >= target;
  const isBeyondTarget = safeCount > target;

  return {
    category,
    approvedCount: safeCount,
    awaitingReviewCount: safeReview,
    target,
    percentage,
    fillPercentage,
    isTargetReached,
    isBeyondTarget,
    isTargetSetting: false,
    needsContributions: !isTargetReached,
    velocityWeek: safeVelocity,
    sparklineData: safeSparkline,
    pledgeCount: safePledges,
  };
}

export function buildProgressList(
  counts: Record<ContributionCategoryId, number>,
  config: LaunchProgressConfig,
  awaitingCounts?: Record<ContributionCategoryId, number>,
  useFixtures = false,
): CategoryProgress[] {
  const items = CONTRIBUTION_CATEGORIES.map((category) => {
    const approved = counts[category.id] ?? 0;
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
  let lowestPercent = 101;
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
  approvedCount: number,
  target: number | null,
  velocityWeek: number,
): number | null {
  if (target === null || target <= approvedCount || velocityWeek <= 0) {
    return null;
  }
  const remaining = target - approvedCount;
  const dailyRate = velocityWeek / 7;
  return Math.ceil(remaining / dailyRate);
}
