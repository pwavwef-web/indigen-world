/**
 * Senses: the several things one word means.
 *
 * ── The gap this closes ──────────────────────────────────────────────────
 * Until now a contribution could say what a word means exactly once. The form
 * asked "what does it mean in English", took one answer, and the published
 * entry carried one gloss with one example sentence under it. That is not what
 * a word is. English *toy* is several different nouns — the thing a child
 * plays with, a trinket, a small breed of dog — before it is a verb at all,
 * and every one of those senses has its own example sentence, its own register
 * and its own set of words it can stand next to. Flattening them into
 * "toy, plaything, trinket" throws away which example belongs to which
 * meaning, which is the part a learner actually needs.
 *
 * ── Senses are not homographs, and the difference is load-bearing ────────
 * `kasem-homographs.ts` numbers entries that are *different words* sharing a
 * spelling — `mo¹` the focus particle beside `mo²`. Those get separate
 * documents, separate ids and a permanent number, because a citation of `mo²`
 * has to keep pointing at the same word for ever.
 *
 * These are the several meanings of ONE word: one document, one headword, one
 * etymology, numbered inside the entry. Merging the two concepts is the single
 * most common way a dictionary schema goes wrong, because both surface as
 * "1." and "2." on the page and only one of them is a stable identity.
 *
 * ── Every field below is optional except the definition ──────────────────
 * The median contribution will be one sense with one definition, and it must
 * cost exactly what it costs today. Everything else here exists so that the
 * contributor who *does* know the register, the domain or the second example
 * has somewhere to put it, rather than being told the archive has no room for
 * what they know.
 *
 * Deliberately free of `firebase-admin` imports, for the same reason as
 * `lexical-kinds.ts`: this is consulted by the contribution parser, the
 * publication projection and the review desk, and all three want to be
 * testable with plain `node --test`.
 */

import { canonicalPartOfSpeech, parseProse, parseTranslations } from './lexical-kinds.js';

/**
 * The most senses one entry may carry.
 *
 * Twelve is past what any Kasem entry is likely to need and well short of the
 * point where somebody has pasted a dictionary page into the form. The cap
 * exists because this array is written to a Firestore document that other
 * queries fan out over, not because twelve is a linguistic claim.
 */
export const MAX_SENSES = 12;

/** The most examples one sense may carry. */
export const MAX_SENSE_EXAMPLES = 4;

/** Definitions are a gloss or a short phrase, not an essay. */
export const MAX_SENSE_DEFINITION_LENGTH = 300;

/** An example is a sentence; four hundred characters is a generous sentence. */
export const MAX_EXAMPLE_LENGTH = 400;

/** Usage notes explain when to say it, in a sentence or three. */
export const MAX_USAGE_NOTE_LENGTH = 600;

/** The most cross-references (synonyms, opposites, see-also) one sense holds. */
export const MAX_CROSS_REFERENCES = 8;

/**
 * How a word is said, and to whom.
 *
 * ── Why these labels and not the standard lexicographic set ──────────────
 * Because the standard set — "colloq.", "vulg.", "arch." — is a vocabulary a
 * contributor has to be taught before they can use it, and this form is
 * answered by speakers rather than by lexicographers. Each id below is stored;
 * each label is a thing somebody can recognise about their own speech without
 * being trained. `avoided` in particular is deliberately not called "vulgar":
 * what a Kasem speaker will actually tell you is who they would not say it in
 * front of.
 *
 * `everyday` is on the list rather than being the absence of a label, because
 * "this is ordinary speech" is a real answer and is different from "nobody has
 * said". Absent still means absent.
 *
 * Mirrors `kSenseRegisters` in
 * `apps/mobile/lib/features/contribute/words/data/sense_labels.dart` and
 * `SENSE_REGISTERS` in `apps/tribestudio/src/creator/lexicon.ts`; all three
 * must agree.
 */
export const SENSE_REGISTERS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'everyday', label: 'Everyday speech' },
  { id: 'respectful', label: 'Said with respect' },
  { id: 'formal', label: 'Formal or ceremonial' },
  { id: 'colloquial', label: 'Casual, among friends' },
  { id: 'old', label: "Old people's word" },
  { id: 'new', label: 'Newer word' },
  { id: 'joking', label: 'Said jokingly' },
  { id: 'figurative', label: 'Figurative' },
  { id: 'childspeak', label: 'Said to children' },
  { id: 'avoided', label: 'Not said in front of elders' },
];

const REGISTER_IDS = new Set(SENSE_REGISTERS.map((entry) => entry.id));

/**
 * What the sense is about.
 *
 * ── A subject field, not a tag cloud ─────────────────────────────────────
 * Free-text tags were the alternative and they produce "farming", "farm",
 * "Farming", "agric" on four entries that mean the same thing, which makes the
 * field useless for exactly the query it exists to serve — show me the
 * vocabulary of the farm. A closed list is browsable; an open one is not.
 *
 * The list is Kasena-shaped rather than generic: chieftaincy and the market
 * are on it because they are where a great deal of this vocabulary lives, and
 * "technology" is not, because inventing a domain the archive has no words in
 * is how a dropdown starts lying about a language.
 */
export const SENSE_DOMAINS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'farming', label: 'Farming and land' },
  { id: 'food', label: 'Food and cooking' },
  { id: 'kinship', label: 'Family and kinship' },
  { id: 'body', label: 'The body and health' },
  { id: 'animals', label: 'Animals' },
  { id: 'plants', label: 'Plants and trees' },
  { id: 'weather', label: 'Weather and seasons' },
  { id: 'market', label: 'Market and trade' },
  { id: 'house', label: 'House and compound' },
  { id: 'clothing', label: 'Clothing and adornment' },
  { id: 'ritual', label: 'Ritual and belief' },
  { id: 'chieftaincy', label: 'Chieftaincy and custom' },
  { id: 'greeting', label: 'Greetings and address' },
  { id: 'music', label: 'Music and dance' },
  { id: 'work', label: 'Work and craft' },
  { id: 'travel', label: 'Travel and place' },
  { id: 'time', label: 'Time and counting' },
  { id: 'speech', label: 'Speech and storytelling' },
];

const DOMAIN_IDS = new Set(SENSE_DOMAINS.map((entry) => entry.id));

/** One example sentence, in Kasem and in English. */
export interface SenseExample {
  /** The sentence as it is said. May be empty when only a translation was given. */
  kasem: string;
  /** What it means. May be empty when only the Kasem was given. */
  english: string;
}

/** One meaning of one word. */
export interface LexicalSense {
  /** What it means, in English. The one field a sense cannot be without. */
  definition: string;
  /**
   * The word class this particular sense belongs to.
   *
   * ── Why the class sits on the sense and not only on the entry ──────────
   * Because the entry-level class cannot describe a word that is a noun in its
   * first two senses and a verb in its third, which is the ordinary case
   * rather than the exotic one. `alsoUsedAs` records *that* a word crosses
   * classes; this records *which meaning* does the crossing, which is what
   * lets the renderer group senses the way every printed dictionary does.
   *
   * Empty means "the same class as the entry", which is what the great
   * majority of senses will say and is cheaper than repeating it on every row.
   */
  partOfSpeech: string;
  /** How it is said, and to whom. One of SENSE_REGISTERS, or empty. */
  register: string;
  /** What it is about. One of SENSE_DOMAINS, or empty. */
  domain: string;
  /** This sense's meaning stated in Kasem, where somebody gave one. */
  kasemDefinition: string;
  /** When to say it, when not to, what it goes with. */
  usageNote: string;
  /** Sentences showing this sense in use. */
  examples: SenseExample[];
  /** Other words that mean roughly this. Kasem, as written. */
  synonyms: string[];
  /** Words that mean the opposite. */
  antonyms: string[];
}

/** An empty sense, for a client that needs somewhere to start. */
export function emptySense(): LexicalSense {
  return {
    definition: '',
    partOfSpeech: '',
    register: '',
    domain: '',
    kasemDefinition: '',
    usageNote: '',
    examples: [],
    synonyms: [],
    antonyms: [],
  };
}

function parseExamples(raw: unknown): SenseExample[] {
  if (!Array.isArray(raw)) return [];
  const out: SenseExample[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const kasem = parseProse(record.kasem, MAX_EXAMPLE_LENGTH);
    const english = parseProse(record.english, MAX_EXAMPLE_LENGTH);
    // An example with neither half is not an example. An example with only one
    // half is: a contributor who wrote the Kasem and left the translation for a
    // reviewer has given the archive the sentence, which is the part nobody
    // else can supply.
    if (!kasem && !english) continue;
    out.push({ kasem, english });
    if (out.length >= MAX_SENSE_EXAMPLES) break;
  }
  return out;
}

/**
 * A list of cross-referenced words.
 *
 * Run through `parseTranslations` rather than a bespoke splitter so that a
 * contributor who types "nia, nyu" into the synonyms box gets two references
 * and the same trimming, de-duplication and cap every other list field gets.
 * The function's name is about where it started, not about what it does.
 */
function parseReferences(raw: unknown): string[] {
  const joined = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string').join(', ')
    : typeof raw === 'string'
      ? raw
      : '';
  return parseTranslations(joined).slice(0, MAX_CROSS_REFERENCES);
}

function parseChoice(raw: unknown, allowed: Set<string>): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim().toLowerCase();
  return allowed.has(value) ? value : '';
}

/**
 * Reads whatever a client sent into the senses it meant.
 *
 * Pure, total, and never throws — it runs in the contribution callable, in the
 * publication projection and in the review desk's projection, and a parser that
 * threw on junk in the last of those would fail a re-publish for data that was
 * accepted months earlier.
 *
 * A sense with no definition is dropped rather than kept as a blank row: the
 * definition is the whole content of a sense, and an entry showing "2. " with
 * nothing after it is worse than an entry with one sense.
 */
export function parseSenses(raw: unknown): LexicalSense[] {
  if (!Array.isArray(raw)) return [];
  const out: LexicalSense[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const definition = parseProse(record.definition, MAX_SENSE_DEFINITION_LENGTH);
    if (!definition) continue;
    // Two senses with the same definition are one sense typed twice. Dropping
    // the repeat keeps the numbering honest: "1. water 2. water" tells a
    // learner there is a distinction to find and then does not show it.
    const key = definition.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      definition,
      partOfSpeech: canonicalPartOfSpeech(record.partOfSpeech) ?? '',
      register: parseChoice(record.register, REGISTER_IDS),
      domain: parseChoice(record.domain, DOMAIN_IDS),
      kasemDefinition: parseProse(record.kasemDefinition, MAX_SENSE_DEFINITION_LENGTH),
      usageNote: parseProse(record.usageNote, MAX_USAGE_NOTE_LENGTH),
      examples: parseExamples(record.examples),
      synonyms: parseReferences(record.synonyms),
      antonyms: parseReferences(record.antonyms),
    });
    if (out.length >= MAX_SENSES) break;
  }
  return out;
}

/**
 * The senses reduced to their storable shape — empty fields dropped.
 *
 * Nine keys of which the median sense fills two would put seven empty strings
 * on every row of every entry, and would make "nobody has said" indistinguishable
 * from "somebody said nothing", which is the distinction the whole record turns
 * on. See `storableForms` in `kasem-morphology.ts` for the same rule applied to
 * the paradigm.
 */
export function storableSenses(senses: LexicalSense[]): Record<string, unknown>[] {
  return senses.map((sense) => ({
    definition: sense.definition,
    ...(sense.partOfSpeech ? { partOfSpeech: sense.partOfSpeech } : {}),
    ...(sense.register ? { register: sense.register } : {}),
    ...(sense.domain ? { domain: sense.domain } : {}),
    ...(sense.kasemDefinition ? { kasemDefinition: sense.kasemDefinition } : {}),
    ...(sense.usageNote ? { usageNote: sense.usageNote } : {}),
    ...(sense.examples.length > 0 ? { examples: sense.examples } : {}),
    ...(sense.synonyms.length > 0 ? { synonyms: sense.synonyms } : {}),
    ...(sense.antonyms.length > 0 ? { antonyms: sense.antonyms } : {}),
  }));
}

/**
 * The flat list of English meanings a set of senses amounts to.
 *
 * ── Why the flat projection is written as well as the structured one ─────
 * Because fifteen thousand published entries, six screens and one search index
 * already read the flat form, and a structured field they have never heard of
 * would make a three-sense entry look like a blank one everywhere except the
 * one screen that was updated. Writing both means the new shape is additive:
 * an old client shows "toy, plaything, small dog" exactly as it always has,
 * and a new client shows the three senses with their examples underneath.
 *
 * The projection is derived rather than stored twice by a contributor. Asking
 * somebody to keep a summary line in step with the senses above it is asking
 * them to do a job a function does perfectly.
 */
export function sensesToTranslations(senses: LexicalSense[]): string[] {
  return parseTranslations(senses.map((sense) => sense.definition).join(', '));
}

/**
 * The senses an entry should be *read* as, given what it actually carries.
 *
 * A contribution written before senses existed has one meaning, possibly
 * several English words for it, and one example sentence. That is a
 * single-sense entry and it should render as one — so rather than teach every
 * reader a second code path, the legacy shape is lifted into the new one here.
 *
 * Deliberately not run at write time on old documents: nothing is migrated,
 * nothing is rewritten, and an entry approved last year still publishes
 * byte-for-byte as it did then. The lift happens on read, where it costs
 * nothing and can be changed without touching a single stored row.
 */
export function sensesOrLegacy(input: {
  senses: LexicalSense[];
  translations: string[];
  kasemExample?: string;
  englishExample?: string;
  kasemDefinition?: string;
}): LexicalSense[] {
  if (input.senses.length > 0) return input.senses;
  const definition = input.translations.join(', ');
  if (!definition) return [];
  const kasem = parseProse(input.kasemExample, MAX_EXAMPLE_LENGTH);
  const english = parseProse(input.englishExample, MAX_EXAMPLE_LENGTH);
  return [
    {
      ...emptySense(),
      definition: definition.slice(0, MAX_SENSE_DEFINITION_LENGTH),
      kasemDefinition: parseProse(input.kasemDefinition, MAX_SENSE_DEFINITION_LENGTH),
      examples: kasem || english ? [{ kasem, english }] : [],
    },
  ];
}

/** Whether anything in this list is worth storing. */
export function hasSenses(senses: LexicalSense[]): boolean {
  return senses.length > 0;
}

/**
 * Whether a set of senses says more than the flat gloss already said.
 *
 * The publication projection uses this to decide whether to write the `senses`
 * array at all. One sense carrying nothing but a definition that is already in
 * `englishText` is the legacy shape wearing a new name, and storing it would
 * put an array on fifteen thousand rows to say what one string already says.
 */
export function sensesAddDetail(senses: LexicalSense[]): boolean {
  if (senses.length > 1) return true;
  const only = senses[0];
  if (!only) return false;
  return Boolean(
    only.partOfSpeech ||
      only.register ||
      only.domain ||
      only.kasemDefinition ||
      only.usageNote ||
      only.examples.length > 0 ||
      only.synonyms.length > 0 ||
      only.antonyms.length > 0,
  );
}
