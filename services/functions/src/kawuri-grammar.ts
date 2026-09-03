import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { grammarTerms, normaliseTerm } from './kawuri-dictionary.js';

/**
 * The half of a Kasem question that the dictionary structurally cannot answer.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 * `kawuri-dictionary.ts` drops `the`, `a`, `of`, `to`, `in`, `and` and `is` as
 * stop words, and it is right to: they carry no meaning to look up. The
 * consequence is that "how do you say *the* in Kasem?" produced no briefing at
 * all, and a model with no briefing answers from whatever it believes about a
 * language it has read very little of.
 *
 * There is no entry to find, and there never will be. Definiteness in Kasem is
 * marked on the noun rather than by a separate word, so the answer is a rule,
 * not a row — which is why `grammarRules` exists and why this module is its
 * reader. Between the two, every one of those seven words now has somewhere
 * real to come from.
 *
 * ── Deliberately shaped like its neighbour ────────────────────────────────
 * Same in-process cache, same TTL, same never-throwing contract, same refusal
 * to let a miss pass silently. The point of the resemblance is that anybody
 * who has understood one has understood both, and that the two briefings
 * cannot drift into contradicting each other about how confident Kawuri is
 * allowed to be.
 */

/** One published rule, in the shape a briefing is written from. */
export interface GrammarRecord {
  id: string;
  topic: string;
  title: string;
  summary: string;
  pattern: string;
  note: string;
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

/** How long a loaded set of rules is trusted before it is read again. */
const CACHE_TTL_MS = 15 * 60 * 1000;

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

/** The cached rules for this instance. */
let cache: { records: GrammarRecord[]; loadedAt: number } | null = null;

/** Drops the cache. For tests, and for anything that needs a cold read. */
export function resetGrammarCache(): void {
  cache = null;
}

async function loadGrammar(): Promise<GrammarRecord[]> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache.records;

  const snapshot = await getFirestore()
    .collection('grammarRules')
    // Drafts are excluded here as well as by the security rules. This runs as
    // the Admin SDK, which those rules do not constrain, so "staff can read a
    // draft" must not quietly become "Kawuri teaches from a draft".
    .where('status', '==', 'published')
    .limit(MAX_CACHED_RULES)
    .get();

  const records: GrammarRecord[] = [];
  for (const doc of snapshot.docs) {
    const record = grammarRecordFrom(doc.id, doc.data() as Record<string, unknown>);
    if (record) records.push(record);
  }

  cache = { records, loadedAt: now };
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
    logger.warn('Grammar lookup failed; answering without it', { error: String(error) });
    return '';
  }
}
