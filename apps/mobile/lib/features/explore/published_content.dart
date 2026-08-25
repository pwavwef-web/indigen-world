import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// A single approved, published creator piece as consumed by the Explore feed.
///
/// Mirrors the guest-readable `publishedContent` collection that the TribeStudio
/// publication workflow writes. Only the fields the mobile feed renders are kept.
class PublishedReel {
  const PublishedReel({
    required this.id,
    required this.title,
    required this.creatorName,
    this.creatorId = '',
    this.creatorAvatarUrl,
    this.mediaUrl,
    this.thumbnailUrl,
    this.mediaType,
    this.body = '',
    this.description = '',
    this.englishSummary = '',
    this.culturalNotes = '',
    this.category = '',
    this.language = '',
    this.dialect = '',
    this.licenceDisplay = '',
    this.publishedAt,
  });

  final String id;
  final String title;
  final String creatorName;

  /// The creator's account id, carried on every published record by the
  /// publication workflow. It is the same uid their community profile is keyed
  /// by, which is what lets a viewer follow them or open their other work from
  /// the reel they are watching.
  final String creatorId;

  final String? creatorAvatarUrl;

  /// Public download URL of the approved media, or null while it is being
  /// processed by the publication workflow.
  final String? mediaUrl;
  final String? thumbnailUrl;

  /// 'video' | 'image' | 'audio' | 'document', when known.
  final String? mediaType;

  /// The submitted work itself: literature text, lyrics, or a transcript.
  final String body;
  final String description;
  final String englishSummary;
  final String culturalNotes;
  final String category;
  final String language;
  final String dialect;
  final String licenceDisplay;
  final String? publishedAt;

  bool get isVideo => mediaType?.toLowerCase() == 'video';
  bool get isImage => mediaType?.toLowerCase() == 'image';

  /// Still image to show as the reel background / video poster.
  String? get posterUrl {
    if (thumbnailUrl != null && thumbnailUrl!.isNotEmpty) return thumbnailUrl;
    // Never hand an audio or document URL to an image decoder. Those files can
    // be large and will always fail to render as artwork.
    if (isImage && mediaUrl != null && mediaUrl!.isNotEmpty) return mediaUrl;
    return null;
  }

  /// Playable video URL, only when this piece is a video with processed media.
  String? get videoUrl =>
      (isVideo && mediaUrl != null && mediaUrl!.isNotEmpty) ? mediaUrl : null;

  static PublishedReel fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    final rawAttribution = data['creatorAttribution'];
    final attribution = rawAttribution is Map
        ? Map<String, dynamic>.from(rawAttribution)
        : const <String, dynamic>{};
    return PublishedReel(
      id: _text(data['id'], fallback: doc.id),
      title: _text(data['title'], fallback: 'Untitled'),
      creatorName: _text(
        attribution['displayName'],
        fallback: 'Indigen World creator',
      ),
      creatorId: _text(attribution['creatorId']),
      creatorAvatarUrl: _nullableText(attribution['avatarUrl']),
      mediaUrl: _nullableText(data['mediaUrl']),
      thumbnailUrl: _nullableText(data['thumbnailUrl']),
      mediaType: _nullableText(data['mediaType']),
      body: _text(data['body']),
      description: _text(data['description']),
      englishSummary: _text(data['englishSummary']),
      culturalNotes: _text(data['culturalNotes']),
      category: _text(data['category']),
      language: _text(data['language']),
      dialect: _text(data['dialect']),
      licenceDisplay: _text(data['licenceDisplay']),
      publishedAt: _dateText(data['publishedAt']),
    );
  }
}

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  if (value is num) return value.toString();
  return fallback;
}

String? _nullableText(Object? value) {
  final text = _text(value);
  return text.isEmpty ? null : text;
}

String? _dateText(Object? value) {
  if (value is Timestamp) return value.toDate().toUtc().toIso8601String();
  return _nullableText(value);
}

/// Reads published creator content for the public Explore feed. Guests are
/// allowed to read `publicationStatus == 'published'` records per the Firestore
/// rules, so this works signed-in or not.
class PublishedContentRepository {
  const PublishedContentRepository(this._firestore);

  final FirebaseFirestore _firestore;

  static const feedLimit = 30;

  Query<Map<String, dynamic>> get _feedQuery => _firestore
      .collection('publishedContent')
      .where('publicationStatus', isEqualTo: 'published')
      .orderBy('publishedAt', descending: true)
      .limit(feedLimit);

  Future<List<PublishedReel>> fetchFeed() async {
    final snapshot = await _feedQuery.get();
    return snapshot.docs.map(PublishedReel.fromDoc).toList(growable: false);
  }

  /// Live feed; emits again whenever content is published or updated.
  Stream<List<PublishedReel>> watchFeed() => _feedQuery.snapshots().map(
    (snapshot) =>
        snapshot.docs.map(PublishedReel.fromDoc).toList(growable: false),
  );

  /// Everything one creator has published, newest first — the body of their
  /// creator page.
  Stream<List<PublishedReel>> watchCreatorWorks(String creatorId) => _firestore
      .collection('publishedContent')
      .where('publicationStatus', isEqualTo: 'published')
      .where('creatorAttribution.creatorId', isEqualTo: creatorId)
      .orderBy('publishedAt', descending: true)
      .limit(60)
      .snapshots()
      .map(
        (snapshot) =>
            snapshot.docs.map(PublishedReel.fromDoc).toList(growable: false),
      );

  /// Published records by id, for the reels a member has kept.
  Future<List<PublishedReel>> byIds(List<String> ids) async {
    if (ids.isEmpty) return const [];
    final chunks = <List<String>>[];
    for (var index = 0; index < ids.length; index += 30) {
      chunks.add(
        ids.sublist(index, index + 30 > ids.length ? ids.length : index + 30),
      );
    }
    final snapshots = await Future.wait(
      chunks.map(
        (chunk) => _firestore
            .collection('publishedContent')
            .where(FieldPath.documentId, whereIn: chunk)
            .get(),
      ),
    );
    final byId = <String, PublishedReel>{};
    for (final snapshot in snapshots) {
      for (final doc in snapshot.docs) {
        byId[doc.id] = PublishedReel.fromDoc(doc);
      }
    }
    return ids
        .map((id) => byId[id])
        .whereType<PublishedReel>()
        .toList(growable: false);
  }

  /// A complete Collection channel, independent of Explore's newest-30 feed.
  Stream<List<PublishedReel>> watchCollection(String collectionKind) =>
      _firestore
          .collection('publishedContent')
          .where('publicationStatus', isEqualTo: 'published')
          .where('collectionKind', isEqualTo: collectionKind)
          .orderBy('publishedAt', descending: true)
          .snapshots()
          .map(
            (snapshot) => snapshot.docs
                .map(PublishedReel.fromDoc)
                .toList(growable: false),
          );
}

final publishedContentRepositoryProvider =
    Provider<PublishedContentRepository?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return PublishedContentRepository(FirebaseFirestore.instance);
    });

/// The live Explore feed of real, published TribeStudio content. Empty when
/// nothing is published yet; the UI falls back to a curated preview in that case.
final publishedReelsProvider = StreamProvider<List<PublishedReel>>((ref) {
  final repository = ref.watch(publishedContentRepositoryProvider);
  if (repository == null) return Stream.value(const <PublishedReel>[]);
  return repository.watchFeed();
});

/// Everything one creator has published — the body of their creator page.
final creatorWorksProvider = StreamProvider.family<List<PublishedReel>, String>(
  (ref, creatorId) {
    final repository = ref.watch(publishedContentRepositoryProvider);
    if (repository == null || creatorId.isEmpty) {
      return Stream.value(const <PublishedReel>[]);
    }
    return repository.watchCreatorWorks(creatorId);
  },
);
