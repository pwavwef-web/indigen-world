import 'package:flutter/foundation.dart';
import 'package:indigen_world_mobile/core/media_geometry.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/community/media_picker.dart';

/// The three stages of making a reel, in order.
enum ReelStage {
  media('Media'),
  story('Tell the story'),
  review('Review');

  const ReelStage(this.label);

  final String label;
}

/// How the cover was chosen.
enum ReelCoverSource {
  /// A frame the app picked near the start of the selection. Moves with the
  /// trim until the creator chooses a cover themselves.
  automatic,

  /// A frame the creator picked.
  frame,

  /// A separate picture the creator uploaded.
  image,
}

/// The limits a reel is held to, read from the places that already enforce
/// them rather than restated.
@immutable
class ReelLimits {
  const ReelLimits({
    required this.maxDuration,
    required this.maxBytes,
    required this.maxCaptionLength,
    this.minDuration = const Duration(seconds: 1),
    this.minContextLength = 10,
    this.maxContextLength = ReelPostDetails.maxContextLength,
    this.maxCreditLength = ReelPostDetails.maxCreditLength,
    this.maxCaptionFileBytes = 512 * 1024,
  });

  /// The app's real limits: the recorder's longest clip, the Storage rule's
  /// largest video, and the Security Rules' longest post text (500, not the
  /// 400 the old reel form used).
  static const standard = ReelLimits(
    maxDuration: CommunityMediaPicker.maxVideoDuration,
    maxBytes: CommunityRepository.maxVideoBytes,
    maxCaptionLength: CommunityRepository.maxPostLength,
  );

  final Duration maxDuration;
  final Duration minDuration;
  final int maxBytes;
  final int maxCaptionLength;
  final int minContextLength;
  final int maxContextLength;
  final int maxCreditLength;
  final int maxCaptionFileBytes;

  /// Video containers every player the app ships on can open. The Storage rule
  /// takes any `video/*`; this is narrower because a Matroska file that plays
  /// on the uploader's Android phone is a black card on an iPhone.
  static const supportedVideoTypes = <String, String>{
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'm4v': 'video/x-m4v',
    'webm': 'video/webm',
    '3gp': 'video/3gpp',
  };
}

/// The extension of [fileName], lower case, without the dot.
String reelFileExtension(String fileName) {
  final name = fileName.split(RegExp(r'[\\/]')).last;
  final dot = name.lastIndexOf('.');
  return dot < 0 || dot == name.length - 1
      ? ''
      : name.substring(dot + 1).toLowerCase();
}

/// Why [fileName] cannot be published as a reel, or null when its type is
/// supported. A file with no extension is let through to the player, which is
/// the real judge of whether it opens.
String? unsupportedVideoMessage(String fileName) {
  final extension = reelFileExtension(fileName);
  if (extension.isEmpty ||
      ReelLimits.supportedVideoTypes.containsKey(extension)) {
    return null;
  }
  return '.${extension.toUpperCase()} videos cannot be published. Choose an '
      'MP4, MOV, M4V, WebM or 3GP video.';
}

/// `2:05`, or `1:02:05` past an hour.
String formatReelClock(Duration duration) {
  final total = duration.inMilliseconds < 0 ? 0 : duration.inSeconds;
  final hours = total ~/ 3600;
  final minutes = (total % 3600) ~/ 60;
  final seconds = (total % 60).toString().padLeft(2, '0');
  return hours > 0
      ? '$hours:${minutes.toString().padLeft(2, '0')}:$seconds'
      : '$minutes:$seconds';
}

/// `2:05.4` — a clock with tenths, for trim handles.
String formatReelPrecise(Duration duration) {
  final tenths = (duration.inMilliseconds.abs() % 1000) ~/ 100;
  return '${formatReelClock(duration)}.$tenths';
}

/// `128 MB`, `940 KB`.
String formatReelBytes(int bytes) {
  if (bytes >= 1024 * 1024) {
    final mb = bytes / (1024 * 1024);
    return '${mb >= 10 ? mb.round() : mb.toStringAsFixed(1)} MB';
  }
  return '${(bytes / 1024).ceil()} KB';
}

/// The chosen video file, measured once when it was picked.
@immutable
class ReelVideo {
  const ReelVideo({
    required this.path,
    required this.fileName,
    required this.sizeBytes,
    required this.contentType,
    required this.durationMs,
    required this.aspectRatio,
  });

  /// Inside the draft's own folder, so it survives the cache being cleared.
  final String path;
  final String fileName;
  final int sizeBytes;
  final String contentType;
  final int durationMs;

  /// Width over height as the player displays it (rotation applied).
  final double aspectRatio;

  Duration get duration => Duration(milliseconds: durationMs);

  /// Square and landscape clips are the ones Explore has to crop or frame.
  bool get needsFraming => aspectRatio >= 0.9;

  /// Identifies this recording across saves, so an upload recorded against it
  /// is not mistaken for an upload of a replacement.
  String get fingerprint => '$fileName|$sizeBytes|$durationMs';

  Map<String, Object?> toJson() => {
    'path': path,
    'fileName': fileName,
    'sizeBytes': sizeBytes,
    'contentType': contentType,
    'durationMs': durationMs,
    'aspectRatio': aspectRatio,
  };

  static ReelVideo? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final path = raw['path'];
    final fileName = raw['fileName'];
    final size = raw['sizeBytes'];
    final type = raw['contentType'];
    final duration = raw['durationMs'];
    final ratio = raw['aspectRatio'];
    if (path is! String ||
        fileName is! String ||
        size is! num ||
        type is! String ||
        duration is! num ||
        ratio is! num ||
        ratio <= 0) {
      return null;
    }
    return ReelVideo(
      path: path,
      fileName: fileName,
      sizeBytes: size.toInt(),
      contentType: type,
      durationMs: duration.toInt(),
      aspectRatio: ratio.toDouble(),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is ReelVideo &&
      other.path == path &&
      other.fingerprint == fingerprint &&
      other.aspectRatio == aspectRatio &&
      other.contentType == contentType;

  @override
  int get hashCode => Object.hash(path, fingerprint, aspectRatio, contentType);
}

/// How far a publish got, written down so a retry resumes instead of starting
/// over — and never publishes twice.
@immutable
class ReelUploadRecord {
  const ReelUploadRecord({
    required this.postId,
    this.folder,
    this.videoStoragePath,
    this.videoUrl,
    this.videoFingerprint,
    this.writeAttempted = false,
    this.writePrivateCommunityId,
  });

  /// Reserved before the first byte is sent; every retry reuses it.
  final String postId;

  /// The Storage folder the video went into. A change of community between
  /// public and private moves the folder, and the video with it.
  final String? folder;
  final String? videoStoragePath;
  final String? videoUrl;

  /// [ReelVideo.fingerprint] of the file that was uploaded.
  final String? videoFingerprint;

  /// Set just before the post document is written. A retry that finds this
  /// set looks for the post first, because a write can land on the server
  /// even when the phone never hears back.
  final bool writeAttempted;

  /// Where that write went: a private community's id, or null for the public
  /// collection.
  final String? writePrivateCommunityId;

  /// Whether [video] is already stored in [inFolder].
  bool hasVideo(ReelVideo video, String inFolder) =>
      videoUrl != null &&
      videoStoragePath != null &&
      videoFingerprint == video.fingerprint &&
      folder == inFolder;

  ReelUploadRecord copyWith({
    String? folder,
    String? videoStoragePath,
    String? videoUrl,
    String? videoFingerprint,
    bool? writeAttempted,
    Object? writePrivateCommunityId = _keep,
  }) => ReelUploadRecord(
    postId: postId,
    folder: folder ?? this.folder,
    videoStoragePath: videoStoragePath ?? this.videoStoragePath,
    videoUrl: videoUrl ?? this.videoUrl,
    videoFingerprint: videoFingerprint ?? this.videoFingerprint,
    writeAttempted: writeAttempted ?? this.writeAttempted,
    writePrivateCommunityId: identical(writePrivateCommunityId, _keep)
        ? this.writePrivateCommunityId
        : writePrivateCommunityId as String?,
  );

  Map<String, Object?> toJson() => {
    'postId': postId,
    'folder': ?folder,
    'videoStoragePath': ?videoStoragePath,
    'videoUrl': ?videoUrl,
    'videoFingerprint': ?videoFingerprint,
    'writeAttempted': writeAttempted,
    'writePrivateCommunityId': ?writePrivateCommunityId,
  };

  static ReelUploadRecord? fromJson(Object? raw) {
    if (raw is! Map || raw['postId'] is! String) return null;
    String? text(String key) => raw[key] is String ? raw[key] as String : null;
    return ReelUploadRecord(
      postId: raw['postId'] as String,
      folder: text('folder'),
      videoStoragePath: text('videoStoragePath'),
      videoUrl: text('videoUrl'),
      videoFingerprint: text('videoFingerprint'),
      writeAttempted: raw['writeAttempted'] == true,
      writePrivateCommunityId: text('writePrivateCommunityId'),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is ReelUploadRecord &&
      other.postId == postId &&
      other.folder == folder &&
      other.videoStoragePath == videoStoragePath &&
      other.videoUrl == videoUrl &&
      other.videoFingerprint == videoFingerprint &&
      other.writeAttempted == writeAttempted &&
      other.writePrivateCommunityId == writePrivateCommunityId;

  @override
  int get hashCode => Object.hash(
    postId,
    folder,
    videoStoragePath,
    videoUrl,
    videoFingerprint,
    writeAttempted,
    writePrivateCommunityId,
  );
}

const Object _keep = Object();

/// Everything the creator has decided about one reel, on its way to becoming a
/// community post. Immutable; every edit makes a new one.
///
/// Serialised whole to the draft store, which is why it holds paths rather
/// than bytes and a community *stamp* rather than the live community.
@immutable
class ReelDraft {
  const ReelDraft({
    required this.id,
    required this.createdAt,
    required this.updatedAt,
    this.video,
    this.trimStartMs = 0,
    this.trimEndMs,
    this.coverSource = ReelCoverSource.automatic,
    this.coverTimeMs,
    this.coverPath,
    this.originalSound = true,
    this.focalX,
    this.focalY,
    this.captions,
    this.caption = '',
    this.topic,
    this.community,
    this.context = '',
    this.ownWork = true,
    this.originalCreator = '',
    this.sourceOrganisation = '',
    this.rights,
    this.stage = ReelStage.media,
    this.upload,
  });

  static const _version = 1;

  final String id;
  final DateTime createdAt;

  /// The last-edited timestamp the drafts list shows.
  final DateTime updatedAt;

  // ── Media ────────────────────────────────────────────────────────────────

  final ReelVideo? video;

  /// Start of the selection, in the file's own time.
  final int trimStartMs;

  /// End of the selection; null runs to the end of the file.
  final int? trimEndMs;

  final ReelCoverSource coverSource;

  /// The frame the cover was taken from; null for an uploaded picture.
  final int? coverTimeMs;

  /// The cover as a small JPEG (or the uploaded picture), inside the draft's
  /// folder. Every surface that needs a still uses this, never the video.
  final String? coverPath;

  final bool originalSound;

  /// Where Explore should keep in view when it crops, as fractions of the
  /// frame. Null is the centre.
  final double? focalX;
  final double? focalY;

  final CaptionTrack? captions;

  // ── Story ────────────────────────────────────────────────────────────────

  /// The public caption, line breaks and all.
  final String caption;
  final ReelTopic? topic;
  final PostCommunityStamp? community;

  /// "What is happening?"
  final String context;
  final bool ownWork;
  final String originalCreator;
  final String sourceOrganisation;
  final ReelRights? rights;

  // ── Progress ─────────────────────────────────────────────────────────────

  /// The stage the creator was on, so a resumed draft opens where they were.
  final ReelStage stage;
  final ReelUploadRecord? upload;

  // ── Derived ──────────────────────────────────────────────────────────────

  Duration get trimStart => Duration(milliseconds: trimStartMs);

  /// The end of the selection, clamped to the file.
  Duration get selectionEnd {
    final length = video?.duration ?? Duration.zero;
    final end = trimEndMs;
    if (end == null || end > length.inMilliseconds) return length;
    return Duration(milliseconds: end);
  }

  Duration get selectedDuration {
    final span = selectionEnd - trimStart;
    return span.isNegative ? Duration.zero : span;
  }

  bool get isTrimmed {
    final video = this.video;
    if (video == null) return false;
    return trimStartMs > 0 ||
        (trimEndMs != null && trimEndMs! < video.durationMs);
  }

  FocalPoint? get focalPoint => focalX == null || focalY == null
      ? null
      : (x: focalX!.clamp(0.0, 1.0), y: focalY!.clamp(0.0, 1.0));

  /// Whether there is anything worth keeping as a draft.
  bool get hasContent =>
      video != null ||
      caption.trim().isNotEmpty ||
      context.trim().isNotEmpty ||
      topic != null ||
      rights != null ||
      community != null ||
      sourceOrganisation.trim().isNotEmpty ||
      (captions?.cues.isNotEmpty ?? false);

  /// The declaration stored on the post, once topic and rights are chosen.
  ReelPostDetails? get details {
    final topic = this.topic;
    final rights = this.rights;
    if (topic == null || rights == null) return null;
    return ReelPostDetails(
      topic: topic,
      rights: rights,
      context: context.trim(),
      originalCreator: originalCreator.trim(),
      sourceOrganisation: sourceOrganisation.trim(),
      ownWork: ownWork,
      draftId: id,
    );
  }

  /// A copy with the given changes. Nullable fields take [_keep] by default so
  /// they can also be set back to null.
  ReelDraft copyWith({
    DateTime? updatedAt,
    Object? video = _keep,
    int? trimStartMs,
    Object? trimEndMs = _keep,
    ReelCoverSource? coverSource,
    Object? coverTimeMs = _keep,
    Object? coverPath = _keep,
    bool? originalSound,
    Object? focalX = _keep,
    Object? focalY = _keep,
    Object? captions = _keep,
    String? caption,
    Object? topic = _keep,
    Object? community = _keep,
    String? context,
    bool? ownWork,
    String? originalCreator,
    String? sourceOrganisation,
    Object? rights = _keep,
    ReelStage? stage,
    Object? upload = _keep,
  }) {
    T? pick<T>(Object? value, T? current) =>
        identical(value, _keep) ? current : value as T?;
    return ReelDraft(
      id: id,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      video: pick<ReelVideo>(video, this.video),
      trimStartMs: trimStartMs ?? this.trimStartMs,
      trimEndMs: pick<int>(trimEndMs, this.trimEndMs),
      coverSource: coverSource ?? this.coverSource,
      coverTimeMs: pick<int>(coverTimeMs, this.coverTimeMs),
      coverPath: pick<String>(coverPath, this.coverPath),
      originalSound: originalSound ?? this.originalSound,
      focalX: pick<double>(focalX, this.focalX),
      focalY: pick<double>(focalY, this.focalY),
      captions: pick<CaptionTrack>(captions, this.captions),
      caption: caption ?? this.caption,
      topic: pick<ReelTopic>(topic, this.topic),
      community: pick<PostCommunityStamp>(community, this.community),
      context: context ?? this.context,
      ownWork: ownWork ?? this.ownWork,
      originalCreator: originalCreator ?? this.originalCreator,
      sourceOrganisation: sourceOrganisation ?? this.sourceOrganisation,
      rights: pick<ReelRights>(rights, this.rights),
      stage: stage ?? this.stage,
      upload: pick<ReelUploadRecord>(upload, this.upload),
    );
  }

  Map<String, Object?> toJson() => {
    'version': _version,
    'id': id,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
    'video': ?video?.toJson(),
    'trimStartMs': trimStartMs,
    'trimEndMs': ?trimEndMs,
    'coverSource': coverSource.name,
    'coverTimeMs': ?coverTimeMs,
    'coverPath': ?coverPath,
    'originalSound': originalSound,
    'focalX': ?focalX,
    'focalY': ?focalY,
    'captions': ?captions?.toMap(),
    'caption': caption,
    'topic': ?topic?.wire,
    if (community case final stamp?)
      'community': {
        'id': stamp.id,
        'name': stamp.name,
        'isPrivate': stamp.isPrivate,
      },
    'context': context,
    'ownWork': ownWork,
    'originalCreator': originalCreator,
    'sourceOrganisation': sourceOrganisation,
    'rights': ?rights?.wire,
    'stage': stage.name,
    'upload': ?upload?.toJson(),
  };

  /// Null for anything that is not a draft this version can read.
  static ReelDraft? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'];
    final created = DateTime.tryParse('${raw['createdAt']}');
    final updated = DateTime.tryParse('${raw['updatedAt']}');
    if (id is! String || id.isEmpty || created == null || updated == null) {
      return null;
    }
    String text(String key) => raw[key] is String ? raw[key] as String : '';
    int? whole(String key) => raw[key] is num && (raw[key] as num) >= 0
        ? (raw[key] as num).toInt()
        : null;
    double? fraction(String key) =>
        raw[key] is num ? (raw[key] as num).toDouble().clamp(0.0, 1.0) : null;
    final community = raw['community'];
    return ReelDraft(
      id: id,
      createdAt: created,
      updatedAt: updated,
      video: ReelVideo.fromJson(raw['video']),
      trimStartMs: whole('trimStartMs') ?? 0,
      trimEndMs: whole('trimEndMs'),
      coverSource: ReelCoverSource.values.firstWhere(
        (source) => source.name == raw['coverSource'],
        orElse: () => ReelCoverSource.automatic,
      ),
      coverTimeMs: whole('coverTimeMs'),
      coverPath: raw['coverPath'] is String ? raw['coverPath'] as String : null,
      originalSound: raw['originalSound'] != false,
      focalX: fraction('focalX'),
      focalY: fraction('focalY'),
      captions: CaptionTrack.fromMap(raw['captions']),
      caption: text('caption'),
      topic: ReelTopic.fromWire(raw['topic']),
      community:
          community is Map &&
              community['id'] is String &&
              (community['id'] as String).isNotEmpty
          ? PostCommunityStamp(
              id: community['id'] as String,
              name: community['name'] is String
                  ? community['name'] as String
                  : community['id'] as String,
              isPrivate: community['isPrivate'] == true,
            )
          : null,
      context: text('context'),
      ownWork: raw['ownWork'] != false,
      originalCreator: text('originalCreator'),
      sourceOrganisation: text('sourceOrganisation'),
      rights: ReelRights.fromWire(raw['rights']),
      stage: ReelStage.values.firstWhere(
        (stage) => stage.name == raw['stage'],
        orElse: () => ReelStage.media,
      ),
      upload: ReelUploadRecord.fromJson(raw['upload']),
    );
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

/// The inputs a validation message can point at.
enum ReelField {
  video,
  trim,
  captions,
  caption,
  topic,
  community,
  context,
  originalCreator,
  sourceOrganisation,
  rights,
}

/// One thing standing between a draft and publishing, said the way the
/// creator can fix it.
@immutable
class ReelIssue {
  const ReelIssue(this.stage, this.field, this.message);

  final ReelStage stage;
  final ReelField field;
  final String message;

  @override
  bool operator ==(Object other) =>
      other is ReelIssue &&
      other.stage == stage &&
      other.field == field &&
      other.message == message;

  @override
  int get hashCode => Object.hash(stage, field, message);

  @override
  String toString() => 'ReelIssue(${stage.name}.${field.name}: $message)';
}

/// What is wrong with the media stage.
List<ReelIssue> reelMediaIssues(ReelDraft draft, ReelLimits limits) {
  const stage = ReelStage.media;
  final video = draft.video;
  if (video == null) {
    return const [
      ReelIssue(stage, ReelField.video, 'Record or choose a video first.'),
    ];
  }
  final issues = <ReelIssue>[];
  if (unsupportedVideoMessage(video.fileName) case final message?) {
    issues.add(ReelIssue(stage, ReelField.video, message));
  }
  if (video.sizeBytes > limits.maxBytes) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.video,
        'This video is ${formatReelBytes(video.sizeBytes)}; the limit is '
        '${formatReelBytes(limits.maxBytes)}. Trimming does not shrink the '
        'file, so record a shorter clip or choose a smaller one.',
      ),
    );
  }
  if (video.durationMs <= 0) {
    issues.add(
      const ReelIssue(
        stage,
        ReelField.video,
        "This video's length could not be read. Choose it again or pick "
        'another video.',
      ),
    );
    return issues;
  }
  final end = draft.trimEndMs;
  if (end != null && end <= draft.trimStartMs) {
    issues.add(
      const ReelIssue(
        stage,
        ReelField.trim,
        'The end of your selection must come after its start.',
      ),
    );
  } else if (draft.selectedDuration < limits.minDuration) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.trim,
        'Keep at least ${limits.minDuration.inSeconds} second'
        '${limits.minDuration.inSeconds == 1 ? '' : 's'} of video.',
      ),
    );
  } else if (draft.selectedDuration > limits.maxDuration) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.trim,
        'Your selection is ${formatReelClock(draft.selectedDuration)}. Trim it '
        'to ${formatReelClock(limits.maxDuration)} or less.',
      ),
    );
  }
  final captions = draft.captions;
  if (captions != null && captions.cues.isNotEmpty && !captions.reviewed) {
    issues.add(
      const ReelIssue(
        stage,
        ReelField.captions,
        'Check your captions and confirm they match what is said, or remove '
        'them.',
      ),
    );
  }
  return issues;
}

/// What is wrong with the story stage. [joinedCommunityIds] is null while the
/// member's communities are still loading, which skips that one check — the
/// publisher asks the server again before anything is written.
List<ReelIssue> reelStoryIssues(
  ReelDraft draft,
  ReelLimits limits, {
  Set<String>? joinedCommunityIds,
}) {
  const stage = ReelStage.story;
  final issues = <ReelIssue>[];
  final caption = draft.caption;
  if (caption.isNotEmpty && caption.trim().isEmpty) {
    issues.add(
      const ReelIssue(
        stage,
        ReelField.caption,
        'A caption cannot be only spaces or blank lines. Write something or '
        'leave it empty.',
      ),
    );
  } else if (caption.trim().length > limits.maxCaptionLength) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.caption,
        'Captions can be up to ${limits.maxCaptionLength} characters; yours '
        'is ${caption.trim().length}.',
      ),
    );
  }
  if (draft.topic == null) {
    issues.add(
      const ReelIssue(
        stage,
        ReelField.topic,
        'Choose what this reel is about.',
      ),
    );
  }
  final community = draft.community;
  if (community != null &&
      joinedCommunityIds != null &&
      !joinedCommunityIds.contains(community.id)) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.community,
        'You are not an active member of ${community.name}. Choose another '
        'community or publish without one.',
      ),
    );
  }
  final context = draft.context.trim();
  if (context.length < limits.minContextLength) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.context,
        context.isEmpty
            ? 'Explain what is happening in this reel.'
            : 'Say a little more about what is happening — at least '
                  '${limits.minContextLength} characters.',
      ),
    );
  } else if (context.length > limits.maxContextLength) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.context,
        'Keep "What is happening?" to ${limits.maxContextLength} characters; '
        'yours is ${context.length}.',
      ),
    );
  }
  final creator = draft.originalCreator.trim();
  if (creator.isEmpty) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.originalCreator,
        draft.ownWork
            ? 'Add the name you want credited as the creator.'
            : 'Say who created this media.',
      ),
    );
  } else if (creator.length > limits.maxCreditLength) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.originalCreator,
        'Keep the creator name to ${limits.maxCreditLength} characters.',
      ),
    );
  }
  if (draft.sourceOrganisation.trim().length > limits.maxCreditLength) {
    issues.add(
      ReelIssue(
        stage,
        ReelField.sourceOrganisation,
        'Keep the source to ${limits.maxCreditLength} characters.',
      ),
    );
  }
  final rights = draft.rights;
  if (rights == null) {
    issues.add(
      const ReelIssue(
        stage,
        ReelField.rights,
        'Confirm your right to publish this media.',
      ),
    );
  } else if (!draft.ownWork && rights == ReelRights.created) {
    issues.add(
      const ReelIssue(
        stage,
        ReelField.rights,
        'You said someone else created this media, so "I created this media" '
        'cannot be your declaration. Choose permission or lawful reuse.',
      ),
    );
  }
  return issues;
}

/// Everything standing between [draft] and publishing, media first.
List<ReelIssue> reelIssues(
  ReelDraft draft,
  ReelLimits limits, {
  Set<String>? joinedCommunityIds,
}) => [
  ...reelMediaIssues(draft, limits),
  ...reelStoryIssues(draft, limits, joinedCommunityIds: joinedCommunityIds),
];
