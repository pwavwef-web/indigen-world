// The one question, on its own.
//
// Audiobooks are the reason this file exists as much as the chooser is:
// narrations are curated in the admin console now, and the phone must stop
// offering a form whose submissions all had to be taken apart by hand. The
// enum still has the kind — the Collection shelf and the player both need it —
// so nothing but this list stands between a member and a form we withdrew.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_form_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kind_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

Future<void> pumpChooser(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: const ContributionKindScreen(),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  test('the phone offers four kinds, and audiobooks is not one', () {
    expect(kMobileContributionKinds, const [
      CollectionKind.music,
      CollectionKind.dictionary,
      CollectionKind.literature,
      CollectionKind.video,
    ]);
    // Still in the enum on purpose: the Collection tab, the music player and
    // every narration already in review depend on it.
    expect(CollectionKind.values, contains(CollectionKind.audiobooks));
  });

  testWidgets('the chooser offers the acts, not the shelves', (tester) async {
    await pumpChooser(tester);

    expect(find.text('What are you contributing?'), findsOneWidget);

    // The dictionary is two cards now, because it is two different acts: a
    // word we hand you, and a saying nobody could have prompted you for. The
    // shelf's own name has gone from the chooser with them — "Dictionary" was
    // never a description of what somebody was about to do.
    expect(find.text('Translate a word'), findsOneWidget);
    expect(find.text('Add an idiom or proverb'), findsOneWidget);
    expect(find.text('Dictionary'), findsNothing);

    for (final label in const ['Music', 'Literature', 'Video']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('Audiobooks'), findsNothing);

    // Each card says what to bring, not just what the shelf is called.
    expect(
      find.text(contributionKindBlurb(CollectionKind.music)),
      findsOneWidget,
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('the saying card opens the form asking for a saying', (
    tester,
  ) async {
    await pumpChooser(tester);

    await tester.tap(find.text('Add an idiom or proverb'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(ContributionFormScreen), findsOneWidget);
    // The symptom the split was for: this box used to be labelled "English or
    // source word", which is a question a proverb has no answer to.
    expect(find.text('What it means in English'), findsOneWidget);
    expect(find.text('The saying, in Kasem'), findsOneWidget);
    expect(find.text('English or source word'), findsNothing);
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('choosing a kind opens the form for that kind alone', (
    tester,
  ) async {
    await pumpChooser(tester);

    await tester.tap(find.text('Music'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(ContributionFormScreen), findsOneWidget);
    expect(find.text('Song or recording title'), findsOneWidget);
    expect(find.text('Cover art'), findsOneWidget);
    // And the picker does not come with it: the kind is settled, so there is
    // no grid of alternatives left to change it mid-way.
    expect(find.byType(GridView), findsNothing);
    await tester.pump(const Duration(milliseconds: 500));
  });
}
