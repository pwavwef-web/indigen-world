// The strip, in its actual home.
//
// Kept apart from the pill's own tests because what is under test here is the
// hub's ordering: a page of doors, with the one line of faces above them and
// the reviewers' desk still the first thing anybody who has one can act on.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/leaderboard_screen.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/top_contributors_pill.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

import 'top_contributors_pill_test.dart' show board;

Future<void> pumpHub(
  WidgetTester tester, {
  required List<ContributorScore> rows,
  String? role,
}) async {
  tester.view.physicalSize = const Size(800, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        userRoleProvider.overrideWith((ref) async => role),
        contributorScoresProvider.overrideWith((ref) => Stream.value(rows)),
      ],
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
  testWidgets('the hub opens on the people, then the doors', (tester) async {
    await pumpHub(tester, rows: board(5));

    expect(find.byType(TopContributorsPill), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Top contributors')).dy,
      lessThan(tester.getTopLeft(find.text('Submit to Collections')).dy),
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('the reviewers\' desk is still above both doors', (tester) async {
    await pumpHub(tester, rows: board(5), role: 'validator');

    expect(
      tester.getTopLeft(find.text('REVIEW DESK')).dy,
      lessThan(tester.getTopLeft(find.text('Submit to Collections')).dy),
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('tapping the strip on the hub opens the board', (tester) async {
    await pumpHub(tester, rows: board(5));

    await tester.tap(find.text('Top contributors'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(LeaderboardScreen), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 500));
  });
}
