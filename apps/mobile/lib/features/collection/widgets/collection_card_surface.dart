import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// Shared Collection card shell.
///
/// Kept as its own name because the Collection grid, the published lists and
/// the dictionary all reach for it, but it is now a thin alias for the app's
/// one glass card: a translucent pane with a lit edge, a warm lift and a
/// tactile press. Collection content supplies the Indigen colours and imagery.
class CollectionCardSurface extends StatelessWidget {
  const CollectionCardSurface({
    required this.child,
    this.onTap,
    this.padding = EdgeInsets.zero,
    this.semanticLabel,
    this.accent,
    super.key,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final String? semanticLabel;

  /// Tints the pane and blooms a halo in the collection's own colour.
  final Color? accent;

  @override
  Widget build(BuildContext context) => ClipRRect(
    // Portal artwork bleeds to the tile's edges, so the ink and the imagery
    // both have to be cut to the same radius as the glass.
    borderRadius: BorderRadius.circular(18),
    child: GlassCard.listItem(
      onTap: onTap,
      accent: accent,
      radius: 18,
      padding: padding,
      semanticLabel: semanticLabel,
      child: child,
    ),
  );
}
