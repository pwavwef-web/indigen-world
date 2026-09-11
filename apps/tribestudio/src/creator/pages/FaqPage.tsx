import { useMemo, useState } from 'react';
import { Link } from '../../router';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';

type FaqCategory = 'Getting started' | 'Submitting work' | 'Selection & rewards' | 'Rights & support';

type FaqEntry = {
  question: string;
  answer: string;
  category: FaqCategory;
};

const FALLBACK: FaqEntry[] = [
  { category: 'Getting started', question: 'Who may join?', answer: 'Anyone with a connection to Kasem language or culture. You do not need to be a professional creator.' },
  { category: 'Getting started', question: 'Must I already be a professional creator?', answer: 'No. Everyday voices are welcome and encouraged. If you have a story, skill or perspective to share, the programme is for you.' },
  { category: 'Getting started', question: 'Is joining free?', answer: 'Yes. Joining the Founding Creators Programme is free.' },
  { category: 'Getting started', question: 'Can I join from outside Ghana?', answer: 'Yes. Kassena people and Kasem speakers anywhere in the world may join, unless a specific campaign has a geographic limit.' },
  { category: 'Getting started', question: 'What do I need to register?', answer: 'A Google account, a creator name and a few details about your language, community and creative interests. You can finish your profile later.' },
  { category: 'Getting started', question: 'When will submissions open?', answer: 'Campaign dates are announced in your workspace and on the Indigen World Creators WhatsApp Channel. Joining the waitlist helps you hear first.' },
  { category: 'Submitting work', question: 'What kinds of content can I submit?', answer: 'Campaigns may invite Kasem-language stories, comedy, lessons, music, poetry, cultural knowledge and scenes from everyday life. Each campaign lists its accepted formats.' },
  { category: 'Submitting work', question: 'Can I submit content already posted on social media?', answer: 'Often, yes. You can link an existing public post when a campaign allows it. Always check that campaign’s rules before submitting.' },
  { category: 'Submitting work', question: 'Does my content have to be in Kasem?', answer: 'Content should be primarily in Kasem unless the campaign says otherwise. An English translation or short summary helps reviewers and wider audiences.' },
  { category: 'Submitting work', question: 'Can other people appear in my submission?', answer: 'Yes, with their permission. A parent or guardian must consent before a minor appears. You will confirm these permissions when you submit.' },
  { category: 'Submitting work', question: 'What happens after I submit?', answer: 'Your entry moves into review. You can follow its status in your workspace, and a reviewer may ask you to clarify something or make a revision.' },
  { category: 'Submitting work', question: 'Can I edit or withdraw my submission?', answer: 'You can edit a draft before sending it. After submission, follow the options shown in your workspace or contact support if you need to withdraw it.' },
  { category: 'Selection & rewards', question: 'How will creators be selected?', answer: 'Reviewers use the published criteria for each campaign, which may include language quality, creativity, cultural value, originality and technical quality.' },
  { category: 'Selection & rewards', question: 'Does every submission receive money?', answer: 'No. Registration and submission do not guarantee selection, publication or payment. Reward and payment details are stated clearly on each campaign.' },
  { category: 'Selection & rewards', question: 'How will I know the result?', answer: 'Your workspace will show the latest status. Important decisions and requests for changes may also be sent by email or another contact method you selected.' },
  { category: 'Selection & rewards', question: 'What happens if a revision is requested?', answer: 'The reviewer will explain what needs attention. Update the work in your workspace and resubmit it before the stated deadline.' },
  { category: 'Rights & support', question: 'Do I keep ownership of my work?', answer: 'Yes. You keep ownership of your original work. Any permission for Indigen World to publish or promote it is requested separately for that submission.' },
  { category: 'Rights & support', question: 'Is AI-training permission part of registration?', answer: 'No. AI-training permission is never bundled into registration or general publication permission. If it is relevant, you will be asked separately.' },
  { category: 'Rights & support', question: 'Can I request a correction or removal later?', answer: 'Yes. Contact creator support with your submission details and explain what you need corrected or removed.' },
  { category: 'Rights & support', question: 'How do I get help?', answer: 'Use Help in your TribeStudio workspace to search troubleshooting advice or contact creator support. Include your creator reference when possible.' },
];

const CATEGORIES: Array<'All questions' | FaqCategory> = [
  'All questions',
  'Getting started',
  'Submitting work',
  'Selection & rewards',
  'Rights & support',
];

function categoryFor(question: string): FaqCategory {
  const value = question.toLowerCase();
  if (/pay|money|reward|winner|select|result|revision/.test(value)) return 'Selection & rewards';
  if (/right|own|permission|publish|remove|support|help|announcement|ai/.test(value)) return 'Rights & support';
  if (/submit|content|format|language|minor|social|withdraw|after i/.test(value)) return 'Submitting work';
  return 'Getting started';
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function FaqPage() {
  const { config, whatsappUrl } = useConfig();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All questions');

  const faqs = useMemo<FaqEntry[]>(() => {
    if (!config?.faqs?.length) return FALLBACK;

    const configured = new Map(config.faqs.map((faq) => [faq.question.trim().toLowerCase(), faq]));
    const merged = FALLBACK.map((faq) => {
      const override = configured.get(faq.question.trim().toLowerCase());
      if (!override) return faq;
      configured.delete(faq.question.trim().toLowerCase());
      return { ...faq, question: override.question, answer: override.answer };
    });

    for (const faq of configured.values()) {
      merged.push({ question: faq.question, answer: faq.answer, category: categoryFor(faq.question) });
    }

    return merged;
  }, [config?.faqs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return faqs.filter((faq) => {
      const inCategory = category === 'All questions' || faq.category === category;
      const matchesQuery = !needle || `${faq.question} ${faq.answer}`.toLowerCase().includes(needle);
      return inCategory && matchesQuery;
    });
  }, [category, faqs, query]);

  const categoryCounts = useMemo(() => new Map(CATEGORIES.map((name) => [
    name,
    name === 'All questions' ? faqs.length : faqs.filter((faq) => faq.category === name).length,
  ])), [faqs]);

  const selectCategory = (next: (typeof CATEGORIES)[number]) => {
    setCategory(next);
  };

  return (
    <div className="faq-page">
      <section className="faq-hero" aria-labelledby="faq-title">
        <div className="faq-hero__copy">
          <p className="hero__eyebrow">Founding Creators · Help centre</p>
          <h1 id="faq-title">Answers for your creator journey.</h1>
          <p>From joining the programme to submitting work and understanding your rights—find the clear answer here.</p>
          <label className="faq-search">
            <span className="sr-only">Search creator questions</span>
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search payments, permissions, submissions…"
            />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search">Clear</button> : null}
          </label>
        </div>
        <div className="faq-hero__note">
          <span className="faq-hero__note-label">Good to know</span>
          <strong>Joining is free.</strong>
          <p>You do not need to be a professional creator, and you keep ownership of your original work.</p>
          <Link to="/creators/join" onClick={() => trackEvent('signup_started', { source: 'faq' })}>Join the programme <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="faq-facts" aria-label="Programme at a glance">
        <article><span aria-hidden="true">01</span><div><strong>Free to join</strong><p>No application fee or professional experience required.</p></div></article>
        <article><span aria-hidden="true">02</span><div><strong>Your work stays yours</strong><p>Publication permissions are clear and separate.</p></div></article>
        <article><span aria-hidden="true">03</span><div><strong>Support along the way</strong><p>Track decisions and revision requests in one workspace.</p></div></article>
      </section>

      <section className="faq-library" aria-labelledby="question-library-title">
        <div className="faq-library__heading">
          <div>
            <p className="hero__eyebrow">Question library</p>
            <h2 id="question-library-title">Everything you need to know</h2>
          </div>
          <p>{filtered.length} {filtered.length === 1 ? 'answer' : 'answers'}</p>
        </div>

        <div className="faq-categories" aria-label="Filter questions by topic">
          {CATEGORIES.map((name) => (
            <button
              key={name}
              type="button"
              className={category === name ? 'is-active' : undefined}
              aria-pressed={category === name}
              onClick={() => selectCategory(name)}
            >
              {name}<span>{categoryCounts.get(name)}</span>
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <div className="faq faq--library">
            {filtered.map((faq, index) => (
              <details key={faq.question} className="faq__item">
                <summary>
                  <span className="faq__number">{String(index + 1).padStart(2, '0')}</span>
                  <span>{faq.question}</span>
                  <span className="faq__toggle" aria-hidden="true" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        ) : (
          <div className="faq-empty">
            <strong>No matching answers yet.</strong>
            <p>Try a shorter search, browse all topics, or send your question to creator support.</p>
            <button type="button" className="button button--ghost-dark" onClick={() => { setQuery(''); setCategory('All questions'); }}>Show all questions</button>
          </div>
        )}
      </section>

      <section className="faq-next" aria-label="More creator support">
        <div className="faq-next__support">
          <p className="hero__eyebrow">Still unsure?</p>
          <h2>Ask a real person.</h2>
          <p>Creator support can help with your account, a submission, permissions or a decision shown in your workspace.</p>
          <Link to="/studio/help" className="button button--primary">Contact creator support</Link>
        </div>
        <div className="faq-next__whatsapp">
          <span className="faq-next__wa-mark" aria-hidden="true">WA</span>
          <div>
            <h2>Never miss an opening.</h2>
            <p>Get campaign dates, creator resources, deadlines and winner announcements on WhatsApp.</p>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('whatsapp_cta_clicked')}>Open WhatsApp Channel <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </section>

      <p className="faq-page__fineprint">Registration and submission do not guarantee selection, publication or payment. Campaign-specific terms always apply.</p>
    </div>
  );
}
