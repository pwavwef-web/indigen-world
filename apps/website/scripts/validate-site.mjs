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
  ["/team", "TeamPage.tsx"],
  ["/contact", "ContactPage.tsx"],
  ["/privacy", "PrivacyPage.tsx"],
  ["/terms", "TermsPage.tsx"],
];

const pageIndex = read("src/pages/index.ts");
const sitemap = read("public/sitemap.xml");
for (const [route, page] of routes) {
  assert.ok(pageIndex.includes(`./${page.replace(".tsx", "")}`), `${page} is lazy-loaded`);
  assert.ok(sitemap.includes(`https://indigen-world.web.app${route}`), `${route} is in sitemap.xml`);
}

const sourceFiles = [
  "src/App.tsx",
  "src/app/router.tsx",
  "src/components/Header.tsx",
  "src/components/Footer.tsx",
  "src/features/forms/ContactForm.tsx",
  "src/features/forms/GetInvolvedForm.tsx",
  "src/features/forms/WaitlistForm.tsx",
].map(read).join("\n");

assert.ok(!sourceFiles.includes("console.log"), "public journeys do not log visitor data");
assert.ok(!sourceFiles.includes("pwavwef@gmail.com"), "personal email is not exposed in the public client");
assert.ok(!read("src/app/router.tsx").includes("hashchange"), "page routing does not use URL fragments");
assert.match(read("index.html"), /href="#main-content"/, "skip link is present");
assert.match(read("src/lib/forms.ts"), /VITE_PUBLIC_FORMS_ENDPOINT/, "forms use the reviewed endpoint boundary");

console.log(`Validated ${routes.length} public routes and core privacy/safety invariants.`);
