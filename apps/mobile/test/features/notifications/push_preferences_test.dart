import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The rules deciding who gets asked about push alerts, and how often.
///
/// Worth testing on their own because the cost of getting them wrong is
/// invisible and permanent: Android grants one permission prompt per install,
/// so an extra ask is not an extra chance — it is a member who can no longer be
/// asked at all.
void main() {
  const now = 1756166400000; // 2025-08-26T00:00:00Z, an arbitrary fixed clock.
  DateTime at(Duration since) =>
      DateTime.fromMillisecondsSinceEpoch(now).add(since);

  group('pushPrimerNeeded', () {
    test('a fresh install has not been asked', () async {
      SharedPreferences.setMockInitialValues({});
      expect(await pushPrimerNeeded(), isTrue);
    });

    test('is false once the primer has been shown', () async {
      SharedPreferences.setMockInitialValues({pushPrimerShownKey: true});
      expect(await pushPrimerNeeded(), isFalse);
    });

    test('a decline still counts as having been asked', () async {
      // The one prompt is spent either way. A member who said no must not meet
      // the primer again on the next launch.
      SharedPreferences.setMockInitialValues({});
      await recordPushPrimerShown(granted: false);
      expect(await pushPrimerNeeded(), isFalse);
    });
  });

  group('recordPushPrimerShown', () {
    test('a grant records no decline to time out from', () async {
      SharedPreferences.setMockInitialValues({});
      await recordPushPrimerShown(granted: true);
      final preferences = await SharedPreferences.getInstance();
      expect(preferences.getBool(pushPrimerShownKey), isTrue);
      expect(preferences.getInt(pushDeclinedAtKey), isNull);
    });

    test('a decline is timestamped so the re-ask window can start', () async {
      SharedPreferences.setMockInitialValues({});
      await recordPushPrimerShown(granted: false);
      final preferences = await SharedPreferences.getInstance();
      expect(preferences.getInt(pushDeclinedAtKey), isNotNull);
    });
  });

  group('shouldOfferPushNudge', () {
    Map<String, Object> declined({required int at}) => {
      pushPrimerShownKey: true,
      pushAlertsPreferenceKey: false,
      pushDeclinedAtKey: at,
    };

    test('offers the second ask once the decline has aged out', () async {
      SharedPreferences.setMockInitialValues(declined(at: now));
      expect(await shouldOfferPushNudge(now: at(pushReaskInterval)), isTrue);
    });

    test('says nothing while the decline is still recent', () async {
      // Asking again the same afternoon is not a second chance, it is nagging.
      SharedPreferences.setMockInitialValues(declined(at: now));
      expect(
        await shouldOfferPushNudge(
          now: at(pushReaskInterval - const Duration(hours: 1)),
        ),
        isFalse,
      );
    });

    test('never asks somebody who already has alerts on', () async {
      SharedPreferences.setMockInitialValues({
        ...declined(at: now),
        pushAlertsPreferenceKey: true,
      });
      expect(
        await shouldOfferPushNudge(now: at(const Duration(days: 30))),
        isFalse,
      );
    });

    test('never asks somebody the primer has not reached yet', () async {
      // The primer is the first ask. A nudge before it would spend the prompt
      // on the wrong screen.
      SharedPreferences.setMockInitialValues({
        pushPrimerShownKey: false,
        pushDeclinedAtKey: now,
      });
      expect(
        await shouldOfferPushNudge(now: at(const Duration(days: 30))),
        isFalse,
      );
    });

    test('never asks somebody who granted and later turned it off', () async {
      // No decline recorded means the primer was answered yes; switching the
      // toggle off afterwards is a decision, not an invitation to re-ask.
      SharedPreferences.setMockInitialValues({
        pushPrimerShownKey: true,
        pushAlertsPreferenceKey: false,
      });
      expect(
        await shouldOfferPushNudge(now: at(const Duration(days: 30))),
        isFalse,
      );
    });

    test('the second ask is the last one', () async {
      SharedPreferences.setMockInitialValues(declined(at: now));
      expect(
        await shouldOfferPushNudge(now: at(const Duration(days: 30))),
        isTrue,
      );
      await recordPushNudgeShown();
      expect(
        await shouldOfferPushNudge(now: at(const Duration(days: 90))),
        isFalse,
      );
    });
  });
}
