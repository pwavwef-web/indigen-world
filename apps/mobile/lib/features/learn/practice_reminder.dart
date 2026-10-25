import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/notifications/local_alerts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as tz;

/// A daily nudge to practise, at a time the member chose.
///
/// ── Why local, not a push ─────────────────────────────────────────────────
/// The streak lives on the phone first — learning works signed out — so the
/// phone is the one place that knows, at seven in the evening, whether today
/// has been kept. A push from the backend would have to guess, and a reminder
/// to practise sent to somebody who practised an hour ago teaches them to
/// ignore the reminders.
///
/// ── Why seven one-shots, not one repeating alarm ──────────────────────────
/// A repeating alarm cannot skip a day. Seven single reminders, one per day
/// ahead, can: today's is simply not scheduled once today is kept. The week is
/// rebuilt every time the app opens or a day is kept, so somebody who opens
/// the app at all in a week never runs out; somebody who does not gets a week
/// of nudges and then silence, which is the polite end of a reminder.

/// Where the switch and the time are written down.
const practiceReminderOnKey = 'indigen_practice_reminder_on_v1';
const practiceReminderAtKey = 'indigen_practice_reminder_at_v1';

/// 19:00 — after work and school, before the evening is gone.
const practiceReminderDefaultMinute = 19 * 60;

/// How many days ahead are scheduled.
const practiceReminderDays = 7;

/// Whether this phone has reminders sitting in the schedule right now.
const _scheduledKey = 'indigen_practice_reminder_scheduled_v1';

/// The notification ids the week uses, one per day ahead. Fixed, so the whole
/// week can be cancelled without remembering what was scheduled.
const _reminderIdBase = 7400;

/// Where a tapped reminder lands: straight into today's review.
const practiceReminderRoute = '/learn/review';

const _reminderChannel = AndroidNotificationChannel(
  'indigen_practice',
  'Practice reminders',
  description: 'The daily reminder to practise, at the time you chose.',
);

/// The reminder settings.
@immutable
class PracticeReminder {
  const PracticeReminder({
    this.enabled = false,
    this.minuteOfDay = practiceReminderDefaultMinute,
  });

  final bool enabled;

  /// Minutes after midnight, local time.
  final int minuteOfDay;

  int get hour => minuteOfDay ~/ 60;
  int get minute => minuteOfDay % 60;

  PracticeReminder copyWith({bool? enabled, int? minuteOfDay}) =>
      PracticeReminder(
        enabled: enabled ?? this.enabled,
        minuteOfDay: minuteOfDay ?? this.minuteOfDay,
      );

  @override
  bool operator ==(Object other) =>
      other is PracticeReminder &&
      other.enabled == enabled &&
      other.minuteOfDay == minuteOfDay;

  @override
  int get hashCode => Object.hash(enabled, minuteOfDay);
}

/// The local times the next reminders should fire at.
///
/// Today is included only while it is still ahead and not yet kept; the rest
/// of the [days] follow at the same time of day.
@visibleForTesting
List<DateTime> practiceReminderTimes({
  required DateTime now,
  required int minuteOfDay,
  required bool practisedToday,
  int days = practiceReminderDays,
}) {
  final today = DateTime(now.year, now.month, now.day);
  final times = <DateTime>[];
  for (var offset = 0; times.length < days && offset <= days; offset++) {
    final day = DateTime(today.year, today.month, today.day + offset);
    final at = DateTime(
      day.year,
      day.month,
      day.day,
      minuteOfDay ~/ 60,
      minuteOfDay % 60,
    );
    if (offset == 0 && (practisedToday || !at.isAfter(now))) continue;
    times.add(at);
  }
  return times;
}

/// What a reminder says. Today's can name the streak it would keep; a day
/// further ahead cannot know what the streak will be by then.
@visibleForTesting
({String title, String body}) practiceReminderText({
  required bool isToday,
  required int streakDays,
}) {
  if (isToday && streakDays > 0) {
    return (
      title: 'Keep your $streakDays-day streak',
      body: 'Five minutes of Kasem keeps it going. Your words are waiting.',
    );
  }
  return (
    title: 'Five minutes of Kasem',
    body: 'A few words, a listen, a review — today’s practice is ready.',
  );
}

class PracticeReminderController extends Notifier<PracticeReminder> {
  @override
  PracticeReminder build() {
    unawaited(_restore());
    return const PracticeReminder();
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      state = PracticeReminder(
        enabled: preferences.getBool(practiceReminderOnKey) ?? false,
        minuteOfDay:
            preferences.getInt(practiceReminderAtKey) ??
            practiceReminderDefaultMinute,
      );
    } on Object {
      // Off, which is what a first launch is anyway.
    }
  }

  Future<void> setEnabled(bool enabled) =>
      _save(state.copyWith(enabled: enabled));

  Future<void> setTime(int minuteOfDay) =>
      _save(state.copyWith(minuteOfDay: minuteOfDay.clamp(0, 24 * 60 - 1)));

  Future<void> _save(PracticeReminder next) async {
    state = next;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(practiceReminderOnKey, next.enabled);
      await preferences.setInt(practiceReminderAtKey, next.minuteOfDay);
    } on Object {
      // Holds for this session.
    }
  }
}

final practiceReminderProvider =
    NotifierProvider<PracticeReminderController, PracticeReminder>(
      PracticeReminderController.new,
    );

/// Something that can put the week of reminders on the phone. A seam, so the
/// scheduling decision can be tested without the plugin.
abstract interface class PracticeReminderScheduler {
  Future<void> replaceWeek(
    List<({DateTime at, String title, String body})> reminders,
  );
}

class LocalPracticeReminderScheduler implements PracticeReminderScheduler {
  const LocalPracticeReminderScheduler();

  @override
  Future<void> replaceWeek(
    List<({DateTime at, String title, String body})> reminders,
  ) async {
    // A no-op when the app's own start-up has already readied the plugin,
    // which is what wires a tapped reminder to its route.
    await ensureAlertsReady();
    // The plugin is a process singleton: this is the instance alerts use.
    final plugin = FlutterLocalNotificationsPlugin();
    final android = plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(_reminderChannel);
    for (var offset = 0; offset <= practiceReminderDays; offset++) {
      await plugin.cancel(id: _reminderIdBase + offset);
    }
    for (final (index, reminder) in reminders.indexed) {
      await plugin.zonedSchedule(
        id: _reminderIdBase + index,
        title: reminder.title,
        body: reminder.body,
        // An instant, not a wall-clock time: each reminder fires once, so the
        // UTC instant of the local time is all the schedule needs, and no
        // time-zone database has to be loaded to say it.
        scheduledDate: tz.TZDateTime.from(reminder.at.toUtc(), tz.UTC),
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            _reminderChannel.id,
            _reminderChannel.name,
            channelDescription: _reminderChannel.description,
            icon: 'ic_notification',
            category: AndroidNotificationCategory.reminder,
          ),
          iOS: const DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        payload: jsonEncode({'route': practiceReminderRoute}),
      );
    }
  }
}

final practiceReminderSchedulerProvider = Provider<PracticeReminderScheduler>(
  (ref) => const LocalPracticeReminderScheduler(),
);

/// Keeps the week of reminders matching the settings and today's practice.
///
/// Watched by the shell. It reschedules only when something the schedule
/// depends on changes — the switch, the time, whether today is kept, the
/// streak — not on every answer in a review.
final practiceReminderSyncProvider = FutureProvider<void>((ref) async {
  final settings = ref.watch(practiceReminderProvider);
  final kept = ref.watch(
    learnProgressProvider.select(
      (progress) => (
        today: progress.asData?.value.activeToday ?? false,
        streak: progress.asData?.value.streakDays ?? 0,
        loaded: progress.hasValue,
      ),
    ),
  );
  // Until progress has loaded, "not practised today" would be a guess.
  if (settings.enabled && !kept.loaded) return;
  // Off, and never on since anything was scheduled: nothing to cancel, and no
  // reason to wake the notifications plugin on every launch for it.
  final preferences = await SharedPreferences.getInstance();
  final scheduledBefore = preferences.getBool(_scheduledKey) ?? false;
  if (!settings.enabled && !scheduledBefore) return;
  final scheduler = ref.read(practiceReminderSchedulerProvider);
  final now = learnNow();
  final times = settings.enabled
      ? practiceReminderTimes(
          now: now,
          minuteOfDay: settings.minuteOfDay,
          practisedToday: kept.today,
        )
      : const <DateTime>[];
  try {
    await scheduler.replaceWeek([
      for (final at in times)
        () {
          final text = practiceReminderText(
            isToday: LearnProgress.isSameDay(at, now),
            streakDays: kept.streak,
          );
          return (at: at, title: text.title, body: text.body);
        }(),
    ]);
    await preferences.setBool(_scheduledKey, times.isNotEmpty);
  } on Object catch (error) {
    debugPrint('Practice reminders could not be scheduled: $error');
  }
});
