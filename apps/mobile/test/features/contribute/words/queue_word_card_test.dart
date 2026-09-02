// The question card, and the licence condition printed under it.
//
// The Tatoeba sentences are CC BY 2.0 FR, which requires attribution wherever
// the sentence is shown. "Wherever it is shown" is this card, so the credit
// being present is not a nicety that can be trimmed in a layout pass — and its
// being ABSENT on a row that carries no attribution matters just as much: a
// contributor invented for a sentence nobody contributed would be a worse
// failure than a credit correctly omitted. Both directions are asserted here.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/queue_word_card.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

const _attributed = QueueWord(
  id: 'the-8f7a9c',
  word: 'yard',
  sentence: 'Give him an inch and he will take a yard.',
  sentenceSource: 'tatoeba',
  attribution: QueueWordAttribution(
    tatoebaId: '1818',
    contributor: 'CK',
    licence: 'CC BY 2.0 FR',
  ),
  tier: 'core',
  rank: 412,
);

const _unattributed = QueueWord(
  id: 'kettle-11aa22',
  word: 'kettle',
  sentence: 'The kettle is on the fire.',
  sentenceSource: 'unattributed',
  attribution: null,
);

Future<void> pumpCard(WidgetTester tester, QueueWord word) async {
  tester.view.physicalSize = const Size(800, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: buildIndigenTheme(),
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: QueueWordCard(word: word),
        ),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('the card shows the word, the sentence and the credit', (
    tester,
  ) async {
    await pumpCard(tester, _attributed);

    expect(find.text('yard'), findsOneWidget);
    // The sentence is what makes the question answerable at all — "light" the
    // noun and "light" the verb are the same word without it — so it is on the
    // card at full size, not behind a tap.
    expect(
      find.text('Give him an inch and he will take a yard.'),
      findsOneWidget,
    );
    expect(find.text('Tatoeba #1818 · CK · CC BY 2.0 FR'), findsOneWidget);
  });

  testWidgets('an unattributed sentence gets no credit at all', (tester) async {
    await pumpCard(tester, _unattributed);

    expect(find.text('kettle'), findsOneWidget);
    expect(find.text('The kettle is on the fire.'), findsOneWidget);
    // Not a blank line, not a placeholder, not a guess. Nothing.
    expect(find.textContaining('Tatoeba'), findsNothing);
    expect(find.textContaining('CC BY'), findsNothing);
  });

  testWidgets('a credit with no contributor names nobody rather than blank', (
    tester,
  ) async {
    await pumpCard(
      tester,
      const QueueWord(
        id: 'x-1',
        word: 'salt',
        sentence: 'Pass the salt.',
        sentenceSource: 'tatoeba',
        attribution: QueueWordAttribution(
          tatoebaId: '99',
          contributor: '',
          licence: 'CC BY 2.0 FR',
        ),
      ),
    );

    expect(find.text('Tatoeba #99 · CC BY 2.0 FR'), findsOneWidget);
  });

  testWidgets('answers already in review are said, once and quietly', (
    tester,
  ) async {
    await pumpCard(
      tester,
      const QueueWord(
        id: 'x-2',
        word: 'river',
        sentence: 'The river is wide.',
        sentenceSource: 'unattributed',
        attribution: null,
        pendingCount: 2,
      ),
    );

    expect(find.text('2 answers in review'), findsOneWidget);
  });

  testWidgets('a word nobody is working on says nothing about it', (
    tester,
  ) async {
    await pumpCard(tester, _unattributed);
    expect(find.textContaining('in review'), findsNothing);
  });

  testWidgets('a row with no sentence renders the word rather than nothing', (
    tester,
  ) async {
    // The seed found no sentence for a handful of rows. The word alone is a
    // worse question, and it is still a question; an empty quotation is not.
    await pumpCard(
      tester,
      const QueueWord(
        id: 'x-3',
        word: 'thereof',
        sentence: '',
        sentenceSource: 'unattributed',
        attribution: null,
      ),
    );

    expect(find.text('thereof'), findsOneWidget);
  });
}
