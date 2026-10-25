import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the reading size is written down.
const readingScalePreferenceKey = 'indigen_reading_scale_v1';

/// Where long works keep their place.
const readingPlacesPreferenceKey = 'indigen_reading_places_v1';

/// The sizes offered for reading, smallest first. 1 is the page as designed.
const readingScales = <double>[0.9, 1, 1.15, 1.3, 1.5, 1.7];

/// How many works keep a place.
const readingPlacesLimit = 30;

/// A work this long is worth coming back to the middle of; anything shorter
/// is read in one go, and reopening it halfway down would only be confusing.
const readingPlaceMinimumLength = 1500;

/// The next size up or down from [current], or [current] at either end.
double stepReadingScale(double current, {required bool larger}) {
  final index = readingScales.indexWhere((scale) => scale >= current - 0.001);
  final at = index < 0 ? readingScales.length - 1 : index;
  final next = (at + (larger ? 1 : -1)).clamp(0, readingScales.length - 1);
  return readingScales[next];
}

/// The text size for reading published works — the same on every work, kept
/// on this phone.
class ReadingScaleController extends Notifier<double> {
  @override
  double build() {
    unawaited(_restore());
    return 1;
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getDouble(readingScalePreferenceKey);
      if (stored != null && readingScales.contains(stored)) state = stored;
    } on Object {
      // The size as designed.
    }
  }

  Future<void> step({required bool larger}) async {
    state = stepReadingScale(state, larger: larger);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setDouble(readingScalePreferenceKey, state);
    } on Object {
      // Holds for this session.
    }
  }
}

final readingScaleProvider = NotifierProvider<ReadingScaleController, double>(
  ReadingScaleController.new,
);

/// [places] with [itemId] at [offset], the most recently read kept.
@visibleForTesting
Map<String, double> withReadingPlace(
  Map<String, double> places,
  String itemId,
  double offset, {
  int limit = readingPlacesLimit,
}) {
  // Insertion order is recency: the newest place goes last, the oldest
  // falls off the front.
  final next = {...places}..remove(itemId);
  if (offset > 0) next[itemId] = offset;
  final drop = next.length - limit;
  if (drop > 0) {
    final oldest = next.keys.take(drop).toSet();
    next.removeWhere((key, _) => oldest.contains(key));
  }
  return next;
}

Future<Map<String, double>> _readPlaces() async {
  final preferences = await SharedPreferences.getInstance();
  final stored = preferences.getString(readingPlacesPreferenceKey);
  if (stored == null || stored.isEmpty) return <String, double>{};
  final decoded = jsonDecode(stored);
  if (decoded is! Map) return <String, double>{};
  return {
    for (final entry in decoded.entries)
      if (entry.value is num) '${entry.key}': (entry.value as num).toDouble(),
  };
}

/// Where somebody stopped reading [itemId], or null.
Future<double?> readingPlaceOf(String itemId) async {
  try {
    return (await _readPlaces())[itemId];
  } on Object {
    return null;
  }
}

/// Remembers how far down [itemId] somebody has read.
Future<void> saveReadingPlace(String itemId, double offset) async {
  try {
    final places = withReadingPlace(await _readPlaces(), itemId, offset);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(readingPlacesPreferenceKey, jsonEncode(places));
  } on Object {
    // A convenience; nothing is lost that the reader can see.
  }
}
