// Evidence queue parsing and status compatibility.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/validate/data/grammar_note_queue.dart';

/// One example in the shape `submitGrammarNote` stores it.
Map<String, Object?> _example({
  String kasem = 'kana mo jege ne',
  String english = 'i am hungry',
  String literal = 'hunger PART has me',
  List<Object?>? gloss,
}) => {
  'kasem': kasem,
  'english': english,
  'literal': literal,
  'gloss':
      gloss ??
      const [
        {'kasem': 'kana', 'english': 'hunger'},
        {'kasem': 'mo', 'english': 'PART'},
        {'kasem': 'jege', 'english': 'has'},
        {'kasem': 'ne', 'english': 'me'},
      ],
  'note': 'The feeling is the subject.',
  'dialect': 'Navrongo',
  'constructions': const ['experiencer', 'pronoun'],
};

void main() {
  group('the wire contract with the backend', () {
    test('the queues filter on the statuses the callable actually writes', () {
      // `noteDocument` writes 'submitted'; `decideGrammarNote` writes
      // 'confirmed' or 'rejected'. A pill filtering on anything else shows an
      // empty queue that looks exactly like an empty desk.
      expect(kGrammarNoteQueues.map((queue) => queue.$1).toList(), [
        'submitted',
        'confirmed',
        'disputed',
        'reviewed',
        'needs-permission',
        'withdrawn',
        'rejected',
      ]);
    });
  });

  group('reading an example', () {
    test('the gloss the server aligned is what the desk renders', () {
      final example = GrammarExample.fromMap(_example())!;

      expect(example.gloss.length, 4);
      expect(example.gloss.first.kasem, 'kana');
      expect(example.gloss.first.english, 'hunger');
      expect(example.gloss.last.kasem, 'ne');
      expect(example.gloss.last.english, 'me');
      // Kept beside the columns rather than replaced by them: the columns are
      // for checking, this is what the person wrote.
      expect(example.literal, 'hunger PART has me');
      expect(example.constructions, ['experiencer', 'pronoun']);
      expect(example.dialect, 'Navrongo');
    });

    test('a row with only one side is not an example', () {
      // Matches `corpusRecordFrom` on the server. Half a translation cannot be
      // checked by a reviewer and must not reach the corpus.
      expect(GrammarExample.fromMap({..._example(), 'english': ''}), isNull);
      expect(GrammarExample.fromMap({..._example(), 'kasem': ''}), isNull);
      expect(GrammarExample.fromMap(null), isNull);
      expect(GrammarExample.fromMap('kana mo jege ne'), isNull);
    });

    test('a row stored before gloss was derived still opens', () {
      // The review screen falls back to the plain word-for-word line when the
      // columns are missing. That fallback has to have something to fall back
      // to, so the parser must not refuse the row.
      final example = GrammarExample.fromMap({..._example(), 'gloss': null})!;
      expect(example.gloss, isEmpty);
      expect(example.literal, 'hunger PART has me');
    });

    test('a malformed gloss cell is dropped, not rendered blank', () {
      final example = GrammarExample.fromMap(
        _example(
          gloss: const [
            {'kasem': 'kana', 'english': 'hunger'},
            {'english': 'a'},
            'mo',
            {'kasem': 'jege', 'english': 'has'},
          ],
        ),
      )!;
      // A cell with no Kasem side has nothing to stand under. Two survive.
      expect(example.gloss.map((pair) => pair.kasem), ['kana', 'jege']);
    });

    test('a gloss cell with no English is kept so the gap is visible', () {
      // The reviewer needs to SEE that a word was left unglossed. Dropping the
      // cell would silently close the gap and shift every column after it.
      final example = GrammarExample.fromMap(
        _example(
          gloss: const [
            {'kasem': 'kana', 'english': 'hunger'},
            {'kasem': 'mo', 'english': ''},
          ],
        ),
      )!;
      expect(example.gloss.length, 2);
      expect(example.gloss.last.kasem, 'mo');
      expect(example.gloss.last.english, isEmpty);
    });
  });
}
