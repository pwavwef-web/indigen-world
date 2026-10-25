import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/notifications/alert_presentation.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';

/// What a push payload turns into in the phone's notification shade — above
/// all, which buttons it offers. A button offered on an alert that cannot take
/// it fails in front of the member; one missing is the feature not shipped.
void main() {
  Map<String, dynamic> community(String type, {Map<String, dynamic>? extra}) =>
      {
        'type': type,
        'payloadVersion': '2',
        'recipientId': 'me',
        'notificationId': 'n1',
        'title': 'Amina replied to you',
        'body': 'Lovely!',
        'actorName': 'Amina Ayaribisa',
        'actorAvatarUrl': 'https://lh3.googleusercontent.com/a/amina',
        'imageUrl':
            'https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg?alt=media',
        'previews': 'true',
        'sentAt': '1700000000000',
        ...?extra,
      };

  group('buttons', () {
    test('alerts about a post you can answer offer Reply, Like and Mark as '
        'read, as the centre row does', () {
      for (final type in [
        'reply',
        'quote',
        'mention',
        'post',
        'thread_reply',
      ]) {
        expect(AlertPresentation.fromData(community(type)).actions, [
          AlertAction.reply,
          AlertAction.like,
          AlertAction.read,
        ], reason: type);
      }
    });

    test('a "liked your post" alert is not something to like back', () {
      expect(AlertPresentation.fromData(community('like')).actions, [
        AlertAction.read,
      ]);
      for (final type in ['follow', 'repost', 'milestone', 'publication']) {
        expect(AlertPresentation.fromData(community(type)).actions, [
          AlertAction.read,
        ], reason: type);
      }
    });

    test('a message offers Reply and Mark as read', () {
      final alert = AlertPresentation.fromData({
        'type': 'message',
        'payloadVersion': '2',
        'recipientId': 'me',
        'threadId': 'a_me',
        'senderId': 'a',
        'title': 'Amina',
        'body': 'Are you coming?',
      });
      expect(alert.actions, [AlertAction.reply, AlertAction.read]);
      expect(alert.group, AlertGroup.messages);
      expect(alert.isMessage, isTrue);
    });

    test('a payload that does not name its recipient offers no buttons', () {
      // Older backends sent these. A button that cannot check which account it
      // is acting for must not exist.
      final legacy = community('reply')..remove('payloadVersion');
      expect(AlertPresentation.fromData(legacy).actions, isEmpty);
      final anonymous = community('reply')..remove('recipientId');
      expect(AlertPresentation.fromData(anonymous).actions, isEmpty);
      final noRow = community('reply')..remove('notificationId');
      expect(AlertPresentation.fromData(noRow).actions, isEmpty);
    });

    test('an account update offers no Mark as read it could never deliver', () {
      final alert = AlertPresentation.fromData(community('account'));
      expect(alert.actions, isEmpty);
      expect(alert.group, AlertGroup.account);
    });

    test('a like takes its own button away; a reply leaves only dismissal', () {
      final alert = AlertPresentation.fromData(community('reply'));
      expect(alert.actionsAfter(AlertOutcome.liked), [
        AlertAction.reply,
        AlertAction.read,
      ]);
      expect(alert.actionsAfter(AlertOutcome.replied), [AlertAction.read]);
      expect(alert.actionsAfter(AlertOutcome.failed), alert.actions);
    });

    test('a conversation keeps Reply after replying', () {
      final message = AlertPresentation.fromData({
        'type': 'message',
        'payloadVersion': '2',
        'recipientId': 'me',
        'threadId': 't',
        'title': 'Amina',
      });
      expect(message.actionsAfter(AlertOutcome.replied), message.actions);
    });
  });

  group('what the alert shows', () {
    test('the kind, the face, the picture and the time come from the '
        'payload', () {
      final alert = AlertPresentation.fromData(community('mention'));
      expect(alert.label, 'Mention');
      expect(alert.actorName, 'Amina Ayaribisa');
      expect(alert.initials, 'AA');
      expect(alert.actorAvatarUrl, contains('googleusercontent'));
      expect(alert.imageUrl, contains('firebasestorage'));
      expect(alert.sentAt, DateTime.fromMillisecondsSinceEpoch(1700000000000));
      expect(alert.badge, 'mention');
      expect(
        alert.badgeColor,
        NotificationKind.mention.accent(BrandPalette.light),
      );
    });

    test('hidden previews hide the face and the picture too', () {
      final alert = AlertPresentation.fromData(
        community('reply', extra: {'previews': 'false'}),
      );
      expect(alert.previews, isFalse);
      expect(alert.actorName, isEmpty);
      expect(alert.actorAvatarUrl, isNull);
      expect(alert.imageUrl, isNull);
    });

    test('the sub-text says what a button did', () {
      final alert = AlertPresentation.fromData(community('reply'));
      expect(alert.labelAfter(AlertOutcome.none), 'Reply');
      expect(alert.labelAfter(AlertOutcome.liked), 'Liked');
      expect(alert.labelAfter(AlertOutcome.replied), 'Reply sent');
      expect(alert.labelAfter(AlertOutcome.queued), contains('online'));
      expect(alert.labelAfter(AlertOutcome.failed), contains('Not sent'));
    });

    test('a payload of the wrong types still draws, with no buttons', () {
      final alert = AlertPresentation.fromData({
        'type': 7,
        'title': null,
        'payloadVersion': 2,
        'sentAt': 'yesterday',
      });
      expect(alert.title, 'Indigen World');
      expect(alert.actions, isEmpty);
      expect(alert.sentAt, isNull);
      expect(alert.group, AlertGroup.community);
    });

    test('summaries count in words', () {
      expect(AlertGroup.community.countLabel(1), '1 new alert');
      expect(AlertGroup.messages.countLabel(3), '3 new messages');
    });
  });

  test('every kind the app knows has a badge glyph shipped with it', () {
    // The background isolate cannot paint an Icon, so a kind with no PNG would
    // wear a blank badge. tool/notification_badges draws them.
    final types = [
      for (final kind in NotificationKind.values)
        switch (kind) {
          NotificationKind.threadReply => 'thread_reply',
          NotificationKind.reelComment => 'reel_comment',
          _ => kind.name,
        },
      'message',
      'order',
      'account',
    ];
    for (final type in types) {
      final alert = AlertPresentation.fromData({'type': type});
      expect(alertBadgeIcons.containsKey(alert.badge), isTrue, reason: type);
      expect(File(alert.badgeAsset).existsSync(), isTrue, reason: type);
    }
  });
}
