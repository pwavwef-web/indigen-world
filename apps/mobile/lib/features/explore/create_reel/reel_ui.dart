import 'dart:io';

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The small shared vocabulary of the reel creator's screens, so the three
/// stages and their sheets read as one piece. Everything here sits inside
/// `NightTheme`, on the night gradient the old reel form used.

/// Horizontal padding every stage uses for its scrolling content.
const double kReelStagePadding = 18;

/// A titled group of controls on a quiet glass card.
class ReelSection extends StatelessWidget {
  const ReelSection({
    required this.child,
    this.title,
    this.subtitle,
    this.trailing,
    this.padding = const EdgeInsets.fromLTRB(16, 14, 16, 16),
    super.key,
  });

  final String? title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      onDark: true,
      blur: false,
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null || trailing != null) ...[
            Row(
              children: [
                if (title != null)
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(
                        title!,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 15.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  )
                else
                  const Spacer(),
                ?trailing,
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 3),
              Text(
                subtitle!,
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 12.5,
                  height: 1.35,
                ),
              ),
            ],
            const SizedBox(height: 12),
          ],
          child,
        ],
      ),
    );
  }
}

/// The text-field look the reel creator uses everywhere: filled, rounded,
/// gold when focused, and the error said in words under the field.
InputDecoration reelInputDecoration(
  BuildContext context, {
  String? label,
  String? hint,
  String? helper,
  String? error,
}) {
  final brand = context.brand;
  OutlineInputBorder border(Color colour, [double width = 1]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: colour, width: width),
      );
  return InputDecoration(
    labelText: label,
    hintText: hint,
    helperText: helper,
    helperMaxLines: 3,
    errorText: error,
    errorMaxLines: 4,
    filled: true,
    fillColor: Colors.white.withValues(alpha: 0.07),
    labelStyle: TextStyle(color: brand.mutedInk),
    hintStyle: const TextStyle(color: Colors.white54),
    helperStyle: TextStyle(color: brand.mutedInk, height: 1.3),
    counterStyle: TextStyle(color: brand.mutedInk),
    enabledBorder: border(Colors.white24),
    disabledBorder: border(Colors.white12),
    focusedBorder: border(brand.gold, 2),
    errorBorder: border(brand.danger),
    focusedErrorBorder: border(brand.danger, 2),
  );
}

/// The primary action's look: gold, as the old reel form's post button was.
ButtonStyle reelPrimaryButtonStyle(BuildContext context) =>
    FilledButton.styleFrom(
      backgroundColor: context.brand.gold,
      foregroundColor: BrandColors.nightInk,
      disabledBackgroundColor: Colors.white12,
      disabledForegroundColor: Colors.white38,
      minimumSize: const Size(0, 48),
      textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    );

/// A secondary action beside the primary one.
ButtonStyle reelSecondaryButtonStyle(BuildContext context) =>
    OutlinedButton.styleFrom(
      foregroundColor: Colors.white,
      side: const BorderSide(color: Colors.white38),
      minimumSize: const Size(0, 48),
      textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    );

/// A problem, said under whatever it is about.
class ReelIssueText extends StatelessWidget {
  const ReelIssueText(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline_rounded, size: 17, color: brand.danger),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                message,
                style: TextStyle(
                  color: brand.danger,
                  fontSize: 12.5,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// An inline message on a glass card: an error, or something worth knowing.
class ReelBanner extends StatelessWidget {
  const ReelBanner({
    required this.message,
    this.isError = false,
    this.icon,
    this.onDismiss,
    super.key,
  });

  final String message;
  final bool isError;
  final IconData? icon;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final colour = isError ? brand.danger : brand.gold;
    return Semantics(
      liveRegion: true,
      child: GlassSurface(
        onDark: true,
        blur: false,
        accent: colour,
        padding: const EdgeInsets.fromLTRB(13, 11, 6, 11),
        child: Row(
          children: [
            Icon(
              icon ??
                  (isError
                      ? Icons.error_outline_rounded
                      : Icons.info_outline_rounded),
              color: colour,
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ),
            if (onDismiss != null)
              IconButton(
                tooltip: 'Dismiss',
                visualDensity: VisualDensity.compact,
                onPressed: onDismiss,
                icon: const Icon(
                  Icons.close_rounded,
                  size: 18,
                  color: Colors.white70,
                ),
              )
            else
              const SizedBox(width: 7),
          ],
        ),
      ),
    );
  }
}

/// The cover file as a still, decoded no larger than it is drawn. Never opens
/// the video.
class ReelCoverImage extends StatelessWidget {
  const ReelCoverImage({
    required this.path,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
    this.decodeWidth = 480,
    super.key,
  });

  final String? path;
  final BoxFit fit;
  final Alignment alignment;

  /// Pixels to decode at. The cover JPEG is 720 wide; a thumbnail needs far
  /// less, and decoding less is what keeps a drafts list cheap.
  final int decodeWidth;

  @override
  Widget build(BuildContext context) {
    final path = this.path;
    if (path == null) return const _CoverPlaceholder();
    return Image.file(
      File(path),
      fit: fit,
      alignment: alignment,
      cacheWidth: decodeWidth,
      gaplessPlayback: true,
      errorBuilder: (context, error, stackTrace) => const _CoverPlaceholder(),
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder();

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Colors.white.withValues(alpha: 0.05),
    child: const Center(
      child: Icon(Icons.movie_outlined, color: Colors.white38, size: 30),
    ),
  );
}

/// A duration on a dark pill: `0:42`.
class ReelDurationBadge extends StatelessWidget {
  const ReelDurationBadge(this.duration, {this.icon, super.key});

  final Duration duration;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 13, color: Colors.white),
          const SizedBox(width: 4),
        ],
        Text(
          formatReelClock(duration),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11.5,
            fontWeight: FontWeight.w800,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ],
    ),
  );
}

/// The icon each topic is drawn with.
IconData reelTopicIcon(ReelTopic topic) => switch (topic) {
  ReelTopic.storytelling => Icons.auto_stories_outlined,
  ReelTopic.music => Icons.music_note_outlined,
  ReelTopic.dance => Icons.nightlife_outlined,
  ReelTopic.traditions => Icons.celebration_outlined,
  ReelTopic.food => Icons.restaurant_outlined,
  ReelTopic.clothing => Icons.checkroom_outlined,
  ReelTopic.craft => Icons.handyman_outlined,
  ReelTopic.history => Icons.history_edu_outlined,
  ReelTopic.communityLife => Icons.diversity_3_outlined,
  ReelTopic.other => Icons.more_horiz_rounded,
};

/// `Edited today at 14:05`, `Edited yesterday at 09:12`, `Edited 3 Sep`.
String reelEditedLabel(DateTime when, {DateTime? now}) {
  final current = now ?? DateTime.now();
  final local = when.toLocal();
  final today = DateTime(current.year, current.month, current.day);
  final day = DateTime(local.year, local.month, local.day);
  final time =
      '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
  final difference = today.difference(day).inDays;
  if (difference == 0) return 'Edited today at $time';
  if (difference == 1) return 'Edited yesterday at $time';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final date = '${local.day} ${months[local.month - 1]}';
  return local.year == current.year
      ? 'Edited $date'
      : 'Edited $date ${local.year}';
}
