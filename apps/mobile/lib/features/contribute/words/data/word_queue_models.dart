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

/// Whether the example sentence actually showed the word being asked about.
///
/// ── Not a skip reason, and the difference is the whole feature ───────────
/// [WordQueueSkipReason] is how a member leaves a word unanswered. This is how
/// they answer it *and* say the sentence was no help. The two cannot be merged
/// because the outcomes are opposite: a skip throws the word away, and this
/// keeps the answer while flagging the prompt.
///
/// The case that forced it: the queue asks for the Kasem for *word* and shows
/// "My teacher put in a good word for me." A fluent speaker knows the answer
/// perfectly well; the sentence is simply about something else. Before this
/// they could translate the idiom (which poisons the entry), translate the
/// plain word (right, but a reviewer could not tell which they had done), or
/// skip a word they knew.
///
/// [idiom] and [otherSense] stay apart because they lead to different repairs —
/// an idiom is worth recording as an idiom in its own right, and a wrong sense
/// just needs a better sentence.
enum WordQueueSentenceFit {
  fits,
  idiom,
  otherSense;

  /// Not [name]: `otherSense` goes over the wire as `other-sense`, which is
  /// what `SENTENCE_FITS` in word-queue.ts validates against. A Dart enum
  /// cannot spell a hyphen, so the two spellings are written out here rather
  /// than left for a `toLowerCase()` somewhere to get wrong.
  String get wire => switch (this) {
    WordQueueSentenceFit.fits => 'fits',
    WordQueueSentenceFit.idiom => 'idiom',
    WordQueueSentenceFit.otherSense => 'other-sense',
  };

  /// Written as things a person would say, not as grammatical categories. A
  /// member who has to work out whether their sentence is "non-compositional"
  /// picks the first option and moves on.
  String get label => switch (this) {
    WordQueueSentenceFit.fits => 'The sentence fits',
    WordQueueSentenceFit.idiom => 'That is a saying, not the plain word',
    WordQueueSentenceFit.otherSense => 'That is a different meaning',
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
    this.sentenceFit = WordQueueSentenceFit.fits,
    this.definiteForm = '',
    this.pluralForm = '',
    this.pluralDefiniteForm = '',
    this.countedForm = '',
    this.pronounForm = '',
    this.presentForm = '',
    this.pastForm = '',
    this.futureForm = '',
    this.pluralSubjectForm = '',
    this.imperativeForm = '',
    this.agreeingOneForm = '',
    this.agreeingTwoForm = '',
    this.alsoUsedAs = const <String>[],
    this.ipa = '',
    this.kasemDefinition = '',
    this.etymology = '',
    this.recordingStoragePath = '',
    this.recordingMimeType = '',
    this.recordingSizeBytes = 0,
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

  /// Defaults to [WordQueueSentenceFit.fits], which is the honest default: the
  /// control is pre-selected there, so the median word costs zero taps and a
  /// member who says nothing has said the sentence was fine.
  final WordQueueSentenceFit sentenceFit;

  /// The noun said with *the*, if the member offered it.
  ///
  /// ── The field that makes "the" answerable ────────────────────────────
  /// Definiteness in Kasem is a property of the noun, not a separate word, so
  /// there is no Kasem for "the" to collect and never was. What there is, is
  /// this: the form a speaker actually says. The noun class is worked out from
  /// it on the server — see `kasem-morphology.ts` — so that nobody is ever
  /// asked to name their own language's noun classes, which almost no fluent
  /// speaker of any language can do.
  ///
  /// Empty for every word class but Noun, and empty for most nouns too. It is
  /// optional on purpose: a queue that grows a required field is a queue
  /// people answer four words in instead of twenty.
  final String definiteForm;

  /// The noun said for many. Optional on the same terms as [definiteForm].
  final String pluralForm;

  /// The noun said with *two* — "boys" → "two boys".
  ///
  /// ── Why a third question, and why only after the plural ──────────────
  /// A Kasem numeral carries a marker chosen by the noun it counts: Francis
  /// gave six forms of *two* on 2026-09-05 — balei, yalei, nlei, selei,
  /// telei, delei — and Genesis 1 shows `da yam` "the days" beside
  /// `da yalei` "two days", the same `ya` on the article and on the numeral.
  /// So this is a second, independent reading of the class the definite form
  /// already hints at, and the two together are checkable in a way either
  /// alone is not.
  ///
  /// It is asked only once the member has answered [pluralForm], because
  /// counting starts from the plural — a speaker who has just typed "boys"
  /// can say "two boys" without stopping to think, and one who skipped the
  /// plural would be being asked to invent it. That keeps the median word at
  /// zero extra taps, which is the bar every addition to this screen has to
  /// clear.
  final String countedForm;

  /// The plural said with *the* — "the boys".
  ///
  /// Asked because the singular and the plural may sit in different classes:
  /// `dɛ dem` "the day" beside `da yam` "the days" is ordinary Gur sg/pl class
  /// pairing, and without this form the pairing cannot be seen at all — the
  /// definite reads the singular's class while the numeral agrees with the
  /// plural.
  final String pluralDefiniteForm;

  /// The pronoun that stands in for the noun — "the boy … *he*".
  ///
  /// The third reading of the same marker and the cheapest to elicit: a
  /// speaker who has just written "the boy" says "he came" without stopping,
  /// where "two boys" makes some people count.
  final String pronounForm;

  /// The verb said now, yesterday and tomorrow.
  ///
  /// ── Three, because three is what somebody can answer ─────────────────
  /// Kasem marks aspect as well as time and the full paradigm is a research
  /// question. "Say it for now / for yesterday / for tomorrow" are three
  /// questions any speaker answers in seconds, and three filled boxes per verb
  /// is a paradigm this dictionary has never had a single row of. What comes
  /// back is evidence, and nothing anywhere generates a fourth form from it.
  final String presentForm;
  final String pastForm;
  final String futureForm;

  /// The verb said of several doers, and said as an instruction.
  final String pluralSubjectForm;
  final String imperativeForm;

  /// The word used with one thing, and then with a different thing.
  ///
  /// For an adjective, a quantifier, a numeral, a determiner, an article or a
  /// pronoun — every class whose form is chosen by what it attaches to. Until
  /// these two existed the queue asked all of them nothing at all, which is
  /// most of the words a learner needs in order to say anything *about* a
  /// noun. Two examples rather than named cells, because naming the cells
  /// would mean inventing the class inventory; see `kasem-morphology.ts`.
  final String agreeingOneForm;
  final String agreeingTwoForm;

  /// The other word classes the member said this word is also used as.
  ///
  /// Stable ids, never labels. The server drops anything it does not
  /// recognise, and drops the entry's own class if it appears here.
  final List<String> alsoUsedAs;

  /// How the word is said, in IPA. Sent without delimiters; the server strips
  /// any the member typed anyway, because half of people type them.
  final String ipa;

  /// What the word means, said in Kasem, and where it comes from.
  ///
  /// Both live behind a collapsed "more detail" section on the queue screen,
  /// which is the only reason they can exist there at all: the median word has
  /// to stay at zero extra taps, and two prose boxes in the main column would
  /// end a sitting at four words instead of twenty.
  final String kasemDefinition;
  final String etymology;

  /// A recording of the word being said, already uploaded to the member's own
  /// private submission prefix. Empty on nearly every answer.
  ///
  /// ── Why the queue can take a recording at all ────────────────────────
  /// A dictionary entry's whole point is a sound, and for as long as the
  /// guided queue has been the main way words arrive it has been the one
  /// contribution path with no way to record one. The open form has had a
  /// recorder since the play button on a published entry stopped being a stub;
  /// the queue — which produces the overwhelming majority of entries — sent
  /// text only, so the archive filled up with words nobody can hear.
  final String recordingStoragePath;
  final String recordingMimeType;
  final int recordingSizeBytes;

  /// True when a take is attached and worth sending.
  bool get hasRecording => recordingStoragePath.isNotEmpty;

  /// Every form slot with something in it, or null when there are none.
  ///
  /// Built here rather than inline in [toPayload] so the "send nothing rather
  /// than a map of empty strings" rule is written once. It matters more now
  /// than it did with three slots: eleven empty strings on every answer would
  /// be eleven fields of nothing on fifteen thousand review documents.
  Map<String, Object?>? get _forms {
    final forms = <String, Object?>{
      if (definiteForm.isNotEmpty) 'definite': definiteForm,
      if (pluralForm.isNotEmpty) 'plural': pluralForm,
      if (pluralDefiniteForm.isNotEmpty) 'pluralDefinite': pluralDefiniteForm,
      if (countedForm.isNotEmpty) 'counted': countedForm,
      if (pronounForm.isNotEmpty) 'pronoun': pronounForm,
      if (presentForm.isNotEmpty) 'present': presentForm,
      if (pastForm.isNotEmpty) 'past': pastForm,
      if (futureForm.isNotEmpty) 'future': futureForm,
      if (pluralSubjectForm.isNotEmpty) 'pluralSubject': pluralSubjectForm,
      if (imperativeForm.isNotEmpty) 'imperative': imperativeForm,
      if (agreeingOneForm.isNotEmpty) 'agreeingOne': agreeingOneForm,
      if (agreeingTwoForm.isNotEmpty) 'agreeingTwo': agreeingTwoForm,
    };
    return forms.isEmpty ? null : forms;
  }

  /// The indefinite is **not** here, and must not be added.
  ///
  /// It was believed to be the noun plus `mo`, invariantly — a rule, so
  /// derived wherever it is shown rather than stored. A speaker withdrew that
  /// reading on 2026-09-05 (`mo` is a focus particle), so nothing is derived
  /// either; and the server refuses a client-supplied copy in both worlds,
  /// because a stored copy of a rule is free to disagree with the rule.
  Map<String, Object?> toPayload() => <String, Object?>{
    'wordId': wordId,
    'translations': translations,
    'partOfSpeech': partOfSpeech,
    'dialect': dialect,
    'notes': notes,
    'kasemExample': kasemExample,
    'englishExample': englishExample,
    'sentenceFit': sentenceFit.wire,
    // Every one of these is omitted when empty, so the great majority of
    // answers send exactly the keys they always did.
    'forms': ?_forms,
    if (alsoUsedAs.isNotEmpty) 'alsoUsedAs': alsoUsedAs,
    if (ipa.isNotEmpty) 'ipa': ipa,
    if (kasemDefinition.isNotEmpty) 'kasemDefinition': kasemDefinition,
    if (etymology.isNotEmpty) 'etymology': etymology,
    if (hasRecording)
      'media': <String, Object?>{
        'storagePath': recordingStoragePath,
        'mimeType': recordingMimeType,
        'sizeBytes': recordingSizeBytes,
        // Always audio from this path. The server validates the value against
        // its own list rather than trusting it, and refuses a path that is not
        // inside the caller's own upload folder.
        'mediaType': 'audio',
      },
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
