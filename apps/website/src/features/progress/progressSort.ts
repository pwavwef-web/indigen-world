/**
 * The order of the jars on the factory floor. Sorting never changes a number;
 * it only moves vessels. Collections whose fill cannot be read (no target or
 * no count) always go last, in catalogue order, so they never pose as "empty"
 * or "full".
 *
 * Pure: type imports only, so Node can test it directly.
 */

import type { CategoryProgress } from './progressTypes';

export type FloorOrder = 'catalogue' | 'fullest' | 'needs' | 'largest';

export const FLOOR_ORDERS: readonly FloorOrder[] = ['catalogue', 'fullest', 'needs', 'largest'];

export const FLOOR_ORDER_LABELS: Record<FloorOrder, string> = {
  catalogue: 'Catalogue',
  fullest: 'Fullest',
  needs: 'Needs help',
  largest: 'Largest',
};

function readableFill(item: CategoryProgress): number | null {
  if (!item.isCountKnown || item.isTargetSetting || item.approvedCount == null || !item.target) return null;
  return item.approvedCount / item.target;
}

export function sortFloor<T extends CategoryProgress>(items: readonly T[], order: FloorOrder): T[] {
  const indexed = items.map((item, index) => ({ item, index }));
  if (order === 'catalogue') return indexed.map(({ item }) => item);
  const key = (item: T): number | null => (order === 'largest'
    ? (item.isCountKnown ? item.approvedCount : null)
    : readableFill(item));
  indexed.sort((a, b) => {
    const ka = key(a.item);
    const kb = key(b.item);
    if (ka === null || kb === null) return ka === kb ? a.index - b.index : ka === null ? 1 : -1;
    const difference = order === 'needs' ? ka - kb : kb - ka;
    return difference !== 0 ? difference : a.index - b.index;
  });
  return indexed.map(({ item }) => item);
}
