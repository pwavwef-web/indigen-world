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

  group('the forms a noun takes', () {
    test('the plain form is derived, so every legacy noun already has one', () {
      // _oneMeaning carries no `forms` at all — it is the shape of the whole
      // dictionary as contributed before any of this existed. It still gets
      // its indefinite, because the indefinite is a rule and not a record.
      expect(_oneMeaning.definiteForm, '');
      expect(_oneMeaning.pluralForm, '');
      expect(_oneMeaning.countedForm, '');
      expect(_oneMeaning.hasForms, isFalse);
      expect(_oneMeaning.indefinite, isNull);
    });

    test('unverified indefinite forms are withheld for all word classes', () {
      // Asking is how a caller decides whether to draw the line, so a verb has
      // to answer null rather than leave every screen re-testing word classes.
      final verb = _oneMeaning.copyWith(partOfSpeech: 'verb');
      expect(verb.indefinite, isNull);
      // Free text, so the capitalisation the contributor's client sent is
      // whatever it was. "Noun" and "noun" are the same word class.
      expect(_oneMeaning.copyWith(partOfSpeech: 'Noun').indefinite, isNull);
    });

    test('an entry with no headword gets no form rather than a bare particle', () {
      // "mo" alone is not the indefinite of anything, and printing it would
      // state something false on an entry whose data is simply missing.
      expect(_oneMeaning.copyWith(headword: '').indefinite, isNull);
      expect(_oneMeaning.copyWith(headword: '   ').indefinite, isNull);
    });

    test('collected forms are carried, and the indefinite is not among them', () {
      final recorded = _oneMeaning.copyWith(
        definiteForm: 'konkwolokam',
        pluralForm: 'konkwoli',
        countedForm: 'konkwoli balei',
      );
      expect(recorded.hasForms, isTrue);
      expect(recorded.definiteForm, 'konkwolokam');
      expect(recorded.pluralForm, 'konkwoli');
      expect(recorded.countedForm, 'konkwoli balei');
      // Still computed from the headword, never read from a stored field, so
      // the two can never come to disagree.
      expect(recorded.indefinite, isNull);
    });

    test('a counted form on its own is collected morphology', () {
      // The half of the pair that is hardest to come by. A whole glossed
      // chapter of Genesis produced one noun seen both with its article and
      // with a numeral, so an entry carrying only the numeral side is worth
      // exactly as much shelf space as one carrying only the definite side.
      final counted = _oneMeaning.copyWith(countedForm: 'konkwoli balei');
      expect(counted.hasForms, isTrue);
    });

    test('an unestablished noun class reads empty, which is not "no class"', () {
      expect(_oneMeaning.nounClass, '');
      expect(_oneMeaning.copyWith(nounClass: 'class-1').nounClass, 'class-1');
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

  // -- The advanced entry --------------------------------------------------
  //
  // Everything a learner should be able to find out about one word: how it is
  // said, every form it takes, what it means in its own language, and where it
  // came from. The tests below are as much about what the entry *refuses* to
  // say as about what it shows: the whole discipline of this project's language
  // work is that a plausible-looking invented form is worse than an admitted
  // gap, because it gets published, taught and repeated and nothing downstream
  // can tell it from a real one.

  group('the paradigm a learner reads', () {
    const noun = DictionaryEntry(
      id: 'bakeira',
      headword: 'bakeira',
      translation: 'boy',
      partOfSpeech: 'noun',
      dialect: 'Navrongo',
      pronunciation: '',
      example: '',
      exampleTranslation: '',
      attribution: 'Project Kassena community dictionary',
      definiteForm: 'bakeira kam',
      pluralForm: 'bakeiru',
      pluralDefiniteForm: 'bakeiru bam',
      countedForm: 'bakeiru balei',
      pronounForm: 'o',
    );

    test('the table opens with the headword, not with the second form', () {
      // A paradigm that begins at the *second* form is one a learner has to
      // assemble in their head from two places on the screen.
      expect(noun.nounForms.first.label, 'One');
      expect(noun.nounForms.first.form, 'bakeira');
      expect(
        noun.nounForms.map((row) => row.form).toList(),
        ['bakeira', 'bakeira kam', 'bakeiru', 'bakeiru bam', 'bakeiru balei', 'o'],
      );
    });

    test('a noun nobody has recorded a form for draws no table', () {
      // The headword row exists for every noun, so a card gated on the list
      // being non-empty would draw on the whole legacy dictionary — a row
      // restating the headword an inch below itself.
      expect(_oneMeaning.nounForms.length, 1);
      expect(_oneMeaning.hasNounParadigm, isFalse);
      expect(_oneMeaning.hasForms, isFalse);
      expect(noun.hasNounParadigm, isTrue);
    });

    test('a verb is asked about time, not about number', () {
      const verb = DictionaryEntry(
        id: 'di',
        headword: 'di',
        translation: 'eat',
        partOfSpeech: 'verb',
        dialect: 'Navrongo',
        pronunciation: '',
        example: '',
        exampleTranslation: '',
        attribution: 'Project Kassena community dictionary',
        presentForm: 'o di',
        pastForm: 'o di-PAST',
        futureForm: 'o di-FUT',
      );
      expect(verb.verbForms.map((row) => row.label).toList(), [
        'Now',
        'Yesterday',
        'Tomorrow',
      ]);
      // A verb has no plural of its own, so its table has none.
      expect(verb.nounForms, isEmpty);
      expect(verb.hasForms, isTrue);
    });

    test('a word used both ways draws both tables', () {
      // The case a single word class could not express, and the reason the
      // paradigm is one flat map rather than a noun object beside a verb one.
      final both = noun.copyWith(
        alsoUsedAs: const ['verb'],
        pastForm: 'o bakeira-PAST',
      );
      expect(both.isNoun, isTrue);
      expect(both.isVerb, isTrue);
      expect(both.hasNounParadigm, isTrue);
      expect(both.verbForms, hasLength(1));
      // And the declared class leads, so a screen listing them says "noun,
      // also a verb" rather than the other way round.
      expect(both.wordClasses, ['noun', 'verb']);
    });

    test('an entry never lists its own class among the others', () {
      final odd = noun.copyWith(alsoUsedAs: const ['noun', 'verb']);
      expect(odd.wordClasses, ['noun', 'verb']);
    });
  });

  group('what the forms are allowed to say about concord', () {
    const noun = DictionaryEntry(
      id: 'da',
      headword: 'da',
      translation: 'days',
      partOfSpeech: 'noun',
      dialect: 'Navrongo',
      pronunciation: '',
      example: '',
      exampleTranslation: '',
      attribution: 'Project Kassena community dictionary',
      definiteForm: 'da yam',
      countedForm: 'da yalei',
    );

    test('the article and the numeral are read off the recorded forms', () {
      // Reading, not inferring. The member wrote "da yam" and "da yalei"; the
      // entry restates which article and which numeral are in those strings.
      expect(noun.article, 'yam');
      expect(noun.numeral?.form, 'yalei');
      expect(noun.numeral?.prefix, 'ya');
    });

    test('a form nothing matches yields nothing, never a guess', () {
      // THE guard. Six words for *two* are attested and which noun takes which
      // is exactly the open question; a seventh invented to complete a pattern
      // would be indistinguishable downstream from one somebody actually says.
      // `kolei` rather than `kalei`: the latter was attested on 2026-09-06 and
      // is now recognised. `kom` is one of the two articles with no numeral
      // form attested, and it must stay that way until somebody says one.
      final unknown = noun.copyWith(
        definiteForm: 'da zzq',
        countedForm: 'da kolei',
      );
      expect(unknown.article, isNull);
      expect(unknown.numeral, isNull);
      expect(_oneMeaning.article, isNull);
      expect(_oneMeaning.numeral, isNull);
    });

    test('a stored reading wins over one read off the form', () {
      // Written by the publication path so a query need not re-parse, and by a
      // reviewer correcting one that was read wrong.
      final stored = noun.copyWith(
        definiteArticle: 'kam',
        numeralSeries: 'balei',
        numeralPrefix: 'ba',
      );
      expect(stored.article, 'kam');
      expect(stored.numeral?.prefix, 'ba');
    });

    test('reading a marker is never the same as establishing a class', () {
      // `nounClass` stays empty — "not established", which is the honest answer
      // and by far the common one. A class derived from two forms is a claim
      // and belongs in the review path, not on a render.
      expect(noun.article, 'yam');
      expect(noun.numeral, isNotNull);
      expect(noun.nounClass, '');
    });
  });

  group('how the word is said and what it means in Kasem', () {
    test('the slashes live on the render, never in the data', () {
      // Half the people who fill this in type them and half do not. Storing
      // what was typed renders three ways on one screen and makes the field
      // unqueryable.
      final entry = _oneMeaning.copyWith(ipa: 'kɔ̃.kwo.lo');
      expect(entry.ipa, 'kɔ̃.kwo.lo');
      expect(entry.ipaDisplay, '/kɔ̃.kwo.lo/');
    });

    test('no transcription draws nothing, not an empty pair of slashes', () {
      expect(_oneMeaning.ipaDisplay, isNull);
      expect(_oneMeaning.copyWith(ipa: '   ').ipaDisplay, isNull);
    });

    test('the meaning in Kasem and the etymology survive a round trip', () {
      // The Kasem definition is the only text on the record written *in* the
      // language rather than about it.
      final restored = DictionaryEntry.fromJson(
        _oneMeaning
            .copyWith(
              kasemDefinition: 'Nabiinu we o na de bu',
              etymology: 'From the root for child.',
              ipa: 'bàkéːrà',
              alsoUsedAs: const ['verb'],
              pronounForm: 'o',
            )
            .toJson(),
      );
      expect(restored.kasemDefinition, 'Nabiinu we o na de bu');
      expect(restored.etymology, 'From the root for child.');
      expect(restored.ipaDisplay, '/bàkéːrà/');
      expect(restored.alsoUsedAs, ['verb']);
      expect(restored.pronounForm, 'o');
    });
  });
}
