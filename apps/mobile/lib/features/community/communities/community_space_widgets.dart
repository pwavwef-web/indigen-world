import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/daily_prompt_strip.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

String communityCategoryLabel(
  CommunityCategory category,
  AppLocalizations l10n,
) => switch (category) {
  CommunityCategory.language => l10n.communityCategoryLanguage,
  CommunityCategory.culture => l10n.communityCategoryCulture,
  CommunityCategory.music => l10n.communityCategoryMusic,
  CommunityCategory.history => l10n.communityCategoryHistory,
  CommunityCategory.faith => l10n.communityCategoryFaith,
  CommunityCategory.education => l10n.communityCategoryEducation,
  CommunityCategory.hometown => l10n.communityCategoryHometown,
  CommunityCategory.diaspora => l10n.communityCategoryDiaspora,
  CommunityCategory.youth => l10n.communityCategoryYouth,
  CommunityCategory.other => l10n.communityCategoryOther,
};

IconData communityCategoryIcon(CommunityCategory category) =>
    switch (category) {
      CommunityCategory.language => Icons.translate_rounded,
      CommunityCategory.culture => Icons.diversity_3_rounded,
      CommunityCategory.music => Icons.music_note_rounded,
      CommunityCategory.history => Icons.history_edu_rounded,
      CommunityCategory.faith => Icons.volunteer_activism_outlined,
      CommunityCategory.education => Icons.school_outlined,
      CommunityCategory.hometown => Icons.home_work_outlined,
      CommunityCategory.diaspora => Icons.public_rounded,
      CommunityCategory.youth => Icons.celebration_outlined,
      CommunityCategory.other => Icons.forum_outlined,
    };

/// "Language · Kasem · Navrongo" — whichever of the three a community has.
String communityMetaLine(CommunitySpace space, AppLocalizations l10n) => [
  communityCategoryLabel(space.category, l10n),
  if (space.language.trim().isNotEmpty) space.language.trim(),
  if (space.location.trim().isNotEmpty) space.location.trim(),
].join(' · ');

/// A community's picture: a rounded square, so it never reads as a person.
/// Falls back to the woven motif with the community's initials over it.
class CommunitySpaceAvatar extends StatelessWidget {
  const CommunitySpaceAvatar({
    required this.space,
    this.size = 48,
    this.bordered = false,
    super.key,
  });

  final CommunitySpace space;
  final double size;
  final bool bordered;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final radius = BorderRadius.circular(size * 0.28);
    final url = space.avatarUrl;
    final fallback = Stack(
      fit: StackFit.expand,
      children: [
        const TextileMotif(),
        ColoredBox(color: brand.scrim.withValues(alpha: 0.35)),
        Center(
          child: Text(
            space.initials,
            style: TextStyle(
              color: Colors.white,
              fontSize: size * 0.34,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.4,
            ),
          ),
        ),
      ],
    );
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: radius,
          border: bordered
              ? Border.all(color: brand.background, width: 3)
              : Border.all(color: brand.border),
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: url == null
              ? fallback
              : CachedNetworkImage(
                  imageUrl: url,
                  fit: BoxFit.cover,
                  placeholder: (context, _) => fallback,
                  errorWidget: (context, _, _) => fallback,
                ),
        ),
      ),
    );
  }
}

/// The signed-in member's row in [communityId], taken from the one live list
/// of their memberships rather than a listener per community on screen.
CommunityMembership? membershipFromMine(WidgetRef ref, String communityId) =>
    ref.watch(
      myMembershipsProvider.select(
        (value) => value.asData?.value
            .where((membership) => membership.communityId == communityId)
            .firstOrNull,
      ),
    );

/// Join / Ask to join / Requested / Joined, for one community.
///
/// Tapping Joined or Requested offers to leave or withdraw; it never does
/// either on a single tap.
class JoinCommunityButton extends ConsumerWidget {
  const JoinCommunityButton({
    required this.space,
    this.membership,
    this.useMine = true,
    this.dense = false,
    super.key,
  });

  final CommunitySpace space;

  /// The membership to decide from. When null and [useMine] is set, it is
  /// looked up in the member's own list.
  final CommunityMembership? membership;
  final bool useMine;
  final bool dense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final uid = ref.watch(currentUidProvider);
    final row =
        membership ?? (useMine ? membershipFromMine(ref, space.id) : null);
    final access = resolveCommunityAccess(
      space: space,
      uid: uid,
      membership: row,
    );
    final actions = CommunitySpaceActions(ref);
    final size = dense ? const Size(0, 40) : const Size(0, 44);
    final padding = EdgeInsets.symmetric(horizontal: dense ? 14 : 20);
    const textStyle = TextStyle(fontSize: 13, fontWeight: FontWeight.w800);

    switch (access) {
      case CommunityAccess.unavailable || CommunityAccess.banned:
        return const SizedBox.shrink();
      case CommunityAccess.member:
        return OutlinedButton(
          key: ValueKey('community-joined-${space.id}'),
          // For an owner this offers handing over or closing; for everybody
          // else, leaving. Neither happens without a confirmation.
          onPressed: () => actions.leave(context, space, row!),
          style: OutlinedButton.styleFrom(
            minimumSize: size,
            padding: padding,
            textStyle: textStyle,
          ),
          child: Text(
            row?.role == CommunityRole.owner
                ? l10n.communityRoleOwner
                : l10n.communitiesMember,
          ),
        );
      case CommunityAccess.pending:
        return OutlinedButton.icon(
          key: ValueKey('community-requested-${space.id}'),
          onPressed: () => actions.leave(context, space, row!),
          style: OutlinedButton.styleFrom(
            minimumSize: size,
            padding: padding,
            textStyle: textStyle,
          ),
          icon: const Icon(Icons.schedule_rounded, size: 16),
          label: Text(l10n.communitiesRequested),
        );
      case CommunityAccess.guest || CommunityAccess.none:
        return FilledButton(
          key: ValueKey('community-join-${space.id}'),
          onPressed: () => actions.join(context, space),
          style: FilledButton.styleFrom(
            minimumSize: size,
            padding: padding,
            textStyle: textStyle,
          ),
          child: Text(
            space.isPrivate ? l10n.communitiesRequest : l10n.communitiesJoin,
          ),
        );
    }
  }
}

/// A community in a list: picture, name, what it is, how many, and the join
/// control.
class CommunitySpaceTile extends StatelessWidget {
  const CommunitySpaceTile({
    required this.space,
    required this.onTap,
    super.key,
  });

  final CommunitySpace space;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: brand.divider)),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
            child: Row(
              children: [
                CommunitySpaceAvatar(space: space, size: 52),
                const SizedBox(width: 12),
                Expanded(
                  child: Semantics(
                    // One announcement for the row's words, so a screen reader
                    // hears the community before it hears the button.
                    container: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                space.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: brand.ink,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            if (space.isPrivate) ...[
                              const SizedBox(width: 4),
                              Icon(
                                Icons.lock_outline_rounded,
                                size: 14,
                                color: brand.mutedInk,
                                semanticLabel: l10n.communitiesPrivate,
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          communityMetaLine(space, l10n),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: brand.mutedInk,
                            fontSize: 12.5,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          l10n.communitiesMembers(space.memberCount),
                          maxLines: 1,
                          style: TextStyle(
                            color: brand.faintInk,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                JoinCommunityButton(space: space, dense: true),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
