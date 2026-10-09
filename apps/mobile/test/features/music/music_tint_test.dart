// The colour a song is played in.
//
// Two things have to be true whatever the artwork turns out to be: the
// colour is the one somebody would name, and white type on it is legible.

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/music/music_tint.dart';

/// A picture of [pixels], as the raw RGBA bytes a decoded image hands over.
Uint8List _picture(List<Color> pixels) => Uint8List.fromList([
  for (final pixel in pixels) ...[
    (pixel.r * 255).round(),
    (pixel.g * 255).round(),
    (pixel.b * 255).round(),
    (pixel.a * 255).round(),
  ],
]);

void main() {
  group('musicTintForText', () {
    for (final seed in const [
      Color(0xFFFFEB3B), // a yellow nothing white can sit on
      Color(0xFFFFFFFF),
      Color(0xFF67E8F9),
      Color(0xFFE53935),
      Color(0xFF0B1225), // already dark
    ]) {
      test('white type reads on the tint from $seed', () {
        final tint = musicTintForText(seed);
        expect(
          contrastRatio(tint, Colors.white),
          greaterThanOrEqualTo(kMusicTintContrast),
        );
      });
    }

    test('keeps the hue: a red artwork gives a red, not a brown', () {
      final tint = musicTintForText(const Color(0xFFE53935));
      final hue = HSLColor.fromColor(tint).hue;
      expect(hue < 15 || hue > 345, isTrue, reason: 'hue was $hue');
    });

    test('an already dark colour is left alone', () {
      const deep = Color(0xFF0B1225);
      expect(musicTintForText(deep), HSLColor.fromColor(deep).toColor());
    });
  });

  group('dominantColorOf', () {
    test('is the colour the picture is about, not its average', () {
      // A small red sun on a large grey sky: the average is a muddy grey, the
      // answer is red.
      final pixels = [
        for (var i = 0; i < 80; i++) const Color(0xFF808890),
        for (var i = 0; i < 20; i++) const Color(0xFFE0301E),
      ];
      final colour = dominantColorOf(_picture(pixels))!;
      expect((colour.r * 255).round(), greaterThan(200));
      expect((colour.g * 255).round(), lessThan(80));
    });

    test('a picture with no colour in it answers with its own grey', () {
      final pixels = [
        for (var i = 0; i < 50; i++) const Color(0xFF606060),
        for (var i = 0; i < 50; i++) const Color(0xFFA0A0A0),
      ];
      final colour = dominantColorOf(_picture(pixels))!;
      expect((colour.r * 255).round(), 128);
      expect(colour.r, colour.g);
    });

    test('a transparent picture says nothing', () {
      expect(
        dominantColorOf(
          _picture([for (var i = 0; i < 10; i++) Colors.transparent]),
        ),
        isNull,
      );
    });
  });
}
