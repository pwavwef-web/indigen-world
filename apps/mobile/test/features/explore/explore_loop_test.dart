// Explore does not end any more. When there is nothing left to fetch it queues
// the same reels again in a fresh order, for as long as somebody keeps
// scrolling, and these tests hold the four properties that decide whether that
// reads as an endless archive or as a bug:
//
//   * the order of a pass is the same every time it is built, because the feed
//     rebuilds on every Firestore tick and the pager addresses reels by
//     position;
//   * a pass is a reordering and not a reshuffle of the material — every reel
//     exactly once, and never the same clip twice across the seam;
//   * a repeat keeps the id of the reel it repeats, so nothing is counted
//     twice, while (id, pass) stays unique so a repeat is still tellable apart;
//   * and the things that must *not* loop — a two-reel feed, the curated
//     preview — do not.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/explore_screen.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

Reel _reel(String id) => Reel(
  id: id,
  imageUrl: '',
  label: 'REEL',
  title: id,
  creator: 'Kassena creator',
  initials: 'KC',
  caption: '',
  sound: '',
  credit: '',
  isLive: true,
  videoUrl: 'https://example.test/$id',
);

List<Reel> _reels(int count) => [
  for (var index = 0; index < count; index++) _reel('reel-$index'),
];

ServedAd _ad(String campaignId) => ServedAd(
  campaignId: campaignId,
  headline: campaignId,
  body: '',
  creativeUrl: '',
  mediaType: 'image',
  placements: const [AdPlacement.explore],
);

/// The campaign ids of the sponsored rows in [rows], in order.
List<String> _campaigns(Iterable<Reel> rows) => [
  for (final row in rows)
    if (row.servedAd case final ad?) ad.campaignId,
];

PublishedReel _published(String id) => PublishedReel(
  id: id,
  title: id,
  creatorName: 'Kassena creator',
  creatorId: 'afi',
  mediaUrl: 'https://example.test/$id',
  mediaType: 'video',
);

/// A container with both halves of the feed stubbed, so the looped providers
/// are reading something real rather than passing because they are empty.
ProviderContainer _container(int published) {
  final container = ProviderContainer(
    overrides: [
      publishedReelsProvider.overrideWith(
        (ref) => Stream.value([
          for (var index = 0; index < published; index++)
            _published('published-$index'),
        ]),
      ),
      followingIdsProvider.overrideWith((ref) => Stream.value(const <String>[])),
      communityFeedProvider.overrideWithValue(
        const AsyncValue.data(<CommunityPost>[]),
      ),
      followingFeedProvider.overrideWithValue(
        const AsyncValue.data(<CommunityPost>[]),
      ),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Subscribes, so the stubbed streams are actually listened to, and lets the
/// event loop turn until their values have propagated. See the note in
/// explore_video_only_test.dart for why a bare read would hang.
Future<void> _settle(ProviderContainer container, Provider<List<Reel>> of) async {
  container.listen(of, (_, _) {});
  for (var turn = 0; turn < 4; turn++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  group('exploreCycleOrder', () {
    test('the same pass is always the same order', () {
      // The property the member's finger depends on: the feed recomputes on
      // every Firestore tick, and an order that came back different each time
      // would move the video out from under a swipe already in progress.
      for (var cycle = 1; cycle <= 6; cycle++) {
        expect(
          exploreCycleOrder(40, cycle),
          exploreCycleOrder(40, cycle),
          reason: 'pass $cycle drifted between two builds',
        );
      }
    });

    test('every pass shows every reel exactly once', () {
      for (var cycle = 0; cycle <= 6; cycle++) {
        final order = exploreCycleOrder(17, cycle);
        expect(order, hasLength(17));
        expect(order.toSet(), hasLength(17));
        expect(order.every((index) => index >= 0 && index < 17), isTrue);
      }
    });

    test('the first pass is the feed\'s own order', () {
      expect(exploreCycleOrder(9, 0), List<int>.generate(9, (index) => index));
    });

    test('a repeat is not the order it repeats', () {
      // Twelve is well past the size where a seeded shuffle handing back the
      // identity would be bad luck rather than a bug, and the re-roll in
      // _cycleOrderCore makes it a guarantee at any size rather than odds.
      final identity = List<int>.generate(12, (index) => index);
      for (var cycle = 1; cycle <= 8; cycle++) {
        expect(exploreCycleOrder(12, cycle), isNot(identity));
      }
    });

    test('no pass opens on the reel the pass before it closed with', () {
      // The seam is the one repeat a member can see happening. Everything else
      // in an endless feed is a clip from two hundred swipes ago.
      for (final count in [3, 4, 7, 12, 41]) {
        for (var cycle = 1; cycle <= 10; cycle++) {
          expect(
            exploreCycleOrder(count, cycle).first,
            isNot(exploreCycleOrder(count, cycle - 1).last),
            reason: 'pass $cycle of $count reels repeats across the seam',
          );
        }
      }
    });
  });

  group('ExploreCycles', () {
    late ProviderContainer container;
    setUp(() => container = ProviderContainer());
    tearDown(() => container.dispose());

    ExploreCycles notifier() => container.read(exploreCyclesProvider.notifier);

    test('starts on the feed\'s own pass', () {
      expect(container.read(exploreCyclesProvider), 0);
    });

    test('queues one more pass at a time', () {
      expect(notifier().advance(30), isTrue);
      expect(container.read(exploreCyclesProvider), 1);
      expect(notifier().advance(30), isTrue);
      expect(container.read(exploreCyclesProvider), 2);
    });

    test('refuses a feed too short to loop, and says so', () {
      // Two reels re-queued are two clips alternating under a thumb for ever.
      expect(notifier().advance(2), isFalse);
      expect(notifier().advance(1), isFalse);
      expect(notifier().advance(0), isFalse);
      expect(container.read(exploreCyclesProvider), 0);
      expect(notifier().advance(kExploreLoopMinimum), isTrue);
    });

    test('resets when the member leaves the tab', () {
      notifier()
        ..advance(30)
        ..advance(30)
        ..reset();
      expect(container.read(exploreCyclesProvider), 0);
    });
  });

  group('loopedExploreFeed', () {
    test('the first pass is exactly what it always was', () {
      final content = _reels(8);
      expect(
        loopedExploreFeed(
          content: content,
          ads: const [],
          cadence: kExploreAdCadence,
          cycles: 0,
        ),
        content,
      );
    });

    test('a repeat is the same reels again, once each', () {
      final content = _reels(9);
      final feed = loopedExploreFeed(
        content: content,
        ads: const [],
        cadence: kExploreAdCadence,
        cycles: 2,
      );
      expect(feed, hasLength(27));

      final wanted = content.map((reel) => reel.id).toSet();
      for (var pass = 0; pass < 3; pass++) {
        final rows = feed.skip(pass * 9).take(9);
        expect(rows.map((reel) => reel.id).toSet(), wanted);
        expect(rows.map((reel) => reel.cycle).toSet(), {pass});
      }
    });

    test('a repeat keeps the id it repeats and is still tellable apart', () {
      final feed = loopedExploreFeed(
        content: _reels(6),
        ads: const [],
        cadence: kExploreAdCadence,
        cycles: 3,
      );
      // The id is what the view counter, the appreciation and the counts
      // listener are all keyed by, so it must not change...
      expect(feed.map((reel) => reel.id).toSet(), hasLength(6));
      // ...and (id, pass) is what tells one showing from another.
      expect(
        feed.map((reel) => '${reel.id}#${reel.cycle}').toSet(),
        hasLength(feed.length),
      );
      expect(feed.take(6).every((reel) => !reel.isReplay), isTrue);
      expect(feed.skip(6).every((reel) => reel.isReplay), isTrue);
    });

    test('a repeat changes nothing else about the reel', () {
      final original = _reel('reel-0');
      final replay = original.replayed(4);
      expect(replay.cycle, 4);
      expect(replay.id, original.id);
      expect(replay.videoUrl, original.videoUrl);
      expect(replay.title, original.title);
      expect(replay.isLive, original.isLive);
      expect(replay.servedAd, isNull);
    });

    test('a feed too short to loop does not', () {
      for (final count in [0, 1, 2]) {
        final content = _reels(count);
        expect(
          loopedExploreFeed(
            content: content,
            ads: const [],
            cadence: kExploreAdCadence,
            cycles: 5,
          ),
          hasLength(count),
        );
      }
    });

    test('the curated preview never loops', () {
      // Three illustrative cards meet the loop minimum on length alone, so what
      // keeps them from repeating for ever is that they are not live — as well
      // as the screen, which hands the preview no onNearEnd at all.
      expect(kExplorePreviewReels, hasLength(3));
      expect(kExplorePreviewReels.every((reel) => !reel.isLive), isTrue);
      expect(
        loopedExploreFeed(
          content: kExplorePreviewReels,
          ads: const [],
          cadence: kExploreAdCadence,
          cycles: 4,
        ),
        hasLength(3),
      );
    });

    test('is read-only, like the list it replaced', () {
      final feed = loopedExploreFeed(
        content: _reels(6),
        ads: const [],
        cadence: kExploreAdCadence,
        cycles: 1,
      );
      expect(() => feed.add(_reel('gatecrasher')), throwsUnsupportedError);
      expect(() => feed[0] = _reel('gatecrasher'), throwsUnsupportedError);
    });

    test('every row of every pass is reachable', () {
      final feed = loopedExploreFeed(
        content: _reels(13),
        ads: [_ad('a'), _ad('b'), _ad('c'), _ad('d'), _ad('e')],
        cadence: kExploreAdCadence,
        cycles: 5,
      );
      // Walks the whole feed, which also walks the pass cache past its cap and
      // back — a pass dropped and rebuilt has to come back identical.
      final walked = [for (var index = 0; index < feed.length; index++) feed[index]];
      expect(walked.map((reel) => reel.title), feed.map((reel) => reel.title));
      expect(() => feed[feed.length], throwsRangeError);
      expect(() => feed[-1], throwsRangeError);
    });
  });

  group('adverts on an endless feed', () {
    // Twelve reels at a cadence of six is two advert slots a pass, and five
    // eligible campaigns is more than the first pass can hold — which is the
    // whole case: an advertiser who never fits into pass one must still serve
    // somewhere, and one who has served must not be shown again for nothing.
    final content = _reels(12);
    final ads = [_ad('a'), _ad('b'), _ad('c'), _ad('d'), _ad('e')];

    List<Reel> feedOf(int cycles) => loopedExploreFeed(
      content: content,
      ads: ads,
      cadence: kExploreAdCadence,
      cycles: cycles,
    );

    test('the first pass takes the head of the queue', () {
      expect(_campaigns(feedOf(0)), ['a', 'b']);
    });

    test('a repeat takes the campaigns behind it', () {
      final feed = feedOf(3);
      // 12 reels + 2 adverts is a pass of 14 rows while there are still
      // campaigns to place, and 12 once there are not.
      expect(_campaigns(feed.take(14)), ['a', 'b']);
      expect(_campaigns(feed.skip(14).take(14)), ['c', 'd']);
      expect(_campaigns(feed.skip(28).take(14)), ['e', 'e']);
      expect(feed, hasLength(14 + 14 + 14 + 12));
    });

    test('once every campaign has served, the repeats carry none', () {
      final feed = feedOf(6);
      expect(_campaigns(feed.skip(42)), isEmpty);
      // The first pass and two repeats still had campaigns to place, at 14 rows
      // each; the four repeats behind them are just the reels.
      expect(feed, hasLength(14 * 3 + 12 * 4));
    });

    test('a feed with no adverts stays a feed with no adverts', () {
      final feed = loopedExploreFeed(
        content: content,
        ads: const [],
        cadence: kExploreAdCadence,
        cycles: 3,
      );
      expect(_campaigns(feed), isEmpty);
      expect(feed, hasLength(12 * 4));
    });

    test('two adverts never land side by side', () {
      final feed = feedOf(4);
      for (var index = 1; index < feed.length; index++) {
        expect(
          feed[index].isSponsored && feed[index - 1].isSponsored,
          isFalse,
          reason: 'adverts adjacent at row $index',
        );
      }
    });
  });

  group('reelFeedShouldAskForMore', () {
    test('says nothing until the end is in sight', () {
      expect(
        reelFeedShouldAskForMore(
          index: 10,
          length: 40,
          lastAskLength: -1,
          lastAskIndex: -1,
        ),
        isFalse,
      );
    });

    test('asks on arriving at the tail', () {
      expect(
        reelFeedShouldAskForMore(
          index: 37,
          length: 40,
          lastAskLength: -1,
          lastAskIndex: -1,
        ),
        isTrue,
      );
    });

    test('asks again at the same length, one page deeper', () {
      // The rework. The old guard stopped here, which was right while the only
      // answer to "there is nothing left" was to stop — and wrong the moment
      // the answer became "come round again", because the second ask is the one
      // that queues the next pass.
      expect(
        reelFeedShouldAskForMore(
          index: 38,
          length: 40,
          lastAskLength: 40,
          lastAskIndex: 37,
        ),
        isTrue,
      );
    });

    test('does not ask again for a page it has already asked from', () {
      expect(
        reelFeedShouldAskForMore(
          index: 37,
          length: 40,
          lastAskLength: 40,
          lastAskIndex: 38,
        ),
        isFalse,
      );
      expect(
        reelFeedShouldAskForMore(
          index: 38,
          length: 40,
          lastAskLength: 40,
          lastAskIndex: 38,
        ),
        isFalse,
      );
    });

    test('starts asking again once the feed has grown', () {
      expect(
        reelFeedShouldAskForMore(
          index: 38,
          length: 54,
          lastAskLength: 40,
          lastAskIndex: 38,
        ),
        isFalse,
      );
      expect(
        reelFeedShouldAskForMore(
          index: 52,
          length: 54,
          lastAskLength: 40,
          lastAskIndex: 38,
        ),
        isTrue,
      );
    });

    test('the tail is at most kReelLoadAheadPages asks wide', () {
      var asks = 0;
      var lastLength = -1;
      var lastIndex = -1;
      for (var index = 0; index < 40; index++) {
        if (!reelFeedShouldAskForMore(
          index: index,
          length: 40,
          lastAskLength: lastLength,
          lastAskIndex: lastIndex,
        )) {
          continue;
        }
        asks++;
        lastLength = 40;
        lastIndex = index;
      }
      expect(asks, kReelLoadAheadPages);
    });
  });

  group('the providers the surfaces read', () {
    test('the pager loops and everything else does not', () async {
      final container = _container(9);
      await _settle(container, exploreLoopedFeedProvider);
      expect(container.read(exploreFeedProvider), hasLength(9));

      container.read(exploreCyclesProvider.notifier).advance(9);
      // Search matches against exploreFeedProvider, and a search that returned
      // the same reel four times because somebody had scrolled a long way would
      // be the loop leaking into a surface that has nothing to do with it.
      expect(container.read(exploreFeedProvider), hasLength(9));
      expect(container.read(exploreLoopedFeedProvider), hasLength(18));
    });

    test('an empty Following feed loops nothing', () async {
      final container = _container(9);
      await _settle(container, exploreFollowingLoopedFeedProvider);
      // Nobody followed, so there is nothing to repeat and the screen's empty
      // state is what the member should see.
      container.read(exploreCyclesProvider.notifier).advance(9);
      expect(container.read(exploreFollowingLoopedFeedProvider), isEmpty);
    });
  });
}
