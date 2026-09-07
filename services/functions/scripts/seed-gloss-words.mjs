/**
 * Turns a reviewed gloss map's word list into dictionary contributions.
 *
 *     node services/functions/scripts/seed-gloss-words.mjs --input data/bible-seed/genesis-1.json \
 *       --author-email you@example.com --dialect "Ghana Kasem" --source "<edition>"
 *
 *     ... --commit          # actually writes
 *     ... --include-function-words
 *
 * ── Why this writes a pair, not a single document ─────────────────────────
 * `submitCollectionContribution` creates a receipt in `collectionContributions`
 * AND a canonical Submission in `submissions`, atomically. The admin review
 * queue reads the *submission*; the member's "my contributions" list reads the
 * receipt. Writing only one of them produces a contribution that exists and
 * that nobody can review — which is exactly the failure this script was written
 * after hitting. Both documents are built by importing the real builders from
 * the compiled bundle, so a seeded word is shaped identically to a typed one.
 *
 * ── Why function words are excluded by default ────────────────────────────
 * `kasem-grammar-model` and `retire-grammar-words.mjs` record a decision this
 * project already made once: ranks 1-7 of the word queue were `the, of, to,
 * and, a, in, is`, they were the first thing every new contributor met, and
 * none of them has an answer a contributor can give. They were retired into the
 * closed `grammarRules` collection. Seeding `mo`, `na`, `ne`, `ye` and their
 * kin as dictionary words would walk that back, so they are listed and skipped
 * unless `--include-function-words` is passed.
 */

import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import {
  COLLECTION_CAMPAIGN_ID,
  buildCollectionCampaignDocument,
  buildCollectionContributionReceipt,
  buildCollectionSubmissionDocument,
  parseCollectionContributionInput,
} from '../lib/collection-contributions.js';
import { canonicalPartOfSpeech, partOfSpeechLabel } from '../lib/lexical-kinds.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';

const flag = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? '' : (process.argv[i + 1] ?? ''); };
const has = (n) => process.argv.includes(`--${n}`);

const commit = has('commit');
const input = flag('input') || 'data/bible-seed/genesis-1.json';
const dialect = flag('dialect');
const source = flag('source');
const includeFunctionWords = has('include-function-words');

initializeApp({
  credential: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
    ? cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON))
    : applicationDefault(),
  projectId: PROJECT_ID,
});
let author = flag('author');
if (!author && flag('author-email')) {
  author = (await getAuth().getUserByEmail(flag('author-email'))).uid;
  console.log(`resolved ${flag('author-email')} -> ${author}`);
}
if (!author || !dialect || !source) {
  console.error('Need --author (or --author-email), --dialect and --source.');
  process.exit(2);
}

/**
 * Words the queue has no business asking anybody about.
 *
 * Determiners, pronouns, relatives, postpositions, conjunctions and the
 * particles. Listed by hand rather than induced from the part of speech,
 * because the part of speech is itself a guess for most of these and a wrong
 * guess here quietly puts `mo` back in the dictionary.
 */
const FUNCTION_WORDS = new Set([
  'kam', 'kom', 'dem', 'tem', 'bam', 'yam', 'sem', 'wom',
  'o', 'ba', 'ka', 'ko', 'te', 'a', 'á', 'dé', 'debam', 'abam', 'amo', 'banto', 'nam',
  'telo', 'balo', 'kolo', 'to', 'na', 'kolokolo',
  'ne', 'wone', 'wɛɛne', 'de', 'dedaane', 'ye', 'daane',
  'mo', 'ma', 'maa', 'daa', 'daare', 'ta', 'se', 'pa', 'wó', 'ya', 'la', 'laam', 'déem',
  'ná', 'konto', 'maama', 'dedoa', 'yera',
]);

/** Burkina part-of-speech marker in the dictionary gloss -> our id. */
function partOfSpeechFor(word) {
  const g = `${word.burkinaGloss || ''} ${word.speaker || ''}`.toLowerCase();
  if (/\bnom\b|^n\.|\bn\. /.test(g)) return 'noun';
  if (/\bverbe\b|\bv\.aux\b/.test(g)) return 'verb';
  if (/\badj\b/.test(g)) return 'adjective';
  if (/\badverbe\b|\badv\b/.test(g)) return 'adverb';
  if (/\bnum\b/.test(g)) return 'numeral';
  if (/\bpn\.|pronom/.test(g)) return 'pronoun';
  if (/\bcj\.|conjonction/.test(g)) return 'conjunction';
  if (/\bpostp\b/.test(g)) return 'postposition';
  return '';
}

const map = JSON.parse(readFileSync(input, 'utf8'));
const exampleFor = new Map();
for (const ex of map.examples) {
  for (const token of ex.kasem.replace(/‑/g, '-').split(/\s+/)) {
    const t = token.replace(/^[.,;:!?“”‘’]+|[.,;:!?“”‘’]+$/g, '').toLowerCase();
    if (t && !exampleFor.has(t)) exampleFor.set(t, ex);
  }
}

const skipped = [];
const candidates = [];

/**
 * Idioms take the same door as words — `collectionKind: 'dictionary'` with
 * `lexicalKind: 'idiom'`, which is what the app's "Add an idiom or proverb"
 * card submits. They are kept out of the sentence corpus on purpose:
 * `lexical-kinds.ts` puts it plainly, an idiom "means something its words do
 * not", so the citation form belongs in the dictionary while the sentence that
 * contains it stays an ordinary attested sentence.
 */
if (has('idioms')) {
  for (const idiom of map.idioms ?? []) {
    const ex = (map.examples ?? []).find((e) => (idiom.refs ?? []).includes(e.ref));
    const attribution = idiom.source === 'speaker'
      ? 'Confirmed by a Kasem speaker.'
      : 'NOT confirmed by a speaker — proposed from the passage and needs checking.';
    candidates.push({
      token: idiom.kasem, english: idiom.english, posId: '', count: (idiom.refs ?? []).length,
      payload: {
        collectionKind: 'dictionary',
        lexicalKind: 'idiom',
        title: idiom.english,
        body: idiom.kasem,
        translations: [idiom.kasem],
        format: 'Idiom',
        dialect,
        source,
        notes: `Word for word: ${idiom.literalParts}. ${idiom.note} ${attribution} Occurs at ${(idiom.refs ?? []).join(', ')}.`,
        kasemExample: ex?.kasem ?? '',
        englishExample: ex?.english ?? '',
        usesThirdPartyMaterial: true,
        participantConsentConfirmed: true,
        rightsConfirmed: true,
        publicationPermission: true,
        involvesMinors: null,
        mediaUrl: '',
      },
    });
  }
}

for (const w of has('idioms') ? [] : map.words) {
  if (!includeFunctionWords && FUNCTION_WORDS.has(w.token)) { skipped.push(w.token); continue; }
  const english = (w.glosses[0]?.english || '').replace(/-/g, ' ').trim();
  if (!english) { skipped.push(`${w.token} (no gloss)`); continue; }
  // `pos` is recovered from the Burkina dictionary entry's own marker and is
  // the better source; the gloss text is only a fallback for words it missed.
  const posId = canonicalPartOfSpeech(w.pos) || canonicalPartOfSpeech(partOfSpeechFor(w)) || '';
  const ex = exampleFor.get(w.token);
  const evidence = w.speaker
    ? `Confirmed by a Kasem speaker: ${w.speaker}`
    : (w.burkina ? `Burkina form ${w.burkina} — ${w.burkinaGloss}` : 'Read from context in the passage.');
  candidates.push({
    token: w.token, english, posId, count: w.count,
    payload: {
      collectionKind: 'dictionary',
      lexicalKind: 'word',
      title: english,
      body: w.token,
      translations: [w.token],
      format: posId ? partOfSpeechLabel(posId) : 'Word',
      ...(posId ? { partOfSpeechId: posId } : {}),
      dialect,
      source,
      notes: `${evidence} Attested ${w.count}× in ${map.source?.work ?? 'the passage'} (${(w.refs || []).join(', ')}).`,
      kasemExample: ex?.kasem ?? '',
      englishExample: ex?.english ?? '',
      // The example sentences are somebody else's translation, not ours.
      usesThirdPartyMaterial: true,
      participantConsentConfirmed: true,
      // The contributor is asserting they may share this for review. It is the
      // same assertion `--source` and the licence record on the sentence seed
      // stand behind, and parseCollectionContributionInput refuses without it.
      rightsConfirmed: true,
      publicationPermission: true,
      involvesMinors: null,
      mediaUrl: '',
    },
  });
}

const parsed = [];
const rejected = [];
for (const c of candidates) {
  try { parsed.push({ ...c, input: parseCollectionContributionInput(c.payload, author) }); }
  catch (error) { rejected.push({ token: c.token, reason: error.message }); }
}

const idiomMode = has('idioms');
console.log(`\n${idiomMode ? (map.idioms ?? []).length + ' idioms' : map.words.length + ' words'} in the map`);
if (!idiomMode) console.log(`  ${skipped.length} skipped as function words or ungloss`);
console.log(`  ${parsed.length} valid dictionary contributions, ${rejected.length} rejected`);
for (const r of rejected) console.error(`    REJECTED ${r.token}: ${r.reason}`);
const byPos = parsed.reduce((m, p) => m.set(p.posId || '(none)', (m.get(p.posId || '(none)') || 0) + 1), new Map());
console.log('  parts of speech:', [...byPos].map(([k, v]) => `${k}=${v}`).join(' '));
if (!includeFunctionWords && !idiomMode) console.log(`\nskipped: ${skipped.join(', ')}`);

if (!commit) {
  console.log('\nDry run. Nothing written. Pass --commit to write.\nfirst five:');
  for (const p of parsed.slice(0, 5)) {
    console.log(`  ${p.token}  =  ${p.english}   [${p.posId || 'no part of speech'}]`);
    console.log(`     e.g. ${p.payload.kasemExample.slice(0, 70)}`);
  }
  process.exit(0);
}

const db = getFirestore();
let written = 0;
for (const p of parsed) {
  const contributionRef = db.collection('collectionContributions').doc();
  const submissionRef = db.collection('submissions').doc(contributionRef.id);
  const campaignRef = db.collection('campaigns').doc(COLLECTION_CAMPAIGN_ID);
  const auditRef = db.collection('auditLogs').doc();
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const campaign = await tx.get(campaignRef);
    if (!campaign.exists) tx.set(campaignRef, buildCollectionCampaignDocument(now));
    tx.set(contributionRef, buildCollectionContributionReceipt(contributionRef.id, submissionRef.id, author, p.input));
    tx.set(submissionRef, buildCollectionSubmissionDocument(submissionRef.id, author, p.input, now));
    tx.set(auditRef, {
      id: auditRef.id,
      actor: { collection: 'creatorProfiles', id: author },
      action: 'collection.contribution.submit',
      target: { collection: 'collectionContributions', id: contributionRef.id },
      outcome: 'success', source: 'script:seed-gloss-words',
      before: null, after: { status: 'submitted', submissionId: submissionRef.id },
      metadata: { collectionKind: 'dictionary', token: p.token },
      occurredAt: now,
    });
  });
  written += 1;
}
console.log(`\nwrote ${written} dictionary contributions, each with its submission. They are on the admin review queue.`);
