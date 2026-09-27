// The song, full screen — and the bar it grows out of.
//
// The old screen was drawn with the mini-player still sitting over its foot:
// the small player and the big one, the same song and the same buttons twice.
// The big one now takes the bar's place while it is up, and gives it back when
// it goes — without the screens underneath losing the room the bar keeps.

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_bar_placement.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/now_playing_screen.dart';
import 'package:indigen_world_mobile/features/music/widgets/mini_player.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_overlay.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _RecordingController extends MusicController {
  final touched = <String>[];

  @override
  Future<void> play() async => touched.add('play');

  @override
  Future<void> pause() async => touched.add('pause');

  @override
  Future<void> next() async => touched.add('next');

  @override
  Future<void> previous() async => touched.add('previous');

  @override
  Future<void> dismiss() async => touched.add('dismiss');
}

const _song = MediaItem(
  id: 'song',
  title: 'Kasena lullaby',
  artist: 'Paga women\'s choir',
  duration: Duration(minutes: 3),
);

final _navigator = GlobalKey<NavigatorState>();

Future<ProviderContainer> _pumpApp(
  WidgetTester tester, {
  bool playing = true,
}) async {
  tester.view
    ..physicalSize = const Size(1170, 2532)
    ..devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final container = ProviderContainer(
    overrides: [
      musicMediaItemProvider.overrideWith((ref) => Stream.value(_song)),
      musicIsPlayingProvider.overrideWith((ref) => playing),
      musicHasQueueProvider.overrideWith((ref) => true),
      musicControllerProvider.overrideWith(_RecordingController.new),
      musicCollectionProvider.overrideWith(
        (ref) => Stream.value(const <PublishedReel>[]),
      ),
      audiobookCollectionProvider.overrideWith(
        (ref) => Stream.value(const <PublishedReel>[]),
      ),
      downloadsProvider.overrideWith((ref) => Stream.value(const [])),
    ],
  );
  addTearDown(container.dispose);

  late double inset;
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        navigatorKey: _navigator,
        theme: buildIndigenTheme(),
        builder: (context, child) => MusicOverlay(
          brand: brandPaletteFor(Brightness.light),
          child: child!,
        ),
        home: Scaffold(
          body: Builder(
            builder: (context) {
              inset = musicInset(context);
              return Text('underneath $inset');
            },
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  expect(inset, greaterThanOrEqualTo(kMiniPlayerHeight));
  return container;
}

Future<void> _openNowPlaying(WidgetTester tester) async {
  _navigator.currentState!.push(
    MaterialPageRoute<void>(builder: (context) => const NowPlayingScreen()),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

_RecordingController _controllerOf(ProviderContainer container) =>
    container.read(musicControllerProvider.notifier) as _RecordingController;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  testWidgets('the bar steps out of sight under the big player, and back', (
    tester,
  ) async {
    final container = await _pumpApp(tester);
    expect(find.byType(MiniPlayer), findsOneWidget);

    await _openNowPlaying(tester);
    expect(container.read(nowPlayingOpenProvider), 1);
    final fade = tester.widget<AnimatedOpacity>(
      find.ancestor(
        of: find.byType(MiniPlayer),
        matching: find.byType(AnimatedOpacity),
      ),
    );
    expect(fade.opacity, 0);
    // Hidden, not collapsed: the screens underneath keep the bar's room, so
    // nothing jumps when the big player folds back into it.
    expect(find.text('underneath 66.0', skipOffstage: false), findsOneWidget);

    await tester.tap(find.byTooltip('Close'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(container.read(nowPlayingOpenProvider), 0);
    expect(
      tester
          .widget<AnimatedOpacity>(
            find.ancestor(
              of: find.byType(MiniPlayer),
              matching: find.byType(AnimatedOpacity),
            ),
          )
          .opacity,
      1,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('play and pause are one button, and it says which', (
    tester,
  ) async {
    final container = await _pumpApp(tester);
    await _openNowPlaying(tester);

    // The big one: the only 'Pause' on the screen now the bar is hidden.
    final pause = find.descendant(
      of: find.byType(NowPlayingScreen),
      matching: find.byTooltip('Pause'),
    );
    expect(pause, findsOneWidget);
    await tester.tap(pause);
    await tester.pump();
    expect(_controllerOf(container).touched, ['pause']);
  });

  testWidgets('throwing the artwork sideways changes the song', (tester) async {
    final container = await _pumpApp(tester);
    await _openNowPlaying(tester);

    final artwork = find.bySemanticsLabel(RegExp('^Artwork for'));
    await tester.fling(artwork, const Offset(-300, 0), 1500);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(_controllerOf(container).touched, ['next']);

    // Neither song changes (the queue is a fake), so the artwork waits, then
    // comes back from the side it left by rather than staying thrown away.
    for (var step = 0; step < 40; step++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(tester.getCenter(artwork).dx, closeTo(195, 1));

    await tester.fling(artwork, const Offset(300, 0), 1500);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(_controllerOf(container).touched, ['next', 'previous']);

    for (var step = 0; step < 40; step++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('a small drag springs back; only a real pull folds it away', (
    tester,
  ) async {
    final container = await _pumpApp(tester);
    await _openNowPlaying(tester);

    final title = find.descendant(
      of: find.byType(NowPlayingScreen),
      matching: find.text('Kasena lullaby'),
    );
    await tester.drag(title, const Offset(0, 60));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(NowPlayingScreen), findsOneWidget);

    await tester.drag(title, const Offset(0, 260));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.byType(NowPlayingScreen), findsNothing);
    expect(container.read(nowPlayingOpenProvider), 0);
  });

  testWidgets('with nothing cued the screen says how to cue something', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildIndigenTheme(),
          home: const NowPlayingScreen(),
        ),
      ),
    );
    await tester.pump();
    expect(find.textContaining('Nothing is playing yet'), findsOneWidget);
  });
}
