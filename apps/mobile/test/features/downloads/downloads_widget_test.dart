import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/downloads/downloads_screen.dart';

void main() {
  final row = DownloadedTrackRecord(
    trackId: 'test-only',
    title: 'TEST ONLY · ɛ ɔ ŋ',
    artist: 'Synthetic fixture',
    album: 'Local test collection',
    kind: 'music',
    sourceUrl: 'https://invalid.example/test.mp3',
    fileName: 'test-only.mp3',
    sizeBytes: 1024,
    downloadedAt: DateTime(2026, 10, 9),
  );
  testWidgets(
    'Downloads exposes local play and repair, gates expiry, and fits a phone',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final boundary = GlobalKey();
      Future<void> show(bool allowed) async {
        await tester.pumpWidget(
          ProviderScope(
            key: ValueKey(allowed),
            overrides: [
              downloadsProvider.overrideWith((ref) => Stream.value([row])),
              downloadLimitProvider.overrideWithValue(25),
              downloadsAllowedProvider.overrideWithValue(allowed),
              playableDownloadsProvider.overrideWith(
                (ref) async => {'test-only': 'file:///synthetic/test-only.mp3'},
              ),
              downloadsSizeProvider.overrideWith((ref) async => 1024),
            ],
            child: MaterialApp(
              home: RepaintBoundary(
                key: boundary,
                child: const DownloadsScreen(),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
      }

      await show(true);
      expect(
        tester
            .widget<IconButton>(find.byWidgetPredicate((widget) => widget is IconButton && widget.tooltip == 'Play downloaded track'))
            .onPressed,
        isNotNull,
      );
      expect(
        find.byTooltip('Download again if playback fails'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      final directory = Platform.environment['SHIPPING_EVIDENCE_DIR'];
      if (directory != null) {
        final render =
            boundary.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
        final image = await render.toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await Directory(directory).create(recursive: true);
        await File('$directory/mobile-downloads-test.png')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      }
      await show(false);
      expect(
        tester
            .widget<IconButton>(find.byWidgetPredicate((widget) => widget is IconButton && widget.tooltip == 'Play downloaded track'))
            .onPressed,
        isNull,
      );
      expect(
        find.textContaining('active offline subscription'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
