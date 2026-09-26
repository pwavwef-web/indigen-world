// Minimising the player, and getting it back.
//
// The rule the whole feature stands on is in the third expectation of every
// test here: the controller is never called. Minimising is a change of shape,
// so the queue, the position, the volume and the playing state are all things
// this interaction must be incapable of touching — the bubble is the same
// session, drawn smaller.

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/music/music_bar_placement.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/widgets/mini_player.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_bubble.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_overlay.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_player_dock.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Writes down anything that would have reached the handler.
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
);

ProviderContainer _container({bool playing = true}) {
  final container = ProviderContainer(
    overrides: [
      musicMediaItemProvider.overrideWith((ref) => Stream.value(_song)),
      musicIsPlayingProvider.overrideWith((ref) => playing),
      musicControllerProvider.overrideWith(_RecordingController.new),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

Future<void> _pumpDock(WidgetTester tester, ProviderContainer container) async {
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: MusicPlayerDock(
            onOpen: () {},
            brand: brandPaletteFor(Brightness.light),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

_RecordingController _controllerOf(ProviderContainer container) =>
    container.read(musicControllerProvider.notifier) as _RecordingController;

/// Long enough for the morph and the settle after a drag.
///
/// Not `pumpAndSettle`: the equalizer on the bubble repeats forever, which is
/// what a level meter does, and a test that waited for it to stop would wait
/// for the length of the song.
Future<void> _settle(WidgetTester tester) async {
  // Two frames on purpose: the first is where the controller's ticker starts
  // counting, so a single long pump would only ever move the animation to its
  // first frame.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  testWidgets('minimising folds the bar into the bubble, and playback is '
      'never told', (tester) async {
    final container = _container();
    await _pumpDock(tester, container);
    expect(find.byType(MiniPlayer), findsOneWidget);

    await tester.tap(find.byTooltip('Minimize player'));
    await _settle(tester);

    expect(container.read(musicBarPlacementProvider).collapsed, isTrue);
    expect(find.byType(MusicBubble), findsOneWidget);
    expect(find.byType(MiniPlayer), findsNothing);
    expect(_controllerOf(container).touched, isEmpty);
  });

  testWidgets('tapping the bubble brings the same player back', (tester) async {
    final container = _container();
    await _pumpDock(tester, container);

    await tester.tap(find.byTooltip('Minimize player'));
    await _settle(tester);
    await tester.tap(find.byType(MusicBubble));
    await _settle(tester);

    expect(container.read(musicBarPlacementProvider).collapsed, isFalse);
    expect(find.byType(MiniPlayer), findsOneWidget);
    // Nothing was stopped, started or skipped on the way out or back: the song
    // that was playing is the song that is playing.
    expect(_controllerOf(container).touched, isEmpty);
    expect(find.text('Kasena lullaby'), findsOneWidget);
  });

  testWidgets('the bubble shows the music moving while it plays', (
    tester,
  ) async {
    await _pumpDock(tester, _container());
    await tester.tap(find.byTooltip('Minimize player'));
    await _settle(tester);

    expect(find.byType(MusicEqualizer), findsOneWidget);
  });

  testWidgets('a paused bubble says so rather than sitting still', (
    tester,
  ) async {
    await _pumpDock(tester, _container(playing: false));
    await tester.tap(find.byTooltip('Minimize player'));
    await _settle(tester);

    // Bars that had simply stopped moving would look the same as bars nobody
    // was watching, so pause is drawn.
    expect(find.byType(MusicEqualizer), findsNothing);
    expect(find.byIcon(Icons.pause_rounded), findsOneWidget);
  });

  testWidgets('dragging the bubble parks it on the near edge', (tester) async {
    final container = _container();
    await _pumpDock(tester, container);
    await tester.tap(find.byTooltip('Minimize player'));
    await _settle(tester);

    final before = tester.getCenter(find.byType(MusicBubble));
    await tester.drag(find.byType(MusicBubble), const Offset(-600, -120));
    await _settle(tester);

    expect(container.read(musicBarPlacementProvider).dock?.onLeft, isTrue);
    final after = tester.getCenter(find.byType(MusicBubble));
    expect(after.dx, lessThan(before.dx));
    expect(after.dy, lessThan(before.dy));
    // A drag is not a tap: the player is still minimised, and still playing.
    expect(container.read(musicBarPlacementProvider).collapsed, isTrue);
    expect(_controllerOf(container).touched, isEmpty);
  });

  testWidgets('the screen underneath is still tappable around it', (
    tester,
  ) async {
    // The dock is mounted over the whole window so that it can move the player
    // between the bottom bar and a corner. Everything it is not actually
    // drawing has to stay somebody else's: a full-screen layer that quietly
    // ate taps would make the app unusable for as long as a song is playing.
    var tapped = 0;
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: _container(),
        child: MaterialApp(
          home: Scaffold(
            body: Stack(
              children: [
                Positioned.fill(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => tapped++,
                  ),
                ),
                MusicPlayerDock(
                  onOpen: () {},
                  brand: brandPaletteFor(Brightness.light),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    await tester.tapAt(const Offset(200, 120));
    expect(tapped, 1);
  });

  testWidgets('minimising gives the screen back the strip the bar was using', (
    tester,
  ) async {
    // The other half of what somebody minimising is asking for: not just a
    // smaller player, but the room it was holding. Seventeen scroll views and
    // every floating button in the app read this number.
    late double inset;
    final container = ProviderContainer(
      overrides: [
        musicMediaItemProvider.overrideWith((ref) => Stream.value(_song)),
        musicIsPlayingProvider.overrideWith((ref) => true),
        musicHasQueueProvider.overrideWith((ref) => true),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: MusicOverlay(
            brand: brandPaletteFor(Brightness.light),
            child: Builder(
              builder: (context) {
                inset = musicInset(context);
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(inset, greaterThanOrEqualTo(kMiniPlayerHeight));

    container.read(musicBarPlacementProvider.notifier).collapse();
    await _settle(tester);

    expect(inset, 0);
  });

  testWidgets('a dismissed player comes back as a bar, not as a bubble', (
    tester,
  ) async {
    final container = _container();
    await _pumpDock(tester, container);
    await tester.tap(find.byTooltip('Minimize player'));
    await _settle(tester);

    // What playing something new does, once the queue it closed is gone.
    container.read(musicBarPlacementProvider.notifier).expand();
    await _settle(tester);

    expect(find.byType(MiniPlayer), findsOneWidget);
    expect(find.byType(MusicBubble), findsNothing);
  });
}
