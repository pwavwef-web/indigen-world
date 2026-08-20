import { useEffect, useState } from 'react';
import type { Campaign } from '@indigen-world/contracts/creator-models';
import { Link, useRoute, matchRoute } from '../../router';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';
import { fetchCampaign, submissionsOpen } from '../data';
import { CAMPAIGN_STATUS_LABELS, Skeleton, StatusPill, WhatsAppCard } from '../components';

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
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void fetchCampaign(id).then((c) => {
      setCampaign(c);
      setLoading(false);
      if (c) trackEvent('campaign_viewed', { campaign: c.slug });
    });
  }, [id]);

  if (loading) return <div className="page"><Skeleton lines={8} /></div>;
  if (!campaign) {
    return (
      <div className="page">
        <h1>Campaign not found</h1>
        <Link to="/studio/opportunities" className="button button--ghost-dark">Back to opportunities</Link>
      </div>
    );
  }

  const open = submissionsOpen(campaign);

  return (
    <div className="page">
      <p className="breadcrumb"><Link to="/studio/opportunities">Opportunities</Link> / {campaign.title}</p>
      <header className="page__head">
        <div>
          <h1>{campaign.title}</h1>
          <p className="muted">{campaign.initiative}{campaign.community ? ` · ${campaign.community}` : ''}</p>
        </div>
        <StatusPill status={campaign.status} labels={CAMPAIGN_STATUS_LABELS} />
      </header>

      {!open ? (
        <div className="callout callout--info">
          <strong>Submissions are not open yet.</strong> {campaign.status === 'WAITLIST_OPEN' ? 'Join the waitlist and we’ll notify you the moment entries open.' : 'Check back for updates.'}
        </div>
      ) : null}

      <div className="cols">
        <div>
          <section className="panel"><h2>Overview</h2><p>{campaign.description}</p></section>
          {campaign.brief ? <section className="panel"><h2>Content brief</h2><p>{campaign.brief}</p></section> : null}
          {campaign.eligibility ? <section className="panel"><h2>Eligibility</h2><p>{campaign.eligibility}</p></section> : null}
          {campaign.categories && campaign.categories.length > 0 ? (
            <section className="panel">
              <h2>Eligible categories</h2>
              <div className="chips">{campaign.categories.map((c) => <span key={c} className="chip chip--static">{c}</span>)}</div>
            </section>
          ) : null}
          {campaign.prizeTiers && campaign.prizeTiers.length > 0 ? (
            <section className="panel">
              <h2>Reward structure</h2>
              <ul className="mini-list">
                {campaign.prizeTiers.map((t) => (
                  <li key={t.label}><span>{t.label}</span><span className="muted">{t.amount ? `${t.currency ?? ''} ${t.amount}` : 'To be announced'}</span></li>
                ))}
              </ul>
              <p className="tiny">Registration and submission never guarantee payment.</p>
            </section>
          ) : null}
          {campaign.judgingRubric && campaign.judgingRubric.length > 0 ? (
            <section className="panel">
              <h2>Judging criteria</h2>
              <ul className="mini-list">{campaign.judgingRubric.map((r) => <li key={r.key}><span>{r.label}</span></li>)}</ul>
            </section>
          ) : null}
          <section className="panel">
            <h2>Rights and consent</h2>
            <p>You choose separately, per submission, whether approved content may be published, used for promotion, or used for AI research. AI-training permission is optional and never required to enter.</p>
          </section>
          {campaign.faqs && campaign.faqs.length > 0 ? (
            <section className="panel">
              <h2>FAQs</h2>
              <div className="faq">{campaign.faqs.map((f) => <details key={f.question} className="faq__item"><summary>{f.question}</summary><p>{f.answer}</p></details>)}</div>
            </section>
          ) : null}
        </div>

        <aside>
          <section className="panel">
            <h2>Submission period</h2>
            <ul className="mini-list">
              <li><span>Opens</span><span className="muted">{formatDate(campaign.timeline?.submissionsOpenAt)}</span></li>
              <li><span>Closes</span><span className="muted">{formatDate(campaign.timeline?.submissionsCloseAt)}</span></li>
              <li><span>Winners</span><span className="muted">{formatDate(campaign.timeline?.winnersAnnouncedAt)}</span></li>
            </ul>
            {open ? (
              <Link to={`/studio/submissions/new?campaign=${campaign.id}`} className="button button--primary button--block">Submit content</Link>
            ) : (
              <a className="button button--whatsapp button--block" href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('whatsapp_cta_clicked')}>Notify me on WhatsApp</a>
            )}
          </section>
          <WhatsAppCard url={whatsappUrl} compact />
        </aside>
      </div>
    </div>
  );
}
