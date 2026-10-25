import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:indigen_world_mobile/core/firebase_bootstrap.dart'
    show initializeFirebaseInBackground;
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/notifications/alert_presentation.dart';
import 'package:indigen_world_mobile/features/notifications/data/notifications_repository.dart';
import 'package:indigen_world_mobile/features/notifications/local_alerts.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Sends what somebody pressed on an alert — Like, Reply, Mark as read — to
/// the backend, and keeps it until it gets there.
class NotificationActions {
  static Future<void> _queue(Map<String, dynamic> action) async {
    final prefs = await SharedPreferences.getInstance(),
        key = 'notification.actions.${action['recipientId']}';
    List<dynamic> raw;
    try {
      raw = jsonDecode(prefs.getString(key) ?? '[]') as List;
    } on Object {
      raw = [];
    }
    final queue =
        raw.whereType<Map>().map((a) => Map<String, dynamic>.from(a)).toList()
          ..removeWhere((a) => a['actionId'] == action['actionId']);
    queue.add({...action, 'queuedAt': DateTime.now().toIso8601String()});
    await prefs.setString(
      key,
      jsonEncode(queue.reversed.take(50).toList().reversed.toList()),
    );
  }

  static const _apple = MethodChannel('world.indigen/notification_actions');
  static bool _appleWired = false;
  static Future<void> drainAppleActions() async {
    if (defaultTargetPlatform != TargetPlatform.iOS) return;
    if (!_appleWired) {
      _appleWired = true;
      _apple.setMethodCallHandler((call) async {
        if (call.method == 'actionsAvailable') await drainAppleActions();
      });
    }
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    final queued = await _apple.invokeListMethod<dynamic>('pending') ?? [];
    for (final raw in queued.whereType<Map>()) {
      if (raw['recipientId'] != uid) continue;
      try {
        await send(
          request(
            recipientId: uid,
            notificationId: raw['notificationId'],
            action: raw['action'],
            text: raw['text'],
          ),
        );
        await _apple.invokeMethod<void>('ack', {
          'id': raw['id'],
          'read': raw['action'] == 'read',
        });
      } on Object {
        /* queue remains scoped to its recipient for a later retry */
      }
    }
  }

  static Future<void> send(Map<String, dynamic> action) async {
    final expected = action['recipientId'];
    if (FirebaseAuth.instance.currentUser?.uid != expected) {
      await _queue(action);
      throw const NotificationActionDeferred(
        'Sign in to the account that received this notification.',
        queued: false,
      );
    }
    try {
      await FirebaseFunctions.instance
          .httpsCallable('notificationAction')
          .call<dynamic>(action);
    } on FirebaseFunctionsException catch (e) {
      if (!['unavailable', 'deadline-exceeded', 'internal'].contains(e.code)) {
        rethrow;
      }
      await _queue(action);
      throw const NotificationActionDeferred(
        'Action saved for retry when this account reconnects.',
        queued: true,
      );
    }
  }

  static Future<void> retry() async {
    await drainAppleActions();
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    final prefs = await SharedPreferences.getInstance(),
        key = 'notification.actions.$uid';
    final queue = (jsonDecode(prefs.getString(key) ?? '[]') as List)
        .whereType<Map>()
        .map((a) => Map<String, dynamic>.from(a))
        .toList();
    for (final action in List<Map<String, dynamic>>.from(queue)) {
      if (FirebaseAuth.instance.currentUser?.uid != uid) return;
      final at = DateTime.tryParse(action['queuedAt'] ?? '');
      if (at == null || DateTime.now().difference(at).inDays > 7) {
        queue.remove(action);
        continue;
      }
      try {
        await FirebaseFunctions.instance
            .httpsCallable('notificationAction')
            .call<dynamic>(action);
        if (action['action'] == 'read') {
          await clearAlertsFor(notificationId: action['notificationId']);
        }
        queue.remove(action);
      } on FirebaseFunctionsException catch (e) {
        if ([
          'permission-denied',
          'not-found',
          'invalid-argument',
          'failed-precondition',
        ].contains(e.code)) {
          queue.remove(action);
        } else {
          break;
        }
      }
    }
    await prefs.setString(key, jsonEncode(queue));
  }

  static Map<String, dynamic> request({
    required String recipientId,
    required String notificationId,
    required String action,
    String? text,
  }) => {
    'recipientId': recipientId,
    'notificationId': notificationId,
    'action': action,
    'actionId': sha256
        .convert(
          utf8.encode('$recipientId:$notificationId:$action:${text ?? ''}'),
        )
        .toString(),
    'text': ?text,
  };
}

/// An action that did not reach the backend now. [queued] says whether it is
/// waiting to be retried, or needs somebody to sign in to the right account.
class NotificationActionDeferred implements Exception {
  const NotificationActionDeferred(this.message, {required this.queued});

  final String message;
  final bool queued;

  @override
  String toString() => message;
}

/// Where a button pressed on an alert lands when the app is not running.
@pragma('vm:entry-point')
Future<void> notificationActionBackground(NotificationResponse response) async {
  await initializeFirebaseInBackground();
  await ensureAlertsReady();
  await handleNotificationAction(response);
}

/// Answers a button pressed on an alert in the shade, then draws the answer
/// back onto the alert.
///
/// Every path ends in a redraw or a removal. Android keeps a spinner on an
/// alert from the moment a reply is sent until the app posts it again, so an
/// action that failed silently would leave the member watching it spin.
Future<void> handleNotificationAction(NotificationResponse response) async {
  final action = response.actionId;
  final payload = response.payload;
  if (action == null || action.isEmpty || payload?.startsWith('{') != true) {
    return;
  }
  final data = Map<String, dynamic>.from(jsonDecode(payload!) as Map);
  final route = data['route'] is String ? data['route'] as String : null;
  final text = response.input?.trim();

  if (data['type'] == 'summary') {
    if (action == 'read_all') await _readAll(data);
    return;
  }

  if (data['test'] == 'true') {
    await _answerTest(data, action: action, text: text, route: route);
    return;
  }

  if (data['type'] == 'message') {
    await _answerMessage(data, action: action, text: text, route: route);
    return;
  }

  final recipientId = data['recipientId'];
  final notificationId = data['notificationId'];
  if (recipientId is! String || notificationId is! String) return;
  if (action == 'reply' && (text == null || text.isEmpty)) {
    await showAlert(data, route: route, outcome: AlertOutcome.failed);
    return;
  }
  try {
    await NotificationActions.send(
      NotificationActions.request(
        recipientId: recipientId,
        notificationId: notificationId,
        action: action,
        text: action == 'reply' ? text : null,
      ),
    );
    switch (action) {
      case 'read':
        await cancelAlert(data);
      case 'like':
        await showAlert(data, route: route, outcome: AlertOutcome.liked);
      case 'reply':
        await showAlert(
          data,
          route: route,
          outcome: AlertOutcome.replied,
          replyText: text,
        );
    }
  } on Object catch (error) {
    // A read that could not be sent yet is still read as far as the shade is
    // concerned: it is queued, and the member asked for the alert to go.
    if (action == 'read') {
      await cancelAlert(data);
      return;
    }
    await showAlert(
      data,
      route: route,
      outcome: error is NotificationActionDeferred && error.queued
          ? AlertOutcome.queued
          : AlertOutcome.failed,
    );
  }
}

/// Reply and Mark as read on a message alert. Written straight to the thread,
/// exactly as the conversation screen writes them — the rules already let a
/// participant do both.
Future<void> _answerMessage(
  Map<String, dynamic> data, {
  required String action,
  required String? text,
  required String? route,
}) async {
  final threadId = data['threadId'];
  final senderId = data['senderId'];
  final uid = FirebaseAuth.instance.currentUser?.uid;
  // The alert names the account it was sent to. A phone that has since been
  // signed into another account must not answer on the new owner's behalf.
  if (threadId is! String ||
      uid == null ||
      uid != data['recipientId'] ||
      (action == 'reply' && (senderId is! String || senderId.isEmpty))) {
    await showAlert(data, route: route, outcome: AlertOutcome.failed);
    return;
  }
  final chats = ChatRepository(FirebaseFirestore.instance);
  try {
    if (action == 'read') {
      await chats
          .markRead(threadId: threadId, uid: uid)
          .timeout(const Duration(seconds: 8));
      await cancelAlert(data);
      return;
    }
    if (action != 'reply' || text == null || text.isEmpty) {
      await showAlert(data, route: route, outcome: AlertOutcome.failed);
      return;
    }
    await chats
        .replyFromAlert(
          threadId: threadId,
          senderUid: uid,
          recipientId: senderId as String,
          text: text,
        )
        .timeout(const Duration(seconds: 10));
    await showAlert(
      data,
      route: route,
      outcome: AlertOutcome.replied,
      replyText: text,
    );
  } on TimeoutException {
    // Firestore has the write and will deliver it when the phone is online;
    // the alert says so rather than claiming it failed.
    if (action == 'read') {
      await cancelAlert(data);
    } else {
      await showAlert(
        data,
        route: route,
        outcome: AlertOutcome.queued,
        replyText: text,
      );
    }
  } on Object catch (error) {
    debugPrint('Message action failed: $error');
    await showAlert(data, route: route, outcome: AlertOutcome.failed);
  }
}

/// Mark all as read, from a section's summary.
Future<void> _readAll(Map<String, dynamic> data) async {
  final uid = FirebaseAuth.instance.currentUser?.uid;
  if (uid == null || uid != data['recipientId']) return;
  final group = AlertGroup.values.where((g) => g.name == data['group']);
  if (group.isEmpty) return;
  try {
    if (group.single == AlertGroup.messages) {
      final chats = ChatRepository(FirebaseFirestore.instance);
      for (final alert in await activeAlertsIn(AlertGroup.messages)) {
        final threadId = alert['threadId'];
        if (threadId is String && alert['recipientId'] == uid) {
          await chats.markRead(threadId: threadId, uid: uid);
        }
      }
    } else {
      await NotificationsRepository(FirebaseFirestore.instance)
          .markAllRead(uid)
          .timeout(const Duration(seconds: 10));
    }
  } on Object catch (error) {
    debugPrint('Mark all as read failed (clearing the shade anyway): $error');
  }
  await clearAlertGroup(group.single);
}

/// The sample alert from Alert settings answers its own buttons, so somebody
/// can try every one of them without writing anything anywhere.
Future<void> _answerTest(
  Map<String, dynamic> data, {
  required String action,
  required String? text,
  required String? route,
}) async {
  switch (action) {
    case 'read':
      await cancelAlert(data);
    case 'like':
      await showAlert(data, route: route, outcome: AlertOutcome.liked);
    case 'reply':
      await showAlert(
        data,
        route: route,
        outcome: text == null || text.isEmpty
            ? AlertOutcome.failed
            : AlertOutcome.replied,
        replyText: text,
      );
  }
}
