import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';

/// An in-memory stand-in for [CommunityRepository].
///
/// Only the reads and toggles the screens actually perform are implemented;
/// `noSuchMethod` turns any other call into a loud failure so a test can never
/// silently pass against an unimplemented path.
class FakeCommunityRepository implements CommunityRepository {
  FakeCommunityRepository({
    List<CommunityProfile> profiles = const [],
    List<CommunityPost> posts = const [],
    Set<String> likedPostIds = const {},
    Set<String> savedPostIds = const {},
    Set<String> repostedPostIds = const {},
    Map<String, String> pollVotes = const {},
    List<String> following = const [],
    this.feedError,
  }) : _profiles = {for (final profile in profiles) profile.uid: profile},
       _posts = [...posts],
       _liked = {...likedPostIds},
       _saved = {...savedPostIds},
       _reposted = {...repostedPostIds},
       _pollVotes = {...pollVotes},
       _following = [...following];

  final Map<String, CommunityProfile> _profiles;
  final List<CommunityPost> _posts;
  final Set<String> _liked;
  final Set<String> _saved;
  final Set<String> _reposted;
  final Map<String, String> _pollVotes;
  final List<String> _following;

  /// When set, `watchFeed` fails with it instead of emitting — the feed as a
  /// member meets it when a collection's rule has not been deployed.
  final Object? feedError;

  /// Calls recorded for assertions.
  final toggledLikes = <String>[];
  final toggledSaves = <String>[];
  final toggledFollows = <String>[];
  final toggledReposts = <String>[];
  final recordedVotes = <(String, String)>[];
  final trackedViews = <String>[];

  List<CommunityPost> get _topLevel =>
      _posts.where((post) => !post.isReply).toList(growable: false);

  @override
  Stream<List<CommunityPost>> watchFeed({int limit = 40}) {
    final error = feedError;
    return error == null
        ? Stream.value(_topLevel)
        : Stream<List<CommunityPost>>.error(error);
  }

  @override
  Stream<List<CommunityPost>> watchFollowingFeed(
    List<String> authorIds, {
    int limit = 40,
  }) => Stream.value(
    _topLevel
        .where((post) => authorIds.contains(post.authorId))
        .toList(growable: false),
  );

  @override
  Stream<List<CommunityPost>> watchAuthorPosts(String uid, {int limit = 40}) =>
      Stream.value(
        _topLevel.where((post) => post.authorId == uid).toList(growable: false),
      );

  @override
  Stream<List<CommunityPost>> watchAuthorReplies(
    String uid, {
    int limit = 40,
  }) => Stream.value(
    _posts
        .where((post) => post.isReply && post.authorId == uid)
        .toList(growable: false),
  );

  @override
  Stream<List<CommunityPost>> watchAuthorMedia(String uid, {int limit = 40}) =>
      Stream.value(
        _posts
            .where((post) => post.hasMedia && post.authorId == uid)
            .toList(growable: false),
      );

  @override
  Stream<List<CommunityPost>> watchReplies(String postId) => Stream.value(
    _posts.where((post) => post.parentId == postId).toList(growable: false),
  );

  @override
  Stream<CommunityPost?> watchPost(String postId) =>
      Stream.value(_posts.where((post) => post.id == postId).firstOrNull);

  @override
  Future<List<CommunityPost>> postsByIds(List<String> ids) async => ids
      .map((id) => _posts.where((post) => post.id == id).firstOrNull)
      .whereType<CommunityPost>()
      .toList(growable: false);

  @override
  Stream<CommunityProfile?> watchProfile(String uid) =>
      Stream.value(_profiles[uid]);

  @override
  Future<CommunityProfile?> getProfile(String uid) async => _profiles[uid];

  @override
  Future<List<CommunityProfile>> suggestedProfiles({int limit = 12}) async =>
      _profiles.values.toList(growable: false);

  @override
  Future<List<CommunityProfile>> searchProfiles(String query) async {
    final term = query.trim().toLowerCase();
    return _profiles.values
        .where(
          (profile) =>
              profile.username.startsWith(term) ||
              profile.displayName.toLowerCase().startsWith(term),
        )
        .toList(growable: false);
  }

  @override
  Future<List<CommunityProfile>> profilesByIds(List<String> ids) async => ids
      .map((id) => _profiles[id])
      .whereType<CommunityProfile>()
      .toList(growable: false);

  @override
  Future<({int followers, int following, int posts})> profileCounts(
    String uid,
  ) async => (
    followers: 12,
    following: _following.length,
    posts: _topLevel.where((post) => post.authorId == uid).length,
  );

  @override
  Stream<List<String>> watchFollowing(String uid) => Stream.value(_following);

  @override
  Future<List<String>> followerIds(String uid, {int limit = 300}) async =>
      _profiles.keys.where((id) => id != uid).toList(growable: false);

  @override
  Future<List<String>> followingIds(String uid, {int limit = 300}) async =>
      _following;

  @override
  Stream<Set<String>> watchMyLikes(String uid) => Stream.value(_liked);

  @override
  Stream<Set<String>> watchMyBookmarks(String uid) => Stream.value(_saved);

  @override
  Stream<Set<String>> watchMyReposts(String uid) => Stream.value(_reposted);

  @override
  Stream<Map<String, String>> watchMyPollVotes(String uid) =>
      Stream.value(_pollVotes);

  @override
  Stream<Set<String>> watchMyHiddenPosts(String uid) => Stream.value(const {});

  @override
  Stream<Set<String>> watchMyMutes(String uid) => Stream.value(const {});

  @override
  Stream<Set<String>> watchMyBlocks(String uid) => Stream.value(const {});

  @override
  Future<List<String>> likedPostIds(String uid, {int limit = 60}) async =>
      _liked.toList(growable: false);

  @override
  Future<List<String>> bookmarkedPostIds(String uid, {int limit = 60}) async =>
      _saved.toList(growable: false);

  @override
  Future<List<String>> pollVoterIds(String postId, {int limit = 300}) async =>
      const [];

  @override
  Future<void> toggleLike({
    required String uid,
    required String postId,
    required bool liked,
  }) async {
    toggledLikes.add(postId);
    liked ? _liked.remove(postId) : _liked.add(postId);
  }

  @override
  Future<void> toggleBookmark({
    required String uid,
    required String postId,
    required bool saved,
  }) async {
    toggledSaves.add(postId);
    saved ? _saved.remove(postId) : _saved.add(postId);
  }

  @override
  Future<void> toggleRepost({
    required CommunityProfile profile,
    required String postId,
    required bool reposted,
  }) async {
    toggledReposts.add(postId);
    reposted ? _reposted.remove(postId) : _reposted.add(postId);
  }

  @override
  Future<void> votePoll({
    required String uid,
    required String postId,
    required String optionId,
  }) async {
    recordedVotes.add((postId, optionId));
    _pollVotes[postId] = optionId;
  }

  @override
  Future<bool> trackView({required String uid, required String postId}) async {
    trackedViews.add(postId);
    return true;
  }

  @override
  Future<void> toggleFollow({
    required String followerId,
    required String targetId,
    required bool following,
  }) async {
    toggledFollows.add(targetId);
    following ? _following.remove(targetId) : _following.add(targetId);
  }

  @override
  Future<bool> isUsernameAvailable(String username) async =>
      !_profiles.values.any((profile) => profile.username == username);

  @override
  Future<void> reportPost({
    required String postId,
    required String reporterId,
    required String reason,
  }) async {}

  @override
  Future<void> deletePost(CommunityPost post) async =>
      _posts.removeWhere((item) => item.id == post.id);

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
    '${invocation.memberName} is not faked in FakeCommunityRepository',
  );
}

/// A profile fixture with predictable initials and no remote images, so widget
/// tests never reach the network.
CommunityProfile fakeProfile({
  String uid = 'amina-uid',
  String username = 'amina_paga',
  String displayName = 'Amina Ayaribisa',
  String bio = 'Kasem speaker from Paga.',
  String location = 'Paga',
  String dialect = 'Paga',
  String? avatarUrl,
}) => CommunityProfile(
  uid: uid,
  username: username,
  displayName: displayName,
  bio: bio,
  location: location,
  dialect: dialect,
  avatarUrl: avatarUrl,
  createdAt: DateTime(2026, 8, 1),
);

/// A post fixture. Media defaults to empty so nothing tries to decode an image.
CommunityPost fakePost({
  String id = 'post1',
  String authorId = 'amina-uid',
  String authorName = 'Amina Ayaribisa',
  String authorUsername = 'amina_paga',
  String text = 'De zaanem. Ko gara.',
  List<CommunityMedia> media = const [],
  int likeCount = 3,
  int replyCount = 1,
  int repostCount = 0,
  int quoteCount = 0,
  int viewCount = 0,
  CommunityPost? quotedPost,
  CommunityPoll? poll,
  String? parentId,
}) => CommunityPost(
  id: id,
  authorId: authorId,
  authorName: authorName,
  authorUsername: authorUsername,
  text: text,
  media: media,
  likeCount: likeCount,
  replyCount: replyCount,
  repostCount: repostCount,
  quoteCount: quoteCount,
  viewCount: viewCount,
  quotedPostId: quotedPost?.id,
  quotedPost: quotedPost,
  poll: poll,
  parentId: parentId,
  rootId: parentId ?? id,
  createdAt: DateTime(2026, 8, 23, 11, 30),
);

/// Wraps [child] in the app theme and a [ProviderScope] wired to [repository].
///
/// [uid] and [profile] stand in for the auth and profile streams so tests do
/// not need Firebase at all.
Widget communityHarness({
  required Widget child,
  required FakeCommunityRepository repository,
  String? uid = 'amina-uid',
  CommunityProfile? profile,
  ThemeData? theme,
}) => ProviderScope(
  overrides: [
    communityRepositoryProvider.overrideWithValue(repository),
    currentUidProvider.overrideWithValue(uid),
    currentDisplayNameProvider.overrideWithValue(profile?.displayName),
    currentPhotoUrlProvider.overrideWithValue(profile?.avatarUrl),
    myCommunityProfileProvider.overrideWith(
      (ref) => Stream<CommunityProfile?>.value(profile),
    ),
  ],
  child: MaterialApp(theme: theme ?? buildIndigenTheme(), home: child),
);
