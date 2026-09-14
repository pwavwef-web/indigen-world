import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

/// The compact composer that opens the feed: the member's avatar, a line that
/// reads like an empty field, and the two attachments people most often start
/// a post with.
///
/// Used on the main feed and inside a community, where [placeholder] says
/// where the post will go.
class CommunityComposeBar extends ConsumerWidget {
  const CommunityComposeBar({
    required this.placeholder,
    required this.onCompose,
    required this.onAddPhoto,
    required this.onAddVideo,
    super.key,
  });

  final String placeholder;
  final VoidCallback onCompose;
  final VoidCallback onAddPhoto;
  final VoidCallback onAddVideo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myCommunityProfileProvider).asData?.value;
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    return Container(
      key: const Key('community-compose-bar'),
      decoration: BoxDecoration(
        color: brand.surfaceMuted,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: brand.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              button: true,
              label: placeholder,
              excludeSemantics: true,
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: const BorderRadius.horizontal(
                    left: Radius.circular(999),
                  ),
                  onTap: onCompose,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 48),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(8, 6, 6, 6),
                      child: Row(
                        children: [
                          CommunityAvatar(
                            initials: profile?.initials ?? '··',
                            imageUrl: profile?.avatarUrl,
                            username: profile?.username,
                            size: 32,
                          ),
                          const SizedBox(width: 11),
                          Expanded(
                            child: Text(
                              placeholder,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: brand.mutedInk,
                                fontSize: 15,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          _BarAction(
            icon: Icons.image_outlined,
            tooltip: l10n.communityAddPhoto,
            onTap: onAddPhoto,
          ),
          _BarAction(
            icon: Icons.videocam_outlined,
            tooltip: l10n.communityAddVideo,
            onTap: onAddVideo,
          ),
          const SizedBox(width: 4),
        ],
      ),
    );
  }
}

class _BarAction extends StatelessWidget {
  const _BarAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tooltip,
    onPressed: onTap,
    iconSize: 20,
    color: context.brand.mutedInk,
    constraints: const BoxConstraints.tightFor(width: 44, height: 44),
    padding: EdgeInsets.zero,
    icon: Icon(icon),
  );
}
