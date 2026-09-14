import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:video_player/video_player.dart';

/// The part of an uploaded clip its creator chose to show.
///
/// ── Why trims are played rather than cut ────────────────────────────────────
/// The app's media stack (`image_picker`, `video_player`, `video_thumbnail`)
/// has no transcoder, so a phone cannot cut a file. The whole recording is
/// uploaded and the chosen start and end travel with it as data; every player
/// that honours them shows only the selection. Physically cutting the file —
/// and compressing it, and removing muted sound — is server work that does not
/// exist yet: see `docs/product/reel-creation.md`. Until it does, an app
/// version older than this one plays the whole file.
@immutable
class ClipWindow {
  const ClipWindow({this.start = Duration.zero, this.end});

  final Duration start;

  /// Null plays to the end of the file.
  final Duration? end;

  /// A window from stored milliseconds, or null when there is nothing to
  /// honour — no trim at all, or numbers that contradict each other.
  static ClipWindow? fromMillis(int? startMs, int? endMs) {
    final start = startMs == null || startMs < 0 ? 0 : startMs;
    if (endMs != null && endMs <= start) return null;
    if (start == 0 && endMs == null) return null;
    return ClipWindow(
      start: Duration(milliseconds: start),
      end: endMs == null ? null : Duration(milliseconds: endMs),
    );
  }

  bool get isTrimmed => start > Duration.zero || end != null;

  /// Where the window ends in a file of [length].
  Duration endWithin(Duration length) {
    final end = this.end;
    if (length <= Duration.zero) return end ?? Duration.zero;
    return end == null || end > length ? length : end;
  }

  /// How long the window lasts in a file of [length].
  Duration lengthWithin(Duration length) {
    final span = endWithin(length) - start;
    return span.isNegative ? Duration.zero : span;
  }

  /// Where playback at [position] should jump to, or null to leave it alone.
  ///
  /// A little slack before the start, because players report position in
  /// coarse steps and a seek lands near rather than on its target; none at the
  /// end, where overshooting shows footage the creator cut.
  Duration? correction(Duration position, Duration length) {
    if (position < start - _startSlack) return start;
    if (position >= endWithin(length) && length > Duration.zero) return start;
    return null;
  }

  static const _startSlack = Duration(milliseconds: 250);

  @override
  bool operator ==(Object other) =>
      other is ClipWindow && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);
}

/// Keeps a looping [VideoPlayerController] inside a [ClipWindow].
///
/// `video_player` reports position about twice a second, which would let a
/// clip run up to half a second past its end. So each report also arms a
/// timer for the moment the window closes, and the seek happens then.
///
/// Attach after `initialize()`; [detach] before disposing the controller.
class ClipWindowGuard {
  ClipWindowGuard(this.controller, ClipWindow window, {this.onLooped})
    : _window = window;

  final VideoPlayerController controller;

  /// Told each time the guard sends playback back to the start.
  final VoidCallback? onLooped;

  ClipWindow _window;
  Timer? _endTimer;
  var _attached = false;
  var _seeking = false;

  ClipWindow get window => _window;

  set window(ClipWindow value) {
    if (value == _window) return;
    _window = value;
    _check();
  }

  void attach() {
    if (_attached) return;
    _attached = true;
    controller.addListener(_check);
    _check();
  }

  void detach() {
    if (!_attached) return;
    _attached = false;
    _endTimer?.cancel();
    _endTimer = null;
    controller.removeListener(_check);
  }

  /// Only a playing clip is corrected. A paused one may sit anywhere — an
  /// editor scrubbing to show the frame under a trim handle has to be able to
  /// park the player outside the window — so whoever pauses a clip outside it
  /// is also responsible for seeking back in before playing (callers opening a
  /// clip seek to [ClipWindow.start] first).
  void _check() {
    if (!_attached || _seeking) return;
    final value = controller.value;
    if (!value.isInitialized) return;
    _endTimer?.cancel();
    _endTimer = null;
    if (!value.isPlaying) return;
    final target = _window.correction(value.position, value.duration);
    if (target != null) {
      unawaited(_jump(target, looped: value.position >= _window.start));
      return;
    }
    final remaining = _window.endWithin(value.duration) - value.position;
    if (remaining <= Duration.zero) return;
    final speed = value.playbackSpeed <= 0 ? 1.0 : value.playbackSpeed;
    _endTimer = Timer(
      Duration(microseconds: (remaining.inMicroseconds / speed).round()),
      () {
        if (!_attached) return;
        final now = controller.value;
        if (now.isInitialized && now.isPlaying) {
          unawaited(_jump(_window.start, looped: true));
        }
      },
    );
  }

  Future<void> _jump(Duration target, {required bool looped}) async {
    _seeking = true;
    _endTimer?.cancel();
    _endTimer = null;
    try {
      await controller.seekTo(target);
    } on Object {
      // A controller torn down mid-seek has nothing left to guard.
    } finally {
      _seeking = false;
    }
    if (looped && _attached) onLooped?.call();
  }
}
