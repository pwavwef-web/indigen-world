import 'package:cloud_firestore/cloud_firestore.dart';

// ── Sub-communities ─────────────────────────────────────────────────────────
//
// A sub-community is a named space inside the Community tab — a language
// circle, a hometown, a choir — with its own members, rules and feed.
//
// ── Where everything lives, and why ─────────────────────────────────────────
//
//   * `communitySpaces/{slug}`                   — the community itself
//   * `communitySpaces/{slug}/memberships/{uid}` — one row per member or request
//   * `communityPosts/{postId}`                  — posts in a PUBLIC community,
//                                                  tagged with `communityId`
//   * `communitySpaces/{slug}/posts/{postId}`    — posts in a PRIVATE community
//
// Not `communities`, which `packages/contracts` reserves for the admin-managed
// cultural registry (the Kassena community as a people, not a group chat).
//
// The slug is the document id, so uniqueness is the database's to enforce: a
// second community cannot be created over the first, whatever two phones race
// to do.
//
// Private posts live under the community rather than in `communityPosts` for a
// reason the Security Rules force. Firestore evaluates a list query against
// everything it *could* return, not what it does, so one private document
// inside `communityPosts` would make the public For you query unprovable and
// refuse it for everybody — or, if the rule were loosened to let that query
// through, hand the private post to anybody who asked. A path the rules can
// name is the only place "members only" is actually enforceable.
//
// Memberships sit under the community for the same reason: the rule for a
// private community's member list needs the community id in the path to check
// that the reader belongs to it.

/// Whether a community's feed and member list are open to everybody.
enum CommunityVisibility {
  public('public'),
  private('private');

  const CommunityVisibility(this.wire);

  final String wire;

  static CommunityVisibility fromWire(Object? raw) => raw == 'private'
      ? CommunityVisibility.private
      : CommunityVisibility.public;
}

/// What a community is about. Mirrored in the Security Rules.
enum CommunityCategory {
  language('language'),
  culture('culture'),
  music('music'),
  history('history'),
  faith('faith'),
  education('education'),
  hometown('hometown'),
  diaspora('diaspora'),
  youth('youth'),
  other('other');

  const CommunityCategory(this.wire);

  final String wire;

  static CommunityCategory fromWire(Object? raw) {
    for (final category in values) {
      if (category.wire == raw) return category;
    }
    return CommunityCategory.other;
  }
}

/// A member's standing inside one community, highest first.
enum CommunityRole {
  owner('owner'),
  admin('admin'),
  moderator('moderator'),
  member('member');

  const CommunityRole(this.wire);

  final String wire;

  static CommunityRole fromWire(Object? raw) {
    for (final role in values) {
      if (role.wire == raw) return role;
    }
    return CommunityRole.member;
  }

  /// May approve requests, remove members and take posts down.
  bool get canModerate => this != CommunityRole.member;

  /// May promote and demote below owner.
  bool get canAdminister =>
      this == CommunityRole.owner || this == CommunityRole.admin;

  /// Whether a member holding this role may act on somebody holding [other].
  ///
  /// Strictly above, never level: two moderators removing each other is a
  /// fight, not moderation.
  bool outranks(CommunityRole other) => index < other.index;
}

/// Where a membership row stands.
enum MembershipStatus {
  active('active'),
  pending('pending'),
  banned('banned');

  const MembershipStatus(this.wire);

  final String wire;

  static MembershipStatus fromWire(Object? raw) {
    for (final status in values) {
      if (status.wire == raw) return status;
    }
    return MembershipStatus.pending;
  }
}

/// Mirrors `communitySpaces/{slug}/memberships/{uid}`.
class CommunityMembership {
  const CommunityMembership({
    required this.communityId,
    required this.uid,
    required this.role,
    required this.status,
    this.createdAt,
  });

  final String communityId;
  final String uid;
  final CommunityRole role;
  final MembershipStatus status;
  final DateTime? createdAt;

  bool get isActive => status == MembershipStatus.active;
  bool get isPending => status == MembershipStatus.pending;
  bool get canModerate => isActive && role.canModerate;
  bool get canAdminister => isActive && role.canAdminister;

  static CommunityMembership fromMap(
    String communityId,
    String uid,
    Map<String, dynamic> data,
  ) => CommunityMembership(
    communityId: (data['communityId'] as String?) ?? communityId,
    uid: (data['uid'] as String?) ?? uid,
    role: CommunityRole.fromWire(data['role']),
    status: MembershipStatus.fromWire(data['status']),
    createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
  );
}

/// Mirrors `communitySpaces/{slug}`. World-readable, private communities included:
/// somebody has to be able to find a private community to ask to join it.
/// What a private community keeps to itself is its feed and its member list.
class CommunitySpace {
  const CommunitySpace({
    required this.id,
    required this.name,
    required this.ownerId,
    this.description = '',
    this.category = CommunityCategory.other,
    this.language = '',
    this.location = '',
    this.visibility = CommunityVisibility.public,
    this.avatarUrl,
    this.coverUrl,
    this.memberCount = 0,
    this.rules = const <String>[],
    this.status = 'active',
    this.createdAt,
  });

  /// The slug, which is also the document id.
  final String id;
  final String name;
  final String ownerId;
  final String description;
  final CommunityCategory category;

  /// The language the community mostly speaks, as its members name it.
  final String language;

  /// A town, a region or a cultural group.
  final String location;

  final CommunityVisibility visibility;
  final String? avatarUrl;
  final String? coverUrl;
  final int memberCount;
  final List<String> rules;

  /// `active`; `closed` once its owner shut it down; `removed` once staff
  /// took it down.
  final String status;

  final DateTime? createdAt;

  String get slug => id;
  bool get isPrivate => visibility == CommunityVisibility.private;
  bool get isAvailable => status == 'active';

  String get initials {
    final words = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .toList(growable: false);
    if (words.isEmpty) return '·';
    if (words.length == 1) {
      final word = words.first;
      return word.substring(0, word.length >= 2 ? 2 : 1).toUpperCase();
    }
    return '${words[0][0]}${words[1][0]}'.toUpperCase();
  }

  /// What a post published into this community carries about it.
  PostCommunityStamp toPostStamp() =>
      PostCommunityStamp(id: id, name: name, isPrivate: isPrivate);

  static CommunitySpace fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) =>
      fromMap(doc.id, doc.data() ?? const <String, dynamic>{});

  static CommunitySpace fromMap(String id, Map<String, dynamic> data) {
    final rawRules = data['rules'];
    return CommunitySpace(
      id: id,
      name: (data['name'] as String?)?.trim().isNotEmpty ?? false
          ? (data['name'] as String).trim()
          : id,
      ownerId: (data['ownerId'] as String?) ?? '',
      description: (data['description'] as String?) ?? '',
      category: CommunityCategory.fromWire(data['category']),
      language: (data['language'] as String?) ?? '',
      location: (data['location'] as String?) ?? '',
      visibility: CommunityVisibility.fromWire(data['visibility']),
      avatarUrl: _nonEmpty(data['avatarUrl']),
      coverUrl: _nonEmpty(data['coverUrl']),
      memberCount: switch (data['memberCount']) {
        final num value when value > 0 => value.toInt(),
        _ => 0,
      },
      rules: rawRules is List
          ? rawRules
                .whereType<String>()
                .map((rule) => rule.trim())
                .where((rule) => rule.isNotEmpty)
                .toList(growable: false)
          : const <String>[],
      status: (data['status'] as String?) ?? 'active',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

/// The part of a community a post carries with it, so a feed row can say where
/// it was posted without a community read per row.
class PostCommunityStamp {
  const PostCommunityStamp({
    required this.id,
    required this.name,
    required this.isPrivate,
  });

  final String id;
  final String name;
  final bool isPrivate;
}

/// Where the signed-in reader stands with one community — the single input the
/// join button, the composer and the locked feed all decide from.
enum CommunityAccess {
  /// Deleted, or taken down by staff.
  unavailable,

  /// Not signed in.
  guest,

  /// Signed in, not a member, nothing asked for.
  none,

  /// Asked to join a private community and waiting.
  pending,

  /// Removed and barred from coming back.
  banned,

  /// In.
  member,
}

CommunityAccess resolveCommunityAccess({
  required CommunitySpace? space,
  required String? uid,
  required CommunityMembership? membership,
}) {
  if (space == null || !space.isAvailable) return CommunityAccess.unavailable;
  if (uid == null) return CommunityAccess.guest;
  return switch (membership?.status) {
    MembershipStatus.active => CommunityAccess.member,
    MembershipStatus.pending => CommunityAccess.pending,
    MembershipStatus.banned => CommunityAccess.banned,
    null => CommunityAccess.none,
  };
}

/// Whether the reader may see a community's posts and members.
bool canReadCommunityContent(CommunitySpace space, CommunityAccess access) =>
    access != CommunityAccess.unavailable &&
    (!space.isPrivate || access == CommunityAccess.member);

// ── Creating one ────────────────────────────────────────────────────────────

const int kCommunityNameMin = 3;
const int kCommunityNameMax = 60;
const int kCommunitySlugMin = 3;
const int kCommunitySlugMax = 40;
const int kCommunityDescriptionMax = 500;
const int kCommunityLanguageMax = 60;
const int kCommunityLocationMax = 80;
const int kCommunityRuleMax = 200;
const int kCommunityRulesMax = 10;

/// The ceiling Storage enforces on community pictures.
const int kCommunityImageMaxBytes = 12 * 1024 * 1024;

/// Formats every phone can decode and every browser can show. HEIC is left out
/// on purpose: plenty of Android devices cannot draw one.
const Set<String> kCommunityImageExtensions = {'jpg', 'jpeg', 'png', 'webp'};

/// Addresses nobody may take, because the app or the project speaks under them.
const Set<String> reservedCommunitySlugs = {
  'admin',
  'communities',
  'create',
  'discover',
  'indigen',
  'indigenworld',
  'joined',
  'kawuri',
  'moderators',
  'new',
  'official',
  'search',
  'settings',
  'support',
};

/// What somebody filled in on the create form.
class CommunityDraft {
  const CommunityDraft({
    required this.name,
    required this.slug,
    this.description = '',
    this.category = CommunityCategory.language,
    this.language = '',
    this.location = '',
    this.visibility = CommunityVisibility.public,
    this.rules = const <String>[],
  });

  final String name;
  final String slug;
  final String description;
  final CommunityCategory category;
  final String language;
  final String location;
  final CommunityVisibility visibility;
  final List<String> rules;

  /// The rules worth keeping: trimmed, and without the blank lines a form
  /// leaves behind.
  List<String> get cleanRules => rules
      .map((rule) => rule.trim())
      .where((rule) => rule.isNotEmpty)
      .toList(growable: false);

  /// The first reason this draft cannot be published, or null.
  String? validate() =>
      validateCommunityName(name) ??
      validateCommunitySlug(slug) ??
      validateCommunityDescription(description) ??
      validateCommunityShortText(language, kCommunityLanguageMax, 'Language') ??
      validateCommunityShortText(location, kCommunityLocationMax, 'Location') ??
      validateCommunityRules(cleanRules);

  Map<String, Object?> toCreateMap({required String ownerId}) {
    final trimmedName = name.trim();
    return {
      'slug': slug,
      'name': trimmedName,
      'nameLower': trimmedName.toLowerCase(),
      'description': description.trim(),
      'category': category.wire,
      'language': language.trim(),
      'location': location.trim(),
      'visibility': visibility.wire,
      'ownerId': ownerId,
      'memberCount': 1,
      'rules': cleanRules,
      'status': 'active',
      'searchTokens': communitySearchTokens(
        name: trimmedName,
        slug: slug,
        language: language,
        location: location,
        category: category.wire,
      ),
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };
  }
}

String? validateCommunityName(String raw) {
  final name = raw.trim();
  if (name.isEmpty) return 'Give the community a name.';
  if (name.length < kCommunityNameMin) {
    return 'Names need at least $kCommunityNameMin characters.';
  }
  if (name.length > kCommunityNameMax) {
    return 'Names can be at most $kCommunityNameMax characters.';
  }
  if (communityFold(name).replaceAll(RegExp('[^a-z0-9]'), '').isEmpty) {
    return 'Use at least one letter or number in the name.';
  }
  return null;
}

String? validateCommunitySlug(String slug) {
  if (slug.isEmpty) return 'Choose an address for the community.';
  if (slug.length < kCommunitySlugMin) {
    return 'Addresses need at least $kCommunitySlugMin characters.';
  }
  if (slug.length > kCommunitySlugMax) {
    return 'Addresses can be at most $kCommunitySlugMax characters.';
  }
  if (!RegExp(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$').hasMatch(slug) ||
      slug.contains('--')) {
    return 'Use lowercase letters, numbers and single hyphens.';
  }
  if (reservedCommunitySlugs.contains(slug)) {
    return 'That address is reserved by Indigen World.';
  }
  return null;
}

String? validateCommunityDescription(String raw) {
  if (raw.trim().length > kCommunityDescriptionMax) {
    return 'Descriptions can be at most $kCommunityDescriptionMax characters.';
  }
  return null;
}

String? validateCommunityShortText(String raw, int max, String label) {
  if (raw.trim().length > max) return '$label can be at most $max characters.';
  return null;
}

String? validateCommunityRules(List<String> rules) {
  if (rules.length > kCommunityRulesMax) {
    return 'Keep it to $kCommunityRulesMax rules or fewer.';
  }
  for (final rule in rules) {
    if (rule.trim().length > kCommunityRuleMax) {
      return 'Each rule can be at most $kCommunityRuleMax characters.';
    }
  }
  return null;
}

/// Null when a picture at [path] weighing [bytes] may be uploaded.
String? validateCommunityImage({required String path, required int bytes}) {
  final name = path.split(RegExp(r'[\\/]')).last;
  final extension = name.contains('.')
      ? name.split('.').last.toLowerCase()
      : '';
  if (!kCommunityImageExtensions.contains(extension)) {
    return 'Use a JPG, PNG or WebP picture.';
  }
  if (bytes <= 0) return 'That picture could not be read.';
  if (bytes > kCommunityImageMaxBytes) {
    return 'Pictures need to be under 12 MB.';
  }
  return null;
}

/// Letters the community writes with that a URL cannot carry, and what they
/// fold to. Kasem's own letters first, then the accents a French or Twi name
/// is likely to bring.
const Map<String, String> _folds = {
  'ɔ': 'o',
  'ɛ': 'e',
  'ŋ': 'ng',
  'ɩ': 'i',
  'ɪ': 'i',
  'ʋ': 'u',
  'ʊ': 'u',
  'ə': 'e',
  'ɣ': 'g',
  'ƒ': 'f',
  'ß': 'ss',
  'æ': 'ae',
  'œ': 'oe',
  'ø': 'o',
  'à': 'a',
  'á': 'a',
  'â': 'a',
  'ã': 'a',
  'ä': 'a',
  'ǎ': 'a',
  'å': 'a',
  'ç': 'c',
  'è': 'e',
  'é': 'e',
  'ê': 'e',
  'ë': 'e',
  'ě': 'e',
  'ì': 'i',
  'í': 'i',
  'î': 'i',
  'ï': 'i',
  'ǐ': 'i',
  'ñ': 'n',
  'ò': 'o',
  'ó': 'o',
  'ô': 'o',
  'õ': 'o',
  'ö': 'o',
  'ǒ': 'o',
  'ù': 'u',
  'ú': 'u',
  'û': 'u',
  'ü': 'u',
  'ǔ': 'u',
  'ý': 'y',
  'ÿ': 'y',
};

/// [raw] lowercased with tone marks dropped and special letters folded to the
/// plain Latin a search box or an address can hold.
String communityFold(String raw) {
  final buffer = StringBuffer();
  for (final rune in raw.toLowerCase().runes) {
    // Combining diacritics — the tone marks Kasem writes over vowels.
    if (rune >= 0x0300 && rune <= 0x036F) continue;
    final character = String.fromCharCode(rune);
    buffer.write(_folds[character] ?? character);
  }
  return buffer.toString();
}

/// The address a community named [name] would get.
String slugifyCommunityName(String name) {
  final slug = communityFold(name)
      .replaceAll(RegExp('[^a-z0-9]+'), '-')
      .replaceAll(RegExp('-{2,}'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  if (slug.length <= kCommunitySlugMax) return slug;
  return slug.substring(0, kCommunitySlugMax).replaceAll(RegExp(r'-+$'), '');
}

/// The words a search can find a community by, and every prefix of them.
///
/// Firestore has no text search. Storing prefixes lets one `array-contains`
/// match somebody halfway through typing "Navrongo", and the cap keeps the
/// array small enough to index cheaply.
List<String> communitySearchTokens({
  required String name,
  required String slug,
  String language = '',
  String location = '',
  String category = '',
  int? cap = 120,
}) {
  final tokens = <String>{};
  for (final source in [name, language, location, category, slug]) {
    for (final word in communityFold(source).split(RegExp('[^a-z0-9]+'))) {
      if (word.length < 2) continue;
      final longest = word.length > 15 ? 15 : word.length;
      for (var end = 2; end <= longest; end++) {
        tokens.add(word.substring(0, end));
      }
    }
  }
  return (cap == null ? tokens : tokens.take(cap)).toList(growable: false);
}

/// The query words, folded and trimmed the same way the tokens were.
List<String> communityQueryWords(String query) => [
  for (final word in communityFold(query).split(RegExp('[^a-z0-9]+')))
    if (word.length >= 2) word.length > 15 ? word.substring(0, 15) : word,
];

/// Whether [space] answers every word of [query] in its name, language,
/// location, category or address.
bool communityMatchesQuery(CommunitySpace space, String query) {
  final words = communityQueryWords(query);
  if (words.isEmpty) return false;
  final tokens = communitySearchTokens(
    name: space.name,
    slug: space.id,
    language: space.language,
    location: space.location,
    category: space.category.wire,
    cap: null,
  ).toSet();
  return words.every(tokens.contains);
}

String? _nonEmpty(Object? value) =>
    value is String && value.isNotEmpty ? value : null;
