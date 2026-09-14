import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Opt-in, empty-state visual capture; no provider calls or generated fixtures.
void main() {
  const preview = String.fromEnvironment('KAWURI_PREVIEW');
  const font = String.fromEnvironment('KAWURI_PREVIEW_FONT');
  const icons = String.fromEnvironment('KAWURI_PREVIEW_ICONS');
  const symbols = String.fromEnvironment('KAWURI_PREVIEW_SYMBOLS');
  testWidgets('capture phone home for visual inspection', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    Future<void> loadFont(String family, String path) async {
      if (path.isEmpty) return;
      final bytes = (await tester.runAsync(() => File(path).readAsBytes()))!;
      final loader = FontLoader(family)
        ..addFont(Future.value(ByteData.sublistView(bytes)));
      await loader.load();
    }

    await loadFont('Noto Sans', font);
    await loadFont('Roboto', font);
    await loadFont('MaterialIcons', icons);
    await loadFont('Noto Sans Symbols', symbols);
    final boundary = GlobalKey();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [firebaseReadyProvider.overrideWithValue(false)],
        child: RepaintBoundary(
          key: boundary,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: buildIndigenTheme(),
            home: const KawuriScreen(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.takeException(), isNull);
    await tester.runAsync(() async {
      final image =
          await (boundary.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary)
              .toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await File(preview).writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
  }, skip: preview.isEmpty);
}
