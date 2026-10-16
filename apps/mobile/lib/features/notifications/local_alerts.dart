import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:crypto/crypto.dart';

import 'notification_actions.dart';

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

/// The channel decisions and receipts about a member's own work arrive on.
///
/// Separate from community activity for the same reason messages are: somebody
/// who mutes likes and follows from system settings must not thereby mute the
/// outcome of the advert they paid for, or the review of the song they sent in.
/// Must match `ACCOUNT_CHANNEL_ID` in the fan-out function.
const accountChannelId = 'indigen_account';

const _accountChannel = AndroidNotificationChannel(
  accountChannelId,
  'Your work and payments',
  description:
      'Review decisions on what you send in, advert approvals and payment '
      'receipts.',
  importance: Importance.high,
);

/// The channel a push belongs on, read from the payload the fan-out sends.
AndroidNotificationChannel _channelFor(Map<String, dynamic> data) =>
    switch (data['type']) {
      'message' => _messagesChannel,
      'account' || 'order' => _accountChannel,
      _ => _communityChannel,
    };

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
  await android.createNotificationChannel(_accountChannel);
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
    if (payload?.startsWith('{') == true) {
      try {
        final data = jsonDecode(payload!) as Map;
        final route = data['route'];
        if (route is String && route.startsWith('/')) onRoute(route);
      } on Object {
        /* stale payload */
      }
      return;
    }
    if (payload != null && payload.startsWith('/')) onRoute(payload);
  }

  await _plugin.initialize(
    settings: InitializationSettings(
      // A bare resource name, not the `@drawable/...` reference the manifest
      // uses: the plugin resolves it with Resources.getIdentifier, which does
      // not understand the prefixed form and silently finds nothing.
      android: const AndroidInitializationSettings(_notificationIcon),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
        notificationCategories: [
          DarwinNotificationCategory(
            'community_actions',
            actions: [
              DarwinNotificationAction.plain(
                'like',
                'Like',
                options: {
                  DarwinNotificationActionOption.foreground,
                  DarwinNotificationActionOption.authenticationRequired,
                },
              ),
              DarwinNotificationAction.plain(
                'read',
                'Mark read',
                options: {
                  DarwinNotificationActionOption.foreground,
                  DarwinNotificationActionOption.authenticationRequired,
                },
              ),
              DarwinNotificationAction.text(
                'reply',
                'Reply',
                buttonTitle: 'Send',
                placeholder: 'Write a reply',
                options: {
                  DarwinNotificationActionOption.foreground,
                  DarwinNotificationActionOption.authenticationRequired,
                },
              ),
            ],
          ),
          DarwinNotificationCategory(
            'notification_read',
            actions: [
              DarwinNotificationAction.plain(
                'read',
                'Mark read',
                options: {
                  DarwinNotificationActionOption.foreground,
                  DarwinNotificationActionOption.authenticationRequired,
                },
              ),
            ],
          ),
        ],
      ),
    ),
    onDidReceiveNotificationResponse: (response) async {
      if (response.actionId?.isNotEmpty == true) {
        try {
          await handleNotificationAction(response);
        } on Object {
          /* queued or account action required */
        }
      } else {
        handle(response.payload);
      }
    },
    onDidReceiveBackgroundNotificationResponse: notificationActionBackground,
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
///
/// The fan-out's own `collapseKey` comes second, and it is the reason a member
/// who follows a prolific poster sees one row rather than six. Android's
/// `collapseKey` and APNs' `apns-collapse-id` only govern what the *system*
/// draws, so they do nothing at all for an alert that arrives while somebody is
/// looking at the app — that one is drawn here. Without reading the key back
/// out of the data payload, being inside the app meant getting the stack the
/// locked phone was spared.
String alertKeyFor(RemoteMessage message) {
  final threadId = message.data['threadId'];
  if (message.data['type'] == 'message' &&
      threadId is String &&
      threadId.isNotEmpty) {
    return 'chat_$threadId';
  }
  final collapseKey = message.data['collapseKey'];
  if (collapseKey is String && collapseKey.isNotEmpty) return collapseKey;
  final notificationId = message.data['notificationId'];
  if (notificationId is String && notificationId.isNotEmpty) {
    return notificationId;
  }
  return message.messageId ?? 'indigen_alert';
}

/// Dart hashCode is not a persistence contract across launches/isolates.
int stableAlertId(String key) {
  final bytes = sha256.convert(utf8.encode(key)).bytes;
  return ((bytes[0] & 0x7f) << 24) |
      (bytes[1] << 16) |
      (bytes[2] << 8) |
      bytes[3];
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
  final title = notification?.title ?? message.data['title'];
  final body = notification?.body ?? message.data['body'] ?? '';
  if (title == null || title.isEmpty) return;

  // Keyed on the conversation for a message, and on the alert otherwise, so a
  // burst of replies collapses into the one entry the backgrounded case already
  // shows — rather than stacking a row per message only when the app is open.
  final key = alertKeyFor(message);
  final channel = _channelFor(message.data);
  final actionable =
      message.data['payloadVersion'] == '2' &&
      message.data['recipientId'] is String &&
      message.data['notificationId'] is String;
  final supportsReaction =
      actionable &&
      [
        'like',
        'reply',
        'quote',
        'mention',
        'post',
        'thread_reply',
      ].contains(message.data['type']);
  final imagePath = message.data['previews'] == 'false'
      ? null
      : await _boundedAlertImage(message.data['imageUrl']);

  try {
    await _plugin.show(
      id: stableAlertId(key),
      title: title,
      body: body,
      payload: actionable
          ? jsonEncode({...message.data, 'route': route})
          : route,
      notificationDetails: NotificationDetails(
        iOS: DarwinNotificationDetails(
          categoryIdentifier: supportsReaction
              ? 'community_actions'
              : 'notification_read',
          attachments: imagePath == null
              ? null
              : [DarwinNotificationAttachment(imagePath)],
        ),
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: _notificationIcon,
          tag: key,
          visibility: message.data['previews'] == 'false'
              ? NotificationVisibility.secret
              : NotificationVisibility.private,
          styleInformation: imagePath == null
              ? BigTextStyleInformation(body)
              : BigPictureStyleInformation(
                  FilePathAndroidBitmap(imagePath),
                  contentTitle: title,
                  summaryText: body,
                ),
          actions: actionable
              ? [
                  if (supportsReaction)
                    const AndroidNotificationAction(
                      'like',
                      'Like',
                      cancelNotification: false,
                    ),
                  const AndroidNotificationAction(
                    'read',
                    'Mark read',
                    cancelNotification: false,
                  ),
                  if (supportsReaction)
                    const AndroidNotificationAction(
                      'reply',
                      'Reply',
                      cancelNotification: false,
                      inputs: [
                        AndroidNotificationActionInput(label: 'Write a reply'),
                      ],
                    ),
                ]
              : null,
        ),
      ),
    );
  } on Object catch (error) {
    debugPrint('Could not post a foreground alert (continuing): $error');
  }
}

Future<String?> _boundedAlertImage(dynamic value) async {
  if (value is! String || value.length > 4000) return null;
  final uri = Uri.tryParse(value);
  if (uri?.scheme != 'https' || uri?.host != 'firebasestorage.googleapis.com')
    return null;
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  try {
    final request = await client.getUrl(uri!);
    request.followRedirects = false;
    final response = await request.close().timeout(const Duration(seconds: 5));
    if (response.statusCode != 200 ||
        response.contentLength > 5 * 1024 * 1024 ||
        ![
          'image/jpeg',
          'image/png',
          'image/webp',
        ].contains(response.headers.contentType?.mimeType))
      return null;
    final bytes = <int>[];
    await for (final chunk in response.timeout(const Duration(seconds: 5))) {
      bytes.addAll(chunk);
      if (bytes.length > 5 * 1024 * 1024) return null;
    }
    final dir = Directory(
      '${(await getTemporaryDirectory()).path}/notification-images',
    );
    await dir.create(recursive: true);
    final files = await dir
        .list()
        .where((f) => f is File)
        .cast<File>()
        .toList();
    for (final file in files) {
      if (DateTime.now().difference((await file.stat()).modified).inHours >
              24 ||
          files.length > 30)
        await file.delete();
    }
    final file = File(
      '${dir.path}/${DateTime.now().microsecondsSinceEpoch}.jpg',
    );
    await file.writeAsBytes(bytes);
    return file.path;
  } on Object {
    return null;
  } finally {
    client.close(force: true);
  }
}
