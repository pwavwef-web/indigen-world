import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_tasks.dart';

/// Where a learner is when they ask Kawuri something from the Learn tab.
///
/// Carried into the conversation as options on each message rather than typed
/// into the message itself, so the member's own words stay what they said, and
/// the grounding travels with every turn of the chat.
///
/// Everything in here is *verified* content — the published course and the
/// published dictionary — and [routedBlock] says so to the model in as many
/// words, together with the instruction that matters most on this platform:
/// Kasem that is not in these records is not to be made up.
@immutable
class KawuriLearningContext {
  const KawuriLearningContext({
    required this.courseName,
    this.unitTitle = '',
    this.lessonTitle = '',
    this.lessonItems = const [],
    this.word = '',
    this.wordMeaning = '',
    this.wordPartOfSpeech = '',
    this.wordExample = '',
    this.wordExampleTranslation = '',
    this.wordDialect = '',
    this.wordSource = '',
  });

  final String courseName;
  final String unitTitle;
  final String lessonTitle;

  /// The current lesson's questions as "prompt → correct answer" lines, from
  /// the published course.
  final List<String> lessonItems;

  /// A published dictionary entry the learner is looking at.
  final String word;
  final String wordMeaning;
  final String wordPartOfSpeech;
  final String wordExample;
  final String wordExampleTranslation;
  final String wordDialect;
  final String wordSource;

  bool get hasWord => word.trim().isNotEmpty;

  static const _prefix = 'learn.';

  /// As message options. Keys are namespaced so they can never collide with a
  /// tool's own options.
  Map<String, String> toOptions() => {
    '${_prefix}course': courseName,
    if (unitTitle.isNotEmpty) '${_prefix}unit': unitTitle,
    if (lessonTitle.isNotEmpty) '${_prefix}lesson': lessonTitle,
    if (lessonItems.isNotEmpty) '${_prefix}items': lessonItems.take(12).join('\n'),
    if (hasWord) '${_prefix}word': word,
    if (wordMeaning.isNotEmpty) '${_prefix}meaning': wordMeaning,
    if (wordPartOfSpeech.isNotEmpty) '${_prefix}pos': wordPartOfSpeech,
    if (wordExample.isNotEmpty) '${_prefix}example': wordExample,
    if (wordExampleTranslation.isNotEmpty)
      '${_prefix}exampleTranslation': wordExampleTranslation,
    if (wordDialect.isNotEmpty) '${_prefix}dialect': wordDialect,
    if (wordSource.isNotEmpty) '${_prefix}source': wordSource,
  };

  static KawuriLearningContext? fromOptions(Map<String, String> options) {
    final course = options['${_prefix}course'];
    if (course == null || course.isEmpty) return null;
    String read(String key) => options['$_prefix$key'] ?? '';
    final items = read('items');
    return KawuriLearningContext(
      courseName: course,
      unitTitle: read('unit'),
      lessonTitle: read('lesson'),
      lessonItems: items.isEmpty ? const [] : items.split('\n'),
      word: read('word'),
      wordMeaning: read('meaning'),
      wordPartOfSpeech: read('pos'),
      wordExample: read('example'),
      wordExampleTranslation: read('exampleTranslation'),
      wordDialect: read('dialect'),
      wordSource: read('source'),
    );
  }

  /// The grounding block appended to what the server receives.
  String routedBlock() {
    final lines = <String>[
      '',
      '--- LEARNING CONTEXT (from the Indigen World Learn tab) ---',
      'Course: $courseName',
      if (unitTitle.isNotEmpty) 'Unit: $unitTitle',
      if (lessonTitle.isNotEmpty) 'Lesson: $lessonTitle',
      if (lessonItems.isNotEmpty) ...[
        'VERIFIED COURSE CONTENT (published lesson, prompt → answer):',
        ...lessonItems.take(12).map((item) => '- $item'),
      ],
      if (hasWord) ...[
        'VERIFIED DICTIONARY RECORD (published Indigen World dictionary):',
        '- Kasem: $word',
        if (wordMeaning.isNotEmpty) '- Meaning: $wordMeaning',
        if (wordPartOfSpeech.isNotEmpty) '- Part of speech: $wordPartOfSpeech',
        if (wordExample.isNotEmpty)
          '- Example: $wordExample${wordExampleTranslation.isEmpty ? '' : ' — $wordExampleTranslation'}',
        if (wordDialect.isNotEmpty) '- Dialect/source set: $wordDialect',
        if (wordSource.isNotEmpty) '- Source: $wordSource',
      ],
      'Rules for this answer: use the verified records above first and say that they come from the published course or dictionary. '
          'Do not invent Kasem words, spellings, translations or example sentences that are not in these records or in your dictionary lookup; '
          'when something is not attested, say plainly that it is not verified and suggest asking the community. '
          'Label any guess as unverified. Never present a correction to a verified record as fact — suggest it for community review instead.',
    ];
    return lines.join('\n');
  }
}

/// The ready-made requests offered from the Learn tab.
enum KawuriLearningAction {
  explainWord(Icons.menu_book_rounded, 'Explain this word'),
  example(Icons.format_quote_rounded, 'Give me an example'),
  quiz(Icons.quiz_rounded, 'Quiz me'),
  practise(Icons.record_voice_over_rounded, 'Help me practise');

  const KawuriLearningAction(this.icon, this.label);
  final IconData icon;
  final String label;

  KawuriTaskType get mode => switch (this) {
    explainWord || example => KawuriTaskType.chat,
    quiz || practise => KawuriTaskType.languagePractice,
  };

  bool offeredFor(KawuriLearningContext context) => switch (this) {
    explainWord || example => context.hasWord,
    quiz => context.lessonItems.isNotEmpty || context.hasWord,
    practise => true,
  };

  /// What the member's message says. Short, in their voice; the grounding
  /// travels in the options.
  String promptFor(KawuriLearningContext context) => switch (this) {
    explainWord => 'Explain the Kasem word "${context.word}".',
    example =>
      'Give me an example of "${context.word}" in use. Only use a verified example, and tell me if there is none.',
    quiz => context.lessonTitle.isNotEmpty
        ? 'Quiz me on "${context.lessonTitle}", one question at a time.'
        : 'Quiz me on "${context.word}", one question at a time.',
    practise => context.lessonTitle.isNotEmpty
        ? 'Help me practise "${context.lessonTitle}".'
        : 'Help me practise ${context.courseName}.',
  };
}

/// The card at the top of Kawuri's home when it was opened from Learn.
class KawuriLearningCard extends StatelessWidget {
  const KawuriLearningCard({
    required this.learning,
    required this.onAction,
    super.key,
  });

  final KawuriLearningContext learning;
  final ValueChanged<KawuriLearningAction> onAction;

  @override
  Widget build(BuildContext context) {
    final where = [
      learning.courseName,
      if (learning.unitTitle.isNotEmpty) learning.unitTitle,
      if (learning.lessonTitle.isNotEmpty) learning.lessonTitle,
    ].join(' · ');
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 18),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: context.brand.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.brand.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.school_rounded, color: context.brand.nightAccent, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  where,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                  ),
                ),
              ),
            ],
          ),
          if (learning.hasWord) ...[
            const SizedBox(height: 6),
            Text(
              '${learning.word}${learning.wordMeaning.isEmpty ? '' : ' — ${learning.wordMeaning}'}',
              style: TextStyle(color: context.brand.ink, fontSize: 13),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            'Kawuri answers from the published course and dictionary first, and says when something is not verified.',
            style: TextStyle(color: context.brand.mutedInk, fontSize: 11.5),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final action in KawuriLearningAction.values)
                if (action.offeredFor(learning))
                  ActionChip(
                    avatar: Icon(action.icon, size: 16, color: context.brand.nightAccent),
                    label: Text(action.label),
                    onPressed: () => onAction(action),
                    backgroundColor: context.brand.accentPlate,
                    side: BorderSide(color: context.brand.border),
                    labelStyle: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                    ),
                  ),
            ],
          ),
        ],
      ),
    );
  }
}
