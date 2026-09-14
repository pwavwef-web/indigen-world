import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// A compact, one-line invitation to take part: a small textile motif, a title
/// and a line under it, and an arrow.
///
/// ── Why it is this small ───────────────────────────────────────────────────
/// It sits above the composer on the first screen of the feed, which is the
/// most valuable strip of glass in the app. Anything taller than a list row
/// there reads as an advert and pushes the writing people came for below the
/// fold, so it is held to roughly one row's height and grows only when the
/// reader's text size asks it to.
///
/// It knows nothing about any particular language or community. The caller
/// hands it words — "Today in Kasem", "Today in Frafra", whatever a published
/// prompt says — and decides what a tap opens.
class DailyPromptStrip extends StatelessWidget {
  const DailyPromptStrip({
    required this.title,
    required this.subtitle,
    required this.onTap,
    required this.semanticLabel,
    this.imageUrl,
    super.key,
  });

  final String title;
  final String subtitle;
  final VoidCallback onTap;

  /// Read in place of the strip's contents: what it says, and what a tap does.
  final String semanticLabel;

  /// A picture to show instead of the drawn motif.
  final String? imageUrl;

  static const double thumbnailSize = 40;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: Material(
        key: const Key('community-prompt-strip'),
        color: brand.surface.withValues(alpha: brand.isDark ? 0.55 : 0.72),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: brand.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            // A minimum rather than a height, so large text grows the strip
            // instead of clipping it.
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: SizedBox.square(
                      dimension: thumbnailSize,
                      child: imageUrl == null
                          ? const TextileMotif()
                          : CachedNetworkImage(
                              imageUrl: imageUrl!,
                              fit: BoxFit.cover,
                              placeholder: (context, _) => const TextileMotif(),
                              errorWidget: (context, _, _) =>
                                  const TextileMotif(),
                            ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
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
                            letterSpacing: -0.1,
                          ),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: brand.mutedInk,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Decorative: the whole strip is the button, so the arrow
                  // only says which way it goes.
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: brand.accentFill,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.arrow_forward_rounded,
                      size: 18,
                      color: brand.onAccentFill,
                    ),
                  ),
                  const SizedBox(width: 4),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A small woven motif in the manner of Kassena wall painting and smock cloth:
/// bands of lozenges and triangles in earth, ink and plaster.
///
/// Drawn rather than shipped as a picture, so it costs no download, stays
/// sharp at any density and takes its colours from the theme.
class TextileMotif extends StatelessWidget {
  const TextileMotif({super.key});

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return CustomPaint(
      painter: _TextilePainter(
        ground: brand.terracotta,
        ink: brand.pick(const Color(0xFF2A211C), const Color(0xFF1B1714)),
        plaster: brand.pick(const Color(0xFFF4EBDD), const Color(0xFFE9DFCF)),
        thread: brand.gold,
      ),
    );
  }
}

class _TextilePainter extends CustomPainter {
  const _TextilePainter({
    required this.ground,
    required this.ink,
    required this.plaster,
    required this.thread,
  });

  final Color ground;
  final Color ink;
  final Color plaster;
  final Color thread;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    canvas.drawRect(Offset.zero & size, Paint()..color = ground);

    final inkPaint = Paint()..color = ink;
    final plasterPaint = Paint()..color = plaster;

    // Three bands: triangles along the top and bottom edges, a row of lozenges
    // through the middle.
    final band = h / 3;
    const teeth = 4;
    final tooth = w / teeth;
    for (var i = 0; i < teeth; i++) {
      final left = i * tooth;
      canvas
        ..drawPath(
          Path()
            ..moveTo(left, 0)
            ..lineTo(left + tooth, 0)
            ..lineTo(left + tooth / 2, band * 0.8)
            ..close(),
          i.isEven ? inkPaint : plasterPaint,
        )
        ..drawPath(
          Path()
            ..moveTo(left, h)
            ..lineTo(left + tooth, h)
            ..lineTo(left + tooth / 2, h - band * 0.8)
            ..close(),
          i.isEven ? plasterPaint : inkPaint,
        );
    }

    final middle = h / 2;
    const lozenges = 3;
    final span = w / lozenges;
    for (var i = 0; i < lozenges; i++) {
      final centre = span * i + span / 2;
      final outer = Path()
        ..moveTo(centre, middle - band * 0.62)
        ..lineTo(centre + span * 0.46, middle)
        ..lineTo(centre, middle + band * 0.62)
        ..lineTo(centre - span * 0.46, middle)
        ..close();
      final inner = Path()
        ..moveTo(centre, middle - band * 0.28)
        ..lineTo(centre + span * 0.2, middle)
        ..lineTo(centre, middle + band * 0.28)
        ..lineTo(centre - span * 0.2, middle)
        ..close();
      canvas
        ..drawPath(outer, i.isOdd ? plasterPaint : inkPaint)
        ..drawPath(inner, Paint()..color = thread);
    }
  }

  @override
  bool shouldRepaint(_TextilePainter oldDelegate) =>
      ground != oldDelegate.ground ||
      ink != oldDelegate.ink ||
      plaster != oldDelegate.plaster ||
      thread != oldDelegate.thread;
}
