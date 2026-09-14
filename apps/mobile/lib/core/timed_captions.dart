import 'package:flutter/foundation.dart';

/// One line of timed text over a video, in the clip's own time.
///
/// Times are always measured against the file as it was uploaded, never
/// against a trimmed selection. The upload keeps the whole file (see
/// `clip_window.dart`), so a cue at 12.4 s is at 12.4 s in every player — and a
/// future server-side trim has one offset to subtract rather than a guess.
@immutable
class CaptionCue {
  const CaptionCue({
    required this.startMs,
    required this.endMs,
    required this.text,
  });

  /// Longest single cue. Two lines on a phone held upright.
  static const maxTextLength = 200;

  final int startMs;
  final int endMs;
  final String text;

  Duration get start => Duration(milliseconds: startMs);
  Duration get end => Duration(milliseconds: endMs);

  bool get isValid => startMs >= 0 && endMs > startMs && text.trim().isNotEmpty;

  bool containsMs(int ms) => ms >= startMs && ms < endMs;

  CaptionCue copyWith({int? startMs, int? endMs, String? text}) => CaptionCue(
    startMs: startMs ?? this.startMs,
    endMs: endMs ?? this.endMs,
    text: text ?? this.text,
  );

  Map<String, Object?> toMap() => {
    'startMs': startMs,
    'endMs': endMs,
    'text': text,
  };

  static CaptionCue? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final start = raw['startMs'];
    final end = raw['endMs'];
    final text = raw['text'];
    if (start is! num || end is! num || text is! String) return null;
    final cue = CaptionCue(
      startMs: start.toInt(),
      endMs: end.toInt(),
      text: text.length > maxTextLength
          ? text.substring(0, maxTextLength)
          : text,
    );
    return cue.isValid ? cue : null;
  }

  @override
  bool operator ==(Object other) =>
      other is CaptionCue &&
      other.startMs == startMs &&
      other.endMs == endMs &&
      other.text == text;

  @override
  int get hashCode => Object.hash(startMs, endMs, text);
}

/// Where a caption track's words came from.
enum CaptionSource {
  /// Typed by the creator in the caption editor.
  manual('manual'),

  /// A timed SubRip or WebVTT file the creator uploaded.
  uploaded('uploaded'),

  /// Plain text the creator uploaded, with timing spread across the clip by
  /// the app. The words are the creator's; the timing is an estimate.
  transcript('transcript'),

  /// Produced by a transcription service. Nothing in the app generates these
  /// yet — there is no transcription service behind it — but the value exists
  /// so the rule below is written down before the feature is: a machine's
  /// captions are never shown until their creator has reviewed them.
  automatic('automatic');

  const CaptionSource(this.wire);

  final String wire;

  static CaptionSource fromWire(Object? raw) {
    for (final source in values) {
      if (source.wire == raw) return source;
    }
    return CaptionSource.manual;
  }
}

/// A clip's captions in one language.
@immutable
class CaptionTrack {
  const CaptionTrack({
    required this.language,
    required this.cues,
    this.source = CaptionSource.manual,
    this.reviewed = false,
  });

  /// A cap that keeps a captioned post document small: three hundred cues is
  /// one every 0.6 s across the longest reel the app accepts.
  static const maxCues = 300;

  /// A language code from [kCaptionLanguages], or a name the creator typed.
  final String language;
  final CaptionSource source;

  /// Whether the creator has confirmed these captions match what is said.
  final bool reviewed;

  /// Sorted by start time; see [normalised].
  final List<CaptionCue> cues;

  bool get isEmpty => cues.isEmpty;

  /// Whether a player may put these on screen. A machine's words need a
  /// person's confirmation first; a person's own words do not.
  bool get isShowable =>
      cues.isNotEmpty && (source != CaptionSource.automatic || reviewed);

  /// The cue on screen at [position], if any.
  CaptionCue? cueAt(Duration position) {
    final ms = position.inMilliseconds;
    var low = 0;
    var high = cues.length - 1;
    while (low <= high) {
      final mid = (low + high) >> 1;
      final cue = cues[mid];
      if (ms < cue.startMs) {
        high = mid - 1;
      } else if (ms >= cue.endMs) {
        low = mid + 1;
      } else {
        return cue;
      }
    }
    return null;
  }

  /// Valid cues only, in order, at most [maxCues], with text trimmed.
  CaptionTrack normalised() {
    final valid = [
      for (final cue in cues)
        if (cue.isValid) cue.copyWith(text: cue.text.trim()),
    ]..sort((a, b) => a.startMs.compareTo(b.startMs));
    return copyWith(cues: List.unmodifiable(valid.take(maxCues)));
  }

  CaptionTrack copyWith({
    String? language,
    List<CaptionCue>? cues,
    CaptionSource? source,
    bool? reviewed,
  }) => CaptionTrack(
    language: language ?? this.language,
    cues: cues ?? this.cues,
    source: source ?? this.source,
    reviewed: reviewed ?? this.reviewed,
  );

  Map<String, Object?> toMap() => {
    'language': language,
    'source': source.wire,
    'reviewed': reviewed,
    'cues': [for (final cue in cues) cue.toMap()],
  };

  static CaptionTrack? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final rawCues = raw['cues'];
    if (rawCues is! List) return null;
    final language = raw['language'];
    final track = CaptionTrack(
      language: language is String && language.trim().isNotEmpty
          ? language.trim()
          : 'und',
      source: CaptionSource.fromWire(raw['source']),
      reviewed: raw['reviewed'] == true,
      cues: [for (final cue in rawCues.map(CaptionCue.fromMap)) ?cue],
    ).normalised();
    return track.isEmpty ? null : track;
  }

  @override
  bool operator ==(Object other) =>
      other is CaptionTrack &&
      other.language == language &&
      other.source == source &&
      other.reviewed == reviewed &&
      listEquals(other.cues, cues);

  @override
  int get hashCode =>
      Object.hash(language, source, reviewed, Object.hashAll(cues));
}

/// The caption languages offered by name. Codes follow the ones published
/// records already use (`xsm` for Kasem), so one label function reads both.
const kCaptionLanguages = <(String, String)>[
  ('xsm', 'Kasem'),
  ('en', 'English'),
  ('fr', 'French'),
  ('tw', 'Twi'),
  ('ha', 'Hausa'),
];

/// [code] named for people: `xsm` → `Kasem`. Unknown codes come back as typed.
String captionLanguageName(String code) {
  final value = code.trim();
  for (final (known, name) in kCaptionLanguages) {
    if (known == value.toLowerCase()) return name;
  }
  return value == 'und' ? 'Unspecified' : value;
}
