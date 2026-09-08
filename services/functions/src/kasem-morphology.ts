/** Recorded noun forms remain authoritative; the blanket mo rule is disputed. */
export const KASEM_INDEFINITE_PARTICLE = 'mo';

/** No form is synthesized until its construction is independently validated. */
export function indefiniteForm(_headword: unknown): string { return ''; }

/** One noun class: the marker that identifies it and what it does. */
export interface NounClass {
  /** Stable, lowercase, storable. Never renamed once entries carry it. */
  readonly id: string;
  /** What a person reads. Free to be re-worded; the id is not. */
  readonly label: string;
  /** The ending a singular definite form takes in this class. */
  readonly definiteMarker: string;
  /** The ending a plural takes, or '' where it has not been established. */
  readonly pluralMarker: string;
}

/**
 * The noun classes, and why this list is empty.
 *
 * ── Read this before adding anything ─────────────────────────────────────
 * Kasem is a Gur language and unquestionably has a noun-class system. This
 * list is empty anyway, because nobody has yet written the inventory down in
 * a form this project can point at, and a plausible-looking invented class is
 * far worse than an admitted gap: it would be published, taught, copied into
 * lessons and repeated back by Kawuri, and it would be indistinguishable from
 * a real one to everybody downstream. `kawuri-dictionary.ts` exists in the
 * shape it does for exactly this reason — a confident guess about a language
 * with few written sources does not stay a guess for long.
 *
 * Note in particular that a definite marker discussed in conversation while
 * designing this is **not** an attestation and must not be seeded here. Only
 * a form a Kasem speaker has stated, or one induced from enough contributed
 * definite forms to be obvious, belongs on this list.
 *
 * Nothing is blocked by the emptiness. [parseLexicalForms] collects real
 * definite and plural forms from real speakers from the day it ships, which is
 * the evidence the inventory has to be built from; [induceNounClass] simply
 * returns null until there is something to match against, and `nounClass: null`
 * beside a recorded definite form is already strictly more than the dictionary
 * holds today.
 *
 * To populate: add one entry per class, then re-run `seed-grammar.mjs`, which
 * generates the public `grammarRules/noun-classes` document from this array so
 * the two can never drift.
 */
export const NOUN_CLASSES: readonly NounClass[] = [];

/** A class matched to a form, and the marker that matched it. */
export interface InducedNounClass {
  readonly id: string;
  readonly marker: string;
}

/**
 * Works out which class a noun belongs to from the definite form of it.
 *
 * ── Why induce rather than ask ────────────────────────────────────────────
 * The alternative was a noun-class picker on the contribution form. It would
 * have been much less work and it would have collected almost nothing: most
 * fluent speakers of any language cannot name their own noun classes, and a
 * picker somebody cannot answer is a picker they set to the first item. Asking
 * instead for the form — "say it with *the*" — is a question every speaker can
 * answer without thinking, and the class falls out of the answer.
 *
 * Returns **null**, not a guess and not a fallback class, whenever the ending
 * matches nothing known. A null here surfaces as `nounClass: null` on the
 * entry, which reads as "not established yet" — the truth. Anything else would
 * quietly manufacture linguistic claims out of unrecognised spellings.
 *
 * Longest marker first, so a class whose marker ends with another class's
 * marker cannot be shadowed by it.
 */
export function induceNounClass(headword: unknown, definite: unknown): InducedNounClass | null {
  const form = normalise(definite);
  if (!form) return null;

  // A definite form identical to the headword tells us nothing: either the
  // member echoed the box above, or this class is unmarked. Neither is
  // evidence for a class, and treating an echo as one would assign the whole
  // dictionary to whichever class happened to be listed first.
  if (form === normalise(headword)) return null;

  const candidates = [...NOUN_CLASSES]
    .filter((entry) => entry.definiteMarker.length > 0)
    .sort((a, b) => b.definiteMarker.length - a.definiteMarker.length);

  for (const entry of candidates) {
    const marker = normalise(entry.definiteMarker);
    // Either suffixed directly or written as a separate word — members write
    // both, and which one is orthographically correct is not a question the
    // contribution form is entitled to make somebody answer.
    if (form.endsWith(marker) || form.endsWith(` ${marker}`)) {
      return { id: entry.id, marker: entry.definiteMarker };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The three surfaces the same class marker keeps turning up on
// ---------------------------------------------------------------------------

/**
 * The definite determiners a Kasem speaker has stated, and nothing else.
 *
 * Eight, from Francis (a Kasem speaker) on 2026-09-05 and 2026-09-06:
 * `kam kom dem tem bam yam sem`, plus `wom` volunteered afterwards and
 * corroborated by Niggli's `wʋm` "le, la (article)". Which noun takes which is
 * the open question — this list says only *what the set is*, which is a much
 * weaker and much safer claim than saying what picks a member of it.
 *
 * Nothing in this module chooses one. [articleIn] recognises one that a
 * speaker has already written down, which is reading, not deciding.
 */
export const DEFINITE_ARTICLES: readonly string[] = [
  'kam', 'kom', 'dem', 'tem', 'bam', 'yam', 'sem', 'wom',
];

/** A determiner, and the pronoun a noun taking it is referred to by. */
export interface DeterminerPronoun {
  /** One of [DEFINITE_ARTICLES]. */
  readonly article: string;
  /** What you call the noun afterwards. */
  readonly pronoun: string;
}

/**
 * The pronoun that goes with each definite determiner.
 *
 * Stated by Francis (a Kasem speaker) on 2026-09-08, unprompted: "here the
 * pronoun is determined by the determiner. so if the definite determiner of a
 * noun is wom, the pronoun is o / kam — ka / dem — de / sem — se".
 *
 * ── Why this is a rule and the numeral series is not ─────────────────────
 * The correspondence between an article and a numeral prefix is a *hypothesis*
 * — see [NUMERAL_TWO_FORMS] — because nobody has said it; it was noticed in
 * the shape of two lists. This one was stated outright, as a rule, by a
 * speaker describing his own language: the determiner **decides** the pronoun.
 * So the four rows below are attestations, and the derivation built on them
 * ([pronounForDefinite]) is licensed in a way that deriving a noun class from
 * a spelling is not.
 *
 * The remaining four — `kom` → `ko`, `tem` → `te`, `bam` → `ba`, `yam` → `ya`
 * — were given on the same day, in answer to a direct question. The table is
 * therefore **complete**: every one of the eight determiners has a pronoun,
 * and every row is something a speaker said rather than something a pattern
 * suggested. For a few hours it held only four, and the other four were
 * withheld *precisely because* they were the shape the pattern predicted.
 * They turning out right does not retrospectively license the guess.
 *
 * ── Why this stays a table and does not become `article.slice(0, -1)` ────
 * Because seven of the eight are the article minus its `-m` and the eighth is
 * not: `wom` gives **o**, not `wo`. A string operation would be a claim about
 * every determiner, including the ninth nobody has found yet — it would answer
 * confidently for a form no speaker has ever been asked about, which is the one
 * thing this module exists to refuse. Eight attested rows are a record; a rule
 * inferred from seven of them is a generalisation, and generalisations go
 * through `kasem-claims.ts`.
 *
 * ── What the completed set corroborates ──────────────────────────────────
 * Six markers — `ba`, `ya`, `se`, `te`, `de`, `ka` — are now observed on all
 * three surfaces: article, numeral prefix and pronoun. `ko` and `o` appear on
 * two, having no attested numeral. That is a materially stronger correspondence
 * than the one [numeralSeriesIn] describes, and it still is not the class
 * inventory: knowing that a marker recurs is not knowing which noun takes it.
 * [NOUN_CLASSES] stays empty.
 */
export const DETERMINER_PRONOUNS: readonly DeterminerPronoun[] = [
  { article: 'kam', pronoun: 'ka' },
  { article: 'kom', pronoun: 'ko' },
  { article: 'dem', pronoun: 'de' },
  { article: 'tem', pronoun: 'te' },
  { article: 'bam', pronoun: 'ba' },
  { article: 'yam', pronoun: 'ya' },
  { article: 'sem', pronoun: 'se' },
  // The one that is not the article minus its `-m`, and the reason the seven
  // above are stored rather than computed.
  { article: 'wom', pronoun: 'o' },
];

/**
 * The attested Ghana-Kasem forms of *two*, and the class prefix each carries.
 *
 * Stated by Francis on 2026-09-05, verbatim: "balei, yalei, nlei, selei, telei
 * and delei all mean 2 and are used in Ghana Kasem. The word that comes before
 * influences which one to use." The root is `-lei`; the prefix is chosen by
 * the noun being counted.
 *
 * ── Seven, and only the seven that were said ─────────────────────────────
 * `kalei` was added on 2026-09-06 when Francis, asked directly, answered
 * "kalei does exist". It is here **because he said so and for no other
 * reason**, and the distinction matters enough to write down: for a day this
 * list held six, and `kalei` was refused *precisely because* it was the shape
 * the pattern predicted — `kam` is an article, so a `ka-` numeral ought to
 * follow. Being predicted by a pattern is not evidence. Being said by a
 * speaker is. The prediction turning out right does not retrospectively make
 * the guess sound; the next one may not.
 *
 * The segmentation `ka` + `-lei` is safe on different grounds: the root
 * `-lei` is common to seven attested forms and six of the prefixes are
 * independently motivated by the article list. That is a paradigm, not a
 * reading off the spelling — which is the thing the `amo` note in
 * `kasem-grammar-model` warns against.
 *
 * Still missing: any form for the `kom` and `wom` articles. They stay missing.
 *
 * ── What `n-` turned out to be ───────────────────────────────────────────
 * For three days `nlei` was the standing objection to the whole
 * article/numeral correspondence: six of the seven prefixes match an article
 * (ba↔bam, ya↔yam, se↔sem, te↔tem, de↔dem, ka↔kam) and `n-` matched nothing,
 * so the two lists had to be called related rather than identical.
 *
 * Francis, on 2026-09-08: **"nlei is often used in countdowns."** That is a
 * different job from the other six. They are chosen by the noun being counted;
 * this one is reached for when counting itself is the activity and there is no
 * noun to agree with. An orphan prefix and a form that agrees with nothing are
 * the same observation seen from two sides.
 *
 * Recorded as what was said, and no further. "Often used in countdowns" is not
 * "never agrees with a noun", so `nlei` stays on this list and
 * [numeralSeriesIn] keeps recognising it: a member who writes `dɩɩ nlei` has
 * said something, and the reading of it does not change. What has changed is
 * that its absence from the article list is no longer evidence *against* the
 * correspondence — which makes that correspondence six-for-six among the forms
 * that do agree, still with one noun (`da`) directly observed both ways.
 */
export interface NumeralSeries {
  /** The whole word for *two* in this series. */
  readonly form: string;
  /** The class prefix it carries — what a noun is said to "count with". */
  readonly prefix: string;
}

export const NUMERAL_TWO_FORMS: readonly NumeralSeries[] = [
  { form: 'balei', prefix: 'ba' },
  { form: 'yalei', prefix: 'ya' },
  { form: 'nlei', prefix: 'n' },
  { form: 'selei', prefix: 'se' },
  { form: 'telei', prefix: 'te' },
  { form: 'delei', prefix: 'de' },
  // Attested by Francis on 2026-09-06, in answer to a direct question.
  { form: 'kalei', prefix: 'ka' },
];

/**
 * The determiner inside a recorded definite form, or null.
 *
 * ── Reading, not inferring ───────────────────────────────────────────────
 * A member answered "say it with *the*" and wrote `bu kam` or `bukam`. Both
 * contain a word from [DEFINITE_ARTICLES], and saying so out loud on the entry
 * is a restatement of what they typed — not a claim about which article the
 * noun *takes*, which is a generalisation over many speakers that only
 * `kasem-claims.ts` may make.
 *
 * Null whenever nothing matches, which covers every entry whose definite form
 * is spelt some other way. Null renders as *nothing shown*, never as a guess:
 * see the header of [NOUN_CLASSES] for why that asymmetry is the whole point.
 *
 * A whole-word match at the end, or a suffix on the last token. Longest first,
 * so no article that ends with another can shadow it.
 */
export function articleIn(definite: unknown): string | null {
  const form = normalise(definite);
  if (!form) return null;
  const tokens = form.split(' ').filter(Boolean);
  const last = tokens[tokens.length - 1] ?? '';
  const ordered = [...DEFINITE_ARTICLES].sort((a, b) => b.length - a.length);
  for (const article of ordered) {
    // A bare `kam` on its own is the article, not a noun said with it, and it
    // tells us nothing about a headword. Requiring something in front keeps
    // the entry for the article itself out of its own paradigm.
    if (last === article && tokens.length > 1) return article;
    if (last !== article && last.endsWith(article)) return article;
  }
  return null;
}

/** The pronoun recorded for a determiner, or null where none has been stated. */
export function pronounForArticle(article: unknown): string | null {
  const value = normalise(article);
  if (!value) return null;
  const match = DETERMINER_PRONOUNS.find((entry) => entry.pronoun && entry.article === value);
  return match ? match.pronoun : null;
}

/**
 * The pronoun a noun takes, read out of its definite form.
 *
 * Two steps, both of which can fail and both of which fail to null: find the
 * determiner inside what the speaker wrote ([articleIn]), then look up the
 * pronoun stated for it ([DETERMINER_PRONOUNS]). A noun whose definite form
 * ends in `tem` returns null today and will return `te` on the day somebody
 * says so — the gap is in the table, not in the code, which is where a gap in
 * what is known ought to live.
 *
 * ── Why this may be derived when a noun class may not ────────────────────
 * Because a speaker stated the rule. [induceNounClass] refuses to guess
 * because no one has said which noun belongs to which class; here somebody has
 * said that the determiner decides the pronoun, so applying it is repeating
 * what he said rather than inventing a step he did not take.
 */
export function pronounForDefinite(definite: unknown): string | null {
  return pronounForArticle(articleIn(definite));
}

/**
 * What the determiner rule makes of a pronoun somebody wrote down.
 *
 * ── Why this reports rather than corrects ────────────────────────────────
 * The obvious use of the rule is to fill the pronoun box in for the
 * contributor, and it is the one use this module deliberately does not
 * support. A prefilled box gets accepted without being read, and the moment
 * that happens a *derivation* is stored as an *attestation* — indistinguishable
 * afterwards from a form a speaker actually said, and therefore useless as the
 * evidence that would ever correct the rule. The same reasoning as the header
 * of [NOUN_CLASSES], one surface out.
 *
 * So the clients ask as they always did, and use `differs` to raise a question
 * — never to block a submission and never to overwrite an answer. A speaker
 * who writes a pronoun the table does not predict is the single most valuable
 * row this project can collect: either a mistake, or the counter-example that
 * shows the rule is narrower than it looks. Both need a human to look.
 */
export type PronounCheck =
  /** No determiner was recognised, or none has a pronoun recorded yet. */
  | { readonly status: 'unknown' }
  /** The rule predicts a pronoun and nobody wrote one down. */
  | { readonly status: 'absent'; readonly expected: string }
  /** What was written is what the rule predicts. */
  | { readonly status: 'agrees'; readonly expected: string }
  /** What was written is not what the rule predicts. Worth a human's eye. */
  | { readonly status: 'differs'; readonly expected: string; readonly given: string };

export function pronounCheck(definite: unknown, pronoun: unknown): PronounCheck {
  const expected = pronounForDefinite(definite);
  if (!expected) return { status: 'unknown' };
  const given = normalise(pronoun);
  if (!given) return { status: 'absent', expected };
  return given === expected
    ? { status: 'agrees', expected }
    : { status: 'differs', expected, given };
}

/**
 * The numeral series a recorded counted form uses, or null.
 *
 * Same discipline as [articleIn]: the member wrote "da yalei", `yalei` is one
 * of the six attested words for *two*, so the entry can say that this noun was
 * counted with the `ya` series. It does not say the noun *belongs* to a class,
 * it does not write `nounClass`, and [induceNounClass] never reads it.
 *
 * That separation is deliberate and load-bearing. Storing a form a speaker
 * said is a record; deriving a class from two of them is a claim, and a claim
 * goes through the review path in `kasem-claims.ts`. The correspondence
 * between the article and the numeral prefix — `da yam` "the days" beside
 * `da yalei` "two days" — is a *hypothesis with one direct observation behind
 * it*, and it is falsifiable: enough nouns whose two forms carry different
 * markers would sink it. Collecting both halves is how it gets tested;
 * silently merging them here is how it would stop being testable.
 */
export function numeralSeriesIn(counted: unknown): NumeralSeries | null {
  const form = normalise(counted);
  if (!form) return null;
  // Split on anything that is not a letter, so "buga, yalei" and "2 = yalei"
  // both surrender the word. The Unicode class matters: Kasem is written with
  // ɩ ʋ ɛ ɔ ŋ, and an ASCII-only split would cut a word in half.
  const tokens = form.split(/[^\p{L}]+/u).filter(Boolean);
  for (const token of tokens) {
    const match = NUMERAL_TWO_FORMS.find((entry) => entry.form === token);
    if (match) return match;
  }
  return null;
}

/** The most characters one recorded form may carry; longer is truncated. */
export const MAX_FORM_LENGTH = 120;

// ---------------------------------------------------------------------------
// The paradigm
// ---------------------------------------------------------------------------

/**
 * Every form a contributor may record for one entry.
 *
 * ── Why one flat map and not a noun map beside a verb map ────────────────
 * Because a Kasem word is routinely both. `kani` is a thing and an act; asking
 * the data model to decide which of two sub-objects it lives in forces a
 * choice the language does not make, and the entry that is genuinely both ends
 * up recorded as whichever the contributor picked from the dropdown first. One
 * map, with slots that are empty when they do not apply, lets a noun that is
 * also used as a verb carry its tenses beside its plural — which is the case
 * the "can this also be a verb?" question exists to catch.
 *
 * Every slot is optional. That is not politeness: the guided queue's whole
 * economy rests on the median word costing zero extra taps, and a paradigm
 * with eleven required boxes is a paradigm nobody completes once.
 */
export interface LexicalForms {
  // ── The noun paradigm ────────────────────────────────────────────────────

  /**
   * The noun said with *the* — "the boy".
   *
   * The one form that genuinely varies with the class, and what
   * [induceNounClass] reads. Definiteness in Kasem is a property of the noun
   * rather than a word of its own, so there is no Kasem for "the" to collect
   * and never was; there is only the form a speaker says.
   */
  readonly definite: string;

  /** The noun said for many — "boys". */
  readonly plural: string;

  /**
   * The plural said with *the* — "the boys".
   *
   * Asked because the singular and the plural may well sit in *different*
   * classes: `dɛ dem` "the day" against `da yam` "the days", if `dɛ`/`da` are
   * one lexeme. That is ordinary Gur singular/plural class pairing and it has
   * never been put to a speaker directly. Without this slot the pairing is
   * unobservable — the definite form alone reads the singular's class, and the
   * numeral agrees with the plural, so the two probes were describing
   * different halves of the word and nothing said so.
   */
  readonly pluralDefinite: string;

  /**
   * The noun said with *two* — "two boys".
   *
   * A second, independent probe of the same class, on a different surface. See
   * [numeralSeriesIn] for why it is read but never inferred from.
   */
  readonly counted: string;

  /**
   * The pronoun that stands in for this noun — "the boy … *he*".
   *
   * ── The third surface, and the cheapest one to ask for ───────────────────
   * Gur pronouns agree with the noun class of what they replace, which makes
   * this a third reading of the same marker beside the article and the numeral
   * prefix. It is also the easiest of the three to elicit: a speaker who has
   * just written "the boy" produces "he came" without thinking, where "two
   * boys" makes some people stop and count.
   *
   * Recorded as the word, never as a person/number label. "Third person
   * singular animate" is a question about grammar; "what do you call him
   * afterwards" is a question about talking.
   */
  readonly pronoun: string;

  /**
   * The determiner alone, where the speaker gave it separately.
   *
   * Usually empty and usually redundant — [articleIn] reads it off the
   * definite form. It exists for the entry whose definite form is written
   * solid (`bukam`) and whose contributor wanted to say which article is in
   * there, and for a reviewer correcting one that was read wrong.
   */
  readonly article: string;

  // ── The verb paradigm ────────────────────────────────────────────────────

  /**
   * The verb as it is said now — "he eats", "he is eating".
   *
   * ── Why three tenses and not a tense system ─────────────────────────────
   * Because three is what a speaker can answer and a tense system is not.
   * Kasem marks aspect as well as time and the full picture is a research
   * question; "say it for now / say it for yesterday / say it for tomorrow"
   * are three questions anybody who speaks the language answers in seconds,
   * and three filled boxes per verb is a paradigm the dictionary has never had
   * a single row of.
   *
   * What comes back is evidence, not a conjugation table. The entry renders
   * these as forms a speaker gave, and nothing in this module generates a
   * fourth from them.
   */
  readonly present: string;

  /** The verb said of yesterday — "he ate". */
  readonly past: string;

  /** The verb said of tomorrow — "he will eat". */
  readonly future: string;

  /**
   * The verb said of several doers — "they eat".
   *
   * Kept apart from [plural], which is a noun's plural. A verb whose form
   * changes with the number of its subject is the same concord showing up
   * again, and folding the two into one slot would put a noun's plural and a
   * verb's agreement in the same field on an entry that is both.
   */
  readonly pluralSubject: string;

  /** The verb said as an instruction — "eat!". */
  readonly imperative: string;

  // ── Concord, for the words that change with what they attach to ──────────

  /**
   * The word used with one thing, and then with a different thing.
   *
   * ── Why a pair of examples and not a set of named slots ─────────────────
   * Because naming the slots would mean naming the classes, and nobody has
   * written the class inventory down. An "adjective paradigm" with invented
   * cells — animate/inanimate, or a numbered list — would be this project
   * publishing a structure it made up, on entries a learner has no reason to
   * doubt. `NOUN_CLASSES` is empty for exactly this reason and these two slots
   * are the same refusal, one level out.
   *
   * What *is* attested is the phenomenon. Francis, a Kasem speaker, on
   * 2026-09-06, unprompted:
   *
   * > "everything will be either te maama, ya maama, se maama, de maama etc
   * > depending on what you are talking about. an issue for later. it is just
   * > like the numbers"
   *
   * So the words that attach to a noun carry the noun's marker, exactly as the
   * numeral does — and until this pair of slots existed there was nowhere to
   * record it for any of them. An adjective, a quantifier, a numeral, a
   * determiner and a pronoun all got the same treatment a preposition got:
   * nothing.
   *
   * Two examples rather than one, for the same reason the counted form sits
   * beside the definite one: one form is a form, and two forms of the same
   * word either carry the same marker or they do not. The pair is the
   * evidence; a single example is a sentence.
   *
   * Empty for every class that does not agree, and empty for most words in the
   * classes that do — it is optional on the same terms as everything else here.
   */
  readonly agreeingOne: string;
  readonly agreeingTwo: string;
}

/** Which slots belong to a noun. */
export const NOUN_FORM_SLOTS = [
  'definite',
  'plural',
  'pluralDefinite',
  'counted',
  'pronoun',
  'article',
] as const;

/** Which slots belong to a verb. */
export const VERB_FORM_SLOTS = [
  'present',
  'past',
  'future',
  'pluralSubject',
  'imperative',
] as const;

/**
 * Which slots belong to a word whose form is chosen by what it attaches to.
 *
 * Shared by every agreeing class rather than duplicated per class, because the
 * question being asked is identical for all of them — "use it with one word,
 * then with a different word" — and because what varies between an adjective
 * and a quantifier is not yet known well enough to be modelled apart.
 */
export const AGREEMENT_FORM_SLOTS = ['agreeingOne', 'agreeingTwo'] as const;

/** Every slot, in the order an entry renders them. */
export const FORM_SLOTS = [
  ...NOUN_FORM_SLOTS,
  ...VERB_FORM_SLOTS,
  ...AGREEMENT_FORM_SLOTS,
] as const;

export type FormSlot = (typeof FORM_SLOTS)[number];

/** The shape a non-lexical payload and a junk one both collapse to. */
export const NO_FORMS: LexicalForms = Object.freeze({
  definite: '',
  plural: '',
  pluralDefinite: '',
  counted: '',
  pronoun: '',
  article: '',
  present: '',
  past: '',
  future: '',
  pluralSubject: '',
  imperative: '',
  agreeingOne: '',
  agreeingTwo: '',
});

/**
 * Which word classes take the verb paradigm.
 *
 * `auxiliary-verb` is here because an auxiliary is a verb that has been given
 * a job, not a different kind of word, and its tenses are exactly what a
 * learner needs. `ideophone` is deliberately absent even though many Kasem
 * ideophones behave verbally: the class is large, productive and poorly
 * described, and offering a conjugation table for one would invite
 * contributors to invent the cells.
 */
const VERB_CLASSES = new Set(['verb', 'auxiliary-verb']);
const NOUN_CLASSES_TAKING_FORMS = new Set(['noun', 'proper-noun']);

/**
 * The classes whose form is chosen by the word they attach to or stand for.
 *
 * ── How this list was decided, and what is deliberately not on it ────────
 * Every entry here is one a speaker's own statement covers. Francis gave the
 * quantifier pattern outright (`te maama, ya maama, se maama, de maama`) and
 * said it is "just like the numbers", which is the numeral; the numeral series
 * itself is attested six ways; a Gur determiner and article *are* the class
 * markers; and a pronoun agrees with what it replaces, which is why the noun
 * paradigm already asks what a noun is called afterwards. An adjective is the
 * one inference on the list, and it is a short one — it sits in the same slot
 * in the phrase as the quantifier and the numeral that flank it.
 *
 * Absent, and staying absent until somebody attests otherwise: `adverb`,
 * `preposition`, `postposition`, `conjunction`, `particle`, `interjection`,
 * `classifier`, `prefix`, `suffix`, and `ideophone`. Gur ideophones often do
 * carry intensive or reduplicated forms, and asking for them here would be
 * this project inventing a paradigm for its largest poorly-described class.
 * A contributor who has one puts it in the Kasem definition or the notes,
 * which is a worse home and an honest one.
 *
 * `phrase`, `idiom` and `proverb` are absent because they are not words.
 */
const AGREEING_CLASSES = new Set([
  'adjective',
  'quantifier',
  'numeral',
  'determiner',
  'article',
  'pronoun',
]);

/**
 * Reads the recorded forms off a submission, for the classes they belong to.
 *
 * [classes] is every word class this entry has claimed — its own, plus
 * anything in `alsoUsedAs`. That is what lets one entry carry both halves of
 * the paradigm: a noun a speaker told us is also used as a verb keeps its
 * plural *and* its tenses, instead of the second set being silently dropped
 * because the dropdown at the top said "Noun".
 *
 * ── Why an unusable slot is dropped rather than rejected ──────────────────
 * The fields are rendered only for the class they belong to, so a payload
 * carrying verb tenses for an adjective means one of three things: a client
 * that has not cleared its state, a member who changed the word class after
 * typing, or a future client this backend has not met. None of those is worth
 * failing a submission over — the member's actual answer is fine, and the
 * stray forms are simply not stored.
 *
 * Indefinite forms are withheld while their general derivation is disputed. A
 * client-supplied generated copy is not accepted as attested evidence.
 *
 * Pure, total, never throws: it is called from the queue callable, from the
 * contribution parser and from the publication projection, and a parser that
 * threw on junk in the third of those would fail a publish for data that was
 * accepted months earlier.
 */
export function parseLexicalForms(raw: unknown, classes: unknown): LexicalForms {
  const wanted = new Set<string>();
  for (const value of Array.isArray(classes) ? classes : [classes]) {
    const id = classId(value);
    if (id) wanted.add(id);
  }
  const takesNoun = [...wanted].some((id) => NOUN_CLASSES_TAKING_FORMS.has(id));
  const takesVerb = [...wanted].some((id) => VERB_CLASSES.has(id));
  const takesAgreement = [...wanted].some((id) => AGREEING_CLASSES.has(id));
  if (!takesNoun && !takesVerb && !takesAgreement) return NO_FORMS;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return NO_FORMS;

  const source = raw as Record<string, unknown>;
  const out: Record<string, string> = { ...NO_FORMS };
  if (takesNoun) {
    for (const slot of NOUN_FORM_SLOTS) out[slot] = cleanForm(source[slot]);
  }
  if (takesVerb) {
    for (const slot of VERB_FORM_SLOTS) out[slot] = cleanForm(source[slot]);
  }
  if (takesAgreement) {
    for (const slot of AGREEMENT_FORM_SLOTS) out[slot] = cleanForm(source[slot]);
  }
  return out as unknown as LexicalForms;
}

/**
 * The old two-argument entry point, kept so nothing has to change at once.
 *
 * Identical to [parseLexicalForms] with a single class. Retained rather than
 * renamed everywhere in one commit because three call sites and a test file
 * read it, and a rename that touches four files to say the same thing is a
 * rename that hides the one change that mattered.
 */
export function parseNounForms(raw: unknown, partOfSpeech: unknown): LexicalForms {
  return parseLexicalForms(raw, partOfSpeech);
}

/** True when any form carries something worth storing. */
export function hasLexicalForms(forms: LexicalForms | null | undefined): boolean {
  if (!forms) return false;
  return FORM_SLOTS.some((slot) => (forms[slot] ?? '').length > 0);
}

/** Kept beside [parseNounForms] for the same reason. */
export function hasNounForms(forms: LexicalForms | null | undefined): boolean {
  return hasLexicalForms(forms);
}

/**
 * Drops the empty slots, for storage.
 *
 * A `forms` map with eleven keys of which two are filled costs nine wasted
 * fields on every one of fifteen thousand documents, and — worse — makes an
 * unanswered question indistinguishable from one answered with nothing when
 * somebody is reading the raw data. Readers treat a missing key and an empty
 * string identically, so nothing downstream has to care which it got.
 */
export function storableForms(forms: LexicalForms): Record<string, string> {
  const out: Record<string, string> = {};
  for (const slot of FORM_SLOTS) {
    const value = forms[slot] ?? '';
    if (value.length > 0) out[slot] = value;
  }
  return out;
}

/** Fills the absent slots back in, so every reader sees the same shape. */
export function readStoredForms(raw: unknown): LexicalForms {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return NO_FORMS;
  const source = raw as Record<string, unknown>;
  const out: Record<string, string> = { ...NO_FORMS };
  for (const slot of FORM_SLOTS) out[slot] = cleanForm(source[slot]);
  return out as unknown as LexicalForms;
}

// ── Internals ───────────────────────────────────────────────────────────────

function cleanForm(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_FORM_LENGTH).trim();
}

function normalise(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().normalize('NFC').replace(/[\s_]+/g, ' ')
    : '';
}

/**
 * A word class, spelt the way `lexical-kinds.ts` spells its ids.
 *
 * Separate from [normalise] because the two want opposite things out of a
 * space: a recorded form keeps "bu kam" as two words, while the class
 * "Auxiliary verb" has to arrive at `auxiliary-verb` or the verb paradigm is
 * dropped for every auxiliary whose client sent a label instead of an id.
 */
function classId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s_]+/g, '-')
    : '';
}
