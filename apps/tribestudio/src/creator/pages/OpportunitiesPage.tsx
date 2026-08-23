import { useEffect, useState } from 'react';
import type { Campaign } from '@indigen-world/contracts/creator-models';
import { ProgressBar, Badge } from '@indigen-world/web-ui';
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

  if (failed) return <div className="page"><h1>Opportunities &amp; Bounties</h1><LoadError onRetry={retry} /></div>;
  if (loading) return <div className="page"><h1>Opportunities &amp; Bounties</h1><Skeleton lines={5} /></div>;

  return (
    <div className="page">
      <header className="page__head page__head--spread">
        <div>
          <h1>Campaigns &amp; Creator Bounties</h1>
          <p className="muted">Participate in governed language collection challenges and earn cultural contributor bounties.</p>
        </div>
        <Badge tone="gold">✦ Active Creator Season</Badge>
      </header>

      {campaigns.length === 0 ? (
        <EmptyState title="No open campaigns yet" body="New campaigns will appear here. Join the waitlist to be notified first." />
      ) : (
        <div className="camp-list">
          {campaigns.map((c) => {
            const isOpen = submissionsOpen(c);
            // Dynamic synthetic bounty targets for display
            const targetCount = 500;
            const currentCount = isOpen ? 342 : 120;
            const prizePool = '15,000 GHS / $1,200 USD';

            return (
              <article key={c.id} className="camp-card iw-glass-card">
                <div className="camp-card__main">
                  <div className="camp-card__title">
                    <h2>{c.title}</h2>
                    <StatusPill status={c.status} labels={CAMPAIGN_STATUS_LABELS} />
                  </div>
                  <p className="muted">{c.description}</p>

                  {/* Bounty Progress & Prize Pool Bar */}
                  <div className="camp-bounty-box">
                    <div className="camp-bounty-row">
                      <span className="tiny">
                        <strong>Bounty Target:</strong> {currentCount} / {targetCount} Validated Submissions
                      </span>
                      <span className="tiny gold-text">
                        <strong>Prize Pool:</strong> {prizePool}
                      </span>
                    </div>
                    <ProgressBar
                      value={currentCount}
                      max={targetCount}
                      tone={isOpen ? 'gold' : 'indigo'}
                    />
                  </div>

                  <ul className="camp-card__meta">
                    <li><strong>Initiative:</strong> {c.initiative}</li>
                    {c.community ? <li><strong>Community:</strong> {c.community}</li> : null}
                    {c.categories && c.categories.length > 0 ? (
                      <li><strong>Categories:</strong> {c.categories.join(', ')}</li>
                    ) : null}
                  </ul>
                </div>

                <div className="camp-card__side">
                  {isOpen ? (
                    <Link to={`/studio/submissions/new?campaign=${c.id}`} className="button button--primary button--small">
                      🎙️ Submit content
                    </Link>
                  ) : (
                    <span className="pill pill--info">Submissions not open</span>
                  )}
                  <Link to={`/studio/opportunities/${c.id}`} className="button button--ghost-dark button--small">
                    View details &amp; guidelines
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

