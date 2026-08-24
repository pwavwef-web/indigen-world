import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const routes = [
  ["/", "HomePage.tsx"],
  ["/about", "AboutPage.tsx"],
  ["/ecosystem", "EcosystemPage.tsx"],
  ["/project-kasena", "ProjectKasenaPage.tsx"],
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
assert.match(read("src/lib/routeLoading.ts"), /ROUTE_LOADER_MIN_VISIBLE_MS = 1_100/, "branded loader remains visible long enough to register");
assert.match(ecosystemPage, /"mobile-app", "project-kasena"/, "learner filtering uses canonical product IDs");
assert.match(ecosystemPage, /aria-pressed=\{audience === key\}/, "audience filters expose their selected state");
assert.ok(!homePage.includes("ProverbCard"), "unapproved cultural expressions are not presented as public content");
assert.ok(!venaculaPage.includes("KasemStarterKit"), "the public site does not simulate a learning product");
assert.ok(!venaculaPage.includes("DialectMap"), "the public site does not publish unapproved dialect samples");
assert.match(read("index.html"), /https:\/\/indigenworld\.com\//, "static metadata uses the primary domain");
assert.match(read("public/robots.txt"), /https:\/\/indigenworld\.com\/sitemap\.xml/, "robots points to the primary sitemap");
assert.match(read("src/lib/forms.ts"), /VITE_PUBLIC_FORMS_ENDPOINT/, "forms use the reviewed endpoint boundary");
assert.match(sourceFiles, /Venacula/, "the Venacula newsletter signup is visible on the site");
assert.match(read("src/features/forms/NewsletterForm.tsx"), /consent/, "newsletter signup records explicit consent");
assert.match(app, /PAGE_COMPONENTS\[path\]\s*\?\?\s*NotFoundPage/, "unknown routes render the 404 page");
assert.match(notFound, /noindex:\s*true/, "the 404 route is excluded from indexing");
assert.match(notFound, /aria-label="Error 404"/, "the 404 state has an explicit accessible error code");
assert.match(headerStyles, /backdrop-filter:\s*blur/, "the primary navigation retains its glass treatment");

console.log(`Validated ${routes.length} public routes and core privacy/safety invariants.`);
