import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { sentenceRequest } from './kawuri-dictionary.js';
import { allowed, exampleQuality, parseContext, type EvidenceNote, type UsageContext } from './kasem-evidence.js';
import { heldOutEvidenceIds } from './kasem-dataset.js';
import {
  type AttestedSentence,
  type Construction,
  canonicalConstruction,
  sentenceOverlap,
  tidy,
} from './kasem-corpus.js';

/** Current, permitted sentence evidence. Similarity can suggest an example,
 * but only the wording and context together can support an exact answer. */

/** One confirmed sentence, in the shape a briefing is written from. */
export interface CorpusRecord extends AttestedSentence {
  id: string;
  /** How many speakers have confirmed it. Shown so a reader can weigh it. */
  confirmations: number;
  context?: UsageContext;
}

/** How many sentences one instance will hold. */
const MAX_CACHED_SENTENCES = 3000;

/** How long a loaded corpus is trusted before it is read again. */

/** Sentences quoted into one answer. */
const MAX_BRIEFING_SENTENCES = 4;

/**
 * How much of the asked sentence a stored one must share to be quoted at all.
 *
 * Low, and the reason is what a near miss costs here versus what it buys. A
 * retrieved sentence is never shown to the member as the answer — it goes to
 * the model under a briefing that says, in as many words, that only an exact
 * match may be presented as the translation and anything else is a related
 * example. So the cost of a loose threshold is a paragraph of prompt spent on
 * a sentence the model then declines to use, and the benefit is that
 * "the boy is hungry" still reaches `kana mo jege bakeira kom` and teaches the
 * member the construction even though the adjective is gone.
 *
 * A tight threshold buys nothing back. Kawuri's problem has never been quoting
 * too much of the archive.
 */
const MIN_OVERLAP = 0.24;


function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Reads one Firestore document into a record, or null when it says nothing. */
export function corpusRecordFrom(
  id: string,
  data: Record<string, unknown>,
): CorpusRecord | null {
  const kasem = text(data.kasem);
  const english = text(data.english);
  // Both sides or nothing. A row with only one of them cannot teach a
  // translation and cannot be checked by anybody reading it later.
  if (!kasem || !english) return null;

  const gloss = Array.isArray(data.gloss)
    ? data.gloss
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => ({ kasem: text(row.kasem), english: text(row.english) }))
        .filter((row) => row.kasem)
    : [];

  const constructions: Construction[] = [];
  if (Array.isArray(data.constructions)) {
    for (const item of data.constructions) {
      const tag = canonicalConstruction(item);
      if (tag && !constructions.includes(tag)) constructions.push(tag);
    }
  }

  const confirmations = typeof data.confirmations === 'number' ? data.confirmations : 1;

  return {
    id,
    kasem,
    english,
    literal: text(data.literal),
    gloss,
    note: text(data.note),
    dialect: text(data.dialect),
    constructions,
    confirmations: Math.max(1, Math.floor(confirmations)),
    ...(data.context ? { context: parseContext(data.context) } : {}),
  };
}

/** A record and how well it answers what was asked. */
export interface CorpusMatch {
  record: CorpusRecord;
  score: number;
  /** True when this is the sentence that was asked for, not a relative. */
  exact: boolean;
}

/**
 * The sentences worth showing for [asked], best first.
 *
 * Ranked on wording overlap alone. Construction tags deliberately do *not*
 * contribute to the score: they describe what a sentence demonstrates, not
 * what it says, and a question arrives as English prose with no tag on it. Tag
 * matching would need the question classified first, which is another model
 * call to save a set intersection over a few hundred rows.
 *
 * Ties break on [confirmations], so a sentence three speakers have signed off
 * outranks one that has been seen once. That is the only place in this file
 * where consensus does any work, and it is the right place: it decides which
 * of two equally relevant examples a member is shown.
 */
export function matchCorpus(
  records: readonly CorpusRecord[],
  asked: string,
  limit: number = MAX_BRIEFING_SENTENCES,
  context: { preceding?: string; dialect?: string; intent?: string } = {},
): CorpusMatch[] {
  const wanted = tidy(asked).toLowerCase();
  if (!wanted) return [];

  const scored: CorpusMatch[] = [];
  for (const record of records) {
    if (context.dialect && record.dialect !== context.dialect) continue;
    const stored = tidy(record.english).toLowerCase();
    const score = stored === wanted ? 1 : sentenceOverlap(wanted, stored);
    const queryTags = [/^(who|what|how|where|when|why)\b/.test(wanted) ? 'question' : '', /\b(not|never|don't|didn't)\b/.test(wanted) ? 'negation' : ''];
    const relatedConstruction = record.constructions.some(tag => queryTags.includes(tag));
    if (score < MIN_OVERLAP && !relatedConstruction) continue;
    const usage = record.context;
    const contextFits = !usage || usage.status === 'unspecified' || Boolean(context.preceding &&
      [usage.situation, usage.preceding].filter(Boolean).every(part => context.preceding!.toLowerCase().includes(part.toLowerCase())));
    scored.push({ record, score: score + (relatedConstruction ? 0.05 : 0), exact: stored === wanted && contextFits });
  }

  scored.sort(
    (a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || b.record.confirmations - a.record.confirmations,
  );
  return scored.slice(0, limit);
}

/** One sentence as a block the model can quote without re-deriving anything. */
function briefingBlock(match: CorpusMatch, index: number): string {
  const { record } = match;
  const lines = [
    `${index + 1}. English: ${record.english}`,
    `   Kasem: ${record.kasem}`,
    record.literal ? `   Word for word: ${record.literal}` : '',
    record.note ? `   Speaker's note: ${record.note}` : '',
    record.context ? `   Usage context: ${JSON.stringify(record.context)}` : '',
    record.dialect ? `   Dialect: ${record.dialect}` : '',
    record.constructions.length > 0
      ? `   Shows: ${record.constructions.join(', ')}`
      : '',
    match.exact
      ? '   This is the sentence that was asked for.'
      : '   Related example, NOT a translation of what was asked.',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * The instruction block appended for a sentence request, or `''`.
 *
 * Returns `''` when the question was not asking for a sentence, so every
 * ordinary question costs the prompt nothing.
 */
export function corpusBriefing(
  asked: string,
  matches: readonly CorpusMatch[],
): string {
  if (!asked) return '';

  const hasExact = matches.some((match) => match.exact);

  if (matches.length === 0) {
    return `SENTENCE LOOKUP — the Indigen World sentence corpus was searched for "${asked}" and holds NO attested Kasem sentence for it, and none close enough to help.

You must not build one. This is not the same instruction as "do not invent a word", and it is the more important of the two here:

• A DICTIONARY LOOKUP block may appear above this one with real, confirmed Kasem words in it. Those words are correct. Putting them in the order the English sentence used is still a fabrication, and it will look completely convincing — every word attested, every spelling right, only the sentence made up.
• Kasem does not arrange a clause the way English does, and the differences are not decoration. A state such as being hungry or being cold can be expressed with the sensation as the subject and the person as the object. Particles that English has no word for sit inside the clause and change what it means. Word order carries work that English does with separate words.
• So a word-for-word rendering is not a rough answer that a speaker could tidy up. It is usually a different sentence, or not a sentence at all.

Say plainly that the project has not recorded this sentence yet. You may give the individual words if a dictionary block above supplied them — say clearly that they are the words and not the sentence, and that you cannot put them in order. Then point the person at the Community tab to ask a speaker, or at Contribute, where a speaker can teach the sentence and its word-for-word line so the next person who asks gets a real answer.`;
  }

  const blocks = matches.map(briefingBlock).join('\n\n');
  const head = hasExact
    ? `SENTENCE LOOKUP — the Indigen World sentence corpus was searched for "${asked}" and holds it. This is the ONLY Kasem sentence you may present as the translation:`
    : `SENTENCE LOOKUP — the Indigen World sentence corpus was searched for "${asked}" and does NOT hold it. These attested sentences are related, and they are the only Kasem sentences you may quote at all:`;

  const guidance = hasExact
    ? `How to use it:
• Give the Kasem sentence exactly as written — every character, every mark.
• Include an annotation or literal paraphrase only when one is supplied above. An unexplained particle is valid evidence; do not invent its English meaning or grammatical function.
• Explain word order only to the extent established by the reviewed notes above. Preserve their context and dialect limits.
• Do not extend the sentence, swap a word in it, or adapt it to a slightly different meaning. A sentence altered by one word is an unattested sentence.`
    : `How to use them:
• Say first, plainly, that the exact sentence asked for is not recorded.
• Show the related attested sentence with its stated context and dialect. Include only supplied annotations. Ask for context when it is needed; do not infer grammatical equivalence from shared vocabulary.
• DO NOT adapt one of these into the sentence that was asked for. Swapping a noun or dropping an adjective looks harmless and is how an invented sentence gets published — the change may need a different particle, a different order, or a different construction entirely.
• Point the person at the Community tab to ask a speaker for the exact sentence.`;

  return `${head}

${blocks}

${guidance}`;
}

/** Kept for callers; permission-sensitive evidence is read fresh each request. */
export function resetCorpusCache(): void {}

async function loadCorpus(): Promise<CorpusRecord[]> {
  if (process.env.KASEM_EVIDENCE_RETRIEVAL === 'false') return [];
  const snapshot = await getFirestore().collection('kasemEvidence')
    .where('schemaVersion', '==', 2).limit(MAX_CACHED_SENTENCES + 1).get();
  if (snapshot.size > MAX_CACHED_SENTENCES) throw new Error('Corpus needs a paginated retrieval index.');
  const now = new Date().toISOString(), records: CorpusRecord[] = [];
  const heldOut = heldOutEvidenceIds(snapshot.docs.map(doc => doc.data() as EvidenceNote));
  for (const doc of snapshot.docs) {
    const note = doc.data() as EvidenceNote;
    if (!allowed(note, 'providerRetrieval', now) || heldOut.has(note.id)) continue;
    for (let i = 0; i < note.examples.length; i++) {
      const quality = exampleQuality(note, i);
      if (!quality.approved) continue;
      const example = note.examples[i];
      const record = corpusRecordFrom(doc.id + '-' + i, {
        ...example, literal: quality.annotationsApproved ? example.literal : '',
        note: quality.annotationsApproved ? example.note : '', confirmations: quality.confirmations,
      });
      if (record) records.push(record);
    }
  }
  return records;
}

/**
 * The sentence instruction for a question, or `''` when none is owed.
 *
 * Never throws, on the same terms as its two neighbours — with one difference
 * worth stating. When the dictionary or the grammar cannot be read, falling
 * back to silence leaves Kawuri answering as it did before those modules
 * existed, which is worse but not dangerous. Here, silence on a *sentence*
 * question is the exact condition that produces a fabricated sentence. So a
 * read failure still returns a briefing: the miss text, which forbids
 * composing one. Being unable to check is not a reason to stop refusing.
 */
export async function corpusContextFor(question: string, preceding = ''): Promise<string> {
  const asked = sentenceRequest(question);
  if (!asked) return '';

  try {
    return corpusBriefing(asked, matchCorpus(await loadCorpus(), asked, MAX_BRIEFING_SENTENCES, { preceding }));
  } catch (error) {
    logger.warn('Sentence corpus lookup failed; refusing to compose instead', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return corpusBriefing(asked, []);
  }
}

