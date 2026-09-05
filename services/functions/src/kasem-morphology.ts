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
 * Nothing is blocked by the emptiness. [parseNounForms] collects real definite
 * and plural forms from real speakers from the day it ships, which is the
 * evidence the inventory has to be built from; [induceNounClass] simply
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

/** The most characters one recorded form may carry; longer is truncated. */
export const MAX_FORM_LENGTH = 120;

/** The forms a contributor may record for one entry. */
export interface NounForms {
  readonly definite: string;
  readonly plural: string;
}

const NO_FORMS: NounForms = { definite: '', plural: '' };

/**
 * Reads the two extra forms off a submission, for nouns only.
 *
 * ── Why non-nouns return empty rather than erroring ───────────────────────
 * The fields are rendered only when the member has chosen Noun, so a payload
 * carrying them for a verb means one of three things: a client that has not
 * cleared its state, a member who changed the word class after typing, or a
 * future client this backend has not met. None of those is worth failing a
 * submission over — the member's actual answer is fine, and the stray forms
 * are simply not stored.
 *
 * Indefinite forms are withheld while their general derivation is disputed.
 * A client-supplied generated copy is not accepted as attested evidence.
 *
 * Pure, total, never throws: it is called from the queue callable, from the
 * contribution parser and from the publication projection, and a parser that
 * threw on junk in the third of those would fail a publish for data that was
 * accepted months earlier.
 */
export function parseNounForms(raw: unknown, partOfSpeech: unknown): NounForms {
  if (normalise(partOfSpeech) !== 'noun') return NO_FORMS;
  if (raw === null || typeof raw !== 'object') return NO_FORMS;
  const source = raw as Record<string, unknown>;
  return {
    definite: cleanForm(source.definite),
    plural: cleanForm(source.plural),
  };
}

/** True when either form carries something worth storing. */
export function hasNounForms(forms: NounForms): boolean {
  return forms.definite.length > 0 || forms.plural.length > 0;
}

// ── Internals ───────────────────────────────────────────────────────────────

function cleanForm(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_FORM_LENGTH).trim();
}

function normalise(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ')
    : '';
}
