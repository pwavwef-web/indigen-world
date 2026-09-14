import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/features/community/media_picker.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:video_player/video_player.dart';
import 'package:video_thumbnail/video_thumbnail.dart';

/// A media problem worth showing the creator, in words they can act on.
class ReelMediaProblem implements Exception {
  const ReelMediaProblem(this.message);

  final String message;

  @override
  String toString() => message;
}

/// What the device could tell about a clip before anything was uploaded.
@immutable
class ReelVideoProbe {
  const ReelVideoProbe({
    required this.fileName,
    required this.sizeBytes,
    required this.contentType,
    required this.durationMs,
    required this.aspectRatio,
  });

  final String fileName;
  final int sizeBytes;
  final String contentType;
  final int durationMs;
  final double aspectRatio;
}

/// A caption or transcript file the creator chose.
typedef ReelCaptionFile = ({String fileName, String text});

/// Everything the reel creator asks of the device, behind one seam so tests
/// never open a camera, a decoder or a file dialog.
abstract interface class ReelMediaTools {
  /// Records a clip ([record]) or chooses one from the device. Null when the
  /// creator backed out — which is not an error and changes nothing.
  Future<String?> pickVideo({required bool record});

  /// A clip Android took away with the app while the camera was open.
  Future<String?> recoverLostVideo();

  /// Reads size, type, length and shape. Throws [ReelMediaProblem] for a file
  /// that cannot be published at all: unsupported, unreadable or too large.
  /// Length is *not* refused here — a long clip can be trimmed.
  Future<ReelVideoProbe> probeVideo(String path, ReelLimits limits);

  /// A small JPEG of the frame at [timeMs], for the trim timeline. Held in
  /// memory, so kept tiny. Null when the frame cannot be decoded.
  Future<Uint8List?> timelineFrame(String path, int timeMs);

  /// Writes the frame at [timeMs] as a cover JPEG at [outputPath].
  Future<String?> writeCoverFrame({
    required String videoPath,
    required int timeMs,
    required String outputPath,
  });

  /// A picture from the gallery to use as the cover. Null when cancelled.
  Future<String?> pickCoverImage();

  /// A caption or transcript file. Null when cancelled; throws
  /// [ReelMediaProblem] when the file is too large or not text.
  Future<ReelCaptionFile?> pickCaptionFile(ReelLimits limits);
}

final reelMediaToolsProvider = Provider<ReelMediaTools>(
  (ref) => const DeviceReelMediaTools(),
);

/// Opens the preview player for a local clip. Overridden in tests with a fake
/// controller, the same way Explore's `reelVideoControllerFactoryProvider` is.
final reelPreviewControllerFactoryProvider =
    Provider<VideoPlayerController Function(String path)>(
      (ref) =>
          (path) => VideoPlayerController.file(File(path)),
    );

/// [ReelMediaTools] on a real phone.
class DeviceReelMediaTools implements ReelMediaTools {
  const DeviceReelMediaTools();

  static const _picker = CommunityMediaPicker();

  /// Timeline frames are drawn about 48 dp tall; twice that covers a dense
  /// screen, and a frame this size is a few kilobytes.
  static const _timelineFrameHeight = 112;

  /// Wide enough to stay sharp on a full-width card, small enough to cost less
  /// than the first second of the video it stands in for.
  static const _coverWidth = 720;

  @override
  Future<String?> pickVideo({required bool record}) => _picker.pickVideoFile(
    source: record ? ImageSource.camera : ImageSource.gallery,
  );

  @override
  Future<String?> recoverLostVideo() => _picker.recoverLostVideoFile();

  @override
  Future<ReelVideoProbe> probeVideo(String path, ReelLimits limits) async {
    final file = File(path);
    final fileName = path.split(RegExp(r'[\\/]')).last;
    if (!await file.exists()) {
      throw const ReelMediaProblem(
        'That video could not be found on this phone. Try choosing it again.',
      );
    }
    if (unsupportedVideoMessage(fileName) case final message?) {
      throw ReelMediaProblem(message);
    }
    final size = await file.length();
    if (size <= 0) {
      throw const ReelMediaProblem('That video file is empty.');
    }
    if (size > limits.maxBytes) {
      throw ReelMediaProblem(
        'This video is ${formatReelBytes(size)}; reels can be up to '
        '${formatReelBytes(limits.maxBytes)}. Record a shorter clip or '
        'choose a smaller one.',
      );
    }
    // The player is the real judge of whether a file opens. It reads the
    // header and never decodes more than it has to; the controller is let go
    // straight away so repeated choices never pile up decoders.
    final controller = VideoPlayerController.file(file);
    try {
      await controller.initialize();
      final value = controller.value;
      final ratio = value.aspectRatio;
      return ReelVideoProbe(
        fileName: fileName,
        sizeBytes: size,
        contentType:
            ReelLimits.supportedVideoTypes[reelFileExtension(fileName)] ??
            'video/mp4',
        durationMs: value.duration.inMilliseconds,
        aspectRatio: ratio.isFinite && ratio > 0
            ? ratio.clamp(0.2, 5.0).toDouble()
            : 9 / 16,
      );
    } on Object {
      throw const ReelMediaProblem(
        'That video could not be opened on this phone. It may be damaged or '
        'in a format the app cannot play — try another.',
      );
    } finally {
      await controller.dispose();
    }
  }

  @override
  Future<Uint8List?> timelineFrame(String path, int timeMs) async {
    try {
      return await VideoThumbnail.thumbnailData(
        video: path,
        imageFormat: ImageFormat.JPEG,
        maxHeight: _timelineFrameHeight,
        quality: 60,
        timeMs: timeMs,
      );
    } on Object {
      return null;
    }
  }

  @override
  Future<String?> writeCoverFrame({
    required String videoPath,
    required int timeMs,
    required String outputPath,
  }) async {
    try {
      // A path ending in the format's extension is used as the file itself,
      // so every cover gets its own name and no stale image is served from
      // the image cache under an old one.
      return await VideoThumbnail.thumbnailFile(
        video: videoPath,
        thumbnailPath: outputPath,
        imageFormat: ImageFormat.JPEG,
        maxWidth: _coverWidth,
        quality: 80,
        timeMs: timeMs,
      );
    } on Object {
      return null;
    }
  }

  @override
  Future<String?> pickCoverImage() => _picker.pickImageFile();

  @override
  Future<ReelCaptionFile?> pickCaptionFile(ReelLimits limits) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['srt', 'vtt', 'txt'],
      withData: false,
    );
    final picked = result?.files.singleOrNull;
    final path = picked?.path;
    if (picked == null || path == null) return null;
    if (picked.size > limits.maxCaptionFileBytes) {
      throw ReelMediaProblem(
        'That caption file is ${formatReelBytes(picked.size)}; caption files '
        'can be up to ${formatReelBytes(limits.maxCaptionFileBytes)}.',
      );
    }
    try {
      final bytes = await File(path).readAsBytes();
      return (
        fileName: picked.name,
        text: utf8.decode(bytes, allowMalformed: true),
      );
    } on Object {
      throw const ReelMediaProblem('That caption file could not be read.');
    }
  }
}
