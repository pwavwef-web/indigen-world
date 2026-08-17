import { Fragment } from 'react';
import { Button, Icon, SectionHeading } from '../components';

const cells = [
  {
    icon: 'book' as const,
    title: 'Dictionary & data engine',
    body: 'Validated words, phrases, dialect metadata and contributor workflows form the first structured Kasem dataset.',
  },
  {
    icon: 'community' as const,
    title: 'Community validation',
    body: 'Elders, teachers and cultural custodians review, approve or return submissions—authority stays with the community.',
  },
  {
    icon: 'layers' as const,
    title: 'Reusable by design',
    body: 'Everything Kasem proves—contracts, validation, consent, dialects—becomes the template for the next language cell.',
  },
];

const roadmap = [
  ['Phase 1', 'Dictionary & data engine', 'Validated words, phrases, dialect metadata and contributor workflows.'],
  ['Phase 2', 'Text intelligence', 'Domain corpora, conversational data and controlled language services.'],
  ['Phase 3', 'Voice & multimodal', 'Consent-based audio, speech recognition and text-to-speech research.'],
];

const contribute = [
  'Contribute words, phrases and example sentences in TribeStudio',
  'Serve as an elder, teacher or linguist validator',
  'Share dialect knowledge and cultural context',
  'Help run a youth data-collection campaign',
];

function ProjectKasena() {
  return (
    <>
      <section className="section section--indigo">
        <div className="container">
          <SectionHeading
            eyebrow="Flagship programme"
            title="Project Kasena: one language, done deeply."
            body="Project Kasena is Indigen World’s first language cell. It begins with Kasem, spoken across the Upper East Region of Ghana, and builds the operational model for community-validated language preservation."
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
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          <SectionHeading
            eyebrow="The language-cell model"
            title="A repeatable unit for cultural preservation."
            body="A language cell bundles the data, workflows and governance one language community needs. Kasem proves the model before any second language is added."
          />
          <div className="product-grid">
            {cells.map((cell) => (
              <article className="product-card product-card--indigo" key={cell.title} data-reveal>
                <div className="product-card__topline">
                  <span className="product-card__icon">
                    <Icon name={cell.icon} />
                  </span>
                </div>
                <h3>{cell.title}</h3>
                <p>{cell.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--cream">
        <div className="container">
          <SectionHeading eyebrow="Roadmap" title="From dictionary to voice—in deliberate phases." />
          <div className="roadmap" data-reveal>
            {roadmap.map(([phase, title, body], index) => (
              <Fragment key={phase}>
                <div className="roadmap__item">
                  <span>{phase}</span>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
                {index < roadmap.length - 1 ? <div className="roadmap__line" aria-hidden="true" /> : null}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--white">
        <div className="container split-intro">
          <SectionHeading eyebrow="Get involved" title="Kasem is built by the people who speak it." />
          <div className="split-intro__copy" data-reveal>
            <ul className="check-list">
              {contribute.map((item) => (
                <li key={item}>
                  <Icon name="check" size={18} /> {item}
                </li>
              ))}
            </ul>
            <p className="page-cta">
              <Button href="/partners">Support or join the pilot</Button>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

export default ProjectKasena;
