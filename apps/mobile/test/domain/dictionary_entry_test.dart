// What an entry means, how many ways it means it, and who is owed a credit.
//
// Three separate promises are asserted here and they fail in different ways:
// a meaning list that silently keeps only its first element loses data without
// looking like it lost any; a search that only looks at the first meaning makes
// entries invisible to the people looking for them; and a credit line assembled
// loosely either omits an attribution that is owed or invents one that is not.
// The last is a licence condition — see [DictionaryEntry.tatoebaId].

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';

const _oneMeaning = DictionaryEntry(
  id: 'one',
  headword: 'Konkwolo',
  translation: 'Bottle',
  partOfSpeech: 'noun',
  dialect: 'Navrongo',
  pronunciation: 'kon-kwo-lo',
  example: 'Amo dole kokwolo',
  exampleTranslation: 'I threw the bottle away',
  attribution: 'Project Kassena community dictionary',
);

const _severalMeanings = DictionaryEntry(
  id: 'several',
  headword: 'Na',
  translation: 'water',
  translations: ['water', 'rain water', 'to drink'],
  partOfSpeech: 'noun',
  dialect: 'Paga',
  pronunciation: 'naa',
  example: 'Ba nu na.',
  exampleTranslation: 'They drank water.',
  attribution: 'Project Kassena community dictionary',
);

void main() {
  group('primaryTranslation', () {
    test('falls back to the singular field when nothing has been parsed', () {
      // The demo vocabulary and every hand-built entry in a test take this
      // path. Reaching for `translations.first` instead would throw on exactly
      // the entries that are hardest to notice breaking.
      expect(_oneMeaning.translations, isEmpty);
      expect(_oneMeaning.primaryTranslation, 'Bottle');
      expect(_oneMeaning.hasSeveralTranslations, isFalse);
      expect(_oneMeaning.furtherTranslations, isEmpty);
    });

    test('is the first of the list once there is one', () {
      expect(_severalMeanings.primaryTranslation, 'water');
      expect(_severalMeanings.hasSeveralTranslations, isTrue);
      expect(_severalMeanings.furtherTranslations, [
        'rain water',
        'to drink',
      ]);
    });
  });

  group('matches', () {
    test('finds a meaning that is not the first one', () {
      // The whole point of the field. Before it, "rain water" was in the
      // dictionary and typing it returned nothing.
      expect(_severalMeanings.matches('rain water'), isTrue);
      expect(_severalMeanings.matches('DRINK'), isTrue);
    });

    test('still matches the headword, the legacy field and the dialect', () {
      expect(_severalMeanings.matches('na'), isTrue);
      expect(_oneMeaning.matches('BOTTLE'), isTrue);
      expect(_oneMeaning.matches('navrongo'), isTrue);
      expect(_oneMeaning.matches('ideophone'), isFalse);
    });

    test('an empty query matches everything', () {
      expect(_oneMeaning.matches('   '), isTrue);
    });
  });

  group('exampleCredit', () {
    test('is null when no credit is owed', () {
      // Not an empty string, and not a partial line: a caller that renders
      // whatever this returns must render nothing at all here.
      expect(_oneMeaning.exampleCredit, isNull);
      expect(
        _oneMeaning
            .copyWith(sentenceSource: 'unattributed')
            .exampleCredit,
        isNull,
      );
    });

    test('names the sentence, the contributor and the licence', () {
      final credited = _oneMeaning.copyWith(
        sentenceSource: 'tatoeba',
        tatoebaId: '1818',
        tatoebaContributor: 'CK',
        sentenceLicence: 'CC BY 2.0 FR',
      );
      // Word for word what QueueWordCard prints under the same sentence while
      // the member is still answering it.
      expect(credited.exampleCredit, 'Tatoeba #1818 · CK · CC BY 2.0 FR');
    });

    test('leaves an unrecorded contributor out rather than writing "by"', () {
      final credited = _oneMeaning.copyWith(
        sentenceSource: 'tatoeba',
        tatoebaId: '99',
        sentenceLicence: 'CC BY 2.0 FR',
      );
      expect(credited.exampleCredit, 'Tatoeba #99 · CC BY 2.0 FR');
    });
  });

  group('splitTranslations', () {
    test('splits on commas, slashes and newlines', () {
      expect(splitTranslations('water / rain water'), [
        'water',
        'rain water',
      ]);
      expect(splitTranslations('greeting, hello\nhi'), [
        'greeting',
        'hello',
        'hi',
      ]);
    });

    test('collapses internal whitespace and drops empty pieces', () {
      expect(splitTranslations('good   morning,, '), ['good morning']);
    });

    test('de-duplicates case-insensitively, keeping the first spelling', () {
      // Order-stable, so re-parsing text that has already been parsed is a
      // no-op — which is what makes it safe to run on every row of a list.
      final once = splitTranslations('Hello, hello, HELLO');
      expect(once, ['Hello']);
      expect(splitTranslations(once.join(', ')), once);
    });

    test('caps the count after de-duplication', () {
      final many = splitTranslations(
        'a, b, c, d, e, f, g, h, i, j, a, b',
      );
      expect(many, hasLength(kMaxTranslations));
      expect(many.first, 'a');
    });

    test('truncates an over-long piece rather than losing the row', () {
      final long = 'x' * 400;
      final parsed = splitTranslations('$long, bottle');
      expect(parsed.first, hasLength(kMaxTranslationLength));
      expect(parsed.last, 'bottle');
    });

    test('an empty string yields no meanings at all', () {
      expect(splitTranslations(''), isEmpty);
      expect(splitTranslations('  ,  / '), isEmpty);
    });
  });

  test('an entry survives a JSON round trip with its new fields', () {
    final restored = DictionaryEntry.fromJson(
      _severalMeanings
          .copyWith(tatoebaId: '1818', tatoebaContributor: 'CK')
          .toJson(),
    );
    expect(restored.translations, ['water', 'rain water', 'to drink']);
    expect(restored.tatoebaId, '1818');
    expect(restored.exampleCredit, 'Tatoeba #1818 · CK');
  });
}
