import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:crypto/crypto.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/firebase_bootstrap.dart'
    show firebaseOptionsFor;

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
      throw StateError(
        'Sign in to the account that received this notification.',
      );
    }
    try {
      await FirebaseFunctions.instance
          .httpsCallable('notificationAction')
          .call<dynamic>(action);
    } on FirebaseFunctionsException catch (e) {
      if (!['unavailable', 'deadline-exceeded', 'internal'].contains(e.code))
        rethrow;
      await _queue(action);
      throw StateError('Action saved for retry when this account reconnects.');
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
        if (action['action'] == 'read' && action['alertId'] is int)
          await FlutterLocalNotificationsPlugin().cancel(
            id: action['alertId'] as int,
          );
        queue.remove(action);
      } on FirebaseFunctionsException catch (e) {
        if ([
          'permission-denied',
          'not-found',
          'invalid-argument',
          'failed-precondition',
        ].contains(e.code))
          queue.remove(action);
        else
          break;
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
    if (text != null) 'text': text,
  };
}

@pragma('vm:entry-point')
Future<void> notificationActionBackground(NotificationResponse response) async {
  if (Firebase.apps.isEmpty)
    await Firebase.initializeApp(options: firebaseOptionsFor(appEnvironment));
  await handleNotificationAction(response);
}

Future<void> handleNotificationAction(NotificationResponse response) async {
  if (response.actionId == null ||
      response.actionId!.isEmpty ||
      response.payload?.startsWith('{') != true)
    return;
  final payload = Map<String, dynamic>.from(
    jsonDecode(response.payload!) as Map,
  );
  final action = response.actionId!;
  await NotificationActions.send({
    ...NotificationActions.request(
      recipientId: payload['recipientId'],
      notificationId: payload['notificationId'],
      action: action,
      text: action == 'reply' ? response.input : null,
    ),
    if (response.id != null) 'alertId': response.id,
  });
  if (action == 'read')
    await FlutterLocalNotificationsPlugin().cancel(id: response.id ?? 0);
}
