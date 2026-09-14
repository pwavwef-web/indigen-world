import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_home.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// The sentence shown before and during every recording.
const kawuriVoiceEnglishOnly = 'Voice input currently supports English only.';

/// Records an English voice message and returns its transcript, or null when
/// the member backs out.
///
/// The transcript goes into the composer for editing — it is never sent on
/// the member's behalf.
Future<KawuriTranscript?> showKawuriVoiceInput(BuildContext context) =>
    showModalBottomSheet<KawuriTranscript>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: const Color(0xFF0B2A22),
      builder: (_) => const _VoiceSheet(),
    );

enum _Phase { ready, recording, paused, recorded, sending }

class _VoiceSheet extends ConsumerStatefulWidget {
  const _VoiceSheet();

  @override
  ConsumerState<_VoiceSheet> createState() => _VoiceSheetState();
}

class _VoiceSheetState extends ConsumerState<_VoiceSheet> {
  final _recorder = AudioRecorder();
  AudioPlayer? _player;
  _Phase _phase = _Phase.ready;
  final _clock = Stopwatch();
  Timer? _ticker;
  String? _path;
  String? _error;
  double? _uploadProgress;

  /// Kept for the whole send, so a retry after a dropped connection is the
  /// same request rather than a second transcription.
  String? _requestId;

  late final FullScreenMediaCount _audioFocus = ref.read(
    fullScreenMediaProvider.notifier,
  );
  bool _claimed = false;

  @override
  void dispose() {
    _ticker?.cancel();
    if (_claimed) _audioFocus.leave();
    unawaited(_recorder.dispose());
    unawaited(_player?.dispose());
    final path = _path;
    if (path != null) unawaited(_deleteLocal(path));
    super.dispose();
  }

  Duration get _elapsed => _clock.elapsed;

  int _maxSeconds() =>
      (ref.read(kawuriCapabilitiesProvider).value ?? KawuriCapabilities.none)
          .transcriptionSeconds;

  Future<void> _start() async {
    if (!_claimed) {
      _claimed = true;
      _audioFocus.enter();
    }
    setState(() => _error = null);
    // Asked now, at the moment the microphone is needed, after the sheet has
    // already said why.
    if (!await _recorder.hasPermission()) {
      if (mounted) {
        setState(
          () => _error = 'Microphone permission is needed to record a voice message. You can still type instead.',
        );
      }
      return;
    }
    final directory = await getTemporaryDirectory();
    final path =
        '${directory.path}${Platform.pathSeparator}kawuri_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    try {
      await _recorder.start(
        // Speech, mono, small: two minutes is well under a megabyte.
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 48000,
          sampleRate: 16000,
          numChannels: 1,
        ),
        path: path,
      );
    } on Object {
      if (mounted) {
        setState(() => _error = 'Recording could not start on this device.');
      }
      return;
    }
    if (_path != null) await _deleteLocal(_path!);
    _path = path;
    _requestId = null;
    _clock
      ..reset()
      ..start();
    setState(() => _phase = _Phase.recording);
    _ticker = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!mounted) return;
      if (_elapsed.inSeconds >= _maxSeconds()) {
        unawaited(_stop());
        return;
      }
      setState(() {});
    });
  }

  Future<void> _pause() async {
    await _recorder.pause();
    _clock.stop();
    if (mounted) setState(() => _phase = _Phase.paused);
  }

  Future<void> _resume() async {
    await _recorder.resume();
    _clock.start();
    if (mounted) setState(() => _phase = _Phase.recording);
  }

  Future<void> _stop() async {
    _ticker?.cancel();
    _ticker = null;
    _clock.stop();
    final path = await _recorder.stop();
    if (!mounted) return;
    final file = path == null ? null : File(path);
    if (file == null ||
        !file.existsSync() ||
        file.lengthSync() < 512 ||
        _elapsed.inMilliseconds < 500) {
      setState(() {
        _phase = _Phase.ready;
        _error = 'That was too short to hear. Try again.';
      });
      return;
    }
    setState(() => _phase = _Phase.recorded);
  }

  Future<void> _togglePlayback() async {
    final path = _path;
    if (path == null) return;
    final player = _player ??= AudioPlayer();
    try {
      if (player.playing) {
        await player.pause();
      } else {
        if (player.audioSource == null) await player.setFilePath(path);
        if (player.processingState == ProcessingState.completed) {
          await player.seek(Duration.zero);
        }
        unawaited(player.play());
      }
    } on Object {
      if (mounted) {
        setState(() => _error = 'The recording could not be played.');
      }
    }
    if (mounted) setState(() {});
  }

  Future<void> _send() async {
    final repository = ref.read(kawuriMediaRepositoryProvider);
    final path = _path;
    if (repository == null || path == null) return;
    await _player?.pause();
    final requestId = _requestId ??= KawuriMediaRepository.newRequestId('stt');
    setState(() {
      _phase = _Phase.sending;
      _error = null;
      _uploadProgress = 0;
    });
    try {
      final storagePath = await repository.upload(
        purpose: 'audio',
        filePath: path,
        contentType: 'audio/mp4',
        onProgress: (value) {
          if (mounted) setState(() => _uploadProgress = value);
        },
      );
      if (mounted) setState(() => _uploadProgress = null);
      final transcript = await repository.transcribe(
        requestId: requestId,
        storagePath: storagePath,
        durationSeconds: _elapsed.inSeconds.clamp(1, _maxSeconds()),
      );
      if (!mounted) return;
      Navigator.of(context).pop(transcript);
    } on KawuriMediaException catch (error) {
      if (!mounted) return;
      setState(() {
        _phase = _Phase.recorded;
        _uploadProgress = null;
        _error = error.message;
        // The server deleted its copy; the next attempt uploads again under a
        // new request.
        _requestId = null;
      });
    }
  }

  static Future<void> _deleteLocal(String path) async {
    try {
      final file = File(path);
      if (file.existsSync()) await file.delete();
    } on Object {
      // A temporary file the platform clears anyway.
    }
  }

  String _clockText() {
    final seconds = _elapsed.inSeconds;
    final max = _maxSeconds();
    String format(int value) =>
        '${value ~/ 60}:${(value % 60).toString().padLeft(2, '0')}';
    return '${format(seconds)} / ${format(max)}';
  }

  @override
  Widget build(BuildContext context) {
    final recording = _phase == _Phase.recording;
    final paused = _phase == _Phase.paused;
    final sending = _phase == _Phase.sending;
    const body = TextStyle(color: Color(0xFFD5E4DE), height: 1.45);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          16,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Voice message',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFF3A2F12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  Icon(
                    Icons.translate_rounded,
                    color: Color(0xFFE7C574),
                    size: 18,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      kawuriVoiceEnglishOnly,
                      style: TextStyle(
                        color: Color(0xFFF2E2B8),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Kawuri needs your microphone to hear this message. The recording is uploaded privately, turned into text for you to edit, then deleted. Kasem and other languages can still be typed.',
              style: body,
            ),
            const SizedBox(height: 18),
            Semantics(
              liveRegion: true,
              label: recording
                  ? 'Recording, ${_elapsed.inSeconds} seconds'
                  : null,
              child: Text(
                _phase == _Phase.ready ? 'Ready to record' : _clockText(),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: recording ? const Color(0xFFFF8A80) : Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            const SizedBox(height: 14),
            if (sending) ...[
              LinearProgressIndicator(value: _uploadProgress),
              const SizedBox(height: 8),
              Text(
                _uploadProgress != null
                    ? 'Uploading…'
                    : 'Turning your words into text…',
                textAlign: TextAlign.center,
                style: body,
              ),
            ] else
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 12,
                runSpacing: 10,
                children: [
                  if (_phase == _Phase.ready || _phase == _Phase.recorded)
                    FilledButton.icon(
                      onPressed: _start,
                      style: FilledButton.styleFrom(
                        backgroundColor: kawuriMint,
                        foregroundColor: const Color(0xFF083729),
                        minimumSize: const Size(48, 48),
                      ),
                      icon: const Icon(Icons.mic_rounded),
                      label: Text(
                        _phase == _Phase.recorded ? 'Record again' : 'Record',
                      ),
                    ),
                  if (recording)
                    OutlinedButton.icon(
                      onPressed: _pause,
                      icon: const Icon(Icons.pause_rounded),
                      label: const Text('Pause'),
                    ),
                  if (paused)
                    OutlinedButton.icon(
                      onPressed: _resume,
                      icon: const Icon(Icons.mic_rounded),
                      label: const Text('Resume'),
                    ),
                  if (recording || paused)
                    FilledButton.icon(
                      onPressed: _stop,
                      icon: const Icon(Icons.stop_rounded),
                      label: const Text('Stop'),
                    ),
                  if (_phase == _Phase.recorded) ...[
                    OutlinedButton.icon(
                      onPressed: _togglePlayback,
                      icon: Icon(
                        _player?.playing == true
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                      ),
                      label: const Text('Listen'),
                    ),
                    FilledButton.icon(
                      onPressed: _send,
                      icon: const Icon(Icons.subject_rounded),
                      label: const Text('Use as text'),
                    ),
                  ],
                ],
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFFFFB4A8)),
                ),
              ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: sending
                  ? null
                  : () async {
                      if (recording || paused) await _recorder.cancel();
                      if (context.mounted) Navigator.of(context).pop();
                    },
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}
