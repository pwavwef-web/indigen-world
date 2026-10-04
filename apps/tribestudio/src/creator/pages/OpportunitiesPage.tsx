import { useEffect, useState } from 'react';
import type { Campaign } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { fetchPublicCampaigns, submissionsOpen } from '../data';
import { CAMPAIGN_STATUS_LABELS, LoadError, StatusPill, useReloadable } from '../components';
import { Badge, ButtonLink, EmptyState, Icon, PageHeader, SkeletonCards, spotlight } from '../../ui';

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
    <div className="ts-page cr-opps">
      <PageHeader
        kicker="Language"
        title="Campaigns & opportunities"
        description="Open calls for Kasem contributions. Each one says what it asks for, how entries are reviewed, and whether anything is paid."
      />

      <article className="cr-always">
        <div className="cr-always__copy">
          <p className="cr-always__kicker"><span className="cr-always__pulse" aria-hidden="true" />Always open</p>
          <h2>Everyday Kasem expressions</h2>
          <p>
            Share one greeting, blessing, idiom or saying with what it means, when it is said and who you learned it
            from. A Kasem-speaking reviewer checks it before anyone else sees it, and you can follow its status. Approved
            expressions are published as expressions, credited to you.
          </p>
          <dl className="cr-always__facts">
            <div><dt>Takes</dt><dd>About five minutes per expression</dd></div>
            <div><dt>Review</dt><dd>Approved, or returned with the reviewer’s reason</dd></div>
            <div><dt>Payment</dt><dd>None — this is a volunteer campaign</dd></div>
          </dl>
        </div>
        <div className="cr-always__action">
          <ButtonLink to="/studio/expressions" variant="on-dark" size="lg" iconRight="arrow">Share an expression</ButtonLink>
          <Badge tone="success" dot>Open to everyone</Badge>
        </div>
      </article>

      <section className="ts-stack" aria-labelledby="cr-campaigns-title">
        <h2 id="cr-campaigns-title" className="ts-overline">Announced campaigns</h2>
        {failed ? (
          <LoadError title="Could not load the other campaigns" onRetry={retry} />
        ) : loading ? (
          <SkeletonCards count={2} label="Loading campaigns" />
        ) : campaigns.length === 0 ? (
          <EmptyState boxed compact icon="opportunities" title="No other campaigns right now" body="New campaigns appear here with their rules as soon as they are announced." />
        ) : (
          <div className="cr-campaigns ts-stagger">
            {campaigns.map((c) => {
              const isOpen = submissionsOpen(c);
              const rewards = (c.prizeTiers ?? []).length > 0;
              return (
                <article key={c.id} className="ts-card cr-campaign ts-spotlight" onPointerMove={spotlight}>
                  <div className="cr-campaign__top">
                    <span className="ts-card__icon" aria-hidden="true"><Icon name="opportunities" /></span>
                    <StatusPill status={c.status} labels={CAMPAIGN_STATUS_LABELS} />
                  </div>
                  <h3 className="ts-card__title">{c.title}</h3>
                  {c.description ? <p className="ts-card__body ts-clamp-3">{c.description}</p> : null}
                  <dl className="cr-campaign__facts">
                    <div><dt>Initiative</dt><dd>{c.initiative}</dd></div>
                    {c.community ? <div><dt>Community</dt><dd>{c.community}</dd></div> : null}
                    {c.categories && c.categories.length > 0 ? <div><dt>Categories</dt><dd>{c.categories.join(', ')}</dd></div> : null}
                    <div><dt>Rewards</dt><dd>{rewards ? 'Set out on the campaign page — entering never guarantees payment' : 'None announced'}</dd></div>
                  </dl>
                  <div className="cr-campaign__actions">
                    {isOpen ? (
                      <ButtonLink to={`/studio/submissions/new?campaign=${c.id}`} variant="primary" size="sm" icon="send">Submit an entry</ButtonLink>
                    ) : (
                      <Badge tone="info">Submissions not open</Badge>
                    )}
                    <Link to={`/studio/opportunities/${c.id}`} className="ts-btn ts-btn--ghost ts-btn--sm">Details and rules<Icon name="arrow" /></Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
