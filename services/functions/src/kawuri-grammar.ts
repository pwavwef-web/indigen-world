import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { grammarTerms, normaliseTerm } from './kawuri-dictionary.js';
import { allowed, exampleQuality, type EvidenceNote } from './kasem-evidence.js';
import { heldOutEvidenceIds } from './kasem-dataset.js';

/** Scoped grammar claims checked against current supporting evidence.
 * Missing or disputed claims produce an explicit unsupported-answer briefing. */

/** One published rule, in the shape a briefing is written from. */
export interface GrammarRecord {
  id: string;
  topic: string;
  title: string;
  summary: string;
  pattern: string;
  note: string;
  dialect?: string;
  /** The English words this rule speaks for — `the`, `a`, `of` and so on. */
  triggers: string[];
  examples: { kasem: string; english: string; note: string }[];
  nounClasses: { id: string; definiteMarker: string; pluralMarker: string }[];
}

/**
 * How many rules one instance will hold.
 *
 * Two orders of magnitude below the dictionary's ceiling because this is a
 * closed collection by design: a language has a few dozen rules worth stating,
 * not four thousand. A number far above the plausible count is here so that
 * growth is not silently truncated, not because growth is expected.
 */
const MAX_CACHED_RULES = 200;


/** Rules quoted into one answer. Grammar answers are prose; two is plenty. */
const MAX_BRIEFING_RULES = 3;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

/** Reads one Firestore document into a record, or null when it says nothing. */
export function grammarRecordFrom(
  id: string,
  data: Record<string, unknown>,
): GrammarRecord | null {
  const summary = text(data.summary);
  if (id === 'indefiniteness' && data.claimStatus !== 'supported') return null;
  if (['disputed', 'retired', 'hypothesis'].includes(text(data.claimStatus))) return null;
  // A rule with no summary has nothing to tell anybody. Draft rows exist
  // precisely in that state — several were seeded only to carry the triggers
  // that take an unanswerable word out of the word queue — and quoting one
  // would put a blank answer in front of a member as though it were an answer.
  if (!summary) return null;

  const examples = Array.isArray(data.examples)
    ? data.examples
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => ({
          kasem: text(row.kasem),
          english: text(row.english),
          note: text(row.note),
        }))
        .filter((row) => row.kasem || row.english)
    : [];

  const nounClasses = Array.isArray(data.nounClasses)
    ? data.nounClasses
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => ({
          id: text(row.id),
          definiteMarker: text(row.definiteMarker),
          pluralMarker: text(row.pluralMarker),
        }))
        .filter((row) => row.id)
    : [];

  return {
    id,
    topic: text(data.topic),
    title: text(data.title),
    summary,
    pattern: text(data.pattern),
    note: text(data.note),
    dialect: text(data.dialect),
    triggers: stringList(data.englishTriggers).map(normaliseTerm).filter(Boolean),
    examples,
    nounClasses,
  };
}

/**
 * The rules that speak for the words a question asked about.
 *
 * Matching is exact against the rule's own trigger list rather than fuzzy
 * against its prose. A grammar rule claims a closed, deliberate set of English
 * words — the same list `retire-grammar-words.mjs` uses to take those rows out
 * of the word queue — so a rule reached here is a rule that was written to
 * answer this question, not one that happened to mention it.
 *
 * Ordered by which term was asked about first, so a question about two things
 * leads with the one the member led with.
 */
export function matchGrammar(
  records: readonly GrammarRecord[],
  terms: readonly string[],
  limit: number = MAX_BRIEFING_RULES,
): GrammarRecord[] {
  if (terms.length === 0) return [];

  const scored: { record: GrammarRecord; termIndex: number }[] = [];
  for (const record of records) {
    const termIndex = terms.findIndex((term) => record.triggers.includes(normaliseTerm(term)));
    if (termIndex >= 0) scored.push({ record, termIndex });
  }

  scored.sort((a, b) => a.termIndex - b.termIndex);
  return scored.slice(0, limit).map((item) => item.record);
}

/** One rule as a block the model can quote without re-deriving anything. */
function briefingBlock(record: GrammarRecord, index: number): string {
  const lines = [
    `${index + 1}. ${record.title || record.topic}`,
    `   ${record.summary}`,
    record.pattern ? `   Pattern: ${record.pattern}` : '',
    record.note ? `   Scope and uncertainty: ${record.note}` : '',
    record.dialect ? `   Dialect: ${record.dialect}` : '',
    ...record.examples.map(
      (example) =>
        `   Example: ${example.kasem}${example.english ? ` — ${example.english}` : ''}` +
        (example.note ? ` (${example.note})` : ''),
    ),
    ...record.nounClasses.map(
      (entry) =>
        `   Class ${entry.id}: definite ${entry.definiteMarker || '(not recorded)'}` +
        `, plural ${entry.pluralMarker || '(not recorded)'}`,
    ),
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * The instruction block appended for a grammar question, or `''`.
 *
 * A miss is reported as loudly as a hit, for the same reason
 * `dictionaryBriefing` does it: "there is no rule written for this yet" is the
 * honest state of the record, and it is the only thing that reliably stops a
 * model filling the silence with a confident description of a grammar it has
 * barely read.
 */
export function grammarBriefing(
  terms: readonly string[],
  matches: readonly GrammarRecord[],
): string {
  if (terms.length === 0) return '';

  const asked = terms.slice(0, 6).map((term) => `"${term}"`).join(', ');
  if (matches.length === 0) {
    return `GRAMMAR LOOKUP — the Indigen World grammar notes were searched for ${asked} and have NO rule for any of them.

These are function words. Several of them have no single Kasem equivalent at all — English marks with a separate word what Kasem often marks on the noun or the verb — so a word-for-word answer would be wrong even if you could produce one. Say plainly that the project has not written this rule down yet. Do not describe Kasem grammar from your own memory, and do not offer a Kasem word for it. Point the person at the Community tab if they want to ask a speaker.`;
  }

  const blocks = matches.map(briefingBlock).join('\n\n');
  return `GRAMMAR LOOKUP — ${asked} is a function word, and the answer is a rule rather than a dictionary entry. These are the ONLY grammar statements you may present as confirmed:

${blocks}

How to use them:
• Lead with the fact that this is not a separate word in Kasem, where the rule says so. That is the answer, not a caveat on it.
• Quote the pattern and any examples exactly as written above.
• Do not extend the rule to cases it does not cover, and do not illustrate it with a Kasem word that is not printed above.
• If the rule does not actually answer what was asked, say so instead of stretching it to fit.`;
}


/** Drops the cache. For tests, and for anything that needs a cold read. */
export function resetGrammarCache(): void {
  // Claims are checked against current evidence on every lookup.
}

async function loadGrammar(): Promise<GrammarRecord[]> {
  if (process.env.KASEM_EVIDENCE_RETRIEVAL === 'false') return [];
  const snapshot = await getFirestore()
    .collection('grammarRules')
    // Drafts are excluded here as well as by the security rules. This runs as
    // the Admin SDK, which those rules do not constrain, so "staff can read a
    // draft" must not quietly become "Kawuri teaches from a draft".
    .where('status', 'in', ['published', 'reviewed-private'])
    .limit(MAX_CACHED_RULES)
    .get();

  const records: GrammarRecord[] = [];
  let heldOut = new Set<string>();
  if (snapshot.docs.some(doc => doc.get('claimId'))) {
    const allEvidence = await getFirestore().collection('kasemEvidence').where('schemaVersion', '==', 2).limit(3001).get();
    if (allEvidence.size > 3000) throw new Error('Corpus needs a paginated retrieval index.');
    heldOut = heldOutEvidenceIds(allEvidence.docs.map(doc => doc.data() as EvidenceNote));
  }
  for (const doc of snapshot.docs) {
    if (doc.get('claimId')) {
      const revisions = doc.get('evidenceRevisions') as Record<string, number>;
      if (!revisions || !Object.keys(revisions).length) continue;
      const evidence = await Promise.all(Object.keys(revisions).map(id => getFirestore().collection('kasemEvidence').doc(id).get()));
      if (evidence.some(d => {
        const n = d.data() as EvidenceNote | undefined;
        return !n || n.revision !== revisions[d.id] || heldOut.has(n.id) || !allowed(n, 'providerRetrieval', new Date().toISOString())
          || !n.examples.some((_, i) => exampleQuality(n, i).approved);
      })) continue;
    }
    const record = grammarRecordFrom(doc.id, doc.data() as Record<string, unknown>);
    if (record) records.push(record);
  }

  return records;
}

/**
 * The grammar instruction for a question, or `''` when none is owed.
 *
 * Never throws, on the same terms as `dictionaryContextFor`: grammar notes
 * that cannot be read leave Kawuri answering the way it did before this module
 * existed, which is a worse answer rather than a broken one and is not worth
 * failing somebody's question over.
 */
export async function grammarContextFor(question: string): Promise<string> {
  const terms = grammarTerms(question);
  if (terms.length === 0) return '';

  try {
    const records = await loadGrammar();
    return grammarBriefing(terms, matchGrammar(records, terms));
  } catch (error) {
    logger.warn('Grammar lookup failed; withholding unsupported claims', { errorType: error instanceof Error ? error.name : 'unknown' });
    return grammarBriefing(terms, []);
  }
}
