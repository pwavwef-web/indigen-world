import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@indigen-world/console-ui';
import { PointSettingsPanel } from './PointSettingsPanel';
import { RedemptionRequestsPanel } from './RedemptionRequestsPanel';
import { decideContributorRedemption, loadContributorRewards, saveContributorRewardSettings,
  type ContributorDirectoryRow, type ContributorRedemption, type ContributorRewards } from './data';

export function ContributorRewardsDesk({ contributors }: { contributors: ContributorDirectoryRow[] }) {
  const [data, setData] = useState<ContributorRewards | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try { setData((await loadContributorRewards({})).data); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Rewards could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (request: ContributorRedemption, action: 'approve' | 'reject' | 'fulfill' | 'paid') => {
    if (action === 'paid') return;
    const note = action === 'reject' ? window.prompt('Why is this redemption being rejected? The contributor will see this reason.')?.trim() : '';
    if (action === 'reject' && !note) return;
    const paymentReference = action === 'fulfill' ? window.prompt('Enter the delivery reference after sending the airtime or data.')?.trim() : '';
    if (action === 'fulfill' && !paymentReference) return;
    setBusy(request.id); setError('');
    try { await decideContributorRedemption({ requestId: request.id, action, note: note ?? '', paymentReference }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The redemption could not be updated.'); }
    finally { setBusy(''); }
  };
  return <div className="contributor-payments-admin">
    {error && <Alert title="Rewards need attention" action={<button onClick={() => void load()}>Retry</button>}>{error}</Alert>}
    <PointSettingsPanel settings={data?.rewards} onSave={async settings => { await saveContributorRewardSettings(settings); await load(); }} />
    <RedemptionRequestsPanel requests={data?.requests ?? []} loading={!data && !error} busy={busy}
      nameFor={id => contributors.find(row => row.id === id || row.authUid === id)?.displayName ?? id}
      onAction={(request, action) => void act(request, action)} />
  </div>;
}
