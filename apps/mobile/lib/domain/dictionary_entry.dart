import 'package:freezed_annotation/freezed_annotation.dart';

part 'dictionary_entry.freezed.dart';
part 'dictionary_entry.g.dart';

@freezed
abstract class DictionaryEntry with _$DictionaryEntry {
  const DictionaryEntry._();

  const factory DictionaryEntry({
    required String id,
    required String headword,

    /// The first meaning, as one string.
    ///
    /// Kept required, and kept singular, because every caller written before an
    /// entry could have more than one meaning reads this field — the home
    /// screen's word of the day, the saved-words list, the contribute deep link.
    /// Replacing it with the list outright was the obvious tidy-up and it was
    /// the wrong one: it would have rewritten six screens across four features
    /// this change has no business touching, to say the same thing they already
    /// say. [primaryTranslation] is what new code should read.
    required String translation,

    /// Every meaning this entry carries, in the order the contributor gave them.
    ///
    /// A Kasem word rarely maps onto exactly one English word, and members have
    /// always answered the "what does it mean" box with lists — "greeting,
    /// hello", "water / rain water". Storing that answer whole made the meaning
    /// of the entry literally the string "water / rain water", which no learner
    /// will ever type into a search box and no query will ever match.
    ///
    /// Empty on an entry nobody has parsed yet — the demo vocabulary in
    /// `repositories.dart`, an entry built by hand in a test — which is why
    /// [primaryTranslation] falls back to [translation] rather than reaching
    /// for `first` and throwing on an empty list.
    @Default(<String>[]) List<String> translations,

    /// Every Kasem rendering of this entry, in the order the contributor gave
    /// them — the *other* axis on which an entry can be plural.
    ///
    /// ── Why this is not [translations] ─────────────────────────────────────
    /// Because they are opposite sides of the same entry, and conflating them
    /// was a real bug rather than a hypothetical one. An entry is a Kasem
    /// [headword] with an English [translation]; both halves can carry several
    /// values, and they are not interchangeable. "greeting, hello" is two
    /// English senses of one Kasem word. "nia, nyu" is two Kasem words for one
    /// English sense — which is exactly what the guided queue produces, because
    /// it hands somebody an English word and asks what the Kasem for it is.
    ///
    /// The backend writes these to `dictionaryEntries.translations`, derived
    /// from the contribution's Kasem body. Reading them as English meanings
    /// would have printed Kasem in the meaning column; reading them as nothing
    /// at all — which is what happened first, because the reader defended
    /// itself by rejecting a list that merely restated the headword — meant the
    /// several answers a member typed were stored, reviewed, published, and
    /// then never shown to anybody.
    ///
    /// Empty on the whole legacy dictionary, where [headword] is the single
    /// rendering there has ever been.
    @Default(<String>[]) List<String> renderings,
    required String partOfSpeech,
    required String dialect,
    required String pronunciation,
    required String example,
    required String exampleTranslation,

    /// Where the example sentence came from: `'tatoeba'`, `'unattributed'`, or
    /// empty on an entry that predates the guided queue.
    ///
    /// Kept as it arrived rather than reduced to a bool, for the same reason
    /// the word queue keeps it — see `QueueWord.sentenceSource`. A second
    /// sentence pool will eventually exist and a field named `isTatoeba` is one
    /// that has to be found and widened later.
    @Default('') String sentenceSource,

    /// The Tatoeba sentence id, or empty where none is owed.
    ///
    /// ── This is a licence condition, not decoration ────────────────────────
    /// The guided queue's example sentences are Tatoeba, CC BY 2.0 FR, which
    /// requires attribution wherever the sentence is shown — and a published
    /// dictionary entry is very much a place the sentence is shown. The three
    /// fields below travel with the entry precisely so the phone cannot fail to
    /// have them; the design where the client "knows to go and look the credit
    /// up" is how attribution silently stops happening.
    ///
    /// Empty means no credit is owed, and no credit must then be rendered. Not
    /// a blank line, not a guess, not a plausible-looking id: inventing a
    /// contributor for a sentence nobody contributed is a worse licensing
    /// failure than omitting one that was never owed. [exampleCredit] returns
    /// null in that case and a test holds it there.
    @Default('') String tatoebaId,

    /// May be empty even on an attributed entry — a Tatoeba sentence whose
    /// contributor is not recorded still carries its id and its licence, and
    /// the credit line simply leaves the name out rather than writing "by ".
    @Default('') String tatoebaContributor,
    @Default('') String sentenceLicence,
    required String attribution,
    String? culturalNote,

    /// A published recording of the headword being said, or empty where the
    /// entry has none.
    ///
    /// Separate from [pronunciation], which is the written guide. The two used
    /// to share one field, so an entry with audio showed a download URL where
    /// its phonetics belonged and still had nothing to play.
    @Default('') String audioUrl,
    @Default(true) bool isSynthetic,
  }) = _DictionaryEntry;

  factory DictionaryEntry.fromJson(Map<String, Object?> json) =>
      _$DictionaryEntryFromJson(json);

  /// The meaning to show when there is only room for one.
  ///
  /// Exists so that no screen has to write `translations.isEmpty ? ... : ...`
  /// — a ternary that is easy to get right once and certain to be got wrong the
  /// fourth time somebody copies it.
  String get primaryTranslation =>
      translations.isEmpty ? translation : translations.first;

  /// The meanings after the first, for the surfaces that show all of them.
  List<String> get furtherTranslations =>
      translations.length < 2 ? const <String>[] : translations.sublist(1);

  /// Every meaning as one line, for a semantic label.
  ///
  /// A screen reader never runs out of horizontal space, so the "+2 more" a
  /// narrow list row has to fall back to is a worse answer for it than simply
  /// saying all three. Every list row that describes an entry to a reader
  /// should read this rather than [translation], which is one meaning wearing
  /// the name of all of them.
  String get allTranslations =>
      translations.isEmpty ? translation : translations.join(', ');

  /// Whether this entry is one of the ones worth spending vertical space on.
  ///
  /// The common case is a single meaning and it must keep looking exactly as it
  /// looks today, so every list widget asks this before it reaches for the
  /// numbered layout.
  bool get hasSeveralTranslations => translations.length > 1;

  /// The Kasem renderings after the first, for the surfaces that show them.
  ///
  /// The first is already the [headword]: a guided contribution arrives as one
  /// string — "nia, nyu" — and if the whole string became the headword, the
  /// dictionary would list a word nobody can look up and the alphabetical sort
  /// would file it under a comma.
  List<String> get furtherRenderings =>
      renderings.length < 2 ? const <String>[] : renderings.sublist(1);

  bool get hasSeveralRenderings => renderings.length > 1;

  /// The whole Tatoeba credit as one quiet line, or null where none is owed.
  ///
  /// Assembled here rather than in the widget so the exact wording is testable
  /// without pumping a frame, and so the two places that need it — the visible
  /// line and the screen-reader label — cannot drift apart. Mirrors
  /// `QueueWordAttribution.line`, which renders the same credit under the same
  /// sentence while a member is still answering it; a sentence must not be
  /// credited one way in the queue and another way in the dictionary.
  String? get exampleCredit {
    if (tatoebaId.isEmpty) return null;
    return [
      'Tatoeba #$tatoebaId',
      if (tatoebaContributor.isNotEmpty) tatoebaContributor,
      if (sentenceLicence.isNotEmpty) sentenceLicence,
    ].join(' · ');
  }

  /// Every meaning is searched, not just the first.
  ///
  /// Searching [translation] alone meant an entry whose second sense was the
  /// one somebody wanted simply did not exist for them: "rain water" is in the
  /// dictionary, and typing it returned nothing, because the field held
  /// "water / rain water" only until the parser split it and then held the
  /// first piece.
  bool matches(String query) {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) return true;
    if (headword.toLowerCase().contains(normalized)) return true;
    if (translation.toLowerCase().contains(normalized)) return true;
    if (dialect.toLowerCase().contains(normalized)) return true;
    for (final meaning in translations) {
      if (meaning.toLowerCase().contains(normalized)) return true;
    }
    // And every Kasem rendering. Somebody who knows the word as `nyu` must
    // find it even when the entry is filed under `nia`, or the second and
    // third answers a contributor gave are searchable by nobody.
    for (final rendering in renderings) {
      if (rendering.toLowerCase().contains(normalized)) return true;
    }
    return false;
  }
}

/// The most meanings one entry may carry, and the longest any one of them may
/// be. Mirrors `MAX_TRANSLATIONS` / `MAX_TRANSLATION_LENGTH` in
/// `services/functions/src/lexical-kinds.ts`.
const kMaxTranslations = 8;
const kMaxTranslationLength = 120;

/// Turns what a member typed into the list of meanings they meant.
///
/// ── This function has a twin, and they must agree ─────────────────────────
/// `parseTranslations` in `services/functions/src/lexical-kinds.ts` is the
/// canonical implementation; this is the same rules in Dart, because the phone
/// has to reconstruct the list for the fifteen thousand entries that were
/// published before the field existed and are never going to be back-filled.
/// Deriving on read rather than migrating is deliberate: a projection that can
/// rebuild the field on demand means no historical row has to be rewritten, and
/// an entry approved last year renders byte-for-byte as it did then.
///
/// The rules, and why each one is here:
///
///   * Commas and forward slashes split, because those are what people
///     actually use. Newlines split too: a phone keyboard's return key is a
///     separator in everybody's head, and treating it as part of a word
///     produces a meaning with an invisible line break in the middle of it.
///   * Internal whitespace collapses, so "good   morning" and "good morning"
///     are the same answer.
///   * De-duplication is case-insensitive and keeps the FIRST spelling seen.
///     The first is the one the member reached for without thinking, which is
///     better evidence about the language than a later repetition — and
///     keeping the first makes this order-stable, so re-parsing text that has
///     already been parsed is a no-op.
///   * Over-long pieces are truncated rather than dropped. A 400-character
///     "meaning" is a sentence pasted into the wrong box, and losing the whole
///     entry over it would also lose the six good meanings beside it.
///
/// Pure, total, and never throws. It runs on every row of a list a member is
/// scrolling, and a parser that threw on junk would take down a screen over
/// one bad import.
List<String> splitTranslations(String raw) {
  if (raw.isEmpty) return const <String>[];
  final seen = <String>{};
  final out = <String>[];
  for (final piece in raw.split(_translationSeparators)) {
    var value = piece.trim().replaceAll(_runsOfSpace, ' ');
    if (value.length > kMaxTranslationLength) {
      value = value.substring(0, kMaxTranslationLength).trim();
    }
    if (value.isEmpty) continue;
    if (!seen.add(value.toLowerCase())) continue;
    out.add(value);
    if (out.length >= kMaxTranslations) break;
  }
  return List.unmodifiable(out);
}

final _translationSeparators = RegExp(r'[,/\n\r]+');
final _runsOfSpace = RegExp(r'\s+');
