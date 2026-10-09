// The player where the app really puts it: in `MaterialApp.builder`, above the
// Navigator.
//
// The other music tests pump the dock under `MaterialApp.home`, inside the
// Navigator, whose Overlay quietly hosts the bar's tooltips. The app mounts it
// above that Navigator, where there is no Overlay at all. A tooltip with
// nowhere to show asserted in debug builds and, in release, threw "No Overlay
// widget found" as soon as a long-press asked one to appear: the button drew as
// a grey box and Crashlytics filed a fatal report. These tests pump the shape
// the app actually has.

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/music/music_bar_placement.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_bubble.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_overlay.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Answers every transport call without reaching a handler.
class _QuietController extends MusicController {
  @override
  Future<void> play() async {}

  @override
  Future<void> pause() async {}

  @override
  Future<void> next() async {}

  @override
  Future<void> previous() async {}

  @override
  Future<void> dismiss() async {}
}

Future<ProviderContainer> _pumpApp(
  WidgetTester tester, {
  VoidCallback? onTapUnderneath,
}) async {
  final container = ProviderContainer(
    overrides: [
      musicMediaItemProvider.overrideWith(
        (ref) =>
            Stream.value(const MediaItem(id: 'song', title: 'Kasena lullaby')),
      ),
      musicIsPlayingProvider.overrideWith((ref) => true),
      musicHasQueueProvider.overrideWith((ref) => true),
      musicControllerProvider.overrideWith(_QuietController.new),
    ],
  );
  addTearDown(container.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        // Where IndigenWorldApp mounts it: around the Navigator, not in it.
        builder: (context, child) => MusicOverlay(
          brand: brandPaletteFor(Brightness.light),
          child: child!,
        ),
        home: Scaffold(
          body: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTapUnderneath,
            child: const SizedBox.expand(),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  return container;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  testWidgets('the bar builds above the Navigator without an overlay error', (
    tester,
  ) async {
    await _pumpApp(tester);

    expect(tester.takeException(), isNull);
    // Every button the bar has at this width, all of them tooltips.
    for (final label in [
      'Previous',
      'Pause',
      'Next',
      'Minimize player',
      'Stop and close player',
    ]) {
      expect(find.byTooltip(label), findsOneWidget, reason: label);
    }
  });

  testWidgets('a long-press shows the tooltip instead of breaking the button', (
    tester,
  ) async {
    await _pumpApp(tester);

    await tester.longPress(find.byTooltip('Minimize player'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(tester.takeException(), isNull);
    // The message is drawn only once the tooltip is actually showing.
    expect(find.text('Minimize player'), findsOneWidget);

    // Let it time out and fade, so no tooltip timer outlives the test.
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Minimize player'), findsNothing);
  });

  testWidgets('taps around the player still reach the screen underneath', (
    tester,
  ) async {
    var tapped = 0;
    final container = await _pumpApp(tester, onTapUnderneath: () => tapped++);

    await tester.tapAt(const Offset(200, 120));
    expect(tapped, 1);

    // And the same with the player minimised to the bubble.
    container.read(musicBarPlacementProvider.notifier).collapse();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(MusicBubble), findsOneWidget);

    await tester.tapAt(const Offset(200, 120));
    expect(tapped, 2);
    expect(tester.takeException(), isNull);
  });
}
