/**
 * src/content/team.ts
 *
 * Team roster shown on the About page. Carried over from the uploaded
 * template's `team` array (previously a tuple list inline in App.tsx),
 * now typed and separated so an edit here never touches JSX.
 */
import type { TeamMember } from "../lib/types";

export const TEAM_MEMBERS: TeamMember[] = [
  { name: "Francis Pwavwe", role: "Project Manager" },
  { name: "Francis Onai", role: "Public Website Lead" },
  { name: "Chinedum Okwonko Udeaja", role: "TribeStudio Lead" },
  { name: "Andy Anim", role: "Native Mobile App Lead" },
];
