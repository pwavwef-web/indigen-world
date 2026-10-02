import { PageMotion } from "../components/PageMotion";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { ROUTES_BY_PATH } from "../content/navigation";
import { IMPACT_TARGETS } from "../content/kasena";
import { Button } from "../components/Button";
import { SectionHeading } from "../components/SectionHeading";
import { LatestUpdates } from "../components/LatestUpdates";
import { AudiencePaths } from "../components/AudiencePaths";

const route = ROUTES_BY_PATH.home;

export function HomePage() {
  useDocumentMeta(route.title, route.description);
  return <>
    <section className="hero" id="top">
      <div className="hero__pattern" aria-hidden="true" />
      <div className="container hero__grid">
        <div className="hero__content" data-reveal>
          <span className="status-pill"><span className="status-pill__dot" /> Starting with Kasem, in Northern Ghana</span>
          <p className="hero__kicker">Language, stories and the people behind them</p>
          <h1>Culture belongs<span> in the future.</span></h1>
          <p className="hero__lead">Two things you can do today: look up Kasem words in the public dictionary, or share an everyday Kasem expression for a Kasem-speaking reviewer to check.</p>
          <div className="hero__actions">
            <Button to="dictionary">Look up a Kasem word</Button>
            <Button to="contribute" variant="secondary">Share a Kasem expression</Button>
          </div>
          <p className="tiny">No account needed to browse. Contributing uses a free Google sign-in, so you can follow the review.</p>
        </div>
        <div className="hero-visual"><PageMotion placement="art" /></div>
      </div>
    </section>
    <section className="section section--white" id="find-your-path">
      <div className="container">
        <SectionHeading eyebrow="Start here" title="Learn Kasem, or help keep it spoken." body="Two paths, both open today. Each says what it needs from you before you start." />
        <AudiencePaths />
      </div>
    </section>
    <section className="section section--cream" id="progress">
      <div className="container">
        <SectionHeading eyebrow="Where things stand" title="What is live, what is open, what is coming." body="An honest status for each part of Indigen World, so you know what to expect before you click." />
        <div className="journey-grid">
          <article className="journey-card">
            <span className="target-badge">Live</span><h3>The public Kasem dictionary</h3>
            <p>Search published entries, read their meaning and context, and listen where a recording is available.</p>
            <Button to="dictionary" variant="secondary">Open the dictionary</Button>
          </article>
          <article className="journey-card">
            <span className="target-badge">Open now</span><h3>Everyday expressions campaign</h3>
            <p>Share an expression with its meaning, context and source. Every one is reviewed; approved ones are published as expressions.</p>
            <Button to="contribute" variant="secondary">See the task and review process</Button>
          </article>
          <article className="journey-card">
            <span className="target-badge">In development</span><h3>Learning on your phone</h3>
            <p>The mobile app is still in development. Join the waitlist to hear when access is available.</p>
            <Button to="get-involved?route=mobile-app-waitlist" variant="secondary">Join the app waitlist</Button>
          </article>
        </div>
        <p className="target-label">These describe what is available, not measured community impact.</p>

        <details className="home-targets">
          <summary>See the goals we are working toward</summary>
          <p>Figures below are Project Kassena targets, not completed results.</p>
          <div className="impact-grid">{IMPACT_TARGETS.map((target) => <article key={target.label}><span className="target-badge">Target</span><strong>{target.figure}</strong><span>{target.label}</span></article>)}</div>
          <Button to="impact-governance" variant="secondary">How we track progress and permissions</Button>
        </details>
      </div>
    </section>
    <LatestUpdates />
    <section className="section section--indigo" id="kasena-spotlight">
      <div className="container kasena-spotlight">
        <SectionHeading eyebrow="Project Kassena" title="Starting with Kasem. Building with its speakers." body="Project Kassena brings words, stories and cultural knowledge into digital spaces, with sources, permissions and community review. What we learn here will help other language communities build their own tools." light />
        <Button to="project-kassena" variant="secondary">Meet Project Kassena</Button>
      </div>
    </section>
    <section className="section section--white">
      <div className="container split-intro">
        <SectionHeading eyebrow="Built with communities" title="The people behind the knowledge stay part of its future." />
        <div className="split-intro__copy">
          <p>Contributors bring words and stories. Teachers, speakers and cultural custodians help review language contributions. Clear permissions explain how work can be shared.</p>
          <p>Public posts and reviewed language entries follow different paths. Sharing work does not automatically give permission to use it for AI training.</p>
          <Button to="impact-governance" variant="secondary">Read how we care for shared knowledge</Button>
        </div>
      </div>
    </section>
  </>;
}
