/**
 * The plant's output: one honest figure for the whole floor.
 *
 * Collections count different things (words, videos, recordings), so their
 * items are never added into one "progress" number. The dial shows the mean
 * of each jar's own fill instead — every collection weighs the same — and a
 * jar without a readable count or target is left out rather than read as
 * empty. The item total is shown beside it as a plain count of verified work.
 *
 * Pure: type imports only, so Node can test it directly.
 */

import type { CategoryProgress } from './progressTypes';

export interface PlantOutput {
  /** Mean fill of the readable jars, 0–1; null when none can be read. */
  averageFill: number | null;
  /** How many jars the mean is taken over. */
  readable: number;
  /** Verified items across every collection whose count is known. */
  verifiedItems: number;
  sealed: number;
}

export function plantOutput(items: readonly CategoryProgress[]): PlantOutput {
  let sum = 0;
  let readable = 0;
  let verifiedItems = 0;
  let sealed = 0;
  for (const item of items) {
    if (item.isCountKnown && item.approvedCount != null) verifiedItems += Math.max(0, Math.floor(item.approvedCount));
    if (item.isTargetReached) sealed += 1;
    if (!item.isCountKnown || item.isTargetSetting || item.approvedCount == null || !item.target || item.target <= 0) continue;
    sum += Math.min(1, Math.max(0, item.approvedCount / item.target));
    readable += 1;
  }
  return { averageFill: readable ? sum / readable : null, readable, verifiedItems, sealed };
}

/** "3.42%", "<0.01%", "100%": the same promises as the jars' own readouts. */
export function formatShare(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return '—';
  const percent = Math.min(100, Math.max(0, fraction * 100));
  if (percent === 0) return '0%';
  if (percent < 0.01) return '<0.01%';
  if (percent >= 100) return '100%';
  let text = percent.toFixed(percent < 1 ? 2 : 1);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return `${Number(text) >= 100 ? '99.9' : text}%`;
}
