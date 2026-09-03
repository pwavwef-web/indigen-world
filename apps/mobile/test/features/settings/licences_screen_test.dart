import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/settings/licences_screen.dart';
import 'package:indigen_world_mobile/features/settings/policy_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: buildIndigenTheme(),
    home: child,
  );

  testWidgets('lists every content licence the rules accept', (tester) async {
    await tester.pumpWidget(wrap(const LicencesScreen()));
    await tester.pump();

    expect(find.text('Licences'), findsOneWidget);
    expect(find.text('CONTENT LICENCES'), findsOneWidget);

    for (final licence in contentLicences) {
      await tester.scrollUntilVisible(find.text(licence.name), 160);
      await tester.pump();
      expect(
        find.text(licence.name),
        findsOneWidget,
        reason: 'missing ${licence.code}',
      );
      expect(find.text(licence.code), findsOneWidget);
    }
  });

  testWidgets('the catalogue matches publicationLicenceAllowed in the rules', (
    tester,
  ) async {
    // firebase/firestore.rules: publicationLicenceAllowed(licence)
    expect(contentLicences.map((licence) => licence.code).toList(), const [
      'community_restricted',
      'cc_by',
      'cc_by_sa',
      'cc_by_nc',
      'public_domain',
    ]);
    // Every licence states both what it permits and what it requires.
    for (final licence in contentLicences) {
      expect(licence.permissions, isNotEmpty, reason: licence.code);
      expect(licence.conditions, isNotEmpty, reason: licence.code);
      expect(licence.summary, isNotEmpty, reason: licence.code);
    }
  });

  testWidgets('community post terms and open-source notices are reachable', (
    tester,
  ) async {
    await tester.pumpWidget(wrap(const LicencesScreen()));
    await tester.pump();

    await tester.scrollUntilVisible(find.text('COMMUNITY POSTS'), 200);
    await tester.pump();
    expect(find.text('Posts you write'), findsOneWidget);
    expect(
      find.textContaining('You keep ownership of what you post'),
      findsOneWidget,
    );

    await tester.scrollUntilVisible(find.text('Open-source licences'), 200);
    await tester.pump();
    await tester.tap(find.text('Open-source licences'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(LicensePage), findsOneWidget);
  });

  testWidgets('the corpus the example sentences come from is credited', (
    tester,
  ) async {
    // A licence condition, not a courtesy. The guided queue's English
    // sentences are Tatoeba, CC BY 2.0 FR, and this section is where the
    // corpus as a whole is credited — individual sentences carry their own
    // credit beside them wherever they are shown.
    await tester.pumpWidget(wrap(const LicencesScreen()));
    await tester.pump();

    await tester.scrollUntilVisible(find.text('SOURCE MATERIAL'), 200);
    await tester.pump();

    expect(find.text('English example sentences'), findsOneWidget);
    expect(find.textContaining('Tatoeba'), findsWidgets);
    expect(find.textContaining('CC BY 2.0 FR'), findsOneWidget);
    // Never invent a credit: a sentence written for this project is not
    // Tatoeba's, and the page has to say so rather than crediting everything.
    expect(find.textContaining('carry no Tatoeba credit'), findsOneWidget);
    // The boundary that matters: community Kasem is not under this licence.
    expect(
      find.textContaining('are not part of this licence'),
      findsOneWidget,
    );
  });

  group('PolicyScreen', () {
    testWidgets('privacy explains what leaves the device', (tester) async {
      await tester.pumpWidget(
        wrap(const PolicyScreen(document: PolicyDocument.privacy)),
      );
      await tester.pump();

      expect(find.text('Privacy and community data'), findsOneWidget);
      expect(find.text('What stays on your device'), findsOneWidget);
      expect(find.text('What your account stores'), findsOneWidget);
    });

    testWidgets('terms cover ownership and restricted cultural material', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(const PolicyScreen(document: PolicyDocument.terms)),
      );
      await tester.pump();

      expect(find.text('Terms of use'), findsOneWidget);
      expect(find.text('What you post'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Cultural material'), 160);
      await tester.pump();
      expect(find.text('Cultural material'), findsOneWidget);
    });

    testWidgets('guidelines put Kasem first', (tester) async {
      await tester.pumpWidget(
        wrap(const PolicyScreen(document: PolicyDocument.guidelines)),
      );
      await tester.pump();

      expect(find.text('Community guidelines'), findsOneWidget);
      expect(find.text('Kasem first'), findsOneWidget);
      expect(find.text('Learners are welcome'), findsOneWidget);
    });
  });
}
