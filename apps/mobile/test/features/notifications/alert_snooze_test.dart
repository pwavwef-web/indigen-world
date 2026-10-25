import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/notifications/alert_snooze.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Snoozing alerts on this phone: when it ends, how it is said, and that the
/// renderer — which reads it fresh from disk in whatever isolate is drawing —
/// sees what the screen wrote.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('when a snooze ends', () {
    test('"until tomorrow morning" before seven means this morning', () {
      expect(
        nextSnoozeMorning(DateTime(2026, 10, 25, 2, 30)),
        DateTime(2026, 10, 25, 7),
      );
    });

    test('and after seven means the next day', () {
      expect(
        nextSnoozeMorning(DateTime(2026, 10, 25, 22, 15)),
        DateTime(2026, 10, 26, 7),
      );
      expect(
        nextSnoozeMorning(DateTime(2026, 10, 31, 7)),
        DateTime(2026, 11, 1, 7),
      );
    });

    test('the hour choices count from now', () {
      final now = DateTime(2026, 10, 25, 14);
      expect(SnoozeChoice.hour.endFrom(now), DateTime(2026, 10, 25, 15));
      expect(SnoozeChoice.eightHours.endFrom(now), DateTime(2026, 10, 25, 22));
    });
  });

  group('how it is said', () {
    final now = DateTime(2026, 10, 25, 14);

    test('today needs no day', () {
      expect(
        snoozeUntilLabel(DateTime(2026, 10, 25, 15, 30), now: now),
        'until 15:30',
      );
    });

    test('tomorrow is named, so 07:00 read at night is not ambiguous', () {
      expect(
        snoozeUntilLabel(DateTime(2026, 10, 26, 7), now: now),
        'until tomorrow 07:00',
      );
    });

    test('anything later names the date', () {
      expect(
        snoozeUntilLabel(DateTime(2026, 10, 28, 7), now: now),
        'until Oct 28 07:00',
      );
    });
  });

  group('what the renderer reads', () {
    test('nothing stored is not snoozed', () async {
      expect(await alertsSnoozedUntil(), isNull);
    });

    test('a snooze that has ended reads as none', () async {
      SharedPreferences.setMockInitialValues({
        alertSnoozeKey: DateTime(2026, 10, 25, 9).millisecondsSinceEpoch,
      });
      expect(await alertsSnoozedUntil(now: DateTime(2026, 10, 25, 10)), isNull);
      expect(
        await alertsSnoozedUntil(now: DateTime(2026, 10, 25, 8)),
        DateTime(2026, 10, 25, 9),
      );
    });

    test('snoozing and resuming from the screen reach the renderer', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      container.read(alertSnoozeProvider);
      await container
          .read(alertSnoozeProvider.notifier)
          .snooze(SnoozeChoice.hour);
      expect(container.read(alertSnoozeProvider), isNotNull);
      expect(await alertsSnoozedUntil(), isNotNull);

      await container.read(alertSnoozeProvider.notifier).resume();
      expect(container.read(alertSnoozeProvider), isNull);
      expect(await alertsSnoozedUntil(), isNull);
    });
  });

  testWidgets('the banner says until when, and Resume ends it', (tester) async {
    SharedPreferences.setMockInitialValues({
      alertSnoozeKey: DateTime.now()
          .add(const Duration(hours: 2))
          .millisecondsSinceEpoch,
    });
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildIndigenTheme(),
          home: const Scaffold(body: AlertSnoozeBanner()),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.textContaining('Alerts are silent until'), findsOneWidget);
    await tester.tap(find.text('Resume'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.textContaining('Alerts are silent'), findsNothing);
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getInt(alertSnoozeKey), isNull);
  });
}
