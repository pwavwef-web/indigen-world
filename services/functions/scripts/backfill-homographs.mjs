/**
 * Gives every existing dictionary entry a `headwordKey` and a `homographIndex`.
 *
 *     node services/functions/scripts/backfill-homographs.mjs            # dry run
 *     node services/functions/scripts/backfill-homographs.mjs --commit   # writes
 *
 * Uses Application Default Credentials, so run `gcloud auth application-default
 * login` first if it refuses to start. Requires `npm run build:functions`, for
 * the import below.
 *
 * ── Why a migration is unavoidable here ───────────────────────────────────
 * `creators.ts` now assigns a sense number when an entry is published, and it
 * finds the entry's siblings with an equality query on `headwordKey`. Neither
 * field exists on anything published before today — which is all 1200 rows.
 *
 * That leaves the numbering half-blind rather than merely incomplete. A new
 * sense of `ni` would query for peers, find none of the eight `ni` entries
 * already in the archive because none of them carries the key, and be handed
 * the number 1 — a second entry claiming to be the first. And on the display
 * side the eight legacy rows would stay unnumbered while the new one drew a
 * superscript, which reads as though the numbered one is special rather than
 * as though they are eight different words.
 *
 * So this runs once, and after it the invariant holds for the whole
 * collection: every entry has a key, every entry has a number, and the numbers
 * under one spelling are 1..n with no gaps and no repeats.
 *
 * ── What decides who is number one ────────────────────────────────────────
 * `createdAt`, oldest first, falling back to the document id. Not the
 * alphabetical order of the meanings, not the length of the entry, not
 * anything about the words themselves — because whatever the rule is, it is
 * arbitrary, and the only property that actually matters is that running this
 * twice produces the same answer. Sorting on when the entry entered the
 * archive gives the oldest word the lowest number, which is the convention a
 * reader would guess if they thought about it at all.
 *
 * ── Idempotent, and why that is load-bearing ──────────────────────────────
 * An entry that already carries a number keeps it. So a re-run after a partial
 * failure finishes the job rather than renumbering what succeeded, and a
 * re-run months later numbers only what has arrived since. This matters more
 * than it looks: a sense number is a citation, and a migration that reshuffled
 * them on its second run would break every note, saved word and Kawuri answer
 * that had quoted one.
 */

import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { headwordKey, MAX_HOMOGRAPH_INDEX } from '../lib/kasem-homographs.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';
const commit = process.argv.includes('--commit');

/** Firestore's own ceiling on one batch. */
const BATCH_LIMIT = 400;

/** The Kasem side of a document, through the same fallback chain the readers
 * use. Three generations of schema live in this collection at once. */
function kasemOf(data) {
  for (const key of ['kasemText', 'headword', 'kasem', 'word']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** Sorts oldest first, then by id, so two runs agree. */
function createdAtMillis(data) {
  const value = data.createdAt;
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

async function main() {
  initializeApp({
    projectId: PROJECT_ID,
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : applicationDefault(),
  });
  const db = getFirestore();

  // Every row, published or not. An unpublished entry's number is still spent
  // — reusing it would point existing citations at a different word — so it
  // has to be counted here or the next publish would hand it out again.
  const snapshot = await db.collection('dictionaryEntries').get();
  console.log(`read ${snapshot.size} entries`);

  const groups = new Map();
  let unreadable = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const kasem = kasemOf(data);
    const key = headwordKey(kasem);
    if (!key) {
      unreadable += 1;
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      id: doc.id,
      kasem,
      key,
      existing: Number(data.homographIndex ?? 0) || 0,
      hasKey: typeof data.headwordKey === 'string' && data.headwordKey === key,
      createdAt: createdAtMillis(data),
    });
  }

  const writes = [];
  let numbered = 0;
  let alreadyNumbered = 0;
  const collisions = [];

  for (const [key, rows] of groups) {
    rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

    // Numbers already handed out are honoured exactly as they are, gaps
    // included, and only the unnumbered rows are filled into what is left.
    const taken = new Set(rows.filter((row) => row.existing > 0).map((row) => row.existing));
    let next = 1;
    for (const row of rows) {
      if (row.existing > 0) {
        alreadyNumbered += 1;
        if (!row.hasKey) writes.push({ id: row.id, headwordKey: key });
        continue;
      }
      while (taken.has(next)) next += 1;
      if (next > MAX_HOMOGRAPH_INDEX) {
        collisions.push(`${key} has more than ${MAX_HOMOGRAPH_INDEX} entries`);
        break;
      }
      taken.add(next);
      writes.push({ id: row.id, headwordKey: key, homographIndex: next });
      numbered += 1;
      next += 1;
    }
  }

  const homographs = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  const affected = homographs.reduce((n, [, rows]) => n + rows.length, 0);

  console.log(
    `${groups.size} distinct headwords; ${homographs.length} of them are shared ` +
      `by ${affected} entries`,
  );
  console.log(`${numbered} entries to number, ${alreadyNumbered} already numbered`);
  if (unreadable > 0) {
    console.log(`${unreadable} entries have no readable Kasem side and were skipped`);
  }
  for (const warning of collisions) console.warn(`  ! ${warning}`);

  // The largest groups, because they are the ones a reviewer should look at:
  // a headword with eight entries is either a genuinely busy spelling or a
  // sign that the same word has been contributed eight times.
  const busiest = homographs
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);
  if (busiest.length > 0) {
    console.log('\nbusiest spellings:');
    for (const [key, rows] of busiest) console.log(`  ${rows.length}x  ${key}`);
  }

  if (!commit) {
    console.log('\nDry run. Pass --commit to write.');
    return;
  }

  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) {
      const { id, ...fields } = write;
      // Merged, never replaced: this migration owns two fields and must not
      // touch anything else on an entry.
      batch.set(
        db.collection('dictionaryEntries').doc(id),
        { ...fields, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
    console.log(`wrote ${Math.min(i + BATCH_LIMIT, writes.length)}/${writes.length}`);
  }
  console.log(`\ndone — ${writes.length} entries updated`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
