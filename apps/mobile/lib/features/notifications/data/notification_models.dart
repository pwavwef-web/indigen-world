import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// What happened. Unknown values from a newer backend fall back to
/// [NotificationKind.announcement] rather than being dropped, so a member never
/// silently misses an alert this build has not learned about yet.
enum NotificationKind {
  like,
  repost,
  quote,
  reply,
  follow,
  mention,
  post,
  publication,
  announcement;

  static NotificationKind parse(Object? raw) => switch (raw) {
    'like' => NotificationKind.like,
    'repost' => NotificationKind.repost,
    'quote' => NotificationKind.quote,
    'reply' => NotificationKind.reply,
    'follow' => NotificationKind.follow,
    'mention' => NotificationKind.mention,
    'post' => NotificationKind.post,
    'publication' => NotificationKind.publication,
    _ => NotificationKind.announcement,
  };

  IconData get icon => switch (this) {
    NotificationKind.like => Icons.favorite_rounded,
    NotificationKind.repost => Icons.repeat_rounded,
    NotificationKind.quote => Icons.format_quote_rounded,
    NotificationKind.reply => Icons.mode_comment_rounded,
    NotificationKind.follow => Icons.person_add_alt_1_rounded,
    NotificationKind.mention => Icons.alternate_email_rounded,
    NotificationKind.post => Icons.auto_stories_rounded,
    NotificationKind.publication => Icons.play_circle_fill_rounded,
    NotificationKind.announcement => Icons.campaign_rounded,
  };

  /// The mark this kind wears, resolved for [brand].
  ///
  /// A notification kind is data, so it has no context to read a palette from;
  /// the row drawing it hands one in.
  Color accent(BrandPalette brand) => switch (this) {
    NotificationKind.like => brand.like,
    NotificationKind.repost => brand.repost,
    NotificationKind.quote => brand.gold,
    NotificationKind.reply => brand.accent,
    NotificationKind.follow => brand.accent,
    NotificationKind.mention => brand.gold,
    NotificationKind.post => brand.accent,
    NotificationKind.publication => brand.gold,
    NotificationKind.announcement => brand.terracotta,
  };
}

/// One row in the notifications centre. Mirrors
/// `communityNotifications/{notificationId}`.
///
/// Everything the row renders is denormalised onto the document by the trigger
/// that created it, so opening the centre is a single indexed query with no
/// per-row profile or post lookups.
@immutable
class IndigenNotification {
  const IndigenNotification({
    required this.id,
    required this.recipientId,
    required this.kind,
    required this.title,
    this.body = '',
    this.actorId,
    this.actorName = '',
    this.actorUsername = '',
    this.actorAvatarUrl,
    this.postId,
    this.postPreview = '',
    this.route,
    this.read = false,
    this.createdAt,
  });

  final String id;
  final String recipientId;
  final NotificationKind kind;

  /// Headline, already written for a human ("Amina liked your post").
  final String title;

  /// Optional second line — the reply text, the announcement body.
  final String body;

  final String? actorId;
  final String actorName;
  final String actorUsername;
  final String? actorAvatarUrl;

  /// The community post this alert points at, when there is one.
  final String? postId;
  final String postPreview;

  /// Optional deep link for kinds that do not open a post.
  final String? route;

  final bool read;
  final DateTime? createdAt;

  String get initials {
    final source = actorName.trim().isNotEmpty
        ? actorName.trim()
        : actorUsername.trim();
    if (source.isEmpty) return '·';
    final parts = source.split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }

  IndigenNotification copyWith({bool? read}) => IndigenNotification(
    id: id,
    recipientId: recipientId,
    kind: kind,
    title: title,
    body: body,
    actorId: actorId,
    actorName: actorName,
    actorUsername: actorUsername,
    actorAvatarUrl: actorAvatarUrl,
    postId: postId,
    postPreview: postPreview,
    route: route,
    read: read ?? this.read,
    createdAt: createdAt,
  );

  static IndigenNotification fromDoc(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? const <String, dynamic>{};
    final actor =
        (data['actor'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    return IndigenNotification(
      id: doc.id,
      recipientId: (data['recipientId'] as String?) ?? '',
      kind: NotificationKind.parse(data['type']),
      title: (data['title'] as String?)?.trim().isNotEmpty ?? false
          ? (data['title'] as String).trim()
          : 'Indigen World',
      body: (data['body'] as String?) ?? '',
      actorId: _nonEmpty(actor['id'] ?? data['actorId']),
      actorName: (actor['displayName'] as String?) ?? '',
      actorUsername: (actor['username'] as String?) ?? '',
      actorAvatarUrl: _nonEmpty(actor['avatarUrl']),
      postId: _nonEmpty(data['postId']),
      postPreview: (data['postPreview'] as String?) ?? '',
      route: _nonEmpty(data['route']),
      read: data['read'] == true,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

String? _nonEmpty(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

/// The three buckets the centre groups rows into.
enum NotificationBucket {
  today('Today'),
  thisWeek('This week'),
  earlier('Earlier');

  const NotificationBucket(this.label);

  final String label;
}

/// Which bucket [createdAt] falls into, measured from [now].
///
/// "Today" is calendar-day based rather than a rolling 24 hours, so an alert
/// from 11pm last night reads as yesterday's the moment the date turns over —
/// which is how people actually think about it.
NotificationBucket bucketFor(DateTime? createdAt, {DateTime? now}) {
  if (createdAt == null) return NotificationBucket.today;
  final reference = now ?? DateTime.now();
  final startOfToday = DateTime(reference.year, reference.month, reference.day);
  if (!createdAt.isBefore(startOfToday)) return NotificationBucket.today;
  if (!createdAt.isBefore(startOfToday.subtract(const Duration(days: 6)))) {
    return NotificationBucket.thisWeek;
  }
  return NotificationBucket.earlier;
}

/// Groups [notifications] into buckets, preserving their incoming order and
/// dropping buckets that ended up empty.
Map<NotificationBucket, List<IndigenNotification>> groupNotifications(
  List<IndigenNotification> notifications, {
  DateTime? now,
}) {
  final grouped = <NotificationBucket, List<IndigenNotification>>{};
  for (final notification in notifications) {
    grouped
        .putIfAbsent(bucketFor(notification.createdAt, now: now), () => [])
        .add(notification);
  }
  return {
    for (final bucket in NotificationBucket.values)
      if (grouped[bucket]?.isNotEmpty ?? false) bucket: grouped[bucket]!,
  };
}
