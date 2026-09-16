import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_creation_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_actions.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

enum KawuriCreateKind { image, video }

/// What an earlier creation asked for, so "Edit prompt" and "Regenerate" start
/// from it rather than from nothing.
@immutable
class KawuriCreateDraft {
  const KawuriCreateDraft({
    this.prompt = '',
    this.negativePrompt = '',
    this.aspectRatio,
    this.durationSeconds,
    this.resolution,
    this.generateAudio,
    this.sourceTaskId = '',
    this.referenceImagePath,
  });

  factory KawuriCreateDraft.from(KawuriCreation creation) => KawuriCreateDraft(
    prompt: creation.prompt,
    negativePrompt: creation.negativePrompt,
    aspectRatio: creation.aspectRatio,
    durationSeconds: creation.duration,
    resolution: creation.resolution,
    generateAudio: creation.generateAudio,
    sourceTaskId: creation.id,
    referenceImagePath: creation.sourceMedia.firstOrNull?.storagePath,
  );

  final String prompt;
  final String negativePrompt;
  final String? aspectRatio;
  final int? durationSeconds;
  final String? resolution;

  /// The earlier video's sound choice; null means "use the default".
  final bool? generateAudio;
  final String sourceTaskId;

  /// A reference image already in Storage, reused as it is.
  final String? referenceImagePath;
}

/// Starts one image or video at Vertex AI, through the backend.
///
/// Every choice on this screen comes from the server's capability manifest —
/// shapes, lengths and resolutions the configured model actually makes — so a
/// member cannot pick something the model will refuse.
class KawuriCreateScreen extends ConsumerStatefulWidget {
  const KawuriCreateScreen({
    required this.kind,
    this.draft = const KawuriCreateDraft(),
    this.conversationId = '',
    super.key,
  });

  final KawuriCreateKind kind;
  final KawuriCreateDraft draft;
  final String conversationId;

  @override
  ConsumerState<KawuriCreateScreen> createState() => _KawuriCreateScreenState();
}

class _KawuriCreateScreenState extends ConsumerState<KawuriCreateScreen> {
  late final _prompt = TextEditingController(text: widget.draft.prompt);
  late final _negative = TextEditingController(
    text: widget.draft.negativePrompt,
  );
  String? _aspectRatio;
  int? _duration;
  String? _resolution;
  String _quality = 'fast';

  /// On unless an earlier video being edited was made silent. A video with no
  /// soundtrack is not what most people picture when they ask for one.
  late bool _withSound = widget.draft.generateAudio ?? true;
  XFile? _reference;
  late String? _storedReference = widget.draft.referenceImagePath;
  bool _busy = false;
  double? _uploadProgress;
  String? _error;

  /// The idempotency key of the press in progress. Kept across a failed
  /// attempt so "Try again" can never become a second generation.
  String? _requestId;

  bool get _isVideo => widget.kind == KawuriCreateKind.video;

  @override
  void dispose() {
    _prompt.dispose();
    _negative.dispose();
    super.dispose();
  }

  void _invalidatePress() => _requestId = null;

  static String _ratioLabel(String ratio) => switch (ratio) {
    '1:1' => 'Square',
    '3:4' => 'Portrait',
    '4:3' => 'Landscape',
    '9:16' => 'Tall',
    '16:9' => 'Wide',
    _ => ratio,
  };

  Future<void> _pickReference() async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 2048,
        maxHeight: 2048,
        imageQuality: 90,
      );
      if (picked == null || !mounted) return;
      final type = kawuriMimeTypeFor(picked.path);
      if (type == null || !type.startsWith('image/')) {
        setState(() => _error = 'Choose a JPEG, PNG, WebP or HEIC picture.');
        return;
      }
      setState(() {
        _reference = picked;
        _storedReference = null;
        _error = null;
        _invalidatePress();
      });
    } on Object {
      if (mounted) {
        setState(() => _error = 'The picture could not be opened.');
      }
    }
  }

  Future<void> _submit(KawuriCapabilities caps) async {
    final repository = ref.read(kawuriMediaRepositoryProvider);
    final prompt = _prompt.text.trim();
    if (repository == null || _busy) return;
    if (prompt.isEmpty) {
      setState(() => _error = 'Describe what you would like Kawuri to make.');
      return;
    }
    final aspectRatio = _aspectRatio ?? _defaultRatio(caps);
    if (aspectRatio == null) return;
    final duration = _duration ?? caps.videoDurations.lastOrNull;
    final resolutions = caps.videoResolutions[aspectRatio] ?? const ['720p'];
    final resolution = resolutions.contains(_resolution)
        ? _resolution!
        : resolutions.first;

    if (_isVideo) {
      if (duration == null) return;
      final confirmed = await kawuriConfirmVideoSpend(
        context,
        durationSeconds: duration,
        withSound: caps.videoAudio && _withSound,
      );
      if (!confirmed || !mounted) return;
    }

    final requestId = _requestId ??= KawuriMediaRepository.newRequestId(
      _isVideo ? 'vid' : 'img',
    );
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      var referencePath = _storedReference;
      final reference = _reference;
      if (reference != null) {
        final size = await File(reference.path).length();
        if (size > caps.referenceImageBytes) {
          throw KawuriMediaException(
            'INVALID_MEDIA',
            'The reference picture must be under ${caps.referenceImageBytes ~/ (1024 * 1024)} MB.',
          );
        }
        setState(() => _uploadProgress = 0);
        referencePath = await repository.upload(
          purpose: 'reference',
          filePath: reference.path,
          contentType: kawuriMimeTypeFor(reference.path)!,
          onProgress: (value) {
            if (mounted) setState(() => _uploadProgress = value);
          },
        );
        // Uploaded once; a retry of this press reuses the stored copy.
        _storedReference = referencePath;
        _reference = null;
        if (mounted) setState(() => _uploadProgress = null);
      }
      final creation = _isVideo
          ? await repository.createVideo(
              requestId: requestId,
              prompt: prompt,
              negativePrompt: _negative.text.trim(),
              aspectRatio: aspectRatio,
              durationSeconds: duration!,
              resolution: resolution,
              quality: _quality,
              generateAudio: caps.videoAudio && _withSound,
              confirmSpend: true,
              referenceImagePath: referencePath,
              sourceTaskId: widget.draft.sourceTaskId,
              conversationId: widget.conversationId,
            )
          : await repository.createImage(
              requestId: requestId,
              prompt: prompt,
              aspectRatio: aspectRatio,
              referenceImagePath: referencePath,
              sourceTaskId: widget.draft.sourceTaskId,
              conversationId: widget.conversationId,
            );
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) =>
              KawuriCreationScreen(taskId: creation.id, initial: creation),
        ),
      );
    } on KawuriMediaException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _uploadProgress = null;
        _error = error.message;
        // A refusal about the request itself means the next press is a new
        // request; anything else is the same press, retried.
        if (const {
          'INVALID_REQUEST',
          'INVALID_MEDIA',
          'SAFETY_REJECTED',
          'ALLOWANCE_EXHAUSTED',
        }.contains(error.reason)) {
          _invalidatePress();
        }
      });
    }
  }

  String? _defaultRatio(KawuriCapabilities caps) {
    final options = _isVideo ? caps.videoAspectRatios : caps.imageAspectRatios;
    if (options.isEmpty) return null;
    final preferred = widget.draft.aspectRatio;
    if (preferred != null && options.contains(preferred)) return preferred;
    return options.contains(_isVideo ? '9:16' : '1:1')
        ? (_isVideo ? '9:16' : '1:1')
        : options.first;
  }

  @override
  Widget build(BuildContext context) {
    final caps =
        ref.watch(kawuriCapabilitiesProvider).value ?? KawuriCapabilities.none;
    final capability = _isVideo ? 'videoGeneration' : 'imageGeneration';
    final unavailable = caps.unavailableMessage(capability);
    final title = _isVideo ? 'Create video' : 'Create image';

    return NightTheme(
      child: Scaffold(
        backgroundColor: context.brand.nightGround,
        appBar: AppBar(
          backgroundColor: context.brand.nightGround,
          foregroundColor: Colors.white,
          title: Text(title),
        ),
        body: SafeArea(
          child: unavailable != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      unavailable,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                )
              : _form(context, caps, title),
        ),
      ),
    );
  }

  Widget _form(BuildContext context, KawuriCapabilities caps, String title) {
    final ratios = _isVideo ? caps.videoAspectRatios : caps.imageAspectRatios;
    final ratio = _aspectRatio ?? _defaultRatio(caps);
    final duration =
        _duration ??
        (caps.videoDurations.contains(widget.draft.durationSeconds)
            ? widget.draft.durationSeconds
            : caps.videoDurations.lastOrNull);
    final resolutions = caps.videoResolutions[ratio] ?? const <String>[];
    final resolution = resolutions.contains(_resolution)
        ? _resolution
        : resolutions.contains(widget.draft.resolution)
        ? widget.draft.resolution
        : resolutions.firstOrNull;
    const label = TextStyle(
      color: Colors.white,
      fontWeight: FontWeight.w800,
      fontSize: 14,
    );

    Widget chips<T>(
      List<T> values,
      T? selected,
      String Function(T) text,
      ValueChanged<T> onSelected,
    ) => Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final value in values)
          ChoiceChip(
            label: Text(text(value)),
            selected: value == selected,
            onSelected: _busy
                ? null
                : (_) => setState(() {
                    onSelected(value);
                    _invalidatePress();
                  }),
          ),
      ],
    );

    return ListView(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      children: [
        TextField(
          controller: _prompt,
          enabled: !_busy,
          minLines: 3,
          maxLines: 6,
          maxLength: caps.promptChars,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => _invalidatePress(),
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: _isVideo ? 'Describe the video' : 'Describe the image',
            hintText: _isVideo
                ? 'A slow pan across painted compound walls at dusk'
                : 'A woven basket beside clay pots in morning light',
          ),
        ),
        const SizedBox(height: 8),
        const Text('Shape', style: label),
        const SizedBox(height: 8),
        chips<String>(
          ratios,
          ratio,
          (value) => '${_ratioLabel(value)} · $value',
          (value) => _aspectRatio = value,
        ),
        if (_isVideo) ...[
          const SizedBox(height: 18),
          const Text('Length', style: label),
          const SizedBox(height: 8),
          chips<int>(
            caps.videoDurations,
            duration,
            (value) => '$value seconds',
            (value) => _duration = value,
          ),
          if (resolutions.isNotEmpty) ...[
            const SizedBox(height: 18),
            const Text('Resolution', style: label),
            const SizedBox(height: 8),
            chips<String>(
              resolutions,
              resolution,
              (value) => value,
              (value) => _resolution = value,
            ),
          ],
          if (caps.videoQualityOptions.length > 1) ...[
            const SizedBox(height: 18),
            const Text('Quality', style: label),
            const SizedBox(height: 8),
            chips<String>(
              caps.videoQualityOptions,
              _quality,
              (value) => value == 'plan' ? 'Standard' : 'Fast',
              (value) => _quality = value,
            ),
          ],
          if (caps.videoAudio) ...[
            const SizedBox(height: 14),
            _SoundSwitch(
              value: _withSound,
              enabled: !_busy,
              onChanged: (value) => setState(() {
                _withSound = value;
                _invalidatePress();
              }),
            ),
          ],
          if (caps.videoNegativePrompt) ...[
            const SizedBox(height: 18),
            TextField(
              controller: _negative,
              enabled: !_busy,
              maxLength: 1000,
              onChanged: (_) => _invalidatePress(),
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Leave out (optional)',
                hintText: 'Text on screen, watermarks',
              ),
            ),
          ],
        ],
        if (_isVideo ? caps.videoReferenceImage : caps.imageReferenceInput) ...[
          const SizedBox(height: 12),
          const Text('Reference picture (optional)', style: label),
          const SizedBox(height: 6),
          Text(
            _isVideo
                ? 'The video starts from this picture. Pictures of real people are not accepted.'
                : 'Kawuri uses this picture as a guide. Pictures of real people are not accepted.',
            style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
          ),
          const SizedBox(height: 8),
          if (_reference != null || _storedReference != null)
            Row(
              children: [
                if (_reference != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.file(
                      File(_reference!.path),
                      width: 72,
                      height: 72,
                      fit: BoxFit.cover,
                    ),
                  )
                else
                  Icon(Icons.image_outlined, color: context.brand.nightAccent, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _reference != null
                        ? 'Picture attached'
                        : 'Using the picture from before',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                          _reference = null;
                          _storedReference = null;
                          _invalidatePress();
                        }),
                  child: const Text('Remove'),
                ),
              ],
            )
          else
            OutlinedButton.icon(
              onPressed: _busy ? null : _pickReference,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: const Text('Choose a picture'),
            ),
        ],
        const SizedBox(height: 18),
        Text(
          _isVideo
              ? (caps.videoAudio && _withSound
                    ? 'Made with Google’s AI on Vertex AI, with sound, and marked as AI-generated. It keeps going if you leave this screen.'
                    : 'Made with Google’s AI on Vertex AI, without sound, and marked as AI-generated. It keeps going if you leave this screen.')
              : 'Made with Google’s AI on Vertex AI and marked as AI-generated. Uses one message from your Kawuri allowance.',
          style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Semantics(
              liveRegion: true,
              child: Text(
                _error!,
                style: const TextStyle(color: Color(0xFFFFB4A8)),
              ),
            ),
          ),
        const SizedBox(height: 18),
        if (_busy)
          Column(
            children: [
              LinearProgressIndicator(value: _uploadProgress),
              const SizedBox(height: 10),
              Text(
                _uploadProgress != null
                    ? 'Uploading the reference picture…'
                    : _isVideo
                    ? 'Starting your video…'
                    : 'Creating your image. This usually takes under a minute…',
                style: const TextStyle(color: Colors.white),
              ),
            ],
          )
        else
          FilledButton.icon(
            onPressed: () => _submit(caps),
            style: FilledButton.styleFrom(
              backgroundColor: context.brand.nightAccent,
              foregroundColor: context.brand.nightGround,
              minimumSize: const Size.fromHeight(52),
            ),
            icon: Icon(
              _isVideo ? Icons.videocam_outlined : Icons.auto_awesome_outlined,
            ),
            label: Text(
              _requestId != null && _error != null ? 'Try again' : title,
            ),
          ),
      ],
    );
  }
}

/// The sound switch for a video.
///
/// A switch rather than a pair of chips: it is one yes-or-no question, and the
/// line under it is where the honest part lives — Veo's soundtrack can include
/// voices, and no voice it makes is speaking Kasem.
class _SoundSwitch extends StatelessWidget {
  const _SoundSwitch({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Material(
    // Its own Material, so the tile's ink shows on the tinted panel.
    color: const Color(0x148EB4FF),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(16),
      side: const BorderSide(color: Color(0x338EB4FF)),
    ),
    clipBehavior: Clip.antiAlias,
    child: SwitchListTile.adaptive(
      key: const Key('kawuri-video-sound'),
      value: value,
      onChanged: enabled ? onChanged : null,
      activeThumbColor: context.brand.nightAccent,
      contentPadding: const EdgeInsets.fromLTRB(14, 2, 8, 2),
      secondary: Icon(
        value ? Icons.volume_up_rounded : Icons.volume_off_rounded,
        color: context.brand.nightAccent,
      ),
      title: const Text(
        'Sound',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: 14,
        ),
      ),
      subtitle: Text(
        value
            ? 'Ambience, effects and music made with the video. Any voices are AI-made and will not be speaking Kasem.'
            : 'A silent video, for adding your own voice or music later.',
        style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
      ),
    ),
  );
}
