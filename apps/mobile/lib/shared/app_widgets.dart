import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

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
    this.color = BrandColors.kenteGold,
    this.size = 58,
    super.key,
  });

  final String glyph;
  final String label;
  final Color color;
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
  Widget build(BuildContext context) => Semantics(
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
              border: Border.all(color: widget.color.withValues(alpha: 0.45)),
              color: widget.color.withValues(alpha: 0.08),
            ),
            child: Center(
              child: Text(
                widget.glyph,
                style: TextStyle(
                  color: widget.color,
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
            color: widget.color,
            fontSize: 7,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.8,
          ),
        ),
      ],
    ),
  );
}

class BrandHeader extends StatelessWidget {
  const BrandHeader({
    required this.eyebrow,
    required this.title,
    this.subtitle,
    this.trailing,
    this.reserveTopRight = false,
    super.key,
  });

  final String eyebrow;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  /// Adds a right inset so the heading clears the shell's floating profile
  /// orb. Only shell tabs need it; pushed routes have their own app bar.
  final bool reserveTopRight;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(20, 18, reserveTopRight ? 62 : 20, 16),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow.toUpperCase(),
                style: const TextStyle(
                  color: BrandColors.terracotta,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(height: 5),
              Text(title, style: Theme.of(context).textTheme.headlineMedium),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(
                  subtitle!,
                  style: Theme.of(context).textTheme.bodyMedium
                      ?.copyWith(color: BrandColors.mutedInk),
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
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: BrandColors.kenteGold.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: BrandColors.kenteGold.withValues(alpha: 0.45)),
    ),
    child: const Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.science_outlined, color: BrandColors.heritageGreen),
        SizedBox(width: 12),
        Expanded(
          child: Text(
            'Development build: dictionary records are synthetic fixtures, not validated Kasem guidance.',
            style: TextStyle(fontWeight: FontWeight.w600, height: 1.35),
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
    required this.description,
    required this.gate,
    super.key,
  });

  final IconData icon;
  final String title;
  final String description;
  final String gate;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: BrandColors.heritageGreen.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: BrandColors.heritageGreen),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    StatusPill(
                      icon: Icons.lock_outline,
                      label: gate,
                      color: BrandColors.mutedInk,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  description,
                  style: Theme.of(context).textTheme.bodyMedium
                      ?.copyWith(color: BrandColors.mutedInk),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
