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

/// Reads the legacy Project Kasena dictionary collection shown in Firebase.
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

  return DictionaryEntry(
    id: id,
    headword: kasem.isEmpty ? 'Kasem entry' : kasem,
    translation: english.isEmpty ? 'Translation pending' : english,
    partOfSpeech: _firstText(data, const [
      'partOfSpeech',
      'wordClass',
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
    culturalNote: _nullableText(data, const [
      'culturalNote',
      'culturalContext',
      'notes',
    ]),
    attribution: _firstText(data, const [
      'attribution',
      'source',
      'contributorName',
    ], fallback: 'Project Kasena community dictionary'),
    isSynthetic: false,
  );
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
