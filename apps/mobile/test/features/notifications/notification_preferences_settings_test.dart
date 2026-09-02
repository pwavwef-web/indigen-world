import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_preferences.dart';
import 'package:indigen_world_mobile/features/settings/settings_screen.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../community/community_test_harness.dart';

/// The off switch, on the screen.
///
/// The backend now fans one action out to many people — a reply wakes a whole
/// thread, a post wakes every follower — and a fan-out whose off switch is not
/// actually reachable is a fan-out with no off switch. So these check that the
/// controls exist, that they start in the state absence means, and that a
/// member with nowhere to store them is told so rather than shown seven
/// switches that would silently fail to save.
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

  Future<void> pumpSettings(
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
        child: const SettingsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  testWidgets('every fan-out the backend runs has a switch on this screen', (
    tester,
  ) async {
    await pumpSettings(tester);

    await tester.scrollUntilVisible(find.text('WHAT WAKES YOU'), 120);
    await tester.pump();

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
    await pumpSettings(tester);

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

  testWidgets('a member with no handle is told where the switches live', (
    tester,
  ) async {
    // The preferences are stored on the community profile, so there is nowhere
    // to write them until there is one. Said plainly beats seven switches that
    // would move and then fail to save.
    await pumpSettings(tester, withProfile: false);

    await tester.scrollUntilVisible(
      find.text('Set up your profile to choose'),
      120,
    );
    await tester.pump();

    expect(find.text('Set up your profile to choose'), findsOneWidget);
    expect(
      find.text(NotificationPreference.followedPosts.title),
      findsNothing,
    );
  });
}
