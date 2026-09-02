// Twenty-five word classes, reachable without scrolling past twenty-four.
//
// The old dictionary form offered six in a dropdown. This list is four times
// as long because Kasem needs it to be — ideophones, postpositions, bound
// morphemes — and a list that long is only usable if it can be typed at, which
// is the behaviour these tests hold.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/part_of_speech_picker.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

/// A field wired to a bit of state, so choosing can be observed end to end.
class _Host extends StatefulWidget {
  const _Host();

  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  PartOfSpeech? _chosen;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Padding(
      padding: const EdgeInsets.all(20),
      child: PartOfSpeechField(
        value: _chosen,
        onChanged: (value) => setState(() => _chosen = value),
      ),
    ),
  );
}

Future<void> pumpField(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: buildIndigenTheme(),
      home: const _Host(),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

Future<void> openPicker(WidgetTester tester) async {
  await tester.tap(find.text('Word class'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('the field opens a searchable card, not a dropdown', (
    tester,
  ) async {
    await pumpField(tester);
    await openPicker(tester);

    expect(find.text('Which word class?'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    // The head of the list is there without typing: a picker that opens empty
    // is one somebody has to be told how to use.
    expect(find.text('Noun'), findsOneWidget);
    expect(find.text('Verb'), findsOneWidget);
  });

  testWidgets('typing narrows the list to what matches', (tester) async {
    await pumpField(tester);
    await openPicker(tester);

    await tester.enterText(find.byType(TextField), 'noun');
    await tester.pump(const Duration(milliseconds: 300));

    // Matches anywhere in the word, which is what makes this worth having:
    // three classes contain "noun" and a prefix search would find one.
    expect(find.text('Noun'), findsOneWidget);
    expect(find.text('Proper noun'), findsOneWidget);
    expect(find.text('Pronoun'), findsOneWidget);
    expect(find.text('Verb'), findsNothing);
    expect(find.text('Ideophone'), findsNothing);
  });

  testWidgets('the long tail is two keystrokes away', (tester) async {
    await pumpField(tester);
    await openPicker(tester);

    await tester.enterText(find.byType(TextField), 'ideo');
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Ideophone'), findsOneWidget);
    expect(find.text('Noun'), findsNothing);
  });

  testWidgets('a query that matches nothing says where to go instead', (
    tester,
  ) async {
    await pumpField(tester);
    await openPicker(tester);

    await tester.enterText(find.byType(TextField), 'gerund');
    await tester.pump(const Duration(milliseconds: 300));

    // Naming the landing places is the difference between a dead end and a
    // member who can finish the word they were on.
    expect(find.textContaining('Other and Not sure'), findsOneWidget);
  });

  testWidgets('choosing one closes the card and fills the field', (
    tester,
  ) async {
    await pumpField(tester);
    await openPicker(tester);

    await tester.enterText(find.byType(TextField), 'ideo');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Ideophone'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Which word class?'), findsNothing);
    expect(find.text('Ideophone'), findsOneWidget);
    expect(find.text('Word class'), findsOneWidget);
  });
}
