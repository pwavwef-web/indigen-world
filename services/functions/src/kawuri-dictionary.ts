import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * The dictionary, as Kawuri is allowed to quote it.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Kawuri's system instruction forbids inventing Kasem, and it should: a
 * confident guess gets copied, taught and repeated. But the rule as written
 * left the assistant with only one honest answer to "how do you say water in
 * Kasem" — "go and look it up" — while the app was already holding the answer,
 * reviewed and published, one collection away.
 *
 * So a translation question is answered from the published dictionary rather
 * than from the model's memory. The question is read for the words being asked
 * about, those words are looked up, and the matching entries are handed to the
 * model as the *only* Kasem it may state as confirmed. When nothing matches,
 * that is also said out loud — an explicit "the dictionary was searched and
 * has no entry" is what stops the model quietly falling back on a guess.
 *
 * ── Why the lookup is a cache and not a query per question ──────────────────
 * Because the matching that matters cannot be expressed as a Firestore query.
 * A member types "Water?" and the entry reads "water, rain water"; a member
 * asks for "greeting" and the entry's English side is "greeting / hello". That
 * is case folding, punctuation stripping and sense splitting — none of which
 * Firestore can do without a normalised index field that nothing writes today
 * and that every existing row would have to be backfilled with.
 *
 * The published dictionary is a curated archive of a few thousand entries, not
 * a user-generated firehose, so it fits in an instance's memory comfortably.
 * It is loaded once per instance per [CACHE_TTL_MS] and matched in process. If
 * it ever outgrows [MAX_CACHED_ENTRIES] the cache is marked truncated and
 * exact-match Firestore queries run alongside it, so precision degrades into
 * "slower" rather than into "silently wrong".
 */

/** One published entry, in the shape the briefing is written from. */
export interface DictionaryRecord {
  id: string;
  /** The Kasem headword as written. */
  kasem: string;
  /** Every Kasem rendering, headword first. Several are common: one English
   * sense often has more than one Kasem word. */
  renderings: string[];
  /** The English side, as stored — possibly several senses in one string. */
  english: string;
  partOfSpeech: string;
  dialect: string;
  kasemExample: string;
  englishExample: string;
}

/** How many entries one instance will hold. */
const MAX_CACHED_ENTRIES = 4000;

/** How long a loaded dictionary is trusted before it is read again. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Entries quoted into one answer. Enough for a word with several senses,
 * few enough that the instruction stays readable to the model. */
const MAX_BRIEFING_ENTRIES = 8;

/** The longest thing that will be treated as a term to look up. Beyond this
 * somebody is asking for a paragraph to be translated, which the dictionary
 * cannot answer and must not pretend to. */
const MAX_TERM_LENGTH = 48;

/** The comparable form of a word or phrase: no case, no edge punctuation, no
 * double spacing. The same rule the app applies in `word_lookup.dart`, so a
 * word that is tappable in a post is a word Kawuri can find. */
export function normaliseTerm(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFC')
    .replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words that carry no meaning to look up on their own. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'and', 'or', 'is', 'are', 'it',
  'this', 'that', 'my', 'your', 'his', 'her', 'their', 'our', 'word', 'words',
  'term', 'phrase', 'please', 'kasem', 'kassena', 'english',
]);

/**
 * The shapes a translation question actually arrives in.
 *
 * Written out rather than inferred, because a false positive is cheap — the
 * briefing simply says nothing matched — and a false negative is the bug this
 * whole module exists to fix.
 */
const TERM_PATTERNS: readonly RegExp[] = [
  /how (?:do|would|can|should) (?:you|i|we|one) say ([^?.!]+?)(?: in (?:kasem|kassena|english))?\s*[?.!]*$/i,
  /what(?:'s| is| are)(?: the)? (?:kasem|kassena|english)(?: word| words| term| name)? for ([^?.!]+?)\s*[?.!]*$/i,
  /(?:kasem|kassena|english) (?:word|words|term|name) for ([^?.!]+?)\s*[?.!]*$/i,
  /what does ([^?.!]+?) mean\b/i,
  /what(?:'s| is) (?:the )?meaning of ([^?.!]+?)\s*[?.!]*$/i,
  /translate ([^?.!]+?)(?:\s+(?:in)?to\s+(?:kasem|kassena|english))?\s*[?.!]*$/i,
  /translation (?:of|for) ([^?.!]+?)\s*[?.!]*$/i,
  /what(?:'s| is) ([^?.!]+?) in (?:kasem|kassena|english)\s*[?.!]*$/i,
];

/**
 * The bare form — "water in Kasem" — tried only when nothing above matched.
 *
 * It has to be last and it has to be conditional, because it also matches the
 * tail of every phrasing above: run against "How do you say water in Kasem?"
 * it happily returns "how do you say water", which is not a word anybody can
 * look up.
 */
const FALLBACK_PATTERNS: readonly RegExp[] = [
  /^([^?.!]{1,48}?) in (?:kasem|kassena|english)\s*[?.!]*$/i,
];

/** Anything the member put in quotes is a term whatever else the sentence
 * does, because quoting a word is how people ask about the word itself. */
const QUOTED = /["“'‘]([^"”'’]{1,48})["”'’]/g;

/** Filler that clings to the front of an extracted term. */
const TERM_PREFIX = /^(?:the|a|an|word|words|term|phrase|this|that)\s+/i;

/**
 * Every term a question is asking to have looked up, most specific first.
 *
 * Empty when the question is not about a word at all — which is the signal the
 * caller uses to decide whether to spend a dictionary read on it.
 *
 * A multi-word term contributes its own parts as well as itself, because "good
 * morning" not being in the dictionary is no reason to withhold "morning".
 * The whole phrase always ranks ahead of its parts; see [matchDictionary].
 */
export function translationTerms(question: string): string[] {
  const asked = question.trim();
  if (!asked) return [];

  const found: string[] = [];
  // Whether a specific phrasing matched at all, which is NOT the same question
  // as whether anything survived the stop-word filter — and conflating the two
  // was a bug. "How do you say the in Kasem?" matches the first pattern
  // cleanly, captures "the", and then loses it for being a stop word; guarding
  // the fallback on an empty result let it run anyway, where it matched the
  // tail of the very phrasing that had already been understood and handed the
  // dictionary "how do you say the", "how", "you", "say" to look up. The
  // fallback exists for questions no pattern recognised, not for questions
  // whose answer was recognised and then discarded.
  let recognised = false;
  const add = (raw: string | undefined) => {
    if (!raw) return;
    recognised = true;
    const cleaned = normaliseTerm(raw.replace(TERM_PREFIX, ''));
    if (!cleaned || cleaned.length > MAX_TERM_LENGTH) return;
    if (STOP_WORDS.has(cleaned)) return;
    if (!found.includes(cleaned)) found.push(cleaned);
  };

  for (const match of asked.matchAll(QUOTED)) add(match[1]);
  for (const pattern of TERM_PATTERNS) add(asked.match(pattern)?.[1]);
  if (!recognised) {
    for (const pattern of FALLBACK_PATTERNS) add(asked.match(pattern)?.[1]);
  }

  // Parts of a phrase, after every whole phrase, so ranking prefers the whole.
  for (const term of [...found]) {
    if (!term.includes(' ')) continue;
    for (const part of term.split(' ')) {
      if (part.length > 2 && !STOP_WORDS.has(part)) add(part);
    }
  }

  return found;
}

/** Whether this question is one the dictionary should be consulted for. */
export function looksLikeTranslationRequest(question: string): boolean {
  return translationTerms(question).length > 0;
}

/**
 * The terms a question is asking about that the *dictionary* cannot answer.
 *
 * ── Why this lives here, next to its opposite ─────────────────────────────
 * [translationTerms] throws away exactly these — `the`, `a`, `of`, `to`, `in`,
 * `and`, `is` — because they carry no meaning to look up on their own. That
 * judgement is correct and it leaves a hole: "how do you say *the* in Kasem"
 * is a perfectly reasonable question that returns an empty briefing, so Kawuri
 * answers it from whatever it happens to believe about Kasem.
 *
 * The answer is not in the dictionary and never will be, because definiteness
 * in Kasem is a property of the noun rather than a word. It is in
 * `grammarRules`. So this is the same extraction with the filter inverted:
 * whatever [translationTerms] discarded as a stop word is precisely what the
 * grammar should be consulted for.
 *
 * It is in this module rather than in `kawuri-grammar.ts` so that the two
 * extractors share one set of regexes. A second copy of [TERM_PATTERNS] would
 * be the kind of duplicate that stays correct for about a month.
 */
export function grammarTerms(question: string): string[] {
  const asked = question.trim();
  if (!asked) return [];

  const found: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    // The prefix strip is deliberately NOT applied. It removes "the" and "a"
    // from the front of a term, which is right when the term is a noun being
    // looked up and fatal when the term *is* the word "the".
    const cleaned = normaliseTerm(raw);
    if (!cleaned || cleaned.length > MAX_TERM_LENGTH) return;
    if (!STOP_WORDS.has(cleaned)) return;
    if (!found.includes(cleaned)) found.push(cleaned);
  };

  for (const match of asked.matchAll(QUOTED)) add(match[1]);
  for (const pattern of TERM_PATTERNS) add(asked.match(pattern)?.[1]);
  for (const pattern of FALLBACK_PATTERNS) add(asked.match(pattern)?.[1]);

  return found;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The first of [keys] that holds text, or `''`. */
function firstText(data: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = text(data[key]);
    if (value) return value;
  }
  return '';
}

/**
 * One stored document as a record, or null when it is not an entry.
 *
 * The field names are the app's own fallback chains, deliberately. This
 * collection holds three generations of schema at once — the legacy Project
 * Kassena import, entries published before `translations` existed, and entries
 * written by `creators.ts` today — and a reader that only understood the newest
 * would quietly find nothing for most of the archive.
 *
 * Note which side is which: `translation` (singular, legacy) is the ENGLISH
 * gloss, while `translations` (plural, current) is every KASEM rendering. They
 * are opposite halves of the entry wearing nearly the same name, and reading
 * one as the other prints Kasem where English belongs.
 */
export function dictionaryRecordFrom(
  id: string,
  data: Record<string, unknown>,
): DictionaryRecord | null {
  const kasem = firstText(data, ['kasemText', 'headword', 'kasem', 'word']);
  const english = firstText(data, ['englishText', 'translation', 'english', 'definition']);
  if (!kasem && !english) return null;

  const renderings: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !renderings.includes(trimmed)) renderings.push(trimmed);
  };
  push(kasem);
  const stored = data.translations;
  if (Array.isArray(stored)) for (const item of stored) push(text(item));

  return {
    id,
    kasem: kasem || renderings[0] || '',
    renderings,
    english,
    partOfSpeech: firstText(data, ['partOfSpeech', 'wordClass', 'format']),
    dialect: text(data.dialect),
    kasemExample: firstText(data, ['kasemExample', 'example']),
    englishExample: firstText(data, ['englishExample', 'exampleTranslation']),
  };
}

/** The senses on the English side of an entry, split apart.
 *
 * Members answer "what does it mean" with lists — "greeting, hello", "water /
 * rain water" — and the stored string is that answer whole. Somebody asking
 * for "hello" must find the entry whose English side merely contains it. */
export function englishSenses(entry: DictionaryRecord): string[] {
  return entry.english
    .split(/[,;/|]|\bor\b/i)
    .map(normaliseTerm)
    .filter((sense) => sense.length > 0);
}

/** Every form of an entry a term could legitimately be matched against. */
function surfaceForms(entry: DictionaryRecord): string[] {
  const forms = entry.renderings.map(normaliseTerm).filter(Boolean);
  for (const sense of englishSenses(entry)) forms.push(sense);
  const whole = normaliseTerm(entry.english);
  if (whole && !forms.includes(whole)) forms.push(whole);
  return forms;
}

/**
 * The entries worth showing for [terms], best first.
 *
 * Ranked rather than filtered, because the difference between "the entry for
 * this exact word" and "an entry that happens to start with these letters" is
 * the difference between an answer and a near miss, and the model should be
 * handed them in that order. Within a rank, the earlier term wins — and
 * [translationTerms] puts whole phrases before their parts precisely so that
 * ordering means something here.
 */
export function matchDictionary(
  records: readonly DictionaryRecord[],
  terms: readonly string[],
  limit: number = MAX_BRIEFING_ENTRIES,
): DictionaryRecord[] {
  if (terms.length === 0) return [];

  const scored: { entry: DictionaryRecord; rank: number; termIndex: number }[] = [];
  for (const entry of records) {
    const forms = surfaceForms(entry);
    if (forms.length === 0) continue;

    let best: { rank: number; termIndex: number } | null = null;
    terms.forEach((term, termIndex) => {
      let rank: number | null = null;
      if (forms.includes(term)) rank = 0;
      else if (forms.some((form) => form.startsWith(`${term} `) || form.endsWith(` ${term}`))) rank = 1;
      else if (forms.some((form) => form.startsWith(term) && form.length <= term.length + 3)) rank = 2;
      if (rank === null) return;
      if (best === null || rank < best.rank) best = { rank, termIndex };
    });

    if (best !== null) {
      const { rank, termIndex } = best as { rank: number; termIndex: number };
      scored.push({ entry, rank, termIndex });
    }
  }

  scored.sort((a, b) => a.rank - b.rank || a.termIndex - b.termIndex);
  return scored.slice(0, limit).map((item) => item.entry);
}

/** One entry as a line the model can quote without re-deriving anything. */
function briefingLine(entry: DictionaryRecord, index: number): string {
  const alternates = entry.renderings.slice(1);
  const parts = [
    `${index + 1}. Kasem: ${entry.kasem || '(none recorded)'}`,
    alternates.length > 0 ? `also written: ${alternates.join(', ')}` : '',
    `English: ${entry.english || '(none recorded)'}`,
    entry.partOfSpeech ? `word class: ${entry.partOfSpeech}` : '',
    entry.dialect ? `dialect: ${entry.dialect}` : '',
  ].filter(Boolean);
  const example = entry.kasemExample
    ? `\n   Example: ${entry.kasemExample}${entry.englishExample ? ` — ${entry.englishExample}` : ''}`
    : '';
  return `${parts.join(' — ')}${example}`;
}

/**
 * The instruction block appended for a translation question.
 *
 * Returns `''` when the question was not about a word, so the common case
 * costs the prompt nothing.
 *
 * A miss is reported as loudly as a hit. "Nothing matched" is real, useful
 * information — it is the honest state of the language's coverage, and it is
 * also the only thing that reliably stops a model filling the silence with a
 * plausible-looking invention.
 */
export function dictionaryBriefing(
  terms: readonly string[],
  matches: readonly DictionaryRecord[],
): string {
  if (terms.length === 0) return '';

  const asked = terms.slice(0, 6).map((term) => `"${term}"`).join(', ');
  if (matches.length === 0) {
    return `DICTIONARY LOOKUP — the published Indigen World dictionary was searched for ${asked} and has NO entry for any of them.

Say so plainly: the dictionary does not have this word yet. Do not offer a Kasem word from your own memory, do not guess a spelling, and do not describe how it "might" be said. Point the person at the Contribute tab if they know the word from a speaker, or at the Community tab if they want to ask one.`;
  }

  const lines = matches.map(briefingLine).join('\n');
  return `DICTIONARY LOOKUP — the published Indigen World dictionary was searched for ${asked}. These entries matched, and they are the ONLY Kasem you may state as confirmed in this answer:

${lines}

How to use them:
• Lead with the word itself, then the meaning. Quote the spelling exactly as written above — every character, every mark.
• Where an entry lists more than one Kasem rendering, give them all and say they are alternatives.
• Where an entry carries an example sentence, include it; it is what makes the word usable.
• If the entry does not actually answer what was asked, say that instead of stretching it to fit.
• Do not add any further Kasem word from memory. Anything not listed above is unattested, and saying so is a complete answer.`;
}

/** The cached dictionary for this instance. */
let cache: { records: DictionaryRecord[]; truncated: boolean; loadedAt: number } | null = null;

/** Drops the cache. For tests, and for anything that needs a cold read. */
export function resetDictionaryCache(): void {
  cache = null;
}

async function loadDictionary(): Promise<{ records: DictionaryRecord[]; truncated: boolean }> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache;

  const snapshot = await getFirestore()
    .collection('dictionaryEntries')
    .where('isPublished', '==', true)
    .limit(MAX_CACHED_ENTRIES + 1)
    .get();

  const docs = snapshot.docs.slice(0, MAX_CACHED_ENTRIES);
  const records: DictionaryRecord[] = [];
  for (const doc of docs) {
    const record = dictionaryRecordFrom(doc.id, doc.data() as Record<string, unknown>);
    if (record) records.push(record);
  }

  const truncated = snapshot.size > MAX_CACHED_ENTRIES;
  if (truncated) {
    logger.warn('Dictionary cache is truncated; exact lookups will query directly', {
      cached: records.length,
    });
  }
  cache = { records, truncated, loadedAt: now };
  return cache;
}

/**
 * Exact-match rows the cache could not have held.
 *
 * Only runs once the archive has outgrown [MAX_CACHED_ENTRIES]. The stored
 * values are not normalised, so this asks for the three casings a headword is
 * realistically stored in rather than pretending an equality query can fold
 * case — it is a safety net for a dictionary that has grown, not the primary
 * path.
 */
async function exactMatches(terms: readonly string[]): Promise<DictionaryRecord[]> {
  const db = getFirestore();
  const found = new Map<string, DictionaryRecord>();
  const fields = ['kasemText', 'englishText', 'headword'];

  for (const term of terms.slice(0, 3)) {
    const casings = [term, term.charAt(0).toUpperCase() + term.slice(1), term.toUpperCase()];
    for (const field of fields) {
      for (const value of new Set(casings)) {
        const snapshot = await db
          .collection('dictionaryEntries')
          .where('isPublished', '==', true)
          .where(field, '==', value)
          .limit(3)
          .get();
        for (const doc of snapshot.docs) {
          const record = dictionaryRecordFrom(doc.id, doc.data() as Record<string, unknown>);
          if (record) found.set(doc.id, record);
        }
      }
    }
  }
  return [...found.values()];
}

/**
 * The dictionary instruction for a question, or `''` when none is owed.
 *
 * Never throws. A dictionary that cannot be read is a Kawuri that answers the
 * way it did before this module existed — which is a worse answer, not a
 * broken one, and is not worth failing a member's question over.
 */
export async function dictionaryContextFor(question: string): Promise<string> {
  const terms = translationTerms(question);
  if (terms.length === 0) return '';

  try {
    const { records, truncated } = await loadDictionary();
    const matches = matchDictionary(records, terms);
    if (matches.length === 0 && truncated) {
      const direct = matchDictionary(await exactMatches(terms), terms);
      return dictionaryBriefing(terms, direct);
    }
    return dictionaryBriefing(terms, matches);
  } catch (error) {
    logger.error('Dictionary lookup failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return '';
  }
}
