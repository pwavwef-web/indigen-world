import 'package:flutter/foundation.dart';

/// The learner's calendar: days as the phone's own clock and timezone see them.
///
/// Every piece of learning progress that is about *when* — the streak, the
/// week of ticks, today's goal — is recorded against a day key like
/// `2026-09-14` rather than a timestamp. Two reasons, and both are the point:
///
///   * **The learner's timezone decides what "today" is.** A lesson finished at
///     11pm in Navrongo belongs to that evening, not to whatever day it already
///     is in UTC. The key is computed from the device's local time at the
///     moment the work is done, and never recomputed afterwards.
///   * **A day can only be counted once.** Days live in sets, so finishing five
///     lessons, replaying one, or syncing the same day from two phones adds one
///     key and moves the streak by exactly one day. Nothing downstream has to
///     remember to deduplicate.

/// The clock the learning path reads. Tests replace it; nothing else should.
@visibleForTesting
DateTime Function() learnClock = DateTime.now;

DateTime learnNow() => learnClock();

/// `yyyy-MM-dd` for [day] in local time.
String dayKey(DateTime day) {
  final local = day.isUtc ? day.toLocal() : day;
  final month = local.month.toString().padLeft(2, '0');
  final date = local.day.toString().padLeft(2, '0');
  return '${local.year.toString().padLeft(4, '0')}-$month-$date';
}

/// The local midnight a key names, or null for anything that is not a key.
DateTime? parseDayKey(String key) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(key);
  if (match == null) return null;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  final parsed = DateTime(year, month, day);
  // DateTime rolls 2026-02-31 into March; a key that does that is not a key.
  if (parsed.year != year || parsed.month != month || parsed.day != day) {
    return null;
  }
  return parsed;
}

bool isDayKey(String key) => parseDayKey(key) != null;

/// Local midnight of [day].
DateTime startOfDay(DateTime day) => DateTime(day.year, day.month, day.day);

/// [days] calendar days after [day], by date rather than by 24-hour steps, so
/// a daylight-saving change never skips or repeats a day.
DateTime addDays(DateTime day, int days) =>
    DateTime(day.year, day.month, day.day + days);

/// The Monday of the week [day] falls in. Weeks run Monday to Sunday.
DateTime startOfWeek(DateTime day) =>
    addDays(startOfDay(day), -(day.weekday - DateTime.monday));

/// The seven days of [day]'s week, Monday first.
List<DateTime> weekOf(DateTime day) {
  final monday = startOfWeek(day);
  return [for (var offset = 0; offset < 7; offset++) addDays(monday, offset)];
}
