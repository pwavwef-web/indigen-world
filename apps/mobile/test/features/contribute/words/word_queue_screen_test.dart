// The screen the blank "English or source word" field was replaced by.
//
// The thing being tested is a rhythm rather than a form: a word arrives with
// the sentence that makes it answerable, an answer or a pass takes one action,
// and the next word appears IN PLACE — no route change, no celebration, no
// waiting. Each test below is one link in that chain.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_received_screen.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_repository.dart';
import 'package:indigen_world_mobile/features/contribute/words/word_queue_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

import 'fake_word_queue_api.dart';

Future<void> pumpQueue(WidgetTester tester, FakeWordQueueApi api) async {
  // Tall on purpose: the whole of one question fits on a real phone only
  // because the form is short, and a test that had to scroll to reach Send
  // would stop noticing when it stopped fitting.
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [wordQueueApiProvider.overrideWithValue(api)],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: const WordQueueScreen(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

/// Answers the word on screen with [translation].
Future<void> answer(WidgetTester tester, String translation) async {
  await tester.enterText(find.byType(TextFormField).first, translation);
  await tester.pump();

  // Only when it still needs choosing. A test that has already picked Noun —
  // to reach the noun-form fields, which render only for a noun — would
  // otherwise reopen the picker and find "Noun" twice: once as the chosen
  // value on the field, once as the row in the list.
  if (find.text('Noun').evaluate().isEmpty) {
    await tester.tap(find.text('Word class'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Noun'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  // Only when it still needs choosing. The dialect is kept across words on
  // purpose — it is a fact about the member, not about the word — so a second
  // call would be opening a dropdown that is already answered, and tapping a
  // collapsed label that no longer hit-tests.
  if (find.text('Navrongo').evaluate().isEmpty) {
    await tester.tap(find.text('Dialect or region'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Navrongo').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  await tester.tap(find.text('Send and take the next'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  testWidgets('the first word arrives with everything needed to answer it', (
    tester,
  ) async {
    await pumpQueue(tester, FakeWordQueueApi([batchOf(3)]));

    expect(find.text('word-0'), findsOneWidget);
    expect(find.text('A sentence containing word-0.'), findsOneWidget);
    // The licence condition travels with the sentence.
    expect(find.text('Tatoeba #1000 · CK · CC BY 2.0 FR'), findsOneWidget);
    expect(find.text('The Kasem for it'), findsOneWidget);
    expect(find.text('Word class'), findsOneWidget);
    expect(find.text('Dialect or region'), findsOneWidget);
    // What it is worth, and the conditional that keeps the sentence honest.
    expect(
      find.textContaining('when a reviewer approves it, not when you send it'),
      findsOneWidget,
    );
  });

  testWidgets('the field says how to give more than one answer', (
    tester,
  ) async {
    await pumpQueue(tester, FakeWordQueueApi([batchOf(2)]));

    expect(
      find.text('More than one? Separate them with a comma or a slash.'),
      findsOneWidget,
    );
  });

  testWidgets('the chips show what will actually be stored, as they type', (
    tester,
  ) async {
    await pumpQueue(tester, FakeWordQueueApi([batchOf(2)]));

    await tester.enterText(
      find.byType(TextFormField).first,
      'water / rain water, Water',
    );
    await tester.pump();

    // Split on the slash and the comma, and the repeat gone — the exact list
    // the server will store, shown before it is sent rather than after.
    expect(find.text('We will store 2 entries'), findsOneWidget);
    expect(find.text('water'), findsOneWidget);
    expect(find.text('rain water'), findsOneWidget);
  });

  testWidgets('both ways of passing are one tap, and neither blames anybody', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);

    expect(find.text("I don't know this one"), findsOneWidget);
    expect(find.text("I'm not sure enough"), findsOneWidget);
    expect(find.textContaining('it costs nothing'), findsOneWidget);
  });

  testWidgets('skipping brings the next word straight away', (tester) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);

    await tester.tap(find.text("I don't know this one"));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('word-1'), findsOneWidget);
    expect(find.text('word-0'), findsNothing);
    expect(api.skips.single, ('id-0', WordQueueSkipReason.unknown));

    // And the other reason is recorded as itself, not folded into the first.
    await tester.tap(find.text("I'm not sure enough"));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('word-2'), findsOneWidget);
    expect(api.skips.last, ('id-1', WordQueueSkipReason.unsure));
  });

  testWidgets('answering advances in place, with a receipt and a tally', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);

    await answer(tester, 'kʋm, na-kʋm');

    // The next word is here, on the same screen. This is the whole feature:
    // a full-screen celebration after every word would be twenty
    // interruptions in a twenty-word sitting.
    expect(find.text('word-1'), findsOneWidget);
    expect(find.byType(ContributionReceivedScreen), findsNothing);

    // A small confirmation of what went, which is the only way a member can
    // check that the chips said what they meant.
    expect(find.text('“word-0” → kʋm, na-kʋm'), findsOneWidget);
    expect(find.textContaining('once a reviewer approves it'), findsOneWidget);

    // And the sitting counts itself.
    expect(find.text('1 word sent'), findsOneWidget);
    expect(find.text('10 pts if approved'), findsOneWidget);

    expect(api.submissions.single.wordId, 'id-0');
    expect(api.submissions.single.translations, ['kʋm', 'na-kʋm']);
    expect(api.submissions.single.partOfSpeech, 'noun');
    expect(api.submissions.single.dialect, 'Navrongo');
  });

  testWidgets('the form empties for the next word but keeps the dialect', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);
    await answer(tester, 'kʋm');

    // Nothing carried over that was an answer to the last word.
    expect(find.text('We will store one entry'), findsNothing);
    expect(find.text('Noun'), findsNothing);
    // The dialect is a fact about the member, not about the word. Asking
    // somebody from Paga to say so again on every single word is what ends a
    // sitting at four words instead of twenty.
    expect(find.text('Navrongo'), findsOneWidget);
  });

  testWidgets('a half-typed answer does not follow a skip to the next word', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);

    await tester.enterText(find.byType(TextFormField).first, 'kʋm');
    await tester.pump();
    await tester.tap(find.text('Word class'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Noun'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.tap(find.text("I don't know this one"));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('word-1'), findsOneWidget);
    expect(find.text('We will store one entry'), findsNothing);
    expect(find.text('Noun'), findsNothing);

    // And the emptiness is real rather than only drawn: the form still has to
    // be filled in before it will send. The failure this guards against sent
    // the last word's class with the next word's translation.
    await tester.tap(find.text('Send and take the next'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Choose a word class.'), findsOneWidget);
    expect(find.text('Give at least one translation.'), findsOneWidget);
    expect(api.submissions, isEmpty);
  });

  testWidgets('the receipt is left behind once the member moves on', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);
    await answer(tester, 'kʋm');

    expect(find.text('“word-0” → kʋm'), findsOneWidget);

    await tester.tap(find.text("I'm not sure enough"));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // The strip says "just sent". Leaving it up while somebody passes on three
    // words would make it say that about a word from a minute ago.
    expect(find.text('“word-0” → kʋm'), findsNothing);
    // The tally is the thing that persists, because it is about the sitting.
    expect(find.text('1 word sent · 1 passed'), findsOneWidget);
  });

  testWidgets('an empty answer is refused before anything is sent', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(2)]);
    await pumpQueue(tester, api);

    await tester.tap(find.text('Send and take the next'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Give at least one translation.'), findsOneWidget);
    expect(find.text('Choose a word class.'), findsOneWidget);
    expect(find.text('Choose a dialect.'), findsOneWidget);
    expect(api.submissions, isEmpty);
    // Still the same word, untouched.
    expect(find.text('word-0'), findsOneWidget);
  });

  testWidgets('the end of the queue is a finish, not a blank screen', (
    tester,
  ) async {
    final api = FakeWordQueueApi([
      batchOf(1),
      const QueueBatch(words: <QueueWord>[], exhausted: true),
    ]);
    await pumpQueue(tester, api);

    await tester.tap(find.text("I don't know this one"));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('That is the whole queue.'), findsOneWidget);
    expect(find.text('Try again'), findsNothing);
  });

  // ── Sentence fit ──────────────────────────────────────────────────────────
  //
  // The queue shows a word and a sentence, and sometimes the sentence is about
  // something else — rank 31 is *word*, shown in "put in a good word for me".
  // These tests hold the escape open: the member answers the word AND says the
  // sentence was no help, in one send, without skipping a word they knew.

  testWidgets('a member who says nothing has said the sentence was fine', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(2)]);
    await pumpQueue(tester, api);

    expect(find.text('Does that sentence show the plain word?'), findsOneWidget);

    // Answered without touching the control at all: the median word must cost
    // zero extra taps, or the queue grows a field per word and people stop.
    await answer(tester, 'kʋm');

    expect(api.submissions.single.sentenceFit, WordQueueSentenceFit.fits);
  });

  testWidgets('the word is still answered when the sentence is flagged', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(2)]);
    await pumpQueue(tester, api);

    await tester.tap(find.text('That is a saying, not the plain word'));
    await tester.pump();
    await answer(tester, 'kʋm');

    // Both halves survive. Losing either would defeat the whole feature: the
    // answer alone loses the flag, the flag alone is just a skip.
    final sent = api.submissions.single;
    expect(sent.sentenceFit, WordQueueSentenceFit.idiom);
    expect(sent.translations, ['kʋm']);
    expect(api.skips, isEmpty);
  });

  testWidgets('a remark about one sentence does not follow the next word', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);

    await tester.tap(find.text('That is a different meaning'));
    await tester.pump();
    await answer(tester, 'kʋm');

    // The next word arrived; the control must have gone back to fits with the
    // rest of the answer. This is the bug `_clearAnswer` exists for.
    expect(find.text('word-1'), findsOneWidget);
    await answer(tester, 'nɩ');
    expect(api.submissions.last.sentenceFit, WordQueueSentenceFit.fits);
  });

  testWidgets('a saying is offered a home, and only when one was spotted', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);

    await answer(tester, 'kʋm');
    expect(find.text('Record that saying too?'), findsNothing);

    await tester.tap(find.text('That is a saying, not the plain word'));
    await tester.pump();
    await answer(tester, 'nɩ');

    // Offered after the send, never before it — interrupting somebody
    // mid-word to ask for a second contribution is how the rhythm dies.
    expect(find.text('Record that saying too?'), findsOneWidget);
  });

  // ── Noun forms ────────────────────────────────────────────────────────────
  //
  // The queue used to ask for the Kasem for "the", fifteen thousand times, and
  // there is no such word — definiteness is a property of the noun. These tests
  // hold the replacement: two optional fields that cost nothing to ignore, and
  // a plain form stated rather than asked for.

  testWidgets('the form fields appear only once the word is a noun', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(2)]);
    await pumpQueue(tester, api);

    // Nothing until a word class is chosen: a verb must cost zero extra
    // keystrokes, and so must a noun whose contributor does not elaborate.
    expect(find.text('Say it with “the” (optional)'), findsNothing);
    expect(find.text('Say it for many (optional)'), findsNothing);

    await tester.tap(find.text('Word class'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Noun'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Say it with “the” (optional)'), findsOneWidget);
    expect(find.text('Say it for many (optional)'), findsOneWidget);
    // The rule is stated, never asked for. A member who reads this line has
    // learnt something true and will not type "bu mo" into the meaning box.
    expect(find.textContaining('just the word and mo'), findsOneWidget);
  });

  testWidgets('a noun answered without its forms still sends nothing extra', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(2)]);
    await pumpQueue(tester, api);
    await answer(tester, 'bu');

    final sent = api.submissions.single;
    expect(sent.definiteForm, '');
    expect(sent.pluralForm, '');
    // The optionality is the whole design. If this key ever appears on an
    // answer nobody filled in, every verb in the collection grows an empty map.
    expect(sent.toPayload().containsKey('forms'), isFalse);
  });

  testWidgets('the forms a member does give travel with the answer', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(2)]);
    await pumpQueue(tester, api);

    await tester.tap(find.text('Word class'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Noun'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Say it with “the” (optional)'),
      'bukam',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Say it for many (optional)'),
      'buga',
    );
    await tester.pump();
    await answer(tester, 'bu');

    final sent = api.submissions.single;
    expect(sent.definiteForm, 'bukam');
    expect(sent.pluralForm, 'buga');
    expect(sent.toPayload()['forms'], {'definite': 'bukam', 'plural': 'buga'});
  });

  testWidgets('one word\'s forms do not follow the member to the next', (
    tester,
  ) async {
    final api = FakeWordQueueApi([batchOf(3)]);
    await pumpQueue(tester, api);

    await tester.tap(find.text('Word class'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Noun'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Say it with “the” (optional)'),
      'bukam',
    );
    await tester.pump();
    await answer(tester, 'bu');

    await answer(tester, 'nɩ');
    expect(api.submissions.last.definiteForm, '');
  });

  testWidgets('no Firebase says so instead of looking like an empty queue', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(900, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    // No override at all: `wordQueueApiProvider` is null when Firebase never
    // came up, which is what every widget test and a first offline launch see.
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          theme: buildIndigenTheme(),
          home: const WordQueueScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('The queue needs a connection.'), findsOneWidget);
  });
}
