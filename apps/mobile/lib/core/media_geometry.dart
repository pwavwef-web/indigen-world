import 'dart:math' as math;
import 'dart:ui' show Size;

import 'package:flutter/painting.dart' show Alignment;

/// A point in a piece of media, as fractions of its width and height.
typedef FocalPoint = ({double x, double y});

/// A usable width-over-height ratio from stored data, or null.
///
/// Anything outside a sane band is refused rather than clamped: a ratio of 40
/// is a data-entry error, and cropping to it would hide the whole frame.
double? positiveAspectRatio(Object? value) {
  if (value is! num) return null;
  final ratio = value.toDouble();
  if (!ratio.isFinite || ratio < 0.2 || ratio > 5) return null;
  return ratio;
}

/// The focal point a piece of media was given.
///
/// Accepts `{x, y}` or `[x, y]`. Fractions are what the field is meant to hold;
/// percentages are accepted too, because a form that says "50" meant the
/// middle. Anything else — a missing axis, a string, a negative — is no focal
/// point at all, which the feed treats as the centre.
FocalPoint? parseFocalPoint(Object? value) {
  Object? rawX;
  Object? rawY;
  if (value is Map) {
    rawX = value['x'];
    rawY = value['y'];
  } else if (value is List && value.length == 2) {
    rawX = value[0];
    rawY = value[1];
  }
  final x = _focalAxis(rawX);
  final y = _focalAxis(rawY);
  if (x == null || y == null) return null;
  return (x: x, y: y);
}

double? _focalAxis(Object? raw) {
  if (raw is! num) return null;
  final number = raw.toDouble();
  if (!number.isFinite || number < 0) return null;
  if (number <= 1) return number;
  if (number <= 100) return number / 100;
  return null;
}

/// How far a landscape or square frame may be cropped to fill more of a
/// portrait screen, as a share of the axis being cut.
///
/// A fifth is roughly what a camera operator leaves as headroom and margin, so
/// taking it rarely takes anything anybody filmed on purpose. With a focal
/// point the crop can go further, because it is steered towards what matters.
const double kReelMaxCrop = 0.2;
const double kReelMaxCropWithFocalPoint = 0.34;

/// Where a piece of media sits in a reel card, and at what size.
class ReelMediaLayout {
  const ReelMediaLayout({
    required this.size,
    required this.alignment,
    required this.fillsViewport,
  });

  /// The size the media is drawn at. Always the media's own shape — never
  /// stretched — and larger than the card on any axis that is being cropped.
  final Size size;

  /// How the media is placed inside the card, for an `OverflowBox`.
  final Alignment alignment;

  /// True when the media covers every pixel of the card, so nothing needs to
  /// be drawn behind it.
  final bool fillsViewport;
}

/// Decides how media of [mediaAspect] fills a card of [viewport].
///
/// ── The three cases ──────────────────────────────────────────────────────
///   * Portrait media on a portrait card is cropped to fill it. That is the
///     shape the feed is for, and letterboxing a 4:5 portrait with slivers of
///     backdrop looks like a mistake rather than a choice.
///   * Anything else is enlarged towards a fill, but only as far as
///     [kReelMaxCrop] allows — further with a focal point. If that reaches a
///     fill, it fills.
///   * If it does not, the media stays whole, centred, and the remaining bands
///     get a restrained backdrop derived from the media. A landscape dance clip
///     keeps both dancers instead of losing one to the crop.
///
/// Unknown aspect — a video that has not decoded a frame, an image still
/// loading — is treated as a fill, which is what a poster already does.
ReelMediaLayout reelMediaLayout({
  required Size viewport,
  required double? mediaAspect,
  FocalPoint? focalPoint,
}) {
  final width = viewport.width;
  final height = viewport.height;
  final aspect = mediaAspect;
  if (aspect == null ||
      !aspect.isFinite ||
      aspect <= 0 ||
      width <= 0 ||
      height <= 0) {
    return ReelMediaLayout(
      size: viewport,
      alignment: Alignment.center,
      fillsViewport: true,
    );
  }

  final viewportAspect = width / height;
  final contain = aspect > viewportAspect
      ? Size(width, width / aspect)
      : Size(height * aspect, height);
  // How much larger a full cover is than a contain. Always at least one.
  final coverZoom = math.max(aspect / viewportAspect, viewportAspect / aspect);

  final double zoom;
  if (coverZoom < 1.02 || (aspect < 1 && viewportAspect < 1)) {
    zoom = coverZoom;
  } else {
    final crop = focalPoint == null ? kReelMaxCrop : kReelMaxCropWithFocalPoint;
    zoom = math.min(coverZoom, 1 / (1 - crop));
  }

  final size = Size(contain.width * zoom, contain.height * zoom);
  final fills = zoom >= coverZoom - 1e-9;
  return ReelMediaLayout(
    size: size,
    alignment: Alignment(
      _axisAlignment(size.width, width, focalPoint?.x),
      _axisAlignment(size.height, height, focalPoint?.y),
    ),
    fillsViewport: fills,
  );
}

/// The alignment along one axis that puts [focal] as near the middle of the
/// visible window as the media's edges allow.
///
/// On an axis the media does not overflow there is nothing to steer, and the
/// media is centred: a framed clip nudged to the top of the card because its
/// subject stands high in the frame would look like a layout bug.
double _axisAlignment(double media, double viewport, double? focal) {
  final overflow = media - viewport;
  if (overflow <= 0.5 || focal == null) return 0;
  final start = (focal.clamp(0.0, 1.0) * media - viewport / 2).clamp(
    0.0,
    overflow,
  );
  return 2 * start / overflow - 1;
}
