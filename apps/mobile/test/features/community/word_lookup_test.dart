// Tapping a Kasem word in a post.
//
// The dictionary and the community were two halves of this project that never
// met: people write Kasem in the feed every day, and the meaning of what they
// wrote lived two taps away behind a collection screen. Any word with a
// published entry is now marked in the post itself and opens what it means and
// a recording of it being said.

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_text.dart';
import 'package:indigen_world_mobile/features/dictionary/word_lookup.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

const _zaanem = DictionaryEntry(
  id: 'zaanem',
  headword: 'Zaanem',
  translation: 'Good evening',
  partOfSpeech: 'greeting',
  dialect: 'Nankana',
  pronunciation: 'zaa-nem',
  example: 'De zaanem.',
  exampleTranslation: 'Good evening to you.',
  attribution: 'Paga elders',
);

Widget _harness(Widget child, {List<DictionaryEntry> entries = const []}) =>
    ProviderScope(
      overrides: [
        publishedDictionaryEntriesProvider.overrideWith(
          (ref) => Stream.value(entries),
        ),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,

        theme: buildIndigenTheme(),
        home: Scaffold(body: child),
      ),
    );

/// Every span in the rendered body, flattened.
List<TextSpan> _spans(WidgetTester tester) {
  final found = <TextSpan>[];
  tester.widget<Text>(find.byType(Text).first).textSpan!.visitChildren((span) {
    if (span is TextSpan) found.add(span);
    return true;
  });
  return found;
}

void main() {
  group('the dictionary index', () {
    test('is keyed so a word in a sentence finds its entry', () async {
      final container = ProviderContainer(
        overrides: [
          publishedDictionaryEntriesProvider.overrideWith(
            (ref) => Stream.value(const [_zaanem]),
          ),
        ],
      );
      addTearDown(container.dispose);
      // A listener keeps the stream alive; a turn of the event loop is what
      // lets it emit. The index means nothing until it has.
      container.listen(dictionaryIndexProvider, (_, _) {});
      await Future<void>.delayed(Duration.zero);

      final index = container.read(dictionaryIndexProvider);
      expect(index[normaliseWord('Zaanem,')], [_zaanem]);
      expect(index[normaliseWord('«ZAANEM»')], [_zaanem]);
      expect(index['gara'], isNull);
    });

    test('every word under one spelling is kept, not the last one written', () async {
      // 478 of the 1200 published entries share a spelling with another entry
      // — eight are headed `ni`, eight `dɩ`. The index used to be
      // `index[headword] = entry`, so all but one of each run was unreachable
      // from the tap-a-word feature, and WHICH one survived depended on the
      // order a Firestore snapshot happened to arrive in. A reader tapping
      // `ni` was shown one of eight different words, with nothing to say it
      // was a choice, and could be shown a different one an hour later.
      final first = _zaanem.copyWith(id: 'ni-1', homographIndex: 1);
      final second = _zaanem.copyWith(id: 'ni-2', homographIndex: 2);
      final container = ProviderContainer(
        overrides: [
          publishedDictionaryEntriesProvider.overrideWith(
            // Deliberately out of sense order, because the index is what puts
            // them back in it.
            (ref) => Stream.value([second, first]),
          ),
        ],
      );
      addTearDown(container.dispose);
      // Listen first, then let the event loop turn — the same dance the test
      // above does. A StreamProvider read before its stream has emitted is
      // empty, not pending.
      container.listen(dictionaryIndexProvider, (_, _) {});
      await Future<void>.delayed(Duration.zero);

      final senses = container.read(dictionaryIndexProvider)['zaanem'];
      expect(senses, hasLength(2));
      expect(senses!.map((entry) => entry.homographIndex), [1, 2]);
    });

    test('a word is every letter and the marks on it, and nothing else', () {
      final words = wordPattern
          .allMatches('De zaanem, ba-yɔŋɔ!')
          .map((match) => match[0])
          .toList();
      expect(words, ['De', 'zaanem', 'ba-yɔŋɔ']);
    });
  });

  testWidgets('a word the dictionary knows is marked in the post', (
    tester,
  ) async {
    await tester.pumpWidget(
      _harness(
        const PostText(text: 'De zaanem, ko gara.', onOpenHandle: null),
        entries: const [_zaanem],
      ),
    );
    await tester.pump();

    final marked = _spans(tester)
        .where((span) => span.text == 'zaanem')
        .toList();
    expect(marked, hasLength(1));
    // Quiet: a hairline of dots, not a coloured link. A page of Kasem where
    // most words were links would be unreadable.
    expect(marked.single.style?.decoration, TextDecoration.underline);
    expect(marked.single.style?.decorationStyle, TextDecorationStyle.dotted);
    expect(marked.single.recognizer, isA<TapGestureRecognizer>());
  });

  testWidgets('tapping it opens what the word means', (tester) async {
    await tester.pumpWidget(
      _harness(
        const PostText(text: 'De zaanem, ko gara.', onOpenHandle: null),
        entries: const [_zaanem],
      ),
    );
    await tester.pump();

    final span = _spans(tester).firstWhere((span) => span.text == 'zaanem');
    (span.recognizer! as TapGestureRecognizer).onTap!();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Zaanem'), findsOneWidget);
    expect(find.text('Good evening'), findsOneWidget);
    expect(find.text('greeting · Nankana'), findsOneWidget);
    expect(find.text('Good evening to you.'), findsOneWidget);
    expect(find.text('Open the full entry'), findsOneWidget);
  });

  testWidgets('with no published dictionary a post is just writing', (
    tester,
  ) async {
    await tester.pumpWidget(
      _harness(const PostText(text: 'De zaanem, ko gara.', onOpenHandle: null)),
    );
    await tester.pump();

    final spans = _spans(tester);
    expect(spans.every((span) => span.recognizer == null), isTrue);
    expect(
      tester.widget<Text>(find.byType(Text).first).textSpan!.toPlainText(),
      'De zaanem, ko gara.',
    );
  });
}
