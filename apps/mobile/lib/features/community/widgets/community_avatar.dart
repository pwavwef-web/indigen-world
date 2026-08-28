import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// Circular member avatar: remote photo when there is one, brand-coloured
/// initials when there is not. [ringed] adds the thin ring used on the
/// community pulse rail — a hairline in the page's own border colour rather
/// than the two-tone gold gradient it used to be.
class CommunityAvatar extends StatelessWidget {
  const CommunityAvatar({
    required this.initials,
    this.imageUrl,
    this.size = 44,
    this.ringed = false,
    this.ringColor,
    this.onTap,
    super.key,
  });

  final String initials;
  final String? imageUrl;
  final double size;
  final bool ringed;

  /// Defaults to the palette hairline.
  final Color? ringColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
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

    final wrapped = ringed
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
