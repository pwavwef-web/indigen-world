/**
 * src/pages/GetInvolvedPage.tsx
 *
 * New page, not present in the uploaded template at all — the
 * template's only "get involved" mechanism was a mailto: button in the
 * contact section. The brief's sitemap lists Get Involved as its own
 * P0 page distinct from Contact, so this adds a dedicated one: the
 * audience breakdown, the main interest form, and a lightweight
 * newsletter option for people who want to keep up with the work.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { SectionHeading } from "../components/SectionHeading";
import { GetInvolvedForm } from "../features/forms/GetInvolvedForm";
import { NewsletterForm } from "../features/forms/NewsletterForm";
import { Icon } from "../components/Icon";

const route = ROUTES_BY_PATH["get-involved"];

const AUDIENCES = [
  {
    icon: "community" as const,
    title: "Communities & language contributors",
    body: "Speak Kasem, teach it, or want to help validate submissions? Join the pilot directly.",
  },
  {
    icon: "book" as const,
    title: "Schools & researchers",
    body: "Bring Project Kasena into a classroom, or explore a research collaboration.",
  },
  {
    icon: "globe" as const,
    title: "Diaspora, funders & technology partners",
    body: "Support the work financially, technically, or by spreading the word responsibly.",
  },
];

export function GetInvolvedPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="page-hero page-hero--involved">
        <div className="container">
          <SectionHeading
            eyebrow="Get involved"
            title="There's a specific route for you."
            body="Tell us who you are and what you're hoping to do — we'll ask for the minimum we need, nothing more."
            light
            as="h1"
          />
        </div>
      </section>

      <section className="section section--white">
        <div className="container product-grid">
          {AUDIENCES.map((audience) => (
            <article className="product-card product-card--indigo" key={audience.title} data-reveal>
              <div className="product-card__topline">
                <span className="product-card__icon">
                  <Icon name={audience.icon} />
                </span>
              </div>
              <h3>{audience.title}</h3>
              <p>{audience.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--cream">
        <div className="container form-section">
          <SectionHeading
            eyebrow="Submit your interest"
            title="One short form to get started."
            body="We'll route you to the right next step based on what you select — no promises of funding, sponsorship terms or launch dates are made automatically."
          />
          <div data-reveal>
            <GetInvolvedForm />
          </div>
        </div>
      </section>

      <section className="section section--white">
        <div className="container waitlist-band" data-reveal>
          <div>
            <p className="eyebrow">The Venacula newsletter</p>
            <h3>Keep culture in the conversation.</h3>
            <p>Get occasional stories and verified milestones from across Indigen World.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
