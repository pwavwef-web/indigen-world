// The Dart half of homograph numbering.
//
// `services/functions/src/kasem-homographs.ts` is the rule and this mirrors
// it, the same way `translation_parser.dart` mirrors `parseTranslations`. The
// number is assigned once on the server and stored; nothing here decides it.
// What this owns is the half that is derived per render — whether a number is
// shown at all, and what it looks like when it is.
//
// A drift between the two would not corrupt data. It would do something
// quieter: the app drawing a superscript the backend did not intend, or
// leaving one off an entry Kawuri is calling `mo²` in the same session.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/kasem_homographs.dart';

void main() {
  group('superscript digits', () {
    test('are the real characters, not arithmetic on a code point', () {
      // The obvious implementation is 0x2070 + digit, and it is wrong for
      // exactly one, two and three: U+2071 is a modifier letter I and U+2072
      // is a reserved slot.
      expect(superscript(1), '¹');
      expect(superscript(2), '²');
      expect(superscript(3), '³');
      expect(superscript(4), '⁴');
      expect(superscript(9), '⁹');
    });

    test('compose past nine rather than falling over', () {
      expect(superscript(10), '¹⁰');
      expect(superscript(12), '¹²');
      expect(superscript(99), '⁹⁹');
    });

    test('refuse nonsense rather than rendering it', () {
      expect(superscript(-1), '');
    });
  });

  group('whether a number is drawn at all', () {
    test('a word alone under its spelling shows none', () {
      // A solitary `mo¹` promises a `mo²` that does not exist, and a reader
      // who goes looking for it has been misled by a footnote.
      expect(shouldNumber(siblingCount: 1, homographIndex: 1), isFalse);
      final display = homographDisplay('mo', homographIndex: 1, siblingCount: 1);
      expect(display.text, 'mo');
      expect(display.numbered, isFalse);
    });

    test('the first entry starts showing its number when a second arrives', () {
      // Nothing rewrote the document. The index was always 1; only the sibling
      // count changed, and that is derived per render. This is the whole
      // reason the design is half-stored and half-derived.
      expect(
        homographDisplay('mo', homographIndex: 1, siblingCount: 1).text,
        'mo',
      );
      expect(
        homographDisplay('mo', homographIndex: 1, siblingCount: 2).text,
        'mo¹',
      );
    });

    test('an unnumbered legacy row never draws a number', () {
      // A row `backfill-homographs.mjs` has not reached. Rendering `mo⁰` or a
      // bare superscript would be worse than the plain headword.
      expect(shouldNumber(siblingCount: 3, homographIndex: 0), isFalse);
      expect(
        homographDisplay('mo', homographIndex: 0, siblingCount: 3).text,
        'mo',
      );
    });
  });

  group('what a screen reader says', () {
    test('a numbered headword reads unambiguously', () {
      // A superscript two is announced as anything from "two" to nothing at
      // all depending on the reader, and "mo two" is indistinguishable from a
      // quantity.
      final display = homographDisplay('mo', homographIndex: 2, siblingCount: 2);
      expect(display.text, 'mo²');
      expect(display.spoken, 'mo, sense 2');
    });

    test('an unnumbered headword is spoken as itself, with nothing added', () {
      final display = homographDisplay('nia', homographIndex: 1, siblingCount: 1);
      expect(display.spoken, 'nia');
    });
  });

  group('grouping', () {
    test('folds case and spacing', () {
      final counts = countByHeadword(['mo', 'Mo', ' mo ', 'kana', '']);
      expect(counts['mo'], 3);
      expect(counts['kana'], 1);
      expect(counts.containsKey(''), isFalse);
    });

    test('never folds a diacritic', () {
      // Kasem is tonal and a mark is frequently the only thing separating two
      // words. Folding here would merge exactly the pairs this module exists
      // to keep apart, and it would do it silently.
      final counts = countByHeadword(['dɩ', 'di']);
      expect(counts['dɩ'], 1);
      expect(counts['di'], 1);
    });
  });

  test('the worked example: two senses of mo', () {
    // The case that prompted all of this. `mo` after a noun and `mo` marking
    // focus are, on the reading currently being checked with speakers, two
    // words rather than two meanings of one.
    const headword = 'mo';
    final counts = countByHeadword(const [headword, headword]);
    final siblings = counts[headwordKey(headword)]!;

    expect(siblings, 2);
    expect(
      homographDisplay(headword, homographIndex: 1, siblingCount: siblings).text,
      'mo¹',
    );
    expect(
      homographDisplay(headword, homographIndex: 2, siblingCount: siblings).text,
      'mo²',
    );
  });
}
