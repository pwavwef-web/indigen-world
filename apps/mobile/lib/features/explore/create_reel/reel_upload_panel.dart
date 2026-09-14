import 'dart:async';

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_publisher.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_ui.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Where a publish is, in words and — only while bytes are really moving — a
/// number.
///
/// The bar is determinate exactly when Storage is reporting bytes; preparing
/// and processing are honest spinners, because nothing measurable is
/// happening that a percentage could describe.
class ReelUploadPanel extends StatelessWidget {
  const ReelUploadPanel({
    required this.controller,
    required this.onRetry,
    super.key,
  });

  final ReelEditorController controller;
  final VoidCallback onRetry;

  Future<void> _confirmCancel(BuildContext context) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Cancel this upload?',
      message: 'Your draft stays on this phone, so you can publish it later.',
      confirmLabel: 'Cancel upload',
      cancelLabel: 'Keep uploading',
      isDestructive: true,
    );
    if (confirmed == true) await controller.cancelUpload();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final upload = controller.upload;
      if (upload.phase == ReelUploadPhase.idle) {
        return const SizedBox.shrink();
      }
      final brand = context.brand;
      final (icon, title, colour) = switch (upload.phase) {
        ReelUploadPhase.preparing => (
          Icons.inventory_2_outlined,
          'Preparing your reel…',
          brand.gold,
        ),
        ReelUploadPhase.uploading => (
          Icons.cloud_upload_outlined,
          'Uploading video',
          brand.gold,
        ),
        ReelUploadPhase.paused => (
          Icons.pause_circle_outline_rounded,
          'Upload paused',
          brand.gold,
        ),
        ReelUploadPhase.retrying => (
          Icons.refresh_rounded,
          'Retrying…',
          brand.gold,
        ),
        ReelUploadPhase.processing => (
          Icons.hourglass_top_rounded,
          'Processing — publishing your reel',
          brand.gold,
        ),
        ReelUploadPhase.complete => (
          Icons.check_circle_outline_rounded,
          'Published',
          brand.success,
        ),
        ReelUploadPhase.failed => (
          Icons.error_outline_rounded,
          'Upload failed',
          brand.danger,
        ),
        ReelUploadPhase.cancelled => (
          Icons.cancel_outlined,
          'Upload cancelled',
          brand.mutedInk,
        ),
        ReelUploadPhase.idle => (Icons.circle, '', brand.gold),
      };
      final fraction = upload.fraction;
      final spinning = const {
        ReelUploadPhase.preparing,
        ReelUploadPhase.retrying,
        ReelUploadPhase.processing,
      }.contains(upload.phase);
      final showsBytes =
          upload.totalBytes > 0 &&
          (upload.phase == ReelUploadPhase.uploading ||
              upload.phase == ReelUploadPhase.paused);

      return ReelSection(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              liveRegion: true,
              child: Row(
                children: [
                  Icon(icon, color: colour, size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (spinning || showsBytes) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: showsBytes ? fraction : null,
                  minHeight: 6,
                  backgroundColor: Colors.white24,
                  color: brand.gold,
                  semanticsLabel: title,
                  semanticsValue: showsBytes && fraction != null
                      ? '${(fraction * 100).floor()}%'
                      : null,
                ),
              ),
            ],
            if (showsBytes) ...[
              const SizedBox(height: 6),
              Text(
                '${formatReelBytes(upload.bytesSent)} of '
                '${formatReelBytes(upload.totalBytes)}'
                '${fraction == null ? '' : ' · ${(fraction * 100).floor()}%'}',
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 12.5,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
            if (upload.phase == ReelUploadPhase.uploading ||
                upload.phase == ReelUploadPhase.processing) ...[
              const SizedBox(height: 6),
              Text(
                'Keep the app open until this finishes.',
                style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
              ),
            ],
            if (upload.message case final message?
                when upload.phase == ReelUploadPhase.failed ||
                    upload.phase == ReelUploadPhase.cancelled) ...[
              const SizedBox(height: 10),
              ReelBanner(
                message: message,
                isError: upload.phase == ReelUploadPhase.failed,
              ),
            ],
            if (upload.phase == ReelUploadPhase.complete)
              for (final notice in upload.notices) ...[
                const SizedBox(height: 10),
                ReelBanner(message: notice),
              ],
            if (upload.canPause ||
                upload.canResume ||
                upload.canCancel ||
                upload.phase == ReelUploadPhase.failed ||
                upload.phase == ReelUploadPhase.cancelled) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (upload.canPause)
                    OutlinedButton.icon(
                      style: reelSecondaryButtonStyle(context),
                      onPressed: () => unawaited(controller.pauseUpload()),
                      icon: const Icon(Icons.pause_rounded, size: 19),
                      label: const Text('Pause'),
                    ),
                  if (upload.canResume)
                    FilledButton.icon(
                      style: reelPrimaryButtonStyle(context),
                      onPressed: () => unawaited(controller.resumeUpload()),
                      icon: const Icon(Icons.play_arrow_rounded, size: 19),
                      label: const Text('Resume'),
                    ),
                  if (upload.phase == ReelUploadPhase.failed ||
                      upload.phase == ReelUploadPhase.cancelled)
                    FilledButton.icon(
                      style: reelPrimaryButtonStyle(context),
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh_rounded, size: 19),
                      label: const Text('Try again'),
                    ),
                  if (upload.canCancel)
                    TextButton.icon(
                      style: TextButton.styleFrom(
                        foregroundColor: brand.danger,
                        minimumSize: const Size(48, 48),
                      ),
                      onPressed: () => unawaited(_confirmCancel(context)),
                      icon: const Icon(Icons.close_rounded, size: 19),
                      label: const Text('Cancel upload'),
                    ),
                ],
              ),
            ],
          ],
        ),
      );
    },
  );
}
