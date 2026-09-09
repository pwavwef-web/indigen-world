#!/usr/bin/env node
// Runs the duplicate check's own gather against the real archive, read-only.
//
// ── Why ──────────────────────────────────────────────────────────────────
// `findDictionaryEntryMatches` is built and tested against fixtures, and it
// exists for a population fixtures cannot contain: rows published before
// `headwordKey` was introduced, which the `headwordKey ==` query cannot see at
// all. 0.1.16 shipped it with "the duplicate check has never run against the
// real archive... the first real use will be the first evidence that it reaches
// them" as a known gap, and a first real use that happens during a review is a
// bad place to find out.
//
// So this asks the archive three questions and answers them with counts:
//
//   1. how many rows carry no `headwordKey`, i.e. how big the population the
//      extra queries exist for actually is;
//   2. whether the four-query gather finds a match the key query alone misses,
//      run for real over every spelling that occurs more than once; and
//   3. which spellings are genuinely filed twice — the duplicates a reviewer
//      would be shown.
//
// Reads only. It opens no transaction, writes no document and calls no
// callable; it re-implements the gather over a full read so it can report on
// the whole collection at once rather than one headword at a time.
//
// Usage:
//   node services/functions/scripts/audit-duplicate-check.mjs --project <id>

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const projectId = arg('project');
if (!projectId) {
  console.error('--project is required; no production project is assumed.');
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST && !projectId.startsWith('demo-')) {
  console.error('Refusing to point a live project at the emulator.');
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();

/// The same normalisation `headwordKey` applies, kept in step with
/// `services/functions/src/kasem-homographs.ts`. Compared against the stored
/// key below, so a drift between the two shows up as a mismatch rather than
/// being silently assumed away.
const fold = (raw) =>
  String(raw ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase();

const snap = await db.collection('dictionaryEntries').get();
const rows = snap.docs.map((doc) => ({
  id: doc.id,
  kasemText: doc.get('kasemText') ?? '',
  headwordKey: doc.get('headwordKey') ?? null,
  isPublished: doc.get('isPublished') === true,
  mergedInto: doc.get('mergedInto') ?? null,
}));

const withoutKey = rows.filter((row) => !row.headwordKey);
const keyMismatch = rows.filter(
  (row) => row.headwordKey && row.headwordKey !== fold(row.kasemText),
);
const noHeadword = rows.filter((row) => !String(row.kasemText).trim());

// Spellings filed more than once, as the check would group them.
const bySpelling = new Map();
for (const row of rows) {
  const key = row.headwordKey || fold(row.kasemText);
  if (!key) continue;
  bySpelling.set(key, [...(bySpelling.get(key) ?? []), row]);
}
const repeated = [...bySpelling.entries()].filter(([, group]) => group.length > 1);

// The question the extra queries exist to answer. `where('headwordKey', '==',
// …)` returns a row only if that row stores the key, so a pair is invisible to
// it in two different ways:
//
//   * neither row has a key — the key query returns nothing at all, and the
//     duplicate is found only by `where('kasemText', '==', …)`;
//   * one has and one has not — the key query returns half the pair, which is
//     worse than none, because the reviewer is shown a single match and told
//     that is what the archive holds.
const invisibleToKeyQuery = repeated.filter(([, group]) =>
  group.every((row) => !row.headwordKey),
);
const halfVisibleToKeyQuery = repeated.filter(
  ([, group]) =>
    group.some((row) => !row.headwordKey) && group.some((row) => row.headwordKey),
);

const say = (message) => process.stdout.write(`${message}\n`);

say(`Archive: ${rows.length} rows in dictionaryEntries (${projectId})`);
say(`  published                     ${rows.filter((r) => r.isPublished).length}`);
say(`  retired into another entry     ${rows.filter((r) => r.mergedInto).length}`);
say('');
say('── What the extra queries exist for ─────────────────────────────────');
say(`  rows with no headwordKey       ${withoutKey.length}`);
say(`  rows whose key ≠ folded text   ${keyMismatch.length}`);
say(`  rows with no kasemText at all  ${noHeadword.length}`);
say('');
say('── Spellings filed more than once ───────────────────────────────────');
say(`  repeated spellings             ${repeated.length}`);
say(`  invisible to the key query     ${invisibleToKeyQuery.length}  (neither row has a headwordKey)`);
say(`  half-visible to the key query  ${halfVisibleToKeyQuery.length}  (worse: one match shown, not two)`);
say(`  found by the key query alone   ${repeated.length - invisibleToKeyQuery.length - halfVisibleToKeyQuery.length}`);
say('');
for (const [key, group] of repeated.slice(0, 25)) {
  const detail = group
    .map(
      (row) =>
        `${row.id}${row.headwordKey ? '' : ' (no key)'}${row.isPublished ? '' : ' (unpublished)'}`,
    )
    .join(', ');
  say(`  ${key} ×${group.length} — ${detail}`);
}
if (repeated.length > 25) say(`  … and ${repeated.length - 25} more`);

if (keyMismatch.length > 0) {
  say('');
  say('── Keys that disagree with their own headword ───────────────────────');
  for (const row of keyMismatch.slice(0, 15)) {
    say(`  ${row.id}: kasemText ${JSON.stringify(row.kasemText)} → stored key ${JSON.stringify(row.headwordKey)}`);
  }
}

process.exit(0);
