import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';

/// Circular member avatar: remote photo when there is one, brand-coloured
/// initials when there is not.
///
/// Two rings, and they say different things. [ringed] is the hairline on the
/// community pulse rail — furniture, in the page's own border colour. [kasem] is
/// the kente ring, and it is the only decoration in the app that is *earned*:
/// it belongs to a member whose handle carries a real Kassena name.
class CommunityAvatar extends ConsumerWidget {
  const CommunityAvatar({
    required this.initials,
    this.imageUrl,
    this.username,
    this.size = 44,
    this.ringed = false,
    this.ringColor,
    this.kasem,
    this.onTap,
    super.key,
  });

  final String initials;
  final String? imageUrl;

  /// The member's handle, when the caller has one. Supplying it is what makes
  /// the ring appear for somebody who has taken a Kassena name.
  final String? username;

  final double size;
  final bool ringed;

  /// Defaults to the palette hairline.
  final Color? ringColor;

  /// Forces the kente ring on or off. Left null almost everywhere: the ring is
  /// worked out from [username], so the rule is applied the same way by every
  /// avatar in the app rather than remembered at twenty call sites.
  final bool? kasem;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final handle = username;
    final kasem =
        this.kasem ??
        (handle != null &&
            isKasemHandle(handle, ref.watch(kasemHandleSetProvider)));
    final avatar = Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: context.brand.accentFill,
        shape: BoxShape.circle,
      ),
      child: imageUrl != null && imageUrl!.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: imageUrl!,
              fit: BoxFit.cover,
              placeholder: (context, url) => _initials(),
              errorWidget: (context, url, error) => _initials(),
            )
          : _initials(),
    );

    final wrapped = kasem
        // The kente ring wins where a member is both on the pulse rail and
        // carrying a name: two rings around one picture is a target, not a
        // portrait.
        ? Container(
            padding: const EdgeInsets.all(2.5),
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: SweepGradient(
                colors: [
                  BrandColors.kenteGold,
                  BrandColors.terracotta,
                  BrandColors.kenteGold,
                  BrandColors.terracotta,
                  BrandColors.kenteGold,
                ],
              ),
            ),
            child: avatar,
          )
        : ringed
        ? Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: ringColor ?? context.brand.border,
                width: 1.5,
              ),
            ),
            child: avatar,
          )
        : avatar;

    final tappable = onTap == null
        ? wrapped
        : InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: wrapped,
          );
    if (!kasem) return tappable;

    // The ring means something, so it cannot be only a colour: anybody who
    // cannot see it is told in words instead. A container of its own, because
    // an annotation with no node to land on is an annotation nobody hears — and
    // the initials it replaces are a stand-in for a name that is written beside
    // the picture in every place this appears.
    return Semantics(
      container: true,
      excludeSemantics: true,
      button: onTap != null,
      label: 'Carries a Kassena name',
      onTap: onTap,
      child: tappable,
    );
  }

  Widget _initials() => Center(
    child: Text(
      initials,
      style: TextStyle(
        color: Colors.white,
        fontSize: size * 0.34,
        fontWeight: FontWeight.w900,
        letterSpacing: 0.2,
      ),
    ),
  );
}
