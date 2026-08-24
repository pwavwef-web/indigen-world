import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
      'Edit community profile',
      'Change password',
      'COMMUNITY',
      'Saved posts',
      'Community guidelines',
      'PREFERENCES',
      'Notifications',
      'Push alerts on this device',
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

  testWidgets('a member without a handle is invited to set one up', (
    tester,
  ) async {
    await pumpSettings(tester, withProfile: false);

    expect(find.text('Set up your community profile'), findsOneWidget);
    expect(
      find.text('Choose the handle the community knows you by'),
      findsOneWidget,
    );
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

  testWidgets('push alerts start off and name why they cannot be turned on', (
    tester,
  ) async {
    await pumpSettings(tester);

    await tester.scrollUntilVisible(find.byType(SwitchListTile), 120);
    await tester.pump();

    final toggle = find.byType(SwitchListTile).first;
    expect(tester.widget<SwitchListTile>(toggle).value, isFalse);

    await tester.tap(toggle);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // firebaseReadyProvider defaults to false in tests, so the toggle refuses —
    // and says which of the two possible reasons it is rather than blaming the
    // member's connection.
    expect(
      find.textContaining('Indigen World could not be reached'),
      findsOneWidget,
    );
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
