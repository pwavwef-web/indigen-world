// Where "New voices" goes in the feed, and who it suggests.
//
// It used to be a rail pinned above the whole feed. It is now dropped in once,
// a few posts down, and only when there is somebody worth suggesting — so the
// insertion rule and the ranking are what decide whether it helps or intrudes.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/feed_discovery.dart';

import 'community_test_harness.dart';

void main() {
  group('insertDiscoveryRow', () {
    bool isPost(Object row) => row is CommunityPost;
    List<Object> posts(int count) => [
      for (var index = 0; index < count; index++) fakePost(id: 'post$index'),
    ];

    test('goes after the third post', () {
      final rows = insertDiscoveryRow(rows: posts(6), isPost: isPost);
      expect(rows, hasLength(7));
      expect(rows[3], isA<DiscoveryRow>());
      expect((rows[2] as CommunityPost).id, 'post2');
      expect((rows[4] as CommunityPost).id, 'post3');
    });

    test('counts posts, not adverts already spliced in', () {
      const advert = 'advert';
      final input = <Object>[...posts(2), advert, ...posts(3).skip(2)];
      // post0, post1, advert, post2
      final rows = insertDiscoveryRow(rows: input, isPost: isPost);
      expect(rows.indexWhere((row) => row is DiscoveryRow), 4);
      expect(rows[3], (input[3] as CommunityPost));
    });

    test('a short feed gets it after its last post; a tiny one not at all', () {
      final two = insertDiscoveryRow(rows: posts(2), isPost: isPost);
      expect(two.last, isA<DiscoveryRow>());
      expect(two, hasLength(3));

      expect(insertDiscoveryRow(rows: posts(1), isPost: isPost), hasLength(1));
      expect(insertDiscoveryRow(rows: const [], isPost: isPost), isEmpty);
    });

    test('is never first and never inserted twice', () {
      final once = insertDiscoveryRow(rows: posts(8), isPost: isPost);
      final twice = insertDiscoveryRow(rows: once, isPost: isPost);
      expect(twice.whereType<DiscoveryRow>(), hasLength(1));
      expect(once.first, isNot(isA<DiscoveryRow>()));
    });
  });

  group('rankVoiceSuggestions', () {
    final now = DateTime(2026, 9, 13);
    CommunityProfile person(
      String uid, {
      String dialect = '',
      String bio = 'Kasem speaker.',
      String? avatarUrl = 'https://example.test/a.jpg',
      DateTime? createdAt,
      String displayName = 'Somebody',
      String verifiedKind = '',
      bool phoneVerified = false,
    }) => CommunityProfile(
      uid: uid,
      username: uid,
      displayName: displayName,
      bio: bio,
      avatarUrl: avatarUrl,
      dialect: dialect,
      verifiedKind: verifiedKind,
      phoneVerified: phoneVerified,
      createdAt: createdAt ?? DateTime(2025, 1, 1),
    );

    test(
      'never suggests the reader, people they follow, or people they blocked',
      () {
        final ranked = rankVoiceSuggestions(
          candidates: [
            person('me'),
            person('followed'),
            person('blocked'),
            person('fresh', createdAt: DateTime(2026, 9, 1)),
          ],
          viewerUid: 'me',
          following: {'followed'},
          excluded: {'blocked'},
          now: now,
        );
        expect(ranked.map((s) => s.profile.uid), ['fresh']);
      },
    );

    test(
      'ranks community peers and same-dialect writers above the merely new',
      () {
        final ranked = rankVoiceSuggestions(
          candidates: [
            person('new', bio: '', createdAt: DateTime(2026, 9, 10)),
            person('neighbour', dialect: 'Paga'),
            person('peer'),
          ],
          viewerUid: 'me',
          following: const {},
          viewerDialect: 'paga',
          communityPeers: {'peer'},
          now: now,
        );
        expect(ranked.map((s) => s.profile.uid), ['peer', 'neighbour', 'new']);
        expect(ranked.first.reason, VoiceReason.sharedCommunity);
        expect(ranked[1].reason, VoiceReason.sameDialect);
        expect(ranked[2].reason, VoiceReason.newMember);
      },
    );

    test(
      'drops empty placeholder accounts and duplicates, keeping order on ties',
      () {
        final ranked = rankVoiceSuggestions(
          candidates: [
            person('a'),
            person(
              'placeholder',
              bio: '',
              avatarUrl: null,
              displayName: 'Community member',
              createdAt: DateTime(2026, 9, 12),
            ),
            person('b'),
            person('a'),
          ],
          viewerUid: 'me',
          following: const {},
          now: now,
        );
        expect(ranked.map((s) => s.profile.uid), ['a', 'b']);
      },
    );

    test('a verified creator and an active author are called out as such', () {
      final ranked = rankVoiceSuggestions(
        candidates: [
          person('writer'),
          person('creator', verifiedKind: 'creator', phoneVerified: true),
        ],
        viewerUid: 'me',
        following: const {},
        activeAuthors: {'writer'},
        now: now,
      );
      final reasons = {for (final s in ranked) s.profile.uid: s.reason};
      expect(reasons['creator'], VoiceReason.creator);
      expect(reasons['writer'], VoiceReason.activeNow);
    });
  });
}
