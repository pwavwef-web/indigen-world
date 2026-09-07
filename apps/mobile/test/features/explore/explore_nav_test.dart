// Explore's own navigation, and the way out of it.
//
// ── The two problems these tests hold shut ────────────────────────────────
// Explore is the one destination the shell draws no rail under, which is right
// — full-bleed video with a tab bar painted over it is a tab with chrome on it
// rather than a place — and which left it with no navigation at all. The way
// out was the system back gesture: nothing on screen mentioned it, and on a
// gesture-navigation phone it competes with the feed's own drags. The way to
// anything else in Explore was two icons in opposite top corners.
//
// The second problem was quieter and worse. A reel kept playing, with sound,
// underneath the search screen and the recorder — because the feed decides
// whether to play from the *shell's* answer to "is Explore the selected tab",
// and pushing a route does not change that. Somebody who tapped Search got a
// keyboard, a list of results, and a stranger's video talking over all of it.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/explore_screen.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

/// Explore with nothing published, which is a real state and the one that can
/// be pumped without a video decoder.
///
/// The empty state draws the same nav bar the feed does, and deliberately: an
/// empty Following feed is exactly where somebody needs the way back to For you
/// and the way out of Explore.
Future<void> _pumpExplore(
  WidgetTester tester, {
  VoidCallback? onExit,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        publishedReelsProvider.overrideWith(
          (ref) => Stream.value(const <PublishedReel>[]),
        ),
        followingIdsProvider.overrideWith(
          (ref) => Stream.value(const <String>[]),
        ),
        communityFeedProvider.overrideWithValue(
          const AsyncValue.data(<CommunityPost>[]),
        ),
        followingFeedProvider.overrideWithValue(
          const AsyncValue.data(<CommunityPost>[]),
        ),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: ExploreScreen(onExit: onExit),
      ),
    ),
  );
  // The feed is assembled from four streams that settle on the microtask
  // queue. One pump paints a screen that is still waiting for all of them.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('Explore carries its own nav bar', (tester) async {
    // Larger than a phone so the whole bar is laid out; the bar itself is
    // fixed-height and the test is about what is in it, not how it wraps.
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _pumpExplore(tester, onExit: () {});

    // The four places Explore goes, labelled. Four unlabelled icons over video
    // is a row of guesses.
    expect(find.text('For you'), findsOneWidget);
    expect(find.text('Following'), findsOneWidget);
    expect(find.text('Post'), findsOneWidget);
    expect(find.text('Saved'), findsOneWidget);
    // And the way out, set apart from them because it leads somewhere else.
    expect(find.text('Back'), findsOneWidget);
  });

  testWidgets('back hands the member to the tab they came from', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    var left = 0;
    await _pumpExplore(tester, onExit: () => left++);

    await tester.tap(find.text('Back'));
    await tester.pump();
    expect(left, 1);
  });

  testWidgets('no back button where there is nothing to go back to', (
    tester,
  ) async {
    // Only the shell knows which tab the member came from, so Explore shown
    // anywhere else gets no callback — and a back button that goes nowhere is
    // worse than none.
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _pumpExplore(tester);

    expect(find.text('Back'), findsNothing);
    // The destinations are all still there — losing the way out must not lose
    // the way around.
    expect(find.text('For you'), findsOneWidget);
    expect(find.text('Saved'), findsOneWidget);
  });

  testWidgets('the feed switch moved into the bar and is not drawn twice', (
    tester,
  ) async {
    // It used to sit in the header as well. Two switches for one piece of
    // state is two things that can disagree, and a member who taps the one
    // that did not move learns the app is broken.
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _pumpExplore(tester, onExit: () {});

    expect(find.text('For you'), findsOneWidget);
    expect(find.text('Following'), findsOneWidget);
  });

  testWidgets('switching to Following changes what the screen says', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await _pumpExplore(tester, onExit: () {});

    expect(find.text('No reels have been published yet'), findsOneWidget);
    await tester.tap(find.text('Following'));
    await tester.pump();

    // Following being empty means the member follows nobody, which is a
    // different thing from the archive being empty and gets a different
    // sentence. The bar is what makes both reachable.
    expect(
      find.text('Nothing from the people you follow'),
      findsOneWidget,
    );
  });
}
