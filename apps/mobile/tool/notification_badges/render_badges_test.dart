// Draws the glyphs the shade's avatar badges wear.
//
// An alert that arrives while the app is closed is drawn in a background
// isolate, which has no widget tree to paint an Icon into, so the badge glyphs
// ship as small white PNGs instead — one per entry in `alertBadgeIcons`, drawn
// from the very IconData the notification centre's badges use, so the two
// cannot drift apart.
//
// Regenerate after changing an icon (from apps/mobile):
//
//   flutter test --update-goldens tool/notification_badges/render_badges_test.dart
//
// Without --update-goldens it is a check: it fails if a shipped PNG no longer
// matches its icon. It lives outside test/ so the ordinary suite, which runs
// with test fonts and no Material icon font, never picks it up.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/alert_presentation.dart';

/// The badge's inner glyph, in pixels. The avatar is drawn at 192 px with an
/// 80 px badge, so a 44 px glyph sits where the in-app 10 px glyph sits in a
/// 19 px badge.
const _size = 44.0;

String _materialIconsFont() {
  final flutterRoot = File(Platform.resolvedExecutable)
      .parent
      .parent
      .parent
      .parent
      .parent
      .parent;
  final candidates = [
    '${flutterRoot.path}/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
    '${Platform.environment['USERPROFILE'] ?? ''}/flutter/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
  ];
  return candidates.firstWhere(
    (path) => File(path).existsSync(),
    orElse: () =>
        throw StateError('MaterialIcons font not found in $candidates'),
  );
}

void main() {
  setUpAll(() async {
    final bytes = File(_materialIconsFont()).readAsBytesSync();
    final loader = FontLoader('MaterialIcons')
      ..addFont(Future.value(ByteData.sublistView(bytes)));
    await loader.load();
  });

  for (final entry in alertBadgeIcons.entries) {
    testWidgets('badge glyph: ${entry.key}', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(_size, _size);
      addTearDown(tester.view.reset);
      const key = ValueKey('glyph');
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: RepaintBoundary(
              key: key,
              child: SizedBox.square(
                dimension: _size,
                child: Icon(entry.value, size: _size, color: Colors.white),
              ),
            ),
          ),
        ),
      );
      await expectLater(
        find.byKey(key),
        matchesGoldenFile('../../assets/notification_badges/${entry.key}.png'),
      );
    });
  }
}
