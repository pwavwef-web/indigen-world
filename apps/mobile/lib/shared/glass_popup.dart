import 'dart:async';
import 'dart:math' show max, min;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart'
    show kFrostedNavBarReservedSpace;

/// ─────────────────────────────────────────────────────────────────────────────
/// GLASS POPUPS
///
/// Every transient surface in the app used to slide up from the bottom edge,
/// where it fought the floating glass nav rail for the same few pixels. These
/// primitives put that content in the middle of the screen instead, on a card
/// cut from the same liquid glass as the frosted nav rail: a blurred backdrop,
/// a warm plaster fill, a hairline white edge, a heritage-green tinted lift.
///
/// Reach for [showGlassPopup] for arbitrary content, [showGlassActionSheet]
/// for a stack of choices, [showGlassConfirm] for a yes/no, and
/// [showGlassToast] for a single sentence of feedback. New work should not
/// call `showModalBottomSheet` unless the flow genuinely wants the full height
/// of the screen.
/// ─────────────────────────────────────────────────────────────────────────────

// ── Tunables ────────────────────────────────────────────────────────────────

/// Corner radius of every glass card, matched to the app's largest sheet
/// radius so a popup and a bottom sheet read as the same family.
const double kGlassPopupRadius = 28;

/// Smallest gap between the card and the left/right edges of a narrow phone.
const double _kSideMargin = 20;

/// Gap kept above and below the card, so it never kisses the status bar.
const double _kVerticalMargin = 24;

/// The card takes at most this share of the screen; anything taller scrolls
/// inside it rather than pushing the card off the viewport.
const double _kMaxHeightFraction = 0.78;

const Duration _kEnter = Duration(milliseconds: 220);
const Duration _kExit = Duration(milliseconds: 140);
const Duration _kToastLifetime = Duration(milliseconds: 3000);

/// The card arrives in 220ms but should leave in about 140ms — dismissal
/// wants to feel instant. [showGeneralDialog] has no separate reverse
/// duration, so the exit curve finishes early instead: by the time the route
/// animation has fallen to 0.36 (64% of 220ms ≈ 140ms) the card is already
/// gone, and only the scrim is left to fade.
const Curve _kExitCurve = Interval(0.36, 1, curve: Curves.easeInCubic);

/// Dark enough to give the blur something to bite on over both the cream
/// scaffolds and the near-black Explore ground.
final Color _kScrim = Colors.black.withValues(alpha: 0.42);

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/// A centered, frosted-glass modal. The drop-in replacement for
/// `showModalBottomSheet` across the app.
///
/// [builder] receives a context below the popup's own route, so
/// `Navigator.pop(context, value)` inside it resolves this popup and returns
/// the value to the awaiting caller.
///
/// Set [scrollable] to false when the body already scrolls itself (a
/// `ListView`, a `TabBarView`); otherwise the body is wrapped so tall content
/// scrolls inside the card.
Future<T?> showGlassPopup<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  String? title,
  String? subtitle,
  bool isDismissible = true,
  bool scrollable = true,
  double maxWidth = 460,
}) {
  final hasHeader = title != null || subtitle != null;
  return _showGlassCard<T>(
    context: context,
    builder: builder,
    title: title,
    subtitle: subtitle,
    isDismissible: isDismissible,
    scrollable: scrollable,
    maxWidth: maxWidth,
    bodyPadding: EdgeInsets.fromLTRB(20, hasHeader ? 16 : 22, 20, 20),
  );
}

/// A centered glass action list — the replacement for the ListTile-stack
/// bottom sheets (post menu, report reasons, media picker...).
///
/// Returns the [GlassAction.value] of the row the member tapped, or null if
/// they dismissed the card.
Future<T?> showGlassActionSheet<T>({
  required BuildContext context,
  required List<GlassAction<T>> actions,
  String? title,
  String? subtitle,
  bool isDismissible = true,
}) {
  final hasHeader = title != null || subtitle != null;
  return _showGlassCard<T>(
    context: context,
    title: title,
    subtitle: subtitle,
    isDismissible: isDismissible,
    // Rows are their own tap targets, so the body sits closer to the edge of
    // the glass than prose would.
    bodyPadding: EdgeInsets.fromLTRB(10, hasHeader ? 8 : 12, 10, 12),
    builder: (context) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final action in actions)
          _GlassActionRow<T>(
            action: action,
            onTap: () => Navigator.of(context).pop(action.value),
          ),
      ],
    ),
  );
}

/// One row in a glass action sheet.
class GlassAction<T> {
  const GlassAction({
    required this.value,
    required this.label,
    this.icon,
    this.description,
    this.isDestructive = false,
  });

  /// What [showGlassActionSheet] returns when this row is chosen.
  final T value;
  final String label;
  final IconData? icon;

  /// An optional second line, for choices that need a word of explanation.
  final String? description;

  /// Blocking, reporting, deleting: rendered in the scheme's error colour so
  /// the consequence is visible before the tap, not after.
  final bool isDestructive;
}

/// A centered glass confirm/alert — the replacement for bare `AlertDialog`.
///
/// Resolves to true when confirmed, false when cancelled, and null when the
/// member dismissed the card without choosing.
Future<bool?> showGlassConfirm({
  required BuildContext context,
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool isDestructive = false,
}) => showGlassPopup<bool>(
  context: context,
  title: title,
  maxWidth: 420,
  builder: (context) => _GlassConfirmBody(
    message: message,
    confirmLabel: confirmLabel,
    cancelLabel: cancelLabel,
    isDestructive: isDestructive,
  ),
);

/// A brief message that floats clear of the bottom edge instead of clinging to
/// it. Replaces `ScaffoldMessenger` SnackBars at call sites that just want to
/// say one sentence.
///
/// Only one toast is ever on screen: calling this twice in a row replaces the
/// first message rather than stacking a pile of glass over the nav rail.
void showGlassToast(BuildContext context, String message, {IconData? icon}) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  _GlassToastHost.show(
    overlay,
    message: message,
    icon: icon,
    reduceMotion: MediaQuery.disableAnimationsOf(context),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The shared route
// ═══════════════════════════════════════════════════════════════════════════

/// The one place a glass popup route is built. Both public entry points come
/// through here so every popup shares a scrim, a motion curve and a shape.
///
/// [showGeneralDialog] gives us a `RawDialogRoute`, which is what makes this
/// accessible for free: the route already wraps its page in
/// `Semantics(scopesRoute: true, explicitChildNodes: true)`, installs a
/// `FocusScope` that traps focus inside the card, and maps Escape (and the
/// system back gesture) to a dismiss as long as the barrier is dismissible.
Future<T?> _showGlassCard<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  required EdgeInsets bodyPadding,
  String? title,
  String? subtitle,
  bool isDismissible = true,
  bool scrollable = true,
  double maxWidth = 460,
}) {
  final reduceMotion = MediaQuery.disableAnimationsOf(context);
  final localizations = MaterialLocalizations.of(context);

  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: isDismissible,
    barrierLabel: localizations.modalBarrierDismissLabel,
    barrierColor: _kScrim,
    transitionDuration: reduceMotion ? Duration.zero : _kEnter,
    pageBuilder: (context, animation, secondaryAnimation) => _GlassCard(
      title: title,
      subtitle: subtitle,
      maxWidth: maxWidth,
      scrollable: scrollable,
      bodyPadding: bodyPadding,
      child: Builder(builder: builder),
    ),
    transitionBuilder: (context, animation, secondaryAnimation, child) {
      if (reduceMotion) return child;
      final t = switch (animation.status) {
        AnimationStatus.reverse => _kExitCurve.transform(animation.value),
        _ => Curves.easeOutCubic.transform(animation.value),
      };
      return Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.scale(scale: 0.94 + 0.06 * t, child: child),
      );
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The glass card
// ═══════════════════════════════════════════════════════════════════════════

class _GlassCard extends StatelessWidget {
  const _GlassCard({
    required this.child,
    required this.maxWidth,
    required this.scrollable,
    required this.bodyPadding,
    this.title,
    this.subtitle,
  });

  final Widget child;
  final double maxWidth;
  final bool scrollable;
  final EdgeInsets bodyPadding;
  final String? title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final padding = MediaQuery.paddingOf(context);
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;

    // A centered card whose text field the keyboard eats is worse than a
    // bottom sheet, so the room the keyboard leaves behind is what the card
    // centres itself in, and what caps how tall it is allowed to grow.
    final room =
        size.height -
        keyboard -
        padding.top -
        padding.bottom -
        _kVerticalMargin * 2;
    final maxHeight = min(size.height * _kMaxHeightFraction, max(room, 140.0));

    final hasHeader = title != null || subtitle != null;

    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.only(bottom: keyboard),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: _kSideMargin,
            vertical: _kVerticalMargin,
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: maxWidth,
              maxHeight: maxHeight,
            ),
            // The route already scopes semantics for us; naming it as well
            // means a screen reader announces the popup by its heading.
            child: Semantics(
              scopesRoute: true,
              explicitChildNodes: true,
              namesRoute: title != null,
              label: title,
              child: _FrostedSurface(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (hasHeader) ...[
                      _GlassHeader(title: title, subtitle: subtitle),
                      SizedBox(
                        height: 1,
                        child: ColoredBox(
                          color: BrandColors.heritageGreen.withValues(
                            alpha: 0.08,
                          ),
                        ),
                      ),
                    ],
                    // Tall content scrolls inside the glass; the card itself
                    // never grows past the height computed above.
                    Flexible(
                      child: scrollable
                          ? SingleChildScrollView(
                              padding: bodyPadding,
                              child: child,
                            )
                          : Padding(padding: bodyPadding, child: child),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The liquid glass itself: a blurred backdrop under a translucent warm
/// plaster fill, a hairline white edge and a heritage-green lift.
///
/// [BackdropFilter] only blurs what is painted behind it in the same layer
/// tree — inside a dialog route that is the page below, which is exactly the
/// frosting we want. It only shows through because the fill above it stays
/// translucent; make it opaque and the blur becomes invisible work.
class _FrostedSurface extends StatelessWidget {
  const _FrostedSurface({required this.child});

  final Widget child;

  static final _blur = ImageFilter.blur(sigmaX: 24, sigmaY: 24);
  static final _shape = BorderRadius.circular(kGlassPopupRadius);

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: DecoratedBox(
      // The lift lives outside the clip: a shadow drawn inside a ClipRRect is
      // a shadow nobody ever sees.
      decoration: BoxDecoration(
        borderRadius: _shape,
        boxShadow: BrandShadows.lifted,
      ),
      child: ClipRRect(
        borderRadius: _shape,
        child: BackdropFilter(
          filter: _blur,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: _shape,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Colors.white.withValues(alpha: 0.72),
                  BrandColors.plasterCream.withValues(alpha: 0.62),
                  Colors.white.withValues(alpha: 0.68),
                ],
                stops: const [0, 0.58, 1],
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.55)),
            ),
            child: DecoratedBox(
              // A sheen down the top edge, the same trick the nav rail's pill
              // uses to look like a lit surface rather than a flat translucent
              // rectangle.
              decoration: BoxDecoration(
                borderRadius: _shape,
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.white.withValues(alpha: 0.3),
                    Colors.transparent,
                    BrandColors.heritageGreen.withValues(alpha: 0.05),
                  ],
                  stops: const [0, 0.4, 1],
                ),
              ),
              // Transparent Material so ink, default text styles and icon
              // themes work on a card that paints its own background.
              child: Material(type: MaterialType.transparency, child: child),
            ),
          ),
        ),
      ),
    ),
  );
}

class _GlassHeader extends StatelessWidget {
  const _GlassHeader({this.title, this.subtitle});

  final String? title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(22, 20, 22, 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (title != null)
          Text(
            title!,
            style: const TextStyle(
              color: BrandColors.heritageGreen,
              fontSize: 19,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.3,
              height: 1.2,
            ),
          ),
        if (subtitle != null) ...[
          if (title != null) const SizedBox(height: 6),
          Text(
            subtitle!,
            style: const TextStyle(
              color: BrandColors.mutedInk,
              fontSize: 14,
              height: 1.4,
            ),
          ),
        ],
      ],
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// One action row
// ═══════════════════════════════════════════════════════════════════════════

class _GlassActionRow<T> extends StatelessWidget {
  const _GlassActionRow({required this.action, required this.onTap});

  final GlassAction<T> action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accent = action.isDestructive
        ? Theme.of(context).colorScheme.error
        : BrandColors.heritageGreen;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      splashColor: BrandColors.kenteGold.withValues(alpha: 0.16),
      highlightColor: Colors.white.withValues(alpha: 0.4),
      child: ConstrainedBox(
        // Comfortably past the 48dp minimum, because these rows are the whole
        // reason the popup exists.
        constraints: const BoxConstraints(minHeight: 52),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              if (action.icon != null) ...[
                Icon(action.icon, size: 21, color: accent),
                const SizedBox(width: 14),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      action.label,
                      style: TextStyle(
                        color: action.isDestructive ? accent : BrandColors.ink,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                      ),
                    ),
                    if (action.description != null) ...[
                      const SizedBox(height: 3),
                      Text(
                        action.description!,
                        style: const TextStyle(
                          color: BrandColors.mutedInk,
                          fontSize: 13,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Confirm body
// ═══════════════════════════════════════════════════════════════════════════

class _GlassConfirmBody extends StatelessWidget {
  const _GlassConfirmBody({
    required this.message,
    required this.confirmLabel,
    required this.cancelLabel,
    required this.isDestructive,
  });

  final String message;
  final String confirmLabel;
  final String cancelLabel;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) {
    final error = Theme.of(context).colorScheme.error;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          message,
          style: const TextStyle(
            color: BrandColors.ink,
            fontSize: 15,
            height: 1.45,
          ),
        ),
        const SizedBox(height: 22),
        Row(
          children: [
            Expanded(
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 50),
                  foregroundColor: BrandColors.mutedInk,
                ),
                child: Text(cancelLabel, overflow: TextOverflow.ellipsis),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                style: isDestructive
                    ? FilledButton.styleFrom(
                        backgroundColor: error,
                        foregroundColor: Colors.white,
                      )
                    : null,
                child: Text(confirmLabel, overflow: TextOverflow.ellipsis),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Toast — one sentence, floating clear of the glass rail
// ═══════════════════════════════════════════════════════════════════════════

/// Holds the single live toast entry. Kept as a host rather than a queue on
/// purpose: a second message means the first one is stale.
abstract final class _GlassToastHost {
  static OverlayEntry? _entry;

  static void show(
    OverlayState overlay, {
    required String message,
    required bool reduceMotion,
    IconData? icon,
  }) {
    _remove(_entry);
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (context) => _GlassToast(
        message: message,
        icon: icon,
        reduceMotion: reduceMotion,
        // A toast that has already been replaced must not pull itself a second
        // time, so a late animation callback is ignored once it is no longer
        // the live entry.
        onDismissed: () {
          if (identical(_entry, entry)) _remove(entry);
        },
      ),
    );
    _entry = entry;
    overlay.insert(entry);
  }

  static void _remove(OverlayEntry? entry) {
    if (identical(_entry, entry)) _entry = null;
    if (entry != null && entry.mounted) entry.remove();
  }
}

class _GlassToast extends StatefulWidget {
  const _GlassToast({
    required this.message,
    required this.onDismissed,
    required this.reduceMotion,
    this.icon,
  });

  final String message;
  final VoidCallback onDismissed;
  final bool reduceMotion;
  final IconData? icon;

  @override
  State<_GlassToast> createState() => _GlassToastState();
}

class _GlassToastState extends State<_GlassToast>
    with SingleTickerProviderStateMixin {
  static final _blur = ImageFilter.blur(sigmaX: 18, sigmaY: 18);

  late final AnimationController _controller;
  late final CurvedAnimation _curve;
  late final Animation<Offset> _slide;
  Timer? _timer;
  bool _leaving = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.reduceMotion ? Duration.zero : _kEnter,
      reverseDuration: widget.reduceMotion ? Duration.zero : _kExit,
    );
    _curve = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.35),
      end: Offset.zero,
    ).animate(_curve);
    _controller
      ..addStatusListener(_onStatus)
      ..forward();
    _timer = Timer(_kToastLifetime, _dismiss);
  }

  /// The entry is only pulled once the exit animation has actually landed, so
  /// the message never disappears mid-fade.
  void _onStatus(AnimationStatus status) {
    if (status == AnimationStatus.dismissed && _leaving) widget.onDismissed();
  }

  void _dismiss() {
    if (_leaving) return;
    _leaving = true;
    _timer?.cancel();
    _controller.reverse();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _curve.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Lifted over the floating rail and the home indicator both, so a message
    // never lands on top of the navigation it is reporting on.
    final bottom =
        kFrostedNavBarReservedSpace + MediaQuery.paddingOf(context).bottom;

    return Positioned(
      left: 0,
      right: 0,
      bottom: bottom,
      child: FadeTransition(
        opacity: _curve,
        child: SlideTransition(
          position: _slide,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: _kSideMargin),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Semantics(
                  liveRegion: true,
                  container: true,
                  child: GestureDetector(
                    onTap: _dismiss,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: BrandShadows.lifted,
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: BackdropFilter(
                          filter: _blur,
                          child: DecoratedBox(
                            // Dark glass rather than plaster: a toast has to
                            // read over the cream tabs and over Explore's
                            // near-black ground with the same fill.
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(20),
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  BrandColors.heritageGreen.withValues(
                                    alpha: 0.92,
                                  ),
                                  BrandColors.nightGreen.withValues(
                                    alpha: 0.88,
                                  ),
                                ],
                              ),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.18),
                              ),
                            ),
                            child: Material(
                              type: MaterialType.transparency,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 13,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (widget.icon != null) ...[
                                      Icon(
                                        widget.icon,
                                        size: 19,
                                        color: BrandColors.kenteGold,
                                      ),
                                      const SizedBox(width: 11),
                                    ],
                                    Flexible(
                                      child: Text(
                                        widget.message,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          height: 1.35,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
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
  }
}
