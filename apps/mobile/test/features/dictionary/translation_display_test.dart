// How several meanings and a licence credit reach the screen.
//
// Two rules are held here because both fail silently when they break. A list
// row that shows only its first meaning looks exactly like an entry that has
// one, so the count beside it is the only thing that says otherwise and it must
// survive a narrow row. And a credit line must appear where one is owed and be
// wholly absent where none is — inventing a Tatoeba contributor for a sentence
// a member wrote themselves is a worse licensing failure than omitting a credit
// that was never owed.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/dictionary/sentence_credit.dart';
import 'package:indigen_world_mobile/features/dictionary/translation_display.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

const _oneMeaning = DictionaryEntry(
  id: 'one',
  headword: 'Konkwolo',
  translation: 'Bottle',
  translations: ['Bottle'],
  partOfSpeech: 'noun',
  dialect: 'Navrongo',
  pronunciation: 'kon-kwo-lo',
  example: 'Amo dole kokwolo',
  exampleTranslation: 'I threw the bottle away',
  attribution: 'Project Kassena community dictionary',
);

const _threeMeanings = DictionaryEntry(
  id: 'three',
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

Future<void> pump(WidgetTester tester, Widget child, {double width = 260}) {
  tester.view.physicalSize = const Size(800, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  return tester.pumpWidget(
    MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: buildIndigenTheme(),
      home: Scaffold(
        body: Center(child: SizedBox(width: width, child: child)),
      ),
    ),
  );
}

void main() {
  group('TranslationSummary', () {
    testWidgets('a single meaning looks like it always has', (tester) async {
      await pump(tester, const TranslationSummary(entry: _oneMeaning));

      expect(find.text('Bottle'), findsOneWidget);
      // No count, and no Row wrapped around a lone Text: the common case is the
      // whole dictionary and it must not pay for the exception.
      expect(find.textContaining('more'), findsNothing);
    });

    testWidgets('three meanings collapse to the first plus a count', (
      tester,
    ) async {
      await pump(tester, const TranslationSummary(entry: _threeMeanings));

      expect(find.text('water'), findsOneWidget);
      expect(find.text('+2 more'), findsOneWidget);
      // The other two belong to the entry screen, not to a list row.
      expect(find.text('rain water'), findsNothing);
    });

    testWidgets('the count survives a meaning too long for the row', (
      tester,
    ) async {
      const long = DictionaryEntry(
        id: 'long',
        headword: 'Na',
        translation: 'water drawn from the roof after the first rains',
        translations: [
          'water drawn from the roof after the first rains',
          'rain water',
        ],
        partOfSpeech: 'noun',
        dialect: 'Paga',
        pronunciation: 'naa',
        example: 'Ba nu na.',
        exampleTranslation: 'They drank water.',
        attribution: 'Project Kassena community dictionary',
      );
      // Narrow on purpose. The meaning gives up characters; the count does not,
      // because a count ellipsised away looks exactly like no count at all.
      await pump(tester, const TranslationSummary(entry: long), width: 150);

      expect(find.text('+1 more'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('TranslationList', () {
    testWidgets('a single meaning is one line with no numbering', (
      tester,
    ) async {
      await pump(tester, const TranslationList(entry: _oneMeaning));

      expect(find.text('Bottle'), findsOneWidget);
      expect(find.text('1'), findsNothing);
    });

    testWidgets('several meanings are numbered in the order given', (
      tester,
    ) async {
      await pump(tester, const TranslationList(entry: _threeMeanings));

      expect(find.text('water'), findsOneWidget);
      expect(find.text('rain water'), findsOneWidget);
      expect(find.text('to drink'), findsOneWidget);
      expect(find.text('1'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
    });
  });

  group('SentenceCredit', () {
    testWidgets('names the sentence, the contributor and the licence', (
      tester,
    ) async {
      final credited = _threeMeanings.copyWith(
        sentenceSource: 'tatoeba',
        tatoebaId: '1818',
        tatoebaContributor: 'CK',
        sentenceLicence: 'CC BY 2.0 FR',
      );
      await pump(tester, SentenceCredit(entry: credited), width: 320);

      expect(find.text('Tatoeba #1818 · CK · CC BY 2.0 FR'), findsOneWidget);
    });

    testWidgets('an entry with no attribution renders no credit line', (
      tester,
    ) async {
      await pump(tester, const SentenceCredit(entry: _oneMeaning));

      expect(find.textContaining('Tatoeba'), findsNothing);
      expect(find.byIcon(Icons.info_outline_rounded), findsNothing);
    });

    testWidgets('an unattributed sentence is not credited to anyone', (
      tester,
    ) async {
      final own = _oneMeaning.copyWith(sentenceSource: 'unattributed');
      await pump(tester, SentenceCredit(entry: own));

      expect(find.textContaining('Tatoeba'), findsNothing);
      expect(find.textContaining('CC BY'), findsNothing);
    });
  });
}
