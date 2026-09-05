/**
 * Attested Kasem sentences, and the alignment that makes one worth keeping.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 * `kawuri-dictionary.ts` answers "what is the Kasem for *water*".
 * `kawuri-grammar.ts` answers "how do you say *the*". Between them they cover
 * every question about a **word**, and neither covers the question members
 * actually ask most:
 *
 *     How do you say "the big boy is hungry" in Kasem?
 *
 * Today that question reaches nothing. `translationTerms` caps a term at 48
 * characters and drops what is longer, so the dictionary is never consulted;
 * the phrase is not a function word, so the grammar is never consulted; and a
 * model with no briefing answers from memory. What it produces is the words in
 * English order, which is wrong in a way that looks right:
 *
 *     wrong:  bakeira kamunu kom kana        (boy big the hunger)
 *     right:  kana mo jege bakeira kamunu kom (hunger FOC has boy big the)
 *
 * Every word in the wrong version is a real word, correctly spelled, correctly
 * glossed. Only the sentence is invented. That is the failure mode a
 * dictionary cannot see and a word-level rule cannot catch, and it is why
 * sentences have to be stored as sentences.
 *
 * ── Why the gloss is mandatory ────────────────────────────────────────────
 * A bare pair — Kasem in, English out — records that a translation exists and
 * nothing about why. It cannot be checked, it cannot be generalised, and when
 * a rule written from it later turns out wrong there is no way back to the
 * evidence.
 *
 * A word-for-word line is the whole difference:
 *
 *     kasem   kana mo jege bakeira kamunu kom
 *     literal hunger a has boy big the
 *
 * From that pair a reader can see that the sensation is the subject, that the
 * experiencer is the object, that the adjective follows its noun, and that
 * definiteness sits at the end of the phrase rather than in front of it. None
 * of those four facts is stated anywhere; all four are recoverable, by a
 * person or by a model, from six aligned tokens. This is interlinear glossed
 * text, it is the standard unit of language documentation, and it is the one
 * artefact of this whole feature that will still be worth something when every
 * model in use today has been replaced.
 *
 * So [alignGloss] refuses a pair whose token counts disagree. It is the only
 * hard validation in this module, and it is hard on purpose: an unaligned
 * gloss is not a slightly worse record, it is a record nobody can read.
 *
 * ── Deliberately free of firebase-admin ───────────────────────────────────
 * Same reason as `lexical-kinds.ts` and `kasem-morphology.ts`: the callable,
 * the retrieval path and the review decision all consult these, and every one
 * of them wants to be exercisable under `node --test` with no Firestore client
 * on the runner's path.
 */

/** Where a submitted sentence is in its life. */
export type SentenceStatus = 'submitted' | 'confirmed' | 'rejected';

/** What a member said about an answer Kawuri gave them. */
export type VerdictKind = 'right' | 'wrong';

export const SENTENCE_STATUSES: readonly SentenceStatus[] = [
  'submitted',
  'confirmed',
  'rejected',
];

/**
 * What a sentence is an example *of*.
 *
 * Closed, and longer than what is behind it today — the same shape as `TOPICS`
 * in `seed-grammar.mjs`, and for the same reason. A tag with nothing under it
 * is an honest empty shelf; a free-text tag field is fifty spellings of
 * "word order" and no way to retrieve any of them.
 *
 * These are the handle a rule and its evidence are joined by: a grammar rule
 * tagged `focus` and a sentence tagged `focus` are about each other, which is
 * what lets a reviewer see the examples a rule was written from and lets
 * [matchCorpus] fall back to construction when wording fails.
 */
export const CONSTRUCTIONS = [
  'word-order',
  'focus',
  'experiencer',
  'pronoun',
  'possession',
  'definiteness',
  'plural',
  'adjective',
  'negation',
  'question',
  'command',
  'tense',
  'aspect',
  'serial-verb',
  'comparison',
  'conditional',
  'relative-clause',
  'greeting',
] as const;

export type Construction = (typeof CONSTRUCTIONS)[number];

const CONSTRUCTION_SET = new Set<string>(CONSTRUCTIONS);

/** The canonical construction tag for [raw], or null when it is not one. */
export function canonicalConstruction(raw: unknown): Construction | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return CONSTRUCTION_SET.has(value) ? (value as Construction) : null;
}

/** One Kasem token and the English word standing under it. */
export interface GlossPair {
  kasem: string;
  english: string;
}

/** A sentence somebody attested, in the shape everything downstream reads. */
export interface AttestedSentence {
  /** The Kasem, as the speaker wrote it. */
  kasem: string;
  /** What it means, in ordinary English. */
  english: string;
  /** The word-for-word line, aligned token by token to [kasem]. */
  literal: string;
  /** [kasem] and [literal] zipped. Derived; never stored independently. */
  gloss: GlossPair[];
  /** Why it is built this way, in the speaker's own words. May be empty. */
  note: string;
  /** Which Kasem this is. Empty where the speaker did not say. */
  dialect: string;
  /** What this sentence is an example of. */
  constructions: Construction[];
}

/** The longest sentence either side may be. */
export const MAX_SENTENCE_LENGTH = 240;

/** The longest explanation a note may carry. */
export const MAX_NOTE_LENGTH = 2000;

/** The most tokens one sentence may have. Beyond this it is a paragraph. */
export const MAX_GLOSS_TOKENS = 40;

/** The most construction tags one sentence may claim. */
export const MAX_CONSTRUCTIONS = 4;

/** Collapsed whitespace, trimmed, capped. The form everything else assumes. */
export function tidy(raw: unknown, limit = MAX_SENTENCE_LENGTH): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, limit);
}

/**
 * The tokens of a sentence, for alignment.
 *
 * Splits on whitespace and nothing else. A hyphen or a full stop *inside* a
 * token is left alone, because that is how a glosser writes one English idea
 * that happens to need two English words — `the-boy`, `3SG.OBJ` — and
 * splitting on them would break the alignment this module exists to enforce.
 * Trailing sentence punctuation is dropped so that "ne." and "ne" are one
 * token rather than two.
 */
export function glossTokens(sentence: string): string[] {
  return tidy(sentence)
    .split(' ')
    .map((token) => token.replace(/^[.,;:!?]+|[.,;:!?]+$/g, ''))
    .filter(Boolean);
}

/** What [alignGloss] produced, or why it produced nothing. */
export type GlossResult =
  | { ok: true; gloss: GlossPair[] }
  | { ok: false; reason: string };

/**
 * The Kasem and its word-for-word line, zipped.
 *
 * ── Why a mismatch is fatal rather than tolerated ─────────────────────────
 * The obvious kindness is to pad the shorter side and keep what aligned. It is
 * the wrong call. A gloss that is one token out is not 90% of a record: every
 * pair after the missing token is wrong, silently, and it is wrong in the
 * shape of a real record — so it will be read, quoted and generalised from.
 * Refusing costs one contributor thirty seconds. Accepting costs the archive a
 * sentence that teaches the wrong thing and cannot be told from one that
 * teaches the right thing.
 *
 * The reason string is written to be shown to the member as-is, with both
 * counts in it, because "the two lines do not line up" is not actionable and
 * "6 Kasem words, 5 English" is.
 */
export function alignGloss(kasem: string, literal: string): GlossResult {
  const left = glossTokens(kasem);
  const right = glossTokens(literal);

  if (left.length === 0) return { ok: false, reason: 'The Kasem sentence is empty.' };
  if (right.length === 0) {
    return { ok: false, reason: 'The word-for-word line is empty.' };
  }
  if (left.length > MAX_GLOSS_TOKENS) {
    return {
      ok: false,
      reason: `That is ${left.length} words. Keep an example to ${MAX_GLOSS_TOKENS} or fewer.`,
    };
  }
  if (left.length !== right.length) {
    return {
      ok: false,
      reason:
        `The two lines do not line up: ${left.length} Kasem word` +
        `${left.length === 1 ? '' : 's'} against ${right.length} English. ` +
        'Give one English word under each Kasem word — join two English words ' +
        'with a hyphen (the-boy) where one Kasem word needs them both.',
    };
  }

  return {
    ok: true,
    gloss: left.map((token, index) => ({ kasem: token, english: right[index] })),
  };
}

/**
 * Words too common to say anything about which sentence is which.
 *
 * Deliberately its own list rather than an import from `kawuri-dictionary.ts`,
 * for two reasons. The first is mechanical: that module imports
 * firebase-admin, and this one must not. The second is that the two lists are
 * answering different questions. There, a stop word is one with no meaning to
 * *look up*; here it is one with no power to *tell two sentences apart*. The
 * overlap is large and the purpose is not, and a shared list would eventually
 * be edited for one job and quietly break the other.
 */
const MATCH_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and',
  'or', 'but', 'that', 'this', 'it', 'its', 'as', 'so', 'if', 'then', 'than',
  'how', 'what', 'you', 'say', 'said', 'kasem', 'kassena', 'english',
]);

/** The words of an English sentence that carry which sentence it is. */
export function contentWords(sentence: string): string[] {
  const words = tidy(sentence)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !MATCH_STOP_WORDS.has(word));
  return [...new Set(words)];
}

/**
 * How much two English sentences are about the same thing, from 0 to 1.
 *
 * Jaccard over content words: shared words over total distinct words. Crude,
 * and deliberately so — the alternative is an embedding, which means a second
 * paid call on the path of every question and a vector store to keep in step
 * with a collection of a few hundred rows.
 *
 * Crude is also *safe* here in a way it would not be in a search box, because
 * of what a miss costs. A near-miss retrieved is not shown to the member as an
 * answer; it is shown to the model under a briefing that tells it to say the
 * sentence is not attested unless it matches what was asked. So the failure
 * mode of a loose threshold is a wasted paragraph of prompt, and the failure
 * mode of a tight one is Kawuri improvising. The threshold leans loose.
 */
export function sentenceOverlap(a: string, b: string): number {
  const left = new Set(contentWords(a));
  const right = new Set(contentWords(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** What [parseAttestedSentence] produced, or why it produced nothing. */
export type SentenceResult =
  | { ok: true; sentence: AttestedSentence }
  | { ok: false; reason: string };

/**
 * One sentence out of whatever a client sent, or the reason it is not one.
 *
 * Returns a result rather than throwing, on the same terms as the rest of this
 * module: the callable turns a refusal into an `HttpsError` with the reason
 * attached, and `node --test` exercises every branch without a functions
 * runtime. The reason strings are member-facing prose, so they are written
 * here — next to the rule they explain — rather than being invented again at
 * each call site.
 */
export function parseAttestedSentence(raw: unknown): SentenceResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'No sentence was sent.' };
  }
  const data = raw as Record<string, unknown>;

  for (const [name, limit] of [['kasem', MAX_SENTENCE_LENGTH], ['english', MAX_SENTENCE_LENGTH], ['literal', MAX_SENTENCE_LENGTH], ['note', MAX_NOTE_LENGTH], ['dialect', 60]] as const) {
    if (data[name] !== undefined && typeof data[name] !== 'string') return { ok: false, reason: `${name} must be text.` };
    if (typeof data[name] === 'string' && (data[name] as string).length > limit) return { ok: false, reason: `${name} must be ${limit} characters or fewer.` };
  }
  if (Array.isArray(data.constructions) && data.constructions.length > MAX_CONSTRUCTIONS) return { ok: false, reason: `Choose at most ${MAX_CONSTRUCTIONS} constructions.` };

  const kasem = tidy(data.kasem);
  const english = tidy(data.english);
  const literal = tidy(data.literal);

  if (!kasem) return { ok: false, reason: 'The Kasem sentence is required.' };
  if (!english) return { ok: false, reason: 'What it means in English is required.' };
  // A speaker may know the sentence without knowing each particle's function.
  // Free literal paraphrases are preserved without inventing token alignment.
  const aligned = literal ? alignGloss(kasem, literal) : null;

  const constructions: Construction[] = [];
  if (Array.isArray(data.constructions)) {
    for (const item of data.constructions) {
      const tag = canonicalConstruction(item);
      if (tag && !constructions.includes(tag)) constructions.push(tag);
      if (constructions.length >= MAX_CONSTRUCTIONS) break;
    }
  }

  return {
    ok: true,
    sentence: {
      kasem,
      english,
      literal,
      gloss: aligned?.ok ? aligned.gloss : [],
      note: tidy(data.note, MAX_NOTE_LENGTH),
      dialect: tidy(data.dialect, 60),
      constructions,
    },
  };
}

/**
 * The Kasem words in a sentence that the dictionary has never heard of.
 *
 * [known] is the set of published headwords, already normalised by the caller
 * — this module cannot read Firestore and should not learn how.
 *
 * The English side of each unknown comes from the gloss, which is the whole
 * payoff of having insisted on alignment: a word nobody has contributed
 * arrives with its meaning already attached and already reviewed, because the
 * validator who confirmed the sentence confirmed the line under it too.
 *
 * Hyphens are stripped from the English side — a glosser writes `the-boy` to
 * keep one Kasem token over one English cell, and `the boy` is what belongs in
 * a dictionary entry.
 */
export function unknownWords(
  sentence: AttestedSentence,
  known: ReadonlySet<string>,
): { kasem: string; english: string }[] {
  const found: { kasem: string; english: string }[] = [];
  const seen = new Set<string>();

  for (const pair of sentence.gloss) {
    const key = pair.kasem.toLowerCase();
    if (!key || seen.has(key) || known.has(key)) continue;
    seen.add(key);
    const english = pair.english.replace(/-/g, ' ').trim();
    // A gloss cell that is only a grammatical label — FOC, 3SG, DEF — names a
    // function the word performs and is not a meaning anybody can look up. It
    // belongs in a grammar rule, which is where the note it came from is
    // going anyway, so it is left out of the dictionary rather than filed
    // under a definition no reader could use.
    if (!english || /^[A-Z0-9.]+$/.test(english)) continue;
    found.push({ kasem: pair.kasem, english });
  }

  return found;
}
