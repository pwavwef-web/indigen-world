import { formatClock } from './progressFormat';
import type { ConnectionState } from './progressTypes';

/** What the numbers on screen are, in a word or two. Never decorative: "Live" means a confirmed subscription. */
export function connectionLabel(state: ConnectionState, confirmedAtMs: number | null): string {
  const clock = formatClock(confirmedAtMs);
  switch (state) {
    case 'live': return 'Live';
    case 'connecting': return 'Connecting…';
    case 'reconnecting': return 'Reconnecting…';
    case 'offline': return clock ? `Offline · ${clock}` : 'Offline';
    case 'snapshot': return clock ? `Updated ${clock}` : 'Updated';
    case 'cached': return clock ? `Cached ${clock}` : 'Cached';
    case 'sample': return 'Sample data';
    default: return 'Counts unavailable';
  }
}

export function ConnectionStatus({ state, confirmedAtMs }: { state: ConnectionState; confirmedAtMs: number | null }) {
  const title = state === 'live'
    ? 'Approvals appear here as they are committed.'
    : state === 'snapshot'
      ? 'Counted from collection records; refreshed every few minutes, not instantly.'
      : undefined;
  return (
    <p className="pipeline-status" data-state={state} title={title}>
      <span className="pipeline-status__dot" aria-hidden="true" />
      <span>{connectionLabel(state, confirmedAtMs)}</span>
    </p>
  );
}
