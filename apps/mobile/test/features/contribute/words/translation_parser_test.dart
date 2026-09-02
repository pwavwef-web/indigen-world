// The rule that decides what a dictionary entry actually contains.
//
// This mirrors `parseTranslations` in services/functions/src/lexical-kinds.ts,
// and the mirroring is the whole reason it is worth testing on the phone at
// all: the member watches chips appear under the field as they type, and if
// this function and the server's disagree then the chips are a lie — five
// shown, four stored, and nothing anywhere saying which one went.
//
// Every case below is a case the server's own tests cover, deliberately, so a
// change on one side that is not made on the other fails on both.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/translation_parser.dart';

void main() {
  group('parseTranslations', () {
    test('a single answer is one entry', () {
      expect(parseTranslations('kʋm'), ['kʋm']);
    });

    test('commas split, and the spaces around them go', () {
      expect(parseTranslations('greeting,  hello , good morning'), [
        'greeting',
        'hello',
        'good morning',
      ]);
    });

    test('slashes split too, because that is what people type', () {
      expect(parseTranslations('water / rain water'), ['water', 'rain water']);
    });

    test('the two mix freely in one answer', () {
      expect(parseTranslations('a, b / c,d'), ['a', 'b', 'c', 'd']);
    });

    test('a line break is a separator, not part of a word', () {
      // Never advertised in the helper text and always honoured: a phone
      // keyboard's return key is a separator in everybody's head, and treating
      // it as a character would store an entry with an invisible break in it.
      expect(parseTranslations('one\ntwo\r\nthree'), ['one', 'two', 'three']);
    });

    test('empties between separators are dropped, not stored', () {
      expect(parseTranslations(',,a,,/, ,b,'), ['a', 'b']);
      expect(parseTranslations('  '), isEmpty);
      expect(parseTranslations(''), isEmpty);
    });

    test('runs of whitespace inside an answer collapse', () {
      expect(parseTranslations('good    morning'), ['good morning']);
    });

    test('duplicates go, case-insensitively, and the first spelling stays', () {
      // The first spelling is the one the member reached for without thinking,
      // which is the better evidence about the language — and keeping the
      // first is what makes the function order-stable, so re-parsing stored
      // text changes nothing.
      expect(parseTranslations('Hello, hello, HELLO'), ['Hello']);
      expect(parseTranslations('a, B, b, A, c'), ['a', 'B', 'c']);
    });

    test('re-parsing its own output is a no-op', () {
      const raw = 'greeting, hello, good morning';
      final once = parseTranslations(raw);
      expect(parseTranslations(once.join(', ')), once);
    });

    test('the list is capped at eight', () {
      final many = List.generate(20, (index) => 'w$index').join(', ');
      final parsed = parseTranslations(many);
      expect(parsed, hasLength(kMaxTranslations));
      expect(parsed.first, 'w0');
      expect(parsed.last, 'w7');
    });

    test('the cap applies after de-duplication, not before', () {
      // Twelve typed, four of them repeats: eight distinct answers survive
      // rather than the first eight strings.
      const raw = 'a, a, b, b, c, c, d, e, f, g, h, i';
      expect(parseTranslations(raw), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    });

    test('an over-long answer is truncated, not thrown away', () {
      // A 400-character "translation" is a sentence pasted into the wrong box.
      // Failing the whole submission over it would cost a member on a metered
      // connection the good translations sitting beside it.
      final long = 'x' * 400;
      final parsed = parseTranslations('$long, short');
      expect(parsed, hasLength(2));
      expect(parsed.first, hasLength(kMaxTranslationLength));
      expect(parsed.last, 'short');
    });

    test('the result cannot be mutated by a caller', () {
      final parsed = parseTranslations('a, b');
      expect(() => parsed.add('c'), throwsUnsupportedError);
    });
  });

  group('distinctTranslationCount', () {
    test('counts past the cap so the field can say what was dropped', () {
      const raw = 'a, b, c, d, e, f, g, h, i, j';
      expect(parseTranslations(raw), hasLength(8));
      expect(distinctTranslationCount(raw), 10);
    });

    test('still ignores repeats and empties', () {
      expect(distinctTranslationCount('a, A, , b //'), 2);
    });
  });

  group('hasUsableTranslation', () {
    test('is false for anything that would store nothing', () {
      expect(hasUsableTranslation(''), isFalse);
      expect(hasUsableTranslation('   '), isFalse);
      expect(hasUsableTranslation(' , / , '), isFalse);
    });

    test('is true as soon as one entry survives', () {
      expect(hasUsableTranslation(' , kʋm'), isTrue);
    });
  });
}
