// The Learn tab: a dashboard that opens on today's lesson, and the course
// outline behind "Course", where the trail of lessons lives.
//
// What these hold:
//   * the header numbers are real progress and every one of them opens
//     something, and the header leaves and returns with the shell's rail;
//   * today's lesson is the learner's next unfinished lesson, resumed where it
//     was left, with an honest state once there is nothing left;
//   * a word with no recording says so and offers to record it — never a
//     synthetic voice;
//   * a unit that cannot be opened explains why;
//   * the trail still gates, names and counts lessons in the outline.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/app/shell_chrome.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/learn/learn_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _lessons = [
  Lesson(
    id: 'greetings-1',
    title: 'Greeting an elder',
    description: 'Welcome someone older',
    unitTitle: 'First words',
    unitSubtitle: 'Say hello, and mean it',
    order: 1,
    questions: [
      LessonQuestion(
        prompt: 'Choose the greeting',
        answers: ['De zaanem', 'Ko gara'],
        correctAnswer: 0,
      ),
      LessonQuestion(
        prompt: 'Choose the reply',
        answers: ['Ko gara', 'De zaanem'],
        correctAnswer: 0,
      ),
    ],
  ),
  Lesson(
    id: 'greetings-2',
    title: 'Answering back',
    unitTitle: 'First words',
    unitSubtitle: 'Say hello, and mean it',
    order: 2,
    questions: [
      LessonQuestion(
        prompt: 'Choose the reply',
        answers: ['Ko gara', 'De zaanem'],
        correctAnswer: 0,
      ),
    ],
  ),
  Lesson(
    id: 'market-1',
    title: 'At the market',
    unitTitle: 'Around Paga',
    unitSubtitle: 'Buying and asking',
    unitOrder: 2,
    order: 3,
    questions: [
      LessonQuestion(
        prompt: 'Choose the number',
        answers: ['Kadoa', 'Nabiu'],
        correctAnswer: 0,
      ),
    ],
  ),
];

const _silentWord = DictionaryEntry(
  id: 'word-1',
  headword: 'nabiu',
  translation: 'goat',
  partOfSpeech: 'noun',
  dialect: 'Navrongo',
  pronunciation: '',
  example: '',
  exampleTranslation: '',
  attribution: 'Community',
);

Widget _harness({Widget home = const LearnScreen()}) => ProviderScope(
  overrides: [
    // A path that does not depend on Firebase, so the course under test is the
    // one written here rather than whatever the bundle happens to carry.
    lessonPathProvider.overrideWith((ref) => Stream.value(_lessons)),
    publishedDictionaryEntriesProvider.overrideWith(
      (ref) => Stream.value(const [_silentWord]),
    ),
    myContributionPointsProvider.overrideWithValue(0),
  ],
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: buildIndigenDarkTheme(),
    home: home,
  ),
);

Future<void> _pump(
  WidgetTester tester, {
  Widget home = const LearnScreen(),
  Size size = const Size(412, 900),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(_harness(home: home));
  await tester.pump();
  // Progress comes back off disk over several frames, and Kawuri's deferred
  // entrance has to land: a future left in flight fails the test.
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 600));
  await tester.pump(const Duration(milliseconds: 400));
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  setUp(() {
    learnClock = () => DateTime(2026, 9, 16, 18);
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() => learnClock = DateTime.now);

  group('the dashboard', () {
    testWidgets('opens on the next lesson, ready to start', (tester) async {
      await _pump(tester);

      expect(find.text('TODAY’S LESSON'), findsOneWidget);
      expect(find.text('UNIT 1'), findsOneWidget);
      expect(find.text('Greeting an elder'), findsOneWidget);
      expect(find.text('Welcome someone older · 3 min'), findsOneWidget);
      expect(find.text('0 of 2 activities'), findsOneWidget);
      expect(find.text('Start lesson'), findsOneWidget);
      // The header's numbers are the learner's, not a mock-up's.
      expect(find.text('0/3'), findsOneWidget);
      expect(find.byKey(const Key('learn-language')), findsOneWidget);
      expect(find.byKey(const Key('learn-course')), findsOneWidget);
    });

    testWidgets('resumes a half-finished lesson and says how far along', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({
        LearnProgressController.calendarKey: jsonEncode({
          'activeDays': ['2026-09-16'],
          'lessonSteps': {'greetings-1': 1},
        }),
      });
      await _pump(tester);

      expect(find.text('1 of 2 activities'), findsOneWidget);
      expect(find.text('Continue'), findsOneWidget);

      await tester.tap(find.byKey(const Key('learn-hero-continue')));
      await _settle(tester);
      // Straight back to the question that was left.
      expect(find.text('QUESTION 2 OF 2'), findsOneWidget);
    });

    testWidgets('every header number opens what it counts', (tester) async {
      await _pump(tester);

      await tester.tap(find.byKey(const Key('learn-header-streak')));
      await _settle(tester);
      expect(find.text('Your streak'), findsOneWidget);
      expect(find.byKey(const Key('claim-spark')), findsOneWidget);
      await tester.tap(find.byKey(const Key('claim-spark')));
      await _settle(tester);
      Navigator.of(tester.element(find.text('Your streak'))).pop();
      await _settle(tester);
      // The spark is a day of learning, so the streak starts.
      expect(
        find.descendant(
          of: find.byKey(const Key('learn-header-streak')),
          matching: find.text('1'),
        ),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('learn-header-xp')));
      await _settle(tester);
      expect(find.text('ACHIEVEMENTS'), findsOneWidget);
      expect(find.text('First lesson'), findsOneWidget);
      Navigator.of(tester.element(find.text('ACHIEVEMENTS'))).pop();
      await _settle(tester);

      await tester.tap(find.byKey(const Key('learn-header-goal')));
      await _settle(tester);
      expect(find.text('Today’s goal'), findsOneWidget);
      await tester.tap(find.byKey(const Key('goal-continue')));
      await _settle(tester);
      expect(find.text('LESSON 1 OF 3'), findsOneWidget);
    });

    testWidgets('a word nobody has recorded says so and offers a recording', (
      tester,
    ) async {
      await _pump(tester);

      expect(find.textContaining('Pronunciation unavailable'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('learn-word-audio')));
      await tester.tap(find.byKey(const Key('learn-word-audio')));
      await _settle(tester);
      expect(find.text('Pronunciation unavailable'), findsOneWidget);
      expect(find.textContaining('does not play a computer voice'), findsOneWidget);
      expect(find.byKey(const Key('record-pronunciation')), findsOneWidget);
    });

    testWidgets('a locked unit explains what comes first', (tester) async {
      await _pump(tester);

      final unit = find.text('Around Paga');
      await tester.scrollUntilVisible(
        unit,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(unit);
      await _settle(tester);
      expect(find.text('Locked for now'), findsOneWidget);
      expect(
        find.textContaining('Finish Unit 1 · First words first — 2 lessons to go'),
        findsOneWidget,
      );
    });

    testWidgets('the header leaves with the rail and comes back with it', (
      tester,
    ) async {
      await _pump(tester, size: const Size(412, 700));
      final container = ProviderScope.containerOf(
        tester.element(find.byType(LearnScreen)),
      );
      expect(container.read(shellChromeVisibilityProvider), isTrue);

      await tester.drag(find.byType(CustomScrollView).first, const Offset(0, -260));
      await _settle(tester);
      expect(container.read(shellChromeVisibilityProvider), isFalse);

      await tester.drag(find.byType(CustomScrollView).first, const Offset(0, 120));
      await _settle(tester);
      expect(container.read(shellChromeVisibilityProvider), isTrue);
    });

    testWidgets('stays usable on a small phone with large text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await _pump(tester, size: const Size(320, 640));
      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('learn-hero-continue')), findsOneWidget);
    });
  });

  group('the course outline', () {
    testWidgets('each unit names itself, and counts its own lessons', (
      tester,
    ) async {
      await _pump(tester, home: const CourseOutlineScreen());

      expect(find.text('First words'), findsOneWidget);
      expect(find.text('0/2'), findsOneWidget);
      expect(find.text('0 of 3 lessons complete · 2 units'), findsOneWidget);
    });

    testWidgets('a lesson button names its lesson and offers to start it', (
      tester,
    ) async {
      await _pump(tester, home: const CourseOutlineScreen());

      expect(find.text('Greeting an elder'), findsNothing);
      expect(find.text('START'), findsOneWidget);

      await tester.tap(find.bySemanticsLabel(RegExp('Greeting an elder')));
      await _settle(tester);

      expect(find.text('Greeting an elder'), findsOneWidget);
      expect(find.text('LESSON 1 OF 3'), findsOneWidget);
      expect(find.text('START · +15 XP'), findsOneWidget);
    });

    testWidgets('a locked lesson says so rather than opening', (tester) async {
      await _pump(tester, home: const CourseOutlineScreen());

      final locked = find.bySemanticsLabel(RegExp('At the market'));
      await tester.ensureVisible(locked);
      await tester.pump();
      await tester.tap(locked);
      await _settle(tester);

      expect(find.text('LOCKED'), findsNWidgets(2));
      expect(
        find.text('Finish the lesson above to open this one.'),
        findsOneWidget,
      );
    });

    testWidgets('every unit ends in something to finish it for', (
      tester,
    ) async {
      await _pump(tester, home: const CourseOutlineScreen());
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -600));
      await _settle(tester);
      expect(find.text('UNIT TROPHY'), findsWidgets);
    });
  });
}
