/**
 * src/pages/GetInvolvedPage.tsx
 *
 * New page, not present in the uploaded template at all — the
 * template's only "get involved" mechanism was a mailto: button in the
 * contact section. The brief's sitemap lists Get Involved as its own
 * P0 page distinct from Contact, so this adds a dedicated one: the
 * audience breakdown and the main interest form. Newsletter signup stays
 * in the global footer so the page keeps one clear conversion journey.
 */
import { useState } from "react";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { SectionHeading } from "../components/SectionHeading";
import {
  GetInvolvedForm,
  interestRouteFromLocation,
  queryForInterestRoute,
  type InterestRoute,
} from "../features/forms/GetInvolvedForm";
import { Icon } from "../components/Icon";

const route = ROUTES_BY_PATH["get-involved"];

const AUDIENCES = [
  {
    icon: "community" as const,
    title: "Communities & language contributors",
    body: "Speak Kasem, teach it, or want to help validate submissions? Join the pilot directly.",
    routes: [
      { label: "Contribute language", route: "Language contributor" as const },
      { label: "Help validate", route: "Elder / teacher validator" as const },
    ],
  },
  {
    icon: "book" as const,
    title: "Schools & researchers",
    body: "Bring Project Kassena into a classroom, or explore a research collaboration.",
    routes: [
      { label: "School or educator", route: "School or educator" as const },
      { label: "Research collaboration", route: "Researcher" as const },
    ],
  },
  {
    icon: "globe" as const,
    title: "Diaspora, funders & technology partners",
    body: "Support the work financially, technically, or by spreading the word responsibly.",
    routes: [
      { label: "Diaspora supporter", route: "Diaspora supporter" as const },
      { label: "Sponsor or partner", route: "Sponsor or cultural partner" as const },
      { label: "Technical volunteer", route: "Technical volunteer" as const },
    ],
  },
];

const ROUTE_EXPECTATIONS: Record<InterestRoute, string> = {
  "Indigen mobile app waitlist": "We'll keep you informed about reviewed mobile-app access and launch updates.",
  "Language contributor": "We'll ask about your Kasem dialect, experience, and a safe contribution process.",
  "Elder / teacher validator": "We'll arrange a conversation about review standards, dialect, and permissions.",
  "School or educator": "We'll discuss learner needs, safeguarding, and what a responsible pilot could involve.",
  Researcher: "We'll review the research scope, community benefit, permissions, and data-access boundaries.",
  "Diaspora supporter": "We'll share suitable learning, community, and advocacy opportunities.",
  "Sponsor or cultural partner": "We'll arrange a partnership conversation; no funding terms are created by this form.",
  "Technical volunteer": "We'll match relevant skills to approved work and current technical needs.",
};

export function GetInvolvedPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);
  const [selectedRoute, setSelectedRoute] = useState<InterestRoute | "">(
    interestRouteFromLocation
  );

  const updateSelectedRoute = (nextRoute: InterestRoute | "", focusForm = false) => {
    setSelectedRoute(nextRoute);

    const nextUrl = new URL(window.location.href);
    if (nextRoute) nextUrl.searchParams.set("route", queryForInterestRoute(nextRoute));
    else nextUrl.searchParams.delete("route");
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);

    if (!focusForm) return;
    window.requestAnimationFrame(() => {
      document.getElementById("get-involved-form")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      window.requestAnimationFrame(() => {
        document.getElementById("gi-name")?.focus({ preventScroll: true });
      });
    });
  };

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

      <section className="section section--white involvement-picker" aria-labelledby="involvement-picker-title">
        <div className="container">
          <SectionHeading
            eyebrow="Choose your route"
            title="Start with the role that fits best."
            body="Choose one option and we'll take you directly to a form already set up for that route. You can change it there at any time."
          />
          <div className="involvement-route-grid">
          {AUDIENCES.map((audience) => (
            <article className="involvement-route-card" key={audience.title} data-reveal>
              <div className="product-card__topline">
                <span className="product-card__icon">
                  <Icon name={audience.icon} />
                </span>
              </div>
              <h3>{audience.title}</h3>
              <p>{audience.body}</p>
              <div className="involvement-route-actions">
                {audience.routes.map((option) => (
                  <label key={option.route}>
                    <input
                      type="radio"
                      name="interest-route-picker"
                      value={option.route}
                      checked={selectedRoute === option.route}
                      onChange={() => updateSelectedRoute(option.route, true)}
                    />
                    <span>{option.label}</span>
                    <Icon name="arrow" size={16} />
                  </label>
                ))}
              </div>
            </article>
          ))}
          </div>
          <label
            className={`mobile-waitlist-route${selectedRoute === "Indigen mobile app waitlist" ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="interest-route-picker"
              value="Indigen mobile app waitlist"
              checked={selectedRoute === "Indigen mobile app waitlist"}
              onChange={() => updateSelectedRoute("Indigen mobile app waitlist", true)}
            />
            <Icon name="mobile" size={20} />
            <span>
              <strong>Looking for the mobile app?</strong>
              <small>Join the early-access waitlist.</small>
            </span>
            <Icon name="arrow" size={17} />
          </label>
        </div>
      </section>

      <section className="section section--cream" id="interest-form-section">
        <div className="container form-section">
          <div className="involvement-form-intro">
            <SectionHeading
              eyebrow="Submit your interest"
              title="One short form to get started."
              body="We'll route you to the right next step based on what you select — no promises of funding, sponsorship terms or launch dates are made automatically."
            />
            {selectedRoute ? (
              <div className="selected-route-summary" role="status" aria-live="polite">
                <span>Selected route</span>
                <strong>{selectedRoute}</strong>
                <p>{ROUTE_EXPECTATIONS[selectedRoute]}</p>
              </div>
            ) : (
              <p className="selected-route-prompt">
                Choose a route above or select one in the form. You can still continue if you're unsure.
              </p>
            )}
          </div>
          <div data-reveal>
            <GetInvolvedForm
              selectedRoute={selectedRoute}
              onRouteChange={(nextRoute) => updateSelectedRoute(nextRoute)}
            />
          </div>
        </div>
      </section>

    </>
  );
}
