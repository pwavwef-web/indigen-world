import { useMemo, useState } from 'react';
import { Button, BrandMark, Icon, ProductCard, SectionHeading, type CardProps } from '../components';

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

function Home() {
  const [direction, setDirection] = useState<'english' | 'kasem'>('english');

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

  return (
    <>
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
              <Button href="/project-kasena" variant="secondary">
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
            <Button href="/project-kasena" variant="secondary">
              Explore Project Kasena
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
            <p className="demo-note">
              Demo language shown for interface illustration. Final public entries require qualified linguistic
              validation.
            </p>
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
            <Button href="/partners">See how to get involved</Button>
            <a className="contact-email" href="mailto:pwavwef@gmail.com">
              pwavwef@gmail.com
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

export default Home;
