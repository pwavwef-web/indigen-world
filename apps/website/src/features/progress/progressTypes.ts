/**
 * src/features/progress/progressTypes.ts
 *
 * Types for the Indigen World launch progress tracking system ("Help Fill the Jars").
 * Models categories, counting units, targets, validation criteria, and aggregate metrics.
 */

export type ContributionCategoryId =
  | 'lexicon'
  | 'expressions'
  | 'sentences'
  | 'literature'
  | 'music'
  | 'audiobooks'
  | 'video'
  | 'grammar'
  | 'proverbs'
  | 'pronunciation';

export type VesselViewMode = 'vertical' | 'horizontal';

import type { IconName } from '../../components/Icon';

export interface CategoryDefinition {
  id: ContributionCategoryId;
  title: string;
  shortLabel: string;
  unit: string;
  unitPlural: string;
  description: string;
  explanation: string;
  countingRule: string;
  ctaLabel: string;
  ctaUrl: string;
  iconName: IconName;
  accentHue: string;
  highlightCategory?: boolean;
}

export interface CategoryProgress {
  category: CategoryDefinition;
  approvedCount: number;
  awaitingReviewCount?: number | null;
  target: number | null; // null represents "Target being set"
  percentage: number | null; // null if target is null; otherwise (approvedCount / target) * 100
  fillPercentage: number; // 0 to 100 (capped at 100 for visual fill)
  isTargetReached: boolean;
  isBeyondTarget: boolean;
  isTargetSetting: boolean;
  needsContributions: boolean;
}

export interface LaunchProgressConfig {
  launchWindowLabel: string;
  launchTargetDate: string | null; // null if date is not fixed; keeps date configurable without inventing one
  categoryTargets: Record<ContributionCategoryId, number | null>;
  notes?: string;
  updatedAt?: string;
}

export interface ProgressState {
  status: 'loading' | 'ready' | 'stale' | 'error';
  categories: CategoryProgress[];
  launchConfig: LaunchProgressConfig;
  lastUpdated: string | null;
  error?: string | null;
  targetsReachedCount: number;
  totalWithTargetsCount: number;
  fixtureMode: boolean;
}
