import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/feed_fairness.dart';

import 'community_test_harness.dart';

void main() {
  final now = DateTime(2026, 9, 12, 12);

  test(
    'lifts an older low-exposure post without disturbing the newest five',
    () {
      final posts = [
        for (var index = 0; index < 16; index++)
          fakePost(
            id: 'post-$index',
            viewCount: index == 14 ? 2 : 40,
            createdAt: now.subtract(Duration(hours: index + 1)),
          ),
      ];

      final ranked = preventPostBurial(posts, now: now);

      expect(ranked.take(5).map((post) => post.id), [
        'post-0',
        'post-1',
        'post-2',
        'post-3',
        'post-4',
      ]);
      expect(ranked[5].id, 'post-14');
      expect(ranked.map((post) => post.id).toSet().length, posts.length);
    },
  );

  test('does not lift fresh, week-old, or already-exposed posts', () {
    final posts = [
      for (var index = 0; index < 16; index++)
        fakePost(
          id: 'post-$index',
          viewCount: index == 10 ? 14 : 15,
          createdAt: index == 10
              ? now.subtract(const Duration(days: 8))
              : now.subtract(Duration(hours: index + 1)),
        ),
    ];

    expect(preventPostBurial(posts, now: now), same(posts));
  });
}
