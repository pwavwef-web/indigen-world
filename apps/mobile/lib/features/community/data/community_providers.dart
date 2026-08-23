import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';

/// The community data layer, or `null` when Firebase is unavailable this
/// launch. Every consumer treats `null` as "read-only preview".
final communityRepositoryProvider = Provider<CommunityRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return CommunityRepository(
    FirebaseFirestore.instance,
    FirebaseStorage.instance,
  );
});

/// The signed-in member's auth uid, or `null` for guests.
final currentUidProvider = Provider<String?>(
  (ref) => ref.watch(authStateProvider).asData?.value?.uid,
);

/// The signed-in account's display name from Firebase Auth, used to pre-fill
/// the community profile form before a community profile exists.
final currentDisplayNameProvider = Provider<String?>(
  (ref) => ref.watch(authStateProvider).asData?.value?.displayName,
);

/// The signed-in member's community profile. `null` means either a guest, or a
/// signed-in member who has not chosen a handle yet — the community screen
/// prompts for setup in the second case.
final myCommunityProfileProvider = StreamProvider<CommunityProfile?>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) {
    return Stream<CommunityProfile?>.value(null);
  }
  return repository.watchProfile(uid);
});

/// Any member's public profile.
final communityProfileProvider =
    StreamProvider.family<CommunityProfile?, String>((ref, uid) {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null) return Stream<CommunityProfile?>.value(null);
      return repository.watchProfile(uid);
    });

/// Followers / following / posts totals, read with aggregate `count()`.
final profileCountsProvider =
    FutureProvider.family<({int followers, int following, int posts}), String>((
      ref,
      uid,
    ) async {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null) {
        return (followers: 0, following: 0, posts: 0);
      }
      return repository.profileCounts(uid);
    });

// ── Feeds ───────────────────────────────────────────────────────────────────

final communityFeedProvider = StreamProvider<List<CommunityPost>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return Stream.value(const <CommunityPost>[]);
  return repository.watchFeed();
});

/// The uids the signed-in member follows, most recent first.
final followingIdsProvider = StreamProvider<List<String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>[]);
  return repository.watchFollowing(uid);
});

final followingFeedProvider = StreamProvider<List<CommunityPost>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final following = ref.watch(followingIdsProvider).asData?.value;
  if (repository == null || following == null || following.isEmpty) {
    return Stream.value(const <CommunityPost>[]);
  }
  return repository.watchFollowingFeed(following);
});

final authorPostsProvider = StreamProvider.family<List<CommunityPost>, String>((
  ref,
  uid,
) {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return Stream.value(const <CommunityPost>[]);
  return repository.watchAuthorPosts(uid);
});

final authorRepliesProvider =
    StreamProvider.family<List<CommunityPost>, String>((ref, uid) {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null) return Stream.value(const <CommunityPost>[]);
      return repository.watchAuthorReplies(uid);
    });

final authorMediaProvider = StreamProvider.family<List<CommunityPost>, String>((
  ref,
  uid,
) {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return Stream.value(const <CommunityPost>[]);
  return repository.watchAuthorMedia(uid);
});

final authorLikesProvider = FutureProvider.family<List<CommunityPost>, String>((
  ref,
  uid,
) async {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return const <CommunityPost>[];
  return repository.postsByIds(await repository.likedPostIds(uid));
});

final postProvider = StreamProvider.family<CommunityPost?, String>((
  ref,
  postId,
) {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return Stream<CommunityPost?>.value(null);
  return repository.watchPost(postId);
});

final repliesProvider = StreamProvider.family<List<CommunityPost>, String>((
  ref,
  postId,
) {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return Stream.value(const <CommunityPost>[]);
  return repository.watchReplies(postId);
});

// ── Engagement ──────────────────────────────────────────────────────────────

final myLikesProvider = StreamProvider<Set<String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>{});
  return repository.watchMyLikes(uid);
});

final myBookmarksProvider = StreamProvider<Set<String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>{});
  return repository.watchMyBookmarks(uid);
});

final savedPostsProvider = FutureProvider<List<CommunityPost>>((ref) async {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return const <CommunityPost>[];
  // Re-run whenever the saved set changes so the tab stays live.
  ref.watch(myBookmarksProvider);
  return repository.postsByIds(await repository.bookmarkedPostIds(uid));
});

// ── People ──────────────────────────────────────────────────────────────────

final suggestedProfilesProvider = FutureProvider<List<CommunityProfile>>((
  ref,
) async {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return const <CommunityProfile>[];
  return repository.suggestedProfiles();
});

final profileSearchProvider = FutureProvider.autoDispose
    .family<List<CommunityProfile>, String>((ref, query) async {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null || query.trim().length < 2) {
        return const <CommunityProfile>[];
      }
      return repository.searchProfiles(query);
    });

final followersListProvider = FutureProvider.autoDispose
    .family<List<CommunityProfile>, String>((ref, uid) async {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null) return const <CommunityProfile>[];
      return repository.profilesByIds(await repository.followerIds(uid));
    });

final followingListProvider = FutureProvider.autoDispose
    .family<List<CommunityProfile>, String>((ref, uid) async {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null) return const <CommunityProfile>[];
      return repository.profilesByIds(await repository.followingIds(uid));
    });
