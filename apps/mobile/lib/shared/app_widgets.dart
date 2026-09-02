import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';

class ScreenContainer extends StatelessWidget {
  const ScreenContainer({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => SafeArea(
    bottom: false,
    child: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: child,
      ),
    ),
  );
}

class AnimatedCulturalSymbol extends StatefulWidget {
  const AnimatedCulturalSymbol({
    required this.glyph,
    required this.label,
    this.color,
    this.size = 58,
    super.key,
  });

  final String glyph;
  final String label;

  /// Defaults to the palette's gold.
  final Color? color;
  final double size;

  @override
  State<AnimatedCulturalSymbol> createState() => _AnimatedCulturalSymbolState();
}

class _AnimatedCulturalSymbolState extends State<AnimatedCulturalSymbol>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 9),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? context.brand.gold;
    return Semantics(
      label: '${widget.label} cultural motif',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          RotationTransition(
            turns: Tween(begin: 0.0, end: 1.0).animate(_controller),
            child: Container(
              width: widget.size,
              height: widget.size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: color.withValues(alpha: 0.35)),
                color: color.withValues(alpha: 0.07),
              ),
              child: Center(
                child: Text(
                  widget.glyph,
                  style: TextStyle(
                    color: color,
                    fontSize: widget.size * 0.55,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            widget.label,
            style: TextStyle(
              color: color,
              fontSize: 7,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
            ),
          ),
        ],
      ),
    );
  }
}

class BrandHeader extends StatelessWidget {
  const BrandHeader({
    required this.eyebrow,
    required this.title,
    this.subtitle,
    this.trailing,
    this.reserveTopRight = false,
    this.extraTopRightReserve = 0,
    super.key,
  });

  /// The small label above the heading, or null where the heading already
  /// says what it would have said.
  final String? eyebrow;

  final String title;
  final String? subtitle;
  final Widget? trailing;

  /// Adds a right inset so the heading clears the shell's floating profile
  /// orb. Only shell tabs need it; pushed routes have their own app bar.
  final bool reserveTopRight;

  /// Extra width to leave clear on top of the orb's own, for a tab that pins
  /// a second control beside it — [kShellOrbActionExtent] per control.
  ///
  /// Kept as a plain number rather than a second bool because [BrandHeader] is
  /// the wrong place to know *which* controls a given tab hangs up there. It
  /// only needs to know how much of its own right edge somebody else has
  /// spoken for. Ignored unless [reserveTopRight] is set: without the orb there
  /// is no cluster for an action to sit beside.
  final double extraTopRightReserve;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      18,
      // The reserve is computed from the shell's own constants rather than
      // written down here. It was a literal 62 — correct, and correct only for
      // as long as the orb was the one thing the shell pinned in that corner.
      reserveTopRight
          ? shellTopRightReserve(withAction: false) + extraTopRightReserve
          : 20,
      16,
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Set in the same muted ink as every other piece of supporting
              // text. A coloured eyebrow over every heading in the app meant
              // the accent was carrying no information at all.
              if (eyebrow case final eyebrow?) ...[
                Text(
                  eyebrow.toUpperCase(),
                  style: TextStyle(
                    color: context.brand.mutedInk,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.1,
                  ),
                ),
                const SizedBox(height: 6),
              ],
              Text(title, style: Theme.of(context).textTheme.headlineMedium),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(
                  subtitle!,
                  style: Theme.of(context).textTheme.bodyMedium
                      ?.copyWith(color: context.brand.mutedInk),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 12), trailing!],
      ],
    ),
  );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({required this.title, this.action, super.key});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(title, style: Theme.of(context).textTheme.titleLarge),
      ),
      ?action,
    ],
  );
}

class DemoDataNotice extends StatelessWidget {
  const DemoDataNotice({super.key});

  @override
  Widget build(BuildContext context) => GlassSurface(
    padding: const EdgeInsets.all(14),
    child: Row(
      children: [
        Icon(Icons.science_outlined, color: context.brand.mutedInk),
        const SizedBox(width: 12),
        const Expanded(
          child: Text(
            'Development build · sample data',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class StatusPill extends StatelessWidget {
  const StatusPill({
    required this.icon,
    required this.label,
    required this.color,
    super.key,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

class FeatureLockedCard extends StatelessWidget {
  const FeatureLockedCard({
    required this.icon,
    required this.title,
    required this.gate,
    this.description,
    super.key,
  });

  final IconData icon;
  final String title;

  /// One short line on why it is locked, or nothing. It used to be a required
  /// paragraph, which is how a card that exists to say "not yet" ended up being
  /// the tallest thing on the screen.
  final String? description;

  final String gate;

  @override
  Widget build(BuildContext context) => GlassCard(
    padding: const EdgeInsets.all(16),
    child: Row(
      children: [
        GlassIconPlate(icon: icon, size: 46),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              if (description != null && description!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: context.brand.mutedInk, fontSize: 12),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 10),
        StatusPill(
          icon: Icons.lock_outline_rounded,
          label: gate,
          color: context.brand.mutedInk,
        ),
      ],
    ),
  );
}
