import { HomeHero } from "../components/HomeHero";
import { HomeCultureMap } from "../components/HomeCultureMap";
import { HomeScrollStories } from "../components/HomeScrollStories";
import { Link } from "../app/router";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { ROUTES_BY_PATH } from "../content/navigation";
import { IMPACT_TARGETS } from "../content/kasena";
import { Button } from "../components/Button";
import { SectionHeading } from "../components/SectionHeading";
import { LatestUpdates } from "../components/LatestUpdates";
import { HomeSearch } from "../components/HomeSearch";
import { HomeDiscovery } from "../components/HomeDiscovery";

const route = ROUTES_BY_PATH.home;

export function HomePage() {
  useDocumentMeta(route.title, route.description);
  return <>
    <HomeHero>
        <div className="hero__content">
          <span className="status-pill"><span className="status-pill__dot" /> Starting with Kasem, in Northern Ghana</span>
          <p className="hero__kicker">Language, stories and the people behind them</p>
          <h1>Culture belongs<span> in the future.</span></h1>
          <p className="hero__lead">Discover Kasem words, hear their voices, and help keep everyday knowledge alive.</p>
          <HomeSearch />
          <div className="hero__actions">
            <Button to="dictionary">Look up a Kasem word</Button>
            <Button to="contribute" variant="secondary">Share a Kasem expression</Button>
          </div>
          <p className="tiny">No account needed to browse. Contributing uses a free Google sign-in, so you can follow the review.</p>
        </div>
    </HomeHero>
    <HomeDiscovery />
    <HomeCultureMap />
    <section className="section section--cream" id="progress">
      <div className="container">
        <SectionHeading eyebrow="Build with us" title="The next chapter has room for you." body="Share what you know, understand how it is cared for, and follow the work as it grows." />
        <HomeScrollStories />
        <p className="home-mobile-status">Learning on your phone: the mobile app is still in development. <Link to="get-involved?route=mobile-app-waitlist">Join the app waitlist</Link> to hear when access is available.</p>
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
