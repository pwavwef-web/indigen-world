import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';

/// A community action that failed for a reason worth showing the member.
class CommunityFailure implements Exception {
  const CommunityFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

/// A staged attachment that has been chosen on the device but not uploaded yet.
class PendingUpload {
  const PendingUpload({
    required this.path,
    required this.isVideo,
    this.isAudio = false,
    this.aspectRatio = 4 / 3,
    this.durationSeconds,
  });

  final String path;
  final bool isVideo;
  final bool isAudio;
  final double aspectRatio;
  final int? durationSeconds;

  String get mediaType => isAudio ? 'audio' : (isVideo ? 'video' : 'image');

  String get fileName => path.split(RegExp(r'[\\/]')).last;

  String get contentType {
    final extension = fileName.contains('.')
        ? fileName.split('.').last.toLowerCase()
        : '';
    return switch (extension) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      'heic' => 'image/heic',
      'gif' => 'image/gif',
      'mp4' => 'video/mp4',
      'mov' => 'video/quicktime',
      'webm' => 'video/webm',
      'm4v' => 'video/x-m4v',
      'm4a' => 'audio/mp4',
      'aac' => 'audio/aac',
      'mp3' => 'audio/mpeg',
      'wav' => 'audio/wav',
      _ => isAudio ? 'audio/mp4' : (isVideo ? 'video/mp4' : 'image/jpeg'),
    };
  }
}

/// Reads and writes everything the community feed needs.
///
/// The whole surface lives in flat, edge-keyed collections so every query the
/// app runs is a single indexed read:
///
///   * `communityProfiles/{uid}`            — public identity
///   * `communityUsernames/{username}`      — handle uniqueness registry
///   * `communityPosts/{postId}`            — posts and replies (`parentId`)
///   * `communityLikes/{uid}_{postId}`      — like edges
///   * `communityBookmarks/{uid}_{postId}`  — private saves
///   * `communityFollows/{from}_{to}`       — follow edges
///   * `communityReports/{reportId}`        — moderation queue
///
/// Follower / following / post totals are read with Firestore aggregate
/// `count()` queries rather than denormalised counters, so no client ever needs
/// write access to another member's document.
class CommunityRepository {
  const CommunityRepository(this._firestore, this._storage);

  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;

  static const feedPageSize = 40;
  static const maxMediaPerPost = 4;
  static const maxImageBytes = 12 * 1024 * 1024;
  static const maxVideoBytes = 128 * 1024 * 1024;
  static const maxAudioBytes = 24 * 1024 * 1024;
  static const maxPostLength = 500;

  CollectionReference<Map<String, dynamic>> get _profiles =>
      _firestore.collection('communityProfiles');
  CollectionReference<Map<String, dynamic>> get _usernames =>
      _firestore.collection('communityUsernames');
  CollectionReference<Map<String, dynamic>> get _posts =>
      _firestore.collection('communityPosts');
  CollectionReference<Map<String, dynamic>> get _likes =>
      _firestore.collection('communityLikes');
  CollectionReference<Map<String, dynamic>> get _bookmarks =>
      _firestore.collection('communityBookmarks');
  CollectionReference<Map<String, dynamic>> get _follows =>
      _firestore.collection('communityFollows');
  CollectionReference<Map<String, dynamic>> get _reports =>
      _firestore.collection('communityReports');
  CollectionReference<Map<String, dynamic>> get _reposts =>
      _firestore.collection('communityReposts');
  CollectionReference<Map<String, dynamic>> get _quotes =>
      _firestore.collection('communityQuotes');
  CollectionReference<Map<String, dynamic>> get _views =>
      _firestore.collection('communityViews');
  CollectionReference<Map<String, dynamic>> get _pollVotes =>
      _firestore.collection('communityPollVotes');
  CollectionReference<Map<String, dynamic>> get _hiddenPosts =>
      _firestore.collection('communityHiddenPosts');
  CollectionReference<Map<String, dynamic>> get _mutes =>
      _firestore.collection('communityMutes');
  CollectionReference<Map<String, dynamic>> get _blocks =>
      _firestore.collection('communityBlocks');

  static String edgeId(String from, String to) => '${from}_$to';

  // ── Profiles ──────────────────────────────────────────────────────────────

  Stream<CommunityProfile?> watchProfile(String uid) => _profiles
      .doc(uid)
      .snapshots()
      .map((doc) => doc.exists ? CommunityProfile.fromDoc(doc) : null);

  Future<CommunityProfile?> getProfile(String uid) async {
    final doc = await _profiles.doc(uid).get();
    return doc.exists ? CommunityProfile.fromDoc(doc) : null;
  }

  Future<CommunityProfile?> getProfileByUsername(String username) async {
    final snapshot = await _profiles
        .where('username', isEqualTo: username)
        .limit(1)
        .get();
    if (snapshot.docs.isEmpty) return null;
    return CommunityProfile.fromDoc(snapshot.docs.first);
  }

  Future<bool> isUsernameAvailable(String username) async {
    final doc = await _usernames.doc(username).get();
    return !doc.exists;
  }

  /// Claims [username] and writes the member's public profile in one atomic
  /// batch. The handle registry doc is what makes the handle unique — Firestore
  /// rules reject a create when the document already exists.
  Future<CommunityProfile> createProfile({
    required String uid,
    required String username,
    required String displayName,
    String bio = '',
    String location = '',
    String dialect = '',
    String? avatarUrl,
  }) async {
    final reason = validateUsername(username);
    if (reason != null) throw CommunityFailure(reason);
    if (displayName.trim().isEmpty) {
      throw const CommunityFailure('Add the name the community will see.');
    }
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
    );

    final batch = _firestore.batch()
      ..set(_usernames.doc(username), {
        'uid': uid,
        'createdAt': FieldValue.serverTimestamp(),
      })
      ..set(_profiles.doc(uid), {
        ...profile.toCreateMap(),
        'displayNameLower': profile.displayName.toLowerCase(),
      });
    try {
      await batch.commit();
    } on FirebaseException catch (error) {
      // The username registry is create-only, so losing a race for a handle
      // surfaces as permission-denied rather than as a conflict.
      if (error.code == 'permission-denied') {
        throw const CommunityFailure(
          'That handle was just taken. Please choose another.',
        );
      }
      throw CommunityFailure(_storageMessage(error));
    }
    return profile;
  }

  Future<void> updateProfile({
    required String uid,
    required String displayName,
    required String bio,
    required String location,
    required String dialect,
    String? avatarUrl,
    String? bannerUrl,
  }) async {
    if (displayName.trim().isEmpty) {
      throw const CommunityFailure('Add the name the community will see.');
    }
    await _profiles.doc(uid).update({
      'displayName': displayName.trim(),
      'displayNameLower': displayName.trim().toLowerCase(),
      'bio': bio.trim(),
      'location': location.trim(),
      'dialect': dialect.trim(),
      'avatarUrl': ?avatarUrl,
      'bannerUrl': ?bannerUrl,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Prefix search across handles and display names. Firestore has no full-text
  /// search, so this is an inexpensive two-query prefix match, merged and
  /// de-duplicated here.
  Future<List<CommunityProfile>> searchProfiles(String query) async {
    final term = query.trim().toLowerCase();
    if (term.isEmpty) return const [];
    // U+F8FF sorts above every character Firestore indexes, so the range
    // [term, term + U+F8FF] is the idiomatic "starts with" query.
    final end = '$term\u{F8FF}';

    final results = await Future.wait([
      _profiles
          .orderBy('username')
          .startAt([term])
          .endAt([end])
          .limit(15)
          .get(),
      _profiles
          .orderBy('displayNameLower')
          .startAt([term])
          .endAt([end])
          .limit(15)
          .get(),
    ]);

    final merged = <String, CommunityProfile>{};
    for (final snapshot in results) {
      for (final doc in snapshot.docs) {
        merged[doc.id] = CommunityProfile.fromDoc(doc);
      }
    }
    return merged.values.toList(growable: false);
  }

  /// Newest members, used to seed the "people to follow" rail.
  Future<List<CommunityProfile>> suggestedProfiles({int limit = 12}) async {
    final snapshot = await _profiles
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs.map(CommunityProfile.fromDoc).toList(growable: false);
  }

  // ── Feed ──────────────────────────────────────────────────────────────────

  Stream<List<CommunityPost>> watchFeed({int limit = feedPageSize}) =>
      _watchFeedWithReposts(
        postQuery: _posts
            .where('isReply', isEqualTo: false)
            .orderBy('createdAt', descending: true)
            .limit(limit),
        repostQuery: _reposts
            .orderBy('createdAt', descending: true)
            .limit(limit),
        limit: limit,
      );

  /// Posts from the people [authorIds] follow. Firestore caps `whereIn` at 30
  /// values, so the caller passes the most recent follows.
  Stream<List<CommunityPost>> watchFollowingFeed(
    List<String> authorIds, {
    int limit = feedPageSize,
  }) {
    if (authorIds.isEmpty) return Stream.value(const <CommunityPost>[]);
    final ids = authorIds.take(30).toList(growable: false);
    return _watchFeedWithReposts(
      postQuery: _posts
          .where('authorId', whereIn: ids)
          .where('isReply', isEqualTo: false)
          .orderBy('createdAt', descending: true)
          .limit(limit),
      repostQuery: _reposts
          .where('reposterId', whereIn: ids)
          .orderBy('createdAt', descending: true)
          .limit(limit),
      limit: limit,
    );
  }

  /// Combines canonical posts and recent reshare edges into the same feed shape
  /// SRC uses. A reshare never becomes a second post: likes, replies, views and
  /// saves still target the original, while the activity label identifies the
  /// member who brought it into the feed.
  Stream<List<CommunityPost>> _watchFeedWithReposts({
    required Query<Map<String, dynamic>> postQuery,
    required Query<Map<String, dynamic>> repostQuery,
    required int limit,
  }) {
    late final StreamController<List<CommunityPost>> controller;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? postSubscription;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? repostSubscription;
    var posts = const <CommunityPost>[];
    var reposts = const <_CommunityRepost>[];
    var revision = 0;

    Future<void> emit() async {
      final currentRevision = ++revision;
      final canonical = {for (final post in posts) post.id: post};
      final missing = reposts
          .map((edge) => edge.postId)
          .where((id) => !canonical.containsKey(id))
          .toSet()
          .toList(growable: false);
      if (missing.isNotEmpty) {
        for (final post in await postsByIds(missing)) {
          canonical[post.id] = post;
        }
      }
      if (currentRevision != revision || controller.isClosed) return;

      final combined = <CommunityPost>[...posts];
      for (final edge in reposts) {
        final post = canonical[edge.postId];
        if (post == null) continue;
        combined.add(
          post.withReshare(
            uid: edge.reposterId,
            displayName: edge.displayName,
            username: edge.username,
            avatarUrl: edge.avatarUrl,
            createdAt: edge.createdAt,
          ),
        );
      }
      combined.sort((left, right) {
        final a = left.feedTimestamp ?? DateTime.fromMillisecondsSinceEpoch(0);
        final b = right.feedTimestamp ?? DateTime.fromMillisecondsSinceEpoch(0);
        return b.compareTo(a);
      });
      controller.add(combined.take(limit).toList(growable: false));
    }

    controller = StreamController<List<CommunityPost>>(
      onListen: () {
        postSubscription = postQuery.snapshots().listen((snapshot) {
          posts = _mapPosts(snapshot);
          unawaited(emit());
        }, onError: controller.addError);
        repostSubscription = repostQuery.snapshots().listen((snapshot) {
          reposts = snapshot.docs
              .map(_CommunityRepost.fromDoc)
              .whereType<_CommunityRepost>()
              .toList(growable: false);
          unawaited(emit());
        }, onError: controller.addError);
      },
      onCancel: () async {
        await postSubscription?.cancel();
        await repostSubscription?.cancel();
      },
    );
    return controller.stream;
  }

  Stream<List<CommunityPost>> watchAuthorPosts(
    String uid, {
    int limit = feedPageSize,
  }) => _posts
      .where('authorId', isEqualTo: uid)
      .where('isReply', isEqualTo: false)
      .orderBy('createdAt', descending: true)
      .limit(limit)
      .snapshots()
      .map(_mapPosts);

  Stream<List<CommunityPost>> watchAuthorReplies(
    String uid, {
    int limit = feedPageSize,
  }) => _posts
      .where('authorId', isEqualTo: uid)
      .where('isReply', isEqualTo: true)
      .orderBy('createdAt', descending: true)
      .limit(limit)
      .snapshots()
      .map(_mapPosts);

  Stream<List<CommunityPost>> watchAuthorMedia(
    String uid, {
    int limit = feedPageSize,
  }) => _posts
      .where('authorId', isEqualTo: uid)
      .where('hasMedia', isEqualTo: true)
      .orderBy('createdAt', descending: true)
      .limit(limit)
      .snapshots()
      .map(_mapPosts);

  Stream<List<CommunityPost>> watchReplies(String postId) => _posts
      .where('parentId', isEqualTo: postId)
      .orderBy('createdAt')
      .limit(200)
      .snapshots()
      .map(_mapPosts);

  Stream<CommunityPost?> watchPost(String postId) => _posts
      .doc(postId)
      .snapshots()
      .map((doc) => doc.exists ? CommunityPost.fromDoc(doc) : null);

  /// Resolves an explicit list of post ids, preserving the given order. Used by
  /// the likes and saved tabs, which start from edge documents.
  Future<List<CommunityPost>> postsByIds(List<String> ids) async {
    if (ids.isEmpty) return const [];
    final chunks = <List<String>>[];
    for (var i = 0; i < ids.length; i += 30) {
      chunks.add(ids.sublist(i, i + 30 > ids.length ? ids.length : i + 30));
    }
    final snapshots = await Future.wait(
      chunks.map(
        (chunk) => _posts.where(FieldPath.documentId, whereIn: chunk).get(),
      ),
    );
    final byId = <String, CommunityPost>{};
    for (final snapshot in snapshots) {
      for (final doc in snapshot.docs) {
        byId[doc.id] = CommunityPost.fromDoc(doc);
      }
    }
    return ids
        .map((id) => byId[id])
        .whereType<CommunityPost>()
        .toList(growable: false);
  }

  List<CommunityPost> _mapPosts(QuerySnapshot<Map<String, dynamic>> snapshot) =>
      snapshot.docs.map(CommunityPost.fromDoc).toList(growable: false);

  // ── Posting ───────────────────────────────────────────────────────────────

  /// Writes a post (or a reply when [parentId] is set), uploading any staged
  /// attachments first so the document is only created once its media resolves.
  Future<String> createPost({
    required CommunityProfile author,
    required String text,
    List<PendingUpload> attachments = const [],
    String? parentId,
    String? rootId,
    CommunityPost? quoteTo,
    CommunityPoll? poll,
    bool kasemConfirmed = false,
    void Function(double progress)? onUploadProgress,
  }) async {
    final body = text.trim();
    if (body.isEmpty &&
        attachments.isEmpty &&
        quoteTo == null &&
        poll == null) {
      throw const CommunityFailure('Write something or add media first.');
    }
    if (body.length > maxPostLength) {
      throw const CommunityFailure(
        'Posts are limited to $maxPostLength characters.',
      );
    }
    if (attachments.length > maxMediaPerPost) {
      throw const CommunityFailure(
        'You can attach up to $maxMediaPerPost items.',
      );
    }
    if (parentId != null && quoteTo != null) {
      throw const CommunityFailure('A reply cannot also be a quote post.');
    }
    if (poll != null) {
      if (poll.options.length < 2 || poll.options.length > 4) {
        throw const CommunityFailure('Polls need between 2 and 4 choices.');
      }
      if (poll.options.any((option) => option.text.trim().isEmpty)) {
        throw const CommunityFailure('Every poll choice needs text.');
      }
      if (!poll.endsAt.isAfter(DateTime.now())) {
        throw const CommunityFailure('Choose a poll duration in the future.');
      }
    }

    final quoteEdge = quoteTo == null
        ? null
        : _quotes.doc(edgeId(author.uid, quoteTo.id));
    if (quoteEdge != null && (await quoteEdge.get()).exists) {
      throw const CommunityFailure('You have already quoted this post.');
    }

    final doc = _posts.doc();
    final media = await _uploadAttachments(
      uid: author.uid,
      postId: doc.id,
      attachments: attachments,
      onProgress: onUploadProgress,
    );

    try {
      final data = <String, Object?>{
        'authorId': author.uid,
        'author': author.toAuthorStamp(),
        'text': body,
        'media': media.map((item) => item.toMap()).toList(growable: false),
        'hasMedia': media.isNotEmpty,
        'likeCount': 0,
        'replyCount': 0,
        'repostCount': 0,
        'quoteCount': 0,
        'viewCount': 0,
        'parentId': parentId,
        // Firestore cannot order by createdAt while filtering `parentId != null`,
        // so replies carry an explicit equality-filterable flag instead.
        'isReply': parentId != null,
        'rootId': rootId ?? parentId ?? doc.id,
        'quotedPostId': quoteTo?.id,
        'quotedPost': quoteTo?.toQuoteSnapshot(),
        'poll': poll?.toMap(),
        'kasemConfirmed': kasemConfirmed,
        'createdAt': FieldValue.serverTimestamp(),
      };
      if (quoteTo == null) {
        await doc.set(data);
      } else {
        final batch = _firestore.batch()
          ..set(doc, data)
          ..set(quoteEdge!, {
            'uid': author.uid,
            'sourcePostId': quoteTo.id,
            'quotePostId': doc.id,
            'createdAt': FieldValue.serverTimestamp(),
          })
          ..update(_posts.doc(quoteTo.id), {
            'quoteCount': FieldValue.increment(1),
          });
        await batch.commit();
      }
    } on FirebaseException catch (error) {
      // The document never landed — drop the orphaned uploads.
      await _deleteMedia(media);
      throw CommunityFailure(_storageMessage(error));
    }

    if (parentId != null) {
      // Best-effort: a missed increment only affects a displayed count, never
      // the reply itself, so a failure here must not fail the post.
      try {
        await _posts.doc(parentId).update({
          'replyCount': FieldValue.increment(1),
        });
      } on FirebaseException {
        // Parent removed or counter write rejected — leave the reply in place.
      }
    }
    return doc.id;
  }

  Future<void> deletePost(CommunityPost post) async {
    final batch = _firestore.batch()..delete(_posts.doc(post.id));
    if (post.parentId != null) {
      batch.update(_posts.doc(post.parentId!), {
        'replyCount': FieldValue.increment(-1),
      });
    }
    if (post.quotedPostId != null) {
      batch
        ..delete(_quotes.doc(edgeId(post.authorId, post.quotedPostId!)))
        ..update(_posts.doc(post.quotedPostId!), {
          'quoteCount': FieldValue.increment(-1),
        });
    }
    try {
      await batch.commit();
    } on FirebaseException catch (error) {
      // A source or parent may already be gone. The member must still be able
      // to remove their own card, but only fall back to a plain delete after
      // the atomic counter path failed.
      try {
        await _posts.doc(post.id).delete();
      } on FirebaseException {
        throw CommunityFailure(_storageMessage(error));
      }
    }
    await _deleteMedia(post.media);
  }

  Future<void> editPost({required String postId, required String text}) async {
    final body = text.trim();
    if (body.length > maxPostLength) {
      throw const CommunityFailure(
        'Posts are limited to $maxPostLength characters.',
      );
    }
    await _posts.doc(postId).update({
      'text': body,
      'editedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> reportPost({
    required String postId,
    required String reporterId,
    required String reason,
  }) => _reports.add({
    'postId': postId,
    'reporterId': reporterId,
    'reason': reason,
    'status': 'open',
    'createdAt': FieldValue.serverTimestamp(),
  });

  // ── Likes, bookmarks, follows ─────────────────────────────────────────────

  Stream<Set<String>> watchMyLikes(String uid) => _likes
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['postId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toSet(),
      );

  Future<void> toggleLike({
    required String uid,
    required String postId,
    required bool liked,
  }) async {
    final edge = _likes.doc(edgeId(uid, postId));
    final batch = _firestore.batch();
    if (liked) {
      batch
        ..delete(edge)
        ..update(_posts.doc(postId), {'likeCount': FieldValue.increment(-1)});
    } else {
      batch
        ..set(edge, {
          'uid': uid,
          'postId': postId,
          'createdAt': FieldValue.serverTimestamp(),
        })
        ..update(_posts.doc(postId), {'likeCount': FieldValue.increment(1)});
    }
    await batch.commit();
  }

  Stream<Set<String>> watchMyReposts(String uid) => _reposts
      .where('reposterId', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['postId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toSet(),
      );

  Future<void> toggleRepost({
    required CommunityProfile profile,
    required String postId,
    required bool reposted,
  }) async {
    final edge = _reposts.doc(edgeId(profile.uid, postId));
    final batch = _firestore.batch();
    if (reposted) {
      batch
        ..delete(edge)
        ..update(_posts.doc(postId), {'repostCount': FieldValue.increment(-1)});
    } else {
      batch
        ..set(edge, {
          'reposterId': profile.uid,
          'postId': postId,
          'reposter': profile.toAuthorStamp(),
          'createdAt': FieldValue.serverTimestamp(),
        })
        ..update(_posts.doc(postId), {'repostCount': FieldValue.increment(1)});
    }
    await batch.commit();
  }

  /// Records one unique signed-in viewer. The edge and public counter move in
  /// the same commit, so retries and rebuilds cannot inflate the number.
  Future<void> trackView({required String uid, required String postId}) async {
    final edge = _views.doc(edgeId(uid, postId));
    if ((await edge.get()).exists) return;
    final batch = _firestore.batch()
      ..set(edge, {
        'viewerId': uid,
        'postId': postId,
        'createdAt': FieldValue.serverTimestamp(),
      })
      ..update(_posts.doc(postId), {'viewCount': FieldValue.increment(1)});
    try {
      await batch.commit();
    } on FirebaseException catch (error) {
      // A concurrent card/detail impression can win this race. If the edge now
      // exists the view was counted correctly; otherwise surface the failure.
      if (!(await edge.get()).exists) {
        throw CommunityFailure(_storageMessage(error));
      }
    }
  }

  Stream<Map<String, String>> watchMyPollVotes(String uid) => _pollVotes
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => {
          for (final doc in snapshot.docs)
            if (doc.data()['postId'] is String &&
                doc.data()['optionId'] is String)
              doc.data()['postId'] as String: doc.data()['optionId'] as String,
        },
      );

  Future<void> votePoll({
    required String uid,
    required String postId,
    required String optionId,
  }) => _pollVotes.doc(edgeId(uid, postId)).set({
    'uid': uid,
    'postId': postId,
    'optionId': optionId,
    'createdAt': FieldValue.serverTimestamp(),
  });

  Future<List<String>> viewerIds(String postId, {int limit = 300}) async {
    final snapshot = await _views
        .where('postId', isEqualTo: postId)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs
        .map((doc) => (doc.data()['viewerId'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  Future<List<String>> likerIds(String postId, {int limit = 300}) async {
    final snapshot = await _likes
        .where('postId', isEqualTo: postId)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs
        .map((doc) => (doc.data()['uid'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  Future<List<String>> pollVoterIds(String postId, {int limit = 300}) async {
    final snapshot = await _pollVotes
        .where('postId', isEqualTo: postId)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs
        .map((doc) => (doc.data()['uid'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  /// Post ids [uid] has liked, newest first.
  Future<List<String>> likedPostIds(String uid, {int limit = 60}) async {
    final snapshot = await _likes
        .where('uid', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs
        .map((doc) => (doc.data()['postId'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  Stream<Set<String>> watchMyBookmarks(String uid) => _bookmarks
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['postId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toSet(),
      );

  Future<void> toggleBookmark({
    required String uid,
    required String postId,
    required bool saved,
  }) async {
    final edge = _bookmarks.doc(edgeId(uid, postId));
    if (saved) {
      await edge.delete();
    } else {
      await edge.set({
        'uid': uid,
        'postId': postId,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  Future<List<String>> bookmarkedPostIds(String uid, {int limit = 60}) async {
    final snapshot = await _bookmarks
        .where('uid', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs
        .map((doc) => (doc.data()['postId'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  Stream<Set<String>> watchMyHiddenPosts(String uid) => _hiddenPosts
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['postId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toSet(),
      );

  Stream<Set<String>> watchMyMutes(String uid) => _mutes
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['targetId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toSet(),
      );

  Stream<Set<String>> watchMyBlocks(String uid) => _blocks
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['targetId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toSet(),
      );

  Future<void> hidePost({required String uid, required String postId}) =>
      _hiddenPosts.doc(edgeId(uid, postId)).set({
        'uid': uid,
        'postId': postId,
        'createdAt': FieldValue.serverTimestamp(),
      });

  Future<void> muteProfile({required String uid, required String targetId}) =>
      _mutes.doc(edgeId(uid, targetId)).set({
        'uid': uid,
        'targetId': targetId,
        'createdAt': FieldValue.serverTimestamp(),
      });

  Future<void> blockProfile({
    required String uid,
    required String targetId,
  }) async {
    final batch = _firestore.batch()
      ..set(_blocks.doc(edgeId(uid, targetId)), {
        'uid': uid,
        'targetId': targetId,
        'createdAt': FieldValue.serverTimestamp(),
      })
      ..delete(_follows.doc(edgeId(uid, targetId)));
    await batch.commit();
  }

  /// The uids [uid] follows, most recently followed first.
  Stream<List<String>> watchFollowing(String uid) => _follows
      .where('followerId', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(300)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => (doc.data()['followingId'] as String?) ?? '')
            .where((id) => id.isNotEmpty)
            .toList(growable: false),
      );

  Future<List<String>> followerIds(String uid, {int limit = 300}) async {
    final snapshot = await _follows
        .where('followingId', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs
        .map((doc) => (doc.data()['followerId'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  Future<List<String>> followingIds(String uid, {int limit = 300}) async {
    final snapshot = await _follows
        .where('followerId', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs
        .map((doc) => (doc.data()['followingId'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
  }

  Future<void> toggleFollow({
    required String followerId,
    required String targetId,
    required bool following,
  }) async {
    if (followerId == targetId) {
      throw const CommunityFailure('You cannot follow yourself.');
    }
    final edge = _follows.doc(edgeId(followerId, targetId));
    if (following) {
      await edge.delete();
    } else {
      await edge.set({
        'followerId': followerId,
        'followingId': targetId,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  /// Followers, following and top-level post totals for one member.
  Future<({int followers, int following, int posts})> profileCounts(
    String uid,
  ) async {
    final results = await Future.wait([
      _follows.where('followingId', isEqualTo: uid).count().get(),
      _follows.where('followerId', isEqualTo: uid).count().get(),
      _posts
          .where('authorId', isEqualTo: uid)
          .where('isReply', isEqualTo: false)
          .count()
          .get(),
    ]);
    return (
      followers: results[0].count ?? 0,
      following: results[1].count ?? 0,
      posts: results[2].count ?? 0,
    );
  }

  Future<List<CommunityProfile>> profilesByIds(List<String> ids) async {
    if (ids.isEmpty) return const [];
    final chunks = <List<String>>[];
    for (var i = 0; i < ids.length; i += 30) {
      chunks.add(ids.sublist(i, i + 30 > ids.length ? ids.length : i + 30));
    }
    final snapshots = await Future.wait(
      chunks.map(
        (chunk) => _profiles.where(FieldPath.documentId, whereIn: chunk).get(),
      ),
    );
    final byId = <String, CommunityProfile>{};
    for (final snapshot in snapshots) {
      for (final doc in snapshot.docs) {
        byId[doc.id] = CommunityProfile.fromDoc(doc);
      }
    }
    return ids
        .map((id) => byId[id])
        .whereType<CommunityProfile>()
        .toList(growable: false);
  }

  // ── Storage ───────────────────────────────────────────────────────────────

  Future<String> uploadAvatar({
    required String uid,
    required PendingUpload upload,
  }) => _uploadImage(
    reference: _storage.ref('community-avatars/$uid/${_stamped(upload)}'),
    upload: upload,
  );

  Future<String> uploadBanner({
    required String uid,
    required PendingUpload upload,
  }) => _uploadImage(
    reference: _storage.ref('community-banners/$uid/${_stamped(upload)}'),
    upload: upload,
  );

  Future<String> _uploadImage({
    required Reference reference,
    required PendingUpload upload,
  }) async {
    final file = File(upload.path);
    if (await file.length() > maxImageBytes) {
      throw const CommunityFailure('Images need to be under 12 MB.');
    }
    try {
      await reference.putFile(
        file,
        SettableMetadata(contentType: upload.contentType),
      );
      return await reference.getDownloadURL();
    } on FirebaseException catch (error) {
      throw CommunityFailure(_storageMessage(error));
    }
  }

  Future<List<CommunityMedia>> _uploadAttachments({
    required String uid,
    required String postId,
    required List<PendingUpload> attachments,
    void Function(double progress)? onProgress,
  }) async {
    if (attachments.isEmpty) return const [];
    final uploaded = <CommunityMedia>[];
    try {
      for (var index = 0; index < attachments.length; index++) {
        final attachment = attachments[index];
        final file = File(attachment.path);
        final length = await file.length();
        final ceiling = attachment.isAudio
            ? maxAudioBytes
            : (attachment.isVideo ? maxVideoBytes : maxImageBytes);
        if (length > ceiling) {
          throw CommunityFailure(
            attachment.isAudio
                ? 'Voice notes need to be under 24 MB.'
                : attachment.isVideo
                ? 'Videos need to be under 128 MB.'
                : 'Images need to be under 12 MB.',
          );
        }

        final reference = _storage.ref(
          'community-media/$uid/$postId/${index}_${_stamped(attachment)}',
        );
        final task = reference.putFile(
          file,
          SettableMetadata(contentType: attachment.contentType),
        );
        if (onProgress != null) {
          task.snapshotEvents.listen(
            (snapshot) {
              if (snapshot.totalBytes <= 0) return;
              final fileProgress =
                  snapshot.bytesTransferred / snapshot.totalBytes;
              onProgress((index + fileProgress) / attachments.length);
            },
            onError: (_) {
              // Progress is cosmetic; the await below reports real failures.
            },
          );
        }
        await task;
        uploaded.add(
          CommunityMedia(
            url: await reference.getDownloadURL(),
            type: attachment.mediaType,
            storagePath: reference.fullPath,
            aspectRatio: attachment.aspectRatio,
            durationSeconds: attachment.durationSeconds,
          ),
        );
      }
    } on FirebaseException catch (error) {
      await _deleteMedia(uploaded);
      throw CommunityFailure(_storageMessage(error));
    } on CommunityFailure {
      await _deleteMedia(uploaded);
      rethrow;
    }
    onProgress?.call(1);
    return uploaded;
  }

  Future<void> _deleteMedia(List<CommunityMedia> media) async {
    for (final item in media) {
      if (item.storagePath.isEmpty) continue;
      try {
        await _storage.ref(item.storagePath).delete();
      } on FirebaseException {
        // Already gone, or no longer ours to remove.
      }
    }
  }

  String _stamped(PendingUpload upload) =>
      '${DateTime.now().millisecondsSinceEpoch}_${upload.fileName}';

  String _storageMessage(FirebaseException error) => switch (error.code) {
    'permission-denied' || 'unauthorized' =>
      'You do not have permission for that yet. Check your community profile.',
    'unauthenticated' => 'Sign in to take part in the community.',
    'canceled' => 'Upload cancelled.',
    'quota-exceeded' => 'Storage is full. Please contact the project team.',
    'unavailable' || 'network-request-failed' || 'retry-limit-exceeded' =>
      'Network problem. Check your connection and try again.',
    _ => error.message ?? 'Something went wrong. Please try again.',
  };
}

class _CommunityRepost {
  const _CommunityRepost({
    required this.postId,
    required this.reposterId,
    required this.displayName,
    required this.username,
    this.avatarUrl,
    this.createdAt,
  });

  final String postId;
  final String reposterId;
  final String displayName;
  final String username;
  final String? avatarUrl;
  final DateTime? createdAt;

  static _CommunityRepost? fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    final postId = data['postId'];
    final reposterId = data['reposterId'];
    if (postId is! String || postId.isEmpty || reposterId is! String) {
      return null;
    }
    final rawStamp = data['reposter'];
    final stamp = rawStamp is Map ? rawStamp : const <String, Object?>{};
    return _CommunityRepost(
      postId: postId,
      reposterId: reposterId,
      displayName: stamp['displayName'] is String
          ? stamp['displayName'] as String
          : 'Community member',
      username: stamp['username'] is String
          ? stamp['username'] as String
          : 'member',
      avatarUrl:
          stamp['avatarUrl'] is String &&
              (stamp['avatarUrl'] as String).isNotEmpty
          ? stamp['avatarUrl'] as String
          : null,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}
