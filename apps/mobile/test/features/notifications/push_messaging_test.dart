import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/local_alerts.dart';
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

    test('a thread id opens that conversation', () {
      expect(
        pushRouteFor({'type': 'message', 'threadId': 'a_b'}),
        '/chat/a_b',
      );
    });

    test('non-string values do not throw', () {
      expect(pushRouteFor({'route': 42, 'postId': 7, 'type': true}), isNull);
      // Still routed, but to the inbox — a conversation is never in the
      // alert centre, so the usual fallback would land on an empty screen.
      expect(pushRouteFor({'type': 'message', 'threadId': 9}), '/messages');
    });
  });

  group('isForOpenThread', () {
    // Decides whether a push is swallowed. Wrong in one direction it announces
    // the line somebody is reading; wrong in the other it silently drops a
    // message from a different conversation, which is far worse.

    test('a message about the open conversation is already on screen', () {
      expect(
        isForOpenThread({'type': 'message', 'threadId': 'a_b'}, 'a_b'),
        isTrue,
      );
    });

    test('a message about a different conversation still rings', () {
      expect(
        isForOpenThread({'type': 'message', 'threadId': 'a_c'}, 'a_b'),
        isFalse,
      );
    });

    test('nothing is swallowed when no conversation is open', () {
      expect(
        isForOpenThread({'type': 'message', 'threadId': 'a_b'}, null),
        isFalse,
      );
      expect(
        isForOpenThread({'type': 'message', 'threadId': 'a_b'}, ''),
        isFalse,
      );
    });

    test('a community alert is never swallowed by an open conversation', () {
      // A like whose postId happens to match a thread id must still arrive.
      expect(isForOpenThread({'type': 'like', 'postId': 'a_b'}, 'a_b'), isFalse);
      expect(isForOpenThread(const {}, 'a_b'), isFalse);
    });
  });

  group('alertKeyFor', () {
    // What a foreground alert is tagged with. Two messages in one conversation
    // have to land on the same key, or being inside the app turns a burst into
    // a stack of rows the backgrounded case would have collapsed.

    RemoteMessage message(Map<String, dynamic> data, {String? id}) =>
        RemoteMessage(data: data, messageId: id);

    test('every message in a conversation shares one key', () {
      expect(
        alertKeyFor(message({'type': 'message', 'threadId': 'a_b'}, id: '1')),
        alertKeyFor(message({'type': 'message', 'threadId': 'a_b'}, id: '2')),
      );
    });

    test('two conversations never share a key', () {
      expect(
        alertKeyFor(message({'type': 'message', 'threadId': 'a_b'})),
        isNot(alertKeyFor(message({'type': 'message', 'threadId': 'a_c'}))),
      );
    });

    test('a community alert is keyed on the notification it announces', () {
      expect(
        alertKeyFor(message({'type': 'like', 'notificationId': 'like_1'})),
        'like_1',
      );
    });

    test('a payload carrying neither still produces a key', () {
      // Better one replaced alert than a crash on the delivery path.
      expect(alertKeyFor(message(const {}, id: 'fcm-1')), 'fcm-1');
      expect(alertKeyFor(message(const {})), isNotEmpty);
    });
  });
}
