import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_analysis_card.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_create_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_home.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_actions.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:video_player/video_player.dart';

/// One Kawuri creation: its live status, its result, and what can be done
/// with it.
///
/// Status comes from the task document the backend writes, subscribed to
/// directly, so the screen follows a video that was started elsewhere or
/// finished while the phone was locked. The callable is only asked for fresh
/// signed links, and — while a video is still at Vertex — to check on it now
/// rather than at the next sweep.
class KawuriCreationScreen extends ConsumerStatefulWidget {
  const KawuriCreationScreen({required this.taskId, this.initial, super.key});

  final String taskId;
  final KawuriCreation? initial;

  @override
  ConsumerState<KawuriCreationScreen> createState() =>
      _KawuriCreationScreenState();
}

class _KawuriCreationScreenState extends ConsumerState<KawuriCreationScreen> {
  KawuriCreation? _fetched;
  Timer? _nudge;
  bool _working = false;
  String? _error;
  KawuriMediaStatus? _lastStatus;

  @override
  void initState() {
    super.initState();
    _fetched = widget.initial;
    unawaited(_refresh());
    _nudge = Timer.periodic(const Duration(seconds: 30), (_) {
      final current = _current;
      if (current != null && current.isVideo && current.status.inFlight) {
        unawaited(_refresh());
      }
    });
  }

  @override
  void dispose() {
    _nudge?.cancel();
    super.dispose();
  }

  KawuriCreation? get _current {
    final live = ref.read(kawuriTaskProvider(widget.taskId)).value;
    return live?.withLinksFrom(_fetched) ?? _fetched;
  }

  Future<void> _refresh() async {
    final repository = ref.read(kawuriMediaRepositoryProvider);
    if (repository == null) return;
    try {
      final fresh = await repository.task(widget.taskId);
      if (mounted) setState(() => _fetched = fresh);
    } on KawuriMediaException catch (error) {
      if (mounted && error.reason == 'NOT_FOUND') {
        setState(() => _error = 'This creation no longer exists.');
      }
    }
  }

  Future<void> _run(String action, KawuriCreation creation) async {
    final repository = ref.read(kawuriMediaRepositoryProvider);
    if (repository == null || _working) return;
    final navigator = Navigator.of(context);
    switch (action) {
      case 'download':
        await kawuriSaveToDevice(context, ref, creation);
      case 'share':
        await kawuriShare(context, ref, creation);
      case 'use_in_contribution':
        await kawuriUseInContribution(context, ref, creation);
      case 'use_in_reel' || 'use_as_reel_cover':
        await kawuriUseInReel(context, ref, creation);
      case 'edit_prompt':
        await navigator.push(
          MaterialPageRoute<void>(
            builder: (_) => KawuriCreateScreen(
              kind: creation.isVideo
                  ? KawuriCreateKind.video
                  : KawuriCreateKind.image,
              draft: KawuriCreateDraft.from(creation),
            ),
          ),
        );
      case 'regenerate' || 'retry':
        await _regenerate(creation);
      case 'cancel':
        if (!await kawuriConfirmCancel(context, creation)) return;
        await _guard(() async {
          final cancelled = await repository.cancel(creation.id);
          if (mounted) setState(() => _fetched = cancelled);
        });
      case 'delete':
        if (!await kawuriConfirmDelete(context)) return;
        await _guard(() async {
          await repository.delete(creation.id);
          if (mounted) navigator.pop();
        });
    }
  }

  Future<void> _guard(Future<void> Function() body) async {
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      await body();
    } on KawuriMediaException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  /// The same request again, as a new generation. A video asks first, because
  /// it spends a limited generation.
  Future<void> _regenerate(KawuriCreation creation) async {
    final repository = ref.read(kawuriMediaRepositoryProvider)!;
    if (creation.isVideo) {
      final ok = await kawuriConfirmVideoSpend(
        context,
        durationSeconds: creation.duration ?? 8,
      );
      if (!ok || !mounted) return;
    }
    final navigator = Navigator.of(context);
    await _guard(() async {
      final reference = creation.sourceMedia.firstOrNull?.storagePath;
      final next = creation.isVideo
          ? await repository.createVideo(
              requestId: KawuriMediaRepository.newRequestId('vid'),
              prompt: creation.prompt,
              negativePrompt: creation.negativePrompt,
              aspectRatio: creation.aspectRatio ?? '9:16',
              durationSeconds: creation.duration ?? 8,
              resolution: creation.resolution ?? '720p',
              confirmSpend: true,
              referenceImagePath: reference,
              sourceTaskId: creation.id,
            )
          : await repository.createImage(
              requestId: KawuriMediaRepository.newRequestId('img'),
              prompt: creation.prompt,
              aspectRatio: creation.aspectRatio ?? '1:1',
              referenceImagePath: reference,
              sourceTaskId: creation.id,
            );
      if (!mounted) return;
      await navigator.pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => KawuriCreationScreen(taskId: next.id, initial: next),
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final live = ref.watch(kawuriTaskProvider(widget.taskId));
    final creation = live.value?.withLinksFrom(_fetched) ?? _fetched;

    // A finished task arriving on the live stream has no signed link yet.
    if (creation != null &&
        creation.status != _lastStatus &&
        creation.status == KawuriMediaStatus.ready &&
        creation.primaryOutput?.url == null &&
        (creation.isImage || creation.isVideo)) {
      unawaited(_refresh());
    }
    _lastStatus = creation?.status;

    return NightTheme(
      child: Scaffold(
        backgroundColor: const Color(0xFF071D17),
        appBar: AppBar(
          backgroundColor: const Color(0xFF071D17),
          foregroundColor: Colors.white,
          title: Text(creation?.typeLabel ?? 'Creation'),
          actions: [
            if (creation != null)
              PopupMenuButton<String>(
                tooltip: 'More actions',
                onSelected: (action) => _run(action, creation),
                itemBuilder: (_) => [
                  for (final action in creation.actions)
                    if (action != 'play' && action != 'ask_follow_up')
                      PopupMenuItem(
                        value: action,
                        child: Text(kawuriActionLabel(action)),
                      ),
                ],
              ),
          ],
        ),
        body: SafeArea(
          child: creation == null
              ? Center(
                  child: _error != null
                      ? Text(
                          _error!,
                          style: const TextStyle(color: Colors.white),
                        )
                      : const CircularProgressIndicator(),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                  children: [
                    _StatusPanel(creation: creation),
                    const SizedBox(height: 16),
                    if (creation.status == KawuriMediaStatus.ready)
                      _Result(creation: creation),
                    if (creation.prompt.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        creation.isAnalysis ? 'Your question' : 'Prompt',
                        style: const TextStyle(
                          color: kawuriMint,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      SelectableText(
                        creation.prompt,
                        style: const TextStyle(
                          color: Colors.white,
                          height: 1.45,
                        ),
                      ),
                    ],
                    if (creation.isImage || creation.isVideo) ...[
                      const SizedBox(height: 10),
                      Text(
                        [
                          creation.aspectRatio,
                          if (creation.duration != null)
                            '${creation.duration} s',
                          creation.resolution,
                          'AI-generated',
                        ].whereType<String>().join(' · '),
                        style: const TextStyle(
                          color: Color(0xFFABC8BE),
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          _error!,
                          style: const TextStyle(color: Color(0xFFFFB4A8)),
                        ),
                      ),
                    const SizedBox(height: 18),
                    if (_working) const LinearProgressIndicator(),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final action in creation.actions)
                          if (action != 'play' && action != 'ask_follow_up')
                            OutlinedButton.icon(
                              onPressed: _working
                                  ? null
                                  : () => _run(action, creation),
                              icon: Icon(kawuriActionIcon(action), size: 18),
                              label: Text(kawuriActionLabel(action)),
                            ),
                      ],
                    ),
                    if (creation.isAnalysis &&
                        creation.actions.contains('ask_follow_up'))
                      _FollowUp(creation: creation),
                  ],
                ),
        ),
      ),
    );
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({required this.creation});

  final KawuriCreation creation;

  @override
  Widget build(BuildContext context) {
    final status = creation.status;
    final message = switch (status) {
      KawuriMediaStatus.queued => 'Waiting to start.',
      KawuriMediaStatus.uploading => 'Uploading.',
      KawuriMediaStatus.generating =>
        creation.isVideo
            ? 'Making your video. This usually takes a few minutes, and carries on if you leave — you will be notified.'
            : 'Making your image.',
      KawuriMediaStatus.processing => 'Saving the result to your account.',
      KawuriMediaStatus.ready => null,
      _ => creation.errorMessage ?? status.label,
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF102F27),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF3C5C51)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    creation.subtitle,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (creation.progressLabel != null)
                  Text(
                    creation.progressLabel!,
                    style: const TextStyle(color: kawuriMint),
                  ),
              ],
            ),
            if (status.inFlight) ...[
              const SizedBox(height: 10),
              // Indeterminate unless Vertex itself reported a percentage.
              LinearProgressIndicator(
                value: creation.progress == null
                    ? null
                    : creation.progress! / 100,
              ),
            ],
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(
                message,
                style: TextStyle(
                  color:
                      status == KawuriMediaStatus.failed ||
                          status == KawuriMediaStatus.rejected
                      ? const Color(0xFFFFB4A8)
                      : const Color(0xFFABC8BE),
                  height: 1.4,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.creation});

  final KawuriCreation creation;

  @override
  Widget build(BuildContext context) {
    if (creation.isAnalysis) {
      final turns = creation.turns;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (turns.isEmpty && creation.result != null)
            KawuriAnalysisCard(result: creation.result!),
          for (final turn in turns) ...[
            Text(
              [
                kawuriAnalysisIntentions[turn.intention] ?? turn.intention,
                if (turn.question.isNotEmpty) turn.question,
              ].join(' · '),
              style: const TextStyle(
                color: Color(0xFFE7C574),
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            KawuriAnalysisCard(result: turn.result),
            const Divider(height: 28),
          ],
        ],
      );
    }
    final media = creation.primaryOutput;
    if (media == null) return const SizedBox.shrink();
    if (media.url == null) {
      return const SizedBox(
        height: 220,
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (media.isVideo) {
      return _VideoPreview(url: media.url!, aspectRatio: media.aspectRatio);
    }
    return Semantics(
      label: 'AI-generated image: ${creation.prompt}',
      image: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: AspectRatio(
          aspectRatio: media.aspectRatio ?? 1,
          child: CachedNetworkImage(
            imageUrl: media.url!,
            // The signed link changes on every fetch; the file does not.
            cacheKey: media.storagePath,
            fit: BoxFit.cover,
            placeholder: (_, _) =>
                const Center(child: CircularProgressIndicator()),
            errorWidget: (_, _, _) => const Center(
              child: Text(
                'The image could not be loaded.',
                style: TextStyle(color: Colors.white),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _VideoPreview extends StatefulWidget {
  const _VideoPreview({required this.url, this.aspectRatio});

  final String url;
  final double? aspectRatio;

  @override
  State<_VideoPreview> createState() => _VideoPreviewState();
}

class _VideoPreviewState extends State<_VideoPreview> {
  late final VideoPlayerController _controller =
      VideoPlayerController.networkUrl(Uri.parse(widget.url));
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _controller
        .initialize()
        .then((_) {
          if (!mounted) return;
          _controller.setLooping(true);
          setState(() {});
        })
        .catchError((Object _) {
          if (mounted) setState(() => _failed = true);
        });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ratio = _controller.value.isInitialized
        ? _controller.value.aspectRatio
        : widget.aspectRatio ?? 9 / 16;
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: AspectRatio(
        aspectRatio: ratio,
        child: _failed
            ? const Center(
                child: Text(
                  'The video could not be played. Try saving it instead.',
                  style: TextStyle(color: Colors.white),
                ),
              )
            : !_controller.value.isInitialized
            ? const Center(child: CircularProgressIndicator())
            : Stack(
                alignment: Alignment.center,
                children: [
                  VideoPlayer(_controller),
                  Semantics(
                    button: true,
                    label: _controller.value.isPlaying ? 'Pause' : 'Play',
                    child: IconButton.filled(
                      iconSize: 36,
                      onPressed: () => setState(() {
                        _controller.value.isPlaying
                            ? _controller.pause()
                            : _controller.play();
                      }),
                      icon: Icon(
                        _controller.value.isPlaying
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Another question about the same media, in the same analysis.
class _FollowUp extends ConsumerStatefulWidget {
  const _FollowUp({required this.creation});

  final KawuriCreation creation;

  @override
  ConsumerState<_FollowUp> createState() => _FollowUpState();
}

class _FollowUpState extends ConsumerState<_FollowUp> {
  final _question = TextEditingController();
  String _intention = 'describe';
  bool _busy = false;
  String? _requestId;

  @override
  void dispose() {
    _question.dispose();
    super.dispose();
  }

  Future<void> _ask() async {
    final repository = ref.read(kawuriMediaRepositoryProvider);
    if (repository == null || _busy) return;
    final requestId = _requestId ??= KawuriMediaRepository.newRequestId('ana');
    setState(() => _busy = true);
    try {
      await repository.analyse(
        requestId: requestId,
        intention: _intention,
        question: _question.text.trim(),
        followUpTaskId: widget.creation.id,
      );
      _question.clear();
      _requestId = null;
    } on KawuriMediaException catch (error) {
      if (mounted) showGlassToast(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Ask a follow-up',
          style: TextStyle(color: kawuriMint, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _intention,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'What should Kawuri do?',
          ),
          items: [
            for (final entry in kawuriAnalysisIntentions.entries)
              DropdownMenuItem(value: entry.key, child: Text(entry.value)),
          ],
          onChanged: _busy
              ? null
              : (value) => setState(() {
                  _intention = value ?? 'describe';
                  _requestId = null;
                }),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _question,
          enabled: !_busy,
          minLines: 1,
          maxLines: 4,
          maxLength: 2000,
          onChanged: (_) => _requestId = null,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            labelText: 'Your question (optional)',
          ),
        ),
        FilledButton(
          onPressed: _busy ? null : _ask,
          child: Text(_busy ? 'Asking…' : 'Ask'),
        ),
      ],
    ),
  );
}
