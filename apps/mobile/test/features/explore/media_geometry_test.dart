// How a piece of media fills a reel card.
//
// Portrait media fills the card, cropped towards its focal point. Landscape and
// square media is enlarged towards a fill only as far as a crop is safe, and
// otherwise sits whole in the middle over a backdrop. In every case the media
// keeps its own shape — nothing here may ever stretch a frame.

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/media_geometry.dart';

/// A tall modern phone, and a small older one.
const _phone = Size(390, 844);
const _smallPhone = Size(360, 640);
const _tablet = Size(800, 1280);

double _aspect(Size size) => size.width / size.height;

void main() {
  group('reelMediaLayout', () {
    test('portrait media fills a portrait card', () {
      for (final viewport in [_phone, _smallPhone, _tablet]) {
        final layout = reelMediaLayout(viewport: viewport, mediaAspect: 9 / 16);
        expect(layout.fillsViewport, isTrue, reason: '$viewport');
        expect(layout.size.width, greaterThanOrEqualTo(viewport.width - 0.01));
        expect(
          layout.size.height,
          greaterThanOrEqualTo(viewport.height - 0.01),
        );
      }
    });

    test('a 4:5 portrait still fills rather than letterboxing', () {
      final layout = reelMediaLayout(viewport: _phone, mediaAspect: 4 / 5);
      expect(layout.fillsViewport, isTrue);
    });

    test('landscape media is framed, not cropped to a sliver', () {
      final layout = reelMediaLayout(viewport: _phone, mediaAspect: 16 / 9);
      expect(layout.fillsViewport, isFalse);
      // Enlarged past a plain contain, so the bands are smaller…
      expect(layout.size.height, greaterThan(_phone.width / (16 / 9)));
      // …but never so far that more than a fifth of the width is lost.
      expect(
        _phone.width / layout.size.width,
        greaterThanOrEqualTo(0.8 - 1e-9),
      );
      // Centred vertically in the card.
      expect(layout.alignment.y, 0);
    });

    test('square media is framed on a phone', () {
      final layout = reelMediaLayout(viewport: _smallPhone, mediaAspect: 1);
      expect(layout.fillsViewport, isFalse);
      expect(layout.size.width, greaterThan(_smallPhone.width));
      expect(layout.size.height, lessThan(_smallPhone.height));
    });

    test('a focal point allows a deeper crop, steered towards it', () {
      final plain = reelMediaLayout(viewport: _phone, mediaAspect: 1);
      final steered = reelMediaLayout(
        viewport: _phone,
        mediaAspect: 1,
        focalPoint: (x: 0.2, y: 0.5),
      );
      expect(steered.size.width, greaterThan(plain.size.width));
      // Subject on the left: the visible window moves left.
      expect(steered.alignment.x, lessThan(0));
    });

    test('media almost the shape of the card simply fills it', () {
      final layout = reelMediaLayout(
        viewport: const Size(400, 700),
        mediaAspect: 4 / 7.05,
      );
      expect(layout.fillsViewport, isTrue);
    });

    test('never stretches: the drawn size keeps the media shape', () {
      for (final aspect in [9 / 16, 3 / 4, 1.0, 4 / 3, 16 / 9, 2.4]) {
        for (final viewport in [_phone, _smallPhone, _tablet]) {
          final layout = reelMediaLayout(
            viewport: viewport,
            mediaAspect: aspect,
          );
          expect(
            _aspect(layout.size),
            closeTo(aspect, 1e-6),
            reason: 'aspect $aspect in $viewport',
          );
        }
      }
    });

    test('unknown shape fills, the way a poster already does', () {
      final layout = reelMediaLayout(viewport: _phone, mediaAspect: null);
      expect(layout.fillsViewport, isTrue);
      expect(layout.size, _phone);
      expect(layout.alignment, Alignment.center);
    });

    test('a focal point on an axis with no overflow is ignored', () {
      // A framed landscape clip overflows sideways only; its subject standing
      // high in the frame must not push it to the top of the card.
      final layout = reelMediaLayout(
        viewport: _phone,
        mediaAspect: 16 / 9,
        focalPoint: (x: 0.5, y: 0.1),
      );
      expect(layout.alignment.y, 0);
    });

    test('a focal point at the edge keeps the edge in view', () {
      final layout = reelMediaLayout(
        viewport: _phone,
        mediaAspect: 9 / 16 * 0.7,
        focalPoint: (x: 0.5, y: 0),
      );
      expect(layout.alignment.y, -1);
    });
  });

  group('parseFocalPoint', () {
    test('reads fractions from a map or a pair', () {
      expect(parseFocalPoint({'x': 0.3, 'y': 0.7}), (x: 0.3, y: 0.7));
      expect(parseFocalPoint([0.25, 1]), (x: 0.25, y: 1.0));
    });

    test('reads percentages as fractions', () {
      expect(parseFocalPoint({'x': 50, 'y': 20}), (x: 0.5, y: 0.2));
    });

    test('anything else is no focal point at all', () {
      expect(parseFocalPoint(null), isNull);
      expect(parseFocalPoint({'x': 0.5}), isNull);
      expect(parseFocalPoint({'x': '0.5', 'y': 0.5}), isNull);
      expect(parseFocalPoint({'x': -1, 'y': 0.5}), isNull);
      expect(parseFocalPoint({'x': 400, 'y': 0.5}), isNull);
      expect(parseFocalPoint([0.1, 0.2, 0.3]), isNull);
    });
  });

  group('positiveAspectRatio', () {
    test('keeps sane ratios and refuses the rest', () {
      expect(positiveAspectRatio(16 / 9), closeTo(1.777, 0.001));
      expect(positiveAspectRatio(1), 1.0);
      expect(positiveAspectRatio(0), isNull);
      expect(positiveAspectRatio(40), isNull);
      expect(positiveAspectRatio('1.5'), isNull);
      expect(positiveAspectRatio(double.nan), isNull);
    });
  });
}
