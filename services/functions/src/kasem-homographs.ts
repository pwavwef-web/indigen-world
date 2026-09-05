/**
 * Two different words spelled the same way, and how the dictionary tells them
 * apart.
 *
 * ── The problem, in one example ───────────────────────────────────────────
 * `mo` is the particle that follows a Kasem noun. `mo` is also — on the
 * reading the project is currently testing with speakers — the particle that
 * marks focus, which is why `amo` ("I", emphatic) is transparently `a` + `mo`.
 * Whether those are one word or two is a question for a speaker. What is not
 * in question is what happens if they turn out to be two: the dictionary holds
 * two published entries, both headed `mo`, and nothing anywhere distinguishes
 * them.
 *
 * A learner searching "mo" gets two identical-looking rows. A saved word links
 * to one of them and the member cannot tell which. Kawuri's briefing lists
 * both under the same headword and the model, quite reasonably, merges them
 * into one answer with two meanings — which is exactly wrong when they are two
 * words, and is the kind of error that gets copied, taught and repeated.
 *
 * Every dictionary in the world solved this the same way three centuries ago:
 * number them. mo¹, mo². This module is that convention.
 *
 * ── The one design decision worth reading ─────────────────────────────────
 * The index is STORED and the superscript is DERIVED, and neither half works
 * alone.
 *
 * Stored, because the number is an identity. A learner who writes `mo²` in
 * their notes, a member who shares an entry, a Kawuri answer quoting a sense —
 * all of them are citations, and a citation whose target moves is worse than
 * no citation. If the number were computed at read time from "which of these
 * sorts first", then publishing a third `mo` could renumber the other two, and
 * every note anybody had taken would silently start pointing somewhere else.
 * So [assignHomographIndex] hands out the next unused number once, at first
 * publication, and nothing ever reassigns it.
 *
 * That is the opposite of the call made in `kasem-morphology.ts`, where the
 * indefinite particle is derived and never stored — and the difference is the
 * point. `mo` after a noun is a *rule*: it is the same fact about the language
 * for every entry, so storing it fifteen thousand times would be fifteen
 * thousand copies of one fact, all wrong together the day the rule is refined.
 * A homograph number is not a fact about the language at all. It is an
 * arbitrary label this project assigned to one document, and arbitrary labels
 * have to be stored precisely because nothing can re-derive them.
 *
 * Derived, because whether the number is *shown* is a different question from
 * what it is. A word with one sense must render as `mo`, never `mo¹` — a lone
 * superscript one tells a reader there is a second entry to go and find, and
 * there isn't. But the moment a second `mo` is published, the first must start
 * rendering as `mo¹`, and it must do so without being rewritten. So the index
 * is on the document from the start and [shouldNumber] decides, per render,
 * whether it appears. See [homographDisplay].
 *
 * ── Gaps are correct ──────────────────────────────────────────────────────
 * Unpublish `mo²` and the numbers left behind are 1 and 3. That looks like a
 * bug and is the correct behaviour: renumbering to close the gap is exactly
 * the citation-breaking move the whole design exists to prevent. Print
 * dictionaries have always done it this way, for the same reason.
 *
 * ── Deliberately free of firebase-admin ───────────────────────────────────
 * Same reason as `lexical-kinds.ts`, `kasem-morphology.ts` and
 * `kasem-corpus.ts`: the publication path, the Kawuri briefing and the review
 * desk all consult these, and every one of them wants to be exercisable under
 * `node --test` with no Firestore client on the runner's path.
 */

/**
 * The superscript digits, indexed by the digit they stand for.
 *
 * One and two and three are Latin-1 leftovers (U+00B9, U+00B2, U+00B3) and the
 * rest are from Superscripts and Subscripts (U+2070, U+2074-U+2079). They are
 * not a contiguous range, which is why this is a table and not arithmetic on a
 * code point — the obvious `0x2070 + digit` produces U+2071 and U+2072 for one
 * and two, which are a modifier letter I and a reserved slot.
 */
const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const;

/**
 * The largest index that will ever be handed out.
 *
 * Not a storage limit — it is a tripwire. A headword that has genuinely
 * accumulated ninety-nine distinct published senses is not a homograph
 * problem; it is a sign that something is writing duplicate entries, or that a
 * very common word is being contributed over and over by people who cannot see
 * it is already there. Either way the answer is a human looking at it, not a
 * hundredth superscript.
 */
export const MAX_HOMOGRAPH_INDEX = 99;

/**
 * The most peers one publication will read before numbering.
 *
 * Sized so that hitting it means something has gone wrong rather than that a
 * word is popular — see [MAX_HOMOGRAPH_INDEX]. It bounds the read a single
 * publish performs inside a transaction, which is the reason it exists at all:
 * an unbounded query there would make one pathological headword able to slow
 * every review decision in the queue behind it.
 */
export const MAX_HOMOGRAPH_PEERS = 120;

/** [n] as superscript digits. `12` becomes `¹²`. */
export function superscript(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  const digits = Math.floor(n).toString();
  let out = '';
  for (const digit of digits) out += SUPERSCRIPT_DIGITS[Number(digit)];
  return out;
}

/**
 * The comparable form of a headword, for deciding what collides with what.
 *
 * Case-folded and whitespace-collapsed, and deliberately nothing more. It is
 * tempting to strip diacritics here so that a contributor who could not type a
 * tone mark still lands on the right entry — and it would be wrong. In a tonal
 * language a diacritic is frequently the only thing distinguishing two words,
 * so folding them together would merge exactly the pairs this module exists to
 * keep apart, and it would do it silently.
 *
 * Kept in step with `normaliseTerm` in `kawuri-dictionary.ts` on case and
 * spacing, so a word Kawuri can find is a word this can group.
 */
export function headwordKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** One published entry, as far as homograph numbering is concerned. */
export interface HomographPeer {
  /** The document id. Stable for the life of the entry. */
  id: string;
  /** The Kasem headword as stored. */
  kasem: string;
  /** The number already handed to this entry, or 0 if it has none yet. */
  homographIndex: number;
}

/**
 * The number a new entry for [kasem] should be given, or the one it already
 * has.
 *
 * [peers] is every published entry sharing the headword, INCLUDING the entry
 * being published if it has been published before. That inclusion is what
 * makes a re-publish idempotent: an entry that already carries a number keeps
 * it rather than being handed a fresh one every time a reviewer corrects a
 * typo in its example sentence.
 *
 * Returns `max(existing) + 1` for a genuinely new entry, so a number is never
 * reused even after an unpublish. Reusing `mo²` for a different word once the
 * original had been withdrawn would point every existing citation at the wrong
 * word — which is worse than the gap it closes, because a gap is visible and a
 * silently rehomed citation is not.
 */
export function assignHomographIndex(
  entryId: string,
  peers: readonly HomographPeer[],
): number {
  const mine = peers.find((peer) => peer.id === entryId);
  if (mine && mine.homographIndex > 0) return mine.homographIndex;

  let highest = 0;
  for (const peer of peers) {
    if (peer.homographIndex > highest) highest = peer.homographIndex;
  }
  return Math.min(highest + 1, MAX_HOMOGRAPH_INDEX);
}

/**
 * Whether a number should actually be drawn for this entry.
 *
 * [siblingCount] is how many published entries share the headword, this one
 * included. One means this word is alone under its spelling and must render
 * bare: a solitary `mo¹` is a promise of a `mo²` that does not exist, and a
 * reader who goes looking for it has been lied to by a footnote.
 *
 * The index itself is still on the document either way. This only decides
 * whether it is visible — which is what lets the first entry under a headword
 * start showing `¹` the day a second one is published, without anything having
 * to go back and rewrite it.
 */
export function shouldNumber(siblingCount: number, homographIndex: number): boolean {
  return siblingCount > 1 && homographIndex > 0;
}

/** A headword ready to render, in both the forms a surface needs. */
export interface HomographDisplay {
  /** What is drawn: `mo²`, or plain `mo` when no number is owed. */
  text: string;
  /** What a screen reader says: `mo, sense 2`, or just `mo`. */
  spoken: string;
  /** Whether a number was applied at all. */
  numbered: boolean;
}

/**
 * The headword as it should appear, and as it should be read aloud.
 *
 * The two differ and both are needed. A superscript two is announced by screen
 * readers as anything from "two" to "superscript two" to nothing at all,
 * depending on the reader and the voice — and "mo two" is indistinguishable
 * from a quantity. "mo, sense 2" is unambiguous in every reader, so the spoken
 * form is stated rather than left to the renderer to infer.
 *
 * The word "sense" is used rather than "homograph" deliberately. It is what a
 * reader without a linguistics degree will understand, and this dictionary is
 * for learners at least as much as for documentation.
 */
export function homographDisplay(
  kasem: string,
  homographIndex: number,
  siblingCount: number,
): HomographDisplay {
  const headword = typeof kasem === 'string' ? kasem.trim() : '';
  if (!shouldNumber(siblingCount, homographIndex)) {
    return { text: headword, spoken: headword, numbered: false };
  }
  return {
    text: `${headword}${superscript(homographIndex)}`,
    spoken: `${headword}, sense ${homographIndex}`,
    numbered: true,
  };
}

/**
 * How many published entries share each headword.
 *
 * Built once per read of the dictionary and consulted per row, because the
 * alternative — asking "does anything else share this spelling?" per entry —
 * is quadratic over a collection that is meant to grow into the thousands.
 *
 * Keyed by [headwordKey], so the count a row is judged against is the same
 * grouping [assignHomographIndex] numbered it under.
 */
export function countByHeadword(
  entries: readonly { kasem: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = headwordKey(entry.kasem);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
