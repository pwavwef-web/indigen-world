import 'package:indigen_world_mobile/features/community/data/community_models.dart';

/// Gives recent, low-exposure posts another honest chance near the top.
///
/// The feed remains mostly chronological: the five newest rows never move and
/// at most three eligible posts are lifted, with a full run of ordinary rows
/// between them. A lift is only available to an original post that is between
/// eight hours and seven days old and still has fewer than fifteen views.
/// Reshares are excluded because somebody has already actively resurfaced them.
List<CommunityPost> preventPostBurial(
  List<CommunityPost> posts, {
  DateTime? now,
}) {
  const firstCandidateIndex = 8;
  const firstLiftIndex = 5;
  const liftCadence = 8;
  const maxLifts = 3;
  const viewCeiling = 15;
  const minimumAge = Duration(hours: 8);
  const maximumAge = Duration(days: 7);

  if (posts.length <= firstCandidateIndex) return posts;
  final clock = now ?? DateTime.now();
  final candidates = <CommunityPost>[];
  for (var index = firstCandidateIndex; index < posts.length; index++) {
    final post = posts[index];
    final timestamp = post.createdAt;
    if (timestamp == null || post.isResharedFeedItem) continue;
    final age = clock.difference(timestamp);
    if (age < minimumAge || age > maximumAge || post.viewCount >= viewCeiling) {
      continue;
    }
    candidates.add(post);
  }
  if (candidates.isEmpty) return posts;

  // Least-seen first. Age breaks a tie so the post closest to falling outside
  // the seven-day rescue window gets its chance before a newer one.
  candidates.sort((left, right) {
    final byViews = left.viewCount.compareTo(right.viewCount);
    if (byViews != 0) return byViews;
    final leftAt = left.createdAt!;
    final rightAt = right.createdAt!;
    final byAge = leftAt.compareTo(rightAt);
    return byAge != 0 ? byAge : left.id.compareTo(right.id);
  });

  final availableSlots = ((posts.length - firstLiftIndex) / liftCadence).ceil();
  final liftCount = candidates.length < availableSlots
      ? candidates.length
      : availableSlots < maxLifts
      ? availableSlots
      : maxLifts;
  final lifted = candidates.take(liftCount).toList(growable: false);
  final remaining = posts.where((post) => !lifted.contains(post)).toList();

  for (var index = 0; index < lifted.length; index++) {
    final target = firstLiftIndex + (index * liftCadence);
    remaining.insert(target.clamp(0, remaining.length), lifted[index]);
  }
  return List.unmodifiable(remaining);
}
