import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// Shared emphasis for Explore's header, topic row, action rail and captions.
/// All controls stay visible and tappable. The flag selects full or subdued
/// opacity; it never means that the controls are removed.
///
/// Full emphasis returns on the first touch, while paused, when a new reel
/// settles and while a menu or sheet holds the controls. After idle playback,
/// or during a swipe, controls become subdued without changing their layout.
///
/// ── No flicker ──────────────────────────────────────────────────────────────
/// A hide asked for within [settleGap] of a show is deferred rather than
/// dropped or obeyed, and the show that follows a swipe waits for the swipe to
/// settle. Rapid swiping therefore keeps the chrome away instead of blinking
/// it on and off between every reel.
///
/// A plain [ChangeNotifier] rather than a provider, so a change repaints the
/// handful of widgets listening to it and nothing else in the feed.
class ExploreChromeController extends ChangeNotifier
    implements ValueListenable<bool> {
  ExploreChromeController({
    this.idleDelay = const Duration(milliseconds: 3200),
    this.settleGap = const Duration(milliseconds: 450),
    this.revealAfterSwipe = const Duration(milliseconds: 320),
  });

  final Duration idleDelay;
  final Duration settleGap;
  final Duration revealAfterSwipe;

  var _visible = true;
  var _playing = false;
  var _dragging = false;
  var _alwaysVisible = false;
  final _holds = <Object>{};
  Timer? _idle;
  Timer? _deferred;

  /// Set for [settleGap] after every show. A hide asked for inside that window
  /// is remembered in [_pendingHide] and carried out when the window closes.
  /// Timers rather than timestamps, so the rule runs the same under a test's
  /// fake clock as on a phone.
  var _justShown = false;
  var _pendingHide = false;
  Timer? _shownWindow;

  @override
  bool get value => _visible;

  bool get isHeld => _holds.isNotEmpty;

  /// Pins everything on screen — for a screen reader, which cannot tap an empty
  /// frame to bring back controls it has no way of knowing are hidden.
  set alwaysVisible(bool value) {
    if (_alwaysVisible == value) return;
    _alwaysVisible = value;
    if (value) _show();
  }

  /// Something needs the chrome for as long as it is open.
  void hold(Object reason) {
    _holds.add(reason);
    _cancelTimers();
    _show();
  }

  void release(Object reason) {
    if (!_holds.remove(reason)) return;
    if (_holds.isEmpty) _scheduleIdle();
  }

  /// The active reel started or stopped. Pictures count as playing: looking
  /// at one uninterrupted is the same as watching.
  void setPlaying(bool playing) {
    if (_playing == playing) return;
    _playing = playing;
    if (!playing) {
      _cancelTimers();
      _show();
    } else {
      _scheduleIdle();
    }
  }

  /// A tap on the frame, or any other touch that should bring things back.
  void interacted() {
    _cancelTimers();
    _show();
    _scheduleIdle();
  }

  /// A tap on a picture, where there is no playback to toggle: brings the
  /// chrome back when it is gone and puts it away when it is not.
  void toggle() {
    if (_visible) {
      _cancelTimers();
      _hide(force: true);
    } else {
      interacted();
    }
  }

  /// The member is dragging the feed. [towardsPrevious] is a drag back up the
  /// feed, which brings the chrome back; a drag onwards puts it away.
  void dragged({required bool towardsPrevious}) {
    _dragging = true;
    _deferred?.cancel();
    _idle?.cancel();
    if (towardsPrevious) {
      _show();
    } else {
      _hide();
    }
  }

  /// A drag or fling has come to rest. [changedReel] is whether it landed on a
  /// different reel from the one it started on.
  void settled({required bool changedReel}) {
    if (!_dragging) return;
    _dragging = false;
    _deferred?.cancel();
    if (changedReel || !_playing) {
      _deferred = Timer(revealAfterSwipe, () {
        _show();
        _scheduleIdle();
      });
    } else {
      _scheduleIdle();
    }
  }

  void _scheduleIdle() {
    _idle?.cancel();
    if (!_playing || _holds.isNotEmpty || _alwaysVisible || _dragging) return;
    _idle = Timer(idleDelay, _hide);
  }

  void _show() {
    _pendingHide = false;
    if (!_visible) {
      _justShown = true;
      _shownWindow?.cancel();
      _shownWindow = Timer(settleGap, () {
        _justShown = false;
        if (_pendingHide) {
          _pendingHide = false;
          _hide();
        }
      });
    }
    _set(true);
  }

  void _hide({bool force = false}) {
    if (_holds.isNotEmpty || _alwaysVisible) return;
    if (!force && _visible && _justShown) {
      _pendingHide = true;
      return;
    }
    _pendingHide = false;
    _set(false);
  }

  void _set(bool visible) {
    if (_visible == visible) return;
    _visible = visible;
    notifyListeners();
  }

  void _cancelTimers() {
    _idle?.cancel();
    _deferred?.cancel();
    _pendingHide = false;
  }

  @override
  void dispose() {
    _cancelTimers();
    _shownWindow?.cancel();
    super.dispose();
  }
}

/// Fades and nudges [child] with the chrome, and stops it taking touches while
/// it is away.
///
/// Controls remain visible and tappable while subdued. The first touch restores
/// full emphasis and reaches the original action without pausing the video.
/// Opacity changes never move the reel or its touch targets.
class ExploreChromeFade extends StatelessWidget {
  const ExploreChromeFade({
    required this.controller,
    required this.child,
    this.slide = Offset.zero,
    super.key,
  });

  final ValueListenable<bool>? controller;
  final Widget child;

  /// Retained for existing callers; subdued controls keep their position.
  final Offset slide;

  @override
  Widget build(BuildContext context) {
    final controller = this.controller;
    if (controller == null) return child;
    return ValueListenableBuilder<bool>(
      valueListenable: controller,
      child: child,
      builder: (context, visible, child) => Listener(
        onPointerDown: (_) {
          if (controller is ExploreChromeController) controller.interacted();
        },
        child: AnimatedOpacity(
          opacity: visible ? 1 : 0.72,
          duration: motionOr(context, AppMotion.standard),
          curve: AppMotion.arrive,
          child: child,
        ),
      ),
    );
  }
}
