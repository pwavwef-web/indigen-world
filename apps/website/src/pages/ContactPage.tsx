/**
 * src/pages/ContactPage.tsx
 *
 * Privacy-aware contact route for general, publication, correction and
 * takedown requests.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { SectionHeading } from "../components/SectionHeading";
import { ContactForm } from "../features/forms/ContactForm";

const route = ROUTES_BY_PATH["contact"];
export function ContactPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="page-hero page-hero--contact">
        <div className="container">
          <SectionHeading
            eyebrow="Contact Indigen World"
            title="Questions, partnerships, corrections and takedown requests."
            body="Choose the subject that best matches your request. We welcome general enquiries and partnership conversations, and we route publication, correction and takedown requests for review."
            light
            as="h1"
          />
        </div>
      </section>

      <section className="section section--white">
        <div className="container form-section">
          <div data-reveal>
            <ContactForm />
          </div>
          <aside className="contact-guidance" data-reveal aria-labelledby="contact-next-steps">
            <p className="eyebrow">After you send</p>
            <h2 id="contact-next-steps">What happens next</h2>
            <p>
              We aim to acknowledge general enquiries within five working days. Publication,
              correction and takedown reviews may take longer when community or rights-holder
              consultation is needed.
            </p>
            <p>
              If the form is unavailable, email{" "}
              <a className="contact-email" href="mailto:hi@indigenworld.com">
                hi@indigenworld.com
              </a>
              . For a correction or takedown, use that wording in the subject line.
            </p>
            <p className="contact-alt">
              Please do not include private cultural records, restricted knowledge, or information
              about minors in either channel.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
