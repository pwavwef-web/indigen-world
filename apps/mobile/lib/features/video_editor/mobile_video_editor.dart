import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:record/record.dart';
import 'package:video_player/video_player.dart';
import 'package:video_thumbnail/video_thumbnail.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/video_editor/mobile_timeline.dart';
import 'package:indigen_world_mobile/features/video_editor/video_editor_repository.dart';
import 'package:indigen_world_mobile/features/video_editor/video_looks.g.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_caption_files.dart';

Future<String?> openMobileVideoEditor(
  BuildContext context,
  String path, {
  String? projectId,
}) => Navigator.push<String>(
  context,
  MaterialPageRoute(
    builder: (_) => MobileVideoEditor(sourcePath: path, projectId: projectId),
  ),
);

class MobileVideoEditor extends StatefulWidget {
  const MobileVideoEditor({
    required this.sourcePath,
    this.projectId,
    this.repository,
    super.key,
  });
  final String sourcePath;
  final String? projectId;
  final VideoEditorRepository? repository;
  @override
  State<MobileVideoEditor> createState() => _MobileVideoEditorState();
}

class _MobileVideoEditorState extends State<MobileVideoEditor> {
  late final _repository = widget.repository ?? VideoEditorRepository();
  final _recorder = AudioRecorder();
  MobileTimeline? _project;
  VideoPlayerController? _player;
  StreamSubscription<TimelineRow>? _renderSubscription;
  TimelineRow? _render;
  final _undo = <TimelineRow>[], _redo = <TimelineRow>[];
  int _selected = 0;
  int _revisionCounter = 0;
  double _position = 0, _progress = 0, _zoom = 1;
  bool _busy = false, _recording = false, _showOutput = false;
  String? _error, _stage;
  TimelineRow get _scene => _project!.scenes[_selected];
  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _player?.dispose();
    _recorder.dispose();
    _renderSubscription?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    try {
      final uid = _repository.currentUserUid;
      if (uid == null)
        throw StateError(
          'Sign in to edit and render a video. Your original remains available.',
        );
      final projectId =
          widget.projectId ?? 'mobile-${DateTime.now().microsecondsSinceEpoch}';
      _project =
          await _repository.loadLocal(uid, projectId) ??
          MobileTimeline(id: projectId, ownerUid: uid);
      _revisionCounter = _project!.revision;
      if (_project!.scenes.isEmpty)
        await _import(widget.sourcePath);
      else
        await _select(0);
      if (_project!.renderId != null) _watch(_project!.renderId!);
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  void _checkpoint() {
    if (_project == null) return;
    _undo.add(_project!.copy().toJson());
    if (_undo.length > 30) _undo.removeAt(0);
    _redo.clear();
  }

  Future<void> _save() async {
    final p = _project;
    if (p == null) return;
    try {
      _revisionCounter =
          (_revisionCounter > p.revision ? _revisionCounter : p.revision) + 1;
      p.revision = _revisionCounter;
      await _repository.saveLocal(p);
      if (mounted) setState(() {});
    } on Object catch (e) {
      if (mounted) setState(() => _error = 'Could not save this draft: $e');
    }
  }

  Future<void> _import(String path, {bool image = false}) async {
    final p = _project!;
    if (p.scenes.length >= 30) throw StateError('Use at most 30 scenes.');
    final mediaId = 'media-${DateTime.now().microsecondsSinceEpoch}';
    final adopted = await _repository.adopt(
      p,
      path,
      '$mediaId.${image ? 'jpg' : path.split('.').last}',
    );
    double duration = 5;
    if (!image) {
      final probe = VideoPlayerController.file(File(adopted));
      try {
        await probe.initialize();
        duration = probe.value.duration.inMilliseconds / 1000;
      } finally {
        await probe.dispose();
      }
    }
    _checkpoint();
    p.scenes.add({
      'id': 'scene-${DateTime.now().microsecondsSinceEpoch}',
      'kind': image ? 'image' : 'video',
      'mediaId': mediaId,
      'localPath': adopted,
      'sourceDuration': duration,
      'duration': duration.clamp(.5, 120),
      'sourceIn': 0,
      'speed': 1,
      'fit': 'cover',
      'rotation': 0,
      'volume': 1,
      'look': 'none',
      'overlays': <TimelineRow>[],
    });
    await _save();
    await _select(p.scenes.length - 1);
  }

  Future<void> _select(int index) async {
    await _player?.dispose();
    _player = null;
    _showOutput = false;
    if (!mounted || _project == null || _project!.scenes.isEmpty) return;
    setState(() {
      _selected = index.clamp(0, _project!.scenes.length - 1);
      _position = 0;
    });
    if (_scene['kind'] == 'video') {
      final player = VideoPlayerController.file(File(_scene['localPath']));
      _player = player;
      try {
        await player.initialize();
        await player.seekTo(
          Duration(
            milliseconds: (timelineNumber(_scene['sourceIn']) * 1000).round(),
          ),
        );
        await player.setPlaybackSpeed(timelineNumber(_scene['speed'], 1));
        await player.setVolume(timelineNumber(_scene['volume'], 1).clamp(0, 1));
        player.addListener(_tick);
      } on Object catch (e) {
        if (mounted) setState(() => _error = 'This source is unavailable: $e');
      }
    }
    if (mounted) setState(() {});
  }

  void _tick() {
    final player = _player;
    if (player == null || !mounted || _showOutput || _project!.scenes.isEmpty)
      return;
    final position =
        (player.value.position.inMilliseconds / 1000 -
            timelineNumber(_scene['sourceIn'])) /
        timelineNumber(_scene['speed'], 1);
    if (position >= timelineNumber(_scene['duration'])) {
      unawaited(player.pause());
    }
    setState(
      () => _position = position.clamp(0, timelineNumber(_scene['duration'])),
    );
  }

  Future<void> _edit(TimelineRow change) async {
    _checkpoint();
    _scene.addAll(change);
    await _save();
    await _select(_selected);
  }

  Future<void> _pick({bool image = false, bool camera = false}) async {
    try {
      await _repository.saveLocal(_project!);
      final picker = ImagePicker();
      final file = image
          ? await picker.pickImage(
              source: ImageSource.gallery,
              maxWidth: 2000,
              imageQuality: 90,
            )
          : await picker.pickVideo(
              source: camera ? ImageSource.camera : ImageSource.gallery,
              maxDuration: const Duration(minutes: 5),
            );
      if (file != null) await _import(file.path, image: image);
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _renderVideo() async {
    const enabled = bool.fromEnvironment(
      'MOBILE_VIDEO_RENDER_ENABLED',
      defaultValue: !kReleaseMode,
    );
    if (!enabled) {
      setState(
        () => _error = 'Rendering is not enabled for this release. Your edit is saved; you can use the original or return when rendering is available.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _stage = 'Saving project';
    });
    try {
      await _player?.pause();
      final id = await _repository.render(_project!, (stage, progress) {
        if (mounted)
          setState(() {
            _stage = stage;
            _progress = progress;
          });
      });
      _watch(id);
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _watch(String id) {
    _renderSubscription?.cancel();
    _renderSubscription = _repository
        .watchRender(id)
        .listen(
          (render) {
            if (mounted)
              setState(() {
                _render = render;
                _stage = render['stage'];
                _progress = timelineNumber(render['progress']);
              });
          },
          onError: (Object e) {
            if (mounted)
              setState(
                () => _error = 'Could not read render status. Reopen this draft to reconnect.',
              );
          },
        );
  }

  Future<void> _useEdited() async {
    setState(() {
      _busy = true;
      _error = null;
      _stage = 'Downloading edited video';
    });
    try {
      final path = await _repository.downloadForPosting(_project!);
      final check = VideoPlayerController.file(File(path));
      try {
        await check.initialize();
        if (check.value.duration.inMilliseconds <= 0)
          throw StateError('The output could not be played.');
      } finally {
        await check.dispose();
      }
      if (mounted) Navigator.pop(context, path);
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _watchEdited() async {
    try {
      final path = await _repository.downloadForPosting(_project!);
      await _player?.dispose();
      final player = VideoPlayerController.file(File(path));
      await player.initialize();
      _player = player;
      if (!mounted) {
        await player.dispose();
        return;
      }
      setState(() => _showOutput = true);
      await player.play();
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _project,
        ready =
            _render?['status'] == 'succeeded' &&
            p?.renderRevision == p?.revision;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit video'),
        actions: [
          IconButton(
            tooltip: 'Full screen preview',
            onPressed: p == null
                ? null
                : () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => Scaffold(
                          backgroundColor: Colors.black,
                          appBar: AppBar(title: const Text('Preview')),
                          body: Center(
                            child: AspectRatio(
                              aspectRatio: p.aspect == '9:16'
                                  ? 9 / 16
                                  : p.aspect == '1:1'
                                  ? 1
                                  : 16 / 9,
                              child: _player == null
                                  ? _preview()
                                  : AnimatedBuilder(
                                      animation: _player!,
                                      builder: (_, _) => _preview(),
                                    ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
            icon: const Icon(Icons.fullscreen),
          ),
          IconButton(
            tooltip: 'Undo',
            onPressed: _undo.isEmpty || _busy
                ? null
                : () async {
                    _redo.add(p!.copy().toJson());
                    _project = MobileTimeline.fromJson(_undo.removeLast());
                    await _save();
                    await _select(_selected);
                  },
            icon: const Icon(Icons.undo),
          ),
          IconButton(
            tooltip: 'Redo',
            onPressed: _redo.isEmpty || _busy
                ? null
                : () async {
                    _undo.add(p!.copy().toJson());
                    _project = MobileTimeline.fromJson(_redo.removeLast());
                    await _save();
                    await _select(_selected);
                  },
            icon: const Icon(Icons.redo),
          ),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'original') Navigator.pop(context, widget.sourcePath);
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'original', child: Text('Use original')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: p == null || p.scenes.isEmpty
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: _error == null
                      ? const CircularProgressIndicator()
                      : Text(_error!),
                ),
              )
            : Column(
                children: [
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.cloud_done_outlined, size: 16),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Draft saved on this device · revision ${p.revision}',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ),
                            DropdownButton<String>(
                              value: p.aspect,
                              items: const [
                                DropdownMenuItem(
                                  value: '9:16',
                                  child: Text('9:16'),
                                ),
                                DropdownMenuItem(
                                  value: '1:1',
                                  child: Text('1:1'),
                                ),
                                DropdownMenuItem(
                                  value: '16:9',
                                  child: Text('16:9'),
                                ),
                              ],
                              onChanged: _busy
                                  ? null
                                  : (v) {
                                      _checkpoint();
                                      p.aspect = v!;
                                      _save();
                                    },
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(
                              maxHeight: 390,
                              maxWidth: 600,
                            ),
                            child: AspectRatio(
                              aspectRatio: p.aspect == '9:16'
                                  ? 9 / 16
                                  : p.aspect == '1:1'
                                  ? 1
                                  : 16 / 9,
                              child: _preview(),
                            ),
                          ),
                        ),
                        Row(
                          children: [
                            IconButton(
                              tooltip: 'Play / pause preview',
                              onPressed: _player?.value.isInitialized == true
                                  ? () async {
                                      if (_player!.value.isPlaying) {
                                        await _player!.pause();
                                      } else {
                                        if (_position >=
                                            timelineNumber(_scene['duration']))
                                          await _player!.seekTo(
                                            Duration(
                                              milliseconds:
                                                  (timelineNumber(
                                                            _scene['sourceIn'],
                                                          ) *
                                                          1000)
                                                      .round(),
                                            ),
                                          );
                                        await _player!.play();
                                      }
                                      if (mounted) setState(() {});
                                    }
                                  : null,
                              icon: Icon(
                                _player?.value.isPlaying == true
                                    ? Icons.pause
                                    : Icons.play_arrow,
                              ),
                            ),
                            Expanded(
                              child: Slider(
                                label:
                                    '${_position.toStringAsFixed(1)} seconds',
                                value: _position.clamp(
                                  0,
                                  timelineNumber(_scene['duration']),
                                ),
                                max: timelineNumber(_scene['duration'])
                                    .clamp(.5, 120),
                                onChanged: (v) {
                                  setState(
                                    () => _position = (v * 10).round() / 10,
                                  );
                                  _player?.seekTo(
                                    Duration(
                                      milliseconds:
                                          ((timelineNumber(_scene['sourceIn']) +
                                                      _position *
                                                          timelineNumber(
                                                            _scene['speed'],
                                                            1,
                                                          )) *
                                                  1000)
                                              .round(),
                                    ),
                                  );
                                },
                              ),
                            ),
                            Text(
                              '${_position.toStringAsFixed(1)} / ${timelineNumber(_scene['duration']).toStringAsFixed(1)}s',
                            ),
                          ],
                        ),
                        Row(
                          children: [
                            Text(
                              '${p.scenes.length} scenes · ${p.duration.toStringAsFixed(1)}s',
                            ),
                            const Spacer(),
                            IconButton(
                              tooltip: 'Zoom out timeline',
                              onPressed: () => setState(
                                () => _zoom = (_zoom / 1.25).clamp(.5, 3),
                              ),
                              icon: const Icon(Icons.zoom_out),
                            ),
                            IconButton(
                              tooltip: 'Zoom in timeline',
                              onPressed: () => setState(
                                () => _zoom = (_zoom * 1.25).clamp(.5, 3),
                              ),
                              icon: const Icon(Icons.zoom_in),
                            ),
                          ],
                        ),
                        SizedBox(
                          height: 100,
                          child: ReorderableListView.builder(
                            scrollDirection: Axis.horizontal,
                            buildDefaultDragHandles: false,
                            itemCount: p.scenes.length,
                            onReorder: (old, next) async {
                              _checkpoint();
                              if (next > old) next--;
                              p.scenes.insert(next, p.scenes.removeAt(old));
                              await _save();
                              await _select(next);
                            },
                            itemBuilder: (context, index) {
                              final s = p.scenes[index];
                              return ReorderableDelayedDragStartListener(
                                key: ValueKey(s['id']),
                                index: index,
                                child: GestureDetector(
                                  onTap: () => _select(index),
                                  child: Container(
                                    width: 95 * _zoom,
                                    margin: const EdgeInsets.only(right: 8),
                                    padding: const EdgeInsets.all(4),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: index == _selected
                                            ? context.brand.accent
                                            : context.brand.divider,
                                        width: index == _selected ? 3 : 1,
                                      ),
                                    ),
                                    child: Column(
                                      children: [
                                        Expanded(
                                          child: _SceneThumbnail(scene: s),
                                        ),
                                        Text(
                                          '${index + 1} · ${timelineNumber(s['duration']).toStringAsFixed(1)}s',
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 4,
                          runSpacing: 4,
                          children: [
                            for (final tool in [
                              ('Trim', Icons.content_cut),
                              ('Text', Icons.text_fields),
                              ('Captions', Icons.closed_caption_outlined),
                              ('Look', Icons.tune),
                              ('Audio', Icons.music_note),
                              ('Stickers', Icons.emoji_emotions_outlined),
                              ('Scenes', Icons.add_photo_alternate_outlined),
                            ])
                              TextButton.icon(
                                onPressed: _busy ? null : () => _tool(tool.$1),
                                icon: Icon(tool.$2),
                                label: Text(tool.$1),
                              ),
                          ],
                        ),
                        if (_error != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              _error!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ),
                        if (_stage != null) ...[
                          Text(_stage!),
                          const SizedBox(height: 8),
                          LinearProgressIndicator(
                            value: _busy && _progress == 0
                                ? null
                                : _progress.clamp(0, 1),
                          ),
                        ],
                        if (_render != null)
                          Wrap(
                            spacing: 8,
                            children: [
                              if ([
                                'queued',
                                'rendering',
                              ].contains(_render!['status']))
                                TextButton(
                                  onPressed: () => _repository.call(
                                    'cancelVideoRender',
                                    {'renderId': p.renderId},
                                  ),
                                  child: const Text('Cancel render'),
                                ),
                              if ([
                                'failed',
                                'cancelled',
                              ].contains(_render!['status']))
                                TextButton(
                                  onPressed: () async {
                                    try {
                                      await _repository.call(
                                        'retryVideoRender',
                                        {'renderId': p.renderId},
                                      );
                                    } on Object catch (e) {
                                      if (mounted)
                                        setState(() => _error = '$e');
                                    }
                                  },
                                  child: const Text('Retry render'),
                                ),
                              if (_render!['status'] == 'succeeded' && !ready)
                                const Text(
                                  'This render belongs to an earlier revision. Render the latest edit.',
                                ),
                            ],
                          ),
                        if (_render?['error'] != null)
                          Text('${_render!['error']}'),
                        if (ready)
                          OutlinedButton.icon(
                            onPressed: _watchEdited,
                            icon: const Icon(Icons.play_circle_outline),
                            label: const Text('Watch rendered preview'),
                          ),
                        if (_busy && _render == null)
                          TextButton(
                            onPressed: _repository.cancelPreparation,
                            child: const Text('Cancel preparation'),
                          ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _busy
                            ? null
                            : ready
                            ? _useEdited
                            : _renderVideo,
                        icon: Icon(
                          ready
                              ? Icons.arrow_forward
                              : Icons.movie_creation_outlined,
                        ),
                        label: Text(
                          _busy
                              ? 'Please wait…'
                              : ready
                              ? 'Use edited video'
                              : 'Preview & render',
                        ),
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _preview() {
    final scene = _scene, size = MobileTimeline.frameSize(_project!.aspect);
    if (_showOutput && _player?.value.isInitialized == true)
      return Center(
        child: AspectRatio(
          aspectRatio: _player!.value.aspectRatio,
          child: VideoPlayer(_player!),
        ),
      );
    return ColoredBox(
      color: Colors.black,
      child: LayoutBuilder(
        builder: (context, constraints) => Stack(
          fit: StackFit.expand,
          children: [
            ColorFiltered(
              colorFilter: ColorFilter.matrix(
                videoLookMatrices[scene['look']] ?? videoLookMatrices['none']!,
              ),
              child: scene['kind'] == 'image'
                  ? Image.file(
                      File(scene['localPath']),
                      fit: scene['fit'] == 'contain'
                          ? BoxFit.contain
                          : BoxFit.cover,
                    )
                  : _player?.value.isInitialized == true
                  ? RotatedBox(
                      quarterTurns: (scene['rotation'] as int? ?? 0) ~/ 90,
                      child: FittedBox(
                        fit: scene['fit'] == 'contain'
                            ? BoxFit.contain
                            : BoxFit.cover,
                        clipBehavior: Clip.hardEdge,
                        child: SizedBox(
                          width: _player!.value.size.width,
                          height: _player!.value.size.height,
                          child: VideoPlayer(_player!),
                        ),
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
            IgnorePointer(
              child: CustomPaint(
                painter: _OverlayPreview(
                  layers: timelineRows(scene['overlays'])
                      .where(
                        (l) =>
                            l['type'] != 'sticker' &&
                            timelineNumber(l['sourceStart']) <=
                                timelineNumber(scene['sourceIn']) +
                                    _position *
                                        timelineNumber(scene['speed'], 1) &&
                            timelineNumber(l['sourceEnd']) >
                                timelineNumber(scene['sourceIn']) +
                                    _position *
                                        timelineNumber(scene['speed'], 1),
                      )
                      .toList(),
                  frame: Size(size.$1.toDouble(), size.$2.toDouble()),
                ),
              ),
            ),
            Positioned.fill(
              child: IgnorePointer(
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: constraints.maxWidth * .07,
                    vertical: constraints.maxHeight * .08,
                  ),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white24),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _tool(String tool) async {
    await _player?.pause();
    if (!mounted) return;
    try {
      if (tool == 'Text' || tool == 'Captions') {
        await _text(tool == 'Captions');
        return;
      }
      if (tool == 'Stickers') {
        await _library(sticker: true);
        return;
      }
      if (tool == 'Scenes') {
        await showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          builder: (sheet) => SafeArea(
            child: Wrap(
              children: [
                ListTile(
                  leading: const Icon(Icons.video_library),
                  title: const Text('Import video'),
                  onTap: () {
                    Navigator.pop(sheet);
                    _pick();
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.videocam),
                  title: const Text('Capture video'),
                  onTap: () {
                    Navigator.pop(sheet);
                    _pick(camera: true);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.image_outlined),
                  title: const Text('Image scene'),
                  onTap: () {
                    Navigator.pop(sheet);
                    _pick(image: true);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.copy),
                  title: const Text('Duplicate scene'),
                  onTap: () {
                    _checkpoint();
                    final copy =
                        Map<String, dynamic>.from(
                            _project!.copy().scenes[_selected],
                          )
                          ..['id'] =
                              'scene-${DateTime.now().microsecondsSinceEpoch}';
                    _project!.scenes.insert(_selected + 1, copy);
                    _save();
                    Navigator.pop(sheet);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.delete_outline),
                  title: const Text('Delete scene'),
                  enabled: _project!.scenes.length > 1,
                  onTap: _project!.scenes.length <= 1
                      ? null
                      : () {
                          _checkpoint();
                          _project!.scenes.removeAt(_selected);
                          _save();
                          _select(0);
                          Navigator.pop(sheet);
                        },
                ),
              ],
            ),
          ),
        );
        return;
      }
      if (tool == 'Audio') {
        await _audio();
        return;
      }
      if (tool == 'Look') {
        await showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          builder: (sheet) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final look in [
                  'none',
                  'vivid',
                  'warm',
                  'cool',
                  'mono',
                  'dusk',
                ])
                  ListTile(
                    title: Text(look),
                    trailing: _scene['look'] == look
                        ? const Icon(Icons.check)
                        : null,
                    onTap: () {
                      _edit({'look': look});
                      Navigator.pop(sheet);
                    },
                  ),
                ListTile(
                  title: const Text('Rotate 90°'),
                  onTap: () {
                    _edit({
                      'rotation':
                          ((_scene['rotation'] as int? ?? 0) + 90) % 360,
                    });
                    Navigator.pop(sheet);
                  },
                ),
                ListTile(
                  title: const Text('Fit / fill'),
                  subtitle: Text(_scene['fit']),
                  onTap: () {
                    _edit({
                      'fit': _scene['fit'] == 'contain' ? 'cover' : 'contain',
                    });
                    Navigator.pop(sheet);
                  },
                ),
                if (_scene['kind'] == 'image')
                  SwitchListTile(
                    value: _scene['kenBurns'] == true,
                    title: const Text('Gentle pan & zoom'),
                    onChanged: (v) {
                      _edit({'kenBurns': v});
                      Navigator.pop(sheet);
                    },
                  ),
                for (final transition in [
                  'cut',
                  'fade',
                  'flash',
                  'slide',
                  'wipe',
                ])
                  ListTile(
                    title: Text('Transition: $transition'),
                    onTap: () {
                      _edit({'transition': transition});
                      Navigator.pop(sheet);
                    },
                  ),
              ],
            ),
          ),
        );
        return;
      }
      if (tool == 'Trim') {
        var start = timelineNumber(_scene['sourceIn']),
            end =
                start +
                timelineNumber(_scene['duration']) *
                    timelineNumber(_scene['speed'], 1),
            speed = timelineNumber(_scene['speed'], 1);
        final max = timelineNumber(_scene['sourceDuration'], end);
        await showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          isScrollControlled: true,
          builder: (sheet) => StatefulBuilder(
            builder: (context, update) => SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Trim scene',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    RangeSlider(
                      values: RangeValues(start, end),
                      max: max,
                      min: 0,
                      labels: RangeLabels(
                        '${start.toStringAsFixed(1)}s',
                        '${end.toStringAsFixed(1)}s',
                      ),
                      onChanged: (v) => update(() {
                        start = (v.start * 10).round() / 10;
                        end = v.end;
                      }),
                    ),
                    Text(
                      '${start.toStringAsFixed(1)} – ${end.toStringAsFixed(1)}s',
                    ),
                    DropdownButton<double>(
                      value: speed,
                      items: [.5, 1.0, 1.5, 2.0]
                          .map(
                            (v) => DropdownMenuItem(
                              value: v,
                              child: Text('${v}× speed'),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => update(() => speed = v!),
                    ),
                    FilledButton(
                      onPressed: (end - start) / speed < .5
                          ? null
                          : () {
                              _edit({
                                'sourceIn': start,
                                'duration': (end - start) / speed,
                                'speed': speed,
                              });
                              Navigator.pop(sheet);
                            },
                      child: const Text('Apply trim'),
                    ),
                    TextButton(
                      onPressed: () {
                        try {
                          _checkpoint();
                          _project!.split(_selected, _position);
                          _save();
                          _select(_selected);
                          Navigator.pop(sheet);
                        } on Object catch (e) {
                          Navigator.pop(sheet);
                          setState(() => _error = '$e');
                        }
                      },
                      child: const Text('Split at playhead'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _text(bool caption) async {
    final controller = TextEditingController(),
        start = TextEditingController(
          text: timelineNumber(_scene['sourceIn']).toStringAsFixed(1),
        ),
        end = TextEditingController(
          text:
              (timelineNumber(_scene['sourceIn']) +
                      timelineNumber(_scene['duration']) *
                          timelineNumber(_scene['speed'], 1))
                  .toStringAsFixed(1),
        );
    var y = caption ? .84 : .5, font = 38.0;
    String? editingId;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => StatefulBuilder(
        builder: (context, update) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  caption ? 'Timed captions · supplied text' : 'Text overlay',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  maxLines: 3,
                  maxLength: 500,
                  decoration: InputDecoration(
                    labelText: caption
                        ? 'Caption text (Kasem is preserved)'
                        : 'Text',
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: start,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Source start (s)',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: end,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Source end (s)',
                        ),
                      ),
                    ),
                  ],
                ),
                const Text('Vertical position'),
                Slider(
                  value: y,
                  min: .1,
                  max: .9,
                  onChanged: (v) => update(() => y = v),
                ),
                const Text('Text size'),
                Slider(
                  value: font,
                  min: 24,
                  max: 72,
                  onChanged: (v) => update(() => font = v),
                ),
                FilledButton(
                  onPressed: () {
                    final a = double.tryParse(start.text),
                        b = double.tryParse(end.text);
                    if (controller.text.trim().isEmpty ||
                        a == null ||
                        b == null ||
                        b <= a)
                      return;
                    _checkpoint();
                    _scene['overlays'] = [
                      ...timelineRows(_scene['overlays'])
                          .where((layer) => layer['id'] != editingId),
                      {
                        'id':
                            editingId ??
                            'text-${DateTime.now().microsecondsSinceEpoch}',
                        'type': caption ? 'caption' : 'text',
                        'text': controller.text,
                        'language': caption ? 'supplied' : null,
                        'sourceStart': a,
                        'sourceEnd': b,
                        'x': .5,
                        'y': y,
                        'fontSize': font,
                        'z': caption ? 20 : 10,
                      },
                    ];
                    _save();
                    Navigator.pop(sheet);
                  },
                  child: Text(
                    editingId == null ? 'Add overlay' : 'Save overlay',
                  ),
                ),
                if (caption)
                  TextButton.icon(
                    onPressed: () async {
                      try {
                        final picked = await FilePicker.platform.pickFiles(
                          type: FileType.custom,
                          allowedExtensions: ['srt', 'vtt', 'txt'],
                        );
                        if (picked?.files.single.path == null) return;
                        final file = File(picked!.files.single.path!);
                        if (await file.length() > 512 * 1024)
                          throw StateError(
                            'Choose a caption file under 512 KB.',
                          );
                        final parsed = parseCaptionFile(
                          fileName: picked.files.single.name,
                          contents: await file.readAsString(),
                          spanStart: Duration(
                            milliseconds:
                                (timelineNumber(_scene['sourceIn']) * 1000)
                                    .round(),
                          ),
                          spanEnd: Duration(
                            milliseconds:
                                ((timelineNumber(_scene['sourceIn']) +
                                            timelineNumber(_scene['duration']) *
                                                timelineNumber(
                                                  _scene['speed'],
                                                  1,
                                                )) *
                                        1000)
                                    .round(),
                          ),
                        );
                        _checkpoint();
                        _scene['overlays'] = [
                          ...timelineRows(_scene['overlays']),
                          for (final cue in parsed.cues)
                            {
                              'id':
                                  'caption-${DateTime.now().microsecondsSinceEpoch}-${cue.start.inMilliseconds}',
                              'type': 'caption',
                              'text': cue.text,
                              'language': 'supplied',
                              'sourceStart': cue.start.inMilliseconds / 1000,
                              'sourceEnd': cue.end.inMilliseconds / 1000,
                              'x': .5,
                              'y': .84,
                              'fontSize': font,
                              'z': 20,
                            },
                        ];
                        await _save();
                        if (sheet.mounted) Navigator.pop(sheet);
                      } on Object catch (e) {
                        if (mounted) setState(() => _error = '$e');
                      }
                    },
                    icon: const Icon(Icons.upload_file),
                    label: const Text('Import SRT, VTT or supplied transcript'),
                  ),
                ...timelineRows(_scene['overlays'])
                    .where((l) => l['type'] != 'sticker')
                    .map(
                      (l) => ListTile(
                        onTap: () => update(() {
                          editingId = l['id'];
                          controller.text = l['text'] ?? '';
                          start.text = '${l['sourceStart']}';
                          end.text = '${l['sourceEnd']}';
                          y = timelineNumber(l['y'], .84);
                          font = timelineNumber(l['fontSize'], 38);
                        }),
                        title: Text(l['text'] ?? ''),
                        subtitle: Text(
                          '${l['sourceStart']} – ${l['sourceEnd']}s',
                        ),
                        trailing: IconButton(
                          tooltip: 'Remove overlay',
                          onPressed: () {
                            _checkpoint();
                            _scene['overlays'] = timelineRows(
                              _scene['overlays'],
                            ).where((o) => o['id'] != l['id']).toList();
                            _save();
                            Navigator.pop(sheet);
                          },
                          icon: const Icon(Icons.delete_outline),
                        ),
                      ),
                    ),
              ],
            ),
          ),
        ),
      ),
    );
    controller.dispose();
    start.dispose();
    end.dispose();
  }

  Future<void> _library({bool sticker = false}) async {
    final docs = await FirebaseFirestore.instance
        .collection(sticker ? 'videoStickers' : 'videoMusicTracks')
        .where('status', isEqualTo: 'published')
        .limit(60)
        .get();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            if (docs.docs.isEmpty)
              const ListTile(
                title: Text('No licensed library items are published yet.'),
              ),
            ...docs.docs.map(
              (doc) => ListTile(
                title: Text(
                  doc.data()['title'] ?? doc.data()['name'] ?? doc.id,
                ),
                subtitle: Text(
                  doc.data()['credit'] ?? doc.data()['artist'] ?? '',
                ),
                onTap: () {
                  _checkpoint();
                  if (sticker) {
                    _scene['overlays'] = [
                      ...timelineRows(_scene['overlays']),
                      {
                        'id':
                            'sticker-${DateTime.now().microsecondsSinceEpoch}',
                        'type': 'sticker',
                        'stickerId': doc.id,
                        'sourceStart': timelineNumber(_scene['sourceIn']),
                        'sourceEnd':
                            timelineNumber(_scene['sourceIn']) +
                            timelineNumber(_scene['duration']),
                        'x': .5,
                        'y': .5,
                        'size': .2,
                      },
                    ];
                  } else {
                    _project!.music.add({
                      'id': 'music-${DateTime.now().microsecondsSinceEpoch}',
                      'trackId': doc.id,
                      'start': 0,
                      'sourceIn': 0,
                      'duration': _project!.duration,
                      'volume': .5,
                      'fadeIn': .3,
                      'fadeOut': .5,
                    });
                  }
                  _save();
                  Navigator.pop(sheet);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _audio() async {
    var volume = timelineNumber(_scene['volume'], 1);
    String? recordingPath;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => StatefulBuilder(
        builder: (context, update) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Original audio volume'),
                  Slider(
                    value: volume.clamp(0, 1),
                    onChanged: (v) => update(() => volume = v),
                    onChangeEnd: (v) => _edit({'volume': v}),
                  ),
                  SwitchListTile(
                    value: _scene['duckMusic'] == true,
                    title: const Text('Duck music during original audio'),
                    onChanged: (v) {
                      _edit({'duckMusic': v});
                      update(() {});
                    },
                  ),
                  ListTile(
                    leading: const Icon(Icons.library_music),
                    title: const Text('Licensed music library'),
                    onTap: () {
                      Navigator.pop(sheet);
                      _library();
                    },
                  ),
                  ListTile(
                    leading: Icon(_recording ? Icons.stop : Icons.mic),
                    title: Text(
                      _recording
                          ? 'Stop voiceover'
                          : 'Record voiceover for this scene',
                    ),
                    onTap: () async {
                      try {
                        if (_recording) {
                          final path = await _recorder.stop();
                          update(() => _recording = false);
                          if (path != null) await _attachVoice(path);
                        } else {
                          if (!await _recorder.hasPermission()) return;
                          recordingPath =
                              '${(await _repository.directory(_project!.ownerUid, _project!.id)).path}/voice-${DateTime.now().microsecondsSinceEpoch}.m4a';
                          await _repository.saveLocal(_project!);
                          await _recorder.start(
                            const RecordConfig(encoder: AudioEncoder.aacLc),
                            path: recordingPath!,
                          );
                          update(() => _recording = true);
                        }
                      } on Object catch (e) {
                        if (mounted) setState(() => _error = '$e');
                      }
                    },
                  ),
                  ListTile(
                    leading: const Icon(Icons.upload_file),
                    title: const Text('Upload voiceover'),
                    onTap: () async {
                      final result = await FilePicker.platform.pickFiles(
                        type: FileType.audio,
                      );
                      if (result?.files.single.path != null)
                        await _attachVoice(result!.files.single.path!);
                      if (sheet.mounted) Navigator.pop(sheet);
                    },
                  ),
                  if (_scene['voice'] != null)
                    ListTile(
                      title: const Text('Voiceover volume & fades'),
                      leading: const Icon(Icons.tune),
                      onTap: () {
                        Navigator.pop(sheet);
                        _mixTrack(_scene['voice'] as TimelineRow, 'Voiceover');
                      },
                    ),
                  if (_scene['voice'] != null)
                    ListTile(
                      title: const Text('Remove voiceover'),
                      onTap: () {
                        _edit({'voice': null});
                        Navigator.pop(sheet);
                      },
                    ),
                  for (final track in _project!.music)
                    ListTile(
                      title: const Text('Music track'),
                      onTap: () {
                        Navigator.pop(sheet);
                        _mixTrack(track, 'Music');
                      },
                      subtitle: Text(
                        '${track['trackId']} · volume ${track['volume']}',
                      ),
                      trailing: IconButton(
                        tooltip: 'Remove music',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () {
                          _checkpoint();
                          _project!.music.remove(track);
                          _save();
                          update(() {});
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (_recording) {
      final path = await _recorder.stop();
      _recording = false;
      if (path != null) await _attachVoice(path);
    }
  }

  Future<void> _attachVoice(String path) async {
    final id = 'voice-${DateTime.now().microsecondsSinceEpoch}',
        local = await _repository.adopt(_project!, path, '$id.m4a');
    await _edit({
      'voice': {
        'mediaId': id,
        'kind': 'audio',
        'localPath': local,
        'sourceIn': -timelineNumber(_scene['sourceIn']),
        'volume': 1,
      },
    });
  }

  Future<void> _mixTrack(TimelineRow track, String title) async {
    _checkpoint();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => StatefulBuilder(
        builder: (context, update) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '$title mix',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                for (final field in ['volume', 'fadeIn', 'fadeOut']) ...[
                  Text(
                    '${{'volume': 'Volume', 'fadeIn': 'Fade in (seconds)', 'fadeOut': 'Fade out (seconds)'}[field]}: ${timelineNumber(track[field], field == 'volume' ? 1 : 0).toStringAsFixed(2)}',
                  ),
                  Slider(
                    value: timelineNumber(
                      track[field],
                      field == 'volume' ? 1 : 0,
                    ).clamp(0, field == 'volume' ? 1 : 5),
                    max: field == 'volume' ? 1 : 5,
                    onChanged: (value) => update(() => track[field] = value),
                    onChangeEnd: (_) => _save(),
                  ),
                ],
                FilledButton(
                  onPressed: () async {
                    await _save();
                    if (sheet.mounted) Navigator.pop(sheet);
                  },
                  child: const Text('Save mix'),
                ),
                const Text(
                  'Use the rendered preview to check the complete audio mix.',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OverlayPreview extends CustomPainter {
  const _OverlayPreview({required this.layers, required this.frame});
  final List<TimelineRow> layers;
  final Size frame;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / frame.width, size.height / frame.height);
    for (final layer in layers) {
      VideoEditorRepository.paintOverlay(canvas, frame, layer);
    }
  }

  @override
  bool shouldRepaint(_OverlayPreview old) => true;
}

class _SceneThumbnail extends StatefulWidget {
  const _SceneThumbnail({required this.scene});
  final TimelineRow scene;
  @override
  State<_SceneThumbnail> createState() => _SceneThumbnailState();
}

class _SceneThumbnailState extends State<_SceneThumbnail> {
  Uint8List? _bytes;
  @override
  void initState() {
    super.initState();
    if (widget.scene['kind'] == 'video')
      VideoThumbnail.thumbnailData(
            video: widget.scene['localPath'],
            imageFormat: ImageFormat.JPEG,
            maxWidth: 160,
            timeMs: (timelineNumber(widget.scene['sourceIn']) * 1000).round(),
            quality: 65,
          )
          .then((bytes) {
            if (mounted) setState(() => _bytes = bytes);
          })
          .catchError((Object _) {});
  }

  @override
  Widget build(BuildContext context) => widget.scene['kind'] == 'image'
      ? Image.file(
          File(widget.scene['localPath']),
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => const Icon(Icons.broken_image),
        )
      : _bytes == null
      ? const Center(child: Icon(Icons.movie_outlined))
      : Image.memory(_bytes!, fit: BoxFit.cover);
}
