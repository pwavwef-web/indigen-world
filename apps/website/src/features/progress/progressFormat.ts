/**
 * Progress numbers as visitors read them.
 *
 * A target of 200,000 words makes almost every early collection a small
 * fraction of one percent, and the rounding that suits a dashboard turns
 * 2 of 5,000 into "0%": a collection that has started looks empty. These
 * helpers keep two promises instead:
 *
 *   * positive progress is never shown as 0% — below 0.01% it reads "<0.01%";
 *   * a target is never shown as reached before it is — 99.96% reads 99.9%.
 *
 * Pure: no imports, so Node can test it directly.
 */

/** Exact percentage of a target, or null when either side is unknown or invalid. */
export function exactPercent(count: number | null | undefined, target: number | null | undefined): number | null {
  if (count == null || target == null) return null;
  if (!Number.isFinite(count) || !Number.isFinite(target) || count < 0 || target <= 0) return null;
  return (count / target) * 100;
}

/** Visual fill as a fraction of the vessel, clamped to [0, 1]. Unknown fills nothing. */
export function fillFraction(count: number | null | undefined, target: number | null | undefined): number {
  const percent = exactPercent(count, target);
  if (percent === null) return 0;
  return Math.min(1, Math.max(0, percent / 100));
}

function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

export interface PercentParts {
  /** "0.18%", "<0.01%", "125%" */
  text: string;
  /** The number without its unit: "0.18", "0.01", "125" */
  value: string;
  /** "<" when the true value is below what can be shown */
  qualifier: '' | '<';
}

/** Display parts for a count against its target; null when there is no valid target or count. */
export function percentParts(count: number | null | undefined, target: number | null | undefined): PercentParts | null {
  const percent = exactPercent(count, target);
  if (percent === null || count == null || target == null) return null;
  if (count === 0) return { text: '0%', value: '0', qualifier: '' };
  if (count >= target) {
    // Reached or beyond: whole numbers, rounded down, so 100.4% is "100%" and never "101%".
    const value = Math.floor(percent).toLocaleString('en-US');
    return { text: `${value}%`, value, qualifier: '' };
  }
  if (percent < 0.01) return { text: '<0.01%', value: '0.01', qualifier: '<' };
  let value = trimZeros(percent.toFixed(percent < 1 ? 2 : 1));
  if (Number(value) >= 100) value = '99.9';
  return { text: `${value}%`, value, qualifier: '' };
}

export function formatPercent(count: number | null | undefined, target: number | null | undefined): string | null {
  return percentParts(count, target)?.text ?? null;
}

export function formatCount(count: number | null | undefined): string {
  return count == null || !Number.isFinite(count) ? '—' : Math.max(0, Math.floor(count)).toLocaleString('en-US');
}

/** "14:05" in the visitor's locale, for "Updated 14:05". */
export function formatClock(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
