// The letterbox around a contained reel.
//
// A reel is drawn contained rather than cropped, because cropping a landscape
// clip to a portrait screen throws away the sides of the shot. That leaves
// bands above and below it, and the bands used to be the poster — the clip's
// own first frame, held still for the whole play. So anything that moved played
// inside a photograph of the moment before it started.
//
// They carry the moving picture now, blurred and blown up. What is worth
// pinning down here is the other half of that: a clip already the shape of the
// card must not pay for a full-screen gaussian per frame for edges that do not
// exist.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

void main() {
  test('a clip shot for this screen is left alone', () {
    // 9:16 in a 9:16 card. Every pixel is already the reel.
    expect(reelNeedsAmbientEdges(9 / 16, 9 / 16), isFalse);
  });

  test('a hair off is still left alone', () {
    // Encoders round. A one-pixel band is not worth a blurred layer.
    expect(reelNeedsAmbientEdges(0.5625, 0.5635), isFalse);
  });

  test('a landscape clip on a portrait screen gets its edges lit', () {
    expect(reelNeedsAmbientEdges(16 / 9, 9 / 16), isTrue);
  });

  test('a square clip on a portrait screen gets them too', () {
    expect(reelNeedsAmbientEdges(1, 9 / 16), isTrue);
  });

  test('a player reporting nothing sensible is not asked to draw twice', () {
    // `aspectRatio` is zero until the first frame is decoded, and a card laid
    // out with no height reports nothing either.
    expect(reelNeedsAmbientEdges(0, 9 / 16), isFalse);
    expect(reelNeedsAmbientEdges(16 / 9, 0), isFalse);
  });
}
