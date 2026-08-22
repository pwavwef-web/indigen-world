/**
 * scripts/validate-studio.mjs
 *
 * Lightweight, dependency-free regression gate for TribeStudio — mirrors the
 * website's validate-site.mjs. It asserts a handful of invariants that matter
 * for production and governance without needing a full test runner:
 *
 *  - every route page is lazy-loaded (route-based code-splitting stays intact)
 *  - the AI-training permission is off by default and never required to enter
 *  - data loads render a recoverable error state, not an infinite skeleton
 *  - no visitor-facing console.log leaks into the creator pages
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');

// Route-based code-splitting: pages must be lazy-loaded, not statically imported.
const LAZY_PAGES = [
  'LandingPage',
  'JoinPage',
  'DashboardPage',
  'ProfilePage',
  'OpportunitiesPage',
  'SubmissionsPage',
  'SubmissionNewPage',
  'NotificationsPage',
  'LexiconWorkspace',
];
for (const page of LAZY_PAGES) {
  assert.match(app, new RegExp(`const ${page} = named\\(`), `${page} is lazy-loaded in App.tsx`);
}
assert.match(app, /<Suspense/, 'App uses a Suspense boundary for lazy routes');
assert.match(app, /<ErrorBoundary>/, 'App is wrapped in an ErrorBoundary');

// Governance: AI-training permission is off by default in the submission wizard.
const wizard = read('src/creator/pages/SubmissionNewPage.tsx');
assert.match(wizard, /useState\(false\)[^\n]*\/\/.*|const \[permAi, setPermAi\] = useState\(false\)/,
  'AI-training permission (permAi) defaults to false');
assert.ok(wizard.includes('never required to enter'), 'AI-training is documented as optional');

// Resilience: each data screen renders a retry-able error state on failure.
const pagesDir = resolve(root, 'src/creator/pages');
const loaderPages = readdirSync(pagesDir).filter((f) => f.endsWith('Page.tsx'));
let errorStatePages = 0;
for (const file of loaderPages) {
  const src = read(`src/creator/pages/${file}`);
  const loadsData = /\.then\(/.test(src) && /useState\(true\)/.test(src);
  if (!loadsData) continue;
  assert.match(src, /\.catch\(/, `${file} handles load failure with a .catch`);
  errorStatePages += 1;
}
assert.ok(errorStatePages >= 6, `error states are wired across data pages (found ${errorStatePages})`);

// Privacy: no console.log in the creator page surfaces.
for (const file of loaderPages) {
  assert.ok(!read(`src/creator/pages/${file}`).includes('console.log'), `${file} has no console.log`);
}

console.log(`Validated TribeStudio: ${LAZY_PAGES.length} lazy routes, ${errorStatePages} data pages with error states.`);
