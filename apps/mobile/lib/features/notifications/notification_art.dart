import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';
import 'dart:ui' show Color;

import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';

/// The pictures an alert in the shade is drawn with.
///
/// Everything here runs where the alert is drawn, which is usually a
/// background isolate the system woke for one push, with no widget tree and a
/// few seconds to spare. So pictures are fetched with tight bounds, decoded off
/// that isolate's thread, and kept on disk — the alert is drawn again when
/// somebody presses one of its buttons, often with no connection by then.

/// Hosts an alert picture may be fetched from. Mirrors `ALERT_IMAGE_HOSTS` in
/// the backend's push.ts: fetching an image tells its host this phone exists,
/// so only the hosts the app's own pictures live on are ever asked.
const allowedAlertImageHosts = {
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
};

/// The large icon's edge, in pixels — Android's 64 dp at xxxhdpi, roughly.
const alertAvatarSize = 192;

/// The widest picture handed to the shade. Anything larger is scaled down: a
/// notification's bitmaps travel to the system UI in one binder transaction,
/// and a full-size photograph is enough to make the whole post fail.
const alertPictureMaxWidth = 1024;

const _maxDownloadBytes = 5 * 1024 * 1024;
const _cacheLimit = 40;
const _cacheMaxAge = Duration(days: 2);

/// Whether [url] may be fetched for an alert.
bool isAllowedAlertImage(String? url) {
  if (url == null || url.length > 2000) return false;
  final uri = Uri.tryParse(url);
  return uri != null &&
      uri.scheme == 'https' &&
      allowedAlertImageHosts.contains(uri.host);
}

/// The bytes at [url], from the alert cache when it already holds them.
///
/// Null for anything not on an allowed host, not an image, larger than 5 MB or
/// slower than the few seconds an alert can wait. A missing picture costs the
/// alert its picture, never the alert.
Future<Uint8List?> fetchAlertImage(String? url) async {
  if (!isAllowedAlertImage(url)) return null;
  final cache = await _cacheDirectory();
  final file = cache == null
      ? null
      : File('${cache.path}/${sha256.convert(utf8.encode(url!))}.img');
  if (file != null && file.existsSync()) {
    try {
      return await file.readAsBytes();
    } on Object {
      /* fall through to the network */
    }
  }
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  try {
    final request = await client.getUrl(Uri.parse(url!));
    request.followRedirects = false;
    final response = await request.close().timeout(const Duration(seconds: 6));
    final type = response.headers.contentType?.mimeType;
    if (response.statusCode != 200 ||
        response.contentLength > _maxDownloadBytes ||
        !const {'image/jpeg', 'image/png', 'image/webp'}.contains(type)) {
      return null;
    }
    final builder = BytesBuilder(copy: false);
    await for (final chunk in response.timeout(const Duration(seconds: 6))) {
      builder.add(chunk);
      if (builder.length > _maxDownloadBytes) return null;
    }
    final bytes = builder.takeBytes();
    if (file != null) {
      try {
        await file.writeAsBytes(bytes, flush: true);
        unawaited(_prune(cache!));
      } on Object {
        /* a cache that cannot be written is only a slower redraw */
      }
    }
    return bytes;
  } on Object {
    return null;
  } finally {
    client.close(force: true);
  }
}

Future<Directory?> _cacheDirectory() async {
  try {
    final directory = Directory(
      '${(await getTemporaryDirectory()).path}/notification-images',
    );
    await directory.create(recursive: true);
    return directory;
  } on Object {
    return null;
  }
}

/// Keeps the cache to the newest [_cacheLimit] files and drops anything older
/// than [_cacheMaxAge] — an alert from two days ago is not going to be redrawn.
Future<void> _prune(Directory directory) async {
  try {
    final files = <(File, DateTime)>[];
    await for (final entity in directory.list()) {
      if (entity is File) files.add((entity, (await entity.stat()).modified));
    }
    files.sort((a, b) => b.$2.compareTo(a.$2));
    final now = DateTime.now();
    for (final (index, (file, modified)) in files.indexed) {
      if (index >= _cacheLimit || now.difference(modified) > _cacheMaxAge) {
        await file.delete();
      }
    }
  } on Object {
    /* pruning is housekeeping */
  }
}

/// Everything [composeAlertAvatar] needs, as plain values so it can cross
/// into a worker isolate.
class AlertAvatarSpec {
  const AlertAvatarSpec({
    required this.badgeColor,
    this.photo,
    this.initials = '',
    this.brandMark,
    this.badgeGlyph,
  });

  /// The actor's photograph, undecoded. Wins over everything below it.
  final Uint8List? photo;

  /// Drawn on a coloured disc when there is no photograph.
  final String initials;

  /// The Indigen mark, for alerts nobody in particular sent.
  final Uint8List? brandMark;

  /// The kind's white glyph (see `tool/notification_badges`).
  final Uint8List? badgeGlyph;
  final Color badgeColor;
}

/// The alert's large icon, as PNG bytes: the actor in a circle, wearing the
/// kind badge in its lower right — the notification centre's avatar, at the
/// size the shade draws it.
///
/// Decoding a photograph is tens of milliseconds of pure CPU, so it runs on a
/// worker isolate rather than the one that has to post the alert.
Future<Uint8List?> composeAlertAvatar(AlertAvatarSpec spec) async {
  try {
    return await Isolate.run(() => drawAlertAvatar(spec));
  } on Object {
    return null;
  }
}

/// [composeAlertAvatar]'s work, synchronously. Public so a test can draw one.
Uint8List drawAlertAvatar(AlertAvatarSpec spec) {
  const size = alertAvatarSize;
  // The avatar fills the canvas less the badge's overhang, the way the
  // in-app badge pokes three pixels past a 40 px avatar.
  const avatar = 176;
  const badge = 80;
  const ring = 7;
  final canvas = img.Image(width: size, height: size, numChannels: 4)
    ..clear(img.ColorRgba8(0, 0, 0, 0));

  final photo = _decode(spec.photo);
  final mark = _decode(spec.brandMark);
  if (photo != null) {
    final square = img.copyResizeCropSquare(
      photo,
      size: avatar,
      interpolation: img.Interpolation.average,
    );
    img.compositeImage(canvas, img.copyCropCircle(square), dstX: 0, dstY: 0);
  } else if (mark != null) {
    // A white disc with a hairline, as the centre draws the Indigen mark.
    img.fillCircle(
      canvas,
      x: avatar ~/ 2,
      y: avatar ~/ 2,
      radius: avatar ~/ 2,
      color: img.ColorRgba8(0xDB, 0xE3, 0xF3, 255),
      antialias: true,
    );
    img.fillCircle(
      canvas,
      x: avatar ~/ 2,
      y: avatar ~/ 2,
      radius: avatar ~/ 2 - 3,
      color: img.ColorRgba8(255, 255, 255, 255),
      antialias: true,
    );
    const inner = 112;
    final fitted = img.copyResize(
      mark,
      width: inner,
      height: inner,
      maintainAspect: true,
      interpolation: img.Interpolation.average,
    );
    img.compositeImage(
      canvas,
      fitted,
      dstX: (avatar - fitted.width) ~/ 2,
      dstY: (avatar - fitted.height) ~/ 2,
    );
  } else {
    img.fillCircle(
      canvas,
      x: avatar ~/ 2,
      y: avatar ~/ 2,
      radius: avatar ~/ 2,
      color: _rgba(spec.badgeColor),
      antialias: true,
    );
    final letters = spec.initials.characters2;
    if (letters.isNotEmpty) {
      // The bundled bitmap font is 48 px, which inside a 176 px disc read as
      // a whisper once the shade shrank the icon. The letters are drawn at
      // that size, then enlarged to fill the disc the way the in-app avatar's
      // initials do; the shade's own downscale hides the enlargement.
      final font = img.arial48;
      var width = 0;
      for (final unit in letters.codeUnits) {
        width += font.characters[unit]?.xAdvance ?? font.size ~/ 2;
      }
      final text = img.Image(
        width: width + 4,
        height: font.lineHeight,
        numChannels: 4,
      )..clear(img.ColorRgba8(0, 0, 0, 0));
      img.drawString(
        text,
        letters,
        font: font,
        x: 2,
        y: 0,
        color: img.ColorRgba8(255, 255, 255, 255),
      );
      const scale = 1.7;
      final large = img.copyResize(
        text,
        width: (text.width * scale).round(),
        height: (text.height * scale).round(),
        interpolation: img.Interpolation.cubic,
      );
      img.compositeImage(
        canvas,
        large,
        dstX: (avatar - large.width) ~/ 2,
        dstY: (avatar - large.height) ~/ 2,
      );
    }
  }

  // The badge: a ring in the shade's own white, then the kind's colour, then
  // the glyph — the same three layers as the centre's 19 px badge.
  const centre = size - badge ~/ 2;
  img.fillCircle(
    canvas,
    x: centre,
    y: centre,
    radius: badge ~/ 2,
    color: img.ColorRgba8(255, 255, 255, 255),
    antialias: true,
  );
  img.fillCircle(
    canvas,
    x: centre,
    y: centre,
    radius: badge ~/ 2 - ring,
    color: _rgba(spec.badgeColor),
    antialias: true,
  );
  final glyph = _decode(spec.badgeGlyph);
  if (glyph != null) {
    const inner = 40;
    final fitted = glyph.width == inner
        ? glyph
        : img.copyResize(
            glyph,
            width: inner,
            height: inner,
            interpolation: img.Interpolation.average,
          );
    img.compositeImage(
      canvas,
      fitted,
      dstX: centre - inner ~/ 2,
      dstY: centre - inner ~/ 2,
    );
  }
  return img.encodePng(canvas);
}

/// [bytes] scaled to fit the shade, as JPEG, or null when it is not a
/// picture this can read.
Future<Uint8List?> fitAlertPicture(Uint8List? bytes) async {
  if (bytes == null) return null;
  try {
    return await Isolate.run(() => drawAlertPicture(bytes));
  } on Object {
    return null;
  }
}

/// [fitAlertPicture]'s work, synchronously. Public so a test can run it.
Uint8List? drawAlertPicture(Uint8List bytes) {
  final picture = _decode(bytes);
  if (picture == null) return null;
  final fitted = picture.width > alertPictureMaxWidth
      ? img.copyResize(
          picture,
          width: alertPictureMaxWidth,
          interpolation: img.Interpolation.average,
        )
      : picture;
  return img.encodeJpg(fitted, quality: 84);
}

img.Image? _decode(Uint8List? bytes) {
  if (bytes == null || bytes.isEmpty) return null;
  try {
    final decoded = img.decodeImage(bytes);
    return decoded?.convert(numChannels: 4);
  } on Object {
    return null;
  }
}

img.Color _rgba(Color color) => img.ColorRgba8(
  (color.r * 255).round(),
  (color.g * 255).round(),
  (color.b * 255).round(),
  255,
);

extension on String {
  /// The first two letters, restricted to what the bundled bitmap font can
  /// draw. A name in a script it has no glyphs for falls back to a plain disc
  /// rather than a row of empty boxes.
  String get characters2 {
    final kept = toUpperCase().runes
        .where((rune) => rune >= 0x20 && rune < 0x7F)
        .take(2);
    return String.fromCharCodes(kept);
  }
}
