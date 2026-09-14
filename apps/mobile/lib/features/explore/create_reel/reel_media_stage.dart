import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/media_geometry.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_trim_timeline.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_ui.dart';
import 'package:indigen_world_mobile/features/explore/reel_caption_overlay.dart';
import 'package:indigen_world_mobile/features/explore/reel_media.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:video_player/video_player.dart';

/// Stage one of a new reel: get a video in, then shape how it plays.
///
/// ── Progressive disclosure ───────────────────────────────────────────────
/// Trim, cover, sound, captions and framing are each a panel behind a chip,
/// and only one is open at a time. On a small phone the preview and a single
/// tool already fill the screen; five panels stacked under each other would
/// push the thing being edited out of sight of the control editing it.
///
/// ── Honest about what the phone can do ───────────────────────────────────
/// There is no transcoder in the app. Trim points, the sound choice and the
/// focal point are stored with the post and honoured by the players; the whole
/// file is uploaded. The copy here says so wherever a creator might assume
/// otherwise.
///
/// A view over [ReelEditorController]: everything that must survive moving
/// between stages lives there. The only local state is which panel is open.
class ReelMediaStage extends StatefulWidget {
  const ReelMediaStage({
    required this.controller,
    required this.onOpenDrafts,
    required this.onEditCaptions,
    super.key,
  });

  final ReelEditorController controller;

  /// Opens the saved-drafts sheet.
  final VoidCallback onOpenDrafts;

  /// Opens the caption editor.
  final VoidCallback onEditCaptions;

  @override
  State<ReelMediaStage> createState() => _ReelMediaStageState();
}

enum _MediaTool {
  trim('Trim', Icons.content_cut_rounded),
  cover('Cover', Icons.photo_outlined),
  sound('Sound', Icons.volume_up_rounded),
  captions('Captions', Icons.closed_caption_outlined),
  framing('Framing', Icons.crop_rounded);

  const _MediaTool(this.label, this.icon);

  final String label;
  final IconData icon;

  /// The field whose problems this panel is where to fix.
  ReelField? get field => switch (this) {
    _MediaTool.trim => ReelField.trim,
    _MediaTool.captions => ReelField.captions,
    _ => null,
  };
}

class _ReelMediaStageState extends State<ReelMediaStage> {
  var _tool = _MediaTool.trim;

  Future<List<ReelDraft>>? _otherDrafts;
  String? _draftsForId;
  bool? _routeWasCurrent;

  /// The panel-level problems on screen at the last build, so a newly shown
  /// one can bring its panel forward once without pinning it open.
  Set<ReelField> _issueFields = const {};

  ReelEditorController get _controller => widget.controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The drafts sheet can delete drafts without the controller hearing of
    // it, so the count is asked again whenever this screen comes back to the
    // front.
    final current = ModalRoute.isCurrentOf(context);
    if (current == true && _routeWasCurrent == false) _refreshDrafts();
    _routeWasCurrent = current;
  }

  @override
  void didUpdateWidget(ReelMediaStage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.controller, widget.controller)) {
      _draftsForId = null;
    }
  }

  void _refreshDrafts() {
    _draftsForId = _controller.draft.id;
    _otherDrafts = _controller.otherDrafts();
  }

  /// The other saved drafts, asked for once per open draft rather than once
  /// per build — the store reads the disk.
  Future<List<ReelDraft>> _draftsFuture() {
    if (_otherDrafts == null || _draftsForId != _controller.draft.id) {
      _refreshDrafts();
    }
    return _otherDrafts!;
  }

  /// Opens the panel of a problem that has just appeared, unless the open
  /// panel is already showing one. Runs during build, before [_tool] is read.
  void _followNewIssues() {
    final fields = <ReelField>{
      for (final field in const [ReelField.trim, ReelField.captions])
        if (_controller.issueFor(field) != null) field,
    };
    final appeared = fields.difference(_issueFields);
    _issueFields = fields;
    if (appeared.isEmpty || fields.contains(_tool.field)) return;
    _tool = appeared.contains(ReelField.trim)
        ? _MediaTool.trim
        : _MediaTool.captions;
  }

  double _previewMaxHeight(BuildContext context) =>
      math.min(MediaQuery.sizeOf(context).height * 0.52, 460);

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: _controller,
    builder: (context, _) {
      final video = _controller.draft.video;
      if (video != null) _followNewIssues();
      return ListView(
        padding: const EdgeInsets.fromLTRB(
          kReelStagePadding,
          12,
          kReelStagePadding,
          28,
        ),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          if (_controller.mediaProblem case final problem?) ...[
            ReelBanner(
              message: problem,
              isError: true,
              onDismiss: _controller.clearMediaProblem,
            ),
            const SizedBox(height: 12),
          ],
          if (video == null)
            ..._emptyState(context)
          else
            ..._editor(context, video),
        ],
      );
    },
  );

  // ── No video yet ─────────────────────────────────────────────────────────

  List<Widget> _emptyState(BuildContext context) {
    final brand = context.brand;
    final limits = _controller.limits;
    final busy = _controller.isMediaBusy;
    final canPick = !busy && !_controller.locked;
    final issue = _controller.issueFor(ReelField.video);
    return [
      Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: _previewMaxHeight(context)),
          child: AspectRatio(
            aspectRatio: 9 / 16,
            child: GlassSurface(
              onDark: true,
              blur: false,
              padding: const EdgeInsets.all(6),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(kGlassRadius - 7),
                child: _EmptyPreview(busy: busy),
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: 16),
      _PickButtons(
        onRecord: canPick
            ? () => unawaited(_controller.pickVideo(record: true))
            : null,
        onChoose: canPick
            ? () => unawaited(_controller.pickVideo(record: false))
            : null,
      ),
      const SizedBox(height: 10),
      Text(
        'Up to ${formatReelClock(limits.maxDuration)} · '
        '${formatReelBytes(limits.maxBytes)} · MP4, MOV, M4V, WebM or 3GP',
        textAlign: TextAlign.center,
        style: TextStyle(color: brand.mutedInk, fontSize: 12.5, height: 1.35),
      ),
      if (issue != null) ReelIssueText(issue.message),
      FutureBuilder<List<ReelDraft>>(
        future: _draftsFuture(),
        builder: (context, snapshot) {
          final count = snapshot.data?.length ?? 0;
          if (count == 0) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(top: 18),
            child: GlassRow(
              icon: Icons.history_rounded,
              title: 'Resume a draft ($count)',
              detail: 'Saved on this phone',
              color: brand.gold,
              blur: false,
              onTap: _controller.locked ? null : widget.onOpenDrafts,
            ),
          );
        },
      ),
    ];
  }

  // ── Editing ──────────────────────────────────────────────────────────────

  List<Widget> _editor(BuildContext context, ReelVideo video) {
    final draft = _controller.draft;
    final videoIssue = _controller.issueFor(ReelField.video);
    final tools = [
      for (final tool in _MediaTool.values)
        if (tool != _MediaTool.framing || video.needsFraming) tool,
    ];
    if (!tools.contains(_tool)) _tool = _MediaTool.trim;
    final canReplace = !_controller.locked && !_controller.isMediaBusy;

    return [
      _PreviewCard(
        controller: _controller,
        video: video,
        maxHeight: _previewMaxHeight(context),
      ),
      if (_controller.isMediaBusy)
        const Padding(
          padding: EdgeInsets.only(top: 8),
          child: ClipRRect(
            borderRadius: BorderRadius.all(Radius.circular(2)),
            child: LinearProgressIndicator(
              minHeight: 3,
              semanticsLabel: 'Working',
            ),
          ),
        ),
      const SizedBox(height: 8),
      Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 2,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _ClockText(controller: _controller),
              _InfoChip(
                icon: Icons.timer_outlined,
                label: 'Max ${formatReelClock(_controller.limits.maxDuration)}',
                warn: draft.selectedDuration > _controller.limits.maxDuration,
              ),
              if (!draft.originalSound)
                const _InfoChip(
                  icon: Icons.volume_off_rounded,
                  label: 'Sound off',
                ),
            ],
          ),
          TextButton.icon(
            onPressed: canReplace ? _replaceVideo : null,
            style: TextButton.styleFrom(
              foregroundColor: Colors.white,
              minimumSize: const Size(48, 48),
            ),
            icon: const Icon(Icons.swap_horiz_rounded, size: 20),
            label: const Text('Replace video'),
          ),
        ],
      ),
      if (videoIssue != null) ReelIssueText(videoIssue.message),
      const SizedBox(height: 10),
      Wrap(
        spacing: 8,
        children: [
          for (final tool in tools)
            _ToolChip(
              label: tool.label,
              icon: tool.icon,
              selected: tool == _tool,
              hasIssue:
                  tool.field != null &&
                  _controller.issueFor(tool.field!) != null,
              onTap: () => setState(() => _tool = tool),
            ),
        ],
      ),
      // A problem whose panel is closed is still said, so it is never
      // hidden behind a chip nobody taps.
      for (final tool in tools)
        if (tool != _tool && tool.field != null)
          if (_controller.issueFor(tool.field!) case final issue?)
            ReelIssueText('${tool.label}: ${issue.message}'),
      const SizedBox(height: 12),
      Material(
        type: MaterialType.transparency,
        child: KeyedSubtree(
          key: ValueKey(_tool),
          child: switch (_tool) {
            _MediaTool.trim => _trimPanel(context, video),
            _MediaTool.cover => _coverPanel(context, video),
            _MediaTool.sound => _soundPanel(context),
            _MediaTool.captions => _captionsPanel(context),
            _MediaTool.framing => _FramingPanel(
              controller: _controller,
              video: video,
            ),
          },
        ),
      ),
    ];
  }

  Future<void> _replaceVideo() async {
    final record = await showGlassActionSheet<bool>(
      context: context,
      title: 'Replace video',
      subtitle:
          'The new video starts with a fresh trim, cover and framing. '
          'Captions are kept for you to check.',
      actions: const [
        GlassAction(
          value: true,
          label: 'Record new',
          icon: Icons.videocam_rounded,
        ),
        GlassAction(
          value: false,
          label: 'Choose from device',
          icon: Icons.photo_library_outlined,
        ),
      ],
    );
    if (record == null || !mounted) return;
    await _controller.pickVideo(record: record);
  }

  // ── Trim ─────────────────────────────────────────────────────────────────

  Widget _trimPanel(BuildContext context, ReelVideo video) {
    final brand = context.brand;
    final draft = _controller.draft;
    final limits = _controller.limits;
    final selected = draft.selectedDuration;
    final outOfRange =
        selected > limits.maxDuration || selected < limits.minDuration;
    final resetEnd = video.duration > limits.maxDuration
        ? limits.maxDuration
        : video.duration;
    final canReset =
        !_controller.locked &&
        (draft.trimStartMs != 0 || draft.selectionEnd != resetEnd);
    final issue = _controller.issueFor(ReelField.trim);
    final label = TextStyle(
      color: brand.mutedInk,
      fontSize: 12.5,
      fontWeight: FontWeight.w600,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return ReelSection(
      title: 'Trim',
      subtitle: 'Trimming chooses what plays. The full video is uploaded.',
      trailing: TextButton(
        onPressed: canReset ? _controller.resetTrim : null,
        style: TextButton.styleFrom(foregroundColor: brand.gold),
        child: const Text('Reset'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ReelTrimTimeline(controller: _controller),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  'Start ${formatReelPrecise(draft.trimStart)}',
                  style: label,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'End ${formatReelPrecise(draft.selectionEnd)}',
                  textAlign: TextAlign.end,
                  style: label,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Selected ${formatReelClock(selected)} · '
            'max ${formatReelClock(limits.maxDuration)}',
            style: TextStyle(
              color: outOfRange ? brand.danger : Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w800,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          if (issue != null) ReelIssueText(issue.message),
        ],
      ),
    );
  }

  // ── Cover ────────────────────────────────────────────────────────────────

  Widget _coverPanel(BuildContext context, ReelVideo video) {
    final brand = context.brand;
    final draft = _controller.draft;
    final player = _controller.player;
    final coverBusy = _controller.isCoverBusy;
    final canEdit = !_controller.locked;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final source = switch (draft.coverSource) {
      ReelCoverSource.automatic =>
        'Chosen automatically from the start of your selection',
      ReelCoverSource.frame =>
        'Frame at '
            '${formatReelPrecise(Duration(milliseconds: draft.coverTimeMs ?? 0))}',
      ReelCoverSource.image => 'Your uploaded picture',
    };
    return ReelSection(
      title: 'Cover',
      subtitle: 'The still people see before your reel plays.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              SizedBox(
                width: 72,
                child: AspectRatio(
                  aspectRatio: 9 / 16,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ReelCoverImage(
                          path: draft.coverPath,
                          decodeWidth: (72 * dpr).round(),
                        ),
                        if (coverBusy)
                          const ColoredBox(
                            color: Colors.black45,
                            child: Center(
                              child: SizedBox.square(
                                dimension: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  semanticsLabel: 'Capturing the cover',
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  source,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13.5,
                    height: 1.35,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                style: reelSecondaryButtonStyle(context),
                onPressed: canEdit && player != null && !coverBusy
                    ? () => unawaited(
                        _controller.useFrameAsCover(player.value.position),
                      )
                    : null,
                icon: const Icon(Icons.center_focus_strong_outlined, size: 19),
                label: const Text('Use current frame'),
              ),
              OutlinedButton.icon(
                style: reelSecondaryButtonStyle(context),
                onPressed: canEdit && !_controller.isMediaBusy
                    ? () => unawaited(_controller.pickCoverImage())
                    : null,
                icon: const Icon(Icons.add_photo_alternate_outlined, size: 19),
                label: const Text('Upload a picture'),
              ),
              if (draft.coverSource != ReelCoverSource.automatic)
                TextButton.icon(
                  style: TextButton.styleFrom(
                    foregroundColor: brand.gold,
                    minimumSize: const Size(48, 48),
                  ),
                  onPressed: canEdit && !coverBusy
                      ? () => unawaited(_controller.useAutomaticCover())
                      : null,
                  icon: const Icon(Icons.auto_awesome_outlined, size: 19),
                  label: const Text('Use automatic cover'),
                ),
            ],
          ),
          if (_controller.timeline.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              'Or tap a frame',
              style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
            ),
            const SizedBox(height: 8),
            _CoverFrameStrip(
              controller: _controller,
              video: video,
              enabled: canEdit && !coverBusy,
            ),
          ],
        ],
      ),
    );
  }

  // ── Sound ────────────────────────────────────────────────────────────────

  Widget _soundPanel(BuildContext context) {
    final brand = context.brand;
    final on = _controller.draft.originalSound;
    return ReelSection(
      title: 'Sound',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: on,
            onChanged: _controller.locked ? null : _controller.setOriginalSound,
            title: const Text(
              'Original sound',
              style: TextStyle(
                color: Colors.white,
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            subtitle: Text(
              on
                  ? 'The reel plays with the sound recorded in the video.'
                  : 'The reel will play without sound. Adding music or a '
                        'voiceover is not available yet.',
              style: TextStyle(color: brand.mutedInk, height: 1.35),
            ),
          ),
          if (!on)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'The sound stays in the uploaded file; the app plays it '
                'muted.',
                style: TextStyle(
                  color: brand.faintInk,
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ── Captions ─────────────────────────────────────────────────────────────

  Widget _captionsPanel(BuildContext context) {
    final brand = context.brand;
    final captions = _controller.draft.captions;
    final canEdit = !_controller.locked;
    final busy = _controller.isMediaBusy;
    final issue = _controller.issueFor(ReelField.captions);
    final count = captions?.cues.length ?? 0;
    final status = captions == null
        ? 'No captions yet'
        : '$count caption${count == 1 ? '' : 's'} · '
              '${captionLanguageName(captions.language)} · '
              '${captions.reviewed ? 'Checked' : 'Not checked yet'}';
    final source = switch (captions?.source) {
      null =>
        'Captions help people follow what is said, with or without sound.',
      CaptionSource.uploaded => 'From your file',
      CaptionSource.manual => 'Typed by you',
      CaptionSource.transcript => 'From a transcript — timing estimated',
      CaptionSource.automatic => 'Generated automatically',
    };
    return ReelSection(
      title: 'Captions',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                captions == null
                    ? Icons.closed_caption_disabled_outlined
                    : (captions.reviewed
                          ? Icons.verified_outlined
                          : Icons.closed_caption_outlined),
                size: 20,
                color: captions?.reviewed ?? false
                    ? brand.success
                    : Colors.white70,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  status,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    height: 1.35,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            source,
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 12.5,
              height: 1.35,
            ),
          ),
          if (issue != null) ReelIssueText(issue.message),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                style: reelPrimaryButtonStyle(context),
                onPressed: canEdit ? widget.onEditCaptions : null,
                icon: const Icon(Icons.edit_note_rounded, size: 20),
                label: const Text('Write or edit captions'),
              ),
              OutlinedButton.icon(
                style: reelSecondaryButtonStyle(context),
                onPressed: canEdit && !busy
                    ? () => unawaited(_controller.importCaptionFile())
                    : null,
                icon: const Icon(Icons.upload_file_rounded, size: 19),
                label: const Text('Upload SRT, VTT or TXT'),
              ),
              if (captions != null)
                TextButton.icon(
                  style: TextButton.styleFrom(
                    foregroundColor: brand.danger,
                    minimumSize: const Size(48, 48),
                  ),
                  onPressed: canEdit ? () => _removeCaptions(count) : null,
                  icon: const Icon(Icons.delete_outline_rounded, size: 19),
                  label: const Text('Remove captions'),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Automatic captions are not available yet.',
            style: TextStyle(color: brand.faintInk, fontSize: 12, height: 1.35),
          ),
        ],
      ),
    );
  }

  Future<void> _removeCaptions(int count) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Remove captions?',
      message:
          '$count caption${count == 1 ? '' : 's'} will be removed from this '
          'reel. This cannot be undone.',
      confirmLabel: 'Remove',
      isDestructive: true,
    );
    if (confirmed == true && mounted) _controller.setCaptions(null);
  }
}

// ── Empty state ─────────────────────────────────────────────────────────────

class _EmptyPreview extends StatelessWidget {
  const _EmptyPreview({required this.busy});

  final bool busy;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return ColoredBox(
      color: Colors.white.withValues(alpha: 0.04),
      child: Padding(
        padding: const EdgeInsets.all(14),
        // Scaled down rather than clipped when a large text setting meets a
        // short card.
        child: Center(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: SizedBox(
              width: 150,
              child: busy
                  ? Semantics(
                      liveRegion: true,
                      child: const Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox.square(
                            dimension: 34,
                            child: CircularProgressIndicator(strokeWidth: 3),
                          ),
                          SizedBox(height: 14),
                          Text(
                            'Preparing video…',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    )
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.video_camera_back_outlined,
                          size: 40,
                          color: brand.gold,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Record or choose a video',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Portrait works best in Explore.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: brand.mutedInk,
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Record and choose, side by side where they fit and stacked where they do
/// not, so neither label wraps into a cramped two-line button.
class _PickButtons extends StatelessWidget {
  const _PickButtons({required this.onRecord, required this.onChoose});

  final VoidCallback? onRecord;
  final VoidCallback? onChoose;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final record = FilledButton.icon(
        style: reelPrimaryButtonStyle(context),
        onPressed: onRecord,
        icon: const Icon(Icons.videocam_rounded),
        label: const Text('Record'),
      );
      final choose = OutlinedButton.icon(
        style: reelSecondaryButtonStyle(context),
        onPressed: onChoose,
        icon: const Icon(Icons.photo_library_outlined),
        label: const Text('Choose from device'),
      );
      final textScale = MediaQuery.textScalerOf(context).scale(1);
      if (constraints.maxWidth / textScale < 340) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [record, const SizedBox(height: 10), choose],
        );
      }
      return Row(
        children: [
          Expanded(child: record),
          const SizedBox(width: 10),
          Expanded(child: choose),
        ],
      );
    },
  );
}

// ── Preview ─────────────────────────────────────────────────────────────────

/// The video in its own shape, never cropped: this is where the creator sees
/// what they recorded. How Explore crops it is the framing panel's job.
class _PreviewCard extends StatelessWidget {
  const _PreviewCard({
    required this.controller,
    required this.video,
    required this.maxHeight,
  });

  final ReelEditorController controller;
  final ReelVideo video;
  final double maxHeight;

  @override
  Widget build(BuildContext context) {
    final player = controller.player;
    final captions = controller.draft.captions;
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: AspectRatio(
          aspectRatio: video.aspectRatio,
          child: DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white12),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: ColoredBox(
                color: Colors.black,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (player != null)
                      VideoPlayer(player)
                    else
                      LayoutBuilder(
                        builder: (context, constraints) => ReelCoverImage(
                          path: controller.draft.coverPath,
                          decodeWidth: math.max(
                            64,
                            (constraints.maxWidth *
                                    MediaQuery.devicePixelRatioOf(context))
                                .round(),
                          ),
                        ),
                      ),
                    if (captions != null && player != null)
                      ReelCaptionOverlay(
                        controller: player,
                        track: captions,
                        preview: true,
                        bottomPadding: 14,
                        fontSize: 14,
                      ),
                    if (player != null)
                      _PlayToggle(controller: controller, player: player),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PlayToggle extends StatelessWidget {
  const _PlayToggle({required this.controller, required this.player});

  final ReelEditorController controller;
  final VideoPlayerController player;

  @override
  Widget build(BuildContext context) => _PlayerSelect<bool>(
    player: player,
    select: (value) => value.isPlaying,
    builder: (context, playing) => Semantics(
      button: true,
      label: playing ? 'Pause preview' : 'Play preview',
      onTap: () => unawaited(controller.togglePlayback()),
      child: ExcludeSemantics(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => unawaited(controller.togglePlayback()),
          child: Center(
            child: AnimatedOpacity(
              opacity: playing ? 0 : 1,
              duration: const Duration(milliseconds: 180),
              child: Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.5),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white24),
                ),
                child: Icon(
                  playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                  color: Colors.white,
                  size: 34,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/// `0:04 / 0:42` — where the preview is inside the selection, and how long the
/// selection is. Rebuilds once a second while playing, not once a tick.
class _ClockText extends StatelessWidget {
  const _ClockText({required this.controller});

  final ReelEditorController controller;

  @override
  Widget build(BuildContext context) {
    final draft = controller.draft;
    final selected = draft.selectedDuration;
    final player = controller.player;
    Widget text(int seconds) {
      final position = formatReelClock(Duration(seconds: seconds));
      final total = formatReelClock(selected);
      return Text(
        '$position / $total',
        semanticsLabel: 'Position $position of $total',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 13.5,
          fontWeight: FontWeight.w800,
          fontFeatures: [FontFeature.tabularFigures()],
        ),
      );
    }

    if (player == null) return text(0);
    final startMs = draft.trimStartMs;
    final lengthMs = selected.inMilliseconds;
    return _PlayerSelect<int>(
      player: player,
      select: (value) =>
          (value.position.inMilliseconds - startMs).clamp(0, lengthMs) ~/ 1000,
      builder: (context, seconds) => text(seconds),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label, this.warn = false});

  final IconData icon;
  final String label;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final colour = warn ? context.brand.danger : Colors.white70;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: warn ? colour.withValues(alpha: 0.6) : Colors.white12,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: colour),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: colour,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// A [GlassPill] with a 48-high target. The pill's own shape stays compact;
/// the band around it takes the taps it would otherwise miss.
class _ToolChip extends StatelessWidget {
  const _ToolChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.hasIssue,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final bool hasIssue;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    button: true,
    selected: selected,
    label: hasIssue ? '$label, needs attention' : label,
    onTap: onTap,
    child: ExcludeSemantics(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Center(
            widthFactor: 1,
            child: GlassPill(
              label: label,
              icon: hasIssue ? Icons.error_outline_rounded : icon,
              selected: selected,
              onDark: true,
              accent: hasIssue ? context.brand.danger : null,
              onTap: onTap,
            ),
          ),
        ),
      ),
    ),
  );
}

// ── Cover frames ────────────────────────────────────────────────────────────

class _CoverFrameStrip extends StatelessWidget {
  const _CoverFrameStrip({
    required this.controller,
    required this.video,
    required this.enabled,
  });

  final ReelEditorController controller;
  final ReelVideo video;
  final bool enabled;

  static const _frameWidth = 48.0;
  static const _frameHeight = 72.0;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final draft = controller.draft;
    final frames = controller.timeline;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return SizedBox(
      height: _frameHeight,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: frames.length,
        separatorBuilder: (context, index) => const SizedBox(width: 6),
        itemBuilder: (context, index) {
          final at = Duration(
            milliseconds:
                (video.durationMs *
                        (index + 0.5) /
                        ReelEditorController.timelineFrameCount)
                    .round(),
          );
          final chosen =
              draft.coverSource == ReelCoverSource.frame &&
              draft.coverTimeMs == at.inMilliseconds;
          final inSelection = at >= draft.trimStart && at <= draft.selectionEnd;
          final bytes = frames[index];
          return Semantics(
            button: true,
            selected: chosen,
            enabled: enabled,
            label:
                'Use the frame at ${formatReelPrecise(at)} as the cover'
                '${inSelection ? '' : ', outside your selection'}',
            child: ExcludeSemantics(
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: enabled
                    ? () => unawaited(controller.useFrameAsCover(at))
                    : null,
                child: Opacity(
                  opacity: inSelection ? 1 : 0.45,
                  child: Container(
                    width: _frameWidth,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: chosen ? brand.gold : Colors.white12,
                        width: chosen ? 2.5 : 1,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(chosen ? 5.5 : 7),
                      child: bytes == null
                          ? ColoredBox(
                              color: Colors.white.withValues(alpha: 0.06),
                            )
                          : Image.memory(
                              bytes,
                              fit: BoxFit.cover,
                              gaplessPlayback: true,
                              cacheHeight: (_frameHeight * dpr).round(),
                              excludeFromSemantics: true,
                              errorBuilder: (context, error, stackTrace) =>
                                  ColoredBox(
                                    color: Colors.white.withValues(alpha: 0.06),
                                  ),
                            ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Framing ─────────────────────────────────────────────────────────────────

/// How a square or landscape video will sit in an Explore card, drawn with the
/// same [ReelFramedMedia] Explore uses, in a box the shape of this phone's
/// screen. What is hidden here is exactly what Explore hides.
class _FramingPanel extends StatelessWidget {
  const _FramingPanel({required this.controller, required this.video});

  final ReelEditorController controller;
  final ReelVideo video;

  /// Fallback card shape when the screen size is unknown: a common modern
  /// phone.
  static const _fallbackAspect = 9 / 19.5;

  @override
  Widget build(BuildContext context) {
    final screen = MediaQuery.sizeOf(context);
    final phoneAspect = screen.width > 0 && screen.height > 0
        ? screen.width / screen.height
        : _fallbackAspect;
    final focal = controller.draft.focalPoint;

    // The geometry is scale-free, so a notional card of the screen's shape
    // gives the same shares as the small box drawn below.
    final card = Size(phoneAspect * 1000, 1000);
    final layout = reelMediaLayout(
      viewport: card,
      mediaAspect: video.aspectRatio,
      focalPoint: focal,
    );
    final hiddenWidth = math.max(0, 1 - card.width / layout.size.width);
    final hiddenHeight = math.max(0, 1 - card.height / layout.size.height);
    final widthHidden = hiddenWidth >= hiddenHeight;
    final hidden = widthHidden ? hiddenWidth : hiddenHeight;
    final axis = widthHidden ? 'width' : 'height';
    final percent = (hidden * 100).round();

    final Widget verdict;
    if (layout.fillsViewport && hidden > 0.12) {
      verdict = ReelBanner(
        icon: Icons.crop_rounded,
        message:
            'About $percent% of the $axis is hidden in Explore. Drag to keep '
            'the important part in view.',
      );
    } else if (!layout.fillsViewport && hidden > 0.12) {
      // Explore enlarges a framed clip a little before it adds bands, so
      // "the whole frame" would not be true here.
      verdict = ReelBanner(
        icon: Icons.crop_rounded,
        message:
            'Explore shows this with soft bands around it, enlarged so about '
            '$percent% of the $axis is hidden. Drag to keep the important part '
            'in view.',
      );
    } else if (!layout.fillsViewport && hidden <= 0.01) {
      verdict = const _Note(
        'Explore shows the whole frame with soft bands around it.',
      );
    } else if (hidden > 0.01) {
      verdict = _Note(
        'Explore shows this with about $percent% of the $axis hidden.',
      );
    } else {
      verdict = const _Note('Explore shows the whole frame.');
    }

    return ReelSection(
      title: 'Framing in Explore',
      subtitle:
          'Explore fills a phone screen. This is how your video sits in it.',
      trailing: TextButton(
        onPressed: focal != null && !controller.locked
            ? () => controller.setFocalPoint(null)
            : null,
        style: TextButton.styleFrom(foregroundColor: context.brand.gold),
        child: const Text('Centre'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) => Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: math.min(190, constraints.maxWidth * 0.72),
                  maxHeight: math.min(screen.height * 0.5, 420),
                ),
                child: AspectRatio(
                  aspectRatio: phoneAspect,
                  child: _FramingPreview(controller: controller, video: video),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          verdict,
        ],
      ),
    );
  }
}

class _FramingPreview extends StatelessWidget {
  const _FramingPreview({required this.controller, required this.video});

  final ReelEditorController controller;
  final ReelVideo video;

  static const _showLeft = CustomSemanticsAction(
    label: 'Show more of the left',
  );
  static const _showRight = CustomSemanticsAction(
    label: 'Show more of the right',
  );
  static const _showTop = CustomSemanticsAction(label: 'Show more of the top');
  static const _showBottom = CustomSemanticsAction(
    label: 'Show more of the bottom',
  );

  static const _centre = (x: 0.5, y: 0.5);

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final viewport = constraints.biggest;
      final draft = controller.draft;
      final player = controller.player;
      final locked = controller.locked;
      final dpr = MediaQuery.devicePixelRatioOf(context);

      // Which axis can be steered is decided with a focal point in place,
      // because setting one is what lets Explore crop further.
      final steered = reelMediaLayout(
        viewport: viewport,
        mediaAspect: video.aspectRatio,
        focalPoint: draft.focalPoint ?? _centre,
      );
      final horizontal = steered.size.width - viewport.width > 0.5;
      final vertical =
          !horizontal && steered.size.height - viewport.height > 0.5;

      /// Moves what is in view by a drag of [dx], [dy] logical pixels: the
      /// picture follows the finger, so the focal point moves the other way.
      void move(double dx, double dy) {
        if (controller.locked) return;
        final current = controller.draft.focalPoint ?? _centre;
        final layout = reelMediaLayout(
          viewport: viewport,
          mediaAspect: video.aspectRatio,
          focalPoint: current,
        );
        double along(double value, double delta, double media, double view) {
          if (media - view <= 0.5) return value;
          // Past this, the media's edge is already at the card's edge; letting
          // the point run on would leave a dead zone to drag back through.
          final half = view / 2 / media;
          return (value - delta / media).clamp(half, 1 - half);
        }

        controller.setFocalPoint((
          x: along(current.x, dx, layout.size.width, viewport.width),
          y: along(current.y, dy, layout.size.height, viewport.height),
        ));
      }

      final canDrag = !locked && (horizontal || vertical);
      return Semantics(
        container: true,
        label: 'Preview of your video in Explore',
        hint: canDrag ? 'Drag to change what stays in view' : null,
        customSemanticsActions: !canDrag
            ? null
            : horizontal
            ? {
                _showLeft: () => move(steered.size.width * 0.1, 0),
                _showRight: () => move(-steered.size.width * 0.1, 0),
              }
            : {
                _showTop: () => move(0, steered.size.height * 0.1),
                _showBottom: () => move(0, -steered.size.height * 0.1),
              },
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          excludeFromSemantics: true,
          onHorizontalDragUpdate: canDrag && horizontal
              ? (details) => move(details.delta.dx, 0)
              : null,
          onVerticalDragUpdate: canDrag && vertical
              ? (details) => move(0, details.delta.dy)
              : null,
          child: DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white30, width: 2),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: ReelFramedMedia(
                aspectRatio: video.aspectRatio,
                focalPoint: draft.focalPoint,
                backdrop: _FramingBackdrop(
                  player: player,
                  coverPath: draft.coverPath,
                ),
                pictureBuilder: (context, layout) => player != null
                    ? VideoPlayer(player)
                    : ReelCoverImage(
                        path: draft.coverPath,
                        alignment: layout.alignment,
                        decodeWidth: math.max(
                          64,
                          (layout.size.width * dpr).round(),
                        ),
                      ),
              ),
            ),
          ),
        ),
      );
    },
  );
}

/// The bands Explore draws around a framed clip: the clip itself, blurred
/// hard and dimmed to the same level Explore uses.
class _FramingBackdrop extends StatelessWidget {
  const _FramingBackdrop({required this.player, required this.coverPath});

  final VideoPlayerController? player;
  final String? coverPath;

  @override
  Widget build(BuildContext context) {
    final player = this.player;
    final Widget picture;
    if (player != null) {
      final size = player.value.size;
      picture = FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: size.width > 0 ? size.width : 16,
          height: size.height > 0 ? size.height : 9,
          child: VideoPlayer(player),
        ),
      );
    } else if (coverPath != null) {
      picture = ReelCoverImage(path: coverPath, decodeWidth: 72);
    } else {
      return const ColoredBox(color: Color(0xFF0B1210));
    }
    return RepaintBoundary(
      child: ClipRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            ImageFiltered(
              imageFilter: ImageFilter.blur(
                sigmaX: 18,
                sigmaY: 18,
                tileMode: TileMode.clamp,
              ),
              child: Transform.scale(scale: 1.18, child: picture),
            ),
            const ColoredBox(color: kReelBackdropScrim),
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline_rounded, size: 17, color: brand.mutedInk),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            message,
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 12.5,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Player listening ────────────────────────────────────────────────────────

/// Rebuilds [builder] only when [select] of the player's value changes.
///
/// A playing `video_player` notifies on every position report; most of what
/// this stage draws from it — whether it is playing, which second it is on —
/// changes far less often than that.
class _PlayerSelect<T> extends StatefulWidget {
  const _PlayerSelect({
    required this.player,
    required this.select,
    required this.builder,
    super.key,
  });

  final VideoPlayerController player;
  final T Function(VideoPlayerValue value) select;
  final Widget Function(BuildContext context, T selected) builder;

  @override
  State<_PlayerSelect<T>> createState() => _PlayerSelectState<T>();
}

class _PlayerSelectState<T> extends State<_PlayerSelect<T>> {
  late T _selected;

  @override
  void initState() {
    super.initState();
    _selected = widget.select(widget.player.value);
    widget.player.addListener(_onChanged);
  }

  @override
  void didUpdateWidget(_PlayerSelect<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.player, widget.player)) {
      oldWidget.player.removeListener(_onChanged);
      widget.player.addListener(_onChanged);
    }
    // The selector may close over draft values that just changed.
    _selected = widget.select(widget.player.value);
  }

  @override
  void dispose() {
    widget.player.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    final next = widget.select(widget.player.value);
    if (next != _selected && mounted) setState(() => _selected = next);
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _selected);
}
