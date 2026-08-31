// Handing the speakers over, and taking them back.
//
// The rule this file exists to hold is the second one: music the *app* paused
// comes back on its own, and music a *member* paused does not. Getting that
// wrong is the difference between a player that respects a decision and one
// that argues with it — somebody pauses on the lock screen, glances at a reel,
// closes it, and is sung at.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_duck.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/widgets/mini_player.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stands in for the handler's own playing state.
///
/// Mutable on purpose. A fixed `true` override would make the member-pause test
/// below pass whether or not the bug it guards against was present: ducking
/// would still fire, still set the flag, and the resume would still clear it.
/// Real playback stops when a member pauses, so the fake has to as well, or the
/// test proves nothing.
class _Playing extends Notifier<bool> {
  @override
  bool build() => true;

  // ignore: use_setters_to_change_properties
  void set(bool value) => state = value;
}

final _playingProvider = NotifierProvider<_Playing, bool>(_Playing.new);

/// A container whose music is, as far as the controller can tell, playing.
///
/// There is no handler — building a real `IndigenAudioHandler` would start an
/// actual `audio_service` — so what is asserted throughout is the session state
/// the duck flag lives in. That is the part the bug was ever in: the handler
/// calls are null-safe and do nothing here.
ProviderContainer _container({bool playing = true}) {
  final container = ProviderContainer(
    overrides: [
      musicIsPlayingProvider.overrideWith((ref) => ref.watch(_playingProvider)),
    ],
  );
  addTearDown(container.dispose);
  if (!playing) container.read(_playingProvider.notifier).set(false);
  return container;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  group('ducking', () {
    test('stands the music down and remembers that it was us', () async {
      final container = _container();
      final controller = container.read(musicControllerProvider.notifier);

      expect(await controller.duckForOtherAudio(), isTrue);
      expect(container.read(musicControllerProvider).pausedForOtherAudio, isTrue);
    });

    test('does nothing when nothing was playing', () async {
      final container = _container(playing: false);
      final controller = container.read(musicControllerProvider.notifier);

      // Nothing to come back to, so nothing is claimed. Otherwise closing a
      // reel would start music the member never asked for.
      expect(await controller.duckForOtherAudio(), isFalse);
      expect(
        container.read(musicControllerProvider).pausedForOtherAudio,
        isFalse,
      );
    });

    test('brings back only what it took away', () async {
      final container = _container();
      final controller = container.read(musicControllerProvider.notifier);

      await controller.duckForOtherAudio();
      expect(await controller.resumeAfterOtherAudio(), isTrue);

      // The flag is spent: a second release must not start the music again.
      expect(await controller.resumeAfterOtherAudio(), isFalse);
      expect(
        container.read(musicControllerProvider).pausedForOtherAudio,
        isFalse,
      );
    });

    test('a member pausing survives a reel opening and closing', () async {
      // THE regression this whole mechanism exists for.
      final container = _container();
      final controller = container.read(musicControllerProvider.notifier);

      // They pause it themselves — from the lock screen, the notification, a
      // headset button; all of them arrive through pause(). And the music
      // actually stops, which is what the fake is told next.
      await controller.pause();
      container.read(_playingProvider.notifier).set(false);
      expect(
        container.read(musicControllerProvider).pausedForOtherAudio,
        isFalse,
      );

      // A reel opens and closes over the top of it.
      final ducked = await controller.duckForOtherAudio();
      final resumed = await controller.resumeAfterOtherAudio();

      // Nothing was playing to take away, so nothing was claimed and nothing
      // comes back. The music is still theirs to restart, which is the whole
      // point: a decision they made survives a screen they only glanced at.
      expect(ducked, isFalse);
      expect(resumed, isFalse);
      expect(
        container.read(musicControllerProvider).pausedForOtherAudio,
        isFalse,
      );
    });

    test('resuming without a duck does nothing at all', () async {
      final container = _container(playing: false);
      final controller = container.read(musicControllerProvider.notifier);

      expect(await controller.resumeAfterOtherAudio(), isFalse);
      expect(
        container.read(musicControllerProvider).pausedForOtherAudio,
        isFalse,
      );
    });
  });

  group('the listener', () {
    testWidgets('waits before coming back, and gives up if something else '
        'claims the speakers first', (tester) async {
      final container = _container();

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: MusicDuckListener(child: SizedBox.shrink()),
          ),
        ),
      );

      final focus = container.read(fullScreenMediaProvider.notifier);
      focus.enter();
      await tester.pump();
      expect(container.read(musicControllerProvider).pausedForOtherAudio, isTrue);

      // Down to zero, then straight back up before the delay elapses — which
      // is exactly what tapping a second pronunciation looks like.
      focus.leave();
      await tester.pump();
      focus.enter();
      await tester.pump(kMusicResumeDelay * 2);

      // Still ducked: the resume was cancelled rather than firing into the
      // gap between two clips.
      expect(container.read(musicControllerProvider).pausedForOtherAudio, isTrue);

      // And released for real this time.
      focus.leave();
      await tester.pump(kMusicResumeDelay * 2);
      expect(
        container.read(musicControllerProvider).pausedForOtherAudio,
        isFalse,
      );
    });
  });

  group('the mini-player', () {
    testWidgets('draws nothing when there is no player at all', (tester) async {
      // The shape every widget test in the suite is in: no handler override,
      // so nothing is cued and the bar must simply not be there.
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: MiniPlayer(
                onOpen: () {},
                brand: brandPaletteFor(Brightness.light),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(InkWell), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}
