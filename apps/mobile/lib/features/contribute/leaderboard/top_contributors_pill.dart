import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/leaderboard_screen.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The five faces at the top of the Contribute hub.
///
/// The hub is a page of doors, and a page of doors says nothing about the
/// people on the other side of them. This is the one strip on it that does:
/// five photographs of members whose work has been approved, overlapping the
/// way a group of people standing together overlaps, and one line naming what
/// they are.
///
/// It is deliberately not a card with numbers on it. A leaderboard's pull is
/// recognising a face — "that is the woman who posts the market songs" — and a
/// row of avatars carries that in about a fifth of the height a table of scores
/// would have needed at the top of a screen whose real job is the two rows
/// underneath.
class TopContributorsPill extends ConsumerWidget {
  const TopContributorsPill({super.key});

  /// How many faces the strip shows at most.
  static const int faces = 5;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scores = ref.watch(contributorScoresProvider);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: switch (scores) {
        AsyncError() => const _PillFrame(
          icon: Icons.cloud_off_rounded,
          title: 'Top contributors',
          subtitle: 'Could not be loaded. Tap to try again.',
        ),
        AsyncData(value: final rows) when rows.isEmpty => const _PillFrame(
          icon: Icons.emoji_events_outlined,
          title: 'Nobody has scored yet',
          // An invitation, not an empty row. A brand-new community meets this
          // screen before it meets anybody on it, and "no data" would be a
          // truthful way of wasting the one moment somebody is looking.
          subtitle: 'Send the first contribution and the top is yours',
        ),
        AsyncData(value: final rows) => _PillFrame(
          faces: rows.take(faces).toList(growable: false),
          title: 'Top contributors',
          // Named as all-time because that is what the score is. `points` on
          // `contributorScores` has no month in it and is never reset, so
          // "this month" would have been a claim the number cannot keep.
          subtitle: switch (rows.length) {
            1 => 'All time · one member has scored so far',
            _ => 'All time · ${rows.first.name} leads',
          },
        ),
        // Still loading, and drawing nothing at all until it lands. The
        // rejected alternative was five grey circles as a placeholder, which is
        // a lie told for a third of a second and then taken back — and on a
        // community with three contributors it is a lie that never resolves,
        // because the fourth and fifth circles stay grey for good.
        _ => const SizedBox.shrink(),
      },
    );
  }
}

/// The strip itself: faces or an icon on the left, two lines beside them.
class _PillFrame extends StatelessWidget {
  const _PillFrame({
    required this.title,
    required this.subtitle,
    this.faces = const <ContributorScore>[],
    this.icon,
  });

  final String title;
  final String subtitle;

  /// The members to draw, highest first. Empty for the states that have nobody
  /// to draw — which is why [icon] exists.
  final List<ContributorScore> faces;

  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassCard(
      // Every state opens the board, including the empty one. An invitation
      // that led somewhere different from the thing it is inviting you to look
      // at would be two screens to explain one idea, and the board is where the
      // scoring rules are written down.
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (context) => const LeaderboardScreen()),
      ),
      blur: false,
      padding: const EdgeInsets.fromLTRB(15, 12, 13, 12),
      semanticLabel: '$title. $subtitle',
      child: Row(
        children: [
          if (faces.isNotEmpty)
            _FaceRow(scores: faces)
          else
            GlassIconPlate(icon: icon ?? Icons.groups_rounded, size: 40),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: brand.mutedInk, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Icon(Icons.chevron_right_rounded, color: brand.faintInk, size: 22),
        ],
      ),
    );
  }
}

/// Overlapping portraits, highest-scoring on top.
///
/// Drawn back to front so the leader is the face nothing is covering. Each one
/// sits in a small ring of the surface colour, which is what stops five circles
/// from reading as one smeared shape — and which the kente ring is allowed to
/// keep, because [CommunityAvatar] draws that ring itself for a member whose
/// handle carries a Kassena name and it is the one decoration in this app that
/// is earned.
class _FaceRow extends StatelessWidget {
  const _FaceRow({required this.scores});

  final List<ContributorScore> scores;

  static const double _face = 32;
  static const double _gap = 4;
  static const double _step = 24;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return SizedBox(
      height: _face + _gap,
      width: _face + _gap + (_step * (scores.length - 1)),
      child: Stack(
        children: [
          for (var index = scores.length - 1; index >= 0; index--)
            Positioned(
              left: index * _step,
              child: Container(
                padding: const EdgeInsets.all(_gap / 2),
                decoration: BoxDecoration(
                  color: brand.surface,
                  shape: BoxShape.circle,
                ),
                child: CommunityAvatar(
                  initials: scores[index].initials,
                  imageUrl: scores[index].avatarUrl,
                  username: scores[index].username,
                  size: _face,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
