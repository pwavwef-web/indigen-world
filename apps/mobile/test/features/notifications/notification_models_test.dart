import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';

void main() {
  IndigenNotification at(DateTime when, {String id = 'n'}) =>
      IndigenNotification(
        id: id,
        recipientId: 'amina-uid',
        kind: NotificationKind.like,
        title: 'Somebody liked your post',
        createdAt: when,
      );

  group('bucketFor', () {
    final now = DateTime(2026, 8, 23, 9);

    test('anything from today lands in Today', () {
      expect(
        bucketFor(DateTime(2026, 8, 23, 0, 1), now: now),
        NotificationBucket.today,
      );
      expect(
        bucketFor(DateTime(2026, 8, 23, 8, 59), now: now),
        NotificationBucket.today,
      );
    });

    test('last night is yesterday, not "today, 10 hours ago"', () {
      // A rolling 24-hour window would call 11pm last night "today" all
      // morning, which is not how anybody reads a notification list.
      expect(
        bucketFor(DateTime(2026, 8, 22, 23, 30), now: now),
        NotificationBucket.thisWeek,
      );
    });

    test('the previous six days are This week, and day seven is Earlier', () {
      expect(
        bucketFor(DateTime(2026, 8, 17, 12), now: now),
        NotificationBucket.thisWeek,
      );
      expect(
        bucketFor(DateTime(2026, 8, 16, 23, 59), now: now),
        NotificationBucket.earlier,
      );
    });

    test('a row with no timestamp is treated as brand new', () {
      // Firestore has not resolved the server timestamp yet; the row was
      // written moments ago, so Today is the honest answer.
      expect(bucketFor(null, now: now), NotificationBucket.today);
    });
  });

  group('groupNotifications', () {
    final now = DateTime(2026, 8, 23, 9);

    test('keeps buckets in order and drops the empty ones', () {
      final grouped = groupNotifications([
        at(DateTime(2026, 8, 23, 8), id: 'a'),
        at(DateTime(2026, 8, 1), id: 'b'),
        at(DateTime(2026, 8, 23, 7), id: 'c'),
      ], now: now);

      expect(grouped.keys.toList(), [
        NotificationBucket.today,
        NotificationBucket.earlier,
      ]);
      expect(grouped[NotificationBucket.today]!.map((n) => n.id).toList(), [
        'a',
        'c',
      ]);
    });

    test('an empty feed groups into nothing at all', () {
      expect(groupNotifications(const [], now: now), isEmpty);
    });
  });

  group('NotificationKind.parse', () {
    test('reads the kinds this build knows', () {
      expect(NotificationKind.parse('like'), NotificationKind.like);
      expect(NotificationKind.parse('reply'), NotificationKind.reply);
      expect(NotificationKind.parse('follow'), NotificationKind.follow);
      expect(NotificationKind.parse('mention'), NotificationKind.mention);
      expect(
        NotificationKind.parse('publication'),
        NotificationKind.publication,
      );
    });

    test('the fan-out kinds arrive as themselves, not as announcements', () {
      // These five are the whole point of the fan-out work. Every one of them
      // is snake_case on the wire and camelCase here, so a missing case in
      // `parse` would not fail to compile — it would quietly turn every
      // followed post into a generic megaphone with no post to open.
      expect(NotificationKind.parse('post'), NotificationKind.post);
      expect(
        NotificationKind.parse('thread_reply'),
        NotificationKind.threadReply,
      );
      expect(NotificationKind.parse('milestone'), NotificationKind.milestone);
      expect(
        NotificationKind.parse('reel_comment'),
        NotificationKind.reelComment,
      );
      expect(NotificationKind.parse('welcome'), NotificationKind.welcome);
    });

    test('the camelCase spelling is not the wire value', () {
      // Guards the tempting "just use name" refactor: `threadReply` is what
      // this enum is called, `thread_reply` is what the backend sends.
      expect(
        NotificationKind.parse('threadReply'),
        NotificationKind.announcement,
      );
      expect(
        NotificationKind.parse('reelComment'),
        NotificationKind.announcement,
      );
    });

    test('a kind from a newer backend still shows, rather than vanishing', () {
      // Dropping the row would mean a member silently never learns about
      // something that happened to them.
      expect(
        NotificationKind.parse('a_kind_invented_later'),
        NotificationKind.announcement,
      );
      expect(NotificationKind.parse(null), NotificationKind.announcement);
    });
  });

  group('every kind is drawable', () {
    // The row builds its mark from these two. A kind added to the enum and
    // forgotten in either switch is a compile error in Dart's exhaustive
    // switch, so what these actually pin down is that nothing falls back to a
    // blank icon or a transparent colour at runtime.

    test('each kind names an icon and a brand colour, in both themes', () {
      for (final kind in NotificationKind.values) {
        expect(kind.icon, isNotNull, reason: '$kind has no icon');
        for (final brand in [BrandPalette.light, BrandPalette.dark]) {
          expect(kind.accent(brand).a, greaterThan(0), reason: '$kind is invisible');
        }
      }
    });

    test('a conversation and a thread do not wear the same mark', () {
      // "Somebody replied to you" and "a thread you follow carried on" are
      // different pieces of news, and the icon is the only thing that says so
      // before the title is read.
      expect(
        NotificationKind.reply.icon,
        isNot(NotificationKind.threadReply.icon),
      );
      expect(
        NotificationKind.reelComment.icon,
        isNot(NotificationKind.reply.icon),
      );
    });

    test('a milestone wears the like colour, because that is what it counts', () {
      expect(
        NotificationKind.milestone.accent(BrandPalette.light),
        BrandPalette.light.like,
      );
    });
  });

  group('initials', () {
    IndigenNotification withActor(String name, {String username = ''}) =>
        IndigenNotification(
          id: 'n',
          recipientId: 'amina-uid',
          kind: NotificationKind.follow,
          title: 'followed you',
          actorName: name,
          actorUsername: username,
        );

    test('uses the first letters of the first two names', () {
      expect(withActor('Amina Ayaribisa').initials, 'AA');
    });

    test('falls back to two letters of a single name', () {
      expect(withActor('Nyaaba').initials, 'NY');
    });

    test('falls back to the handle when there is no display name', () {
      expect(withActor('', username: 'nyaaba').initials, 'NY');
    });

    test('never crashes on an empty actor', () {
      expect(withActor('').initials, '·');
    });
  });
}
