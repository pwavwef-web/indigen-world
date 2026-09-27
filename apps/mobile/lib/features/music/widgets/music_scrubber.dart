import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// The seek bar: a thick, rounded line that swells under a finger and shows
/// the time it will land on in a bubble above the thumb.
///
/// ── Why the drag is local state ────────────────────────────────────────────
/// The position stream ticks five times a second. Feeding it straight into the
/// bar while a finger is dragging means the stream keeps yanking the thumb back
/// to where playback actually is, and the two fight each other all the way
/// across. So a touch takes the bar over entirely, and only letting go tells
/// the player where to go.
///
/// ── Why it is a leaf ──────────────────────────────────────────────────────
/// It is one of the three places the position stream may reach, and like the
/// other two it subscribes through its own `StreamBuilder` inside a
/// `RepaintBoundary` — see `musicPositionProvider`.
class MusicScrubber extends ConsumerStatefulWidget {
  const MusicScrubber({
    required this.duration,
    this.color = Colors.white,
    super.key,
  });

  final Duration? duration;
  final Color color;

  @override
  ConsumerState<MusicScrubber> createState() => _MusicScrubberState();
}

class _MusicScrubberState extends ConsumerState<MusicScrubber> {
  /// Where the finger has the playhead, in milliseconds, or null.
  double? _dragging;

  static const _height = 40.0;

  double _at(double dx, double width, double total) =>
      (dx / width).clamp(0.0, 1.0) * total;

  void _commit() {
    final target = _dragging;
    if (target != null) {
      ref
          .read(musicControllerProvider.notifier)
          .seek(Duration(milliseconds: target.round()));
    }
    setState(() => _dragging = null);
  }

  void _nudge(Duration elapsed, Duration total, Duration by) {
    final next = elapsed + by;
    ref
        .read(musicControllerProvider.notifier)
        .seek(
          next < Duration.zero
              ? Duration.zero
              : next > total
              ? total
              : next,
        );
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.duration;
    final color = widget.color;
    if (total == null || total <= Duration.zero) {
      // A duration arrives a moment after the header parses. Until then there
      // is nothing to scrub along, and a bar from zero to zero is a control
      // that lies about what it can do.
      return const SizedBox(height: _height + 22);
    }
    final handler = ref.watch(musicAudioHandlerProvider);
    final maximum = total.inMilliseconds.toDouble();

    return RepaintBoundary(
      child: StreamBuilder<Duration>(
        stream: handler == null ? const Stream.empty() : AudioService.position,
        initialData: Duration.zero,
        builder: (context, snapshot) {
          final playhead = (snapshot.data ?? Duration.zero).inMilliseconds
              .toDouble()
              .clamp(0.0, maximum);
          final value = _dragging ?? playhead;
          final fraction = maximum == 0 ? 0.0 : value / maximum;
          final elapsed = Duration(milliseconds: value.round());
          final touched = _dragging != null;

          return Semantics(
            slider: true,
            label: 'Seek',
            value: '${_clock(elapsed)} of ${_clock(total)}',
            increasedValue: _clock(elapsed + const Duration(seconds: 10)),
            decreasedValue: _clock(elapsed - const Duration(seconds: 10)),
            onIncrease: () =>
                _nudge(elapsed, total, const Duration(seconds: 10)),
            onDecrease: () =>
                _nudge(elapsed, total, const Duration(seconds: -10)),
            child: Column(
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final width = constraints.maxWidth;
                    return GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onHorizontalDragStart: (details) => setState(
                        () => _dragging = _at(
                          details.localPosition.dx,
                          width,
                          maximum,
                        ),
                      ),
                      onHorizontalDragUpdate: (details) => setState(
                        () => _dragging = _at(
                          details.localPosition.dx,
                          width,
                          maximum,
                        ),
                      ),
                      onHorizontalDragEnd: (_) => _commit(),
                      onHorizontalDragCancel: () =>
                          setState(() => _dragging = null),
                      onTapDown: (details) => setState(
                        () => _dragging = _at(
                          details.localPosition.dx,
                          width,
                          maximum,
                        ),
                      ),
                      onTapUp: (_) => _commit(),
                      onTapCancel: () => setState(() => _dragging = null),
                      child: SizedBox(
                        height: _height,
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Positioned.fill(
                              child: TweenAnimationBuilder<double>(
                                tween: Tween(end: touched ? 10 : 5),
                                duration: motionOr(context, AppMotion.quick),
                                curve: Curves.easeOut,
                                builder: (context, thickness, _) => CustomPaint(
                                  painter: _TrackPainter(
                                    fraction: fraction,
                                    thickness: thickness,
                                    color: color,
                                    thumb: touched,
                                  ),
                                ),
                              ),
                            ),
                            if (touched)
                              Positioned(
                                left: (fraction * width - 30).clamp(
                                  0.0,
                                  (width - 60).clamp(0.0, double.infinity),
                                ),
                                top: -30,
                                width: 60,
                                child: _TimeBubble(
                                  text: _clock(elapsed),
                                  color: color,
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _clock(elapsed),
                        style: TextStyle(
                          color: color.withValues(alpha: 0.75),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      Text(
                        '-${_clock(total - elapsed)}',
                        style: TextStyle(
                          color: color.withValues(alpha: 0.75),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TimeBubble extends StatelessWidget {
  const _TimeBubble({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(10),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.3),
          blurRadius: 10,
          offset: const Offset(0, 4),
        ),
      ],
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: Colors.black87,
          fontSize: 12.5,
          fontWeight: FontWeight.w800,
          fontFeatures: [FontFeature.tabularFigures()],
        ),
      ),
    ),
  );
}

class _TrackPainter extends CustomPainter {
  _TrackPainter({
    required this.fraction,
    required this.thickness,
    required this.color,
    required this.thumb,
  });

  final double fraction;
  final double thickness;
  final Color color;
  final bool thumb;

  @override
  void paint(Canvas canvas, Size size) {
    final middle = size.height / 2;
    final radius = Radius.circular(thickness / 2);
    final track = RRect.fromLTRBR(
      0,
      middle - thickness / 2,
      size.width,
      middle + thickness / 2,
      radius,
    );
    canvas.drawRRect(track, Paint()..color = color.withValues(alpha: 0.24));
    final end = size.width * fraction;
    if (end > 0) {
      canvas.drawRRect(
        RRect.fromLTRBR(
          0,
          middle - thickness / 2,
          end.clamp(thickness, size.width),
          middle + thickness / 2,
          radius,
        ),
        Paint()..color = color,
      );
    }
    if (thumb) {
      canvas.drawCircle(
        Offset(end, middle),
        thickness * 0.95,
        Paint()..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_TrackPainter old) =>
      old.fraction != fraction ||
      old.thickness != thickness ||
      old.color != color ||
      old.thumb != thumb;
}

String _clock(Duration duration) {
  final safe = duration.isNegative ? Duration.zero : duration;
  final minutes = safe.inMinutes;
  final seconds = safe.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}
