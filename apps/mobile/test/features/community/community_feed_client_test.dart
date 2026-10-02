import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_feed_client.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';

void main() {
  Map<String, Object?> page(String session, List<String> ids, String? cursor) =>
      {
        'sessionId': session,
        'nextCursor': cursor,
        'items': [
          for (final id in ids)
            {
              'id': id,
              'reason': 'Discover a learning post',
              'post': {
                'authorId': 'author-$id',
                'text': 'Post $id',
                'createdAt': {'__timestampMillis': 1800000000000},
              },
            },
        ],
      };

  test(
    'pagination appends a stable session and events deduplicate by kind',
    () async {
      final requests = <Map<String, Object?>>[];
      final events = <Map<String, Object?>>[];
      final client = CommunityFeedClient.withTransport((name, data) async {
        if (name == 'recordCommunityRecommendationEvent') {
          events.add(data);
          return {'recorded': true};
        }
        requests.add(data);
        return requests.length == 1
            ? page('session', ['a'], 'session:1')
            : page('session', ['b'], null);
      });
      expect((await client.load('for-you', 1)).map((p) => p.id), ['a']);
      expect((await client.load('for-you', 2)).map((p) => p.id), ['a', 'b']);
      expect(requests.last['cursor'], 'session:1');
      await client.load('for-you', 2);
      expect(requests.length, 2);
      await client.impression('a');
      await client.impression('a');
      await client.event('a', 'profile-visit');
      await client.event('not-served', 'share');
      expect(events.map((e) => e['kind']), ['impression', 'profile-visit']);
      expect(events.every((e) => e['sessionId'] == 'session'), isTrue);
    },
  );

  test('expired sessions restart once and failures remain retryable', () async {
    var calls = 0;
    final client = CommunityFeedClient.withTransport((name, data) async {
      calls++;
      if (calls == 1) return page('old', ['a'], 'old:1');
      if (data['cursor'] != null) {
        throw FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'Refresh this feed.',
        );
      }
      return page('new', ['b', 'c'], null);
    });
    await client.load('for-you', 1);
    expect((await client.load('for-you', 2)).map((p) => p.id), ['b', 'c']);
    expect(calls, 3);
    var failing = true;
    final retry = CommunityFeedClient.withTransport((name, data) async {
      if (failing) {
        throw FirebaseFunctionsException(
          code: 'unavailable',
          message: 'Retry later.',
        );
      }
      return page('recovered', ['d'], null);
    });
    await expectLater(
      retry.load('for-you', 1),
      throwsA(isA<FirebaseFunctionsException>()),
    );
    failing = false;
    expect((await retry.load('for-you', 1)).single.id, 'd');
  });

  test(
    'callable timestamps decode recursively for posts, polls and quotes',
    () {
      final decoded = decodeFeedValue({
        'createdAt': {'__timestampMillis': 1800000000000},
        'poll': {
          'endsAt': {'__timestampMillis': 1800000100000},
        },
        'media': [
          {'type': 'image', 'url': 'https://example.com/a.jpg'},
        ],
      }) as Map;
      expect(
        (decoded['createdAt'] as Timestamp).millisecondsSinceEpoch,
        1800000000000,
      );
      expect((decoded['poll'] as Map)['endsAt'], isA<Timestamp>());
      expect(
        ((decoded['media'] as List).first as Map)['url'],
        'https://example.com/a.jpg',
      );
    },
  );

  test('recommendation explanations survive optimistic engagement updates', () {
    final post = CommunityPost.fromMap('post', {
      'authorId': 'author',
      'text': 'A story',
      'createdAt': Timestamp.now(),
      'recommendationReason': 'Because you follow story',
    });
    expect(
      post.withLikeCount(1).recommendationReason,
      post.recommendationReason,
    );
    expect(post.toQuoteSnapshot().containsKey('recommendationReason'), isFalse);
  });

  test('Following does not apply For You resurfacing', () {
    final now = DateTime.now();
    final posts = List.generate(
      20,
      (i) => CommunityPost.fromMap('p$i', {
        'authorId': 'a$i',
        'text': 'Story $i',
        'createdAt': Timestamp.fromDate(now.subtract(Duration(hours: i))),
      }),
    );
    final result = visibleCommunityFeed(
      AsyncData(posts),
      applyFairness: false,
      hidden: const {},
      muted: const {},
      blocked: const {},
    );
    expect(result.value!.map((p) => p.id), posts.map((p) => p.id));
  });
}
