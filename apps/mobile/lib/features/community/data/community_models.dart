import 'package:cloud_firestore/cloud_firestore.dart';

/// A single photo or video attached to a community post.
class CommunityMedia {
  const CommunityMedia({
    required this.url,
    required this.type,
    this.storagePath = '',
    this.thumbnailUrl,
    this.aspectRatio = 4 / 3,
    this.durationSeconds,
  });

  /// Public download URL of the uploaded file.
  final String url;

  /// `'image'` or `'video'`.
  final String type;

  /// Storage object path, kept so the owner can delete the file with the post.
  final String storagePath;

  final String? thumbnailUrl;
  final double aspectRatio;
  final int? durationSeconds;

  bool get isVideo => type == 'video';
  bool get isAudio => type == 'audio';

  static CommunityMedia? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final url = raw['url'];
    if (url is! String || url.isEmpty) return null;
    final ratio = raw['aspectRatio'];
    return CommunityMedia(
      url: url,
      type: switch (raw['type']) {
        'video' => 'video',
        'audio' => 'audio',
        _ => 'image',
      },
      storagePath: raw['storagePath'] is String
          ? raw['storagePath'] as String
          : '',
      thumbnailUrl: raw['thumbnailUrl'] is String
          ? raw['thumbnailUrl'] as String
          : null,
      aspectRatio: ratio is num && ratio > 0 ? ratio.toDouble() : 4 / 3,
      durationSeconds: raw['durationSeconds'] is num
          ? (raw['durationSeconds'] as num).toInt()
          : null,
    );
  }

  Map<String, Object?> toMap() => {
    'url': url,
    'type': type,
    'storagePath': storagePath,
    if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
    'aspectRatio': aspectRatio,
    if (durationSeconds != null) 'durationSeconds': durationSeconds,
  };
}

/// One answer in a community poll.
class CommunityPollOption {
  const CommunityPollOption({
    required this.id,
    required this.text,
    this.voteCount = 0,
  });

  final String id;
  final String text;
  final int voteCount;

  static CommunityPollOption? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'];
    final text = raw['text'];
    if (id is! String || id.isEmpty || text is! String || text.trim().isEmpty) {
      return null;
    }
    return CommunityPollOption(
      id: id,
      text: text.trim(),
      voteCount: _asInt(raw['voteCount']),
    );
  }

  Map<String, Object?> toMap() => {
    'id': id,
    'text': text,
    'voteCount': voteCount,
  };
}

/// Poll metadata embedded in a post. A member's selection lives in the private
/// `communityPollVotes` edge collection rather than in this public object.
class CommunityPoll {
  const CommunityPoll({
    required this.options,
    required this.endsAt,
    this.totalVotes = 0,
  });

  final List<CommunityPollOption> options;
  final DateTime endsAt;
  final int totalVotes;

  bool get hasEnded => DateTime.now().isAfter(endsAt);

  static CommunityPoll? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final rawOptions = raw['options'];
    final rawEndsAt = raw['endsAt'];
    if (rawOptions is! List) return null;
    final options = rawOptions
        .map(CommunityPollOption.fromMap)
        .whereType<CommunityPollOption>()
        .toList(growable: false);
    final endsAt = switch (rawEndsAt) {
      final Timestamp value => value.toDate(),
      final DateTime value => value,
      _ => null,
    };
    if (options.length < 2 || endsAt == null) return null;
    return CommunityPoll(
      options: options,
      endsAt: endsAt,
      totalVotes: _asInt(raw['totalVotes']),
    );
  }

  /// This poll with [optionId] guaranteed to show at least the one ballot we
  /// know was cast.
  ///
  /// The authoritative tally lives on the post and is written by a Cloud
  /// Function a moment after the ballot lands in `communityPollVotes`. Between
  /// the tap and that write the post still carries its pre-vote totals, so a
  /// member who has just voted would watch their own choice sit at 0% — which
  /// reads as a vote that was thrown away. Taking the larger of the two keeps
  /// the server figure the instant it catches up, and leaves every option the
  /// member did not choose untouched.
  CommunityPoll includingBallot(String? optionId) {
    if (optionId == null) return this;
    var adjusted = false;
    final counted = options.map((option) {
      if (option.id != optionId || option.voteCount > 0) return option;
      adjusted = true;
      return CommunityPollOption(id: option.id, text: option.text, voteCount: 1);
    }).toList(growable: false);
    if (!adjusted) return this;
    return CommunityPoll(
      options: counted,
      endsAt: endsAt,
      totalVotes: totalVotes < 1 ? 1 : totalVotes,
    );
  }

  Map<String, Object?> toMap() => {
    'options': options.map((option) => option.toMap()).toList(growable: false),
    'endsAt': Timestamp.fromDate(endsAt),
    'totalVotes': totalVotes,
  };
}

/// The public identity a member posts under inside the community.
///
/// What the app draws beside a name, and what it is claiming.
///
/// ── Why four, and why they rest on a phone ────────────────────────────────
/// A single "verified" boolean answered a question nobody was asking. In a
/// cultural archive the useful thing to say is not *that* somebody is trusted
/// but *why*: the project itself, a custodian of the language, or somebody who
/// has published into the collection. Those three are granted by staff and
/// cannot be claimed.
///
/// Underneath all of them is [member], which is not granted by anybody: it is
/// what a phone number proves. **A granted kind shows nothing until the phone
/// is verified too** — a badge that says the project vouches for someone should
/// not sit above an account that could belong to no one. A tier waiting on a
/// phone is pending, not denied, and the member is told so.
enum VerifiedMark {
  /// No mark at all.
  none,

  /// A real person behind a real number. Earned, not granted.
  member,

  /// Has published into the collection.
  creator,

  /// A recognised custodian of the language — chiefs, elders, linguists.
  elder,

  /// Indigen World and Project Kassena themselves.
  project;

  /// The stored value. [member] is derived rather than stored: it is the phone,
  /// not a decision anybody made.
  static VerifiedMark fromKind(Object? raw) => switch (raw) {
    'project' => VerifiedMark.project,
    'elder' => VerifiedMark.elder,
    'creator' => VerifiedMark.creator,
    _ => VerifiedMark.none,
  };

  /// What goes back into `verifiedKind`.
  String get kind => switch (this) {
    VerifiedMark.project => 'project',
    VerifiedMark.elder => 'elder',
    VerifiedMark.creator => 'creator',
    // Neither of these is a stored kind.
    VerifiedMark.member || VerifiedMark.none => '',
  };

  /// Whether staff granted this rather than the member earning it.
  bool get isGranted => kind.isNotEmpty;
}

/// The mark to draw, given what was granted and whether a phone backs it.
///
/// One function, used by the profile, by a post's author stamp and by the admin
/// console, so the rule cannot drift between the places that apply it.
///
/// [VerifiedMark.project] is the single exception to the phone gate, and for a
/// reason rather than for convenience: the phone exists to prove *a person* is
/// behind an account, and the project's own accounts — the assistant among them
/// — are not people. The project is its own guarantor there. An elder or a
/// creator is a person, so for them the number is exactly the right anchor and
/// the mark waits for it.
VerifiedMark resolveVerifiedMark({
  required String verifiedKind,
  required bool phoneVerified,
}) {
  final granted = VerifiedMark.fromKind(verifiedKind);
  if (granted == VerifiedMark.project) return granted;
  if (!phoneVerified) return VerifiedMark.none;
  return granted == VerifiedMark.none ? VerifiedMark.member : granted;
}

/// Mirrors `communityProfiles/{uid}`. Everything here is world-readable — the
/// document deliberately carries no email, phone number or auth metadata: a
/// verified phone is recorded as a flag and a one-way hash, never as a number
/// anybody could read off the feed.
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
    this.verifiedKind = '',
    this.phoneVerified = false,
    this.usernameChangedAt,
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

  /// What staff granted, if anything: `''`, `'creator'`, `'elder'` or
  /// `'project'`. Frozen against the member's own writes in the rules.
  final String verifiedKind;

  /// Whether an SMS code was answered from this account's number. Written only
  /// by the verification callable.
  final bool phoneVerified;

  /// When the one-time Kassena name claim was used, or null while it is still
  /// available. Written only by `claimKasemHandle`.
  final DateTime? usernameChangedAt;

  /// Whether this member may still take a Kassena name.
  bool get canClaimKasemName => usernameChangedAt == null;

  final DateTime? createdAt;

  /// The mark this profile actually draws.
  VerifiedMark get mark => resolveVerifiedMark(
    verifiedKind: verifiedKind,
    phoneVerified: phoneVerified,
  );

  /// A kind that has been granted but is waiting on a phone number. Shown to
  /// the member in Settings so a badge that has not appeared is explained
  /// rather than mysterious.
  bool get hasPendingVerification =>
      !phoneVerified && mark == VerifiedMark.none && verifiedKind.isNotEmpty;

  /// Kept for the call sites that only ask "is there a mark".
  bool get isVerified => mark != VerifiedMark.none;

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
    verifiedKind: verifiedKind,
    phoneVerified: phoneVerified,
    usernameChangedAt: usernameChangedAt,
    createdAt: createdAt,
  );

  static CommunityProfile fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) =>
      fromMap(doc.id, doc.data() ?? const <String, dynamic>{});

  /// The field mapping on its own, away from Firestore.
  ///
  /// Split out for the same reason [CommunityPost.fromMap] is: reading a
  /// document and interpreting one are different jobs, and only the second is
  /// worth testing.
  static CommunityProfile fromMap(String uid, Map<String, dynamic> data) {
    return CommunityProfile(
      uid: uid,
      username: (data['username'] as String?) ?? uid,
      displayName: (data['displayName'] as String?)?.trim().isNotEmpty ?? false
          ? (data['displayName'] as String).trim()
          : 'Community member',
      bio: (data['bio'] as String?) ?? '',
      avatarUrl: _firstNonEmpty(data, const [
        'avatarUrl',
        'photoUrl',
        'photoURL',
        'avatar',
        'imageUrl',
      ]),
      bannerUrl: _firstNonEmpty(data, const [
        'bannerUrl',
        'coverUrl',
        'coverPhotoUrl',
      ]),
      location: (data['location'] as String?) ?? '',
      dialect: (data['dialect'] as String?) ?? '',
      // A profile written before verification had kinds carries only the old
      // boolean. Nothing in the app could ever set it, so one that is true was
      // set by hand in the console — and that means the project itself.
      verifiedKind: data['verifiedKind'] is String
          ? data['verifiedKind'] as String
          : (data['isVerified'] == true ? 'project' : ''),
      phoneVerified: data['phoneVerified'] == true,
      usernameChangedAt: (data['usernameChangedAt'] as Timestamp?)?.toDate(),
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
    // Both are the server's to set, and the rules refuse a create that says
    // otherwise. Written explicitly so that refusal is obvious rather than
    // resting on a field being absent.
    'verifiedKind': '',
    'phoneVerified': false,
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
    // Both halves travel with the post, so the feed can work out the mark
    // without a profile read per row.
    'verifiedKind': verifiedKind,
    'phoneVerified': phoneVerified,
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
    this.repostCount = 0,
    this.quoteCount = 0,
    this.viewCount = 0,
    this.authorAvatarUrl,
    this.authorVerifiedKind = '',
    this.authorPhoneVerified = false,
    this.parentId,
    this.rootId,
    this.quotedPostId,
    this.quotedPost,
    this.poll,
    this.createdAt,
    this.kasemConfirmed = false,
    this.editedAt,
    this.resharedById,
    this.resharedByName,
    this.resharedByUsername,
    this.resharedByAvatarUrl,
    this.resharedAt,
  });

  final String id;
  final String authorId;
  final String authorName;
  final String authorUsername;
  final String? authorAvatarUrl;

  /// The author's verification, stamped on the post at write time so a feed of
  /// forty rows does not cost forty profile reads to draw forty names.
  final String authorVerifiedKind;
  final bool authorPhoneVerified;

  /// The mark to draw beside this post's byline.
  VerifiedMark get authorMark => resolveVerifiedMark(
    verifiedKind: authorVerifiedKind,
    phoneVerified: authorPhoneVerified,
  );

  final String text;
  final List<CommunityMedia> media;
  final int likeCount;
  final int replyCount;
  final int repostCount;
  final int quoteCount;
  final int viewCount;

  /// Null for a top-level post; the parent post id for a reply.
  final String? parentId;

  /// The top-level post a reply belongs to (equals [id] for top-level posts).
  final String? rootId;

  /// A quote is a normal post with its own text and engagement, plus this
  /// immutable snapshot of the post it is responding to.
  final String? quotedPostId;
  final CommunityPost? quotedPost;
  final CommunityPoll? poll;

  final DateTime? createdAt;
  final bool kasemConfirmed;
  final DateTime? editedAt;

  /// Feed-only activity metadata, hydrated from `communityReposts`. It is not
  /// part of the canonical post document and never changes ownership.
  final String? resharedById;
  final String? resharedByName;
  final String? resharedByUsername;
  final String? resharedByAvatarUrl;
  final DateTime? resharedAt;

  bool get isReply => parentId != null;
  bool get hasMedia => media.isNotEmpty;
  bool get isQuote => quotedPostId != null && quotedPost != null;
  bool get hasPoll => poll != null;
  bool get isResharedFeedItem => resharedById != null;
  bool get isEdited => editedAt != null;
  int get reshareAndQuoteCount => repostCount + quoteCount;
  DateTime? get feedTimestamp => resharedAt ?? createdAt;

  String? get firstLink {
    final match = RegExp(
      r'https?://[^\s<>()]+',
      caseSensitive: false,
    ).firstMatch(text);
    if (match == null) return null;
    return match.group(0)?.replaceFirst(RegExp(r'[.,!?;:]+$'), '');
  }

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

  static CommunityPost fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) =>
      fromMap(doc.id, doc.data() ?? const <String, dynamic>{});

  static CommunityPost fromMap(String id, Map<String, dynamic> data) {
    final author = _stringMap(data['author']);
    final rawMedia = data['media'];
    return CommunityPost(
      id: id,
      authorId: (data['authorId'] as String?) ?? '',
      authorName: (author['displayName'] as String?)?.trim().isNotEmpty ?? false
          ? (author['displayName'] as String).trim()
          : 'Community member',
      authorUsername: (author['username'] as String?) ?? 'member',
      authorAvatarUrl: _firstNonEmpty(author, const [
        'avatarUrl',
        'photoUrl',
        'photoURL',
        'avatar',
        'imageUrl',
      ]),
      authorVerifiedKind: author['verifiedKind'] is String
          ? author['verifiedKind'] as String
          : (author['isVerified'] == true ? 'project' : ''),
      authorPhoneVerified: author['phoneVerified'] == true,
      text: (data['text'] as String?) ?? '',
      media: rawMedia is List
          ? rawMedia
                .map(CommunityMedia.fromMap)
                .whereType<CommunityMedia>()
                .toList(growable: false)
          : const <CommunityMedia>[],
      likeCount: _asInt(data['likeCount']),
      replyCount: _asInt(data['replyCount']),
      repostCount: _asInt(data['repostCount']),
      quoteCount: _asInt(data['quoteCount']),
      viewCount: _asInt(data['viewCount']),
      parentId: _nonEmpty(data['parentId']),
      rootId: _nonEmpty(data['rootId']),
      quotedPostId: _nonEmpty(data['quotedPostId']),
      quotedPost: _communityPostFromNested(data['quotedPost']),
      poll: CommunityPoll.fromMap(data['poll']),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      kasemConfirmed: data['kasemConfirmed'] == true,
      editedAt: (data['editedAt'] as Timestamp?)?.toDate(),
    );
  }

  CommunityPost withReshare({
    required String uid,
    required String displayName,
    required String username,
    required DateTime? createdAt,
    String? avatarUrl,
  }) => CommunityPost(
    id: id,
    authorId: authorId,
    authorName: authorName,
    authorUsername: authorUsername,
    authorAvatarUrl: authorAvatarUrl,
    authorVerifiedKind: authorVerifiedKind,
    authorPhoneVerified: authorPhoneVerified,
    text: text,
    media: media,
    likeCount: likeCount,
    replyCount: replyCount,
    repostCount: repostCount,
    quoteCount: quoteCount,
    viewCount: viewCount,
    parentId: parentId,
    rootId: rootId,
    quotedPostId: quotedPostId,
    quotedPost: quotedPost,
    poll: poll,
    createdAt: this.createdAt,
    kasemConfirmed: kasemConfirmed,
    editedAt: editedAt,
    resharedById: uid,
    resharedByName: displayName,
    resharedByUsername: username,
    resharedByAvatarUrl: avatarUrl,
    resharedAt: createdAt,
  );

  /// Immutable snapshot embedded in a quote post so the quote remains legible
  /// if the source author later edits their profile or removes the source.
  Map<String, Object?> toQuoteSnapshot() => {
    'id': id,
    'authorId': authorId,
    'author': {
      'displayName': authorName,
      'username': authorUsername,
      'avatarUrl': authorAvatarUrl,
      'verifiedKind': authorVerifiedKind,
      'phoneVerified': authorPhoneVerified,
    },
    'text': text,
    'media': media.map((item) => item.toMap()).toList(growable: false),
    'likeCount': likeCount,
    'replyCount': replyCount,
    'repostCount': repostCount,
    'quoteCount': quoteCount,
    'viewCount': viewCount,
    'createdAt': createdAt == null ? null : Timestamp.fromDate(createdAt!),
  };
}

int _asInt(Object? value) => switch (value) {
  final int v => v,
  final num v => v.toInt(),
  _ => 0,
};

String? _nonEmpty(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

Map<String, dynamic> _stringMap(Object? value) {
  if (value is! Map) return const <String, dynamic>{};
  return value.map((key, value) => MapEntry(key.toString(), value));
}

String? _firstNonEmpty(Map<String, dynamic> data, List<String> keys) {
  for (final key in keys) {
    final value = _nonEmpty(data[key]);
    if (value != null) return value;
  }
  return null;
}

CommunityPost? _communityPostFromNested(Object? raw) {
  final data = _stringMap(raw);
  final id = _nonEmpty(data['id']);
  if (id == null) return null;
  return CommunityPost.fromMap(id, data);
}

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
/// Handles the platform speaks under, which no member may register.
///
/// `kawuri` is the assistant: a post naming it is answered by the backend, so
/// a member holding the handle would be shouted over by a machine in their own
/// replies.
const reservedUsernames = {
  'kawuri',
  'indigen',
  'indigenworld',
  'admin',
  'support',
};

String? validateUsername(String username) {
  if (reservedUsernames.contains(username)) {
    return 'That handle is reserved by Indigen World.';
  }
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
