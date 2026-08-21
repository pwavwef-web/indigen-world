/**
 * src/content/ecosystem.ts
 *
 * The three user-facing products, plus the shared backend, as typed
 * data — reused on both the Home page (trimmed highlight) and the
 * full Ecosystem page. The uploaded template had this data (as
 * `products`) but no `status` field; adding `ProjectStatus` here is
 * what makes "never present a planned feature as live" a type-checked
 * guarantee rather than a copy-editing convention.
 */
import type { EcosystemProduct } from "../lib/types";

export const ECOSYSTEM_PRODUCTS: EcosystemProduct[] = [
  {
    id: "public-website",
    eyebrow: "Public website",
    title: "Stories, programmes and proof of impact.",
    body: "This site is being built as the public home for the mission, verified updates, partnerships and support.",
    audience: "Visitors, communities, partners and supporters",
    status: "in-development",
    owner: "Francis E. Onai",
    ownerLabel: "Lead",
    href: "home",
    ctaLabel: "You are here",
  },
  {
    id: "tribestudio",
    eyebrow: "TribeStudio",
    title: "A serious workspace for cultural creation.",
    body: "A planned workspace for creators, contributors, validators and cultural custodians to manage content and review workflows.",
    audience: "Creators, contributors and cultural validators",
    status: "planned",
    owner: "Chinedum Okwonko Udeaja",
    ownerLabel: "Lead",
    href: "get-involved",
    ctaLabel: "Follow progress",
  },
  {
    id: "mobile-app",
    eyebrow: "Indigen World Mobile",
    title: "Culture you can carry every day.",
    body: "A planned mobile experience for learning, discovery, saved content and approved participation journeys.",
    audience: "Learners, families and diaspora communities",
    status: "planned",
    owner: "Andy Anim",
    ownerLabel: "Lead",
    href: "get-involved",
    ctaLabel: "Join the waitlist",
  },
  {
    id: "project-kasena",
    eyebrow: "Project Kasena",
    title: "The flagship Kasem language cell.",
    body: "Community-governed workflows for future Kasem dictionary, translation and dialect data — the model this first language cell is being built to test.",
    audience: "Kasem speakers, educators and language custodians",
    status: "in-development",
    owner: "Indigen World flagship programme",
    href: "project-kasena",
    ctaLabel: "Explore Project Kasena",
  },
  {
    id: "backend",
    eyebrow: "Shared foundation",
    title: "Firebase, data standards and provider-independent AI infrastructure.",
    body: "Firebase is the platform direction for authentication, data, storage, functions and hosting. AI execution stays controlled behind reviewed backend interfaces.",
    audience: "Indigen World product and governance workstreams",
    status: "research",
    owner: "Shared technical workstream",
    href: "impact-governance",
    ctaLabel: "Read our principles",
  },
];

/** The four ecosystem layers highlighted on Home. */
export const HOME_ECOSYSTEM_HIGHLIGHTS: EcosystemProduct[] = ECOSYSTEM_PRODUCTS.filter((product) =>
  ["project-kasena", "tribestudio", "mobile-app", "backend"].includes(product.id)
);
