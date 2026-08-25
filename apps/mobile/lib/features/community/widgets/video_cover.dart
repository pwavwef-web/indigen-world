import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:video_player/video_player.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// The still frame shown for a video before anybody opens it.
///
/// A community video only carries a `thumbnailUrl` when something server-side
/// made one, and nothing does yet — so every reel in the feed used to render as
/// a flat green rectangle, which reads as a broken card rather than as a video.
///
/// This decodes the clip's own opening frame instead. The player is opened
/// muted, seeked a fraction of a second in (frame zero is often black on
/// phone-recorded MP4s), never played, and torn down the moment the tile
/// scrolls away — so a feed of videos costs one short-lived decoder per tile
/// that is actually on screen, and none for the ones that are not.
///
/// Order of preference: a real thumbnail, then the clip's first frame, then a
/// branded placeholder. It never shows a bare colour.
class VideoCover extends StatefulWidget {
  const VideoCover({
    required this.videoUrl,
    this.thumbnailUrl,
    this.fit = BoxFit.cover,
    super.key,
  });

  final String videoUrl;

  /// A server-made poster, when one exists. Always preferred: it costs one
  /// image request instead of opening the video.
  final String? thumbnailUrl;

  final BoxFit fit;

  @override
  State<VideoCover> createState() => _VideoCoverState();
}

class _VideoCoverState extends State<VideoCover> {
  /// How many covers may hold a decoder at once, across the whole app.
  ///
  /// One visible video tile is cheap. A three-column grid of a creator's work
  /// is nine, and a mid-range Android device does not have nine hardware
  /// decoders to give out — past its limit the platform starts refusing them,
  /// and the refusals land on whichever player asked last, including the reel
  /// the member is actually watching. Covers over the cap keep the placeholder,
  /// which is what they were showing anyway a moment earlier.
  static const _maxOpenCovers = 4;
  static var _openCovers = 0;

  /// Covers that wanted a decoder while all [_maxOpenCovers] were taken.
  ///
  /// Without this a tile that arrived on a full screen kept its placeholder for
  /// good: `onVisibilityChanged` had already fired, so nothing was ever going
  /// to ask again, and the member was left looking at a green rectangle with
  /// free decoders sitting behind it. A released slot now wakes the next one
  /// still on screen.
  static final _waitingForSlot = <_VideoCoverState>{};

  VideoPlayerController? _controller;
  var _ready = false;
  var _failed = false;

  /// Whether this cover currently holds one of the [_maxOpenCovers] slots.
  var _holdsSlot = false;

  /// Bumped whenever a controller is released, so a late `initialize()` can
  /// tell that the tile it was opened for is gone.
  var _generation = 0;

  bool get _needsFrame =>
      widget.thumbnailUrl == null || widget.thumbnailUrl!.isEmpty;

  @override
  void didUpdateWidget(VideoCover oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.videoUrl != widget.videoUrl) {
      _release();
      _failed = false;
    }
  }

  @override
  void dispose() {
    _waitingForSlot.remove(this);
    _release();
    super.dispose();
  }

  Future<void> _open() async {
    if (!mounted || _controller != null || _failed || !_needsFrame) return;
    if (_openCovers >= _maxOpenCovers) {
      _waitingForSlot.add(this);
      return;
    }
    _waitingForSlot.remove(this);
    _openCovers++;
    _holdsSlot = true;
    final generation = _generation;
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(widget.videoUrl),
    );
    _controller = controller;
    try {
      await controller.initialize();
      // A poster is a picture, not a performance: nothing here ever plays, so
      // nothing here is ever allowed to make a sound.
      await controller.setVolume(0);
      // Many phone recordings open on a black or half-exposed frame. A fifth
      // of a second in is past that and still unmistakably the same shot.
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
  }

  bool _isStale(int generation) => !mounted || generation != _generation;

  void _discard(VideoPlayerController controller) {
    if (!identical(_controller, controller)) return;
    _controller = null;
    _ready = false;
    _releaseSlot();
    controller.dispose();
  }

  void _release() {
    _generation++;
    final controller = _controller;
    if (controller != null) {
      _discard(controller);
    } else {
      // An open that failed before it ever held a controller still took a slot.
      _releaseSlot();
    }
  }

  void _releaseSlot() {
    if (!_holdsSlot) return;
    _holdsSlot = false;
    _openCovers--;
    _wakeNextWaiter();
  }

  /// Hands the freed slot to one cover that is still on screen waiting for it.
  static void _wakeNextWaiter() {
    while (_waitingForSlot.isNotEmpty && _openCovers < _maxOpenCovers) {
      final next = _waitingForSlot.first;
      _waitingForSlot.remove(next);
      if (!next.mounted) continue;
      // One wake per released slot: `_open` either takes it or puts the cover
      // back in the queue, and either way the next release wakes the next one.
      unawaited(next._open());
      return;
    }
  }

  /// Off screen the decoder goes away and the placeholder takes over. Holding
  /// one open for every video the member has already scrolled past is how a
  /// feed runs a phone out of decoders.
  void _onVisibilityChanged(VisibilityInfo info) {
    if (!mounted) return;
    if (info.visibleFraction > 0.05) {
      unawaited(_open());
    } else if (_controller != null) {
      setState(_release);
    } else {
      // Scrolled away before a slot ever came free: stop asking for one, so the
      // queue only ever holds covers a member can actually see.
      _waitingForSlot.remove(this);
    }
  }

  @override
  Widget build(BuildContext context) {
    final thumbnail = widget.thumbnailUrl;
    if (thumbnail != null && thumbnail.isNotEmpty) {
      return CachedNetworkImage(
        imageUrl: thumbnail,
        fit: widget.fit,
        placeholder: (context, url) => const VideoCoverPlaceholder(),
        errorWidget: (context, url, error) => const VideoCoverPlaceholder(),
      );
    }

    final controller = _controller;
    return VisibilityDetector(
      key: ValueKey('video-cover-${widget.videoUrl}'),
      onVisibilityChanged: _onVisibilityChanged,
      child: _ready && controller != null
          ? FittedBox(
              fit: widget.fit,
              clipBehavior: Clip.hardEdge,
              child: SizedBox(
                width: controller.value.size.width,
                height: controller.value.size.height,
                child: VideoPlayer(controller),
              ),
            )
          : const VideoCoverPlaceholder(),
    );
  }
}

/// What a video tile shows while its frame is still arriving, and instead of
/// one that never does. Deliberately the brand's night gradient rather than a
/// flat fill, so a card that is loading still looks like part of the app.
class VideoCoverPlaceholder extends StatelessWidget {
  const VideoCoverPlaceholder({super.key});

  @override
  Widget build(BuildContext context) => const DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [BrandColors.heritageGreen, BrandColors.nightGreen],
      ),
    ),
    child: Center(
      child: Icon(
        Icons.movie_creation_outlined,
        color: Colors.white24,
        size: 34,
      ),
    ),
  );
}
