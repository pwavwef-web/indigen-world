import { Button, Icon, SectionHeading } from '../components';

const stories = [
  {
    category: 'Language',
    tone: 'indigo' as const,
    title: 'Why a word like “nia” carries more than “water”.',
    excerpt: 'How everyday Kasem vocabulary encodes relationships, place and season—and why context must travel with every entry.',
  },
  {
    category: 'Community',
    tone: 'terracotta' as const,
    title: 'Elders and teenagers, building the record together.',
    excerpt: 'A look at how youth contribution campaigns pair with elder validation so speed never outruns cultural authority.',
  },
  {
    category: 'Craft',
    tone: 'gold' as const,
    title: 'Proverbs are data too—but not all data is public.',
    excerpt: 'Some expressions are open; others are restricted. How cultural-permission tiers shape what appears here.',
  },
  {
    category: 'Field notes',
    tone: 'indigo' as const,
    title: 'Designing for one bar of signal.',
    excerpt: 'What low-bandwidth, offline-first design looks like when your users share phones and ration mobile data.',
  },
];

function Stories() {
  return (
    <>
      <section className="section section--cream">
        <div className="container">
          <SectionHeading
            eyebrow="Stories"
            title="Culture, in the words of the people preserving it."
            body="Stories, field notes and reflections from the communities and contributors building Indigen World. Published only with consent and, where relevant, cultural-custodian review."
          />
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          <div className="product-grid">
            {stories.map((story) => (
              <article className={`product-card product-card--${story.tone}`} key={story.title} data-reveal>
                <div className="product-card__topline">
                  <span className="product-card__icon">
                    <Icon name="book" />
                  </span>
                  <span className="chip">Sample</span>
                </div>
                <p className="eyebrow">{story.category}</p>
                <h3>{story.title}</h3>
                <p>{story.excerpt}</p>
              </article>
            ))}
          </div>
          <p className="demo-note demo-note--light" data-reveal>
            Sample stories shown to illustrate the format. Published stories will credit contributors and respect
            consent and cultural-permission settings.
          </p>
        </div>
      </section>

      <section className="section section--sand">
        <div className="container split-intro">
          <SectionHeading eyebrow="Have a story?" title="Communities decide what is shared—and how." />
          <div className="split-intro__copy" data-reveal>
            <p>
              If you are part of a language community and want to share a story, teaching or reflection, we work
              with you on consent, attribution and any restrictions before anything is published.
            </p>
            <p className="page-cta">
              <Button href="/partners">Talk to us about contributing</Button>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

export default Stories;
