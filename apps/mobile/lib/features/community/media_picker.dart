import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';

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
      picked.add(
        PendingUpload(
          path: file.path,
          isVideo: false,
          aspectRatio: await _imageAspectRatio(file),
        ),
      );
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
    return PendingUpload(
      path: file.path,
      isVideo: false,
      aspectRatio: await _imageAspectRatio(file),
    );
  }

  Future<PendingUpload?> pickVideo({required ImageSource source}) async {
    final file = await _picker.pickVideo(
      source: source,
      maxDuration: maxVideoDuration,
    );
    if (file == null) return null;
    return PendingUpload(path: file.path, isVideo: true, aspectRatio: 9 / 16);
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

/// Bottom sheet offering camera / gallery for photos and videos. Returns the
/// staged uploads, or an empty list when dismissed.
Future<List<PendingUpload>> showMediaPickerSheet(
  BuildContext context, {
  required int remainingSlots,
}) async {
  const picker = CommunityMediaPicker();

  final result = await showModalBottomSheet<List<PendingUpload>>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Add to your post',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
              ),
            ),
            _PickerOption(
              icon: Icons.photo_library_outlined,
              title: 'Photos from your gallery',
              subtitle: 'Up to $remainingSlots more',
              onTap: () async {
                final picked = await picker.pickImages(limit: remainingSlots);
                if (sheetContext.mounted) {
                  Navigator.pop(sheetContext, picked);
                }
              },
            ),
            _PickerOption(
              icon: Icons.photo_camera_outlined,
              title: 'Take a photo',
              subtitle: 'Use the camera',
              onTap: () async {
                final picked = await picker.pickImage(
                  source: ImageSource.camera,
                );
                if (sheetContext.mounted) {
                  Navigator.pop(sheetContext, [?picked]);
                }
              },
            ),
            _PickerOption(
              icon: Icons.video_library_outlined,
              title: 'Video or reel',
              subtitle: 'Up to 3 minutes',
              onTap: () async {
                final picked = await picker.pickVideo(
                  source: ImageSource.gallery,
                );
                if (sheetContext.mounted) {
                  Navigator.pop(sheetContext, [?picked]);
                }
              },
            ),
            _PickerOption(
              icon: Icons.videocam_outlined,
              title: 'Record a reel',
              subtitle: 'Use the camera',
              onTap: () async {
                final picked = await picker.pickVideo(
                  source: ImageSource.camera,
                );
                if (sheetContext.mounted) {
                  Navigator.pop(sheetContext, [?picked]);
                }
              },
            ),
          ],
        ),
      ),
    ),
  );
  return result ?? const <PendingUpload>[];
}

class _PickerOption extends StatelessWidget {
  const _PickerOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    leading: Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: BrandColors.heritageGreen.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: BrandColors.heritageGreen, size: 21),
    ),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
    subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
    onTap: onTap,
  );
}
