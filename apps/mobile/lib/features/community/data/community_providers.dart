import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart' show exploreWindowProvider;

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

/// Firebase Auth photos (Google/Apple/custom auth) seed a new community
/// profile. Keeping this separate from the display-name provider also makes the
/// setup flow straightforward to override in tests.
final currentPhotoUrlProvider = Provider<String?>(
  (ref) => ref.watch(authStateProvider).asData?.value?.photoURL,
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

final rawCommunityFeedProvider = StreamProvider<List<CommunityPost>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return Stream.value(const <CommunityPost>[]);
  // Explore's window widens as somebody scrolls, and community video is one of
  // the two things it is made of — so the same window has to reach the query
  // that supplies it, or the feed would stop growing halfway down.
  return repository.watchFeed(limit: ref.watch(communityFeedWindowProvider));
});

/// How many posts the community feed holds.
///
/// Shared with Explore, whose infinite scroll widens it. The Community tab
/// reads whatever it happens to be, which is never smaller than its own page.
final communityFeedWindowProvider = Provider<int>((ref) {
  final window = ref.watch(exploreWindowProvider);
  return window < CommunityRepository.feedPageSize
      ? CommunityRepository.feedPageSize
      : window;
});

/// Applies a member's hide / mute / block lists to a feed without throwing away
/// the state the feed arrived in.
///
/// `AsyncValue.whenData` cannot be used here, and that mattered: it maps
/// anything that is not `AsyncData` to a *fresh* `AsyncLoading`, so a feed that
/// had failed came out the other side as a plain loading state with its error
/// erased. The screen then had nothing to show but the skeleton, and because
/// Riverpod retries a failed provider the feed flickered between skeleton and
/// error instead of settling on either.
///
/// Precedence is deliberate and matches what the screen wants: a page we
/// already hold beats an error, and an error beats a spinner.
AsyncValue<List<CommunityPost>> _visibleFeed(
  AsyncValue<List<CommunityPost>> raw, {
  required Set<String> hidden,
  required Set<String> muted,
  required Set<String> blocked,
}) {
  bool visible(CommunityPost post) =>
      !hidden.contains(post.id) &&
      !muted.contains(post.authorId) &&
      !blocked.contains(post.authorId) &&
      (post.resharedById == null ||
          (!muted.contains(post.resharedById) &&
              !blocked.contains(post.resharedById)));

  final posts = raw.value;
  if (posts != null) {
    return AsyncData(posts.where(visible).toList(growable: false));
  }
  final error = raw.error;
  if (error != null) {
    return AsyncError(error, raw.stackTrace ?? StackTrace.empty);
  }
  return const AsyncLoading();
}

final communityFeedProvider = Provider<AsyncValue<List<CommunityPost>>>((ref) {
  final hidden =
      ref.watch(myHiddenPostsProvider).asData?.value ?? const <String>{};
  final muted =
      ref.watch(myMutedProfilesProvider).asData?.value ?? const <String>{};
  final blocked =
      ref.watch(myBlockedProfilesProvider).asData?.value ?? const <String>{};
  return _visibleFeed(
    ref.watch(rawCommunityFeedProvider),
    hidden: hidden,
    muted: muted,
    blocked: blocked,
  );
});

/// The uids the signed-in member follows, most recent first.
final followingIdsProvider = StreamProvider<List<String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>[]);
  return repository.watchFollowing(uid);
});

final rawFollowingFeedProvider = StreamProvider<List<CommunityPost>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final following = ref.watch(followingIdsProvider).asData?.value;
  if (repository == null || following == null || following.isEmpty) {
    return Stream.value(const <CommunityPost>[]);
  }
  return repository.watchFollowingFeed(
    following,
    limit: ref.watch(communityFeedWindowProvider),
  );
});

final followingFeedProvider = Provider<AsyncValue<List<CommunityPost>>>((ref) {
  final hidden =
      ref.watch(myHiddenPostsProvider).asData?.value ?? const <String>{};
  final muted =
      ref.watch(myMutedProfilesProvider).asData?.value ?? const <String>{};
  final blocked =
      ref.watch(myBlockedProfilesProvider).asData?.value ?? const <String>{};
  return _visibleFeed(
    ref.watch(rawFollowingFeedProvider),
    hidden: hidden,
    muted: muted,
    blocked: blocked,
  );
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

final myRepostsProvider = StreamProvider<Set<String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>{});
  return repository.watchMyReposts(uid);
});

final myPollVotesProvider = StreamProvider<Map<String, String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) {
    return Stream.value(const <String, String>{});
  }
  return repository.watchMyPollVotes(uid);
});

final myHiddenPostsProvider = StreamProvider<Set<String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>{});
  return repository.watchMyHiddenPosts(uid);
});

final myMutedProfilesProvider = StreamProvider<Set<String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>{});
  return repository.watchMyMutes(uid);
});

final myBlockedProfilesProvider = StreamProvider<Set<String>>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(const <String>{});
  return repository.watchMyBlocks(uid);
});

enum CommunityEngagementKind { views, appreciations, pollVotes }

typedef CommunityEngagementRequest = ({
  String postId,
  CommunityEngagementKind kind,
});

final postEngagementProfilesProvider = FutureProvider.autoDispose
    .family<List<CommunityProfile>, CommunityEngagementRequest>((
      ref,
      request,
    ) async {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null) return const <CommunityProfile>[];
      final ids = request.kind == CommunityEngagementKind.views
          ? await repository.viewerIds(request.postId)
          : request.kind == CommunityEngagementKind.appreciations
          ? await repository.likerIds(request.postId)
          : await repository.pollVoterIds(request.postId);
      return repository.profilesByIds(ids);
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
