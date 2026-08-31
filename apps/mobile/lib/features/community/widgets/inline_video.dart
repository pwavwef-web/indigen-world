import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:video_player/video_player.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// A clip that plays where it lies.
///
/// This is the behaviour every timeline that carries video has converged on: a
/// clip that is mostly on screen starts itself, silently and on a loop; the one
/// the reader has scrolled past stops and gives its decoder back; and a tap
/// opens the whole thing full screen.
///
/// ── Why only one plays ────────────────────────────────────────────────────
/// A tall phone can easily hold two clips at once, and two clips playing
/// together is noise even when both are muted — the eye has nowhere to settle.
/// The tile that is *most* on screen takes the floor and the other one pauses
/// on its own frame, so scrolling hands playback from one post to the next the
/// way a reader would expect.
///
/// ── Why the decoders are counted ──────────────────────────────────────────
/// A mid-range Android device has a handful of hardware video decoders, and the
/// platform starts refusing them past its limit — the refusal landing on
/// whichever player asked last, which is usually the one somebody is actually
/// watching. Two open at a time is enough for a feed (the one playing and the
/// one arriving) and leaves headroom for the rest of the screen.
class InlineVideoTile extends ConsumerStatefulWidget {
  const InlineVideoTile({
    required this.item,
    required this.onOpen,
    this.borderRadius = BorderRadius.zero,
    super.key,
  });

  final CommunityMedia item;

  /// Opens the immersive viewer. Both the surface and the play glyph use it.
  final VoidCallback onOpen;

  /// Rounding of the chrome drawn over the clip, so the progress line follows
  /// the corner it sits in rather than crossing it.
  final BorderRadius borderRadius;

  @override
  ConsumerState<InlineVideoTile> createState() => _InlineVideoTileState();
}

class _InlineVideoTileState extends ConsumerState<InlineVideoTile> {
  /// How many tiles may hold a decoder at once, across the whole app.
  static const _maxOpen = 2;

  /// How much of a tile has to be on screen before it takes the floor, and how
  /// little before it gives it up. The gap between the two is deliberate: one
  /// threshold would hand playback back and forth on a single slow scroll.
  static const _playThreshold = 0.62;
  static const _stopThreshold = 0.3;

  static var _openTiles = 0;
  static final _waitingForSlot = <_InlineVideoTileState>{};

  /// The tile currently allowed to play. Never more than one.
  static _InlineVideoTileState? _floor;

  VideoPlayerController? _controller;
  var _ready = false;
  var _failed = false;
  var _holdsSlot = false;
  var _generation = 0;
  var _fraction = 0.0;

  /// Whether this tile has the floor *and* is meant to be running. Kept apart
  /// from the controller's own flag so the overlay can settle before the
  /// platform has caught up.
  var _playing = false;

  @override
  void didUpdateWidget(InlineVideoTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.url != widget.item.url) {
      _release();
      _failed = false;
    }
  }

  @override
  void dispose() {
    _waitingForSlot.remove(this);
    if (identical(_floor, this)) _floor = null;
    _release();
    super.dispose();
  }

  // ── Decoder slots ─────────────────────────────────────────────────────────

  Future<void> _open() async {
    if (!mounted || _controller != null || _failed) return;
    if (_openTiles >= _maxOpen) {
      _waitingForSlot.add(this);
      return;
    }
    _waitingForSlot.remove(this);
    _openTiles++;
    _holdsSlot = true;
    final generation = _generation;
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(widget.item.url),
    );
    _controller = controller;
    try {
      await controller.initialize();
      await controller.setVolume(ref.read(videoMutedProvider) ? 0 : 1);
      await controller.setLooping(true);
      // Phone recordings often open on a black or half-exposed frame, so a clip
      // that has not started yet still shows the shot rather than a hole.
      await controller.seekTo(const Duration(milliseconds: 200));
    } on Object {
      _discard(controller);
      if (_isStale(generation)) return;
      setState(() => _failed = true);
      return;
    }
    if (_isStale(generation)) {
      _discard(controller);
      return;
    }
    setState(() => _ready = true);
    _syncPlayback();
  }

  bool _isStale(int generation) => !mounted || generation != _generation;

  void _discard(VideoPlayerController controller) {
    if (!identical(_controller, controller)) return;
    _controller = null;
    _ready = false;
    _playing = false;
    _releaseSlot();
    unawaited(controller.dispose());
  }

  void _release() {
    _generation++;
    final controller = _controller;
    if (controller != null) {
      _discard(controller);
    } else {
      _releaseSlot();
    }
  }

  void _releaseSlot() {
    if (!_holdsSlot) return;
    _holdsSlot = false;
    _openTiles--;
    _wakeNextWaiter();
  }

  static void _wakeNextWaiter() {
    while (_waitingForSlot.isNotEmpty && _openTiles < _maxOpen) {
      final next = _waitingForSlot.first;
      _waitingForSlot.remove(next);
      if (!next.mounted) continue;
      unawaited(next._open());
      return;
    }
  }

  // ── Who has the floor ─────────────────────────────────────────────────────

  void _onVisibilityChanged(VisibilityInfo info) {
    if (!mounted) return;
    _fraction = info.visibleFraction;

    if (_fraction <= 0.02) {
      // Well off screen: the decoder is worth more to a tile somebody can see.
      _waitingForSlot.remove(this);
      if (identical(_floor, this)) _floor = null;
      if (_controller != null) setState(_release);
      return;
    }

    if (_fraction >= _playThreshold) {
      _claimFloor();
    } else if (_fraction < _stopThreshold && identical(_floor, this)) {
      _floor = null;
    }
    unawaited(_open());
    _syncPlayback();
  }

  /// Takes the floor from a tile that is less on screen than this one.
  void _claimFloor() {
    final holder = _floor;
    if (identical(holder, this)) return;
    if (holder != null && holder.mounted && holder._fraction >= _fraction) {
      return;
    }
    _floor = this;
    if (holder != null && holder.mounted) holder._syncPlayback();
  }

  /// Brings the platform player in line with what this tile is meant to be
  /// doing right now.
  void _syncPlayback() {
    final controller = _controller;
    if (controller == null || !_ready) return;
    final shouldPlay =
        identical(_floor, this) &&
        _fraction >= _stopThreshold &&
        ref.read(videoAutoplayProvider) &&
        // Nothing in the feed plays under a full-screen viewer: the viewer is
        // showing the same clip, with the sound on.
        ref.read(fullScreenMediaProvider) == 0 &&
        // And nothing *starts itself* over a song somebody chose to play. A
        // tapped video still plays and takes the speakers properly, through
        // the claim above; this is only about autoplay, which nobody asked
        // for and which has no business interrupting the album.
        !ref.read(musicIsPlayingProvider);
    if (shouldPlay == _playing) return;
    _playing = shouldPlay;
    unawaited(shouldPlay ? controller.play() : controller.pause());
    if (mounted) setState(() {});
  }

  void _toggleMute() {
    HapticFeedback.selectionClick();
    unawaited(ref.read(videoMutedProvider.notifier).toggle());
  }

  @override
  Widget build(BuildContext context) {
    // Both switches steer a player that is already open, so a change has to
    // reach it without waiting for the next scroll.
    ref.listen<bool>(videoMutedProvider, (_, muted) {
      unawaited(_controller?.setVolume(muted ? 0 : 1));
    });
    ref.listen<bool>(videoAutoplayProvider, (_, _) => _syncPlayback());
    ref.listen<int>(fullScreenMediaProvider, (_, _) => _syncPlayback());
    ref.listen<bool>(musicIsPlayingProvider, (_, _) => _syncPlayback());
    final muted = ref.watch(videoMutedProvider);
    final controller = _controller;
    final showPlayer = _ready && controller != null;
    final poster = widget.item.thumbnailUrl ?? '';

    return VisibilityDetector(
      key: ValueKey('inline-video-${widget.item.url}'),
      onVisibilityChanged: _onVisibilityChanged,
      child: GestureDetector(
        // Opaque so the whole tile answers a tap, whatever the clip has managed
        // to paint yet — otherwise it falls through to the card underneath.
        behavior: HitTestBehavior.opaque,
        onTap: widget.onOpen,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (showPlayer)
              FittedBox(
                fit: BoxFit.cover,
                clipBehavior: Clip.hardEdge,
                child: SizedBox(
                  width: controller.value.size.width,
                  height: controller.value.size.height,
                  child: VideoPlayer(controller),
                ),
              )
            else if (poster.isNotEmpty)
              CachedNetworkImage(
                imageUrl: poster,
                fit: BoxFit.cover,
                placeholder: (context, url) => const VideoCoverPlaceholder(),
                errorWidget: (context, url, error) =>
                    const VideoCoverPlaceholder(),
              )
            else
              const VideoCoverPlaceholder(),

            // A clip that is not running says so with a glyph rather than with
            // nothing, so a still frame is never mistaken for a photograph.
            if (!_playing) const Center(child: PlayGlyph()),

            _VideoChrome(
              controller: showPlayer ? controller : null,
              fallbackSeconds: widget.item.durationSeconds,
              muted: muted,
              onToggleMute: _toggleMute,
              borderRadius: widget.borderRadius,
            ),
          ],
        ),
      ),
    );
  }
}

/// The soft-edged triangle drawn over a clip that is paused or still warming.
class PlayGlyph extends StatelessWidget {
  const PlayGlyph({this.size = 58, super.key});

  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: const BoxDecoration(
      color: Color(0x66000000),
      shape: BoxShape.circle,
    ),
    child: Icon(
      Icons.play_arrow_rounded,
      color: Colors.white,
      size: size * 0.62,
    ),
  );
}

/// Everything drawn *over* a clip: how much of it is left, whether it is making
/// a sound, and a hairline of progress along the bottom edge.
class _VideoChrome extends StatelessWidget {
  const _VideoChrome({
    required this.controller,
    required this.fallbackSeconds,
    required this.muted,
    required this.onToggleMute,
    required this.borderRadius,
  });

  final VideoPlayerController? controller;

  /// The length recorded when the clip was posted, shown until the player has
  /// opened and can say for itself.
  final int? fallbackSeconds;

  final bool muted;
  final VoidCallback onToggleMute;
  final BorderRadius borderRadius;

  @override
  Widget build(BuildContext context) {
    final player = controller;
    if (player == null) {
      return _layout(
        remaining: mediaClockLabel(Duration(seconds: fallbackSeconds ?? 0)),
        progress: 0,
      );
    }
    return ValueListenableBuilder<VideoPlayerValue>(
      valueListenable: player,
      builder: (context, value, _) {
        final total = value.duration;
        final left = total - value.position;
        final progress = total.inMilliseconds <= 0
            ? 0.0
            : (value.position.inMilliseconds / total.inMilliseconds).clamp(
                0.0,
                1.0,
              );
        return _layout(
          remaining: mediaClockLabel(left.isNegative ? Duration.zero : left),
          progress: progress,
        );
      },
    );
  }

  Widget _layout({required String remaining, required double progress}) =>
      Stack(
        fit: StackFit.expand,
        children: [
          // The gradient is what keeps white chrome legible over a pale frame
          // without laying a scrim across the whole picture.
          const IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.center,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0x73000000)],
                ),
              ),
            ),
          ),
          Positioned(
            left: 10,
            bottom: 10,
            child: IgnorePointer(child: MediaPill(label: remaining)),
          ),
          Positioned(
            right: 10,
            bottom: 10,
            child: _MuteButton(muted: muted, onTap: onToggleMute),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: IgnorePointer(
              child: ClipRRect(
                borderRadius: borderRadius,
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 3,
                  backgroundColor: Colors.white24,
                  valueColor: const AlwaysStoppedAnimation(
                    BrandColors.kenteGold,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
}

/// `m:ss`, the way every player writes a short clip.
String mediaClockLabel(Duration value) {
  final minutes = value.inMinutes;
  final seconds = (value.inSeconds % 60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}

/// The small dark capsule used for a clip's remaining time and for the badges
/// on a grid tile.
class MediaPill extends StatelessWidget {
  const MediaPill({required this.label, this.icon, super.key});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
    decoration: BoxDecoration(
      color: const Color(0x8C000000),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon case final icon?) ...[
          Icon(icon, size: 11, color: Colors.white),
          const SizedBox(width: 4),
        ],
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            height: 1.2,
          ),
        ),
      ],
    ),
  );
}

class _MuteButton extends StatelessWidget {
  const _MuteButton({required this.muted, required this.onTap});

  final bool muted;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: muted ? 'Unmute clip' : 'Mute clip',
    excludeSemantics: true,
    child: Tooltip(
      message: muted ? 'Sound off' : 'Sound on',
      child: GestureDetector(
        // The surface underneath opens the viewer, and a tap meant for the
        // speaker must never do that instead.
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          width: 32,
          height: 32,
          decoration: const BoxDecoration(
            color: Color(0x8C000000),
            shape: BoxShape.circle,
          ),
          child: Icon(
            muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
            color: Colors.white,
            size: 17,
          ),
        ),
      ),
    ),
  );
}
