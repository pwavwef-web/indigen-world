import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// The mark beside a name.
///
/// There used to be six of these, hand-drawn at each call site in three
/// different colours, all of them saying the same unexplained thing. One widget
/// now, so a mark cannot mean one thing in the feed and another on a profile.
///
/// ── On colour ─────────────────────────────────────────────────────────────
/// At the 14px a byline gives it, colour is the only thing that reads — which
/// makes colour a bad place to keep the meaning. Every mark therefore carries a
/// [Semantics] label naming its kind, and tapping one opens a card that says
/// what it is. The colour is a shorthand for people who already know, not the
/// message itself.
///
/// The quiet outline tick and the solid coloured seals are deliberately
/// different *shapes* as well as colours, so a screen of four kinds never reads
/// as a screen of four ticks.
class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({
    required this.mark,
    this.size = 14,
    this.explainOnTap = true,
    super.key,
  });

  final VerifiedMark mark;
  final double size;

  /// Off inside a row that is itself a button — a mention suggestion, a person
  /// row — where a second tap target inside the first is a trap rather than a
  /// feature.
  final bool explainOnTap;

  static IconData glyph(VerifiedMark mark) => switch (mark) {
    VerifiedMark.member => Icons.check_circle_outline_rounded,
    _ => Icons.verified_rounded,
  };

  static Color colour(VerifiedMark mark, BrandPalette brand) => switch (mark) {
    VerifiedMark.project => brand.accent,
    VerifiedMark.elder => brand.gold,
    VerifiedMark.creator => brand.terracotta,
    VerifiedMark.member => brand.mutedInk,
    VerifiedMark.none => brand.mutedInk,
  };

  /// What the mark is called, in three words or fewer.
  static String label(VerifiedMark mark) => switch (mark) {
    VerifiedMark.project => 'Project account',
    VerifiedMark.elder => 'Language custodian',
    VerifiedMark.creator => 'Published creator',
    VerifiedMark.member => 'Verified member',
    VerifiedMark.none => '',
  };

  /// The sentence behind it. Deliberately says what the mark does *not* claim
  /// as well as what it does — a badge nobody can explain is a badge people
  /// invent meanings for.
  static String meaning(VerifiedMark mark) => switch (mark) {
    VerifiedMark.project => 'An account run by Indigen World or Project '
        'Kassena. What it posts comes from the project itself.',
    VerifiedMark.elder =>
      'Recognised by the project as a custodian of Kasem — an elder, a chief '
          'or a linguist. It marks standing in the language, not authority '
          'over anybody in this community.',
    VerifiedMark.creator =>
      'Has published work into the Kassena collection. It says what they have '
          'contributed, not that the project agrees with them.',
    VerifiedMark.member =>
      'A real person behind a real phone number. Every other mark rests on '
          'this one.',
    VerifiedMark.none => '',
  };

  @override
  Widget build(BuildContext context) {
    if (mark == VerifiedMark.none) return const SizedBox.shrink();
    final brand = context.brand;
    final icon = Icon(glyph(mark), size: size, color: colour(mark, brand));

    return Semantics(
      // Never colour alone: a screen reader hears the kind, and so does anybody
      // who cannot tell gold from terracotta at fourteen pixels.
      label: label(mark),
      button: explainOnTap,
      excludeSemantics: true,
      child: explainOnTap
          ? GestureDetector(
              onTap: () => showVerifiedExplainer(context, mark),
              child: icon,
            )
          : icon,
    );
  }
}

/// What the mark means, on a card that closes again.
Future<void> showVerifiedExplainer(BuildContext context, VerifiedMark mark) {
  if (mark == VerifiedMark.none) return Future<void>.value();
  return showGlassPopup<void>(
    context: context,
    title: VerifiedBadge.label(mark),
    builder: (popupContext) => Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          VerifiedBadge.glyph(mark),
          size: 30,
          color: VerifiedBadge.colour(mark, popupContext.brand),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            VerifiedBadge.meaning(mark),
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
