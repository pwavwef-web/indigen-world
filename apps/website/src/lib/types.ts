/**
 * src/lib/types.ts
 *
 * Central type definitions shared across content, components and
 * pages. Kept in one file so every shape of data flowing through the
 * app is visible at a glance, instead of being redefined slightly
 * differently in three different files.
 */

/**
 * The four honest-labelling states used on every product/status badge
 * (Ecosystem cards, Project Kassena status, Home progress cards).
 * A union of string literals rather than `string` — TypeScript refuses
 * to compile a typo'd status like "live " or "Live", which is exactly
 * the brief's "never present planned features as live" rule enforced
 * at compile time.
 */
export type ProjectStatus = "live" | "in-development" | "planned" | "research";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: "Live",
  "in-development": "In development",
  planned: "Planned",
  research: "Research",
};

/** One product/workstream in the ecosystem (Home highlights + full Ecosystem page). */
export interface EcosystemProduct {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  audience: string;
  status: ProjectStatus;
  owner: string;
  ownerLabel?: "Lead" | "Owner";
  /** In-app route to link to, if this product has its own page. */
  href?: string;
  /** When true, `href` is a full external URL opened in a new tab
   *  (e.g. a separately-hosted product), not an in-app route. */
  external?: boolean;
  ctaLabel?: string;
}

/** One operating/governance principle, as shown on About and Impact & Governance. */
export interface Principle {
  number: string;
  title: string;
  body: string;
}

/** One team member, shown in the About page's team section. */
export interface TeamMember {
  name: string;
  role: string;
}

/** One route the app can navigate to (see content/navigation.ts). */
export interface AppRoute {
  path: string;
  navLabel?: string;
  title: string;
  description: string;
  /** Exclude utility and transactional routes from search indexing. */
  noindex?: boolean;
}

/** Result of validating a single form field — a discriminated union so
 *  consuming code can't read `.message` off a result that's valid. */
export type FieldValidation = { valid: true } | { valid: false; message: string };
