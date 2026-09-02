/**
 * The shared vocabulary for lexical contributions.
 *
 * Three things live here, and they are together because they are the three
 * answers a dictionary contribution has to give before anybody can review it:
 * what kind of lexical thing it is, what word class it belongs to, and what it
 * actually means. All three were previously implicit — a single free-text
 * `format` string and a single `body` — which is why a proverb and a noun
 * arrived at the review desk looking identical and why "hello / good morning"
 * was stored as one entry whose headword was the literal string
 * "hello / good morning".
 *
 * Deliberately free of `firebase-admin` and `firebase-functions` imports. The
 * rules in this file are consulted by the queue callables, the contribution
 * parser, the publication projection and the review desk, and every one of
 * them wants to be unit-testable with plain `node --test`. The alternative —
 * hanging these constants off the module that owns the callables — was tried
 * first and meant that asserting "ideophone is in the list" needed a Firestore
 * client on the test runner's path.
 */

/**
 * What kind of lexical thing a contribution is.
 *
 * These are separate because they are answerable in completely different ways,
 * not because a taxonomy is tidy:
 *
 *   word    — has a headword, a word class and a translation. It can be *asked
 *             for*: you can put an English word in front of somebody and get
 *             the Kasem back. This is the only kind the guided queue serves.
 *   phrase  — a fixed multi-word expression that still behaves compositionally
 *             ("in the morning"). Promptable, but not from a single word.
 *   idiom   — means something its words do not. Nobody can be prompted for one;
 *             it has to be remembered.
 *   proverb — something somebody's grandmother said. It carries a situation, an
 *             occasion for saying it, and often a story. There is no English
 *             word you could show a member that would elicit it, and treating
 *             it as a dictionary row with a "translation" column loses the only
 *             part that matters.
 *
 * So the queue is `word`-only by design, and idioms and proverbs reach the
 * collection through the open contribution form, where the member brings the
 * item rather than the app supplying it.
 */
export const LEXICAL_KINDS = ['word', 'phrase', 'idiom', 'proverb'] as const;

export type LexicalKind = (typeof LEXICAL_KINDS)[number];

/** The kind assumed when a client sends nothing — see `canonicalLexicalKind`. */
export const DEFAULT_LEXICAL_KIND: LexicalKind = 'word';

/** One selectable word class: a stable id to store, a label to render. */
export interface PartOfSpeech {
  readonly id: string;
  readonly label: string;
}

/**
 * The word classes a contributor may choose from.
 *
 * The mobile form offered six — noun, verb, adjective, adverb, pronoun, other —
 * which is not a description of a language, it is a description of a dropdown
 * somebody wrote in an afternoon. Everything a Kasem speaker actually needs to
 * mark was landing in "other", and "other" is where data goes to stop being
 * searchable.
 *
 * ── Why ideophone is on this list ────────────────────────────────────────
 * Kasem, like Gur languages generally and like its Mabia neighbours, has a
 * large and productive ideophone class: expressive words that depict manner,
 * sound, colour intensity or texture (the "*pass* clean", "*wuu*" kind of word)
 * and that do not sit in any of the classes a European-language dropdown ships
 * with. Leaving it out would force several hundred perfectly ordinary Kasem
 * words into "other" and then quietly teach every contributor that their
 * language has a large "other" category. It does not; it has ideophones.
 *
 * `classifier`, `postposition`, `particle`, `quantifier`, `prefix` and `suffix`
 * are here for the same reason at smaller scale — a bound morpheme is a real
 * lexical entry and it is not a noun.
 *
 * The ids are stable, lowercase and hyphenated so they can be stored and
 * queried; the labels are what a person sees and may be re-worded freely.
 */
export const PARTS_OF_SPEECH: readonly PartOfSpeech[] = [
  { id: 'noun', label: 'Noun' },
  { id: 'proper-noun', label: 'Proper noun' },
  { id: 'pronoun', label: 'Pronoun' },
  { id: 'verb', label: 'Verb' },
  { id: 'auxiliary-verb', label: 'Auxiliary verb' },
  { id: 'adjective', label: 'Adjective' },
  { id: 'adverb', label: 'Adverb' },
  { id: 'preposition', label: 'Preposition' },
  { id: 'postposition', label: 'Postposition' },
  { id: 'conjunction', label: 'Conjunction' },
  { id: 'determiner', label: 'Determiner' },
  { id: 'article', label: 'Article' },
  { id: 'numeral', label: 'Numeral' },
  { id: 'quantifier', label: 'Quantifier' },
  { id: 'particle', label: 'Particle' },
  { id: 'interjection', label: 'Interjection' },
  { id: 'ideophone', label: 'Ideophone' },
  { id: 'classifier', label: 'Classifier' },
  { id: 'prefix', label: 'Prefix' },
  { id: 'suffix', label: 'Suffix' },
  { id: 'phrase', label: 'Phrase' },
  { id: 'idiom', label: 'Idiom' },
  { id: 'proverb', label: 'Proverb' },
  { id: 'other', label: 'Other' },
  { id: 'unknown', label: 'Not sure' },
] as const;

/**
 * Short forms and legacy spellings that must keep resolving.
 *
 * The six-item dropdown shipped labels, not ids, so historical submissions
 * carry "Noun" and "Adjective" in `format`; a linguist typing into the same box
 * writes "adj" or "n.". Both are cheap to accept and expensive to lose.
 */
const PART_OF_SPEECH_ALIASES: Readonly<Record<string, string>> = {
  n: 'noun',
  'n.': 'noun',
  nouns: 'noun',
  propernoun: 'proper-noun',
  name: 'proper-noun',
  pron: 'pronoun',
  v: 'verb',
  'v.': 'verb',
  verbs: 'verb',
  aux: 'auxiliary-verb',
  auxiliary: 'auxiliary-verb',
  adj: 'adjective',
  'adj.': 'adjective',
  adv: 'adverb',
  'adv.': 'adverb',
  prep: 'preposition',
  postp: 'postposition',
  conj: 'conjunction',
  det: 'determiner',
  num: 'numeral',
  number: 'numeral',
  quant: 'quantifier',
  part: 'particle',
  interj: 'interjection',
  exclamation: 'interjection',
  ideo: 'ideophone',
  expressive: 'ideophone',
  cls: 'classifier',
  saying: 'proverb',
  'not-sure': 'unknown',
  'not-specified': 'unknown',
  unspecified: 'unknown',
  '': 'unknown',
};

function normalise(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s_]+/g, '-')
    : '';
}

/** True when [id] is one of the stable word-class ids above. */
export function isPartOfSpeechId(id: unknown): boolean {
  const normalised = normalise(id);
  return PARTS_OF_SPEECH.some((entry) => entry.id === normalised);
}

/**
 * Resolves an id, a label or a common abbreviation to a stable id.
 *
 * Returns null rather than falling back to `unknown` so a caller can tell
 * "the member chose 'not sure'" from "the client sent something this backend
 * has never heard of". The queue callable treats the second as a bug worth an
 * error; the publication projection treats it as a value worth keeping as-is.
 */
export function canonicalPartOfSpeech(value: unknown): string | null {
  const normalised = normalise(value);
  if (!normalised) return null;
  if (isPartOfSpeechId(normalised)) return normalised;
  const alias = PART_OF_SPEECH_ALIASES[normalised];
  if (alias) return alias;
  const byLabel = PARTS_OF_SPEECH.find((entry) => normalise(entry.label) === normalised);
  return byLabel ? byLabel.id : null;
}

/** The human label for a word class, or the id itself when it is unfamiliar. */
export function partOfSpeechLabel(value: unknown): string {
  const id = canonicalPartOfSpeech(value);
  const found = id ? PARTS_OF_SPEECH.find((entry) => entry.id === id) : undefined;
  return found ? found.label : normalise(value);
}

/**
 * Resolves a lexical kind, defaulting to `word`.
 *
 * A default rather than a null: the field is consulted only on the dictionary
 * path, and making it nullable put a null check in front of every reader for
 * the sake of a value none of them look at. The cost of the default is one
 * meaningless string on a song's submission record.
 */
export function canonicalLexicalKind(value: unknown): LexicalKind {
  const normalised = normalise(value);
  if ((LEXICAL_KINDS as readonly string[]).includes(normalised)) {
    return normalised as LexicalKind;
  }
  if (normalised === 'expression' || normalised === 'saying') return 'proverb';
  if (normalised === 'phrasal' || normalised === 'multiword') return 'phrase';
  return DEFAULT_LEXICAL_KIND;
}

/**
 * The most translations one entry may carry.
 *
 * Eight is past the point of usefulness for a dictionary row and well short of
 * the point where somebody has pasted a paragraph into the box. A cap exists
 * at all because this string arrives from a phone and ends up in an array
 * field that other queries fan out over.
 */
export const MAX_TRANSLATIONS = 8;

/** The most characters one translation may carry; longer is truncated. */
export const MAX_TRANSLATION_LENGTH = 120;

/**
 * Turns what a member typed into the list of translations they meant.
 *
 * A Kasem word rarely maps to exactly one English word, and the reverse is just
 * as true, so the field has always been "type what it means" and members have
 * always answered with lists — "greeting, hello", "water / rain water". Storing
 * that string whole made the headword of the entry literally
 * "water / rain water", which no search will ever match and no learner will
 * ever type.
 *
 * The rules, and why each one is here:
 *
 *   * Commas and forward slashes split, because those are what people actually
 *     use. Newlines split too: a phone keyboard's return key is a separator in
 *     everybody's head, and treating it as part of a word produces an entry
 *     with an invisible line break in the middle of it.
 *   * Internal whitespace collapses, so "good   morning" and "good morning" are
 *     the same answer.
 *   * Case-insensitive de-duplication that keeps the FIRST spelling seen. The
 *     first spelling is the one the member reached for without thinking, which
 *     is the better evidence about the language than a later repetition; and
 *     picking the first makes the function order-stable, so re-parsing stored
 *     text is a no-op.
 *   * Over-long entries are truncated rather than rejected. A 400-character
 *     "translation" is a sentence pasted into the wrong box, and failing the
 *     whole submission over it costs a member on a metered connection their
 *     entire contribution — including the six good translations beside it.
 *   * The count is capped last, after de-duplication, so eight distinct
 *     translations survive a member who typed twelve with repeats.
 *
 * Pure, total, and never throws: it is called from the queue callable, from the
 * contribution parser and from the publication projection, and a parser that
 * throws on junk in the third of those would fail a publish for data that was
 * already accepted months earlier.
 */
export function parseTranslations(raw: string): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[,/\n\r]+/)) {
    const value = piece.trim().replace(/\s+/g, ' ').slice(0, MAX_TRANSLATION_LENGTH).trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_TRANSLATIONS) break;
  }
  return out;
}

/**
 * The same rules, for a field that may arrive as a list instead of a string.
 *
 * Older clients send `body` (one string); the queue form sends `translations`
 * (one string the member typed); a future client may well send an array it
 * split itself. Joining an array back into one string before parsing means all
 * three go through exactly the same de-duplication and caps, rather than the
 * array path quietly skipping them.
 */
export function normaliseTranslations(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return parseTranslations(
      raw.filter((item): item is string => typeof item === 'string').join(', '),
    );
  }
  return typeof raw === 'string' ? parseTranslations(raw) : [];
}
