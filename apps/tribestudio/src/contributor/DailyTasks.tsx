import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useRoute } from '../router';
import { useWorkspace } from './workspace';
import { Badge, Button, Panel, ProgressBar } from '../ui';

type Daily = { day: string; status: string; submitted: number; firstWork: string; extraWork: string };
const getDaily = httpsCallable<Record<string, never>, Daily>(functions, 'getContributorDailyTasks');
const more = httpsCallable<Record<string, never>, Daily>(functions, 'requestMoreContributorTasks');

/**
 * Today's batch: fifteen tasks to start, and one request a day for fifteen
 * more once the first batch is submitted (approval is not required). The
 * rules are the server's; this only shows where the day stands.
 */
export function DailyTasks() {
  const data = useWorkspace();
  const { navigate } = useRoute();
  const [daily, setDaily] = useState<Daily | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submittedKey = Object.values(data.items).flat().filter(x => x.submissionId).map(x => x.submissionId).sort().join(',');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (data.preview) {
        setDaily({
          day: new Date().toISOString().slice(0, 10),
          status: data.works.some(x => x.id === 'daily-preview-extra') ? 'extra_unlocked' : (data.items['daily-preview-first'] ?? []).filter(x => x.submissionId).length === 15 ? 'eligible' : 'in_progress',
          submitted: (data.items['daily-preview-first'] ?? []).filter(x => x.submissionId).length,
          firstWork: 'daily-preview-first',
          extraWork: data.works.some(x => x.id === 'daily-preview-extra') ? 'daily-preview-extra' : '',
        });
        return;
      }
      void getDaily({}).then(r => { if (active) { setDaily(r.data); setError(''); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Daily tasks could not be loaded.'); });
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [data.uid, data.preview, submittedKey, data.works.length]);
  const extraItems = daily?.extraWork ? data.items[daily.extraWork] : undefined;
  const finished = Boolean(extraItems?.length === 15 && extraItems.every(x => x.submissionId));
  const extraSubmitted = extraItems?.filter(x => x.submissionId).length ?? 0;

  const requestMore = async () => {
    if (!daily) return;
    setBusy(true); setError('');
    try {
      if (data.preview) {
        data.services.unlockDailyPreview?.();
        setDaily({ ...daily, status: 'extra_unlocked', extraWork: 'daily-preview-extra' });
        navigate(data.paths.work('daily-preview-extra'));
      } else {
        const r = await more({});
        setDaily(r.data);
        navigate(data.paths.work(r.data.extraWork));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlock tasks. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const status = daily?.status;
  return (
    <Panel
      className="cw-daily"
      title="Today’s tasks"
      description="15 to start. Once those are submitted you can request 15 more, once per day (UTC)."
      actions={status === 'extra_unlocked' ? <Badge tone={finished ? 'success' : 'info'} dot>{finished ? 'Done for today' : 'Extra batch open'}</Badge>
        : status === 'eligible' ? <Badge tone="success" dot live>Ready for more</Badge>
          : status === 'in_progress' ? <Badge tone="accent" dot>{daily?.submitted ?? 0} of 15</Badge> : null}
    >
      {error ? <p role="alert" className="ts-notice ts-notice--danger">{error}</p> : null}
      {!daily && !error ? <p className="ts-muted" role="status" style={{ fontSize: 'var(--fs-sm)' }}>Loading today’s tasks…</p> : null}
      {status === 'not_prepared' ? <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>The team has not prepared today’s tasks yet. Your existing work remains available.</p> : null}
      {status === 'in_progress' && daily ? (
        <div className="ts-stack ts-stack--md">
          <ProgressBar value={daily.submitted} max={15} label={`${daily.submitted} of 15 of today’s tasks submitted`} />
          <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap' }}>
            <span className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>{daily.submitted} of 15 submitted. Approval is not needed to request the next batch.</span>
            <Button variant="soft" size="sm" iconRight="arrow" onClick={() => navigate(data.paths.work(daily.firstWork))}>Continue first 15</Button>
          </div>
        </div>
      ) : null}
      {status === 'eligible' && daily ? (
        <div className="ts-stack ts-stack--md">
          <ProgressBar value={15} max={15} tone="success" label="All 15 of today’s first tasks submitted" />
          <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-sm)' }}>Your first 15 are submitted. You can request today’s final 15.</span>
            <Button variant="primary" size="sm" icon="plus" busy={busy} onClick={() => void requestMore()}>{busy ? 'Unlocking…' : 'Request 15 more'}</Button>
          </div>
        </div>
      ) : null}
      {status === 'extra_unlocked' && daily ? (
        <div className="ts-stack ts-stack--md">
          <ProgressBar value={extraSubmitted} max={15} tone={finished ? 'success' : undefined} label={`${extraSubmitted} of 15 extra tasks submitted`} />
          <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-sm)' }}>{finished ? 'You’re done for today’s batch. Follow review updates in My contributions.' : 'You’ve used today’s extra request. Your second batch is ready.'}</span>
            {!finished ? <Button variant="soft" size="sm" iconRight="arrow" onClick={() => navigate(data.paths.work(daily.extraWork))}>Open extra 15</Button> : null}
          </div>
          <p className="ts-hint">A new daily batch depends on tasks prepared by the team.</p>
        </div>
      ) : null}
    </Panel>
  );
}
