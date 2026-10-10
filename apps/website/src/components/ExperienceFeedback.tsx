import { Link } from "../app/router";

/** Feedback is sent only when the visitor completes the existing contact form. */
export function ExperienceFeedback({ page }: { page: "learn" | "dictionary" }) {
  return <aside className="experience-feedback" aria-label="Website feedback">
    <div><strong>Help make this easier to use.</strong><p>Tell us what helped, what was missing, or where you got stuck.</p></div>
    <Link className="button button--secondary" to={`contact?subject=website-feedback&page=${page}`}>Share feedback</Link>
  </aside>;
}
