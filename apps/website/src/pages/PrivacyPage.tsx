/**
 * src/pages/PrivacyPage.tsx
 *
 * New page — the uploaded template had no Privacy or Terms page at
 * all, despite both being P0 in the brief's sitemap. Marked in-page as
 * a placeholder pending the project manager's approved legal copy,
 * since legal text sign-off isn't a website-lead decision per the
 * brief's decision-boundaries section.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { ROUTES_BY_PATH } from "../content/navigation";
import { SectionHeading } from "../components/SectionHeading";
import { Link } from "../app/router";

const route = ROUTES_BY_PATH["privacy"];

export function PrivacyPage() {
  useDocumentMeta(route.title, route.description);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <SectionHeading eyebrow="Legal" title="Privacy notice" light as="h1" />
        </div>
      </section>

      <section className="section section--white">
        <div className="container legal-copy">
          <h2>What we collect</h2>
          <p>
            When you use a form on this site — Contact, Get Involved, or the waitlist — we
            collect only the fields shown on that form: your name, contact details, and the
            message or note you provide.
          </p>

          <h2>How we use it</h2>
          <p>
            Submissions are used solely to respond to you and route your request to the right
            person on the team. We do not sell this information, and we do not publish form
            responses.
          </p>

          <h2>What we don't collect here</h2>
          <p>
            This website's general forms are not for audio recordings, sacred or restricted
            cultural knowledge, minors' data, or detailed cultural submissions. Language and
            cultural contributions belong to Project Kasena's dedicated, consent-based process.
          </p>

          <h2>Analytics</h2>
          <p>
            If privacy-safe analytics are enabled, they are limited to high-level events such as
            page views, CTA choices and submission outcomes. Analytics never capture the contents
            of form messages, phone numbers, or personal or cultural content.
          </p>

          <h2>Your rights</h2>
          <p>
            You can ask us to correct or delete information you've submitted at any time through
            the <Link to="contact">contact page</Link>. During this MVP stage, these requests are
            handled manually by the team.
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
