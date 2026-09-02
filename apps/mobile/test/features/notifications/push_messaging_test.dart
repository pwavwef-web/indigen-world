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
      expect(pushRouteFor({'type': 'message', 'threadId': 'a_b'}), '/chat/a_b');
    });

    test('non-string values do not throw', () {
      expect(pushRouteFor({'route': 42, 'postId': 7, 'type': true}), isNull);
      // Still routed, but to the inbox — a conversation is never in the
      // alert centre, so the usual fallback would land on an empty screen.
      expect(pushRouteFor({'type': 'message', 'threadId': 9}), '/messages');
    });

    test('a thread reply opens the conversation, not the reply', () {
      // The fan-out puts the thread ROOT on the row for exactly this reason:
      // opening one reply torn out of the middle of a thread is worse than
      // opening nothing.
      expect(
        pushRouteFor({'type': 'thread_reply', 'postId': 'root-1'}),
        '/post/root-1',
      );
    });

    test('a followed post and a milestone open the post itself', () {
      expect(
        pushRouteFor({'type': 'post', 'postId': 'p1'}),
        '/post/p1',
      );
      expect(
        pushRouteFor({'type': 'milestone', 'postId': 'p1'}),
        '/post/p1',
      );
    });

    test('a reel alert lands on the home tab, where reels are', () {
      expect(pushRouteFor({'type': 'reel_comment', 'route': '/'}), '/');
    });

    test('a welcome points at contributing, not at scrolling', () {
      expect(
        pushRouteFor({'type': 'welcome', 'route': '/contribute'}),
        '/contribute',
      );
    });
  });

  group('routeForPushType', () {
    // The last resort, for a payload that arrives with nothing but its type —
    // a trimmed notification, or a kind a future backend stops denormalising a
    // postId onto. "Nowhere" is the wrong answer to any of them.

    test('every kind the backend can send lands somewhere real', () {
      const kinds = [
        'like',
        'repost',
        'quote',
        'reply',
        'follow',
        'mention',
        'post',
        'thread_reply',
        'milestone',
        'reel_comment',
        'welcome',
        'publication',
        'announcement',
        'message',
      ];
      for (final kind in kinds) {
        expect(
          routeForPushType(kind),
          startsWith('/'),
          reason: '$kind routes nowhere',
        );
      }
    });

    test('the kinds with no post of their own get their own destination', () {
      expect(routeForPushType('message'), '/messages');
      expect(routeForPushType('reel_comment'), '/');
      expect(routeForPushType('publication'), '/');
      expect(routeForPushType('welcome'), '/contribute');
    });

    test('an unknown kind still reaches the centre', () {
      // The row announcing it is certainly there, whatever it turned out to be.
      expect(routeForPushType('invented_next_year'), '/notifications');
    });

    test('no type at all routes nowhere', () {
      expect(routeForPushType(null), isNull);
      expect(routeForPushType(''), isNull);
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
      expect(
        isForOpenThread({'type': 'like', 'postId': 'a_b'}, 'a_b'),
        isFalse,
      );
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

    test('a prolific poster is one entry inside the app too', () {
      // Android's collapseKey and the APNs collapse id only govern what the
      // *system* draws. An alert that arrives while somebody is looking at the
      // app is drawn by the app, so without reading the key back out of the
      // data payload, being in the app meant getting the stack a locked phone
      // was spared.
      expect(
        alertKeyFor(
          message({
            'type': 'post',
            'notificationId': 'newpost_p1_me',
            'collapseKey': 'newpost_amina',
          }),
        ),
        alertKeyFor(
          message({
            'type': 'post',
            'notificationId': 'newpost_p2_me',
            'collapseKey': 'newpost_amina',
          }),
        ),
      );
    });

    test('two authors never collapse into each other', () {
      expect(
        alertKeyFor(message({'type': 'post', 'collapseKey': 'newpost_amina'})),
        isNot(
          alertKeyFor(
            message({'type': 'post', 'collapseKey': 'newpost_nyaaba'}),
          ),
        ),
      );
    });

    test('an alert with no collapse key is still keyed on itself', () {
      expect(
        alertKeyFor(
          message({'type': 'like', 'notificationId': 'like_1', 'collapseKey': ''}),
        ),
        'like_1',
      );
    });
  });
}
