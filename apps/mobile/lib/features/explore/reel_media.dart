import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/media_geometry.dart';
import 'package:video_player/video_player.dart';

/// The picture behind a reel: a still, a poster, or the playing clip, sized by
/// [reelMediaLayout] and never stretched.
///
/// ── Sizing ─────────────────────────────────────────────────────────────────
/// Portrait media fills the card, cropped towards its focal point. Landscape
/// and square media is enlarged towards a fill only as far as that is safe;
/// when it stops short, the bands either side get a restrained backdrop made
/// from the media itself — blurred hard and darkened — and the original sits
/// whole in the middle. The previous design always contained, which left a
/// 16:9 clip in a thin strip between two tall blurred slabs.
///
/// ── Why the aspect is asked for three ways ──────────────────────────────────
/// A decoded video knows its shape exactly. Before it decodes, the source
/// record may have stored one. A still has to be asked, and is asked with a
/// tiny decode — seventy-two pixels wide — which is also exactly what the
/// blurred backdrop needs, so working out the shape costs nothing extra.
class ReelMediaFrame extends StatefulWidget {
  const ReelMediaFrame({
    required this.imageUrl,
    required this.isActive,
    this.controller,
    this.aspectRatio,
    this.focalPoint,
    this.onStillFailed,
    super.key,
  });

  /// Told when the still cannot be loaded at all — for an image reel, the
  /// difference between "loading" and "unavailable".
  final VoidCallback? onStillFailed;

  /// A still to show: the picture itself for an image reel, the poster for a
  /// video. Empty when there is neither.
  final String imageUrl;

  /// Whether this is the reel in front of the member. Only the active still
  /// drifts, and only an active clip has its backdrop sampled live.
  final bool isActive;

  /// An initialised player, when this reel is a clip that has opened.
  final VideoPlayerController? controller;

  /// The shape the source recorded, if any.
  final double? aspectRatio;

  final FocalPoint? focalPoint;

  @override
  State<ReelMediaFrame> createState() => _ReelMediaFrameState();
}

class _ReelMediaFrameState extends State<ReelMediaFrame> {
  /// The still's own shape, once its small decode has answered.
  double? _stillAspect;
  ImageStream? _stream;
  ImageStreamListener? _listener;

  static const _thumbnailWidth = 72;

  @override
  void initState() {
    super.initState();
    _resolveStill();
  }

  @override
  void didUpdateWidget(ReelMediaFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.imageUrl != widget.imageUrl) {
      _stillAspect = null;
      _resolveStill();
    }
  }

  @override
  void dispose() {
    _stopListening();
    super.dispose();
  }

  ImageProvider<Object>? get _thumbnail => widget.imageUrl.isEmpty
      ? null
      : ResizeImage(
          CachedNetworkImageProvider(widget.imageUrl),
          width: _thumbnailWidth,
        );

  void _resolveStill() {
    _stopListening();
    final provider = _thumbnail;
    if (provider == null) return;
    final stream = provider.resolve(ImageConfiguration.empty);
    final listener = ImageStreamListener(
      (info, _) {
        final image = info.image;
        final aspect = image.height == 0 ? null : image.width / image.height;
        if (mounted && aspect != _stillAspect) {
          setState(() => _stillAspect = aspect);
        }
      },
      onError: (_, _) {
        // The still draws its own placeholder; the card decides whether that
        // is worth a word to the member.
        if (mounted) widget.onStillFailed?.call();
      },
    );
    stream.addListener(listener);
    _stream = stream;
    _listener = listener;
  }

  void _stopListening() {
    final listener = _listener;
    if (listener != null) _stream?.removeListener(listener);
    _stream = null;
    _listener = null;
  }

  double? get _videoAspect {
    final value = widget.controller?.value;
    if (value == null || !value.isInitialized) return null;
    final aspect = value.aspectRatio;
    return aspect > 0 && aspect.isFinite ? aspect : null;
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final videoAspect = _videoAspect;
    final playingVideo = controller != null && videoAspect != null;
    return ReelFramedMedia(
      aspectRatio: videoAspect ?? widget.aspectRatio ?? _stillAspect,
      focalPoint: widget.focalPoint,
      backdrop: playingVideo && widget.isActive
          ? _VideoBackdrop(controller: controller)
          : _StillBackdrop(thumbnail: _thumbnail),
      pictureBuilder: (context, layout) {
        final dpr = MediaQuery.devicePixelRatioOf(context);
        final still = _still(
          decodeWidth: math.min(2160, (layout.size.width * dpr).round()),
          // A still that fills the card may drift; a framed one may not,
          // because a drift would push its edges into the backdrop. A poster
          // under a clip never drifts: it is there to cover a blank frame.
          drift:
              widget.isActive &&
              layout.fillsViewport &&
              controller == null &&
              !MediaQuery.disableAnimationsOf(context),
          alignment: layout.alignment,
        );
        if (!playingVideo) return still;
        // The poster stays underneath: the texture is blank for the frame or
        // two between `initialize()` returning and the first decoded picture,
        // and a black flash there reads as a failure.
        return Stack(
          fit: StackFit.expand,
          children: [still, VideoPlayer(controller)],
        );
      },
    );
  }

  Widget _still({
    required int decodeWidth,
    required bool drift,
    required Alignment alignment,
  }) {
    if (widget.imageUrl.isEmpty) return const ReelMediaPlaceholder();
    final image = CachedNetworkImage(
      imageUrl: widget.imageUrl,
      fit: BoxFit.cover,
      alignment: alignment,
      memCacheWidth: decodeWidth > 0 ? decodeWidth : null,
      fadeInDuration: const Duration(milliseconds: 180),
      placeholder: (context, url) => const ReelMediaPlaceholder(),
      errorWidget: (context, url, error) => const ReelMediaPlaceholder(),
    );
    if (!drift) return image;
    return TweenAnimationBuilder<double>(
      key: ValueKey(widget.imageUrl),
      duration: const Duration(seconds: 14),
      tween: Tween(begin: 1, end: 1.06),
      builder: (context, scale, child) =>
          Transform.scale(scale: scale, child: child),
      child: image,
    );
  }
}

/// Places a picture in the space it is given by [reelMediaLayout]: cropped to
/// fill when that is safe, framed whole over [backdrop] when it is not, and
/// never stretched.
///
/// Separate from [ReelMediaFrame] so the one decision that matters — how a
/// piece of media meets the screen — lives in one widget whatever the picture
/// is: a network still, a playing clip, or a picture drawn in a test.
class ReelFramedMedia extends StatelessWidget {
  const ReelFramedMedia({
    required this.aspectRatio,
    required this.pictureBuilder,
    required this.backdrop,
    this.focalPoint,
    super.key,
  });

  /// Width over height of the media, or null while it is unknown.
  final double? aspectRatio;

  final FocalPoint? focalPoint;

  /// Builds the picture, told the size and alignment it will be drawn at.
  final Widget Function(BuildContext context, ReelMediaLayout layout)
  pictureBuilder;

  /// Drawn only behind bands the picture leaves uncovered.
  final Widget backdrop;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final viewport = constraints.biggest;
      if (!viewport.isFinite || viewport.isEmpty) {
        return const SizedBox.shrink();
      }
      final layout = reelMediaLayout(
        viewport: viewport,
        mediaAspect: aspectRatio,
        focalPoint: focalPoint,
      );
      return ColoredBox(
        color: const Color(0xFF070A09),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (!layout.fillsViewport) backdrop,
            ClipRect(
              child: OverflowBox(
                alignment: layout.alignment,
                minWidth: layout.size.width,
                maxWidth: layout.size.width,
                minHeight: layout.size.height,
                maxHeight: layout.size.height,
                child: pictureBuilder(context, layout),
              ),
            ),
          ],
        ),
      );
    },
  );
}

/// The backdrop scrim, public so anything drawing its own backdrop — a render
/// check, a future still-only surface — dims to exactly the same level.
const Color kReelBackdropScrim = _backdropScrim;

/// How dark the backdrop is held. Restrained on purpose: it exists so the
/// bands are not a flat black hole, not so they compete with the media.
const Color _backdropScrim = Color(0xB3070A09);

/// The bands around a framed still or poster: its own colours, blurred past
/// recognition and dimmed.
class _StillBackdrop extends StatelessWidget {
  const _StillBackdrop({required this.thumbnail});

  final ImageProvider<Object>? thumbnail;

  @override
  Widget build(BuildContext context) {
    final thumbnail = this.thumbnail;
    if (thumbnail == null) {
      return const ColoredBox(color: Color(0xFF0B1210));
    }
    return RepaintBoundary(
      child: ClipRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            ImageFiltered(
              imageFilter: ImageFilter.blur(
                sigmaX: 30,
                sigmaY: 30,
                tileMode: TileMode.clamp,
              ),
              child: Transform.scale(
                scale: 1.2,
                child: Image(
                  image: thumbnail,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                  errorBuilder: (context, error, stackTrace) =>
                      const ColoredBox(color: Color(0xFF0B1210)),
                ),
              ),
            ),
            const ColoredBox(color: _backdropScrim),
          ],
        ),
      ),
    );
  }
}

/// The bands around a framed clip, lit by the clip itself.
///
/// The same texture the player is already drawing, sampled a second time: no
/// second decode, no second stream, and nothing still. Only ever drawn for the
/// active reel, so the cost is one blurred layer rather than one per page.
class _VideoBackdrop extends StatelessWidget {
  const _VideoBackdrop({required this.controller});

  final VideoPlayerController controller;

  @override
  Widget build(BuildContext context) {
    final size = controller.value.size;
    return RepaintBoundary(
      child: ClipRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            ImageFiltered(
              imageFilter: ImageFilter.blur(
                sigmaX: 26,
                sigmaY: 26,
                tileMode: TileMode.clamp,
              ),
              child: Transform.scale(
                scale: 1.18,
                child: FittedBox(
                  fit: BoxFit.cover,
                  child: SizedBox(
                    width: size.width > 0 ? size.width : 16,
                    height: size.height > 0 ? size.height : 9,
                    child: VideoPlayer(controller),
                  ),
                ),
              ),
            ),
            const ColoredBox(color: _backdropScrim),
          ],
        ),
      ),
    );
  }
}

/// What stands in for a still that has not arrived, or never will.
///
/// Dark rather than the old brand gradient: this sits under white text and
/// behind a loading ring, and a bright green-to-gold wash read as content.
class ReelMediaPlaceholder extends StatelessWidget {
  const ReelMediaPlaceholder({super.key});

  @override
  Widget build(BuildContext context) => const DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF0B1F18), Color(0xFF15100C), Color(0xFF1E1608)],
      ),
    ),
  );
}
