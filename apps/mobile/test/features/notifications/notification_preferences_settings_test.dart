import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_preferences.dart';
import 'package:indigen_world_mobile/features/notifications/notification_settings_screen.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../community/community_test_harness.dart';

/// The off switch, on its own page.
///
/// The backend fans one action out to many people — a reply wakes a whole
/// thread, a post wakes every follower — and a fan-out whose off switch is not
/// actually reachable is a fan-out with no off switch. So these check that the
/// controls exist, that they start in the state absence means, that the whole
/// lot can be silenced in one tap, and that a member with nowhere to store them
/// is told so rather than shown switches that would silently fail to save.
void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    PackageInfo.setMockInitialValues(
      appName: 'Indigen World',
      packageName: 'world.indigen.mobile',
      version: '0.1.0',
      buildNumber: '1',
      buildSignature: '',
    );
  });

  Future<void> pumpAlerts(
    WidgetTester tester, {
    String? uid = 'amina-uid',
    bool withProfile = true,
  }) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(
          profiles: withProfile ? [fakeProfile()] : const [],
        ),
        profile: withProfile ? fakeProfile() : null,
        uid: uid,
        child: const NotificationSettingsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  testWidgets('both axes are on the page, and named apart', (tester) async {
    // One is a property of this handset and one is a property of the account.
    // A member who silences their phone has not silenced their tablet, and the
    // headings are how they can tell.
    await pumpAlerts(tester);

    expect(find.text('Notification settings'), findsOneWidget);
    expect(find.text('ON THIS DEVICE'), findsOneWidget);
    expect(find.text('Push alerts on this device'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('WHAT WAKES YOU'), 120);
    await tester.pump();
    expect(find.text('WHAT WAKES YOU'), findsOneWidget);
  });

  testWidgets('every fan-out the backend runs has a switch on this page', (
    tester,
  ) async {
    await pumpAlerts(tester);

    for (final preference in NotificationPreference.values) {
      await tester.scrollUntilVisible(find.text(preference.title), 120);
      await tester.pump();
      expect(
        find.text(preference.title),
        findsOneWidget,
        reason: '${preference.key} has no switch',
      );
    }
  });

  testWidgets('a member who has never been here has everything switched on', (
    tester,
  ) async {
    // Absence means yes, here exactly as it does in the trigger that reads it.
    // Starting them off would have silently muted every account that existed
    // before this section shipped.
    await pumpAlerts(tester);

    await tester.scrollUntilVisible(
      find.text(NotificationPreference.followedPosts.title),
      120,
    );
    await tester.pump();

    final toggle = find.ancestor(
      of: find.text(NotificationPreference.followedPosts.title),
      matching: find.byType(SwitchListTile),
    );
    expect(tester.widget<SwitchListTile>(toggle).value, isTrue);
  });

  testWidgets('everything can be silenced without reading the list', (
    tester,
  ) async {
    // The member who most needs this page is the least inclined to read it.
    // Nine switches is nine taps and nine chances to leave the loud one on.
    await pumpAlerts(tester);

    await tester.scrollUntilVisible(find.text('Mute everything'), 120);
    await tester.pump();

    expect(find.text('Mute everything'), findsOneWidget);
    expect(
      find.text(
        'All ${NotificationPreference.values.length} kinds can wake you',
      ),
      findsOneWidget,
    );
  });

  testWidgets('a member with no handle is told where the switches live', (
    tester,
  ) async {
    // The preferences are stored on the community profile, so there is nowhere
    // to write them until there is one. Said plainly beats nine switches that
    // would move and then fail to save.
    await pumpAlerts(tester, withProfile: false);

    await tester.scrollUntilVisible(
      find.text('Set up your profile to choose'),
      120,
    );
    await tester.pump();

    expect(find.text('Set up your profile to choose'), findsOneWidget);
    expect(find.text(NotificationPreference.followedPosts.title), findsNothing);
    expect(find.text('Mute everything'), findsNothing);
  });
}
