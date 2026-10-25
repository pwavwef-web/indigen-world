import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/notifications/alert_presentation.dart';
import 'package:indigen_world_mobile/features/notifications/alert_snooze.dart';
import 'package:indigen_world_mobile/features/notifications/notification_actions.dart';
import 'package:indigen_world_mobile/features/notifications/notification_art.dart';
import 'package:path_provider/path_provider.dart';

/// Posting alerts on this device, and the channels they arrive on.
///
/// Every alert on an Android phone that runs this build is drawn here — while
/// the app is open (FCM hands a foreground push to `onMessage` and draws
/// nothing), and while it is closed too, because the backend sends this build
/// data-only messages that wake `firebaseMessagingBackgroundHandler` instead of
/// letting the system draw its plain layout. That is what lets the shade show
/// the notification centre's design: see [AlertPresentation].

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

AndroidNotificationChannel _channelFor(AlertGroup group) => switch (group) {
  AlertGroup.messages => _messagesChannel,
  AlertGroup.account => _accountChannel,
  AlertGroup.community => _communityChannel,
};

/// The status-bar icon, by bare resource name — see [initializeLocalAlerts].
const _notificationIcon = 'ic_notification';

/// The mark alerts nobody in particular sent wear as their avatar.
const _brandMarkAsset = 'assets/brand/indigen-world-mark.png';

/// How long a "Reply sent" confirmation stays in the shade before it clears
/// itself. Long enough to read, short enough not to become one more thing to
/// swipe away.
const _repliedTimeout = Duration(seconds: 8);

/// The most messages a conversation alert keeps. Android shows the last few
/// anyway; the cap keeps the redraw small.
const _conversationHistory = 7;

final _plugin = FlutterLocalNotificationsPlugin();

/// The Android side of the plugin, or null off Android — and in an isolate
/// where the plugin was never registered, where asking throws rather than
/// answering null. Every caller treats null as "nothing to draw or clear".
AndroidFlutterLocalNotificationsPlugin? get _android {
  try {
    return _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
  } on Object {
    return null;
  }
}

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

var _initialized = false;

InitializationSettings _initializationSettings() => InitializationSettings(
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
            'Mark as read',
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
            'Mark as read',
            options: {
              DarwinNotificationActionOption.foreground,
              DarwinNotificationActionOption.authenticationRequired,
            },
          ),
        ],
      ),
    ],
  ),
);

/// Readies the plugin in an isolate that only has to *draw* — the background
/// isolate a data-only push wakes. Taps are routed by the app's own isolate
/// when it starts (see [initializeLocalAlerts]); buttons go to
/// [notificationActionBackground] wherever they are pressed.
Future<void> ensureAlertsReady() async {
  if (_initialized) return;
  await _plugin.initialize(
    settings: _initializationSettings(),
    onDidReceiveBackgroundNotificationResponse: notificationActionBackground,
  );
  _initialized = true;
}

/// Wires up tap handling for locally posted alerts.
///
/// [onRoute] receives the in-app route a tapped alert points at. Also drains a
/// tap that launched the app from cold: an alert stays in the tray after the
/// member leaves the app, so it can just as easily be tapped an hour later from
/// a dead process.
Future<void> initializeLocalAlerts({
  required void Function(String route) onRoute,
}) async {
  void handle(String? payload) {
    final route = alertRouteFromPayload(payload);
    if (route != null) onRoute(route);
  }

  await _plugin.initialize(
    settings: _initializationSettings(),
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
  _initialized = true;

  final launch = await _plugin.getNotificationAppLaunchDetails();
  if (launch?.didNotificationLaunchApp ?? false) {
    handle(launch?.notificationResponse?.payload);
  }
}

/// The in-app route a tapped alert's payload points at, or null.
///
/// Alerts carry their data as JSON (with the route inside it); alerts posted
/// by earlier builds carried the bare route. Both are still in people's shades.
String? alertRouteFromPayload(String? payload) {
  if (payload == null) return null;
  if (payload.startsWith('{')) {
    try {
      final data = jsonDecode(payload) as Map;
      final route = data['route'];
      return route is String && route.startsWith('/') ? route : null;
    } on Object {
      return null;
    }
  }
  return payload.startsWith('/') ? payload : null;
}

/// What an alert is keyed on, so repeats replace rather than stack.
///
/// Pure so the collapsing rule can be tested without a plugin: a conversation
/// is one entry however many messages arrive, matching the `tag` the fan-out
/// sends for the system-drawn case.
///
/// The fan-out's own `collapseKey` comes second, and it is the reason a member
/// who follows a prolific poster sees one row rather than six. Android's
/// `collapseKey` and APNs' `apns-collapse-id` only govern what the *system*
/// draws, so they do nothing at all for an alert this app draws itself.
String alertKeyFor(RemoteMessage message) =>
    alertKeyForData(message.data, fallback: message.messageId);

/// [alertKeyFor], from the payload alone.
String alertKeyForData(Map<String, dynamic> data, {String? fallback}) {
  final threadId = data['threadId'];
  if (data['type'] == 'message' && threadId is String && threadId.isNotEmpty) {
    return 'chat_$threadId';
  }
  final collapseKey = data['collapseKey'];
  if (collapseKey is String && collapseKey.isNotEmpty) return collapseKey;
  final notificationId = data['notificationId'];
  if (notificationId is String && notificationId.isNotEmpty) {
    return notificationId;
  }
  final alertKey = data['alertKey'];
  if (alertKey is String && alertKey.isNotEmpty) return alertKey;
  return fallback ?? 'indigen_alert';
}

/// Dart hashCode is not a persistence contract across launches/isolates.
int stableAlertId(String key) {
  final bytes = sha256.convert(utf8.encode(key)).bytes;
  return ((bytes[0] & 0x7f) << 24) |
      (bytes[1] << 16) |
      (bytes[2] << 8) |
      bytes[3];
}

/// Removes one alert from the shade, and tidies the summary it folded under.
Future<void> cancelAlert(Map<String, dynamic> data) async {
  final key = alertKeyForData(data);
  final id = stableAlertId(key);
  try {
    await _plugin.cancel(id: id, tag: key);
    await refreshAlertGroup(
      AlertPresentation.fromData(data).group,
      removed: {id},
    );
  } on Object catch (error) {
    debugPrint('Could not clear an alert (continuing): $error');
  }
}

/// Removes the alerts in the shade about [notificationId] or [threadId].
///
/// Called when the same thing is dealt with inside the app — a row marked
/// read in the notification centre, a conversation opened — so the shade does
/// not keep announcing what the member has already seen. Matched on payload
/// rather than key, because a collapsed alert is keyed on its collapse key.
Future<void> clearAlertsFor({String? notificationId, String? threadId}) async {
  if (notificationId == null && threadId == null) return;
  final android = _android;
  if (android == null) return;
  try {
    final touched = <AlertGroup>{};
    final removed = <int>{};
    for (final alert in await android.getActiveNotifications()) {
      final data = _payloadOf(alert.payload);
      final matches =
          (notificationId != null &&
              data['notificationId'] == notificationId) ||
          (threadId != null &&
              data['type'] == 'message' &&
              data['threadId'] == threadId);
      if (!matches || alert.id == null) continue;
      await _plugin.cancel(id: alert.id!, tag: alert.tag);
      removed.add(alert.id!);
      touched.add(AlertPresentation.fromData(data).group);
    }
    for (final group in touched) {
      await refreshAlertGroup(group, removed: removed);
    }
  } on Object catch (error) {
    debugPrint('Could not clear alerts (continuing): $error');
  }
}

/// Removes every alert in [group] from the shade, summary included — after
/// Mark all as read, here or in the app.
Future<void> clearAlertGroup(AlertGroup group) async {
  final android = _android;
  if (android == null) return;
  try {
    for (final alert in await android.getActiveNotifications()) {
      if (alert.groupKey == group.key && alert.id != null) {
        await _plugin.cancel(id: alert.id!, tag: alert.tag);
      }
    }
  } on Object catch (error) {
    debugPrint('Could not clear alerts (continuing): $error');
  }
}

/// Posts [message] as an alert, for a push this app draws itself.
///
/// Best-effort throughout: the notification centre or the inbox already holds
/// what this alert is about, so failing to draw it costs a member a heads-up,
/// never the alert itself.
Future<void> showForegroundAlert(
  RemoteMessage message, {
  required String? route,
}) async {
  final notification = message.notification;
  final data = <String, dynamic>{...message.data};
  // A system-shaped push carries its words in the notification block rather
  // than the data; an alert drawn here reads them from either.
  final title = data['title'];
  if (title is! String || title.isEmpty) data['title'] = notification?.title;
  if (data['body'] is! String) data['body'] = notification?.body ?? '';
  await showAlert(data, route: route, fallbackKey: message.messageId);
}

/// Draws the alert [data] describes — or redraws it after somebody pressed one
/// of its buttons, when [outcome] says what happened.
///
/// [replyText] is the reply just sent, drawn into the alert so the member can
/// see it went. [pictureOverride] stands in for the downloaded picture: the
/// test alert in Alert settings carries one from the app bundle.
Future<void> showAlert(
  Map<String, dynamic> data, {
  String? route,
  String? fallbackKey,
  AlertOutcome outcome = AlertOutcome.none,
  String? replyText,
  Uint8List? pictureOverride,
}) async {
  final title = data['title'];
  if (title is! String || title.isEmpty) return;

  final presentation = AlertPresentation.fromData(data);
  final key = alertKeyForData(data, fallback: fallbackKey);
  final id = stableAlertId(key);
  final payload = jsonEncode({
    ...data,
    'route': route ?? data['route'],
    'alertKey': key,
  });
  // A redraw never rings: it is the same alert, answering a button.
  final snoozed =
      outcome == AlertOutcome.none && await alertsSnoozedUntil() != null;
  final quiet = outcome != AlertOutcome.none || snoozed;

  // The sample alert carries its picture in the app bundle, so it can be
  // drawn — and redrawn after a button — with no network at all.
  final pictureAsset = data['pictureAsset'];
  if (pictureOverride == null && pictureAsset is String) {
    pictureOverride = await _bundled(pictureAsset);
  }

  _AlertArt art;
  try {
    art = await _artFor(presentation, pictureOverride: pictureOverride);
  } on Object {
    art = const _AlertArt();
  }

  final history = presentation.isMessage && presentation.previews
      ? await _conversation(
          presentation,
          art: art,
          id: id,
          key: key,
          outcome: outcome,
          replyText: replyText,
        )
      : null;

  final body =
      outcome == AlertOutcome.replied &&
          !presentation.isMessage &&
          replyText != null
      ? 'You replied: “$replyText”'
      : presentation.body;

  Future<void> post({required bool rich}) => _plugin.show(
    id: id,
    title: presentation.title,
    body: body,
    payload: payload,
    notificationDetails: NotificationDetails(
      iOS: DarwinNotificationDetails(
        presentSound: !quiet,
        categoryIdentifier:
            presentation.actionsAfter(outcome).contains(AlertAction.like)
            ? 'community_actions'
            : 'notification_read',
        attachments: art.pictureFile == null
            ? null
            : [DarwinNotificationAttachment(art.pictureFile!)],
      ),
      android: rich
          ? _androidDetails(
              presentation,
              art: art,
              key: key,
              body: body,
              outcome: outcome,
              quiet: quiet,
              history: history,
            )
          : _plainDetails(presentation, key: key, body: body, quiet: quiet),
    ),
  );

  try {
    await post(rich: true);
  } on Object catch (error) {
    // A picture Android refused, a style an old handset cannot draw: the
    // words are what matter, so they go out on their own.
    debugPrint('Rich alert failed, posting it plain (continuing): $error');
    try {
      await post(rich: false);
    } on Object catch (error) {
      debugPrint('Could not post an alert (continuing): $error');
      return;
    }
  }
  await refreshAlertGroup(
    presentation.group,
    posted: ActiveNotification(
      id: id,
      groupKey: presentation.group.key,
      tag: key,
      title: presentation.title,
      body: body,
      payload: payload,
    ),
  );
}

AndroidNotificationDetails _androidDetails(
  AlertPresentation presentation, {
  required _AlertArt art,
  required String key,
  required String body,
  required AlertOutcome outcome,
  required bool quiet,
  required List<Message>? history,
}) {
  final channel = _channelFor(presentation.group);
  final avatar = art.avatar == null
      ? null
      : ByteArrayAndroidBitmap(art.avatar!);
  final StyleInformation style;
  if (history != null) {
    style = MessagingStyleInformation(
      const Person(name: 'You', key: 'me'),
      messages: history,
    );
  } else if (art.picture != null) {
    // Collapsed, the avatar sits on the right like the centre's thumbnail;
    // expanded, the picture fills the alert and the summary carries the words.
    style = BigPictureStyleInformation(
      ByteArrayAndroidBitmap(art.picture!),
      largeIcon: avatar,
      contentTitle: presentation.title,
      summaryText: body.isEmpty ? null : body,
    );
  } else {
    style = BigTextStyleInformation(body, contentTitle: presentation.title);
  }
  return AndroidNotificationDetails(
    channel.id,
    channel.name,
    channelDescription: channel.description,
    importance: Importance.high,
    priority: Priority.high,
    icon: _notificationIcon,
    color: BrandColors.actionBlue,
    largeIcon: avatar,
    styleInformation: style,
    subText: presentation.labelAfter(outcome),
    when: presentation.sentAt?.millisecondsSinceEpoch,
    showWhen: true,
    tag: key,
    groupKey: presentation.group.key,
    silent: quiet,
    onlyAlertOnce: outcome != AlertOutcome.none,
    category: presentation.isMessage
        ? AndroidNotificationCategory.message
        : AndroidNotificationCategory.social,
    visibility: presentation.previews
        ? NotificationVisibility.private
        : NotificationVisibility.secret,
    timeoutAfter: outcome == AlertOutcome.replied && !presentation.isMessage
        ? _repliedTimeout.inMilliseconds
        : null,
    actions: [
      for (final action in presentation.actionsAfter(outcome))
        AndroidNotificationAction(
          action.id,
          action.label,
          // The alert stays put while the button works, so its answer —
          // "Liked", "Reply sent", or a failure — can be drawn onto it.
          cancelNotification: false,
          semanticAction: switch (action) {
            AlertAction.reply => SemanticAction.reply,
            AlertAction.read => SemanticAction.markAsRead,
            AlertAction.like => SemanticAction.thumbsUp,
          },
          inputs: action == AlertAction.reply
              ? [
                  AndroidNotificationActionInput(
                    label: presentation.isMessage
                        ? 'Message ${presentation.actorName.isEmpty ? presentation.title : presentation.actorName}'
                        : 'Write a reply',
                  ),
                ]
              : const [],
        ),
    ],
  );
}

AndroidNotificationDetails _plainDetails(
  AlertPresentation presentation, {
  required String key,
  required String body,
  required bool quiet,
}) {
  final channel = _channelFor(presentation.group);
  return AndroidNotificationDetails(
    channel.id,
    channel.name,
    channelDescription: channel.description,
    importance: Importance.high,
    priority: Priority.high,
    icon: _notificationIcon,
    color: BrandColors.actionBlue,
    styleInformation: BigTextStyleInformation(body),
    subText: presentation.label,
    tag: key,
    groupKey: presentation.group.key,
    silent: quiet,
    visibility: presentation.previews
        ? NotificationVisibility.private
        : NotificationVisibility.secret,
  );
}

/// The conversation a message alert shows: what is already in the shade for
/// this thread, plus whatever just happened — the incoming message, or the
/// reply this phone sent from the shade.
Future<List<Message>> _conversation(
  AlertPresentation presentation, {
  required _AlertArt art,
  required int id,
  required String key,
  required AlertOutcome outcome,
  required String? replyText,
}) async {
  final sender = Person(
    name: presentation.actorName.isEmpty
        ? presentation.title
        : presentation.actorName,
    key: 'sender',
    icon: art.avatar == null ? null : ByteArrayAndroidIcon(art.avatar!),
  );
  // A message with no person is, to Android, from the owner of the phone —
  // drawn under the style's own person ("You") rather than with a face. A
  // named person here borrowed the conversation icon, so the member's own
  // reply appeared under the sender's avatar.
  const Person? me = null;
  var previous = <Message>[];
  try {
    final existing = await _android?.getActiveNotificationMessagingStyle(
      id: id,
      tag: key,
    );
    previous = [
      for (final message in existing?.messages ?? const <Message>[])
        Message(
          message.text,
          message.timestamp,
          // Android hands the people back without their pictures; the two
          // people in a conversation are known, so they are put back whole.
          message.person == null ||
                  message.person?.key == 'me' ||
                  message.person?.name == 'You'
              ? me
              : sender,
        ),
    ];
  } on Object {
    /* a fresh conversation is the fallback, never a lost message */
  }
  final now = DateTime.now();
  final next = switch (outcome) {
    AlertOutcome.none => Message(
      presentation.body,
      presentation.sentAt ?? now,
      sender,
    ),
    AlertOutcome.replied ||
    AlertOutcome.queued when replyText != null => Message(replyText, now, me),
    _ => null,
  };
  final messages = [
    ...previous,
    ?next,
    // A redraw whose history Android could not hand back still shows what the
    // alert was about, rather than an empty conversation.
    if (previous.isEmpty && next == null)
      Message(presentation.body, presentation.sentAt ?? now, sender),
  ];
  return messages.length > _conversationHistory
      ? messages.sublist(messages.length - _conversationHistory)
      : messages;
}

/// Folds a section's alerts under one summary once there are two of them.
///
/// The summary is what the shade shows when the section is collapsed — "3 new
/// alerts", their first lines, and Mark all as read — and Android removes it by
/// itself when the last alert under it goes.
///
/// [posted] and [removed] are what the caller has just done. Android applies a
/// post or a cancel on its own thread, so the list read back a moment later
/// can still be missing the alert just drawn or still hold the one just
/// cleared — and the summary would count one off.
Future<void> refreshAlertGroup(
  AlertGroup group, {
  ActiveNotification? posted,
  Set<int> removed = const {},
}) async {
  final android = _android;
  if (android == null) return;
  final summaryKey = 'summary_${group.name}';
  final summaryId = stableAlertId(summaryKey);
  try {
    final active = await android.getActiveNotifications();
    final children = [
      for (final alert in active)
        if (alert.groupKey == group.key &&
            alert.id != summaryId &&
            alert.id != posted?.id &&
            !removed.contains(alert.id))
          alert,
      ?posted,
    ];
    if (children.length < 2) {
      await _plugin.cancel(id: summaryId, tag: summaryKey);
      return;
    }
    final recipients = {
      for (final child in children) _payloadOf(child.payload)['recipientId'],
    }..remove(null);
    final channel = _channelFor(group);
    final count = group.countLabel(children.length);
    await _plugin.show(
      id: summaryId,
      title: count,
      body: children.map((alert) => alert.title ?? '').join(' · '),
      payload: jsonEncode({
        'type': 'summary',
        'group': group.name,
        'alertKey': summaryKey,
        'route': group == AlertGroup.messages ? '/messages' : '/notifications',
        // One account's alerts can be marked read together; a shade holding
        // two accounts' alerts — a phone that changed hands — cannot.
        if (recipients.length == 1) 'recipientId': recipients.single,
      }),
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: _notificationIcon,
          color: BrandColors.actionBlue,
          tag: summaryKey,
          groupKey: group.key,
          setAsGroupSummary: true,
          groupAlertBehavior: GroupAlertBehavior.children,
          silent: true,
          onlyAlertOnce: true,
          styleInformation: InboxStyleInformation(
            [
              for (final alert in children.take(6))
                [
                  alert.title ?? '',
                  alert.body ?? '',
                ].where((part) => part.isNotEmpty).join(': '),
            ],
            contentTitle: count,
            summaryText: 'Indigen World',
          ),
          actions: group != AlertGroup.account && recipients.length == 1
              ? const [
                  AndroidNotificationAction(
                    'read_all',
                    'Mark all as read',
                    cancelNotification: false,
                    semanticAction: SemanticAction.markAsRead,
                  ),
                ]
              : null,
        ),
      ),
    );
  } on Object catch (error) {
    debugPrint('Could not fold alerts (continuing): $error');
  }
}

/// Every alert this app has in the shade for [group], by payload.
Future<List<Map<String, dynamic>>> activeAlertsIn(AlertGroup group) async {
  final android = _android;
  if (android == null) return const [];
  try {
    final active = await android.getActiveNotifications();
    return [
      for (final alert in active)
        if (alert.groupKey == group.key) _payloadOf(alert.payload),
    ].where((data) => data['type'] != 'summary').toList(growable: false);
  } on Object {
    return const [];
  }
}

Map<String, dynamic> _payloadOf(String? payload) {
  if (payload == null || !payload.startsWith('{')) return const {};
  try {
    return Map<String, dynamic>.from(jsonDecode(payload) as Map);
  } on Object {
    return const {};
  }
}

/// The pictures one alert is drawn with.
class _AlertArt {
  const _AlertArt({this.avatar, this.picture, this.pictureFile});

  /// The large icon: the actor wearing the kind badge.
  final Uint8List? avatar;

  /// The attached picture, scaled for the shade.
  final Uint8List? picture;

  /// The same picture on disk, for iOS, which attaches files.
  final String? pictureFile;
}

Future<_AlertArt> _artFor(
  AlertPresentation presentation, {
  Uint8List? pictureOverride,
}) async {
  final noActor =
      presentation.actorName.isEmpty && presentation.actorAvatarUrl == null;
  final sources = await Future.wait<Uint8List?>([
    fetchAlertImage(presentation.actorAvatarUrl),
    pictureOverride != null
        ? Future.value(pictureOverride)
        : fetchAlertImage(presentation.imageUrl),
    _bundled(presentation.badgeAsset),
    noActor ? _bundled(_brandMarkAsset) : Future.value(null),
  ]);
  final (avatar, picture) = await (
    composeAlertAvatar(
      AlertAvatarSpec(
        photo: sources[0],
        initials: presentation.initials,
        brandMark: sources[3],
        badgeGlyph: sources[2],
        badgeColor: presentation.badgeColor,
      ),
    ),
    fitAlertPicture(sources[1]),
  ).wait;
  return _AlertArt(
    avatar: avatar,
    picture: picture,
    pictureFile: picture != null && defaultTargetPlatform == TargetPlatform.iOS
        ? await _pictureFile(picture)
        : null,
  );
}

Future<Uint8List?> _bundled(String asset) async {
  try {
    final data = await rootBundle.load(asset);
    return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  } on Object {
    return null;
  }
}

Future<String?> _pictureFile(Uint8List bytes) async {
  try {
    final directory = Directory(
      '${(await getTemporaryDirectory()).path}/notification-attachments',
    );
    await directory.create(recursive: true);
    final file = File(
      '${directory.path}/${DateTime.now().microsecondsSinceEpoch}.jpg',
    );
    await file.writeAsBytes(bytes);
    return file.path;
  } on Object {
    return null;
  }
}

/// Draws two sample alerts — a reply carrying a picture, and a message — so
/// somebody can see what alerts look like on this phone and try every button
/// on them. Both answer their own buttons and write nothing anywhere (see
/// `_answerTest` in notification_actions.dart).
Future<void> showTestAlerts() async {
  final now = DateTime.now().millisecondsSinceEpoch;
  await showAlert({
    'type': 'reply',
    'test': 'true',
    'payloadVersion': '2',
    'notificationId': 'test_alert_reply',
    'title': 'This is how your alerts look',
    'body':
        'Replies, mentions and new posts arrive with their picture. Reply, '
        'Like or Mark as read without opening the app.',
    'pictureAsset': 'assets/places/paga-pond.jpg',
    'previews': 'true',
    'sentAt': '$now',
  }, route: '/notifications');
  await showAlert({
    'type': 'message',
    'test': 'true',
    'payloadVersion': '2',
    'threadId': 'test_alert_thread',
    'title': 'Indigen World',
    'actorName': 'Indigen World',
    'body': 'Messages show the conversation. Type a reply right here.',
    'previews': 'true',
    'sentAt': '${now + 1}',
  }, route: '/messages');
}
