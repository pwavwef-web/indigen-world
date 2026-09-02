/**
 * Uploads data/word-seed/word-queue.ndjson into the `wordQueue` collection.
 *
 *     node services/functions/scripts/seed-word-queue.mjs            # dry run
 *     node services/functions/scripts/seed-word-queue.mjs --commit   # writes
 *
 * Uses Application Default Credentials, so run `gcloud auth application-default
 * login` first if it refuses to start.
 *
 * ── Why this merges rather than overwrites ────────────────────────────────
 * The seed owns the *question* — the word, its sentence, its attribution and
 * where it sits in the queue. It does not own the *answer*: `status`,
 * `approvedCount`, `pendingCount` and `skipCount` are written by the app and
 * by the review workflow as members work through the list. A blind `set` would
 * reopen every word the community had already translated the moment somebody
 * re-ran the seed, which is a mistake you only get to make once. So the
 * counters are written on create and left strictly alone on update.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';

/** Firestore's own ceiling is 500 writes per batch. */
const BATCH_SIZE = 400;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const seedFile = join(root, 'data', 'word-seed', 'word-queue.ndjson');

const commit = process.argv.includes('--commit');

/** Fields the seed owns and may safely rewrite on every run. */
function question(row) {
  return {
    id: row.id,
    word: row.word,
    lookup: row.lookup,
    sentence: row.sentence,
    sentenceSource: row.sentenceSource,
    tatoebaId: row.tatoebaId,
    tatoebaContributor: row.tatoebaContributor,
    licence: row.licence,
    tier: row.tier,
    rank: row.rank,
  };
}

/** Fields the community owns, written once and never touched again. */
function answerDefaults() {
  return {
    status: 'open',
    approvedCount: 0,
    pendingCount: 0,
    skipCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  };
}

async function main() {
  initializeApp({
    projectId: PROJECT_ID,
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : applicationDefault(),
  });
  const db = getFirestore();
  const collection = db.collection('wordQueue');

  const existing = new Set();
  if (commit) {
    // One read of the ids already there, so the run can tell a create from an
    // update without a get() per row — 15,000 point reads to avoid 15,000
    // point reads would be a poor trade.
    process.stdout.write('reading existing ids… ');
    const snapshot = await collection.select().get();
    for (const doc of snapshot.docs) existing.add(doc.id);
    console.log(`${existing.size} already present`);
  }

  const reader = createInterface({
    input: createReadStream(seedFile, 'utf8'),
    crlfDelay: Infinity,
  });

  let batch = commit ? db.batch() : null;
  let queued = 0;
  let created = 0;
  let updated = 0;
  let total = 0;

  for await (const line of reader) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    total += 1;

    const isNew = !existing.has(row.id);
    if (isNew) created += 1;
    else updated += 1;

    if (!commit) continue;

    batch.set(
      collection.doc(row.id),
      isNew ? { ...question(row), ...answerDefaults() } : question(row),
      { merge: true },
    );
    queued += 1;

    if (queued >= BATCH_SIZE) {
      await batch.commit();
      process.stdout.write(`\rwritten ${total}/15000`);
      batch = db.batch();
      queued = 0;
    }
  }

  if (commit && queued > 0) {
    await batch.commit();
    process.stdout.write(`\rwritten ${total}/15000`);
  }

  console.log();
  console.log(commit ? 'seed committed' : 'dry run — nothing written');
  console.log(`  rows in file: ${total}`);
  console.log(`  would create: ${created}`);
  console.log(`  would update: ${updated}  (question fields only)`);
  if (!commit) console.log('\nre-run with --commit to write.');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
