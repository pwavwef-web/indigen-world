import { Button, SectionHeading } from '../components';

const targets = [
  ['20,000+', 'validated Kasem words, phrases and sentence pairs targeted'],
  ['200–500', 'active youth contributors targeted for the first large data campaign'],
  ['3–4', 'elder and teacher validators for the initial quality network'],
  ['1 model', 'a reusable language-cell framework proven deeply before expansion'],
];

const updates = [
  ['Foundations', 'Shared data contracts, Firebase security model and the TribeStudio contribution-and-validation workflow are in place.'],
  ['Kasem pilot prep', 'Preparing the first Kasem dictionary entries and the elder/teacher validation network.'],
  ['Next', 'Youth contribution campaign design and the first measurable dataset milestones.'],
];

function Impact() {
  return (
    <>
      <section className="section section--white">
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
          {targets.map(([value, label]) => (
            <article key={label} data-reveal>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--cream">
        <div className="container">
          <SectionHeading
            eyebrow="Project updates"
            title="Where things stand."
            body="An honest, in-progress view. We distinguish what is built, what is being prepared and what comes next."
          />
          <ol className="updates-list" data-reveal>
            {updates.map(([stage, body]) => (
              <li key={stage}>
                <span className="updates-list__stage">{stage}</span>
                <p>{body}</p>
              </li>
            ))}
          </ol>
          <p className="demo-note demo-note--light">
            Status summary for illustration; detailed, dated updates will be published as the pilot progresses.
          </p>
        </div>
      </section>

      <section className="section section--indigo">
        <div className="container split-intro">
          <SectionHeading
            eyebrow="Accountability"
            title="Preservation you can measure."
            body="We would rather report a small, real dataset with genuine community validation than inflated numbers with no provenance."
            light
          />
          <div className="split-intro__copy" data-reveal>
            <p className="page-cta">
              <Button href="/partners" variant="secondary">
                Support the pilot
              </Button>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

export default Impact;
