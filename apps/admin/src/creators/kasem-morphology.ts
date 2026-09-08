/**
 * The Kasem morphology the review desk needs, and nothing more.
 *
 * ── This is a mirror; the server is canonical ────────────────────────────
 * `services/functions/src/kasem-morphology.ts` owns these facts. This file
 * exists because a reviewer looking at a contributed paradigm needs to be told
 * what the determiner rule expects *while they are looking at it*, and a
 * round trip to ask the server what `kam` implies would be a network call to
 * restate eight rows.
 *
 * The copy is kept honest by an invariant rather than by discipline:
 * `scripts/validate-admin.mjs` reads the server file and asserts, row for row,
 * that the table below matches it. That check runs in `npm run check`, so a
 * pronoun added on the server and forgotten here fails the build instead of
 * quietly telling reviewers the wrong thing about the language.
 *
 * Nothing here generates a form. Every function either recognises something a
 * speaker wrote down, or returns null.
 */

/** The definite determiners a Kasem speaker has stated, and nothing else. */
export const DEFINITE_ARTICLES: readonly string[] = [
  'kam', 'kom', 'dem', 'tem', 'bam', 'yam', 'sem', 'wom',
];

/**
 * The pronoun that goes with each determiner.
 *
 * Stated by Francis (a Kasem speaker) on 2026-09-08: the determiner decides
 * the pronoun. All eight are on record. Seven are the article minus its `-m`;
 * `wom` gives **o**, not `wo`, which is why this is a table and not a string
 * operation — a slice would also answer confidently for a ninth determiner
 * nobody has attested.
 */
export const DETERMINER_PRONOUNS: Readonly<Record<string, string>> = {
  kam: 'ka',
  kom: 'ko',
  dem: 'de',
  tem: 'te',
  bam: 'ba',
  yam: 'ya',
  sem: 'se',
  wom: 'o',
};

const fold = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_]+/g, ' ') : '';

/** The determiner inside a recorded definite form, or null. Reading, not inferring. */
export function articleIn(definite: unknown): string | null {
  const form = fold(definite);
  if (!form) return null;
  const tokens = form.split(' ').filter(Boolean);
  const last = tokens[tokens.length - 1] ?? '';
  const ordered = [...DEFINITE_ARTICLES].sort((a, b) => b.length - a.length);
  for (const article of ordered) {
    // A bare `kam` is the article itself, not a noun said with one.
    if (last === article && tokens.length > 1) return article;
    if (last !== article && last.endsWith(article)) return article;
  }
  return null;
}

/** The pronoun a noun takes, read off its definite form. Null, never a guess. */
export function pronounForDefinite(definite: unknown): string | null {
  const article = articleIn(definite);
  return article ? (DETERMINER_PRONOUNS[article] ?? null) : null;
}

/** What the determiner rule makes of a pronoun a contributor wrote down. */
export type PronounCheck =
  | { status: 'unknown' }
  | { status: 'absent'; expected: string; article: string }
  | { status: 'agrees'; expected: string; article: string }
  | { status: 'differs'; expected: string; given: string; article: string };

/**
 * Compares a recorded pronoun against the determiner rule, for a reviewer.
 *
 * ── Why the desk shows this and the contribution form only murmurs it ────
 * The contribution form is looking at a speaker mid-sentence, and anything it
 * says risks being copied instead of answered. The review desk is looking at a
 * finished record, and the reader is deciding whether to publish it — which is
 * exactly the moment a disagreement between a written pronoun and the rule
 * should be visible.
 *
 * It is still not a validation. `differs` means *look at this*, not *this is
 * wrong*: the contributor is a speaker and the rule is eight rows old, so the
 * likelier correction runs the other way. Approving over it must stay one
 * click, and no decision is blocked by it.
 */
export function pronounCheck(definite: unknown, pronoun: unknown): PronounCheck {
  const article = articleIn(definite);
  const expected = article ? DETERMINER_PRONOUNS[article] : undefined;
  if (!article || !expected) return { status: 'unknown' };
  const given = fold(pronoun);
  if (!given) return { status: 'absent', expected, article };
  return given === expected
    ? { status: 'agrees', expected, article }
    : { status: 'differs', expected, given, article };
}

/** The noun paradigm slots, in the order an entry renders them. */
export const NOUN_FORM_SLOTS: readonly { id: string; label: string }[] = [
  { id: 'definite', label: 'The one' },
  { id: 'plural', label: 'Many' },
  { id: 'pluralDefinite', label: 'The many' },
  { id: 'counted', label: 'Two' },
  { id: 'pronoun', label: 'Stands for it' },
  { id: 'article', label: 'Determiner' },
];

/** The verb and agreement slots, so a reviewer sees whatever was answered. */
export const OTHER_FORM_SLOTS: readonly { id: string; label: string }[] = [
  { id: 'present', label: 'Now' },
  { id: 'past', label: 'Yesterday' },
  { id: 'future', label: 'Tomorrow' },
  { id: 'pluralSubject', label: 'Several doing it' },
  { id: 'imperative', label: 'Telling somebody' },
  { id: 'agreeingOne', label: 'Used with' },
  { id: 'agreeingTwo', label: 'And with' },
];
