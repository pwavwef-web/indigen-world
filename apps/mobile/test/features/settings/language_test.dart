// The reading language.
//
// Kassena live in francophone Burkina Faso and across a francophone diaspora,
// and the app used to be English with no way out of it. The rule these tests
// hold to is that **nobody should have to ask**: a phone already set to French
// opens a French app on first launch, with no setup step and no setting found.
// The picker exists only for the member whose phone language and reading
// language differ, which in a diaspora is an ordinary thing to be.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/app_locale.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/settings/settings_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
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

  /// Settings is a lazy list and Preferences sits below Account, so the rows
  /// under test have to be walked to rather than expected on the first frame.
  Future<void> scrollTo(WidgetTester tester, Finder target) async {
    await tester.scrollUntilVisible(target, 140);
    await tester.pump();
  }

  group('the stored choice', () {
    test('is absent until somebody asks for something else', () async {
      expect(await readStoredLocale(), isNull);
    });

    test('survives a restart once it has been made', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      await container
          .read(localeProvider.notifier)
          .setLocale(const Locale('fr'));
      expect(container.read(localeProvider), const Locale('fr'));
      expect(await readStoredLocale(), const Locale('fr'));
    });

    test('is removed again by going back to the device', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final controller = container.read(localeProvider.notifier);

      await controller.setLocale(const Locale('fr'));
      await controller.setLocale(null);

      // Null is the absence of a choice, not a third opinion about one.
      expect(await readStoredLocale(), isNull);
      final preferences = await SharedPreferences.getInstance();
      expect(preferences.getString(localePreferenceKey), isNull);
    });

    test(
      'a language the app no longer ships falls back to the device',
      () async {
        SharedPreferences.setMockInitialValues({localePreferenceKey: 'xx'});
        expect(await readStoredLocale(), isNull);
      },
    );
  });

  testWidgets('a French phone gets a French app without being asked', (
    tester,
  ) async {
    // No stored choice, and no locale passed: exactly the state every member is
    // in on first launch.
    tester.platformDispatcher.localesTestValue = const [Locale('fr')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);

    late AppLocalizations resolved;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) {
            resolved = AppLocalizations.of(context);
            return Text(resolved.navCommunity);
          },
        ),
      ),
    );

    expect(resolved.localeName, 'fr');
    expect(find.text('Communauté'), findsOneWidget);
  });

  testWidgets('Settings is written in the language it is read in', (
    tester,
  ) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(profiles: [fakeProfile()]),
        profile: fakeProfile(),
        locale: const Locale('fr'),
        child: const SettingsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    // Walk to the heading, so the group under it is on screen with it.
    await scrollTo(tester, find.text('PRÉFÉRENCES'));

    expect(find.text('PRÉFÉRENCES'), findsOneWidget);
    expect(find.text('Langue'), findsOneWidget);
    expect(find.text('Apparence'), findsOneWidget);
    // The default reads as following the phone, in the phone's own words.
    expect(find.text('Suivre mon appareil'), findsOneWidget);
  });

  testWidgets('the picker names every language in itself', (tester) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(profiles: [fakeProfile()]),
        profile: fakeProfile(),
        child: const SettingsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await scrollTo(tester, find.text('Language'));

    await tester.tap(find.text('Language'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // Not "French": somebody looking for their own language is scanning for the
    // word they would use for it, and may not read the list it sits in.
    expect(find.text('Français'), findsOneWidget);
    expect(find.text('English'), findsOneWidget);
    expect(find.text('Match my device'), findsWidgets);
  });

  testWidgets('choosing French is remembered for the next launch', (
    tester,
  ) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(profiles: [fakeProfile()]),
        profile: fakeProfile(),
        child: const SettingsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await scrollTo(tester, find.text('Language'));

    await tester.tap(find.text('Language'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Français'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    final container = ProviderScope.containerOf(
      tester.element(find.byType(SettingsScreen)),
    );
    expect(container.read(localeProvider), const Locale('fr'));
    expect(await readStoredLocale(), const Locale('fr'));
  });

  testWidgets('the community tab is written in it too', (tester) async {
    // The point of the machinery is the screens behind it. A French phone that
    // resolves to French and then shows an English feed has delivered nothing.
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(profiles: [fakeProfile()]),
        profile: fakeProfile(),
        locale: const Locale('fr'),
        child: const CommunityScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Communauté'), findsOneWidget);
    expect(find.text('Pour vous'), findsOneWidget);
    expect(find.text('Abonnements'), findsOneWidget);
    expect(find.text('Écrire en kasem'), findsOneWidget);
    expect(find.text('Nouvelles voix'), findsOneWidget);
  });

  testWidgets('the choice is what MaterialApp is given', (tester) async {
    // The one line in IndigenWorldApp that makes any of the above visible:
    // `locale: ref.watch(localeProvider)`. A French member on an English phone
    // gets nothing at all without it.
    tester.platformDispatcher.localesTestValue = const [Locale('en')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);

    await tester.pumpWidget(
      ProviderScope(
        child: Consumer(
          builder: (context, ref, _) => MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            locale: ref.watch(localeProvider),
            home: Builder(
              builder: (context) =>
                  Text(AppLocalizations.of(context).navCommunity),
            ),
          ),
        ),
      ),
    );
    expect(find.text('Community'), findsOneWidget);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(MaterialApp)),
    );
    await container.read(localeProvider.notifier).setLocale(const Locale('fr'));
    await tester.pump();

    expect(find.text('Communauté'), findsOneWidget);
  });
}
