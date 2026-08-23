import 'dart:math' show pi, sin;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// FROSTED NAV BAR
///
/// A floating "liquid glass" bottom bar: a translucent, blurred pill rail with
/// a highlighter pill that stretches between destinations, wiggles on landing
/// and can be dragged directly with a finger.
///
/// The motion is deliberately expressive; the palette stays Indigen — heritage
/// green ink, kente gold accents, warm plaster glass — so it reads as this
/// project rather than a generic frosted control.
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

class FrostedNavBarItem {
  const FrostedNavBarItem({
    required this.label,
    required this.icon,
    IconData? selectedIcon,
    this.showIndicatorDot = false,
    this.badgeCount = 0,
  }) : selectedIcon = selectedIcon ?? icon;

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final bool showIndicatorDot;
  final int badgeCount;
}

class FrostedNavBar extends StatefulWidget {
  const FrostedNavBar({
    required this.currentIndex,
    required this.onTap,
    required this.items,
    super.key,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<FrostedNavBarItem> items;

  @override
  State<FrostedNavBar> createState() => _FrostedNavBarState();
}

class _FrostedNavBarState extends State<FrostedNavBar>
    with TickerProviderStateMixin {
  late final AnimationController _slideController;
  late final AnimationController _wiggleController;
  late final AnimationController _glowController;
  late final Animation<double> _glowAnimation;

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
      duration: const Duration(milliseconds: 350),
    );
    _wiggleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _glowController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3000),
    )..repeat(reverse: true);
    _glowAnimation = CurvedAnimation(
      parent: _glowController,
      curve: Curves.easeInOut,
    );
    _slideController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _wiggleController.forward(from: 0);
      }
    });
  }

  @override
  void didUpdateWidget(covariant FrostedNavBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currentIndex != widget.currentIndex && !_isDragging) {
      _previousIndex = oldWidget.currentIndex;
      _slideController.forward(from: 0);
      HapticFeedback.lightImpact();
    }
  }

  @override
  void dispose() {
    _slideController.dispose();
    _wiggleController.dispose();
    _glowController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;

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
                    _wiggleController.forward(from: 0);
                    HapticFeedback.lightImpact();
                  },
                  child: _GlassRail(
                    currentIndex: widget.currentIndex,
                    previousIndex: _previousIndex,
                    items: widget.items,
                    onTap: widget.onTap,
                    slideController: _slideController,
                    wiggleController: _wiggleController,
                    glowAnimation: _glowAnimation,
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
    required this.currentIndex,
    required this.previousIndex,
    required this.items,
    required this.onTap,
    required this.slideController,
    required this.wiggleController,
    required this.glowAnimation,
    required this.isDragging,
    required this.dragOffset,
    required this.dragStartIndex,
    required this.slotWidth,
  });

  final int currentIndex;
  final int previousIndex;
  final List<FrostedNavBarItem> items;
  final ValueChanged<int> onTap;
  final AnimationController slideController;
  final AnimationController wiggleController;
  final Animation<double> glowAnimation;
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
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Colors.white.withValues(alpha: 0.62),
                        BrandColors.plasterCream.withValues(alpha: 0.44),
                        Colors.white.withValues(alpha: 0.54),
                      ],
                      stops: const [0, 0.55, 1],
                    ),
                    border: Border.all(
                      color: BrandColors.heritageGreen.withValues(alpha: 0.16),
                      width: 0.9,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: BrandColors.heritageGreen.withValues(
                          alpha: 0.14,
                        ),
                        blurRadius: 26,
                        offset: const Offset(0, 10),
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
          slideController: slideController,
          wiggleController: wiggleController,
          glowAnimation: glowAnimation,
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
    required this.slideController,
    required this.wiggleController,
    required this.glowAnimation,
    required this.currentIndex,
    required this.previousIndex,
    required this.slotWidth,
    required this.isDragging,
    required this.dragOffset,
    required this.dragStartIndex,
  });

  final AnimationController slideController;
  final AnimationController wiggleController;
  final Animation<double> glowAnimation;
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
      animation: Listenable.merge([
        slideController,
        wiggleController,
        glowAnimation,
      ]),
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
        final glow = glowAnimation.value;

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
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          Colors.white.withValues(
                            alpha: 0.88 + 0.06 * glow + 0.06 * movement,
                          ),
                          BrandColors.kenteGold.withValues(
                            alpha: 0.16 + 0.06 * glow + 0.10 * movement,
                          ),
                          Colors.white.withValues(
                            alpha: 0.74 + 0.05 * glow + 0.08 * movement,
                          ),
                        ],
                        stops: const [0, 0.5, 1],
                      ),
                      border: Border.all(
                        color: BrandColors.kenteGold.withValues(
                          alpha: 0.34 + 0.18 * glow,
                        ),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: BrandColors.kenteGold.withValues(
                            alpha: 0.14 + 0.10 * movement + 0.05 * glow,
                          ),
                          blurRadius: 22 + (16 * movement),
                          spreadRadius: 1 + (5 * movement),
                        ),
                        BoxShadow(
                          color: BrandColors.heritageGreen.withValues(
                            alpha: 0.10,
                          ),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Transform.scale(
                      scale: contentScale,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(radius),
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.white.withValues(alpha: 0.34),
                              Colors.transparent,
                              BrandColors.heritageGreen.withValues(alpha: 0.04),
                            ],
                            stops: const [0, 0.42, 1],
                          ),
                        ),
                      ),
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
    required this.item,
    required this.isSelected,
    required this.onTap,
  });

  final FrostedNavBarItem item;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  State<_GlassNavItem> createState() => _GlassNavItemState();
}

class _GlassNavItemState extends State<_GlassNavItem>
    with SingleTickerProviderStateMixin {
  late final AnimationController _tapController;
  late final Animation<double> _tapScale;

  @override
  void initState() {
    super.initState();
    _tapController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
      reverseDuration: const Duration(milliseconds: 180),
    );
    _tapScale = Tween<double>(
      begin: 1,
      end: 0.88,
    ).animate(CurvedAnimation(parent: _tapController, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _tapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.isSelected
        ? BrandColors.heritageGreen
        : BrandColors.mutedInk;

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
                  duration: const Duration(milliseconds: 350),
                  curve: Curves.easeOutBack,
                  scale: widget.isSelected ? 1.12 : 1,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 260),
                        switchInCurve: Curves.easeOutBack,
                        switchOutCurve: Curves.easeIn,
                        transitionBuilder: (child, animation) => FadeTransition(
                          opacity: animation,
                          child: ScaleTransition(
                            scale: animation,
                            child: child,
                          ),
                        ),
                        child: Icon(
                          widget.isSelected
                              ? widget.item.selectedIcon
                              : widget.item.icon,
                          key: ValueKey(
                            '${widget.item.label}_${widget.isSelected}',
                          ),
                          size: kFrostedNavBarIconSize,
                          color: color,
                        ),
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
                              color: BrandColors.terracotta,
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
                      else if (widget.item.showIndicatorDot)
                        const Positioned(
                          right: -3,
                          top: -2,
                          child: SizedBox(
                            width: 8,
                            height: 8,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: BrandColors.kenteGold,
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
                  duration: const Duration(milliseconds: 260),
                  curve: Curves.easeOut,
                  style: TextStyle(
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
