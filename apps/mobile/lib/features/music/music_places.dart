import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where each audiobook's place is written down.
const audiobookPlacesPreferenceKey = 'indigen_audiobook_places_v1';

/// How many books keep a place. Far more than anybody reads at once.
const audiobookPlacesLimit = 50;

/// Within this of the end, a book counts as finished and gives its place up.
const audiobookFinishedWithin = Duration(seconds: 30);

/// Where somebody stopped in one book.
@immutable
class AudiobookPlace {
  const AudiobookPlace({
    required this.trackId,
    required this.position,
    required this.updatedAt,
    this.duration,
  });

  final String trackId;
  final Duration position;

  /// The book's length when it was last heard, once the file had said.
  final Duration? duration;
  final DateTime updatedAt;

  /// How far through, 0–1, or null while the length is unknown.
  double? get progress {
    final total = duration;
    if (total == null || total <= Duration.zero) return null;
    return (position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
  }

  /// Whether this is the end of the book rather than a place in it.
  bool get finished {
    final total = duration;
    return total != null &&
        total > Duration.zero &&
        position >= total - audiobookFinishedWithin;
  }

  Map<String, Object?> toJson() => {
    'positionMs': position.inMilliseconds,
    'durationMs': duration?.inMilliseconds,
    'at': updatedAt.millisecondsSinceEpoch,
  };

  static AudiobookPlace? fromJson(String trackId, Object? raw) {
    if (raw is! Map) return null;
    final position = raw['positionMs'];
    final at = raw['at'];
    if (position is! int || at is! int) return null;
    final duration = raw['durationMs'];
    return AudiobookPlace(
      trackId: trackId,
      position: Duration(milliseconds: position),
      duration: duration is int ? Duration(milliseconds: duration) : null,
      updatedAt: DateTime.fromMillisecondsSinceEpoch(at),
    );
  }
}

/// [places] with [place] recorded, finished books dropped and only the
/// [limit] most recently heard kept.
@visibleForTesting
Map<String, AudiobookPlace> recordAudiobookPlace(
  Map<String, AudiobookPlace> places,
  AudiobookPlace place, {
  int limit = audiobookPlacesLimit,
}) {
  final next = {...places}..remove(place.trackId);
  // A book that has reached its end starts again from the beginning next time,
  // which is what a reader who finished it and comes back wants.
  if (!place.finished) next[place.trackId] = place;
  final newest = next.values.toList()
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  return {for (final kept in newest.take(limit)) kept.trackId: kept};
}

/// The books to offer under "Continue listening": started, not finished,
/// still published, most recently heard first.
List<({PublishedReel item, AudiobookPlace place})> continueListening(
  Map<String, AudiobookPlace> places,
  List<PublishedReel> items,
) {
  final byId = {for (final item in items) item.id: item};
  final started =
      places.values
          .where(
            (place) =>
                !place.finished &&
                place.position >= const Duration(seconds: 15) &&
                byId.containsKey(place.trackId),
          )
          .toList()
        ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  return [
    for (final place in started) (item: byId[place.trackId]!, place: place),
  ];
}

/// Every audiobook's own place.
///
/// ── Why not the one resume point ──────────────────────────────────────────
/// The music player keeps one place — the song you were last in — and that is
/// right for songs. It is wrong for books: start a second book and the first
/// one forgets chapter four. Here each book keeps its own, so going back to any
/// of them picks up where that book was left.
class AudiobookPlacesController extends Notifier<Map<String, AudiobookPlace>> {
  @override
  Map<String, AudiobookPlace> build() {
    unawaited(_restore());
    return const <String, AudiobookPlace>{};
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getString(audiobookPlacesPreferenceKey);
      if (stored == null || stored.isEmpty) return;
      final decoded = jsonDecode(stored);
      if (decoded is! Map) return;
      final restored = <String, AudiobookPlace>{};
      for (final entry in decoded.entries) {
        final place = AudiobookPlace.fromJson('${entry.key}', entry.value);
        if (place != null) restored[place.trackId] = place;
      }
      // Places recorded since launch are newer than anything on disk.
      state = {...restored, ...state};
    } on Object catch (error) {
      debugPrint('Audiobook places could not be read: $error');
    }
  }

  AudiobookPlace? placeOf(String trackId) => state[trackId];

  Future<void> record(
    String trackId,
    Duration position, {
    Duration? duration,
    DateTime? at,
  }) async {
    if (trackId.isEmpty) return;
    state = recordAudiobookPlace(
      state,
      AudiobookPlace(
        trackId: trackId,
        position: position,
        duration: duration,
        updatedAt: at ?? DateTime.now(),
      ),
    );
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        audiobookPlacesPreferenceKey,
        jsonEncode({
          for (final place in state.values) place.trackId: place.toJson(),
        }),
      );
    } on Object {
      // Kept for this session; a convenience, not a record.
    }
  }

  Future<void> forget(String trackId) async {
    if (!state.containsKey(trackId)) return;
    state = {...state}..remove(trackId);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        audiobookPlacesPreferenceKey,
        jsonEncode({
          for (final place in state.values) place.trackId: place.toJson(),
        }),
      );
    } on Object {
      // As above.
    }
  }
}

final audiobookPlacesProvider =
    NotifierProvider<AudiobookPlacesController, Map<String, AudiobookPlace>>(
      AudiobookPlacesController.new,
    );
