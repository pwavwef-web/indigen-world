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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const notFound = read('src/NotFoundPage.tsx');
const publicLayout = read('src/creator/PublicLayout.tsx');
const studioLayout = read('src/creator/StudioLayout.tsx');
const profilePage = read('src/creator/pages/ProfilePage.tsx');
const creatorStyles = read('src/creator/creator.css');
const shellStyles = read('src/creator/studio-shell.css');

// Route-based code-splitting: pages must be lazy-loaded, not statically imported.
const LAZY_PAGES = [
  'LandingPage',
  'JoinPage',
  'DashboardPage',
  'ProfilePage',
  'OpportunitiesPage',
  'SubmissionsPage',
  'SubmissionNewPage',
  'StudioVideoPage',
  'NotificationsPage',
  'LexiconWorkspace',
  'DictionaryPage',
];
for (const page of LAZY_PAGES) {
  assert.match(app, new RegExp(`const ${page} = named\\(`), `${page} is lazy-loaded in App.tsx`);
}
assert.match(app, /<Suspense/, 'App uses a Suspense boundary for lazy routes');
assert.match(app, /<ErrorBoundary>/, 'App is wrapped in an ErrorBoundary');
assert.match(app, /<NotFoundPage variant="studio"/, 'unknown studio routes render the branded 404 page');
assert.match(app, /<PublicLayout><NotFoundPage/, 'unknown public routes render the branded 404 page');
assert.match(notFound, /aria-label="Error 404"/, 'the not-found page exposes an accessible 404 code');
assert.match(publicLayout, /aria-current=/, 'public navigation exposes its active route');
assert.match(studioLayout, /aria-current=/, 'studio navigation exposes its active route');
assert.match(shellStyles, /backdrop-filter:\s*blur/, 'navigation retains its glass treatment');
assert.match(profilePage, /className="profile-hero"/, 'profile has a clear identity hero');
assert.match(profilePage, /aria-label="Profile sections"/, 'profile has section navigation');
assert.match(profilePage, /className="profile-savebar"/, 'profile has a persistent save surface');

// The dictionary desk: a contributor at a keyboard cannot type ɩ, ʋ, ɛ, ɔ, ŋ or
// ə, and 785 of the 1200 published entries carry at least one of them. A form
// without the palette is one on which two thirds of the language is entered
// wrongly, so its presence is an invariant rather than a nicety.
const dictionaryPage = read('src/creator/pages/DictionaryPage.tsx');
assert.match(dictionaryPage, /KasemPalette/, 'the dictionary desk offers the Kasem letters');
assert.match(dictionaryPage, /aria-label="Kasem letters"/, 'the letter palette is labelled for screen readers');
assert.match(dictionaryPage, /Add another meaning/, 'the dictionary desk takes more than one meaning');
assert.match(dictionaryPage, /EntryPreview/, 'the dictionary desk previews the published entry');
// Guidance, never a gate: nothing in the completeness meter may block a send.
assert.ok(
  !/disabled=\{[^}]*progress\.score/.test(dictionaryPage),
  'the completeness meter never blocks submission',
);

// ── The workspace runs on the shared console kit ───────────────────────────
//
// The kit is shared with the admin console, so it is read from the package:
// a change that breaks the contract breaks both consoles, and this is one of
// the two places that notices.
const kitDir = resolve(root, '../../packages/console-ui/src');
const readKit = (file) => readFileSync(resolve(kitDir, file), 'utf8');
const kit = readKit('kit.css');

assert.match(studioLayout, /className={`studio iwx/,
  'the workspace shell carries the kit scope class the package styles hang off');
assert.match(studioLayout, /CommandPalette/, 'the workspace mounts the command palette');
assert.match(studioLayout, /studio__status/, 'the workspace reports its state in a status rail');
assert.match(shellStyles, /overflow-x: clip/,
  'the page body contains stray width instead of scrolling sideways');
assert.match(kit, /\.table-shell \{[\s\S]*?overflow-x: auto/,
  'the table shell is the only element allowed to scroll sideways');

// No table may escape its scroll container. A table is the one piece of markup
// routinely wider than the window: wrapped it scrolls inside its own box,
// unwrapped it widens the page for every other screen too.
const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.tsx')) sourceFiles.push(full);
  }
})(resolve(root, 'src'));

const unwrappedTables = [];
for (const file of sourceFiles) {
  const fileLines = readFileSync(file, 'utf8').split('\n');
  fileLines.forEach((line, index) => {
    if (!/^\s*<table className=/.test(line)) return;
    const preceding = fileLines.slice(Math.max(0, index - 3), index).join(' ');
    if (!preceding.includes('<TableShell')) {
      unwrappedTables.push(`${relative(root, file)}:${index + 1}`);
    }
  });
}
assert.deepEqual(unwrappedTables, [],
  'every JSX table is wrapped in <TableShell> so it scrolls instead of widening the page');

// Governance: AI-training permission is off by default in the submission wizard.
const wizard = read('src/creator/pages/SubmissionNewPage.tsx');
assert.ok(wizard.includes('const [permAi, setPermAi] = useState(existing?.permissions.aiTraining ?? false)'),
  'AI-training permission defaults to false for new submissions');
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

console.log(
  `Validated TribeStudio: ${LAZY_PAGES.length} lazy routes, ${errorStatePages} data pages with ` +
    `error states, and the shared console kit across ${sourceFiles.length} screens ` +
    `(every table contained).`,
);
