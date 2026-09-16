import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_ui.dart';
import 'package:indigen_world_mobile/features/explore/reel_caption_overlay.dart';
import 'package:indigen_world_mobile/features/explore/reel_media.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart'
    show reelInitials;
import 'package:video_player/video_player.dart';

/// The reel as an Explore card will draw it, before it is published.
///
/// ── What is real and what is a picture of it ─────────────────────────────
/// The media is placed by [ReelFramedMedia], the same widget Explore uses, in
/// a card the shape of this phone's screen — so the crop, the bands and the
/// focal point are exactly what a viewer will get. The words over it copy the
/// Explore card's type and order (label, byline, caption, sound line); the
/// rail is drawn but does nothing, because there is nothing yet to like.
class ReelExplorePreview extends StatelessWidget {
  const ReelExplorePreview({
    required this.controller,
    required this.author,
    super.key,
  });

  final ReelEditorController controller;
  final CommunityProfile? author;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final draft = controller.draft;
      final video = draft.video;
      final player = controller.player;
      final screen = MediaQuery.sizeOf(context);
      final aspect = screen.height > 0
          ? (screen.width / screen.height).clamp(9 / 20, 9 / 16).toDouble()
          : 9 / 19.5;
      final community = draft.community;
      final name = author?.displayName ?? draft.originalCreator;
      final handle = author?.username ?? '';
      final caption = draft.caption.trim();
      final captions = draft.captions;

      return Semantics(
        container: true,
        label: 'Preview of how your reel will appear in Explore',
        child: AspectRatio(
          aspectRatio: aspect,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Stack(
              fit: StackFit.expand,
              children: [
                ReelFramedMedia(
                  aspectRatio: video?.aspectRatio,
                  focalPoint: (video?.needsFraming ?? false)
                      ? draft.focalPoint
                      : null,
                  backdrop: _Backdrop(coverPath: draft.coverPath),
                  pictureBuilder: (context, layout) {
                    final still = ReelCoverImage(
                      path: draft.coverPath,
                      alignment: layout.alignment,
                      decodeWidth: math.max(
                        64,
                        (layout.size.width *
                                MediaQuery.devicePixelRatioOf(context))
                            .round()
                            .clamp(64, 1080),
                      ),
                    );
                    if (player == null) return still;
                    return _PlayingOrStill(player: player, still: still);
                  },
                ),
                const IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        stops: [0.45, 1],
                        colors: [Colors.transparent, Color(0xCC000000)],
                      ),
                    ),
                  ),
                ),
                if (player != null && captions != null)
                  ReelCaptionOverlay(
                    controller: player,
                    track: captions,
                    bottomPadding: 150,
                    fontSize: 13,
                  ),
                if (player != null)
                  Positioned.fill(
                    child: Semantics(
                      button: true,
                      label: 'Play or pause the preview',
                      onTap: () => unawaited(controller.togglePlayback()),
                      excludeSemantics: true,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => unawaited(controller.togglePlayback()),
                      ),
                    ),
                  ),
                if (player != null) Center(child: _PlayGlyph(player: player)),
                const Positioned(right: 8, bottom: 80, child: _PreviewRail()),
                Positioned(
                  left: 14,
                  right: 64,
                  bottom: 14,
                  child: IgnorePointer(
                    child: ExcludeSemantics(
                      child: _Words(
                        label:
                            draft.topic?.label.toUpperCase() ??
                            'FROM THE COMMUNITY',
                        name: name.isEmpty ? 'You' : name,
                        handle: handle,
                        avatarUrl: author?.avatarUrl,
                        caption: caption,
                        communityName: community?.name,
                        sound: !draft.originalSound
                            ? 'No original sound'
                            : handle.isEmpty
                            ? 'Original sound'
                            : 'Original sound · @$handle',
                      ),
                    ),
                  ),
                ),
                if (community != null && community.isPrivate)
                  Positioned(
                    left: 10,
                    right: 10,
                    top: 10,
                    child: ReelBanner(
                      icon: Icons.lock_outline_rounded,
                      message:
                          'Only members of ${community.name} will see this. '
                          "It won't appear in Explore.",
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

/// The playing clip, with the cover underneath until the first frame arrives.
class _PlayingOrStill extends StatelessWidget {
  const _PlayingOrStill({required this.player, required this.still});

  final VideoPlayerController player;
  final Widget still;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      still,
      ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: player,
        builder: (context, value, child) =>
            value.isPlaying || value.position > Duration.zero
            ? child!
            : const SizedBox.shrink(),
        child: VideoPlayer(player),
      ),
    ],
  );
}

class _PlayGlyph extends StatelessWidget {
  const _PlayGlyph({required this.player});

  final VideoPlayerController player;

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: player,
        builder: (context, value, _) => IgnorePointer(
          child: AnimatedOpacity(
            opacity: value.isPlaying ? 0 : 1,
            duration: const Duration(milliseconds: 160),
            child: const Icon(
              Icons.play_circle_fill_rounded,
              color: Colors.white,
              size: 56,
              shadows: [Shadow(blurRadius: 18, color: Colors.black87)],
            ),
          ),
        ),
      );
}

class _Backdrop extends StatelessWidget {
  const _Backdrop({required this.coverPath});

  final String? coverPath;

  @override
  Widget build(BuildContext context) {
    if (coverPath == null) return const ColoredBox(color: Color(0xFF0B0F1A));
    return ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [
          ImageFiltered(
            imageFilter: ImageFilter.blur(
              sigmaX: 24,
              sigmaY: 24,
              tileMode: TileMode.clamp,
            ),
            child: Transform.scale(
              scale: 1.2,
              child: ReelCoverImage(path: coverPath, decodeWidth: 72),
            ),
          ),
          const ColoredBox(color: kReelBackdropScrim),
        ],
      ),
    );
  }
}

class _PreviewRail extends StatelessWidget {
  const _PreviewRail();

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: ExcludeSemantics(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final icon in const [
            Icons.favorite_border_rounded,
            Icons.chat_bubble_outline_rounded,
            Icons.bookmark_border_rounded,
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Icon(
                icon,
                color: Colors.white,
                size: 25,
                shadows: const [Shadow(blurRadius: 10, color: Colors.black)],
              ),
            ),
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: context.brand.gold, width: 1.5),
            ),
            child: const Icon(
              Icons.menu_book_rounded,
              color: Colors.white,
              size: 18,
            ),
          ),
        ],
      ),
    ),
  );
}

class _Words extends StatelessWidget {
  const _Words({
    required this.label,
    required this.name,
    required this.handle,
    required this.avatarUrl,
    required this.caption,
    required this.communityName,
    required this.sound,
  });

  final String label;
  final String name;
  final String handle;
  final String? avatarUrl;
  final String caption;
  final String? communityName;
  final String sound;

  static const _shadow = [Shadow(blurRadius: 10, color: Colors.black)];

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (communityName case final community?) ...[
          Row(
            children: [
              Icon(Icons.diversity_3_rounded, size: 14, color: brand.gold),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  community,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    shadows: _shadow,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
        ],
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: brand.gold,
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.1,
            shadows: _shadow,
          ),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            CircleAvatar(
              radius: 11,
              backgroundColor: brand.gold.withValues(alpha: 0.3),
              foregroundImage: avatarUrl == null || avatarUrl!.isEmpty
                  ? null
                  : NetworkImage(avatarUrl!),
              child: Text(
                reelInitials(name),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: name,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (handle.isNotEmpty)
                      TextSpan(
                        text: '  @$handle',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, shadows: _shadow),
              ),
            ),
          ],
        ),
        if (caption.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            caption,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              height: 1.35,
              shadows: _shadow,
            ),
          ),
        ],
        const SizedBox(height: 4),
        Row(
          children: [
            Icon(
              sound == 'No original sound'
                  ? Icons.volume_off_rounded
                  : Icons.music_note_rounded,
              size: 13,
              color: Colors.white70,
            ),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                sound,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  shadows: _shadow,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
