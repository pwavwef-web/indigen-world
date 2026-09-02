/**
 * src/pages/TermsPage.tsx
 *
 * Plain-language terms of use — same placeholder-legal-copy pattern as
 * PrivacyPage, and equally absent from the uploaded template.
 *
 * The website is the ecosystem's canonical legal home, so these terms
 * cover all three user-facing products: this website, the Indigen World
 * mobile app (Indigen), and TribeStudio. Product-specific sections set
 * out the rules that apply once you move from reading the site to using
 * the app or contributing through the workspace.
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
      <section className="page-hero page-hero--legal">
        <div className="container">
          <SectionHeading eyebrow="Legal" title="Terms of use" light as="h1" />
        </div>
      </section>

      <section className="section section--white">
        <div className="container legal-copy">
          <h2>What these terms cover</h2>
          <p>
            Indigen World delivers three user-facing products: this public website, the Indigen
            World mobile app (Indigen), and TribeStudio for creators, contributors and validators.
            These terms apply across all three. Sections below add the rules specific to using the
            app and contributing through TribeStudio.
          </p>

          <h2>Using this site</h2>
          <p>
            This website introduces Indigen World's mission, ecosystem and team, provides ways to
            get in touch or express interest in contributing, and hosts Project Kassena's public
            Kasem dictionary. Visitors can search published entries, save words on their own
            device, share links and suggest corrections. The web dictionary is not a complete
            language course or finished translator; features labelled as planned or in development
            are not yet live.
          </p>

          <h2>Using the Indigen World mobile app</h2>
          <p>
            The mobile app is an everyday consumer app for exploring, learning, saving and
            contributing cultural and language content, beginning with the Kasem language cell. It
            includes the same reviewed dictionary within an offline-friendly learning experience;
            the website remains the quickest public route for search and sharing. Some surfaces are
            feature-gated and may be unavailable or clearly labelled as previews. When you post in
            the community, comment, or attribute Explore content, you are responsible for what you
            share and must hold the rights and permissions to share it. Do not upload restricted,
            sacred or third-party material you are not permitted to submit.
          </p>
          <p>
            Rewards and points shown against contributions are provisional: they remain pending
            until a trusted reviewer approves the underlying contribution, and approval is not
            guaranteed. Dictionary content marked as synthetic is sample data, not authoritative
            language reference.
          </p>

          <h2>Contributing through TribeStudio</h2>
          <p>
            TribeStudio is a role-based workspace for creators, contributors, cultural custodians
            and validators. Access depends on the role assigned to your account, and privileged
            actions such as validation decisions are subject to review and audit. When you submit
            language or cultural content, you must provide accurate dialect, source, consent,
            licence and cultural-permission information, and you confirm you are entitled to
            contribute it under those terms. Validators must apply review decisions in good faith;
            all decisions are recorded.
          </p>

          <h2>Accuracy of information</h2>
          <p>
            We label the status of every product honestly: Live, In development, Planned, or
            Research. Planned features and forecast figures are marked as such and should not be
            treated as current results.
          </p>

          <h2>Intellectual property and cultural permissions</h2>
          <p>
            Website, programme, language and cultural materials may carry different copyright,
            licence, attribution and cultural-permission terms. Do not reuse material unless the
            applicable terms have been made clear and permit that use. Contributed content stays
            governed by the consent and permission metadata recorded with it, across the app and
            TribeStudio.
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
