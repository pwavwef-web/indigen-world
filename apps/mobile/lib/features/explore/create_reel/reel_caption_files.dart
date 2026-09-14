import 'package:indigen_world_mobile/core/timed_captions.dart';

/// Captions read out of a file the creator uploaded.
typedef ParsedCaptions = ({List<CaptionCue> cues, CaptionSource source});

/// A caption file that could not be read, with a sentence saying why.
class CaptionFileProblem implements Exception {
  const CaptionFileProblem(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Reads SubRip (`.srt`), WebVTT (`.vtt`) or a plain transcript (`.txt`).
///
/// A transcript has words and no times, so its lines are spread across
/// [spanStart]–[spanEnd] in proportion to their length and marked
/// [CaptionSource.transcript]: the timing is the app's estimate and the editor
/// says so. Timed files keep their own times.
///
/// Throws [CaptionFileProblem] when nothing usable is in the file.
ParsedCaptions parseCaptionFile({
  required String fileName,
  required String contents,
  required Duration spanStart,
  required Duration spanEnd,
}) {
  final text = contents
      .replaceFirst('\uFEFF', '')
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n');
  final extension = fileName.contains('.')
      ? fileName.split('.').last.toLowerCase()
      : '';
  final looksTimed = _timingLine.hasMatch(text);
  final List<CaptionCue> cues;
  final CaptionSource source;
  if (extension == 'vtt' || extension == 'srt' || looksTimed) {
    cues = _parseTimed(text);
    source = CaptionSource.uploaded;
    if (cues.isEmpty) {
      throw const CaptionFileProblem(
        'No timed captions were found in that file. Check it is a valid SRT '
        'or VTT file.',
      );
    }
  } else {
    cues = spreadTranscript(text, spanStart: spanStart, spanEnd: spanEnd);
    source = CaptionSource.transcript;
    if (cues.isEmpty) {
      throw const CaptionFileProblem('That transcript file is empty.');
    }
  }
  if (cues.length > CaptionTrack.maxCues) {
    throw CaptionFileProblem(
      'That file has ${cues.length} captions; a reel can carry up to '
      '${CaptionTrack.maxCues}. Merge some lines and try again.',
    );
  }
  return (cues: cues, source: source);
}

final _timingLine = RegExp(
  r'(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}',
);

List<CaptionCue> _parseTimed(String text) {
  final cues = <CaptionCue>[];
  for (final block in text.split(RegExp(r'\n\s*\n'))) {
    final lines = block
        .split('\n')
        .map((line) => line.trimRight())
        .where((line) => line.trim().isNotEmpty)
        .toList();
    final timingIndex = lines.indexWhere(_timingLine.hasMatch);
    if (timingIndex < 0) continue;
    final parts = lines[timingIndex].split('-->');
    final start = _parseTimestamp(parts.first);
    // WebVTT allows cue settings after the end time: `00:01.000 line:0`.
    final end = _parseTimestamp(parts.last.trim().split(RegExp(r'\s+')).first);
    if (start == null || end == null) continue;
    final body = lines
        .skip(timingIndex + 1)
        .map(_stripMarkup)
        .where((line) => line.isNotEmpty)
        .join('\n');
    final cue = CaptionCue(
      startMs: start,
      endMs: end,
      text: body.length > CaptionCue.maxTextLength
          ? body.substring(0, CaptionCue.maxTextLength)
          : body,
    );
    if (cue.isValid) cues.add(cue);
  }
  cues.sort((a, b) => a.startMs.compareTo(b.startMs));
  return cues;
}

/// Milliseconds from `01:02:03,456`, `02:03.456` or `2:03.4`.
int? _parseTimestamp(String raw) {
  final match = RegExp(r'(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})')
      .firstMatch(raw.trim());
  if (match == null) return null;
  final hours = int.parse(match.group(1) ?? '0');
  final minutes = int.parse(match.group(2)!);
  final seconds = int.parse(match.group(3)!);
  final fraction = match.group(4)!.padRight(3, '0');
  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + int.parse(fraction);
}

/// Formatting tags (`<i>`, `<c.yellow>`, `{\an8}`) are not words.
String _stripMarkup(String line) => line
    .replaceAll(RegExp(r'<[^>]*>'), '')
    .replaceAll(RegExp(r'\{\\[^}]*\}'), '')
    .trim();

/// Lines of [text] laid across [spanStart]–[spanEnd] in proportion to their
/// length, one cue per line. Long lines are split at sentence ends first so no
/// cue asks anyone to read two hundred characters in a breath.
List<CaptionCue> spreadTranscript(
  String text, {
  required Duration spanStart,
  required Duration spanEnd,
}) {
  final pieces = <String>[];
  for (final line in text.split('\n')) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) continue;
    if (trimmed.length <= 90) {
      pieces.add(trimmed);
      continue;
    }
    for (final sentence in trimmed.split(RegExp(r'(?<=[.!?])\s+'))) {
      var rest = sentence.trim();
      while (rest.length > CaptionCue.maxTextLength) {
        final cut = rest.lastIndexOf(' ', CaptionCue.maxTextLength);
        final at = cut <= 0 ? CaptionCue.maxTextLength : cut;
        pieces.add(rest.substring(0, at).trim());
        rest = rest.substring(at).trim();
      }
      if (rest.isNotEmpty) pieces.add(rest);
    }
  }
  final startMs = spanStart.inMilliseconds;
  final spanMs = spanEnd.inMilliseconds - startMs;
  if (pieces.isEmpty || spanMs <= 0) return const [];
  final weights = [for (final piece in pieces) piece.length + 12];
  final total = weights.fold<int>(0, (sum, weight) => sum + weight);
  final cues = <CaptionCue>[];
  var cursor = startMs.toDouble();
  for (var index = 0; index < pieces.length; index++) {
    final length = spanMs * weights[index] / total;
    final cueStart = cursor.round();
    final cueEnd = index == pieces.length - 1
        ? startMs + spanMs
        : (cursor + length).round();
    if (cueEnd > cueStart) {
      cues.add(
        CaptionCue(startMs: cueStart, endMs: cueEnd, text: pieces[index]),
      );
    }
    cursor += length;
  }
  return cues;
}

/// [track] as a WebVTT document, for anyone who needs the file back.
String captionsToWebVtt(CaptionTrack track) {
  String stamp(int ms) {
    final hours = ms ~/ 3600000;
    final minutes = (ms % 3600000) ~/ 60000;
    final seconds = (ms % 60000) ~/ 1000;
    final millis = ms % 1000;
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(hours)}:${two(minutes)}:${two(seconds)}.'
        '${millis.toString().padLeft(3, '0')}';
  }

  final buffer = StringBuffer('WEBVTT\n');
  for (final cue in track.cues) {
    buffer
      ..write('\n')
      ..write('${stamp(cue.startMs)} --> ${stamp(cue.endMs)}\n')
      ..write('${cue.text}\n');
  }
  return buffer.toString();
}
