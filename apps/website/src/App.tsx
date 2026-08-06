import { useEffect, useMemo, useState, type ReactNode } from 'react';

type IconName =
  | 'arrow'
  | 'book'
  | 'check'
  | 'community'
  | 'globe'
  | 'layers'
  | 'menu'
  | 'mobile'
  | 'shield'
  | 'spark'
  | 'studio'
  | 'x';

type CardProps = {
  eyebrow: string;
  title: string;
  body: string;
  icon: IconName;
  tone?: 'indigo' | 'terracotta' | 'gold';
  tag?: string;
};

const navigation = [
  ['Vision', '#vision'],
  ['Ecosystem', '#ecosystem'],
  ['Project Kasena', '#kasena'],
  ['Governance', '#governance'],
  ['Impact', '#impact'],
] as const;

const products: CardProps[] = [
  {
    eyebrow: 'Public website',
    title: 'Stories, programmes and proof of impact.',
    body: 'The public home for communities, cultural stories, programmes, project updates, partnerships and support.',
    icon: 'globe',
    tone: 'indigo',
    tag: 'You are here',
  },
  {
    eyebrow: 'TribeStudio',
    title: 'A serious workspace for cultural creation.',
    body: 'Creators, contributors, validators and cultural custodians manage content, campaigns, reviews and rewards in one place.',
    icon: 'studio',
    tone: 'terracotta',
    tag: 'Creator workspace',
  },
  {
    eyebrow: 'Indigen World Mobile',
    title: 'Culture you can carry every day.',
    body: 'A mobile experience for learning, discovering, saving, contributing and joining language-preservation challenges.',
    icon: 'mobile',
    tone: 'gold',
    tag: 'Flutter app',
  },
];

const principles = [
  {
    number: '01',
    title: 'Community before platform',
    body: 'Elders, teachers, creators and language custodians are decision-makers—not anonymous data suppliers.',
  },
  {
    number: '02',
    title: 'Consent travels with content',
    body: 'Source, contributor, dialect, validation, consent, licence and cultural-permission metadata stay attached to relevant records.',
  },
  {
    number: '03',
    title: 'Useful under real conditions',
    body: 'Low-bandwidth, mobile-first and offline-friendly experiences are built for the communities they intend to serve.',
  },
  {
    number: '04',
    title: 'One language deeply, then scale',
    body: 'Project Kasena proves the language-cell model with Kasem before expansion into additional language communities.',
  },
];

const team = [
  ['Francis Pwavwe', 'Project management & ecosystem consistency'],
  ['Francis Onai', 'Indigen World public website'],
  ['Chinedum Okwonko Udeaja', 'TribeStudio'],
  ['Andy Anim', 'Indigen World mobile app'],
] as const;

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const shared = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'arrow':
      return (
        <svg {...shared}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
    case 'book':
      return (
        <svg {...shared}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
          <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
        </svg>
      );
    case 'check':
      return (
        <svg {...shared}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case 'community':
      return (
        <svg {...shared}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18" />
          <path d="M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...shared}>
          <path d="m12 2 9 5-9 5-9-5z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 17 9 5 9-5" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...shared}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'mobile':
      return (
        <svg {...shared}>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M10 18h4" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...shared}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...shared}>
          <path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5z" />
          <path d="m19 15-.75 2.25L16 18l2.25.75L19 21l.75-2.25L22 18l-2.25-.75z" />
          <path d="m5 14-.75 2.25L2 17l2.25.75L5 20l.75-2.25L8 17l-2.25-.75z" />
        </svg>
      );
    case 'studio':
      return (
        <svg {...shared}>
          <path d="M4 19h16" />
          <path d="M6 17V8l6-4 6 4v9" />
          <path d="M9 17v-5h6v5" />
          <path d="M8 9h.01M16 9h.01" />
        </svg>
      );
    case 'x':
      return (
        <svg {...shared}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
  }
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path className="brand-mark__frame" d="M15 47V23l17-9 17 9v24" />
        <path className="brand-mark__line" d="M24 44V29m8 15V24m8 20V29" />
        <circle className="brand-mark__sun" cx="32" cy="14" r="4" />
      </svg>
    </span>
  );
}

function Button({
  href,
  children,
  variant = 'primary',
  external = false,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'text';
  external?: boolean;
}) {
  return (
    <a
      className={`button button--${variant}`}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      <span>{children}</span>
      <Icon name="arrow" size={18} />
    </a>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  light = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  light?: boolean;
}) {
  return (
    <div className={`section-heading${light ? ' section-heading--light' : ''}`} data-reveal>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p className="section-heading__body">{body}</p> : null}
    </div>
  );
}

function ProductCard({ eyebrow, title, body, icon, tone = 'indigo', tag }: CardProps) {
  return (
    <article className={`product-card product-card--${tone}`} data-reveal>
      <div className="product-card__topline">
        <span className="product-card__icon">
          <Icon name={icon} />
        </span>
        {tag ? <span className="chip">{tag}</span> : null}
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{body}</p>
      <a href="#contact" className="card-link">
        Explore the role <Icon name="arrow" size={17} />
      </a>
    </article>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [direction, setDirection] = useState<'english' | 'kasem'>('english');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const translation = useMemo(
    () =>
      direction === 'english'
        ? {
            sourceLabel: 'English',
            targetLabel: 'Kasem',
            source: 'Water',
            target: 'Nia',
            sentence: 'Nia pe yogo.',
            sentenceTranslation: 'The water is cold.',
          }
        : {
            sourceLabel: 'Kasem',
            targetLabel: 'English',
            source: 'Nia',
            target: 'Water',
            sentence: 'The water is cold.',
            sentenceTranslation: 'Nia pe yogo.',
          },
    [direction],
  );

  const currentYear = new Date().getFullYear();

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <a className="brand" href="#top" aria-label="Indigen World home">
            <BrandMark />
            <span className="brand__text">
              <strong>Indigen World</strong>
              <small>Culture belongs in the future</small>
            </span>
          </a>

          <nav className="desktop-nav" aria-label="Primary navigation">
            {navigation.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>

          <div className="site-header__actions">
            <a className="header-cta" href="#contact">
              Partner with us
            </a>
            <button
              className="menu-button"
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} />
            </button>
          </div>
        </div>

        <div id="mobile-navigation" className={`mobile-nav${menuOpen ? ' mobile-nav--open' : ''}`}>
          <nav className="container" aria-label="Mobile navigation">
            {navigation.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
                <Icon name="arrow" size={18} />
              </a>
            ))}
            <a href="#contact" onClick={() => setMenuOpen(false)}>
              Partner with us
              <Icon name="arrow" size={18} />
            </a>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="hero" id="top">
          <div className="hero__pattern" aria-hidden="true" />
          <div className="container hero__grid">
            <div className="hero__content" data-reveal>
              <span className="status-pill">
                <span className="status-pill__dot" />
                Building from Northern Ghana, designed to scale
              </span>
              <p className="hero__kicker">A community-governed cultural technology ecosystem</p>
              <h1>
                Culture belongs
                <span> in the future.</span>
              </h1>
              <p className="hero__lead">
                Indigen World builds digital spaces where indigenous languages, stories, creators and
                communities can survive the internet—and shape what comes next.
              </p>
              <div className="hero__actions">
                <Button href="#ecosystem">Explore the ecosystem</Button>
                <Button href="#kasena" variant="secondary">
                  Meet Project Kasena
                </Button>
              </div>
              <div className="hero__trust-row">
                <span>
                  <Icon name="shield" size={18} /> Community validation
                </span>
                <span>
                  <Icon name="mobile" size={18} /> Low-bandwidth first
                </span>
                <span>
                  <Icon name="layers" size={18} /> Reusable language cells
                </span>
              </div>
            </div>

            <div className="hero-visual" data-reveal>
              <div className="hero-orbit hero-orbit--one" aria-hidden="true" />
              <div className="hero-orbit hero-orbit--two" aria-hidden="true" />
              <div className="hero-visual__core">
                <BrandMark compact />
                <p>INDIGEN WORLD</p>
                <span>Language • Story • Identity</span>
              </div>
              <div className="floating-card floating-card--language">
                <span className="floating-card__icon">
                  <Icon name="book" size={19} />
                </span>
                <div>
                  <small>Language cell 01</small>
                  <strong>Project Kasena</strong>
                </div>
              </div>
              <div className="floating-card floating-card--creator">
                <span className="floating-card__icon">
                  <Icon name="studio" size={19} />
                </span>
                <div>
                  <small>Creator workspace</small>
                  <strong>TribeStudio</strong>
                </div>
              </div>
              <div className="floating-card floating-card--community">
                <span className="floating-card__icon">
                  <Icon name="community" size={19} />
                </span>
                <div>
                  <small>Guided by</small>
                  <strong>Community custodians</strong>
                </div>
              </div>
              <span className="language-chip language-chip--one">Kasem</span>
              <span className="language-chip language-chip--two">Stories</span>
              <span className="language-chip language-chip--three">Voice</span>
            </div>
          </div>
        </section>

        <section className="belief-strip" aria-label="Indigen World principles">
          <div className="container belief-strip__inner">
            <p>Not a digital museum.</p>
            <span aria-hidden="true">✦</span>
            <p>A living cultural infrastructure.</p>
            <span aria-hidden="true">✦</span>
            <p>Built with communities, not around them.</p>
          </div>
        </section>

        <section className="section section--cream" id="vision">
          <div className="container split-intro">
            <SectionHeading
              eyebrow="Why Indigen World"
              title="The internet is growing. Too many cultures are being left behind."
            />
            <div className="split-intro__copy" data-reveal>
              <p>
                Language loss is no longer only an archival problem. It is a product problem, an education
                problem and an AI problem. When a language has no structured digital presence, its speakers
                become invisible to the systems increasingly shaping daily life.
              </p>
              <p>
                We are building the infrastructure and experiences that let communities preserve knowledge,
                teach younger generations and decide how their culture is represented online.
              </p>
            </div>
          </div>

          <div className="container vision-grid">
            <article className="vision-card vision-card--dark" data-reveal>
              <span className="vision-card__number">01</span>
              <div>
                <p className="eyebrow">The risk</p>
                <h3>Digital erasure moves quietly.</h3>
                <p>
                  Languages without datasets, interfaces and discoverable content are excluded from search,
                  education tools and emerging AI systems.
                </p>
              </div>
            </article>
            <article className="vision-card vision-card--image" data-reveal>
              <div className="woven-pattern" aria-hidden="true" />
              <div className="vision-card__overlay">
                <p className="eyebrow">The opportunity</p>
                <h3>Preservation can create participation.</h3>
                <p>Young people, elders, teachers and creators can build the digital record together.</p>
              </div>
            </article>
            <article className="vision-card vision-card--light" data-reveal>
              <span className="vision-card__number">03</span>
              <div>
                <p className="eyebrow">The standard</p>
                <h3>Technology should respect cultural authority.</h3>
                <p>
                  Validation, attribution, consent and restrictions are part of the product architecture—not
                  paperwork added at the end.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="section section--white" id="ecosystem">
          <div className="container">
            <SectionHeading
              eyebrow="One ecosystem, three user-facing products"
              title="Different doors. One cultural future."
              body="Each product has a clear job. Together, they connect public discovery, cultural creation and everyday learning without collapsing governance boundaries."
            />
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.eyebrow} {...product} />
              ))}
            </div>

            <div className="infrastructure-band" data-reveal>
              <div className="infrastructure-band__icon">
                <Icon name="layers" size={28} />
              </div>
              <div>
                <p className="eyebrow">Shared foundation</p>
                <h3>Firebase, data standards and provider-independent AI infrastructure.</h3>
              </div>
              <p>
                Authentication, Firestore, Cloud Storage, Functions, Hosting, App Check and Remote Config form
                the shared technical layer. AI services stay controlled behind backend interfaces.
              </p>
            </div>
          </div>
        </section>

        <section className="section section--indigo" id="kasena">
          <div className="container kasena-grid">
            <div className="kasena-copy">
              <SectionHeading
                eyebrow="Flagship programme"
                title="Project Kasena starts with one language—deeply."
                body="Project Kasena is Indigen World’s first language cell and the operational model for community-validated language preservation. It begins with Kasem and builds the foundations for future text and voice technology."
                light
              />
              <div className="kasena-points" data-reveal>
                <span>
                  <Icon name="check" size={18} /> English ↔ Kasem dictionary and translation utility
                </span>
                <span>
                  <Icon name="check" size={18} /> Youth contribution and expert validation workflow
                </span>
                <span>
                  <Icon name="check" size={18} /> Dialect-aware records and cultural permissions
                </span>
                <span>
                  <Icon name="check" size={18} /> Future text AI and voice-data readiness
                </span>
              </div>
              <Button href="#contact" variant="secondary">
                Support the Kasem pilot
              </Button>
            </div>

            <div className="translation-demo" data-reveal>
              <div className="translation-demo__header">
                <div>
                  <p className="eyebrow">Kasem module preview</p>
                  <strong>Dictionary & translator</strong>
                </div>
                <span className="preview-badge">Illustrative</span>
              </div>
              <div className="translation-toggle" role="group" aria-label="Translation direction">
                <button
                  type="button"
                  className={direction === 'english' ? 'is-active' : ''}
                  onClick={() => setDirection('english')}
                  aria-pressed={direction === 'english'}
                >
                  English → Kasem
                </button>
                <button
                  type="button"
                  className={direction === 'kasem' ? 'is-active' : ''}
                  onClick={() => setDirection('kasem')}
                  aria-pressed={direction === 'kasem'}
                >
                  Kasem → English
                </button>
              </div>
              <div className="translation-panel">
                <div className="translation-field">
                  <span>{translation.sourceLabel}</span>
                  <strong>{translation.source}</strong>
                </div>
                <div className="translation-divider">
                  <span>translates to</span>
                </div>
                <div className="translation-field translation-field--result">
                  <span>{translation.targetLabel}</span>
                  <strong>{translation.target}</strong>
                  <small>Dialect metadata appears with validated entries.</small>
                </div>
              </div>
              <div className="example-sentence">
                <span>Example sentence</span>
                <strong>{translation.sentence}</strong>
                <p>{translation.sentenceTranslation}</p>
              </div>
              <div className="contribution-prompt">
                <div>
                  <span className="contribution-prompt__icon">
                    <Icon name="spark" size={18} />
                  </span>
                  <p>
                    <strong>Know a better way to say this?</strong>
                    <br />Contributors can suggest an edit for validator review.
                  </p>
                </div>
                <span className="mini-button">Suggest an edit</span>
              </div>
              <p className="demo-note">
                Demo language shown for interface illustration. Final public entries require qualified linguistic
                validation.
              </p>
            </div>
          </div>

          <div className="container roadmap" data-reveal>
            <div className="roadmap__item">
              <span>Phase 1</span>
              <strong>Dictionary & data engine</strong>
              <p>Validated words, phrases, dialect metadata and contributor workflows.</p>
            </div>
            <div className="roadmap__line" aria-hidden="true" />
            <div className="roadmap__item">
              <span>Phase 2</span>
              <strong>Text intelligence</strong>
              <p>Domain corpora, conversational data and controlled language services.</p>
            </div>
            <div className="roadmap__line" aria-hidden="true" />
            <div className="roadmap__item">
              <span>Phase 3</span>
              <strong>Voice & multimodal</strong>
              <p>Consent-based audio, speech recognition and text-to-speech research.</p>
            </div>
          </div>
        </section>

        <section className="section section--sand" id="governance">
          <div className="container governance-grid">
            <div className="governance-sticky">
              <SectionHeading
                eyebrow="Cultural governance"
                title="Data with dignity. Technology with boundaries."
                body="A cultural platform is only credible when communities retain meaningful authority over what is collected, published, adapted and used for model training."
              />
              <div className="governance-seal" data-reveal>
                <Icon name="shield" size={34} />
                <div>
                  <strong>Community-governed by design</strong>
                  <span>Consent • attribution • validation • restrictions</span>
                </div>
              </div>
            </div>
            <div className="principle-list">
              {principles.map((principle) => (
                <article className="principle" key={principle.number} data-reveal>
                  <span>{principle.number}</span>
                  <div>
                    <h3>{principle.title}</h3>
                    <p>{principle.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--white" id="impact">
          <div className="container impact-header">
            <SectionHeading
              eyebrow="MVP ambition"
              title="Build measurable value before chasing spectacle."
              body="Our first milestones focus on a working product, trusted validation and a useful language dataset—not vanity features."
            />
            <p className="target-label" data-reveal>
              Targets below describe the Project Kasena MVP ambition, not completed results.
            </p>
          </div>
          <div className="container impact-grid">
            <article data-reveal>
              <strong>20,000+</strong>
              <span>validated Kasem words, phrases and sentence pairs targeted</span>
            </article>
            <article data-reveal>
              <strong>200–500</strong>
              <span>active youth contributors targeted for the first large data campaign</span>
            </article>
            <article data-reveal>
              <strong>3–4</strong>
              <span>elder and teacher validators for the initial quality network</span>
            </article>
            <article data-reveal>
              <strong>1 model</strong>
              <span>a reusable language-cell framework proven deeply before expansion</span>
            </article>
          </div>

          <div className="container team-section">
            <div className="team-section__intro" data-reveal>
              <p className="eyebrow">Core team</p>
              <h3>Clear ownership across the ecosystem.</h3>
              <p>
                Product leads work inside shared standards so the website, TribeStudio, mobile app and backend
                do not become four unrelated products wearing the same logo.
              </p>
            </div>
            <div className="team-list">
              {team.map(([name, role], index) => (
                <article key={name} data-reveal>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{name}</strong>
                    <p>{role}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div className="contact-section__pattern" aria-hidden="true" />
          <div className="container contact-card" data-reveal>
            <div>
              <p className="eyebrow">Partners, educators, funders & cultural custodians</p>
              <h2>Help build a future where culture is digitally present—and still belongs to its people.</h2>
              <p>
                We are preparing the first Kasem pilot and welcome conversations with communities, schools,
                researchers, cultural organisations, technology partners and responsible funders.
              </p>
            </div>
            <div className="contact-card__actions">
              <Button href="mailto:pwavwef@gmail.com">Start a conversation</Button>
              <a className="contact-email" href="mailto:pwavwef@gmail.com">
                pwavwef@gmail.com
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container site-footer__top">
          <div className="footer-brand">
            <a className="brand brand--footer" href="#top" aria-label="Back to top">
              <BrandMark />
              <span className="brand__text">
                <strong>Indigen World</strong>
                <small>Culture belongs in the future</small>
              </span>
            </a>
            <p>
              A cultural technology ecosystem for language preservation, cultural learning, storytelling and
              creator enablement.
            </p>
          </div>
          <div className="footer-links">
            <div>
              <strong>Explore</strong>
              {navigation.slice(0, 3).map(([label, href]) => (
                <a key={href} href={href}>
                  {label}
                </a>
              ))}
            </div>
            <div>
              <strong>Principles</strong>
              <a href="#governance">Data governance</a>
              <a href="#impact">MVP targets</a>
              <a href="#contact">Partnerships</a>
            </div>
            <div>
              <strong>Programme</strong>
              <a href="#kasena">Project Kasena</a>
              <span>Kasem language cell</span>
              <span>Northern Ghana</span>
            </div>
          </div>
        </div>
        <div className="container site-footer__bottom">
          <p>© {currentYear} Indigen World. Cultural materials may carry distinct permissions.</p>
          <p>Project Kasena is an Indigen World programme.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
