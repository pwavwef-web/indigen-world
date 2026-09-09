/// Lookup tolerance: the half of a dictionary that decides whether anyone
/// notices the other half.
///
/// ── The property this file exists to deliver ──────────────────────────────
/// A well-governed lexicon behind a literal-minded search box is experienced by
/// a learner as an *empty dictionary*, because every miss reads as an absence
/// rather than as a search failure. The archive holds the word; the box says it
/// does not; the learner concludes the language is not covered and stops
/// looking. That failure is invisible in every metric.
///
/// So the assumption throughout is that the person searching does not know how
/// the word is spelled, does not know its tone, cannot type half its letters,
/// and may well have met it in a form the dictionary does not file it under.
/// Each of the five routes below answers one of those:
///
///   * [foldForSearch] — types `di`, finds `dɩ`. Already load-bearing; this
///     file inherits it.
///   * [DictionaryScope] — types an English word, finds the Kasem one.
///   * Wildcards — remembers `ba…ra`, finds `bakeira`.
///   * [DictionaryHit.matchedOn] — met `biə` in a text, finds `bu`, and is
///     told why rather than left wondering.
///   * [didYouMean] — spelled it wrong, is offered the near ones instead of an
///     empty screen.
///
/// ── Why this is a library and not widget code ─────────────────────────────
/// Because ranking is the single most testable thing in the app and the single
/// hardest thing to check by eye: whether `ni` puts the entry headed `ni` first
/// is one assertion here and a scroll through fifty rows on a device otherwise.
/// Every function below is pure, total and free of Flutter beyond
/// `@immutable`.
library;

import 'package:flutter/foundation.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/kasem_orthography.dart';

/// Which side of the dictionary a query is aimed at.
///
/// Pleco's dual lookup — characters or romanisation, from one box — is the
/// capability being reproduced, with the Kasem substitution: the two sides are
/// the language and the English, and the default searches both because a
/// learner very often does not think of it as a choice.
///
/// The narrow scopes exist for the case the wide one is bad at. `water` typed
/// into an all-scope box returns every entry whose usage note mentions water;
/// somebody who knows they are working from English wants the entries that
/// *mean* water, and saying so is one tap.
enum DictionaryScope {
  all,
  kasem,
  english;

  String get label => switch (this) {
    DictionaryScope.all => 'Both',
    DictionaryScope.kasem => 'Kasem',
    DictionaryScope.english => 'English',
  };
}

/// The narrowing a reader has asked for, beyond the query itself.
///
/// Every filter here is answerable from a field the archive already carries.
/// There is deliberately no "by semantic domain" or "by frequency": the domain
/// is filled on the small minority of entries contributed since senses existed,
/// and a filter that silently hides nine tenths of the dictionary is worse than
/// no filter — it teaches a reader the archive is smaller than it is.
@immutable
class DictionaryFilters {
  const DictionaryFilters({
    this.scope = DictionaryScope.all,
    this.recordedOnly = false,
    this.withExampleOnly = false,
    this.wordClass = '',
  });

  final DictionaryScope scope;

  /// Only entries with a pronunciation recording. The single most requested
  /// property of an entry, and the one a learner cannot supply for themselves.
  final bool recordedOnly;

  /// Only entries with an example sentence, at entry level or on a sense.
  final bool withExampleOnly;

  /// A word class id, or empty for any.
  final String wordClass;

  bool get isNarrowed =>
      recordedOnly ||
      withExampleOnly ||
      wordClass.isNotEmpty ||
      scope != DictionaryScope.all;

  DictionaryFilters copyWith({
    DictionaryScope? scope,
    bool? recordedOnly,
    bool? withExampleOnly,
    String? wordClass,
  }) => DictionaryFilters(
    scope: scope ?? this.scope,
    recordedOnly: recordedOnly ?? this.recordedOnly,
    withExampleOnly: withExampleOnly ?? this.withExampleOnly,
    wordClass: wordClass ?? this.wordClass,
  );

  /// Whether [entry] survives the narrowing, ignoring the query.
  bool admits(DictionaryEntry entry) {
    if (recordedOnly && entry.audioUrl.isEmpty) return false;
    if (withExampleOnly && entry.example.isEmpty && !entry.hasSenseExamples) {
      return false;
    }
    if (wordClass.isNotEmpty && !entry.wordClasses.contains(wordClass)) {
      return false;
    }
    return true;
  }
}

/// The most rows a search returns.
///
/// Pleco caps its incremental list at fifty for the same reason: past that
/// nobody is reading, and the cost of building the rest is paid on every
/// keystroke. The count of what was left out is reported rather than hidden —
/// "50 of 312" tells a reader to type another letter, and a silently truncated
/// list tells them the dictionary is small.
const kSearchResultLimit = 50;

/// Why an entry answered a query, when the reason is not the obvious one.
///
/// ── The Kasem substitution, and the feature this file is proudest of ──────
/// Pleco spends a great deal of its interface helping a user produce and
/// recognise Chinese characters. None of that transfers to a Latin-script Gur
/// language. What does transfer is the *principle*: spend the effort on what is
/// structurally hard about the language.
///
/// For Kasem that is noun class morphology. A learner who meets `biə` in a text
/// has no reliable way to guess that the singular is `bu`, and a conventional
/// dictionary leaves them stranded at exactly that point. Because the plural,
/// the definite and the counted forms are stored fields on the entry, the app
/// can resolve them silently — and then say so, which is what turns a lookup
/// into a lesson about the class system that no grammar appendix will ever
/// teach as well.
enum MatchReason {
  /// The headword, a rendering or a meaning. The ordinary case; drawn as
  /// nothing, because explaining it would be noise on every row.
  direct,

  /// The plural form. "biə is the plural of bu."
  plural,

  /// The noun said with *the*.
  definite,

  /// The plural said with *the*.
  pluralDefinite,

  /// The noun said with *two*.
  counted,

  /// A verb tense or an agreement form.
  otherForm,

  /// Somewhere inside one of the entry's senses — a usage note, a Kasem gloss,
  /// a listed synonym.
  sense,
}

/// One result, and what it took to find it.
@immutable
class DictionaryHit {
  const DictionaryHit({
    required this.entry,
    required this.rank,
    this.reason = MatchReason.direct,
    this.matchedForm = '',
  });

  final DictionaryEntry entry;

  /// Lower is better. See [searchRank] for the tiers.
  final int rank;

  final MatchReason reason;

  /// The form that actually matched, where it was not the headword.
  final String matchedForm;

  /// The line to draw under a row whose match needs explaining, or null.
  ///
  /// Written as a sentence about the two words rather than as a label, because
  /// "plural" on its own is a grammatical term and *"biə is the plural of bu"*
  /// is the fact the reader needed. Null for a direct hit: a note on every row
  /// is a note nobody reads.
  String? get explanation => switch (reason) {
    MatchReason.direct => null,
    MatchReason.plural =>
      '$matchedForm is the plural of ${entry.headword}',
    MatchReason.definite =>
      '$matchedForm is ${entry.headword} said with “the”',
    MatchReason.pluralDefinite =>
      '$matchedForm is the plural of ${entry.headword}, said with “the”',
    MatchReason.counted =>
      '$matchedForm is ${entry.headword} counted',
    MatchReason.otherForm => '$matchedForm is a form of ${entry.headword}',
    MatchReason.sense => 'Found inside one of its meanings',
  };
}

/// What a search produced, including what it had to leave out.
@immutable
class DictionaryResults {
  const DictionaryResults({
    required this.hits,
    required this.total,
    this.suggestions = const <DictionaryEntry>[],
  });

  static const empty = DictionaryResults(
    hits: <DictionaryHit>[],
    total: 0,
    suggestions: <DictionaryEntry>[],
  );

  final List<DictionaryHit> hits;

  /// How many entries matched before the cap. Reported so a reader knows to
  /// narrow rather than concluding there are fifty words in the language.
  final int total;

  /// Near spellings, offered only when the query found nothing at all.
  final List<DictionaryEntry> suggestions;

  bool get isEmpty => hits.isEmpty;
  bool get truncated => total > hits.length;
}

/// Whether [query] is asking for a pattern rather than a substring.
///
/// Asked of the raw query, and it has to be. [foldForSearch] treats anything
/// that is not a letter, mark, digit or space as punctuation and replaces it
/// with a space — so `ba*ra` folds to `ba ra`, and a wildcard check made after
/// folding finds no wildcards in a query that plainly has one. That was a real
/// bug and it failed silently, as a pattern search that returned a substring
/// search's results.
bool isWildcardQuery(String query) =>
    query.contains('*') || query.contains('?');

/// The pattern a wildcard query means, or null when it is not one.
///
/// ── Why the wildcards are `*` and `?` and not a regular expression ────────
/// Because `*` and `?` are what people already know from file names and from
/// every other search box they have used, and because a real regular expression
/// in a public search box is a way to hang the UI thread on a pathological
/// pattern. Everything except the two wildcards is escaped, so a query
/// containing a bracket searches for a bracket.
///
/// ── The folding happens per segment, not to the whole query ───────────────
/// The literal pieces between the wildcards are what a reader typed, and they
/// have to be folded so that `d?` reaches `dɩ`. The wildcards themselves must
/// survive the folding, and they do not — so each literal run is folded and
/// escaped on its own and the wildcards are written straight into the pattern.
///
/// Anchored at both ends: `ba*ra` means a word that *is* b-a-anything-r-a, not
/// a word that contains it. A reader typing a wildcard has told you the shape
/// of the whole word, and an unanchored match would return every entry
/// containing the fragment and bury the one they described.
RegExp? wildcardPattern(String query) {
  if (!isWildcardQuery(query)) return null;
  final buffer = StringBuffer('^');
  final literal = StringBuffer();
  void flushLiteral() {
    final folded = foldForSearch(literal.toString());
    if (folded.isNotEmpty) buffer.write(RegExp.escape(folded));
    literal.clear();
  }

  for (final rune in query.runes) {
    final char = String.fromCharCode(rune);
    switch (char) {
      case '*':
        flushLiteral();
        buffer.write('.*');
      case '?':
        flushLiteral();
        buffer.write('.');
      default:
        literal.write(char);
    }
  }
  flushLiteral();
  buffer.write(r'$');
  return RegExp(buffer.toString());
}

/// The fields a scope allows a query to reach.
Iterable<String> _kasemSide(DictionaryEntry entry) sync* {
  yield entry.headword;
  yield* entry.renderings;
}

Iterable<String> _englishSide(DictionaryEntry entry) sync* {
  if (entry.translations.isEmpty) {
    yield entry.translation;
  } else {
    yield* entry.translations;
  }
}

/// The inflected forms a query may land on, with what each one is.
///
/// The order is the order a learner is most likely to have met the form in, so
/// a form that fills two slots is explained as the commoner of the two.
List<({String form, MatchReason reason})> _inflections(DictionaryEntry entry) => [
  (form: entry.pluralForm, reason: MatchReason.plural),
  (form: entry.definiteForm, reason: MatchReason.definite),
  (form: entry.pluralDefiniteForm, reason: MatchReason.pluralDefinite),
  (form: entry.countedForm, reason: MatchReason.counted),
  (form: entry.presentForm, reason: MatchReason.otherForm),
  (form: entry.pastForm, reason: MatchReason.otherForm),
  (form: entry.futureForm, reason: MatchReason.otherForm),
  (form: entry.pluralSubjectForm, reason: MatchReason.otherForm),
  (form: entry.imperativeForm, reason: MatchReason.otherForm),
  (form: entry.agreeingOneForm, reason: MatchReason.otherForm),
  (form: entry.agreeingTwoForm, reason: MatchReason.otherForm),
].where((row) => row.form.trim().isNotEmpty).toList(growable: false);

/// How well [entry] answers an already-folded [query], under [filters].
///
/// Returns null when it does not answer it. The ranks are the ones
/// [searchRank] defines, with the inflected forms and the senses ranked below
/// every direct hit — a word whose headword is what somebody typed must always
/// outrank a word that merely mentions it in a note four senses down, or the
/// search has stopped answering the question it was asked.
@visibleForTesting
DictionaryHit? rankEntry({
  required DictionaryEntry entry,
  required String foldedQuery,
  required DictionaryFilters filters,
  RegExp? pattern,
}) {
  if (!filters.admits(entry)) return null;

  // ── The wildcard path is its own thing ──────────────────────────────────
  // A pattern is a description of the whole word, so it is matched against the
  // whole word and nothing else. Running it through the substring ranks below
  // would rank `ba*ra` by how early the pattern appears, which is meaningless.
  if (pattern != null) {
    for (final value in _kasemSide(entry)) {
      if (pattern.hasMatch(foldForSearch(value))) {
        return DictionaryHit(entry: entry, rank: 0);
      }
    }
    if (filters.scope != DictionaryScope.kasem) {
      for (final value in _englishSide(entry)) {
        if (pattern.hasMatch(foldForSearch(value))) {
          return DictionaryHit(entry: entry, rank: 2);
        }
      }
    }
    for (final row in _inflections(entry)) {
      if (pattern.hasMatch(foldForSearch(row.form))) {
        return DictionaryHit(
          entry: entry,
          rank: 5,
          reason: row.reason,
          matchedForm: row.form,
        );
      }
    }
    return null;
  }

  if (foldedQuery.isEmpty) {
    return DictionaryHit(entry: entry, rank: 5);
  }

  final kasem = [for (final value in _kasemSide(entry)) foldForSearch(value)];
  final english = [
    for (final value in _englishSide(entry)) foldForSearch(value),
  ];
  final wantsKasem = filters.scope != DictionaryScope.english;
  final wantsEnglish = filters.scope != DictionaryScope.kasem;

  if (wantsKasem) {
    if (kasem.isNotEmpty && kasem.first == foldedQuery) {
      return DictionaryHit(entry: entry, rank: 0);
    }
    if (kasem.contains(foldedQuery)) {
      return DictionaryHit(entry: entry, rank: 1);
    }
  }
  if (wantsEnglish && english.contains(foldedQuery)) {
    return DictionaryHit(entry: entry, rank: 2);
  }
  if (wantsKasem && kasem.any((value) => value.startsWith(foldedQuery))) {
    return DictionaryHit(entry: entry, rank: 3);
  }
  if (wantsEnglish && english.any((value) => value.startsWith(foldedQuery))) {
    return DictionaryHit(entry: entry, rank: 4);
  }
  if (wantsKasem && kasem.any((value) => value.contains(foldedQuery))) {
    return DictionaryHit(entry: entry, rank: 5);
  }
  if (wantsEnglish && english.any((value) => value.contains(foldedQuery))) {
    return DictionaryHit(entry: entry, rank: 5);
  }

  // ── The morphology route ────────────────────────────────────────────────
  // Below every direct hit, and above the senses. A learner who typed a plural
  // is looking for a word rather than for a mention of one.
  if (wantsKasem) {
    for (final row in _inflections(entry)) {
      if (foldForSearch(row.form).contains(foldedQuery)) {
        return DictionaryHit(
          entry: entry,
          rank: 5,
          reason: row.reason,
          matchedForm: row.form.trim(),
        );
      }
    }
    if (foldForSearch(entry.dialect).contains(foldedQuery)) {
      return DictionaryHit(entry: entry, rank: 5);
    }
  }

  for (final sense in entry.senses) {
    if (foldForSearch(sense.searchableText).contains(foldedQuery)) {
      return DictionaryHit(
        entry: entry,
        rank: kSenseMatchRank,
        reason: MatchReason.sense,
      );
    }
  }
  return null;
}

/// Runs a query over the whole archive.
///
/// The query is folded exactly once here rather than once per entry, which at
/// a keystroke per character over a growing archive is the entire cost of the
/// search. Ties break alphabetically in Kasem order, so equally good answers
/// stay in the order the dictionary is otherwise browsed in.
DictionaryResults searchDictionary({
  required List<DictionaryEntry> entries,
  required String query,
  DictionaryFilters filters = const DictionaryFilters(),
  int limit = kSearchResultLimit,
}) {
  final folded = foldForSearch(query);
  final pattern = wildcardPattern(query);
  if (folded.isEmpty && !filters.isNarrowed) {
    final rows = entries
        .take(limit)
        .map((entry) => DictionaryHit(entry: entry, rank: 5))
        .toList(growable: false);
    return DictionaryResults(hits: rows, total: entries.length);
  }

  final hits = <DictionaryHit>[];
  for (final entry in entries) {
    final hit = rankEntry(
      entry: entry,
      foldedQuery: pattern == null ? folded : '',
      filters: filters,
      pattern: pattern,
    );
    if (hit != null) hits.add(hit);
  }
  hits.sort((left, right) {
    final byRank = left.rank.compareTo(right.rank);
    if (byRank != 0) return byRank;
    // ── Completeness breaks a tie, and it is not decoration ───────────────
    // With a small dictionary a bad ordering puts the right answer on the
    // second screen, where nobody looks. Between two entries that answer the
    // query equally well, the one a learner can hear and see used is the
    // better answer, every time.
    final byDepth = _completeness(right.entry).compareTo(
      _completeness(left.entry),
    );
    if (byDepth != 0) return byDepth;
    final byWord = left.entry.sortKey.compareTo(right.entry.sortKey);
    return byWord != 0
        ? byWord
        : left.entry.homographIndex.compareTo(right.entry.homographIndex);
  });

  return DictionaryResults(
    hits: hits.take(limit).toList(growable: false),
    total: hits.length,
    suggestions: hits.isEmpty && !filters.isNarrowed
        ? didYouMean(entries: entries, query: query)
        : const <DictionaryEntry>[],
  );
}

/// How much of an entry has actually been filled in.
///
/// A rough count rather than a score: what it is used for is breaking a tie
/// between two entries that answered the query equally well, and any ordering
/// that puts a recorded, exemplified entry above a bare one is doing the job.
int _completeness(DictionaryEntry entry) =>
    (entry.audioUrl.isEmpty ? 0 : 3) +
    (entry.example.isEmpty && !entry.hasSenseExamples ? 0 : 2) +
    (entry.hasStructuredSenses ? 2 : 0) +
    (entry.kasemDefinition.isEmpty ? 0 : 1) +
    (entry.hasForms ? 1 : 0) +
    (entry.ipa.isEmpty ? 0 : 1);

/// The distance below which two spellings are near enough to suggest.
///
/// Two edits, and no more. Three edits over a four-letter Kasem word reaches
/// most of the alphabet, and a "did you mean" list that offers eight unrelated
/// words is read as the dictionary not understanding the question.
const kSuggestionDistance = 2;

/// The nearest spellings to a query that matched nothing.
///
/// ── Why an empty result is the wrong place to stop ────────────────────────
/// An empty screen after a search says *this word is not in the dictionary*,
/// and for a learner working from something they heard, that is usually false:
/// the word is there and they spelled it the way it sounded. Offering the near
/// ones costs one pass over an already-loaded list and turns the commonest
/// failure into a lookup.
///
/// Compared on the folded form, so a suggestion is a genuinely different
/// spelling rather than the same word with a diacritic the reader could not
/// type — that case has already been handled and never reaches here.
List<DictionaryEntry> didYouMean({
  required List<DictionaryEntry> entries,
  required String query,
  int limit = 6,
}) {
  final folded = foldForSearch(query);
  if (folded.length < 2) return const <DictionaryEntry>[];
  final scored = <({DictionaryEntry entry, int distance})>[];
  for (final entry in entries) {
    final headword = foldForSearch(entry.headword);
    // Words of wildly different length are not misspellings of each other, and
    // skipping them here is what keeps this a single cheap pass.
    if ((headword.length - folded.length).abs() > kSuggestionDistance) continue;
    final distance = _editDistance(headword, folded, kSuggestionDistance);
    if (distance <= kSuggestionDistance) {
      scored.add((entry: entry, distance: distance));
    }
  }
  scored.sort((left, right) {
    final byDistance = left.distance.compareTo(right.distance);
    return byDistance != 0
        ? byDistance
        : left.entry.sortKey.compareTo(right.entry.sortKey);
  });
  return scored.take(limit).map((row) => row.entry).toList(growable: false);
}

/// Levenshtein distance, abandoning once it is certainly above [ceiling].
///
/// Two rows rather than a matrix, and an early exit, because this runs over
/// every entry in the archive at the moment a search has just failed — which is
/// exactly when the reader is least willing to wait.
int _editDistance(String a, String b, int ceiling) {
  if (a == b) return 0;
  if (a.isEmpty) return b.length;
  if (b.isEmpty) return a.length;
  var previous = List<int>.generate(b.length + 1, (index) => index);
  for (var i = 1; i <= a.length; i++) {
    final current = List<int>.filled(b.length + 1, 0)..[0] = i;
    var best = i;
    for (var j = 1; j <= b.length; j++) {
      current[j] = [
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a.codeUnitAt(i - 1) == b.codeUnitAt(j - 1) ? 0 : 1),
      ].reduce((x, y) => x < y ? x : y);
      if (current[j] < best) best = current[j];
    }
    if (best > ceiling) return ceiling + 1;
    previous = current;
  }
  return previous[b.length];
}

/// The letters the archive actually has entries under, in Kasem order.
///
/// ── Why this is derived and not the alphabet ──────────────────────────────
/// A browse rail listing every letter of the Kasem alphabet would offer a
/// reader several letters that lead to an empty screen, which reads as a broken
/// index rather than as a gap in the archive. The rail lists what is there, and
/// grows on its own as the dictionary does.
///
/// The key is the first letter as written, so `ɩ` gets its own rail entry
/// rather than being folded in with `i` — this is browsing, where the alphabet
/// is the point, not searching, where forgiveness is.
List<String> browseLetters(List<DictionaryEntry> entries) {
  final seen = <String>{};
  for (final entry in entries) {
    final letter = browseLetterOf(entry);
    if (letter.isNotEmpty) seen.add(letter);
  }
  final letters = seen.toList(growable: false)
    ..sort((left, right) => collationKey(left).compareTo(collationKey(right)));
  return letters;
}

/// Which letter [entry] files under.
String browseLetterOf(DictionaryEntry entry) {
  final headword = entry.headword.trim();
  if (headword.isEmpty) return '';
  return headword.firstLetter.toUpperCase();
}

extension on String {
  /// The first character, taking a combining mark with it where there is one.
  ///
  /// Written by hand rather than reached for from `characters` so this file
  /// stays free of another dependency for one call — and because the only
  /// combining marks in this archive are tone diacritics, which are exactly
  /// what has to travel with the letter rather than becoming a rail entry of
  /// their own.
  String get firstLetter {
    if (isEmpty) return '';
    final runes = this.runes.toList(growable: false);
    final buffer = StringBuffer(String.fromCharCode(runes.first));
    for (final rune in runes.skip(1)) {
      if (rune >= 0x0300 && rune <= 0x036F) {
        buffer.write(String.fromCharCode(rune));
      } else {
        break;
      }
    }
    return buffer.toString();
  }
}
