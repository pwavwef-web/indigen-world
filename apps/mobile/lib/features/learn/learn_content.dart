import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// One question inside a lesson.
///
/// A lesson used to be a single multiple-choice card, which made "finish the
/// lesson" and "answer one question right" the same event. Splitting them is
/// what lets a lesson teach something in more than one step, and what lets a
/// score mean anything.
@immutable
class LessonQuestion {
  const LessonQuestion({
    required this.prompt,
    required this.answers,
    required this.correctAnswer,
    this.support = '',
    this.explanation = '',
  });

  final String prompt;

  /// The line under the prompt: what the member is being asked to do.
  final String support;

  final List<String> answers;

  /// Index into [answers]. Out-of-range values are treated as "no correct
  /// answer configured" by [isValid] rather than crashing a lesson.
  final int correctAnswer;

  /// Shown after the answer is checked, right or wrong.
  final String explanation;

  bool get isValid =>
      prompt.trim().isNotEmpty &&
      answers.length >= 2 &&
      correctAnswer >= 0 &&
      correctAnswer < answers.length;

  static LessonQuestion fromMap(Map<String, Object?> data) => LessonQuestion(
    prompt: _text(data['prompt']),
    support: _text(data['support']),
    answers: (data['answers'] as List<Object?>? ?? const [])
        .map(_text)
        .where((answer) => answer.isNotEmpty)
        .toList(growable: false),
    correctAnswer: _int(data['correctAnswer']),
    explanation: _text(data['explanation']),
  );

  Map<String, Object?> toMap() => {
    'prompt': prompt,
    'support': support,
    'answers': answers,
    'correctAnswer': correctAnswer,
    'explanation': explanation,
  };
}

/// A lesson on the Kasem path, with everything needed to draw its node.
@immutable
class Lesson {
  const Lesson({
    required this.id,
    required this.title,
    required this.questions,
    this.unitTitle = 'Unit 1',
    this.unitSubtitle = '',
    this.unitOrder = 1,
    this.order = 0,
    this.minutes = 3,
    this.xp = 15,
    this.iconName = 'school',
  });

  /// Stable slug progress is remembered by. Reordering the path must never
  /// hand somebody credit for the lesson that moved into a position.
  final String id;

  final String title;
  final List<LessonQuestion> questions;
  final String unitTitle;
  final String unitSubtitle;

  /// Which unit this belongs to, and where it sits inside it.
  final int unitOrder;
  final int order;

  final int minutes;
  final int xp;

  /// Named rather than an [IconData] so a lesson can be configured from the
  /// admin console without shipping a build. Unknown names fall back rather
  /// than break the path.
  final String iconName;

  IconData get icon => lessonIcons[iconName] ?? Icons.school_rounded;

  bool get isValid =>
      id.trim().isNotEmpty &&
      title.trim().isNotEmpty &&
      questions.isNotEmpty &&
      questions.every((question) => question.isValid);

  static Lesson fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    return Lesson(
      id: doc.id,
      title: _text(data['title'], fallback: 'Lesson'),
      unitTitle: _text(data['unitTitle'], fallback: 'Unit 1'),
      unitSubtitle: _text(data['unitSubtitle']),
      unitOrder: _int(data['unitOrder'], fallback: 1),
      order: _int(data['order']),
      minutes: _int(data['minutes'], fallback: 3),
      xp: _int(data['xp'], fallback: 15),
      iconName: _text(data['iconName'], fallback: 'school'),
      questions: (data['questions'] as List<Object?>? ?? const [])
          .whereType<Map<Object?, Object?>>()
          .map((raw) => LessonQuestion.fromMap(Map<String, Object?>.from(raw)))
          .where((question) => question.isValid)
          .toList(growable: false),
    );
  }
}

/// The icons a lesson may be given, by the name stored on the document.
const lessonIcons = <String, IconData>{
  'wave': Icons.waving_hand_rounded,
  'headphones': Icons.headphones_rounded,
  'puzzle': Icons.extension_rounded,
  'chat': Icons.forum_rounded,
  'school': Icons.school_rounded,
  'book': Icons.menu_book_rounded,
  'music': Icons.music_note_rounded,
  'family': Icons.family_restroom_rounded,
  'market': Icons.storefront_rounded,
  'map': Icons.map_rounded,
  'sun': Icons.wb_sunny_rounded,
  'star': Icons.star_rounded,
};

/// Reads the published lesson path.
class LearnContentRepository {
  const LearnContentRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<Lesson>> watchLessons() => _firestore
      .collection('learnLessons')
      .where('published', isEqualTo: true)
      .orderBy('order')
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map(Lesson.fromDoc)
            // A lesson missing its questions is not a lesson. Dropping it is
            // better than putting an unanswerable card in front of somebody
            // and then refusing to let them past it.
            .where((lesson) => lesson.isValid)
            .toList(growable: false),
      );
}

final learnContentRepositoryProvider = Provider<LearnContentRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return LearnContentRepository(FirebaseFirestore.instance);
});

/// The lesson path: what the project has published, or the bundled preview
/// when nothing is published yet or the device has never been online.
///
/// The fallback is not a nicety. Learning is the one tab that works with no
/// account, and a first launch on a bad connection would otherwise open on an
/// empty path — the worst possible first impression of a language course.
final lessonPathProvider = StreamProvider<List<Lesson>>((ref) {
  final repository = ref.watch(learnContentRepositoryProvider);
  if (repository == null) return Stream.value(bundledLessons);
  return repository.watchLessons().map(
    (lessons) => lessons.isEmpty ? bundledLessons : lessons,
  );
});

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  if (value is num) return value.toString();
  return fallback;
}

int _int(Object? value, {int fallback = 0}) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? fallback;
  return fallback;
}

/// The path shipped inside the app, used until the project publishes its own.
///
/// Still labelled a preview in the UI: these phrases have not been through
/// community language validation, and saying so is the difference between a
/// demo and a claim about Kasem.
const bundledLessons = <Lesson>[
  Lesson(
    id: 'unit1-say-hello',
    title: 'Say hello',
    iconName: 'wave',
    minutes: 2,
    xp: 15,
    order: 1,
    unitTitle: 'Start a conversation',
    unitSubtitle: 'Greetings, introductions and everyday courtesy',
    questions: [
      LessonQuestion(
        prompt: 'Choose the greeting',
        support: 'Which phrase would you use to welcome someone?',
        answers: ['De zaanem', 'Ko gara', 'Mbesem'],
        correctAnswer: 0,
        explanation:
            '“De zaanem” is used here as the welcome phrase in this preview.',
      ),
    ],
  ),
  Lesson(
    id: 'unit1-listen-and-choose',
    title: 'Listen & choose',
    iconName: 'headphones',
    minutes: 3,
    xp: 15,
    order: 2,
    unitTitle: 'Start a conversation',
    unitSubtitle: 'Greetings, introductions and everyday courtesy',
    questions: [
      LessonQuestion(
        prompt: 'How are things?',
        support: 'Pick the response shown in the community preview.',
        answers: ['Ko gara', 'De zaanem', 'Afi'],
        correctAnswer: 0,
        explanation:
            '“Ko gara” is the intended response for this practice card.',
      ),
    ],
  ),
  Lesson(
    id: 'unit1-build-a-phrase',
    title: 'Build a phrase',
    iconName: 'puzzle',
    minutes: 3,
    xp: 15,
    order: 3,
    unitTitle: 'Start a conversation',
    unitSubtitle: 'Greetings, introductions and everyday courtesy',
    questions: [
      LessonQuestion(
        prompt: 'Complete the exchange',
        support: 'Choose the phrase that keeps the greeting going.',
        answers: ['Mbesem', 'De N lei', 'Naba'],
        correctAnswer: 1,
        explanation: 'The lesson pairs “De N lei” with the greeting exchange.',
      ),
    ],
  ),
  Lesson(
    id: 'unit1-conversation-check',
    title: 'Conversation check',
    iconName: 'chat',
    minutes: 4,
    xp: 15,
    order: 4,
    unitTitle: 'Start a conversation',
    unitSubtitle: 'Greetings, introductions and everyday courtesy',
    questions: [
      LessonQuestion(
        prompt: 'Finish the mini dialogue',
        support: 'A friend says “De zaanem.” What do you choose?',
        answers: ['Ko gara', 'Good night', 'Thank you'],
        correctAnswer: 0,
        explanation: 'You completed your first practice conversation.',
      ),
    ],
  ),
];
