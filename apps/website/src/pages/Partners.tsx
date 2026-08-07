import { Button, Icon, SectionHeading } from '../components';

const tiers = [
  {
    icon: 'spark' as const,
    tone: 'indigo' as const,
    title: 'Funders',
    body: 'Back a preservation model designed for provenance and accountability, starting with a focused Kasem pilot.',
  },
  {
    icon: 'book' as const,
    tone: 'terracotta' as const,
    title: 'Institutions & schools',
    body: 'Partner on curriculum, youth contribution campaigns and research access under clear cultural-permission terms.',
  },
  {
    icon: 'layers' as const,
    tone: 'gold' as const,
    title: 'Technology partners',
    body: 'Collaborate on low-bandwidth delivery, data infrastructure and provider-independent AI—kept behind controlled services.',
  },
  {
    icon: 'community' as const,
    tone: 'indigo' as const,
    title: 'Community organisations',
    body: 'Bring a language community into the model as custodians, contributors and validators—on your community’s terms.',
  },
];

function Partners() {
  return (
    <>
      <section className="section section--indigo">
        <div className="container">
          <SectionHeading
            eyebrow="Partners & support"
            title="Help build a future where culture is digitally present—and still belongs to its people."
            body="We welcome conversations with communities, schools, researchers, cultural organisations, technology partners and responsible funders preparing the first Kasem pilot."
            light
          />
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          <SectionHeading eyebrow="Ways to get involved" title="Different partners, one shared standard." />
          <div className="product-grid">
            {tiers.map((tier) => (
              <article className={`product-card product-card--${tier.tone}`} key={tier.title} data-reveal>
                <div className="product-card__topline">
                  <span className="product-card__icon">
                    <Icon name={tier.icon} />
                  </span>
                </div>
                <h3>{tier.title}</h3>
                <p>{tier.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-section">
        <div className="contact-section__pattern" aria-hidden="true" />
        <div className="container contact-card" data-reveal>
          <div>
            <p className="eyebrow">Start a conversation</p>
            <h2>Tell us how you would like to be part of the Kasem pilot.</h2>
            <p>
              Whether you represent a community, a school, a funder or a technology partner, we will work with
              you on consent, attribution and any cultural-permission requirements from the very first
              conversation.
            </p>
          </div>
          <div className="contact-card__actions">
            <Button href="mailto:pwavwef@gmail.com">Email the team</Button>
            <a className="contact-email" href="mailto:pwavwef@gmail.com">
              pwavwef@gmail.com
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

export default Partners;
