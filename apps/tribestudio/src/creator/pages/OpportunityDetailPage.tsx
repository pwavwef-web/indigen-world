import { useEffect, useState } from 'react';
import type { Campaign } from '@indigen-world/contracts/creator-models';
import { useRoute, matchRoute } from '../../router';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';
import { fetchCampaign, submissionsOpen } from '../data';
import { CAMPAIGN_STATUS_LABELS, LoadError, StatusPill, useReloadable, WhatsAppCard } from '../components';
import { Badge, Breadcrumb, ButtonAnchor, ButtonLink, Disclosure, EmptyState, KeyValue, Notice, PageHeader, Panel, Skeleton } from '../../ui';

function formatDate(iso?: string | null): string {
  if (!iso) return 'To be announced';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return 'To be announced';
  }
}

export function OpportunityDetailPage() {
  const { path } = useRoute();
  const { whatsappUrl } = useConfig();
  const params = matchRoute('/studio/opportunities/:id', path);
  const id = params?.id;
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setFailed(false);
    setLoading(true);
    void fetchCampaign(id)
      .then((c) => {
        if (!active) return;
        setCampaign(c);
        setLoading(false);
        if (c) trackEvent('campaign_viewed', { campaign: c.slug });
      })
      .catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [id, reloadKey, setFailed]);

  if (failed) return <div className="ts-page"><LoadError title="Could not load this campaign" onRetry={retry} /></div>;
  if (loading) return <div className="ts-page"><div className="ts-panel"><Skeleton lines={8} title label="Loading the campaign" /></div></div>;
  if (!campaign) {
    return (
      <div className="ts-page ts-page--medium">
        <EmptyState boxed icon="opportunities" title="Campaign not found" body="It may have ended, or the link may be incomplete."
          actions={<ButtonLink to="/studio/opportunities" variant="secondary" icon="back">Back to opportunities</ButtonLink>} />
      </div>
    );
  }

  const open = submissionsOpen(campaign);

  return (
    <div className="ts-page cr-opportunity">
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Opportunities', to: '/studio/opportunities' }, { label: campaign.title }]} />}
        kicker="Campaign"
        title={campaign.title}
        description={`${campaign.initiative}${campaign.community ? ` · ${campaign.community}` : ''}`}
        meta={<StatusPill status={campaign.status} labels={CAMPAIGN_STATUS_LABELS} />}
        actions={open ? <ButtonLink to={`/studio/submissions/new?campaign=${campaign.id}`} variant="primary" icon="send">Submit content</ButtonLink> : undefined}
      />

      {!open ? (
        <Notice tone="info" title="Submissions are not open yet.">
          {campaign.status === 'WAITLIST_OPEN' ? 'Join the waitlist and you will be told when entries open.' : 'Check back for updates.'}
        </Notice>
      ) : null}

      <div className="ts-split">
        <div className="ts-stack">
          <Panel title="Overview"><p className="cr-prose preserve-lines">{campaign.description || '—'}</p></Panel>
          {campaign.brief ? <Panel title="Content brief"><p className="cr-prose preserve-lines">{campaign.brief}</p></Panel> : null}
          {campaign.eligibility ? <Panel title="Eligibility"><p className="cr-prose preserve-lines">{campaign.eligibility}</p></Panel> : null}
          {campaign.categories && campaign.categories.length > 0 ? (
            <Panel title="Eligible categories">
              <div className="ts-cluster">{campaign.categories.map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>
            </Panel>
          ) : null}
          {campaign.prizeTiers && campaign.prizeTiers.length > 0 ? (
            <Panel title="Reward structure" description="Registration and submission never guarantee payment.">
              <KeyValue items={campaign.prizeTiers.map((t) => ({ label: t.label, value: t.amount ? `${t.currency ?? ''} ${t.amount}`.trim() : 'To be announced' }))} />
            </Panel>
          ) : null}
          {campaign.judgingRubric && campaign.judgingRubric.length > 0 ? (
            <Panel title="Judging criteria">
              <ol className="cr-criteria">{campaign.judgingRubric.map((r) => <li key={r.key}>{r.label}</li>)}</ol>
            </Panel>
          ) : null}
          <Panel title="Rights and consent" variant="tint">
            <p className="cr-prose">You choose separately, per submission, whether approved content may be published, used for promotion, or used for AI research. AI-training permission is optional and never required to enter.</p>
          </Panel>
          {campaign.faqs && campaign.faqs.length > 0 ? (
            <Panel title="FAQs">
              <div className="cr-faq">{campaign.faqs.map((f) => <Disclosure key={f.question} summary={f.question}><p className="cr-prose">{f.answer}</p></Disclosure>)}</div>
            </Panel>
          ) : null}
        </div>

        <aside className="ts-stack" aria-label="Submission period">
          <Panel title="Submission period" variant="tight">
            <KeyValue items={[
              { label: 'Opens', value: formatDate(campaign.timeline?.submissionsOpenAt) },
              { label: 'Closes', value: formatDate(campaign.timeline?.submissionsCloseAt) },
              { label: 'Winners', value: formatDate(campaign.timeline?.winnersAnnouncedAt) },
            ]} />
            {open ? (
              <ButtonLink to={`/studio/submissions/new?campaign=${campaign.id}`} variant="primary" block icon="send">Submit content</ButtonLink>
            ) : (
              <ButtonAnchor className="cr-whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer" variant="secondary" block icon="message" onClick={() => trackEvent('whatsapp_cta_clicked')}>Notify me on WhatsApp</ButtonAnchor>
            )}
          </Panel>
          <WhatsAppCard url={whatsappUrl} compact />
        </aside>
      </div>
    </div>
  );
}
