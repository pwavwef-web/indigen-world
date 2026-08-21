/**
 * src/components/Footer.tsx
 *
 * Site footer. Adapted from the template's `site-footer`: the
 * "Explore" column now links to real pages instead of `navigation.slice(0, 3)`
 * anchor hashes, and a fourth "Legal" column is added for the new
 * Privacy/Terms pages the template didn't have.
 */
import { Link } from "../app/router";
import { BrandMark } from "./BrandMark";
import { NewsletterForm } from "../features/forms/NewsletterForm";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-newsletter">
        <div className="footer-newsletter__intro">
          <p className="eyebrow">Venacula</p>
          <h2>Culture, language and ideas worth carrying forward.</h2>
          <p>Subscribe to the Indigen World newsletter for occasional stories and project updates.</p>
        </div>
        <NewsletterForm />
      </div>
      <div className="container site-footer__top">
        <div className="footer-brand">
          <Link className="brand brand--footer" to="home" aria-label="Back to top">
            <BrandMark />
            <span className="brand__text">
              <strong>Indigen World</strong>
              <small>Culture belongs in the future</small>
            </span>
          </Link>
          <p>
            A cultural technology ecosystem for language preservation, cultural learning,
            storytelling and creator enablement.
          </p>
        </div>
        <div className="footer-links">
          <div>
            <strong>Explore</strong>
            <Link to="about">About</Link>
            <Link to="ecosystem">Ecosystem</Link>
            <Link to="project-kasena">Project Kasena</Link>
          </div>
          <div>
            <strong>Principles</strong>
            <Link to="impact-governance">Data governance</Link>
            <Link to="impact-governance">MVP targets</Link>
            <Link to="get-involved">Partnerships</Link>
          </div>
          <div>
            <strong>Legal</strong>
            <Link to="privacy">Privacy</Link>
            <Link to="terms">Terms</Link>
            <Link to="contact">Contact</Link>
          </div>
        </div>
      </div>
      <div className="container site-footer__bottom">
        <p>© {currentYear} Indigen World. Cultural materials may carry distinct permissions.</p>
        <p>Project Kasena is an Indigen World programme.</p>
      </div>
    </footer>
  );
}
