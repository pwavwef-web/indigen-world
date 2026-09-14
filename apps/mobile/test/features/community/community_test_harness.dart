import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_repository.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

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
    this.likeError,
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

  /// When set, `toggleLike` fails with it — the write refused by the server.
  final Object? likeError;

  /// When set, `toggleLike` waits for it before finishing, so a test can look
  /// at the screen while the write is still in flight.
  Completer<void>? likeGate;

  /// Calls recorded for assertions.
  final createdProfiles = <CommunityProfile>[];
  final toggledLikes = <String>[];
  final toggledSaves = <String>[];
  final toggledFollows = <String>[];
  final toggledReposts = <String>[];
  final recordedVotes = <(String, String)>[];
  final trackedViews = <String>[];

  List<CommunityPost> get _topLevel =>
      _posts.where((post) => !post.isReply).toList(growable: false);

  /// Lets a test push a second page down the same stream, the way Firestore
  /// does when somebody else posts while the feed is open.
  final _feed = StreamController<List<CommunityPost>>.broadcast();

  void publish(CommunityPost post) {
    _posts.insert(0, post);
    _feed.add(_topLevel);
  }

  /// Called by tests that used [publish]; a broadcast controller left open
  /// keeps the test binding waiting.
  Future<void> closeFeed() => _feed.close();

  @override
  Stream<List<CommunityPost>> watchFeed({int limit = 40}) async* {
    final error = feedError;
    if (error != null) throw error;
    // The first page, then anything a test publishes afterwards.
    yield _topLevel;
    yield* _feed.stream;
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
  Stream<List<CommunityPost>> watchReplies(
    String postId, {
    String? privateCommunityId,
  }) => Stream.value(
    _posts.where((post) => post.parentId == postId).toList(growable: false),
  );

  @override
  Stream<CommunityPost?> watchPost(
    String postId, {
    String? privateCommunityId,
  }) => Stream.value(_posts.where((post) => post.id == postId).firstOrNull);

  @override
  Stream<List<CommunityPost>> watchCommunityPosts(
    String communityId, {
    required bool isPrivate,
    int limit = 40,
  }) => Stream.value(
    _topLevel
        .where((post) => post.community?.id == communityId)
        .toList(growable: false),
  );

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
    String? privateCommunityId,
  }) async {
    await likeGate?.future;
    final error = likeError;
    if (error != null) throw error;
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
  Future<CommunityProfile> createProfile({
    required String uid,
    required String username,
    required String displayName,
    String bio = '',
    String location = '',
    String dialect = '',
    String? avatarUrl,
    int birthMonth = 0,
    int birthDay = 0,
  }) async {
    final reason = validateUsername(username);
    if (reason != null) throw CommunityFailure(reason);
    if (!await isUsernameAvailable(username)) {
      throw const CommunityFailure('That handle is already taken.');
    }
    final profile = CommunityProfile(
      uid: uid,
      username: username,
      displayName: displayName.trim(),
      bio: bio.trim(),
      location: location.trim(),
      dialect: dialect.trim(),
      avatarUrl: avatarUrl,
      birthMonth: birthMonth,
      birthDay: birthDay,
    );
    _profiles[uid] = profile;
    createdProfiles.add(profile);
    return profile;
  }

  @override
  Future<void> reportPost({
    required String postId,
    required String reporterId,
    required String reason,
    String? communityId,
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
  String verifiedKind = '',
  bool phoneVerified = false,
}) => CommunityProfile(
  uid: uid,
  username: username,
  displayName: displayName,
  bio: bio,
  location: location,
  dialect: dialect,
  avatarUrl: avatarUrl,
  verifiedKind: verifiedKind,
  phoneVerified: phoneVerified,
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
  DateTime? createdAt,
  String authorVerifiedKind = '',
  bool authorPhoneVerified = false,
  PostCommunityStamp? community,
  PostCategory? category,
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
  authorVerifiedKind: authorVerifiedKind,
  authorPhoneVerified: authorPhoneVerified,
  createdAt: createdAt ?? DateTime(2026, 8, 23, 11, 30),
  community: community,
  category: category,
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
  FakeCommunitySpaceRepository? spaces,
  ThemeData? theme,

  /// Pins the reading language. Null lets the harness follow the test
  /// platform's locale, which is what the app itself does.
  Locale? locale,
}) => ProviderScope(
  overrides: [
    communityRepositoryProvider.overrideWithValue(repository),
    currentUidProvider.overrideWithValue(uid),
    currentDisplayNameProvider.overrideWithValue(profile?.displayName),
    currentPhotoUrlProvider.overrideWithValue(profile?.avatarUrl),
    myCommunityProfileProvider.overrideWith(
      (ref) => Stream<CommunityProfile?>.value(profile),
    ),
    communitySpaceRepositoryProvider.overrideWithValue(spaces),
  ],
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    locale: locale,
    theme: theme ?? buildIndigenTheme(),
    home: child,
  ),
);

/// An in-memory stand-in for [CommunitySpaceRepository], with live streams so a
/// join or a request shows on screen the way Firestore's local write would.
class FakeCommunitySpaceRepository implements CommunitySpaceRepository {
  FakeCommunitySpaceRepository({
    List<CommunitySpace> communities = const [],
    List<CommunityMembership> memberships = const [],
    this.takenSlugs = const {},
  }) : _communities = {for (final space in communities) space.id: space},
       _memberships = [...memberships];

  final Map<String, CommunitySpace> _communities;
  final List<CommunityMembership> _memberships;

  /// Addresses [isSlugAvailable] reports as taken on top of the communities
  /// already held.
  final Set<String> takenSlugs;

  final joined = <String>[];
  final left = <String>[];
  final created = <CommunityDraft>[];
  final reported = <String>[];

  final _changes = StreamController<void>.broadcast();

  void _changed() => _changes.add(null);

  Stream<T> _live<T>(T Function() read) async* {
    yield read();
    yield* _changes.stream.map((_) => read());
  }

  @override
  Stream<CommunitySpace?> watchCommunity(String id) =>
      _live(() => _communities[id]);

  @override
  Future<CommunitySpace?> getCommunity(String id) async => _communities[id];

  @override
  Future<bool> isSlugAvailable(String slug) async =>
      !_communities.containsKey(slug) && !takenSlugs.contains(slug);

  @override
  Future<List<CommunitySpace>> discoverCommunities({int limit = 30}) async =>
      _communities.values.toList(growable: false);

  @override
  Future<List<CommunitySpace>> searchCommunities(String query) async =>
      _communities.values
          .where((space) => communityMatchesQuery(space, query))
          .toList(growable: false);

  @override
  Future<List<CommunitySpace>> communitiesByIds(List<String> ids) async => [
    for (final id in ids) ?_communities[id],
  ];

  @override
  Stream<List<CommunityMembership>> watchMyMemberships(String uid) => _live(
    () => _memberships
        .where((membership) => membership.uid == uid)
        .toList(growable: false),
  );

  @override
  Stream<CommunityMembership?> watchMembership(
    String communityId,
    String uid,
  ) => _live(
    () => _memberships
        .where(
          (membership) =>
              membership.communityId == communityId && membership.uid == uid,
        )
        .firstOrNull,
  );

  @override
  Stream<List<CommunityMembership>> watchMembers(
    String communityId, {
    MembershipStatus status = MembershipStatus.active,
    int limit = 100,
  }) => _live(
    () => _memberships
        .where(
          (membership) =>
              membership.communityId == communityId &&
              membership.status == status,
        )
        .toList(growable: false),
  );

  @override
  Future<CommunitySpace> createCommunity({
    required CommunityProfile owner,
    required CommunityDraft draft,
    PendingUpload? avatar,
    PendingUpload? cover,
  }) async {
    final reason = draft.validate();
    if (reason != null) throw CommunityFailure(reason);
    if (!await isSlugAvailable(draft.slug)) {
      throw const CommunityFailure(
        'That address is already taken. Try another.',
      );
    }
    final space = CommunitySpace(
      id: draft.slug,
      name: draft.name.trim(),
      ownerId: owner.uid,
      description: draft.description.trim(),
      category: draft.category,
      language: draft.language.trim(),
      location: draft.location.trim(),
      visibility: draft.visibility,
      memberCount: 1,
      rules: draft.cleanRules,
    );
    _communities[space.id] = space;
    _memberships.add(
      CommunityMembership(
        communityId: space.id,
        uid: owner.uid,
        role: CommunityRole.owner,
        status: MembershipStatus.active,
      ),
    );
    created.add(draft);
    _changed();
    return space;
  }

  @override
  Future<MembershipStatus> join({
    required CommunitySpace space,
    required String uid,
  }) async {
    final status = space.isPrivate
        ? MembershipStatus.pending
        : MembershipStatus.active;
    _memberships.add(
      CommunityMembership(
        communityId: space.id,
        uid: uid,
        role: CommunityRole.member,
        status: status,
      ),
    );
    joined.add(space.id);
    _changed();
    return status;
  }

  @override
  Future<void> leave({
    required String communityId,
    required CommunityMembership membership,
  }) async {
    _memberships.removeWhere(
      (row) => row.communityId == communityId && row.uid == membership.uid,
    );
    left.add(communityId);
    _changed();
  }

  final approved = <String>[];
  final updated = <CommunityDraft>[];
  final transfers = <(String communityId, String newOwnerUid)>[];
  final closed = <String>[];

  CommunityMembership _withRole(CommunityMembership row, CommunityRole role) =>
      CommunityMembership(
        communityId: row.communityId,
        uid: row.uid,
        role: role,
        status: row.status,
      );

  @override
  Future<CommunitySpace> updateCommunity({
    required CommunitySpace space,
    required String editorUid,
    required CommunityDraft draft,
    PendingUpload? avatar,
    PendingUpload? cover,
    bool clearAvatar = false,
    bool clearCover = false,
  }) async {
    final reason = draft.validate();
    if (reason != null) throw CommunityFailure(reason);
    final next = CommunitySpace(
      id: space.id,
      name: draft.name.trim(),
      ownerId: space.ownerId,
      description: draft.description.trim(),
      category: draft.category,
      language: draft.language.trim(),
      location: draft.location.trim(),
      visibility: space.visibility,
      memberCount: space.memberCount,
      rules: draft.cleanRules,
      avatarUrl: clearAvatar ? null : space.avatarUrl,
      coverUrl: clearCover ? null : space.coverUrl,
    );
    _communities[space.id] = next;
    updated.add(draft);
    _changed();
    return next;
  }

  @override
  Future<void> transferOwnership({
    required String communityId,
    required String ownerUid,
    required String newOwnerUid,
  }) async {
    for (var index = 0; index < _memberships.length; index++) {
      final row = _memberships[index];
      if (row.communityId != communityId) continue;
      if (row.uid == newOwnerUid) {
        _memberships[index] = _withRole(row, CommunityRole.owner);
      } else if (row.uid == ownerUid) {
        _memberships[index] = _withRole(row, CommunityRole.admin);
      }
    }
    final space = _communities[communityId];
    if (space != null) {
      _communities[communityId] = CommunitySpace(
        id: space.id,
        name: space.name,
        ownerId: newOwnerUid,
        description: space.description,
        category: space.category,
        language: space.language,
        location: space.location,
        visibility: space.visibility,
        memberCount: space.memberCount,
        rules: space.rules,
      );
    }
    transfers.add((communityId, newOwnerUid));
    _changed();
  }

  @override
  Future<void> closeCommunity({
    required CommunitySpace space,
    required String ownerUid,
  }) async {
    if (space.memberCount > 1) {
      throw const CommunityFailure('Hand the community over before leaving.');
    }
    _memberships.removeWhere(
      (row) => row.communityId == space.id && row.uid == ownerUid,
    );
    _communities[space.id] = CommunitySpace(
      id: space.id,
      name: space.name,
      ownerId: space.ownerId,
      visibility: space.visibility,
      status: 'closed',
    );
    closed.add(space.id);
    _changed();
  }

  @override
  Future<void> approve({
    required String communityId,
    required String uid,
  }) async {
    final index = _memberships.indexWhere(
      (row) => row.communityId == communityId && row.uid == uid,
    );
    if (index < 0) return;
    final row = _memberships[index];
    _memberships[index] = CommunityMembership(
      communityId: row.communityId,
      uid: row.uid,
      role: row.role,
      status: MembershipStatus.active,
    );
    approved.add(uid);
    _changed();
  }

  @override
  Future<void> reportCommunity({
    required String communityId,
    required String reporterId,
    required String reason,
  }) async {
    reported.add(communityId);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
    '${invocation.memberName} is not faked in FakeCommunitySpaceRepository',
  );
}

/// A community fixture.
CommunitySpace fakeCommunity({
  String id = 'kasem-circle',
  String name = 'Kasem Circle',
  String ownerId = 'nyaaba-uid',
  CommunityVisibility visibility = CommunityVisibility.public,
  String language = 'Kasem',
  String location = 'Navrongo',
  int memberCount = 12,
  List<String> rules = const ['Be kind.'],
  String status = 'active',
}) => CommunitySpace(
  id: id,
  name: name,
  ownerId: ownerId,
  description: 'Words from home, every day.',
  category: CommunityCategory.language,
  language: language,
  location: location,
  visibility: visibility,
  memberCount: memberCount,
  rules: rules,
  status: status,
);
