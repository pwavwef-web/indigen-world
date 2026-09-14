import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';

/// Reads and writes sub-communities and their memberships.
///
/// Kept apart from [CommunityRepository] because the two change for different
/// reasons: that one is the feed and everything a post can do, this one is
/// who belongs where. Posts *into* a community still go through the feed
/// repository, which already owns uploads, counters and rollback.
///
/// Every membership write moves the community's `memberCount` in the same
/// commit, and the Security Rules check the pair — so the count on a
/// community card is the number of active membership rows, not an estimate.
class CommunitySpaceRepository {
  const CommunitySpaceRepository(this._firestore, this._storage);

  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;

  static const discoverPageSize = 30;
  static const memberPageSize = 100;

  CollectionReference<Map<String, dynamic>> get _communities =>
      _firestore.collection('communitySpaces');

  DocumentReference<Map<String, dynamic>> _community(String id) =>
      _communities.doc(id);

  CollectionReference<Map<String, dynamic>> _memberships(String communityId) =>
      _community(communityId).collection('memberships');

  // ── Reading communities ───────────────────────────────────────────────────

  Stream<CommunitySpace?> watchCommunity(String id) =>
      _community(id)
          .snapshots()
          .map((doc) => doc.exists ? CommunitySpace.fromDoc(doc) : null);

  Future<CommunitySpace?> getCommunity(String id) async {
    final doc = await _community(id).get();
    return doc.exists ? CommunitySpace.fromDoc(doc) : null;
  }

  Future<bool> isSlugAvailable(String slug) async =>
      !(await _community(slug).get()).exists;

  /// The largest communities first — what somebody arriving with no query
  /// most likely wants to find.
  Future<List<CommunitySpace>> discoverCommunities({
    int limit = discoverPageSize,
  }) async {
    final snapshot = await _communities
        .orderBy('memberCount', descending: true)
        .limit(limit)
        .get();
    return snapshot.docs
        .map(CommunitySpace.fromDoc)
        .where((space) => space.isAvailable)
        .toList(growable: false);
  }

  /// Communities answering [query] by name, language, location, category or
  /// address.
  ///
  /// Two cheap indexed reads — one on the stored search prefixes, one on the
  /// name — merged, then held to every word of the query here, since Firestore
  /// can only match one of them.
  Future<List<CommunitySpace>> searchCommunities(String query) async {
    final words = communityQueryWords(query);
    if (words.isEmpty) return const [];
    final longest = words.reduce((a, b) => b.length > a.length ? b : a);
    final term = query.trim().toLowerCase();
    final results = await Future.wait([
      _communities
          .where('searchTokens', arrayContains: longest)
          .limit(40)
          .get(),
      _communities
          .orderBy('nameLower')
          .startAt([term])
          .endAt(['$term\u{F8FF}'])
          .limit(20)
          .get(),
    ]);
    final merged = <String, CommunitySpace>{};
    for (final snapshot in results) {
      for (final doc in snapshot.docs) {
        merged[doc.id] = CommunitySpace.fromDoc(doc);
      }
    }
    return merged.values
        .where(
          (space) =>
              space.isAvailable &&
              (communityMatchesQuery(space, query) ||
                  space.name.toLowerCase().startsWith(term)),
        )
        .toList(growable: false)
      ..sort((a, b) => b.memberCount.compareTo(a.memberCount));
  }

  /// Resolves [ids] in the order given, dropping any that no longer exist.
  Future<List<CommunitySpace>> communitiesByIds(List<String> ids) async {
    if (ids.isEmpty) return const [];
    final byId = <String, CommunitySpace>{};
    for (var start = 0; start < ids.length; start += 30) {
      final chunk = ids.sublist(
        start,
        start + 30 > ids.length ? ids.length : start + 30,
      );
      final snapshot = await _communities
          .where(FieldPath.documentId, whereIn: chunk)
          .get();
      for (final doc in snapshot.docs) {
        byId[doc.id] = CommunitySpace.fromDoc(doc);
      }
    }
    return [for (final id in ids) ?byId[id]];
  }

  // ── Reading memberships ───────────────────────────────────────────────────

  /// Every community [uid] belongs to or has asked to join.
  ///
  /// A collection-group query: each row lives under its own community, and
  /// the rules let a member read their own rows wherever they are.
  Stream<List<CommunityMembership>> watchMyMemberships(String uid) => _firestore
      .collectionGroup('memberships')
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snapshot) => [
          for (final doc in snapshot.docs)
            if (doc.reference.parent.parent case final community?)
              CommunityMembership.fromMap(community.id, doc.id, doc.data()),
        ],
      );

  Stream<CommunityMembership?> watchMembership(
    String communityId,
    String uid,
  ) => _memberships(communityId)
      .doc(uid)
      .snapshots()
      .map(
        (doc) => doc.exists
            ? CommunityMembership.fromMap(communityId, doc.id, doc.data()!)
            : null,
      );

  Stream<List<CommunityMembership>> watchMembers(
    String communityId, {
    MembershipStatus status = MembershipStatus.active,
    int limit = memberPageSize,
  }) => _memberships(communityId)
      .where('status', isEqualTo: status.wire)
      .limit(limit)
      .snapshots()
      .map((snapshot) {
        final members = [
          for (final doc in snapshot.docs)
            CommunityMembership.fromMap(communityId, doc.id, doc.data()),
        ];
        // Highest role first, then longest-standing: the people a newcomer
        // would want to know are running the place.
        members.sort((a, b) {
          final byRole = a.role.index.compareTo(b.role.index);
          if (byRole != 0) return byRole;
          final left = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
          final right = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
          return left.compareTo(right);
        });
        return members;
      });

  // ── Creating ──────────────────────────────────────────────────────────────

  /// Creates the community and its owner's membership in one commit.
  ///
  /// Pictures are uploaded first so the document never points at a file that
  /// does not exist, and removed again if the commit is refused.
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

    final uploaded = <Reference>[];
    try {
      final avatarUrl = avatar == null
          ? null
          : await _uploadImage(
              owner.uid,
              draft.slug,
              'avatar',
              avatar,
              uploaded,
            );
      final coverUrl = cover == null
          ? null
          : await _uploadImage(owner.uid, draft.slug, 'cover', cover, uploaded);

      final batch = _firestore.batch()
        ..set(_community(draft.slug), {
          ...draft.toCreateMap(ownerId: owner.uid),
          'avatarUrl': avatarUrl,
          'coverUrl': coverUrl,
        })
        ..set(_memberships(draft.slug).doc(owner.uid), {
          'uid': owner.uid,
          'communityId': draft.slug,
          'role': CommunityRole.owner.wire,
          'status': MembershipStatus.active.wire,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      await batch.commit();
      return CommunitySpace(
        id: draft.slug,
        name: draft.name.trim(),
        ownerId: owner.uid,
        description: draft.description.trim(),
        category: draft.category,
        language: draft.language.trim(),
        location: draft.location.trim(),
        visibility: draft.visibility,
        avatarUrl: avatarUrl,
        coverUrl: coverUrl,
        memberCount: 1,
        rules: draft.cleanRules,
      );
    } on FirebaseException catch (error) {
      await _deleteRefs(uploaded);
      // The address check above can lose a race. A set over somebody else's
      // community is evaluated as an update, which the rules refuse.
      if (error.code == 'permission-denied') {
        throw const CommunityFailure(
          'That address was just taken, or your community profile is not set '
          'up yet. Try another address.',
        );
      }
      throw CommunityFailure(_message(error));
    } on CommunityFailure {
      await _deleteRefs(uploaded);
      rethrow;
    }
  }

  Future<String> _uploadImage(
    String uid,
    String slug,
    String kind,
    PendingUpload upload,
    List<Reference> uploaded,
  ) async {
    final file = File(upload.path);
    final reason = validateCommunityImage(
      path: upload.path,
      bytes: await file.exists() ? await file.length() : 0,
    );
    if (reason != null) throw CommunityFailure(reason);
    final reference = _storage.ref(
      'community-spaces/$uid/$slug/'
      '${kind}_${DateTime.now().millisecondsSinceEpoch}_${upload.fileName}',
    );
    await reference.putFile(
      file,
      SettableMetadata(contentType: upload.contentType),
    );
    uploaded.add(reference);
    return reference.getDownloadURL();
  }

  Future<void> _deleteRefs(List<Reference> references) async {
    for (final reference in references) {
      try {
        await reference.delete();
      } on FirebaseException {
        // Already gone, or no longer ours to remove.
      }
    }
  }

  // ── Editing ───────────────────────────────────────────────────────────────

  /// Saves an owner's or admin's edits to the community's profile.
  ///
  /// The address and visibility are not part of the profile and are never
  /// written here — the rules freeze both, and [draft]'s slug and visibility
  /// are ignored. New pictures are uploaded before the write and removed
  /// again if it is refused; a picture that is replaced or cleared is deleted
  /// afterwards on a best-effort basis, since it may belong to another admin's
  /// upload prefix and not be ours to remove.
  Future<CommunitySpace> updateCommunity({
    required CommunitySpace space,
    required String editorUid,
    required CommunityDraft draft,
    PendingUpload? avatar,
    PendingUpload? cover,
    bool clearAvatar = false,
    bool clearCover = false,
  }) async {
    final profileDraft = CommunityDraft(
      name: draft.name,
      slug: space.id,
      description: draft.description,
      category: draft.category,
      language: draft.language,
      location: draft.location,
      visibility: space.visibility,
      rules: draft.rules,
    );
    final reason = profileDraft.validate();
    if (reason != null) throw CommunityFailure(reason);

    final uploaded = <Reference>[];
    try {
      final avatarUrl = avatar != null
          ? await _uploadImage(editorUid, space.id, 'avatar', avatar, uploaded)
          : clearAvatar
          ? null
          : space.avatarUrl;
      final coverUrl = cover != null
          ? await _uploadImage(editorUid, space.id, 'cover', cover, uploaded)
          : clearCover
          ? null
          : space.coverUrl;
      final name = profileDraft.name.trim();
      await _community(space.id).update({
        'name': name,
        'nameLower': name.toLowerCase(),
        'description': profileDraft.description.trim(),
        'category': profileDraft.category.wire,
        'language': profileDraft.language.trim(),
        'location': profileDraft.location.trim(),
        'rules': profileDraft.cleanRules,
        'avatarUrl': avatarUrl,
        'coverUrl': coverUrl,
        'searchTokens': communitySearchTokens(
          name: name,
          slug: space.id,
          language: profileDraft.language,
          location: profileDraft.location,
          category: profileDraft.category.wire,
        ),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      for (final old in [
        if (avatarUrl != space.avatarUrl) space.avatarUrl,
        if (coverUrl != space.coverUrl) space.coverUrl,
      ]) {
        await _deleteUrl(old);
      }
      return CommunitySpace(
        id: space.id,
        name: name,
        ownerId: space.ownerId,
        description: profileDraft.description.trim(),
        category: profileDraft.category,
        language: profileDraft.language.trim(),
        location: profileDraft.location.trim(),
        visibility: space.visibility,
        avatarUrl: avatarUrl,
        coverUrl: coverUrl,
        memberCount: space.memberCount,
        rules: profileDraft.cleanRules,
        status: space.status,
        createdAt: space.createdAt,
      );
    } on FirebaseException catch (error) {
      await _deleteRefs(uploaded);
      throw CommunityFailure(_message(error));
    } on CommunityFailure {
      await _deleteRefs(uploaded);
      rethrow;
    }
  }

  Future<void> _deleteUrl(String? url) async {
    if (url == null || url.isEmpty) return;
    try {
      await _storage.refFromURL(url).delete();
    } on Object {
      // Somebody else's upload, already gone, or not a Storage URL at all.
    }
  }

  // ── Ownership ─────────────────────────────────────────────────────────────

  /// Makes [newOwnerUid] the owner. The outgoing owner stays on as an admin,
  /// so they keep the means to help and can then leave like anybody else.
  ///
  /// All three writes land together or not at all; the rules refuse any one
  /// of them on its own.
  Future<void> transferOwnership({
    required String communityId,
    required String ownerUid,
    required String newOwnerUid,
  }) {
    if (newOwnerUid == ownerUid) {
      throw const CommunityFailure('You already own this community.');
    }
    return _commit(
      () =>
          (_firestore.batch()
                ..update(_community(communityId), {
                  'ownerId': newOwnerUid,
                  'updatedAt': FieldValue.serverTimestamp(),
                })
                ..update(_memberships(communityId).doc(newOwnerUid), {
                  'role': CommunityRole.owner.wire,
                  'updatedAt': FieldValue.serverTimestamp(),
                })
                ..update(_memberships(communityId).doc(ownerUid), {
                  'role': CommunityRole.admin.wire,
                  'updatedAt': FieldValue.serverTimestamp(),
                }))
              .commit(),
    );
  }

  /// Closes a community its owner is alone in, and takes them out of it.
  ///
  /// A community with anybody else in it has to be handed over instead — the
  /// rules refuse to close one out from under its members.
  Future<void> closeCommunity({
    required CommunitySpace space,
    required String ownerUid,
  }) {
    if (space.memberCount > 1) {
      throw const CommunityFailure(
        'Hand the community over before leaving — other members are still in '
        'it.',
      );
    }
    return _commit(
      () =>
          (_firestore.batch()
                ..update(_community(space.id), {
                  'status': 'closed',
                  'memberCount': 0,
                  'updatedAt': FieldValue.serverTimestamp(),
                })
                ..delete(_memberships(space.id).doc(ownerUid)))
              .commit(),
    );
  }

  // ── Joining and leaving ───────────────────────────────────────────────────

  /// Joins a public community outright, or asks to join a private one.
  ///
  /// Returns the status the membership landed in.
  Future<MembershipStatus> join({
    required CommunitySpace space,
    required String uid,
  }) async {
    if (!space.isAvailable) {
      throw const CommunityFailure('This community is no longer available.');
    }
    final row = _memberships(space.id).doc(uid);
    final status = space.isPrivate
        ? MembershipStatus.pending
        : MembershipStatus.active;
    final data = {
      'uid': uid,
      'communityId': space.id,
      'role': CommunityRole.member.wire,
      'status': status.wire,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };
    await _commit(() {
      final batch = _firestore.batch()..set(row, data);
      if (status == MembershipStatus.active) {
        batch.update(_community(space.id), {
          'memberCount': FieldValue.increment(1),
        });
      }
      return batch.commit();
    });
    return status;
  }

  /// Leaves a community, or withdraws a request that is still waiting.
  Future<void> leave({
    required String communityId,
    required CommunityMembership membership,
  }) async {
    if (membership.role == CommunityRole.owner) {
      throw const CommunityFailure(
        'Hand the community over, or close it, before leaving.',
      );
    }
    if (membership.status == MembershipStatus.banned) {
      throw const CommunityFailure(
        'You have been removed from this community.',
      );
    }
    await _commit(() {
      final batch = _firestore.batch()
        ..delete(_memberships(communityId).doc(membership.uid));
      if (membership.isActive) {
        batch.update(_community(communityId), {
          'memberCount': FieldValue.increment(-1),
        });
      }
      return batch.commit();
    });
  }

  // ── Moderating ────────────────────────────────────────────────────────────

  Future<void> approve({required String communityId, required String uid}) =>
      _commit(
        () =>
            (_firestore.batch()
                  ..update(_memberships(communityId).doc(uid), {
                    'status': MembershipStatus.active.wire,
                    'updatedAt': FieldValue.serverTimestamp(),
                  })
                  ..update(_community(communityId), {
                    'memberCount': FieldValue.increment(1),
                  }))
                .commit(),
      );

  Future<void> decline({required String communityId, required String uid}) =>
      _commit(() => _memberships(communityId).doc(uid).delete());

  /// Takes [member] out of the community. A ban keeps the row so they cannot
  /// simply join again; a removal deletes it.
  Future<void> removeMember({
    required String communityId,
    required CommunityMembership member,
    bool ban = false,
  }) => _commit(() {
    final row = _memberships(communityId).doc(member.uid);
    final batch = _firestore.batch();
    if (ban) {
      batch.update(row, {
        'status': MembershipStatus.banned.wire,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } else {
      batch.delete(row);
    }
    if (member.isActive) {
      batch.update(_community(communityId), {
        'memberCount': FieldValue.increment(-1),
      });
    }
    return batch.commit();
  });

  Future<void> setRole({
    required String communityId,
    required String uid,
    required CommunityRole role,
  }) {
    if (role == CommunityRole.owner) {
      throw const CommunityFailure('Ownership cannot be handed over here.');
    }
    return _commit(
      () => _memberships(communityId).doc(uid).update({
        'role': role.wire,
        'updatedAt': FieldValue.serverTimestamp(),
      }),
    );
  }

  /// Files a report about the community itself into the moderation queue the
  /// admin console already reads.
  Future<void> reportCommunity({
    required String communityId,
    required String reporterId,
    required String reason,
  }) => _commit(
    () => _firestore.collection('communityReports').add({
      'postId': '',
      'communityId': communityId,
      'targetType': 'community',
      'reporterId': reporterId,
      'reason': reason,
      'status': 'open',
      'createdAt': FieldValue.serverTimestamp(),
    }),
  );

  Future<void> _commit(Future<Object?> Function() write) async {
    try {
      await write();
    } on FirebaseException catch (error) {
      debugPrint('Community membership write refused: ${error.code}');
      throw CommunityFailure(_message(error));
    }
  }

  String _message(FirebaseException error) => switch (error.code) {
    'permission-denied' =>
      'You do not have permission to do that in this community.',
    'not-found' => 'This community or membership no longer exists.',
    'unauthenticated' => 'Sign in to take part in communities.',
    'unavailable' || 'network-request-failed' =>
      'Network problem. Check your connection and try again.',
    _ => error.message ?? 'Something went wrong. Please try again.',
  };
}
