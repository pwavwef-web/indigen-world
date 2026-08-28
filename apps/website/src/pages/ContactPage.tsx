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
            eyebrow="Partners, educators, funders & cultural custodians"
            title="Help build a future where culture is digitally present—and still belongs to its people."
            body="We are preparing the first Kasem pilot and welcome conversations with communities, schools, researchers, cultural organisations, technology partners and responsible funders."
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
