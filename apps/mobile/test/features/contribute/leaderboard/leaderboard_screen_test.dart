// The board itself.
//
// The one thing it must never do is show somebody a list they are not on and
// leave them to guess. A member outside the fetched window gets their own row
// held at the bottom of the screen with their real place on it; a member inside
// it gets highlighted where they already are, and not drawn twice.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/leaderboard_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

import 'top_contributors_pill_test.dart' show board, score;

Future<void> pumpBoard(
  WidgetTester tester, {
  required List<ContributorScore> rows,
  ContributorScore? mine,
  int? myRank,
  bool failing = false,
  Size size = const Size(800, 1400),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        contributorScoresProvider.overrideWith(
          (ref) => failing
              ? Stream<List<ContributorScore>>.error(
                  StateError('permission-denied'),
                )
              : Stream.value(rows),
        ),
        myContributorScoreProvider.overrideWith((ref) => Stream.value(mine)),
        myLeaderboardRankProvider.overrideWith((ref) async => myRank),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: const LeaderboardScreen(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('the board is ranked, and says what earns a point', (
    tester,
  ) async {
    await pumpBoard(tester, rows: board(4));

    expect(find.text('1'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('500'), findsOneWidget);
    expect(find.text('Member A'), findsOneWidget);
    expect(find.text('@member0'), findsOneWidget);

    // A scoreboard whose arithmetic is invisible reads as arbitrary, and the
    // server's scale is flat precisely so it can be checked by hand.
    expect(find.text('HOW POINTS ARE EARNED'), findsOneWidget);
    expect(
      find.textContaining('when a reviewer approves something you sent'),
      findsOneWidget,
    );
    expect(find.text('A word for the dictionary'), findsOneWidget);
    expect(find.text('10'), findsOneWidget);
    expect(find.text('25'), findsOneWidget);
    expect(find.text('50'), findsOneWidget);
  });

  testWidgets('a member outside the top is pinned at the bottom', (
    tester,
  ) async {
    final mine = score(
      'uid-mine',
      points: 12,
      displayName: 'Yaw Atule',
      username: 'atule',
    );
    await pumpBoard(tester, rows: board(4), mine: mine, myRank: 412);

    // Their own row, once, with the place the aggregate count worked out.
    expect(find.text('Yaw Atule · you'), findsOneWidget);
    expect(find.text('412'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);

    // And it is below every row of the fetched window rather than in it.
    expect(
      tester.getTopLeft(find.text('Yaw Atule · you')).dy,
      greaterThan(tester.getTopLeft(find.text('Member D')).dy),
    );
  });

  testWidgets('a rank that could not be counted is a dash, not a nought', (
    tester,
  ) async {
    final mine = score('uid-mine', points: 12, displayName: 'Yaw Atule');
    await pumpBoard(tester, rows: board(4), mine: mine);

    expect(find.text('0'), findsNothing);
    expect(find.text('—'), findsOneWidget);
    expect(
      find.text('Your exact place could not be counted right now.'),
      findsOneWidget,
    );
  });

  testWidgets('a member inside the top is highlighted in place, not twice', (
    tester,
  ) async {
    final rows = board(4);
    await pumpBoard(
      tester,
      rows: rows,
      mine: rows[2],
      myRank: 3,
    );

    expect(find.text('Member C · you'), findsOneWidget);
    // No pinned bar underneath saying the same thing again.
    expect(
      find.text('Your exact place could not be counted right now.'),
      findsNothing,
    );
  });

  testWidgets('members on the same points share a place', (tester) async {
    await pumpBoard(
      tester,
      rows: [
        score('a', points: 90, displayName: 'Member A'),
        score('b', points: 40, displayName: 'Member B'),
        score('c', points: 40, displayName: 'Member C'),
        score('d', points: 10, displayName: 'Member D'),
      ],
    );

    // Second, second, then fourth — the ordinary competition rule, and the same
    // one the pinned row's aggregate count arrives at from the other end.
    expect(find.text('2'), findsNWidgets(2));
    expect(find.text('3'), findsNothing);
    expect(find.text('4'), findsOneWidget);
  });

  testWidgets('a streak of one is not a streak', (tester) async {
    await pumpBoard(
      tester,
      rows: [
        score('a', points: 90, displayName: 'Member A', streakDays: 1),
        score('b', points: 40, displayName: 'Member B', streakDays: 6),
      ],
    );

    expect(find.byIcon(Icons.local_fire_department_rounded), findsOneWidget);
    expect(find.text('6'), findsOneWidget);
  });

  testWidgets('a long name on a small phone does not burst the row', (
    tester,
  ) async {
    // Rank, portrait, name, handle, flame and score on one line is a lot to
    // ask of a 360-wide screen, and the name is the only part that can give.
    await pumpBoard(
      tester,
      rows: [
        score(
          'a',
          points: 1240,
          displayName: 'Awelimwe Adda-Nsoh of Chiana Nakong',
          username: 'awelimwe_adda_nsoh',
          streakDays: 14,
        ),
      ],
      mine: score(
        'mine',
        points: 8,
        displayName: 'Somebody With A Very Long Name Indeed',
        username: 'somebody_with_a_long_handle',
      ),
      myRank: 1207,
      size: const Size(360, 760),
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('an empty board asks for the first contribution', (tester) async {
    await pumpBoard(tester, rows: const []);

    expect(
      find.textContaining('Nobody has scored yet'),
      findsOneWidget,
    );
    expect(find.text('Send something'), findsOneWidget);
  });

  testWidgets('a failed read is reported, not drawn as an empty board', (
    tester,
  ) async {
    await pumpBoard(tester, rows: const [], failing: true);

    expect(find.text('The board could not be loaded.'), findsOneWidget);
    expect(find.text('Send something'), findsNothing);
  });
}
