import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/notifications/local_alerts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as tz;

/// "Remind me" on an Event post: one notification on this phone, an hour
/// before it starts.
///
/// ── Why local, like the practice reminder ─────────────────────────────────
/// A reminder is the reader's own business. Nobody — not the author, not the
/// backend — needs to know who asked, and a push would need both. The phone
/// already knows the time; it is the right place to keep the appointment.
///
/// No guest list follows from this either. See `PostEvent` for why.

/// How long before the start the reminder fires.
const eventReminderLead = Duration(hours: 1);

/// Most reminders kept at once.
const maxEventReminders = 30;

const eventRemindersKey = 'indigen_community_event_reminders_v1';

/// Notification ids for event reminders start here, clear of the practice
/// reminder's week (7400–7407).
const _eventReminderIdBase = 7600;

const _eventChannel = AndroidNotificationChannel(
  'indigen_events',
  'Event reminders',
  description: 'Reminders you set on community event posts.',
);

/// A reminder the member has set.
@immutable
class EventReminder {
  const EventReminder({
    required this.postId,
    required this.title,
    required this.startsAt,
    this.privateCommunityId,
  });

  final String postId;
  final String title;
  final DateTime startsAt;
  final String? privateCommunityId;

  DateTime get firesAt => startsAt.subtract(eventReminderLead);

  /// The route a tapped reminder opens: the post itself.
  String get route => privateCommunityId == null
      ? '/post/$postId'
      : '/post/$postId?community=${Uri.encodeQueryComponent(privateCommunityId!)}';

  Map<String, Object?> toJson() => {
    'postId': postId,
    'title': title,
    'startsAt': startsAt.millisecondsSinceEpoch,
    'community': ?privateCommunityId,
  };

  static EventReminder? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final postId = raw['postId'];
    final startsAt = raw['startsAt'];
    if (postId is! String || startsAt is! int) return null;
    return EventReminder(
      postId: postId,
      title: raw['title'] is String ? raw['title'] as String : 'An event',
      startsAt: DateTime.fromMillisecondsSinceEpoch(startsAt),
      privateCommunityId: raw['community'] is String
          ? raw['community'] as String
          : null,
    );
  }
}

/// The reminder for [post], or null when it is not an event that can still be
/// reminded about at [now].
EventReminder? eventReminderFor(CommunityPost post, {required DateTime now}) {
  final event = post.event;
  if (event == null || !event.startsAt.isAfter(now)) return null;
  final firstLine = post.text.trim().split('\n').first.trim();
  return EventReminder(
    postId: post.id,
    title: firstLine.isEmpty
        ? 'An event from ${post.authorName}'
        : (firstLine.length > 80
              ? '${firstLine.substring(0, 79)}…'
              : firstLine),
    startsAt: event.startsAt,
    privateCommunityId: post.privateCommunityId,
  );
}

/// What the notification says.
@visibleForTesting
({String title, String body}) eventReminderText(EventReminder reminder) {
  final at = reminder.startsAt.toLocal();
  final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
  final minute = at.minute.toString().padLeft(2, '0');
  final half = at.hour < 12 ? 'am' : 'pm';
  return (title: 'Starting at $hour:$minute $half', body: reminder.title);
}

/// Puts reminders on the phone and takes them off. A seam, so the decision of
/// what to schedule can be tested without the plugin.
abstract interface class EventReminderScheduler {
  Future<bool> schedule(EventReminder reminder, {required int slot});
  Future<void> cancel({required int slot});
}

class LocalEventReminderScheduler implements EventReminderScheduler {
  const LocalEventReminderScheduler();

  @override
  Future<bool> schedule(EventReminder reminder, {required int slot}) async {
    await ensureAlertsReady();
    final plugin = FlutterLocalNotificationsPlugin();
    final android = plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(_eventChannel);
    if (Platform.isAndroid) {
      // Android 13 and later post nothing without the grant. Asked now, when
      // somebody has just said they want this reminder.
      try {
        await android?.requestNotificationsPermission();
      } on Object {
        // Refused or unavailable: the reminder is still kept, and appears if
        // alerts are allowed before it fires.
      }
    }
    // An event less than an hour off still gets its reminder, a minute from
    // now; one about to start has nothing left to remind anybody of.
    final soonest = DateTime.now().add(const Duration(minutes: 1));
    if (!reminder.startsAt.isAfter(soonest)) return false;
    final firesAt = reminder.firesAt.isAfter(soonest)
        ? reminder.firesAt
        : soonest;
    final text = eventReminderText(reminder);
    await plugin.zonedSchedule(
      id: _eventReminderIdBase + slot,
      title: text.title,
      body: text.body,
      scheduledDate: tz.TZDateTime.from(firesAt.toUtc(), tz.UTC),
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _eventChannel.id,
          _eventChannel.name,
          channelDescription: _eventChannel.description,
          icon: 'ic_notification',
          category: AndroidNotificationCategory.reminder,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: jsonEncode({'route': reminder.route}),
    );
    return true;
  }

  @override
  Future<void> cancel({required int slot}) async {
    await ensureAlertsReady();
    await FlutterLocalNotificationsPlugin().cancel(
      id: _eventReminderIdBase + slot,
    );
  }
}

final eventReminderSchedulerProvider = Provider<EventReminderScheduler>(
  (ref) => const LocalEventReminderScheduler(),
);

/// Which slot a post's reminder uses. Derived from the post id rather than
/// counted, so cancelling never needs a lookup table that could fall out of
/// step with the system's own schedule.
@visibleForTesting
int eventReminderSlot(String postId) {
  var hash = 0;
  for (final unit in postId.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return hash % 1000;
}

class EventRemindersController extends Notifier<Map<String, EventReminder>> {
  @override
  Map<String, EventReminder> build() {
    unawaited(_restore());
    return const <String, EventReminder>{};
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(eventRemindersKey);
      if (raw == null) return;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      final now = DateTime.now();
      state = {
        for (final reminder
            in decoded.map(EventReminder.fromJson).whereType<EventReminder>())
          // Past events fall away on their own; their reminder has fired.
          if (reminder.startsAt.isAfter(now)) reminder.postId: reminder,
        ...state,
      };
    } on Object {
      // None set.
    }
  }

  bool isSet(String postId) => state.containsKey(postId);

  /// Sets a reminder for [reminder.postId]. Returns false when it could not be
  /// put on the phone.
  Future<bool> set(EventReminder reminder) async {
    if (state.length >= maxEventReminders &&
        !state.containsKey(reminder.postId)) {
      return false;
    }
    try {
      final scheduled = await ref
          .read(eventReminderSchedulerProvider)
          .schedule(reminder, slot: eventReminderSlot(reminder.postId));
      if (!scheduled) return false;
    } on Object catch (error) {
      debugPrint('Event reminder could not be scheduled: $error');
      return false;
    }
    await _write({...state, reminder.postId: reminder});
    return true;
  }

  Future<void> clear(String postId) async {
    try {
      await ref
          .read(eventReminderSchedulerProvider)
          .cancel(slot: eventReminderSlot(postId));
    } on Object catch (error) {
      debugPrint('Event reminder could not be cancelled: $error');
    }
    await _write({
      for (final MapEntry(:key, :value) in state.entries)
        if (key != postId) key: value,
    });
  }

  Future<void> _write(Map<String, EventReminder> next) async {
    state = Map.unmodifiable(next);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        eventRemindersKey,
        jsonEncode([for (final reminder in next.values) reminder.toJson()]),
      );
    } on Object {
      // Holds for this session.
    }
  }
}

final eventRemindersProvider =
    NotifierProvider<EventRemindersController, Map<String, EventReminder>>(
      EventRemindersController.new,
    );
