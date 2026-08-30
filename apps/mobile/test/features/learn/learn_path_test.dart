// The learning path: what stays on screen, and what a lesson button does.
//
// The tab used to open on a header of stacked pills and paired buttons that was
// most of a screen tall — a lid on the one thing the tab is for. Streak, XP and
// today's quest are one pinned strip now, each unit's banner sticks for exactly
// as long as its own lessons are on screen, and the trail underneath is a line
// of buttons that name themselves when you press them.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

const _lessons = [
  Lesson(
    id: 'greetings-1',
    title: 'Greeting an elder',
    unitTitle: 'First words',
    unitSubtitle: 'Say hello, and mean it',
    questions: [
      LessonQuestion(
        prompt: 'Choose the greeting',
        answers: ['De zaanem', 'Ko gara'],
        correctAnswer: 0,
      ),
    ],
  ),
  Lesson(
    id: 'greetings-2',
    title: 'Answering back',
    unitTitle: 'First words',
    unitSubtitle: 'Say hello, and mean it',
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
    questions: [
      LessonQuestion(
        prompt: 'Choose the number',
        answers: ['Kadoa', 'Nabiu'],
        correctAnswer: 0,
      ),
    ],
  ),
];

Widget _harness() => ProviderScope(
  overrides: [
    // A path that does not depend on Firebase, so the trail under test is the
    // one written here rather than whatever the bundle happens to carry.
    lessonPathProvider.overrideWith((ref) => Stream.value(_lessons)),
  ],
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,

    theme: buildIndigenTheme(),
    home: const LearnScreen(),
  ),
);

Future<void> _pumpPath(WidgetTester tester) async {
  await tester.pumpWidget(_harness());
  await tester.pump();
  // Long enough for Kawuri's deferred entrance to land: a delayed future left
  // in flight is a pending timer, and a pending timer fails the test.
  await tester.pump(const Duration(milliseconds: 600));
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('the numbers are pinned above the trail', (tester) async {
    await _pumpPath(tester);

    // Streak, XP and today's quest, on one line at the very top.
    expect(find.text('0/3'), findsOneWidget);
    final quest = tester.getRect(find.text('0/3'));
    expect(quest.top, lessThan(kLearnStatsBarHeight));

    // And the first unit's banner is stuck directly underneath it.
    final banner = tester.getRect(find.text('UNIT 1'));
    expect(banner.top, greaterThanOrEqualTo(kLearnStatsBarHeight - 1));
  });

  testWidgets('each unit names itself, and counts its own lessons', (
    tester,
  ) async {
    await _pumpPath(tester);

    expect(find.text('First words'), findsOneWidget);
    expect(find.text('0/2'), findsOneWidget);
    expect(find.text('Around Paga'), findsOneWidget);
    expect(find.text('0/1'), findsOneWidget);
  });

  testWidgets('the numbers stay when the trail is scrolled', (tester) async {
    await _pumpPath(tester);

    await tester.drag(find.byType(CustomScrollView), const Offset(0, -300));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('0/3'), findsOneWidget);
    expect(
      tester.getRect(find.text('0/3')).top,
      lessThan(kLearnStatsBarHeight),
    );
  });

  testWidgets('a lesson button names its lesson and offers to start it', (
    tester,
  ) async {
    await _pumpPath(tester);

    // Nothing on the trail is labelled until it is pressed: a path is walked,
    // not read.
    expect(find.text('Greeting an elder'), findsNothing);
    expect(find.text('START'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel(RegExp('Greeting an elder')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Greeting an elder'), findsOneWidget);
    expect(find.text('LESSON 1 OF 3'), findsOneWidget);
    expect(find.text('START · +15 XP'), findsOneWidget);
  });

  testWidgets('a locked lesson says so rather than opening', (tester) async {
    await _pumpPath(tester);

    // The second unit starts below the fold on a test surface.
    final locked = find.bySemanticsLabel(RegExp('At the market'));
    await tester.ensureVisible(locked);
    await tester.pump();
    await tester.tap(locked);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('LOCKED'), findsNWidgets(2));
    expect(
      find.text('Finish the lesson above to open this one.'),
      findsOneWidget,
    );
  });

  testWidgets('every unit ends in something to finish it for', (tester) async {
    await _pumpPath(tester);

    expect(find.text('UNIT TROPHY'), findsNWidgets(2));
  });
}
