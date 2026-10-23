import { AppShell } from '../ui';
import { ContributionHistory } from './PortalHistory';
import { seedMaterialPreview } from './portal-preview';
import './portal.css';
/** Only reachable through a DEV-only lazy import. No authentication or write bypass in production. */
export function MaterialReviewPreview() {
  seedMaterialPreview();
  return <AppShell workspace="review" nav={[{ to: '/contributor/preview', label: 'Contributor Home', group: '', icon: 'home' }, { to: '/contributor/preview/material-review', label: 'All-round contributions', group: 'Review desks', icon: 'doc', active: true }]} account={{ name: 'Sample reviewer', role: 'Synthetic preview' }} title="Contribution review" onSignOut={() => {}} banner={<div className="ts-banner"><strong>Local preview · synthetic review fixture</strong><span>Source, extraction and permissions are sample data. No production reads or writes.</span></div>}><div className="ts-page pw-workspace"><header className="pw-heading"><div><h1>Contribution review</h1><p>Read the source. Check privacy, permissions, and evidence. Review candidates separately.</p></div></header><section className="pw-card"><ContributionHistory preview review selectedId="PC-preview-source-material" /></section></div></AppShell>;
}
