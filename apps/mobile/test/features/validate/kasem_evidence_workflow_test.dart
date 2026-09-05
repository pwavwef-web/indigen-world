import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/contribute/grammar/grammar_note_screen.dart';
import 'package:indigen_world_mobile/features/validate/data/grammar_note_queue.dart';
import 'package:indigen_world_mobile/features/validate/grammar_note_review_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

Finder field(String label) => find.byWidgetPredicate(
  (widget) => widget is TextField && widget.decoration?.labelText == label,
);

Future<void> open(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(400, 9000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [isSignedInProvider.overrideWithValue(true)],
      child: MaterialApp(home: screen),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
    'unexplained words and permission choices survive a local draft',
    (tester) async {
      await open(tester, const GrammarNoteScreen());
      await tester.enterText(
        field('Sentence in Kasem'),
        'synthetic mo sentence',
      );
      await tester.enterText(
        field('Natural meaning in English'),
        'Synthetic meaning.',
      );
      await tester.tap(find.text('Explain a word or phrase (optional)'));
      await tester.pumpAndSettle();
      await tester.enterText(field('First word number'), '2');
      await tester.enterText(field('Last word number'), '2');
      await tester.tap(find.text('Add').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save draft'));
      await tester.pumpAndSettle();
      final prefs = await SharedPreferences.getInstance();
      final draft =
          jsonDecode(prefs.getString('kasem-evidence-v2-offline-new')!) as Map;
      final example = (draft['examples'] as List).single as Map;
      expect(example['literal'], '');
      expect(
        (example['annotations'] as List).single,
        containsPair('kind', 'unknown'),
      );
      for (final grant in (draft['permissions'] as Map).entries) {
        if (evidencePermissionLabels.containsKey(grant.key)) {
          expect(grant.value, false);
        }
      }
      await tester.enterText(field('Sentence in Kasem'), 'unsaved edit');
      await tester.tap(find.text('Restore draft'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(field('Sentence in Kasem')).controller!.text,
        'synthetic mo sentence',
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'revising a multi-example note preserves different context, provenance and expiry',
    (tester) async {
      final rows = List.generate(
        3,
        (i) => {
          'kasem': 'synthetic version $i',
          'english': 'Synthetic meaning $i',
          'dialect': 'dialect-$i',
          'sourceType': 'literature',
          'source': 'source-$i',
          'context': {
            'status': 'specified',
            'situation': 'context-$i',
            'preceding': '',
            'intent': '',
            'register': '',
          },
          'constructions': ['focus'],
        },
      );
      await open(
        tester,
        GrammarNoteScreen(
          initialData: {
            'id': 'existing',
            'revision': 3,
            'examples': rows,
            'permissions': {
              'review': true,
              'sourceConfirmed': true,
              'expiresAt': '2027-01-01T00:00:00Z',
            },
          },
        ),
      );
      expect(find.text('Version 3'), findsOneWidget);
      await tester.tap(find.text('Save draft'));
      await tester.pumpAndSettle();
      final draft = jsonDecode(
        (await SharedPreferences.getInstance()).getString(
          'kasem-evidence-v2-offline-existing',
        )!,
      ) as Map;
      expect((draft['examples'] as List).length, 3);
      for (var i = 0; i < 3; i++) {
        final row = (draft['examples'] as List)[i] as Map;
        expect(row['source'], 'source-$i');
        expect(row['dialect'], 'dialect-$i');
        expect((row['context'] as Map)['situation'], 'context-$i');
      }
      expect(
        (draft['permissions'] as Map)['expiresAt'],
        '2027-01-01T00:00:00Z',
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'reviews start undecided in all four dimensions and require dialect competence',
    (tester) async {
      final example = GrammarExample.fromMap({
        'kasem': 'synthetic mo sentence',
        'english': 'Synthetic meaning',
        'dialect': 'synthetic',
        'context': {'situation': 'Synthetic conversation.'},
        'annotations': [
          {'start': 1, 'end': 2, 'kind': 'unknown', 'gloss': ''},
        ],
      })!;
      final note = GrammarNote(
        id: 'synthetic',
        status: 'submitted',
        origin: 'contribution',
        title: 'Synthetic example',
        explanation: '',
        constructions: const [],
        examples: [example],
        question: '',
        answer: '',
        wrongSpan: '',
        reviewNote: '',
        harvestedWords: 0,
        createdAt: null,
        data: const {'revision': 1, 'mode': 'sentence'},
      );
      expect(grammarNoteMatches(note, 'synthetic conversation'), isTrue);
      expect(grammarNoteMatches(note, 'another-dialect'), isFalse);
      await open(tester, GrammarNoteReviewScreen(note: note));
      for (final label in [
        'Cannot judge meaning',
        'Cannot judge grammar',
        'Cannot judge naturalness',
        'Cannot judge context',
      ]) {
        expect(find.text(label).hitTestable(), findsOneWidget);
      }
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save independent review'),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(
        find.text('I am able to judge the dialect used in these examples'),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save independent review'),
            )
            .onPressed,
        isNotNull,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
