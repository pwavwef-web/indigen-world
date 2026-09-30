// The language loop on the phone: one id per word, the Explore prompt's
// rhythm and memory, a focused word that survives sign-in and is never sent by
// itself, Kawuri's lookups, the reviewer's choices and the member's view of
// what their answer became.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/contribute/language_loop_analytics.dart';
import 'package:indigen_world_mobile/features/contribute/my_submissions_screen.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/queue_lookup.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_controller.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_repository.dart';
import 'package:indigen_world_mobile/features/contribute/words/word_queue_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_word_prompt.dart';
import 'package:indigen_world_mobile/features/explore/reel_context_sheet.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_service.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_word_queue_api.dart';

const _water = QueueWord(
  id: 'water-5ec6a4',
  word: 'water',
  sentence: 'She drank a glass of water.',
  sentenceSource: 'tatoeba',
  attribution: QueueWordAttribution(
    tatoebaId: '1234',
    contributor: 'CK',
    licence: 'CC BY 2.0 FR',
  ),
  rank: 40,
);

class _FakeLookup implements QueueLookup {
  _FakeLookup({this.words = const {}});

  final Map<String, QueueWord> words;

  @override
  Future<QueueWord?> byId(String wordId) async => words[wordId];

  @override
  Future<QueueWord?> byEnglish(String english) async =>
      words[queueWordIdFor(normaliseQueueEnglish(english))];

  @override
  Future<List<QueueWord>> openForTopic(String topic, {int limit = 20}) async =>
      const [];

  @override
  Future<List<QueueWord>> promptCandidates({int limit = 10}) async =>
      words.values.toList();

  @override
  Future<QueueWordRequest> request(
    String english, {
    String? topic,
    required String source,
  }) async => QueueWordRequest(
    wordId: queueWordIdFor(english),
    word: english,
    state: QueueWordState.open,
    created: true,
  );
}

class _Recorder extends LoopAnalytics {
  final events = <(LoopEvent, Map<String, Object>)>[];

  @override
  void log(LoopEvent event, {Map<String, Object> parameters = const {}}) =>
      events.add((event, parameters));
}

class _SignedIn extends Notifier<bool> {
  @override
  bool build() => false;

  void set(bool value) => state = value;
}

final _signedInProvider = NotifierProvider<_SignedIn, bool>(_SignedIn.new);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('one word, one id', () {
    test('the app reproduces the seed’s queue ids', () {
      // Taken from data/word-seed/word-queue.ndjson.
      expect(queueWordIdFor('the'), 'the-bbccdf');
      expect(queueWordIdFor('of'), 'of-de04fa');
      expect(queueWordIdFor('to'), 'to-4374aa');
      expect(queueWordIdFor('Goat'), queueWordIdFor('goat'));
    });

    test('only English a queue can hold is offered as a queue word', () {
      expect(isQueueableEnglish('Goat'), isTrue);
      expect(isQueueableEnglish('good morning'), isTrue);
      expect(isQueueableEnglish("don't"), isTrue);
      expect(isQueueableEnglish('kɔ'), isFalse);
      expect(isQueueableEnglish('goat2'), isFalse);
      expect(isQueueableEnglish('one two three four'), isFalse);
      expect(isQueueableEnglish(''), isFalse);
      expect(normaliseQueueEnglish('  Good   Morning '), 'good morning');
    });

    test('a stored queue row keeps its Tatoeba credit', () {
      final word = QueueWord.fromQueueRow('water-5ec6a4', {
        'word': 'water',
        'sentence': 'She drank a glass of water.',
        'sentenceSource': 'tatoeba',
        'tatoebaId': '1234',
        'tatoebaContributor': 'CK',
        'licence': 'CC BY 2.0 FR',
        'status': 'open',
      })!;
      expect(word.attribution?.tatoebaId, '1234');
      expect(word.attribution?.contributor, 'CK');
      final requested = QueueWord.fromQueueRow('goat-x', {
        'word': 'goat',
        'sentence': '',
        'sentenceSource': 'none',
      })!;
      expect(requested.attribution, isNull);
    });

    test('a request says whether to open the form or the dictionary', () {
      expect(
        QueueWordRequest.fromMap({'wordId': 'a', 'status': 'open'}, asked: 'x')
            .state,
        QueueWordState.open,
      );
      expect(
        QueueWordRequest.fromMap({'status': 'translated'}, asked: 'goat').state,
        QueueWordState.translated,
      );
      expect(
        QueueWordRequest.fromMap({'status': 'retired'}, asked: 'goat').state,
        QueueWordState.unavailable,
      );
    });
  });

  group('the Explore prompt', () {
    test('comes after a few reels, then rarely, and not too often a session', () {
      expect(promptDue(moves: kPromptFirstAfterReels - 1, shown: 0, lastShownAt: null), isFalse);
      expect(promptDue(moves: kPromptFirstAfterReels, shown: 0, lastShownAt: null), isTrue);
      expect(promptDue(moves: 10, shown: 1, lastShownAt: 5), isFalse);
      expect(promptDue(moves: 5 + kPromptEveryReels, shown: 1, lastShownAt: 5), isTrue);
      expect(promptDue(moves: 200, shown: kPromptsPerSession, lastShownAt: 100), isFalse);
    });

    test('remembers what the member dismissed or answered', () async {
      final memory = QueuePromptMemory(await SharedPreferences.getInstance());
      expect(memory.isSettled('water'), isFalse);
      await memory.dismiss('water');
      await memory.markAnswered('goat');
      final again = QueuePromptMemory(await SharedPreferences.getInstance());
      expect(again.isSettled('water'), isTrue);
      expect(again.isSettled('goat'), isTrue);
      expect(again.isSettled('millet'), isFalse);
    });

    testWidgets('appears over the feed, and a dismissed word never returns', (
      tester,
    ) async {
      final recorder = _Recorder();
      final index = ValueNotifier<int>(0);
      Widget app() => ProviderScope(
        overrides: [
          explorePromptWordsProvider.overrideWith((ref) async => [_water]),
          loopAnalyticsProvider.overrideWithValue(recorder),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Stack(
              children: [
                const SizedBox.expand(),
                ExploreWordPrompt(activeIndex: index, active: true, top: 20),
              ],
            ),
          ),
        ),
      );
      await tester.pumpWidget(app());
      for (var page = 1; page < kPromptFirstAfterReels; page++) {
        index.value = page;
        await tester.pump();
      }
      expect(find.byType(WordPromptCard), findsNothing);
      index.value = kPromptFirstAfterReels;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('HELP THE DICTIONARY'), findsOneWidget);
      expect(find.textContaining('water'), findsWidgets);
      expect(find.textContaining('Tatoeba #1234 by CK'), findsOneWidget);
      expect(recorder.events.map((e) => e.$1), contains(LoopEvent.promptImpression));

      // Let the slide-in finish: it starts on the frame the word arrives.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byIcon(Icons.close_rounded));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(WordPromptCard), findsNothing);
      final memory = QueuePromptMemory(await SharedPreferences.getInstance());
      expect(memory.isSettled(_water.id), isTrue);
      expect(recorder.events.map((e) => e.$1), contains(LoopEvent.promptDismiss));
    });
  });

  group('a focused word', () {
    test('the queue answers the word the member came for first', () async {
      final api = FakeWordQueueApi([batchOf(3)]);
      final container = ProviderContainer(
        overrides: [wordQueueApiProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      final sub = container.listen(wordQueueControllerProvider, (_, _) {});
      addTearDown(sub.close);
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(container.read(wordQueueControllerProvider).word?.id, 'id-0');

      container.read(wordQueueControllerProvider.notifier).focus(_water);
      final state = container.read(wordQueueControllerProvider);
      expect(state.word?.id, _water.id);
      expect(state.stage, WordQueueStage.ready);
      // The word that was showing is next, not lost.
      await container
          .read(wordQueueControllerProvider.notifier)
          .skip(WordQueueSkipReason.unknown);
      expect(container.read(wordQueueControllerProvider).word?.id, 'id-0');
    });

    testWidgets(
      'a guest writes the answer, signs in, and it is still there — and not sent',
      (tester) async {
        tester.view.physicalSize = const Size(900, 3400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final api = FakeWordQueueApi([batchOf(2)]);
        final recorder = _Recorder();
        final container = ProviderContainer(
          overrides: [
            firebaseReadyProvider.overrideWithValue(true),
            isSignedInProvider.overrideWith((ref) => ref.watch(_signedInProvider)),
            wordQueueApiProvider.overrideWithValue(api),
            queueLookupProvider.overrideWithValue(
              _FakeLookup(words: {_water.id: _water}),
            ),
            loopAnalyticsProvider.overrideWithValue(recorder),
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
              home: WordQueueScreen(focusWordId: _water.id, origin: 'explore'),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        // The word they came for, answerable before signing in.
        expect(find.text('water'), findsWidgets);
        expect(find.text('Sign in to send'), findsOneWidget);
        expect(find.text('Send and take the next'), findsNothing);
        await tester.enterText(find.byType(TextFormField).first, 'na');
        await tester.pump();
        expect(recorder.events.map((e) => e.$1), contains(LoopEvent.formStart));

        // Signing in (as the sheet would) changes nothing they wrote.
        container.read(_signedInProvider.notifier).set(true);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.text('water'), findsWidgets);
        expect(find.widgetWithText(TextFormField, 'na'), findsOneWidget);
        expect(find.text('Send and take the next'), findsOneWidget);
        // Nothing went anywhere by itself.
        expect(api.submissions, isEmpty);

        // Sending is still the member's own act, and carries where they came from.
        await tester.tap(find.text('Word class'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(find.text('Noun'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(find.text('Dialect or region'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(find.text('Paga').last);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(find.text('Send and take the next'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        expect(api.submissions.single.wordId, _water.id);
        expect(api.submissions.single.origin, 'explore');
        expect(api.submissions.single.creditByName, isTrue);
        expect(api.submissions.single.allowTraining, isFalse);
        expect(find.text('Submitted for review'), findsOneWidget);
      },
    );

    test('a draft sends its provenance and choices, and consent only when given', () {
      const plain = WordTranslationDraft(
        wordId: 'w',
        translations: ['na'],
        partOfSpeech: 'noun',
        dialect: 'Paga',
      );
      expect(plain.toPayload()['origin'], 'queue');
      expect(plain.toPayload()['credit'], 'name');
      expect(plain.toPayload().containsKey('aiTraining'), isFalse);
      expect(plain.toPayload().containsKey('reviseContributionId'), isFalse);
      const chosen = WordTranslationDraft(
        wordId: 'w',
        translations: ['na'],
        partOfSpeech: 'noun',
        dialect: 'Paga',
        origin: 'kawuri',
        creditByName: false,
        allowTraining: true,
        reviseContributionId: 'c1',
      );
      final payload = chosen.toPayload();
      expect(payload['origin'], 'kawuri');
      expect(payload['credit'], 'anonymous');
      expect(payload['aiTraining'], isTrue);
      expect(payload['reviseContributionId'], 'c1');
    });
  });

  group('Kawuri', () {
    test('verified entries become links and unverified words become offers', () {
      final rows = kawuriLookupsFrom({
        'verified': [
          {'entryId': 'collection_1', 'kasem': 'na', 'english': 'water'},
          {'entryId': '', 'kasem': 'x'},
        ],
        'unverified': [
          {'term': 'goat', 'wordQueueId': 'goat-x', 'state': 'waiting-review'},
          {'term': 'cow', 'wordQueueId': 'cow-x', 'state': 'translated'},
        ],
      });
      expect(rows, hasLength(2));
      expect(rows.first, containsPair('kind', 'verified'));
      expect(rows.first, containsPair('entryId', 'collection_1'));
      expect(rows.last, containsPair('kind', 'unverified'));
      expect(rows.last, containsPair('term', 'goat'));
      expect(kawuriLookupsFrom({}), isEmpty);
    });

    test('a reel offers a lesson unless it is an advert', () {
      const published = Reel(
        id: 'pub_s1',
        imageUrl: '',
        label: 'CULTURE',
        title: 'Pottery in Sirigu',
        creator: 'Akua',
        initials: 'A',
        caption: '',
        sound: '',
        credit: '',
      );
      final lesson = reelLesson(published)!;
      expect(lesson.kind, 'post');
      expect(lesson.id, 'pub_s1');
      expect(lesson.title, 'Pottery in Sirigu');
    });
  });

  group('the review desk', () {
    ReviewItem answer({bool aiTraining = false, String kasemExample = ''}) =>
        ReviewItem(
          id: 's1',
          title: 'water',
          status: 'SUBMITTED',
          collectionKind: 'dictionary',
          format: 'Noun',
          dialect: 'Paga',
          body: 'na',
          description: '',
          source: '',
          notes: '',
          authorUid: 'member-1',
          kasemExample: kasemExample,
          englishExample: '',
          publicationPermission: true,
          participantsConsented: true,
          usesThirdPartyMaterial: false,
          wordQueueId: 'water-5ec6a4',
          queueSentence: 'She drank a glass of water.',
          aiTraining: aiTraining,
        );

    test('a queue answer can be sent back for changes', () {
      expect(answer().availableDecisions, contains(ReviewDecision.requestRevision));
    });

    test('options the backend would refuse are refused here first', () {
      expect(AnswerTarget.training.problemFor(answer()), isNotNull);
      expect(AnswerTarget.training.problemFor(answer(aiTraining: true)), isNull);
      expect(AnswerTarget.example.problemFor(answer()), isNotNull);
      expect(
        AnswerTarget.translationPair.problemFor(answer(kasemExample: 'na bam zura mo')),
        isNull,
      );
      expect(AnswerTarget.headword.problemFor(answer()), isNull);
      expect(AnswerTarget.fromWire('translation-pair'), AnswerTarget.translationPair);
      expect(AnswerTarget.fromWire('nonsense'), AnswerTarget.headword);
    });
  });

  group('your submissions', () {
    CollectionContributionRecord record(String status, {String publishedAs = '', int revisions = 0}) =>
        CollectionContributionRecord(
          id: 'c1',
          kind: CollectionKind.dictionary,
          title: 'water',
          status: status,
          publicationPermission: true,
          wordQueueId: 'water-5ec6a4',
          publishedAs: publishedAs,
          revisionCount: revisions,
        );

    test('an answer sent back can be corrected', () {
      expect(record('needs_revision').canRevise, isTrue);
      expect(record('submitted').canRevise, isFalse);
    });

    test('the member is told what their answer became', () {
      expect(queueAnswerOutcome(record('approved', publishedAs: 'expression')), 'Approved as an expression.');
      expect(queueAnswerOutcome(record('published', publishedAs: 'translation-pair')), 'Approved as a translation pair.');
      expect(queueAnswerOutcome(record('submitted', revisions: 1)), 'Corrected and back with the reviewers.');
      expect(queueAnswerOutcome(record('approved')), isNull);
    });
  });
}
