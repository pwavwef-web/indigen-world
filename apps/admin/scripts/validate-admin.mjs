import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const navigation = read('src/navigation.tsx');
const notFound = read('src/NotFoundPage.tsx');
const styles = read('src/styles.css');
const reports = read('src/reports/ReportsAdmin.tsx');
const reportData = read('src/reports/data.ts');

assert.match(navigation, /AdminScreen \| null/, 'unknown routes have an explicit nullable result');
assert.match(navigation, /\?\? null/, 'unknown routes do not fall back to the console');
assert.match(app, /<AdminNotFoundPage/, 'the shell renders the branded 404 page');
assert.match(notFound, /aria-label="Error 404"/, 'the not-found page exposes an accessible 404 code');
assert.match(styles, /backdrop-filter:\s*blur/, 'the admin navigation retains its glass treatment');
assert.match(navigation, /path: '\/reports'/, 'community reports are reachable from admin navigation');
assert.match(navigation, /<ReportsAdmin/, 'the reports route renders the moderation queue');
assert.match(reportData, /collection\(db, 'communityReports'\)/, 'the moderation queue reads community reports');
assert.match(reports, /setCommunityReportStatus/, 'admins can move reports through moderation statuses');

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
const creators = read('src/creators/CreatorsAdmin.tsx');
assert.match(creators, /<LexicalForms forms=\{s\.forms\}/,
  'the review card renders the recorded paradigm');
assert.match(creators, /pronounCheck\(forms\.definite, forms\.pronoun\)/,
  'the review card runs the determiner rule over the recorded pronoun');
// It reports; it must never gate a decision.
assert.doesNotMatch(creators, /disabled=\{[^}]*pronounCheck/,
  'the pronoun check never disables a review action');

console.log('Validated admin routing, 404 recovery, navigation treatment, and the Kasem morphology mirror.');
