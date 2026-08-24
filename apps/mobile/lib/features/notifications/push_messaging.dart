import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Preference key remembering whether the member has agreed to push alerts.
///
/// The OS prompt may only be shown once, so the answer is cached here and the
/// settings toggle reads it back rather than re-prompting into a silent denial.
const pushAlertsPreferenceKey = 'indigen_world_community_alerts_v1';

/// A push the member tapped, waiting for the app to route it.
///
/// Held as state rather than delivered as an event so a tap that arrives while
/// the app is still starting is not lost — the shell reads the pending value
/// once it has a router, then clears it.
class PendingPushRoute extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? route) => state = route;

  /// Returns the pending route and clears it, so one tap can only navigate
  /// once however many listeners are watching.
  String? take() {
    final route = state;
    if (route != null) state = null;
    return route;
  }
}

final pendingPushRouteProvider = NotifierProvider<PendingPushRoute, String?>(
  PendingPushRoute.new,
);

/// Registers this device for community push and keeps the token current.
///
/// Watched once by the shell. Everything is best-effort: a device that refuses
/// notifications, or a Play-Services-less handset that cannot mint a token,
/// still gets the full in-app notification centre from Firestore — push is the
/// convenience layer on top, never the source of truth.
final pushRegistrationProvider = Provider<void>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return;
  final uid = ref.watch(currentUidProvider);
  final repository = ref.watch(notificationsRepositoryProvider);
  if (uid == null || repository == null) return;

  final subscriptions = <StreamSubscription<Object?>>[];
  var disposed = false;

  Future<void> register(String token) async {
    if (disposed) return;
    try {
      await repository.registerDevice(
        uid: uid,
        token: token,
        platform: defaultTargetPlatform.name,
      );
    } on Object catch (error) {
      debugPrint('Push registration failed (continuing): $error');
    }
  }

  Future<void> start() async {
    final messaging = FirebaseMessaging.instance;
    try {
      // Only ask when the member already opted in from settings, or on iOS
      // where a provisional grant is silent. `getNotificationSettings` avoids
      // burning the one-shot Android 13 prompt on a cold first launch.
      final settings = await messaging.getNotificationSettings();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;

      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) await register(token);

      subscriptions.add(messaging.onTokenRefresh.listen(register));
    } on Object catch (error) {
      debugPrint('Push token lookup failed (continuing): $error');
    }
  }

  unawaited(start());

  // A push tapped while the app was backgrounded.
  subscriptions.add(
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      final route = pushRouteFor(message.data);
      if (route != null) {
        ref.read(pendingPushRouteProvider.notifier).set(route);
      }
    }),
  );

  // A push tapped while the app was terminated.
  unawaited(
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (disposed || message == null) return;
      final route = pushRouteFor(message.data);
      if (route != null) {
        ref.read(pendingPushRouteProvider.notifier).set(route);
      }
    }),
  );

  // Deliberately does NOT unregister the device here. This provider is
  // re-created whenever the member grants notification permission, and tearing
  // the registration down on every dispose raced the fresh write that follows
  // it — sometimes deleting the row the new instance had just created.
  // Unregistering belongs to sign-out, which is where it now lives.
  ref.onDispose(() {
    disposed = true;
    for (final subscription in subscriptions) {
      unawaited(subscription.cancel());
    }
  });
});

/// Drops this device's push registration.
///
/// Called on sign-out so alerts meant for one account never follow a shared
/// handset to whoever signs in next. Best-effort: failing to clean up must
/// never block somebody from signing out.
Future<void> unregisterThisDevice(WidgetRef ref) async {
  final repository = ref.read(notificationsRepositoryProvider);
  if (repository == null) return;
  try {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null && token.isNotEmpty) {
      await repository.unregisterDevice(token);
    }
  } on Object catch (error) {
    debugPrint('Could not unregister this device (continuing): $error');
  }
}

/// The in-app route a push payload points at, or `null` when it carries none.
///
/// Pure so it can be unit-tested without Firebase: the payload shape is the
/// contract between the fan-out Cloud Function and this app, and getting it
/// wrong silently drops every deep link.
String? pushRouteFor(Map<String, dynamic> data) {
  final route = data['route'];
  if (route is String && route.startsWith('/')) return route;
  final postId = data['postId'];
  if (postId is String && postId.isNotEmpty) return '/post/$postId';
  final type = data['type'];
  if (type is String && type.isNotEmpty) return '/notifications';
  return null;
}

/// Turns push alerts on or off for this device, end to end.
///
/// Both halves have to happen, or the switch lies. Turning on needs the OS
/// grant *and* a device registration — [pushRegistrationProvider] gave up at
/// launch when permission had not been granted yet, so it is re-run here.
/// Turning off needs the registration removed, not just a preference written:
/// leaving the row behind meant alerts kept arriving after the member had
/// plainly said no.
///
/// Returns whether alerts are on afterwards.
Future<bool> setPushAlerts(WidgetRef ref, {required bool enabled}) async {
  final preferences = await SharedPreferences.getInstance();

  if (!enabled) {
    await unregisterThisDevice(ref);
    await preferences.setBool(pushAlertsPreferenceKey, false);
    ref.invalidate(pushRegistrationProvider);
    return false;
  }

  final settings = await FirebaseMessaging.instance.requestPermission();
  final granted =
      settings.authorizationStatus == AuthorizationStatus.authorized ||
      settings.authorizationStatus == AuthorizationStatus.provisional;
  await preferences.setBool(pushAlertsPreferenceKey, granted);
  if (granted) {
    ref.invalidate(pushRegistrationProvider);
  }
  return granted;
}
