import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kind_screen.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:indigen_world_mobile/shared/kassena_pattern.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

part 'points_hero.dart';

/// Mirror CONTRIBUTION_POINTS in services/functions/src/contributor-scores.ts.
/// Awards and ranks come from the server; this page never writes a score.
const int kPointsPerWord = 10;
const int kPointsPerWrittenPiece = 25;
const int kPointsPerRecording = 50;

class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scores = ref.watch(contributorScoresProvider);
    final ownScore = ref.watch(myContributorScoreProvider);
    final mine = ownScore.asData?.value;
    final rows = scores.asData?.value ?? const <ContributorScore>[];
    final pinned = mine != null && !rows.any((row) => row.uid == mine.uid);

    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        title: const Text('Points'),
        actions: [
          IconButton(
            tooltip: 'About points',
            onPressed: () => _showPointsInfo(context),
            icon: const Icon(Icons.info_outline_rounded, size: 22),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: EntranceGate(
              child: CustomScrollView(
                key: const PageStorageKey('contributor-points'),
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                    sliver: SliverList.list(
                      children: [
                        Entrance(child: _PointsHero(score: ownScore)),
                        const SizedBox(height: 24),
                        const Entrance(index: 2, child: _EarnPoints()),
                        const SizedBox(height: 28),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Top contributors',
                                style: TextStyle(
                                  color: context.brand.ink,
                                  fontSize: 21,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.7,
                                ),
                              ),
                            ),
                            const _SmallLabel(text: 'ALL TIME'),
                          ],
                        ),
                        const SizedBox(height: 18),
                        if (scores.hasError)
                          _BoardMessage(
                            icon: Icons.cloud_off_rounded,
                            title: 'The board could not be loaded.',
                            action: TextButton.icon(
                              onPressed: () =>
                                  ref.invalidate(contributorScoresProvider),
                              icon: const Icon(Icons.refresh_rounded),
                              label: const Text('Try again'),
                            ),
                          )
                        else if (scores.asData case AsyncData(
                          value: final data,
                        ))
                          if (data.isEmpty)
                            _BoardMessage(
                              icon: Icons.auto_awesome_rounded,
                              title: 'The first place could be yours.',
                              action: TextButton(
                                onPressed: () => _contribute(context),
                                child: const Text('Make a contribution'),
                              ),
                            )
                          else
                            _Podium(
                              rows: data.take(3).toList(),
                              myUid: mine?.uid,
                            )
                        else
                          const GlassSkeleton(height: 220),
                        if (rows.length > 3 && !scores.hasError)
                          const SizedBox(height: 16),
                      ],
                    ),
                  ),
                  if (rows.length > 3 && !scores.hasError)
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      sliver: _Board(rows: rows, myUid: mine?.uid),
                    ),
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: 28 + (pinned ? 0 : musicInset(context)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      // Reserve the real row height even at large text sizes.
      bottomNavigationBar: pinned ? _PinnedOwnRow(score: mine) : null,
    );
  }
}

void _contribute(BuildContext context) => Navigator.of(
  context,
).push<void>(MaterialPageRoute(builder: (_) => const ContributionKindScreen()));

void _openContributor(BuildContext context, ContributorScore score) =>
    Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => CommunityProfileScreen(uid: score.uid)),
    );

void _showPointsInfo(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    sheetAnimationStyle: AnimationStyle(
      duration: motionOr(context, AppMotion.standard),
      reverseDuration: motionOr(context, AppMotion.quick),
    ),
    showDragHandle: true,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Good work adds up.',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            const Text(
              'Points arrive after review and approval. Pending work does not count yet.',
            ),
            const SizedBox(height: 12),
            const Text('Words +10 · Written pieces +25 · Recordings +50'),
            const SizedBox(height: 12),
            const Text(
              'The board shows contribution points, with equal scores sharing a rank. Learning XP is separate.',
            ),
            const SizedBox(height: 12),
            const Text('Contribute on consecutive days to build your streak.'),
          ],
        ),
      ),
    ),
  );
}

class _EarnPoints extends StatelessWidget {
  const _EarnPoints();

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 12,
        children: [
          Text(
            'Make it count',
            style: TextStyle(
              color: context.brand.ink,
              fontSize: 20,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
            ),
          ),
          PressScale(
            child: TextButton.icon(
              onPressed: () => _contribute(context),
              iconAlignment: IconAlignment.end,
              icon: const Icon(Icons.arrow_forward_rounded, size: 17),
              label: const Text('Contribute'),
            ),
          ),
        ],
      ),
      const SizedBox(height: 8),
      LayoutBuilder(
        builder: (context, constraints) {
          final stacked = MediaQuery.textScalerOf(context).scale(14) > 22;
          final width = stacked
              ? constraints.maxWidth
              : (constraints.maxWidth - 16) / 3;
          return Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _EarnTile(
                width: width,
                icon: Icons.translate_rounded,
                label: 'Words',
                points: kPointsPerWord,
                color: context.brand.accent,
              ),
              _EarnTile(
                width: width,
                icon: Icons.auto_stories_rounded,
                label: 'Writing',
                points: kPointsPerWrittenPiece,
                color: context.brand.success,
              ),
              _EarnTile(
                width: width,
                icon: Icons.mic_rounded,
                label: 'Recordings',
                points: kPointsPerRecording,
                color: context.brand.gold,
              ),
            ],
          );
        },
      ),
      const SizedBox(height: 10),
      Row(
        children: [
          Icon(
            Icons.verified_outlined,
            size: 14,
            color: context.brand.mutedInk,
          ),
          const SizedBox(width: 5),
          Expanded(
            child: Text(
              'Earned after approval.',
              style: TextStyle(color: context.brand.mutedInk, fontSize: 11.5),
            ),
          ),
        ],
      ),
    ],
  );
}

class _EarnTile extends StatelessWidget {
  const _EarnTile({
    required this.width,
    required this.icon,
    required this.label,
    required this.points,
    required this.color,
  });
  final double width;
  final IconData icon;
  final String label;
  final int points;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 15),
    decoration: BoxDecoration(
      color: color.withValues(alpha: context.brand.isDark ? 0.10 : 0.055),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: color.withValues(alpha: 0.14)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(height: 18),
        Text(
          '+$points',
          style: TextStyle(
            color: context.brand.ink,
            fontSize: 26,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.2,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(
            color: context.brand.mutedInk,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

/// Competition ranks: 1, 2, 2, 4. Never use podium position as a rank.
List<int> leaderboardRanks(List<ContributorScore> rows) {
  final ranks = <int>[];
  for (var index = 0; index < rows.length; index++) {
    final tied = index > 0 && rows[index].points == rows[index - 1].points;
    ranks.add(tied ? ranks[index - 1] : index + 1);
  }
  return ranks;
}

class _Podium extends StatelessWidget {
  const _Podium({required this.rows, this.myUid});
  final List<ContributorScore> rows;
  final String? myUid;

  @override
  Widget build(BuildContext context) {
    final ranks = leaderboardRanks(rows);
    if (MediaQuery.textScalerOf(context).scale(14) > 22) {
      return Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            _LeaderboardRow(
              rank: ranks[i],
              score: rows[i],
              isMe: rows[i].uid == myUid,
            ),
        ],
      );
    }
    final order = rows.length == 3
        ? [1, 0, 2]
        : [for (var i = 0; i < rows.length; i++) i];
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final i in order)
          Expanded(
            child: Entrance(
              index: ranks[i] + 2,
              distance: 24,
              child: _PodiumPlace(
                score: rows[i],
                rank: ranks[i],
                isMe: rows[i].uid == myUid,
              ),
            ),
          ),
      ],
    );
  }
}

class _PodiumPlace extends StatelessWidget {
  const _PodiumPlace({
    required this.score,
    required this.rank,
    required this.isMe,
  });
  final ContributorScore score;
  final int rank;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final color = switch (rank) {
      1 => brand.gold,
      2 => brand.accent,
      _ => brand.terracotta,
    };
    return Semantics(
      label: _scoreLabel(score, rank, isMe),
      button: true,
      selected: isMe,
      excludeSemantics: true,
      child: PressScale(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: () => _openContributor(context, score),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: Column(
                children: [
                  if (rank == 1) ...[
                    Icon(
                      Icons.workspace_premium_rounded,
                      color: color,
                      size: 24,
                    ),
                    const SizedBox(height: 8),
                  ],
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: color.withValues(alpha: 0.6),
                        width: 1.5,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: color.withValues(alpha: 0.1),
                          blurRadius: 18,
                        ),
                      ],
                    ),
                    child: CommunityAvatar(
                      initials: score.initials,
                      imageUrl: score.avatarUrl,
                      username: score.username,
                      size: rank == 1 ? 62 : 48,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    isMe ? '${score.name} · you' : score.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (score.username.isNotEmpty)
                    Text(
                      '@${score.username}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: brand.mutedInk, fontSize: 10.5),
                    ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(6, 14, 6, 12),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          color.withValues(alpha: 0.13),
                          color.withValues(alpha: 0.025),
                        ],
                      ),
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(20),
                        bottom: Radius.circular(8),
                      ),
                      border: Border(
                        top: BorderSide(color: color.withValues(alpha: 0.24)),
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(
                          '$rank',
                          style: TextStyle(
                            color: color,
                            fontSize: 27,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        SizedBox(
                          height: rank == 1
                              ? 16
                              : rank == 2
                              ? 8
                              : 0,
                        ),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            '${score.points}',
                            style: TextStyle(
                              color: brand.ink,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                        ),
                        Text(
                          'points',
                          style: TextStyle(color: brand.mutedInk, fontSize: 10),
                        ),
                        if (score.hasStreak) ...[
                          const SizedBox(height: 8),
                          _StreakFlame(days: score.streakDays),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.rows, this.myUid});
  final List<ContributorScore> rows;
  final String? myUid;

  @override
  Widget build(BuildContext context) {
    final ranks = leaderboardRanks(rows);
    return SliverList.builder(
      itemCount: rows.length - 3,
      itemBuilder: (context, index) => _LeaderboardRow(
        rank: ranks[index + 3],
        score: rows[index + 3],
        isMe: rows[index + 3].uid == myUid,
      ),
    );
  }
}

String _scoreLabel(ContributorScore score, int rank, bool isMe) =>
    '${isMe ? 'You, ' : ''}${score.name}, ${rank > 0 ? 'rank $rank' : 'rank unavailable'}, ${score.points} points${score.hasStreak ? ', ${score.streakDays} day streak' : ''}';

class _LeaderboardRow extends StatelessWidget {
  const _LeaderboardRow({
    required this.rank,
    required this.score,
    this.isMe = false,
  });
  final int rank;
  final ContributorScore score;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final largeText = MediaQuery.textScalerOf(context).scale(14) > 22;
    return Semantics(
      button: true,
      selected: isMe,
      label: _scoreLabel(score, rank, isMe),
      excludeSemantics: true,
      child: Material(
        color: isMe ? brand.accentSoft : brand.surface,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _openContributor(context, score),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: brand.divider)),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 34,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      rank > 0 ? '$rank' : '—',
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 7),
                if (!largeText) ...[
                  CommunityAvatar(
                    initials: score.initials,
                    imageUrl: score.avatarUrl,
                    username: score.username,
                    size: 38,
                  ),
                  const SizedBox(width: 12),
                ],
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
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (score.username.isNotEmpty)
                        Text(
                          '@${score.username}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: brand.mutedInk, fontSize: 11),
                        ),
                      if (largeText)
                        Text(
                          '${score.points} points',
                          style: TextStyle(
                            color: isMe ? brand.accent : brand.ink,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      if (score.hasStreak && largeText)
                        _StreakFlame(days: score.streakDays),
                    ],
                  ),
                ),
                if (score.hasStreak && !largeText) ...[
                  const SizedBox(width: 8),
                  _StreakFlame(days: score.streakDays),
                ],
                const SizedBox(width: 12),
                if (!largeText)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${score.points}',
                        style: TextStyle(
                          color: isMe ? brand.accent : brand.ink,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      Text(
                        'points',
                        style: TextStyle(color: brand.mutedInk, fontSize: 10),
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
}

class _StreakFlame extends StatelessWidget {
  const _StreakFlame({required this.days});
  final int days;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      const Icon(
        Icons.local_fire_department_rounded,
        size: 15,
        color: Color(0xFFE0763C),
      ),
      const SizedBox(width: 2),
      Text(
        '$days',
        style: TextStyle(
          color: context.brand.mutedInk,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    ],
  );
}

class _PinnedOwnRow extends ConsumerWidget {
  const _PinnedOwnRow({required this.score});
  final ContributorScore score;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rank = ref.watch(myLeaderboardRankProvider).asData?.value;
    return ColoredBox(
      color: context.brand.surfaceElevated,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(12, 8, 12, 8 + musicInset(context)),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _LeaderboardRow(rank: rank ?? 0, score: score, isMe: true),
              if (rank == null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    score.points > 0
                        ? 'Rank unavailable right now'
                        : 'Your first approval starts your rank',
                    style: TextStyle(
                      color: context.brand.mutedInk,
                      fontSize: 11,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SmallLabel extends StatelessWidget {
  const _SmallLabel({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: context.brand.surfaceMuted,
      borderRadius: BorderRadius.circular(30),
    ),
    child: Text(
      text,
      style: TextStyle(
        color: context.brand.mutedInk,
        fontSize: 9,
        fontWeight: FontWeight.w800,
        letterSpacing: 1,
      ),
    ),
  );
}

class _BoardMessage extends StatelessWidget {
  const _BoardMessage({
    required this.icon,
    required this.title,
    required this.action,
  });
  final IconData icon;
  final String title;
  final Widget action;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: context.brand.surface,
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: context.brand.border),
    ),
    child: Column(
      children: [
        Icon(icon, color: context.brand.gold, size: 36),
        const SizedBox(height: 12),
        Text(
          title,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: context.brand.ink,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        action,
      ],
    ),
  );
}
