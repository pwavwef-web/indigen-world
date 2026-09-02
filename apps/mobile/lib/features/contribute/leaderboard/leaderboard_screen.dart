import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kind_screen.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The contribution leaderboard.
///
/// Everybody who has had work approved, highest first, with the member's own
/// row never off the screen. That last part is the whole reason this is a
/// screen rather than a list: a board that shows you the top fifty and then
/// leaves you to wonder where you are is a board you look at once. Somebody in
/// position four hundred gets their own row pinned to the bottom, with their
/// real rank on it, so opening this always answers the question they opened it
/// with.
///
/// The scoring rules are printed at the top for the same reason. A scoreboard
/// whose arithmetic is invisible reads as arbitrary, and the one thing this
/// board must not feel like is a number somebody made up about your work.
class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scores = ref.watch(contributorScoresProvider);
    final mine = ref.watch(myContributorScoreProvider).asData?.value;
    final rows = scores.asData?.value ?? const <ContributorScore>[];

    // Where the member sits in the fetched window, or -1 for "further down than
    // this screen ever asked for".
    final myIndex = mine == null
        ? -1
        : rows.indexWhere((row) => row.uid == mine.uid);
    final pinned = mine != null && myIndex < 0;

    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(title: const Text('Top contributors')),
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            ListView(
              padding: EdgeInsets.fromLTRB(
                18,
                12,
                18,
                (pinned ? 118 : 34) + musicInset(context),
              ),
              children: [
                const _HowPointsWork(),
                const SizedBox(height: 14),
                switch (scores) {
                  AsyncError() => const GlassEmptyState(
                    icon: Icons.cloud_off_rounded,
                    title: 'The board could not be loaded.',
                  ),
                  AsyncData(value: final rows) when rows.isEmpty =>
                    const _NobodyYet(),
                  AsyncData(value: final rows) => _Board(
                    rows: rows,
                    myUid: mine?.uid,
                  ),
                  // First paint, before the snapshot lands. Two bars rather
                  // than a spinner: the list is about to be this shape, and a
                  // spinner in the middle of a page tells you nothing about
                  // what is coming.
                  _ => const Column(
                    children: [
                      GlassSkeleton(height: 132),
                      SizedBox(height: 12),
                      GlassSkeleton(height: 132),
                    ],
                  ),
                },
              ],
            ),
            if (pinned)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: _PinnedOwnRow(score: mine),
              ),
          ],
        ),
      ),
    );
  }
}

/// The ranked list itself.
///
/// One pane with hairlines between the rows rather than fifty separate cards.
/// A leaderboard is a table — the eye reads down the rank column and down the
/// points column — and fifty floating cards break both of those columns into
/// fifty unrelated things.
class _Board extends StatelessWidget {
  const _Board({required this.rows, this.myUid});

  final List<ContributorScore> rows;
  final String? myUid;

  @override
  Widget build(BuildContext context) {
    final ranks = leaderboardRanks(rows);
    return GlassSurface(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        // The glass draws its own rounded edge but does not clip what is inside
        // it, so the highlighted row's fill would square off the top corner
        // without this.
        borderRadius: BorderRadius.circular(kGlassRadius - 1),
        child: Material(
          color: Colors.transparent,
          child: Column(
            children: [
              for (var index = 0; index < rows.length; index++) ...[
                if (index > 0)
                  Divider(height: 1, color: context.brand.divider, indent: 16),
                _LeaderboardRow(
                  rank: ranks[index],
                  score: rows[index],
                  isMe: myUid != null && rows[index].uid == myUid,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Competition ranks for an already-ordered list: ties share the higher place,
/// and the place after a tie skips.
///
/// Shared with [myLeaderboardRankProvider], which counts everybody strictly
/// above a score and adds one — the same rule, arrived at from the other end.
/// Positional numbering (index + 1) was what this did first, and it meant two
/// members on the same points were shown as fourth and fifth on the list while
/// the pinned row underneath called them both fourth.
List<int> leaderboardRanks(List<ContributorScore> rows) {
  final ranks = <int>[];
  for (var index = 0; index < rows.length; index++) {
    final tied = index > 0 && rows[index].points == rows[index - 1].points;
    ranks.add(tied ? ranks[index - 1] : index + 1);
  }
  return ranks;
}

/// One member's line.
class _LeaderboardRow extends StatelessWidget {
  const _LeaderboardRow({
    required this.rank,
    required this.score,
    this.isMe = false,
  });

  final int rank;
  final ContributorScore score;

  /// Draws the row in the accent wash, wherever it happens to fall.
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      selected: isMe,
      label: _semantics(),
      excludeSemantics: true,
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (context) => CommunityProfileScreen(uid: score.uid),
          ),
        ),
        child: Ink(
          color: isMe ? brand.accentSoft : Colors.transparent,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
            child: Row(
              children: [
                SizedBox(
                  width: 26,
                  child: Text(
                    // Zero is the caller's way of saying "not counted", and a
                    // literal 0 in a rank column would be read as a place.
                    rank > 0 ? '$rank' : '—',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _rankColour(brand),
                      fontSize: rank > 99 ? 13 : 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                CommunityAvatar(
                  initials: score.initials,
                  imageUrl: score.avatarUrl,
                  username: score.username,
                  size: 38,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isMe ? '${score.name} · you' : score.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (score.username.isNotEmpty)
                        Text(
                          '@${score.username}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: brand.mutedInk,
                            fontSize: 11.5,
                          ),
                        ),
                    ],
                  ),
                ),
                if (score.hasStreak) ...[
                  const SizedBox(width: 8),
                  _StreakFlame(days: score.streakDays),
                ],
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${score.points}',
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        height: 1.1,
                      ),
                    ),
                    Text(
                      'points',
                      style: TextStyle(color: brand.mutedInk, fontSize: 10.5),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// The first three places are worth marking and the rest are not.
  ///
  /// Gold, then the two brand colours that sit either side of it. Deliberately
  /// not a medal glyph: a trophy on row one and nothing on row four turns a
  /// list into a podium, and this board's job is to show a long tail of people
  /// who are all doing the same worthwhile thing.
  Color _rankColour(BrandPalette brand) => switch (rank) {
    1 => brand.gold,
    2 => brand.accent,
    3 => brand.terracotta,
    _ => brand.mutedInk,
  };

  String _semantics() {
    final streak = score.hasStreak ? ', ${score.streakDays} day streak' : '';
    final who = isMe ? 'You, ' : '';
    final place = rank > 0 ? 'rank $rank' : 'rank not counted';
    return '$who${score.name}, $place, ${score.points} points$streak';
  }
}

/// The flame beside a member who came back.
class _StreakFlame extends StatelessWidget {
  const _StreakFlame({required this.days});

  final int days;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      // The same orange the Learn tab's streak wears. A streak is a streak
      // wherever it is counted, and giving this one the accent instead would
      // have made two different things look like one colour's idea.
      const Icon(
        Icons.local_fire_department_rounded,
        size: 16,
        color: Color(0xFFE0763C),
      ),
      const SizedBox(width: 2),
      Text(
        '$days',
        style: TextStyle(
          color: context.brand.mutedInk,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    ],
  );
}

/// The member's own row, held at the bottom when they are below the window.
///
/// Opaque rather than glass: the list scrolls underneath it, and a translucent
/// bar with names sliding about behind the member's own name was unreadable
/// within about two seconds of scrolling.
class _PinnedOwnRow extends ConsumerWidget {
  const _PinnedOwnRow({required this.score});

  final ContributorScore score;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final rank = ref.watch(myLeaderboardRankProvider).asData?.value;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: brand.surfaceElevated,
        border: Border(top: BorderSide(color: brand.border)),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(4, 4, 4, 8 + musicInset(context)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Material(
              color: Colors.transparent,
              child: _LeaderboardRow(
                // Zero would print as a rank, so a rank that could not be
                // counted shows as a dash instead — see the row below.
                rank: rank ?? 0,
                score: score,
                isMe: true,
              ),
            ),
            if (rank == null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 4),
                child: Text(
                  'Your exact place could not be counted right now.',
                  style: TextStyle(color: brand.mutedInk, fontSize: 11),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// What the board is for, when there is nobody on it.
class _NobodyYet extends StatelessWidget {
  const _NobodyYet();

  @override
  Widget build(BuildContext context) => GlassEmptyState(
    icon: Icons.emoji_events_outlined,
    title: 'Nobody has scored yet. The first approved contribution takes '
        'the top of this board.',
    action: FilledButton(
      onPressed: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => const ContributionKindScreen(),
        ),
      ),
      child: const Text('Send something'),
    ),
  );
}

/// The rules, with the actual numbers on them.
///
/// Printing the table was a real decision and it went the other way first. The
/// obvious worry is drift: the arithmetic lives in
/// `services/functions/src/contributor-scores.ts`, it can be changed without
/// shipping an app, and a stale table here would be worse than no table.
///
/// It is printed anyway, because the server's scale was deliberately built to
/// be printable — flat, three numbers, no multipliers, no decay, no "your
/// fifth word this week counts double" — and the comment above it says why:
/// somebody who reads an alert saying they earned 25 points is going to want
/// to know why, and a total nobody can check by hand is one people stop
/// believing the first time it moves unexpectedly. Vagueness here would have
/// undone that on the one screen where the question is actually asked.
///
/// [kPointsPerWord], [kPointsPerWrittenPiece] and [kPointsPerRecording] mirror
/// `CONTRIBUTION_POINTS`. If that table moves, these move with it.
class _HowPointsWork extends StatelessWidget {
  const _HowPointsWork();

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'HOW POINTS ARE EARNED',
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 9.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 10),
          const _Rule(
            icon: Icons.verified_rounded,
            text: 'Points land when a reviewer approves something you sent — '
                'not when you send it.',
          ),
          const SizedBox(height: 4),
          const _PointsRow(
            points: kPointsPerWord,
            label: 'A word for the dictionary',
          ),
          const _PointsRow(
            points: kPointsPerWrittenPiece,
            label: 'A proverb, an idiom or a story written down',
          ),
          const _PointsRow(
            points: kPointsPerRecording,
            label: 'A song, a recording or a film',
          ),
          const SizedBox(height: 10),
          const _Rule(
            // A calendar rather than the flame the rows wear: the flame is a
            // badge somebody has, and this line is about the habit that earns
            // it. Reusing the glyph would also have meant a leaderboard where
            // half the flames on screen belonged to nobody.
            icon: Icons.event_repeat_rounded,
            text: 'Contributing on consecutive days keeps a streak alive.',
          ),
          const _Rule(
            icon: Icons.lock_outline_rounded,
            text: 'The score is written by the server. Nothing on your phone '
                'can change it.',
            last: true,
          ),
        ],
      ),
    );
  }
}

/// What one accepted dictionary word pays.
///
/// These three mirror `CONTRIBUTION_POINTS` in
/// `services/functions/src/contributor-scores.ts`, which is the only place the
/// number is actually applied. They are named constants rather than literals in
/// the widget so that the next person changing the server table can grep the
/// value and find the one screen that repeats it.
const int kPointsPerWord = 10;

/// What a proverb, an idiom or a written story pays.
const int kPointsPerWrittenPiece = 25;

/// What a song, a spoken recording or a film pays.
const int kPointsPerRecording = 50;

/// One line of the points table.
class _PointsRow extends StatelessWidget {
  const _PointsRow({required this.points, required this.label});

  final int points;
  final String label;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 26,
            child: Text(
              '$points',
              textAlign: TextAlign.right,
              style: TextStyle(
                color: brand.gold,
                fontSize: 13.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule({required this.icon, required this.text, this.last = false});

  final IconData icon;
  final String text;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: brand.accent),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: brand.mutedInk,
                fontSize: 12.5,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
