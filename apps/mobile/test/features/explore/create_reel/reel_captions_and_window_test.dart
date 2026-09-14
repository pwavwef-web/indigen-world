import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/clip_window.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_caption_files.dart';

import 'reel_test_fakes.dart';

void main() {
  group('caption files', () {
    test('SubRip with a byte-order mark and Windows line endings', () {
      const srt =
          '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Welcome</i> home\r\n'
          '\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nSecond line\r\nwraps\r\n';
      final parsed = parseCaptionFile(
        fileName: 'reel.srt',
        contents: srt,
        spanStart: Duration.zero,
        spanEnd: const Duration(seconds: 10),
      );
      expect(parsed.source, CaptionSource.uploaded);
      expect(parsed.cues, const [
        CaptionCue(startMs: 1000, endMs: 3500, text: 'Welcome home'),
        CaptionCue(startMs: 4000, endMs: 6000, text: 'Second line\nwraps'),
      ]);
    });

    test('WebVTT with a header, cue ids, settings and hours', () {
      const vtt =
          'WEBVTT\n\nintro\n00:00.500 --> 00:02.000 line:0\nHello\n\n'
          '1:00:01.250 --> 1:00:02.000\n{\\an8}Late\n\n'
          'bad --> times\nIgnored\n';
      final parsed = parseCaptionFile(
        fileName: 'reel.vtt',
        contents: vtt,
        spanStart: Duration.zero,
        spanEnd: const Duration(seconds: 10),
      );
      expect(parsed.cues, const [
        CaptionCue(startMs: 500, endMs: 2000, text: 'Hello'),
        CaptionCue(startMs: 3601250, endMs: 3602000, text: 'Late'),
      ]);
    });

    test('a timed file with no usable cues is refused', () {
      expect(
        () => parseCaptionFile(
          fileName: 'empty.vtt',
          contents: 'WEBVTT\n\n',
          spanStart: Duration.zero,
          spanEnd: const Duration(seconds: 5),
        ),
        throwsA(isA<CaptionFileProblem>()),
      );
    });

    test('a transcript is spread across the selection, in order', () {
      final parsed = parseCaptionFile(
        fileName: 'words.txt',
        contents: 'First short line\n\nA second, somewhat longer line here\n',
        spanStart: const Duration(seconds: 2),
        spanEnd: const Duration(seconds: 12),
      );
      expect(parsed.source, CaptionSource.transcript);
      expect(parsed.cues, hasLength(2));
      expect(parsed.cues.first.startMs, 2000);
      expect(parsed.cues.last.endMs, 12000);
      expect(parsed.cues.first.endMs, parsed.cues.last.startMs);
      expect(parsed.cues.last.text, startsWith('A second'));
    });

    test('long transcript lines are split into readable cues', () {
      final long = List.filled(30, 'This is a sentence.').join(' ');
      final cues = spreadTranscript(
        long,
        spanStart: Duration.zero,
        spanEnd: const Duration(seconds: 60),
      );
      expect(cues.length, greaterThan(1));
      expect(
        cues.every((cue) => cue.text.length <= CaptionCue.maxTextLength),
        isTrue,
      );
    });

    test('an empty transcript is refused', () {
      expect(
        () => parseCaptionFile(
          fileName: 'blank.txt',
          contents: '\n  \n',
          spanStart: Duration.zero,
          spanEnd: const Duration(seconds: 5),
        ),
        throwsA(isA<CaptionFileProblem>()),
      );
    });

    test('more cues than a reel carries is refused', () {
      final buffer = StringBuffer('WEBVTT\n');
      for (var i = 0; i < CaptionTrack.maxCues + 1; i++) {
        buffer.write(
          '\n00:${(i ~/ 60).toString().padLeft(2, '0')}:'
          '${(i % 60).toString().padLeft(2, '0')}.000 --> '
          '00:${(i ~/ 60).toString().padLeft(2, '0')}:'
          '${(i % 60).toString().padLeft(2, '0')}.500\nLine $i\n',
        );
      }
      expect(
        () => parseCaptionFile(
          fileName: 'many.vtt',
          contents: buffer.toString(),
          spanStart: Duration.zero,
          spanEnd: const Duration(minutes: 6),
        ),
        throwsA(isA<CaptionFileProblem>()),
      );
    });

    test('WebVTT output reads back to the same cues', () {
      const track = CaptionTrack(
        language: 'xsm',
        cues: [
          CaptionCue(startMs: 250, endMs: 1999, text: 'One'),
          CaptionCue(startMs: 61000, endMs: 3723004, text: 'Two'),
        ],
      );
      final parsed = parseCaptionFile(
        fileName: 'out.vtt',
        contents: captionsToWebVtt(track),
        spanStart: Duration.zero,
        spanEnd: Duration.zero,
      );
      expect(parsed.cues, track.cues);
    });
  });

  group('CaptionTrack', () {
    const track = CaptionTrack(
      language: 'en',
      cues: [
        CaptionCue(startMs: 0, endMs: 1000, text: 'a'),
        CaptionCue(startMs: 1000, endMs: 2000, text: 'b'),
        CaptionCue(startMs: 3000, endMs: 4000, text: 'c'),
      ],
    );

    test('finds the cue on screen at a position', () {
      expect(track.cueAt(Duration.zero)?.text, 'a');
      expect(track.cueAt(const Duration(milliseconds: 999))?.text, 'a');
      expect(track.cueAt(const Duration(milliseconds: 1000))?.text, 'b');
      expect(track.cueAt(const Duration(milliseconds: 2500)), isNull);
      expect(track.cueAt(const Duration(milliseconds: 3999))?.text, 'c');
      expect(track.cueAt(const Duration(seconds: 9)), isNull);
    });

    test('normalising sorts, trims, drops invalid cues and caps', () {
      final messy = CaptionTrack(
        language: 'en',
        cues: [
          const CaptionCue(startMs: 5000, endMs: 6000, text: '  late '),
          const CaptionCue(startMs: 100, endMs: 50, text: 'backwards'),
          const CaptionCue(startMs: 0, endMs: 10, text: '   '),
          const CaptionCue(startMs: 1000, endMs: 2000, text: 'early'),
          for (var i = 0; i < CaptionTrack.maxCues + 5; i++)
            CaptionCue(startMs: 10000 + i, endMs: 10001 + i, text: 'x'),
        ],
      ).normalised();
      expect(messy.cues.first.text, 'early');
      expect(messy.cues[1].text, 'late');
      expect(messy.cues, hasLength(CaptionTrack.maxCues));
    });

    test('machine captions stay hidden until reviewed', () {
      const automatic = CaptionTrack(
        language: 'en',
        source: CaptionSource.automatic,
        cues: [CaptionCue(startMs: 0, endMs: 1, text: 'a')],
      );
      expect(automatic.isShowable, isFalse);
      expect(automatic.copyWith(reviewed: true).isShowable, isTrue);
      expect(track.isShowable, isTrue);
    });

    test('map round trip, and garbage is no track', () {
      final restored = CaptionTrack.fromMap(track.toMap());
      expect(restored, track);
      expect(CaptionTrack.fromMap({'cues': []}), isNull);
      expect(CaptionTrack.fromMap('captions'), isNull);
      expect(captionLanguageName('xsm'), 'Kasem');
      expect(captionLanguageName('Buli'), 'Buli');
    });
  });

  group('ClipWindow', () {
    test('only real trims become windows', () {
      expect(ClipWindow.fromMillis(null, null), isNull);
      expect(ClipWindow.fromMillis(0, null), isNull);
      expect(ClipWindow.fromMillis(5000, 4000), isNull);
      expect(
        ClipWindow.fromMillis(1000, null),
        const ClipWindow(start: Duration(seconds: 1)),
      );
      expect(
        ClipWindow.fromMillis(-5, 3000),
        const ClipWindow(end: Duration(seconds: 3)),
      );
    });

    test('length and end are measured inside the file', () {
      const window = ClipWindow(
        start: Duration(seconds: 2),
        end: Duration(seconds: 50),
      );
      const file = Duration(seconds: 40);
      expect(window.endWithin(file), file);
      expect(window.lengthWithin(file), const Duration(seconds: 38));
    });

    test('corrections send playback back into the window', () {
      const window = ClipWindow(
        start: Duration(seconds: 2),
        end: Duration(seconds: 5),
      );
      const file = Duration(seconds: 10);
      expect(window.correction(const Duration(seconds: 3), file), isNull);
      expect(
        window.correction(const Duration(milliseconds: 1900), file),
        isNull,
      );
      expect(window.correction(Duration.zero, file), window.start);
      expect(window.correction(const Duration(seconds: 5), file), window.start);
    });
  });

  group('ClipWindowGuard', () {
    late FakePreviewController player;

    setUp(() async {
      player = FakePreviewController(duration: const Duration(seconds: 20));
      await player.initialize();
    });

    tearDown(() => player.dispose());

    test('loops a playing clip at the end of the window', () async {
      var loops = 0;
      final guard = ClipWindowGuard(
        player,
        const ClipWindow(
          start: Duration(seconds: 2),
          end: Duration(seconds: 6),
        ),
        onLooped: () => loops++,
      )..attach();
      await player.play();
      await player.seekTo(const Duration(seconds: 6));
      await pumpEventQueue();
      expect(player.value.position, const Duration(seconds: 2));
      expect(loops, 1);
      guard.detach();
    });

    test('pulls a playing clip forward to the start', () async {
      final guard = ClipWindowGuard(
        player,
        const ClipWindow(start: Duration(seconds: 4)),
      )..attach();
      await player.play();
      await pumpEventQueue();
      expect(player.value.position, const Duration(seconds: 4));
      guard.detach();
    });

    test('leaves a paused clip where it was parked', () async {
      final guard = ClipWindowGuard(
        player,
        const ClipWindow(start: Duration(seconds: 4)),
      )..attach();
      await player.seekTo(const Duration(seconds: 1));
      await pumpEventQueue();
      expect(player.value.position, const Duration(seconds: 1));
      guard.detach();
    });

    test(
      'detached, it corrects nothing; a new window applies at once',
      () async {
        final guard = ClipWindowGuard(
          player,
          const ClipWindow(start: Duration(seconds: 4)),
        )..attach();
        await player.play();
        await pumpEventQueue();
        guard.window = const ClipWindow(start: Duration(seconds: 8));
        await pumpEventQueue();
        expect(player.value.position, const Duration(seconds: 8));
        guard.detach();
        await player.seekTo(Duration.zero);
        await pumpEventQueue();
        expect(player.value.position, Duration.zero);
      },
    );
  });
}
