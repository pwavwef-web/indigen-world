import { useEffect, useState } from 'react';
import type { Campaign } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { fetchPublicCampaigns, submissionsOpen } from '../data';
import { CAMPAIGN_STATUS_LABELS, EmptyState, LoadError, Skeleton, StatusPill, useReloadable } from '../components';

export function OpportunitiesPage() {
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setLoading(true);
    void fetchPublicCampaigns()
      .then((list) => { if (!active) return; setCampaigns(list); setLoading(false); })
      .catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [reloadKey, setFailed]);

  if (failed) return <div className="page"><h1>Opportunities</h1><LoadError onRetry={retry} /></div>;
  if (loading) return <div className="page"><h1>Opportunities</h1><Skeleton lines={5} /></div>;

  return (
    <div className="page">
      <header className="page__head"><h1>Opportunities</h1></header>
      {campaigns.length === 0 ? (
        <EmptyState title="No open campaigns yet" body="New campaigns will appear here. Join the waitlist to be notified first." />
      ) : (
        <div className="camp-list">
          {campaigns.map((c) => (
            <article key={c.id} className="camp-card">
              <div className="camp-card__main">
                <div className="camp-card__title">
                  <h2>{c.title}</h2>
                  <StatusPill status={c.status} labels={CAMPAIGN_STATUS_LABELS} />
                </div>
                <p className="muted">{c.description}</p>
                <ul className="camp-card__meta">
                  <li>{c.initiative}</li>
                  {c.community ? <li>{c.community}</li> : null}
                  {c.categories && c.categories.length > 0 ? <li>{c.categories.length} categories</li> : null}
                </ul>
              </div>
              <div className="camp-card__side">
                {submissionsOpen(c) ? (
                  <Link to={`/studio/submissions/new?campaign=${c.id}`} className="button button--primary button--small">Submit content</Link>
                ) : (
                  <span className="pill pill--info">Submissions not open</span>
                )}
                <Link to={`/studio/opportunities/${c.id}`} className="button button--ghost-dark button--small">View details</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
