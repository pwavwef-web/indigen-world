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
 * pages (Home, About, Ecosystem, Project Kassena, Impact & Governance,
 * Get Involved, Contact, Privacy, Terms) — so this file backs a
 * real router (see src/app/router.tsx) instead of scroll anchors.
 */
import type { AppRoute, DynamicRoute } from "../lib/types";

export const ROUTES: AppRoute[] = [
  { path: "labs", title: "Indigen World Labs", description: "Try new ways to learn, create, and connect with indigenous culture. Help shape what comes next.", immersive: true },
  { path: "labs/experiments", title: "Labs experiments", description: "Explore reviewed Kasem practice and private cultural storytelling experiments.", immersive: true },
  { path: "labs/kasem-practice", title: "Kasem Practice Lab", description: "Practise with reviewed Kasem meanings and expressions.", immersive: true },
  { path: "labs/cultural-story", title: "Cultural Story Builder", description: "Shape a private story with retained reviewed source notes.", immersive: true, noindex: true },
  { path: "labs/activity", title: "My Labs activity", description: "Your private practice, drafts and feedback.", immersive: true, noindex: true },
  { path: "labs/updates", title: "Labs updates", description: "Follow changes to Indigen World Labs experiments.", immersive: true },
  { path: "labs/admin", title: "Labs admin", description: "Authorised administration for Indigen World Labs.", immersive: true, noindex: true },
  {
    path: "home",
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
    path: "learn",
    navLabel: "Learn",
    title: "Learn Kasem",
    description: "Start learning Kasem with published words, recordings, saved vocabulary, source-based spelling and grammar guides, everyday expressions and experimental practice.",
  },
  {
    path: "ecosystem",
    navLabel: "Ecosystem",
    title: "Ecosystem",
    description:
      "One ecosystem, three user-facing products: the public website, TribeStudio and the Indigen World mobile app, on a shared Firebase foundation.",
  },
  {
    path: "project-kassena",
    navLabel: "Project Kassena",
    title: "Project Kassena",
    description:
      "Project Kassena is Indigen World's flagship Kasem-language programme and the first implementation of its community-validated language-cell model.",
  },
  {
    path: "dictionary",
    navLabel: "Dictionary",
    title: "Kasem Dictionary",
    description:
      "Search Project Kassena's public web dictionary by Kasem, English or dialect, with pronunciation, examples, cultural context and attribution.",
  },
  {
    // The contributor's entry point: the open everyday-expressions campaign,
    // its task, its review process and the expressions already published.
    path: "contribute",
    navLabel: "Contribute",
    title: "Share a Kasem expression",
    description:
      "Share an everyday Kasem expression with its meaning, context and source. A Kasem-speaking reviewer checks every one before it is published as an expression.",
  },
  {
    path: "progress",
    immersive: true,
    navLabel: "Our Progress",
    title: "Help fill the jars",
    description:
      "Follow community contributions bringing Indigen World closer to our planned launch targets across words, expressions, sentences, literature, audio and video.",
  },
  {
    path: "impact-governance",
    title: "Impact & Governance",
    description:
      "How Indigen World governs cultural data with dignity, and the honestly-labelled MVP targets guiding the first phase of work.",
  },
  {
    path: "get-involved",
    title: "Get Involved",
    description:
      "Contributors, validators, schools, researchers, diaspora supporters, sponsors and volunteers — find your route into Indigen World.",
  },
  {
    path: "contact",
    title: "Contact",
    description: "Start a conversation with the Indigen World team.",
  },
  {
    path: "privacy",
    title: "Privacy",
    description: "How Indigen World handles information across the website, dictionary, mobile app, TribeStudio and Labs, with choices for consent, advertising and privacy requests.",
  },
  {
    path: "terms",
    title: "Terms",
    description: "Indigen World's terms of use.",
  },
  {
    // The song as an interactive music film. No navLabel: it is shared and
    // linked to rather than browsed to, and it replaces the site chrome with
    // its own full-screen stage.
    path: "beyond-the-reef",
    title: "Beyond the Reef",
    description:
      "An interactive music film: the song Beyond the Reef with rising, synchronised lyrics and a journey from the shore to the open sea.",
    immersive: true,
    ogImage: "/beyond-the-reef/images/social-cover.jpg",
    ogImageAlt: "A small wooden outrigger canoe sailing through a gap in a coral reef at sunrise, with the title Beyond the Reef",
  },
  {
    // Where a post shared out of the app lands. No navLabel: it is only ever
    // reached by following a link, never by browsing the site.
    //
    // noindex because the prerendered HTML for this route cannot describe any
    // particular post — the post is fetched in the browser — so every one of
    // these URLs would otherwise be indexed under one generic title.
    path: "post",
    title: "Community post",
    description:
      "A post from the Indigen World community. Open it in the Indigen app to reply, react and follow the conversation.",
    noindex: true,
  },
  {
    // Where a community shared out of the app lands. Like the post page: no
    // navLabel, and noindex because the prerendered HTML cannot describe any
    // one community.
    path: "communities",
    title: "Community on Indigen",
    description:
      "A community on Indigen World. Open it in the Indigen app to join, ask to join a private community, and post.",
    noindex: true,
  },
  {
    // Where Paystack returns an advertiser after checkout. No navLabel: it is
    // a destination people are sent to, never one they would go looking for.
    path: "ads/payment-complete",
    title: "Advert checkout",
    description:
      "Your Paystack checkout has closed. Return to Indigen to verify the campaign's payment status.",
    noindex: true,
  },
  {
    // Private-distribution tester reward claim. Intentionally omitted from
    // site navigation and sitemap; only the testing team shares this URL.
    path: "founding-tester-claim-7q4m9x2k",
    title: "Founding Tester reward claim",
    description: "Submit the details needed to prepare your Indigen World Founding Tester recognition.",
    noindex: true,
  },
];

/**
 * Routes that carry an id in the segment after them.
 *
 * The router matches these by prefix, so `/post/abc123` resolves to the `post`
 * page with `params.postId === "abc123"` instead of falling through to the 404
 * page. Every entry here needs a matching Hosting rewrite in firebase.json —
 * Hosting serves files, and `dist/post/abc123/index.html` does not exist.
 */
export const DYNAMIC_ROUTES: DynamicRoute[] = [
  { path: "post", param: "postId" },
  { path: "communities", param: "communityId" },
];

/** Routes shown in the header navigation, in display order. */
export const NAV_ROUTES: AppRoute[] = ROUTES.filter((route) => route.navLabel !== undefined);

/** Fast lookup from the router's stable route key to its metadata. */
export const ROUTES_BY_PATH: Record<string, AppRoute> = Object.fromEntries(
  ROUTES.map((route) => [route.path, route])
);
