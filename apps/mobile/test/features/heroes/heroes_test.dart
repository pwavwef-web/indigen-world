// The people the Kassena remember.
//
// The archive spent its first year collecting words and none of it said who
// spoke them. Heroes is the other half: an admin-curated directory in
// Collection, and one life a week on the way into Learn.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/heroes/hero_detail_screen.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_data.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

const _heroes = [
  KasemHero(
    id: 'awe-chief',
    name: 'Awe Atanga',
    alsoKnownAs: 'Pe-Awe',
    era: 'c. 1890–1961',
    field: 'Chief',
    summary: 'Held Paga through the years the border was drawn across it.',
    story: 'A longer account of the same life, for the page of their own.',
    birthplace: 'Paga',
    sourceUrl: 'https://example.test/awe',
  ),
  KasemHero(
    id: 'nyaaba-linguist',
    name: 'Akolgo Nyaaba',
    era: 'born 1948',
    field: 'Linguist',
    summary: 'Wrote the first Kasem orthography anybody could teach from.',
  ),
];

Widget _harness(Widget child, {List<KasemHero> heroes = _heroes}) =>
    ProviderScope(
      overrides: [
        kasemHeroesProvider.overrideWith((ref) => Stream.value(heroes)),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: child,
      ),
    );

void main() {
  group('a hero', () {
    test('reads as their calling and their years, with whichever exist', () {
      expect(_heroes[0].subtitle, 'Chief · c. 1890–1961');
      expect(
        const KasemHero(id: 'x', name: 'A B', field: 'Elder').subtitle,
        'Elder',
      );
      expect(const KasemHero(id: 'x', name: 'A B').subtitle, '');
    });

    test('falls back to initials, which is not a missing photograph', () {
      // Most of these people lived before a camera reached Paga.
      expect(_heroes[0].initials, 'AA');
      expect(const KasemHero(id: 'x', name: 'Awe').initials, 'AW');
      expect(const KasemHero(id: 'x', name: '').initials, '··');
    });
  });

  testWidgets('the list names everyone the project has published', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(const HeroesCollectionScreen()));
    await tester.pump();

    expect(find.text('Awe Atanga'), findsOneWidget);
    expect(find.text('Akolgo Nyaaba'), findsOneWidget);
    expect(find.text('Chief · c. 1890–1961'), findsOneWidget);
  });

  testWidgets('an empty directory says so rather than spinning', (
    tester,
  ) async {
    await tester.pumpWidget(
      _harness(const HeroesCollectionScreen(), heroes: const []),
    );
    await tester.pump();

    expect(find.text('Nobody has been added yet'), findsOneWidget);
  });

  testWidgets('opening one gives the whole account and where it came from', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(const HeroesCollectionScreen()));
    await tester.pump();

    await tester.tap(find.text('Awe Atanga'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(HeroDetailScreen), findsOneWidget);
    expect(find.text('Pe-Awe'), findsOneWidget);
    expect(
      find.text('A longer account of the same life, for the page of their own.'),
      findsOneWidget,
    );
    // An archive that cannot be checked is a rumour with a logo on it.
    expect(find.text('Where this came from'), findsOneWidget);
  });

  testWidgets('a hero with no source offers no link to one', (tester) async {
    await tester.pumpWidget(
      _harness(HeroDetailScreen(hero: _heroes[1])),
    );
    await tester.pump();

    expect(find.text('Where this came from'), findsNothing);
  });

  test('the hero of the week is the same all week for everybody', () async {
    final container = ProviderContainer(
      overrides: [
        kasemHeroesProvider.overrideWith((ref) => Stream.value(_heroes)),
      ],
    );
    addTearDown(container.dispose);
    // A listener keeps the stream alive; a turn of the event loop lets it emit.
    container.listen(heroOfTheWeekProvider, (_, _) {});
    await Future<void>.delayed(Duration.zero);

    // Deterministic, so two people in a room meet the same person and closing
    // the app does not reroll it.
    final first = container.read(heroOfTheWeekProvider);
    expect(first, isNotNull);
    expect(container.read(heroOfTheWeekProvider), same(first));
  });

  test('and there is none at all before anybody is published', () {
    final container = ProviderContainer(
      overrides: [
        kasemHeroesProvider.overrideWith(
          (ref) => Stream.value(const <KasemHero>[]),
        ),
      ],
    );
    addTearDown(container.dispose);
    expect(container.read(heroOfTheWeekProvider), isNull);
  });
}
