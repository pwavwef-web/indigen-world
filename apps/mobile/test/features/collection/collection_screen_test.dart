import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/apps_and_shop.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_screen.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_data.dart';
import 'package:indigen_world_mobile/features/music/music_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

const _dictionary = [
  DictionaryEntry(
    id: 'entry-1',
    headword: 'Nia',
    translation: 'Greeting',
    partOfSpeech: 'Noun',
    dialect: 'Paga',
    pronunciation: 'nee-ah',
    example: 'Nia zaanem',
    exampleTranslation: 'Greeting in the morning',
    attribution: 'Project Kassena community dictionary',
    isSynthetic: false,
  ),
];

const _literature = [
  PublishedReel(
    id: 'story-1',
    title: 'The millet story',
    creatorName: 'Amina Awe',
    body: 'A harvest story from Paga.',
  ),
];

const _music = [
  PublishedReel(
    id: 'song-1',
    title: 'Rain song',
    creatorName: 'Amina Awe',
    mediaUrl: 'https://example.test/rain.mp3',
    mediaType: 'audio',
    category: 'Harvest',
  ),
  PublishedReel(
    id: 'song-2',
    title: 'Market morning',
    creatorName: 'Akolgo Nyaaba',
    mediaUrl: 'https://example.test/market.mp3',
    mediaType: 'audio',
  ),
];

const _heroes = [
  KasemHero(
    id: 'hero-1',
    name: 'Awe Atanga',
    field: 'Chief',
    era: 'c. 1890-1961',
    summary: 'Held Paga through the years the border was drawn across it.',
  ),
];

const _apps = [
  DirectoryApp(
    id: 'app-1',
    name: 'Kasem Keys',
    developer: 'Indigen World',
    description: 'A keyboard for Kasem writing.',
    category: 'Keyboard',
  ),
];

const _shop = [
  ShopProduct(
    id: 'product-1',
    name: 'Woven bookmark',
    summary: 'A handmade marker for books.',
    category: 'Craft',
    maker: 'Paga makers',
  ),
];

Widget _harness({
  List<PublishedReel> music = _music,
  List<DictionaryEntry> dictionary = _dictionary,
  List<PublishedReel> literature = _literature,
  List<PublishedReel> audiobooks = const [],
  List<KasemHero> heroes = _heroes,
  List<DirectoryApp> apps = _apps,
  List<ShopProduct> shop = _shop,
  TextScaler textScaler = const TextScaler.linear(1),
}) => ProviderScope(
  overrides: [
    musicCollectionProvider.overrideWith((ref) => Stream.value(music)),
    publishedDictionaryEntriesProvider.overrideWith(
      (ref) => Stream.value(dictionary),
    ),
    literatureCollectionProvider.overrideWith(
      (ref) => Stream.value(literature),
    ),
    audiobookCollectionProvider.overrideWith((ref) => Stream.value(audiobooks)),
    kasemHeroesProvider.overrideWith((ref) => Stream.value(heroes)),
    directoryAppsProvider.overrideWith((ref) => Stream.value(apps)),
    shopProductsProvider.overrideWith((ref) => Stream.value(shop)),
  ],
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: buildIndigenTheme(),
    darkTheme: buildIndigenDarkTheme(),
    themeMode: ThemeMode.dark,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: textScaler),
      child: child!,
    ),
    home: const CollectionScreen(),
  ),
);

Future<void> _pumpCollection(
  WidgetTester tester, {
  List<PublishedReel> music = _music,
  List<DictionaryEntry> dictionary = _dictionary,
  List<PublishedReel> literature = _literature,
  List<PublishedReel> audiobooks = const [],
  List<KasemHero> heroes = _heroes,
  List<DirectoryApp> apps = _apps,
  List<ShopProduct> shop = _shop,
  TextScaler textScaler = const TextScaler.linear(1),
}) async {
  await tester.pumpWidget(
    _harness(
      music: music,
      dictionary: dictionary,
      literature: literature,
      audiobooks: audiobooks,
      heroes: heroes,
      apps: apps,
      shop: shop,
      textScaler: textScaler,
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

Future<void> _show(WidgetTester tester, String text) async {
  await tester.scrollUntilVisible(
    find.text(text),
    180,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pump(const Duration(milliseconds: 100));
}

void _setAndroidViewport(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  testWidgets('shows the redesigned controls and real provider counts', (
    tester,
  ) async {
    await _pumpCollection(tester);

    expect(find.text('Kasem Collections'), findsOneWidget);
    expect(find.byKey(const Key('collection-search-field')), findsOneWidget);
    for (final label in const ['All', 'Published', 'Open']) {
      expect(find.text(label), findsOneWidget);
    }

    expect(find.text('Music'), findsOneWidget);
    expect(find.text('Dictionary'), findsOneWidget);
    expect(find.text('2 published'), findsOneWidget);
    expect(find.text('1 published'), findsWidgets);

    await _show(tester, 'Literature');
    expect(find.text('Literature'), findsOneWidget);
    await _show(tester, 'Audiobooks');
    expect(find.text('Audiobooks'), findsOneWidget);
    expect(find.text('0 published'), findsOneWidget);
    for (final label in const ['Heroes', 'Apps', 'Shop']) {
      await _show(tester, label);
      expect(find.text(label), findsOneWidget);
    }

    expect(find.text('1'), findsNothing);
    expect(find.text('2'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('debounced search finds loaded category content and can reset', (
    tester,
  ) async {
    await _pumpCollection(tester);

    await tester.enterText(
      find.byKey(const Key('collection-search-field')),
      'rain',
    );
    await tester.pump(const Duration(milliseconds: 120));

    expect(find.text('Dictionary'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 220));

    expect(find.text('Music'), findsOneWidget);
    expect(find.text('Dictionary'), findsNothing);

    await tester.enterText(
      find.byKey(const Key('collection-search-field')),
      'zzzz',
    );
    await tester.pump(const Duration(milliseconds: 320));

    expect(find.text('No results for "zzzz"'), findsOneWidget);
    await tester.tap(find.byKey(const Key('collection-reset-filters')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 220));

    expect(find.text('Music'), findsOneWidget);
    expect(find.text('Dictionary'), findsOneWidget);
  });

  testWidgets('published and open filters keep their distinct meanings', (
    tester,
  ) async {
    await _pumpCollection(tester);

    await tester.tap(find.byKey(const Key('collection-filter-published')));
    await tester.pump(const Duration(milliseconds: 220));

    expect(find.text('Music'), findsOneWidget);
    expect(find.text('Audiobooks'), findsNothing);

    await tester.tap(find.byKey(const Key('collection-filter-open')));
    await tester.pump(const Duration(milliseconds: 220));

    await _show(tester, 'Audiobooks');
    expect(find.text('Audiobooks'), findsOneWidget);
    expect(find.text('0 published'), findsOneWidget);
  });

  testWidgets('keeps search and filter state after opening a category', (
    tester,
  ) async {
    await _pumpCollection(tester);

    await tester.tap(find.byKey(const Key('collection-filter-published')));
    await tester.pump(const Duration(milliseconds: 220));
    await tester.enterText(
      find.byKey(const Key('collection-search-field')),
      'rain',
    );
    await tester.pump(const Duration(milliseconds: 320));
    await tester.tap(find.text('Music'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(MusicScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byKey(const Key('collection-search-field')), findsOneWidget);
    final search = tester.widget<TextField>(
      find.byKey(const Key('collection-search-field')),
    );
    expect(search.controller?.text, 'rain');
    expect(find.text('Music'), findsOneWidget);
    expect(find.text('Dictionary'), findsNothing);

    await tester.enterText(
      find.byKey(const Key('collection-search-field')),
      'Audiobooks',
    );
    await tester.pump(const Duration(milliseconds: 320));
    expect(find.text('No results for "Audiobooks"'), findsOneWidget);
  });

  testWidgets('shows polished skeletons while count streams load', (
    tester,
  ) async {
    final music = StreamController<List<PublishedReel>>();
    addTearDown(music.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          musicCollectionProvider.overrideWith((ref) => music.stream),
          publishedDictionaryEntriesProvider.overrideWith(
            (ref) => Stream.value(_dictionary),
          ),
          literatureCollectionProvider.overrideWith(
            (ref) => Stream.value(_literature),
          ),
          audiobookCollectionProvider.overrideWith(
            (ref) => Stream.value(const <PublishedReel>[]),
          ),
          kasemHeroesProvider.overrideWith((ref) => Stream.value(_heroes)),
          directoryAppsProvider.overrideWith((ref) => Stream.value(_apps)),
          shopProductsProvider.overrideWith((ref) => Stream.value(_shop)),
        ],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          theme: buildIndigenDarkTheme(),
          home: const CollectionScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(GlassSkeleton), findsWidgets);
  });

  testWidgets('fits a narrow Android viewport', (tester) async {
    _setAndroidViewport(tester, const Size(320, 640));
    await _pumpCollection(tester);

    for (final label in const [
      'Music',
      'Dictionary',
      'Literature',
      'Audiobooks',
    ]) {
      await _show(tester, label);
      expect(find.text(label), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('fits a standard Android viewport with scaled text', (
    tester,
  ) async {
    _setAndroidViewport(tester, const Size(393, 852));
    await _pumpCollection(tester, textScaler: const TextScaler.linear(1.45));

    for (final label in const [
      'Music',
      'Dictionary',
      'Literature',
      'Audiobooks',
      'Apps',
    ]) {
      await _show(tester, label);
      expect(find.text(label), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });
}
