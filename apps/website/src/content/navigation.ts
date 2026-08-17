/**
 * src/content/navigation.ts
 *
 * Single source of truth for every route in the app. Header nav,
 * footer nav, the router's known-path list, and each page's SEO
 * title/description all read from this one array.
 *
 * This is the single biggest structural change from the uploaded
 * template: the template was one scrolling page with `<a href="#vision">`
 * anchor links into sections. The brief's sitemap calls for distinct
 * pages (Home, About, Ecosystem, Project Kasena, Impact & Governance,
 * Get Involved, Team, Contact, Privacy, Terms) — so this file backs a
 * real router (see src/app/router.tsx) instead of scroll anchors.
 */
import type { AppRoute } from "../lib/types";

export const ROUTES: AppRoute[] = [
  {
    path: "home",
    navLabel: "Home",
    title: "Home",
    description:
      "Indigen World is a community-governed cultural technology ecosystem for language preservation, cultural learning, storytelling and creator enablement.",
  },
  {
    path: "about",
    navLabel: "About",
    title: "About",
    description:
      "The internet is growing, but too many cultures are being left behind. Learn about Indigen World's mission and the principles guiding how it builds.",
  },
  {
    path: "ecosystem",
    navLabel: "Ecosystem",
    title: "Ecosystem",
    description:
      "One ecosystem, three user-facing products: the public website, TribeStudio and the Indigen World mobile app, on a shared Firebase foundation.",
  },
  {
    path: "project-kasena",
    navLabel: "Project Kasena",
    title: "Project Kasena",
    description:
      "Project Kasena is Indigen World's flagship language cell, proving community-validated language preservation with Kasem before expanding further.",
  },
  {
    path: "impact-governance",
    navLabel: "Impact & Governance",
    title: "Impact & Governance",
    description:
      "How Indigen World governs cultural data with dignity, and the honestly-labelled MVP targets guiding the first phase of work.",
  },
  {
    path: "team",
    navLabel: "Team",
    title: "Team",
    description: "Clear ownership across the ecosystem — meet the people leading each workstream.",
  },
  {
    path: "get-involved",
    navLabel: "Get Involved",
    title: "Get Involved",
    description:
      "Contributors, validators, schools, researchers, diaspora supporters, sponsors and volunteers — find your route into Indigen World.",
  },
  {
    path: "contact",
    navLabel: "Contact",
    title: "Contact",
    description: "Start a conversation with the Indigen World team.",
  },
  {
    path: "privacy",
    title: "Privacy",
    description: "Indigen World's privacy notice.",
  },
  {
    path: "terms",
    title: "Terms",
    description: "Indigen World's terms of use.",
  },
];

/** Routes shown in the header/footer navigation, in display order. */
export const NAV_ROUTES: AppRoute[] = ROUTES.filter((route) => route.navLabel !== undefined);

/** Fast lookup from the router's stable route key to its metadata. */
export const ROUTES_BY_PATH: Record<string, AppRoute> = Object.fromEntries(
  ROUTES.map((route) => [route.path, route])
);
