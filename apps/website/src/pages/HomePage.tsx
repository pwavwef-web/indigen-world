import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { IMPACT_TARGETS } from "../content/kasena";
import { Button } from "../components/Button";
import { SectionHeading } from "../components/SectionHeading";
import { AudiencePaths } from "../components/AudiencePaths";
import { STUDIO_CREATE_URL } from "../content/creatorLinks";

const route = ROUTES_BY_PATH.home;

export function HomePage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);
  return <>
    <section className="hero" id="top">
      <div className="hero__pattern" aria-hidden="true" />
      <div className="container hero__grid">
        <div className="hero__content" data-reveal>
          <span className="status-pill"><span className="status-pill__dot" /> Starting with Kasem, in Northern Ghana</span>
          <p className="hero__kicker">Language, stories and the people behind them</p>
          <h1>Culture belongs<span> in the future.</span></h1>
          <p className="hero__lead">Discover Kasem words, share a story, or help keep your language part of everyday life.</p>
          <div className="hero__actions">
            <Button to="dictionary">Explore Kasem words</Button>
            <Button href={STUDIO_CREATE_URL} external variant="secondary">Create with TribeStudio</Button>
          </div>
          <p className="tiny">Browse without an account. Sign in to create and save your work.</p>
        </div>
        <div className="hero-visual" aria-hidden="true" data-reveal />
      </div>
    </section>
    <section className="section section--white" id="find-your-path">
      <div className="container">
        <SectionHeading eyebrow="Start here" title="What would you like to do?" body="Choose a path that fits you. You can explore the rest whenever you are ready." />
        <AudiencePaths />
      </div>
    </section>
    <section className="section section--cream" id="progress">
      <div className="container">
        <SectionHeading eyebrow="Current progress" title="From an idea to tools you can use." body="Start with the public dictionary and creator workspace. Mobile access and campaign opportunities have their own availability." />
        <div className="journey-grid">
          <article className="journey-card">
            <span className="target-badge">Public dictionary</span><h3>Explore published Kasem words</h3>
            <p>Search entries, read their meaning and context, and listen where a recording is available.</p>
            <Button to="dictionary" variant="secondary">Open the dictionary</Button>
          </article>
          <article className="journey-card">
            <span className="target-badge">Creator workspace</span><h3>Make and share your work</h3>
            <p>TribeStudio supports drafts, recordings and posts. Campaign entries follow a separate review process.</p>
            <Button href={STUDIO_CREATE_URL} external variant="secondary">Start a post</Button>
          </article>
          <article className="journey-card">
            <span className="target-badge">In development</span><h3>Learning on your phone</h3>
            <p>The mobile app is still in development. Join the waitlist to hear when access is available.</p>
            <Button to="get-involved?route=mobile-app-waitlist" variant="secondary">Join the app waitlist</Button>
          </article>
        </div>
        <p className="target-label">These describe available product paths, not measured community impact.</p>
        <Button href="https://updates.indigenworld.com/" external variant="secondary">Read the latest project updates</Button>
        <details className="home-targets">
          <summary>See the goals we are working toward</summary>
          <p>Figures below are Project Kassena targets, not completed results.</p>
          <div className="impact-grid">{IMPACT_TARGETS.map((target) => <article key={target.label}><span className="target-badge">Target</span><strong>{target.figure}</strong><span>{target.label}</span></article>)}</div>
          <Button to="impact-governance" variant="secondary">How we track progress and permissions</Button>
        </details>
      </div>
    </section>
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
