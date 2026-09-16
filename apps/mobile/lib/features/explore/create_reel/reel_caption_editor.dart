import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_ui.dart';
import 'package:indigen_world_mobile/features/explore/reel_caption_overlay.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:video_player/video_player.dart';

/// Opens the caption editor over the reel creator.
Future<void> openReelCaptionEditor(
  BuildContext context,
  ReelEditorController controller,
) async {
  await controller.player?.pause();
  if (!context.mounted) return;
  await Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) => ReelCaptionEditorScreen(controller: controller),
    ),
  );
  await controller.player?.pause();
}

/// Typing, timing and checking a reel's captions against its preview.
///
/// ── A working copy ─────────────────────────────────────────────────────────
/// Edits land on a copy and reach the draft only with Done, so half-timed
/// lines never autosave into it and backing out really does leave the
/// captions as they were. The copy is small — a few hundred short strings — so
/// holding it twice costs nothing.
///
/// ── Checked means checked now ───────────────────────────────────────────────
/// "I have checked these captions" is the creator vouching for the words and
/// their timing. Any edit after that unticks it, because the thing they
/// vouched for is no longer the thing on screen.
class ReelCaptionEditorScreen extends StatefulWidget {
  const ReelCaptionEditorScreen({required this.controller, super.key});

  final ReelEditorController controller;

  @override
  State<ReelCaptionEditorScreen> createState() =>
      _ReelCaptionEditorScreenState();
}

/// A cue with an identity that survives re-sorting, so the field being typed
/// in keeps its focus when a time change moves its card.
class _EditableCue {
  _EditableCue(this.id, this.cue)
    : text = TextEditingController(text: cue.text);

  final int id;
  CaptionCue cue;
  final TextEditingController text;
}

class _ReelCaptionEditorScreenState extends State<ReelCaptionEditorScreen> {
  static const _newCueLength = Duration(seconds: 3);

  late String _language;
  late CaptionSource _source;
  late bool _reviewed;
  late final CaptionTrack? _original;
  final _cues = <_EditableCue>[];
  var _nextId = 0;
  var _uncheckedByEdit = false;
  String? _message;

  ReelEditorController get _controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _original = _controller.draft.captions;
    _language = _original?.language ?? 'xsm';
    _source = _original?.source ?? CaptionSource.manual;
    _reviewed = _original?.reviewed ?? false;
    for (final cue in _original?.cues ?? const <CaptionCue>[]) {
      _cues.add(_EditableCue(_nextId++, cue));
    }
  }

  @override
  void dispose() {
    for (final cue in _cues) {
      cue.text.dispose();
    }
    super.dispose();
  }

  CaptionTrack get _working => CaptionTrack(
    language: _language,
    source: _source,
    reviewed: _reviewed,
    cues: [
      for (final entry in _cues) entry.cue.copyWith(text: entry.text.text),
    ],
  );

  bool get _changed {
    final original = _original;
    final working = _working.normalised();
    if (original == null) return working.cues.isNotEmpty;
    return working != original.normalised();
  }

  /// Every edit goes through here: it applies, re-sorts, and unticks the
  /// review if it was ticked.
  void _edit(VoidCallback change) {
    setState(() {
      change();
      _cues.sort((a, b) => a.cue.startMs.compareTo(b.cue.startMs));
      if (_reviewed) {
        _reviewed = false;
        _uncheckedByEdit = true;
      }
      _message = null;
    });
  }

  Duration get _playhead =>
      _controller.player?.value.position ?? _controller.draft.trimStart;

  Duration get _end {
    final draft = _controller.draft;
    return draft.selectionEnd > Duration.zero
        ? draft.selectionEnd
        : (draft.video?.duration ?? Duration.zero);
  }

  void _addAtPlayhead() {
    if (_cues.length >= CaptionTrack.maxCues) {
      setState(
        () => _message =
            'A reel can carry up to ${CaptionTrack.maxCues} captions.',
      );
      return;
    }
    final start = _playhead;
    final videoEnd = _controller.draft.video?.duration ?? _end;
    var end = start + _newCueLength;
    if (end > videoEnd) end = videoEnd;
    if (end <= start) {
      setState(
        () => _message =
            'The playhead is at the very end of the video. Move it back to '
            'add a caption.',
      );
      return;
    }
    _edit(() {
      if (_cues.isEmpty) _source = CaptionSource.manual;
      _cues.add(
        _EditableCue(
          _nextId++,
          CaptionCue(
            startMs: start.inMilliseconds,
            endMs: end.inMilliseconds,
            text: '',
          ),
        ),
      );
    });
  }

  void _setStart(_EditableCue entry) {
    final at = _playhead.inMilliseconds;
    if (at >= entry.cue.endMs) {
      setState(
        () => _message =
            'A caption has to start before it ends. Move the playhead earlier '
            'than ${formatReelPrecise(entry.cue.end)}.',
      );
      return;
    }
    _edit(() => entry.cue = entry.cue.copyWith(startMs: at));
  }

  void _setEnd(_EditableCue entry) {
    final at = _playhead.inMilliseconds;
    if (at <= entry.cue.startMs) {
      setState(
        () => _message =
            'A caption has to end after it starts. Move the playhead later '
            'than ${formatReelPrecise(entry.cue.start)}.',
      );
      return;
    }
    _edit(() => entry.cue = entry.cue.copyWith(endMs: at));
  }

  void _delete(_EditableCue entry) {
    _edit(() {
      _cues.remove(entry);
      WidgetsBinding.instance.addPostFrameCallback((_) => entry.text.dispose());
    });
  }

  Future<void> _chooseLanguage() async {
    final choice = await showGlassActionSheet<String>(
      context: context,
      title: 'Caption language',
      actions: [
        for (final (code, name) in kCaptionLanguages)
          GlassAction(
            value: code,
            label: name,
            icon: code == _language
                ? Icons.radio_button_checked_rounded
                : Icons.radio_button_unchecked_rounded,
          ),
        const GlassAction(
          value: '',
          label: 'Other…',
          icon: Icons.edit_outlined,
        ),
      ],
    );
    if (choice == null || !mounted) return;
    if (choice.isNotEmpty) {
      if (choice != _language) _edit(() => _language = choice);
      return;
    }
    final typed = await _askLanguageName();
    if (typed != null && typed.isNotEmpty && mounted) {
      _edit(() => _language = typed);
    }
  }

  Future<String?> _askLanguageName() {
    final field = TextEditingController(
      text: kCaptionLanguages.any((entry) => entry.$1 == _language)
          ? ''
          : _language,
    );
    return showGlassPopup<String>(
      context: context,
      title: 'Which language?',
      builder: (context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: field,
            autofocus: true,
            maxLength: 40,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Language name'),
            onSubmitted: (value) => Navigator.of(context).pop(value.trim()),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(field.text.trim()),
            child: const Text('Use this language'),
          ),
        ],
      ),
    ).whenComplete(field.dispose);
  }

  void _done() {
    final track = _working.normalised();
    _controller.setCaptions(track.cues.isEmpty ? null : track);
    Navigator.of(context).pop();
  }

  Future<void> _leave() async {
    if (!_changed) {
      Navigator.of(context).pop();
      return;
    }
    final discard = await showGlassConfirm(
      context: context,
      title: 'Discard caption changes?',
      message: 'The captions will go back to how they were.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      isDestructive: true,
    );
    if (discard == true && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) => NightTheme(
    child: Builder(
      builder: (context) => PopScope<Object?>(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) unawaited(_leave());
        },
        child: Scaffold(
          backgroundColor: BrandColors.nightInk,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            foregroundColor: Colors.white,
            leading: IconButton(
              tooltip: 'Close',
              icon: const Icon(Icons.close_rounded),
              onPressed: _leave,
            ),
            title: const Text(
              'Captions',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            actions: [
              TextButton(
                onPressed: _controller.locked ? null : _done,
                style: TextButton.styleFrom(
                  foregroundColor: context.brand.gold,
                ),
                child: const Text(
                  'Done',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          body: DecoratedBox(
            decoration: BoxDecoration(gradient: BrandGradients.night(context.brand)),
            child: SafeArea(top: false, child: _body(context)),
          ),
        ),
      ),
    ),
  );

  Widget _body(BuildContext context) {
    final brand = context.brand;
    final locked = _controller.locked;
    final working = _working;
    final problems = _problems();
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(
            kReelStagePadding,
            4,
            kReelStagePadding,
            28,
          ),
          children: [
            _CaptionPreview(controller: _controller, track: working),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${_cues.length} caption${_cues.length == 1 ? '' : 's'}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: locked ? null : _chooseLanguage,
                  style: TextButton.styleFrom(
                    foregroundColor: brand.gold,
                    minimumSize: const Size(48, 48),
                  ),
                  icon: const Icon(Icons.translate_rounded, size: 18),
                  label: Text(captionLanguageName(_language)),
                ),
              ],
            ),
            if (_source == CaptionSource.transcript && _cues.isNotEmpty) ...[
              const SizedBox(height: 4),
              const ReelBanner(
                message:
                    'Timing was estimated from your transcript. Check each '
                    'line against the video.',
              ),
            ],
            if (_message case final message?) ...[
              const SizedBox(height: 8),
              ReelBanner(
                message: message,
                isError: true,
                onDismiss: () => setState(() => _message = null),
              ),
            ],
            const SizedBox(height: 10),
            if (_cues.isEmpty)
              const ReelSection(
                title: 'No captions yet',
                subtitle:
                    'Play the video, pause where someone starts speaking, and '
                    'add a caption. Then set where it ends and type what is '
                    'said.',
                child: SizedBox.shrink(),
              )
            else
              for (final (index, entry) in _cues.indexed)
                Padding(
                  key: ValueKey(entry.id),
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _CueCard(
                    index: index,
                    entry: entry,
                    locked: locked,
                    overlapsPrevious:
                        index > 0 &&
                        _cues[index - 1].cue.endMs > entry.cue.startMs,
                    onSeek: () =>
                        unawaited(_controller.seekTo(entry.cue.start)),
                    onSetStart: () => _setStart(entry),
                    onSetEnd: () => _setEnd(entry),
                    onDelete: () => _delete(entry),
                    onTextChanged: () => _edit(() {}),
                  ),
                ),
            const SizedBox(height: 4),
            OutlinedButton.icon(
              style: reelSecondaryButtonStyle(context),
              onPressed: locked ? null : _addAtPlayhead,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add caption at playhead'),
            ),
            const SizedBox(height: 16),
            ReelSection(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: _reviewed,
                    onChanged: locked || _cues.isEmpty || problems.isNotEmpty
                        ? null
                        : (value) => setState(() {
                            _reviewed = value ?? false;
                            _uncheckedByEdit = false;
                          }),
                    title: const Text(
                      'I have checked these captions match what is said',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                      ),
                    ),
                    subtitle: Text(
                      problems.isNotEmpty
                          ? problems.first
                          : _uncheckedByEdit
                          ? 'You changed the captions, so check them again.'
                          : 'Captions are published only once you confirm '
                                'them.',
                      style: TextStyle(
                        color: problems.isNotEmpty
                            ? brand.danger
                            : brand.mutedInk,
                        height: 1.3,
                      ),
                    ),
                  ),
                  Text(
                    'Automatic captions are not available yet.',
                    style: TextStyle(
                      color: brand.faintInk,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              style: reelPrimaryButtonStyle(context),
              onPressed: locked ? null : _done,
              icon: const Icon(Icons.check_rounded),
              label: const Text('Done'),
            ),
          ],
        ),
      ),
    );
  }

  /// Problems that stop the captions being confirmed.
  List<String> _problems() => [
    for (final (index, entry) in _cues.indexed)
      if (entry.text.text.trim().isEmpty)
        'Caption ${index + 1} has no text.'
      else if (entry.cue.endMs <= entry.cue.startMs)
        'Caption ${index + 1} ends before it starts.',
  ];
}

class _CaptionPreview extends StatelessWidget {
  const _CaptionPreview({required this.controller, required this.track});

  final ReelEditorController controller;
  final CaptionTrack track;

  @override
  Widget build(BuildContext context) {
    final player = controller.player;
    final video = controller.draft.video;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.3;
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: math.max(140, maxHeight)),
        child: AspectRatio(
          aspectRatio: video?.aspectRatio ?? 9 / 16,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: ColoredBox(
              color: Colors.black,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (player != null)
                    VideoPlayer(player)
                  else
                    ReelCoverImage(path: controller.draft.coverPath),
                  if (player != null) ...[
                    ReelCaptionOverlay(
                      controller: player,
                      track: track,
                      preview: true,
                      bottomPadding: 10,
                      fontSize: 13,
                    ),
                    _PreviewControls(controller: controller, player: player),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PreviewControls extends StatelessWidget {
  const _PreviewControls({required this.controller, required this.player});

  final ReelEditorController controller;
  final VideoPlayerController player;

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: player,
        builder: (context, value, _) => Semantics(
          button: true,
          label: value.isPlaying ? 'Pause preview' : 'Play preview',
          onTap: () => unawaited(controller.togglePlayback()),
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => unawaited(controller.togglePlayback()),
            child: Stack(
              children: [
                if (!value.isPlaying)
                  const Center(
                    child: Icon(
                      Icons.play_circle_fill_rounded,
                      color: Colors.white,
                      size: 48,
                      shadows: [Shadow(blurRadius: 12, color: Colors.black87)],
                    ),
                  ),
                Positioned(
                  left: 8,
                  top: 8,
                  child: ReelDurationBadge(value.position),
                ),
              ],
            ),
          ),
        ),
      );
}

class _CueCard extends StatelessWidget {
  const _CueCard({
    required this.index,
    required this.entry,
    required this.locked,
    required this.overlapsPrevious,
    required this.onSeek,
    required this.onSetStart,
    required this.onSetEnd,
    required this.onDelete,
    required this.onTextChanged,
  });

  final int index;
  final _EditableCue entry;
  final bool locked;
  final bool overlapsPrevious;
  final VoidCallback onSeek;
  final VoidCallback onSetStart;
  final VoidCallback onSetEnd;
  final VoidCallback onDelete;
  final VoidCallback onTextChanged;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final cue = entry.cue;
    final empty = entry.text.text.trim().isEmpty;
    return ReelSection(
      padding: const EdgeInsets.fromLTRB(12, 8, 6, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Semantics(
                  button: true,
                  label:
                      'Caption ${index + 1}, ${formatReelPrecise(cue.start)} to '
                      '${formatReelPrecise(cue.end)}. Play from here',
                  excludeSemantics: true,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: onSeek,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 44),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          '${index + 1}  ·  ${formatReelPrecise(cue.start)} – '
                          '${formatReelPrecise(cue.end)}',
                          style: TextStyle(
                            color: brand.gold,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Start at playhead',
                onPressed: locked ? null : onSetStart,
                icon: const Icon(Icons.first_page_rounded),
                color: Colors.white,
              ),
              IconButton(
                tooltip: 'End at playhead',
                onPressed: locked ? null : onSetEnd,
                icon: const Icon(Icons.last_page_rounded),
                color: Colors.white,
              ),
              IconButton(
                tooltip: 'Delete caption',
                onPressed: locked ? null : onDelete,
                icon: const Icon(Icons.delete_outline_rounded),
                color: brand.danger,
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: TextField(
              controller: entry.text,
              enabled: !locked,
              minLines: 1,
              maxLines: 3,
              maxLength: CaptionCue.maxTextLength,
              textCapitalization: TextCapitalization.sentences,
              style: const TextStyle(color: Colors.white),
              cursorColor: brand.gold,
              onChanged: (_) => onTextChanged(),
              decoration: reelInputDecoration(
                context,
                hint: 'What is said',
                error: empty
                    ? 'Type what is said, or delete this caption.'
                    : null,
              ),
            ),
          ),
          if (overlapsPrevious)
            Padding(
              padding: const EdgeInsets.only(top: 4, right: 6),
              child: Text(
                'Starts before the previous caption ends, so both show at '
                'once.',
                style: TextStyle(color: brand.gold, fontSize: 12, height: 1.3),
              ),
            ),
        ],
      ),
    );
  }
}
