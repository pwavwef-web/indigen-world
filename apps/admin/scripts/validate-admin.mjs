import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const routes = read('src/routes.ts');
const screens = read('src/screens.tsx');
const notFound = read('src/NotFoundPage.tsx');
const main = read('src/main.tsx');
const shell = read('src/ui/Shell.tsx');
const adminCss = read('src/ui/admin.css');
const attention = read('src/attention.tsx');
const home = read('src/home/Home.tsx');
const finance = read('src/finance/FinanceScreens.tsx');
const financeData = read('src/finance/data.ts');
const review = read('src/review/ReviewDesk.tsx');
const reviewData = read('src/review/data.ts');
const reports = read('src/reports/ReportsAdmin.tsx');
const reportData = read('src/reports/data.ts');
const auditViewer = read('src/console/AuditLogViewer.tsx');
const contributors = read('src/contributors/ContributorsAdmin.tsx');
const contributorData = read('src/contributors/data.ts');

// ── The shell: one map, explicit 404, every tool mounted ───────────────────
assert.match(routes, /kind: 'not-found'/, 'unknown routes resolve to an explicit not-found');
assert.match(app, /<AdminNotFoundPage/, 'the shell renders the branded 404 page');
assert.match(notFound, /aria-label="Error 404"/, 'the not-found page exposes an accessible 404 code');
assert.match(app, /kind === 'denied'/, 'a route the person may not open explains the permission it needs');
const toolKeys = [...routes.matchAll(/id: '([a-z-]+)', label: '[^']+', description:[\s\S]*?tools: \[([\s\S]*?)\n    \],/g)]
  .flatMap(([, section, body]) => [...body.matchAll(/\{ id: '([a-z-]+)'/g)].map(([, tool]) => `${section}.${tool}`));
assert.equal(toolKeys.length >= 30, true, 'the section map was parsed');
for (const key of toolKeys) {
  assert.match(screens, new RegExp(`'${key.replace('.', '\\.')}':`), `${key} has a screen`);
}
assert.match(routes, /'\/contributors\/rewards': '\/finance\/redemptions'/, 'old reward links land in Finance');
assert.match(routes, /'\/reports': '\/community\/reports'/, 'old report links still resolve');

// ── TribeStudio's visual language, read from the studio itself ─────────────
for (const sheet of ['tokens', 'base', 'motion', 'components', 'shell']) {
  assert.match(main, new RegExp(`tribestudio/src/ui/${sheet}\\.css`), `the console imports TribeStudio's ${sheet}.css`);
}
assert.doesNotMatch(main, /design-tokens\/tokens\.css|web-ui\/styles\.css|console-ui\/kit\.css/,
  'the retired terracotta tokens and the old console kit are not loaded');
assert.match(main, /@fontsource-variable\/sora/, 'Sora is self-hosted for headings');
assert.match(shell, /BrandMark/, 'the top bar uses the real Indigen World mark');
assert.match(shell, /user\.photoURL/, 'the profile button shows the signed-in person’s photo');
assert.match(adminCss, /overflow-x: clip/, 'the page body contains stray width instead of scrolling sideways');
assert.match(adminCss, /\.ad-table-scroll \{[\s\S]*?overflow-x: auto/, 'wide tables scroll inside their own box');

// ── Live data only ──────────────────────────────────────────────────────────
assert.match(attention, /getCountFromServer/, 'queue counts use Firestore aggregates');
assert.match(attention, /state: 'error'/, 'a failed count is reported as unavailable, never as zero');
assert.doesNotMatch(home, /Francis|18 pending|4 open|GHC 2,400|GH₵ 2,400/, 'the home screen hardcodes nothing from the mockup');
assert.doesNotMatch(finance, /2,400|Awaiting reconciliation|Reconciled|FIN-00/, 'Finance invents no income, balance or reconciliation records');
assert.match(finance, /are not connected to this console/, 'Finance says plainly which money sources it does not show');

// ── Finance owns point redemptions ──────────────────────────────────────────
assert.match(financeData, /expectedStatus: input\.request\.status/, 'redemption decisions carry the status the reviewer saw');
assert.match(finance, /Approving does not send anything/, 'approval is never presented as delivery');
assert.match(finance, /Confirm the delivery was sent/, 'recording delivery needs an explicit confirmation');
assert.match(finance, /Enter the delivery reference/, 'recording delivery needs a reference');
assert.match(finance, /Give the contributor a reason/, 'rejection needs a reason');
assert.match(finance, /isStaleDecision/, 'a stale decision reloads instead of failing silently');
assert.match(financeData, /amountMinor/, 'money stays in integer minor units');
for (const [file, source] of [['finance', finance], ['review', review], ['contributors', contributors]]) {
  assert.doesNotMatch(source, /window\.(prompt|confirm)\(/, `${file} uses styled dialogs, not browser prompts`);
}

// ── Review Desk ──────────────────────────────────────────────────────────────
assert.match(reviewData, /expectedVersion: input\.submission\.lifecycle\?\.version/, 'review decisions are bound to the version on screen');
assert.match(reviewData, /'not-asked'/, 'a question never asked is kept apart from a "no"');
assert.match(review, /never becomes a dictionary word/, 'expressions keep their own publication destination');
assert.match(review, /publication !== 'granted'/, 'publishing needs publication permission');

// ── Screens that keep their own data contracts ──────────────────────────────
assert.match(reportData, /collection\(db, 'communityReports'\)/, 'the moderation queue reads community reports');
assert.match(reports, /setCommunityReportStatus/, 'admins can move reports through moderation statuses');
assert.match(reportData, /targetType === 'community'/, 'community reports are told apart from post reports');
assert.match(reportData, /const COMMUNITY_SPACES = 'communitySpaces'/, 'reported communities are read from communitySpaces, not the cultural registry');
assert.match(reportData, /COMMUNITY_SPACES, report\.communityId, 'posts', report\.postId/, 'a reported post inside a private community is found where it lives');
assert.match(reports, /<ReportedCommunityPanel/, 'a community report shows the community itself');
assert.match(reports, /setCommunitySpaceStatus/, 'staff can remove and restore a reported community');
assert.match(auditViewer, /log\.occurredAt/, 'the audit viewer reads the current timestamp field');
assert.match(auditViewer, /log\.target/, 'the audit viewer reads the current structured target field');

// ── No table may escape its scroll container ───────────────────────────────
//
// A table is the one piece of admin markup that is routinely wider than the
// window. Wrapped in `TableShell` it scrolls inside its own box; unwrapped it
// widens the page, and every screen scrolls sideways for one column nobody is
// looking at. This is cheaper to enforce than to rediscover.

const sourceDir = resolve(root, 'src');
const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.tsx')) sourceFiles.push(full);
  }
})(sourceDir);

const unwrappedTables = [];
for (const file of sourceFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    // Only JSX tables; the team-site export builds HTML tables inside strings.
    if (!/^\s*<table className=/.test(line)) return;
    const preceding = lines.slice(Math.max(0, index - 3), index).join(' ');
    if (!preceding.includes('<TableShell') && !preceding.includes('className="ad-table-scroll"')) {
      unwrappedTables.push(`${relative(root, file)}:${index + 1}`);
    }
  });
}
assert.deepEqual(unwrappedTables, [],
  'every JSX table sits in <TableShell> or .ad-table-scroll, so it scrolls instead of widening the page');

// ── The console keeps one table, one control set and one command surface ───
//
// The kit is shared with the TribeStudio workspace, so it is read from the
// package rather than from this app: a change that breaks the contract breaks
// it for both consoles, and this is one of the two places that notices.
const kitDir = resolve(root, '../../packages/console-ui/src');
const readKit = (file) => readFileSync(resolve(kitDir, file), 'utf8');
const dataTable = readKit('DataTable.tsx');
const kit = readKit('kit.css');
const palette = readKit('CommandPalette.tsx');

assert.match(kit, /\.table-shell \{[\s\S]*?overflow-x: auto/,
  'the kit\'s table shell is the only element allowed to scroll sideways');
assert.match(dataTable, /aria-sort/, 'sortable columns report their sort state');
assert.match(palette, /metaKey \|\| event\.ctrlKey/, 'the command palette is bound to ⌘K / Ctrl-K');
assert.match(app, /CommandPalette/, 'the shell mounts the command palette');
assert.match(contributors, /Assign expressions/, 'admins can allocate expression work');
assert.match(contributors, /Preview changes/, 'profile edits include a preview step');
assert.match(contributorData, /listExpressionContributors/, 'the contributor directory uses the admin-only server join');
assert.match(contributorData, /fetchContributorSubmissions/, 'contribution history and review use real submission records');

// ── The Kasem morphology mirror may not drift from the server ──────────────
//
// `src/creators/kasem-morphology.ts` is a copy of eight rows that
// `services/functions/src/kasem-morphology.ts` owns. A copy kept in step by
// good intentions is a copy that eventually tells a reviewer the wrong thing
// about somebody's language, so it is kept in step by this instead: the two
// tables are parsed out of both files and compared row for row.
//
// Parsing source text rather than importing is deliberate — the server file is
// TypeScript that this script cannot load, and adding a build step to the
// admin validator to check eight rows would cost more than it protects.

const serverMorphology = readFileSync(
  resolve(root, '../../services/functions/src/kasem-morphology.ts'),
  'utf8',
);
const adminMorphology = read('src/creators/kasem-morphology.ts');

/** `{ article: 'kam', pronoun: 'ka' }` → ['kam', 'ka'] */
const serverPronouns = [...serverMorphology.matchAll(
  /\{\s*article:\s*'([^']+)',\s*pronoun:\s*'([^']+)'\s*\}/g,
)].map((m) => [m[1], m[2]]);

/** `kam: 'ka',` inside the admin map. */
const adminPronounBlock = adminMorphology.match(
  /DETERMINER_PRONOUNS[^=]*=\s*\{([\s\S]*?)\};/,
);
assert.ok(adminPronounBlock, 'the admin mirror declares DETERMINER_PRONOUNS');
const adminPronouns = [...adminPronounBlock[1].matchAll(/(\w+):\s*'([^']+)'/g)]
  .map((m) => [m[1], m[2]]);

assert.ok(serverPronouns.length >= 8, 'the server pronoun table was parsed');
assert.deepEqual(
  adminPronouns,
  serverPronouns,
  'the admin determiner/pronoun table matches services/functions/src/kasem-morphology.ts',
);

const serverArticles = serverMorphology.match(
  /DEFINITE_ARTICLES:\s*readonly string\[\]\s*=\s*\[([\s\S]*?)\];/,
);
const adminArticles = adminMorphology.match(
  /DEFINITE_ARTICLES:\s*readonly string\[\]\s*=\s*\[([\s\S]*?)\];/,
);
assert.ok(serverArticles && adminArticles, 'both determiner lists were parsed');
const words = (block) => [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
assert.deepEqual(
  words(adminArticles[1]),
  words(serverArticles[1]),
  'the admin determiner list matches the server determiner list',
);

// Every determiner has a pronoun, and the pronoun is stored rather than sliced
// off the spelling: `wom` gives `o`, not `wo`, and an implementation that
// dropped the last letter would be wrong about exactly that one real word.
assert.equal(adminPronouns.length, words(adminArticles[1]).length,
  'every determiner has a pronoun on record');
assert.deepEqual(
  adminPronouns.find(([article]) => article === 'wom'),
  ['wom', 'o'],
  'wom takes the pronoun o, not wo — the row that forbids a slice(0, -1)',
);

// The desk has to render the paradigm before an opinion about it means
// anything: the forms reached a published entry without a reviewer ever seeing
// them, which is the gap `LexicalForms` closes.
assert.match(review, /<LexicalForms forms=\{s\.forms\}/,
  'the review desk renders the recorded paradigm');
assert.match(review, /pronounCheck\(forms\.definite, forms\.pronoun\)/,
  'the review desk runs the determiner rule over the recorded pronoun');
// It reports; it must never gate a decision.
assert.doesNotMatch(review, /disabled=\{[^}]*pronounCheck/,
  'the pronoun check never disables a review action');

console.log(
  `Validated the section map, 404 recovery, the TribeStudio foundation, Finance and Review safeguards ` +
    `(${sourceFiles.length} screens, every table contained), and the Kasem morphology mirror.`,
);
