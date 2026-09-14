import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:video_player/video_player.dart';

/// The trim strip: frames from across the whole file, a selection with a grip
/// at each end, and a playhead that follows the preview.
///
/// ── One gesture detector, not one per handle ─────────────────────────────
/// A handle at the very start of a clip sits against the strip's edge, where
/// a hit box centred on it would be half outside the widget and so half
/// untappable. Instead the whole strip takes the drag and decides at its
/// start which handle is nearest, which gives each grip a generous target
/// wherever it is — including when the two are nearly touching. A drag that
/// starts away from both scrubs the preview instead.
///
/// ── What it enforces ─────────────────────────────────────────────────────
/// Only that the handles cannot cross: the end stays at least
/// [ReelLimits.minDuration] after the start. Going past the longest allowed
/// selection is shown, not blocked, so a creator can move the start first and
/// the end second without the strip fighting them on the way.
class ReelTrimTimeline extends StatefulWidget {
  const ReelTrimTimeline({required this.controller, super.key});

  final ReelEditorController controller;

  /// Keys on the two handles' accessibility nodes, for tests and tooling.
  static const startHandleKey = ValueKey('reel-trim-start-handle');
  static const endHandleKey = ValueKey('reel-trim-end-handle');

  /// How far one accessibility increment moves a handle.
  static const accessibilityStep = Duration(milliseconds: 500);

  @override
  State<ReelTrimTimeline> createState() => _ReelTrimTimelineState();
}

enum _DragTarget { start, end, scrub }

class _ReelTrimTimelineState extends State<ReelTrimTimeline> {
  static const _stripHeight = 56.0;

  /// Room above and below the strip, so the drag area is taller than the
  /// frames and the playhead can overhang them.
  static const _verticalPad = 8.0;

  /// The visible grips sit just outside the selection, each this wide. The
  /// strip is inset by the same amount so a grip at either end stays inside
  /// the widget.
  static const _gripWidth = 16.0;

  /// How close to a grip's centre a drag has to start to take that grip.
  /// Even against the strip's edge this leaves a target at least 48 wide.
  static const _grabRadius = 40.0;

  _DragTarget? _drag;
  double _grabOffset = 0;

  Duration? _pendingSeek;
  var _seeking = false;

  ReelEditorController get _controller => widget.controller;

  /// Seeks as fast as the player answers and no faster: a drag reports far
  /// more positions than a decoder can show, and queueing every one of them
  /// makes the frame under the handle trail behind the finger.
  void _seek(Duration to) {
    _pendingSeek = to;
    if (_seeking) return;
    unawaited(_drainSeeks());
  }

  Future<void> _drainSeeks() async {
    _seeking = true;
    try {
      while (_pendingSeek != null) {
        final target = _pendingSeek!;
        _pendingSeek = null;
        await _controller.seekTo(target);
      }
    } on Object {
      // The preview closed mid-drag; there is nothing left to show a frame in.
    } finally {
      _seeking = false;
    }
  }

  bool get _playerPaused {
    final player = _controller.player;
    return player != null && !player.value.isPlaying;
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: _controller,
    builder: (context, _) {
      final video = _controller.draft.video;
      if (video == null || video.durationMs <= 0) {
        return const SizedBox(height: _stripHeight + 2 * _verticalPad);
      }
      return LayoutBuilder(
        builder: (context, constraints) =>
            _buildStrip(context, constraints.maxWidth, video),
      );
    },
  );

  Widget _buildStrip(BuildContext context, double width, ReelVideo video) {
    final brand = context.brand;
    final draft = _controller.draft;
    final limits = _controller.limits;
    final locked = _controller.locked;
    final geometry = _StripGeometry(
      width: width,
      gripWidth: _gripWidth,
      durationMs: video.durationMs,
    );
    final start = draft.trimStart;
    final end = draft.selectionEnd;
    final startX = geometry.xFor(start);
    final endX = geometry.xFor(end);
    final tooLong = draft.selectedDuration > limits.maxDuration;
    final frameColour = tooLong ? brand.danger : brand.gold;
    final player = _controller.player;

    return SizedBox(
      height: _stripHeight + 2 * _verticalPad,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Frames.
          Positioned(
            left: _gripWidth,
            width: geometry.track,
            top: _verticalPad,
            height: _stripHeight,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: _Frames(frames: _controller.timeline),
            ),
          ),
          // Everything outside the selection is dimmed.
          Positioned(
            left: _gripWidth,
            width: math.max(0, startX - _gripWidth),
            top: _verticalPad,
            height: _stripHeight,
            child: const _Dim(),
          ),
          Positioned(
            left: endX,
            width: math.max(0, width - _gripWidth - endX),
            top: _verticalPad,
            height: _stripHeight,
            child: const _Dim(),
          ),
          // The selection's frame.
          Positioned(
            left: startX,
            width: math.max(0, endX - startX),
            top: _verticalPad,
            height: _stripHeight,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.symmetric(
                    horizontal: BorderSide(color: frameColour, width: 3),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            left: startX - _gripWidth,
            width: _gripWidth,
            top: _verticalPad,
            height: _stripHeight,
            child: _Grip(colour: frameColour, leading: true, dimmed: locked),
          ),
          Positioned(
            left: endX,
            width: _gripWidth,
            top: _verticalPad,
            height: _stripHeight,
            child: _Grip(colour: frameColour, leading: false, dimmed: locked),
          ),
          if (player != null)
            Positioned.fill(
              child: IgnorePointer(
                child: _Playhead(player: player, geometry: geometry),
              ),
            ),
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              excludeFromSemantics: true,
              onTapUp: (details) => _onTap(details.localPosition.dx, geometry),
              onHorizontalDragStart: (details) =>
                  _onDragStart(details.localPosition.dx, geometry),
              onHorizontalDragUpdate: (details) =>
                  _onDragUpdate(details.localPosition.dx, geometry),
              onHorizontalDragEnd: (_) => _drag = null,
              onHorizontalDragCancel: () => _drag = null,
            ),
          ),
          _handleSemantics(
            key: ReelTrimTimeline.startHandleKey,
            geometry: geometry,
            centre: startX - _gripWidth / 2,
            isStart: true,
          ),
          _handleSemantics(
            key: ReelTrimTimeline.endHandleKey,
            geometry: geometry,
            centre: endX + _gripWidth / 2,
            isStart: false,
          ),
        ],
      ),
    );
  }

  /// A slider node over each grip, so a screen reader can move the handles in
  /// half-second steps. It draws nothing and takes no pointer events — the
  /// strip's detector underneath does the dragging.
  Widget _handleSemantics({
    required Key key,
    required _StripGeometry geometry,
    required double centre,
    required bool isStart,
  }) {
    final draft = _controller.draft;
    final locked = _controller.locked;
    final current = isStart ? draft.trimStart : draft.selectionEnd;
    final up = _stepped(isStart: isStart, forward: true);
    final down = _stepped(isStart: isStart, forward: false);
    const box = 48.0;
    final left = (centre - box / 2)
        .clamp(0.0, math.max(0.0, geometry.width - box))
        .toDouble();
    return Positioned(
      key: key,
      left: left,
      width: box,
      top: 0,
      bottom: 0,
      child: Semantics(
        container: true,
        slider: true,
        enabled: !locked,
        label: isStart ? 'Trim start' : 'Trim end',
        value: formatReelPrecise(current),
        increasedValue: formatReelPrecise(up),
        decreasedValue: formatReelPrecise(down),
        onIncrease: locked || up == current
            ? null
            : () => _applyHandle(isStart: isStart, to: up, showFrame: true),
        onDecrease: locked || down == current
            ? null
            : () => _applyHandle(isStart: isStart, to: down, showFrame: true),
        child: const SizedBox.expand(),
      ),
    );
  }

  /// Where one accessibility step would put a handle, within its limits.
  Duration _stepped({required bool isStart, required bool forward}) {
    final draft = _controller.draft;
    final step = forward
        ? ReelTrimTimeline.accessibilityStep
        : -ReelTrimTimeline.accessibilityStep;
    final current = isStart ? draft.trimStart : draft.selectionEnd;
    return _bounded(isStart: isStart, to: current + step);
  }

  /// [to], kept inside the file and on its own side of the other handle.
  Duration _bounded({required bool isStart, required Duration to}) {
    final draft = _controller.draft;
    final length = draft.video?.duration ?? Duration.zero;
    final gap = _controller.limits.minDuration;
    Duration clamp(Duration value, Duration low, Duration high) {
      if (high < low) return low;
      if (value < low) return low;
      if (value > high) return high;
      return value;
    }

    if (isStart) {
      final latest = draft.selectionEnd - gap;
      return clamp(
        to,
        Duration.zero,
        latest < Duration.zero ? Duration.zero : latest,
      );
    }
    final earliest = draft.trimStart + gap;
    return clamp(to, earliest > length ? length : earliest, length);
  }

  void _applyHandle({
    required bool isStart,
    required Duration to,
    required bool showFrame,
  }) {
    if (_controller.locked) return;
    final draft = _controller.draft;
    final bounded = _bounded(isStart: isStart, to: to);
    if (isStart) {
      if (bounded == draft.trimStart) return;
      _controller.setTrim(start: bounded, end: draft.selectionEnd);
    } else {
      if (bounded == draft.selectionEnd) return;
      _controller.setTrim(start: draft.trimStart, end: bounded);
    }
    // Only a paused preview is moved: a playing one is already showing the
    // selection, and yanking it to the handle would restart it every frame.
    if (showFrame && _playerPaused) _seek(bounded);
  }

  _DragTarget? _handleNear(double x, _StripGeometry geometry) {
    final draft = _controller.draft;
    final startX = geometry.xFor(draft.trimStart);
    final endX = geometry.xFor(draft.selectionEnd);
    final toStart = (x - (startX - _gripWidth / 2)).abs();
    final toEnd = (x - (endX + _gripWidth / 2)).abs();
    final nearStart = toStart <= _grabRadius;
    final nearEnd = toEnd <= _grabRadius;
    if (nearStart && nearEnd) {
      // Handles this close overlap their targets; the side of the selection's
      // middle the finger lands on says which one was meant.
      return x < (startX + endX) / 2 ? _DragTarget.start : _DragTarget.end;
    }
    if (nearStart) return _DragTarget.start;
    if (nearEnd) return _DragTarget.end;
    return null;
  }

  void _onTap(double x, _StripGeometry geometry) {
    final draft = _controller.draft;
    final near = _handleNear(x, geometry);
    final target = switch (near) {
      _DragTarget.start => draft.trimStart,
      _DragTarget.end => draft.selectionEnd,
      _ => geometry.timeFor(x),
    };
    _seek(target);
  }

  void _onDragStart(double x, _StripGeometry geometry) {
    final draft = _controller.draft;
    final near = _handleNear(x, geometry);
    if (near == null || _controller.locked) {
      _drag = _DragTarget.scrub;
      _grabOffset = 0;
      _seek(geometry.timeFor(x));
      return;
    }
    _drag = near;
    // Remember where on the grip the finger landed, so the handle moves with
    // it instead of jumping to sit under the fingertip.
    final handleX = near == _DragTarget.start
        ? geometry.xFor(draft.trimStart)
        : geometry.xFor(draft.selectionEnd);
    _grabOffset = handleX - x;
    unawaited(HapticFeedback.selectionClick());
  }

  void _onDragUpdate(double x, _StripGeometry geometry) {
    switch (_drag) {
      case null:
        return;
      case _DragTarget.scrub:
        _seek(geometry.timeFor(x));
      case _DragTarget.start:
        _applyHandle(
          isStart: true,
          to: geometry.timeFor(x + _grabOffset),
          showFrame: true,
        );
      case _DragTarget.end:
        _applyHandle(
          isStart: false,
          to: geometry.timeFor(x + _grabOffset),
          showFrame: true,
        );
    }
  }
}

/// Maps between time in the file and position along the strip.
@immutable
class _StripGeometry {
  const _StripGeometry({
    required this.width,
    required this.gripWidth,
    required this.durationMs,
  });

  final double width;
  final double gripWidth;
  final int durationMs;

  double get track => math.max(1, width - 2 * gripWidth);

  double xFor(Duration time) =>
      gripWidth +
      track * (time.inMilliseconds / math.max(1, durationMs)).clamp(0.0, 1.0);

  Duration timeFor(double x) => Duration(
    milliseconds: (((x - gripWidth) / track).clamp(0.0, 1.0) * durationMs)
        .round(),
  );
}

class _Frames extends StatelessWidget {
  const _Frames({required this.frames});

  final List<Uint8List?> frames;

  @override
  Widget build(BuildContext context) {
    final decodeHeight = (56 * MediaQuery.devicePixelRatioOf(context)).round();
    final count = frames.isEmpty
        ? ReelEditorController.timelineFrameCount
        : frames.length;
    return ColoredBox(
      color: Colors.white.withValues(alpha: 0.06),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var index = 0; index < count; index++)
            Expanded(
              child: switch (index < frames.length ? frames[index] : null) {
                final bytes? => Image.memory(
                  bytes,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                  cacheHeight: decodeHeight,
                  excludeFromSemantics: true,
                  errorBuilder: (context, error, stackTrace) =>
                      const _FramePlaceholder(),
                ),
                null => const _FramePlaceholder(),
              },
            ),
        ],
      ),
    );
  }
}

class _FramePlaceholder extends StatelessWidget {
  const _FramePlaceholder();

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      border: Border(
        right: BorderSide(color: Colors.black.withValues(alpha: 0.35)),
      ),
    ),
    child: const SizedBox.expand(),
  );
}

class _Dim extends StatelessWidget {
  const _Dim();

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: ColoredBox(color: Colors.black.withValues(alpha: 0.62)),
  );
}

class _Grip extends StatelessWidget {
  const _Grip({
    required this.colour,
    required this.leading,
    required this.dimmed,
  });

  final Color colour;
  final bool leading;
  final bool dimmed;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: DecoratedBox(
      decoration: BoxDecoration(
        color: dimmed ? Colors.white38 : colour,
        borderRadius: BorderRadius.horizontal(
          left: leading ? const Radius.circular(8) : Radius.zero,
          right: leading ? Radius.zero : const Radius.circular(8),
        ),
      ),
      child: Center(
        child: Container(
          width: 3,
          height: 20,
          decoration: BoxDecoration(
            color: BrandColors.nightInk.withValues(alpha: 0.8),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ),
    ),
  );
}

/// The preview's position on the strip. Listens to the player itself, so a
/// playing clip moves one thin line rather than rebuilding the strip.
class _Playhead extends StatelessWidget {
  const _Playhead({required this.player, required this.geometry});

  final VideoPlayerController player;
  final _StripGeometry geometry;

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: player,
        builder: (context, value, _) {
          if (!value.isInitialized) return const SizedBox.shrink();
          final x = geometry.xFor(value.position);
          return Stack(
            children: [
              Positioned(
                left: x - 1,
                width: 2,
                top: 2,
                bottom: 2,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(1),
                    boxShadow: const [
                      BoxShadow(color: Colors.black54, blurRadius: 3),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      );
}
