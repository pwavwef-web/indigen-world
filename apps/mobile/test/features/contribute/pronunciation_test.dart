// Saying the word, and hearing it said.
//
// The play button on a published entry has been a stub since the dictionary
// shipped, because no entry ever had a recording to play: the contribute form
// took spelling and a translation and nothing else. The word's own sound is now
// part of submitting it, and it survives review and publication as an
// `audioUrl` the entry screen can actually reach.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_form_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

void main() {
  group('the contribute form', () {
    Future<void> pumpForm(WidgetTester tester, CollectionKind kind) async {
      tester.view.physicalSize = const Size(800, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: ContributionFormScreen(kind: kind),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 400));
    }

    testWidgets('asks a dictionary contributor to say the word', (
      tester,
    ) async {
      await pumpForm(tester, CollectionKind.dictionary);

      expect(find.text('Say the word'), findsOneWidget);
      expect(find.text('Record pronunciation'), findsOneWidget);
      // Optional, and plainly so. Somewhere with no quiet room and no
      // microphone permission to give must still be able to send the word.
      expect(find.text('OPTIONAL'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('asks nobody else — a song is already a recording', (
      tester,
    ) async {
      await pumpForm(tester, CollectionKind.music);

      expect(find.text('Say the word'), findsNothing);
      expect(find.text('Record pronunciation'), findsNothing);
      await tester.pump(const Duration(milliseconds: 500));
    });
  });

  group('the published entry', () {
    test('reads a recording without spending the written guide on it', () {
      final entry = dictionaryEntryFromData('entry-1', {
        'kasemText': 'Konkwolo',
        'englishText': 'Bottle',
        'audioUrl': 'https://example.test/pronunciation.m4a',
        'isPublished': true,
      });

      expect(entry, isNotNull);
      expect(entry!.audioUrl, 'https://example.test/pronunciation.m4a');
      // The URL used to be the last fallback for `pronunciation`, so an entry
      // with audio rendered a download link where its phonetics belonged —
      // and still had nothing to play.
      expect(entry.pronunciation, isNot(contains('http')));
    });

    test('an entry with no recording carries an empty url, not a sentence', () {
      final entry = dictionaryEntryFromData('entry-2', {
        'kasemText': 'Konkwolo',
        'englishText': 'Bottle',
        'pronunciation': 'kon-KWO-lo',
        'isPublished': true,
      });

      expect(entry!.audioUrl, isEmpty);
      expect(entry.pronunciation, 'kon-KWO-lo');
    });

    testWidgets('says so when nobody has recorded the word yet', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,

          home: Scaffold(
            body: Center(child: PronunciationButton(audioUrl: '')),
          ),
        ),
      );
      await tester.pump();

      // A button rather than nothing at all: an absence explained in a sentence
      // tells somebody the entry is incomplete, where a missing control just
      // looks like a feature that was never built.
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
      await tester.tap(find.byType(PronunciationButton));
      await tester.pump();
      expect(
        find.textContaining('Nobody has recorded this word yet'),
        findsOneWidget,
      );
      await tester.pump(const Duration(seconds: 5));
    });
  });
}
