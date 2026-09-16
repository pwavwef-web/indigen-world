import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// A finished take.
@immutable
class LearnRecording {
  const LearnRecording({required this.path, required this.duration});

  final String path;
  final Duration duration;

  int get sizeBytes {
    try {
      return File(path).lengthSync();
    } on Object {
      return 0;
    }
  }
}

/// Record, listen back, record again.
///
/// The microphone permission is asked for the first time the member presses
/// record — never when the screen opens — and a refusal is answered with a
/// sentence rather than a dead button. Speech is recorded mono AAC at 16 kHz:
/// small enough to upload from a village connection, and what both the review
/// desk and Vertex transcription read.
class LearnRecorder extends ConsumerStatefulWidget {
  const LearnRecorder({
    required this.onRecorded,
    required this.onCleared,
    this.maxLength = const Duration(seconds: 30),
    this.enabled = true,
    this.recordLabel = 'Record',
    super.key,
  });

  final ValueChanged<LearnRecording> onRecorded;
  final VoidCallback onCleared;
  final Duration maxLength;
  final bool enabled;
  final String recordLabel;

  @override
  ConsumerState<LearnRecorder> createState() => LearnRecorderState();
}

class LearnRecorderState extends ConsumerState<LearnRecorder> {
  final _recorder = AudioRecorder();
  AudioPlayer? _player;
  final _clock = Stopwatch();
  Timer? _ticker;
  LearnRecording? _take;
  String? _pendingPath;
  var _recording = false;
  String? _error;

  late final FullScreenMediaCount _audioFocus = ref.read(
    fullScreenMediaProvider.notifier,
  );
  var _claimed = false;

  LearnRecording? get take => _take;

  @override
  void dispose() {
    _ticker?.cancel();
    if (_claimed) _audioFocus.leave();
    unawaited(_recorder.dispose());
    unawaited(_player?.dispose());
    final path = _take?.path ?? _pendingPath;
    if (path != null) unawaited(_delete(path));
    super.dispose();
  }

  /// Forgets the take, deleting its file. Called after a successful submit.
  Future<void> reset() async {
    await _player?.stop();
    final path = _take?.path;
    setState(() => _take = null);
    if (path != null) await _delete(path);
  }

  Future<void> _start() async {
    if (!_claimed) {
      _claimed = true;
      _audioFocus.enter();
    }
    setState(() => _error = null);
    await _player?.stop();
    if (!await _recorder.hasPermission()) {
      if (mounted) {
        setState(
          () => _error =
              'Microphone access is off. Allow it in your phone’s settings to record.',
        );
      }
      return;
    }
    final directory = await getTemporaryDirectory();
    final path =
        '${directory.path}${Platform.pathSeparator}learn_${DateTime.now().millisecondsSinceEpoch}.m4a';
    try {
      await _recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 48000,
          sampleRate: 16000,
          numChannels: 1,
        ),
        path: path,
      );
    } on Object {
      if (mounted) setState(() => _error = 'Recording could not start.');
      return;
    }
    _pendingPath = path;
    _clock
      ..reset()
      ..start();
    setState(() => _recording = true);
    _ticker = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (!mounted) return;
      if (_clock.elapsed >= widget.maxLength) {
        unawaited(_stop());
        return;
      }
      setState(() {});
    });
  }

  Future<void> _stop() async {
    _ticker?.cancel();
    _ticker = null;
    _clock.stop();
    final path = await _recorder.stop();
    if (!mounted) return;
    setState(() => _recording = false);
    final file = path == null ? null : File(path);
    if (file == null ||
        !file.existsSync() ||
        file.lengthSync() < 512 ||
        _clock.elapsed.inMilliseconds < 400) {
      setState(() => _error = 'That was too short to hear. Try again.');
      return;
    }
    final previous = _take?.path;
    if (previous != null && previous != path) unawaited(_delete(previous));
    _pendingPath = null;
    final take = LearnRecording(path: path!, duration: _clock.elapsed);
    setState(() => _take = take);
    await _player?.dispose();
    _player = null;
    widget.onRecorded(take);
  }

  Future<void> _togglePlayback() async {
    final take = _take;
    if (take == null) return;
    final player = _player ??= AudioPlayer();
    try {
      if (player.playing) {
        await player.pause();
      } else {
        if (player.audioSource == null) await player.setFilePath(take.path);
        if (player.processingState == ProcessingState.completed) {
          await player.seek(Duration.zero);
        }
        unawaited(player.play());
      }
    } on Object {
      if (mounted) setState(() => _error = 'The recording could not be played.');
    }
    if (mounted) setState(() {});
  }

  Future<void> _discard() async {
    await reset();
    widget.onCleared();
  }

  static Future<void> _delete(String path) async {
    try {
      final file = File(path);
      if (file.existsSync()) await file.delete();
    } on Object {
      // A temporary file the platform clears anyway.
    }
  }

  static String _clockText(Duration value) =>
      '${value.inMinutes}:${(value.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final take = _take;
    final playing = _player?.playing ?? false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Semantics(
              button: true,
              label: _recording ? 'Stop recording' : widget.recordLabel,
              excludeSemantics: true,
              child: SizedBox.square(
                dimension: 56,
                child: FilledButton(
                  key: const Key('learn-recorder-record'),
                  onPressed: !widget.enabled
                      ? null
                      : _recording
                      ? _stop
                      : _start,
                  style: FilledButton.styleFrom(
                    padding: EdgeInsets.zero,
                    shape: const CircleBorder(),
                    backgroundColor: _recording ? brand.danger : brand.accentFill,
                    foregroundColor: Colors.white,
                  ),
                  child: Icon(
                    _recording ? Icons.stop_rounded : Icons.mic_rounded,
                    size: 28,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _recording
                        ? 'Recording…  ${_clockText(_clock.elapsed)} / ${_clockText(widget.maxLength)}'
                        : take != null
                        ? 'Your take · ${_clockText(take.duration)}'
                        : widget.recordLabel,
                    style: TextStyle(
                      color: brand.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                  if (_recording) ...[
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        value:
                            _clock.elapsed.inMilliseconds /
                            widget.maxLength.inMilliseconds,
                        minHeight: 4,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (take != null && !_recording) ...[
              IconButton.filledTonal(
                tooltip: playing ? 'Pause' : 'Play your take',
                onPressed: _togglePlayback,
                icon: Icon(
                  playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                ),
              ),
              IconButton(
                tooltip: 'Discard the take',
                onPressed: widget.enabled ? _discard : null,
                icon: const Icon(Icons.delete_outline_rounded),
              ),
            ],
          ],
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Semantics(
              liveRegion: true,
              child: Text(
                _error!,
                style: TextStyle(color: brand.danger, fontSize: 12.5),
              ),
            ),
          ),
      ],
    );
  }
}
