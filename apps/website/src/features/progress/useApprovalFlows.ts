/**
 * Plays approvals as liquid: pump, pipe, vessel. Purely visual.
 *
 * Numbers never wait for this. A vessel's fill is held at its pre-approval
 * level only while its pulse is on the way, then eases to the authoritative
 * total on arrival; cancelling (a view switch, a hidden tab, motion turned
 * off) releases every hold at once, so the screen always ends on the truth.
 *
 *   gather   a short pause lets near-simultaneous approvals merge ("+2")
 *   pump     the rotor spins up and the ring brightens
 *   travel   the pulse runs the measured route (PipeNetwork calls `arrive`)
 *   arrive   jet, ripple and "+N approved"; the fill eases up
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { enqueueApprovals, type FreshApproval, type QueuedFlow } from './liveProgressModel';
import type { ContributionCategoryId } from './progressTypes';

const GATHER_MS = 450;
const PUMP_MS = 420;
/** A pulse that cannot be drawn (vessel scrolled off, layout changing) still arrives. */
const SAFETY_MS = 3200;
const CUE_MS = 2600;
const SETTLE_MS = 450;
const MAX_QUEUE = 4;

export interface ActiveFlow extends QueuedFlow {
  phase: 'pump' | 'travel';
}

export interface ArrivalCue {
  key: string;
  delta: number;
  milestone: boolean;
  /** False for the non-travelling cue used without motion or pipes. */
  travelled: boolean;
}

type ByCategory<T> = Partial<Record<ContributionCategoryId, T>>;

function without<T>(record: ByCategory<T>, key: ContributionCategoryId): ByCategory<T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

export function useApprovalFlows({ travel, cues }: {
  /** Pipes are on screen and motion is allowed: pulses travel. */
  travel: boolean;
  /** The page is visible: cues may show at all. */
  cues: boolean;
}) {
  const [active, setActiveState] = useState<ActiveFlow | null>(null);
  const [held, setHeld] = useState<ByCategory<number>>({});
  const [arrivals, setArrivals] = useState<ByCategory<ArrivalCue>>({});
  const [pumpPulse, setPumpPulse] = useState(0);
  const queueRef = useRef<QueuedFlow[]>([]);
  const activeRef = useRef<ActiveFlow | null>(null);
  const timers = useRef(new Set<number>());
  const safetyRef = useRef<number | undefined>(undefined);

  const later = useCallback((callback: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      callback();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);

  const setActive = useCallback((flow: ActiveFlow | null) => {
    activeRef.current = flow;
    setActiveState(flow);
  }, []);

  const showCue = useCallback((category: ContributionCategoryId, cue: ArrivalCue) => {
    setArrivals((current) => ({ ...current, [category]: cue }));
    later(() => setArrivals((current) => current[category]?.key === cue.key ? without(current, category) : current), CUE_MS);
  }, [later]);

  const arriveRef = useRef<(key: string) => void>(() => undefined);

  const startNext = useCallback(() => {
    if (activeRef.current || !queueRef.current.length) return;
    const [next, ...rest] = queueRef.current;
    queueRef.current = rest;
    setActive({ ...next, phase: 'pump' });
    setPumpPulse((count) => count + 1);
    later(() => {
      if (activeRef.current?.key !== next.key) return;
      setActive({ ...activeRef.current, phase: 'travel' });
      window.clearTimeout(safetyRef.current);
      safetyRef.current = later(() => arriveRef.current(next.key), SAFETY_MS);
    }, PUMP_MS);
  }, [later, setActive]);

  const arrive = useCallback((key: string) => {
    const flow = activeRef.current;
    if (!flow || flow.key !== key) return;
    window.clearTimeout(safetyRef.current);
    const more = queueRef.current.some((queued) => queued.category === flow.category);
    // Fill to this flow's total; a later flow for the same vessel fills the rest.
    setHeld((current) => more ? { ...current, [flow.category]: flow.totalAfter } : without(current, flow.category));
    showCue(flow.category, { key: flow.key, delta: flow.delta, milestone: flow.milestone, travelled: true });
    setActive(null);
    later(startNext, SETTLE_MS);
  }, [later, setActive, showCue, startNext]);
  arriveRef.current = arrive;

  const cancelAll = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
    window.clearTimeout(safetyRef.current);
    queueRef.current = [];
    setActive(null);
    setHeld({});
    setArrivals({});
  }, [setActive]);

  const push = useCallback((approvals: FreshApproval[], isVisible: (category: ContributionCategoryId) => boolean) => {
    if (!cues) return;
    // Off-screen vessels already show their new count; they play no effect.
    const visible = approvals.filter((approval) => isVisible(approval.category));
    if (!visible.length) return;
    if (!travel) {
      for (const approval of visible) {
        showCue(approval.category, { key: approval.key, delta: approval.delta, milestone: approval.milestone, travelled: false });
      }
      return;
    }
    const { queue } = enqueueApprovals(queueRef.current, visible, MAX_QUEUE);
    queueRef.current = queue;
    const waiting = new Set(queue.map((flow) => flow.category));
    if (activeRef.current) waiting.add(activeRef.current.category);
    setHeld((current) => {
      const next = { ...current };
      for (const approval of visible) {
        if (waiting.has(approval.category) && next[approval.category] === undefined) next[approval.category] = approval.fromTotal;
      }
      return next;
    });
    if (!activeRef.current) later(startNext, GATHER_MS);
  }, [cues, travel, later, showCue, startNext]);

  // Turning motion off, hiding the tab or leaving the pipes finishes cleanly on the snapshot.
  useEffect(() => {
    if (!travel || !cues) cancelAll();
  }, [travel, cues, cancelAll]);

  useEffect(() => () => {
    for (const id of timers.current) window.clearTimeout(id);
    window.clearTimeout(safetyRef.current);
  }, []);

  return { active, held, arrivals, pumpPulse, push, arrive, cancelAll };
}
