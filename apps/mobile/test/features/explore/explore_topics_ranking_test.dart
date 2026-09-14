// What a reel is about, and in what order For you and Following show them.
//
// Topics are read off what the archive actually stores — a Collection channel,
// a post category, free-text categories, tags and captions — because nothing is
// tagged with Explore's topics directly. The ranking is a sum of legible terms
// followed by a diversity pass, and both have to be deterministic: the pager
// addresses reels by position, and a feed that reordered itself on every
// Firestore tick would move the video under the member's thumb.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/explore/explore_ranking.dart';
import 'package:indigen_world_mobile/features/explore/explore_topics.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

final _now = DateTime.utc(2026, 9, 13, 12);

Reel _reel(
  String id, {
  String creator = 'afi',
  String collectionKind = '',
  String? postCategory,
  String category = '',
  String caption = '',
  List<String> tags = const [],
  String? communityId,
  DateTime? publishedAt,
  String route = '',
  String culturalNotes = '',
  int likes = 0,
}) => Reel(
  id: id,
  imageUrl: '',
  label: '',
  title: '',
  creator: creator,
  creatorId: creator,
  initials: 'KC',
  caption: caption,
  sound: '',
  credit: '',
  isLive: true,
  videoUrl: 'https://example.test/$id',
  collectionKind: collectionKind,
  postCategory: postCategory,
  communityPostId: postCategory == null ? null : id,
  category: category,
  tags: tags,
  community: communityId == null
      ? null
      : PostCommunityStamp(
          id: communityId,
          name: communityId,
          isPrivate: false,
        ),
  publishedAt: publishedAt ?? _now.subtract(const Duration(days: 2)),
  publicationRoute: route,
  culturalNotes: culturalNotes,
  likes: likes,
);

void main() {
  group('reelTopics', () {
    test('reads the Collection channel', () {
      expect(reelTopics(_reel('a', collectionKind: 'music')), {
        ExploreTopic.music,
      });
      expect(reelTopics(_reel('b', collectionKind: 'literature')), {
        ExploreTopic.stories,
      });
    });

    test('reads a community post category', () {
      expect(reelTopics(_reel('a', postCategory: 'story')), {
        ExploreTopic.stories,
      });
      expect(reelTopics(_reel('b', postCategory: 'culture')), {
        ExploreTopic.traditions,
      });
    });

    test('reads free text, tags and captions, and can be more than one', () {
      final topics = reelTopics(
        _reel(
          'a',
          category: 'oral-history',
          caption: 'Drumming at the harvest festival in Navrongo',
        ),
      );
      expect(
        topics,
        containsAll([
          ExploreTopic.stories,
          ExploreTopic.music,
          ExploreTopic.traditions,
        ]),
      );
      expect(reelTopics(_reel('b', tags: ['Weaving'])), {
        ExploreTopic.traditions,
      });
    });

    test('a reel about nothing in particular has no topic', () {
      expect(reelTopics(_reel('a', caption: 'Good morning everyone')), isEmpty);
    });

    test('For you is everything, a topic narrows', () {
      final reels = [
        _reel('song', collectionKind: 'music'),
        _reel('tale', postCategory: 'story'),
        _reel('hello', caption: 'hello'),
      ];
      expect(reelsForTopic(reels, ExploreTopic.forYou), reels);
      expect(reelsForTopic(reels, ExploreTopic.music).map((reel) => reel.id), [
        'song',
      ]);
      expect(reelsForTopic(reels, ExploreTopic.traditions), isEmpty);
    });
  });

  group('rankForYou', () {
    test('keeps every reel exactly once', () {
      final reels = [
        for (var i = 0; i < 20; i++) _reel('r$i', creator: 'c${i % 4}'),
      ];
      final ranked = rankForYou(reels, ExploreSignals(now: _now));
      expect(ranked, hasLength(20));
      expect(ranked.map((reel) => reel.id).toSet(), hasLength(20));
    });

    test('is the same order every time it is built', () {
      final reels = [
        for (var i = 0; i < 12; i++) _reel('r$i', creator: 'c${i % 3}'),
      ];
      final signals = ExploreSignals(now: _now);
      expect(
        rankForYou(reels, signals).map((reel) => reel.id),
        rankForYou(reels.reversed.toList(), signals).map((reel) => reel.id),
      );
    });

    test('a followed creator and a joined community rise', () {
      final reels = [
        _reel('stranger', creator: 'x'),
        _reel('followed', creator: 'friend'),
        _reel('joined', creator: 'y', communityId: 'kasena-culture'),
      ];
      final ranked = rankForYou(
        reels,
        ExploreSignals(
          now: _now,
          followedCreators: const {'friend'},
          joinedCommunities: const {'kasena-culture'},
        ),
      ).map((reel) => reel.id).toList();
      expect(ranked.last, 'stranger');
    });

    test('reviewed work with context outranks a bare clip of the same age', () {
      final reels = [
        _reel('bare', creator: 'a'),
        _reel(
          'reviewed',
          creator: 'b',
          route: 'reviewed',
          culturalNotes: 'Sung at naming ceremonies.',
        ),
      ];
      expect(rankForYou(reels, ExploreSignals(now: _now)).first.id, 'reviewed');
    });

    test('this morning beats last year, other things equal', () {
      final reels = [
        _reel(
          'old',
          creator: 'a',
          publishedAt: _now.subtract(const Duration(days: 365)),
        ),
        _reel(
          'new',
          creator: 'b',
          publishedAt: _now.subtract(const Duration(hours: 3)),
        ),
      ];
      expect(rankForYou(reels, ExploreSignals(now: _now)).first.id, 'new');
    });

    test('one prolific, followed creator does not own the feed', () {
      final reels = [
        for (var i = 0; i < 8; i++) _reel('star$i', creator: 'star'),
        for (var i = 0; i < 4; i++) _reel('other$i', creator: 'o$i'),
      ];
      final ranked = rankForYou(
        reels,
        ExploreSignals(now: _now, followedCreators: const {'star'}),
      );
      // Wherever an alternative exists, the same person is never twice in a
      // row in the first stretch of the feed.
      for (var i = 1; i < 8; i++) {
        expect(
          ranked[i].creatorId == 'star' && ranked[i - 1].creatorId == 'star',
          isFalse,
          reason: 'positions ${i - 1} and $i',
        );
      }
    });

    test('appreciated topics pull related reels up', () {
      final reels = [
        _reel('liked-song', creator: 'a', collectionKind: 'music'),
        _reel('another-song', creator: 'b', collectionKind: 'music'),
        _reel('a-tale', creator: 'c', collectionKind: 'literature'),
      ];
      final ranked = rankForYou(
        reels,
        ExploreSignals(now: _now, likedIds: const {'liked-song'}),
      ).map((reel) => reel.id).toList();
      expect(
        ranked.indexOf('another-song'),
        lessThan(ranked.indexOf('a-tale')),
      );
    });
  });

  group('rankFollowing', () {
    test('newest first', () {
      final reels = [
        _reel(
          'week',
          creator: 'a',
          publishedAt: _now.subtract(const Duration(days: 7)),
        ),
        _reel(
          'hour',
          creator: 'b',
          publishedAt: _now.subtract(const Duration(hours: 1)),
        ),
        _reel(
          'day',
          creator: 'c',
          publishedAt: _now.subtract(const Duration(days: 1)),
        ),
      ];
      expect(rankFollowing(reels).map((reel) => reel.id), [
        'hour',
        'day',
        'week',
      ]);
    });

    test('breaks up a run by one person when others are close in time', () {
      final reels = [
        _reel(
          'a1',
          creator: 'a',
          publishedAt: _now.subtract(const Duration(minutes: 1)),
        ),
        _reel(
          'a2',
          creator: 'a',
          publishedAt: _now.subtract(const Duration(minutes: 2)),
        ),
        _reel(
          'b1',
          creator: 'b',
          publishedAt: _now.subtract(const Duration(minutes: 3)),
        ),
      ];
      final ranked = rankFollowing(reels)
          .map((reel) => reel.creatorId)
          .toList();
      expect(ranked, ['a', 'b', 'a']);
    });
  });
}
