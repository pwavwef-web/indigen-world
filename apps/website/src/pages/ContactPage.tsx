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
      <section className="page-hero">
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
          <p className="contact-alt">
            Publication, correction and takedown requests can use this same route. Please choose
            the closest subject and avoid including private cultural records in the message.
          </p>
        </div>
      </section>
    </>
  );
}
