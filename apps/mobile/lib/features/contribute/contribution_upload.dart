import 'dart:io';
import 'dart:math';

import 'package:file_picker/file_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;

/// Picking and uploading the file behind a Collection contribution.
///
/// Songs, narrations and manuscripts used to be contributed as a *link* to
/// somewhere else, which asked a member to first publish their own work
/// somewhere public before an archive would take it — and left the archive
/// holding a URL that could rot or be taken down. The file comes here instead,
/// straight into the member's own private submission prefix, where only they
/// and a reviewer can read it until it is approved for publication.

/// The kinds of file a contribution can carry, and what each will accept.
enum ContributionMediaKind {
  audio,
  document,
  image;

  /// Extensions offered in the system picker.
  ///
  /// Named explicitly rather than using a type filter: Android's document
  /// picker with a wildcard type hands back anything at all, including files
  /// Storage will refuse, and finding that out after a long upload on a rural
  /// connection is the worst possible time.
  List<String> get extensions => switch (this) {
    ContributionMediaKind.audio => const [
      'mp3',
      'm4a',
      'aac',
      'wav',
      'ogg',
      'opus',
      'flac',
      'amr',
    ],
    ContributionMediaKind.document => const [
      'pdf',
      'doc',
      'docx',
      'rtf',
      'txt',
      'md',
      'epub',
    ],
    ContributionMediaKind.image => const ['jpg', 'jpeg', 'png', 'webp'],
  };

  String get label => switch (this) {
    ContributionMediaKind.audio => 'audio file',
    ContributionMediaKind.document => 'document',
    ContributionMediaKind.image => 'image',
  };

  /// The `mediaType` the review pipeline stores alongside the file.
  String get mediaType => switch (this) {
    ContributionMediaKind.audio => 'audio',
    ContributionMediaKind.document => 'document',
    ContributionMediaKind.image => 'image',
  };
}

/// A file chosen on the device, not yet uploaded.
@immutable
class PickedContributionFile {
  const PickedContributionFile({
    required this.path,
    required this.name,
    required this.sizeBytes,
    required this.kind,
  });

  final String path;
  final String name;
  final int sizeBytes;
  final ContributionMediaKind kind;

  String get sizeLabel {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) {
      return '${(sizeBytes / 1024).toStringAsFixed(0)} KB';
    }
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  /// The content type Storage will be told, derived from the extension.
  ///
  /// The rules allow an explicit list of types, so guessing wrong means a
  /// refused upload rather than a mislabelled file.
  String get mimeType {
    final extension = p.extension(name).toLowerCase().replaceFirst('.', '');
    return switch (extension) {
      'mp3' => 'audio/mpeg',
      'm4a' || 'aac' => 'audio/mp4',
      'wav' => 'audio/wav',
      'ogg' || 'opus' => 'audio/ogg',
      'flac' => 'audio/flac',
      'amr' => 'audio/amr',
      'pdf' => 'application/pdf',
      'doc' => 'application/msword',
      'docx' =>
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'rtf' => 'application/rtf',
      'epub' => 'application/epub+zip',
      'txt' => 'text/plain',
      'md' => 'text/markdown',
      'png' => 'image/png',
      'webp' => 'image/webp',
      'jpg' || 'jpeg' => 'image/jpeg',
      _ => 'application/octet-stream',
    };
  }
}

/// Where an uploaded file landed, as the submission records it.
@immutable
class UploadedContributionFile {
  const UploadedContributionFile({
    required this.storagePath,
    required this.mimeType,
    required this.sizeBytes,
    required this.mediaType,
  });

  final String storagePath;
  final String mimeType;
  final int sizeBytes;
  final String mediaType;

  Map<String, Object?> toMap() => {
    'storagePath': storagePath,
    'mimeType': mimeType,
    'sizeBytes': sizeBytes,
    'mediaType': mediaType,
  };
}

class ContributionUploadFailure implements Exception {
  const ContributionUploadFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Chooses and uploads the file behind a contribution.
class ContributionUploader {
  const ContributionUploader();

  /// The campaign every mobile Collection contribution belongs to. Also the
  /// second path segment Storage rules and the callable both check.
  static const campaignId = 'collection-contributions';

  /// Ceiling on one upload. Well under the Storage rules' 500 MB so a member
  /// on a slow connection is stopped by a sentence rather than by a refused
  /// write forty minutes in.
  static const maxBytes = 120 * 1024 * 1024;

  Future<PickedContributionFile?> pick(ContributionMediaKind kind) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: kind.extensions,
      withData: false,
    );
    final file = result?.files.singleOrNull;
    final path = file?.path;
    if (file == null || path == null) return null;
    if (file.size > maxBytes) {
      throw ContributionUploadFailure(
        'That ${kind.label} is larger than ${maxBytes ~/ (1024 * 1024)} MB. '
        'Please send a shorter or more compressed version.',
      );
    }
    return PickedContributionFile(
      path: path,
      name: file.name,
      sizeBytes: file.size,
      kind: kind,
    );
  }

  /// Uploads [file] into [uid]'s own private submission prefix.
  ///
  /// The folder is a fresh random id rather than the contribution id, because
  /// the contribution does not exist yet — the callable creates it, and it
  /// needs the path in order to do so.
  Future<UploadedContributionFile> upload({
    required String uid,
    required PickedContributionFile file,
    void Function(double progress)? onProgress,
  }) async {
    final folder = _uploadId();
    final safeName = _safeName(file.name);
    final storagePath =
        'creator-submissions/$uid/$campaignId/$folder/$safeName';
    try {
      final task = FirebaseStorage.instance
          .ref(storagePath)
          .putFile(
            File(file.path),
            SettableMetadata(contentType: file.mimeType),
          );
      if (onProgress != null) {
        task.snapshotEvents.listen((snapshot) {
          if (snapshot.totalBytes > 0) {
            onProgress(snapshot.bytesTransferred / snapshot.totalBytes);
          }
        });
      }
      await task;
      return UploadedContributionFile(
        storagePath: storagePath,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        mediaType: file.kind.mediaType,
      );
    } on FirebaseException catch (error) {
      throw ContributionUploadFailure(
        switch (error.code) {
          'unauthorized' =>
            'That file type cannot be uploaded. Try a common ${file.kind.label} format.',
          'canceled' => 'The upload was cancelled.',
          _ =>
            'The ${file.kind.label} did not finish uploading. '
                'Check your connection and try again.',
        },
      );
    }
  }

  /// A collision-resistant folder name. Two members uploading at the same
  /// second must not share a folder, and neither must one member's two files.
  static String _uploadId() {
    final random = Random.secure();
    final suffix = List.generate(
      8,
      (_) => random.nextInt(36).toRadixString(36),
    ).join();
    return '${DateTime.now().millisecondsSinceEpoch}_$suffix';
  }

  /// Keeps the member's own filename where it is readable, without letting it
  /// steer the upload out of its folder.
  static String _safeName(String name) {
    final cleaned = p
        .basename(name)
        .replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    if (cleaned.isEmpty || cleaned.startsWith('.')) return 'original';
    return cleaned.length <= 96 ? cleaned : cleaned.substring(0, 96);
  }
}
