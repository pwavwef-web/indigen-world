import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// When and where an Event post happens.
///
/// Optional, and only ever on a post labelled Event: the label is what says a
/// post is about a gathering, and this is what lets the feed say *when* — a
/// date tile, "In 3 days", and a reminder the reader can set on their own
/// phone. There is no guest list. Who is coming is a conversation for the
/// replies, and a count nobody can verify would only invite padding it.
@immutable
class PostEvent {
  const PostEvent({required this.startsAt, this.place = ''});

  /// The moment it starts, as an instant. Drawn in the reader's own time.
  final DateTime startsAt;

  /// Where, in the author's words — a compound, a church, a town. Free text,
  /// because the places people gather are rarely on a map.
  final String place;

  static const maxPlaceLength = 80;

  static PostEvent? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final at = raw['startsAt'];
    final startsAt = switch (at) {
      final Timestamp stamp => stamp.toDate(),
      final DateTime time => time,
      final int millis => DateTime.fromMillisecondsSinceEpoch(millis),
      final String iso => DateTime.tryParse(iso),
      _ => null,
    };
    if (startsAt == null) return null;
    final place = raw['place'];
    return PostEvent(
      startsAt: startsAt,
      place: place is String ? place.trim() : '',
    );
  }

  Map<String, Object?> toMap() => {
    'startsAt': Timestamp.fromDate(startsAt),
    if (place.isNotEmpty) 'place': place,
  };

  /// For the on-device draft store, which cannot hold a [Timestamp].
  Map<String, Object?> toJson() => {
    'startsAt': startsAt.millisecondsSinceEpoch,
    if (place.isNotEmpty) 'place': place,
  };

  @override
  bool operator ==(Object other) =>
      other is PostEvent && other.startsAt == startsAt && other.place == place;

  @override
  int get hashCode => Object.hash(startsAt, place);
}

/// How far off an event is, said the way people say it: "Today", "Tomorrow",
/// "In 3 days", "Now", "Ended".
///
/// Counted in calendar days of the reader's own clock, not in 24-hour blocks:
/// something at nine tomorrow morning is "Tomorrow" at ten tonight, although
/// it is only eleven hours away.
String eventCountdownLabel(
  DateTime startsAt, {
  required DateTime now,
  Duration runsFor = const Duration(hours: 3),
}) {
  final start = startsAt.toLocal();
  final local = now.toLocal();
  if (!start.isAfter(local)) {
    // An event has no end time, so a few hours after its start is taken as
    // still going rather than over the moment it begins.
    return local.isBefore(start.add(runsFor)) ? 'Happening now' : 'Ended';
  }
  final today = DateTime(local.year, local.month, local.day);
  final day = DateTime(start.year, start.month, start.day);
  final days = day.difference(today).inDays;
  return switch (days) {
    0 => 'Today',
    1 => 'Tomorrow',
    < 7 => 'In $days days',
    < 14 => 'Next week',
    _ => 'In ${(days / 7).floor()} weeks',
  };
}

/// "Sat 14 Nov · 4:30 pm", in the reader's own time.
String eventWhenLabel(DateTime startsAt) {
  final at = startsAt.toLocal();
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
  final minute = at.minute.toString().padLeft(2, '0');
  final half = at.hour < 12 ? 'am' : 'pm';
  return '${weekdays[at.weekday - 1]} ${at.day} ${months[at.month - 1]}'
      ' · $hour:$minute $half';
}

/// The month and day for the date tile: ("NOV", "14").
({String month, String day}) eventDateTile(DateTime startsAt) {
  final at = startsAt.toLocal();
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return (month: months[at.month - 1], day: '${at.day}');
}
