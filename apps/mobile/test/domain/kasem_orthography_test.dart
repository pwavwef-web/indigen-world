// The Kasem alphabet, and the two things a dictionary has to do with it.
//
// The number that motivates this file: 785 of the 1200 published entries carry
// at least one letter that is not on a stock phone keyboard — ɩ in 640
// headwords, ʋ in 195, ə in 177, ɔ in 156, ŋ in 115, ɛ in 9. The search box
// compared what a learner typed against those headwords with a plain
// `toLowerCase().contains()`, so for two thirds of the archive it did not
// work: you cannot type ɩ, and `di` did not find `dɩ`.
//
// Two rules are under test and they pull in opposite directions, which is the
// whole reason they are separate functions. Folding makes ɩ and i comparable
// so a query is forgiving. Collation keeps them distinct so the list is in
// Kasem's own order. Using either for the other's job produces a dictionary
// that is quietly wrong in a way nobody reports.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/kasem_homographs.dart';
import 'package:indigen_world_mobile/domain/kasem_orthography.dart';

void main() {
  group('folding for search', () {
    test('every extended Kasem letter folds to a key a phone has', () {
      // The six letters that account for the 785 unreachable headwords.
      expect(foldForSearch('dɩ'), 'di');
      expect(foldForSearch('bʋ'), 'bu');
      expect(foldForSearch('kə'), 'ke');
      expect(foldForSearch('kɔ'), 'ko');
      expect(foldForSearch('ŋɔ'), 'no');
      expect(foldForSearch('ɛba'), 'eba');
    });

    test('the case that was reported: typing di finds dɩ', () {
      expect(matchesFolded('dɩ', foldForSearch('di')), isTrue);
      expect(foldedContains('maŋɩ', 'mani'), isTrue);
      expect(foldedContains('bʋŋʋ', 'bunu'), isTrue);
    });

    test('tone marks are stripped, because a learner cannot hear which one', () {
      // Kasem is tonal and the marks are meaningful — which is exactly why
      // they are dropped HERE and nowhere else. An archive that insists you
      // get the tone right before it will show you the word is a quiz.
      expect(foldForSearch('dɩ́'), 'di');
      expect(foldForSearch('bà'), 'ba');
    });

    test('a query is folded the same way a headword is', () {
      // Both sides go through the same function, so somebody who CAN type the
      // real letters is not punished for it.
      expect(matchesFolded('dɩ', foldForSearch('dɩ')), isTrue);
      expect(matchesFolded('dɩ', foldForSearch('DƖ')), isTrue);
    });

    test('folding does not make everything match everything', () {
      expect(foldedContains('kana', 'jege'), isFalse);
      expect(foldedContains('nia', 'bakeira'), isFalse);
    });

    test('an empty query matches, so an empty box shows the whole list', () {
      expect(matchesFolded('anything', ''), isTrue);
      expect(foldForSearch(''), '');
      expect(foldForSearch('   '), '');
    });
  });

  group('Kasem alphabetical order', () {
    test('extended letters file with their base letter, not after z', () {
      // `String.compareTo` is UTF-16 code-unit order and every extended Kasem
      // letter is above U+0100, so the default sort put every word beginning
      // ŋ, ɔ, ɛ, ɩ or ʋ in a heap after z — several hundred entries where a
      // reader scrolling to find them never looks.
      final words = ['zebra', 'ŋɔ', 'ɛba', 'lagba', 'ade'];
      final sorted = [...words]..sort(
        (a, b) => collationKey(a).compareTo(collationKey(b)),
      );
      expect(sorted, ['ade', 'ɛba', 'lagba', 'ŋɔ', 'zebra']);
    });

    test('ɛ after e, ɩ after i, ŋ after n, ɔ after o, ʋ after u', () {
      String? order(String a, String b) =>
          collationKey(a).compareTo(collationKey(b)) < 0 ? 'before' : 'after';
      expect(order('e', 'ɛ'), 'before');
      expect(order('ɛ', 'f'), 'before');
      expect(order('i', 'ɩ'), 'before');
      expect(order('ɩ', 'j'), 'before');
      expect(order('n', 'ŋ'), 'before');
      expect(order('ŋ', 'o'), 'before');
      expect(order('o', 'ɔ'), 'before');
      expect(order('ɔ', 'p'), 'before');
      expect(order('u', 'ʋ'), 'before');
      expect(order('ʋ', 'v'), 'before');
    });

    test('inside a word too, so lagɩ files after lagi and before lagj', () {
      // The default sort put `lagɩ` after `lagz`, which is where nobody looks.
      final words = ['lagz', 'lagɩ', 'lagi', 'laga'];
      final sorted = [...words]..sort(
        (a, b) => collationKey(a).compareTo(collationKey(b)),
      );
      expect(sorted, ['laga', 'lagi', 'lagɩ', 'lagz']);
    });

    test('a space files before a letter, as a printed dictionary does', () {
      expect(
        collationKey('laŋ laŋ').compareTo(collationKey('laŋa')) < 0,
        isTrue,
      );
    });

    test('collation keeps distinctions that folding removes', () {
      // The two rules pull opposite ways on purpose. Folding says these are
      // the same word for the purpose of finding one; collation says they are
      // different words for the purpose of ordering them.
      expect(foldForSearch('dɩ'), foldForSearch('di'));
      expect(collationKey('dɩ'), isNot(collationKey('di')));
    });
  });

  group('search ranking', () {
    int? rank(
      String query, {
      required String headword,
      List<String> renderings = const [],
      List<String> translations = const [],
      String dialect = '',
      String definiteForm = '',
      String pluralForm = '',
    }) => searchRank(
      foldedQuery: foldForSearch(query),
      headword: headword,
      renderings: renderings,
      translations: translations,
      dialect: dialect,
      definiteForm: definiteForm,
      pluralForm: pluralForm,
    );

    test('the word you typed outranks a word that merely contains it', () {
      // Typing `ni` used to return every entry with those letters anywhere,
      // alphabetically — so the entry actually headed `ni` could sit fifty
      // rows below a word whose English gloss contains "permission".
      final exact = rank('ni', headword: 'ni')!;
      final buried = rank(
        'ni',
        headword: 'kwara',
        translations: ['opinion'],
      )!;
      expect(exact, lessThan(buried));
    });

    test('an exact headword beats an exact meaning', () {
      expect(
        rank('water', headword: 'water')!,
        lessThan(rank('water', headword: 'nia', translations: ['water'])!),
      );
    });

    test('a prefix beats a match in the middle', () {
      expect(
        rank('nia', headword: 'niabu')!,
        lessThan(rank('nia', headword: 'kunia')!),
      );
    });

    test('the folded query ranks a word the keyboard cannot type', () {
      // The whole point: `di` must reach `dɩ`, and reach it as an exact match
      // rather than as a distant substring.
      expect(rank('di', headword: 'dɩ'), 0);
    });

    test('inflected forms are searchable, and were not before', () {
      // A learner meets a word in a text in its plural or definite form far
      // more often than in the citation form a dictionary files it under.
      // Typing what they actually read returned nothing for a word the
      // archive holds.
      expect(rank('bakeirisi', headword: 'bakeira', pluralForm: 'bakeirisi'),
          isNotNull);
      expect(rank('bakeira kom', headword: 'bakeira',
          definiteForm: 'bakeira kom'), isNotNull);
    });

    test('a word that answers nothing ranks null', () {
      expect(rank('elephant', headword: 'nia', translations: ['water']), isNull);
    });
  });

  group('the two foldings are deliberately different', () {
    test('headwordKey does NOT fold diacritics, and must not', () {
      // `headwordKey` decides which entries are the SAME WORD for numbering.
      // Folding ɩ into i there would merge two genuinely different lexemes
      // into one numbered series — the exact error homograph numbering exists
      // to prevent — and it would do it silently.
      expect(headwordKey('dɩ'), isNot(headwordKey('di')));
      // While the search folding, whose job is to be forgiving, does.
      expect(foldForSearch('dɩ'), foldForSearch('di'));
    });
  });
}
