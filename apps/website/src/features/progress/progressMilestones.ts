/**
 * The next goal line on a jar, from its verified count and its target.
 *
 * Large targets (400,000 sentences) make "the next 10%" years away, so the
 * ladder starts at a tenth of a percent: every jar always has a goal close
 * enough to reach. Counts and targets are whole items; a milestone is the
 * first whole count at or above its share of the target.
 *
 * Pure: no imports, so Node can test it directly.
 */

export const MILESTONE_LADDER = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 75, 100] as const;

export interface NextMilestone {
  /** The ladder step, as a percentage of the target: 0.1 … 100. */
  percent: number;
  /** The count at which the step is reached. */
  count: number;
  /** Items still needed (at least 1). */
  remaining: number;
  /** Where the goal line sits, as a fraction of the vessel: 0–1. */
  fraction: number;
}

/** "0.1%", "25%": the step's own label, never rounded into something else. */
export function milestoneLabel(percent: number): string {
  return `${percent}%`;
}

/** Null when the count or target is unknown, or the target has been reached. */
export function nextMilestone(count: number | null | undefined, target: number | null | undefined): NextMilestone | null {
  if (count == null || target == null) return null;
  if (!Number.isFinite(count) || !Number.isFinite(target) || count < 0 || target <= 0) return null;
  const have = Math.floor(count);
  if (have >= target) return null;
  let next: NextMilestone | null = null;
  for (const percent of MILESTONE_LADDER) {
    const at = Math.min(target, Math.max(1, Math.ceil((target * percent) / 100)));
    if (at <= have) continue;
    // On a small target several steps land on the same item: name the highest it reaches.
    if (next && at !== next.count) break;
    next = { percent, count: at, remaining: at - have, fraction: at / target };
  }
  return next;
}
