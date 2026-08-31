import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
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
///   * Only videos, and from both sources. Explore is a video surface: a photo
///     post belongs in the feed it was written for, and a published song or a
///     literature document belongs in the Collection channel that can actually
///     play or read it. Arriving here they were silent, imageless full-screen
///     cards.
///   * Community reels are labelled as such and keep their community
///     identity — the same likes, the same replies, the same profile.
///   * Muted, blocked and hidden authors are already filtered out upstream by
///     [communityFeedProvider], so somebody a member has silenced cannot reach
///     them through a different tab.
///
/// Published work leads. Not because it is better, but because it is what the
/// archive exists to show, and it is comparatively rare; after that the two
/// interleave newest-first.
/// How much of each source the feed holds, and how it grows.
///
/// Explore pages by *widening its window* rather than by carrying a cursor.
/// Both sources are live Firestore queries, so a cursor would mean stitching
/// pages that can each change underneath the stitching — a reel published while
/// somebody is scrolling would either appear twice or slip through the seam.
/// Re-subscribing at a larger limit has neither problem: Firestore serves the
/// documents it already holds from cache and fetches only the new tail, and the
/// feed stays one live list all the way down.
const int kExploreWindowStep = 30;

/// The ceiling. Not a technical limit — a decision that a feed which has shown
/// somebody three hundred reels in one sitting should stop growing rather than
/// keep an ever-larger snapshot listener open on a phone.
const int kExploreWindowMax = 300;

/// How wide the Explore window currently is.
///
/// Reset when the member leaves the tab: coming back to a feed that had grown
/// to three hundred would re-open all of it at once.
class ExploreWindow extends Notifier<int> {
  @override
  int build() => kExploreWindowStep;

  /// Widens by one step, up to [kExploreWindowMax]. Returns whether it moved,
  /// so a caller can tell "loading more" from "there is no more to load".
  bool grow() {
    if (state >= kExploreWindowMax) return false;
    state = (state + kExploreWindowStep).clamp(
      kExploreWindowStep,
      kExploreWindowMax,
    );
    return true;
  }

  void reset() => state = kExploreWindowStep;
}

final exploreWindowProvider = NotifierProvider<ExploreWindow, int>(
  ExploreWindow.new,
);

/// Whether the feed can still be widened — what the end-of-feed card reads.
final exploreCanLoadMoreProvider = Provider<bool>(
  (ref) => ref.watch(exploreWindowProvider) < kExploreWindowMax,
);

/// Community posts that are whole, public, and carry a video.
List<Reel> communityReels(List<CommunityPost> posts, {required int limit}) {
  final reels = <Reel>[];
  for (final post in posts) {
    if (post.parentId != null) continue;
    final video = post.media.where((item) => item.isVideo).firstOrNull;
    // A post can carry several files; the first video is the one the feed
    // opens on, exactly as the community card does.
    if (video == null || video.url.isEmpty) continue;
    reels.add(Reel.fromCommunityPost(post, video));
    if (reels.length >= limit) break;
  }
  return reels;
}

/// Published records that belong on a video surface.
///
/// ── Why this repeats the query ────────────────────────────────────────────
/// `PublishedContentRepository` already asks Firestore for `mediaType ==
/// 'video'` and this filters the answer again. Neither half is enough alone.
///
/// The query is what keeps Explore's window worth having: filter only here and
/// the newest thirty published records can be thirty poems, of which the feed
/// shows none. But a query is a promise about the backend rather than a rule —
/// it needs a composite index deployed separately from the app, and
/// `mediaType` is null on everything published before the workflow began
/// inferring it (see `inferredMediaType` in
/// services/functions/src/publication.ts), which an equality filter treats as
/// absent rather than as unknown. This is the rule itself, and it is what
/// stops music, audiobooks and literature documents arriving as silent,
/// imageless full-screen cards.
List<Reel> publishedReels(Iterable<PublishedReel> published) => published
    .where((reel) => reel.isVideo)
    .map(Reel.fromPublished)
    .toList(growable: false);

/// How many reels a member watches between adverts.
///
/// Six is a judgement, and the judgement is this: an advert every three reels
/// is a channel somebody is being sold to, and an advert every twenty is a
/// placement nobody bought. Six puts one paid card in roughly the first half
/// minute of scrolling and then leaves the archive alone for another five —
/// close enough to the cadence of the feeds this one is read alongside that it
/// does not feel like a trick, far enough from them that Explore still reads as
/// a cultural archive rather than as an inventory.
///
/// Because [spliceSponsored] only places an advert after a *complete* run, a
/// short feed carries none at all. Somebody who opens Explore to four reels is
/// looking at everything the archive has for them, and putting an advert in
/// front of a quarter of it would be the worst ratio in the app.
const int kExploreAdCadence = 6;

/// The Explore feed: published work first, then community video, with paid
/// placements spliced in.
///
/// The adverts are spliced *around* [publishedReels] rather than through it. A
/// sponsored reel is not a published record and has no `mediaType` to be
/// filtered on, so passing one through the video-only rule would mean widening
/// that rule — and the whole point of it is that it is not wide.
final exploreFeedProvider = Provider<List<Reel>>((ref) {
  final window = ref.watch(exploreWindowProvider);
  final published = ref.watch(publishedReelsProvider).asData?.value;
  final community = ref.watch(communityFeedProvider).asData?.value;

  final reels = <Reel>[
    if (published != null) ...publishedReels(published),
    ...?community.let((posts) => communityReels(posts, limit: window)),
  ];
  return List.unmodifiable(
    spliceSponsored(
      rows: reels,
      ads: ref.watch(placedAdsProvider(AdPlacement.explore)),
      cadence: kExploreAdCadence,
      render: Reel.fromServedAd,
    ),
  );
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

/// The same feed, narrowed to the people this member follows.
///
/// Explore's two halves are the two questions a video feed answers: show me
/// something, and show me *them*. Following is built from the same two sources
/// as the main feed so a followed creator's published work and their community
/// clips arrive together — following somebody and then not seeing half of what
/// they make would be the wrong kind of surprise.
///
/// Empty is a real answer here, and the header says so rather than quietly
/// falling back to everything: a member who follows nobody has an empty
/// Following feed, and pretending otherwise hides the thing they would need to
/// do about it.
///
/// No adverts. Following is a member's answer to "show me *them*", and a paid
/// placement is by definition not one of them — an advertiser who has not been
/// followed has no business in the list of people who have.
final exploreFollowingFeedProvider = Provider<List<Reel>>((ref) {
  final following = ref.watch(followingIdsProvider).asData?.value;
  if (following == null || following.isEmpty) return const <Reel>[];
  final follows = following.toSet();

  final published = ref.watch(publishedReelsProvider).asData?.value;
  final community = ref.watch(followingFeedProvider).asData?.value;

  final window = ref.watch(exploreWindowProvider);
  return List.unmodifiable(<Reel>[
    if (published != null)
      ...publishedReels(
        published.where((reel) => follows.contains(reel.creatorId)),
      ),
    ...?community.let((posts) => communityReels(posts, limit: window)),
  ]);
});
