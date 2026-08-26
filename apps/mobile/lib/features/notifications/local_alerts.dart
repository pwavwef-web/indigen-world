import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Posting alerts on this device, and the channels they arrive on.
///
/// FCM only draws a notification itself while the app is backgrounded. A push
/// that lands while somebody is looking at the app is handed to
/// `FirebaseMessaging.onMessage` and drawn by nobody — which is why this exists:
/// the same alert, posted locally, so being inside the app does not mean
/// missing what arrives.

/// The channel community alerts are posted on.
///
/// Deliberately not the `indigen_community` id earlier builds declared. A
/// channel's importance is fixed the moment Android creates it and can never be
/// raised afterwards. No build before this one called
/// [AndroidFlutterLocalNotificationsPlugin.createNotificationChannel], so on any
/// handset that had already received an alert Android auto-created the channel
/// at default importance — no heads-up, no sound. A new id is the only way to
/// hand those devices the channel they should have had. Must match the manifest
/// meta-data and the id the fan-out function sends.
const communityChannelId = 'indigen_community_v2';

/// The id earlier builds declared. Deleted on start-up so it stops sitting in
/// system settings as a category nothing will ever post to again.
const _retiredCommunityChannelId = 'indigen_community';

/// The channel direct messages are posted on.
///
/// Separate from community activity so somebody can mute likes and follows from
/// system settings without also muting the person talking to them — which is
/// the whole reason a member would go looking for that switch.
const messagesChannelId = 'indigen_messages';

const _communityChannel = AndroidNotificationChannel(
  communityChannelId,
  'Community activity',
  description: 'Replies, mentions, follows, reshares and newly published work.',
  importance: Importance.high,
);

const _messagesChannel = AndroidNotificationChannel(
  messagesChannelId,
  'Messages',
  description: 'Direct messages from other members.',
  importance: Importance.high,
);

/// The channel a push belongs on, read from the payload the fan-out sends.
AndroidNotificationChannel _channelFor(Map<String, dynamic> data) =>
    data['type'] == 'message' ? _messagesChannel : _communityChannel;

/// The status-bar icon, by bare resource name — see [initializeLocalAlerts].
const _notificationIcon = 'ic_notification';

final _plugin = FlutterLocalNotificationsPlugin();

AndroidFlutterLocalNotificationsPlugin? get _android => _plugin
    .resolvePlatformSpecificImplementation<
      AndroidFlutterLocalNotificationsPlugin
    >();

/// Creates the channels alerts are posted on, before anything can arrive.
///
/// Called from the Firebase bootstrap rather than lazily, because the first
/// message to reach a device with no channel makes Android invent one — and
/// whatever importance it picks is then permanent.
Future<void> createNotificationChannels() async {
  final android = _android;
  if (android == null) return;
  await android.createNotificationChannel(_communityChannel);
  await android.createNotificationChannel(_messagesChannel);
  await android.deleteNotificationChannel(
    channelId: _retiredCommunityChannelId,
  );
}

/// Wires up tap handling for locally posted alerts.
///
/// [onRoute] receives the in-app route a tapped alert points at. Also drains a
/// tap that launched the app from cold: a foreground alert stays in the tray
/// after the member leaves the app, so it can just as easily be tapped an hour
/// later from a dead process.
Future<void> initializeLocalAlerts({
  required void Function(String route) onRoute,
}) async {
  void handle(String? payload) {
    if (payload != null && payload.startsWith('/')) onRoute(payload);
  }

  await _plugin.initialize(
    settings: const InitializationSettings(
      // A bare resource name, not the `@drawable/...` reference the manifest
      // uses: the plugin resolves it with Resources.getIdentifier, which does
      // not understand the prefixed form and silently finds nothing.
      android: AndroidInitializationSettings(_notificationIcon),
    ),
    onDidReceiveNotificationResponse: (response) => handle(response.payload),
  );

  final launch = await _plugin.getNotificationAppLaunchDetails();
  if (launch?.didNotificationLaunchApp ?? false) {
    handle(launch?.notificationResponse?.payload);
  }
}

/// What a foreground alert is keyed on, so repeats replace rather than stack.
///
/// Pure so the collapsing rule can be tested without a plugin: a conversation
/// is one entry however many messages arrive, matching the `tag` the fan-out
/// sends for the backgrounded case.
String alertKeyFor(RemoteMessage message) {
  final threadId = message.data['threadId'];
  if (message.data['type'] == 'message' &&
      threadId is String &&
      threadId.isNotEmpty) {
    return 'chat_$threadId';
  }
  final notificationId = message.data['notificationId'];
  if (notificationId is String && notificationId.isNotEmpty) {
    return notificationId;
  }
  return message.messageId ?? 'indigen_alert';
}

/// Posts [message] as a local alert, for a push that arrived with the app open.
///
/// Best-effort throughout: the notification centre already holds the row this
/// alert is about, so failing to draw it costs a member a heads-up, never the
/// alert itself.
Future<void> showForegroundAlert(
  RemoteMessage message, {
  required String? route,
}) async {
  final notification = message.notification;
  final title = notification?.title;
  final body = notification?.body ?? '';
  if (title == null || title.isEmpty) return;

  // Keyed on the conversation for a message, and on the alert otherwise, so a
  // burst of replies collapses into the one entry the backgrounded case already
  // shows — rather than stacking a row per message only when the app is open.
  final key = alertKeyFor(message);
  final channel = _channelFor(message.data);

  try {
    await _plugin.show(
      id: key.hashCode & 0x7fffffff,
      title: title,
      body: body,
      payload: route,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: _notificationIcon,
          tag: key,
        ),
      ),
    );
  } on Object catch (error) {
    debugPrint('Could not post a foreground alert (continuing): $error');
  }
}
