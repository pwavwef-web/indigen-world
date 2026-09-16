import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_caption_editor.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft_store.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_drafts_sheet.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_media_stage.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_media_tools.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_publisher.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_review_stage.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_story_stage.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_ui.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

/// Make a reel and put it into Explore, in three stages: the media, what it
/// means, and a last look before publishing.
///
/// ── Still a community post ──────────────────────────────────────────────────
/// Explore already merges whole community posts that carry a video (see
/// `explore_feed.dart`). Rather than invent a second kind of video with its
/// own storage, lifecycle, moderation and reporting, a reel is published as a
/// normal community post — now carrying a topic, the creator's account of what
/// it shows, attribution and a rights declaration (`reel` on the document), and
/// the trim, cover, framing, sound and caption choices on its media. It keeps
/// the same likes and replies, the same block/mute/report machinery, and can be
/// deleted by its author the same way.
///
/// ── Where the work lives ────────────────────────────────────────────────────
/// This screen is only the frame: app bar, stepper, the action bar and the
/// guard against leaving mid-upload. The draft, the preview player, autosave
/// and publishing are [ReelEditorController]'s; each stage is a view over it.
class CreateReelScreen extends ConsumerStatefulWidget {
  const CreateReelScreen({this.draftId, super.key});

  /// A saved draft to open instead of starting a new reel.
  final String? draftId;

  @override
  ConsumerState<CreateReelScreen> createState() => _CreateReelScreenState();
}

enum _LeaveChoice { keepDraft, discard, continueUpload, saveAndLeave, cancel }

class _CreateReelScreenState extends ConsumerState<CreateReelScreen>
    with WidgetsBindingObserver {
  late final ReelPublisher? _publisher;
  late final ReelEditorController _editor;
  ProviderSubscription<AsyncValue<List<CommunitySpace>>>? _communities;
  ProviderSubscription<AsyncValue<CommunityProfile?>>? _profile;
  var _leaving = false;

  @override
  void initState() {
    super.initState();
    final store = ref.read(reelDraftStoreProvider);
    final backend = ref.read(reelPublishBackendProvider);
    _publisher = backend == null
        ? null
        : ReelPublisher(backend: backend, store: store);
    _editor = ReelEditorController(
      store: store,
      tools: ref.read(reelMediaToolsProvider),
      openPreview: ref.read(reelPreviewControllerFactoryProvider),
      publisher: _publisher,
    )..addListener(_onEditorChanged);
    WidgetsBinding.instance.addObserver(this);
    _communities = ref.listenManual<AsyncValue<List<CommunitySpace>>>(
      joinedCommunitiesProvider,
      (_, next) {
        _editor.joinedCommunityIds = next.asData?.value
            .map((space) => space.id)
            .toSet();
      },
      fireImmediately: true,
    );
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    unawaited(
      _editor
          .start(
            draftId: widget.draftId,
            creatorName:
                profile?.displayName ??
                ref.read(currentDisplayNameProvider) ??
                '',
          )
          .then((_) {
            if (!mounted) return;
            // The profile stream may deliver after the draft opened.
            _profile = ref.listenManual<AsyncValue<CommunityProfile?>>(
              myCommunityProfileProvider,
              (_, next) {
                final name = next.asData?.value?.displayName;
                if (name != null) _editor.setCreatorName(name);
              },
              fireImmediately: true,
            );
          }),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _communities?.close();
    _profile?.close();
    _editor
      ..removeListener(_onEditorChanged)
      ..dispose();
    _publisher?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The process may not come back from the background, so whatever was
    // typed is written down on the way out.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      unawaited(_editor.handleAppPaused());
    }
  }

  void _onEditorChanged() {
    final notice = _editor.notice;
    if (notice == null) return;
    _editor.clearNotice();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showGlassToast(
        context,
        notice.message,
        icon: notice.isError
            ? Icons.error_outline_rounded
            : Icons.check_circle_outline_rounded,
      );
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  Future<void> _publish() async {
    final author = ref.read(myCommunityProfileProvider).asData?.value;
    final result = await _editor.publish(author);
    if (!mounted || result == null || !result.published) return;
    ref
      ..invalidate(rawCommunityFeedProvider)
      ..invalidate(rawFollowingFeedProvider);
    final community = result.draft.community;
    if (community != null) {
      ref.invalidate(rawCommunitySpaceFeedProvider(community.id));
    }
    // A reel that went up with something missing — its cover, say — stays on
    // the review stage long enough to say so; the panel carries the notices
    // and the action bar turns into Done.
    if (_editor.upload.notices.isNotEmpty) return;
    Navigator.of(context).pop(true);
    showCommunityMessage(
      context,
      community == null
          ? 'Your reel is live.'
          : community.isPrivate
          ? 'Your reel is posted in ${community.name}.'
          : 'Your reel is live in ${community.name}.',
    );
  }

  Future<void> _openDrafts() => showReelDraftsSheet(context, _editor);

  Future<void> _openCaptionEditor() => openReelCaptionEditor(context, _editor);

  Future<void> _deleteOpenDraft() async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Delete this draft?',
      message:
          'Its video and details will be removed from this phone. This '
          'cannot be undone.',
      confirmLabel: 'Delete',
      isDestructive: true,
    );
    if (confirmed != true || !mounted) return;
    await _editor.deleteDraft(_editor.draft.id);
    if (mounted) showGlassToast(context, 'Draft deleted.');
  }

  /// Leaving is never silent: mid-upload it offers to continue, save and
  /// leave, or cancel; with work on screen it offers to keep or discard the
  /// draft.
  Future<void> _handleLeave() async {
    if (_leaving) return;
    _leaving = true;
    try {
      await _leave();
    } finally {
      _leaving = false;
    }
  }

  Future<void> _leave() async {
    final navigator = Navigator.of(context);
    if (_editor.isPublished) {
      navigator.pop(true);
      return;
    }
    final upload = _editor.upload;
    if (upload.isActive) {
      final choice = await showGlassActionSheet<_LeaveChoice>(
        context: context,
        title: 'Your reel is still uploading',
        subtitle: upload.canCancel
            ? 'Leaving now stops the upload. Your draft stays on this phone.'
            : 'It is being published now and will finish in a moment.',
        actions: [
          const GlassAction(
            value: _LeaveChoice.continueUpload,
            icon: Icons.cloud_upload_outlined,
            label: 'Continue upload',
            description: 'Stay here until it finishes',
          ),
          if (upload.canCancel) ...const [
            GlassAction(
              value: _LeaveChoice.saveAndLeave,
              icon: Icons.bookmark_outline_rounded,
              label: 'Save and leave',
              description: 'Stop the upload and keep the draft',
            ),
            GlassAction(
              value: _LeaveChoice.cancel,
              icon: Icons.cancel_outlined,
              label: 'Cancel upload',
              description: 'Stop the upload and stay here',
              isDestructive: true,
            ),
          ],
        ],
      );
      if (!mounted) return;
      switch (choice) {
        case _LeaveChoice.saveAndLeave:
          final published = await _editor.saveAndLeave();
          if (mounted) navigator.pop(published);
        case _LeaveChoice.cancel:
          await _editor.cancelUpload();
        case _:
          break;
      }
      return;
    }

    if (!_editor.draft.hasContent) {
      // Nothing worth keeping; a draft that was saved and then emptied goes
      // with it rather than lingering as a blank row in the drafts list.
      if (_editor.isPersisted) await _editor.discardDraft();
      if (mounted) navigator.pop(false);
      return;
    }

    final choice = await showGlassActionSheet<_LeaveChoice>(
      context: context,
      title: 'Leave this reel?',
      subtitle: 'Drafts stay on this phone until you publish or delete them.',
      actions: const [
        GlassAction(
          value: _LeaveChoice.keepDraft,
          icon: Icons.bookmark_outline_rounded,
          label: 'Keep draft',
          description: 'Come back to it from New reel',
        ),
        GlassAction(
          value: _LeaveChoice.discard,
          icon: Icons.delete_outline_rounded,
          label: 'Discard',
          description: 'Delete the video and everything you entered',
          isDestructive: true,
        ),
      ],
    );
    if (!mounted) return;
    switch (choice) {
      case _LeaveChoice.keepDraft:
        await _editor.saveDraft();
        if (mounted) navigator.pop(false);
      case _LeaveChoice.discard:
        final confirmed = await showGlassConfirm(
          context: context,
          title: 'Discard this reel?',
          message:
              'The video and everything you entered will be deleted from '
              'this phone.',
          confirmLabel: 'Discard',
          isDestructive: true,
        );
        if (confirmed != true || !mounted) return;
        await _editor.discardDraft();
        if (mounted) navigator.pop(false);
      case _:
        break;
    }
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) =>
      NightTheme(child: Builder(builder: _build));

  Widget _build(BuildContext context) {
    // Read above the Scaffold: it takes the keyboard out of its body's
    // MediaQuery when it resizes, so below it the keyboard never seems open.
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final screenHeight = MediaQuery.sizeOf(context).height;
    return _frame(context, keyboard: keyboard, screenHeight: screenHeight);
  }

  Widget _frame(
    BuildContext context, {
    required double keyboard,
    required double screenHeight,
  }) => PopScope<Object?>(
    canPop: false,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) unawaited(_handleLeave());
    },
    child: Scaffold(
      backgroundColor: BrandColors.nightInk,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        leading: IconButton(
          tooltip: 'Close',
          icon: const Icon(Icons.close_rounded),
          onPressed: _handleLeave,
        ),
        titleSpacing: 0,
        title: ListenableBuilder(
          listenable: _editor,
          builder: (context, _) => _AppBarTitle(savedAt: _editor.lastSavedAt),
        ),
        actions: [
          ListenableBuilder(
            listenable: _editor,
            builder: (context, _) => IconButton(
              tooltip: 'Drafts',
              icon: const Icon(Icons.folder_open_outlined),
              onPressed: _editor.locked || !_editor.isStarted
                  ? null
                  : _openDrafts,
            ),
          ),
          ListenableBuilder(
            listenable: _editor,
            builder: (context, _) => PopupMenuButton<void>(
              tooltip: 'More',
              enabled:
                  !_editor.locked &&
                  (_editor.isPersisted || _editor.draft.hasContent),
              icon: const Icon(Icons.more_vert_rounded),
              itemBuilder: (context) => [
                PopupMenuItem<void>(
                  onTap: () => unawaited(_deleteOpenDraft()),
                  child: const Text('Delete this draft'),
                ),
              ],
            ),
          ),
        ],
      ),
      body: DecoratedBox(
        decoration: BoxDecoration(gradient: BrandGradients.night(context.brand)),
        child: SafeArea(
          top: false,
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: ListenableBuilder(
                listenable: _editor,
                builder: (context, _) {
                  if (!_editor.isStarted) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  // On a short screen with the keyboard up, the bar would
                  // leave the field being typed in a sliver of space. It comes
                  // back the moment the keyboard goes.
                  final showBar =
                      keyboard == 0 || screenHeight - keyboard >= 560;
                  return Column(
                    children: [
                      _StageStepper(editor: _editor),
                      Expanded(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 180),
                          child: KeyedSubtree(
                            key: ValueKey(_editor.stage),
                            child: _stageBody(),
                          ),
                        ),
                      ),
                      if (showBar)
                        _ActionBar(
                          editor: _editor,
                          onPublish: _publish,
                          onDone: () => Navigator.of(context).pop(true),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    ),
  );

  Widget _stageBody() => switch (_editor.stage) {
    ReelStage.media => ReelMediaStage(
      controller: _editor,
      onOpenDrafts: _openDrafts,
      onEditCaptions: _openCaptionEditor,
    ),
    ReelStage.story => ReelStoryStage(controller: _editor),
    ReelStage.review => ReelReviewStage(
      controller: _editor,
      author: ref.watch(myCommunityProfileProvider).asData?.value,
      onRetry: _publish,
    ),
  };
}

class _AppBarTitle extends StatelessWidget {
  const _AppBarTitle({required this.savedAt});

  final DateTime? savedAt;

  @override
  Widget build(BuildContext context) {
    final saved = savedAt;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          'New reel',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
        ),
        if (saved != null)
          Text(
            reelEditedLabel(saved).replaceFirst('Edited', 'Draft saved'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: context.brand.mutedInk,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
            ),
          ),
      ],
    );
  }
}

/// Media · Tell the story · Review. A stage already reached can be revisited
/// at any time; a later one opens once everything before it is complete.
///
/// On a narrow phone the three labels do not fit side by side without cutting
/// "Tell the story" in half, so only the current stage is named there and the
/// others are their numbered marks — each still says its full name to a screen
/// reader and in a tooltip.
class _StageStepper extends StatelessWidget {
  const _StageStepper({required this.editor});

  final ReelEditorController editor;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final current = editor.stage;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        kReelStagePadding,
        2,
        kReelStagePadding,
        6,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final textScale = MediaQuery.textScalerOf(context).scale(1);
          final compact = constraints.maxWidth / textScale < 400;
          return Row(
            children: [
              for (final stage in ReelStage.values) ...[
                if (stage.index > 0)
                  Expanded(
                    flex: compact ? 1 : 0,
                    child: Container(
                      width: 14,
                      height: 2,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      color: stage.index <= current.index
                          ? brand.gold
                          : Colors.white24,
                    ),
                  ),
                _sized(
                  compact: compact,
                  active: stage == current,
                  child: _StepChip(
                    stage: stage,
                    current: current,
                    showLabel: !compact || stage == current,
                    done:
                        stage.index < current.index &&
                        (stage == ReelStage.review ||
                            editor.issuesFor(stage).isEmpty),
                    onTap: stage == current ? null : () => editor.goTo(stage),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  /// Every step shares the row evenly when there is room; when there is not,
  /// the named step takes what it needs and the marks take only theirs.
  Widget _sized({
    required bool compact,
    required bool active,
    required Widget child,
  }) {
    if (!compact) return Expanded(child: child);
    return active ? Flexible(flex: 4, child: child) : child;
  }
}

class _StepChip extends StatelessWidget {
  const _StepChip({
    required this.stage,
    required this.current,
    required this.done,
    required this.showLabel,
    required this.onTap,
  });

  final ReelStage stage;
  final ReelStage current;
  final bool done;
  final bool showLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final active = stage == current;
    final reached = stage.index <= current.index;
    final chip = InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 22,
              height: 22,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active
                    ? brand.gold
                    : (done ? brand.gold.withValues(alpha: 0.22) : null),
                border: Border.all(
                  color: reached ? brand.gold : Colors.white38,
                  width: 1.5,
                ),
              ),
              child: done && !active
                  ? Icon(Icons.check_rounded, size: 14, color: brand.gold)
                  : Text(
                      '${stage.index + 1}',
                      style: TextStyle(
                        color: active ? BrandColors.nightInk : Colors.white70,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
            ),
            if (showLabel) ...[
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  stage.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: active ? Colors.white : Colors.white60,
                    fontSize: 12.5,
                    fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
    return Semantics(
      button: onTap != null,
      selected: active,
      label:
          'Step ${stage.index + 1} of ${ReelStage.values.length}: '
          '${stage.label}${active
              ? ', current'
              : done
              ? ', complete'
              : ''}',
      excludeSemantics: true,
      child: showLabel ? chip : Tooltip(message: stage.label, child: chip),
    );
  }
}

/// Save draft beside the stage's primary action, pinned under the content.
class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.editor,
    required this.onPublish,
    required this.onDone,
  });

  final ReelEditorController editor;
  final Future<void> Function() onPublish;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final stage = editor.stage;
    final upload = editor.upload;
    final attemptedIssues =
        editor.hasAttempted(stage) && stage != ReelStage.review
        ? editor.issuesFor(stage)
        : const <ReelIssue>[];
    final String primaryLabel;
    final IconData primaryIcon;
    final VoidCallback? primaryAction;
    if (editor.isPublished) {
      primaryLabel = 'Done';
      primaryIcon = Icons.check_rounded;
      primaryAction = onDone;
    } else if (stage == ReelStage.review) {
      primaryLabel = upload.isActive ? 'Publishing…' : 'Publish';
      primaryIcon = Icons.publish_rounded;
      primaryAction = upload.isActive || editor.isMediaBusy
          ? null
          : () => unawaited(onPublish());
    } else {
      primaryLabel = 'Continue';
      primaryIcon = Icons.arrow_forward_rounded;
      primaryAction = editor.isMediaBusy ? null : editor.continueForward;
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: BrandColors.nightInk.withValues(alpha: 0.92),
        border: const Border(top: BorderSide(color: Colors.white12)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          kReelStagePadding,
          8,
          kReelStagePadding,
          10,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (attemptedIssues.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: ReelIssueText(
                  attemptedIssues.length == 1
                      ? attemptedIssues.first.message
                      : '${attemptedIssues.first.message} '
                            '(+${attemptedIssues.length - 1} more above)',
                ),
              ),
            Row(
              children: [
                if (!editor.isPublished) ...[
                  Expanded(
                    child: OutlinedButton.icon(
                      style: reelSecondaryButtonStyle(context),
                      onPressed: editor.locked
                          ? null
                          : () => unawaited(editor.saveDraft(manual: true)),
                      icon: const Icon(
                        Icons.bookmark_outline_rounded,
                        size: 19,
                      ),
                      label: const Text(
                        'Save draft',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: FilledButton.icon(
                    style: reelPrimaryButtonStyle(context),
                    onPressed: primaryAction,
                    icon: Icon(primaryIcon, size: 19),
                    label: Text(
                      primaryLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
