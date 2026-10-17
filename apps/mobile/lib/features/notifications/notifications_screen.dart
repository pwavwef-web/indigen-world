import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
import 'package:indigen_world_mobile/features/notifications/notification_actions.dart';
import 'package:indigen_world_mobile/features/notifications/notification_settings_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// The notifications centre: everything that happened to you, newest first,
/// grouped into Today / This week / Earlier.
///
/// Rows are written server-side (a like, a reply, a follow, a publication) and
/// can only be marked or removed by their recipient, so nothing on this screen
/// can be forged by a client.
///
/// ── Why the rows are flat ─────────────────────────────────────────────────
/// Each alert used to be a bordered card with a full-width picture and a row
/// of three text buttons under it, which put two notifications on a phone
/// screen. A notifications list is something people skim, so a row is now a
/// line of the inbox: avatar, one sentence, the time, and the picture as a
/// thumbnail at the end. Swipe right to mark read, swipe left to delete, hold
/// for the rest — and Like and Reply stay inline, small, on the alerts whose
/// target can actually take them.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

enum _Filter {
  all('All'),
  unread('Unread'),
  community('Community'),
  orders('Orders'),
  system('System');

  const _Filter(this.label);
  final String label;

  bool matches(IndigenNotification n) => switch (this) {
    _Filter.unread => !n.read,
    _Filter.community => n.postId != null,
    _Filter.orders => _isOrder(n),
    _Filter.system => n.postId == null && !_isOrder(n),
    _Filter.all => true,
  };

  static bool _isOrder(IndigenNotification n) =>
      n.route?.startsWith('/shop/order/') == true;
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  _Filter _filter = _Filter.all;

  @override
  void initState() {
    super.initState();
    unawaited(NotificationActions.retry().catchError((Object _) {}));
  }

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(currentUidProvider);
    final feed = ref
        .watch(notificationFeedProvider)
        .whenData((rows) => rows.where(_filter.matches).toList());
    final unread =
        ref.watch(unreadNotificationCountProvider).asData?.value ?? 0;
    final hasNotifications = feed.value?.isNotEmpty ?? false;

    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        title: const Text('Notifications'),
        bottom: uid == null
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(44),
                child: _FilterBar(
                  selected: _filter,
                  unread: unread,
                  onSelected: (filter) {
                    HapticFeedback.selectionClick();
                    setState(() => _filter = filter);
                  },
                ),
              ),
        actions: [
          if (unread > 0)
            IconButton(
              tooltip: 'Mark all read',
              onPressed: _markAllRead,
              icon: const Icon(Icons.done_all_rounded),
            ),
          if (hasNotifications)
            PopupMenuButton<_NotificationMenuAction>(
              tooltip: 'Notification actions',
              onSelected: (action) {
                if (action == _NotificationMenuAction.clearAll) {
                  _clearAll();
                }
              },
              itemBuilder: (context) => const [
                PopupMenuItem(
                  value: _NotificationMenuAction.clearAll,
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.delete_sweep_outlined),
                    title: Text('Clear notifications'),
                  ),
                ),
              ],
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
                AsyncValue(:final value?) when value.isEmpty => _EmptyState(
                  filtered: _filter != _Filter.all,
                  onShowAll: () => setState(() => _filter = _Filter.all),
                ),
                AsyncValue(:final value?) => _NotificationList(
                  notifications: {for (final item in value) item.id: item}
                      .values
                      .toList(),
                  onLoadMore:
                      value.length >= ref.watch(notificationWindowProvider)
                      ? () =>
                            ref.read(notificationWindowProvider.notifier).grow()
                      : null,
                  onOpen: _open,
                  onDelete: _deleteOne,
                  onMarkRead: (n) => _markRead(n.id),
                  onMore: _rowMenu,
                ),
                AsyncValue(hasError: true) => _ErrorState(
                  onRetry: () => ref.invalidate(notificationFeedProvider),
                ),
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

  /// Asked before deleting, whichever way it was asked for — a swipe is easy
  /// to make by accident and there is no getting a deleted alert back.
  Future<bool> _deleteOne(IndigenNotification notification) async {
    final repository = ref.read(notificationsRepositoryProvider);
    if (repository == null) return false;
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Delete this notification?',
      message: 'It will be removed from your notification history.',
      confirmLabel: 'Delete',
      isDestructive: true,
    );
    if (confirmed != true) return false;
    try {
      await repository.deleteNotification(notification.id);
      return true;
    } on Object {
      if (mounted) {
        showCommunityMessage(context, 'Could not delete it. Try again.');
      }
      return false;
    }
  }

  Future<void> _clearAll() async {
    final uid = ref.read(currentUidProvider);
    final repository = ref.read(notificationsRepositoryProvider);
    if (uid == null || repository == null) return;
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Clear all notifications?',
      message: 'Your notification history will be permanently removed.',
      confirmLabel: 'Clear all',
      isDestructive: true,
    );
    if (confirmed != true) return;
    try {
      await repository.clearAll(uid);
    } on Object {
      if (mounted) {
        showCommunityMessage(
          context,
          'Could not clear notifications. Try again.',
        );
      }
    }
  }

  Future<void> _open(IndigenNotification notification) async {
    // Navigation stays responsive while the live backend read state updates.
    if (!notification.read) {
      unawaited(_markRead(notification.id));
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

    final route = notificationDestination(notification);
    if (route != null) {
      if (context.mounted) await context.push(route);
      return;
    }
    final actorId = notification.actorId;
    if (actorId != null) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: actorId),
        ),
      );
    } else if (mounted) {
      showCommunityMessage(
        context,
        'This notification no longer has an available destination.',
      );
    }
  }

  Future<void> _markRead(String id) async {
    try {
      await ref.read(notificationsRepositoryProvider)?.markRead(id);
    } on Object {
      if (mounted) {
        showCommunityMessage(
          context,
          'Could not mark this alert read. Try opening it again.',
        );
      }
    }
  }

  Future<void> _rowMenu(IndigenNotification notification) async {
    HapticFeedback.mediumImpact();
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: context.brand.surface,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.open_in_new_rounded),
              title: const Text('Open'),
              onTap: () => Navigator.pop(sheet, 'open'),
            ),
            if (!notification.read)
              ListTile(
                leading: const Icon(Icons.mark_email_read_outlined),
                title: const Text('Mark as read'),
                onTap: () => Navigator.pop(sheet, 'read'),
              ),
            ListTile(
              leading: const Icon(Icons.tune_rounded),
              title: const Text('Alert settings'),
              onTap: () => Navigator.pop(sheet, 'settings'),
            ),
            ListTile(
              leading: Icon(
                Icons.delete_outline_rounded,
                color: context.brand.danger,
              ),
              title: Text(
                'Delete',
                style: TextStyle(color: context.brand.danger),
              ),
              onTap: () => Navigator.pop(sheet, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (choice) {
      case 'open':
        await _open(notification);
      case 'read':
        await _markRead(notification.id);
      case 'settings':
        _openAlertSettings();
      case 'delete':
        await _deleteOne(notification);
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

// ── Filters ─────────────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.selected,
    required this.unread,
    required this.onSelected,
  });

  final _Filter selected;
  final int unread;
  final ValueChanged<_Filter> onSelected;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
        children: [
          for (final filter in _Filter.values)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: Semantics(
                button: true,
                selected: filter == selected,
                child: Material(
                  color: filter == selected ? brand.ink : brand.surfaceMuted,
                  shape: const StadiumBorder(),
                  child: InkWell(
                    customBorder: const StadiumBorder(),
                    onTap: () => onSelected(filter),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Center(
                        child: Text(
                          filter == _Filter.unread && unread > 0
                              ? '${filter.label} · $unread'
                              : filter.label,
                          style: TextStyle(
                            color: filter == selected
                                ? brand.background
                                : brand.ink,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── List ────────────────────────────────────────────────────────────────────

enum _NotificationMenuAction { clearAll }

class _NotificationList extends StatelessWidget {
  const _NotificationList({
    required this.notifications,
    required this.onOpen,
    required this.onDelete,
    required this.onMarkRead,
    required this.onMore,
    this.onLoadMore,
  });

  final List<IndigenNotification> notifications;
  final VoidCallback? onLoadMore;
  final ValueChanged<IndigenNotification> onOpen;
  final Future<bool> Function(IndigenNotification) onDelete;
  final ValueChanged<IndigenNotification> onMarkRead;
  final ValueChanged<IndigenNotification> onMore;

  @override
  Widget build(BuildContext context) {
    final grouped = groupNotifications(notifications);
    final rows = <Widget>[
      for (final entry in grouped.entries) ...[
        _BucketHeading(label: entry.key.label),
        for (final notification in entry.value)
          _NotificationRow(
            key: ValueKey(notification.id),
            notification: notification,
            onTap: () => onOpen(notification),
            onDelete: () => onDelete(notification),
            onMarkRead: () => onMarkRead(notification),
            onMore: () => onMore(notification),
          ),
      ],
      if (onLoadMore != null)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: TextButton.icon(
            onPressed: onLoadMore,
            icon: const Icon(Icons.expand_more_rounded),
            label: const Text('Older notifications'),
          ),
        ),
    ];
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 32),
      itemCount: rows.length,
      itemBuilder: (_, index) => rows[index],
    );
  }
}

class _BucketHeading extends StatelessWidget {
  const _BucketHeading({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
    header: true,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Text(
        label,
        style: TextStyle(
          color: context.brand.ink,
          fontSize: 13.5,
          fontWeight: FontWeight.w900,
        ),
      ),
    ),
  );
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({
    required this.notification,
    required this.onTap,
    required this.onDelete,
    required this.onMarkRead,
    required this.onMore,
    super.key,
  });

  final IndigenNotification notification;
  final VoidCallback onTap;
  final Future<bool> Function() onDelete;
  final VoidCallback onMarkRead;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final unread = !notification.read;
    final accent = notification.kind.accent(brand);
    final body = notification.body.trim();
    final preview = notification.postPreview.trim();
    // Non-breaking, so "3 D" never splits across lines.
    final age = communityAgeLabel(notification.createdAt).replaceAll(' ', ' ');

    final row = Material(
      color: unread
          ? Color.alphaBlend(
              brand.accent.withValues(alpha: brand.isDark ? 0.12 : 0.06),
              brand.background,
            )
          : brand.background,
      child: InkWell(
        onTap: onTap,
        onLongPress: onMore,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ActorMark(notification: notification, accent: accent),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: notification.title),
                          if (age.isNotEmpty)
                            TextSpan(
                              text: '  $age',
                              style: TextStyle(
                                color: brand.mutedInk,
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                        ],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.3,
                        fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                        color: brand.ink,
                      ),
                    ),
                    if (body.isNotEmpty || preview.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          body.isNotEmpty ? body : '“$preview”',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: brand.mutedInk,
                            fontSize: 13,
                            height: 1.3,
                            fontStyle: body.isEmpty
                                ? FontStyle.italic
                                : FontStyle.normal,
                          ),
                        ),
                      ),
                    _InlineActions(notification: notification, onReply: onTap),
                  ],
                ),
              ),
              if (notification.imageUrl != null) ...[
                const SizedBox(width: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: CachedNetworkImage(
                    imageUrl: notification.imageUrl!,
                    memCacheWidth: 160,
                    width: 46,
                    height: 46,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => ColoredBox(
                      color: brand.surfaceMuted,
                      child: const SizedBox(width: 46, height: 46),
                    ),
                    errorWidget: (_, _, _) => const SizedBox.shrink(),
                  ),
                ),
              ],
              SizedBox(
                width: 14,
                child: unread
                    ? Padding(
                        padding: const EdgeInsets.only(top: 6, left: 6),
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: brand.accent,
                            shape: BoxShape.circle,
                          ),
                          child: const SizedBox(width: 8, height: 8),
                        ),
                      )
                    : null,
              ),
            ],
          ),
        ),
      ),
    );

    return Semantics(
      button: true,
      label: [
        if (unread) 'Unread',
        notification.title,
        if (body.isNotEmpty) body,
        if (age.isNotEmpty) age,
      ].join('. '),
      customSemanticsActions: {
        if (unread)
          const CustomSemanticsAction(label: 'Mark as read'): onMarkRead,
        const CustomSemanticsAction(label: 'Delete'): () => onDelete(),
        const CustomSemanticsAction(label: 'More options'): onMore,
      },
      child: Dismissible(
        key: ValueKey('dismiss-${notification.id}'),
        direction: unread
            ? DismissDirection.horizontal
            : DismissDirection.endToStart,
        // Neither swipe removes the row by itself. Mark-read leaves it in
        // place with its dot gone; delete waits for the confirmation and then
        // for the live list to drop it.
        confirmDismiss: (direction) async {
          if (direction == DismissDirection.startToEnd) {
            HapticFeedback.selectionClick();
            onMarkRead();
            return false;
          }
          await onDelete();
          return false;
        },
        background: _SwipeBackground(
          color: brand.accent,
          icon: Icons.mark_email_read_outlined,
          label: 'Read',
          alignment: Alignment.centerLeft,
        ),
        secondaryBackground: _SwipeBackground(
          color: brand.danger,
          icon: Icons.delete_outline_rounded,
          label: 'Delete',
          alignment: Alignment.centerRight,
        ),
        child: row,
      ),
    );
  }
}

class _SwipeBackground extends StatelessWidget {
  const _SwipeBackground({
    required this.color,
    required this.icon,
    required this.label,
    required this.alignment,
  });

  final Color color;
  final IconData icon;
  final String label;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: color,
    child: Align(
      alignment: alignment,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 22),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Like and Reply, only on alerts whose target is a post that can take them.
///
/// Liking *sets* the reaction rather than toggling it, so a second tap — or a
/// tap here after the same Like from the push — never undoes the first.
class _InlineActions extends StatefulWidget {
  const _InlineActions({required this.notification, required this.onReply});
  final IndigenNotification notification;
  final VoidCallback onReply;
  @override
  State<_InlineActions> createState() => _InlineActionsState();
}

class _InlineActionsState extends State<_InlineActions> {
  bool _busy = false, _liked = false, _failed = false;

  static const _reactable = {
    NotificationKind.reply,
    NotificationKind.quote,
    NotificationKind.mention,
    NotificationKind.post,
    NotificationKind.threadReply,
  };

  Future<void> _like() async {
    if (_busy || _liked) return;
    HapticFeedback.lightImpact();
    setState(() {
      _busy = true;
      _failed = false;
      _liked = true;
    });
    try {
      await NotificationActions.send(
        NotificationActions.request(
          recipientId: widget.notification.recipientId,
          notificationId: widget.notification.id,
          action: 'like',
        ),
      );
    } on Object {
      if (mounted) {
        setState(() {
          _liked = false;
          _failed = true;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.notification;
    // A "liked your post" alert is not something to like back.
    if (n.postId == null || !_reactable.contains(n.kind)) {
      return const SizedBox.shrink();
    }
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          _MiniAction(
            icon: _liked
                ? Icons.favorite_rounded
                : Icons.favorite_border_rounded,
            label: _liked ? 'Liked' : 'Like',
            color: _liked ? brand.like : brand.mutedInk,
            onTap: _like,
          ),
          const SizedBox(width: 4),
          _MiniAction(
            icon: Icons.reply_rounded,
            label: 'Reply',
            color: brand.mutedInk,
            onTap: widget.onReply,
          ),
          if (_failed)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Text(
                'Not sent. Try again.',
                style: TextStyle(color: brand.danger, fontSize: 11.5),
              ),
            ),
        ],
      ),
    );
  }
}

class _MiniAction extends StatelessWidget {
  const _MiniAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(99),
    child: ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 32, minWidth: 48),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// The avatar plus the little kind badge that tells you *why* this arrived.
class _ActorMark extends StatelessWidget {
  const _ActorMark({required this.notification, required this.accent});

  final IndigenNotification notification;
  final Color accent;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 40,
    height: 40,
    child: Stack(
      clipBehavior: Clip.none,
      children: [
        // Alerts nobody in particular sent (an order update, an
        // announcement) wear the Indigen mark rather than an empty avatar.
        if (notification.actorName.trim().isEmpty &&
            notification.actorUsername.trim().isEmpty &&
            notification.actorAvatarUrl == null)
          Container(
            width: 40,
            height: 40,
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: context.brand.surface,
              shape: BoxShape.circle,
              border: Border.all(color: context.brand.border),
            ),
            child: Image.asset(
              'assets/brand/indigen-world-mark.png',
              excludeFromSemantics: true,
            ),
          )
        else
          CommunityAvatar(
            initials: notification.initials,
            imageUrl: notification.actorAvatarUrl,
            username: notification.actorUsername,
            size: 40,
          ),
        Positioned(
          right: -3,
          bottom: -3,
          child: Container(
            width: 19,
            height: 19,
            decoration: BoxDecoration(
              color: accent,
              shape: BoxShape.circle,
              border: Border.all(color: context.brand.background, width: 2),
            ),
            child: Icon(notification.kind.icon, size: 10, color: Colors.white),
          ),
        ),
      ],
    ),
  );
}

// ── States ──────────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.filtered, required this.onShowAll});

  final bool filtered;
  final VoidCallback onShowAll;

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [
      const SizedBox(height: 40),
      CommunityEmptyState(
        icon: Icons.notifications_none_rounded,
        title: filtered ? 'Nothing here' : 'Nothing yet',
        message: filtered
            ? 'No notifications match this filter.'
            : 'When somebody likes your Kasem, replies to you, follows you or '
                  'publishes a new reel, it lands here.',
        action: filtered
            ? OutlinedButton(
                onPressed: onShowAll,
                child: const Text('Show all'),
              )
            : null,
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
  const _ErrorState({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [
      const SizedBox(height: 40),
      CommunityEmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Alerts could not load',
        message: 'Check your connection and try again.',
        action: OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: const Text('Retry'),
        ),
      ),
    ],
  );
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) {
    final muted = context.brand.surfaceMuted;
    Widget bar(double width) => Container(
      height: 10,
      width: width,
      decoration: BoxDecoration(
        color: muted,
        borderRadius: BorderRadius.circular(99),
      ),
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
      children: [
        for (var index = 0; index < 8; index++)
          Padding(
            padding: const EdgeInsets.only(bottom: 18),
            child: Row(
              children: [
                CircleAvatar(radius: 20, backgroundColor: muted),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      bar(index.isEven ? 210 : 160),
                      const SizedBox(height: 8),
                      bar(110),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Accept only destinations implemented by this router, never arbitrary URLs.
String? notificationDestination(IndigenNotification notification) {
  final route = notification.route;
  if (route == null || route == '/notifications') return null;
  final uri = Uri.tryParse(route);
  if (uri == null ||
      uri.hasScheme ||
      uri.hasAuthority ||
      uri.fragment.isNotEmpty) {
    return null;
  }
  final path = uri.path;
  if (const {
    '/',
    '/contribute',
    '/ads',
    '/communities',
    '/messages',
    '/kawuri',
    '/kawuri/creations',
    '/subscribe',
    '/subscription',
    '/downloads',
    '/music',
    '/audiobooks',
    '/shop',
  }.contains(path)) {
    return route;
  }
  if (RegExp(r'^/(post|communities|chat|entry)/[^/]+$').hasMatch(path) ||
      RegExp(r'^/kawuri/creations/[^/]+$').hasMatch(path) ||
      // Order alerts are written by the shop backend with exactly this shape.
      RegExp(r'^/shop/(order|product|category)/[^/]+$').hasMatch(path)) {
    return route;
  }
  return null;
}
