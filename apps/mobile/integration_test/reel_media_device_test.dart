import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft_store.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_media_tools.dart';
import 'package:indigen_world_mobile/features/explore/create_reel_screen.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

/// The reel creator's native media path on a real Android device: probing a
/// clip, timeline frames, cover frames, moving files into a draft, and the
/// preview player honouring a trim.
///
/// The system picker is not driven — it is somebody else's activity. Instead
/// the clips are pushed to the app's external files directory before the run:
///
///   adb push portrait.mp4 /sdcard/Android/data/world.indigen.mobile.dev/files/
///   adb push landscape.mp4 /sdcard/Android/data/world.indigen.mobile.dev/files/
///
/// and copied into the cache, which is where the picker would have put them.
class _PickedFromDisk extends DeviceReelMediaTools {
  const _PickedFromDisk(this.path);

  final String path;

  @override
  Future<String?> pickVideo({required bool record}) async => path;
}

Future<File> _waitForClip(String name) async {
  final external = await getExternalStorageDirectory();
  final file = File(p.join(external!.path, name));
  for (var i = 0; i < 120 && !file.existsSync(); i++) {
    debugPrint('REEL_DEVICE waiting for ${file.path}');
    await Future<void>.delayed(const Duration(seconds: 2));
  }
  expect(file.existsSync(), isTrue, reason: 'push $name before the run');
  return file;
}

Future<String> _intoCache(File clip, String name) async {
  final cache = await getTemporaryDirectory();
  final copy = await clip.copy(p.join(cache.path, name));
  return copy.path;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const tools = DeviceReelMediaTools();
  const limits = ReelLimits.standard;

  testWidgets('probes real clips and refuses bad ones', (tester) async {
    final portrait = await _intoCache(
      await _waitForClip('portrait.mp4'),
      'probe_portrait.mp4',
    );
    final landscape = await _intoCache(
      await _waitForClip('landscape.mp4'),
      'probe_landscape.mp4',
    );

    final tall = await tools.probeVideo(portrait, limits);
    debugPrint(
      'REEL_DEVICE portrait ${tall.durationMs} ms, '
      'aspect ${tall.aspectRatio}, ${tall.sizeBytes} bytes',
    );
    expect(tall.durationMs, greaterThan(0));
    expect(tall.aspectRatio, lessThan(1));
    expect(tall.contentType, 'video/mp4');

    final wide = await tools.probeVideo(landscape, limits);
    debugPrint(
      'REEL_DEVICE landscape ${wide.durationMs} ms, aspect ${wide.aspectRatio}',
    );
    expect(wide.aspectRatio, greaterThan(1));

    final cache = await getTemporaryDirectory();
    final avi = File(p.join(cache.path, 'festival.avi'))
      ..writeAsBytesSync([1, 2, 3]);
    await expectLater(
      tools.probeVideo(avi.path, limits),
      throwsA(
        isA<ReelMediaProblem>().having(
          (problem) => problem.message,
          'message',
          contains('.AVI videos cannot be published'),
        ),
      ),
    );

    final random = math.Random(7);
    final broken = File(p.join(cache.path, 'broken.mp4'))
      ..writeAsBytesSync(List.generate(4096, (_) => random.nextInt(256)));
    await expectLater(
      tools.probeVideo(broken.path, limits),
      throwsA(
        isA<ReelMediaProblem>().having(
          (problem) => problem.message,
          'message',
          contains('could not be opened'),
        ),
      ),
    );

    const tiny = ReelLimits(
      maxDuration: Duration(minutes: 3),
      maxBytes: 1000,
      maxCaptionLength: 500,
    );
    await expectLater(
      tools.probeVideo(portrait, tiny),
      throwsA(
        isA<ReelMediaProblem>().having(
          (problem) => problem.message,
          'message',
          contains('reels can be up to'),
        ),
      ),
    );
    debugPrint('REEL_DEVICE probe checks passed');
  });

  testWidgets('frames, covers and the draft folder work on the device', (
    tester,
  ) async {
    final clip = await _intoCache(
      await _waitForClip('landscape.mp4'),
      'frames_landscape.mp4',
    );
    final stopwatch = Stopwatch()..start();
    final frames = <int>[];
    for (final at in [0, 1000, 2000]) {
      final bytes = await tools.timelineFrame(clip, at);
      expect(bytes, isNotNull, reason: 'frame at $at ms');
      frames.add(bytes!.length);
    }
    debugPrint(
      'REEL_DEVICE timeline frames $frames bytes in '
      '${stopwatch.elapsedMilliseconds} ms',
    );

    final store = LocalReelDraftStore();
    const draftId = 'device_draft';
    final adopted = await store.adoptFile(
      draftId,
      clip,
      fileName: 'video.mp4',
    );
    expect(File(adopted).existsSync(), isTrue);
    expect(File(clip).existsSync(), isFalse, reason: 'moved, not copied');
    debugPrint('REEL_DEVICE adopted into $adopted');

    final coverPath = await store.pathFor(draftId, 'cover_1200_1.jpg');
    final cover = await tools.writeCoverFrame(
      videoPath: adopted,
      timeMs: 1200,
      outputPath: coverPath,
    );
    expect(cover, isNotNull);
    final coverFile = File(cover!);
    expect(coverFile.existsSync(), isTrue);
    final head = coverFile.readAsBytesSync().take(2).toList();
    expect(head, [0xFF, 0xD8], reason: 'a JPEG');
    debugPrint(
      'REEL_DEVICE cover $cover ${coverFile.lengthSync()} bytes '
      '(asked for $coverPath)',
    );

    await store.delete(draftId);
    expect(File(adopted).existsSync(), isFalse);
    debugPrint('REEL_DEVICE draft folder removed');
  });

  testWidgets('the editor opens a real clip and plays only the selection', (
    tester,
  ) async {
    final clip = await _intoCache(
      await _waitForClip('portrait.mp4'),
      'editor_portrait.mp4',
    );
    final store = LocalReelDraftStore();
    final controller = ReelEditorController(
      store: store,
      tools: _PickedFromDisk(clip),
      openPreview: (path) => VideoPlayerController.file(File(path)),
      publisher: null,
    );
    await controller.start(creatorName: 'Device test');
    await controller.pickVideo(record: false);
    expect(controller.mediaProblem, isNull);
    expect(controller.player?.value.isInitialized, isTrue);
    for (var i = 0; i < 60 && controller.timeline.any((f) => f == null); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    expect(controller.timeline.every((frame) => frame != null), isTrue);
    expect(File(controller.draft.coverPath!).existsSync(), isTrue);
    debugPrint(
      'REEL_DEVICE editor cover ${controller.draft.coverPath}, '
      'timeline ${controller.timeline.length} frames',
    );

    final length = controller.draft.video!.duration;
    final start = Duration(milliseconds: length.inMilliseconds ~/ 4);
    final end = start + const Duration(milliseconds: 1500);
    controller.setTrim(start: start, end: end);
    await controller.togglePlayback();
    final seen = <Duration>[];
    for (var i = 0; i < 16; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
      seen.add(controller.player!.value.position);
    }
    await controller.player!.pause();
    debugPrint(
      'REEL_DEVICE trim ${start.inMilliseconds}-${end.inMilliseconds} ms, '
      'positions ${seen.map((d) => d.inMilliseconds).toList()}',
    );
    // Four seconds of playback over a 1.5 s window: it must have looped, and
    // never shown much past the end.
    const slack = Duration(milliseconds: 400);
    expect(seen.every((at) => at >= start - slack && at <= end + slack), isTrue);

    controller.setOriginalSound(false);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(controller.player!.value.volume, 0);

    final id = controller.draft.id;
    await controller.saveDraft(manual: true);
    expect((await store.load(id))?.video?.path, controller.draft.video!.path);
    await controller.discardDraft();
    controller.dispose();
    expect(await store.load(id), isNull);
    debugPrint('REEL_DEVICE editor checks passed');
  });

  testWidgets('the screen on the device, for a screenshot', (tester) async {
    final clip = await _intoCache(
      await _waitForClip('landscape.mp4'),
      'screen_landscape.mp4',
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          reelMediaToolsProvider.overrideWithValue(_PickedFromDisk(clip)),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: buildIndigenDarkTheme(),
          home: const CreateReelScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    debugPrint('REEL_DEVICE SCREENSHOT empty');
    await Future<void>.delayed(const Duration(seconds: 6));
    await tester.tap(find.text('Choose from device'));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    debugPrint('REEL_DEVICE SCREENSHOT media');
    await Future<void>.delayed(const Duration(seconds: 6));
    await tester.tap(find.text('Framing'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.scrollUntilVisible(
      find.text('Framing in Explore'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -300));
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    debugPrint('REEL_DEVICE SCREENSHOT framing');
    await Future<void>.delayed(const Duration(seconds: 6));
    debugPrint('REEL_DEVICE screen shown');
  });
}
