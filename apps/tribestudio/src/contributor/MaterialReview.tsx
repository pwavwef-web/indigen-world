import { canValidate, signOutUser, useAuth } from '../auth';
import { AppShell } from '../ui';
import { useRoute } from '../router';
import { reviewNav } from './review/nav';
import { ContributionHistory } from './PortalHistory';
import './portal.css';
import { IngestionSettings } from './IngestionSettings';
import { ReviewVerification } from './ReviewVerification';
export function MaterialReview() {
  const { user, role } = useAuth(), { path, search } = useRoute();
  if (!user || !canValidate(role)) return <p role="alert">Reviewer permission is required.</p>;
  return <AppShell workspace="review" nav={reviewNav({ path }).map(n => ({ ...n, active: n.to.endsWith('desk=materials') }))} title="All-round contribution review" account={{ name: user.displayName || user.email || 'Reviewer' }} onSignOut={() => void signOutUser()}><div className="ts-page pw-workspace"><header className="pw-heading"><div><h1>Contribution review</h1><p>Private source material and candidate records. Review each version and its permitted uses separately.</p></div></header><ReviewVerification><IngestionSettings /><section className="pw-card"><ContributionHistory review selectedId={new URLSearchParams(search).get('record') ?? undefined} /></section></ReviewVerification></div></AppShell>;
}
