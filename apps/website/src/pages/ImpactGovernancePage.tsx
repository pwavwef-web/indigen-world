/**
 * src/pages/ImpactGovernancePage.tsx
 *
 * Governance principles (community authority over cultural data) and
 * the full MVP impact targets. Carried over from the template's
 * `#governance` and `#impact` sections, merged into one page since
 * the brief lists them as a single "Impact & Governance" entry in the
 * sitemap.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { PERMISSION_RULES, PRINCIPLES } from "../content/principles";
import { IMPACT_TARGETS } from "../content/kasena";
import { SectionHeading } from "../components/SectionHeading";
import { Icon } from "../components/Icon";

const route = ROUTES_BY_PATH["impact-governance"];

export function ImpactGovernancePage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <SectionHeading
            eyebrow="Cultural governance"
            title="Data with dignity. Technology with boundaries."
            body="A cultural platform is only credible when communities retain meaningful authority over what is collected, published, adapted and used for model training."
            light
            as="h1"
          />
        </div>
      </section>

      <section className="section section--sand">
        <div className="container governance-grid">
          <div className="governance-sticky">
            <div className="governance-seal" data-reveal>
              <Icon name="shield" size={34} />
              <div>
                <strong>Community-governed by design</strong>
                <span>Consent • attribution • validation • restrictions</span>
              </div>
            </div>
          </div>
          <div className="principle-list">
            {PRINCIPLES.map((principle) => (
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

      <section className="section section--cream">
        <div className="container">
          <SectionHeading
            eyebrow="Different material, different permissions"
            title="Validation is necessary. It is not the same as permission to publish."
            body="Lexical entries, cultural expressions, stories and audio carry different risks and must not be treated as one unrestricted dataset."
          />
          <ul className="kicker-list" data-reveal>
            {PERMISSION_RULES.map((rule) => (
              <li key={rule.title}>
                <strong>{rule.title}</strong>
                <span>{rule.body}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

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
          {IMPACT_TARGETS.map((target) => (
            <article key={target.label} data-reveal>
              <strong>{target.figure}</strong>
              <span>{target.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--cream">
        <div className="container">
          <SectionHeading eyebrow="What we will never do" title="Boundaries we hold ourselves to." />
          <ul className="kicker-list" data-reveal>
            <li>
              <strong>No unverified claims</strong>
              <span>
                We don't present a partnership, dataset, funder relationship or community
                endorsement as live unless it's been approved for publication.
              </span>
            </li>
            <li>
              <strong>No forecasts as facts</strong>
              <span>
                Target numbers stay labelled as targets until they're verified — we don't publish
                projected figures as current results.
              </span>
            </li>
            <li>
              <strong>No exposed private data</strong>
              <span>
                Validator notes, contributor contact details and internal identifiers are never
                made public.
              </span>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
