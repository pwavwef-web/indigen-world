import 'package:flutter/foundation.dart';

/// What the word-queue callables hand the phone, and what the phone hands back.
///
/// Every one of these is built from a `Map<Object?, Object?>` that came off a
/// callable, so every read goes through the coercion helpers at the bottom
/// rather than through a cast. A cast is the right tool when the shape is
/// guaranteed; this shape crosses a network from a function that is deployed
/// on its own schedule, and a `_TypeError` in a `fromMap` takes the whole
/// screen down and tells the member "something went wrong" about a word they
/// could perfectly well have answered.

/// The Tatoeba credit a sentence carries, or nothing at all.
///
/// ── This is a licence condition, not decoration ──────────────────────────
/// The example sentences are Tatoeba, CC BY 2.0 FR, which requires
/// attribution wherever the sentence is shown. `nextQueueWords` ships the
/// credit alongside every sentence precisely so the client cannot fail to have
/// it — the design where the client "knows to go and look it up" is how
/// attribution silently stops happening.
///
/// Rows seeded `sentenceSource: 'unattributed'` arrive with a null attribution
/// and MUST render no credit at all. Not a blank line, not a guess, not a
/// plausible-looking id: inventing a contributor for a sentence nobody
/// contributed is a worse licensing failure than omitting one that was never
/// owed. [QueueWordCard] enforces that by rendering nothing when this is null,
/// and a test holds it there.
@immutable
class QueueWordAttribution {
  const QueueWordAttribution({
    required this.tatoebaId,
    required this.contributor,
    required this.licence,
  });

  final String tatoebaId;

  /// May be empty even on an attributed row — a Tatoeba sentence whose
  /// contributor is not recorded still carries its id and its licence, and the
  /// credit line simply leaves the name out rather than writing "by ".
  final String contributor;

  final String licence;

  /// The whole credit, as one quiet line under the sentence.
  ///
  /// Assembled here rather than in the widget so the exact wording is
  /// testable without pumping a frame, and so the two places that need it —
  /// the visible line and the semantic label — cannot say different things.
  String get line {
    final parts = <String>[
      'Tatoeba #$tatoebaId',
      if (contributor.isNotEmpty) contributor,
      if (licence.isNotEmpty) licence,
    ];
    return parts.join(' · ');
  }

  static QueueWordAttribution? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final id = _text(raw['tatoebaId']);
    // No id, no credit. An attribution that cannot point at the sentence it
    // credits is not an attribution.
    if (id.isEmpty) return null;
    return QueueWordAttribution(
      tatoebaId: id,
      contributor: _text(raw['contributor']),
      licence: _text(raw['licence'], fallback: 'CC BY 2.0 FR'),
    );
  }
}

/// One English word waiting for its Kasem, as the phone sees it.
@immutable
class QueueWord {
  const QueueWord({
    required this.id,
    required this.word,
    required this.sentence,
    required this.sentenceSource,
    required this.attribution,
    this.tier = 'extended',
    this.rank = 0,
    this.pendingCount = 0,
  });

  final String id;

  /// The English word, as printed — capitalisation and all.
  final String word;

  /// The example sentence the word appears in.
  ///
  /// The single most important field on this object and the reason the guided
  /// queue is answerable at all: "light" alone has no answer, "light" in
  /// *Turn on the light* has one and *He tried to light the fire* has another.
  /// May be empty on a row the seed found no sentence for, in which case the
  /// card shows the word alone rather than an empty quotation.
  final String sentence;

  /// `'tatoeba'` or `'unattributed'`. Kept as it arrived rather than reduced
  /// to a bool, because a third source will eventually exist and a bool named
  /// `isTatoeba` is a field that has to be found and widened later.
  final String sentenceSource;

  /// Null on an unattributed row. See [QueueWordAttribution].
  final QueueWordAttribution? attribution;

  final String tier;
  final int rank;

  /// How many answers are already in review for this word.
  ///
  /// Shown, quietly, when it is above zero: somebody about to spend a minute
  /// on a word deserves to know two other people are already on it, and the
  /// backend deprioritises rather than hides such words so the queue does not
  /// stall when a batch of them is all that is left.
  final int pendingCount;

  static QueueWord? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final id = _text(raw['id']);
    final word = _text(raw['word']);
    // A row with no id cannot be answered or skipped, and a row with no word
    // has no question on it. Dropped rather than rendered blank.
    if (id.isEmpty || word.isEmpty) return null;
    return QueueWord(
      id: id,
      word: word,
      sentence: _text(raw['sentence']),
      sentenceSource: _text(raw['sentenceSource'], fallback: 'unattributed'),
      attribution: QueueWordAttribution.fromMap(raw['attribution']),
      tier: _text(raw['tier'], fallback: 'extended'),
      rank: _count(raw['rank']),
      pendingCount: _count(raw['pendingCount']),
    );
  }
}

/// One answer from `nextQueueWords`.
@immutable
class QueueBatch {
  const QueueBatch({
    required this.words,
    this.answeredCount = 0,
    this.skippedCount = 0,
    this.exhausted = false,
  });

  static const empty = QueueBatch(words: <QueueWord>[]);

  final List<QueueWord> words;

  /// The member's lifetime totals, which is why they are separate from the
  /// counters the screen keeps for this sitting. A member who answered forty
  /// words last week and three this morning is told "3 this sitting", because
  /// that is the number the rhythm of the screen just produced and the one
  /// that makes them want a fourth.
  final int answeredCount;
  final int skippedCount;

  /// True only when the scan reached the actual end of the open rows.
  ///
  /// The distinction the backend is careful about and this screen depends on:
  /// "you have answered everything we have" and "nothing came back just now"
  /// are very different messages to a volunteer, and only one of them is worth
  /// congratulating somebody for.
  final bool exhausted;

  static QueueBatch fromMap(Object? raw) {
    if (raw is! Map) return empty;
    final words = <QueueWord>[];
    final list = raw['words'];
    if (list is List) {
      for (final row in list) {
        final word = QueueWord.fromMap(row);
        if (word != null) words.add(word);
      }
    }
    return QueueBatch(
      words: List.unmodifiable(words),
      answeredCount: _count(raw['answeredCount']),
      skippedCount: _count(raw['skippedCount']),
      exhausted: raw['exhausted'] == true,
    );
  }
}

/// Why a member passed on a word.
///
/// Two reasons and no free-text box. They are not the same signal and keeping
/// them apart is the whole point: a word a hundred people marked [unknown] may
/// not exist in Kasem at all, while a hundred [unsure] marks say the word is
/// known and the *sentence* is bad. Neither is recorded against the member —
/// skipping has to cost nothing, or the member who cannot skip invents a
/// translation instead, and an invented translation is worse for the
/// dictionary than a closed app.
///
/// The wire values are what `skipQueueWord` validates against; anything else
/// is an `invalid-argument`.
enum WordQueueSkipReason {
  unknown,
  unsure;

  String get wire => name;

  String get label => switch (this) {
    WordQueueSkipReason.unknown => "I don't know this one",
    WordQueueSkipReason.unsure => "I'm not sure enough",
  };
}

/// What the member is sending back about one word.
@immutable
class WordTranslationDraft {
  const WordTranslationDraft({
    required this.wordId,
    required this.translations,
    required this.partOfSpeech,
    required this.dialect,
    this.notes = '',
    this.kasemExample = '',
    this.englishExample = '',
  });

  final String wordId;

  /// Already parsed. The raw text never leaves the widget: the field owns the
  /// string, this owns the list, and the server parses whichever it is handed
  /// so the two cannot disagree about what was meant.
  final List<String> translations;

  /// A stable id from [kPartsOfSpeech], not a label. The callable rejects an
  /// id it does not know rather than defaulting it.
  final String partOfSpeech;

  final String dialect;
  final String notes;
  final String kasemExample;

  /// The English sentence the member was shown, echoed back.
  ///
  /// The queue already stamps the prompt onto the submission, so this is
  /// usually empty; the field exists because the callable accepts it and a
  /// member who rewrote the example to match their translation has said
  /// something a reviewer wants.
  final String englishExample;

  Map<String, Object?> toPayload() => <String, Object?>{
    'wordId': wordId,
    'translations': translations,
    'partOfSpeech': partOfSpeech,
    'dialect': dialect,
    'notes': notes,
    'kasemExample': kasemExample,
    'englishExample': englishExample,
  };
}

/// What came back from `submitWordTranslation`.
@immutable
class WordTranslationReceipt {
  const WordTranslationReceipt({
    required this.wordId,
    required this.word,
    required this.contributionId,
    required this.translations,
  });

  final String wordId;

  /// The English word this answered. Not in the callable's reply — the reply
  /// has no reason to echo the prompt — so the controller carries it across
  /// from the word that was on screen. It is what the confirmation says.
  final String word;

  final String contributionId;
  final List<String> translations;

  static WordTranslationReceipt fromMap(Object? raw, {required QueueWord on}) {
    final map = raw is Map ? raw : const <Object?, Object?>{};
    final translations = <String>[];
    final list = map['translations'];
    if (list is List) {
      for (final item in list) {
        if (item is String && item.trim().isNotEmpty) translations.add(item);
      }
    }
    return WordTranslationReceipt(
      wordId: _text(map['wordId'], fallback: on.id),
      word: on.word,
      contributionId: _text(map['contributionId']),
      translations: List.unmodifiable(translations),
    );
  }
}

/// What one approved word is worth.
///
/// ── Mirrors `CONTRIBUTION_POINTS.dictionary` in contributor-scores.ts ────
/// Display only. This app does not award anything and must not behave as
/// though it does: the points move in a Firestore trigger when a reviewer
/// accepts the submission, which is why every sentence on this screen says
/// *when it is approved* and none of them says *earned*. Promising a member
/// ten points at the moment they tap send is a promise the review desk has not
/// made and may not keep, and a total that goes up and then does not is how
/// people stop believing the number at all.
///
/// Hard-coded rather than read from the receipt because the receipt does not
/// carry it — the award has not happened yet, so there is nothing to report.
/// If the backend table changes, this changes with it.
const int kApprovedWordPoints = 10;

// ── Coercion ────────────────────────────────────────────────────────────────

String _text(Object? value, {String fallback = ''}) {
  if (value is String) {
    final trimmed = value.trim();
    if (trimmed.isNotEmpty) return trimmed;
  }
  // Numbers matter here: `tatoebaId` is a string in the seed and an integer in
  // anything that round-trips through a JSON tool that helpfully "fixes"
  // numeric strings, and losing a credit to that would be a licensing failure
  // caused by a type.
  if (value is num) return value.toString();
  return fallback;
}

int _count(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  if (value is String) return int.tryParse(value.trim()) ?? 0;
  return 0;
}
