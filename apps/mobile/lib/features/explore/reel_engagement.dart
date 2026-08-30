import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

/// One reply on a published Explore reel.
class ReelComment {
  const ReelComment({
    required this.id,
    required this.reelId,
    required this.authorId,
    required this.authorName,
    required this.authorUsername,
    required this.text,
    this.authorAvatarUrl,
    this.createdAt,
  });

  final String id;
  final String reelId;
  final String authorId;
  final String authorName;
  final String authorUsername;
  final String? authorAvatarUrl;
  final String text;
  final DateTime? createdAt;

  String get handle => '@$authorUsername';

  String get initials {
    final source = authorName.trim();
    if (source.isEmpty) return '·';
    final parts = source.split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }

  static ReelComment? fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final reelId = data['reelId'];
    final text = data['text'];
    if (reelId is! String || reelId.isEmpty || text is! String) return null;
    final rawAuthor = data['author'];
    final author = rawAuthor is Map
        ? rawAuthor.map((key, value) => MapEntry(key.toString(), value))
        : const <String, dynamic>{};
    final avatar = author['avatarUrl'];
    return ReelComment(
      id: doc.id,
      reelId: reelId,
      authorId: (data['authorId'] as String?) ?? '',
      authorName: (author['displayName'] as String?)?.trim().isNotEmpty ?? false
          ? (author['displayName'] as String).trim()
          : 'Community member',
      authorUsername: (author['username'] as String?) ?? 'member',
      authorAvatarUrl: avatar is String && avatar.isNotEmpty ? avatar : null,
      text: text,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

/// The public totals under a reel's action rail.
typedef ReelCounts = ({int likes, int comments, int views});

const ReelCounts emptyReelCounts = (likes: 0, comments: 0, views: 0);

/// Appreciations, saves, impressions and replies on published Explore reels.
///
/// Modelled on the community feed's flat, edge-keyed collections so a member
/// only ever writes documents they own:
///
///   * `reelLikes/{uid}_{reelId}`     — appreciation edges, world-readable
///   * `reelSaves/{uid}_{reelId}`     — private keeps
///   * `reelViews/{uid}_{reelId}`     — one impression per member per reel
///   * `reelComments/{commentId}`     — the reply thread
///
/// Totals are read with aggregate `count()` queries rather than denormalised
/// counters, exactly as follower and post totals already are, so nothing here
/// needs write access to a document somebody else owns — and a count can never
/// drift away from the edges it is supposed to describe.
///
/// This replaces a device-local `reel:`/`reel-appreciated:` key store. That
/// store was why an appreciation vanished when the app was reinstalled or the
/// member signed in on a second phone: it never left the handset, and there
/// was no shared number for it to be part of.
class ReelEngagementRepository {
  const ReelEngagementRepository(this._firestore);

  final FirebaseFirestore _firestore;

  static const maxCommentLength = 400;
  static const commentPageSize = 60;

  CollectionReference<Map<String, dynamic>> get _likes =>
      _firestore.collection('reelLikes');
  CollectionReference<Map<String, dynamic>> get _saves =>
      _firestore.collection('reelSaves');
  CollectionReference<Map<String, dynamic>> get _views =>
      _firestore.collection('reelViews');
  CollectionReference<Map<String, dynamic>> get _comments =>
      _firestore.collection('reelComments');

  static String edgeId(String uid, String reelId) => '${uid}_$reelId';

  // ── The member's own state ────────────────────────────────────────────────

  Stream<Set<String>> watchMyLikes(String uid) => _likes
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['reelId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toSet(),
      );

  Stream<Set<String>> watchMySaves(String uid) => _saves
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['reelId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toSet(),
      );

  Future<void> setLiked({
    required String uid,
    required String reelId,
    required bool liked,
  }) {
    final edge = _likes.doc(edgeId(uid, reelId));
    return liked
        ? edge.set({
            'uid': uid,
            'reelId': reelId,
            'createdAt': FieldValue.serverTimestamp(),
          })
        : edge.delete();
  }

  Future<void> setSaved({
    required String uid,
    required String reelId,
    required bool saved,
  }) {
    final edge = _saves.doc(edgeId(uid, reelId));
    return saved
        ? edge.set({
            'uid': uid,
            'reelId': reelId,
            'createdAt': FieldValue.serverTimestamp(),
          })
        : edge.delete();
  }

  /// Records that [uid] watched [reelId]. The edge id makes this idempotent,
  /// so a member who scrolls back to a reel is still one view.
  Future<void> trackView({required String uid, required String reelId}) =>
      _views.doc(edgeId(uid, reelId)).set({
        'viewerId': uid,
        'reelId': reelId,
        'createdAt': FieldValue.serverTimestamp(),
      });

  Future<List<String>> savedReelIds(String uid, {int limit = 200}) async {
    final snapshot = await _saves
        .where('uid', isEqualTo: uid)
        .limit(limit)
        .get();
    return snapshot.docs
        .map((doc) => (doc.data()['reelId'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  // ── Public totals ─────────────────────────────────────────────────────────

  /// Appreciations, replies and unique viewers for one reel.
  ///
  /// Each total is asked for and *fails* on its own. They used to share one
  /// `Future.wait`, which meant any single rejection took the other two down
  /// with it — and one of them is always rejected: `reelViews` is readable
  /// only by the viewer who wrote the row, so an aggregate over a whole reel
  /// is a query the rules cannot approve. The visible symptom was a reel
  /// showing `0` appreciations and `0` replies underneath a heart the member
  /// had just filled in and a conversation plainly happening.
  ///
  /// Views stay private and stay best-effort. A number nobody is allowed to
  /// compute is not worth blanking the two that everybody is.
  Future<ReelCounts> counts(String reelId) async {
    final results = await Future.wait([
      _countOf(_likes, reelId),
      _countOf(_comments, reelId),
      _countOf(_views, reelId),
    ]);
    return (likes: results[0], comments: results[1], views: results[2]);
  }

  /// One aggregate count, or zero if the query is refused or unreachable.
  Future<int> _countOf(
    CollectionReference<Map<String, dynamic>> collection,
    String reelId,
  ) async {
    try {
      final snapshot = await collection
          .where('reelId', isEqualTo: reelId)
          .count()
          .get();
      return snapshot.count ?? 0;
    } on Object {
      return 0;
    }
  }

  // ── Replies ───────────────────────────────────────────────────────────────

  Stream<List<ReelComment>> watchComments(String reelId) => _comments
      .where('reelId', isEqualTo: reelId)
      .orderBy('createdAt', descending: true)
      .limit(commentPageSize)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map(ReelComment.fromDoc)
            .whereType<ReelComment>()
            .toList(growable: false),
      );

  Future<void> addComment({
    required CommunityProfile author,
    required String reelId,
    required String text,
  }) async {
    final body = text.trim();
    if (body.isEmpty) return;
    await _comments.add({
      'reelId': reelId,
      'authorId': author.uid,
      'author': author.toAuthorStamp(),
      'text': body.length > maxCommentLength
          ? body.substring(0, maxCommentLength)
          : body,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteComment(String commentId) =>
      _comments.doc(commentId).delete();
}

final reelEngagementRepositoryProvider = Provider<ReelEngagementRepository?>((
  ref,
) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return ReelEngagementRepository(FirebaseFirestore.instance);
});

/// Reels this member has appreciated, from the server — so the state survives
/// closing the app, reinstalling it, or signing in somewhere else.
final myReelLikesProvider = StreamProvider<Set<String>>((ref) {
  final repository = ref.watch(reelEngagementRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>{});
  return repository.watchMyLikes(uid);
});

/// Reels this member has kept.
final myReelSavesProvider = StreamProvider<Set<String>>((ref) {
  final repository = ref.watch(reelEngagementRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>{});
  return repository.watchMySaves(uid);
});

/// The public totals under one reel.
///
/// Recomputed whenever this member's own appreciations change, on top of the
/// explicit invalidations callers already make. Relying on the invalidation
/// alone meant a like whose refetch was missed — a slow write, a screen rebuilt
/// from a different route — left a stale figure sitting under a filled heart.
final reelCountsProvider = FutureProvider.family<ReelCounts, String>((
  ref,
  reelId,
) async {
  final repository = ref.watch(reelEngagementRepositoryProvider);
  if (repository == null) return emptyReelCounts;
  ref.watch(myReelLikesProvider);
  try {
    return await repository.counts(reelId);
  } on Object {
    // A missing index or an offline device must not blank the action rail.
    return emptyReelCounts;
  }
});

final reelCommentsProvider = StreamProvider.family<List<ReelComment>, String>((
  ref,
  reelId,
) {
  final repository = ref.watch(reelEngagementRepositoryProvider);
  if (repository == null) return Stream.value(const <ReelComment>[]);
  return repository.watchComments(reelId);
});

/// The published pieces this member has kept, resolved from their save edges.
///
/// A keep used to be a device-local flag with nowhere to go and no list to
/// appear in, which made it hard to tell from doing nothing at all.
final keptReelsProvider = FutureProvider<List<PublishedReel>>((ref) async {
  final engagement = ref.watch(reelEngagementRepositoryProvider);
  final content = ref.watch(publishedContentRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (engagement == null || content == null || uid == null) {
    return const <PublishedReel>[];
  }
  // Re-run whenever the kept set changes, so the list stays live.
  ref.watch(myReelSavesProvider);
  return content.byIds(await engagement.savedReelIds(uid));
});
