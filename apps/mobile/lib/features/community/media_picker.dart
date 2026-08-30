import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/photo_crop_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';
import 'package:video_thumbnail/video_thumbnail.dart';

/// Device photo / video selection for the community composer.
///
/// Kept behind this small facade so the repository and screens never depend on
/// `image_picker` directly — the picker is the only place that touches it.
class CommunityMediaPicker {
  const CommunityMediaPicker();

  static final ImagePicker _picker = ImagePicker();

  /// Longest edge an uploaded photo is resized to before upload. Keeps
  /// community media inside a sensible bandwidth budget on rural connections.
  static const _maxImageDimension = 1920.0;
  static const _imageQuality = 82;

  /// Videos longer than this are rejected — the community feed is for short
  /// clips, and long uploads fail often on slow connections.
  static const maxVideoDuration = Duration(minutes: 3);

  Future<List<PendingUpload>> pickImages({int limit = 4}) async {
    final files = await _picker.pickMultiImage(
      maxWidth: _maxImageDimension,
      maxHeight: _maxImageDimension,
      imageQuality: _imageQuality,
      limit: limit,
    );
    final picked = <PendingUpload>[];
    for (final file in files.take(limit)) {
      picked.add(await stagePhoto(file.path));
    }
    return picked;
  }

  Future<PendingUpload?> pickImage({required ImageSource source}) async {
    final file = await _picker.pickImage(
      source: source,
      maxWidth: _maxImageDimension,
      maxHeight: _maxImageDimension,
      imageQuality: _imageQuality,
    );
    if (file == null) return null;
    return stagePhoto(file.path);
  }

  /// Wraps a photo file as an attachment, measuring its real shape.
  ///
  /// Public because the cropper hands a *new* file back and the attachment has
  /// to be re-measured against it — a crop that kept the original's aspect
  /// ratio would have the feed reserve the wrong space for it.
  Future<PendingUpload> stagePhoto(String path) async => PendingUpload(
    path: path,
    isVideo: false,
    aspectRatio: await _imageAspectRatio(XFile(path)),
  );

  Future<PendingUpload?> pickVideo({required ImageSource source}) async {
    final file = await _picker.pickVideo(
      source: source,
      maxDuration: maxVideoDuration,
    );
    if (file == null) return null;
    final shape = await _videoShape(file.path);
    return PendingUpload(
      path: file.path,
      isVideo: true,
      aspectRatio: shape.aspectRatio,
      durationSeconds: shape.durationSeconds,
      posterPath: await _videoPoster(file.path),
    );
  }

  /// Writes the clip's opening frame to a temporary JPEG, to be uploaded with
  /// it as the post's cover.
  ///
  /// Doing this once at post time is what makes a cover cheap: every reader
  /// afterwards fetches one small cached image instead of opening a video
  /// decoder per tile just to look at a single frame.
  ///
  /// Returns null if the device cannot decode the clip. That is not worth
  /// refusing an upload over — the feed still reads a frame off the video
  /// itself, it just pays for it on every scroll.
  Future<String?> _videoPoster(String path) async {
    try {
      final directory = await getTemporaryDirectory();
      return await VideoThumbnail.thumbnailFile(
        video: path,
        thumbnailPath: directory.path,
        imageFormat: ImageFormat.JPEG,
        // Wide enough to stay sharp on a full-width card, small enough that it
        // costs less than the first second of the video it stands in for.
        maxWidth: 720,
        quality: 78,
        // Frame zero is black on a lot of phone recordings; a fifth of a second
        // in is past that and still unmistakably the same shot.
        timeMs: 200,
      );
    } on Object {
      return null;
    }
  }

  /// Reads a clip's real shape and length off the file before it is uploaded.
  ///
  /// Every video used to be stamped 9:16 on the assumption that a phone
  /// records upright, which letterboxed every landscape clip in the feed. The
  /// file already knows the answer, and asking it costs one short-lived
  /// controller that never plays.
  Future<({double aspectRatio, int? durationSeconds})> _videoShape(
    String path,
  ) async {
    final controller = VideoPlayerController.file(File(path));
    try {
      await controller.initialize();
      final ratio = controller.value.aspectRatio;
      final duration = controller.value.duration;
      return (
        aspectRatio: ratio > 0 ? ratio.clamp(0.5, 1.95).toDouble() : 9 / 16,
        durationSeconds: duration > Duration.zero ? duration.inSeconds : null,
      );
    } on Object {
      // An unreadable header is not a reason to refuse the upload — the clip
      // still plays, it just gets the upright default it always had.
      return (aspectRatio: 9 / 16, durationSeconds: null);
    } finally {
      await controller.dispose();
    }
  }

  /// Reads the real aspect ratio so the feed reserves the right space and
  /// photos do not jump when they decode.
  Future<double> _imageAspectRatio(XFile file) async {
    try {
      final bytes = await file.readAsBytes();
      final descriptor = await ui.ImageDescriptor.encoded(
        await ui.ImmutableBuffer.fromUint8List(bytes),
      );
      final ratio = descriptor.width / descriptor.height;
      descriptor.dispose();
      return ratio > 0 ? ratio.clamp(0.6, 1.9).toDouble() : 4 / 3;
    } on Object {
      return 4 / 3;
    }
  }
}

/// Which of the four routes into the device the member chose.
enum _MediaChoice { gallery, photo, video, reel }

/// Centered glass card offering camera / gallery for photos and videos.
/// Returns the staged uploads, or an empty list when dismissed.
Future<List<PendingUpload>> showMediaPickerSheet(
  BuildContext context, {
  required int remainingSlots,
}) async {
  const picker = CommunityMediaPicker();

  // The card resolves on the tap and the device picker opens after it, rather
  // than the system UI arriving over a modal that is still on screen.
  final choice = await showGlassActionSheet<_MediaChoice>(
    context: context,
    title: 'Add to your post',
    actions: [
      GlassAction(
        value: _MediaChoice.gallery,
        icon: Icons.photo_library_outlined,
        label: 'Photos from your gallery',
        description: 'Up to $remainingSlots more',
      ),
      const GlassAction(
        value: _MediaChoice.photo,
        icon: Icons.photo_camera_outlined,
        label: 'Take a photo',
        description: 'Use the camera',
      ),
      const GlassAction(
        value: _MediaChoice.video,
        icon: Icons.video_library_outlined,
        label: 'Video or reel',
        description: 'Up to 3 minutes',
      ),
      const GlassAction(
        value: _MediaChoice.reel,
        icon: Icons.videocam_outlined,
        label: 'Record a reel',
        description: 'Use the camera',
      ),
    ],
  );

  final picked = switch (choice) {
    null => const <PendingUpload>[],
    _MediaChoice.gallery => await picker.pickImages(limit: remainingSlots),
    _MediaChoice.photo => [?await picker.pickImage(source: ImageSource.camera)],
    _MediaChoice.video => [
      ?await picker.pickVideo(source: ImageSource.gallery),
    ],
    _MediaChoice.reel => [?await picker.pickVideo(source: ImageSource.camera)],
  };

  // One photo goes straight to the cropper, because that is nearly always what
  // somebody wants next and it saves a tap. Several do not: four crop screens
  // in a row to post four pictures is a chore, so a multi-pick stages as it is
  // and each attachment carries its own crop button in the composer.
  if (picked.length == 1 && picked.single.mediaType == 'image') {
    if (!context.mounted) return picked;
    return [await cropAttachment(context, picked.single)];
  }
  return picked;
}

/// Runs [upload] through the cropper and re-measures the result.
///
/// Cancelling gives the attachment back untouched, so the crop screen is
/// always an offer rather than a gate.
Future<PendingUpload> cropAttachment(
  BuildContext context,
  PendingUpload upload,
) async {
  final path = await cropPhoto(context, upload.path);
  if (path == upload.path) return upload;
  return const CommunityMediaPicker().stagePhoto(path);
}
