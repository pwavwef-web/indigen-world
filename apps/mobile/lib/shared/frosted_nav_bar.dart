import 'dart:math' show pi, sin;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// FROSTED NAV BAR
///
/// A floating "liquid glass" bottom bar: a translucent, blurred pill rail with
/// a highlighter pill that stretches between destinations, wiggles on landing
/// and can be dragged directly with a finger.
///
/// The motion is deliberately expressive; the colour is not. The rail is the
/// palette's own bar tone behind a blur, and the travelling pill is a wash of
/// the accent — no gold bloom, no white-on-white gradient stack. A control
/// that is on screen the entire time somebody uses the app is the last thing
/// that should be competing for their eye, and the movement already says
/// everything the glow was saying.
/// ─────────────────────────────────────────────────────────────────────────────

// ── Tunables ────────────────────────────────────────────────────────────────
const double kFrostedNavBarHeight = 66;
const double kFrostedNavBarBottomGap = 20;
const double kFrostedNavBarPillHeight = 54;
const double kFrostedNavBarIconSize = 22;
const double kFrostedNavBarLabelSize = 9.5;

/// Total vertical space the bar occupies, excluding the system inset. Screens
/// use this to reserve bottom padding under scrollable content.
const double kFrostedNavBarReservedSpace =
    kFrostedNavBarHeight + kFrostedNavBarBottomGap + 18;

/// How much room the mini-player takes when there is one.
///
/// ── Why this is not another constant screens add themselves ────────────────
/// The mini-player is not always there, so a flat constant would reserve a
/// strip of dead space on every screen for every member who has never played
/// anything. Instead the overlay that draws it publishes its height through
/// [MusicInsetScope] and the two helpers below read it back out. A screen asks
/// how much room to leave and gets the honest answer for the moment it is
/// asking.
const double kMiniPlayerHeight = 56;

/// The height the mini-player is claiming, published to everything below it.
///
/// ── Why an explicit number and not an inferred one ─────────────────────────
/// This used to be read off `MediaQuery`: the overlay inflated `padding.bottom`
/// by the mini-player's height, left `viewPadding.bottom` alone, and the
/// helpers returned the difference. The inference had a second author. The
/// shell's `Scaffold` sets `extendBody: true`, and Scaffold answers that by
/// raising `padding.bottom` *for its body* to the height of the bottom
/// navigation bar — the whole floating rail, gap and system inset included. So
/// every tab in the shell measured a mini-player that was not playing and put
/// its floating button and its scroll padding a full rail too high, whether or
/// not anybody had ever pressed play. A number that is handed over cannot be
/// confused with somebody else's inset.
class MusicInsetScope extends InheritedWidget {
  const MusicInsetScope({required this.inset, required super.child, super.key});

  /// The vertical space the mini-player currently occupies, or zero.
  final double inset;

  static double of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<MusicInsetScope>()?.inset ?? 0;

  @override
  bool updateShouldNotify(MusicInsetScope oldWidget) =>
      oldWidget.inset != inset;
}

/// The vertical space the mini-player is currently claiming, or zero.
double musicInset(BuildContext context) => MusicInsetScope.of(context);

/// What a shell tab should leave under its scrollable content: the rail, plus
/// the mini-player when one is playing.
double shellBottomReserve(BuildContext context) =>
    kFrostedNavBarReservedSpace + musicInset(context);

/// The small movement a destination's icon makes as it becomes the selected
/// one.
///
/// ── Why each destination gets its own ─────────────────────────────────────
/// The pill already says *that* the selection moved. The icon saying it again
/// in its own way — a play mark that turns, a cap that is tossed, a bookmark
/// that flips — is what makes five destinations feel like five places rather
/// than five slots. Each is a single, short movement that ends where it began,
/// and none of them happen for somebody who asked for less motion.
enum NavIconMotion {
  /// No signature movement: the rail as it always was.
  none,

  /// A full turn, like a record starting.
  spin,

  /// Up and tilted, then caught — a mortarboard thrown.
  toss,

  /// Swells and settles — a speech bubble popping up.
  pop,

  /// A full flip about the vertical axis — a page turned.
  flip,

  /// A quarter-turn — a plus that becomes the same plus.
  quarter,

  /// A hop and a landing.
  bounce,

  /// A lean one way and back — a lens looking around.
  turn,
}

class FrostedNavBarItem {
  const FrostedNavBarItem({
    required this.label,
    required this.icon,
    IconData? selectedIcon,
    this.showIndicatorDot = false,
    this.badgeCount = 0,
    this.motion = NavIconMotion.none,
    this.badge,
  }) : selectedIcon = selectedIcon ?? icon;

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final bool showIndicatorDot;
  final int badgeCount;

  /// The movement the icon makes as it becomes the selected destination.
  final NavIconMotion motion;

  /// A small live mark drawn at the icon's shoulder — the equalizer that says
  /// music is playing, for instance. Beneath a numeric [badgeCount] in
  /// precedence, and drawn in place of [showIndicatorDot]. A widget rather
  /// than a flag, so the rail need not know what is being signalled: the
  /// widget may watch its own state and render nothing.
  final Widget? badge;
}

/// The tag both rails fly under when Music opens from the shell.
///
/// With one tag on the app rail and one on Music's, the rail is never covered
/// by the page opening over it: it stays where it is, above both routes, while
/// its destinations turn into the channel's.
const Object kAppRailHeroTag = 'indigen-app-rail';

class FrostedNavBar extends StatefulWidget {
  const FrostedNavBar({
    required this.currentIndex,
    required this.onTap,
    required this.items,
    this.accent,
    this.heroTag,
    super.key,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<FrostedNavBarItem> items;

  /// The colour of the pill and of the selected destination. The palette's
  /// accent when null; a channel's own colour inside that channel.
  final Color? accent;

  /// When set, the rail is a [Hero] under this tag, and hands over to another
  /// rail carrying the same tag instead of being covered by a new page.
  final Object? heroTag;

  @override
  State<FrostedNavBar> createState() => _FrostedNavBarState();
}

class _FrostedNavBarState extends State<FrostedNavBar>
    with TickerProviderStateMixin {
  late final AnimationController _slideController;
  late final AnimationController _wiggleController;

  int _previousIndex = 0;
  bool _isDragging = false;
  double _dragOffset = 0;
  int _dragStartIndex = 0;

  @override
  void initState() {
    super.initState();
    _previousIndex = widget.currentIndex;
    _slideController = AnimationController(
      vsync: this,
      duration: AppMotion.standard,
    );
    _wiggleController = AnimationController(
      vsync: this,
      duration: AppMotion.standard,
    );
    _slideController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        // Selection motion is carried by the sliding indicator.
      }
    });
  }

  @override
  void didUpdateWidget(covariant FrostedNavBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currentIndex != widget.currentIndex && !_isDragging) {
      _previousIndex = oldWidget.currentIndex;
      if (motionAllowed(context)) {
        _slideController.forward(from: 0);
      } else {
        _slideController.value = 1;
      }
      HapticFeedback.lightImpact();
    }
  }

  @override
  void dispose() {
    _slideController.dispose();
    _wiggleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rail = _buildRail(context);
    final tag = widget.heroTag;
    if (tag == null) return rail;
    return Hero(tag: tag, flightShuttleBuilder: _handOver, child: rail);
  }

  /// The rail in flight between two routes: one set of destinations fading
  /// into the other in place.
  ///
  /// The two rails are the same glass at the same size in the same spot, so a
  /// cross-fade is all the flight needs to be — the eye sees the icons change
  /// and the pill slide, and never sees the rail leave.
  static Widget _handOver(
    BuildContext flightContext,
    Animation<double> animation,
    HeroFlightDirection direction,
    BuildContext fromHeroContext,
    BuildContext toHeroContext,
  ) {
    final from = (fromHeroContext.widget as Hero).child;
    final to = (toHeroContext.widget as Hero).child;
    // A push runs its route's animation up from zero; a pop runs the popping
    // route's back down from one. Either way `arrived` is how far the rail
    // that is coming has come.
    final arrived = direction == HeroFlightDirection.push
        ? animation
        : ReverseAnimation(animation);
    return Stack(
      fit: StackFit.expand,
      children: [
        FadeTransition(opacity: ReverseAnimation(arrived), child: from),
        FadeTransition(opacity: arrived, child: to),
      ],
    );
  }

  Widget _buildRail(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final accent = widget.accent ?? context.brand.accent;

    return SizedBox(
      height: kFrostedNavBarHeight + kFrostedNavBarBottomGap + bottomInset + 26,
      child: Stack(
        children: [
          Positioned(
            bottom: kFrostedNavBarBottomGap + bottomInset,
            left: 10,
            right: 10,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final slotWidth = constraints.maxWidth / widget.items.length;
                return GestureDetector(
                  onHorizontalDragStart: (_) {
                    setState(() {
                      _isDragging = true;
                      _dragStartIndex = widget.currentIndex;
                      _dragOffset = 0;
                    });
                    HapticFeedback.selectionClick();
                  },
                  onHorizontalDragUpdate: (details) =>
                      setState(() => _dragOffset += details.delta.dx),
                  onHorizontalDragEnd: (_) {
                    final draggedSlots = (_dragOffset / slotWidth).round();
                    final newIndex = (_dragStartIndex + draggedSlots).clamp(
                      0,
                      widget.items.length - 1,
                    );
                    setState(() {
                      _isDragging = false;
                      _previousIndex = _dragStartIndex;
                      _dragOffset = 0;
                    });
                    if (newIndex != widget.currentIndex) widget.onTap(newIndex);
                    // Selection motion is carried by the sliding indicator.
                    HapticFeedback.lightImpact();
                  },
                  child: _GlassRail(
                    accent: accent,
                    currentIndex: widget.currentIndex,
                    previousIndex: _previousIndex,
                    items: widget.items,
                    onTap: widget.onTap,
                    slideController: _slideController,
                    wiggleController: _wiggleController,
                    isDragging: _isDragging,
                    dragOffset: _dragOffset,
                    dragStartIndex: _dragStartIndex,
                    slotWidth: slotWidth,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Glass rail
// ═══════════════════════════════════════════════════════════════════════════

class _GlassRail extends StatelessWidget {
  const _GlassRail({
    required this.accent,
    required this.currentIndex,
    required this.previousIndex,
    required this.items,
    required this.onTap,
    required this.slideController,
    required this.wiggleController,
    required this.isDragging,
    required this.dragOffset,
    required this.dragStartIndex,
    required this.slotWidth,
  });

  final Color accent;
  final int currentIndex;
  final int previousIndex;
  final List<FrostedNavBarItem> items;
  final ValueChanged<int> onTap;
  final AnimationController slideController;
  final AnimationController wiggleController;
  final bool isDragging;
  final double dragOffset;
  final int dragStartIndex;
  final double slotWidth;

  static final _railBlur = ImageFilter.blur(sigmaX: 18, sigmaY: 18);

  @override
  Widget build(BuildContext context) => SizedBox(
    height: kFrostedNavBarHeight,
    child: Stack(
      clipBehavior: Clip.none,
      children: [
        // ── 1. Glass rail ───────────────────────────────────────────────
        Positioned.fill(
          child: RepaintBoundary(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(40),
              child: BackdropFilter(
                filter: _railBlur,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(40),
                    color: context.brand.bar.withValues(
                      alpha: context.brand.isDark ? 0.86 : 0.78,
                    ),
                    border: Border.all(color: context.brand.border),
                    boxShadow: [
                      BoxShadow(
                        color: context.brand.shadow.withValues(
                          alpha: context.brand.isDark ? 0.45 : 0.08,
                        ),
                        blurRadius: 22,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        // ── 2. Highlighter pill ─────────────────────────────────────────
        _ExpandingPill(
          accent: accent,
          slideController: slideController,
          wiggleController: wiggleController,
          currentIndex: currentIndex,
          previousIndex: previousIndex,
          slotWidth: slotWidth,
          isDragging: isDragging,
          dragOffset: dragOffset,
          dragStartIndex: dragStartIndex,
        ),

        // ── 3. Destinations ─────────────────────────────────────────────
        Positioned.fill(
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _GlassNavItem(
                    accent: accent,
                    item: items[i],
                    isSelected: currentIndex == i,
                    onTap: () => onTap(i),
                  ),
                ),
            ],
          ),
        ),
      ],
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Highlighter pill — stretches between slots, bounces on landing
// ═══════════════════════════════════════════════════════════════════════════

class _ExpandingPill extends StatelessWidget {
  const _ExpandingPill({
    required this.accent,
    required this.slideController,
    required this.wiggleController,
    required this.currentIndex,
    required this.previousIndex,
    required this.slotWidth,
    required this.isDragging,
    required this.dragOffset,
    required this.dragStartIndex,
  });

  final Color accent;
  final AnimationController slideController;
  final AnimationController wiggleController;
  final int currentIndex;
  final int previousIndex;
  final double slotWidth;
  final bool isDragging;
  final double dragOffset;
  final int dragStartIndex;

  static final _pillBlur = ImageFilter.blur(sigmaX: 8, sigmaY: 8);

  static const double _restWidth = 0.95;
  static const double _restHeight = kFrostedNavBarPillHeight;
  static const double _maxHeightExpand = 30;
  static const double _maxWidthExpand = 0.55;
  static const double _trailDelay = 0.18;

  @override
  Widget build(BuildContext context) {
    final baseRestWidth = slotWidth * _restWidth;

    return AnimatedBuilder(
      animation: Listenable.merge([slideController, wiggleController]),
      builder: (context, _) {
        final t = slideController.value;
        final wiggle = wiggleController.value;

        double pillCenterX;
        double currentWidth;
        double currentHeight;
        var wiggleRotation = 0.0;
        var wiggleOffsetY = 0.0;
        var contentScale = 1.0;

        if (isDragging) {
          // ── Dragging: the pill tracks the finger and swells ──────────
          final dragCenterBase = dragStartIndex * slotWidth + slotWidth / 2;
          pillCenterX = dragCenterBase + dragOffset;
          final magnitude = (dragOffset.abs() / slotWidth).clamp(0.0, 1.0);
          currentWidth =
              baseRestWidth + (slotWidth * _maxWidthExpand * magnitude);
          currentHeight = _restHeight + (_maxHeightExpand * magnitude);
          contentScale = 1 - (0.08 * magnitude);
        } else if (t > 0 && t < 1) {
          // ── Travelling: leading edge runs ahead, trailing edge lags ──
          final prevCenter = previousIndex * slotWidth + slotWidth / 2;
          final currCenter = currentIndex * slotWidth + slotWidth / 2;
          final halfRest = baseRestWidth / 2;

          final leadProgress = Curves.easeOutCubic.transform(t);
          final trailProgress = Curves.easeOutCubic.transform(
            ((t - _trailDelay) / (1 - _trailDelay)).clamp(0.0, 1.0),
          );

          final double left;
          final double right;
          if (currentIndex >= previousIndex) {
            right = lerpDouble(
              prevCenter + halfRest,
              currCenter + halfRest,
              leadProgress,
            )!;
            left = lerpDouble(
              prevCenter - halfRest,
              currCenter - halfRest,
              trailProgress,
            )!;
          } else {
            left = lerpDouble(
              prevCenter - halfRest,
              currCenter - halfRest,
              leadProgress,
            )!;
            right = lerpDouble(
              prevCenter + halfRest,
              currCenter + halfRest,
              trailProgress,
            )!;
          }

          final expand = sin(pi * t);
          currentWidth =
              (right - left).clamp(baseRestWidth, double.infinity) +
              (expand * slotWidth * _maxWidthExpand);
          pillCenterX = (left + right) / 2;
          currentHeight = _restHeight + (_maxHeightExpand * expand);
          contentScale = 1 - (0.1 * expand);
        } else {
          // ── At rest ──────────────────────────────────────────────────
          pillCenterX = currentIndex * slotWidth + slotWidth / 2;
          currentWidth = baseRestWidth;
          currentHeight = _restHeight;
        }

        // ── Damped bounce as the pill lands ────────────────────────────
        if (wiggle > 0 && wiggle < 1 && !isDragging) {
          final damped = sin(wiggle * pi * 4) * (1 - wiggle) * 0.6;
          wiggleRotation = damped * 0.04;
          wiggleOffsetY = sin(wiggle * pi * 3) * (1 - wiggle) * 6;
          final sizeBounce = sin(wiggle * pi * 3) * (1 - wiggle) * 0.08;
          currentWidth *= 1 + sizeBounce;
          currentHeight *= 1 + sizeBounce * 0.5;
        }

        final radius = currentHeight / 2;
        final movement = isDragging
            ? (dragOffset.abs() / slotWidth).clamp(0.0, 1.0)
            : sin(pi * t);

        return Positioned(
          left: pillCenterX - currentWidth / 2,
          top: (kFrostedNavBarHeight - currentHeight) / 2 + wiggleOffsetY,
          child: Transform.rotate(
            angle: wiggleRotation,
            child: RepaintBoundary(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(radius),
                child: BackdropFilter(
                  filter: _pillBlur,
                  child: Container(
                    width: currentWidth,
                    height: currentHeight,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(radius),
                      // The pill deepens slightly as it travels and settles
                      // back — the movement is the emphasis, not a halo.
                      color: accent.withValues(
                        alpha:
                            (context.brand.isDark ? 0.16 : 0.09) +
                            0.05 * movement,
                      ),
                      border: Border.all(
                        color: accent.withValues(alpha: 0.2 + 0.1 * movement),
                      ),
                    ),
                    child: Transform.scale(
                      scale: contentScale,
                      child: const SizedBox.expand(),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// One destination
// ═══════════════════════════════════════════════════════════════════════════

class _GlassNavItem extends StatefulWidget {
  const _GlassNavItem({
    required this.accent,
    required this.item,
    required this.isSelected,
    required this.onTap,
  });

  final Color accent;
  final FrostedNavBarItem item;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  State<_GlassNavItem> createState() => _GlassNavItemState();
}

class _GlassNavItemState extends State<_GlassNavItem>
    with TickerProviderStateMixin {
  late final AnimationController _tapController;
  late final Animation<double> _tapScale;

  /// The destination's signature movement, played once as it is selected.
  late final AnimationController _signature = AnimationController(
    vsync: this,
    duration: AppMotion.emphasized,
  );

  @override
  void initState() {
    super.initState();
    _tapController = AnimationController(
      vsync: this,
      duration: AppMotion.quick,
      reverseDuration: AppMotion.quick,
    );
    _tapScale = Tween<double>(
      begin: 1,
      end: 0.88,
    ).animate(CurvedAnimation(parent: _tapController, curve: Curves.easeInOut));
  }

  @override
  void didUpdateWidget(covariant _GlassNavItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.isSelected &&
        widget.isSelected &&
        widget.item.motion != NavIconMotion.none &&
        motionAllowed(context)) {
      _signature.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _signature.dispose();
    _tapController.dispose();
    super.dispose();
  }

  /// Where the icon is at [t] of its signature movement. Every one of them
  /// ends exactly where it began, so a movement interrupted by the next tap
  /// never leaves an icon crooked.
  Matrix4 _signatureAt(double t) {
    final arc = sin(pi * t);
    switch (widget.item.motion) {
      case NavIconMotion.none:
        return Matrix4.identity();
      case NavIconMotion.spin:
        return Matrix4.rotationZ(2 * pi * Curves.easeInOutCubic.transform(t));
      case NavIconMotion.toss:
        return Matrix4.translationValues(0, -8 * arc, 0)
          ..rotateZ(-0.45 * sin(2 * pi * t) * (1 - t));
      case NavIconMotion.pop:
        final swell = sin(pi * t) * (1 - t * 0.4);
        return Matrix4.diagonal3Values(1 + 0.38 * swell, 1 + 0.38 * swell, 1);
      case NavIconMotion.flip:
        return Matrix4.identity()
          ..setEntry(3, 2, 0.004)
          ..rotateY(2 * pi * Curves.easeInOut.transform(t));
      case NavIconMotion.quarter:
        return Matrix4.rotationZ(pi / 2 * AppMotion.arrive.transform(t));
      case NavIconMotion.bounce:
        final hop = sin(pi * t * 2) * (1 - t);
        return Matrix4.translationValues(0, -7 * hop.abs(), 0);
      case NavIconMotion.turn:
        return Matrix4.rotationZ(-0.5 * sin(2 * pi * t) * (1 - t));
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.isSelected ? widget.accent : context.brand.mutedInk;

    final icon = AnimatedSwitcher(
      duration: motionOr(context, AppMotion.standard),
      switchInCurve: AppMotion.arrive,
      switchOutCurve: Curves.easeIn,
      transitionBuilder: (child, animation) => FadeTransition(
        opacity: animation,
        child: ScaleTransition(scale: animation, child: child),
      ),
      child: Icon(
        widget.isSelected ? widget.item.selectedIcon : widget.item.icon,
        key: ValueKey('${widget.item.label}_${widget.isSelected}'),
        size: kFrostedNavBarIconSize,
        color: color,
      ),
    );

    // `excludeSemantics` keeps the child Text from contributing a second copy
    // of the label, which would otherwise be announced twice.
    return Semantics(
      button: true,
      selected: widget.isSelected,
      excludeSemantics: true,
      label: widget.item.badgeCount > 0
          ? '${widget.item.label}, ${widget.item.badgeCount} new'
          : widget.item.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _tapController.forward(),
        onTapUp: (_) {
          _tapController.reverse();
          widget.onTap();
        },
        onTapCancel: () => _tapController.reverse(),
        child: ScaleTransition(
          scale: _tapScale,
          child: SizedBox(
            height: kFrostedNavBarHeight,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedScale(
                  duration: motionOr(context, AppMotion.emphasized),
                  curve: AppMotion.arrive,
                  scale: widget.isSelected ? 1.12 : 1,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      AnimatedBuilder(
                        animation: _signature,
                        builder: (context, child) => _signature.isAnimating
                            ? Transform(
                                alignment: Alignment.center,
                                transform: _signatureAt(_signature.value),
                                child: child,
                              )
                            : child!,
                        child: icon,
                      ),
                      if (widget.item.badgeCount > 0)
                        Positioned(
                          right: -7,
                          top: -4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 1,
                            ),
                            constraints: const BoxConstraints(minWidth: 16),
                            decoration: BoxDecoration(
                              color: context.brand.terracotta,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              widget.item.badgeCount > 99
                                  ? '99+'
                                  : '${widget.item.badgeCount}',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                height: 1.2,
                              ),
                            ),
                          ),
                        )
                      else if (widget.item.badge case final badge?)
                        Positioned(right: -11, top: -5, child: badge)
                      else if (widget.item.showIndicatorDot)
                        Positioned(
                          right: -3,
                          top: -2,
                          child: SizedBox(
                            width: 8,
                            height: 8,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: widget.accent,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                AnimatedDefaultTextStyle(
                  duration: motionOr(context, AppMotion.standard),
                  curve: Curves.easeOut,
                  // The theme's family named outright rather than inherited:
                  // this rail also flies between routes as a hero, through
                  // the Navigator's overlay, where the inherited text style is
                  // MaterialApp's red-and-underlined "no Material here" one.
                  style: TextStyle(
                    fontFamily: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.fontFamily,
                    color: color,
                    fontSize: kFrostedNavBarLabelSize,
                    fontWeight: widget.isSelected
                        ? FontWeight.w900
                        : FontWeight.w600,
                    letterSpacing: 0.2,
                  ),
                  child: Text(
                    widget.item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
