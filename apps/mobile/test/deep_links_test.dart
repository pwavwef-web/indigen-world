import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/deep_links.dart';

/// What a link followed from outside the app is allowed to open.
///
/// The share sheet in Community hands out
/// `https://indigenworld.com/post/<id>`, so the first group here is the whole
/// point of the feature. The rest guard the boundary in the other direction:
/// the app claims a couple of paths on that domain and must not quietly take
/// over the website.
void main() {
  String? routeFor(String url) => appRouteForLink(Uri.parse(url));

  group('opens', () {
    test('a shared post link', () {
      expect(
        routeFor('https://indigenworld.com/post/8BHqkdAMeDVXCGZrgJzS'),
        '/post/8BHqkdAMeDVXCGZrgJzS',
      );
    });

    test('the same link with www', () {
      expect(routeFor('https://www.indigenworld.com/post/abc'), '/post/abc');
    });

    test('a host somebody typed in capitals', () {
      expect(routeFor('https://IndigenWorld.com/post/abc'), '/post/abc');
    });

    test('a trailing slash', () {
      expect(routeFor('https://indigenworld.com/post/abc/'), '/post/abc');
    });

    test('a link carrying a tracking query', () {
      expect(routeFor('https://indigenworld.com/post/abc?from=whatsapp'), '/post/abc');
    });

    test('the custom scheme the website falls back to', () {
      // `indigen://post/abc` parses with `post` as the host, not a segment.
      expect(routeFor('indigen://post/abc'), '/post/abc');
    });
  });

  group('leaves alone', () {
    test('a page the website owns and the app has no screen for', () {
      expect(routeFor('https://indigenworld.com/about'), isNull);
      expect(routeFor('https://indigenworld.com/dictionary'), isNull);
      expect(routeFor('https://indigenworld.com/'), isNull);
    });

    test('a path the app has not claimed', () {
      // /entry/<id> is a real route in the app, but the website has no page
      // for it — claiming it would strand anybody without the app on a 404.
      expect(routeFor('https://indigenworld.com/entry/abc'), isNull);
    });

    test('a post link with no id', () {
      expect(routeFor('https://indigenworld.com/post'), isNull);
      expect(routeFor('https://indigenworld.com/post/'), isNull);
    });

    test('a deeper path under the claimed prefix', () {
      expect(routeFor('https://indigenworld.com/post/abc/edit'), isNull);
    });

    test('a lookalike host', () {
      expect(routeFor('https://indigenworld.com.evil.test/post/abc'), isNull);
      expect(routeFor('https://notindigenworld.com/post/abc'), isNull);
      expect(routeFor('https://indigenworld.co/post/abc'), isNull);
    });

    test('a scheme that is not ours', () {
      expect(routeFor('ftp://indigenworld.com/post/abc'), isNull);
      expect(routeFor('javascript:alert(1)'), isNull);
    });
  });
}
