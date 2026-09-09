// Deleting a published word asks why, and the box to answer in is in the same
// view as the question.
//
// It was not. The bin lives in the app bar; the reason box lived at the foot of
// a form that scrolls for several screens; and the refusal — "Deleting needs a
// reason on the record" — was written into an error line beside that box, below
// the fold, where the person who had just tapped the bin never saw it. What
// that produced in the field was somebody tapping every field on the screen
// looking for where to write the reason they had been told was required.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_editor_screen.dart';

void main() {
  String? popped;

  /// Opens the prompt on a route of its own, so what it pops is readable the
  /// way the editor reads it.
  Future<void> openPrompt(WidgetTester tester, {String initial = ''}) async {
    popped = null;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                popped = await Navigator.of(context).push<String>(
                  MaterialPageRoute(
                    builder: (_) =>
                        Scaffold(body: DeleteReasonPrompt(initial: initial)),
                  ),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> close(WidgetTester tester, Finder button) async {
    await tester.tap(button);
    await tester.pump();
    // Long enough for the route to finish leaving. Not `pumpAndSettle`: the
    // field it is closing has a blinking caret, which never settles.
    await tester.pump(const Duration(seconds: 1));
  }

  final deleteButton = find.widgetWithText(FilledButton, 'Delete');

  testWidgets('the delete button waits for a reason worth recording', (
    tester,
  ) async {
    await openPrompt(tester);

    expect(find.byType(TextField), findsOneWidget);
    expect(tester.widget<FilledButton>(deleteButton).onPressed, isNull);

    await tester.enterText(find.byType(TextField), 'typo');
    await tester.pump();
    expect(
      tester.widget<FilledButton>(deleteButton).onPressed,
      isNull,
      reason: 'four characters is not a record of anything',
    );
    expect(find.text('6 more characters.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Filed twice by mistake');
    await tester.pump();
    expect(tester.widget<FilledButton>(deleteButton).onPressed, isNotNull);
  });

  testWidgets('the reason comes back with the confirmation, trimmed', (
    tester,
  ) async {
    await openPrompt(tester);

    await tester.enterText(
      find.byType(TextField),
      '  Filed twice by mistake  ',
    );
    await tester.pump();
    await close(tester, deleteButton);

    expect(popped, 'Filed twice by mistake');
  });

  testWidgets('keeping the entry answers with nothing at all', (tester) async {
    await openPrompt(tester);

    await tester.enterText(find.byType(TextField), 'Filed twice by mistake');
    await tester.pump();
    await close(tester, find.widgetWithText(TextButton, 'Keep it'));

    expect(popped, isNull);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('a reason already written on the form is carried across', (
    tester,
  ) async {
    await openPrompt(tester, initial: 'Filed twice by mistake');

    expect(find.text('Filed twice by mistake'), findsOneWidget);
    expect(tester.widget<FilledButton>(deleteButton).onPressed, isNotNull);
  });
}
