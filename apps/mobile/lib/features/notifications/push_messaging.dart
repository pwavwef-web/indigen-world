import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/local_alerts.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Preference key remembering whether the member has agreed to push alerts.
///
/// The OS prompt may only be shown once, so the answer is cached here and the
/// settings toggle reads it back rather than re-prompting into a silent denial.
const pushAlertsPreferenceKey = 'indigen_world_community_alerts_v1';

/// Whether the first-run primer has already had its one chance.
///
/// Separate from [pushAlertsPreferenceKey], which cannot tell "said no" apart
/// from "was never asked" — and the difference decides whether somebody sees
/// the primer at all.
const pushPrimerShownKey = 'indigen_world_push_primer_v1';

/// When the member last declined, in milliseconds since the epoch.
const pushDeclinedAtKey = 'indigen_world_push_declined_at_v1';

/// Whether the one contextual re-ask has already been spent.
const pushNudgeShownKey = 'indigen_world_push_nudge_v1';

/// Whether message bodies may be drawn on this device's lock screen.
///
/// Stored per device rather than per account, and mirrored onto the device's
/// registration row so the fan-out can honour it when it addresses this
/// handset. Defaults to on: a message you cannot read is a worse alert than no
/// alert, and the member who needs it off is the one who will go looking.
const messagePreviewsKey = 'indigen_world_message_previews_v1';

/// How long a decline is left alone before the single contextual re-ask.
const pushReaskInterval = Duration(days: 3);

/// The FCM topic community announcements are broadcast on.
///
/// Distinct from per-member alerts: it carries project news rather than
/// anything about you, and it needs no account, so a guest who says yes still
/// hears about a new release.
const communityTopic = 'community-updates';

/// Whether this device wants message bodies on its lock screen.
Future<bool> messagePreviewsEnabled() async {
  final preferences = await SharedPreferences.getInstance();
  return preferences.getBool(messagePreviewsKey) ?? true;
}

/// Whether the first-run primer still has to be shown.
///
/// True exactly once per install. Everything after that is the settings toggle
/// or the single nudge in [shouldOfferPushNudge].
Future<bool> pushPrimerNeeded() async {
  final preferences = await SharedPreferences.getInstance();
  return !(preferences.getBool(pushPrimerShownKey) ?? false);
}

/// Records that the primer has been shown, whatever the member answered.
///
/// Written for a decline as well as a grant. The primer costs the one Android
/// 13 prompt this install will ever get, so it must not be able to run twice.
Future<void> recordPushPrimerShown({required bool granted}) async {
  final preferences = await SharedPreferences.getInstance();
  await preferences.setBool(pushPrimerShownKey, true);
  if (!granted) {
    await preferences.setInt(
      pushDeclinedAtKey,
      DateTime.now().millisecondsSinceEpoch,
    );
  }
}

/// Whether it is fair to ask a second time, in context.
///
/// One decline is not an invitation to keep asking, but it is not forever
/// either. Exactly one re-ask is allowed, and only once the first answer has
/// had [pushReaskInterval] to stop being the member's most recent thought
/// about it.
Future<bool> shouldOfferPushNudge({DateTime? now}) async {
  final preferences = await SharedPreferences.getInstance();
  if (preferences.getBool(pushAlertsPreferenceKey) ?? false) return false;
  if (!(preferences.getBool(pushPrimerShownKey) ?? false)) return false;
  if (preferences.getBool(pushNudgeShownKey) ?? false) return false;
  final declinedAt = preferences.getInt(pushDeclinedAtKey);
  if (declinedAt == null) return false;
  final elapsed = (now ?? DateTime.now()).difference(
    DateTime.fromMillisecondsSinceEpoch(declinedAt),
  );
  return elapsed >= pushReaskInterval;
}

/// Spends the one contextual re-ask, whatever came of it.
Future<void> recordPushNudgeShown() async {
  final preferences = await SharedPreferences.getInstance();
  await preferences.setBool(pushNudgeShownKey, true);
}

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
        messagePreviews: await messagePreviewsEnabled(),
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

/// Draws alerts that arrive while somebody is looking at the app.
///
/// FCM only posts a notification itself when the app is backgrounded; in the
/// foreground it hands the message to `onMessage` and draws nothing. Without
/// this, an alert that lands mid-session is silently swallowed.
///
/// Deliberately independent of [pushRegistrationProvider] and of the signed-in
/// account: broadcast announcements reach a guest device through the topic, and
/// a guest looking at the app should see them like anybody else.
final foregroundAlertsProvider = Provider<void>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return;

  final subscriptions = <StreamSubscription<Object?>>[];
  var disposed = false;

  void route(String route) {
    if (disposed) return;
    ref.read(pendingPushRouteProvider.notifier).set(route);
  }

  Future<void> start() async {
    try {
      await initializeLocalAlerts(onRoute: route);
    } on Object catch (error) {
      debugPrint('Local alerts unavailable (continuing): $error');
      return;
    }
    if (disposed) return;
    subscriptions.add(
      FirebaseMessaging.onMessage.listen((message) {
        // Never announce the message somebody is in the middle of reading.
        if (isForOpenThread(message.data, ref.read(activeChatThreadProvider))) {
          return;
        }
        unawaited(
          showForegroundAlert(message, route: pushRouteFor(message.data)),
        );
      }),
    );
  }

  unawaited(start());

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

/// Whether [data] is a message in the conversation [openThreadId] is showing.
///
/// Pure so the rule can be tested without a device: getting it wrong either
/// notifies somebody about the line they are reading, or — far worse — silently
/// swallows a message from a different conversation.
bool isForOpenThread(Map<String, dynamic> data, String? openThreadId) {
  if (openThreadId == null || openThreadId.isEmpty) return false;
  if (data['type'] != 'message') return false;
  return data['threadId'] == openThreadId;
}

/// The in-app route a push payload points at, or `null` when it carries none.
///
/// Pure so it can be unit-tested without Firebase: the payload shape is the
/// contract between the fan-out Cloud Function and this app, and getting it
/// wrong silently drops every deep link.
String? pushRouteFor(Map<String, dynamic> data) {
  final route = data['route'];
  if (route is String && route.startsWith('/')) return route;
  final threadId = data['threadId'];
  if (threadId is String && threadId.isNotEmpty) return '/chat/$threadId';
  final postId = data['postId'];
  if (postId is String && postId.isNotEmpty) return '/post/$postId';
  final type = data['type'];
  // A conversation writes no row to the alert centre, so the centre is the one
  // place a message must never fall back to. The inbox is where it lives.
  if (type == 'message') return '/messages';
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
/// The broadcast topic moves with the switch. It is separate from per-member
/// alerts but it is not a separate decision — somebody who has said no to
/// alerts has said no to announcements too.
///
/// Returns whether alerts are on afterwards.
Future<bool> setPushAlerts(WidgetRef ref, {required bool enabled}) async {
  final preferences = await SharedPreferences.getInstance();

  if (!enabled) {
    await unregisterThisDevice(ref);
    await preferences.setBool(pushAlertsPreferenceKey, false);
    await _setTopic(subscribed: false);
    ref.invalidate(pushRegistrationProvider);
    return false;
  }

  final settings = await FirebaseMessaging.instance.requestPermission();
  final granted =
      settings.authorizationStatus == AuthorizationStatus.authorized ||
      settings.authorizationStatus == AuthorizationStatus.provisional;
  await preferences.setBool(pushAlertsPreferenceKey, granted);
  await _setTopic(subscribed: granted);
  if (granted) {
    ref.invalidate(pushRegistrationProvider);
  }
  return granted;
}

/// Turns lock-screen message previews on or off for this device.
///
/// The stored answer is what a fresh registration reads, and re-running the
/// registration is what carries the change to the device row the fan-out
/// consults — so both have to happen, in that order.
Future<void> setMessagePreviews(WidgetRef ref, {required bool enabled}) async {
  final preferences = await SharedPreferences.getInstance();
  await preferences.setBool(messagePreviewsKey, enabled);
  ref.invalidate(pushRegistrationProvider);
}

/// Joins or leaves [communityTopic]. Best-effort: a failed subscription costs
/// announcements, and must never be the reason the switch reports failure.
Future<void> _setTopic({required bool subscribed}) async {
  try {
    final messaging = FirebaseMessaging.instance;
    if (subscribed) {
      await messaging.subscribeToTopic(communityTopic);
    } else {
      await messaging.unsubscribeFromTopic(communityTopic);
    }
  } on Object catch (error) {
    debugPrint('Could not update the announcements topic (continuing): $error');
  }
}
