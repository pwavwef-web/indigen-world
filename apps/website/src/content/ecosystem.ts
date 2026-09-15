/**
 * src/content/ecosystem.ts
 *
 * The three user-facing products, flagship programme and shared
 * foundation are separate typed exports. This preserves the product
 * boundaries in both the content model and the rendered site.
 */
import type { EcosystemProduct } from "../lib/types";

export const ECOSYSTEM_PRODUCTS: EcosystemProduct[] = [
  {
    id: "public-website",
    eyebrow: "Public website",
    title: "Stories, programmes and proof of impact.",
    body: "Explore published Kasem words, learn about our work, and find ways to take part.",
    audience: "Visitors, communities, partners and supporters",
    status: "live",
    owner: "Francis E. Onai",
    ownerLabel: "Lead",
    href: "home",
    ctaLabel: "You are here",
  },
  {
    id: "tribestudio",
    eyebrow: "TribeStudio",
    title: "A place to create and share your work.",
    body: "Create and save drafts, record audio, and share posts. Campaigns have their own eligibility and review requirements.",
    audience: "Creators, contributors and cultural validators",
    status: "in-development",
    owner: "Chinedum Okwonko Udeaja",
    ownerLabel: "Lead",
    href: "https://tribestudio.indigenworld.com/studio",
    external: true,
    ctaLabel: "Open TribeStudio",
  },
  {
    id: "mobile-app",
    eyebrow: "Indigen World Mobile",
    title: "Culture you can carry every day.",
    body: "A mobile experience in development for learning, discovery, saved content and reviewed ways to contribute.",
    audience: "Learners, families and diaspora communities",
    status: "in-development",
    owner: "Andy Anim",
    ownerLabel: "Lead",
    href: "get-involved?route=mobile-app-waitlist",
    ctaLabel: "Join the waitlist",
  },
];

export const FLAGSHIP_PROGRAMME: EcosystemProduct = {
  id: "project-kassena",
  eyebrow: "Project Kassena",
  title: "Our first language programme: Kasem.",
  body: "The programme behind the public Kasem dictionary, built with speakers and cultural custodians. Translation tools are still in development.",
  audience: "Kasem speakers, educators and language custodians",
  status: "in-development",
  owner: "Indigen World flagship programme",
  href: "project-kassena",
  ctaLabel: "Explore Project Kassena",
};

export const SHARED_FOUNDATION: EcosystemProduct = {
  id: "backend",
  eyebrow: "Shared foundation",
  title: "Firebase, data standards and provider-independent AI infrastructure.",
  body: "Firebase provides authentication, data storage, server functions and hosting. AI features connect through reviewed backend services so providers can change without rebuilding the products.",
  audience: "Indigen World product and governance workstreams",
  status: "research",
  owner: "Shared technical workstream",
  href: "impact-governance",
  ctaLabel: "Read our principles",
};

/** The three user-facing products highlighted on Home. */
export const HOME_ECOSYSTEM_HIGHLIGHTS = ECOSYSTEM_PRODUCTS;
