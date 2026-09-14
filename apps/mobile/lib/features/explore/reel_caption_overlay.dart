import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:video_player/video_player.dart';

/// The caption for the moment [controller] is at, drawn over the video.
///
/// Rebuilds only when the cue on screen changes, not on every position tick,
/// so a playing reel costs one short text layout per line of speech.
///
/// Shows nothing for a track that may not be shown — a machine's captions
/// the creator never reviewed (see [CaptionTrack.isShowable]) — unless
/// [preview] is set, which the caption editor uses to let the creator see what
/// they are reviewing.
class ReelCaptionOverlay extends StatefulWidget {
  const ReelCaptionOverlay({
    required this.controller,
    required this.track,
    this.preview = false,
    this.bottomPadding = 24,
    this.fontSize = 15,
    super.key,
  });

  final VideoPlayerController controller;
  final CaptionTrack track;
  final bool preview;

  /// Space kept below the caption, so chrome drawn at the foot of a card does
  /// not sit on it.
  final double bottomPadding;
  final double fontSize;

  @override
  State<ReelCaptionOverlay> createState() => _ReelCaptionOverlayState();
}

class _ReelCaptionOverlayState extends State<ReelCaptionOverlay> {
  CaptionCue? _cue;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onTick);
    _cue = _current();
  }

  @override
  void didUpdateWidget(ReelCaptionOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.controller, widget.controller)) {
      oldWidget.controller.removeListener(_onTick);
      widget.controller.addListener(_onTick);
    }
    _cue = _current();
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTick);
    super.dispose();
  }

  CaptionCue? _current() {
    final value = widget.controller.value;
    if (!value.isInitialized) return null;
    if (!widget.preview && !widget.track.isShowable) return null;
    return widget.track.cueAt(value.position);
  }

  void _onTick() {
    final cue = _current();
    if (cue != _cue && mounted) setState(() => _cue = cue);
  }

  @override
  Widget build(BuildContext context) {
    final cue = _cue;
    if (cue == null) return const SizedBox.shrink();
    return IgnorePointer(
      child: Align(
        alignment: Alignment.bottomCenter,
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, widget.bottomPadding),
          child: Semantics(
            liveRegion: true,
            label: 'Caption: ${cue.text}',
            excludeSemantics: true,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.68),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                child: Text(
                  cue.text,
                  textAlign: TextAlign.center,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: widget.fontSize,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
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
