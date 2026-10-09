import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/widgets/audio_artwork.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// The colour a song is played in.
///
/// ── Why the artwork decides ───────────────────────────────────────────────
/// A player that paints every song the same blue is a player that looks the
/// same whether it is holding a funeral dirge or a harvest dance. The artwork
/// is the one thing the archive has that already says something about the
/// piece, so the stage, the now-playing screen and the mini-player all take
/// their colour from it — and change with it, slowly, when the song does.
///
/// ── Why not `ColorScheme.fromImageProvider` ───────────────────────────────
/// It would do, except for what it does when the picture fails to load: its
/// error listener *throws*, from inside an image-stream callback no `try` can
/// reach, and it arms a five-second timer. A poster that 404s would then be an
/// uncaught error on the way to Crashlytics. So the picture is decoded here, at
/// 24 pixels, with a listener that answers failure with "no colour" — which is
/// what a failed poster actually means.

/// The Music tile's colour, and Audiobooks' — the colour of the door a member
/// came in through, carried into the place it opens onto.
///
/// Theme-independent on purpose, like every channel colour in the Collection:
/// the hue is the channel's identity, not the theme's.
Color musicChannelColor(BrandPalette brand, CollectionKind kind) =>
    kind == CollectionKind.audiobooks
    ? brand.gold
    : brand.pick(const Color(0xFF0E7490), const Color(0xFF67E8F9));

/// White text needs this much contrast against a tint before it is legible
/// at body size.
const double kMusicTintContrast = 4.5;

/// The WCAG contrast ratio between [a] and [b].
double contrastRatio(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final light = math.max(la, lb);
  final dark = math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/// [seed], darkened just far enough that white text on it passes
/// [kMusicTintContrast].
///
/// Darkened in HSL rather than by mixing in black, so a red artwork gives a
/// deep red and not a muddy brown. Saturation is capped as well: a fully
/// saturated ground behind a whole screen is a colour that shouts.
Color musicTintForText(Color seed) {
  var hsl = HSLColor.fromColor(seed.withValues(alpha: 1));
  if (hsl.saturation > 0.72) hsl = hsl.withSaturation(0.72);
  var color = hsl.toColor();
  var guard = 0;
  while (contrastRatio(color, Colors.white) < kMusicTintContrast &&
      guard++ < 40) {
    hsl = hsl.withLightness(math.max(0, hsl.lightness - 0.025));
    color = hsl.toColor();
  }
  return color;
}

/// The colour a picture is mostly *about*, from its raw RGBA pixels.
///
/// Not the average — the average of a sunset is beige. Pixels are sorted into
/// twelve hue buckets and weighted by how saturated and how bright they are, so
/// the answer is the colour somebody would name, not the colour of the
/// background it is sitting on. A picture with no real colour in it (a grey
/// photograph, a black-and-white scan) answers with its own grey.
Color? dominantColorOf(Uint8List rgba) {
  const buckets = 12;
  final weight = List<double>.filled(buckets, 0);
  final red = List<double>.filled(buckets, 0);
  final green = List<double>.filled(buckets, 0);
  final blue = List<double>.filled(buckets, 0);
  var greyWeight = 0.0;
  var greyR = 0.0, greyG = 0.0, greyB = 0.0;

  for (var i = 0; i + 3 < rgba.length; i += 4) {
    final alpha = rgba[i + 3];
    if (alpha < 128) continue;
    final r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    final hsv = HSVColor.fromColor(Color.fromARGB(255, r, g, b));
    // Near-black and near-white say nothing about the picture's colour.
    if (hsv.value < 0.12) continue;
    greyWeight += 1;
    greyR += r;
    greyG += g;
    greyB += b;
    if (hsv.saturation < 0.18) continue;
    final bucket = (hsv.hue / 360 * buckets).floor() % buckets;
    final w = hsv.saturation * hsv.saturation * (0.35 + hsv.value);
    weight[bucket] += w;
    red[bucket] += r * w;
    green[bucket] += g * w;
    blue[bucket] += b * w;
  }

  var best = -1;
  for (var i = 0; i < buckets; i++) {
    if (best < 0 || weight[i] > weight[best]) best = i;
  }
  if (best >= 0 && weight[best] > 0.6) {
    final w = weight[best];
    return Color.fromARGB(
      255,
      (red[best] / w).round().clamp(0, 255),
      (green[best] / w).round().clamp(0, 255),
      (blue[best] / w).round().clamp(0, 255),
    );
  }
  if (greyWeight == 0) return null;
  return Color.fromARGB(
    255,
    (greyR / greyWeight).round(),
    (greyG / greyWeight).round(),
    (greyB / greyWeight).round(),
  );
}

/// Decodes [provider] at a thumbnail's size and returns its colour, or null
/// for any failure at all.
Future<Color?> extractArtworkTint(ImageProvider provider) async {
  final stream = ResizeImage(
    provider,
    width: 24,
    height: 24,
    policy: ResizeImagePolicy.fit,
  ).resolve(ImageConfiguration.empty);

  final completer = Completer<ui.Image?>();
  late final ImageStreamListener listener;
  listener = ImageStreamListener(
    (info, _) {
      if (!completer.isCompleted) completer.complete(info.image.clone());
    },
    onError: (_, _) {
      if (!completer.isCompleted) completer.complete(null);
    },
  );
  stream.addListener(listener);

  ui.Image? image;
  try {
    image = await completer.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () => null,
    );
  } finally {
    stream.removeListener(listener);
  }
  if (image == null) return null;

  try {
    final bytes = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (bytes == null) return null;
    final dominant = dominantColorOf(bytes.buffer.asUint8List());
    return dominant == null ? null : musicTintForText(dominant);
  } on Object {
    return null;
  } finally {
    image.dispose();
  }
}

/// How a tint is found for an artwork URL.
///
/// A function behind a provider for the same reason the audio handler is: the
/// real one reaches the network and the image codec, and a widget test that
/// wanted a colour can hand one in without either.
final musicTintExtractorProvider = Provider<Future<Color?> Function(String)>(
  (ref) =>
      (url) => extractArtworkTint(audioArtworkProvider(url)),
);

/// The tint for one artwork URL, worked out once and kept.
///
/// Kept for the life of the app rather than disposed: the archive holds tens
/// of pieces, not thousands, and a colour that had to be recomputed every time
/// a shelf scrolled back into view would flicker from the fallback each time.
final musicArtworkTintProvider = FutureProvider.family<Color?, String>(
  (ref, url) => ref.watch(musicTintExtractorProvider)(url),
);

/// The tint for [artworkUrl], or null while it is unknown or there is none.
///
/// Never touches the network for an empty URL.
Color? watchMusicTint(WidgetRef ref, String? artworkUrl) {
  final url = artworkUrl?.trim() ?? '';
  if (url.isEmpty) return null;
  return ref.watch(musicArtworkTintProvider(url)).asData?.value;
}

/// Eases from one tint to the next instead of snapping, so a track change
/// washes across the screen rather than cutting.
class AnimatedTint extends StatelessWidget {
  const AnimatedTint({
    required this.color,
    required this.builder,
    this.duration = AppMotion.standard,
    super.key,
  });

  final Color color;
  final Widget Function(BuildContext context, Color color) builder;
  final Duration duration;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<Color?>(
    tween: ColorTween(end: color),
    duration: motionOr(context, duration),
    curve: Curves.easeOut,
    builder: (context, value, _) => builder(context, value ?? color),
  );
}
