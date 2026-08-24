import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// Shared Collection card shell based on SRC's listing and document cards:
/// a quiet bordered surface, soft lift, large radius, clipped ink and tactile
/// press scale. Collection content supplies the Indigen colours and imagery.
class CollectionCardSurface extends StatefulWidget {
  const CollectionCardSurface({
    required this.child,
    this.onTap,
    this.padding = EdgeInsets.zero,
    this.semanticLabel,
    super.key,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final String? semanticLabel;

  @override
  State<CollectionCardSurface> createState() => _CollectionCardSurfaceState();
}

class _CollectionCardSurfaceState extends State<CollectionCardSurface> {
  var _pressed = false;

  @override
  Widget build(BuildContext context) => Semantics(
    button: widget.onTap != null,
    label: widget.semanticLabel,
    child: AnimatedScale(
      scale: _pressed ? 0.975 : 1,
      duration: const Duration(milliseconds: 140),
      curve: Curves.easeOut,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: BrandColors.divider),
          boxShadow: [
            BoxShadow(
              color: BrandColors.ink.withValues(alpha: 0.06),
              blurRadius: 12,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onHighlightChanged: widget.onTap == null
                  ? null
                  : (value) => setState(() => _pressed = value),
              onTap: widget.onTap == null
                  ? null
                  : () {
                      HapticFeedback.lightImpact();
                      widget.onTap!();
                    },
              child: Padding(padding: widget.padding, child: widget.child),
            ),
          ),
        ),
      ),
    ),
  );
}
