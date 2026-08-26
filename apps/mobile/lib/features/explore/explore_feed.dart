import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

/// What Explore actually shows.
///
/// Two sources, one feed. Published TribeStudio work is the archive: reviewed,
/// licensed, permanent. Community videos are the living side of the same
/// project — a drumming clip somebody filmed at a funeral this morning — and
/// they were previously invisible to anyone who did not open the Community
/// tab, while Explore sat on three stock photos.
///
/// Merging them is a judgement call, and it comes with conditions:
///
///   * Only whole posts, never replies. A reply is part of a conversation and
///     makes no sense arriving alone at full screen.
///   * Only videos. Explore is a video surface; a photo post belongs in the
///     feed it was written for.
///   * Community reels are labelled as such and keep their community
///     identity — the same likes, the same replies, the same profile.
///   * Muted, blocked and hidden authors are already filtered out upstream by
///     [communityFeedProvider], so somebody a member has silenced cannot reach
///     them through a different tab.
///
/// Published work leads. Not because it is better, but because it is what the
/// archive exists to show, and it is comparatively rare; after that the two
/// interleave newest-first.
/// How many community videos may join one Explore session.
///
/// A cap, not a page: the community feed is already limited upstream, and
/// Explore is a place to encounter things rather than to exhaust them.
const _communityReelLimit = 40;

/// Community posts that are whole, public, and carry a video.
List<Reel> communityReels(List<CommunityPost> posts) {
  final reels = <Reel>[];
  for (final post in posts) {
    if (post.parentId != null) continue;
    final video = post.media.where((item) => item.isVideo).firstOrNull;
    // A post can carry several files; the first video is the one the feed
    // opens on, exactly as the community card does.
    if (video == null || video.url.isEmpty) continue;
    reels.add(Reel.fromCommunityPost(post, video));
    if (reels.length >= _communityReelLimit) break;
  }
  return reels;
}

/// The Explore feed: published work first, then community video.
final exploreFeedProvider = Provider<List<Reel>>((ref) {
  final published = ref.watch(publishedReelsProvider).asData?.value;
  final community = ref.watch(communityFeedProvider).asData?.value;

  final reels = <Reel>[
    ...?published?.map(Reel.fromPublished),
    ...?community.let(communityReels),
  ];
  return List.unmodifiable(reels);
});

extension<T> on T? {
  /// Applies [transform] when this is not null. Saves the feed a nullable
  /// branch for each source without pretending an absent stream is an empty
  /// one — the difference matters to [exploreHasContentProvider].
  R? let<R>(R Function(T value) transform) {
    final value = this;
    return value == null ? null : transform(value);
  }
}

/// Whether Explore has anything real to show, or should fall back to the
/// curated preview cards.
final exploreHasContentProvider = Provider<bool>(
  (ref) => ref.watch(exploreFeedProvider).isNotEmpty,
);
