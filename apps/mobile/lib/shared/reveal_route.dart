import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// REVEAL
///
/// A page that grows out of the thing that was tapped: a tile becomes the
/// channel it opens, the mini-player becomes the song.
///
/// ── Why not a Hero, and why not the `animations` package ──────────────────
/// A `Hero` flies one widget between two routes. Here the whole page is the
/// thing arriving, so what grows is a *window* onto it — a rounded rectangle
/// that starts exactly where the tile was and ends as the screen, with the page
/// laid out at full size behind it the whole time. Nothing inside the page is
/// squeezed, so nothing reflows mid-flight.
///
/// The package's `OpenContainer` does something similar but pushes a
/// `ModalRoute` rather than a `PageRoute`, and heroes only fly between page
/// routes — which would have cost the rail its hand-off into Music. This is a
/// `PageRoute`, so both happen at once: the page grows, and the rail stays put
/// above it and turns into Music's.
/// ─────────────────────────────────────────────────────────────────────────────

/// Where [context]'s widget is on screen, or null when it has not been laid
/// out.
Rect? globalRectOf(BuildContext context) {
  final box = context.findRenderObject();
  if (box is! RenderBox || !box.attached || !box.hasSize) return null;
  return box.localToGlobal(Offset.zero) & box.size;
}

/// The page, seen through a window growing from [origin] to the full screen.
///
/// Falls back to a plain fade when there is no origin to grow from, and for a
/// member who has asked for less motion.
Widget buildRevealTransition({
  required BuildContext context,
  required Animation<double> animation,
  required Rect? origin,
  required Widget child,
  double originRadius = 16,
  Color? originColor,
}) {
  if (origin == null || origin.isEmpty || !motionAllowed(context)) {
    return FadeTransition(opacity: animation, child: child);
  }

  // The curve is applied here rather than through a CurvedAnimation: this
  // runs whenever the route rebuilds, and a curved animation made here would
  // leave a listener on the route's animation every time.
  return AnimatedBuilder(
    animation: animation,
    child: child,
    builder: (context, page) {
      final size = MediaQuery.sizeOf(context);
      final t = Curves.easeInOutCubicEmphasized.transform(animation.value);
      final window = Rect.lerp(origin, Offset.zero & size, t)!;
      final radius = lerpDouble(originRadius, 0, t)!;
      // The content arrives after the window has started to open, and leaves
      // before it has finished closing, so the moment somebody watches is the
      // card becoming the page rather than a page being squashed.
      final contentOpacity = ((animation.value - 0.12) / 0.4).clamp(0.0, 1.0);

      return Stack(
        children: [
          // A breath of shade over what the page is growing out of, so the
          // window reads as coming forward rather than as a hole.
          Positioned.fill(
            child: IgnorePointer(
              child: ColoredBox(color: Colors.black.withValues(alpha: 0.2 * t)),
            ),
          ),
          Positioned.fromRect(
            rect: window,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: Stack(
                children: [
                  if (originColor != null)
                    Positioned.fill(child: ColoredBox(color: originColor)),
                  // The page at its real size, pinned to the screen rather
                  // than to the window: the window moves, the page does not.
                  OverflowBox(
                    alignment: Alignment.topLeft,
                    minWidth: size.width,
                    maxWidth: size.width,
                    minHeight: size.height,
                    maxHeight: size.height,
                    child: Transform.translate(
                      offset: -window.topLeft,
                      child: Opacity(opacity: contentOpacity, child: page),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    },
  );
}

/// A full-screen page that grows out of [origin].
///
/// A [PageRoute], which is the point: heroes on the page underneath and on
/// this one still fly, so a rail shared by the two stays on screen through the
/// whole transition.
class RevealPageRoute<T> extends PageRoute<T> {
  RevealPageRoute({
    required this.builder,
    required this.origin,
    this.originRadius = 16,
    this.originColor,
    super.settings,
  });

  final WidgetBuilder builder;

  /// Where the page grows from, in global coordinates. Null falls back to a
  /// fade.
  final Rect? origin;

  final double originRadius;

  /// Painted inside the window before the page has faded in — the colour of
  /// the card the page is growing out of.
  final Color? originColor;

  @override
  Color? get barrierColor => null;

  @override
  String? get barrierLabel => null;

  @override
  bool get maintainState => true;

  @override
  Duration get transitionDuration => const Duration(milliseconds: 460);

  @override
  Duration get reverseTransitionDuration => const Duration(milliseconds: 380);

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) => builder(context);

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => buildRevealTransition(
    context: context,
    animation: animation,
    origin: origin,
    originRadius: originRadius,
    originColor: originColor,
    child: child,
  );
}
