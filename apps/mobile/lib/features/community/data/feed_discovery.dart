import 'package:indigen_world_mobile/features/community/data/community_models.dart';

// ── Discovery inside the feed ───────────────────────────────────────────────
//
// "New voices" used to be a permanent rail across the top of the Community
// tab: the first thing anybody saw, every time, above the writing they came
// for. It now arrives the way a recommendation should — once, a few posts in,
// between two posts rather than over either.

/// The row the discovery module occupies in a built feed.
///
/// A marker rather than a widget, so the list of rows stays plain data that a
/// test can inspect and the builder can key.
class DiscoveryRow {
  const DiscoveryRow();
}

/// How many ordinary posts a reader passes before the module.
const int kDiscoveryAfterPosts = 3;

/// A feed shorter than this carries no module at all. Two posts and a block of
/// strangers to follow is a page that is mostly an advert for other people.
const int kDiscoveryMinimumPosts = 2;

/// [rows] with [module] placed after the [afterPosts]th post.
///
/// Counts posts, not rows: an advert already spliced in does not bring the
/// module forward. When the feed has at least [minimumPosts] but fewer than
/// [afterPosts], the module goes after the last post rather than being lost.
/// Never inserted twice, never first, and never adjacent to the top of the
/// list — the reader always meets writing before recommendations.
List<Object> insertDiscoveryRow({
  required List<Object> rows,
  required bool Function(Object row) isPost,
  Object module = const DiscoveryRow(),
  int afterPosts = kDiscoveryAfterPosts,
  int minimumPosts = kDiscoveryMinimumPosts,
}) {
  if (rows.any((row) => row is DiscoveryRow || identical(row, module))) {
    return rows;
  }
  final postCount = rows.where(isPost).length;
  if (postCount < minimumPosts || afterPosts < 1) return rows;
  final target = postCount < afterPosts ? postCount : afterPosts;
  var seen = 0;
  for (var index = 0; index < rows.length; index++) {
    if (!isPost(rows[index])) continue;
    seen++;
    if (seen == target) {
      return [
        ...rows.sublist(0, index + 1),
        module,
        ...rows.sublist(index + 1),
      ];
    }
  }
  return rows;
}

/// Why a profile is being suggested — the one line under its name.
enum VoiceReason {
  /// Shares a community with the reader.
  sharedCommunity,

  /// Writes in the reader's dialect or comes from their town.
  sameDialect,

  /// Has published into the collection, or is a recognised custodian.
  creator,

  /// Posted in the feed the reader is looking at.
  activeNow,

  /// Joined recently.
  newMember,
}

/// A profile worth following and the reason given for it.
class VoiceSuggestion {
  const VoiceSuggestion({
    required this.profile,
    required this.reason,
    required this.score,
  });

  final CommunityProfile profile;
  final VoiceReason reason;
  final int score;
}

/// How long a profile counts as new.
const Duration kNewVoiceWindow = Duration(days: 45);

/// Ranks [candidates] for the discovery module.
///
/// Excludes the reader, anyone they already follow, and anyone they have
/// muted or blocked — a recommendation to follow somebody you blocked is the
/// kind of mistake that ends trust in the whole feature. What is left is
/// scored on what the product wants more of: new contributors, people writing
/// in the reader's own dialect, members of the communities they joined,
/// accounts active right now, and profiles complete enough to be worth
/// visiting. Ties keep the order the candidates arrived in, which is newest
/// first.
List<VoiceSuggestion> rankVoiceSuggestions({
  required List<CommunityProfile> candidates,
  required String? viewerUid,
  required Set<String> following,
  Set<String> excluded = const {},
  String viewerDialect = '',
  String viewerLocation = '',
  Set<String> communityPeers = const {},
  Set<String> activeAuthors = const {},
  DateTime? now,
  int limit = 12,
}) {
  final moment = now ?? DateTime.now();
  final dialect = viewerDialect.trim().toLowerCase();
  final location = viewerLocation.trim().toLowerCase();
  final seen = <String>{};
  final ranked = <(int, int, VoiceSuggestion)>[];

  for (var order = 0; order < candidates.length; order++) {
    final profile = candidates[order];
    if (profile.uid.isEmpty ||
        profile.uid == viewerUid ||
        following.contains(profile.uid) ||
        excluded.contains(profile.uid) ||
        !seen.add(profile.uid)) {
      continue;
    }

    final isNew =
        profile.createdAt != null &&
        moment.difference(profile.createdAt!) <= kNewVoiceWindow;
    final sameDialect =
        (dialect.isNotEmpty &&
            profile.dialect.trim().toLowerCase() == dialect) ||
        (location.isNotEmpty &&
            profile.location.trim().toLowerCase() == location);
    final isPeer = communityPeers.contains(profile.uid);
    final isActive = activeAuthors.contains(profile.uid);
    final isCreator =
        profile.mark == VerifiedMark.creator ||
        profile.mark == VerifiedMark.elder;
    final hasAvatar = (profile.avatarUrl ?? '').isNotEmpty;
    final hasBio = profile.bio.trim().isNotEmpty;

    var score = 0;
    if (isPeer) score += 4;
    if (sameDialect) score += 3;
    if (isNew) score += 3;
    if (isCreator) score += 2;
    if (isActive) score += 2;
    if (hasAvatar) score += 1;
    if (hasBio) score += 1;
    // An account with no picture, no bio and the placeholder name is not a
    // voice yet, however new it is.
    if (!hasAvatar && !hasBio && profile.displayName == 'Community member') {
      score -= 4;
    }

    final reason = isPeer
        ? VoiceReason.sharedCommunity
        : sameDialect
        ? VoiceReason.sameDialect
        : isCreator
        ? VoiceReason.creator
        : isActive
        ? VoiceReason.activeNow
        : VoiceReason.newMember;
    ranked.add((
      score,
      order,
      VoiceSuggestion(profile: profile, reason: reason, score: score),
    ));
  }

  ranked.sort((a, b) {
    final byScore = b.$1.compareTo(a.$1);
    return byScore != 0 ? byScore : a.$2.compareTo(b.$2);
  });
  return [
    for (final entry in ranked.take(limit))
      if (entry.$1 > 0) entry.$3,
  ];
}
