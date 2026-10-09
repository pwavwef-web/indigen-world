import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';
import 'package:indigen_world_mobile/core/support_channels.dart';
import 'package:indigen_world_mobile/features/settings/contact_support_screen.dart';
import 'package:indigen_world_mobile/features/settings/settings_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/url_launcher'),
          (call) async => false,
        );
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/url_launcher'),
          null,
        ),
  );
  testWidgets('Settings opens dedicated support and back returns to Settings', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appVersionProvider.overrideWith((ref) async => 'test version'),
        ],
        child: MaterialApp(
          theme: buildBrandTheme(BrandThemes.black, Brightness.dark),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const SettingsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Contact support'), 120);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Contact support'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Contact support'));
    await tester.pumpAndSettle();
    expect(find.byType(ContactSupportScreen), findsOneWidget);
    expect(find.text('Compose support email'), findsOneWidget);
    expect(find.text(SupportChannels.email), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.byType(ContactSupportScreen), findsNothing);
    expect(find.byType(SettingsScreen), findsOneWidget);
  });
  testWidgets('support has useful fallback feedback when no email app opens', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: ContactSupportScreen()));
    await tester.tap(find.text('Compose support email'));
    await tester.pumpAndSettle();
    expect(
      find.text('Could not open it. Try again, or copy the support email.'),
      findsOneWidget,
    );
    expect(find.text(SupportChannels.email), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 5));
  });
}
