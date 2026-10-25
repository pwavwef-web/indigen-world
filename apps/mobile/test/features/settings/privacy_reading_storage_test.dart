// Undoing a block or a mute, read receipts, a reading size and place, and the
// cached-pictures row.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/media_cache.dart';
import 'package:indigen_world_mobile/features/collection/reading_preferences.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/settings/privacy_controls_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  group('cached pictures', () {
    test('sizes are written the way a phone writes them', () {
      expect(formatBytes(0), '0 B');
      expect(formatBytes(900), '900 B');
      expect(formatBytes(2048), '2 KB');
      expect(formatBytes(5 * 1024 * 1024 + 300 * 1024), '5.3 MB');
      expect(formatBytes(250 * 1024 * 1024), '250 MB');
      expect(formatBytes(3 * 1024 * 1024 * 1024), '3.0 GB');
    });
  });

  group('reading', () {
    test('the size steps through the offered sizes and stops at the ends', () {
      expect(stepReadingScale(1, larger: true), 1.15);
      expect(stepReadingScale(1, larger: false), 0.9);
      expect(
        stepReadingScale(readingScales.last, larger: true),
        readingScales.last,
      );
      expect(
        stepReadingScale(readingScales.first, larger: false),
        readingScales.first,
      );
    });

    test('a place is kept per work, the oldest dropped past the limit', () {
      var places = <String, double>{};
      for (var index = 0; index < 5; index++) {
        places = withReadingPlace(places, 'w$index', 100.0 + index, limit: 3);
      }
      expect(places.keys, ['w2', 'w3', 'w4']);
      // Reading one again makes it the newest.
      places = withReadingPlace(places, 'w2', 900, limit: 3);
      expect(places.keys.last, 'w2');
      // Back at the top is no place at all.
      places = withReadingPlace(places, 'w3', 0, limit: 3);
      expect(places.containsKey('w3'), isFalse);
    });

    test('the place survives storage', () async {
      await saveReadingPlace('work', 1234.5);
      expect(await readingPlaceOf('work'), 1234.5);
      expect(await readingPlaceOf('other'), isNull);
    });
  });

  testWidgets('blocked and muted members are listed with the way back', (
    tester,
  ) async {
    final container = ProviderContainer(
      overrides: [
        currentUidProvider.overrideWithValue('me'),
        communityRepositoryProvider.overrideWithValue(null),
        myBlockedProfilesProvider.overrideWith(
          (ref) => Stream.value({'blocked-member'}),
        ),
        myMutedProfilesProvider.overrideWith(
          (ref) => Stream.value({'muted-member'}),
        ),
        communityProfileProvider.overrideWith((ref, uid) => Stream.value(null)),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: buildIndigenTheme(),
          home: const PrivacyControlsScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.byKey(const ValueKey('privacy-person-blocked-member')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('privacy-person-muted-member')),
      findsOneWidget,
    );
    expect(find.text('Unblock'), findsOneWidget);
    expect(find.text('Unmute'), findsOneWidget);

    expect(container.read(chatReadReceiptsProvider), isTrue);
    await tester.tap(find.byKey(const Key('privacy-read-receipts')));
    await tester.pump();
    expect(container.read(chatReadReceiptsProvider), isFalse);
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getBool(chatReadReceiptsPreferenceKey), isFalse);
  });

  testWidgets('with nobody blocked or muted, each list says so', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUidProvider.overrideWithValue('me'),
          myBlockedProfilesProvider.overrideWith(
            (ref) => Stream.value(const <String>{}),
          ),
          myMutedProfilesProvider.overrideWith(
            (ref) => Stream.value(const <String>{}),
          ),
        ],
        child: MaterialApp(
          theme: buildIndigenTheme(),
          home: const PrivacyControlsScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('Nobody. A blocked member'), findsOneWidget);
    expect(find.textContaining('Nobody. Muting hides'), findsOneWidget);
  });
}
