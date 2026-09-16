// Review, Listen and Speak: real dictionary data, saved progress, and honesty
// about what is and is not checked by a machine.

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
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/learn/practice/listen_practice_screen.dart';
import 'package:indigen_world_mobile/features/learn/practice/review_words_screen.dart';
import 'package:indigen_world_mobile/features/learn/practice/speak_practice_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

DictionaryEntry _entry(String id, String headword, String meaning, {String audio = ''}) =>
    DictionaryEntry(
      id: id,
      headword: headword,
      translation: meaning,
      partOfSpeech: 'noun',
      dialect: '',
      pronunciation: '',
      example: '',
      exampleTranslation: '',
      attribution: '',
      audioUrl: audio,
    );

Future<ProviderContainer> _pump(
  WidgetTester tester,
  Widget screen,
  List<DictionaryEntry> entries,
) async {
  tester.view.physicalSize = const Size(412, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final container = ProviderContainer(
    overrides: [
      publishedDictionaryEntriesProvider.overrideWith((ref) => Stream.value(entries)),
      savedDictionaryEntryIdsProvider.overrideWith((ref) async => <String>{}),
      kawuriCapabilitiesProvider.overrideWith((ref) async => KawuriCapabilities.none),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenDarkTheme(),
        home: screen,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  return container;
}

void main() {
  setUp(() {
    learnClock = () => DateTime(2026, 9, 16, 12);
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() => learnClock = DateTime.now);

  testWidgets('review shows a word, reveals the published meaning and saves the answer', (
    tester,
  ) async {
    final container = await _pump(tester, const ReviewWordsScreen(), [
      _entry('e1', 'nabiu', 'goat'),
    ]);

    expect(find.text('nabiu'), findsOneWidget);
    expect(find.text('goat'), findsNothing);
    await tester.tap(find.byKey(const Key('review-reveal')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('goat'), findsOneWidget);

    await tester.tap(find.byKey(const Key('review-knew-it')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Review complete'), findsOneWidget);

    final progress = container.read(learnProgressProvider).value!;
    expect(progress.reviewCards['e1']!.box, 1);
    expect(progress.practisedToday(PracticeKind.review), isTrue);
  });

  testWidgets('listening never pads a quiz with invented answers', (tester) async {
    await _pump(tester, const ListenPracticeScreen(), [
      _entry('e1', 'nabiu', 'goat', audio: 'https://example.test/1.m4a'),
      _entry('e2', 'naga', 'cow', audio: 'https://example.test/2.m4a'),
      _entry('e3', 'kukuri', 'dog'),
    ]);
    expect(find.textContaining('Only 2 words have a published recording'), findsOneWidget);
    expect(find.textContaining('too few for a fair quiz'), findsOneWidget);
  });

  testWidgets('with no recordings at all, listening says so', (tester) async {
    await _pump(tester, const ListenPracticeScreen(), [_entry('e1', 'nabiu', 'goat')]);
    expect(find.text('No recordings published yet'), findsOneWidget);
  });

  test('two progress updates in the same frame both land', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    container.listen(learnProgressProvider, (_, _) {});
    for (var turn = 0; turn < 6; turn++) {
      await Future<void>.delayed(Duration.zero);
    }
    final controller = container.read(learnProgressProvider.notifier);
    await Future.wait([
      controller.reviewWord('e1', knew: true),
      controller.completePractice(PracticeKind.review),
      controller.recordLessonStep('lesson', 1),
    ]);
    final progress = container.read(learnProgressProvider).value!;
    expect(progress.reviewCards.keys, ['e1']);
    expect(progress.practisedToday(PracticeKind.review), isTrue);
    expect(progress.stepsIn('lesson'), 1);
  });

  testWidgets('speaking is honest about Kasem review and English-only checks', (
    tester,
  ) async {
    await _pump(
      tester,
      SpeakPracticeScreen(initialEntry: _entry('e1', 'nabiu', 'goat')),
      [_entry('e1', 'nabiu', 'goat')],
    );
    expect(find.text('Say it in Kasem'), findsOneWidget);
    expect(find.text('Community review'), findsOneWidget);
    expect(find.textContaining('not transcribed or scored automatically'), findsOneWidget);
    expect(find.text('Experimental'), findsOneWidget);
    expect(find.textContaining('speech-to-text supports English only'), findsOneWidget);
    // Nothing is recorded or asked for until the member presses record.
    expect(find.byKey(const Key('speak-send')), findsNothing);
    expect(find.byKey(const Key('learn-recorder-record')), findsOneWidget);
  });
}
