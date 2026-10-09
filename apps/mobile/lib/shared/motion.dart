import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart' show kTouchSlop;
import 'package:flutter/material.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// MOTION
///
/// The timings and the two small helpers every animated surface shares.
///
/// Three durations and two curves, deliberately few. An app where each screen
/// picks its own 230 ms here and 310 ms there moves like a room full of people
/// clapping out of time; one where everything arrives on the same beat moves
/// like one thing.
///
/// And one rule that is not a number: **loops only while music plays.** A
/// ticker that runs forever costs battery on the phones members actually own,
/// hangs every `pumpAndSettle` in the suite, and gives somebody who paused a
/// page that will not sit still. So anything that repeats is mounted only
/// while something is playing, and everything else is one-shot motion in
/// answer to a touch.
/// ─────────────────────────────────────────────────────────────────────────────
abstract final class AppMotion {
  /// Press feedback: a button going down under a finger.
  static const quick = Duration(milliseconds: 150);

  /// A state changing in place: a colour, an icon, a dot.
  static const standard = Duration(milliseconds: 280);

  /// A screen or a shape changing: a page growing out of a card.
  static const emphasized = Duration(milliseconds: 420);

  /// For things arriving.
  static const arrive = Curves.easeOutCubic;

  /// For things *landing* — artwork, the play button, a rail icon. Never for
  /// something that is merely changing colour.
  static const land = Curves.easeOutBack;
}

/// Whether this member wants movement at all.
///
/// Reads the platform's reduce-motion switch, which is what every other
/// animated surface in the app already respects.
bool motionAllowed(BuildContext context) =>
    !MediaQuery.disableAnimationsOf(context);

/// A duration, or zero for somebody who asked for less motion.
Duration motionOr(BuildContext context, Duration duration) =>
    motionAllowed(context) ? duration : Duration.zero;

/// Opens a short window in which the [Entrance]s below it may play.
///
/// ── Why a gate ────────────────────────────────────────────────────────────
/// Rows in a lazy list are built and thrown away as they scroll. An entrance
/// that played on every build would replay every time somebody scrolled back
/// to the top, which turns a greeting into a nervous tic. The gate is opened
/// once, when the screen arrives, and closes a moment later; only what is
/// built while it is open is animated in.
class EntranceGate extends StatefulWidget {
  const EntranceGate({
    required this.child,
    this.window = const Duration(milliseconds: 900),
    super.key,
  });

  final Widget child;
  final Duration window;

  /// Whether an entrance built now should play.
  ///
  /// With no gate above it, an entrance plays once, when it is first built.
  static bool isOpen(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<_EntranceGateScope>()
          ?.state
          ._open ??
      true;

  @override
  State<EntranceGate> createState() => _EntranceGateState();
}

class _EntranceGateState extends State<EntranceGate> {
  var _open = true;
  Timer? _closer;

  @override
  void initState() {
    super.initState();
    // Closed by a timer rather than a frame count, because a screen that
    // arrives while the phone is busy may draw its first frame late — and a
    // cold start is exactly when that happens.
    _closer = Timer(widget.window, () => _open = false);
  }

  @override
  void dispose() {
    _closer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _EntranceGateScope(state: this, child: widget.child);
}

class _EntranceGateScope extends InheritedWidget {
  const _EntranceGateScope({required this.state, required super.child});

  final _EntranceGateState state;

  // The gate closing is not a reason to rebuild anything: it only decides what
  // happens to entrances that have not been built yet.
  @override
  bool updateShouldNotify(_EntranceGateScope oldWidget) => false;
}

/// Fades a child in and lifts it a few pixels into place, once.
///
/// [index] staggers a list: each item waits 40 ms more than the one before,
/// capped at the eighth so the ninth row of a long list never waits for a
/// queue of rows nobody can see.
class Entrance extends StatefulWidget {
  const Entrance({
    required this.child,
    this.index = 0,
    this.distance = 14,
    super.key,
  });

  final Widget child;
  final int index;

  /// How far below its place the child starts, in logical pixels.
  final double distance;

  @override
  State<Entrance> createState() => _EntranceState();
}

class _EntranceState extends State<Entrance>
    with SingleTickerProviderStateMixin {
  static const _step = Duration(milliseconds: 40);
  static const _travel = Duration(milliseconds: 380);

  AnimationController? _controller;
  CurvedAnimation? _progress;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final play = motionAllowed(context) && EntranceGate.isOpen(context);
    if (!play) return;

    final delay = _step * math.min(widget.index, 8);
    final total = delay + _travel;
    final start = delay.inMicroseconds / total.inMicroseconds;
    final controller = AnimationController(vsync: this, duration: total);
    _controller = controller;
    _progress = CurvedAnimation(
      parent: controller,
      curve: Interval(start, 1, curve: AppMotion.arrive),
    );
    controller.forward();
  }

  @override
  void dispose() {
    _progress?.dispose();
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final progress = _progress;
    if (progress == null) return widget.child;
    return AnimatedBuilder(
      animation: progress,
      builder: (context, child) => Opacity(
        opacity: progress.value,
        child: Transform.translate(
          offset: Offset(0, widget.distance * (1 - progress.value)),
          child: child,
        ),
      ),
      child: widget.child,
    );
  }
}

/// Sinks a little under a finger and springs back when it lifts.
///
/// Listens to raw pointer events rather than claiming a gesture, so it never
/// competes with the [InkWell] or [GestureDetector] inside it: the tap still
/// belongs to whatever was already handling it. This is only the feeling of
/// pressing something that gives.
class PressScale extends StatefulWidget {
  const PressScale({required this.child, this.pressed = 0.95, super.key});

  final Widget child;

  /// The scale while held.
  final double pressed;

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale>
    with SingleTickerProviderStateMixin {
  late final AnimationController _press = AnimationController(
    vsync: this,
    duration: AppMotion.quick,
    reverseDuration: const Duration(milliseconds: 260),
  );

  late final CurvedAnimation _curve = CurvedAnimation(
    parent: _press,
    curve: Curves.easeOut,
    reverseCurve: AppMotion.land,
  );

  late final Animation<double> _scale = Tween<double>(
    begin: 1,
    end: widget.pressed,
  ).animate(_curve);

  @override
  void dispose() {
    _curve.dispose();
    _press.dispose();
    super.dispose();
  }

  Offset? _origin;

  void _down(PointerDownEvent event) {
    _origin = event.position;
    if (motionAllowed(context)) _press.forward();
  }

  /// A finger that has started to travel is scrolling, not pressing — the
  /// card should stop sinking under a thumb that is flicking past it.
  void _move(PointerMoveEvent event) {
    final origin = _origin;
    if (origin == null) return;
    if ((event.position - origin).distance > kTouchSlop) _up(event);
  }

  void _up(PointerEvent _) {
    _origin = null;
    if (_press.value > 0) _press.reverse();
  }

  @override
  Widget build(BuildContext context) => Listener(
    onPointerDown: _down,
    onPointerMove: _move,
    onPointerUp: _up,
    onPointerCancel: _up,
    child: ScaleTransition(scale: _scale, child: widget.child),
  );
}
