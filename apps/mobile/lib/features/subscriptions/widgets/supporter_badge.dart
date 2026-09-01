import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// The mark beside a subscriber's name.
///
/// ── Why this is not a [VerifiedBadge] variant ─────────────────────────────
/// Because the two say different kinds of thing, and merging them would put a
/// price on the wrong one. A verification mark is the outcome of a check: a
/// phone number answered, work published, standing as a custodian of Kasem
/// recognised. A supporter mark is the outcome of a payment. Drawing them from
/// one enum would mean, sooner or later, somebody reading a paid badge as a
/// checked one — and this project cannot afford for its verification marks to
/// look purchasable.
///
/// So the shape is deliberately different too. Verification marks are seals and
/// ticks; this is an open hand, which is not a tick in any light.
class SupporterBadge extends StatelessWidget {
  const SupporterBadge({
    required this.mark,
    this.size = 14,
    this.explainOnTap = true,
    super.key,
  });

  final SupporterMark mark;
  final double size;

  /// Off inside a row that is itself a button, matching [VerifiedBadge].
  final bool explainOnTap;

  static IconData glyph(SupporterMark mark) => switch (mark) {
    SupporterMark.studio => Icons.auto_awesome_rounded,
    _ => Icons.volunteer_activism_rounded,
  };

  static Color colour(SupporterMark mark, BrandPalette brand) => switch (mark) {
    SupporterMark.patron => brand.gold,
    SupporterMark.studio => brand.accent,
    SupporterMark.supporter => brand.terracotta,
    SupporterMark.none => brand.mutedInk,
  };

  @override
  Widget build(BuildContext context) {
    if (mark == SupporterMark.none) return const SizedBox.shrink();
    final brand = context.brand;
    final icon = Icon(glyph(mark), size: size, color: colour(mark, brand));

    return Semantics(
      // Colour is never the message. A screen reader hears the tier, and so
      // does anybody who cannot tell gold from terracotta at fourteen pixels.
      label: mark.label,
      button: explainOnTap,
      excludeSemantics: true,
      child: explainOnTap
          ? GestureDetector(
              onTap: () => showSupporterExplainer(context, mark),
              child: icon,
            )
          : icon,
    );
  }
}

/// What the mark means, on a card that closes again.
Future<void> showSupporterExplainer(BuildContext context, SupporterMark mark) {
  if (mark == SupporterMark.none) return Future<void>.value();
  return showGlassPopup<void>(
    context: context,
    title: mark.label,
    builder: (popupContext) => Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          SupporterBadge.glyph(mark),
          size: 30,
          color: SupporterBadge.colour(mark, popupContext.brand),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            mark.meaning,
            style: TextStyle(
              color: popupContext.brand.mutedInk,
              fontSize: 14,
              height: 1.45,
            ),
          ),
        ),
      ],
    ),
  );
}
