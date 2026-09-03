import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const routes = [
  ["/", "HomePage.tsx"],
  ["/about", "AboutPage.tsx"],
  ["/ecosystem", "EcosystemPage.tsx"],
  ["/project-kassena", "ProjectKasenaPage.tsx"],
  ["/dictionary", "DictionaryPage.tsx"],
  ["/impact-governance", "ImpactGovernancePage.tsx"],
  ["/get-involved", "GetInvolvedPage.tsx"],
  ["/contact", "ContactPage.tsx"],
  ["/privacy", "PrivacyPage.tsx"],
  ["/terms", "TermsPage.tsx"],
];

const pageIndex = read("src/pages/index.ts");
const app = read("src/App.tsx");
const notFound = read("src/pages/NotFoundPage.tsx");
const headerStyles = read("src/styles/header.css");
const sitemap = read("public/sitemap.xml");
const ecosystemPage = read("src/pages/EcosystemPage.tsx");
const homePage = read("src/pages/HomePage.tsx");
const venaculaPage = read("src/pages/ProjectKasenaPage.tsx");
const getInvolvedPage = read("src/pages/GetInvolvedPage.tsx");
const contactPage = read("src/pages/ContactPage.tsx");
const dictionaryPage = read("src/pages/DictionaryPage.tsx");
const dictionaryData = read("src/features/dictionary/dictionaryData.ts");
const firebaseConfig = read("../../firebase.json");
const websiteHosting = firebaseConfig.slice(
  firebaseConfig.indexOf('"site": "indigen-world"'),
  firebaseConfig.indexOf('"site": "indigen-admin"')
);
for (const [route, page] of routes) {
  assert.ok(pageIndex.includes(`./${page.replace(".tsx", "")}`), `${page} is lazy-loaded`);
  assert.ok(sitemap.includes(`https://indigenworld.com${route}`), `${route} is in sitemap.xml`);
}

const sourceFiles = [
  "src/App.tsx",
  "src/app/router.tsx",
  "src/components/Header.tsx",
  "src/components/Footer.tsx",
  "src/features/forms/ContactForm.tsx",
  "src/features/forms/GetInvolvedForm.tsx",
  "src/features/forms/NewsletterForm.tsx",
].map(read).join("\n");

assert.ok(!sourceFiles.includes("console.log"), "public journeys do not log visitor data");
assert.ok(!sourceFiles.includes("pwavwef@gmail.com"), "personal email is not exposed in the public client");
assert.ok(!read("src/app/router.tsx").includes("hashchange"), "page routing does not use URL fragments");
assert.match(app, /href="#main-content"/, "skip link is present in the styled app shell");
assert.ok(app.indexOf('href="#main-content"') < app.indexOf("<Header />"), "skip link is the first keyboard destination");
assert.ok(app.indexOf("<Header />") < app.indexOf("<Suspense") && app.indexOf("<Suspense") < app.indexOf("<Footer />"), "route loading stays inside the persistent site shell");
assert.match(read("src/styles/base.css"), /\.skip-link\s*\{[\s\S]*?translateY\(-150%\)/, "skip link is hidden until focused");
assert.match(read("src/styles/base.css"), /\.skip-link:focus\s*\{[\s\S]*?translateY\(0\)/, "focused skip link is visible");
assert.match(read("src/lib/routeLoading.ts"), /ROUTE_LOADER_DELAY_MS = 100/, "loader uses a short grace period");
assert.ok(!read("src/lib/routeLoading.ts").includes("MIN_VISIBLE"), "route loading has no artificial minimum duration");
assert.match(read("src/lib/routeLoading.ts"), /return modulePromise;/, "route bundles resolve as soon as they load");
assert.match(headerStyles, /\.mobile-nav nav\s*\{[\s\S]*?overflow-y:\s*hidden/, "collapsed mobile navigation does not expose a scrollbar");
assert.match(headerStyles, /\.mobile-nav--open nav\s*\{[\s\S]*?overflow-y:\s*auto/, "open mobile navigation remains scrollable");
assert.match(ecosystemPage, /const PUBLIC_PRODUCTS/, "the product grid is separated from programmes and infrastructure");
assert.match(ecosystemPage, /learners: \["mobile-app", "public-website"\]/, "learner filtering uses only public product IDs");
assert.match(ecosystemPage, /Partly live/, "the publishing workflow exposes its current status");
assert.match(ecosystemPage, /aria-pressed=\{audience === key\}/, "audience filters expose their selected state");
assert.ok(!homePage.includes("ProverbCard"), "unapproved cultural expressions are not presented as public content");
assert.ok(!venaculaPage.includes("KasemStarterKit"), "the public site does not simulate a learning product");
assert.ok(!venaculaPage.includes("DialectMap"), "the public site does not publish unapproved dialect samples");
assert.match(read("index.html"), /https:\/\/indigenworld\.com\//, "static metadata uses the primary domain");
assert.match(read("public/robots.txt"), /https:\/\/indigenworld\.com\/sitemap\.xml/, "robots points to the primary sitemap");
assert.match(read("src/lib/forms.ts"), /VITE_PUBLIC_FORMS_ENDPOINT/, "forms use the reviewed endpoint boundary");
assert.match(sourceFiles, /Venacula/, "the Venacula newsletter signup is visible on the site");
assert.ok(!venaculaPage.includes("Venacula starts"), "the programme is not presented as Venacula");
assert.match(venaculaPage, /Venacula is the separate Indigen World newsletter/, "programme and newsletter names are distinguished");
assert.match(read("src/features/forms/NewsletterForm.tsx"), /consent/, "newsletter signup records explicit consent");
assert.ok(!getInvolvedPage.includes("NewsletterForm"), "Get Involved does not duplicate the footer newsletter form");
assert.match(contactPage, /mailto:hi@indigenworld\.com/, "contact page provides a fallback email route");
assert.match(contactPage, /within five working days/, "contact page sets a response expectation");
assert.match(dictionaryPage, /Search Kasem, English, or dialect/, "dictionary exposes the mobile app search journey");
assert.match(dictionaryData, /where\("isPublished", "==", true\)/, "dictionary requests published records only");
assert.match(dictionaryPage, /SAVED_WORDS_KEY/, "dictionary saves words on the visitor's device");
assert.match(dictionaryPage, /role=\{mobileOpen \? "dialog" : undefined\}/, "mobile dictionary details use dialog semantics");
assert.match(dictionaryPage, /element\.inert = true/, "mobile dictionary details isolate background content");
assert.match(dictionaryPage, /returnFocus\.focus\(\)/, "mobile dictionary details restore trigger focus");
assert.match(app, /PAGE_COMPONENTS\[path\]\s*\?\?\s*NotFoundPage/, "unknown routes render the 404 page");
assert.match(notFound, /noindex:\s*true/, "the 404 route is excluded from indexing");
assert.match(notFound, /aria-label="Error 404"/, "the 404 state has an explicit accessible error code");
assert.match(read("scripts/prerender-meta.mjs"), /dist\/404\.html/, "the build creates a custom hosting 404 page");
assert.ok(
  !websiteHosting.match(/"source":\s*"\*\*"[\s\S]*?"destination":\s*"\/index\.html"/),
  "website hosting does not rewrite unknown paths to HTTP 200"
);
assert.match(headerStyles, /backdrop-filter:\s*blur/, "the primary navigation retains its glass treatment");

// ── Shared post links ────────────────────────────────────────────────────────
// The app shares https://indigenworld.com/post/<id>. Every assertion below is
// one link in the chain between that URL and something other than a 404; break
// any one of them and shared posts silently stop working, which is exactly how
// this route came to be missing in the first place.
const postPage = read("src/pages/PostPage.tsx");
const appLinks = read("src/content/appLinks.ts");
const navigationSource = read("src/content/navigation.ts");
const shareLink = read("../../apps/mobile/lib/features/community/community_actions.dart");

assert.match(shareLink, /https:\/\/indigenworld\.com\/post\/\$\{post\.id\}/, "the app shares /post/<id> on this domain");
assert.match(navigationSource, /path: "post"/, "the post route has prerendered metadata");
assert.match(navigationSource, /DYNAMIC_ROUTES: DynamicRoute\[\] = \[\{ path: "post", param: "postId" \}\]/, "the router knows /post/<id> carries an id");
assert.match(read("src/app/router.tsx"), /export function matchRoute/, "the router resolves dynamic routes");
assert.match(read("src/pages/index.ts"), /post: lazy\(/, "the post route has a page component");
assert.match(
  websiteHosting,
  /"source":\s*"\/post\/\*\*"[\s\S]*?"destination":\s*"\/post\/index\.html"/,
  "hosting serves the post page for every post id"
);
assert.ok(
  !websiteHosting.match(/"ignore":\s*\[[^\]]*"\*\*\/\.\*"/),
  "hosting does not ignore dotfiles, which would drop .well-known from every deploy"
);
assert.match(websiteHosting, /"source":\s*"\*\*\/index\.html"/, "every route's entry document is served uncached");
assert.match(postPage, /noindex: route\.noindex/, "the post route is excluded from indexing");
assert.match(postPage, /status === "missing"/, "a deleted post gets an explanation rather than a blank page");
assert.match(postPage, /<AppHandoff postId=\{postId\} \/>/, "every post-page state offers the app");
assert.match(appLinks, /APP_STORE_URL: string \| null = null/, "no store link is advertised before the listing exists");
assert.ok(
  read("src/features/community/postData.ts").includes(String.raw`/^https:\/\/\S+$/i.test`),
  "member-supplied media and avatar URLs are restricted to https"
);
assert.match(read("config/app-links.json"), /"sha256CertFingerprints"/, "the app-link association config is present");
assert.match(
  read("scripts/emit-well-known.mjs"),
  /sha256CertFingerprints\.length === 0/,
  "an unconfigured association file is skipped rather than shipped wrong"
);

console.log(`Validated ${routes.length} public routes, the shared-post link chain, and core privacy/safety invariants.`);
