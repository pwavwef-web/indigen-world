import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// Circular member avatar: remote photo when there is one, brand-coloured
/// initials when there is not. [ringed] adds the kente-gold story ring used on
/// the community pulse rail.
class CommunityAvatar extends StatelessWidget {
  const CommunityAvatar({
    required this.initials,
    this.imageUrl,
    this.size = 44,
    this.ringed = false,
    this.ringColor = BrandColors.terracotta,
    this.onTap,
    super.key,
  });

  final String initials;
  final String? imageUrl;
  final double size;
  final bool ringed;
  final Color ringColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final avatar = Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        color: BrandColors.heritageGreen,
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

    final wrapped = ringed
        ? Container(
            padding: const EdgeInsets.all(2.5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [ringColor, BrandColors.kenteGold],
              ),
            ),
            child: DecoratedBox(
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: BrandColors.surface,
              ),
              child: Padding(padding: const EdgeInsets.all(1.5), child: avatar),
            ),
          )
        : avatar;

    if (onTap == null) return wrapped;
    return InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: wrapped,
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
