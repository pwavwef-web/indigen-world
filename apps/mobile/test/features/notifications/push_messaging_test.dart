import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';

void main() {
  group('pushRouteFor', () {
    // This is the contract between the fan-out Cloud Function and the app. Get
    // it wrong and every deep link silently drops the member on the home tab.

    test('an explicit route wins', () {
      expect(pushRouteFor({'route': '/notifications'}), '/notifications');
    });

    test('a post id opens that post', () {
      expect(pushRouteFor({'type': 'like', 'postId': 'abc'}), '/post/abc');
    });

    test('a route takes precedence over a post id', () {
      expect(
        pushRouteFor({'route': '/notifications', 'postId': 'abc'}),
        '/notifications',
      );
    });

    test('a kind with nothing to open falls back to the centre', () {
      expect(pushRouteFor({'type': 'follow'}), '/notifications');
    });

    test('an empty or unrecognised payload routes nowhere', () {
      expect(pushRouteFor(const {}), isNull);
      expect(pushRouteFor({'postId': ''}), isNull);
      expect(pushRouteFor({'type': ''}), isNull);
    });

    test('a route that is not a path is refused', () {
      // FCM data is attacker-influenceable in principle; only in-app paths are
      // ever handed to the router.
      expect(pushRouteFor({'route': 'https://example.com'}), isNull);
      expect(pushRouteFor({'route': 'notifications'}), isNull);
    });

    test('non-string values do not throw', () {
      expect(pushRouteFor({'route': 42, 'postId': 7, 'type': true}), isNull);
    });
  });
}
