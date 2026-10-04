/**
 * src/features/progress/progressCalculation.ts
 *
 * Pure, reliable calculations for launch targets and visual liquid fill.
 * Follows core project invariants:
 *  - Launch progress strictly counts approved, usable contributions.
 *  - Visual fill is clamped to [0, 100]%, while actual count and true percentage are preserved.
 *  - Empty vessels (0%) display 0% fill with no phantom liquid.
 *  - Missing targets honestly return isTargetSetting: true and null percentage.
 *  - Incompatible units are never combined into a single fictitious overall percentage.
 */

import { CONTRIBUTION_CATEGORIES } from './progressConfig';
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
): CategoryProgress {
  const safeCount = Math.max(0, Math.floor(approvedCount || 0));
  const safeReview = awaitingReviewCount != null ? Math.max(0, Math.floor(awaitingReviewCount)) : null;

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
  };
}

export function buildProgressList(
  counts: Record<ContributionCategoryId, number>,
  config: LaunchProgressConfig,
  awaitingCounts?: Record<ContributionCategoryId, number>,
): CategoryProgress[] {
  const items = CONTRIBUTION_CATEGORIES.map((category) => {
    const approved = counts[category.id] ?? 0;
    const target = config.categoryTargets[category.id] ?? null;
    const awaiting = awaitingCounts ? awaitingCounts[category.id] : null;
    return calculateCategoryProgress(category, approved, target, awaiting);
  });

  // Genuinely identify which category needs help the most based on remaining progress
  // (lowest fill percentage among categories with configured, unreached targets)
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
