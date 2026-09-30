import { useEffect, useState } from 'react';
import { PageHeader, Panel } from '@indigen-world/console-ui';
import type { ContributorRewardSettings } from './data';

type Settings = ContributorRewardSettings;

export function PointSettingsPanel({ settings, onSave, preview = false }: {
  settings?: Settings;
  onSave: (draft: Settings) => Promise<void>;
  preview?: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => setDraft(settings), [settings]);

  return <Panel>
    <PageHeader kicker="Contributor rewards" title="Point settings" body="Set the award per approved expression, daily limit, redemption threshold and cedi value." />
    {preview && <p className="point-settings-preview-note">Local preview with sample values. Changes here do not affect contributors or live settings.</p>}
    {notice && <p role="status">{notice}</p>}
    {draft && <form onSubmit={async event => {
      event.preventDefault();
      setBusy(true); setNotice('');
      try { await onSave(draft); setNotice(preview ? 'Sample settings updated in this preview.' : 'Point settings saved.'); }
      catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Point settings could not be saved.'); }
      finally { setBusy(false); }
    }}>
      {([['pointsPerExpression', 'Points per expression'], ['dailyCap', 'Daily point cap'], ['redemptionMinimum', 'Minimum redemption points'], ['cedisPerRedemption', 'Ghana cedis per redemption']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min="1" step="1" required value={draft[key]} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>)}
      <button className="button--primary" disabled={busy}>{busy ? 'Saving…' : preview ? 'Apply to preview' : 'Save point settings'}</button>
    </form>}
  </Panel>;
}
