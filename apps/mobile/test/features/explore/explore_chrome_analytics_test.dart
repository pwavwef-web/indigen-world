// When Explore's chrome gets out of the way, and when looking counts as
// watching.
//
// Both are timing rules, and both fail quietly. Chrome that flickers on every
// swipe, or that never comes back after a pause, looks like a glitch rather
// than a bug anybody can file. A view counted on a fling makes every number
// downstream a measure of thumb speed.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/explore/explore_analytics.dart';
import 'package:indigen_world_mobile/features/explore/explore_chrome.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

void main() {
  group('ExploreChromeController', () {
    ExploreChromeController make(WidgetTester tester) =>
        ExploreChromeController();

    /// Lets every timer the controller set run out, then lets it go — a
    /// test binding refuses to finish with a timer still pending.
    Future<void> finish(
      WidgetTester tester,
      ExploreChromeController chrome,
    ) async {
      await tester.pump(const Duration(seconds: 8));
      chrome.dispose();
    }

    testWidgets('everything is visible when Explore opens', (tester) async {
      final chrome = make(tester);
      expect(chrome.value, isTrue);
      await finish(tester, chrome);
    });

    testWidgets('uninterrupted playback puts it away, after a while', (
      tester,
    ) async {
      final chrome = make(tester)..setPlaying(true);
      await tester.pump(const Duration(seconds: 2));
      expect(chrome.value, isTrue);
      await tester.pump(const Duration(seconds: 2));
      expect(chrome.value, isFalse);
      await finish(tester, chrome);
    });

    testWidgets('pausing brings it back and keeps it', (tester) async {
      final chrome = make(tester)..setPlaying(true);
      await tester.pump(const Duration(seconds: 4));
      expect(chrome.value, isFalse);
      chrome.setPlaying(false);
      expect(chrome.value, isTrue);
      await tester.pump(const Duration(seconds: 10));
      expect(chrome.value, isTrue);
      await finish(tester, chrome);
    });

    testWidgets('a tap brings it back, and it goes again later', (
      tester,
    ) async {
      final chrome = make(tester)..setPlaying(true);
      await tester.pump(const Duration(seconds: 4));
      chrome.interacted();
      expect(chrome.value, isTrue);
      await tester.pump(const Duration(seconds: 4));
      expect(chrome.value, isFalse);
      await finish(tester, chrome);
    });

    testWidgets('an open sheet holds it, however long it plays', (
      tester,
    ) async {
      final chrome = make(tester)
        ..setPlaying(true)
        ..hold('context');
      await tester.pump(const Duration(seconds: 20));
      expect(chrome.value, isTrue);
      chrome.release('context');
      await tester.pump(const Duration(seconds: 4));
      expect(chrome.value, isFalse);
      await finish(tester, chrome);
    });

    testWidgets('dragging on hides it, dragging back shows it', (tester) async {
      final chrome = make(tester)..setPlaying(true);
      chrome.dragged(towardsPrevious: false);
      expect(chrome.value, isFalse);
      chrome.dragged(towardsPrevious: true);
      expect(chrome.value, isTrue);
      await finish(tester, chrome);
    });

    testWidgets('a new reel reveals it once the swipe settles', (tester) async {
      final chrome = make(tester)..setPlaying(true);
      chrome
        ..dragged(towardsPrevious: false)
        ..settled(changedReel: true);
      expect(chrome.value, isFalse);
      await tester.pump(const Duration(milliseconds: 400));
      expect(chrome.value, isTrue);
      await finish(tester, chrome);
    });

    testWidgets('rapid swiping does not blink it on between reels', (
      tester,
    ) async {
      final chrome = make(tester)..setPlaying(true);
      var shows = 0;
      var last = chrome.value;
      chrome.addListener(() {
        if (chrome.value && !last) shows++;
        last = chrome.value;
      });
      for (var swipe = 0; swipe < 6; swipe++) {
        chrome
          ..dragged(towardsPrevious: false)
          ..settled(changedReel: true);
        // The next swipe starts before the reveal is due.
        await tester.pump(const Duration(milliseconds: 150));
      }
      expect(shows, 0);
      expect(chrome.value, isFalse);
      await finish(tester, chrome);
    });

    testWidgets('a hide asked for right after a show waits its turn', (
      tester,
    ) async {
      final chrome = make(tester)..setPlaying(true);
      chrome.dragged(towardsPrevious: false);
      expect(chrome.value, isFalse);
      chrome.interacted();
      expect(chrome.value, isTrue);
      chrome.dragged(towardsPrevious: false);
      // Not immediately: that is the flicker.
      expect(chrome.value, isTrue);
      await tester.pump(const Duration(milliseconds: 500));
      expect(chrome.value, isFalse);
      await finish(tester, chrome);
    });

    testWidgets('a screen reader keeps it on screen', (tester) async {
      final chrome = make(tester)
        ..alwaysVisible = true
        ..setPlaying(true);
      chrome.dragged(towardsPrevious: false);
      await tester.pump(const Duration(seconds: 10));
      expect(chrome.value, isTrue);
      await finish(tester, chrome);
    });
  });

  group('exploreDwellFor', () {
    test('a fling is neither an impression nor a view', () {
      final dwell = exploreDwellFor(
        onScreen: const Duration(milliseconds: 400),
        watched: const Duration(milliseconds: 400),
      );
      expect(dwell.impression, isFalse);
      expect(dwell.qualified, isFalse);
    });

    test('a second on screen is an impression, not yet a view', () {
      final dwell = exploreDwellFor(
        onScreen: const Duration(seconds: 1),
        watched: const Duration(seconds: 1),
      );
      expect(dwell.impression, isTrue);
      expect(dwell.qualified, isFalse);
    });

    test('three seconds of watching is a view', () {
      final dwell = exploreDwellFor(
        onScreen: const Duration(seconds: 3),
        watched: const Duration(seconds: 3),
      );
      expect(dwell.qualified, isTrue);
    });

    test('a clip paused on its first frame is not a view', () {
      final dwell = exploreDwellFor(
        onScreen: const Duration(seconds: 30),
        watched: Duration.zero,
        videoLength: const Duration(seconds: 40),
      );
      expect(dwell.impression, isTrue);
      expect(dwell.qualified, isFalse);
    });

    test('a short clip qualifies at half its length', () {
      final dwell = exploreDwellFor(
        onScreen: const Duration(seconds: 2),
        watched: const Duration(seconds: 2),
        videoLength: const Duration(seconds: 4),
      );
      expect(dwell.qualified, isTrue);
    });
  });

  group('exploreLoopedBack', () {
    const length = Duration(seconds: 20);

    test('the end of a clip jumping to its start is a loop', () {
      expect(
        exploreLoopedBack(
          previous: const Duration(milliseconds: 19500),
          current: const Duration(milliseconds: 200),
          length: length,
        ),
        isTrue,
      );
    });

    test('a scrub back from the middle is not', () {
      expect(
        exploreLoopedBack(
          previous: const Duration(seconds: 10),
          current: const Duration(milliseconds: 200),
          length: length,
        ),
        isFalse,
      );
    });

    test('ordinary playback is not', () {
      expect(
        exploreLoopedBack(
          previous: const Duration(seconds: 5),
          current: const Duration(milliseconds: 5250),
          length: length,
        ),
        isFalse,
      );
    });
  });

  group('reelAnalyticsParameters', () {
    test('describe the content, never the people', () {
      const reel = Reel(
        id: 'community:post-1',
        communityPostId: 'post-1',
        imageUrl: '',
        label: '',
        title: 'Drums',
        creator: 'Afi Mensah',
        creatorId: 'afi-uid',
        initials: 'AM',
        caption: 'A private caption',
        sound: '',
        credit: '',
        isLive: true,
        videoUrl: 'https://example.test/v.mp4',
        community: PostCommunityStamp(
          id: 'kasena-culture',
          name: 'Kasena Culture',
          isPrivate: false,
        ),
      );
      final parameters = reelAnalyticsParameters(reel);
      expect(parameters['source'], 'community');
      expect(parameters['media_kind'], 'video');
      expect(parameters['community_id'], 'kasena-culture');
      expect(parameters.values, isNot(contains('afi-uid')));
      expect(parameters.values, isNot(contains('Afi Mensah')));
      expect(parameters.values, isNot(contains('A private caption')));
    });

    test('every event name fits Firebase', () {
      for (final event in ExploreEvent.values) {
        expect(event.wire.length, lessThanOrEqualTo(40));
        expect(RegExp(r'^[a-z][a-z0-9_]*$').hasMatch(event.wire), isTrue);
      }
    });
  });
}
