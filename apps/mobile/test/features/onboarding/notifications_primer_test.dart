import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/features/onboarding/notifications_primer.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late bool done;

  Future<void> pumpPrimer(WidgetTester tester) async {
    done = false;
    // The default 800x600 test surface is shorter than any phone the app runs
    // on, and the primer is one screen with no scroll on a real device. Give
    // the test the same room, so "is the decline as reachable as the accept?"
    // is a real question rather than an artefact of the viewport.
    await tester.binding.setSurfaceSize(const Size(900, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: NotificationsPrimer(onDone: () => done = true),
        ),
      ),
    );
    await tester.pump();
  }

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('says what actually arrives before asking for anything', (
    tester,
  ) async {
    await pumpPrimer(tester);

    expect(find.text('Replies and mentions'), findsOneWidget);
    expect(find.text('Follows'), findsOneWidget);
    expect(find.text('Newly published work'), findsOneWidget);
    // Declining has to be as reachable as accepting, or the primer is a trick.
    expect(find.byKey(const Key('push-primer-allow')), findsOneWidget);
    expect(find.byKey(const Key('push-primer-decline')), findsOneWidget);
  });

  testWidgets('"Not now" records the decline and never spends the OS prompt', (
    tester,
  ) async {
    await pumpPrimer(tester);

    await tester.tap(find.byKey(const Key('push-primer-decline')));
    await tester.pumpAndSettle();

    final preferences = await SharedPreferences.getInstance();
    // Asked, answered no, and — crucially — alerts were never switched on
    // behind the member's back.
    expect(preferences.getBool(pushPrimerShownKey), isTrue);
    expect(preferences.getInt(pushDeclinedAtKey), isNotNull);
    expect(preferences.getBool(pushAlertsPreferenceKey), isNull);
    expect(done, isTrue);
  });

  testWidgets('a decline closes the primer for good, not just for now', (
    tester,
  ) async {
    await pumpPrimer(tester);
    await tester.tap(find.byKey(const Key('push-primer-decline')));
    await tester.pumpAndSettle();

    expect(await pushPrimerNeeded(), isFalse);
  });

  testWidgets('a device that cannot grant still lets the member through', (
    tester,
  ) async {
    // There is no Firebase in a test, so requesting permission throws — the
    // same shape as a handset with no Play Services. The member must not be
    // trapped on a screen whose only button fails silently.
    await pumpPrimer(tester);

    await tester.tap(find.byKey(const Key('push-primer-allow')));
    await tester.pumpAndSettle();

    expect(done, isTrue);
    expect(await pushPrimerNeeded(), isFalse);
  });
}
