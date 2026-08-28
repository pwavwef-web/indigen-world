import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_thumbnail/video_thumbnail.dart';

/// How the advertiser chose their creative.
enum AdCreativeSource { recordVideo, videoLibrary, takePhoto, photoLibrary }

/// A creative chosen on the device, not yet uploaded.
@immutable
class PickedAdCreative {
  const PickedAdCreative({
    required this.path,
    required this.name,
    required this.sizeBytes,
    required this.isVideo,
    this.posterPath,
  });

  final String path;
  final String name;
  final int sizeBytes;
  final bool isVideo;

  /// A still written out of the clip when it was chosen, so the review step can
  /// show the advert rather than a grey box. Null when the device could not
  /// decode one, which is not a reason to refuse the upload.
  final String? posterPath;

  ContributionMediaKind get uploadKind =>
      isVideo ? ContributionMediaKind.video : ContributionMediaKind.image;

  PickedContributionFile get asUpload => PickedContributionFile(
    path: path,
    name: name,
    sizeBytes: sizeBytes,
    kind: uploadKind,
  );

  String get sizeLabel => asUpload.sizeLabel;
}

/// Longest an ad clip may run.
///
/// Nobody watches a two-minute advertisement between reels, and every second
/// is bandwidth somebody in Navrongo pays for twice — once to upload it and
/// once, later, for every viewer who loads it.
const Duration kMaxAdVideoDuration = Duration(seconds: 60);

/// Asks for the creative, then hands back the file.
///
/// Video is offered first and from the camera first, because "record something
/// on your phone right now" is the realistic path for a small business here —
/// not "open your design software".
Future<PickedAdCreative?> pickAdCreative(BuildContext context) async {
  final source = await showGlassActionSheet<AdCreativeSource>(
    context: context,
    title: 'Your advert',
    actions: const [
      GlassAction(
        value: AdCreativeSource.recordVideo,
        icon: Icons.videocam_rounded,
        label: 'Record a video',
      ),
      GlassAction(
        value: AdCreativeSource.videoLibrary,
        icon: Icons.video_library_rounded,
        label: 'Choose a video',
      ),
      GlassAction(
        value: AdCreativeSource.takePhoto,
        icon: Icons.photo_camera_rounded,
        label: 'Take a photo',
      ),
      GlassAction(
        value: AdCreativeSource.photoLibrary,
        icon: Icons.photo_library_rounded,
        label: 'Choose a photo',
      ),
    ],
  );
  if (source == null) return null;

  final picker = ImagePicker();
  final XFile? file = switch (source) {
    AdCreativeSource.recordVideo => await picker.pickVideo(
      source: ImageSource.camera,
      maxDuration: kMaxAdVideoDuration,
    ),
    AdCreativeSource.videoLibrary => await picker.pickVideo(
      source: ImageSource.gallery,
      maxDuration: kMaxAdVideoDuration,
    ),
    AdCreativeSource.takePhoto => await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 85,
    ),
    AdCreativeSource.photoLibrary => await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 85,
    ),
  };
  if (file == null) return null;

  final isVideo =
      source == AdCreativeSource.recordVideo ||
      source == AdCreativeSource.videoLibrary;
  final length = await File(file.path).length();
  if (length > ContributionUploader.maxBytes) {
    throw ContributionUploadFailure(
      'That ${isVideo ? 'video' : 'image'} is larger than '
      '${ContributionUploader.maxBytes ~/ (1024 * 1024)} MB. Please use a '
      'shorter or smaller one.',
    );
  }
  return PickedAdCreative(
    path: file.path,
    name: file.name,
    sizeBytes: length,
    isVideo: isVideo,
    posterPath: isVideo ? await _poster(file.path) : null,
  );
}

/// Writes the clip's opening frame to a temporary JPEG.
///
/// The same trick the community composer uses: decoding one frame once, here,
/// costs far less than opening a player every time the preview is rebuilt —
/// and unlike the feed's covers this file is local, so there is no network
/// player that could read it anyway.
Future<String?> _poster(String path) async {
  try {
    final directory = await getTemporaryDirectory();
    return await VideoThumbnail.thumbnailFile(
      video: path,
      thumbnailPath: directory.path,
      imageFormat: ImageFormat.JPEG,
      maxWidth: 720,
      quality: 78,
      // Frame zero is black on a lot of phone recordings.
      timeMs: 200,
    );
  } on Object {
    return null;
  }
}
