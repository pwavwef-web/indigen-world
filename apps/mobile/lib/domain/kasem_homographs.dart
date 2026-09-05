/// Two different words spelled the same way, and how the dictionary tells
/// them apart.
///
/// ── This is a mirror, and the original is authoritative ──────────────────
/// `services/functions/src/kasem-homographs.ts` is the rule; this is the same
/// rule in Dart, for the same reason `translation_parser.dart` mirrors
/// `parseTranslations`. The number itself is assigned once on the server and
/// stored on the document — nothing here decides it. What this file owns is
/// the half that is derived per render: whether the number is shown at all,
/// and what it looks like when it is.
///
/// A drift between the two would not corrupt data. It would do something
/// quieter and harder to notice: the app would draw a superscript the backend
/// did not intend, or leave one off an entry Kawuri is busy calling `mo²` in
/// the same session. Hence a pure library with its own tests rather than a
/// `'$headword${index}'` inlined in three widgets.
///
/// ── Why the number is never part of the headword string ──────────────────
/// It is stored in its own field and joined to the word only at the moment of
/// drawing, and both halves of that matter.
///
/// `indefiniteForm(headword)` appends the particle `mo`. Fold the number into
/// the headword and it produces `nia¹ mo`, which is not a word and is a false
/// statement about the language on a screen that exists to teach it.
///
/// And `normaliseWord` in `word_lookup.dart` strips edge characters outside
/// `\p{L}\p{M}\p{N}`. U+00B9 SUPERSCRIPT ONE is Unicode category No — a
/// *number* — so it survives that strip. A superscript baked into a stored
/// headword would therefore travel into the tap-a-word index and into the
/// backend's exact-match queries, and a member typing the plain word would
/// stop finding it.
library;

/// The superscript digits, indexed by the digit they stand for.
///
/// One, two and three are Latin-1 leftovers and the rest come from the
/// Superscripts and Subscripts block, which is why this is a table rather than
/// arithmetic on a code point: `0x2070 + digit` yields U+2071 and U+2072 for
/// one and two, which are a modifier letter and a reserved slot.
const List<String> _superscriptDigits = [
  '⁰',
  '¹',
  '²',
  '³',
  '⁴',
  '⁵',
  '⁶',
  '⁷',
  '⁸',
  '⁹',
];

/// [n] as superscript digits. `12` becomes `¹²`.
String superscript(int n) {
  if (n < 0) return '';
  final buffer = StringBuffer();
  for (final rune in n.toString().codeUnits) {
    buffer.write(_superscriptDigits[rune - 0x30]);
  }
  return buffer.toString();
}

/// The comparable form of a headword, for deciding what collides with what.
///
/// Case-folded and whitespace-collapsed, and deliberately nothing more.
/// Stripping diacritics would be a kindness to somebody who cannot type a tone
/// mark and a disaster for a tonal language, where the mark is frequently the
/// only thing separating two words — it would merge exactly the pairs this
/// exists to keep apart, silently. Mirrors `headwordKey`.
String headwordKey(String raw) =>
    raw.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();

/// Whether a number should actually be drawn for this entry.
///
/// [siblingCount] is how many published entries share the headword, this one
/// included. One means the word stands alone under its spelling and must
/// render bare: a solitary `mo¹` promises a `mo²` that does not exist, and a
/// reader who goes looking for it has been misled by a footnote.
bool shouldNumber({required int siblingCount, required int homographIndex}) =>
    siblingCount > 1 && homographIndex > 0;

/// A headword ready to render, in both the forms a surface needs.
class HomographDisplay {
  const HomographDisplay({
    required this.text,
    required this.spoken,
    required this.numbered,
  });

  /// What is drawn: `mo²`, or plain `mo` when no number is owed.
  final String text;

  /// What a screen reader says: `mo, sense 2`.
  final String spoken;

  final bool numbered;
}

/// The headword as it should appear, and as it should be read aloud.
///
/// The two differ and both are needed. A superscript two is announced as
/// anything from "two" to "superscript two" to silence depending on the reader
/// and the voice, and "mo two" is indistinguishable from a quantity.
/// "mo, sense 2" is unambiguous everywhere, so the spoken form is stated
/// rather than left for a renderer to infer.
///
/// "Sense" rather than "homograph" because this dictionary is for learners at
/// least as much as for documentation.
HomographDisplay homographDisplay(
  String kasem, {
  required int homographIndex,
  required int siblingCount,
}) {
  final headword = kasem.trim();
  if (!shouldNumber(
    siblingCount: siblingCount,
    homographIndex: homographIndex,
  )) {
    return HomographDisplay(
      text: headword,
      spoken: headword,
      numbered: false,
    );
  }
  return HomographDisplay(
    text: '$headword${superscript(homographIndex)}',
    spoken: '$headword, sense $homographIndex',
    numbered: true,
  );
}

/// How many entries share each headword, keyed by [headwordKey].
///
/// Built once per list and consulted per row. The alternative — asking "does
/// anything else share this spelling?" per entry — is quadratic over a
/// collection meant to grow into the thousands.
Map<String, int> countByHeadword(Iterable<String> headwords) {
  final counts = <String, int>{};
  for (final headword in headwords) {
    final key = headwordKey(headword);
    if (key.isEmpty) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
