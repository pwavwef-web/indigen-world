import 'package:freezed_annotation/freezed_annotation.dart';

/// The several things one word means.
///
/// ── The gap this closes ──────────────────────────────────────────────────
/// Until now a contribution could say what a word means exactly once. The form
/// asked "what does it mean in English", took one answer, and the published
/// entry carried one gloss with one example sentence under it. That is not what
/// a word is. English *toy* is several different nouns — the thing a child
/// plays with, a trinket, a small breed of dog — before it is a verb at all,
/// and each of those senses has its own example sentence, its own register and
/// its own set of words it stands next to. Flattened into "toy, plaything,
/// trinket" the sentences have nowhere to attach, and the reader cannot tell
/// which meaning is being illustrated.
///
/// ── A sense is not a homograph, and the difference is load-bearing ───────
/// `kasem_homographs.dart` numbers entries that are *different words* sharing a
/// spelling — `mo¹` the focus particle beside `mo²`. Those are separate
/// documents with separate ids and a permanent number, because a citation of
/// `mo²` has to keep pointing at the same word for ever.
///
/// These are the several meanings of ONE word: one document, one headword, one
/// etymology, numbered inside the entry. Both render as "1." and "2." on the
/// page and only one of them is a stable identity, which is why conflating the
/// two is the commonest way a dictionary schema goes wrong.
///
/// Mirrors `LexicalSense` in `services/functions/src/lexical-senses.ts` and the
/// `senses` block of `packages/contracts/schemas/lexical-entry.schema.json`.
/// All three must agree.
@immutable
class EntrySense {
  const EntrySense({
    required this.definition,
    this.partOfSpeech = '',
    this.register = '',
    this.domain = '',
    this.kasemDefinition = '',
    this.usageNote = '',
    this.examples = const <SenseExample>[],
    this.synonyms = const <String>[],
    this.antonyms = const <String>[],
  });

  /// What it means, in English. The one field a sense cannot be without.
  final String definition;

  /// The word class this particular sense belongs to, where it differs from
  /// the entry's own.
  ///
  /// ── Why the class sits on the sense as well as the entry ──────────────
  /// Because the entry-level class cannot describe a word that is a noun in
  /// its first two senses and a verb in its third, which is the ordinary case
  /// rather than the exotic one. [DictionaryEntry.alsoUsedAs] records *that* a
  /// word crosses classes; this records *which meaning* does the crossing,
  /// which is what lets the renderer group senses the way every printed
  /// dictionary does.
  ///
  /// Empty means "the same class as the entry", which is what the great
  /// majority of senses say and is cheaper than repeating it on every row.
  final String partOfSpeech;

  /// How it is said, and to whom — one of [kSenseRegisters].
  final String register;

  /// What it is about — one of [kSenseDomains].
  final String domain;

  /// This sense's meaning stated in Kasem, where somebody gave one.
  final String kasemDefinition;

  /// When to say it, when not to, and what it goes with.
  final String usageNote;

  /// Sentences showing *this* sense in use.
  final List<SenseExample> examples;

  /// Other words that mean roughly this, as written in Kasem.
  ///
  /// Stored as the words themselves rather than as entry ids, because the word
  /// a speaker offers as a synonym very often has no entry yet — and refusing
  /// to record it until it does would lose exactly the vocabulary the
  /// cross-reference was pointing at. The renderer resolves what it can and
  /// shows the rest as plain text.
  final List<String> synonyms;

  /// Words that mean the opposite, on the same terms as [synonyms].
  final List<String> antonyms;

  /// Whether this sense says anything beyond its bare definition.
  ///
  /// Guards the detailed layout: a sense carrying nothing but a gloss is the
  /// old single-meaning entry wearing a new name, and drawing a card round it
  /// would be furniture rather than content.
  bool get hasDetail =>
      register.isNotEmpty ||
      domain.isNotEmpty ||
      kasemDefinition.isNotEmpty ||
      usageNote.isNotEmpty ||
      examples.isNotEmpty ||
      synonyms.isNotEmpty ||
      antonyms.isNotEmpty;

  /// The register as a reader should see it, or empty when unrecognised.
  ///
  /// An id this build has never heard of renders as nothing rather than as
  /// itself: these drive a small italic label beside a meaning, and a raw id
  /// like `childspeak` in that position reads as a typo rather than as
  /// information.
  String get registerLabel => senseRegisterLabel(register);

  /// The subject field as a reader should see it, or empty.
  String get domainLabel => senseDomainLabel(domain);

  /// Everything this sense contributes to a search index.
  ///
  /// The definition plus the Kasem gloss, the usage note and both
  /// cross-reference lists. Searching only the first sense's definition meant
  /// an entry whose *second* meaning was the one somebody wanted simply did
  /// not exist for them.
  String get searchableText => [
    definition,
    kasemDefinition,
    usageNote,
    ...synonyms,
    ...antonyms,
    for (final example in examples) ...[example.kasem, example.english],
  ].where((piece) => piece.isNotEmpty).join(' ');

  Map<String, Object?> toJson() => {
    'definition': definition,
    if (partOfSpeech.isNotEmpty) 'partOfSpeech': partOfSpeech,
    if (register.isNotEmpty) 'register': register,
    if (domain.isNotEmpty) 'domain': domain,
    if (kasemDefinition.isNotEmpty) 'kasemDefinition': kasemDefinition,
    if (usageNote.isNotEmpty) 'usageNote': usageNote,
    if (examples.isNotEmpty)
      'examples': [for (final example in examples) example.toJson()],
    if (synonyms.isNotEmpty) 'synonyms': synonyms,
    if (antonyms.isNotEmpty) 'antonyms': antonyms,
  };

  /// Reads one sense off a Firestore map, tolerating everything.
  ///
  /// Returns null for a row with no definition. A sense is its definition;
  /// an entry showing "2." with nothing after it is worse than an entry with
  /// one sense, so a definitionless row is dropped rather than drawn.
  static EntrySense? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final definition = _text(raw['definition']);
    if (definition.isEmpty) return null;
    return EntrySense(
      definition: definition,
      partOfSpeech: _text(raw['partOfSpeech']).toLowerCase(),
      register: _text(raw['register']).toLowerCase(),
      domain: _text(raw['domain']).toLowerCase(),
      kasemDefinition: _text(raw['kasemDefinition']),
      usageNote: _text(raw['usageNote']),
      examples: SenseExample.listFrom(raw['examples']),
      synonyms: _textList(raw['synonyms']),
      antonyms: _textList(raw['antonyms']),
    );
  }

  /// Reads the whole `senses` array, dropping anything unreadable.
  ///
  /// Never throws. It runs on every row of a list a member is scrolling, and a
  /// parser that threw on one malformed document would take down a screen.
  static List<EntrySense> listFrom(Object? raw) {
    if (raw is! List) return const <EntrySense>[];
    final out = <EntrySense>[];
    for (final item in raw) {
      final sense = EntrySense.fromJson(item);
      if (sense != null) out.add(sense);
      if (out.length >= kMaxSenses) break;
    }
    return List.unmodifiable(out);
  }

  EntrySense copyWith({
    String? definition,
    String? partOfSpeech,
    String? register,
    String? domain,
    String? kasemDefinition,
    String? usageNote,
    List<SenseExample>? examples,
    List<String>? synonyms,
    List<String>? antonyms,
  }) => EntrySense(
    definition: definition ?? this.definition,
    partOfSpeech: partOfSpeech ?? this.partOfSpeech,
    register: register ?? this.register,
    domain: domain ?? this.domain,
    kasemDefinition: kasemDefinition ?? this.kasemDefinition,
    usageNote: usageNote ?? this.usageNote,
    examples: examples ?? this.examples,
    synonyms: synonyms ?? this.synonyms,
    antonyms: antonyms ?? this.antonyms,
  );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EntrySense &&
          other.definition == definition &&
          other.partOfSpeech == partOfSpeech &&
          other.register == register &&
          other.domain == domain &&
          other.kasemDefinition == kasemDefinition &&
          other.usageNote == usageNote &&
          _sameList(other.examples, examples) &&
          _sameList(other.synonyms, synonyms) &&
          _sameList(other.antonyms, antonyms);

  @override
  int get hashCode => Object.hash(
    definition,
    partOfSpeech,
    register,
    domain,
    kasemDefinition,
    usageNote,
    Object.hashAll(examples),
    Object.hashAll(synonyms),
    Object.hashAll(antonyms),
  );

  @override
  String toString() => 'EntrySense($definition)';
}

/// One example sentence, in Kasem and in English.
///
/// Either half may be empty, and that is not an error. A contributor who wrote
/// the Kasem and left the translation for a reviewer has given the archive the
/// half nobody else can supply.
@immutable
class SenseExample {
  const SenseExample({this.kasem = '', this.english = ''});

  final String kasem;
  final String english;

  bool get isEmpty => kasem.isEmpty && english.isEmpty;
  bool get isNotEmpty => !isEmpty;

  Map<String, Object?> toJson() => {'kasem': kasem, 'english': english};

  /// Reads the two shapes that exist in the archive.
  ///
  /// A bare string is a Kasem sentence — that is what the contracts schema
  /// accepted before senses carried their own translations, and there is no
  /// reason to refuse a record that was valid when it was written. The object
  /// form carries both halves, which is what a reader needs and what
  /// contributors are asked for now. Neither is rewritten into the other on
  /// disk; the lift happens here, on read, where it costs nothing.
  static SenseExample? fromJson(Object? raw) {
    if (raw is String) {
      final value = raw.trim();
      return value.isEmpty ? null : SenseExample(kasem: value);
    }
    if (raw is! Map) return null;
    final example = SenseExample(
      kasem: _text(raw['kasem']),
      english: _text(raw['english']),
    );
    return example.isEmpty ? null : example;
  }

  static List<SenseExample> listFrom(Object? raw) {
    if (raw is! List) return const <SenseExample>[];
    final out = <SenseExample>[];
    for (final item in raw) {
      final example = SenseExample.fromJson(item);
      if (example != null) out.add(example);
      if (out.length >= kMaxSenseExamples) break;
    }
    return List.unmodifiable(out);
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SenseExample &&
          other.kasem == kasem &&
          other.english == english;

  @override
  int get hashCode => Object.hash(kasem, english);

  @override
  String toString() => 'SenseExample($kasem / $english)';
}

/// Serialises the `senses` list on [DictionaryEntry].
///
/// A hand-written converter rather than a generated nested `@freezed` class,
/// because an example may arrive as a string or as an object and a generated
/// reader has no way to accept both. The union lives in [SenseExample.fromJson]
/// where it is one branch and a comment, instead of in a build step.
class EntrySenseListConverter
    implements JsonConverter<List<EntrySense>, Object?> {
  const EntrySenseListConverter();

  @override
  List<EntrySense> fromJson(Object? json) => EntrySense.listFrom(json);

  @override
  Object? toJson(List<EntrySense> senses) => [
    for (final sense in senses) sense.toJson(),
  ];
}

/// The most senses one entry may carry, and the most examples one sense may.
///
/// Mirrors `MAX_SENSES` and `MAX_SENSE_EXAMPLES` in
/// `services/functions/src/lexical-senses.ts`.
const kMaxSenses = 12;
const kMaxSenseExamples = 4;

/// How a word is said, and to whom.
///
/// ── Why these labels and not the standard lexicographic set ─────────────
/// Because the standard set — "colloq.", "vulg.", "arch." — is a vocabulary a
/// contributor has to be taught before they can use it, and this form is
/// answered by speakers rather than by lexicographers. Each label below is
/// something somebody can recognise about their own speech without training.
/// `avoided` in particular is deliberately not called "vulgar": what a Kasem
/// speaker will actually tell you is who they would not say it in front of.
///
/// Mirrors `SENSE_REGISTERS` in `services/functions/src/lexical-senses.ts`.
const kSenseRegisters = <({String id, String label})>[
  (id: 'everyday', label: 'Everyday speech'),
  (id: 'respectful', label: 'Said with respect'),
  (id: 'formal', label: 'Formal or ceremonial'),
  (id: 'colloquial', label: 'Casual, among friends'),
  (id: 'old', label: "Old people's word"),
  (id: 'new', label: 'Newer word'),
  (id: 'joking', label: 'Said jokingly'),
  (id: 'figurative', label: 'Figurative'),
  (id: 'childspeak', label: 'Said to children'),
  (id: 'avoided', label: 'Not said in front of elders'),
];

/// What the sense is about.
///
/// ── A subject field, not a tag cloud ────────────────────────────────────
/// Free text was the alternative and it produces "farming", "farm", "Farming"
/// and "agric" on four entries that mean the same thing, which defeats the one
/// query the field exists to serve: show me the vocabulary of the farm. A
/// closed list is browsable; an open one is not.
///
/// Mirrors `SENSE_DOMAINS` in `services/functions/src/lexical-senses.ts`.
const kSenseDomains = <({String id, String label})>[
  (id: 'farming', label: 'Farming and land'),
  (id: 'food', label: 'Food and cooking'),
  (id: 'kinship', label: 'Family and kinship'),
  (id: 'body', label: 'The body and health'),
  (id: 'animals', label: 'Animals'),
  (id: 'plants', label: 'Plants and trees'),
  (id: 'weather', label: 'Weather and seasons'),
  (id: 'market', label: 'Market and trade'),
  (id: 'house', label: 'House and compound'),
  (id: 'clothing', label: 'Clothing and adornment'),
  (id: 'ritual', label: 'Ritual and belief'),
  (id: 'chieftaincy', label: 'Chieftaincy and custom'),
  (id: 'greeting', label: 'Greetings and address'),
  (id: 'music', label: 'Music and dance'),
  (id: 'work', label: 'Work and craft'),
  (id: 'travel', label: 'Travel and place'),
  (id: 'time', label: 'Time and counting'),
  (id: 'speech', label: 'Speech and storytelling'),
];

/// The label for a register id, or empty when this build does not know it.
String senseRegisterLabel(String id) {
  if (id.isEmpty) return '';
  for (final register in kSenseRegisters) {
    if (register.id == id) return register.label;
  }
  return '';
}

/// The label for a domain id, or empty when this build does not know it.
String senseDomainLabel(String id) {
  if (id.isEmpty) return '';
  for (final domain in kSenseDomains) {
    if (domain.id == id) return domain.label;
  }
  return '';
}

/// Element-wise list equality.
///
/// Hand-rolled rather than pulling `package:collection` in for one call. The
/// app does not depend on it today, and a new direct dependency for an
/// eight-line function is a dependency somebody has to audit at release time.
bool _sameList<T>(List<T> a, List<T> b) {
  if (identical(a, b)) return true;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

String _text(Object? value) => value is String ? value.trim() : '';

List<String> _textList(Object? value) {
  if (value is! List) return const <String>[];
  final out = <String>[];
  final seen = <String>{};
  for (final item in value) {
    final text = _text(item);
    if (text.isEmpty) continue;
    if (!seen.add(text.toLowerCase())) continue;
    out.add(text);
    if (out.length >= 8) break;
  }
  return List.unmodifiable(out);
}
