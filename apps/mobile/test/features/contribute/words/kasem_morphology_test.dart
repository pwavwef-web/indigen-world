// The phone's half of the Kasem morphology contract.
//
// `kasem_morphology.dart` mirrors `services/functions/src/kasem-morphology.ts`,
// and the two agreeing is not something the type system can check across
// languages. This file is what makes a drift fail here rather than in the
// archive, where it would show as a dictionary entry quietly disagreeing with
// itself about what a word is called.
//
// The load-bearing property under test is a refusal: every function below
// either recognises something a speaker wrote down, or returns null. It never
// generates a form. A plausible invented form gets published, taught, copied
// into lessons and repeated back by Kawuri, and nothing downstream can tell it
// from a real one.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/kasem_morphology.dart';

void main() {
  group('the attested sets', () {
    test('the eight determiners a speaker stated, and no ninth', () {
      expect(kDefiniteArticles, const [
        'kam',
        'kom',
        'dem',
        'tem',
        'bam',
        'yam',
        'sem',
        'wom',
      ]);
    });

    test('every determiner with a pronoun is a real determiner', () {
      // Guards the drift that would fail silently: the lookup runs through
      // `articleIn`, so a row naming an article that is not on the list could
      // never be reached and would read as a working rule.
      for (final article in kDeterminerPronouns.keys) {
        expect(
          kDefiniteArticles,
          contains(article),
          reason: '$article must be on the determiner list',
        );
      }
      expect(kDeterminerPronouns.length, kDefiniteArticles.length);
    });

    test('the pronoun the speaker gave for each determiner', () {
      // Written out rather than looped, so changing one is a visible edit to a
      // stated fact and not a quietly passing test. Completed 2026-09-08.
      expect(kDeterminerPronouns, const {
        'kam': 'ka',
        'kom': 'ko',
        'dem': 'de',
        'tem': 'te',
        'bam': 'ba',
        'yam': 'ya',
        'sem': 'se',
        'wom': 'o',
      });
    });
  });

  group('the determiner decides the pronoun', () {
    test('a pronoun is read off the determiner in a definite form', () {
      expect(pronounForDefinite('bu wom'), 'o');
      expect(pronounForDefinite('bukam'), 'ka');
      expect(pronounForDefinite('dɩɩ dem'), 'de');
      expect(pronounForDefinite('ka sem'), 'se');
    });

    test('the pronoun is stored per determiner, not sliced off the spelling', () {
      // THE test that keeps this a record instead of a generalisation. Seven
      // of the eight are the article minus its `-m`; `wom` is not. An
      // implementation that dropped the last letter would pass every other
      // case in this file and be wrong about exactly one real word.
      expect(pronounForDefinite('bu wom'), 'o', reason: 'not "wo"');
      // And it must stay silent about a determiner nobody has attested,
      // rather than confidently slicing an `-m` off it.
      expect(pronounForDefinite('bu nam'), isNull);
      expect(pronounForDefinite('bu zom'), isNull);
    });

    test('an unrecognised or absent definite form yields no pronoun', () {
      expect(pronounForDefinite('the boy'), isNull);
      expect(pronounForDefinite(''), isNull);
      // A bare article is the article itself, not a noun said with one.
      expect(pronounForDefinite('kam'), isNull);
    });
  });

  group('the check reports and never replaces', () {
    test('it distinguishes agreement, absence and disagreement', () {
      expect(pronounCheck('bukam', 'ka'), PronounCheck.agrees);
      expect(pronounCheck('bukam', ''), PronounCheck.absent);
      expect(pronounCheck('bukam', 'de'), PronounCheck.differs);
    });

    test('nothing is questioned where nothing is known', () {
      // The case that must never become a complaint: no determiner is
      // recognised, so whatever a speaker wrote stands unquestioned.
      expect(pronounCheck('the boy', 'he'), PronounCheck.unknown);
      expect(pronounCheck('', 'ka'), PronounCheck.unknown);
    });
  });

  group('reading is not inferring', () {
    test('an article is read off a definite form, written solid or apart', () {
      expect(articleIn('bu kam'), 'kam');
      expect(articleIn('bukam'), 'kam');
      expect(articleIn('the boy'), isNull);
    });

    test('no indefinite form is synthesized while the rule is disputed', () {
      expect(indefiniteForm('bu'), '');
    });
  });
}
