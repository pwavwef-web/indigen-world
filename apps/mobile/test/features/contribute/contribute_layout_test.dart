// The gap under the contribution type picker.
//
// `_KindSelector` used to size its tiles by ASPECT RATIO, so each tile grew
// taller as the screen got wider while its contents — an icon and one word —
// stayed the same size. The leftover space was split above and below the row
// content, and the half under the bottom row pooled into a visible empty band
// between the picker and the first input field. It was mild on a small phone
// and severe on anything wide, which is exactly the kind of bug that survives
// being looked at on one device.
//
// These tests measure the real gap at three widths. A regression to the ratio
// sizing fails the widest case immediately.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';

/// The distance, in logical pixels, between the bottom of the type picker and
/// the top of the first input field.
Future<double> _gapAfterPicker(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: buildIndigenTheme(),
        home: const ContributeScreen(standalone: true),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 400));

  // Measured from the last tile's own LABEL rather than from the grid's box:
  // the dead space the bug produced was *inside* the tiles, so a measurement
  // taken from the grid's bottom edge would have reported a healthy gap while
  // the screen showed a tall empty band. What a person sees is the distance
  // from the last word in the picker to the first field.
  final lastTileLabel = find.text('Video');
  final firstField = find.byType(TextFormField).first;
  expect(find.byType(GridView), findsOneWidget);
  expect(lastTileLabel, findsOneWidget);
  expect(firstField, findsWidgets);

  final gap =
      tester.getTopLeft(firstField).dy - tester.getBottomLeft(lastTileLabel).dy;
  await tester.pump(const Duration(milliseconds: 500));
  return gap;
}

void main() {
  testWidgets('the picker sits close to the first field on a narrow phone', (
    tester,
  ) async {
    final gap = await _gapAfterPicker(tester, const Size(360, 900));
    expect(gap, greaterThan(0), reason: 'the field must follow the picker');
    expect(
      gap,
      lessThan(48),
      reason: 'a phone should not show a band of empty space here',
    );
  });

  testWidgets('the gap does not grow with the screen', (tester) async {
    // The bug in one line: with aspect-ratio sizing these three numbers rose
    // with the width. They must now be the same number.
    final narrow = await _gapAfterPicker(tester, const Size(360, 900));
    final wide = await _gapAfterPicker(tester, const Size(720, 1000));
    final widest = await _gapAfterPicker(tester, const Size(1000, 1000));

    expect(wide, closeTo(narrow, 1));
    expect(widest, closeTo(narrow, 1));
  });

  testWidgets('every type tile stays the height of its contents', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(900, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildIndigenTheme(),
          home: const ContributeScreen(standalone: true),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    // Five kinds over two columns is three rows; the whole picker is those
    // rows plus their spacing, and nothing else.
    const tileHeight = 54.0;
    const spacing = 10.0;
    final picker = tester.getRect(find.byType(GridView));
    expect(picker.height, closeTo(tileHeight * 3 + spacing * 2, 1));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
