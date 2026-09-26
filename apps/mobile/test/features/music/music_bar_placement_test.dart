// Where the minimised player parks, and where a drag leaves it.
//
// All of this is arithmetic on purpose: the corner the bubble chooses has to
// clear the nav rail and the floating button six screens keep in that same
// corner, and a rule like that is worth being able to check without pumping a
// widget.

import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/music/music_bar_placement.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// A phone: 360 by 800, with a gesture bar at the bottom.
const _bounds = MusicBubbleBounds(
  box: Size(360, 800),
  safeTop: 28,
  safeBottom: 34,
);

void main() {
  group('the parked bubble', () {
    test('sits in the bottom-right, above the rail and above a floating '
        'button', () {
      final home = _bounds.homeRect;

      expect(home.right, 360 - kMusicBarMargin);
      expect(home.width, kMusicBubbleSize);
      // Everything a screen keeps in that corner is under it: the rail, and
      // the floating button that sits on top of the rail.
      final railTop = 800 - 34 - kFrostedNavBarReservedSpace;
      expect(home.bottom, lessThanOrEqualTo(railTop - 56));
    });

    test('never parks off the top of a short screen', () {
      const short = MusicBubbleBounds(
        box: Size(360, 260),
        safeTop: 28,
        safeBottom: 34,
      );

      expect(short.homeRect.top, greaterThanOrEqualTo(short.minTop));
      expect(short.homeRect.top, lessThanOrEqualTo(short.maxTop));
    });
  });

  group('a drag', () {
    test('snaps to whichever edge it was let go nearer', () {
      expect(_bounds.dockFor(const Offset(20, 400)).onLeft, isTrue);
      expect(_bounds.dockFor(const Offset(280, 400)).onLeft, isFalse);
      // Its middle decides, not its left edge: let go at 155 the bubble
      // straddles the centre line with most of itself on the right, and goes
      // right.
      expect(_bounds.dockFor(const Offset(155, 400)).onLeft, isFalse);
      expect(_bounds.dockFor(const Offset(145, 400)).onLeft, isTrue);
    });

    test('remembers the height as a fraction of the travel', () {
      expect(_bounds.dockFor(Offset(20, _bounds.minTop)).topFraction, 0);
      expect(_bounds.dockFor(Offset(20, _bounds.maxTop)).topFraction, 1);
      // Past either end — a fling — lands at the end rather than outside it.
      expect(_bounds.dockFor(const Offset(20, -400)).topFraction, 0);
      expect(_bounds.dockFor(const Offset(20, 4000)).topFraction, 1);
    });

    test('put back on a screen it does not fit, it lands inside it', () {
      // Rotated, split-screened, or simply a smaller window than the one the
      // bubble was dropped on.
      const narrow = MusicBubbleBounds(
        box: Size(360, 300),
        safeTop: 28,
        safeBottom: 34,
      );
      final rect = narrow.rectFor(
        const MusicBubbleDock(onLeft: true, topFraction: 1),
      );

      expect(rect.left, kMusicBarMargin);
      expect(rect.top, lessThanOrEqualTo(narrow.maxTop));
      expect(rect.bottom, lessThanOrEqualTo(300));
    });

    test('dragged to the very bottom, it lands where the bar itself sits', () {
      final rect = _bounds.rectFor(
        const MusicBubbleDock(onLeft: false, topFraction: 1),
      );

      expect(rect.top, _bounds.barRect.top);
    });

    test('cannot be dragged off the screen', () {
      final left = _bounds.clamp(const Offset(-200, 400));
      final low = _bounds.clamp(const Offset(200, 4000));

      expect(left.dx, kMusicBarMargin);
      expect(low.dy, _bounds.maxTop);
    });
  });

  group('the placement', () {
    test('collapsing and expanding keeps where the bubble was put', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final placement = container.read(musicBarPlacementProvider.notifier);

      placement.dockAt(const MusicBubbleDock(onLeft: true, topFraction: 0.25));
      placement.collapse();
      expect(container.read(musicBarPlacementProvider).collapsed, isTrue);

      placement.expand();
      final after = container.read(musicBarPlacementProvider);
      expect(after.collapsed, isFalse);
      // Minimising again should not send it back to the corner it was moved
      // out of.
      expect(
        after.dock,
        const MusicBubbleDock(onLeft: true, topFraction: 0.25),
      );
    });
  });
}
