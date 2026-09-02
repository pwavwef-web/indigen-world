import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
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
              ..sort(
                (left, right) => left.headword.toLowerCase().compareTo(
                  right.headword.toLowerCase(),
                ),
              );
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
  if (kasem.isEmpty && english.isEmpty) return null;

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
  final headword = renderings.isNotEmpty
      ? renderings.first
      : (kasem.isEmpty ? 'Kasem entry' : kasem);
  final translation = english.isEmpty ? 'Translation pending' : english;
  final attribution = _sentenceAttribution(data);

  return DictionaryEntry(
    id: id,
    headword: headword,
    translation: translation,
    translations: _translations(data, english: translation),
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
    pronunciation: _firstText(data, const [
      'pronunciation',
      'phonetic',
    ], fallback: 'No written guide yet'),
    audioUrl: _firstText(data, const ['audioUrl', 'pronunciationAudioUrl']),
    example: kasemExample.isEmpty ? 'No example yet' : kasemExample,
    exampleTranslation: englishExample.isEmpty
        ? 'No translated example yet'
        : englishExample,
    sentenceSource: attribution.source,
    tatoebaId: attribution.tatoebaId,
    tatoebaContributor: attribution.contributor,
    sentenceLicence: attribution.licence,
    culturalNote: _nullableText(data, const [
      'culturalNote',
      'culturalContext',
      'notes',
    ]),
    attribution: _firstText(data, const [
      'attribution',
      'source',
      'contributorName',
    ], fallback: 'Project Kassena community dictionary'),
    isSynthetic: false,
  );
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
