import { useState } from 'react';
import type { ContributorRedemption, ContributorRewardSettings } from './data';
import { PointSettingsPanel } from './PointSettingsPanel';
import { RedemptionRequestsPanel } from './RedemptionRequestsPanel';

const sampleSettings: ContributorRewardSettings = {
  pointsPerExpression: 10,
  dailyCap: 300,
  redemptionMinimum: 300,
  cedisPerRedemption: 5,
};
const sampleRequests: ContributorRedemption[] = [
  { id: 'sample-pending', contributorId: 'ama', points: 300, amountMinor: 500, currency: 'GHS', description: '300 points for airtime', status: 'submitted', kind: 'airtime', network: 'MTN', phoneNumber: '+233241234567', createdAt: '2026-09-26T09:00:00Z' },
  { id: 'sample-approved', contributorId: 'kojo', points: 600, amountMinor: 1000, currency: 'GHS', description: '600 points for data', status: 'approved', kind: 'data', network: 'Telecel', phoneNumber: '+233201234567', createdAt: '2026-09-25T14:00:00Z' },
  { id: 'sample-sent', contributorId: 'esi', points: 300, amountMinor: 500, currency: 'GHS', description: '300 points for airtime', status: 'fulfilled', kind: 'airtime', network: 'AT', phoneNumber: '+233271234567', createdAt: '2026-09-24T11:00:00Z', paymentReference: 'SAMPLE-DELIVERY' },
];

export function PointSettingsPreview() {
  const [settings, setSettings] = useState(sampleSettings);
  const [requests, setRequests] = useState(sampleRequests);
  return <div className="admin-app-shell iwx point-settings-preview-shell">
    <main className="admin-main" id="main-content">
      <div className="point-settings-preview-header"><span>INDIGEN WORLD · ADMIN CONSOLE</span><h1>Contributor points</h1><p>Explore the point calibration controls using sample settings.</p></div>
      <div className="contributors-admin contributor-payments-admin">
        <PointSettingsPanel settings={settings} preview onSave={async draft => setSettings(draft)} />
        <RedemptionRequestsPanel requests={requests} preview nameFor={id => ({ ama: 'Ama A.', kojo: 'Kojo K.', esi: 'Esi E.' })[id as 'ama' | 'kojo' | 'esi'] ?? id} onAction={(request, action) => setRequests(current => current.map(item => item.id === request.id ? { ...item, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'paid' ? 'paid' : 'fulfilled', ...(action === 'fulfill' ? { paymentReference: 'SAMPLE-DELIVERY' } : {}) } : item))} />
      </div>
    </main>
  </div>;
}
