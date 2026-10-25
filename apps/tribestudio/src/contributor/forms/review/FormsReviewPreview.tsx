import { FormsReviewDesk } from './FormsReviewDesk';

/**
 * The forms review desk against its in-memory fixture, at
 * /contributor/preview/forms-review. Only reachable through App.tsx's
 * DEV-only lazy import; it grants no authentication or write bypass in
 * production, where FormsReviewDesk ignores `preview`.
 */
export function FormsReviewPreview() {
  return <FormsReviewDesk preview />;
}
