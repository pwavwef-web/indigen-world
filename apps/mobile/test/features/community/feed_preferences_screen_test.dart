import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/feed_preferences_screen.dart';

void main() {
  Future<void> pump(
    WidgetTester tester, {
    String? uid = 'viewer',
    Map<String, dynamic> preferences = const {},
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUidProvider.overrideWithValue(uid),
          communityFeedPreferencesProvider.overrideWith(
            (ref) => Stream.value(preferences),
          ),
        ],
        child: const MaterialApp(home: FeedPreferencesScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('interests load without enabling optional tracking', (
    tester,
  ) async {
    await pump(
      tester,
      preferences: {
        'cultures': ['akan'],
        'topics': ['story'],
      },
    );
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller!.text,
      'akan',
    );
    expect(
      tester
          .widget<FilterChip>(find.widgetWithText(FilterChip, 'story'))
          .selected,
      isTrue,
    );
    await tester.scrollUntilVisible(
      find.text('Personalize from my activity'),
      300,
      scrollable: find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    final toggles = tester.widgetList<SwitchListTile>(
      find.byType(SwitchListTile),
    );
    expect(toggles.every((toggle) => !toggle.value), isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a muted topic can be restored before saving', (tester) async {
    await pump(
      tester,
      preferences: {
        'mutedTopics': ['music'],
      },
    );
    await tester.scrollUntilVisible(
      find.widgetWithText(InputChip, 'music'),
      300,
      scrollable: find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    final chip = tester.widget<InputChip>(
      find.widgetWithText(InputChip, 'music'),
    );
    chip.onDeleted!();
    await tester.pump();
    expect(find.widgetWithText(InputChip, 'music'), findsNothing);
  });

  testWidgets('guest preferences explain the sign-in requirement', (
    tester,
  ) async {
    await pump(tester, uid: null);
    expect(find.text('Sign in to choose your feed interests.'), findsOneWidget);
    expect(find.text('Save interests'), findsNothing);
  });
}
