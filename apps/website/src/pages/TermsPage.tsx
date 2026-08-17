/**
 * src/pages/TermsPage.tsx
 *
 * Plain-language terms of use — same placeholder-legal-copy pattern as
 * PrivacyPage, and equally absent from the uploaded template.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { ROUTES_BY_PATH } from "../content/navigation";
import { SectionHeading } from "../components/SectionHeading";
import { Link } from "../app/router";

const route = ROUTES_BY_PATH["terms"];

export function TermsPage() {
  useDocumentMeta(route.title, route.description);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <SectionHeading eyebrow="Legal" title="Terms of use" light as="h1" />
        </div>
      </section>

      <section className="section section--white">
        <div className="container legal-copy">
          <h2>Using this site</h2>
          <p>
            This website introduces Indigen World's mission, ecosystem and team, and provides ways
            to get in touch or express interest in contributing. It is informational — it is not
            itself a language-learning tool, dictionary or translator. Descriptions of Project
            Kasena tools on this site are plans, not a live product experience.
          </p>

          <h2>Accuracy of information</h2>
          <p>
            We label the status of every product honestly: Live, In development, Planned, or
            Research. Planned features and forecast figures are marked as such and should not be
            treated as current results.
          </p>

          <h2>Intellectual property</h2>
          <p>
            Website, programme, language and cultural materials may carry different copyright,
            licence, attribution and cultural-permission terms. Do not reuse material unless the
            applicable terms have been made clear and permit that use.
          </p>

          <h2>No guarantees</h2>
          <p>
            We do not promise specific launch dates, mobile app store availability, financial
            rewards, or particular AI capabilities. Where we describe a target or pilot goal, it
            is exactly that — a goal, not a commitment.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these terms can be sent through the <Link to="contact">contact page</Link>.
          </p>

          <p className="legal-disclaimer">
            This page is a plain-language implementation summary, not final legal text. Approved
            legal copy from the project manager will replace this before public launch.
          </p>
        </div>
      </section>
    </>
  );
}
