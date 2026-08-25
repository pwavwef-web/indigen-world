import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Shows [message] as a glass toast floating clear of the bottom edge. Used
/// for every community outcome so success and failure read the same way across
/// screens.
///
/// This is the single funnel the whole community section speaks through, so
/// moving it off `ScaffoldMessenger` moves every one of those messages out from
/// under the floating nav rail at once.
void showCommunityMessage(BuildContext context, String message) =>
    showGlassToast(context, message);

/// Follow / Following toggle. Renders nothing for your own profile.
class FollowButton extends ConsumerWidget {
  const FollowButton({required this.targetUid, this.dense = false, super.key});

  final String targetUid;
  final bool dense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(currentUidProvider);
    if (uid == null || uid == targetUid) return const SizedBox.shrink();

    final following =
        ref.watch(followingIdsProvider).asData?.value.contains(targetUid) ??
        false;

    Future<void> toggle() async {
      final repository = ref.read(communityRepositoryProvider);
      if (repository == null) return;
      HapticFeedback.selectionClick();
      try {
        await repository.toggleFollow(
          followerId: uid,
          targetId: targetUid,
          following: following,
        );
        ref.invalidate(profileCountsProvider(targetUid));
        ref.invalidate(profileCountsProvider(uid));
      } on CommunityFailure catch (error) {
        if (context.mounted) showCommunityMessage(context, error.message);
      } on Object {
        if (context.mounted) {
          showCommunityMessage(context, 'Could not update. Try again.');
        }
      }
    }

    final padding = dense
        ? const EdgeInsets.symmetric(horizontal: 14)
        : const EdgeInsets.symmetric(horizontal: 20);
    final size = dense ? const Size(0, 36) : const Size(0, 44);

    return following
        ? OutlinedButton(
            onPressed: toggle,
            style: OutlinedButton.styleFrom(
              minimumSize: size,
              padding: padding,
              textStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
            child: const Text('Following'),
          )
        : FilledButton(
            onPressed: toggle,
            style: FilledButton.styleFrom(
              minimumSize: size,
              padding: padding,
              textStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
            child: const Text('Follow'),
          );
  }
}

/// A member row: avatar, name, handle, bio snippet and a follow control.
class ProfileTile extends StatelessWidget {
  const ProfileTile({
    required this.profile,
    required this.onTap,
    this.showFollow = true,
    super.key,
  });

  final CommunityProfile profile;
  final VoidCallback onTap;
  final bool showFollow;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
    onTap: onTap,
    leading: CommunityAvatar(
      initials: profile.initials,
      imageUrl: profile.avatarUrl,
      onTap: onTap,
    ),
    title: Row(
      children: [
        Flexible(
          child: Text(
            profile.displayName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
          ),
        ),
        if (profile.isVerified) ...[
          const SizedBox(width: 4),
          const Icon(
            Icons.verified_rounded,
            size: 14,
            color: BrandColors.savannahGreen,
          ),
        ],
      ],
    ),
    subtitle: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          profile.handle,
          style: const TextStyle(
            color: BrandColors.mutedInk,
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (profile.bio.isNotEmpty)
          Text(
            profile.bio,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12.5, height: 1.35),
          ),
      ],
    ),
    trailing: showFollow
        ? FollowButton(targetUid: profile.uid, dense: true)
        : null,
  );
}

/// Empty-state block used by every list in the community section.
class CommunityEmptyState extends StatelessWidget {
  const CommunityEmptyState({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    super.key,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 48),
    child: Column(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: BrandColors.heritageGreen.withValues(alpha: 0.08),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: BrandColors.heritageGreen, size: 28),
        ),
        const SizedBox(height: 16),
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: BrandColors.mutedInk, height: 1.45),
        ),
        if (action != null) ...[const SizedBox(height: 18), action!],
      ],
    ),
  );
}
