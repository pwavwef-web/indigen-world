import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' show Color;

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:indigen_world_mobile/features/notifications/notification_art.dart';

/// The pictures an alert in the shade is drawn with: the avatar wearing its
/// kind badge, and the attached picture scaled to something Android will
/// accept.
void main() {
  const badgeColor = Color(0xFFB4412F);
  final glyph = File('assets/notification_badges/like.png').readAsBytesSync();

  img.Image decode(Uint8List png) => img.decodePng(png)!;

  void expectNear(img.Pixel pixel, int r, int g, int b) {
    expect((pixel.r - r).abs(), lessThan(12), reason: 'red of $pixel');
    expect((pixel.g - g).abs(), lessThan(12), reason: 'green of $pixel');
    expect((pixel.b - b).abs(), lessThan(12), reason: 'blue of $pixel');
  }

  test('a photograph becomes a circle wearing the kind badge', () {
    final photo = img.Image(width: 300, height: 200)
      ..clear(img.ColorRgb8(20, 160, 60));
    final avatar = decode(
      drawAlertAvatar(
        AlertAvatarSpec(
          photo: img.encodeJpg(photo),
          badgeGlyph: glyph,
          badgeColor: badgeColor,
        ),
      ),
    );
    expect(avatar.width, alertAvatarSize);
    expect(avatar.height, alertAvatarSize);
    // Outside the circle is clear, so the shade's own background shows.
    expect(avatar.getPixel(2, 2).a, 0);
    // The middle of the avatar is the photograph.
    expectNear(avatar.getPixel(80, 80), 20, 160, 60);
    // The badge sits in the lower right, ringed in white, filled with the
    // kind's colour around its glyph.
    expectNear(avatar.getPixel(152, 115), 255, 255, 255);
    expectNear(avatar.getPixel(130, 152), 0xB4, 0x41, 0x2F);
    // The glyph itself is white at the badge's centre (a heart, for a like).
    expectNear(avatar.getPixel(152, 154), 255, 255, 255);
  });

  test('no photograph: the initials on a disc of the kind colour', () {
    final avatar = decode(
      drawAlertAvatar(
        const AlertAvatarSpec(initials: 'AA', badgeColor: badgeColor),
      ),
    );
    expectNear(avatar.getPixel(30, 88), 0xB4, 0x41, 0x2F);
    // Somewhere in the middle there is white lettering.
    var lettering = 0;
    for (var x = 60; x < 116; x++) {
      for (var y = 60; y < 116; y++) {
        final pixel = avatar.getPixel(x, y);
        if (pixel.r > 240 && pixel.g > 240 && pixel.b > 240) lettering++;
      }
    }
    expect(lettering, greaterThan(100));
  });

  test('a name in a script the bitmap font lacks draws a plain disc', () {
    final avatar = decode(
      drawAlertAvatar(
        const AlertAvatarSpec(initials: 'ŊƐ', badgeColor: badgeColor),
      ),
    );
    expectNear(avatar.getPixel(88, 88), 0xB4, 0x41, 0x2F);
  });

  test('nobody in particular: the Indigen mark on a white disc', () {
    final mark = File('assets/brand/indigen-world-mark.png').readAsBytesSync();
    final avatar = decode(
      drawAlertAvatar(
        AlertAvatarSpec(
          brandMark: mark,
          badgeGlyph: glyph,
          badgeColor: badgeColor,
        ),
      ),
    );
    expectNear(avatar.getPixel(20, 88), 255, 255, 255);
  });

  test('a broken photograph falls back rather than failing the alert', () {
    final avatar = decode(
      drawAlertAvatar(
        AlertAvatarSpec(
          photo: Uint8List.fromList([1, 2, 3]),
          initials: 'K',
          badgeColor: badgeColor,
        ),
      ),
    );
    expect(avatar.width, alertAvatarSize);
  });

  test('a large picture is scaled down for the shade, a small one kept', () {
    final large = img.encodeJpg(img.Image(width: 3000, height: 1500));
    final fitted = img.decodeJpg(drawAlertPicture(large)!)!;
    expect(fitted.width, alertPictureMaxWidth);
    expect(fitted.height, alertPictureMaxWidth ~/ 2);

    final small = img.encodeJpg(img.Image(width: 400, height: 300));
    expect(img.decodeJpg(drawAlertPicture(small)!)!.width, 400);

    expect(drawAlertPicture(Uint8List.fromList([0, 1])), isNull);
  });

  test('pictures are only fetched from the app\'s own hosts', () {
    expect(
      isAllowedAlertImage('https://firebasestorage.googleapis.com/v0/b/x'),
      isTrue,
    );
    expect(
      isAllowedAlertImage('https://lh3.googleusercontent.com/a/b'),
      isTrue,
    );
    expect(
      isAllowedAlertImage('http://firebasestorage.googleapis.com/x'),
      isFalse,
    );
    expect(isAllowedAlertImage('https://example.com/x.png'), isFalse);
    expect(isAllowedAlertImage(null), isFalse);
  });
}
