import { useState } from 'react';
import { useRoute } from '../router';
import { Icon, Panel, ProgressBar } from './components';
import { friendlyError } from './model';
import { useShared, useWorkspace } from './workspace';

const BATCH = 15;

/**
 * Today's batch (contributor-daily-tasks.ts): the team prepares fifteen
 * expressions a day for a contributor, and a second fifteen can be requested
 * once all of the first are submitted. Approval is not required to ask for
 * the second batch. When nothing is prepared for today the panel is not
 * shown at all on the overview, and says so plainly on the Tasks page.
 */
export function DailyBatch({ compact = false }: { compact?: boolean }) {
  const data = useWorkspace();
  const { daily } = useShared();
  const { navigate } = useRoute();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = daily.value;

  if (!value) {
    if (compact) return null;
    return daily.state === 'error' ? (
      <Panel title="Today’s batch">
        <p className="cw-muted">Today’s batch could not be checked. Your assigned tasks below are unaffected. <button type="button" className="cw-link-button" onClick={daily.refresh}>Try again</button></p>
      </Panel>
    ) : null;
  }
  if (value.status === 'not_prepared') {
    return compact ? null : (
      <Panel title="Today’s batch">
        <p className="cw-muted">The team has not prepared a daily batch for you today. Your other tasks are below.</p>
      </Panel>
    );
  }

  const extraItems = value.extraWork ? data.items[value.extraWork] ?? [] : [];
  const extraDone = extraItems.length === BATCH && extraItems.every((item) => item.submissionId);
  const extraSubmitted = extraItems.filter((item) => item.submissionId).length;

  const requestMore = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await data.services.requestMoreDaily();
      daily.set(next);
      if (next.extraWork) navigate(data.paths.work(next.extraWork));
    } catch (reason) {
      setError(friendlyError(reason, 'Requesting more tasks').message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Today’s batch" description="Fifteen to start, fifteen more on request once a day" className="cw-daily">
      {value.status === 'in_progress' ? (
        <div className="cw-stack cw-stack--sm">
          <div className="cw-row cw-row--between"><strong>First batch</strong><span className="cw-muted cw-tabular">{value.submitted} of {BATCH} submitted</span></div>
          <ProgressBar value={value.submitted} max={BATCH} label="First batch submitted" />
          <p className="cw-muted cw-small">Submit all fifteen to unlock a second batch today. Approval is not needed first.</p>
          <div><button type="button" onClick={() => navigate(data.paths.work(value.firstWork))}>Continue first batch<Icon name="arrow" /></button></div>
        </div>
      ) : value.status === 'eligible' ? (
        <div className="cw-stack cw-stack--sm">
          <p>All fifteen in today’s first batch are submitted. You can ask for fifteen more today.</p>
          <div><button type="button" className="button--primary" disabled={busy} onClick={() => void requestMore()}>{busy ? 'Requesting…' : 'Request fifteen more'}</button></div>
        </div>
      ) : value.status === 'extra_unlocked' ? (
        <div className="cw-stack cw-stack--sm">
          <div className="cw-row cw-row--between"><strong>Second batch</strong><span className="cw-muted cw-tabular">{extraSubmitted} of {BATCH} submitted</span></div>
          <ProgressBar value={extraSubmitted} max={BATCH} label="Second batch submitted" />
          <p className="cw-muted cw-small">{extraDone ? 'You have finished today’s batches. Follow their review in My submissions.' : 'You have used today’s extra request. A new batch depends on what the team prepares.'}</p>
          {!extraDone && value.extraWork ? <div><button type="button" onClick={() => navigate(data.paths.work(value.extraWork))}>Open second batch<Icon name="arrow" /></button></div> : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="cw-field__error">{error}</p> : null}
    </Panel>
  );
}
