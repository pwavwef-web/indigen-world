import { useEffect, useState } from 'react';
import type { Campaign } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';
import { fetchPublicCampaigns } from '../data';
import { CAMPAIGN_STATUS_LABELS, Skeleton, WhatsAppCard } from '../components';

const HOW_IT_WORKS = [
  ['Register', 'Create your founding-creator account and join the waitlist.'],
  ['Complete your profile', 'Tell us about your languages, community and interests.'],
  ['Receive the announcement', 'We tell you the moment a campaign opens for entries.'],
  ['Submit through TribeStudio', 'Upload your content here when submissions open.'],
];

const BENEFITS = [
  ['Be first', 'Founding creators are recognised as the earliest voices of Project Kasena.'],
  ['Real audience', 'Approved content can be featured in the Indigen World mobile app.'],
  ['Support & resources', 'Guidelines, feedback and a community channel to help you grow.'],
  ['Fair recognition', 'Clear, separate permissions — your rights stay yours.'],
];

const RULES = [
  'Registration is free and does not guarantee selection, publication or payment.',
  'Content must be your own, or used with permission.',
  'Featuring other people requires their consent; minors require guardian permission.',
  'Content-use and AI-training permissions are requested separately, per submission — never bundled into registration.',
];

export function LandingPage() {
  const { config, whatsappUrl } = useConfig();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trackEvent('creator_landing_viewed');
    let active = true;
    void fetchPublicCampaigns().then((list) => {
      if (!active) return;
      setCampaign(list[0] ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const categories = config?.contentCategories ?? [];

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__inner">
          <p className="hero__eyebrow">Indigen World Founding Creators · Project Kasena</p>
          <h1>Help build the future of Kasem storytelling.</h1>
          <p className="hero__lede">
            Project Kasena is recruiting founding creators for upcoming Kasem-language campaigns. Join
            the waitlist now, prepare your profile, and be ready the moment entries open.
          </p>
          <div className="hero__actions">
            <Link to="/creators/join" className="button button--primary button--lg" onClick={() => trackEvent('signup_started', { source: 'hero' })}>
              Join the Founding Creators
            </Link>
            <a className="button button--ghost button--lg" href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('whatsapp_cta_clicked')}>
              Join our WhatsApp Channel
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>A programme for the first voices of Kasem</h2>
        <p className="section__lede">
          The Founding Creators Programme is how Indigen World finds, supports and celebrates the
          creators shaping Kasem-language content — storytellers, teachers, musicians and everyday
          voices from Kasena communities.
        </p>
      </section>

      <section className="section section--tint">
        <h2>What can you create?</h2>
        <div className="card-grid">
          {categories.length === 0 ? (
            <Skeleton lines={4} />
          ) : (
            categories.map((cat) => (
              <div key={cat.slug} className="cat-card">
                <strong>{cat.label}</strong>
                {cat.description ? <p>{cat.description}</p> : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section">
        <h2>How it works</h2>
        <ol className="steps">
          {HOW_IT_WORKS.map(([title, body], i) => (
            <li key={title} className="steps__item">
              <span className="steps__num">{i + 1}</span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section section--tint">
        <h2>Creator benefits</h2>
        <div className="card-grid">
          {BENEFITS.map(([title, body]) => (
            <div key={title} className="benefit-card">
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Eligibility and important rules</h2>
        <ul className="rules">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section className="section section--tint">
        <h2>Campaign status</h2>
        {loading ? (
          <Skeleton lines={2} />
        ) : campaign ? (
          <div className="status-card">
            <div>
              <h3>{campaign.title}</h3>
              <p>{campaign.description}</p>
            </div>
            <div className="status-card__side">
              <span className="pill pill--info">{CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}</span>
              {campaign.status === 'WAITLIST_OPEN' ? (
                <p className="muted">Submissions are not open yet — join the waitlist to be notified.</p>
              ) : campaign.status === 'SUBMISSIONS_OPEN' ? (
                <p className="muted">Submissions are open now.</p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="muted">No campaigns are announced yet. Join the waitlist to hear first.</p>
        )}
      </section>

      {config?.faqs && config.faqs.length > 0 ? (
        <section className="section">
          <h2>Frequently asked questions</h2>
          <div className="faq">
            {config.faqs.map((f) => (
              <details key={f.question} className="faq__item">
                <summary>{f.question}</summary>
                <p>{f.answer}</p>
              </details>
            ))}
          </div>
          <p className="section__more">
            <Link to="/creators/faq">See all FAQs →</Link>
          </p>
        </section>
      ) : null}

      <section className="section section--cta">
        <h2>Ready to join?</h2>
        <p>Registration is free and takes a few minutes. You can complete your profile any time.</p>
        <Link to="/creators/join" className="button button--primary button--lg" onClick={() => trackEvent('signup_started', { source: 'footer' })}>
          Join the Founding Creators
        </Link>
        <div className="landing__wa">
          <WhatsAppCard url={whatsappUrl} />
        </div>
      </section>
    </div>
  );
}
