// Learning progress over time: the streak, today's goal and the week are
// derived from day keys in the learner's own timezone, and nothing that
// happens twice on one day can count twice.

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:shared_preferences/shared_preferences.dart';

LearnProgress _days(List<String> days) =>
    LearnProgress(activeDays: days.toSet());

void main() {
  // A Wednesday evening.
  setUp(() => learnClock = () => DateTime(2026, 9, 16, 21, 30));
  tearDown(() => learnClock = DateTime.now);

  group('day keys', () {
    test('follow the local calendar, not UTC', () {
      expect(dayKey(DateTime(2026, 9, 16, 23, 59)), '2026-09-16');
      expect(dayKey(DateTime(2026, 1, 5)), '2026-01-05');
      expect(parseDayKey('2026-02-31'), isNull, reason: 'not a real date');
      expect(parseDayKey('today'), isNull);
      expect(startOfWeek(DateTime(2026, 9, 16)), DateTime(2026, 9, 14));
      expect(weekOf(DateTime(2026, 9, 20)).first, DateTime(2026, 9, 14));
      expect(weekOf(DateTime(2026, 9, 20)).last, DateTime(2026, 9, 20));
    });
  });

  group('the streak', () {
    test('counts consecutive days ending today', () {
      expect(_days(['2026-09-14', '2026-09-15', '2026-09-16']).streakDays, 3);
    });

    test('still stands while only yesterday is done, and is at risk', () {
      final progress = _days(['2026-09-14', '2026-09-15']);
      expect(progress.streakDays, 2);
      expect(progress.streakAtRisk, isTrue);
    });

    test('breaks on a skipped day', () {
      expect(_days(['2026-09-13', '2026-09-14']).streakDays, 0);
      expect(_days(['2026-09-10', '2026-09-11', '2026-09-16']).streakDays, 1);
    });

    test('the longest run is remembered', () {
      expect(
        _days(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-09-16']).longestStreak,
        4,
      );
    });

    test('an old spark counter becomes the same run of days', () {
      final legacy = LearnProgress(
        streakDays: 4,
        lastStreakClaim: DateTime(2026, 9, 15, 8),
      ).withLegacyBackfill();
      expect(legacy.activeDays, {
        '2026-09-12',
        '2026-09-13',
        '2026-09-14',
        '2026-09-15',
      });
      expect(legacy.streakDays, 4, reason: 'nobody loses the streak they had');
    });
  });

  group('today and this week', () {
    test('lessons and kinds of practice each count once towards the goal', () {
      const progress = LearnProgress(
        dayLessons: {
          '2026-09-16': {'a', 'b'},
          '2026-09-15': {'c', 'd', 'e'},
        },
        practiceDays: {
          PracticeKind.review: {'2026-09-16'},
          PracticeKind.listen: {'2026-09-14'},
        },
      );
      expect(progress.lessonsToday, 2);
      expect(progress.practiceToday, 1);
      expect(progress.activitiesToday, 3);
      expect(progress.dailyGoalMet, isTrue);
      expect(progress.practiceXp, 10);
    });

    test('the week runs Monday to Sunday and meets its goal on three days', () {
      final progress = _days(['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16']);
      expect(progress.week.map((day) => day.active), [true, true, true, false, false, false, false]);
      expect(progress.week[2].isToday, isTrue);
      expect(progress.week[3].isFuture, isTrue);
      expect(progress.activeDaysThisWeek, 3, reason: 'Sunday the 13th was last week');
      expect(progress.weeklyGoalMet, isTrue);
    });
  });

  group('merging two copies', () {
    test('unions the calendar and keeps the later review answer', () {
      const phone = LearnProgress(
        completedLessons: {'a'},
        activeDays: {'2026-09-15'},
        lessonSteps: {'b': 2, 'a': 1},
        reviewCards: {
          'w1': ReviewCard(box: 1, dueDay: '2026-09-17', lastDay: '2026-09-16'),
        },
      );
      const server = LearnProgress(
        activeDays: {'2026-09-16'},
        lessonSteps: {'b': 1},
        reviewCards: {
          'w1': ReviewCard(box: 3, dueDay: '2026-09-20', lastDay: '2026-09-12'),
          'w2': ReviewCard(box: 0, dueDay: '2026-09-16', lastDay: '2026-09-16'),
        },
      );
      final merged = phone.merge(server);
      expect(merged.activeDays, {'2026-09-15', '2026-09-16'});
      expect(merged.lessonSteps, {'b': 2}, reason: 'a finished lesson has no steps left');
      expect(merged.reviewCards['w1']!.box, 1, reason: 'answered later on the phone');
      expect(merged.reviewCards.keys, containsAll(['w1', 'w2']));
    });

    test('old calendar is pruned, practice days never are', () {
      final old = dayKey(addDays(learnNow(), -LearnProgress.keptDays - 5));
      final progress = LearnProgress(
        activeDays: {old, '2026-09-16'},
        practiceDays: {PracticeKind.speak: {old}},
      ).pruned();
      expect(progress.activeDays, {'2026-09-16'});
      expect(progress.practiceXp, LearnProgress.xpPerPracticeDay);
    });

    test('the calendar survives a round trip through JSON', () {
      const progress = LearnProgress(
        activeDays: {'2026-09-16'},
        dayLessons: {'2026-09-16': {'a'}},
        lessonSteps: {'b': 2},
        practiceDays: {PracticeKind.listen: {'2026-09-16'}},
        reviewCards: {'w': ReviewCard(box: 2, dueDay: '2026-09-18', lastDay: '2026-09-16')},
      );
      final back = const LearnProgress().withCalendarJson(
        jsonDecode(jsonEncode(progress.calendarJson())) as Map<String, dynamic>,
      );
      expect(back.activeDays, progress.activeDays);
      expect(back.dayLessons['2026-09-16'], {'a'});
      expect(back.lessonSteps, {'b': 2});
      expect(back.practisedToday(PracticeKind.listen), isTrue);
      expect(back.reviewCards['w']!.box, 2);
    });
  });

  group('spaced repetition', () {
    test('knowing a word moves it later; not knowing brings it back today', () {
      final now = learnNow();
      final first = ReviewCard.first(knew: true, now: now);
      expect(first.box, 1);
      expect(first.dueDay, '2026-09-17');
      final again = first.answered(knew: true, now: DateTime(2026, 9, 17));
      expect(again.box, 2);
      expect(again.dueDay, '2026-09-19');
      final forgot = again.answered(knew: false, now: DateTime(2026, 9, 19));
      expect(forgot.box, 0);
      expect(forgot.dueDay, '2026-09-19');
    });
  });

  group('the controller', () {
    late ProviderContainer container;

    Future<LearnProgressController> ready() async {
      container = ProviderContainer(
        overrides: [authStateProvider.overrideWith((ref) => Stream.value(null))],
      );
      addTearDown(container.dispose);
      container.listen(learnProgressProvider, (_, _) {});
      for (var turn = 0; turn < 6; turn++) {
        await Future<void>.delayed(Duration.zero);
      }
      return container.read(learnProgressProvider.notifier);
    }

    LearnProgress state() => container.read(learnProgressProvider).value!;

    test('a lesson finished twice in a day counts once and pays once', () async {
      SharedPreferences.setMockInitialValues({});
      final controller = await ready();
      await controller.completeLesson('a', xp: 15);
      await controller.completeLesson('a', xp: 15);
      expect(state().xp, 15);
      expect(state().lessonsToday, 1);
      expect(state().activeDays, {'2026-09-16'});
      expect(state().streakDays, 1);
    });

    test('practice pays once a day per kind, and marks the day', () async {
      SharedPreferences.setMockInitialValues({});
      final controller = await ready();
      expect(await controller.completePractice(PracticeKind.review), isTrue);
      expect(await controller.completePractice(PracticeKind.review), isFalse);
      expect(await controller.completePractice(PracticeKind.listen), isTrue);
      expect(state().practiceXp, 10);
      expect(state().activitiesToday, 2);
    });

    test('steps are saved as they happen and cleared by finishing', () async {
      SharedPreferences.setMockInitialValues({});
      final controller = await ready();
      await controller.recordLessonStep('a', 2);
      await controller.recordLessonStep('a', 1);
      expect(state().stepsIn('a'), 2, reason: 'a step never goes backwards');
      await controller.completeLesson('a', xp: 15);
      expect(state().stepsIn('a'), 0);

      // And all of it is on disk for the next launch.
      final reloaded = await LearnProgressController().load();
      expect(reloaded.completedLessons, {'a'});
      expect(reloaded.activeDays, {'2026-09-16'});
    });
  });
}
