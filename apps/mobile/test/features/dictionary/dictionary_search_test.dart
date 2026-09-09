// Lookup tolerance: whether a learner who does not know the spelling, the tone
// or the citation form still reaches the word.
//
// Every test here is a version of one failure, and it is the failure that makes
// a dictionary look empty when it is not: the archive holds the word, the
// search box says it does not, and the learner concludes the language is not
// covered. That is invisible in every metric, so it has to be held by tests.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/entry_sense.dart';
import 'package:indigen_world_mobile/features/dictionary/dictionary_search.dart';

DictionaryEntry entry({
  required String headword,
  String translation = 'meaning',
  List<String> translations = const <String>[],
  List<String> renderings = const <String>[],
  String partOfSpeech = 'noun',
  String dialect = 'Kasem',
  String pluralForm = '',
  String definiteForm = '',
  String audioUrl = '',
  String example = '',
  String ipa = '',
  int homographIndex = 0,
  List<EntrySense> senses = const <EntrySense>[],
}) => DictionaryEntry(
  id: 'id_$headword${homographIndex == 0 ? '' : homographIndex}',
  headword: headword,
  translation: translation,
  translations: translations,
  renderings: renderings,
  partOfSpeech: partOfSpeech,
  dialect: dialect,
  pronunciation: '',
  example: example,
  exampleTranslation: '',
  attribution: 'test',
  pluralForm: pluralForm,
  definiteForm: definiteForm,
  audioUrl: audioUrl,
  ipa: ipa,
  homographIndex: homographIndex,
  senses: senses,
);

List<String> headwordsOf(DictionaryResults results) =>
    [for (final hit in results.hits) hit.entry.headword];

void main() {
  group('ranking', () {
    test('the word you typed comes first', () {
      // The bug this is the regression for: the list was filtered and left in
      // alphabetical order, so typing `ni` returned every entry containing
      // those two letters anywhere and the entry actually headed `ni` could sit
      // fifty rows below a word whose gloss happens to contain "permission".
      final results = searchDictionary(
        entries: [
          entry(headword: 'nini', translation: 'permission'),
          entry(headword: 'kanina', translation: 'thing'),
          entry(headword: 'ni', translation: 'mouth'),
        ],
        query: 'ni',
      );
      expect(headwordsOf(results).first, 'ni');
    });

    test('an exact Kasem hit outranks an exact English one', () {
      final results = searchDictionary(
        entries: [
          entry(headword: 'something', translation: 'na'),
          entry(headword: 'na', translation: 'water'),
        ],
        query: 'na',
      );
      expect(headwordsOf(results).first, 'na');
    });

    test('a completer entry wins a tie', () {
      // With a small dictionary a bad ordering puts the right answer on the
      // second screen, where nobody looks. Between two entries that answer the
      // query equally well, the one a learner can hear is the better answer.
      final results = searchDictionary(
        entries: [
          entry(headword: 'bu', homographIndex: 1),
          entry(
            headword: 'bu',
            homographIndex: 2,
            audioUrl: 'https://example.invalid/bu.m4a',
            example: 'A nɔ bu.',
          ),
        ],
        query: 'bu',
      );
      expect(results.hits.first.entry.homographIndex, 2);
    });

    test('a sense hit ranks below every direct hit', () {
      final results = searchDictionary(
        entries: [
          entry(
            headword: 'zaŋa',
            translation: 'stone',
            senses: const [_senseMentioningWater],
          ),
          entry(headword: 'water', translation: 'water'),
        ],
        query: 'water',
      );
      expect(headwordsOf(results).first, 'water');
    });
  });

  group('forgiveness', () {
    test('a letter no keyboard has is optional', () {
      // 785 of the published headwords carry one. A learner who has heard `dɩ`,
      // cannot type ɩ, and types `di` used to be told the dictionary had no
      // matching words.
      final results = searchDictionary(
        entries: [entry(headword: 'dɩ', translation: 'eat')],
        query: 'di',
      );
      expect(results.hits, hasLength(1));
    });

    test('a tone mark is optional', () {
      final results = searchDictionary(
        entries: [entry(headword: 'bù', translation: 'child')],
        query: 'bu',
      );
      expect(results.hits, hasLength(1));
    });

    test('case does not matter', () {
      final results = searchDictionary(
        entries: [entry(headword: 'Bakeira', translation: 'bottle')],
        query: 'bakeira',
      );
      expect(results.hits, hasLength(1));
    });
  });

  group('the morphology route', () {
    test('a plural finds its singular, and says why', () {
      // The Kasem substitution for Pleco's stroke-order diagrams. A learner who
      // meets `biə` in a text has no reliable way to guess the singular is
      // `bu`, and a conventional dictionary leaves them stranded there.
      final results = searchDictionary(
        entries: [
          entry(headword: 'bu', translation: 'child', pluralForm: 'biə'),
        ],
        query: 'biə',
      );
      expect(results.hits, hasLength(1));
      expect(results.hits.single.reason, MatchReason.plural);
      expect(results.hits.single.explanation, 'biə is the plural of bu');
    });

    test('a definite form finds the citation form', () {
      final results = searchDictionary(
        entries: [
          entry(headword: 'bu', translation: 'child', definiteForm: 'bu kam'),
        ],
        query: 'bu kam',
      );
      expect(results.hits.single.reason, MatchReason.definite);
    });

    test('a headword match is never explained', () {
      // A note on every row is a note nobody reads.
      final results = searchDictionary(
        entries: [
          entry(headword: 'bu', translation: 'child', pluralForm: 'biə'),
        ],
        query: 'bu',
      );
      expect(results.hits.single.explanation, isNull);
    });
  });

  group('wildcards', () {
    test('a pattern is anchored to the whole word', () {
      // A reader typing a wildcard has described the shape of the whole word.
      // An unanchored match would return every entry containing the fragment
      // and bury the one they described.
      final results = searchDictionary(
        entries: [
          entry(headword: 'bakeira'),
          entry(headword: 'kabakeirana'),
          entry(headword: 'bakra'),
        ],
        query: 'ba*ra',
      );
      expect(headwordsOf(results), containsAll(<String>['bakeira', 'bakra']));
      expect(headwordsOf(results), isNot(contains('kabakeirana')));
    });

    test('a question mark is exactly one letter', () {
      final results = searchDictionary(
        entries: [entry(headword: 'bu'), entry(headword: 'buga')],
        query: 'b?',
      );
      expect(headwordsOf(results), <String>['bu']);
    });

    test('everything else in a pattern is literal', () {
      // A query containing a bracket searches for a bracket, rather than
      // becoming a regular expression a public search box has to survive.
      final results = searchDictionary(
        entries: [entry(headword: 'bu')],
        query: 'b[u]*',
      );
      expect(results.hits, isEmpty);
    });
  });

  group('did you mean', () {
    test('a near spelling is offered when nothing matched', () {
      // An empty screen says "this word is not in the dictionary", which for a
      // learner working from something they heard is usually false.
      final results = searchDictionary(
        entries: [entry(headword: 'bakeira', translation: 'bottle')],
        query: 'bakeria',
      );
      expect(results.hits, isEmpty);
      expect(
        [for (final row in results.suggestions) row.headword],
        contains('bakeira'),
      );
    });

    test('nothing is suggested when the search succeeded', () {
      final results = searchDictionary(
        entries: [entry(headword: 'bakeira', translation: 'bottle')],
        query: 'bakeira',
      );
      expect(results.suggestions, isEmpty);
    });

    test('a wildly different word is not a misspelling', () {
      final results = searchDictionary(
        entries: [entry(headword: 'chieftaincy')],
        query: 'bu',
      );
      expect(results.suggestions, isEmpty);
    });
  });

  group('narrowing', () {
    test('English scope does not match the Kasem side', () {
      final results = searchDictionary(
        entries: [entry(headword: 'na', translation: 'water')],
        query: 'na',
        filters: const DictionaryFilters(scope: DictionaryScope.english),
      );
      expect(results.hits, isEmpty);
    });

    test('Kasem scope does not match the English side', () {
      final results = searchDictionary(
        entries: [entry(headword: 'na', translation: 'water')],
        query: 'water',
        filters: const DictionaryFilters(scope: DictionaryScope.kasem),
      );
      expect(results.hits, isEmpty);
    });

    test('recorded-only drops entries with no voice on them', () {
      final results = searchDictionary(
        entries: [
          entry(headword: 'na', translation: 'water'),
          entry(
            headword: 'nia',
            translation: 'water',
            audioUrl: 'https://example.invalid/nia.m4a',
          ),
        ],
        query: 'water',
        filters: const DictionaryFilters(recordedOnly: true),
      );
      expect(headwordsOf(results), <String>['nia']);
    });

    test('a word-class filter reads every class the entry claims', () {
      final results = searchDictionary(
        entries: [entry(headword: 'kani', translation: 'thing')],
        query: '',
        filters: const DictionaryFilters(wordClass: 'verb'),
      );
      expect(results.hits, isEmpty);
    });

    test('an empty query with a filter still filters', () {
      // The narrowed-and-empty case used to short-circuit to "the whole
      // archive", which showed a reader every word after they had asked for
      // only the recorded ones.
      final results = searchDictionary(
        entries: [
          entry(headword: 'na'),
          entry(headword: 'nia', audioUrl: 'https://example.invalid/n.m4a'),
        ],
        query: '',
        filters: const DictionaryFilters(recordedOnly: true),
      );
      expect(headwordsOf(results), <String>['nia']);
    });
  });

  group('the cap', () {
    test('the total is reported even when the list is cut', () {
      // A list silently capped tells a reader the dictionary is small.
      final results = searchDictionary(
        entries: [
          for (var index = 0; index < 80; index++)
            entry(headword: 'ba$index', translation: 'thing'),
        ],
        query: 'ba',
      );
      expect(results.hits, hasLength(kSearchResultLimit));
      expect(results.total, 80);
      expect(results.truncated, isTrue);
    });
  });

  group('browsing', () {
    test('the rail lists only letters the archive has words under', () {
      // A rail offering `q` on a Kasem dictionary sends a reader to an empty
      // screen and reads as a broken index rather than an honest gap.
      final letters = browseLetters([
        entry(headword: 'bakeira'),
        entry(headword: 'na'),
        entry(headword: 'ŋɔŋɔ'),
      ]);
      expect(letters, <String>['B', 'N', 'Ŋ']);
    });

    test('an extended letter files after the letter it belongs with', () {
      final letters = browseLetters([
        entry(headword: 'zaŋa'),
        entry(headword: 'ŋɔŋɔ'),
        entry(headword: 'na'),
      ]);
      // ŋ after n, and both before z — the Kasem order, not the code-point one
      // that puts every extended letter after z.
      expect(letters, <String>['N', 'Ŋ', 'Z']);
    });

    test('a precomposed letter is one heading, not two', () {
      // The heading is the first letter of the headword, and a vowel carrying
      // its own tone diacritic is still one letter. A rail that split them
      // would grow a heading per tone.
      expect(browseLetterOf(entry(headword: 'bù')), 'B');
      expect(browseLetterOf(entry(headword: 'ùba')), 'Ù');
    });
  });
}

/// A sense that mentions a word its entry's gloss does not.
///
/// Named rather than inlined so the ranking test above reads as a statement
/// about ordering rather than about sense construction.
const _senseMentioningWater = EntrySense(
  definition: 'stone',
  usageNote: 'Said of the water-worn ones.',
);
