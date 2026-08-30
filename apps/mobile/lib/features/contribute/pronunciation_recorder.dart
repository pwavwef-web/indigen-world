import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Saying the word, as part of submitting it.
///
/// A dictionary entry is the one contribution whose whole point is a sound. The
/// form used to take only spelling and a translation, so the audio on an entry
/// could only ever come from somewhere else — which is why the play button on a
/// published word has never had anything to play. The person submitting the
/// word is the person who knows how it is said; this asks them while they are
/// already here.
///
/// Optional on purpose. Somewhere with no quiet room, or no microphone
/// permission to give, must still be able to contribute the word.
class PronunciationRecorderField extends StatefulWidget {
  const PronunciationRecorderField({
    required this.file,
    required this.onRecorded,
    required this.onCleared,
    this.progress,
    this.enabled = true,
    super.key,
  });

  /// The take currently held by the form, if any.
  final PickedContributionFile? file;

  final ValueChanged<PickedContributionFile> onRecorded;
  final VoidCallback onCleared;

  /// Upload progress once the form is submitting, or null before that.
  final double? progress;

  /// False while the form is sending, when nothing here should still move.
  final bool enabled;

  @override
  State<PronunciationRecorderField> createState() =>
      _PronunciationRecorderFieldState();
}

class _PronunciationRecorderFieldState
    extends State<PronunciationRecorderField> {
  final _recorder = AudioRecorder();
  AudioPlayer? _player;

  var _recording = false;
  DateTime? _startedAt;
  Timer? _ticker;
  String? _error;

  /// A word, said once or twice. The cap is what stops a stuck recording
  /// becoming a twenty-minute upload from a rural connection, and it is
  /// generous enough for a headword plus its example sentence.
  static const _maxLength = Duration(seconds: 30);

  @override
  void dispose() {
    _ticker?.cancel();
    unawaited(_recorder.dispose());
    unawaited(_player?.dispose());
    super.dispose();
  }

  Duration get _elapsed => _startedAt == null
      ? Duration.zero
      : DateTime.now().difference(_startedAt!);

  Future<void> _start() async {
    setState(() => _error = null);
    // Asked at the moment it is needed, and never fatal: the rest of the entry
    // is still a contribution worth having without it.
    if (!await _recorder.hasPermission()) {
      if (mounted) {
        setState(
          () => _error =
              'Microphone permission is needed to record a pronunciation.',
        );
      }
      return;
    }
    final directory = await getTemporaryDirectory();
    final path =
        '${directory.path}${Platform.pathSeparator}'
        'pronunciation_${DateTime.now().millisecondsSinceEpoch}.m4a';
    try {
      await _recorder.start(
        // Small enough that a whole word costs a few tens of kilobytes, and
        // still plainly intelligible — this is speech, not music.
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000),
        path: path,
      );
    } on Object {
      if (mounted) {
        setState(() => _error = 'Recording could not start on this device.');
      }
      return;
    }
    await _discardPlayer();
    if (!mounted) {
      await _recorder.stop();
      return;
    }
    setState(() {
      _recording = true;
      _startedAt = DateTime.now();
    });
    _ticker = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (!mounted) return;
      if (_elapsed >= _maxLength) {
        unawaited(_stop());
        return;
      }
      setState(() {});
    });
  }

  Future<void> _stop() async {
    if (!_recording) return;
    _ticker?.cancel();
    _ticker = null;
    final seconds = _elapsed.inMilliseconds / 1000;
    final path = await _recorder.stop();
    if (!mounted) return;
    setState(() {
      _recording = false;
      _startedAt = null;
    });
    if (path == null) return;
    final file = File(path);
    // A tap that started and ended a recording in the same gesture leaves a
    // file with nothing in it. Handing that to a reviewer as a pronunciation
    // would waste their time and the contributor's.
    if (seconds < 0.4 || !file.existsSync() || file.lengthSync() < 512) {
      await _delete(path);
      setState(
        () => _error = 'That was too short to hear. Hold on a little longer.',
      );
      return;
    }
    widget.onRecorded(
      PickedContributionFile(
        path: path,
        name: 'pronunciation.m4a',
        sizeBytes: file.lengthSync(),
        kind: ContributionMediaKind.audio,
      ),
    );
  }

  Future<void> _togglePlayback() async {
    final chosen = widget.file;
    if (chosen == null) return;
    final player = _player ??= AudioPlayer();
    try {
      if (player.playing) {
        await player.pause();
      } else {
        if (player.audioSource == null) {
          await player.setFilePath(chosen.path);
        }
        // Replaying a finished take starts it again rather than doing nothing,
        // which is what a second tap on a play button has to mean.
        if (player.processingState == ProcessingState.completed) {
          await player.seek(Duration.zero);
        }
        await player.play();
      }
    } on Object {
      if (mounted) setState(() => _error = 'That take could not be played.');
      return;
    }
    if (mounted) setState(() {});
  }

  Future<void> _clear() async {
    final chosen = widget.file;
    await _discardPlayer();
    widget.onCleared();
    if (chosen != null) await _delete(chosen.path);
    if (mounted) setState(() => _error = null);
  }

  Future<void> _discardPlayer() async {
    final player = _player;
    _player = null;
    if (player != null) await player.dispose();
  }

  Future<void> _delete(String path) async {
    try {
      final file = File(path);
      if (file.existsSync()) await file.delete();
    } on Object {
      // A temp file the platform will clear anyway. Nothing here is worth
      // failing a contribution over.
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final chosen = widget.file;
    return GlassSurface(
      blur: false,
      radius: 18,
      lifted: false,
      padding: const EdgeInsets.fromLTRB(15, 14, 15, 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.record_voice_over_rounded, color: brand.accent),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Say the word',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                'OPTIONAL',
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'A short recording is what lets other people hear the entry '
            'rather than guess at it.',
            style: TextStyle(color: brand.mutedInk, fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 12),
          if (_recording)
            _RecordingRow(
              elapsed: _elapsed,
              maxLength: _maxLength,
              onStop: _stop,
            )
          else if (chosen == null)
            OutlinedButton.icon(
              onPressed: widget.enabled ? _start : null,
              icon: const Icon(Icons.mic_none_rounded),
              label: const Text('Record pronunciation'),
            )
          else
            _TakeRow(
              file: chosen,
              playing: _player?.playing ?? false,
              enabled: widget.enabled,
              onPlay: _togglePlayback,
              onRerecord: () async {
                await _clear();
                if (mounted) await _start();
              },
              onClear: _clear,
            ),
          if (widget.progress != null) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: widget.progress,
                minHeight: 6,
                backgroundColor: brand.divider,
              ),
            ),
          ],
          if (_error case final message?) ...[
            const SizedBox(height: 10),
            Text(
              message,
              style: TextStyle(
                color: brand.terracotta,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// While the microphone is open: how long so far, and the one way out.
class _RecordingRow extends StatelessWidget {
  const _RecordingRow({
    required this.elapsed,
    required this.maxLength,
    required this.onStop,
  });

  final Duration elapsed;
  final Duration maxLength;
  final Future<void> Function() onStop;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final left = maxLength - elapsed;
    return Row(
      children: [
        Icon(
          Icons.fiber_manual_record_rounded,
          color: brand.terracotta,
          size: 18,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Recording',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              Text(
                '${left.inSeconds.clamp(0, maxLength.inSeconds)}s left',
                style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
              ),
            ],
          ),
        ),
        Text(
          _clock(elapsed),
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(width: 6),
        IconButton.filled(
          tooltip: 'Finish recording',
          onPressed: onStop,
          style: IconButton.styleFrom(
            backgroundColor: brand.terracotta,
            foregroundColor: Colors.white,
          ),
          icon: const Icon(Icons.stop_rounded),
        ),
      ],
    );
  }

  static String _clock(Duration value) {
    final seconds = value.inSeconds.clamp(0, 599);
    return '${(seconds ~/ 60).toString().padLeft(2, '0')}:'
        '${(seconds % 60).toString().padLeft(2, '0')}';
  }
}

/// The take that is held: hear it back, do it again, or drop it.
class _TakeRow extends StatelessWidget {
  const _TakeRow({
    required this.file,
    required this.playing,
    required this.enabled,
    required this.onPlay,
    required this.onRerecord,
    required this.onClear,
  });

  final PickedContributionFile file;
  final bool playing;
  final bool enabled;
  final Future<void> Function() onPlay;
  final Future<void> Function() onRerecord;
  final Future<void> Function() onClear;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Row(
      children: [
        IconButton.filledTonal(
          tooltip: playing ? 'Pause' : 'Hear it back',
          onPressed: enabled ? onPlay : null,
          icon: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Pronunciation recorded',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              Text(
                file.sizeLabel,
                style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Record again',
          onPressed: enabled ? onRerecord : null,
          icon: const Icon(Icons.refresh_rounded),
        ),
        IconButton(
          tooltip: 'Remove',
          onPressed: enabled ? onClear : null,
          icon: const Icon(Icons.close_rounded),
        ),
      ],
    );
  }
}
