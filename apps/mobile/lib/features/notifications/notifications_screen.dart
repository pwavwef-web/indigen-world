import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/notification_settings_screen.dart';

/// The notifications centre: everything that happened to you, newest first,
/// grouped into Today / This week / Earlier.
///
/// Rows are written server-side (a like, a reply, a follow, a publication) and
/// are read-only here apart from the `read` flag, so nothing on this screen can
/// be forged by a client.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(currentUidProvider);
    final feed = ref.watch(notificationFeedProvider);
    final unread =
        ref.watch(unreadNotificationCountProvider).asData?.value ?? 0;

    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton.icon(
              onPressed: _markAllRead,
              icon: const Icon(Icons.done_all_rounded, size: 19),
              label: const Text('Mark all read'),
            ),
          IconButton(
            tooltip: 'Alert settings',
            onPressed: _openAlertSettings,
            icon: const Icon(Icons.tune_rounded),
          ),
        ],
      ),
      body: uid == null
          ? _GuestState(onSignIn: () => showSignInSheet(context))
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(notificationFeedProvider),
              child: switch (feed) {
                AsyncValue(:final value?) when value.isEmpty =>
                  const _EmptyState(),
                AsyncValue(:final value?) => _NotificationList(
                  notifications: value,
                  onOpen: _open,
                ),
                AsyncValue(hasError: true) => const _ErrorState(),
                _ => const _LoadingState(),
              },
            ),
    );
  }

  Future<void> _markAllRead() async {
    final uid = ref.read(currentUidProvider);
    final repository = ref.read(notificationsRepositoryProvider);
    if (uid == null || repository == null) return;
    HapticFeedback.selectionClick();
    try {
      await repository.markAllRead(uid);
    } on Object {
      if (mounted) {
        showCommunityMessage(context, 'Could not update. Try again.');
      }
    }
  }

  Future<void> _open(IndigenNotification notification) async {
    final repository = ref.read(notificationsRepositoryProvider);
    // Not awaited: the row is already visually read, so blocking navigation on
    // a write that cannot fail visibly would only add latency.
    if (!notification.read) {
      unawaited(repository?.markRead(notification.id) ?? Future<void>.value());
    }

    final postId = notification.postId;
    if (postId != null) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => PostDetailScreen(postId: postId),
        ),
      );
      return;
    }

    final actorId = notification.actorId;
    if (actorId != null) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: actorId),
        ),
      );
    }
  }

  /// ── Why this stopped being a popup ──────────────────────────────────────
  /// It used to be a two-button sheet that could only answer one question — is
  /// push on — which is rarely the question somebody has when they reach for
  /// this control from the notifications list. They are here because one *kind*
  /// of alert is too much, and the sheet's only offer was all of them or none.
  /// The page it opens instead holds both axes, and turning the whole lot off
  /// is still one row at the top of it.
  void _openAlertSettings() => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) => const NotificationSettingsScreen(),
    ),
  );
}

// ── List ────────────────────────────────────────────────────────────────────

class _NotificationList extends StatelessWidget {
  const _NotificationList({required this.notifications, required this.onOpen});

  final List<IndigenNotification> notifications;
  final ValueChanged<IndigenNotification> onOpen;

  @override
  Widget build(BuildContext context) {
    final grouped = groupNotifications(notifications);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        for (final entry in grouped.entries) ...[
          _BucketHeading(label: entry.key.label, count: entry.value.length),
          for (final notification in entry.value) ...[
            _NotificationRow(
              notification: notification,
              onTap: () => onOpen(notification),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _BucketHeading extends StatelessWidget {
  const _BucketHeading({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 12, 4, 10),
    child: Row(
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            color: context.brand.terracotta,
            fontSize: 10.5,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.3,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '$count',
          style: TextStyle(
            color: context.brand.mutedInk,
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(child: Divider(color: context.brand.divider, height: 1)),
      ],
    ),
  );
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.notification, required this.onTap});

  final IndigenNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final unread = !notification.read;
    final accent = notification.kind.accent(context.brand);

    return Semantics(
      button: true,
      label: unread
          ? 'Unread. ${notification.title}. ${notification.body}'
          : '${notification.title}. ${notification.body}',
      excludeSemantics: true,
      child: Material(
        color: unread ? context.brand.surface : context.brand.surfaceMuted,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: unread
                    ? accent.withValues(alpha: 0.34)
                    : context.brand.divider,
              ),
              gradient: unread
                  ? LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [
                        accent.withValues(alpha: 0.07),
                        Colors.transparent,
                      ],
                    )
                  : null,
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(13, 13, 13, 13),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ActorMark(notification: notification, accent: accent),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          notification.title,
                          style: TextStyle(
                            fontSize: 14.5,
                            height: 1.3,
                            fontWeight: unread
                                ? FontWeight.w800
                                : FontWeight.w600,
                            color: context.brand.ink,
                          ),
                        ),
                        if (notification.body.trim().isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            notification.body.trim(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: context.brand.mutedInk,
                              fontSize: 13,
                              height: 1.35,
                            ),
                          ),
                        ],
                        if (notification.postPreview.trim().isNotEmpty) ...[
                          const SizedBox(height: 8),
                          _PostPreview(text: notification.postPreview.trim()),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        communityAgeLabel(notification.createdAt),
                        style: TextStyle(
                          color: context.brand.mutedInk,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.4,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (unread)
                        DecoratedBox(
                          decoration: BoxDecoration(
                            color: accent,
                            shape: BoxShape.circle,
                          ),
                          child: const SizedBox(width: 8, height: 8),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The avatar plus the little kind badge that tells you *why* this arrived.
class _ActorMark extends StatelessWidget {
  const _ActorMark({required this.notification, required this.accent});

  final IndigenNotification notification;
  final Color accent;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 46,
    height: 46,
    child: Stack(
      clipBehavior: Clip.none,
      children: [
        CommunityAvatar(
          initials: notification.initials,
          imageUrl: notification.actorAvatarUrl,
          username: notification.actorUsername,
          size: 44,
        ),
        Positioned(
          right: -2,
          bottom: -2,
          child: Container(
            width: 21,
            height: 21,
            decoration: BoxDecoration(
              color: accent,
              shape: BoxShape.circle,
              border: Border.all(color: context.brand.background, width: 2),
            ),
            child: Icon(notification.kind.icon, size: 11, color: Colors.white),
          ),
        ),
      ],
    ),
  );
}

class _PostPreview extends StatelessWidget {
  const _PostPreview({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(11, 9, 11, 9),
    decoration: BoxDecoration(
      color: context.brand.background.withValues(alpha: 0.8),
      borderRadius: BorderRadius.circular(12),
      border: Border(left: BorderSide(color: context.brand.gold, width: 2.5)),
    ),
    child: Text(
      text,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: context.brand.ink,
        fontSize: 12.5,
        height: 1.35,
        fontStyle: FontStyle.italic,
      ),
    ),
  );
}

// ── States ──────────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: const [
      SizedBox(height: 40),
      CommunityEmptyState(
        icon: Icons.notifications_none_rounded,
        title: 'Nothing yet',
        message:
            'When somebody likes your Kasem, replies to you, follows you or '
            'publishes a new reel, it lands here.',
      ),
    ],
  );
}

class _GuestState extends StatelessWidget {
  const _GuestState({required this.onSignIn});

  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [
      const SizedBox(height: 40),
      CommunityEmptyState(
        icon: Icons.notifications_active_outlined,
        title: 'Sign in for your alerts',
        message:
            'Notifications belong to an account, so they travel with you to '
            'any device you sign in on.',
        action: FilledButton.icon(
          onPressed: onSignIn,
          icon: const Icon(Icons.login_rounded),
          label: const Text('Sign in'),
        ),
      ),
    ],
  );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState();

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: const [
      SizedBox(height: 40),
      CommunityEmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Alerts could not load',
        message: 'Check your connection and pull down to try again.',
      ),
    ],
  );
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
    children: [
      for (var index = 0; index < 5; index++) ...[
        Container(
          height: 78,
          decoration: BoxDecoration(
            color: context.brand.surfaceMuted,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: context.brand.border),
          ),
        ),
        const SizedBox(height: 10),
      ],
    ],
  );
}
