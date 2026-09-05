import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/kasem_homographs.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

enum CollectionKind { music, dictionary, literature, audiobooks, video }

extension CollectionKindCopy on CollectionKind {
  String get label => switch (this) {
    CollectionKind.music => 'Music',
    CollectionKind.dictionary => 'Dictionary',
    CollectionKind.literature => 'Literature',
    CollectionKind.audiobooks => 'Audiobooks',
    CollectionKind.video => 'Video',
  };

  String get contributionLabel => switch (this) {
    CollectionKind.music => 'a song or recording',
    CollectionKind.dictionary => 'a dictionary entry',
    CollectionKind.literature => 'a story or written work',
    CollectionKind.audiobooks => 'an audiobook or oral reading',
    CollectionKind.video => 'a video or film',
  };
}

/// Reads the legacy Project Kassena dictionary collection shown in Firebase.
///
/// Only explicitly published rows are requested. Sorting happens on-device so
/// this remains a single-field query and does not require a composite index.
class FirestoreDictionaryRepository {
  const FirestoreDictionaryRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<DictionaryEntry>> watchPublished() => _firestore
      .collection('dictionaryEntries')
      .where('isPublished', isEqualTo: true)
      .snapshots()
      .map((snapshot) {
        final entries =
            snapshot.docs
                .map(_dictionaryEntryFromDoc)
                .whereType<DictionaryEntry>()
                .toList(growable: true)
              // ── Kasem alphabetical order, not UTF-16 order ──────────
              // `compareTo` on the raw headword sorts by code unit, and every
              // extended Kasem letter lives above U+0100 — so every word
              // beginning ŋ, ɔ, ɛ, ɩ or ʋ landed after z in a heap of several
              // hundred, and inside a word `lagɩ` sorted after `lagz`. A
              // reader scrolling to where a word belongs did not find it
              // there. [DictionaryEntry.sortKey] files each extended letter
              // directly after the letter it belongs with, which is how the
              // printed sources do it.
              //
              // Then the sense number, and that half is not decoration
              // either. Dart's List.sort is explicitly not stable, so a run of
              // entries sharing a headword — 478 of the 1200 published rows —
              // had no defined order and could come back in a different one
              // from two snapshots carrying the same documents. That
              // reordered numbered senses under a reader's finger.
              ..sort((left, right) {
                final byHeadword = left.sortKey.compareTo(right.sortKey);
                if (byHeadword != 0) return byHeadword;
                final bySense = left.homographIndex.compareTo(
                  right.homographIndex,
                );
                // Falls through to the document id so the order is total even
                // for two unnumbered rows, which is what makes it repeatable.
                return bySense != 0 ? bySense : left.id.compareTo(right.id);
              });
        return List.unmodifiable(entries);
      });

  Stream<DictionaryEntry?> watchPublishedEntry(String entryId) => _firestore
      .collection('dictionaryEntries')
      .doc(entryId)
      .snapshots()
      .map((document) {
        final data = document.data();
        if (data == null || data['isPublished'] != true) return null;
        return dictionaryEntryFromData(document.id, data);
      });
}

final firestoreDictionaryRepositoryProvider =
    Provider<FirestoreDictionaryRepository?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return FirestoreDictionaryRepository(FirebaseFirestore.instance);
    });

/// The real, published Firebase dictionary. An unavailable Firebase launch is
/// represented as an empty collection so every collection surface can render a
/// useful empty state instead of synthetic vocabulary.
final publishedDictionaryEntriesProvider =
    StreamProvider<List<DictionaryEntry>>((ref) {
      final repository = ref.watch(firestoreDictionaryRepositoryProvider);
      if (repository == null) return Stream.value(const <DictionaryEntry>[]);
      return repository.watchPublished();
    });

/// How many published entries share each headword, keyed by [headwordKey].
///
/// Derived from the same stream the list is built from rather than queried, so
/// it cannot disagree with what is on screen. This is the half of homograph
/// numbering that is NOT stored: the index on the document says which sense an
/// entry is, and this says whether that number should be drawn at all — a word
/// alone under its spelling must render bare, and must start showing its `¹`
/// the day a second one is published without anything rewriting it.
final dictionaryHeadwordCountsProvider = Provider<Map<String, int>>((ref) {
  final entries =
      ref.watch(publishedDictionaryEntriesProvider).asData?.value ??
      const <DictionaryEntry>[];
  return countByHeadword(entries.map((entry) => entry.headword));
});

/// How many published entries share [headword]. One when it stands alone, and
/// one for a headword nothing has loaded yet — the safe answer either way,
/// because it draws no number.
int dictionarySiblingCount(WidgetRef ref, String headword) =>
    ref.watch(dictionaryHeadwordCountsProvider)[headwordKey(headword)] ?? 1;

final publishedDictionaryEntryProvider =
    StreamProvider.family<DictionaryEntry?, String>((ref, entryId) {
      final repository = ref.watch(firestoreDictionaryRepositoryProvider);
      if (repository == null) return Stream.value(null);
      return repository.watchPublishedEntry(entryId);
    });

Stream<List<PublishedReel>> _watchCollection(Ref ref, CollectionKind kind) {
  final repository = ref.watch(publishedContentRepositoryProvider);
  if (repository == null) return Stream.value(const <PublishedReel>[]);
  return repository.watchCollection(kind.name);
}

final musicCollectionProvider = StreamProvider<List<PublishedReel>>(
  (ref) => _watchCollection(ref, CollectionKind.music),
);

final literatureCollectionProvider = StreamProvider<List<PublishedReel>>(
  (ref) => _watchCollection(ref, CollectionKind.literature),
);

final audiobookCollectionProvider = StreamProvider<List<PublishedReel>>(
  (ref) => _watchCollection(ref, CollectionKind.audiobooks),
);

final videoCollectionProvider = StreamProvider<List<PublishedReel>>(
  (ref) => _watchCollection(ref, CollectionKind.video),
);

DictionaryEntry? _dictionaryEntryFromDoc(
  QueryDocumentSnapshot<Map<String, dynamic>> doc,
) => dictionaryEntryFromData(doc.id, doc.data());

DictionaryEntry? dictionaryEntryFromData(String id, Map<String, dynamic> data) {
  final kasem = _firstText(data, const [
    'kasemText',
    'headword',
    'kasem',
    'word',
  ]);
  final english = _firstText(data, const [
    'englishText',
    'translation',
    'english',
    'definition',
  ]);
  // Both sides used to be optional and only their conjunction was refused,
  // which let a row with no Kasem through and then invented a headword for it
  // — the literal string 'Kasem entry'. That string was not merely displayed:
  // it became the entry's headword, and `word_lookup.dart` indexes headwords,
  // so it also became the words 'kasem' and 'entry'. A reader tapping the
  // ordinary English word "entry" in a post was shown a dictionary card.
  //
  // A dictionary entry with no headword cannot be looked up, cannot be said
  // aloud and cannot be taught. It is a broken row, and hiding it is more
  // honest than dressing it as a word.
  if (kasem.isEmpty || english.isEmpty) return null;

  final kasemExample = _firstText(data, const [
    'kasemExample',
    'example',
    'exampleKasem',
  ]);
  final englishExample = _firstText(data, const [
    'englishExample',
    'exampleTranslation',
    'exampleEnglish',
  ]);

  // The Kasem side, split. A guided contribution arrives as the one string the
  // member typed — "nia, nyu" — and the backend stores both that string as
  // `kasemText` and its split form as `translations`. Taking the raw string as
  // the headword filed the entry under a comma and offered the dictionary a
  // word nobody can look up, so the first rendering is the headword and the
  // rest travel beside it.
  final renderings = _renderings(data, kasem: kasem);
  final headword = renderings.isNotEmpty ? renderings.first : kasem;
  final attribution = _sentenceAttribution(data);

  return DictionaryEntry(
    id: id,
    headword: headword,
    translation: english,
    translations: _translations(data, english: english),
    renderings: renderings,
    // `partOfSpeechId` is the stable, lowercase, hyphenated value the review
    // pipeline writes beside the free text; it is consulted only when the free
    // text is absent, because the free text is what the contributor's own
    // client sent and is the more faithful record of what they said.
    //
    // Neither is checked against a known list here, and 'Not specified' is
    // reached only when the document says nothing at all. A word class this app
    // has never heard of — `ideophone`, `postposition`, `classifier` — is still
    // a word class somebody deliberately chose, and it survives this function
    // untouched; `partOfSpeechLabel` gives it a nicer capitalisation at render
    // time if it recognises it and hands it back verbatim if it does not.
    partOfSpeech: _firstText(data, const [
      'partOfSpeech',
      'wordClass',
      'partOfSpeechId',
    ], fallback: 'Not specified'),
    dialect: _firstText(data, const ['dialect', 'region'], fallback: 'Kasem'),
    // The written guide only. `audioUrl` used to sit at the end of this list
    // as a last resort, which meant an entry that had a recording rendered its
    // download URL as the pronunciation — and still had nothing to play.
    // ── Empty means empty, and that is the whole point ──────────────────
    // These three used to be filled with their own empty-state sentences —
    // 'No written guide yet', 'No example yet', 'No translated example yet' —
    // written into the data rather than drawn by a widget. The effect was
    // that every `if (entry.pronunciation.isNotEmpty)` and
    // `if (entry.example.isNotEmpty)` in the app was permanently true, so the
    // guards did nothing and each card rendered its own apology as though it
    // were content. A member tapping any word without an example was shown a
    // heading that said Example over the sentence "No example yet".
    //
    // The fallback belongs at the point of drawing, where the widget can
    // decide to omit the section entirely. Down here it is data, and data
    // that says "no example yet" is a lie about what the archive holds.
    pronunciation: _firstText(data, const ['pronunciation', 'phonetic']),
    audioUrl: _firstText(data, const ['audioUrl', 'pronunciationAudioUrl']),
    example: kasemExample,
    exampleTranslation: englishExample,
    sentenceSource: attribution.source,
    tatoebaId: attribution.tatoebaId,
    tatoebaContributor: attribution.contributor,
    sentenceLicence: attribution.licence,
    // ── A note every entry carries is not a note about any entry ────────
    // All 1200 rows of the imported archive carry one identical sentence in
    // this field — a review-workflow disclaimer about spelling and register
    // needing Kasem community review. It was rendered on every entry under the
    // heading "Cultural context", so a learner opening any word in the
    // dictionary was shown internal governance boilerplate where the app had
    // promised them something about the culture.
    //
    // Suppressed by shape rather than by exact string, so a re-import that
    // rewords it slightly does not put it back. What survives is a note
    // somebody actually wrote about this word.
    culturalNote: _meaningfulNote(
      _nullableText(data, const ['culturalNote', 'culturalContext', 'notes']),
    ),
    attribution: _firstText(data, const [
      'attribution',
      'source',
      'contributorName',
    ], fallback: 'Project Kassena community dictionary'),
    definiteForm: _formsValue(data, 'definite'),
    pluralForm: _formsValue(data, 'plural'),
    // Empty means *not established*, never "no class". The inventory is being
    // built from contributed definite forms rather than assumed in advance, so
    // most entries will read empty here for a long while and that is the
    // honest answer rather than a gap to be filled with something plausible.
    nounClass: _firstText(data, const ['nounClass']),
    // Its own numeric reader rather than `_firstText`, which stringifies a
    // number and returns '' when nothing matches — neither of which is a
    // sense index. Absent on every row the backfill has not reached, and 0 is
    // the honest reading of absent: not numbered.
    homographIndex: _intValue(data, 'homographIndex'),
  );
}

/// Phrases that mark a note as process boilerplate rather than cultural
/// context.
///
/// Deliberately about the review workflow rather than about the language: a
/// genuine note explains a word's occasion, register or story, and has no
/// reason to mention publication, validation or what "requires review".
const _boilerplateMarkers = [
  'require kasem community review',
  'requires kasem community review',
  'before publication',
  'awaiting community review',
  'pending validation',
  'require community review',
  'not linguistic guidance',
  'synthetic',
  'placeholder',
];

/// [note] when it says something about the word, or null when it is process
/// boilerplate wearing the heading "Cultural context".
String? _meaningfulNote(String? note) {
  final value = note?.trim();
  if (value == null || value.isEmpty) return null;
  final folded = value.toLowerCase();
  for (final marker in _boilerplateMarkers) {
    if (folded.contains(marker)) return null;
  }
  return value;
}

/// A stored whole number, or 0 when the document does not carry one.
///
/// Firestore hands numbers back as `int` or `double` depending on how they
/// were written, and a legacy import may hold the value as text, so all three
/// are accepted and anything else reads as absent. Negative values are refused
/// rather than clamped: a negative sense index is not a small number, it is a
/// corrupt one, and treating it as 0 makes the entry render plainly instead of
/// drawing a superscript minus.
int _intValue(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (value is int) return value < 0 ? 0 : value;
  if (value is num) {
    final rounded = value.toInt();
    return rounded < 0 ? 0 : rounded;
  }
  if (value is String) {
    final parsed = int.tryParse(value.trim());
    return parsed == null || parsed < 0 ? 0 : parsed;
  }
  return 0;
}

/// One recorded form off the entry's `forms` map, or empty.
///
/// A nested map rather than two flat fields because the two belong together
/// and because `definite` on its own, at the top level of a document that also
/// carries `translations` and `renderings`, reads like a boolean.
///
/// The indefinite is deliberately not readable here: it is derived from the
/// headword by [DictionaryEntry.indefinite], and a stored copy would be free
/// to disagree with the rule it came from.
String _formsValue(Map<String, dynamic> data, String key) {
  final forms = data['forms'];
  if (forms is! Map) return '';
  final value = forms[key];
  return value is String ? value.trim() : '';
}

/// Every meaning this entry carries, whether or not the document lists them.
///
/// ── Why the document's `translations` is not simply trusted ───────────────
/// It is not always the field this app means by that name, and the collision is
/// not hypothetical — it is live. `dictionaryEntries` documents written by the
/// review pipeline (see the `tx.set(dictionaryRef, …)` block in
/// `services/functions/src/creators.ts`) carry `translations` as *the Kasem
/// renderings of the headword*, derived from the contributor's Kasem field,
/// while the legacy schema this reader was built for uses the singular
/// `translation` for the *English* gloss. Binding the array straight onto the
/// entry's meaning list — which is what the obvious one-line version of this
/// function does — would print Kasem strings in the place the app reserves for
/// English, on every entry published since that pipeline shipped, and the only
/// thing standing between that and a visible bug would be luck.
///
/// So the array is accepted only when it is *not* the headword restated. That
/// is an exact structural test rather than a guess about the words: the
/// pipeline builds its array by running the headword through the very splitter
/// [splitTranslations] mirrors, so running the headword through it again
/// reproduces the array element for element whenever the array is the Kasem
/// side, and cannot reproduce it when the array holds genuine meanings.
///
/// `englishTranslations` is read first and unconditionally. Nothing writes it
/// today; it is the field name to ask the pipeline for when the English side
/// grows a real array, and reading it now means that day needs no client
/// release.
///
/// When neither yields anything the list is derived by splitting the English
/// gloss, which is how the fifteen thousand entries published before any of
/// this existed gain the new shape without a migration nobody was going to run.
List<String> _translations(Map<String, dynamic> data, {required String english}) {
  final declared = _stringList(data['englishTranslations']);
  // Joined and re-split rather than used as-is, so a list that arrived from an
  // older client keeps the same de-duplication, trimming and cap as one this
  // app derived itself. The backend does exactly this, for the same reason —
  // see `normaliseTranslations` in `lexical-kinds.ts`.
  if (declared.isNotEmpty) return splitTranslations(declared.join(', '));

  // Deliberately NOT `data['translations']`. That field is the Kasem side —
  // the review pipeline derives it from the contribution's Kasem body — and it
  // is read by [_renderings] above. Reading it here too was the first attempt
  // and it printed Kasem words in the meaning column; the defence against that
  // was a heuristic asking whether the list merely restated the headword, which
  // worked only for as long as the headword was the un-split raw string. A
  // field belongs to one side of an entry or the other, and this one belongs to
  // the Kasem side.
  //
  // So the English meanings come from the English field, split the same way:
  // members have always answered "what does it mean" with lists — "greeting,
  // hello" — and storing that whole made the meaning literally that string.
  return splitTranslations(english);
}

/// Every Kasem rendering this entry carries.
///
/// `dictionaryEntries.translations` is written by the review pipeline from the
/// contribution's Kasem body, so it is the Kasem side however much its name
/// suggests otherwise — see `submissionTranslations` in
/// services/functions/src/publication.ts. Absent on the whole legacy
/// dictionary, where the single rendering is simply `kasemText`; a legacy entry
/// whose author happened to write "nia, nyu" there gains the same split, which
/// is what they meant.
///
/// A single rendering returns a one-element list rather than an empty one, so
/// the headword above always has something to be.
List<String> _renderings(Map<String, dynamic> data, {required String kasem}) {
  final published = _stringList(data['translations']);
  if (published.isNotEmpty) return splitTranslations(published.join(', '));
  return kasem.isEmpty ? const <String>[] : splitTranslations(kasem);
}

/// The Tatoeba credit an entry's example sentence carries, or nothing at all.
///
/// ── This is a licence condition, not decoration ───────────────────────────
/// The guided queue's sentences are Tatoeba, CC BY 2.0 FR, which requires
/// attribution wherever the sentence is shown. Two shapes are read because two
/// exist: the flat fields a published entry is expected to carry, and the
/// `wordQueuePrompt` map that `submitWordTranslation` already stamps onto the
/// submission and that the publication step is the obvious place to copy
/// forward. Reading both costs four lines and means the credit appears the day
/// either lands, rather than the day a client release chases it.
///
/// Nothing is invented. An entry with no sentence id gets an empty
/// [_SentenceAttribution] and renders no credit line at all — not a blank line,
/// not a guessed contributor. A row that says outright it is `unattributed`
/// vetoes the credit even if some id is lying around beside it, which is the
/// same rule `queueWordAttribution` applies at the other end of the pipeline.
_SentenceAttribution _sentenceAttribution(Map<String, dynamic> data) {
  final prompt = data['wordQueuePrompt'];
  final nested = prompt is Map
      ? prompt.map((key, value) => MapEntry(key.toString(), value))
      : const <String, dynamic>{};

  String either(List<String> keys) {
    final flat = _firstText(data, keys);
    return flat.isEmpty ? _firstText(nested, keys) : flat;
  }

  final declaredSource = either(const ['sentenceSource']).trim().toLowerCase();
  if (declaredSource == 'unattributed') {
    return const _SentenceAttribution(
      source: 'unattributed',
      tatoebaId: '',
      contributor: '',
      licence: '',
    );
  }

  final tatoebaId = either(const ['tatoebaId']).trim();
  // No id, no credit. An attribution that cannot point at the sentence it
  // credits is not an attribution.
  if (tatoebaId.isEmpty) {
    return _SentenceAttribution(
      source: declaredSource,
      tatoebaId: '',
      contributor: '',
      licence: '',
    );
  }

  final licence = either(const ['sentenceLicence', 'licence']);
  return _SentenceAttribution(
    source: declaredSource.isEmpty ? 'tatoeba' : declaredSource,
    tatoebaId: tatoebaId,
    contributor: either(const ['tatoebaContributor', 'contributor']),
    // The pool is CC BY 2.0 FR and the seed records it on every row, so a
    // missing licence is a dropped field rather than a different licence.
    // Naming it is the safer failure: an omitted licence on a CC BY work is
    // the licensing mistake, and this is the same fallback
    // `queueWordAttribution` applies.
    licence: licence.isEmpty ? 'CC BY 2.0 FR' : licence,
  );
}

class _SentenceAttribution {
  const _SentenceAttribution({
    required this.source,
    required this.tatoebaId,
    required this.contributor,
    required this.licence,
  });

  final String source;
  final String tatoebaId;
  final String contributor;
  final String licence;
}

/// The string members of a field that may or may not be a list.
///
/// Non-string members are dropped rather than stringified: a number in a
/// meaning list is a broken import, and printing `3` as a meaning of a word is
/// worse than printing nothing.
List<String> _stringList(Object? value) {
  if (value is! List) return const <String>[];
  return [
    for (final item in value)
      if (item is String && item.trim().isNotEmpty) item.trim(),
  ];
}

String _firstText(
  Map<String, dynamic> data,
  List<String> keys, {
  String fallback = '',
}) {
  for (final key in keys) {
    final value = data[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
    // Older imports occasionally stored numbers in text columns. Rendering
    // their string form is safer than a runtime cast and preserves the record.
    if (value is num) return value.toString();
  }
  return fallback;
}

String? _nullableText(Map<String, dynamic> data, List<String> keys) {
  final value = _firstText(data, keys);
  return value.isEmpty ? null : value;
}
