// Contribution points in the Learn header.
//
// The bolt counts both halves of what somebody has done for the language — the
// lessons they finished and the work a reviewer approved — and the two come
// apart again the moment the badge is tapped. What these tests really hold is
// the boundary underneath that: the contributed half is read from
// `contributorScores`, which the server owns, and is never written into
// `LearnProgress`, which the member's own device can write and which merges by
// taking the more generous of two copies.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/learn/learn_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
];

/// Seeds the device copy so the learning half of the total is a known number.
void seedLearning(int xp) {
  SharedPreferences.setMockInitialValues({
    LearnProgressController.lessonXpKey: jsonEncode({'greetings-1': xp}),
    LearnProgressController.sparkXpKey: 0,
    LearnProgressController.streakDaysKey: 0,
  });
}

Future<void> pumpLearn(
  WidgetTester tester, {
  required int contributed,
  Size size = const Size(800, 1400),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        lessonPathProvider.overrideWith((ref) => Stream.value(_lessons)),
        myContributionPointsProvider.overrideWithValue(contributed),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: const LearnScreen(),
      ),
    ),
  );
  await tester.pump();
  // Long enough for the stored progress to come back off disk — several frames,
  // because the controller waits on auth and then on shared_preferences — and
  // for Kawuri's deferred entrance to land; a future still in flight is a
  // pending timer, and a pending timer fails the test.
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 600));
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('the header adds contribution points to the learning total', (
    tester,
  ) async {
    seedLearning(120);
    await pumpLearn(tester, contributed: 340);

    expect(find.text('460'), findsOneWidget);
    // And neither half is shown on its own up there, because one badge for
    // "what you have done" is the whole point of adding them.
    expect(find.text('120'), findsNothing);
    expect(find.text('340'), findsNothing);
  });

  testWidgets('tapping the badge breaks the total into its two parts', (
    tester,
  ) async {
    seedLearning(120);
    await pumpLearn(tester, contributed: 340);

    await tester.tap(find.text('460'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('120 learning · 340 contributed'), findsOneWidget);
    expect(find.text('460'), findsWidgets);
  });

  testWidgets('a member who has contributed nothing sees no second total', (
    tester,
  ) async {
    seedLearning(120);
    await pumpLearn(tester, contributed: 0);

    expect(find.text('120'), findsOneWidget);

    await tester.tap(find.text('120'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // A breakdown reading "120 learning · 0 contributed" would introduce a
    // second total by showing somebody a nought in it.
    expect(find.text('XP earned'), findsOneWidget);
    expect(find.textContaining('contributed'), findsNothing);
  });

  testWidgets('the breakdown still fits on a small phone', (tester) async {
    // It began as a longer label under the XP number, which on a 360-wide
    // screen left the two panels about eighty pixels each and wrapped
    // "120 learning · 340 contributed" onto four lines inside one of them.
    seedLearning(120);
    await pumpLearn(
      tester,
      contributed: 340,
      size: const Size(360, 760),
    );

    await tester.tap(find.text('460'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('120 learning · 340 contributed'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the contributed half never reaches the owner-writable copy', (
    tester,
  ) async {
    seedLearning(120);
    await pumpLearn(tester, contributed: 340);

    // The addition happens at the moment of drawing. `learnProgress/{uid}` is
    // owner-writable and [LearnProgress.merge] keeps the larger of two copies,
    // so a contribution total that ever landed in here could be pushed back up
    // for good by one stale device.
    final progress = await LearnProgressController().load();
    expect(progress.xp, 120);
  });
}
