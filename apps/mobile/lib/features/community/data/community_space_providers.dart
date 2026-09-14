import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_prompt.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_repository.dart';
import 'package:indigen_world_mobile/features/community/data/feed_discovery.dart';

/// The sub-community data layer, or null when Firebase is unavailable.
final communitySpaceRepositoryProvider = Provider<CommunitySpaceRepository?>((
  ref,
) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return CommunitySpaceRepository(
    FirebaseFirestore.instance,
    FirebaseStorage.instance,
  );
});

/// One community, live. Null once it has been deleted.
final communitySpaceProvider = StreamProvider.family<CommunitySpace?, String>((
  ref,
  id,
) {
  final repository = ref.watch(communitySpaceRepositoryProvider);
  if (repository == null) return Stream<CommunitySpace?>.value(null);
  return repository.watchCommunity(id);
});

/// Every membership row the signed-in member holds, joined or pending.
final myMembershipsProvider = StreamProvider<List<CommunityMembership>>((ref) {
  final repository = ref.watch(communitySpaceRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) {
    return Stream.value(const <CommunityMembership>[]);
  }
  return repository.watchMyMemberships(uid);
});

/// The signed-in member's row in one community, or null when there is none.
final myMembershipProvider =
    StreamProvider.family<CommunityMembership?, String>((ref, communityId) {
      final repository = ref.watch(communitySpaceRepositoryProvider);
      final uid = ref.watch(currentUidProvider);
      if (repository == null || uid == null) {
        return Stream<CommunityMembership?>.value(null);
      }
      return repository.watchMembership(communityId, uid);
    });

/// Where the reader stands with one community, resolved from the community
/// and their membership. Loading while either is still arriving.
final communityAccessProvider =
    Provider.family<AsyncValue<CommunityAccess>, String>((ref, communityId) {
      final space = ref.watch(communitySpaceProvider(communityId));
      final membership = ref.watch(myMembershipProvider(communityId));
      final uid = ref.watch(currentUidProvider);
      if (space.hasError && !space.hasValue) {
        return AsyncError(space.error!, space.stackTrace ?? StackTrace.empty);
      }
      if (!space.hasValue || (uid != null && !membership.hasValue)) {
        return const AsyncLoading();
      }
      return AsyncData(
        resolveCommunityAccess(
          space: space.value,
          uid: uid,
          membership: membership.asData?.value,
        ),
      );
    });

/// The communities the member has joined, in the order they joined.
final joinedCommunitiesProvider = FutureProvider<List<CommunitySpace>>((
  ref,
) async {
  final repository = ref.watch(communitySpaceRepositoryProvider);
  final memberships = await ref.watch(myMembershipsProvider.future);
  if (repository == null) return const [];
  final active = memberships.where((membership) => membership.isActive).toList()
    ..sort(
      (a, b) => (a.createdAt ?? DateTime(2000)).compareTo(
        b.createdAt ?? DateTime(2000),
      ),
    );
  final spaces = await repository.communitiesByIds([
    for (final membership in active) membership.communityId,
  ]);
  return spaces.where((space) => space.isAvailable).toList(growable: false);
});

/// The ids of communities the member has asked to join and is waiting on.
final pendingCommunityIdsProvider = Provider<Set<String>>(
  (ref) => {
    for (final membership
        in ref.watch(myMembershipsProvider).asData?.value ??
            const <CommunityMembership>[])
      if (membership.isPending) membership.communityId,
  },
);

final discoverCommunitiesProvider = FutureProvider<List<CommunitySpace>>((
  ref,
) async {
  final repository = ref.watch(communitySpaceRepositoryProvider);
  if (repository == null) return const [];
  return repository.discoverCommunities();
});

final communitySearchProvider = FutureProvider.autoDispose
    .family<List<CommunitySpace>, String>((ref, query) async {
      final repository = ref.watch(communitySpaceRepositoryProvider);
      if (repository == null || communityQueryWords(query).isEmpty) {
        return const [];
      }
      return repository.searchCommunities(query);
    });

final communityMembersProvider = StreamProvider.autoDispose
    .family<List<CommunityMembership>, String>((ref, communityId) {
      final repository = ref.watch(communitySpaceRepositoryProvider);
      if (repository == null) {
        return Stream.value(const <CommunityMembership>[]);
      }
      return repository.watchMembers(communityId);
    });

/// Profiles for a set of member uids — sorted and comma-joined, so the same
/// people are one cache entry — fetched in one batched read.
final memberProfilesProvider = FutureProvider.autoDispose
    .family<Map<String, CommunityProfile>, String>((ref, joinedIds) async {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null || joinedIds.isEmpty) return const {};
      final profiles = await repository.profilesByIds(joinedIds.split(','));
      return {for (final profile in profiles) profile.uid: profile};
    });

/// Requests waiting on a moderator. Only ever watched by one.
final communityRequestsProvider = StreamProvider.autoDispose
    .family<List<CommunityMembership>, String>((ref, communityId) {
      final repository = ref.watch(communitySpaceRepositoryProvider);
      if (repository == null) {
        return Stream.value(const <CommunityMembership>[]);
      }
      return repository.watchMembers(
        communityId,
        status: MembershipStatus.pending,
      );
    });

// ── Community feeds ─────────────────────────────────────────────────────────

/// A community's own feed, live and widened as the reader scrolls.
final rawCommunitySpaceFeedProvider =
    StreamProvider.family<List<CommunityPost>, String>((ref, communityId) {
      final repository = ref.watch(communityRepositoryProvider);
      // Selected down to the two facts the query depends on. The community
      // document changes every time somebody joins, and re-opening the feed's
      // listener on every member count would be a round trip per join.
      final shape = ref.watch(
        communitySpaceProvider(communityId).select(
          (value) => switch (value.asData?.value) {
            final space? when space.isAvailable => (
              open: true,
              private: space.isPrivate,
            ),
            _ => (open: false, private: false),
          },
        ),
      );
      if (repository == null || !shape.open) {
        return Stream.value(const <CommunityPost>[]);
      }
      if (shape.private) {
        // Asking before membership is known would be refused by the rules and
        // surface as an error instead of the locked state it really is.
        final member = ref.watch(
          myMembershipProvider(communityId)
              .select((value) => value.asData?.value?.isActive ?? false),
        );
        if (!member) return Stream.value(const <CommunityPost>[]);
      }
      return repository.watchCommunityPosts(
        communityId,
        isPrivate: shape.private,
        limit: ref.watch(communityFeedWindowsProvider(communityId)),
      );
    });

final communitySpaceFeedProvider =
    Provider.family<AsyncValue<List<CommunityPost>>, String>((
      ref,
      communityId,
    ) {
      return visibleCommunityFeed(
        ref.watch(rawCommunitySpaceFeedProvider(communityId)),
        hidden:
            ref.watch(myHiddenPostsProvider).asData?.value ?? const <String>{},
        muted:
            ref.watch(myMutedProfilesProvider).asData?.value ??
            const <String>{},
        blocked:
            ref.watch(myBlockedProfilesProvider).asData?.value ??
            const <String>{},
      );
    });

// ── Daily prompt ────────────────────────────────────────────────────────────

/// The prompt published for [scope] — [kHomeFeedPromptScope] or a community's
/// slug — or null when none is live and the built-in invitation should show.
final communityPromptProvider = StreamProvider.family<CommunityPrompt?, String>(
  (ref, scope) {
    if (!ref.watch(firebaseReadyProvider)) {
      return Stream<CommunityPrompt?>.value(null);
    }
    return FirebaseFirestore.instance
        .collection('communityPrompts')
        .doc(scope)
        .snapshots()
        .map(
          (doc) => doc.exists
              ? CommunityPrompt.fromMap(doc.id, doc.data() ?? const {})
              : null,
        )
        // A prompt is an invitation, never a reason to show an error: an
        // undeployed rule reads as "no prompt today".
        .handleError((Object _) {});
  },
);

// ── New voices ──────────────────────────────────────────────────────────────

/// Whether the New voices module has already been shown this session.
///
/// Held by the app, not the screen, so a member who has scrolled past it once
/// is not offered the same strangers again every time the feed rebuilds.
class NewVoicesSeen extends Notifier<bool> {
  @override
  bool build() => false;

  void markSeen() {
    if (!state) state = true;
  }
}

final newVoicesSeenProvider = NotifierProvider<NewVoicesSeen, bool>(
  NewVoicesSeen.new,
);

/// Ranked people to follow for the discovery module. Empty — and the module
/// omitted — whenever nothing worth suggesting comes back.
final voiceSuggestionsProvider = FutureProvider<List<VoiceSuggestion>>((
  ref,
) async {
  final repository = ref.watch(communityRepositoryProvider);
  final spaces = ref.watch(communitySpaceRepositoryProvider);
  if (repository == null) return const [];
  final uid = ref.watch(currentUidProvider);
  // Read, not watched. Following somebody from the module must not recompute
  // it: the card they just followed would vanish under their thumb, and every
  // tap would cost a fresh round of profile reads.
  final me = ref.read(myCommunityProfileProvider).asData?.value;
  // Listened to, so the stream stays alive long enough to answer the read
  // below; a listener, unlike a watch, never recomputes this provider.
  ref
    ..listen(followingIdsProvider, (_, _) {})
    ..listen(myMembershipsProvider, (_, _) {});
  final following = <String>{};
  try {
    following.addAll(
      await ref
          .read(followingIdsProvider.future)
          .timeout(const Duration(seconds: 5)),
    );
  } on Object {
    // Unknown follows only risk suggesting somebody already followed.
  }
  final excluded = {
    ...?ref.read(myMutedProfilesProvider).asData?.value,
    ...?ref.read(myBlockedProfilesProvider).asData?.value,
  };
  final feed =
      ref.read(communityFeedProvider).asData?.value ?? const <CommunityPost>[];
  final activeAuthors = {for (final post in feed.take(40)) post.authorId};

  final newest = await repository.suggestedProfiles(limit: 30);
  final knownIds = {for (final profile in newest) profile.uid};
  final extraIds = [
    for (final id in activeAuthors)
      if (!knownIds.contains(id) && id != uid && !following.contains(id)) id,
  ].take(20).toList(growable: false);
  final active = await repository.profilesByIds(extraIds);

  // Members of communities the reader joined, when there are any — the
  // strongest signal we have that two people would want to read each other.
  var peers = const <String>{};
  if (spaces != null && uid != null) {
    try {
      final memberships = await ref
          .read(myMembershipsProvider.future)
          .timeout(const Duration(seconds: 5));
      final joined = [
        for (final membership in memberships)
          if (membership.isActive) membership.communityId,
      ].take(3);
      final rows = await Future.wait([
        for (final id in joined) spaces.watchMembers(id, limit: 30).first,
      ]);
      peers = {
        for (final members in rows)
          for (final member in members) member.uid,
      };
    } on Object {
      // Recommendations degrade to newest and most active; never an error.
    }
  }
  final peerProfiles = await repository.profilesByIds(
    peers
        .where((id) => !knownIds.contains(id) && !extraIds.contains(id))
        .take(20)
        .toList(growable: false),
  );

  return rankVoiceSuggestions(
    candidates: [...newest, ...active, ...peerProfiles],
    viewerUid: uid,
    following: following,
    excluded: excluded,
    viewerDialect: me?.dialect ?? '',
    viewerLocation: me?.location ?? '',
    communityPeers: peers,
    activeAuthors: activeAuthors,
  );
});

// ── Optimistic engagement ───────────────────────────────────────────────────

/// Likes and follows the member has tapped whose writes have not settled yet.
///
/// The screen draws these ahead of the server. `CommunityActions` clears an
/// entry as soon as its write settles either way: on success the live stream
/// already carries the change (Firestore applies a local write to its own
/// listeners before the server confirms it), and on failure clearing it *is*
/// the rollback, with a message saying so.
class OptimisticEngagement extends Notifier<OptimisticState> {
  @override
  OptimisticState build() => const OptimisticState();

  void setLike(String postId, bool liked) =>
      state = state.copyWith(likes: {...state.likes, postId: liked});

  void clearLike(String postId) =>
      state = state.copyWith(likes: {...state.likes}..remove(postId));

  void setFollow(String uid, bool following) =>
      state = state.copyWith(follows: {...state.follows, uid: following});

  void clearFollow(String uid) =>
      state = state.copyWith(follows: {...state.follows}..remove(uid));
}

class OptimisticState {
  const OptimisticState({
    this.likes = const <String, bool>{},
    this.follows = const <String, bool>{},
  });

  final Map<String, bool> likes;
  final Map<String, bool> follows;

  OptimisticState copyWith({
    Map<String, bool>? likes,
    Map<String, bool>? follows,
  }) => OptimisticState(
    likes: likes ?? this.likes,
    follows: follows ?? this.follows,
  );

  /// Whether [postId] should draw as appreciated, given what the server says.
  bool liked(String postId, {required bool server}) => likes[postId] ?? server;

  /// [post] with its total moved to match a pending tap, if there is one.
  CommunityPost adjust(CommunityPost post, {required bool serverLiked}) {
    final pending = likes[post.id];
    if (pending == null || pending == serverLiked) return post;
    return post.withLikeCount(post.likeCount + (pending ? 1 : -1));
  }

  bool following(String uid, {required bool server}) => follows[uid] ?? server;
}

final optimisticEngagementProvider =
    NotifierProvider<OptimisticEngagement, OptimisticState>(
      OptimisticEngagement.new,
    );
