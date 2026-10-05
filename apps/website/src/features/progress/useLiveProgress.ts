/**
 * The progress page's connection to verified totals.
 *
 * Totals and connection state are kept apart from any animation: numbers on
 * screen always follow the latest authoritative document the moment it
 * arrives, and approvals are handed to `onApprovals` for the visual flow to
 * play (or not) on its own schedule.
 *
 * "Live" is only ever claimed for a subscribed listener whose latest snapshot
 * came from the server. While connecting the page says so; a dropped
 * connection reads "Reconnecting"; a missing projection falls back to counted
 * snapshots labelled with their time.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { websiteFirestore } from '../../lib/firebaseApp';
import { DEFAULT_PRODUCTION_CONFIG, FIXTURE_APPROVED_COUNTS, FIXTURE_TARGETS } from './progressConfig';
import {
  fetchSnapshotCounts,
  loadCachedProgress,
  saveCachedProgress,
  subscribeLaunchConfig,
  subscribePublicProgress,
  type NullableTotals,
} from './progressData';
import {
  ingestPublicProgress,
  type FreshApproval,
  type LiveModelState,
  type PublicProgressView,
} from './liveProgressModel';
import type { ConnectionState, ContributionCategoryId, LaunchProgressConfig } from './progressTypes';

/** Snapshots delivered this soon after a tab becomes visible are catch-up. */
const RESUME_GRACE_MS = 1500;
/** Without a server answer by then, measure snapshots instead of waiting. */
const CONNECT_TIMEOUT_MS = 12_000;
const SNAPSHOT_REFRESH_MS = 120_000;
const SNAPSHOT_REFRESH_HIDDEN_MS = 300_000;

export const FIXTURE_CONFIG: LaunchProgressConfig = {
  launchWindowLabel: 'Planned: December 2026 / January 2027 (Sample fixture preview)',
  launchTargetDate: '2026-12-15',
  categoryTargets: FIXTURE_TARGETS,
  notes: 'Sample targets and counts for UI development and motion verification.',
};

export interface LiveProgressState {
  connection: ConnectionState;
  /** null: that collection could not be read. Absent until anything is known. */
  totals: NullableTotals;
  hasData: boolean;
  config: LaunchProgressConfig;
  fixtureMode: boolean;
  /** When the numbers were last confirmed by the server (ms), or cached (ms). */
  confirmedAtMs: number | null;
  error: string | null;
}

function initialState(fixtureMode: boolean): LiveProgressState {
  if (fixtureMode) {
    return { connection: 'sample', totals: { ...FIXTURE_APPROVED_COUNTS }, hasData: true, config: FIXTURE_CONFIG, fixtureMode: true, confirmedAtMs: null, error: null };
  }
  const cached = loadCachedProgress();
  return cached
    ? { connection: 'cached', totals: cached.totals, hasData: true, config: DEFAULT_PRODUCTION_CONFIG, fixtureMode: false, confirmedAtMs: cached.savedAtMs, error: null }
    : { connection: 'connecting', totals: {}, hasData: false, config: DEFAULT_PRODUCTION_CONFIG, fixtureMode: false, confirmedAtMs: null, error: null };
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useLiveProgress({ fixtureMode, onApprovals }: {
  fixtureMode: boolean;
  onApprovals: (approvals: FreshApproval[]) => void;
}) {
  const [state, setState] = useState<LiveProgressState>(() => initialState(fixtureMode));
  const [reloadKey, setReloadKey] = useState(0);
  const modelRef = useRef<LiveModelState | null>(null);
  const configRef = useRef<LaunchProgressConfig>(state.config);
  const onApprovalsRef = useRef(onApprovals);
  onApprovalsRef.current = onApprovals;
  // Animate only while continuously live and visible, never just after resuming.
  const continuityRef = useRef({ live: false, visibleSince: Date.now() });

  const ingest = useCallback((view: PublicProgressView, animate: boolean) => {
    const result = ingestPublicProgress(modelRef.current, view, {
      animate,
      nowMs: Date.now(),
      targets: configRef.current.categoryTargets,
    });
    modelRef.current = result.state;
    return result;
  }, []);

  const fixtureRef = useRef(fixtureMode);
  useEffect(() => {
    // A reconnect starts a new cursor: its first snapshot is history again.
    modelRef.current = null;
    continuityRef.current.live = false;
    if (fixtureRef.current !== fixtureMode) {
      fixtureRef.current = fixtureMode;
      setState(initialState(fixtureMode));
    }
    if (fixtureMode) {
      configRef.current = FIXTURE_CONFIG;
      modelRef.current = { revision: 0, totals: { ...FIXTURE_APPROVED_COUNTS }, milestones: [] };
      return undefined;
    }
    configRef.current = DEFAULT_PRODUCTION_CONFIG;

    let disposed = false;
    let snapshotTimer: number | undefined;
    let snapshotMode = false;
    let receivedServerAnswer = false;
    const db = websiteFirestore();

    const unsubscribeConfig = subscribeLaunchConfig(db, (config) => {
      configRef.current = config;
      if (!disposed) setState((previous) => ({ ...previous, config }));
    });

    const refreshSnapshot = async () => {
      if (disposed || !snapshotMode) return;
      window.clearTimeout(snapshotTimer);
      try {
        const totals = await fetchSnapshotCounts(db);
        if (disposed || !snapshotMode) return;
        const known = Object.values(totals).some((value) => typeof value === 'number');
        if (known) {
          saveCachedProgress(totals);
          setState((previous) => ({ ...previous, connection: online() ? 'snapshot' : 'offline', totals, hasData: true, confirmedAtMs: Date.now(), error: null }));
        } else {
          setState((previous) => previous.hasData
            ? { ...previous, connection: online() ? 'cached' : 'offline' }
            : { ...previous, connection: online() ? 'error' : 'offline', error: 'Verified counts are unavailable right now.' });
        }
      } catch {
        if (!disposed) setState((previous) => ({ ...previous, connection: online() ? (previous.hasData ? 'cached' : 'error') : 'offline' }));
      }
      if (!disposed && snapshotMode) {
        snapshotTimer = window.setTimeout(() => void refreshSnapshot(), document.hidden ? SNAPSHOT_REFRESH_HIDDEN_MS : SNAPSHOT_REFRESH_MS);
      }
    };
    const enterSnapshotMode = () => {
      continuityRef.current.live = false;
      if (snapshotMode) return;
      snapshotMode = true;
      void refreshSnapshot();
    };

    const unsubscribeLive = subscribePublicProgress(db, (view, meta) => {
      if (disposed) return;
      if (!meta.fromCache) receivedServerAnswer = true;
      if (!view) {
        // The server says there is no projection yet: measure instead of waiting.
        if (!meta.fromCache) enterSnapshotMode();
        return;
      }
      if (meta.fromCache) {
        // A local copy, or the connection dropped: show it, never as live.
        const wasLive = continuityRef.current.live;
        continuityRef.current.live = false;
        const result = ingest(view, false);
        setState((previous) => ({
          ...previous,
          totals: { ...result.state.totals },
          hasData: true,
          connection: !online() ? 'offline' : wasLive || previous.connection === 'live' ? 'reconnecting' : previous.connection,
        }));
        return;
      }
      snapshotMode = false;
      window.clearTimeout(snapshotTimer);
      const continuity = continuityRef.current;
      const animate = continuity.live && !document.hidden && Date.now() - continuity.visibleSince > RESUME_GRACE_MS;
      const result = ingest(view, animate);
      continuity.live = true;
      saveCachedProgress(result.state.totals);
      setState((previous) => ({
        ...previous,
        connection: online() ? 'live' : 'offline',
        totals: { ...result.state.totals },
        hasData: true,
        confirmedAtMs: Date.now(),
        error: null,
      }));
      if (result.approvals.length) onApprovalsRef.current(result.approvals);
    }, () => {
      // Usually the projection's rule or backend is not deployed yet.
      if (!disposed) enterSnapshotMode();
    });

    const connectTimer = window.setTimeout(() => {
      if (!disposed && !receivedServerAnswer) enterSnapshotMode();
    }, CONNECT_TIMEOUT_MS);

    const handleOffline = () => {
      continuityRef.current.live = false;
      setState((previous) => ({ ...previous, connection: 'offline' }));
    };
    const handleOnline = () => {
      setState((previous) => ({ ...previous, connection: snapshotMode ? 'snapshot' : 'reconnecting' }));
      if (snapshotMode) void refreshSnapshot();
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        continuityRef.current.visibleSince = Date.now();
        if (snapshotMode) void refreshSnapshot();
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      unsubscribeLive();
      unsubscribeConfig();
      window.clearTimeout(snapshotTimer);
      window.clearTimeout(connectTimer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fixtureMode, reloadKey, ingest]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  /**
   * Development only, and only over sample data: plays an approval through
   * exactly the path a real committed one takes. Absent from production builds.
   */
  const simulateApproval = useCallback((category: ContributionCategoryId, delta = 1) => {
    if (!import.meta.env.DEV || !fixtureMode) return;
    const model = modelRef.current;
    if (!model) return;
    const total = (model.totals[category] ?? 0) + delta;
    const revision = model.revision + 1;
    const view: PublicProgressView = {
      revision,
      totals: { ...model.totals, [category]: total },
      events: [{ id: `${revision}.${category}`, revision, category, delta, total, atMs: Date.now() }],
      updatedAtMs: Date.now(),
    };
    const result = ingest(view, !document.hidden);
    setState((previous) => ({ ...previous, totals: { ...result.state.totals } }));
    if (result.approvals.length) onApprovalsRef.current(result.approvals);
  }, [fixtureMode, ingest]);

  return { ...state, refresh, simulateApproval };
}
