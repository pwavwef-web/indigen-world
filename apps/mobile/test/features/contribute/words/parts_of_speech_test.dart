// The word-class list, and the search that makes twenty-five of them usable.
//
// The ids asserted here are the wire values `submitWordTranslation` validates
// against, and it REJECTS one it does not recognise rather than storing
// "unknown". So this file is the phone's half of a contract: if
// PARTS_OF_SPEECH in services/functions/src/lexical-kinds.ts changes and this
// list does not, the first submission after the deploy fails — and these tests
// are what makes that fail here first instead.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';

void main() {
  group('the list', () {
    test('carries every id the backend accepts, spelled the same way', () {
      expect(kPartsOfSpeech.map((entry) => entry.id), const [
        'noun',
        'proper-noun',
        'pronoun',
        'verb',
        'auxiliary-verb',
        'adjective',
        'adverb',
        'preposition',
        'postposition',
        'conjunction',
        'determiner',
        'article',
        'numeral',
        'quantifier',
        'particle',
        'interjection',
        'ideophone',
        'classifier',
        'prefix',
        'suffix',
        'phrase',
        'idiom',
        'proverb',
        'other',
        'unknown',
      ]);
    });

    test('has an ideophone, which is the point of it being this long', () {
      // Kasem has a large and productive ideophone class. Without this entry
      // several hundred perfectly ordinary words land in "Other", and the app
      // quietly teaches contributors that their language has an enormous
      // "Other" category. It does not.
      expect(partOfSpeechById('ideophone')?.label, 'Ideophone');
    });

    test('keeps a landing place for what it does not name', () {
      expect(partOfSpeechById('other')?.label, 'Other');
      expect(partOfSpeechById('unknown')?.label, 'Not sure');
    });

    test('offers far more than the six the old dropdown had', () {
      expect(kPartsOfSpeech.length, greaterThan(20));
      // Ids are unique, or two rows would be indistinguishable once stored.
      expect(
        kPartsOfSpeech.map((entry) => entry.id).toSet(),
        hasLength(kPartsOfSpeech.length),
      );
    });

    test('an unknown id resolves to nothing rather than to a guess', () {
      expect(partOfSpeechById('gerund'), isNull);
      expect(partOfSpeechById(''), isNull);
      expect(partOfSpeechById(null), isNull);
    });
  });

  group('filterPartsOfSpeech', () {
    test('an empty query shows the whole list, not an empty one', () {
      // A picker that opens showing nothing is a picker somebody has to be
      // told how to use.
      expect(filterPartsOfSpeech(''), kPartsOfSpeech);
      expect(filterPartsOfSpeech('   '), kPartsOfSpeech);
    });

    test('matches anywhere in the label, not just at the start', () {
      final matches = filterPartsOfSpeech('noun').map((entry) => entry.id);
      expect(matches, containsAll(<String>['noun', 'proper-noun', 'pronoun']));
    });

    test('is case-insensitive', () {
      expect(filterPartsOfSpeech('IDEO').single.id, 'ideophone');
    });

    test('matches the stored id as well as the label', () {
      // A linguist who already knows the id types the hyphen; the label has a
      // space in it and would not match.
      expect(filterPartsOfSpeech('auxiliary-verb').single.id, 'auxiliary-verb');
    });

    test('narrows to one when the query is specific', () {
      expect(filterPartsOfSpeech('postp').single.id, 'postposition');
    });

    test('returns nothing rather than everything when nothing matches', () {
      expect(filterPartsOfSpeech('gerund'), isEmpty);
    });
  });
}
