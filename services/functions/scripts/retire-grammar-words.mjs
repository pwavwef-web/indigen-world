/**
 * Takes the words a grammar rule answers out of the guided word queue.
 *
 *     node services/functions/scripts/retire-grammar-words.mjs            # dry run
 *     node services/functions/scripts/retire-grammar-words.mjs --commit   # writes
 *
 * ── The problem ───────────────────────────────────────────────────────────
 * Ranks 1 to 7 of `wordQueue` are `the, of, to, and, a, in, is`. Every member
 * who opens the guided queue for the first time meets those first, and not one
 * of them has an answer: "what is the Kasem for *the*" is not a hard question,
 * it is a question with no referent, because definiteness in Kasem is a
 * property of the noun rather than a word. The queue was asking each of them
 * of every member, forever, and collecting skips.
 *
 * So the rows leave. The words are not deleted and nothing is lost — a retired
 * row keeps its text, its sentence and its counters, and `grammarRuleId` says
 * which rule now speaks for it.
 *
 * ── Why a draft rule is enough to retire a word ───────────────────────────
 * A rule's `status` governs whether *readers* see the explanation. It has
 * nothing to do with whether the queue question was worth asking: "the Kasem
 * for `of`" is unanswerable whether or not anybody has yet written the note
 * explaining why. Waiting for published prose before removing a bad question
 * would keep the bad question in front of members for exactly as long as the
 * prose took. The run prints which retirements are backed by a published rule
 * and which by a draft, so the gap is visible rather than silent.
 *
 * ── Why a script and not a trigger ────────────────────────────────────────
 * This runs perhaps five times in the life of the project. A Firestore trigger
 * that fans out over fifteen thousand rows on every grammar edit is machinery
 * bought with nothing.
 *
 * Re-seed safety needs no special handling: `question()` in seed-word-queue.mjs
 * never writes `status`, and `nextQueueRowState` never overwrites `retired`.
 * A client holding a retired word in its buffer already copes — the callable
 * answers `failed-precondition` and word_queue_repository.dart moves past it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';

/** Firestore's `in` operator takes at most thirty values per query. */
const IN_CHUNK = 30;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const seedFile = join(root, 'data', 'grammar-seed', 'grammar-rules.json');

const commit = process.argv.includes('--commit');

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  // Read from the seed file rather than from Firestore, so a dry run needs no
  // credentials and says exactly the same thing the commit will do.
  const rules = JSON.parse(readFileSync(seedFile, 'utf8'));

  /** lookup -> { ruleId, status } */
  const claimed = new Map();
  for (const rule of rules) {
    for (const trigger of rule.englishTriggers ?? []) {
      const lookup = String(trigger).trim().toLowerCase();
      if (!lookup) continue;
      if (claimed.has(lookup)) {
        throw new Error(
          `"${lookup}" is claimed by both ${claimed.get(lookup).ruleId} and ${rule.id}`,
        );
      }
      claimed.set(lookup, { ruleId: rule.id, status: rule.status });
    }
  }

  const lookups = [...claimed.keys()].sort();
  console.log(`${lookups.length} words claimed by grammar rules:\n  ${lookups.join(' ')}\n`);

  initializeApp({
    projectId: PROJECT_ID,
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : applicationDefault(),
  });
  const db = getFirestore();
  const collection = db.collection('wordQueue');

  const found = [];
  for (const group of chunk(lookups, IN_CHUNK)) {
    const snapshot = await collection.where('lookup', 'in', group).get();
    for (const doc of snapshot.docs) found.push(doc);
  }

  let toRetire = 0;
  let alreadyRetired = 0;
  let translated = 0;
  let fromDraft = 0;
  const batch = commit ? db.batch() : null;

  for (const doc of found) {
    const status = String(doc.get('status') ?? 'open').toLowerCase();
    const rule = claimed.get(String(doc.get('lookup') ?? '').toLowerCase());

    if (status === 'retired') {
      alreadyRetired += 1;
      continue;
    }
    // A word somebody has already answered and had approved is left exactly
    // where it is. Retiring it would discard real work over a rule written
    // afterwards, and a translated row is out of circulation anyway.
    if (status === 'translated') {
      translated += 1;
      console.log(`  keeping   ${doc.get('word')} — already translated`);
      continue;
    }

    toRetire += 1;
    if (rule.status !== 'published') fromDraft += 1;
    console.log(
      `  retiring  ${String(doc.get('word')).padEnd(8)} rank ${String(doc.get('rank')).padEnd(6)}` +
        ` → ${rule.ruleId}${rule.status === 'published' ? '' : ' (draft)'}`,
    );

    if (commit) {
      batch.update(doc.ref, {
        status: 'retired',
        retiredReason: 'grammar',
        grammarRuleId: rule.ruleId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  console.log(
    `\n${found.length} rows matched · ${toRetire} to retire ` +
      `(${fromDraft} explained only by a draft rule) · ` +
      `${alreadyRetired} already retired · ${translated} already translated`,
  );

  if (!commit) {
    console.log('\nDry run. Pass --commit to write.');
    return;
  }
  if (toRetire > 0) await batch.commit();
  console.log(`retired ${toRetire} rows`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
