// Nobody's work plays in the order they uploaded it.
//
// Both Explore sources arrive newest-first, which on an archive this size meant
// a creator who published six songs on a Sunday owned the next six swipes, in
// publish order, and owned them again in the same order the next day. These
// hold the three properties that fix without breaking anything else:
//
//   * a creator's own reels come out shuffled;
//   * consecutive reels are by different people while there is anybody else
//     left to deal;
//   * and the arrangement is the *same* on every rebuild, because the feed
//     recomputes on every Firestore tick and the pager addresses reels by
//     position — an order that moved would drop the member onto a different
//     video mid-swipe.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

Reel _reel(String id, String creatorId) => Reel(
  id: id,
  imageUrl: '',
  label: 'REEL',
  title: id,
  creator: creatorId,
  creatorId: creatorId,
  initials: 'KC',
  caption: '',
  sound: '',
  credit: '',
  isLive: true,
  videoUrl: 'https://example.test/$id',
);

/// [count] reels by one creator, in upload order.
List<Reel> _by(String creatorId, int count) => [
  for (var index = 0; index < count; index++)
    _reel('$creatorId-$index', creatorId),
];

List<String> _ids(Iterable<Reel> reels) => [for (final r in reels) r.id];
List<String> _creators(Iterable<Reel> reels) => [
  for (final r in reels) r.creatorId,
];

void main() {
  group('variedByCreator', () {
    test('keeps every reel, exactly once', () {
      final input = [..._by('afi', 4), ..._by('nyaaba', 3), ..._by('awini', 2)];
      final varied = variedByCreator(input);

      expect(varied, hasLength(input.length));
      expect(_ids(varied).toSet(), _ids(input).toSet());
    });

    test('does not play one person back in the order they uploaded', () {
      // Six is enough that an unchanged order is a one-in-720 coincidence
      // rather than a plausible shuffle result.
      final afi = _by('afi', 6);
      final varied = variedByCreator([...afi, ..._by('nyaaba', 6)]);
      final afiOrder = [
        for (final reel in varied)
          if (reel.creatorId == 'afi') reel.id,
      ];

      expect(afiOrder, isNot(_ids(afi)));
      expect(afiOrder.toSet(), _ids(afi).toSet());
    });

    test('deals the people in turn, so nobody owns a run of the feed', () {
      final varied = variedByCreator([
        ..._by('afi', 3),
        ..._by('nyaaba', 3),
        ..._by('awini', 3),
      ]);

      final creators = _creators(varied);
      for (var index = 1; index < creators.length; index++) {
        expect(
          creators[index],
          isNot(creators[index - 1]),
          reason: 'two in a row by ${creators[index]} at $index',
        );
      }
    });

    test('whoever posted most recently still leads', () {
      // Recency is what makes the feed a living one, and dealing round-robin
      // must not cost it: the creator the newest-first list met first is still
      // the creator the varied list opens with.
      final varied = variedByCreator([..._by('afi', 2), ..._by('nyaaba', 2)]);

      expect(varied.first.creatorId, 'afi');
    });

    test('a creator who runs out drops out rather than repeating', () {
      final varied = variedByCreator([..._by('afi', 1), ..._by('nyaaba', 3)]);

      expect(_ids(varied), hasLength(4));
      expect(
        _creators(varied).where((id) => id == 'afi'),
        hasLength(1),
      );
    });

    test('is the same arrangement every time it is built', () {
      // The hazard this exists for. The feed is a plain provider over two live
      // Firestore snapshots and recomputes whenever either ticks; an unseeded
      // shuffle would hand back a different order each time and teleport the
      // member mid-swipe.
      final input = [..._by('afi', 5), ..._by('nyaaba', 4)];

      expect(_ids(variedByCreator(input)), _ids(variedByCreator(input)));
    });

    test("one person's arrangement does not move when somebody else posts", () {
      final before = variedByCreator(_by('afi', 5));
      final after = variedByCreator([..._by('afi', 5), ..._by('nyaaba', 5)]);

      expect(
        [
          for (final reel in after)
            if (reel.creatorId == 'afi') reel.id,
        ],
        _ids(before),
      );
    });

    test('a feed with nothing to rearrange is handed straight back', () {
      // One reel each is round-robin over singletons: the original order, at
      // more expense. Identity rather than a copy, so the caller's own
      // unmodifiable wrapper is not quietly replaced by a growable list.
      final singles = [_reel('a', 'afi'), _reel('b', 'nyaaba')];
      expect(identical(variedByCreator(singles), singles), isTrue);
      expect(variedByCreator(const <Reel>[]), isEmpty);
    });

    test('reels with no account behind them are one bucket, not one each', () {
      // The curated preview has no creator id. Treated as a bucket per reel it
      // would deal as singletons and come back untouched, which is the wrong
      // answer for a real feed that happens to be missing the field.
      final anonymous = [
        for (var index = 0; index < 6; index++) _reel('anon-$index', ''),
      ];
      final varied = variedByCreator(anonymous);

      expect(_ids(varied), isNot(_ids(anonymous)));
      expect(_ids(varied).toSet(), _ids(anonymous).toSet());
    });
  });

  group('creatorOrderSeed', () {
    test('is stable for one id and different across ids', () {
      // Deliberately not Object.hashCode, which Dart salts per process: the
      // same member would get a freshly shuffled archive on every launch.
      expect(creatorOrderSeed('afi'), creatorOrderSeed('afi'));
      expect(creatorOrderSeed('afi'), isNot(creatorOrderSeed('nyaaba')));
      expect(creatorOrderSeed(''), isNonNegative);
    });
  });
}
