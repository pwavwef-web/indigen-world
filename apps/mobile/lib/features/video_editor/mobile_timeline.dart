import 'dart:convert';

typedef TimelineRow = Map<String, dynamic>;
double timelineNumber(dynamic n, [double fallback = 0]) =>
    n is num ? n.toDouble() : fallback;
List<TimelineRow> timelineRows(dynamic value) => (value is List ? value : [])
    .whereType<Map>()
    .map((m) => Map<String, dynamic>.from(m))
    .toList();

/// Mobile timeline v1. Source times and renderer times are seconds, rounded to
/// milliseconds at the render boundary. Source-anchored cues follow their clip.
class MobileTimeline {
  MobileTimeline({
    required this.id,
    required this.ownerUid,
    this.aspect = '9:16',
    this.revision = 0,
    List<TimelineRow>? scenes,
    List<TimelineRow>? music,
  }) : scenes = scenes ?? [],
       music = music ?? [];
  final String id, ownerUid;
  String aspect;
  int revision;
  List<TimelineRow> scenes, music;
  String? renderId;
  int? renderRevision;
  double get duration =>
      scenes.fold(0, (sum, s) => sum + timelineNumber(s['duration']));
  TimelineRow toJson() => {
    'contract': 'indigen-mobile-timeline',
    'version': 1,
    'id': id,
    'ownerUid': ownerUid,
    'aspect': aspect,
    'revision': revision,
    'scenes': scenes,
    'music': music,
    'renderId': renderId,
    'renderRevision': renderRevision,
  };
  factory MobileTimeline.fromJson(TimelineRow raw) {
    if (raw['contract'] != 'indigen-mobile-timeline' || raw['version'] != 1)
      throw StateError(
        'This project contains unsupported features. Open it in the editor that created it; its data has been preserved.',
      );
    return MobileTimeline(
        id: raw['id'],
        ownerUid: raw['ownerUid'],
        aspect: raw['aspect'],
        revision: raw['revision'] ?? 0,
        scenes: timelineRows(raw['scenes']),
        music: timelineRows(raw['music']),
      )
      ..renderId = raw['renderId']
      ..renderRevision = raw['renderRevision'];
  }
  MobileTimeline copy() => MobileTimeline.fromJson(
    Map<String, dynamic>.from(jsonDecode(jsonEncode(toJson())) as Map),
  );
  void split(int index, double at) {
    final scene = scenes[index],
        duration = timelineNumber(scene['duration']),
        speed = timelineNumber(scene['speed'], 1);
    if (at < .5 || duration - at < .5)
      throw StateError('Keep at least half a second on each side of a split.');
    final second =
        Map<String, dynamic>.from(jsonDecode(jsonEncode(scene)) as Map)
          ..['id'] = 'scene-${DateTime.now().microsecondsSinceEpoch}'
          ..['sourceIn'] = timelineNumber(scene['sourceIn']) + at * speed
          ..['duration'] = duration - at;
    scene['duration'] = at;
    scenes.insert(index + 1, second);
  }

  /// Convert semantic/source-anchored edits into the existing web render v1.
  TimelineRow renderSpec(Map<String, String> rasterPaths) {
    if (scenes.isEmpty || scenes.length > 30 || duration > 300)
      throw StateError('Use 1–30 scenes and at most five minutes of video.');
    final outputScenes = <TimelineRow>[],
        layers = <TimelineRow>[],
        voice = <TimelineRow>[];
    var start = 0.0;
    for (final scene in scenes) {
      final length = timelineNumber(scene['duration']),
          speed = timelineNumber(scene['speed'], 1),
          sourceIn = timelineNumber(scene['sourceIn']);
      outputScenes.add({
        'id': scene['id'],
        'source': {'kind': scene['kind'], 'mediaId': scene['mediaId']},
        'duration': length,
        'sourceIn': sourceIn,
        'speed': speed,
        'fit': scene['fit'] ?? 'cover',
        'rotation': scene['rotation'] ?? 0,
        'focusX': scene['focusX'] ?? .5,
        'focusY': scene['focusY'] ?? .5,
        'look': scene['look'] ?? 'none',
        'volume': scene['volume'] ?? 1,
        'duckMusic': scene['duckMusic'] == true,
        'kenBurns': scene['kenBurns'] == true,
        'transitionIn': {'type': scene['transition'] ?? 'cut', 'duration': .3},
      });
      final size = frameSize(aspect);
      for (final layer in timelineRows(scene['overlays'])) {
        final localStart =
                ((timelineNumber(layer['sourceStart']) - sourceIn) / speed)
                    .clamp(0.0, length),
            localEnd =
                ((timelineNumber(
                              layer['sourceEnd'],
                              sourceIn + length * speed,
                            ) -
                            sourceIn) /
                        speed)
                    .clamp(0.0, length);
        if (localEnd - localStart < .033) continue;
        final common = <String, dynamic>{
          'id': '${scene['id']}-${layer['id']}',
          'start': start + localStart,
          'end': start + localEnd,
          'enter': layer['enter'] ?? 'none',
          'exit': 'none',
          'z': layer['z'] ?? 10,
        };
        if (layer['type'] == 'sticker') {
          layers.add({
            ...common,
            'type': 'sticker',
            'stickerId': layer['stickerId'],
            'cx': layer['x'] ?? .5,
            'cy': layer['y'] ?? .5,
            'size': layer['size'] ?? .2,
            'opacity': 1,
            'rotation': 0,
          });
        } else {
          final path = rasterPaths[layer['id']];
          if (path == null)
            throw StateError('Text assets are missing from the export.');
          layers.add({
            ...common,
            'type': 'image',
            'layerPath': path,
            'x': 0,
            'y': 0,
            'width': size.$1,
            'height': size.$2,
          });
        }
      }
      final narration = scene['voice'];
      if (narration is Map)
        voice.add({
          'id': 'voice-${scene['id']}',
          'mediaId': narration['mediaId'],
          'speed': speed,
          'start': start,
          'sourceIn': timelineNumber(narration['sourceIn']) + sourceIn,
          'duration': length,
          'volume': narration['volume'] ?? 1,
          'fadeIn': narration['fadeIn'] ?? .1,
          'fadeOut': narration['fadeOut'] ?? .1,
        });
      start += length;
    }
    return {
      'version': 1,
      'aspect': aspect,
      'background': '#000000',
      'scenes': outputScenes,
      'layers': layers,
      'captionTrack': [],
      'audio': {
        'sourceLevel': 1,
        'voiceLevel': 1,
        'musicLevel': 1,
        'duckTo': .25,
        'voice': voice,
        'music': music
            .map(
              (m) => {
                ...m,
                'duration': timelineNumber(
                  m['duration'],
                  duration,
                ).clamp(.1, duration),
              },
            )
            .toList(),
      },
    };
  }

  static (int, int) frameSize(String aspect) => switch (aspect) {
    '16:9' => (1280, 720),
    '1:1' => (720, 720),
    _ => (720, 1280),
  };
}
