// The Contribute tab, after it stopped being a form.
//
// It used to open on a five-way type picker sitting above every field of a
// dictionary submission, whether or not the member had come to submit
// anything. Somebody checking on last week's song had to scroll past an empty
// form to reach the status of it. These tests hold the tab to being a hub: two
// doors, the reviewers' one for the accounts that have it, and no fields.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kind_screen.dart';
import 'package:indigen_world_mobile/features/contribute/my_submissions_screen.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

Future<void> pumpHub(WidgetTester tester, {String? role}) async {
  tester.view.physicalSize = const Size(800, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [userRoleProvider.overrideWith((ref) async => role)],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: const ContributeScreen(standalone: true),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('the tab offers two doors and asks nothing', (tester) async {
    await pumpHub(tester);

    expect(find.text('Submit to Collections'), findsOneWidget);
    expect(find.text('Add a song, a word, a story or a film'), findsOneWidget);
    expect(find.text('Your submissions'), findsOneWidget);

    // The question and the fields have both moved to screens of their own.
    expect(find.text('What are you contributing?'), findsNothing);
    expect(find.byType(TextFormField), findsNothing);
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('an ordinary member is shown no review desk', (tester) async {
    // Not a locked one, not a greyed-out row: a door somebody can never open
    // invites the question and then refuses to answer it.
    for (final role in const [null, 'contributor', 'creator']) {
      await pumpHub(tester, role: role);
      expect(find.text('REVIEW DESK'), findsNothing, reason: '$role');
      await tester.pump(const Duration(milliseconds: 400));
    }
  });

  testWidgets('a reviewer still finds the desk at the top', (tester) async {
    await pumpHub(tester, role: 'validator');

    expect(find.text('REVIEW DESK'), findsOneWidget);
    // The desk sits above both member rows, because the work it reviews is
    // the work they send.
    expect(
      tester.getTopLeft(find.text('REVIEW DESK')).dy,
      lessThan(tester.getTopLeft(find.text('Submit to Collections')).dy),
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('nothing sent yet says so on the row itself', (tester) async {
    await pumpHub(tester);

    // Signed out in a test, so the stream is an empty list rather than a
    // failure — the row must not invent a number for that.
    expect(find.text('Nothing yet'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('Submit to Collections opens the chooser', (tester) async {
    await pumpHub(tester);

    await tester.tap(find.text('Submit to Collections'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(ContributionKindScreen), findsOneWidget);
    expect(find.text('What are you contributing?'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('Your submissions opens the list', (tester) async {
    await pumpHub(tester);

    await tester.tap(find.text('Your submissions'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(MySubmissionsScreen), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 500));
  });
}
