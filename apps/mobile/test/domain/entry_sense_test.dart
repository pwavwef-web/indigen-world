// The several things one word means — parsing, grouping, and the promise that
// nothing published before senses existed changes shape.
//
// The tests worth having here are the ones about the boundary, not about the
// getters: a dictionary that renders its whole legacy archive through a new
// code path is one regression away from showing fifteen thousand entries with
// no meaning at all.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/entry_sense.dart';
import 'package:indigen_world_mobile/domain/kasem_orthography.dart';

DictionaryEntry entry({
  String headword = 'nia',
  String translation = 'water',
  List<String> translations = const <String>[],
  String partOfSpeech = 'noun',
  String example = '',
  String exampleTranslation = '',
  String kasemDefinition = '',
  List<EntrySense> senses = const <EntrySense>[],
}) => DictionaryEntry(
  id: 'e1',
  headword: headword,
  translation: translation,
  translations: translations,
  partOfSpeech: partOfSpeech,
  dialect: 'Navrongo',
  pronunciation: '',
  example: example,
  exampleTranslation: exampleTranslation,
  attribution: 'Community',
  kasemDefinition: kasemDefinition,
  senses: senses,
);

void main() {
  group('reading a sense off a document', () {
    test('a row with no definition is dropped rather than drawn', () {
      // A sense IS its definition. An entry showing "2." with nothing after it
      // is worse than an entry with one sense.
      expect(EntrySense.fromJson(<String, Object?>{}), isNull);
      expect(EntrySense.fromJson(<String, Object?>{'definition': '   '}), isNull);
      expect(EntrySense.fromJson('water'), isNull);
      expect(EntrySense.listFrom(null), isEmpty);
      expect(EntrySense.listFrom('water'), isEmpty);
    });

    test('an example may arrive as a bare string or as both halves', () {
      // Two shapes exist because the contracts schema accepted a bare Kasem
      // string before senses carried their own translations, and a record that
      // was valid when it was written stays readable.
      final sense = EntrySense.fromJson(<String, Object?>{
        'definition': 'water',
        'examples': [
          'Nia pe yogo.',
          {'kasem': 'Nia to.', 'english': 'It rained.'},
          {'english': 'Only the English survived review.'},
          {'kasem': '', 'english': ''},
        ],
      })!;

      expect(sense.examples, hasLength(3));
      expect(sense.examples[0].kasem, 'Nia pe yogo.');
      expect(sense.examples[0].english, isEmpty);
      expect(sense.examples[1].english, 'It rained.');
      // Half an example is still an example: the contributor gave the part
      // nobody else can supply.
      expect(sense.examples[2].kasem, isEmpty);
      expect(sense.examples[2].english, isNotEmpty);
    });

    test('an unrecognised register or domain renders as nothing, not as itself',
        () {
      final sense = EntrySense.fromJson(<String, Object?>{
        'definition': 'water',
        'register': 'sarcastic',
        'domain': 'cryptocurrency',
      })!;

      // The id survives on the record — somebody chose it — but a raw id in
      // the italic label beside a meaning reads as a typo rather than as
      // information, so the label is empty until this build knows the word.
      expect(sense.register, 'sarcastic');
      expect(sense.registerLabel, isEmpty);
      expect(sense.domainLabel, isEmpty);
    });

    test('a known register and domain get their reader-facing labels', () {
      final sense = EntrySense.fromJson(<String, Object?>{
        'definition': 'water',
        'register': 'avoided',
        'domain': 'farming',
      })!;
      expect(sense.registerLabel, 'Not said in front of elders');
      expect(sense.domainLabel, 'Farming and land');
    });

    test('the list is capped and junk rows are skipped, never thrown on', () {
      final many = [
        for (var i = 0; i < kMaxSenses + 5; i++) {'definition': 'meaning $i'},
        42,
        null,
      ];
      expect(EntrySense.listFrom(many), hasLength(kMaxSenses));
    });
  });

  group('what a legacy entry looks like through the new getters', () {
    test('a flat gloss and its one sentence lift into a single sense', () {
      final legacy = entry(
        translation: 'water',
        translations: const ['water', 'rain water'],
        example: 'Nia pe yogo.',
        exampleTranslation: 'The water is cold.',
        kasemDefinition: 'Nia yi...',
      );

      final senses = legacy.displaySenses;
      expect(senses, hasLength(1));
      expect(senses.single.definition, 'water, rain water');
      expect(senses.single.kasemDefinition, 'Nia yi...');
      expect(senses.single.examples.single.kasem, 'Nia pe yogo.');
      expect(senses.single.examples.single.english, 'The water is cold.');
    });

    test('a legacy entry never draws the senses block', () {
      // The whole archive would otherwise print its three comma-separated
      // glosses twice on one screen: once in the headline list, once as a
      // numbered card saying the same thing.
      final legacy = entry(translations: const ['water', 'rain water']);
      expect(legacy.hasStructuredSenses, isFalse);
      expect(legacy.hasSenseExamples, isFalse);
    });

    test('an entry with nothing to say has no senses at all', () {
      expect(entry(translation: '', translations: const []).displaySenses, isEmpty);
    });
  });

  group('grouping senses by word class', () {
    final toy = entry(
      headword: 'toy',
      partOfSpeech: 'noun',
      senses: const [
        EntrySense(definition: 'a thing a child plays with'),
        EntrySense(definition: 'a trinket'),
        EntrySense(definition: 'to play with something', partOfSpeech: 'verb'),
        EntrySense(definition: 'a small breed of dog'),
      ],
    );

    test('the entry own class leads, and the rest follow in order', () {
      final groups = toy.sensesByClass;
      expect(groups.map((g) => g.partOfSpeech), ['noun', 'verb']);
      // The three noun senses stay in the order the contributor gave them,
      // including the one that was typed after the verb.
      expect(groups.first.senses.map((s) => s.definition), [
        'a thing a child plays with',
        'a trinket',
        'a small breed of dog',
      ]);
      expect(groups.last.senses.single.definition, 'to play with something');
    });

    test('a sense that names no class belongs to the entry own class', () {
      final single = entry(
        partOfSpeech: 'noun',
        senses: const [EntrySense(definition: 'water')],
      );
      expect(single.sensesByClass.single.partOfSpeech, 'noun');
    });

    test('a single bare sense is not treated as structured', () {
      // One sense carrying nothing but a definition says exactly what the flat
      // gloss says, and the server declines to store it for the same reason.
      final bare = entry(senses: const [EntrySense(definition: 'water')]);
      expect(bare.hasStructuredSenses, isFalse);

      final labelled = entry(
        senses: const [EntrySense(definition: 'water', domain: 'weather')],
      );
      expect(labelled.hasStructuredSenses, isTrue);
    });
  });

  group('searching inside senses', () {
    final multi = entry(
      headword: 'nia',
      translation: 'water',
      translations: const ['water'],
      senses: const [
        EntrySense(definition: 'water'),
        EntrySense(
          definition: 'rain',
          usageNote: 'Said of the first storm of the season',
          synonyms: ['sana'],
        ),
      ],
    );

    test('a word only in a later sense is now findable at all', () {
      // Before this the entry simply did not exist for somebody who typed
      // "storm": `translations` carries the summary line and a usage note four
      // senses down is not in it.
      expect(multi.matches('storm'), isTrue);
      expect(multi.matches('sana'), isTrue);
    });

    test('a sense hit always ranks below every direct hit', () {
      final headwordHit = multi.rankFor(foldForSearch('nia'));
      final senseHit = multi.rankFor(foldForSearch('storm'));
      expect(headwordHit, 0);
      expect(senseHit, kSenseMatchRank);
      expect(senseHit! > headwordHit!, isTrue);
      // And below the weakest thing `searchRank` itself can return, so a word
      // whose headword merely contains the query still wins.
      expect(kSenseMatchRank > 5, isTrue);
    });

    test('a word in no sense and no field still misses', () {
      expect(multi.matches('bicycle'), isFalse);
      expect(multi.rankFor(foldForSearch('bicycle')), isNull);
    });

    test('the extended letters fold inside senses too', () {
      final folded = entry(
        senses: const [EntrySense(definition: 'sun', usageNote: 'said of wɩa')],
      );
      // A learner who cannot type ɩ types "wia" and must still find it — the
      // same promise `foldForSearch` makes for headwords.
      expect(folded.matches('wia'), isTrue);
    });
  });

  test('a sense round-trips through JSON without gaining empty keys', () {
    const sense = EntrySense(
      definition: 'water',
      register: 'everyday',
      examples: [SenseExample(kasem: 'Nia pe yogo.')],
    );
    final json = sense.toJson();

    // Absent rather than empty, for the same reason the paradigm omits its
    // unanswered slots: an absent key is "nobody said" and an empty string is
    // "somebody said nothing".
    expect(json.containsKey('domain'), isFalse);
    expect(json.containsKey('usageNote'), isFalse);
    expect(json.containsKey('antonyms'), isFalse);
    expect(EntrySense.fromJson(json), sense);
  });
}
