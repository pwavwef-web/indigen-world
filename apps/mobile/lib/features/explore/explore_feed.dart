import 'dart:collection';
import 'dart:math' as math;

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
///
/// Reaching it is no longer the end of Explore. It is the point at which the
/// feed stops fetching and starts re-queueing what it already holds — see
/// [ExploreCycles].
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

/// Whether the feed can still be *widened*.
///
/// Deliberately not "whether the feed has more to show", which is now always
/// yes: a window at its ceiling means there is nothing further to fetch, not
/// that there is nothing further to watch.
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

/// Everything Explore can show right now, in order, before adverts and before
/// anything is repeated.
///
/// Split out from [exploreFeedProvider] because two things need the reels
/// themselves rather than the finished rows: the advert splice, which places
/// its cards *between* them, and the re-queue, which reorders them. Shuffling
/// an already-spliced list would scatter the paid cards to arbitrary positions
/// and let two of them land side by side — the one arrangement
/// [spliceSponsored] exists to prevent.
final exploreContentProvider = Provider<List<Reel>>((ref) {
  final window = ref.watch(exploreWindowProvider);
  final published = ref.watch(publishedReelsProvider).asData?.value;
  final community = ref.watch(communityFeedProvider).asData?.value;

  return List.unmodifiable(<Reel>[
    if (published != null) ...publishedReels(published),
    ...?community.let((posts) => communityReels(posts, limit: window)),
  ]);
});

/// One pass through the Explore feed: published work first, then community
/// video, with paid placements spliced in.
///
/// The adverts are spliced *around* [publishedReels] rather than through it. A
/// sponsored reel is not a published record and has no `mediaType` to be
/// filtered on, so passing one through the video-only rule would mean widening
/// that rule — and the whole point of it is that it is not wide.
///
/// This is the feed as everything *except* the reel pager wants it: search
/// matches against it (see `searchReels`), and [exploreHasContentProvider] asks
/// it whether the archive has anything at all. Both of those want each reel
/// once. The pager wants [exploreLoopedFeedProvider] instead.
final exploreFeedProvider = Provider<List<Reel>>(
  (ref) => loopedExploreFeed(
    content: ref.watch(exploreContentProvider),
    ads: ref.watch(placedAdsProvider(AdPlacement.explore)),
    cadence: kExploreAdCadence,
    cycles: 0,
  ),
);

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
final exploreFollowingContentProvider = Provider<List<Reel>>((ref) {
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

/// One pass through the Following feed.
///
/// No adverts. Following is a member's answer to "show me *them*", and a paid
/// placement is by definition not one of them — an advertiser who has not been
/// followed has no business in the list of people who have. That holds for the
/// re-queued passes as well, so an endless Following feed stays an endless feed
/// of people rather than becoming the one place in the app where the ad load
/// climbs the longer somebody watches.
final exploreFollowingFeedProvider = Provider<List<Reel>>(
  (ref) => ref.watch(exploreFollowingContentProvider),
);

// ── The feed that does not end ──────────────────────────────────────────────
//
// A window that has stopped growing used to be the end of Explore: the member
// reached the last reel and the feed simply stopped, on the one surface in the
// app whose whole promise is that there is always another one. The end arrives
// sooner here than on any feed this one is read alongside, and for a reason
// nobody should be punished for — the archive is young, and a few hundred reels
// is a good year for a language with forty thousand speakers.
//
// So it does not end. When there is nothing left to fetch, the feed queues the
// same reels again in a fresh order, and again after that, for as long as
// somebody keeps scrolling. The repeat is the honest part of the bargain: as
// the archive grows a cycle takes longer and longer to come round, until the
// members who reach one at all are the ones who have watched everything.

/// The shortest feed worth re-queueing.
///
/// Below this a loop is not a feed, it is a wall: two reels re-queued are the
/// same two clips alternating under the member's thumb for ever, which reads as
/// a broken app rather than as an archive. Three is where a new order starts to
/// be a different experience of the same material rather than a visibly
/// repeating pair. Under it the feed stops, which for somebody who has watched
/// everything the archive holds for them is the truthful answer.
const int kExploreLoopMinimum = 3;

/// How many re-queued passes are kept as built rows at once.
///
/// The pager only ever builds the page it is on and its immediate neighbours,
/// so two is enough to sit on the seam between one pass and the next without
/// rebuilding either. Scrolling back further than that rebuilds a pass, which
/// is exact rather than approximate because the orders are seeded — see
/// [exploreCycleOrder].
const int kExploreLiveCycles = 2;

/// How many times the feed has been re-queued.
///
/// A separate notifier from [ExploreWindow] because the two answer different
/// questions — "is there more to fetch" and "is there more to watch" — and
/// because the second one has to survive the first one running out. Reset
/// alongside the window when the member leaves the tab, and when they switch
/// between For you and Following: the two feeds hold different reels, and a
/// count carried across would drop somebody into a Following feed that had
/// already been re-queued three times without them once reaching the end of it.
class ExploreCycles extends Notifier<int> {
  @override
  int build() => 0;

  /// Queues one more pass over the same reels, and reports whether it moved.
  ///
  /// [rows] is how many reels the feed holds *before* anything is repeated. The
  /// refusal under [kExploreLoopMinimum] lives here rather than at the call
  /// site so that the second surface to ask — Following — cannot forget it.
  bool advance(int rows) {
    if (rows < kExploreLoopMinimum) return false;
    state++;
    return true;
  }

  void reset() {
    if (state != 0) state = 0;
  }
}

final exploreCyclesProvider = NotifierProvider<ExploreCycles, int>(
  ExploreCycles.new,
);

/// The Explore feed as the pager actually walks it: one pass, then as many
/// re-queued passes as the member has scrolled into.
final exploreLoopedFeedProvider = Provider<List<Reel>>(
  (ref) => loopedExploreFeed(
    content: ref.watch(exploreContentProvider),
    ads: ref.watch(placedAdsProvider(AdPlacement.explore)),
    cadence: kExploreAdCadence,
    cycles: ref.watch(exploreCyclesProvider),
  ),
);

/// The Following feed as the pager walks it.
///
/// Following loops on exactly the same terms as For you, and the alternative
/// was tempting: a member who follows four people is much likelier to hit the
/// end. But the same gesture on the same surface ending two different ways is
/// the more confusing of the two, and [kExploreLoopMinimum] already covers the
/// case that actually hurts. A Following feed with nobody in it never gets
/// here at all — `_EmptyFollowing` stands in front of it — so an empty feed
/// still says "follow somebody" rather than looping nothing.
final exploreFollowingLoopedFeedProvider = Provider<List<Reel>>(
  (ref) => loopedExploreFeed(
    content: ref.watch(exploreFollowingContentProvider),
    ads: const <ServedAd>[],
    cadence: kExploreAdCadence,
    cycles: ref.watch(exploreCyclesProvider),
  ),
);

/// The rows [content] makes: one pass with adverts spliced in, followed by
/// [cycles] re-queued passes in fresh orders.
///
/// `cycles: 0` is the ordinary feed and returns a plain list, so the surfaces
/// that want each reel exactly once — search, the has-content check — get
/// precisely what they used to.
List<Reel> loopedExploreFeed({
  required List<Reel> content,
  required List<ServedAd> ads,
  required int cadence,
  required int cycles,
}) {
  final base = List<Reel>.unmodifiable(
    spliceSponsored(
      rows: content,
      ads: ads,
      cadence: cadence,
      render: Reel.fromServedAd,
    ),
  );
  if (cycles < 1 || content.length < kExploreLoopMinimum) return base;
  // Nothing that is not live is ever queued again. The content providers build
  // live reels and only live reels, so this cannot fire from them — it is here
  // for the curated preview, which is three illustrative cards with nothing
  // behind them and reaches the pager by a different route entirely. Three
  // stock photographs on an endless loop would be the app insisting it has an
  // archive when what it has is a placeholder.
  if (content.any((reel) => !reel.isLive)) return base;
  return _LoopedReelFeed(
    base: base,
    content: content,
    ads: ads,
    cadence: cadence,
    cycles: cycles,
  );
}

/// The order pass [cycle] shows [count] reels in. Pass 0 is the feed's own
/// order and is the identity.
///
/// ── Why the shuffle is seeded ─────────────────────────────────────────────
/// [exploreLoopedFeedProvider] is a plain [Provider] over two live Firestore
/// snapshots, so it recomputes every time either of them ticks — which on a
/// feed anybody is posting to is often. Shuffled with an unseeded [math.Random]
/// the list would come back in a different order each time, and the pager,
/// which pages by position, would land the member on a different video mid
/// swipe. Seeded from the cycle number and nothing else, pass three is the same
/// pass three every time it is built, including when it is built again after
/// being dropped from [kExploreLiveCycles].
List<int> exploreCycleOrder(int count, int cycle) {
  if (count < 2 || cycle < 1) {
    return List<int>.generate(count, (index) => index);
  }
  final order = _cycleOrderCore(count, cycle);
  // The seam. Every other repeat in an endless feed is invisible — a clip from
  // two hundred swipes ago is a clip nobody remembers — but the join between
  // one pass and the next is the single place a member can *see* the loop, and
  // the same reel twice in a row is what they would see it with. So the pass
  // never opens on the reel the pass before it closed with.
  //
  // Fixed by swapping the first two rows rather than by rotating, because the
  // row that ends this pass is what the *next* one reads to place its own seam,
  // and a rotation would move it.
  final previousTail = cycle == 1
      ? count - 1
      : _cycleOrderCore(count, cycle - 1).last;
  if (count > 2 && order.first == previousTail) {
    final lead = order[0];
    order[0] = order[1];
    order[1] = lead;
  }
  return order;
}

/// The raw seeded order, before the seam is dealt with.
///
/// Kept separate so [exploreCycleOrder] can read the previous pass's last row
/// without recursing through every pass before it: the seam fix only ever
/// touches the first two rows, so a pass's last row is always this one's.
List<int> _cycleOrderCore(int count, int cycle) {
  var order = _shuffled(count, cycle * _cycleSeedStride);
  // A shuffle is entitled to hand back the order it was given, and on a short
  // feed that is likely enough to plan for: a "fresh" pass identical to the one
  // before it looks like the app forgot to do anything. Re-rolled with a salted
  // seed, which stays deterministic and stays inside this cycle's own range.
  for (var salt = 1; salt <= _cycleSeedSalts && _isIdentity(order); salt++) {
    order = _shuffled(count, cycle * _cycleSeedStride + salt);
  }
  return order;
}

/// Seeds for cycle *n* live in `[n * stride, n * stride + salts]`, so no two
/// cycles can collide however many times one of them is re-rolled.
const int _cycleSeedStride = 977;
const int _cycleSeedSalts = 3;

List<int> _shuffled(int count, int seed) =>
    List<int>.generate(count, (index) => index)..shuffle(math.Random(seed));

bool _isIdentity(List<int> order) {
  for (var index = 0; index < order.length; index++) {
    if (order[index] != index) return false;
  }
  return true;
}

/// The base pass followed by [cycles] re-queued passes, built as they are read.
///
/// ── Why this is a lazy list and not a longer one ──────────────────────────
/// Appending each new pass to a `List<Reel>` would mean holding every pass a
/// member has scrolled through in memory at once — three hundred reels a pass,
/// for as long as somebody keeps going, on a phone. Dropping the earliest pass
/// instead is worse than it sounds: the pager addresses reels by position, so
/// removing rows from the front of the list teleports the member backwards by
/// exactly as many rows as were removed, mid swipe.
///
/// So the rows are computed on the way out instead. What is actually held is
/// the base pass, which the feed needs anyway, and at most [kExploreLiveCycles]
/// built passes. Everything else is arithmetic, and a pass that has been
/// dropped rebuilds identically because [exploreCycleOrder] is seeded.
class _LoopedReelFeed extends ListBase<Reel> {
  _LoopedReelFeed({
    required this.base,
    required this.content,
    required this.ads,
    required this.cadence,
    required this.cycles,
  }) : _passRows = content.length,
       _slots = cadence < 1 ? 0 : content.length ~/ cadence,
       _adPasses = _adPassesFor(
         ads.length,
         cadence < 1 ? 0 : content.length ~/ cadence,
       );

  /// The feed's own first pass, adverts and all.
  final List<Reel> base;

  /// The reels each repeat is a reordering of.
  final List<Reel> content;

  final List<ServedAd> ads;
  final int cadence;
  final int cycles;

  final int _passRows;

  /// How many advert slots a pass has. [spliceSponsored] places one after each
  /// complete run of [cadence], so this is the same number for every pass.
  final int _slots;

  /// How many *repeats* still have campaigns nobody has been shown yet.
  final int _adPasses;

  /// The most recently built passes, by cycle number. A plain map literal, so
  /// its keys come back in insertion order and the oldest is the first one.
  final _built = <int, List<Reel>>{};

  /// ── Which adverts a repeat may carry ───────────────────────────────────
  /// The obvious answer, splicing the same adverts through every pass, is worse
  /// than useless. [ServedAdTelemetry] counts a campaign at most once a session
  /// and keys that guard by campaign id rather than by card, so the second time
  /// an advert comes round it is not counted, not charged and worth exactly
  /// nothing to the advertiser: a paid placement that costs the member a swipe
  /// and pays nobody is the worst card in the feed.
  ///
  /// The opposite mistake is just as easy to make. A pass has only
  /// `rows ~/ cadence` slots and the rotation can hold more campaigns than
  /// that, so dropping adverts from the repeats altogether means the campaigns
  /// that did not fit into the first pass never serve at all, however long
  /// somebody scrolls. That is not an ad-free feed, it is one advertiser with a
  /// monopoly on an endless one.
  ///
  /// So the eligible list is drawn down like a queue: the base pass takes the
  /// campaigns at its head, each repeat takes the ones behind, and once every
  /// campaign has had a slot the repeats carry none. [adsForPlacement] rotates
  /// on the clock and can therefore turn underneath this, so the queue is a
  /// best effort rather than a promise — the promise that matters is
  /// [ServedAdTelemetry]'s, and it holds whatever this places.
  List<ServedAd> _adsFor(int cycle) {
    if (cycle > _adPasses) return const <ServedAd>[];
    return ads.sublist(math.min(cycle * _slots, ads.length));
  }

  /// How many repeats it takes to give every eligible campaign a slot, given
  /// that the base pass has already used the first [slots] of them.
  static int _adPassesFor(int adCount, int slots) {
    if (adCount <= 0 || slots <= 0) return 0;
    final unshown = adCount - slots;
    if (unshown <= 0) return 0;
    return (unshown + slots - 1) ~/ slots;
  }

  /// Rows in a repeat that carries adverts, and in one that does not.
  int get _adPassLength => _passRows + _slots;

  int get _passesWithAds => math.min(cycles, _adPasses);

  @override
  int get length =>
      base.length +
      _passesWithAds * _adPassLength +
      (cycles - _passesWithAds) * _passRows;

  @override
  Reel operator [](int index) {
    RangeError.checkValidIndex(index, this);
    if (index < base.length) return base[index];
    var offset = index - base.length;
    final withAds = _passesWithAds;
    final adRows = withAds * _adPassLength;
    if (offset < adRows) {
      return _pass(offset ~/ _adPassLength + 1)[offset % _adPassLength];
    }
    offset -= adRows;
    return _pass(withAds + offset ~/ _passRows + 1)[offset % _passRows];
  }

  /// The rows of one repeat, built if this is the first time anybody has asked
  /// for them and dropped again once two newer passes exist.
  List<Reel> _pass(int cycle) {
    final built = _built[cycle];
    if (built != null) return built;
    final order = exploreCycleOrder(_passRows, cycle);
    final rows = List<Reel>.unmodifiable(
      spliceSponsored(
        rows: [for (final index in order) content[index].replayed(cycle)],
        ads: _adsFor(cycle),
        cadence: cadence,
        // The advert cards are *not* marked as replays: by the queue above, an
        // advert in a repeat is a campaign nobody has been shown yet, which
        // makes it the one genuinely new thing on the pass.
        render: Reel.fromServedAd,
      ),
    );
    _built[cycle] = rows;
    while (_built.length > kExploreLiveCycles) {
      _built.remove(_built.keys.first);
    }
    return rows;
  }

  @override
  set length(int value) =>
      throw UnsupportedError('The Explore feed cannot be resized.');

  @override
  void operator []=(int index, Reel value) =>
      throw UnsupportedError('The Explore feed cannot be written to.');
}
