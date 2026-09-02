/**
 * src/pages/ProjectKasenaPage.tsx
 *
 * The flagship-programme deep dive: feature points, a module preview,
 * a route into the live dictionary, and the three-phase roadmap.
 */
import { Fragment } from "react";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import {
  KASENA_POINTS,
  KASENA_STEWARDSHIP_STEPS,
  ROADMAP_PHASES,
  MODULE_PREVIEW_POINTS,
} from "../content/kasena";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { SectionHeading } from "../components/SectionHeading";
import { StatusBadge } from "../components/StatusBadge";

const route = ROUTES_BY_PATH["project-kassena"];

export function ProjectKasenaPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="page-hero page-hero--kasena">
        <div className="container kasena-grid">
          <div className="kasena-copy">
            <SectionHeading
              eyebrow="Flagship programme"
              title="Project Kassena starts with one language—deeply."
              body="Project Kassena is Indigen World's flagship Kasem-language programme and the first implementation of its community-validated language-cell model. It is building foundations for future text and voice research without presenting a finished translator."
              light
              as="h1"
            />
            <div className="kasena-points" data-reveal>
              {KASENA_POINTS.map((point) => (
                <span key={point}>
                  <Icon name="check" size={18} /> {point}
                </span>
              ))}
            </div>
            <Button to="get-involved" variant="secondary">
              Support the Kasem pilot
            </Button>
          </div>

          <div className="module-preview" data-reveal>
            <div className="module-preview__header">
              <div>
                <p className="eyebrow">Kasem module</p>
                <strong>Dictionary &amp; translator</strong>
              </div>
              <StatusBadge status="in-development" />
            </div>
            <ul className="module-preview__list">
              {MODULE_PREVIEW_POINTS.map((point) => (
                <li key={point}>
                  <Icon name="check" size={18} /> {point}
                </li>
              ))}
            </ul>
            <p className="module-preview__note">
              The website offers immediate dictionary search and sharing. The mobile app carries
              the same reviewed entries into an offline-friendly learning and contribution
              experience. Translation tooling remains in development.
            </p>
            <Button to="dictionary" variant="secondary" className="module-preview__button">
              Open the Kasem dictionary
            </Button>
          </div>
        </div>
      </section>

      <section className="section section--cream">
        <div className="container">
          <SectionHeading
            eyebrow="Community validation"
            title="A record is not publishable simply because it was submitted."
            body="Project Kassena is designed around dialect respect, qualified review and permissions that travel with each record."
          />
          <ol className="process-list" data-reveal>
            {KASENA_STEWARDSHIP_STEPS.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--indigo">
        <div className="container roadmap" data-reveal>
          {ROADMAP_PHASES.map((phase, index) => (
            <Fragment key={phase.phase}>
              <div className="roadmap__item">
                <span>{phase.phase}</span>
                <strong>{phase.title}</strong>
                <p>{phase.body}</p>
              </div>
              {index < ROADMAP_PHASES.length - 1 && <div className="roadmap__line" aria-hidden="true" />}
            </Fragment>
          ))}
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          <SectionHeading
            eyebrow="Getting the names right"
            title="Kasem, Kassena and Project Kassena."
            body="Kasem is the language. Kassena refers to the people and community it belongs to. Project Kassena is Indigen World's programme serving that language community. Venacula is the separate Indigen World newsletter."
          />
        </div>
      </section>
    </>
  );
}
