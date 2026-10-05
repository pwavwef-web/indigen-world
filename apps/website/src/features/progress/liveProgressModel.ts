/**
 * The page's side of the live progress contract. Pure: type imports only, so
 * Node can test it directly.
 *
 * `publicProgress/current` (services/functions/src/public-progress.ts) holds a
 * total per collection, a `revision` that rises with every change, and a short
 * ring of recent changes. This module decides what a visitor is shown when a
 * new version of that document arrives:
 *
 *   * The first version read is history. Its revision becomes the cursor and
 *     nothing in it is animated, however recent.
 *   * Later versions animate only changes above the cursor, only positive
 *     ones, only while the page has been continuously live and visible, and
 *     only if they are recent. Everything else updates the numbers silently:
 *     a reconnect, a resumed tab or a long backlog is caught up, never replayed.
 *   * Totals always come from the document itself, never from adding deltas,
 *     so a missed, repeated or reordered event cannot leave a number wrong.
 */

import type { ContributionCategoryId } from './progressTypes';

export const PROGRESS_CATEGORY_IDS: readonly ContributionCategoryId[] = [
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

/** Must match MAX_PUBLIC_EVENTS on the server. */
export const PUBLIC_EVENT_RING = 24;
/** An event older than this is history even if it is above the cursor. */
export const MAX_EVENT_AGE_MS = 5 * 60_000;

export type ProgressTotals = Partial<Record<ContributionCategoryId, number>>;

export interface PublicProgressEventView {
  id: string;
  revision: number;
  category: ContributionCategoryId;
  delta: number;
  total: number;
  atMs: number;
}

export interface PublicProgressView {
  revision: number;
  totals: ProgressTotals;
  events: PublicProgressEventView[];
  updatedAtMs: number | null;
}

function isCategory(value: unknown): value is ContributionCategoryId {
  return typeof value === 'string' && (PROGRESS_CATEGORY_IDS as readonly string[]).includes(value);
}

function wholeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Firestore Timestamps (web or admin), Dates and epoch numbers. */
function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

/**
 * Reads the public document defensively. Only known collections, whole
 * numbers and times survive; any other field is ignored, so nothing that was
 * never meant for the page can be rendered by it.
 */
export function parsePublicProgress(raw: unknown): PublicProgressView | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const revision = wholeNumber(data.revision);
  if (revision === null) return null;
  const totals: ProgressTotals = {};
  const categories = data.categories && typeof data.categories === 'object' ? data.categories as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(categories)) {
    if (!isCategory(key) || !value || typeof value !== 'object') continue;
    const total = wholeNumber((value as Record<string, unknown>).total);
    if (total !== null) totals[key] = total;
  }
  const events = (Array.isArray(data.events) ? data.events : [])
    .flatMap((value): PublicProgressEventView[] => {
      if (!value || typeof value !== 'object') return [];
      const event = value as Record<string, unknown>;
      const eventRevision = wholeNumber(event.revision);
      const total = wholeNumber(event.total);
      if (eventRevision === null || total === null || !isCategory(event.category)) return [];
      if (typeof event.delta !== 'number' || !Number.isInteger(event.delta) || event.delta === 0) return [];
      return [{
        id: `${eventRevision}.${event.category}`,
        revision: eventRevision,
        category: event.category,
        delta: event.delta,
        total,
        atMs: toMillis(event.at) ?? 0,
      }];
    })
    .sort((a, b) => a.revision - b.revision);
  return { revision, totals, events, updatedAtMs: toMillis(data.updatedAt) };
}

export interface LiveModelState {
  /** The cursor: the highest revision this page has accounted for. */
  revision: number;
  totals: ProgressTotals;
  /** `${category}:${target}` milestones already celebrated in this session. */
  milestones: string[];
}

export interface FreshApproval {
  key: string;
  category: ContributionCategoryId;
  delta: number;
  fromTotal: number;
  totalAfter: number;
  revision: number;
  milestone: boolean;
}

export interface IngestOptions {
  /** False while hidden, reconnecting or just resumed: catch up silently. */
  animate: boolean;
  nowMs: number;
  maxEventAgeMs?: number;
  targets?: Partial<Record<ContributionCategoryId, number | null>>;
}

export interface IngestResult {
  state: LiveModelState;
  approvals: FreshApproval[];
  /** Collections whose total fell: updated without any approval cue. */
  corrections: ContributionCategoryId[];
  /** True when this version was absorbed as history rather than played. */
  silent: boolean;
}

function silently(state: LiveModelState | null, doc: PublicProgressView): IngestResult {
  return {
    state: { revision: doc.revision, totals: { ...doc.totals }, milestones: state?.milestones ?? [] },
    approvals: [],
    corrections: [],
    silent: true,
  };
}

export function ingestPublicProgress(
  state: LiveModelState | null,
  doc: PublicProgressView,
  options: IngestOptions,
): IngestResult {
  // First read, catch-up, or a document that went backwards (reset): history.
  if (!state || !options.animate || doc.revision < state.revision) return silently(state, doc);
  if (doc.revision === state.revision) {
    return { state: { ...state, totals: { ...doc.totals } }, approvals: [], corrections: [], silent: false };
  }

  const fresh = doc.events.filter((event) => event.revision > state.revision);
  // A full ring whose oldest change is past our cursor may have dropped changes
  // we never saw. Their totals are in the document; their moment has passed.
  const ringMayHaveDropped = doc.events.length >= PUBLIC_EVENT_RING && doc.events[0].revision > state.revision + 1;
  if (ringMayHaveDropped) return silently(state, doc);

  const maxAge = options.maxEventAgeMs ?? MAX_EVENT_AGE_MS;
  const grouped = new Map<ContributionCategoryId, FreshApproval>();
  const corrections = new Set<ContributionCategoryId>();
  for (const event of fresh) {
    if (event.delta < 0) {
      corrections.add(event.category);
      continue;
    }
    if (event.atMs > 0 && options.nowMs - event.atMs > maxAge) continue;
    const existing = grouped.get(event.category);
    if (existing) {
      existing.delta += event.delta;
      existing.totalAfter = event.total;
      existing.revision = event.revision;
      existing.key = `${event.revision}.${event.category}`;
    } else {
      grouped.set(event.category, {
        key: event.id,
        category: event.category,
        delta: event.delta,
        fromTotal: state.totals[event.category] ?? Math.max(0, event.total - event.delta),
        totalAfter: event.total,
        revision: event.revision,
        milestone: false,
      });
    }
  }

  const milestones = [...state.milestones];
  const approvals = [...grouped.values()].filter((approval) => approval.delta > 0).map((approval) => {
    // The authoritative total wins over the event's own total if they differ.
    const totalAfter = doc.totals[approval.category] ?? approval.totalAfter;
    const target = options.targets?.[approval.category];
    const key = target ? `${approval.category}:${target}` : '';
    const milestone = Boolean(target && target > 0 && approval.fromTotal < target && totalAfter >= target && !milestones.includes(key));
    if (milestone) milestones.push(key);
    return { ...approval, totalAfter, milestone };
  });

  return {
    state: { revision: doc.revision, totals: { ...doc.totals }, milestones },
    approvals,
    corrections: [...corrections],
    silent: false,
  };
}

export interface QueuedFlow {
  key: string;
  category: ContributionCategoryId;
  delta: number;
  fromTotal: number;
  totalAfter: number;
  milestone: boolean;
}

/**
 * Adds approvals to the bounded queue of effects waiting to play. An approval
 * for a collection already waiting merges into it ("+2 approved"); beyond the
 * bound, an approval plays no effect at all. Its number is already on screen.
 */
export function enqueueApprovals(
  queue: readonly QueuedFlow[],
  approvals: readonly FreshApproval[],
  maxQueue = 4,
): { queue: QueuedFlow[]; overflow: FreshApproval[] } {
  const next = queue.map((flow) => ({ ...flow }));
  const overflow: FreshApproval[] = [];
  for (const approval of approvals) {
    const waiting = next.find((flow) => flow.category === approval.category);
    if (waiting) {
      waiting.delta += approval.delta;
      waiting.totalAfter = approval.totalAfter;
      waiting.milestone ||= approval.milestone;
    } else if (next.length < maxQueue) {
      next.push({
        key: approval.key,
        category: approval.category,
        delta: approval.delta,
        fromTotal: approval.fromTotal,
        totalAfter: approval.totalAfter,
        milestone: approval.milestone,
      });
    } else {
      overflow.push(approval);
    }
  }
  return { queue: next, overflow };
}

/** "+1 approved", "+12 approved" */
export function approvalLabel(delta: number): string {
  return `+${Math.max(1, Math.floor(delta)).toLocaleString('en-US')} approved`;
}
