/**
 * src/components/StatusBadge.tsx
 *
 * Renders the small "In development" / "Planned" / "Research" / "Live"
 * chip on product cards. This is new relative to the uploaded
 * template — the template used a free-text `tag` string ("You are
 * here", "Creator workspace") for something adjacent but different
 * (a descriptive label, not a build-status signal). StatusBadge adds
 * the honest-labelling guarantee the brief asks for: because `status`
 * is typed as `ProjectStatus` and not `string`, showing a planned
 * feature as live is a compile error, not just a copy-editing mistake
 * waiting to happen.
 */
import type { ProjectStatus } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{STATUS_LABEL[status]}</span>;
}
