import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
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
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUidProvider.overrideWithValue(uid),
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

    expect(find.text('TODAY'), findsOneWidget);
    expect(find.text('THIS WEEK'), findsOneWidget);
    expect(find.text('EARLIER'), findsOneWidget);
    expect(find.text('Amina liked your post'), findsOneWidget);
    expect(find.text('Nyaaba replied to you'), findsOneWidget);
    expect(find.text('Ko gara.'), findsOneWidget);
  });

  testWidgets('offers to mark everything read while something is unread', (
    tester,
  ) async {
    await pump(tester, feed: [notification(id: 'a')], unread: 1);

    expect(find.text('Mark all read'), findsOneWidget);
  });

  testWidgets('hides the mark-all action once nothing is unread', (
    tester,
  ) async {
    await pump(tester, feed: [notification(id: 'a', read: true)]);

    expect(find.text('Mark all read'), findsNothing);
  });

  testWidgets('quotes the post a row is about', (tester) async {
    await pump(
      tester,
      feed: [notification(id: 'a', postPreview: 'De zaanem. Ko gara.')],
    );

    expect(find.text('De zaanem. Ko gara.'), findsOneWidget);
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
}
