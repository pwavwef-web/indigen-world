/**
 * Loads a reviewed Bible gloss map into the evidence review queue.
 *
 *     node services/functions/scripts/seed-evidence.mjs --input data/bible-seed/genesis-1.json \
 *       --author <uid> --source "<edition>" --licence "<terms>" --dialect "Ghana Kasem"
 *
 *     ... --commit      # actually writes
 *
 * Uses Application Default Credentials, so run `gcloud auth application-default
 * login` first if it refuses to start.
 *
 * ── Why this validates with the real parser ───────────────────────────────
 * The script writes with the admin SDK, which bypasses `submitGrammarNote` and
 * therefore bypasses every check that callable performs. So it imports
 * `parseNote` from the compiled functions bundle and runs each note through it
 * before writing. A copy of the validation would drift; this cannot. Run
 * `npm run build:functions` first if `lib/` is stale.
 *
 * ── Why nothing it writes is public ───────────────────────────────────────
 * Notes land with `status: 'submitted'` and no reviews, so `publicSentences`
 * projects nothing and `kasemSentences` stays empty for them. Two independent
 * speakers still have to pass every example on the review desk before a single
 * sentence reaches a member or Kawuri. Seeding is *queueing*, not publishing,
 * and the permission flags below are additionally withheld by default.
 *
 * ── Why the required flags have no defaults ───────────────────────────────
 * `--author`, `--source`, `--licence` and `--dialect` describe provenance and
 * consent, and a wrong guess in any of them is a false record in the fields
 * that govern whether this material may ever be published or trained on. A
 * default would be a guess wearing a decision's clothes, so there is none.
 *
 * ── One note per verse ────────────────────────────────────────────────────
 * `parseNote` caps a note at six examples. A verse never exceeds four clauses
 * here, and a verse is also the unit a reviewer thinks in — the clauses of one
 * verse share a context and are judged against each other.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseNote, publicSentences } from '../lib/kasem-evidence.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';
const BATCH_SIZE = 200;

function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? '' : (process.argv[i + 1] ?? '');
}
const has = (name) => process.argv.includes(`--${name}`);

const commit = has('commit');
const input = flag('input') || 'data/bible-seed/genesis-1.json';
// An email is what a person knows; a uid is what Firestore stores. Resolving it
// here beats asking somebody to go and copy a uid out of the console.
const authorEmail = flag('author-email');
let author = flag('author');
const source = flag('source');
const licence = flag('licence');
const dialect = flag('dialect');
const work = flag('work') || 'Genesis 1';
const group = flag('group') || 'bible:genesis-1';

if (authorEmail && !author) {
  const { getAuth } = await import('firebase-admin/auth');
  const { initializeApp: init, applicationDefault: adc, cert: certFrom } = await import('firebase-admin/app');
  const sa = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  init({ credential: sa ? certFrom(JSON.parse(sa)) : adc(), projectId: PROJECT_ID });
  author = (await getAuth().getUserByEmail(authorEmail)).uid;
  console.log(`resolved ${authorEmail} -> ${author}`);
}

const missing = [
  ['--author', author, 'the uid the notes are contributed under (or --author-email)'],
  ['--source', source, 'the edition the Kasem text comes from'],
  ['--licence', licence, 'the terms that text is used under'],
  ['--dialect', dialect, 'which Kasem this is'],
].filter(([, value]) => !value);
if (missing.length) {
  console.error('Refusing to run. These describe provenance and consent, and have no safe default:\n');
  for (const [name, , why] of missing) console.error(`  ${name.padEnd(12)} ${why}`);
  console.error('\nPermission flags, all OFF unless passed:');
  console.error('  --publication --provider-retrieval --model-training --evaluation');
  process.exit(2);
}

/**
 * Community review and source confirmation are forced on because `parseNote`
 * rejects a note without them; everything else is off unless asked for. These
 * are separate questions and the schema keeps them separate for a reason.
 */
const permissions = {
  review: true,
  sourceConfirmed: true,
  publication: has('publication'),
  providerRetrieval: has('provider-retrieval'),
  modelTraining: has('model-training'),
  evaluation: has('evaluation'),
  audio: false,
  licence,
};

const map = JSON.parse(readFileSync(input, 'utf8'));
const now = new Date().toISOString();

/** "1:2a" -> "1:2". The verse is the note; the letter is the clause within it. */
const verseOf = (ref) => ref.replace(/[a-z]+$/, '');

/**
 * Idiom spans, marked on the examples that carry them.
 *
 * This is the whole reason `annotations` exists: an idiom read compositionally
 * teaches the wrong thing, and the reviewer needs to see which stretch of the
 * sentence is not the sum of its words before judging the gloss under it.
 */
function annotationsFor(example, idioms) {
  const tokens = example.kasem.replace(/‑/g, '-').split(/\s+/)
    .map((t) => t.replace(/^[.,;:!?“”‘’]+|[.,;:!?“”‘’]+$/g, '')).filter(Boolean)
    .map((t) => t.toLowerCase());
  // A token matches a citation word if it is that word, or that word carrying a
  // suffix: `di-na` in 1:28c is the `di` of `di dam` with the imperative on it.
  const matches = (token, word) => token === word || token.startsWith(`${word}-`);
  /** Index of `words` as a run in `tokens` at or after `from`, else -1. */
  const runAt = (words, from) => {
    for (let i = from; i + words.length <= tokens.length; i += 1) {
      if (words.every((w, k) => matches(tokens[i + k], w))) return i;
    }
    return -1;
  };
  const out = [];
  for (const idiom of idioms) {
    const parts = idiom.kasem.toLowerCase().split('...')
      .map((p) => p.trim().split(/\s+/).filter(Boolean)).filter((p) => p.length);
    const start = runAt(parts[0], 0);
    if (start === -1) continue;
    let end = start + parts[0].length;
    let ok = true;
    for (const part of parts.slice(1)) {
      const at = runAt(part, end);
      if (at === -1) { ok = false; break; }
      end = at + part.length;
    }
    if (!ok || end > tokens.length) continue;
    out.push({
      start, end, kind: 'lexical', gloss: idiom.english,
      senseId: '', role: 'idiom',
      hypotheses: idiom.source === 'speaker' ? [] : ['Unconfirmed reading; needs a speaker.'],
    });
  }
  return out;
}

const byVerse = new Map();
for (const example of map.examples) {
  const verse = verseOf(example.ref);
  if (!byVerse.has(verse)) byVerse.set(verse, []);
  byVerse.get(verse).push(example);
}

const notes = [];
const rejected = [];
for (const [verse, clauses] of byVerse) {
  const id = createHash('sha256').update(`${author}:${group}:${verse}`).digest('hex').slice(0, 32);
  const situation = `${work}, verse ${verse.split(':')[1]}. Written Kasem from a published translation, not recorded speech.`;
  const payload = {
    title: `${work.replace(/ \d+$/, '')} ${verse}`,
    mode: 'sentence',
    explanation: clauses.map((c) => c.note).filter(Boolean).join(' '),
    groups: [group],
    permissions,
    context: { situation, intent: 'narrative', register: 'scripture' },
    examples: clauses.map((c) => ({
      kasem: c.kasem,
      english: c.english,
      literal: c.literal,
      note: c.note,
      dialect,
      constructions: c.constructions,
      sourceType: 'literature',
      source: `${source} — ${c.ref}`,
      // The contributor is not judging naturalness; the reviewers are.
      naturalness: 'cannot-judge',
      annotations: annotationsFor(c, map.idioms ?? []),
    })),
  };
  try {
    notes.push({ verse, note: parseNote(payload, id, author, now) });
  } catch (error) {
    rejected.push({ verse, reason: error.message });
  }
}

console.log(`${input}: ${map.examples.length} clauses in ${byVerse.size} verses`);
console.log(`validated ${notes.length} notes, rejected ${rejected.length}`);
for (const r of rejected) console.error(`  REJECTED ${r.verse}: ${r.reason}`);
const wouldPublish = notes.reduce((n, { note }) => n + publicSentences(note, now).length, 0);
console.log(`public sentences these would create right now: ${wouldPublish} (unreviewed notes project none)`);
console.log('permissions:', Object.entries(permissions)
  .filter(([k]) => k !== 'licence').map(([k, v]) => `${k}=${v}`).join(' '));
if (rejected.length) process.exit(1);

if (!commit) {
  console.log('\nDry run. Nothing was written. Pass --commit to write.');
  const sample = notes[0];
  console.log(`\nsample — ${sample.note.title} (${sample.note.examples.length} example(s))`);
  for (const e of sample.note.examples) {
    console.log(`  ${e.kasem}`);
    console.log(`  ${e.literal}`);
    console.log(`  ${e.english}`);
    if (e.annotations.length) console.log(`  annotations: ${e.annotations.map((a) => `${a.start}-${a.end} ${a.gloss}`).join('; ')}`);
    console.log('');
  }
  process.exit(0);
}

const { getApps } = await import('firebase-admin/app');
if (!getApps().length) {
  const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  initializeApp({
    credential: serviceAccount ? cert(JSON.parse(serviceAccount)) : applicationDefault(),
    projectId: PROJECT_ID,
  });
}
const db = getFirestore();

/**
 * The workflow projection `grammar-contributions.ts` writes beside each note.
 * Reimplemented rather than imported because that module pulls in
 * firebase-functions, which a script has no business loading.
 */
function queueProjection(note) {
  const { reviews: _reviews, authorUid, ...rest } = note;
  return {
    ...rest,
    authUid: authorUid,
    origin: 'contribution',
    constructions: [...new Set(note.examples.flatMap((e) => e.constructions))],
    sentenceIds: [], reviewNote: '', harvestedWords: 0, reviewerIds: [],
  };
}

let written = 0;
let skipped = 0;
for (let offset = 0; offset < notes.length; offset += BATCH_SIZE) {
  const slice = notes.slice(offset, offset + BATCH_SIZE);
  const existing = await Promise.all(
    slice.map(({ note }) => db.collection('kasemEvidence').doc(note.id).get()),
  );
  const batch = db.batch();
  slice.forEach(({ note }, i) => {
    // A note already in the queue may have been reviewed or revised since.
    // Rewriting it would silently discard that, so it is left alone.
    if (existing[i].exists && !has('force')) { skipped += 1; return; }
    const ref = db.collection('kasemEvidence').doc(note.id);
    batch.set(ref, note);
    batch.set(ref.collection('revisions').doc('1'), note);
    batch.set(db.collection('grammarNotes').doc(note.id), queueProjection(note));
    written += 1;
  });
  await batch.commit();
}
console.log(`\nwrote ${written} notes, skipped ${skipped} already present.`);
console.log('They are queued on the review desk. Two speakers must pass each example before anything is public.');
