// The Kasem letters above the keyboard: what the bar types, and how tall it is.
//
// The height is held by a test rather than left to a style note, because the
// height is what broke. A `Container` with an `alignment` grows to fill the
// height it is offered; what a bottom bar is offered is the whole screen; and a
// Scaffold that cannot fit its bottom bar above the keyboard pins it to the
// top. So seven keys became a wall of full-height borders painted over the form
// a validator was trying to edit, with the letters stranded halfway down it.
// Nothing about that is visible in a unit test of the insertion logic, so the
// geometry is asserted directly.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/dictionary/kasem_key_bar.dart';

void main() {
  late TextEditingController controller;
  late FocusNode node;

  /// The bar as the editor mounts it: a bottom bar over a form.
  Future<void> pumpBar(WidgetTester tester, {bool focused = true}) async {
    controller = TextEditingController();
    node = FocusNode();
    addTearDown(controller.dispose);
    addTearDown(node.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          bottomNavigationBar: KasemKeyBar(targets: {controller: node}),
          body: TextField(controller: controller, focusNode: node),
        ),
      ),
    );
    if (focused) {
      await tester.tap(find.byType(TextField));
      await tester.pump();
      await tester.pump();
    }
  }

  /// A key of the bar, found by the name that does not change with the case.
  Finder key(String tooltip) => find.byTooltip(tooltip);

  /// What the bar itself is showing — not what the field underneath holds,
  /// which `find.text` would also match once a letter has been typed.
  Finder shown(String glyph) => find.descendant(
    of: find.byType(KasemKeyBar),
    matching: find.text(glyph),
  );

  testWidgets('the bar is a strip along the bottom, not a wall', (
    tester,
  ) async {
    await pumpBar(tester);

    final size = tester.getSize(find.byType(KasemKeyBar));
    expect(size.height, lessThan(100));
    // And it is where a bottom bar belongs. Pinned to the top is exactly the
    // failure: the Scaffold does that when the bar is too tall to fit.
    expect(
      tester.getTopLeft(find.byType(KasemKeyBar)).dy,
      greaterThan(tester.getSize(find.byType(MaterialApp)).height / 2),
    );
    // The form it sits over is still on screen.
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('no Kasem box has the cursor, so there is no bar', (
    tester,
  ) async {
    await pumpBar(tester, focused: false);

    expect(tester.getSize(find.byType(KasemKeyBar)).height, 0);
  });

  testWidgets('every letter of the alphabet the keyboard lacks is offered', (
    tester,
  ) async {
    await pumpBar(tester);

    for (final letter in kKasemLetters) {
      expect(shown(letter.small), findsOneWidget);
    }
  });

  testWidgets('the capital key types one capital and then lets go', (
    tester,
  ) async {
    await pumpBar(tester);

    await tester.tap(key('Capital letter'));
    await tester.pump();
    expect(
      shown('Ɛ'),
      findsOneWidget,
      reason: 'the row shows what it will type',
    );

    await tester.tap(key('ɛ — open e'));
    await tester.pump();
    expect(controller.text, 'Ɛ');

    // The shift is spent. This is the whole of the bug: it used to latch, so
    // one exploratory press meant capitals for the rest of the session.
    expect(shown('ɛ'), findsOneWidget);
    await tester.tap(key('ɔ — open o'));
    await tester.pump();
    expect(controller.text, 'Ɛɔ');
  });

  testWidgets('leaving the Kasem boxes drops an armed capital', (tester) async {
    await pumpBar(tester);

    await tester.tap(key('Capital letter'));
    await tester.pump();
    node.unfocus();
    await tester.pump();

    // The bar is gone with the cursor; bringing it back brings small letters.
    expect(tester.getSize(find.byType(KasemKeyBar)).height, 0);
    node.requestFocus();
    await tester.pump();
    expect(shown('ɛ'), findsOneWidget);
  });

  testWidgets('a letter lands at the caret rather than at the end', (
    tester,
  ) async {
    await pumpBar(tester);

    await tester.enterText(find.byType(TextField), 'ba');
    await tester.pump();
    controller.selection = const TextSelection.collapsed(offset: 1);
    await tester.pump();

    await tester.tap(key('ɩ — open i'));
    await tester.pump();

    expect(controller.text, 'bɩa');
    expect(controller.selection.baseOffset, 2);
  });
}
