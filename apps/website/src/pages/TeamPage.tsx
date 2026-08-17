/**
 * src/pages/TeamPage.tsx
 *
 * Promotes the template's inline "team-section" (previously nested at
 * the bottom of the Impact page) to its own route, matching the
 * brief's sitemap. Renders straight from TEAM_MEMBERS — editing a
 * teammate's role never touches this file.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { TEAM_MEMBERS } from "../content/team";
import { SectionHeading } from "../components/SectionHeading";
import { Button } from "../components/Button";

const route = ROUTES_BY_PATH["team"];

export function TeamPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <SectionHeading
            eyebrow="Core team"
            title="Clear ownership across the ecosystem."
            body="Product leads work inside shared standards so the website, TribeStudio, mobile app and backend do not become four unrelated products wearing the same logo."
            light
            as="h1"
          />
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          <div className="team-list">
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

      <section className="section section--cream text-center">
        <div className="container">
          <SectionHeading eyebrow="Reach the team" title="Questions about a specific workstream?" />
          <div data-reveal>
            <Button to="contact">Contact the team</Button>
          </div>
        </div>
      </section>
    </>
  );
}
