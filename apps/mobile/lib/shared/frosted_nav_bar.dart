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
/// anything. Instead the overlay that draws it inflates `MediaQuery.padding`
/// and the two helpers below read that inflation back out. A screen asks how
/// much room to leave and gets the honest answer for the moment it is asking.
///
/// `viewPadding` is deliberately left alone by the overlay, which is what makes
/// the delta recoverable: the system inset is still in there unchanged, so the
/// difference between the two is exactly what the mini-player added.
const double kMiniPlayerHeight = 56;

/// The vertical space the mini-player is currently claiming, or zero.
double musicInset(BuildContext context) {
  final padding = MediaQuery.paddingOf(context).bottom;
  final view = MediaQuery.viewPaddingOf(context).bottom;
  final inset = padding - view;
  return inset > 0 ? inset : 0;
}

/// What a shell tab should leave under its scrollable content: the rail, plus
/// the mini-player when one is playing.
double shellBottomReserve(BuildContext context) =>
    kFrostedNavBarReservedSpace + musicInset(context);

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
    required this.currentIndex,
    required this.previousIndex,
    required this.slotWidth,
    required this.isDragging,
    required this.dragOffset,
    required this.dragStartIndex,
  });

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
                      color: context.brand.accent.withValues(
                        alpha:
                            (context.brand.isDark ? 0.16 : 0.09) +
                            0.05 * movement,
                      ),
                      border: Border.all(
                        color: context.brand.accent.withValues(
                          alpha: 0.2 + 0.1 * movement,
                        ),
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
        ? context.brand.accent
        : context.brand.mutedInk;

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
                      else if (widget.item.showIndicatorDot)
                        Positioned(
                          right: -3,
                          top: -2,
                          child: SizedBox(
                            width: 8,
                            height: 8,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: context.brand.accent,
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
