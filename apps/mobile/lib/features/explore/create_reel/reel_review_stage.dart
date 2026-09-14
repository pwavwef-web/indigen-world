import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_explore_preview.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_publisher.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_ui.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_upload_panel.dart';

/// Stage three of a new reel: a last look before it goes out.
///
/// The preview comes first because it is the thing a creator is really
/// checking; the summary under it is for the details a picture cannot show —
/// the context, the attribution, the declaration — each with a way back to
/// where it was entered. Going back loses nothing: every stage is a view over
/// the same [ReelEditorController].
class ReelReviewStage extends StatelessWidget {
  const ReelReviewStage({
    required this.controller,
    required this.author,
    required this.onRetry,
    super.key,
  });

  final ReelEditorController controller;
  final CommunityProfile? author;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final brand = context.brand;
      final draft = controller.draft;
      final issues = controller.issuesFor(ReelStage.review);
      final showUpload = controller.upload.phase != ReelUploadPhase.idle;
      final previewHeight = MediaQuery.sizeOf(context).height * 0.62;
      return ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
          kReelStagePadding,
          12,
          kReelStagePadding,
          28,
        ),
        children: [
          Semantics(
            header: true,
            child: const Text(
              'Check your reel',
              style: TextStyle(
                color: Colors.white,
                fontSize: 21,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'This is how it will look in Explore.',
            style: TextStyle(color: brand.mutedInk, fontSize: 13),
          ),
          const SizedBox(height: 12),
          if (showUpload) ...[
            ReelUploadPanel(controller: controller, onRetry: onRetry),
            const SizedBox(height: 12),
          ],
          if (issues.isNotEmpty) ...[
            _Problems(controller: controller, issues: issues),
            const SizedBox(height: 12),
          ],
          Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: previewHeight < 320 ? 320 : previewHeight,
              ),
              child: ReelExplorePreview(controller: controller, author: author),
            ),
          ),
          const SizedBox(height: 14),
          _VideoSummary(controller: controller),
          const SizedBox(height: 10),
          _Summary(
            title: 'Caption',
            stage: ReelStage.story,
            controller: controller,
            child: _Value(
              draft.caption.trim().isEmpty
                  ? 'No caption'
                  : draft.caption.trim(),
              muted: draft.caption.trim().isEmpty,
            ),
          ),
          const SizedBox(height: 10),
          _Summary(
            title: 'Topic',
            stage: ReelStage.story,
            controller: controller,
            child: draft.topic == null
                ? const _Value('Not chosen', muted: true)
                : Row(
                    children: [
                      Icon(reelTopicIcon(draft.topic!), color: brand.gold),
                      const SizedBox(width: 8),
                      Expanded(child: _Value(draft.topic!.label)),
                    ],
                  ),
          ),
          const SizedBox(height: 10),
          _Summary(
            title: 'Community',
            stage: ReelStage.story,
            controller: controller,
            child: _Value(switch (draft.community) {
              null => 'No community — shown in Explore and the main feed',
              final community when community.isPrivate =>
                '${community.name} — private, so only its members will see '
                    'it and it will not appear in Explore',
              final community =>
                '${community.name} — public, also shown in Explore and the '
                    'feed',
            }),
          ),
          const SizedBox(height: 10),
          _Summary(
            title: 'What is happening?',
            stage: ReelStage.story,
            controller: controller,
            child: _Value(
              draft.context.trim().isEmpty
                  ? 'Not written yet'
                  : draft.context.trim(),
              muted: draft.context.trim().isEmpty,
            ),
          ),
          const SizedBox(height: 10),
          _Summary(
            title: 'Creator and source',
            stage: ReelStage.story,
            controller: controller,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Fact(
                  'Original creator',
                  draft.originalCreator.trim().isEmpty
                      ? 'Not given'
                      : draft.originalCreator.trim(),
                ),
                _Fact('Made by', draft.ownWork ? 'You' : 'Someone else'),
                if (draft.sourceOrganisation.trim().isNotEmpty)
                  _Fact('Source', draft.sourceOrganisation.trim()),
                _Fact(
                  'Your right to publish',
                  draft.rights?.label ?? 'Not confirmed',
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Your trim, cover, framing and sound choices are applied when the '
            'reel plays. The full video file is uploaded.',
            style: TextStyle(color: brand.faintInk, fontSize: 12, height: 1.4),
          ),
        ],
      );
    },
  );
}

class _Problems extends StatelessWidget {
  const _Problems({required this.controller, required this.issues});

  final ReelEditorController controller;
  final List<ReelIssue> issues;

  @override
  Widget build(BuildContext context) => ReelSection(
    title: 'Before you publish',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final issue in issues)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: ReelIssueText(issue.message)),
              TextButton(
                onPressed: controller.locked
                    ? null
                    : () => controller.goTo(issue.stage),
                style: TextButton.styleFrom(
                  foregroundColor: context.brand.gold,
                  minimumSize: const Size(48, 48),
                ),
                child: const Text('Fix'),
              ),
            ],
          ),
      ],
    ),
  );
}

class _VideoSummary extends StatelessWidget {
  const _VideoSummary({required this.controller});

  final ReelEditorController controller;

  @override
  Widget build(BuildContext context) {
    final draft = controller.draft;
    final video = draft.video;
    final captions = draft.captions;
    return _Summary(
      title: 'Video and cover',
      stage: ReelStage.media,
      controller: controller,
      child: video == null
          ? const _Value('No video chosen', muted: true)
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 54,
                  height: 96,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: ReelCoverImage(
                      path: draft.coverPath,
                      decodeWidth: (54 * MediaQuery.devicePixelRatioOf(context))
                          .round(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _Fact(
                        'Length',
                        draft.isTrimmed
                            ? '${formatReelClock(draft.selectedDuration)}, '
                                  'trimmed to '
                                  '${formatReelClock(draft.trimStart)}–'
                                  '${formatReelClock(draft.selectionEnd)} of '
                                  '${formatReelClock(video.duration)}'
                            : '${formatReelClock(draft.selectedDuration)}, '
                                  'full clip',
                      ),
                      _Fact('File', formatReelBytes(video.sizeBytes)),
                      _Fact('Sound', draft.originalSound ? 'Original' : 'Off'),
                      _Fact(
                        'Captions',
                        captions == null
                            ? 'None'
                            : '${captions.cues.length} in '
                                  '${captionLanguageName(captions.language)}'
                                  '${captions.reviewed ? '' : ' · not checked'}',
                      ),
                      _Fact('Cover', switch (draft.coverSource) {
                        ReelCoverSource.automatic => 'Automatic',
                        ReelCoverSource.frame => 'Chosen frame',
                        ReelCoverSource.image => 'Uploaded picture',
                      }),
                      if (video.needsFraming)
                        _Fact(
                          'Framing',
                          draft.focalPoint == null
                              ? 'Centred'
                              : 'Custom focal point',
                        ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({
    required this.title,
    required this.stage,
    required this.controller,
    required this.child,
  });

  final String title;
  final ReelStage stage;
  final ReelEditorController controller;
  final Widget child;

  @override
  Widget build(BuildContext context) => ReelSection(
    title: title,
    trailing: TextButton(
      onPressed: controller.locked ? null : () => controller.goTo(stage),
      style: TextButton.styleFrom(
        foregroundColor: context.brand.gold,
        minimumSize: const Size(48, 40),
        tapTargetSize: MaterialTapTargetSize.padded,
      ),
      child: Text('Edit', semanticsLabel: 'Edit $title'),
    ),
    child: child,
  );
}

class _Value extends StatelessWidget {
  const _Value(this.text, {this.muted = false});

  final String text;
  final bool muted;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      color: muted ? context.brand.mutedInk : Colors.white,
      fontSize: 14,
      height: 1.4,
    ),
  );
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: '$label  ',
            style: TextStyle(
              color: context.brand.mutedInk,
              fontWeight: FontWeight.w700,
            ),
          ),
          TextSpan(text: value),
        ],
      ),
      style: const TextStyle(color: Colors.white, fontSize: 13.5, height: 1.4),
    ),
  );
}
