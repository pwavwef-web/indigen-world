// Practising both ways, and a reminder that skips the days already kept.
//
// Synthetic placeholders only: no Kasem is invented for a fixture.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_decks.dart';
import 'package:indigen_world_mobile/features/learn/practice/review_words_screen.dart';
import 'package:indigen_world_mobile/features/learn/practice_reminder.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

DictionaryEntry _entry(String id) => DictionaryEntry(
  id: id,
  headword: 'kasem-$id',
  translation: 'english-$id',
  partOfSpeech: 'noun',
  dialect: '',
  pronunciation: '',
  example: '',
  exampleTranslation: '',
  attribution: '',
  audioUrl: '',
);

void main() {
  setUp(() {
    learnClock = () => DateTime(2026, 10, 25, 12);
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() => learnClock = DateTime.now);

  group('review direction', () {
    test('Kasem first is how review has always worked', () {
      expect(reviewShowsEnglishFirst(ReviewDirection.kasemFirst, 0), isFalse);
      expect(reviewShowsEnglishFirst(ReviewDirection.englishFirst, 0), isTrue);
    });

    test('Mixed takes the two in turn', () {
      expect(
        [
          for (var at = 0; at < 4; at++)
            reviewShowsEnglishFirst(ReviewDirection.mixed, at),
        ],
        [false, true, false, true],
      );
    });

    test('an unknown stored value falls back to Kasem first', () {
      expect(ReviewDirection.fromName('sideways'), ReviewDirection.kasemFirst);
      expect(ReviewDirection.fromName(null), ReviewDirection.kasemFirst);
    });

    testWidgets('English first shows the meaning and keeps the Kasem — and '
        'its recording — for the reveal', (tester) async {
      tester.view.physicalSize = const Size(412, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final container = ProviderContainer(
        overrides: [
          publishedDictionaryEntriesProvider.overrideWith(
            (ref) => Stream.value([_entry('one')]),
          ),
          savedDictionaryEntryIdsProvider.overrideWith(
            (ref) async => <String>{},
          ),
          kawuriCapabilitiesProvider.overrideWith(
            (ref) async => KawuriCapabilities.none,
          ),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: buildIndigenTheme(),
            home: const ReviewWordsScreen(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Kasem first by default.
      expect(find.text('kasem-one'), findsOneWidget);
      expect(find.text('Show meaning'), findsOneWidget);

      await tester.tap(find.text('English first'));
      await tester.pump();
      expect(find.text('english-one'), findsOneWidget);
      expect(find.text('kasem-one'), findsNothing);
      expect(find.text('WHAT IS THE KASEM?'), findsOneWidget);

      await tester.tap(find.text('Show the Kasem'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('kasem-one'), findsOneWidget);
      expect(
        container.read(reviewDirectionProvider),
        ReviewDirection.englishFirst,
      );
    });
  });

  group('practice reminder schedule', () {
    test('today is included while it is ahead and not yet kept', () {
      final times = practiceReminderTimes(
        now: DateTime(2026, 10, 25, 12),
        minuteOfDay: 19 * 60,
        practisedToday: false,
      );
      expect(times, hasLength(practiceReminderDays));
      expect(times.first, DateTime(2026, 10, 25, 19));
      expect(times.last, DateTime(2026, 10, 31, 19));
    });

    test('a kept day is skipped, and the week still has seven', () {
      final times = practiceReminderTimes(
        now: DateTime(2026, 10, 25, 12),
        minuteOfDay: 19 * 60,
        practisedToday: true,
      );
      expect(times.first, DateTime(2026, 10, 26, 19));
      expect(times, hasLength(practiceReminderDays));
    });

    test('a time already gone today starts tomorrow', () {
      final times = practiceReminderTimes(
        now: DateTime(2026, 10, 25, 21),
        minuteOfDay: 19 * 60,
        practisedToday: false,
      );
      expect(times.first, DateTime(2026, 10, 26, 19));
    });

    test('runs across the end of a month', () {
      final times = practiceReminderTimes(
        now: DateTime(2026, 10, 30, 8),
        minuteOfDay: 7 * 60 + 30,
        practisedToday: false,
      );
      // 07:30 has gone by eight o'clock, so the week starts on the 31st.
      expect(times.first, DateTime(2026, 10, 31, 7, 30));
      expect(times[1], DateTime(2026, 11, 1, 7, 30));
      expect(times[2], DateTime(2026, 11, 2, 7, 30));
    });

    test('only today\'s reminder can name the streak', () {
      expect(
        practiceReminderText(isToday: true, streakDays: 4).title,
        'Keep your 4-day streak',
      );
      expect(
        practiceReminderText(isToday: false, streakDays: 4).title,
        'Five minutes of Kasem',
      );
      expect(
        practiceReminderText(isToday: true, streakDays: 0).title,
        'Five minutes of Kasem',
      );
    });

    test('turning it on is written down with the time', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final reminder = container.read(practiceReminderProvider.notifier);
      await reminder.setEnabled(true);
      await reminder.setTime(7 * 60 + 15);
      final preferences = await SharedPreferences.getInstance();
      expect(preferences.getBool(practiceReminderOnKey), isTrue);
      expect(preferences.getInt(practiceReminderAtKey), 7 * 60 + 15);
      expect(container.read(practiceReminderProvider).hour, 7);
      expect(container.read(practiceReminderProvider).minute, 15);
    });
  });
}
