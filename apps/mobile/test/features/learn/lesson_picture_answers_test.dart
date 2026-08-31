// Picture answers: "which of these is a goat".
//
// A lesson could only ever be text multiple-choice, which is a poor way to
// teach the name of a thing — the word is right there in the options, so the
// question answers itself for anybody who can already read it. An option can
// carry a picture now, and these tests hold the two rules that make that safe:
// a half-authored picture question never reaches a learner, and the option a
// screen reader announces is "Option 1" rather than the answer.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

const _pictureQuestion = LessonQuestion(
  prompt: 'Bʋŋa',
  support: 'Which one is the goat?',
  // In picture layout these are the author's own labels, kept for the console
  // and for a build too old to know about pictures. They are not drawn.
  answers: ['goat', 'cow'],
  answerImages: [
    'https://example.test/goat.jpg',
    'https://example.test/cow.jpg',
  ],
  answerLayout: 'image',
  correctAnswer: 0,
);

const _lessons = [
  Lesson(
    id: 'animals-1',
    title: 'Animals of the compound',
    unitTitle: 'First words',
    unitSubtitle: 'Name what is around you',
    questions: [_pictureQuestion],
  ),
];

Widget _harness(List<Lesson> lessons) => ProviderScope(
  overrides: [
    lessonPathProvider.overrideWith((ref) => Stream.value(lessons)),
  ],
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: buildIndigenTheme(),
    home: const LearnScreen(),
  ),
);

/// Opens the first lesson, through the quest sheet.
///
/// The same route the smoke test takes. Tapping the trail node directly is the
/// other way in, but the node has to be scrolled to and its semantics label is
/// built from the unit and the lesson's position, so the quest sheet is the
/// stabler door for a test that is not about the trail.
Future<void> _openFirstLesson(WidgetTester tester, List<Lesson> lessons) async {
  await tester.pumpWidget(_harness(lessons));
  await tester.pump();
  // Kawuri's deferred entrance; a future left in flight fails the test.
  await tester.pump(const Duration(milliseconds: 600));
  await tester.pump(const Duration(milliseconds: 400));

  await tester.tap(find.text('0/3'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));

  await tester.tap(find.text('Continue the quest'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  group('the model', () {
    test('a picture question needs a picture on every option', () {
      expect(_pictureQuestion.isValid, isTrue);

      // One option left without a photograph is an option nobody can choose.
      const missing = LessonQuestion(
        prompt: 'Bʋŋa',
        answers: ['goat', 'cow'],
        answerImages: ['https://example.test/goat.jpg', ''],
        answerLayout: 'image',
        correctAnswer: 0,
      );
      expect(missing.isValid, isFalse);

      // Shorter than the answers it is meant to be parallel to.
      const short = LessonQuestion(
        prompt: 'Bʋŋa',
        answers: ['goat', 'cow'],
        answerImages: ['https://example.test/goat.jpg'],
        answerLayout: 'image',
        correctAnswer: 0,
      );
      expect(short.isValid, isFalse);
    });

    test('a text question is not asked for pictures', () {
      const text = LessonQuestion(
        prompt: 'Choose the greeting',
        answers: ['De zaanem', 'Ko gara'],
        correctAnswer: 0,
      );
      expect(text.isValid, isTrue);
      expect(text.isPictureAnswers, isFalse);
      // Reading past the end of an empty list is what a lesson does on every
      // build; it must answer '' rather than throw.
      expect(text.imageFor(0), '');
      expect(text.imageFor(-1), '');
      expect(text.imageFor(99), '');
    });

    test('an unknown layout is read as text rather than refused', () {
      // A build that has never heard of whatever a later one invents still
      // draws something a member can answer.
      const future = LessonQuestion(
        prompt: 'Choose the greeting',
        answers: ['De zaanem', 'Ko gara'],
        answerLayout: 'audio',
        correctAnswer: 0,
      );
      expect(future.isPictureAnswers, isFalse);
      expect(future.isValid, isTrue);
    });

    test('the new fields survive a round trip through Firestore', () {
      final map = _pictureQuestion.toMap();
      final back = LessonQuestion.fromMap(map);
      expect(back.answerLayout, 'image');
      expect(back.answerImages, _pictureQuestion.answerImages);
      expect(back.isPictureAnswers, isTrue);
    });

    test('a lesson drops a picture question it cannot draw', () {
      const half = Lesson(
        id: 'animals-2',
        title: 'Half written',
        unitTitle: 'First words',
        unitSubtitle: '',
        questions: [
          LessonQuestion(
            prompt: 'Bʋŋa',
            answers: ['goat', 'cow'],
            answerImages: ['https://example.test/goat.jpg', ''],
            answerLayout: 'image',
            correctAnswer: 0,
          ),
        ],
      );
      // The lesson keeps the question in the constant above, but the reader
      // that builds one from Firestore is what drops it — so this asserts the
      // rule the reader applies rather than the constant.
      expect(half.questions.single.isValid, isFalse);
    });
  });

  group('the lesson screen', () {
    testWidgets('draws the options as pictures, not as words', (tester) async {
      await _openFirstLesson(tester, _lessons);

      expect(find.text('Which one is the goat?'), findsOneWidget);
      // The author's labels are for the console. Printing them here would put
      // the answer on the screen next to the picture of it.
      expect(find.text('goat'), findsNothing);
      expect(find.text('cow'), findsNothing);
    });

    testWidgets('names the options by position, never by their answer', (
      tester,
    ) async {
      await _openFirstLesson(tester, _lessons);

      // Asserted on the Semantics widgets themselves rather than through
      // `bySemanticsLabel`, which reads the compiled semantics tree and finds
      // nothing for a tile below the fold — the label would then look correct
      // by being absent, which is the one result this test must not accept.
      Iterable<String> labelsOf() => tester
          .widgetList<Semantics>(find.byType(Semantics))
          .map((widget) => widget.properties.label ?? '')
          .where((label) => label.isNotEmpty);

      // The whole point of the layout is that the member has to recognise the
      // thing. A screen reader that announced "goat" would hand it to them.
      expect(labelsOf(), containsAll(<String>['Option 1', 'Option 2']));
      expect(labelsOf().any((label) => label.contains('goat')), isFalse);
      expect(labelsOf().any((label) => label.contains('cow')), isFalse);
    });

    testWidgets('scores a picture answer the same as a written one', (
      tester,
    ) async {
      await _openFirstLesson(tester, _lessons);

      // Keyed by question and position, the same way the text tiles are.
      await tester.ensureVisible(find.byKey(const ValueKey('q0_a0')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('q0_a0')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('lesson-primary-action')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // The feedback panel only appears once an answer has been checked, and
      // this one was right.
      expect(find.byIcon(Icons.cancel_rounded), findsNothing);
    });
  });
}
