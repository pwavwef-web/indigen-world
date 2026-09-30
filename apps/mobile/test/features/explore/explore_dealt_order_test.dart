// What Explore has dealt stays dealt.
//
// The ranking runs again whenever either source ticks or the window widens,
// and it used to reorder the whole feed each time: reels the member had
// already watched came round again ahead of them, and reels about to arrive
// slipped behind them and were never shown. Once the member is past the first
// reel, the order they have been dealt is written down and a later answer can
// only add to the end of it.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/explore_topics.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

Reel _reel(String id, {String creator = ''}) => Reel(
  id: id,
  imageUrl: '',
  label: '',
  title: id,
  creator: creator,
  creatorId: creator,
  initials: 'XX',
  caption: '',
  sound: '',
  credit: '',
);

List<String> _ids(List<Reel> reels) => [for (final reel in reels) reel.id];

/// Lets a stubbed stream's value travel through the providers that read it.
Future<void> _turns() async {
  for (var turn = 0; turn < 4; turn++) {
    await Future<void>.delayed(Duration.zero);
  }
}

PublishedReel _published(String id, {required int daysAgo, String? creator}) =>
    PublishedReel(
      id: id,
      title: id,
      creatorName: creator ?? 'Creator $id',
      creatorId: creator ?? 'creator-$id',
      mediaUrl: 'https://example.test/$id.mp4',
      mediaType: 'video',
      publicationRoute: 'reviewed',
      publishedAt: DateTime.now()
          .subtract(Duration(days: daysAgo))
          .toIso8601String(),
    );

void main() {
  group('keepDealtOrder', () {
    test('with nothing dealt, the ranking stands', () {
      final ranked = [_reel('a'), _reel('b')];
      expect(identical(keepDealtOrder(ranked, const []), ranked), isTrue);
    });

    test('what was dealt stays in place and new reels join the end', () {
      final ranked = [
        _reel('d'),
        _reel('b'),
        _reel('a'),
        _reel('e'),
        _reel('c'),
      ];
      expect(_ids(keepDealtOrder(ranked, const ['a', 'b', 'c'])), [
        'a',
        'b',
        'c',
        'd',
        'e',
      ]);
    });

    test('a reel that has gone leaves no gap and moves nothing else', () {
      final ranked = [_reel('c'), _reel('a')];
      expect(_ids(keepDealtOrder(ranked, const ['a', 'b', 'c'])), ['a', 'c']);
    });

    test('the reels are the ranking\'s own, so their details stay current', () {
      final fresh = _reel('a', creator: 'afi');
      final kept = keepDealtOrder([fresh], const ['a']);
      expect(identical(kept.single, fresh), isTrue);
    });

    test('the seam does not put one person twice in a row', () {
      final ranked = [
        _reel('old', creator: 'afi'),
        _reel('new-afi', creator: 'afi'),
        _reel('new-kofi', creator: 'kofi'),
      ];
      expect(_ids(keepDealtOrder(ranked, const ['old'])), [
        'old',
        'new-kofi',
        'new-afi',
      ]);
    });
  });

  group('ExploreDealtOrder', () {
    test('writing the same order down again changes nothing', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final key = exploreFeedKey(following: false, topic: ExploreTopic.forYou);
      final notifier = container.read(exploreDealtOrderProvider(key).notifier);
      var changes = 0;
      container.listen(exploreDealtOrderProvider(key), (_, _) => changes++);

      notifier.freeze([_reel('a'), _reel('b')]);
      notifier.freeze([_reel('a'), _reel('b')]);
      expect(changes, 1);
      expect(container.read(exploreDealtOrderProvider(key)), ['a', 'b']);
    });

    test('each feed and topic keeps its own order', () {
      expect(
        exploreFeedKey(following: false, topic: ExploreTopic.forYou),
        isNot(exploreFeedKey(following: true, topic: ExploreTopic.forYou)),
      );
      expect(
        exploreFeedKey(following: false, topic: ExploreTopic.forYou),
        isNot(exploreFeedKey(following: false, topic: ExploreTopic.music)),
      );
    });
  });

  group('For you, once dealt', () {
    test(
      'a newer reel arriving joins the end instead of jumping ahead',
      () async {
        final published = StreamController<List<PublishedReel>>.broadcast();
        addTearDown(published.close);
        final container = ProviderContainer(
          overrides: [
            publishedReelsProvider.overrideWith((ref) => published.stream),
            exploreCommunityFeedProvider.overrideWithValue(
              const AsyncValue.data(<CommunityPost>[]),
            ),
          ],
        );
        addTearDown(container.dispose);
        container.listen(exploreContentProvider, (_, _) {});

        published.add([
          _published('older', daysAgo: 9),
          _published('old', daysAgo: 5),
        ]);
        await _turns();
        final dealt = container.read(exploreContentProvider);
        expect(_ids(dealt), ['old', 'older']);

        final key = exploreFeedKey(
          following: false,
          topic: ExploreTopic.forYou,
        );
        container.read(exploreDealtOrderProvider(key).notifier).freeze(dealt);

        // Published this morning: ranked alone it would lead the feed.
        published.add([
          _published('today', daysAgo: 0),
          _published('older', daysAgo: 9),
          _published('old', daysAgo: 5),
        ]);
        await _turns();
        expect(_ids(container.read(exploreContentProvider)), [
          'old',
          'older',
          'today',
        ]);

        // Starting the ranking again lets the newest lead once more.
        container.invalidate(exploreDealtOrderProvider);
        expect(_ids(container.read(exploreContentProvider)).first, 'today');
      },
    );
  });
}
