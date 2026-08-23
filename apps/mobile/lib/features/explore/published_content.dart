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
    this.creatorAvatarUrl,
    this.mediaUrl,
    this.thumbnailUrl,
    this.mediaType,
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
  final String? creatorAvatarUrl;

  /// Public download URL of the approved media, or null while it is being
  /// processed by the publication workflow.
  final String? mediaUrl;
  final String? thumbnailUrl;

  /// 'video' | 'image' | 'audio' | 'document', when known.
  final String? mediaType;

  final String description;
  final String englishSummary;
  final String culturalNotes;
  final String category;
  final String language;
  final String dialect;
  final String licenceDisplay;
  final String? publishedAt;

  bool get isVideo => mediaType == 'video';

  /// Still image to show as the reel background / video poster.
  String? get posterUrl {
    if (thumbnailUrl != null && thumbnailUrl!.isNotEmpty) return thumbnailUrl;
    if (!isVideo && mediaUrl != null && mediaUrl!.isNotEmpty) return mediaUrl;
    return null;
  }

  /// Playable video URL, only when this piece is a video with processed media.
  String? get videoUrl =>
      (isVideo && mediaUrl != null && mediaUrl!.isNotEmpty) ? mediaUrl : null;

  static PublishedReel fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    final attribution =
        (data['creatorAttribution'] as Map<String, dynamic>?) ??
        const <String, dynamic>{};
    return PublishedReel(
      id: (data['id'] as String?) ?? doc.id,
      title: (data['title'] as String?)?.trim().isNotEmpty ?? false
          ? (data['title'] as String).trim()
          : 'Untitled',
      creatorName:
          (attribution['displayName'] as String?)?.trim().isNotEmpty ?? false
          ? (attribution['displayName'] as String).trim()
          : 'Indigen World creator',
      creatorAvatarUrl: attribution['avatarUrl'] as String?,
      mediaUrl: data['mediaUrl'] as String?,
      thumbnailUrl: data['thumbnailUrl'] as String?,
      mediaType: data['mediaType'] as String?,
      description: (data['description'] as String?) ?? '',
      englishSummary: (data['englishSummary'] as String?) ?? '',
      culturalNotes: (data['culturalNotes'] as String?) ?? '',
      category: (data['category'] as String?) ?? '',
      language: (data['language'] as String?) ?? '',
      dialect: (data['dialect'] as String?) ?? '',
      licenceDisplay: (data['licenceDisplay'] as String?) ?? '',
      publishedAt: data['publishedAt'] as String?,
    );
  }
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
