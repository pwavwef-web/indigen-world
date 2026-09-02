// The strip of faces at the top of the Contribute hub.
//
// It has four states and three of them are the ones that go wrong: a community
// with fewer than five contributors, a community with none at all, and a read
// that failed. The failure mode this guards against is the placeholder — five
// grey circles standing in for people who do not exist, which on a young
// community never resolves into anything.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/leaderboard_screen.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/top_contributors_pill.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

ContributorScore score(
  String uid, {
  required int points,
  String displayName = '',
  String username = '',
  int streakDays = 0,
}) => ContributorScore(
  uid: uid,
  points: points,
  displayName: displayName,
  username: username,
  streakDays: streakDays,
  approvedCount: 1,
);

/// A board of [count] members, highest first, named after the letters.
List<ContributorScore> board(int count) => [
  for (var index = 0; index < count; index++)
    score(
      'uid-$index',
      points: 500 - (index * 40),
      displayName: 'Member ${String.fromCharCode(65 + index)}',
      username: 'member$index',
    ),
];

Future<void> pumpPill(
  WidgetTester tester, {
  List<ContributorScore>? rows,
  bool failing = false,
  List<KasemName> kasemNames = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        contributorScoresProvider.overrideWith(
          (ref) => failing
              ? Stream<List<ContributorScore>>.error(
                  StateError('permission-denied'),
                )
              : Stream.value(rows ?? const <ContributorScore>[]),
        ),
        kasemNamesProvider.overrideWithValue(kasemNames),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: const Scaffold(body: TopContributorsPill()),
      ),
    ),
  );
  // Two frames: one to build, one for the stream's first event to land.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('five contributors are five faces and one honest line', (
    tester,
  ) async {
    await pumpPill(tester, rows: board(5));

    expect(find.byType(CommunityAvatar), findsNWidgets(5));
    expect(find.text('Top contributors'), findsOneWidget);
    // All-time, because `points` is never reset. Claiming a month would be a
    // claim the number cannot keep.
    expect(find.text('All time · Member A leads'), findsOneWidget);
  });

  testWidgets('a sixth contributor does not get a sixth face', (tester) async {
    await pumpPill(tester, rows: board(9));

    expect(find.byType(CommunityAvatar), findsNWidgets(TopContributorsPill.faces));
  });

  testWidgets('three contributors draw three faces, not three and two ghosts', (
    tester,
  ) async {
    await pumpPill(tester, rows: board(3));

    expect(find.byType(CommunityAvatar), findsNWidgets(3));
    expect(find.text('All time · Member A leads'), findsOneWidget);
  });

  testWidgets('one contributor is not described as a crowd', (tester) async {
    await pumpPill(tester, rows: board(1));

    expect(find.byType(CommunityAvatar), findsOneWidget);
    expect(find.text('All time · one member has scored so far'), findsOneWidget);
  });

  testWidgets('an empty board invites rather than showing grey circles', (
    tester,
  ) async {
    await pumpPill(tester, rows: const []);

    expect(find.byType(CommunityAvatar), findsNothing);
    expect(find.text('Nobody has scored yet'), findsOneWidget);
    expect(
      find.text('Send the first contribution and the top is yours'),
      findsOneWidget,
    );
  });

  testWidgets('a read that failed says so instead of pretending', (
    tester,
  ) async {
    await pumpPill(tester, failing: true);

    expect(find.byType(CommunityAvatar), findsNothing);
    expect(find.text('Could not be loaded. Tap to try again.'), findsOneWidget);
  });

  testWidgets('a Kassena handle keeps its ring in the strip', (tester) async {
    await pumpPill(
      tester,
      rows: [
        score(
          'uid-kasem',
          points: 400,
          displayName: 'Awelimwe Adda',
          username: 'awelimwe',
        ),
      ],
      kasemNames: const [KasemName(name: 'Awɛlɩmwɛ', ascii: 'awelimwe')],
    );

    // The ring is drawn as a semantics container of its own, because it means
    // something and a colour alone cannot say what.
    expect(find.bySemanticsLabel('Carries a Kassena name'), findsOneWidget);
  });

  testWidgets('the strip opens the board', (tester) async {
    await pumpPill(tester, rows: board(5));

    await tester.tap(find.text('Top contributors'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(LeaderboardScreen), findsOneWidget);
  });

  testWidgets('so does the invitation, rather than a second screen', (
    tester,
  ) async {
    // Deliberately the same destination. An invitation that led somewhere
    // other than the thing it is inviting you to look at would be two screens
    // explaining one idea — and the board is where the scoring rules are
    // written down, which is exactly what somebody with nothing on it needs.
    await pumpPill(tester, rows: const []);

    await tester.tap(find.text('Nobody has scored yet'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(LeaderboardScreen), findsOneWidget);
  });
}
