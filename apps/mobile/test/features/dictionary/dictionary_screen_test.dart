// The dictionary as a screen, on the phone it is actually for.
//
// 0.1.16 shipped three destinations, a letter rail and a key bar above the
// keyboard with the note "nothing has been run on a device... the Kasem key
// bar's placement above the keyboard, the nav bar, and the letter rail on a
// 720p screen are the three things that most want a real phone." A phone then
// found that focusing the search box laid the key bar out at the full height of
// the display, so the Scaffold pinned it to the top and painted it over
// everything.
//
// A widget test is not a phone and this file does not pretend to be one — it
// cannot see a colour, a font or a gesture handle. What it can do is measure,
// at the size of the phone in question, and every failure above was a
// measurement: a bar as tall as the screen, a rail off the edge, a row that
// overflows. Those are now caught here rather than in somebody's hands.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/ads/collection_ads.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/dictionary_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/kasem_key_bar.dart';

/// A 720p phone in logical pixels — the device this app is built for.
const _phone = Size(360, 640);

DictionaryEntry word(String headword, String meaning) => DictionaryEntry(
  id: 'id_$headword',
  headword: headword,
  translation: meaning,
  partOfSpeech: 'Noun',
  dialect: 'Kasem',
  pronunciation: '',
  example: '',
  exampleTranslation: '',
  attribution: 'test',
);

final _archive = <DictionaryEntry>[
  word('bu', 'child'),
  word('dɩ', 'eat'),
  word('na', 'water'),
  word('ŋwaanɩ', 'because'),
  word('ʋ', 'he'),
];

void main() {
  Future<void> pumpDictionary(
    WidgetTester tester, {
    Set<String> saved = const <String>{},
  }) async {
    tester.view.physicalSize = _phone;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          publishedDictionaryEntriesProvider.overrideWith(
            (ref) => Stream.value(_archive),
          ),
          collectionAdsProvider.overrideWithValue(const []),
          savedDictionaryEntryIdsProvider.overrideWith((ref) async => saved),
        ],
        child: const MaterialApp(home: DictionaryScreen()),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  Future<void> go(WidgetTester tester, String destination) async {
    await tester.tap(find.text(destination));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('all three destinations stand up on a 720p screen', (
    tester,
  ) async {
    await pumpDictionary(tester);

    expect(find.text('Kasem dictionary'), findsOneWidget);
    expect(find.text('bu'), findsWidgets);
    expect(tester.takeException(), isNull);

    await go(tester, 'Browse');
    expect(tester.takeException(), isNull);

    await go(tester, 'Saved');
    expect(tester.takeException(), isNull);

    await go(tester, 'Look up');
    expect(tester.takeException(), isNull);
  });

  testWidgets('the nav bar sits at the bottom and is not half the screen', (
    tester,
  ) async {
    await pumpDictionary(tester);

    final bar = find.byType(NavigationBar);
    final size = tester.getSize(bar);
    expect(size.width, _phone.width);
    expect(
      size.height,
      lessThan(_phone.height / 4),
      reason: 'a nav rail taller than a quarter of a 720p screen is a bug',
    );
    expect(
      tester.getBottomLeft(bar).dy,
      _phone.height,
      reason: 'it belongs on the bottom edge, not floating above it',
    );
  });

  testWidgets('focusing the search box adds a strip, not a wall', (
    tester,
  ) async {
    await pumpDictionary(tester);

    // Nothing until a Kasem box has the cursor.
    expect(tester.getSize(find.byType(KasemKeyBar)).height, 0);

    await tester.tap(find.byType(TextField));
    await tester.pump();
    await tester.pump();

    final bar = tester.getSize(find.byType(KasemKeyBar));
    expect(bar.height, greaterThan(0), reason: 'the letters are offered');
    expect(
      bar.height,
      lessThan(100),
      reason: 'this measured 600 on a 600-pixel surface before the fix',
    );
    // And it did not push the nav rail off the phone, or take its place.
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(
      tester.getBottomLeft(find.byType(NavigationBar)).dy,
      _phone.height,
    );
    expect(
      tester.getBottomLeft(find.byType(KasemKeyBar)).dy,
      lessThanOrEqualTo(tester.getTopLeft(find.byType(NavigationBar)).dy + 0.5),
      reason: 'the letters sit above the rail, not over it',
    );
    // The search box the letters type into is still on screen.
    expect(find.byType(TextField), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a Kasem letter typed from the bar searches with it', (
    tester,
  ) async {
    await pumpDictionary(tester);

    await tester.tap(find.byType(TextField));
    await tester.pump();
    await tester.tap(find.byTooltip('ɩ — open i'));
    await tester.pump();
    await tester.pump();

    expect(find.text('dɩ'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the letter rail stays inside a 360-pixel screen', (
    tester,
  ) async {
    await pumpDictionary(tester);
    await go(tester, 'Browse');

    // Every letter the archive files under, drawn down the right-hand edge.
    // The bug worth catching is a rail that renders off the edge of a narrow
    // phone, so the assertion is on the geometry rather than the glyphs.
    for (final letter in ['b', 'd', 'n', 'ŋ', 'ʋ']) {
      final rail = find.text(letter.toUpperCase());
      if (rail.evaluate().isEmpty) continue;
      final box = tester.getRect(rail.first);
      expect(box.left, greaterThanOrEqualTo(0));
      expect(box.right, lessThanOrEqualTo(_phone.width));
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('the words a reader kept are the Saved destination', (
    tester,
  ) async {
    await pumpDictionary(tester, saved: {'id_na'});
    await go(tester, 'Saved');

    expect(find.text('na'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
