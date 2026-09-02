// Reading a published dictionary document onto the entry the app renders.
//
// `dictionaryEntryFromData` is the only place the shape of a Firestore document
// meets the shape of the app, and it has to hold three separate lines at once:
// fifteen thousand entries written before any of this existed must gain the new
// shape without a migration; a `translations` array that means the Kasem side
// must never be printed as the English one; and a word class the app has never
// heard of must arrive intact rather than as a shrug.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/translation_display.dart';

void main() {
  group('several meanings', () {
    test('a legacy single translation is split into a list', () {
      // No migration is ever going to run over the historical rows, so the list
      // is derived on read. "water / rain water" was the headword of an entry
      // nobody could search for; now it is two meanings, either of which finds
      // it.
      final entry = dictionaryEntryFromData('legacy', {
        'kasemText': 'Na',
        'englishText': 'water / rain water',
        'isPublished': true,
      })!;

      expect(entry.translations, ['water', 'rain water']);
      expect(entry.primaryTranslation, 'water');
      // The singular field is untouched, because six screens still read it.
      expect(entry.translation, 'water / rain water');
      expect(entry.matches('rain water'), isTrue);
    });

    test('a published translations array is the KASEM side, not the English', () {
      // `dictionaryEntries.translations` is derived by the review pipeline from
      // the contribution's Kasem body — see `submissionTranslations` in
      // services/functions/src/publication.ts — so it holds the renderings, and
      // the English meaning still comes from the English field. This test used
      // to assert the opposite, which is how Kasem words came to be printed in
      // the meaning column.
      final entry = dictionaryEntryFromData('published', {
        'kasemText': 'Konkwolo, kɔnkwɔlɔ, kʋnkwʋlʋ',
        'englishText': 'Bottle',
        'translations': ['Konkwolo', 'kɔnkwɔlɔ', 'kʋnkwʋlʋ'],
        'isPublished': true,
      })!;

      expect(entry.renderings, ['Konkwolo', 'kɔnkwɔlɔ', 'kʋnkwʋlʋ']);
      expect(entry.furtherRenderings, ['kɔnkwɔlɔ', 'kʋnkwʋlʋ']);
      // The headword is the first rendering, not the raw comma-joined string.
      expect(entry.headword, 'Konkwolo');
      expect(entry.translations, ['Bottle']);
    });

    test('a declared english array wins over everything', () {
      final entry = dictionaryEntryFromData('declared', {
        'kasemText': 'Konkwolo',
        'englishText': 'Bottle',
        'englishTranslations': ['Bottle', 'Flask'],
        'translations': ['Konkwolo'],
        'isPublished': true,
      })!;

      expect(entry.translations, ['Bottle', 'Flask']);
    });

    test('an array that is only the headword restated is not a meaning list', () {
      // The live collision, and the reason this reader does not simply bind
      // `translations` onto the entry: the review pipeline writes that field as
      // the *Kasem* renderings of the headword. Printing them as the English
      // meanings would tell a learner that "Konkwolo" means "Konkwolo".
      final entry = dictionaryEntryFromData('pipeline', {
        'kasemText': 'Konkwolo / kɔnkwɔlɔ',
        'englishText': 'Bottle',
        'translations': ['Konkwolo', 'kɔnkwɔlɔ'],
        'isPublished': true,
      })!;

      expect(entry.translations, ['Bottle']);
      expect(entry.hasSeveralTranslations, isFalse);
    });

    test('a published array is normalised the way a derived one is', () {
      // Same de-duplication, trimming and whitespace collapsing the splitter
      // applies to a string it derived itself — on the Kasem side, which is the
      // side this field is on.
      final entry = dictionaryEntryFromData('messy', {
        'kasemText': 'Na',
        'englishText': 'water',
        'translations': ['nia', 'NIA', '  nyu   maa ', '', 42],
        'isPublished': true,
      })!;

      expect(entry.renderings, ['nia', 'nyu maa']);
    });

    test('an English list in the English field is still split', () {
      // The other axis, untouched: members have always answered "what does it
      // mean" with a list, and storing that whole made the meaning of the entry
      // literally the string "water / rain water".
      final entry = dictionaryEntryFromData('english-list', {
        'kasemText': 'Na',
        'englishText': 'water / rain water',
        'isPublished': true,
      })!;

      expect(entry.translations, ['water', 'rain water']);
      expect(entry.furtherTranslations, ['rain water']);
    });
  });

  group('the full part of speech', () {
    test('a class the app has never seen arrives intact', () {
      final entry = dictionaryEntryFromData('ideo', {
        'kasemText': 'Wuu',
        'englishText': 'with a rush',
        'partOfSpeech': 'ideophone',
        'isPublished': true,
      })!;

      expect(entry.partOfSpeech, 'ideophone');
      expect(partOfSpeechLabel(entry.partOfSpeech), 'Ideophone');
    });

    test('and so does one nothing recognises at all', () {
      final entry = dictionaryEntryFromData('coverb', {
        'kasemText': 'Ba',
        'englishText': 'take',
        'partOfSpeech': 'coverb',
        'isPublished': true,
      })!;

      // Rendered as itself. Never 'Not specified', never 'Other'.
      expect(partOfSpeechLabel(entry.partOfSpeech), 'coverb');
    });

    test('the stable id is read when the free text is absent', () {
      final entry = dictionaryEntryFromData('by-id', {
        'kasemText': 'Kʋm',
        'englishText': 'behind',
        'partOfSpeechId': 'postposition',
        'isPublished': true,
      })!;

      expect(partOfSpeechLabel(entry.partOfSpeech), 'Postposition');
    });

    test('only a genuinely absent class falls back', () {
      final entry = dictionaryEntryFromData('none', {
        'kasemText': 'Kʋm',
        'englishText': 'behind',
        'isPublished': true,
      })!;

      expect(entry.partOfSpeech, 'Not specified');
    });

    test('a label and an underscored spelling both resolve', () {
      expect(partOfSpeechLabel('Proper noun'), 'Proper noun');
      expect(partOfSpeechLabel('auxiliary_verb'), 'Auxiliary verb');
      expect(partOfSpeechLabel('  '), '');
    });
  });

  group('where the sentence came from', () {
    test('flat Tatoeba fields become a credit', () {
      final entry = dictionaryEntryFromData('credited', {
        'kasemText': 'Na',
        'englishText': 'water',
        'kasemExample': 'Ba nu na.',
        'sentenceSource': 'tatoeba',
        'tatoebaId': '1818',
        'tatoebaContributor': 'CK',
        'licence': 'CC BY 2.0 FR',
        'isPublished': true,
      })!;

      expect(entry.exampleCredit, 'Tatoeba #1818 · CK · CC BY 2.0 FR');
    });

    test('the queue prompt stamped on the submission is read too', () {
      // `submitWordTranslation` already writes this map; reading both shapes
      // means the credit appears the day the publication step copies either.
      final entry = dictionaryEntryFromData('stamped', {
        'kasemText': 'Na',
        'englishText': 'water',
        'wordQueuePrompt': {
          'wordId': 'water-8f7a9c',
          'sentence': 'They drank water.',
          'sentenceSource': 'tatoeba',
          'tatoebaId': 1818,
          'tatoebaContributor': 'CK',
          'licence': 'CC BY 2.0 FR',
        },
        'isPublished': true,
      })!;

      expect(entry.exampleCredit, 'Tatoeba #1818 · CK · CC BY 2.0 FR');
    });

    test('a missing licence is named rather than left off', () {
      final entry = dictionaryEntryFromData('nolicence', {
        'kasemText': 'Na',
        'englishText': 'water',
        'tatoebaId': '99',
        'isPublished': true,
      })!;

      expect(entry.exampleCredit, 'Tatoeba #99 · CC BY 2.0 FR');
    });

    test('an unattributed sentence carries no credit at all', () {
      final entry = dictionaryEntryFromData('own', {
        'kasemText': 'Na',
        'englishText': 'water',
        'kasemExample': 'Ba nu na.',
        'sentenceSource': 'unattributed',
        'isPublished': true,
      })!;

      expect(entry.exampleCredit, isNull);
    });

    test('an entry that says nothing about its sentence claims nothing', () {
      final entry = dictionaryEntryFromData('silent', {
        'kasemText': 'Konkwolo',
        'englishText': 'Bottle',
        'isPublished': true,
      })!;

      expect(entry.exampleCredit, isNull);
      expect(entry.tatoebaId, isEmpty);
      expect(entry.tatoebaContributor, isEmpty);
    });

    test('a contributor without an id is not an attribution', () {
      // An attribution that cannot point at the sentence it credits is not one,
      // and half a credit is an invented credit.
      final entry = dictionaryEntryFromData('halfway', {
        'kasemText': 'Na',
        'englishText': 'water',
        'tatoebaContributor': 'CK',
        'isPublished': true,
      })!;

      expect(entry.exampleCredit, isNull);
    });
  });

  test('a row with neither a Kasem nor an English term is still dropped', () {
    expect(dictionaryEntryFromData('empty', {'isPublished': true}), isNull);
  });
}
