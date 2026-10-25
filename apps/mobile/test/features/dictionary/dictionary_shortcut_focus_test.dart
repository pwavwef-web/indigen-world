// The "Search the dictionary" shortcut on the app icon opens the dictionary
// with the keyboard up. On a phone, a native advert in the list attaches a
// moment after the page and takes input focus as it does; this stands that in
// with a plain focus node grabbing focus, which is what the platform view's
// focus node does.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/ads/collection_ads.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/dictionary_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late FocusNode advert;

  Future<void> open(WidgetTester tester, {required bool fromShortcut}) async {
    SharedPreferences.setMockInitialValues({});
    advert = FocusNode(debugLabel: 'advert');
    addTearDown(advert.dispose);
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          publishedDictionaryEntriesProvider.overrideWith(
            (ref) => Stream.value(const []),
          ),
          collectionAdsProvider.overrideWithValue(const []),
          savedDictionaryEntryIdsProvider.overrideWith(
            (ref) async => <String>{},
          ),
        ],
        child: MaterialApp(
          navigatorKey: navigator,
          home: const Scaffold(body: Text('home')),
        ),
      ),
    );
    navigator.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => Column(
          children: [
            Expanded(child: DictionaryScreen(autofocusSearch: fromShortcut)),
            Focus(focusNode: advert, child: const SizedBox(height: 1)),
          ],
        ),
      ),
    );
    // The test binding reports no lifecycle state, so the screen waits out
    // its two-second allowance for the app to come to the front.
    for (var i = 0; i < 30; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  bool searchFocused(WidgetTester tester) => tester
      .widget<TextField>(find.byType(TextField).first)
      .focusNode!
      .hasFocus;

  testWidgets('arriving from the shortcut focuses the search box', (
    tester,
  ) async {
    await open(tester, fromShortcut: true);
    expect(searchFocused(tester), isTrue);
  });

  testWidgets('an advert attaching does not take the keyboard away', (
    tester,
  ) async {
    await open(tester, fromShortcut: true);
    advert.requestFocus();
    await tester.pump();
    await tester.pump();
    expect(searchFocused(tester), isTrue);
  });

  testWidgets('once the member touches the screen, focus is theirs', (
    tester,
  ) async {
    await open(tester, fromShortcut: true);
    await tester.tapAt(const Offset(5, 300));
    await tester.pump();
    advert.requestFocus();
    await tester.pump();
    await tester.pump();
    expect(searchFocused(tester), isFalse);
  });

  testWidgets('the hold ends by itself after a few seconds', (tester) async {
    await open(tester, fromShortcut: true);
    await tester.pump(const Duration(seconds: 8));
    advert.requestFocus();
    await tester.pump();
    await tester.pump();
    expect(searchFocused(tester), isFalse);
  });

  testWidgets('opened any other way, nothing is focused', (tester) async {
    await open(tester, fromShortcut: false);
    expect(searchFocused(tester), isFalse);
  });
}
