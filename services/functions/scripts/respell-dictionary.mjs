/**
 * Respells verified Burkina headwords in `dictionaryEntries` to their Ghana form.
 *
 *     node services/functions/scripts/respell-dictionary.mjs            # dry run
 *     node services/functions/scripts/respell-dictionary.mjs --commit
 *
 * ── What it changes and what it keeps ─────────────────────────────────────
 * `kasemText` and `headword` take the Ghana spelling. The original Burkina form
 * is pushed into `alternateKasemTerms` rather than discarded — it is how the
 * word is spelled on the other side of a border, it is what the Niggli
 * dictionary prints, and somebody searching the archive for it should still
 * land here.
 *
 * `dialect` moves from `Tiébélé / Burkina reference` to `Ghana Kasem`, and this
 * is the part worth arguing with. Leaving it would make the row assert two
 * contradictory things: a Ghana spelling under a label saying the entry is
 * Burkina reference material. The import's `attribution` and `importBatch`
 * fields still record where it came from, so the provenance is not lost by
 * making the dialect field agree with the spelling.
 *
 * ── Rows it refuses to touch ──────────────────────────────────────────────
 * Where the Ghana spelling ALREADY exists as its own entry, renaming produces
 * two identical rows and no new information. Those are reported and skipped:
 * the goal was Ghana spellings in the dictionary, and for those words the
 * dictionary already has one.
 *
 * ── Homograph numbering ───────────────────────────────────────────────────
 * Measured on 2026-09-06: `headwordKey` and `homographIndex` are on zero rows of
 * this collection, so renaming cannot orphan a numbering group and
 * `backfill-homographs.mjs` does not need to run afterwards. Re-check that
 * before reusing this script if the numbering has since been backfilled.
 */

import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';
const commit = process.argv.includes('--commit');

/** Verified against the Genesis 1 gloss map, reviewed with a Kasem speaker. */
const PAIRS = [
  ['dɩm', 'dem'],
  ['tɩtɩɩ', 'tete'],
  ['jɩgɩ', 'jege'],
  ['bʋbʋa', 'boboa'],
  ['amʋ', 'amo'],
  ['beeri', 'beera'],
  ['wʋnɩ', 'wone'],
];

initializeApp({
  credential: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
    ? cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON))
    : applicationDefault(),
  projectId: PROJECT_ID,
});
const db = getFirestore();

// A superscript sense number folded into the headword is not part of the word;
// it is a label, and it survives normalisation, so it is stripped for matching.
const strip = (s) => String(s ?? '').normalize('NFC').replace(/[¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim().toLowerCase();

const snap = await db.collection('dictionaryEntries').get();
const plan = [];
const blocked = [];
for (const [burkina, ghana] of PAIRS) {
  const targets = snap.docs.filter((d) => strip(d.data().kasemText) === strip(burkina));
  const existing = snap.docs.filter((d) => strip(d.data().kasemText) === strip(ghana));
  for (const doc of targets) {
    if (existing.length) {
      blocked.push({ id: doc.id, burkina, ghana, english: doc.data().englishText,
        existing: existing.map((e) => `${e.id} (${e.data().englishText})`) });
      continue;
    }
    plan.push({ doc, burkina, ghana, data: doc.data() });
  }
}

console.log(`${snap.size} entries scanned\n`);
console.log(`${plan.length} to respell:`);
for (const p of plan) {
  console.log(`  ${p.doc.id}`);
  console.log(`    kasemText  ${JSON.stringify(p.data.kasemText)} -> ${JSON.stringify(p.ghana)}`);
  console.log(`    headword   ${JSON.stringify(p.data.headword)} -> ${JSON.stringify(p.ghana)}`);
  console.log(`    alternate  ${JSON.stringify(p.data.alternateKasemTerms ?? null)} -> ${JSON.stringify(p.burkina)}`);
  console.log(`    dialect    ${JSON.stringify(p.data.dialect)} -> "Ghana Kasem"`);
  console.log(`    meaning    ${JSON.stringify(p.data.englishText)}`);
}
console.log(`\n${blocked.length} skipped — the Ghana spelling is already its own entry:`);
for (const b of blocked) {
  console.log(`  ${b.id}  ${b.burkina} (${b.english})  ->  ${b.ghana} already exists as ${b.existing.join(', ')}`);
}

if (!commit) {
  console.log('\nDry run. Nothing written. Pass --commit to write.');
  process.exit(0);
}

const batch = db.batch();
for (const p of plan) {
  const alternates = String(p.data.alternateKasemTerms ?? '').trim();
  batch.update(p.doc.ref, {
    kasemText: p.ghana,
    ...(p.data.headword !== undefined ? { headword: p.ghana } : {}),
    alternateKasemTerms: alternates ? `${alternates}, ${p.burkina}` : p.burkina,
    dialect: 'Ghana Kasem',
    respelledFrom: p.data.kasemText,
    respelledAt: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
await batch.commit();
console.log(`\nrespelled ${plan.length} entries. Original spellings kept in alternateKasemTerms and respelledFrom.`);
