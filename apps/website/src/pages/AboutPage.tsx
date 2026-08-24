/**
 * src/pages/AboutPage.tsx
 *
 * The "why" page — new relative to the template, which folded this
 * material into the single-page "vision" section. Reuses that
 * section's actual copy (the risk/opportunity/standard vision cards)
 * plus the belief-strip line and team roster, giving the mission and
 * the people responsible for it one shared home.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { TEAM_MEMBERS } from "../content/team";
import { Button } from "../components/Button";
import { SectionHeading } from "../components/SectionHeading";

const route = ROUTES_BY_PATH["about"];

export function AboutPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="page-hero page-hero--about">
        <div className="container">
          <SectionHeading
            eyebrow="Why Indigen World"
            title="The internet is growing. Too many cultures are being left behind."
            light
            as="h1"
          />
        </div>
      </section>

      <section className="section section--cream">
        <div className="container split-intro">
          {/* This grid's left column originally held the section's
              eyebrow+title (see the template's single-page "vision"
              section). Here the same heading already appears in the
              page-hero above, so repeating it would be redundant —
              but leaving the column truly empty left a broken-looking
              gap once the grid went two-column at wider viewports.
              A short supporting label fills the space intentionally. */}
          <p className="split-intro__label">The case for building this now</p>
          <div className="split-intro__copy" data-reveal>
            <p>
              Language loss is no longer only an archival problem. It is a product problem, an
              education problem and an AI problem. When a language has no structured digital
              presence, its speakers become invisible to the systems increasingly shaping daily
              life.
            </p>
            <p>
              We are building the infrastructure and experiences that let communities preserve
              knowledge, teach younger generations and decide how their culture is represented
              online.
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
                Languages without datasets, interfaces and discoverable content are excluded from
                search, education tools and emerging AI systems.
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
                Validation, attribution, consent and restrictions are part of the product
                architecture—not paperwork added at the end.
              </p>
            </div>
          </article>
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

      <section id="team" className="section section--white">
        <div className="container">
          <SectionHeading
            eyebrow="Core team"
            title="Working together across the ecosystem."
            body="Product leads work inside shared standards so the website, TribeStudio, mobile app and backend do not become four unrelated products wearing the same logo."
          />
          <div className="team-list team-list--about">
            {TEAM_MEMBERS.map((member, index) => (
              <article key={member.name} data-reveal>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{member.name}</strong>
                  <p>{member.role}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="team-footnote">
            Full biographies and portraits are added once each team member approves their own
            listing.
          </p>
        </div>
      </section>

      <section className="section section--cream">
        <div className="container split-intro">
          <SectionHeading
            eyebrow="Starting point"
            title="Why Kasem, why now."
            body="Indigen World's first deep commitment is to Kasem, the language of the Kasena people of Northern Ghana, through Venacula. Starting with one language lets us build the validation, consent and attribution model properly — a foundation other language communities can eventually build on."
          />
          <div data-reveal>
            <Button to="project-kasena" variant="secondary">
              Read about Venacula
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
