/// The Kasem alphabet, and the two things a dictionary has to do with it.
///
/// ── The problem, in one number ───────────────────────────────────────────
/// 785 of the 1200 published entries carry at least one letter that does not
/// exist on a stock Android or iOS English keyboard: ɩ in 640 headwords, ʋ in
/// 195, ə in 177, ɔ in 156, ŋ in 115, ɛ in 9.
///
/// The search box compared what a learner typed against those headwords with
/// `toLowerCase().contains()` and nothing else. So a learner who has heard the
/// word `dɩ`, cannot type ɩ, and does the only thing available — types `di` —
/// was told the dictionary has no matching words. For two thirds of the
/// archive the search box was decoration.
///
/// This library is the fix, and it is two separate jobs that are easy to
/// confuse:
///
///   [foldForSearch]  makes ɩ and i comparable, so typing what you can reach
///                    finds the word you meant. Lossy on purpose.
///   [collationKey]   puts the words in Kasem's own alphabetical order, where
///                    ɩ is its own letter filed after i. Lossless on purpose.
///
/// One folds distinctions away to be forgiving; the other preserves them to be
/// correct. Using either for the other's job produces a dictionary that is
/// subtly wrong in a way nobody reports — a search that cannot find things, or
/// an index nobody can navigate.
///
/// ── Why folding is safe here and unsafe elsewhere ────────────────────────
/// `headwordKey` in `kasem_homographs.dart` deliberately does NOT fold
/// diacritics, and the two rules are not in conflict. That one decides which
/// entries are *the same word* — where merging ɩ and i would silently collapse
/// two genuinely different lexemes into one numbered series, which is the
/// exact error homograph numbering exists to prevent.
///
/// This one decides which entries a *query* should surface. A query that
/// reaches too far shows the learner an extra row they can immediately see is
/// not what they meant. That is a far cheaper failure than a row they can
/// never reach at all.
library;

/// The extended Kasem letters, mapped to the nearest key a phone can produce.
///
/// Uppercase forms are folded by the caller lowercasing first, so only the
/// lowercase mappings are listed. `ŋ` is included even though a learner is
/// unlikely to guess `n` for it, because they will certainly not guess
/// anything better.
const Map<String, String> _searchFolding = {
  'ɩ': 'i', // U+0269 LATIN SMALL LETTER IOTA — 640 headwords
  'ɪ': 'i', // U+026A, the small-capital variant some sources use
  'ʋ': 'u', // U+028B LATIN SMALL LETTER V WITH HOOK — 195
  'ʊ': 'u', // U+028A, the same sound in another convention
  'ə': 'e', // U+0259 SCHWA — 177
  'ɔ': 'o', // U+0254 LATIN SMALL LETTER OPEN O — 156
  'ŋ': 'n', // U+014B LATIN SMALL LETTER ENG — 115
  'ɛ': 'e', // U+025B LATIN SMALL LETTER OPEN E — 9
  'ɣ': 'g',
  'ʒ': 'z',
};

/// Combining marks — tone, nasalisation — stripped for search only.
///
/// Kasem is tonal and the marks are meaningful, which is exactly why they are
/// removed *here* and nowhere else. A learner typing from memory has no idea
/// which tone they heard; an archive that insists they get it right before it
/// will show them the word is not a dictionary, it is a quiz.
final RegExp _combiningMarks = RegExp(r'[̀-ͯ]');

/// Everything that is not a letter, mark, digit or space.
final RegExp _punctuation = RegExp(r"[^\p{L}\p{M}\p{N}\s'-]", unicode: true);

final RegExp _whitespace = RegExp(r'\s+');

/// What a query and a headword are compared as.
///
/// Lowercased, decomposed, stripped of tone marks, extended letters folded to
/// their nearest keyboard equivalent, punctuation dropped, whitespace
/// collapsed. `Dɩ́` and `di` both become `di`.
///
/// Total and never throws. It runs per entry per keystroke.
String foldForSearch(String raw) {
  if (raw.isEmpty) return '';
  final lowered = raw.toLowerCase();
  final buffer = StringBuffer();
  for (final rune in lowered.runes) {
    final char = String.fromCharCode(rune);
    buffer.write(_searchFolding[char] ?? char);
  }
  return buffer
      .toString()
      .replaceAll(_combiningMarks, '')
      .replaceAll(_punctuation, ' ')
      .replaceAll(_whitespace, ' ')
      .trim();
}

/// Whether [haystack] contains [needle] once both are folded.
///
/// The needle is folded by the caller where it is compared against many
/// entries — folding a query 1200 times per keystroke is the difference
/// between a search box that keeps up and one that stutters. [matchesFolded]
/// is the loop-friendly form.
bool foldedContains(String haystack, String needle) =>
    matchesFolded(haystack, foldForSearch(needle));

/// [haystack] folded, tested against an already-folded [needle].
bool matchesFolded(String haystack, String foldedNeedle) =>
    foldedNeedle.isEmpty || foldForSearch(haystack).contains(foldedNeedle);

/// Where each letter sits in the Kasem alphabet.
///
/// ── Why the default sort was unusable ────────────────────────────────────
/// `String.compareTo` orders by UTF-16 code unit. Every extended Kasem letter
/// lives above U+0100, so sorting a Kasem word list with it files every word
/// beginning ŋ, ɔ, ɛ, ɩ or ʋ *after* z — a ghetto of several hundred entries
/// past the end of the alphabet — and inside a word puts `lagɩ` after `lagz`.
/// A learner scrolling to where a word should be does not find it there.
///
/// Kasem files each extended letter directly after the plain letter it is
/// related to: ɛ after e, ɩ after i, ŋ after n, ɔ after o, ʋ after u. So the
/// key below gives every letter a two-character weight — the base letter, then
/// a rank within it — and comparing those strings gives the right order with
/// no custom comparator arithmetic.
///
/// ── The one position this file is not sure about ─────────────────────────
/// `ə` is placed after `ɛ`, at the end of the e-group. It is written as a
/// distinct letter in the Ghanaian orthography these entries use, and the
/// sources this project has do not settle where it is filed. It is adjacent to
/// e, which is where a reader will look for it; if a speaker says otherwise
/// this is the one line to change, and changing it reorders a list rather than
/// altering anything about the data.
const Map<String, String> _collationWeights = {
  'a': 'a0',
  'b': 'b0',
  'c': 'c0',
  'd': 'd0',
  'e': 'e0',
  'ɛ': 'e1',
  'ə': 'e2',
  'f': 'f0',
  'g': 'g0',
  'ɣ': 'g1',
  'h': 'h0',
  'i': 'i0',
  'ɩ': 'i1',
  'ɪ': 'i1',
  'j': 'j0',
  'k': 'k0',
  'l': 'l0',
  'm': 'm0',
  'n': 'n0',
  'ŋ': 'n1',
  'o': 'o0',
  'ɔ': 'o1',
  'p': 'p0',
  'q': 'q0',
  'r': 'r0',
  's': 's0',
  't': 't0',
  'u': 'u0',
  'ʋ': 'u1',
  'ʊ': 'u1',
  'v': 'v0',
  'w': 'w0',
  'x': 'x0',
  'y': 'y0',
  'z': 'z0',
  'ʒ': 'z1',
};

/// The string to sort a headword by, in Kasem alphabetical order.
///
/// Space sorts before every letter so `laŋ laŋ` files before `laŋa`, which is
/// the convention a reader expects from a printed dictionary. Anything this
/// table has no weight for — a digit, a stray symbol — keeps its own character
/// and therefore sorts after the letters, which is the honest place for
/// something the alphabet does not cover.
String collationKey(String raw) {
  if (raw.isEmpty) return '';
  final lowered = raw.toLowerCase().replaceAll(_combiningMarks, '');
  final buffer = StringBuffer();
  for (final rune in lowered.runes) {
    final char = String.fromCharCode(rune);
    if (char == ' ') {
      buffer.write(' ');
      continue;
    }
    buffer.write(_collationWeights[char] ?? char);
  }
  return buffer.toString();
}

/// How well [entry] answers [foldedQuery], lower being better, or null.
///
/// ── Why ranking and not just filtering ───────────────────────────────────
/// The list was filtered and left in alphabetical order, so typing `ni`
/// returned every entry containing the letters n-i anywhere in a headword, a
/// gloss, a dialect or a rendering, alphabetically — and the entry actually
/// headed `ni` could sit fifty rows below a word whose English gloss happens
/// to contain "permission". The thing the learner typed was the one thing the
/// order ignored.
///
/// The ranks:
///   0  the headword is exactly what was typed
///   1  a Kasem rendering is exactly what was typed
///   2  a meaning is exactly what was typed
///   3  the headword starts with it
///   4  a meaning starts with it
///   5  it appears anywhere else that is searched
int? searchRank({
  required String foldedQuery,
  required String headword,
  required Iterable<String> renderings,
  required Iterable<String> translations,
  required String dialect,
  required String definiteForm,
  required String pluralForm,
}) {
  if (foldedQuery.isEmpty) return 5;

  final foldedHeadword = foldForSearch(headword);
  if (foldedHeadword == foldedQuery) return 0;

  final foldedRenderings = renderings.map(foldForSearch).toList(growable: false);
  if (foldedRenderings.contains(foldedQuery)) return 1;

  final foldedTranslations = translations
      .map(foldForSearch)
      .toList(growable: false);
  if (foldedTranslations.contains(foldedQuery)) return 2;

  if (foldedHeadword.startsWith(foldedQuery)) return 3;
  if (foldedRenderings.any((value) => value.startsWith(foldedQuery))) return 3;
  if (foldedTranslations.any((value) => value.startsWith(foldedQuery))) return 4;

  if (foldedHeadword.contains(foldedQuery)) return 5;
  if (foldedRenderings.any((value) => value.contains(foldedQuery))) return 5;
  if (foldedTranslations.any((value) => value.contains(foldedQuery))) return 5;
  // The inflected forms are searched and were not before. A learner meets a
  // word in a text in its plural or definite form far more often than in the
  // citation form a dictionary files it under, and typing what they actually
  // read used to return nothing for a word the archive holds.
  if (matchesFolded(definiteForm, foldedQuery)) return 5;
  if (matchesFolded(pluralForm, foldedQuery)) return 5;
  if (matchesFolded(dialect, foldedQuery)) return 5;

  return null;
}
