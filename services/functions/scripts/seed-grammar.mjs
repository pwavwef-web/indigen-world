/**
 * Uploads data/grammar-seed/grammar-rules.json into the `grammarRules` collection.
 *
 *     node services/functions/scripts/seed-grammar.mjs            # dry run
 *     node services/functions/scripts/seed-grammar.mjs --commit   # writes
 *
 * Uses Application Default Credentials, so run `gcloud auth application-default
 * login` first if it refuses to start.
 *
 * ── Why a script and not a callable ───────────────────────────────────────
 * Because there is one author. A `requireRole(req, 'validator')` callable plus
 * a form in TribeStudio is a real week of work to build a submission workflow
 * for a queue with a single participant, and the rules already say
 * `allow write: if false`, so adding that callable later needs no rules change
 * and breaks nothing written here.
 *
 * ── Why the noun classes are generated rather than written in the JSON ────
 * `NOUN_CLASSES` in `services/functions/src/kasem-morphology.ts` is what the
 * publication step actually induces classes against. If the public document
 * repeated that list by hand, the two would drift the first time somebody
 * added a class to one of them — and the drift would be invisible, because a
 * wrong class list still renders perfectly well. So the array is read from the
 * built module at seed time and there is only ever one source of truth.
 *
 * Requires `npm run build:functions` first, for that import.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { NOUN_CLASSES } from '../lib/kasem-morphology.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const seedFile = join(root, 'data', 'grammar-seed', 'grammar-rules.json');

const commit = process.argv.includes('--commit');

const STATUSES = new Set(['draft', 'published']);

/**
 * The topics a rule may be about.
 *
 * Closed, and longer than what is behind it today. `tense` and `aspect` are on
 * the list with nothing written for them yet, which is the honest shape: the
 * collection has room for them and this project has not pretended to have done
 * the work.
 */
const TOPICS = new Set([
  'indefiniteness',
  'definiteness',
  'noun-class',
  'plural',
  'preposition',
  'postposition',
  'conjunction',
  'copula',
  'tense',
  'aspect',
  'negation',
  'question',
]);

/** Everything the seed owns, checked before anything is written. */
function ruleDocument(row) {
  if (!row || typeof row !== 'object') throw new Error('a rule must be an object');
  if (typeof row.id !== 'string' || !row.id) throw new Error('a rule needs an id');
  if (!TOPICS.has(row.topic)) throw new Error(`${row.id}: unknown topic ${row.topic}`);
  if (!STATUSES.has(row.status)) throw new Error(`${row.id}: unknown status ${row.status}`);

  // A published rule with nothing in it would be a blank page presented as an
  // answer, which is worse than no page. Drafts are allowed to be empty — that
  // is what a draft is for, and several here exist only to carry the triggers
  // that take an unanswerable word out of the queue.
  if (row.status === 'published' && !String(row.summary ?? '').trim()) {
    throw new Error(`${row.id}: a published rule must say something`);
  }

  const triggers = Array.isArray(row.englishTriggers)
    ? [...new Set(row.englishTriggers.map((t) => String(t).trim().toLowerCase()).filter(Boolean))]
    : [];

  return {
    id: row.id,
    topic: row.topic,
    englishTriggers: triggers,
    title: String(row.title ?? '').trim(),
    summary: String(row.summary ?? '').trim(),
    pattern: String(row.pattern ?? '').trim(),
    note: String(row.note ?? '').trim(),
    examples: Array.isArray(row.examples) ? row.examples : [],
    // Generated, never taken from the JSON. See the header.
    nounClasses: row.topic === 'noun-class' ? NOUN_CLASSES.map((entry) => ({ ...entry })) : [],
    dialect: String(row.dialect ?? '').trim(),
    status: row.status,
    schemaVersion: 1,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function main() {
  const rows = JSON.parse(readFileSync(seedFile, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('grammar-rules.json must be an array');

  // Validated in full before a single write, so a typo in the last rule cannot
  // leave the collection half-updated.
  const documents = rows.map(ruleDocument);
  const ids = new Set();
  for (const doc of documents) {
    if (ids.has(doc.id)) throw new Error(`duplicate rule id: ${doc.id}`);
    ids.add(doc.id);
  }

  const published = documents.filter((d) => d.status === 'published');
  const triggerCount = documents.reduce((n, d) => n + d.englishTriggers.length, 0);
  console.log(
    `${documents.length} rules (${published.length} published), ` +
      `${triggerCount} English triggers, ${NOUN_CLASSES.length} noun classes`,
  );
  for (const doc of documents) {
    console.log(`  ${doc.status.padEnd(9)} ${doc.id.padEnd(16)} ${doc.englishTriggers.join(' ')}`);
  }

  if (!commit) {
    console.log('\nDry run. Pass --commit to write.');
    return;
  }

  initializeApp({
    projectId: PROJECT_ID,
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : applicationDefault(),
  });
  const db = getFirestore();
  const collection = db.collection('grammarRules');

  const batch = db.batch();
  for (const doc of documents) {
    // Merged rather than replaced so `approvedBy` and `createdAt`, once a
    // validator has signed a rule off, survive a re-seed of its text.
    batch.set(
      collection.doc(doc.id),
      { ...doc, createdAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`\nwrote ${documents.length} rules`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
