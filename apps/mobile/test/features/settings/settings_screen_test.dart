import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/notification_settings_screen.dart';
import 'package:indigen_world_mobile/features/settings/licences_screen.dart';
import 'package:indigen_world_mobile/features/settings/policy_screen.dart';
import 'package:indigen_world_mobile/features/settings/settings_screen.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../community/community_test_harness.dart';

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

  testWidgets('renders every section a member can act on', (tester) async {
    await pumpSettings(tester);

    expect(find.text('Settings'), findsOneWidget);
    // The list is lazy, so walk it rather than expecting everything at once.
    for (final label in const [
      'ACCOUNT',
      'Membership',
      'Change password',
      'COMMUNITY',
      'Saved posts',
      'Community guidelines',
      'PREFERENCES',
      'NOTIFICATIONS',
      'Notifications',
      'Notification settings',
      'PRIVACY AND DATA',
      'ABOUT',
      'Licences',
      'Terms of use',
    ]) {
      await tester.scrollUntilVisible(find.text(label), 120);
      await tester.pump();
      expect(find.text(label), findsOneWidget, reason: 'missing $label');
    }
  });

  testWidgets('the community profile is not editable from here any more', (
    tester,
  ) async {
    // It had three front doors — Overview, the Profile tab and this row — and
    // now has one, on the Profile tab. The identity card at the top of this
    // screen stays as a summary of who is signed in and goes nowhere.
    await pumpSettings(tester);

    expect(find.text('Edit community profile'), findsNothing);
    expect(find.text('Set up your community profile'), findsNothing);
    expect(find.text('Amina Ayaribisa'), findsOneWidget);
  });

  testWidgets('a guest is offered sign-in rather than sign-out', (
    tester,
  ) async {
    await pumpSettings(tester, uid: null, withProfile: false);

    expect(find.text('Sign in or create an account'), findsOneWidget);
    expect(find.text('Sign out'), findsNothing);
    expect(find.text('Guest learner'), findsOneWidget);
  });

  testWidgets('the app version is read from the package manifest', (
    tester,
  ) async {
    await pumpSettings(tester);

    await tester.scrollUntilVisible(find.text('Indigen World'), 200);
    await tester.pump();

    expect(find.textContaining('Version 0.1.0 (1)'), findsOneWidget);
  });

  testWidgets('Licences opens the licence catalogue', (tester) async {
    await pumpSettings(tester);

    await tester.scrollUntilVisible(find.text('Licences'), 200);
    await tester.pump();
    await tester.tap(find.text('Licences'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(LicencesScreen), findsOneWidget);
    expect(find.text('CONTENT LICENCES'), findsOneWidget);
  });

  testWidgets('the policy documents are reachable and readable offline', (
    tester,
  ) async {
    await pumpSettings(tester);

    await tester.scrollUntilVisible(find.text('Community guidelines'), 120);
    await tester.pump();
    await tester.tap(find.text('Community guidelines'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(PolicyScreen), findsOneWidget);
    expect(find.text('Kasem first'), findsOneWidget);
    expect(find.text('Respect what is not public'), findsOneWidget);
  });

  testWidgets('the notification controls are one tap away, not on this page', (
    tester,
  ) async {
    // Eleven switches used to sit between the app's theme and its privacy
    // policy. Nobody browses to them: they are reached in the middle of
    // something else, by somebody whose phone will not stop.
    await pumpSettings(tester);

    await tester.scrollUntilVisible(find.text('Notification settings'), 120);
    await tester.pump();
    expect(find.text('Push alerts on this device'), findsNothing);

    await tester.tap(find.text('Notification settings'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(NotificationSettingsScreen), findsOneWidget);
    expect(find.text('Push alerts on this device'), findsOneWidget);
  });

  testWidgets('deleting an account is a request, not a silent local wipe', (
    tester,
  ) async {
    await pumpSettings(tester);

    await tester.scrollUntilVisible(find.text('Delete your account'), 200);
    await tester.pump();
    await tester.tap(find.text('Delete your account'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Delete your account?'), findsOneWidget);
    expect(
      find.textContaining('carried out by the project team'),
      findsOneWidget,
    );
    expect(find.text('Request deletion'), findsOneWidget);
  });
}
