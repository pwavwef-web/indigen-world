import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';

/// How one push is drawn in the phone's notification shade.
///
/// ── Why the shade copies the notification centre ─────────────────────────
/// A system-drawn push was a title, a line of text and the app icon, while the
/// same alert inside the app was a row with the person's face, a coloured mark
/// saying what kind of thing happened, the picture it was about, and Like and
/// Reply right there. Somebody looking at their phone's shade got the worse of
/// the two. The shade now draws the row: the actor's avatar wearing the kind
/// badge as the large icon, the picture as the expanded image, the kind as the
/// header's sub-text, and the row's own actions as buttons — Reply with a text
/// box, Like, Mark as read.
///
/// Pure data, so what a payload turns into — which buttons it offers above
/// all — is decided by one function that a test can read without a phone.

/// A button on an alert in the shade.
enum AlertAction {
  reply('reply', 'Reply'),
  like('like', 'Like'),
  read('read', 'Mark as read');

  const AlertAction(this.id, this.label);

  /// What the action handler receives as `actionId`.
  final String id;
  final String label;
}

/// The shade's three sections, which are the app's three channels.
enum AlertGroup {
  community('world.indigen.alerts.community', 'alert', 'alerts'),
  messages('world.indigen.alerts.messages', 'message', 'messages'),
  account('world.indigen.alerts.account', 'update', 'updates');

  const AlertGroup(this.key, this.singular, this.plural);

  /// Android's group key. Alerts sharing one fold under a summary.
  final String key;
  final String singular;
  final String plural;

  /// "3 new messages", for the summary that folds them.
  String countLabel(int count) =>
      '$count new ${count == 1 ? singular : plural}';
}

/// What happened after somebody pressed a button, drawn back onto the alert.
///
/// Android shows a spinner on an alert from the moment a reply is sent until
/// the app posts the alert again, so every outcome — including failure — has
/// to end in a redraw.
enum AlertOutcome {
  none,
  liked,
  replied,

  /// Saved on the phone and sent once it is back online.
  queued,
  failed,
}

/// Kinds whose target is a post that can take a like or a reply. Mirrors the
/// inline actions on the notification centre's rows: a "liked your post"
/// alert is not something to like back.
const _reactableTypes = {'reply', 'quote', 'mention', 'post', 'thread_reply'};

@immutable
class AlertPresentation {
  const AlertPresentation({
    required this.type,
    required this.group,
    required this.title,
    required this.body,
    required this.label,
    required this.badge,
    required this.badgeColor,
    required this.actions,
    required this.previews,
    this.actorName = '',
    this.actorAvatarUrl,
    this.imageUrl,
    this.sentAt,
    this.isTest = false,
  });

  /// The backend's `type`, as sent.
  final String type;
  final AlertGroup group;
  final String title;
  final String body;

  /// The kind, in words: the shade's sub-text beside the app name.
  final String label;

  /// The glyph the avatar's badge wears — an asset under
  /// `assets/notification_badges/`, named for the kind.
  final String badge;
  final Color badgeColor;
  final List<AlertAction> actions;

  /// False when the owner of this phone hid previews on its lock screen.
  final bool previews;
  final String actorName;
  final String? actorAvatarUrl;
  final String? imageUrl;
  final DateTime? sentAt;

  /// A sample drawn from Alert settings, so somebody can see what alerts look
  /// like on their phone. Its buttons answer locally and write nothing.
  final bool isTest;

  bool get isMessage => type == 'message';

  String get badgeAsset => 'assets/notification_badges/$badge.png';

  /// Initials for an actor with no photo, as the in-app avatar draws them.
  String get initials {
    final source = actorName.trim();
    if (source.isEmpty) return '';
    final parts = source.split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }

  /// The buttons left once [outcome] has happened.
  ///
  /// A like cannot be taken back from the shade, so the button that gave it
  /// goes; a community reply is answered, so the alert keeps only the button
  /// that dismisses it. A conversation keeps Reply, because the next message
  /// is the whole point of one.
  List<AlertAction> actionsAfter(AlertOutcome outcome) => switch (outcome) {
    AlertOutcome.liked => [
      for (final action in actions)
        if (action != AlertAction.like) action,
    ],
    AlertOutcome.replied when !isMessage => const [AlertAction.read],
    _ => actions,
  };

  /// The sub-text once [outcome] has happened, so the shade says what the
  /// button did.
  String labelAfter(AlertOutcome outcome) => switch (outcome) {
    AlertOutcome.liked => 'Liked',
    AlertOutcome.replied => 'Reply sent',
    AlertOutcome.queued => 'Sending when you are online',
    AlertOutcome.failed => 'Not sent · tap to open',
    AlertOutcome.none => label,
  };

  /// Reads a push payload. Every value FCM carries is a string, but a payload
  /// replayed from storage or written by a newer backend may not be, so
  /// nothing here assumes a type.
  factory AlertPresentation.fromData(Map<String, dynamic> data) {
    String text(String key) {
      final value = data[key];
      return value is String ? value : '';
    }

    final type = text('type');
    final previews = text('previews') != 'false';
    final isTest = text('test') == 'true';
    final group = switch (type) {
      'message' => AlertGroup.messages,
      'account' || 'order' => AlertGroup.account,
      _ => AlertGroup.community,
    };
    // Version 2 is the payload that names its recipient, which is what lets a
    // button refuse to act for whoever happens to be signed in now.
    final actionable =
        isTest ||
        (text('payloadVersion') == '2' &&
            text('recipientId').isNotEmpty &&
            (type == 'message'
                ? text('threadId').isNotEmpty
                : text('notificationId').isNotEmpty));
    // `account` alerts point at the email-and-push `notifications` collection,
    // which the notification centre does not read and the action callable
    // cannot mark — a Mark as read that could only ever fail is not offered.
    final actions = !actionable || type == 'account'
        ? const <AlertAction>[]
        : type == 'message'
        ? const [AlertAction.reply, AlertAction.read]
        : _reactableTypes.contains(type)
        ? const [AlertAction.reply, AlertAction.like, AlertAction.read]
        : const [AlertAction.read];

    final kind = NotificationKind.parse(type);
    final sentAt = int.tryParse(text('sentAt'));
    return AlertPresentation(
      type: type,
      group: group,
      title: text('title').trim().isEmpty ? 'Indigen World' : text('title'),
      body: text('body'),
      label: _labelFor(type, kind),
      badge: _badgeFor(type, kind),
      badgeColor: _badgeColorFor(type, kind),
      actions: actions,
      previews: previews,
      actorName: previews ? text('actorName') : '',
      actorAvatarUrl: previews && text('actorAvatarUrl').isNotEmpty
          ? text('actorAvatarUrl')
          : null,
      imageUrl: previews && text('imageUrl').isNotEmpty
          ? text('imageUrl')
          : null,
      sentAt: sentAt == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(sentAt),
      isTest: isTest,
    );
  }
}

String _labelFor(String type, NotificationKind kind) => switch (type) {
  'message' => 'Message',
  'order' => 'Order update',
  'account' => 'Your work',
  _ => switch (kind) {
    NotificationKind.like => 'Like',
    NotificationKind.repost => 'Reshare',
    NotificationKind.quote => 'Quote',
    NotificationKind.reply => 'Reply',
    NotificationKind.threadReply => 'In your thread',
    NotificationKind.follow => 'New follower',
    NotificationKind.mention => 'Mention',
    NotificationKind.post => 'New post',
    NotificationKind.milestone => 'Milestone',
    NotificationKind.reelComment => 'Reel comment',
    NotificationKind.welcome => 'Welcome',
    NotificationKind.leaderboard => 'Leaderboard',
    NotificationKind.publication => 'New work',
    NotificationKind.announcement => 'Announcement',
  },
};

/// The badge glyph's asset name. Every value here has a PNG under
/// `assets/notification_badges/`, drawn by
/// `tool/notification_badges/render_badges_test.dart` from [alertBadgeIcons].
String _badgeFor(String type, NotificationKind kind) => switch (type) {
  'message' => 'message',
  'order' => 'order',
  'account' => 'account',
  _ => kind.name,
};

/// The same colours the notification centre's badges wear, from the light
/// palette: the shade is drawn by the system, which has no idea which of the
/// app's themes somebody picked, and these read on a light or a dark shade.
Color _badgeColorFor(String type, NotificationKind kind) => switch (type) {
  'message' => BrandPalette.light.accent,
  'order' || 'account' => BrandPalette.light.success,
  _ => kind.accent(BrandPalette.light),
};

/// Every badge glyph, by asset name. The renderer tool draws one PNG per entry;
/// [_badgeFor] may only ever answer with one of these keys.
final Map<String, IconData> alertBadgeIcons = {
  for (final kind in NotificationKind.values) kind.name: kind.icon,
  'message': Icons.chat_bubble_rounded,
  'order': Icons.shopping_bag_rounded,
  'account': Icons.task_alt_rounded,
};
