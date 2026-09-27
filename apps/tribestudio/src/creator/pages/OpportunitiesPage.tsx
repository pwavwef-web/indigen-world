import { useEffect, useState } from 'react';
import type { Campaign } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { fetchPublicCampaigns, submissionsOpen } from '../data';
import { CAMPAIGN_STATUS_LABELS, LoadError, Skeleton, StatusPill, useReloadable } from '../components';

/**
 * Campaigns, described by what they actually ask for.
 *
 * This page used to draw a progress bar of "validated submissions" and a
 * cash prize pool on every campaign, from numbers hard-coded in the component,
 * whatever the campaign said. Contributors read those as promises. Everything
 * shown now comes from the campaign record itself, and rewards are described
 * only where a campaign defines them.
 *
 * The one task that is always open — sharing an everyday expression — leads
 * the page, so nobody arrives here to be told there is nothing to do.
 */
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

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Campaigns &amp; opportunities</h1>
          <p className="muted">
            Open calls for Kasem contributions. Each one says what it asks for, how entries are reviewed, and
            whether anything is paid.
          </p>
        </div>
      </header>

      <article className="camp-card camp-card--open">
        <div className="camp-card__main">
          <div className="camp-card__title">
            <h2>Everyday Kasem expressions</h2>
            <span className="pill pill--ok">Open to everyone</span>
          </div>
          <p>
            Share one greeting, blessing, idiom or saying with what it means, when it is said and who you learned it
            from. A Kasem-speaking reviewer checks it before anyone else sees it, and you can follow its status. Approved
            expressions are published as expressions, credited to you.
          </p>
          <ul className="camp-card__meta">
            <li><strong>Takes:</strong> about five minutes per expression</li>
            <li><strong>Review:</strong> approved, or returned with the reviewer’s reason</li>
            <li><strong>Payment:</strong> none — this is a volunteer campaign</li>
          </ul>
        </div>
        <div className="camp-card__side">
          <Link to="/studio/expressions" className="button button--primary button--small">Share an expression</Link>
        </div>
      </article>

      {failed ? (
        <LoadError title="Could not load the other campaigns" onRetry={retry} />
      ) : loading ? (
        <Skeleton lines={4} />
      ) : campaigns.length === 0 ? (
        <p className="notice">No other campaigns are announced right now. New ones will appear here with their rules.</p>
      ) : (
        <div className="camp-list">
          {campaigns.map((c) => {
            const isOpen = submissionsOpen(c);
            const rewards = (c.prizeTiers ?? []).length > 0;
            return (
              <article key={c.id} className="camp-card iw-glass-card">
                <div className="camp-card__main">
                  <div className="camp-card__title">
                    <h2>{c.title}</h2>
                    <StatusPill status={c.status} labels={CAMPAIGN_STATUS_LABELS} />
                  </div>
                  <p className="muted">{c.description}</p>
                  <ul className="camp-card__meta">
                    <li><strong>Initiative:</strong> {c.initiative}</li>
                    {c.community ? <li><strong>Community:</strong> {c.community}</li> : null}
                    {c.categories && c.categories.length > 0 ? (
                      <li><strong>Categories:</strong> {c.categories.join(', ')}</li>
                    ) : null}
                    <li>
                      <strong>Rewards:</strong>{' '}
                      {rewards ? 'set out on the campaign page — entering never guarantees payment' : 'none announced'}
                    </li>
                  </ul>
                </div>

                <div className="camp-card__side">
                  {isOpen ? (
                    <Link to={`/studio/submissions/new?campaign=${c.id}`} className="button button--primary button--small">
                      Submit an entry
                    </Link>
                  ) : (
                    <span className="pill pill--info">Submissions not open</span>
                  )}
                  <Link to={`/studio/opportunities/${c.id}`} className="button button--ghost-dark button--small">
                    Details and rules
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
