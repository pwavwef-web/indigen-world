/**
 * src/pages/ProjectKasenaPage.tsx
 *
 * The flagship-programme deep dive: feature points, a static "what the
 * module will include" preview, and the three-phase roadmap.
 *
 * This page previously had an interactive translation-demo widget (a
 * language-direction toggle plus a live word lookup), carried over
 * from the uploaded template. It's been removed: the brief's Ecosystem
 * scope note is explicit that the public website "does not rebuild:
 * dashboards, dictionaries, translators or validator tools — those
 * belong to their own products." A working dictionary/translator UI is
 * exactly that, even with a clear "Illustrative" label on it — the
 * label made the demo honest about *what it showed*, but didn't change
 * *what kind of tool it was*. The module-preview list below describes
 * the same planned capability in prose instead of demonstrating it.
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

const route = ROUTES_BY_PATH["project-kasena"];

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
              title="Project Kasena starts with one language—deeply."
              body="Project Kasena is Indigen World's flagship Kasem initiative and intended model for community-validated language preservation. It is building foundations for future text and voice research without presenting a finished translator."
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
              <StatusBadge status="planned" />
            </div>
            <ul className="module-preview__list">
              {MODULE_PREVIEW_POINTS.map((point) => (
                <li key={point}>
                  <Icon name="check" size={18} /> {point}
                </li>
              ))}
            </ul>
            <p className="module-preview__note">
              This module isn't built yet. It will live as its own product experience once ready
              — this page describes what's planned rather than demonstrating a working version.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--cream">
        <div className="container">
          <SectionHeading
            eyebrow="Community validation"
            title="A record is not publishable simply because it was submitted."
            body="Project Kasena is designed around dialect respect, qualified review and permissions that travel with each record."
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
            title="Kasem, Kasena, Project Kasena."
            body="Kasem is the language. Kasena refers to the people and community it belongs to. Project Kasena is Indigen World's initiative built to serve that community — they aren't interchangeable, and we're careful to keep the distinction clear everywhere on this site."
          />
        </div>
      </section>
    </>
  );
}
