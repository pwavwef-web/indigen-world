import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/data/notifications_repository.dart';
import 'package:indigen_world_mobile/features/notifications/notifications_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  IndigenNotification notification({
    required String id,
    NotificationKind kind = NotificationKind.like,
    String title = 'Amina liked your post',
    String body = '',
    String postPreview = '',
    bool read = false,
    DateTime? createdAt,
  }) => IndigenNotification(
    id: id,
    recipientId: 'me-uid',
    kind: kind,
    title: title,
    body: body,
    actorId: 'amina-uid',
    actorName: 'Amina Ayaribisa',
    actorUsername: 'amina_paga',
    postId: 'post1',
    postPreview: postPreview,
    read: read,
    createdAt: createdAt ?? DateTime.now(),
  );

  Future<void> pump(
    WidgetTester tester, {
    String? uid = 'me-uid',
    List<IndigenNotification> feed = const [],
    int unread = 0,
    NotificationsRepository? repository,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUidProvider.overrideWithValue(uid),
          if (repository != null)
            notificationsRepositoryProvider.overrideWithValue(repository),
          notificationFeedProvider.overrideWith((ref) => Stream.value(feed)),
          unreadNotificationCountProvider.overrideWith(
            (ref) => Stream.value(unread),
          ),
        ],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,

          theme: buildIndigenTheme(),
          home: const NotificationsScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  test(
    'notification routes retain supported targets and reject foreign links',
    () {
      IndigenNotification target(String route) => IndigenNotification(
        id: 'route',
        recipientId: 'me',
        kind: NotificationKind.announcement,
        title: 'Update',
        route: route,
      );
      expect(
        notificationDestination(target('/communities/kasem-circle')),
        '/communities/kasem-circle',
      );
      expect(
        notificationDestination(target('/post/reply?focus=reply')),
        '/post/reply?focus=reply',
      );
      expect(notificationDestination(target('https://unknown.test')), isNull);
      expect(notificationDestination(target('//unknown.test/post/x')), isNull);
      expect(notificationDestination(target('/notifications')), isNull);
      expect(notificationDestination(target('/missing-destination')), isNull);
    },
  );

  testWidgets('duplicate notification ids render only once', (tester) async {
    await pump(
      tester,
      feed: [
        notification(id: 'same'),
        notification(id: 'same'),
      ],
    );
    expect(
      find.textContaining('Amina liked your post', findRichText: true),
      findsOneWidget,
    );
  });

  testWidgets('groups rows under the day they happened', (tester) async {
    final now = DateTime.now();
    await pump(
      tester,
      unread: 2,
      feed: [
        notification(id: 'a', createdAt: now),
        notification(
          id: 'b',
          kind: NotificationKind.reply,
          title: 'Nyaaba replied to you',
          body: 'Ko gara.',
          createdAt: now.subtract(const Duration(days: 3)),
        ),
        notification(
          id: 'c',
          kind: NotificationKind.follow,
          title: 'Someone followed you',
          createdAt: now.subtract(const Duration(days: 40)),
        ),
      ],
    );

    expect(find.text('Today'), findsOneWidget);
    expect(find.text('This week'), findsOneWidget);
    expect(find.text('Earlier'), findsOneWidget);
    expect(
      find.textContaining('Amina liked your post', findRichText: true),
      findsOneWidget,
    );
    expect(
      find.textContaining('Nyaaba replied to you', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('Ko gara.'), findsOneWidget);
  });

  testWidgets('offers to mark everything read while something is unread', (
    tester,
  ) async {
    await pump(tester, feed: [notification(id: 'a')], unread: 1);

    expect(find.byTooltip('Mark all read'), findsOneWidget);
    // Rows are swiped (right to mark read, left to delete) rather than
    // carrying a delete button each.
    expect(find.byType(Dismissible), findsOneWidget);
  });

  testWidgets('offers to clear the whole notification history', (tester) async {
    await pump(tester, feed: [notification(id: 'a', read: true)]);

    await tester.tap(find.byTooltip('Notification actions'));
    await tester.pumpAndSettle();

    expect(find.text('Clear notifications'), findsOneWidget);
  });

  testWidgets('hides the mark-all action once nothing is unread', (
    tester,
  ) async {
    await pump(tester, feed: [notification(id: 'a', read: true)]);

    expect(find.byTooltip('Mark all read'), findsNothing);
  });

  testWidgets('quotes the post a row is about', (tester) async {
    await pump(
      tester,
      feed: [notification(id: 'a', postPreview: 'De zaanem. Ko gara.')],
    );

    expect(find.textContaining('De zaanem. Ko gara.'), findsOneWidget);
  });

  testWidgets('only alerts about something you can react to offer Like', (
    tester,
  ) async {
    await pump(
      tester,
      feed: [
        notification(id: 'liked'),
        notification(
          id: 'reply',
          kind: NotificationKind.reply,
          title: 'Nyaaba replied to you',
        ),
      ],
    );

    // A "liked your post" alert has nothing to like back; the reply does.
    expect(find.text('Like'), findsOneWidget);
    expect(find.text('Reply'), findsOneWidget);
  });

  test('order alerts open their order page', () {
    IndigenNotification target(String route) => IndigenNotification(
      id: 'order',
      recipientId: 'me',
      kind: NotificationKind.announcement,
      title: 'Your order has been packed',
      route: route,
    );
    expect(
      notificationDestination(target('/shop/order/abc123')),
      '/shop/order/abc123',
    );
    expect(notificationDestination(target('/shop/order/a/b')), isNull);
  });

  testWidgets('an empty centre explains what will land here', (tester) async {
    await pump(tester);

    expect(find.text('Nothing yet'), findsOneWidget);
    expect(find.textContaining('likes your Kasem'), findsOneWidget);
  });

  testWidgets('a guest is asked to sign in rather than shown an empty list', (
    tester,
  ) async {
    // Notifications belong to an account; an empty list would read as "nothing
    // has happened" rather than "these are not yours to see yet".
    await pump(tester, uid: null);

    expect(find.text('Sign in for your alerts'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Nothing yet'), findsNothing);
  });

  group('deleting', () {
    testWidgets('a swipe takes the row away at once and offers Undo', (
      tester,
    ) async {
      final repository = _FakeNotificationsRepository();
      await pump(
        tester,
        feed: [notification(id: 'a', read: true)],
        repository: repository,
      );

      await tester.drag(find.byType(Dismissible), const Offset(-600, 0));
      await tester.pumpAndSettle();

      // No question first: the row is gone and Undo is on offer.
      expect(find.text('Delete this notification?'), findsNothing);
      expect(find.textContaining('Amina liked your post'), findsNothing);
      expect(find.text('Notification deleted'), findsOneWidget);
      expect(repository.deleted, isEmpty);

      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Amina liked your post'), findsOneWidget);
      expect(repository.deleted, isEmpty);
    });

    testWidgets('the delete is written once Undo goes unused', (tester) async {
      final repository = _FakeNotificationsRepository();
      await pump(
        tester,
        feed: [notification(id: 'a', read: true)],
        repository: repository,
      );

      await tester.drag(find.byType(Dismissible), const Offset(-600, 0));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 6));
      await tester.pumpAndSettle();

      expect(repository.deleted, ['a']);
      expect(find.text('Notification deleted'), findsNothing);
    });
  });

  testWidgets("alerts can be snoozed from the centre's menu", (tester) async {
    await pump(tester);

    await tester.tap(find.byTooltip('Notification actions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Snooze alerts'));
    await tester.pumpAndSettle();
    expect(find.text('For 1 hour'), findsOneWidget);
    await tester.tap(find.text('For 1 hour'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Alerts are silent until'), findsOneWidget);
    await tester.tap(find.text('Resume'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Alerts are silent'), findsNothing);
  });
}

/// Records deletes instead of writing them; any other call fails loudly.
class _FakeNotificationsRepository implements NotificationsRepository {
  final deleted = <String>[];

  @override
  Future<void> deleteNotification(String notificationId) async =>
      deleted.add(notificationId);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
