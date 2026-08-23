import 'package:cloud_firestore/cloud_firestore.dart';

/// A single photo or video attached to a community post.
class CommunityMedia {
  const CommunityMedia({
    required this.url,
    required this.type,
    this.storagePath = '',
    this.thumbnailUrl,
    this.aspectRatio = 4 / 3,
  });

  /// Public download URL of the uploaded file.
  final String url;

  /// `'image'` or `'video'`.
  final String type;

  /// Storage object path, kept so the owner can delete the file with the post.
  final String storagePath;

  final String? thumbnailUrl;
  final double aspectRatio;

  bool get isVideo => type == 'video';

  static CommunityMedia? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final url = raw['url'];
    if (url is! String || url.isEmpty) return null;
    final ratio = raw['aspectRatio'];
    return CommunityMedia(
      url: url,
      type: raw['type'] == 'video' ? 'video' : 'image',
      storagePath: raw['storagePath'] is String
          ? raw['storagePath'] as String
          : '',
      thumbnailUrl: raw['thumbnailUrl'] is String
          ? raw['thumbnailUrl'] as String
          : null,
      aspectRatio: ratio is num && ratio > 0 ? ratio.toDouble() : 4 / 3,
    );
  }

  Map<String, Object?> toMap() => {
    'url': url,
    'type': type,
    'storagePath': storagePath,
    if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
    'aspectRatio': aspectRatio,
  };
}

/// The public identity a member posts under inside the community.
///
/// Mirrors `communityProfiles/{uid}`. Everything here is world-readable — the
/// document deliberately carries no email, phone number or auth metadata.
class CommunityProfile {
  const CommunityProfile({
    required this.uid,
    required this.username,
    required this.displayName,
    this.bio = '',
    this.avatarUrl,
    this.bannerUrl,
    this.location = '',
    this.dialect = '',
    this.isVerified = false,
    this.createdAt,
  });

  final String uid;
  final String username;
  final String displayName;
  final String bio;
  final String? avatarUrl;
  final String? bannerUrl;
  final String location;
  final String dialect;
  final bool isVerified;
  final DateTime? createdAt;

  String get handle => '@$username';

  String get initials {
    final source = displayName.trim().isNotEmpty
        ? displayName.trim()
        : username.trim();
    if (source.isEmpty) return '·';
    final parts = source.split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }

  CommunityProfile copyWith({
    String? username,
    String? displayName,
    String? bio,
    String? avatarUrl,
    String? bannerUrl,
    String? location,
    String? dialect,
  }) => CommunityProfile(
    uid: uid,
    username: username ?? this.username,
    displayName: displayName ?? this.displayName,
    bio: bio ?? this.bio,
    avatarUrl: avatarUrl ?? this.avatarUrl,
    bannerUrl: bannerUrl ?? this.bannerUrl,
    location: location ?? this.location,
    dialect: dialect ?? this.dialect,
    isVerified: isVerified,
    createdAt: createdAt,
  );

  static CommunityProfile fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    return CommunityProfile(
      uid: doc.id,
      username: (data['username'] as String?) ?? doc.id,
      displayName: (data['displayName'] as String?)?.trim().isNotEmpty ?? false
          ? (data['displayName'] as String).trim()
          : 'Community member',
      bio: (data['bio'] as String?) ?? '',
      avatarUrl: _nonEmpty(data['avatarUrl']),
      bannerUrl: _nonEmpty(data['bannerUrl']),
      location: (data['location'] as String?) ?? '',
      dialect: (data['dialect'] as String?) ?? '',
      isVerified: data['isVerified'] == true,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, Object?> toCreateMap() => {
    'uid': uid,
    'username': username,
    'displayName': displayName,
    'bio': bio,
    'avatarUrl': avatarUrl,
    'bannerUrl': bannerUrl,
    'location': location,
    'dialect': dialect,
    'isVerified': false,
    'createdAt': FieldValue.serverTimestamp(),
    'updatedAt': FieldValue.serverTimestamp(),
  };

  /// The denormalised author stamp embedded on every post this profile writes,
  /// so the feed renders without a second read per post.
  Map<String, Object?> toAuthorStamp() => {
    'displayName': displayName,
    'username': username,
    'avatarUrl': avatarUrl,
  };
}

/// A post or reply in the community feed. Mirrors `communityPosts/{postId}`.
class CommunityPost {
  const CommunityPost({
    required this.id,
    required this.authorId,
    required this.authorName,
    required this.authorUsername,
    required this.text,
    required this.media,
    required this.likeCount,
    required this.replyCount,
    this.authorAvatarUrl,
    this.parentId,
    this.rootId,
    this.createdAt,
    this.kasemConfirmed = false,
    this.editedAt,
  });

  final String id;
  final String authorId;
  final String authorName;
  final String authorUsername;
  final String? authorAvatarUrl;
  final String text;
  final List<CommunityMedia> media;
  final int likeCount;
  final int replyCount;

  /// Null for a top-level post; the parent post id for a reply.
  final String? parentId;

  /// The top-level post a reply belongs to (equals [id] for top-level posts).
  final String? rootId;

  final DateTime? createdAt;
  final bool kasemConfirmed;
  final DateTime? editedAt;

  bool get isReply => parentId != null;
  bool get hasMedia => media.isNotEmpty;

  String get handle => '@$authorUsername';

  String get initials {
    final source = authorName.trim();
    if (source.isEmpty) return '·';
    final parts = source.split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }

  static CommunityPost fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    final author =
        (data['author'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final rawMedia = data['media'];
    return CommunityPost(
      id: doc.id,
      authorId: (data['authorId'] as String?) ?? '',
      authorName: (author['displayName'] as String?)?.trim().isNotEmpty ?? false
          ? (author['displayName'] as String).trim()
          : 'Community member',
      authorUsername: (author['username'] as String?) ?? 'member',
      authorAvatarUrl: _nonEmpty(author['avatarUrl']),
      text: (data['text'] as String?) ?? '',
      media: rawMedia is List
          ? rawMedia
                .map(CommunityMedia.fromMap)
                .whereType<CommunityMedia>()
                .toList(growable: false)
          : const <CommunityMedia>[],
      likeCount: _asInt(data['likeCount']),
      replyCount: _asInt(data['replyCount']),
      parentId: _nonEmpty(data['parentId']),
      rootId: _nonEmpty(data['rootId']),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      kasemConfirmed: data['kasemConfirmed'] == true,
      editedAt: (data['editedAt'] as Timestamp?)?.toDate(),
    );
  }
}

int _asInt(Object? value) => switch (value) {
  final int v => v,
  final num v => v.toInt(),
  _ => 0,
};

String? _nonEmpty(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

/// Relative age label used across the feed — `NOW`, `12 MIN`, `3 HR`, `5 D`.
String communityAgeLabel(DateTime? createdAt, {DateTime? now}) {
  if (createdAt == null) return 'NOW';
  final elapsed = (now ?? DateTime.now()).difference(createdAt);
  if (elapsed.isNegative || elapsed.inSeconds < 45) return 'NOW';
  if (elapsed.inMinutes < 60) return '${elapsed.inMinutes} MIN';
  if (elapsed.inHours < 24) return '${elapsed.inHours} HR';
  if (elapsed.inDays < 7) return '${elapsed.inDays} D';
  if (elapsed.inDays < 365) return '${(elapsed.inDays / 7).floor()} W';
  return '${(elapsed.inDays / 365).floor()} Y';
}

/// Compact count label — `1.2K`, `3M`, or the plain number.
String communityCountLabel(int value) {
  if (value <= 0) return '0';
  if (value >= 1000000) {
    final m = value / 1000000;
    return m % 1 == 0 ? '${m.toInt()}M' : '${m.toStringAsFixed(1)}M';
  }
  if (value >= 1000) {
    final k = value / 1000;
    return k % 1 == 0 ? '${k.toInt()}K' : '${k.toStringAsFixed(1)}K';
  }
  return '$value';
}

/// Normalises a proposed handle to the `[a-z0-9_]{3,20}` shape the community
/// username registry enforces. Returns an empty string when nothing survives.
String normaliseUsername(String raw) {
  final cleaned = raw
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9_]'), '')
      .replaceAll(RegExp(r'_{2,}'), '_');
  return cleaned.length > 20 ? cleaned.substring(0, 20) : cleaned;
}

/// `null` when [username] is acceptable, otherwise the reason to show a user.
String? validateUsername(String username) {
  if (username.length < 3) return 'Handles need at least 3 characters.';
  if (username.length > 20) return 'Handles can be at most 20 characters.';
  if (!RegExp(r'^[a-z0-9_]+$').hasMatch(username)) {
    return 'Use lowercase letters, numbers and underscores only.';
  }
  if (RegExp(r'^[0-9_]').hasMatch(username)) {
    return 'Handles must start with a letter.';
  }
  return null;
}
