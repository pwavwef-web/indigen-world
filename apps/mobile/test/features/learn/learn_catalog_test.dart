// The course outline, the practice decks and Kawuri's learning context —
// the rules under the dashboard, tested without a widget.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_learning_context.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:indigen_world_mobile/features/learn/learn_catalog.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_decks.dart';

const _question = LessonQuestion(prompt: 'p', answers: ['a', 'b'], correctAnswer: 0);

Lesson _lesson(String id, int unit, int order, {String course = 'kasem'}) => Lesson(
  id: id,
  title: 'Lesson $id',
  unitTitle: 'Unit $unit title',
  unitOrder: unit,
  order: order,
  courseId: course,
  questions: const [_question],
);

DictionaryEntry _entry(
  String id,
  String headword,
  String meaning, {
  String audio = '',
  List<String> translations = const [],
}) => DictionaryEntry(
  id: id,
  headword: headword,
  translation: meaning,
  translations: translations,
  partOfSpeech: '',
  dialect: '',
  pronunciation: '',
  example: '',
  exampleTranslation: '',
  attribution: '',
  audioUrl: audio,
);

void main() {
  setUp(() => learnClock = () => DateTime(2026, 9, 16, 12));
  tearDown(() => learnClock = DateTime.now);

  group('the course outline', () {
    final lessons = [
      _lesson('1a', 1, 1),
      _lesson('1b', 1, 2),
      _lesson('2a', 2, 3),
      _lesson('other', 1, 1, course: 'dagbani'),
    ];
    const units = [
      LearnUnit(id: 'u1', order: 1, title: 'Start a conversation'),
      LearnUnit(id: 'u2', order: 2, title: 'Family & people'),
      LearnUnit(id: 'u3', order: 3, title: 'Food & home'),
    ];

    CourseOutline outline(LearnProgress progress) => buildCourseOutline(
      course: kasemCourse,
      units: units,
      lessons: lessons,
      progress: progress,
    );

    test('a new learner starts at the first lesson; later units are locked', () {
      final start = outline(const LearnProgress());
      expect(start.path.map((lesson) => lesson.id), ['1a', '1b', '2a'],
          reason: 'another course’s lessons are not part of this one');
      expect(start.nextLesson!.id, '1a');
      expect(start.units.map((unit) => unit.state), [
        UnitState.available,
        UnitState.locked,
        UnitState.inPreparation,
      ]);
      expect(start.units[1].blockedBy!.unit.title, 'Start a conversation');
      expect(start.units[1].blockedBy!.remaining, 2);
      expect(start.upcoming.map((unit) => unit.unit.title), ['Family & people', 'Food & home']);
    });

    test('progress moves units through in progress to completed', () {
      final midway = outline(const LearnProgress(completedLessons: {'1a'}));
      expect(midway.units[0].state, UnitState.inProgress);
      final started = outline(const LearnProgress(lessonSteps: {'1a': 1}));
      expect(started.units[0].state, UnitState.inProgress, reason: 'a question answered is a start');
      final unitDone = outline(const LearnProgress(completedLessons: {'1a', '1b'}));
      expect(unitDone.units[0].state, UnitState.completed);
      expect(unitDone.units[1].state, UnitState.available);
      expect(unitDone.currentUnit!.unit.title, 'Family & people');
    });

    test('a finished course has no next lesson, and a unit with none is in preparation', () {
      final done = outline(const LearnProgress(completedLessons: {'1a', '1b', '2a'}));
      expect(done.allComplete, isTrue);
      expect(done.nextLesson, isNull);
      expect(done.units[2].state, UnitState.inPreparation);
      expect(done.units[2].opensLessons, isFalse);
    });

    test('published lessons name their unit over the bundled plan, and keep its picture', () {
      final published = buildCourseOutline(
        course: kasemCourse,
        units: bundledUnits,
        lessons: [
          const Lesson(
            id: 'x',
            title: 'Greetings',
            unitTitle: 'First words',
            questions: [_question],
          ),
        ],
        progress: const LearnProgress(),
      );
      expect(published.units.first.unit.title, 'First words');
      expect(published.units.first.unit.assetImage, 'assets/learn/hero-greeting.webp');
      expect(published.units.skip(1).every((unit) => unit.state == UnitState.inPreparation), isTrue);
    });
  });

  group('practice decks', () {
    final entries = [
      _entry('e1', 'nabiu', 'goat', audio: 'https://a/1'),
      _entry('e2', 'naga', 'cow', audio: 'https://a/2'),
      _entry('e3', 'kukuri', 'dog', audio: 'https://a/3'),
      _entry('e4', 'zoŋ', 'guinea fowl', audio: 'https://a/4'),
      _entry('e5', 'a whole sentence that is too long to review', 'long'),
      _entry('e6', 'baga', ''),
    ];

    test('sentences and entries with no meaning are not flashcards', () {
      expect(isPractisable(entries[0]), isTrue);
      expect(isPractisable(entries[4]), isFalse);
      expect(isPractisable(entries[5]), isFalse);
    });

    test('due words come first, then saved words, then new ones', () {
      const progress = LearnProgress(
        reviewCards: {
          'e2': ReviewCard(box: 1, dueDay: '2026-09-15', lastDay: '2026-09-14'),
          'e3': ReviewCard(box: 3, dueDay: '2026-09-30', lastDay: '2026-09-14'),
        },
      );
      final deck = buildReviewDeck(
        entries: entries,
        progress: progress,
        savedIds: {'e4'},
        size: 10,
        newLimit: 2,
      );
      expect(deck.first.id, 'e2');
      expect(deck[1].id, 'e4');
      expect(deck.map((entry) => entry.id), isNot(contains('e3')), reason: 'not due yet');
      expect(deck.length, 3);
    });

    test('a listening question has four real, distinct meanings including the answer', () {
      final pool = listenableEntries(entries);
      expect(pool.length, 4);
      final options = listenOptions(answer: pool[0], pool: pool, round: 2);
      expect(options.length, 4);
      expect(options.toSet().length, 4);
      expect(options, contains('goat'));
    });

    test('an English answer matches the dictionary meaning, and only that', () {
      final goat = _entry('g', 'nabiu', 'goat', translations: ['she-goat']);
      expect(transcriptMatchesMeaning('A goat.', goat), isTrue);
      expect(transcriptMatchesMeaning('it means she-goat', goat), isTrue);
      expect(transcriptMatchesMeaning('boat', goat), isFalse);
      expect(transcriptMatchesMeaning('', goat), isFalse);
    });
  });

  group('Kawuri’s learning context', () {
    const context = KawuriLearningContext(
      courseName: 'Kasem',
      unitTitle: 'Start a conversation',
      lessonTitle: 'Say hello',
      lessonItems: ['Choose the greeting → De zaanem'],
      word: 'nabiu',
      wordMeaning: 'goat',
      wordSource: 'Community',
    );

    test('travels as message options and comes back whole', () {
      final back = KawuriLearningContext.fromOptions(context.toOptions())!;
      expect(back.lessonTitle, 'Say hello');
      expect(back.lessonItems, ['Choose the greeting → De zaanem']);
      expect(back.word, 'nabiu');
      expect(KawuriLearningContext.fromOptions(const {'direction': 'x'}), isNull);
    });

    test('marks verified content and forbids inventing Kasem', () {
      final block = context.routedBlock();
      expect(block, contains('VERIFIED COURSE CONTENT'));
      expect(block, contains('VERIFIED DICTIONARY RECORD'));
      expect(block, contains('- Kasem: nabiu'));
      expect(block, contains('Do not invent Kasem words'));
      expect(block, contains('not verified'));
      expect(block, contains('suggest it for community review'));
    });

    test('offers only the actions its context can support', () {
      const noWord = KawuriLearningContext(courseName: 'Kasem', lessonTitle: 'Say hello');
      expect(KawuriLearningAction.explainWord.offeredFor(noWord), isFalse);
      expect(KawuriLearningAction.practise.offeredFor(noWord), isTrue);
      expect(KawuriLearningAction.explainWord.offeredFor(context), isTrue);
      expect(KawuriLearningAction.quiz.promptFor(context), contains('Say hello'));
    });
  });
}
