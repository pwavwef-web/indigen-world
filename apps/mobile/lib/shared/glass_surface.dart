import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// GLASS SURFACES
///
/// One recipe for every panel, card and pill in the app, so a post, a lesson,
/// a collection item and a campaign all read as the same material rather than
/// as four teams' idea of a card.
///
/// The material is a pane lying on the page ground:
///
///   * a fill a shade away from the ground, barely graded so the top edge
///     catches a little more light than the bottom;
///   * a hairline edge in the palette's own border colour;
///   * a soft, palette-tinted lift rather than a neutral grey drop shadow.
///
/// ── On restraint ─────────────────────────────────────────────────────────
/// This used to be a much louder material: a white-to-accent gradient edge, an
/// accent-tinted fill and a coloured halo bloomed under every card that passed
/// an `accent`. Twenty of those down a feed turned a page of writing into a
/// row of lit boxes competing with each other and with the content. The accent
/// is now a *hint* — a slightly warmer border and a barely-there tint — and
/// the surface's job is to hold text legibly and then get out of the way.
///
/// ── On blur ──────────────────────────────────────────────────────────────
/// [BackdropFilter] is the expensive part: it forces a save layer and reads
/// back the frame underneath. One or two on screen is free; twenty in a
/// scrolling feed is a dropped-frame machine on the low-end Android hardware
/// this app is actually used on. So blur is opt-**out** on singular surfaces
/// (headers, hero panels, sheets, empty states) and opt-**in**-off on anything
/// that repeats down a list — [GlassCard.listItem] exists to make that choice
/// once rather than at every call site. The fill and the hairline do the work
/// regardless; the blur is the finishing touch, not the look.
/// ─────────────────────────────────────────────────────────────────────────────

/// Corner radius shared by every glass surface.
const double kGlassRadius = 20;

/// Radius for the smaller glass shapes — pills, chips, inline tiles.
const double kGlassPillRadius = 999;

/// Default backdrop blur for a surface that draws one.
const double kGlassBlurSigma = 14;

/// A pane of glass.
///
/// The primitive. [GlassCard] adds tap handling on top of it; reach for this
/// one directly when the surface is not itself a button.
class GlassSurface extends StatelessWidget {
  const GlassSurface({
    required this.child,
    this.padding = EdgeInsets.zero,
    this.margin,
    this.radius = kGlassRadius,
    this.accent,
    this.blur = true,
    this.blurSigma = kGlassBlurSigma,
    this.opacity = 1,
    this.lifted = true,
    this.onDark = false,
    this.width,
    this.height,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double radius;

  /// Warms the hairline and lays the faintest wash of this colour into the
  /// fill. Enough to say *this kind of thing*, not enough to be the first
  /// thing you notice about the card.
  final Color? accent;

  /// Whether to draw a real backdrop blur. See the note at the top of the file
  /// before turning this on inside a list.
  final bool blur;
  final double blurSigma;

  /// Scales the fill's translucency. Below 1 the pane is thinner and more of
  /// the ground shows through; above 1 it frosts over.
  final double opacity;

  /// The soft drop shadow. Off for surfaces that sit inside another card.
  final bool lifted;

  /// Glass over a permanently dark ground — Explore, Kawuri, a video sheet —
  /// where the fill has to be a smoked pane whatever the app's own theme is.
  final bool onDark;

  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final smoked = onDark || brand.isDark;
    final borderRadius = BorderRadius.circular(radius);
    final glass = _GlassBody(
      brand: brand,
      smoked: smoked,
      padding: padding,
      radius: radius,
      accent: accent,
      opacity: opacity,
      width: width,
      height: height,
      child: child,
    );

    Widget surface = ClipRRect(
      borderRadius: borderRadius,
      child: blur
          ? BackdropFilter(
              filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
              child: glass,
            )
          : glass,
    );

    if (lifted) {
      surface = DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: borderRadius,
          boxShadow: glassShadows(brand, onDark: onDark),
        ),
        child: surface,
      );
    }

    // A blurred surface reads the frame beneath it every time anything in the
    // subtree paints. The boundary keeps that cost tied to this card instead
    // of to whatever else happens to be animating on screen.
    if (blur) surface = RepaintBoundary(child: surface);

    return margin == null ? surface : Padding(padding: margin!, child: surface);
  }
}

/// The lift under a glass surface. Exposed so hand-built surfaces (a hero, a
/// nav rail) can borrow the same depth without wrapping themselves in a
/// [GlassSurface].
///
/// There is deliberately no accent parameter any more. A coloured halo under a
/// card is the loudest thing a card can do, and it was being asked for on
/// surfaces that repeat.
List<BoxShadow> glassShadows(BrandPalette brand, {bool onDark = false}) {
  final deep = onDark || brand.isDark;
  final shadow = deep ? Colors.black : brand.shadow;
  return [
    BoxShadow(
      color: shadow.withValues(alpha: deep ? 0.34 : 0.055),
      blurRadius: 20,
      offset: const Offset(0, 8),
    ),
    BoxShadow(
      color: shadow.withValues(alpha: deep ? 0.2 : 0.035),
      blurRadius: 3,
      offset: const Offset(0, 1),
    ),
  ];
}

/// The fill and the hairline.
///
/// The edge is a 1px ring rather than a [Border] so it can still be graded
/// very slightly from top to bottom — enough to read as a bevel under raking
/// light, not enough to read as a sticker outline. Flutter has no gradient
/// border, so the ring is the outer container's gradient showing through one
/// pixel of padding.
class _GlassBody extends StatelessWidget {
  const _GlassBody({
    required this.child,
    required this.brand,
    required this.smoked,
    required this.padding,
    required this.radius,
    required this.accent,
    required this.opacity,
    required this.width,
    required this.height,
  });

  final Widget child;
  final BrandPalette brand;
  final bool smoked;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? accent;
  final double opacity;
  final double? width;
  final double? height;

  double _alpha(double value) => (value * opacity).clamp(0, 1);

  @override
  Widget build(BuildContext context) {
    final accent = this.accent;

    // On a permanently dark ground the pane is smoke — a white film at low
    // alpha over whatever is behind it. Everywhere else it is the palette's
    // own surface, so a card in dark mode is a charcoal panel rather than a
    // grey wash that lets the page show through and muddies the text.
    final edge = smoked
        ? LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.white.withValues(alpha: _alpha(0.14)),
              Colors.white.withValues(alpha: _alpha(0.05)),
            ],
          )
        : LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              (accent ?? brand.border).withValues(
                alpha: _alpha(accent == null ? 1 : 0.42),
              ),
              brand.border.withValues(alpha: _alpha(0.75)),
            ],
          );

    final fill = smoked && !brand.isDark
        ? LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.white.withValues(alpha: _alpha(0.13)),
              Colors.white.withValues(alpha: _alpha(0.05)),
            ],
          )
        : LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              brand.surface.withValues(alpha: _alpha(1)),
              Color.alphaBlend(
                (accent ?? brand.surfaceMuted).withValues(
                  alpha: accent == null ? 1 : 0.055,
                ),
                brand.surface,
              ).withValues(alpha: _alpha(1)),
            ],
          );

    return Container(
      width: width,
      height: height,
      padding: const EdgeInsets.all(1),
      decoration: BoxDecoration(
        gradient: edge,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Container(
        padding: padding,
        decoration: BoxDecoration(
          gradient: fill,
          borderRadius: BorderRadius.circular(radius - 1),
        ),
        child: child,
      ),
    );
  }
}

/// A pane of glass you can press.
///
/// Adds the ink, the haptic and the small scale dip that makes a tap feel like
/// it landed on something physical. Ink is clipped to the glass, so a ripple
/// never escapes the corner radius.
class GlassCard extends StatefulWidget {
  const GlassCard({
    required this.child,
    this.onTap,
    this.onLongPress,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.radius = kGlassRadius,
    this.accent,
    this.blur = true,
    this.blurSigma = kGlassBlurSigma,
    this.opacity = 1,
    this.lifted = true,
    this.onDark = false,
    this.semanticLabel,
    super.key,
  });

  /// A card that repeats down a scrolling list.
  ///
  /// Identical to the default except that it does not draw a backdrop blur —
  /// see the note at the top of this file. Everything that makes the surface
  /// read as a pane (the fill, the hairline, the lift) is still there; only
  /// the frame read-back is dropped.
  const GlassCard.listItem({
    required this.child,
    this.onTap,
    this.onLongPress,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.radius = kGlassRadius,
    this.accent,
    this.opacity = 1,
    this.lifted = true,
    this.onDark = false,
    this.semanticLabel,
    super.key,
  }) : blur = false,
       blurSigma = 0;

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double radius;
  final Color? accent;
  final bool blur;
  final double blurSigma;
  final double opacity;
  final bool lifted;
  final bool onDark;
  final String? semanticLabel;

  @override
  State<GlassCard> createState() => _GlassCardState();
}

class _GlassCardState extends State<GlassCard> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final interactive = widget.onTap != null || widget.onLongPress != null;
    return Semantics(
      button: interactive,
      label: widget.semanticLabel,
      child: AnimatedScale(
        scale: _pressed ? 0.978 : 1,
        duration: const Duration(milliseconds: 130),
        curve: Curves.easeOut,
        child: GlassSurface(
          padding: EdgeInsets.zero,
          margin: widget.margin,
          radius: widget.radius,
          accent: widget.accent,
          blur: widget.blur,
          blurSigma: widget.blurSigma,
          opacity: widget.opacity,
          lifted: widget.lifted,
          onDark: widget.onDark,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(widget.radius - 1),
              onHighlightChanged: interactive ? _setPressed : null,
              onTap: widget.onTap == null
                  ? null
                  : () {
                      HapticFeedback.lightImpact();
                      widget.onTap!();
                    },
              onLongPress: widget.onLongPress,
              child: Padding(padding: widget.padding, child: widget.child),
            ),
          ),
        ),
      ),
    );
  }
}

/// A glass pill — the shape used for filters, toggles and small status chips.
///
/// Selected pills fill with the accent so the choice is unmistakable at a
/// glance; unselected ones stay quiet.
class GlassPill extends StatelessWidget {
  const GlassPill({
    required this.label,
    this.icon,
    this.selected = false,
    this.onTap,
    this.accent,
    this.onDark = false,
    this.dense = false,
    super.key,
  });

  final String label;
  final IconData? icon;
  final bool selected;
  final VoidCallback? onTap;

  /// Defaults to the palette accent. Pass one only when the pill means
  /// something a different colour already stands for.
  final Color? accent;
  final bool onDark;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final accent = this.accent ?? brand.accentFill;
    final foreground = selected
        ? brand.onAccentFill
        : (onDark ? Colors.white70 : brand.mutedInk);
    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: dense ? 13 : 15, color: foreground),
          SizedBox(width: dense ? 4 : 6),
        ],
        Text(
          label,
          style: TextStyle(
            color: foreground,
            fontSize: dense ? 11 : 12.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.1,
          ),
        ),
      ],
    );

    final padding = EdgeInsets.symmetric(
      horizontal: dense ? 11 : 15,
      vertical: dense ? 6 : 9,
    );

    if (!selected) {
      return GlassCard(
        onTap: onTap,
        blur: false,
        radius: kGlassPillRadius,
        padding: padding,
        lifted: false,
        onDark: onDark,
        child: content,
      );
    }

    return Semantics(
      button: onTap != null,
      selected: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(kGlassPillRadius),
          onTap: onTap == null
              ? null
              : () {
                  HapticFeedback.selectionClick();
                  onTap!();
                },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            padding: padding,
            decoration: BoxDecoration(
              color: accent,
              borderRadius: BorderRadius.circular(kGlassPillRadius),
            ),
            child: content,
          ),
        ),
      ),
    );
  }
}

/// The small square icon plate that leads most glass rows.
///
/// One shape, one radius, one way of tinting an icon by meaning — instead of
/// each screen inventing a 34/44/46/52px rounded box of its own.
class GlassIconPlate extends StatelessWidget {
  const GlassIconPlate({
    required this.icon,
    this.color,
    this.size = 44,
    this.onDark = false,
    super.key,
  });

  final IconData icon;

  /// Defaults to the palette accent.
  final Color? color;
  final double size;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final color = this.color ?? brand.accent;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: onDark || brand.isDark ? 0.16 : 0.08),
        borderRadius: BorderRadius.circular(size * 0.32),
        border: Border.all(color: color.withValues(alpha: 0.16)),
      ),
      child: Icon(
        icon,
        color: onDark ? Colors.white : color,
        size: size * 0.46,
      ),
    );
  }
}

/// A row of glass: plate, title, optional single line of detail, chevron.
///
/// Deliberately allows only *one* line of supporting text and truncates it.
/// The paragraph of explanation that used to sit under every one of these is
/// what made the app feel like a manual.
class GlassRow extends StatelessWidget {
  const GlassRow({
    required this.icon,
    required this.title,
    this.detail,
    this.trailing,
    this.onTap,
    this.color,
    this.blur = true,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? detail;
  final Widget? trailing;
  final VoidCallback? onTap;

  /// Defaults to the palette accent.
  final Color? color;
  final bool blur;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final color = this.color ?? brand.accent;
    return GlassCard(
      onTap: onTap,
      blur: blur,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(
        children: [
          GlassIconPlate(icon: icon, color: color),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: brand.ink,
                  ),
                ),
                if (detail != null && detail!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    detail!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: brand.mutedInk,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          if (trailing == null && onTap != null)
            Icon(Icons.chevron_right_rounded, color: brand.faintInk, size: 20),
        ],
      ),
    );
  }
}

/// The app's one empty / error / locked state.
///
/// Icon, one short line, one optional action. There is no room for a
/// paragraph, on purpose.
class GlassEmptyState extends StatelessWidget {
  const GlassEmptyState({
    required this.icon,
    required this.title,
    this.action,
    this.color,
    this.padding = const EdgeInsets.fromLTRB(16, 28, 16, 28),
    super.key,
  });

  final IconData icon;
  final String title;
  final Widget? action;

  /// Defaults to the palette accent.
  final Color? color;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: padding,
      child: GlassSurface(
        padding: const EdgeInsets.fromLTRB(20, 26, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            GlassIconPlate(
              icon: icon,
              color: color ?? brand.mutedInk,
              size: 56,
            ),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

/// A shimmering glass placeholder, used while a list loads.
class GlassSkeleton extends StatefulWidget {
  const GlassSkeleton({
    this.height = 150,
    this.radius = kGlassRadius,
    super.key,
  });

  final double height;
  final double radius;

  @override
  State<GlassSkeleton> createState() => _GlassSkeletonState();
}

class _GlassSkeletonState extends State<GlassSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    // A reader who has switched animations off gets the plain pane; a sweeping
    // highlight is decoration, and decoration is exactly what that setting is
    // asking us to stop doing.
    if (MediaQuery.disableAnimationsOf(context)) {
      return GlassSurface(
        blur: false,
        height: widget.height,
        radius: widget.radius,
        child: const SizedBox.shrink(),
      );
    }
    return GlassSurface(
      blur: false,
      height: widget.height,
      radius: widget.radius,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius - 1),
            gradient: LinearGradient(
              begin: Alignment(-1.6 + _controller.value * 3.2, -0.4),
              end: Alignment(-0.6 + _controller.value * 3.2, 0.4),
              colors: [
                brand.ink.withValues(alpha: 0),
                brand.ink.withValues(alpha: brand.isDark ? 0.06 : 0.045),
                brand.ink.withValues(alpha: 0),
              ],
            ),
          ),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}
