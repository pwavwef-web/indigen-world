// Closing the mini-player.
//
// Closing is not pausing. A paused bar is a song waiting to be picked back up;
// a closed one is somebody saying they are done with it, so the player has to
// let go of the song completely — including the resume point that would
// otherwise put it back on the next launch.

import 'dart:convert';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/widgets/mini_player.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Counts closes instead of reaching for a handler the test does not have.
class _RecordingController extends MusicController {
  int dismissed = 0;

  @override
  Future<void> dismiss() async => dismissed++;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  testWidgets('the close button closes the player without opening the song', (
    tester,
  ) async {
    var opened = 0;
    final container = ProviderContainer(
      overrides: [
        musicMediaItemProvider.overrideWith(
          (ref) => Stream.value(
            const MediaItem(id: 'song', title: 'Kasena lullaby'),
          ),
        ),
        musicControllerProvider.overrideWith(_RecordingController.new),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: Scaffold(
            body: MiniPlayer(
              onOpen: () => opened++,
              brand: brandPaletteFor(Brightness.light),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byTooltip('Stop and close player'));
    await tester.pump();

    final controller = container.read(
      musicControllerProvider.notifier,
    ) as _RecordingController;
    expect(controller.dismissed, 1);
    // The whole bar is a tap target for the now-playing screen. The close
    // button sits inside it and must not fall through to it.
    expect(opened, 0);
  });

  test('closing forgets where the song had got to', () async {
    SharedPreferences.setMockInitialValues({
      musicResumePreferenceKey: jsonEncode({
        'trackId': 'song',
        'queueKind': CollectionKind.music.name,
        'positionMs': 42000,
      }),
    });

    final container = ProviderContainer();
    addTearDown(container.dispose);
    final controller = container.read(musicControllerProvider.notifier);
    await pumpEventQueue();
    expect(container.read(musicControllerProvider).resumePoint, isNotNull);

    await controller.dismiss();
    expect(container.read(musicControllerProvider).resumePoint, isNull);

    // The next launch: a fresh controller reading the same storage finds
    // nothing to put back.
    final relaunched = ProviderContainer();
    addTearDown(relaunched.dispose);
    relaunched.read(musicControllerProvider);
    await pumpEventQueue();
    expect(relaunched.read(musicControllerProvider).resumePoint, isNull);
  });
}
