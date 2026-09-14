import 'dart:async';
import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_repository.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft_store.dart';

/// Where a publish is. Every phase is something that is really happening;
/// there is deliberately no "compressing", because nothing on the phone
/// compresses a video — see `clip_window.dart` and
/// `docs/product/reel-creation.md`.
enum ReelUploadPhase {
  idle,

  /// Checking the draft, the file and the community before anything is sent.
  preparing,

  /// Sending the video. Progress is the Storage task's own byte count.
  uploading,

  /// The creator paused the upload.
  paused,

  /// A publish that failed or was cancelled, starting again.
  retrying,

  /// The video is stored; the cover is going up and the post is being written.
  processing,

  complete,
  failed,
  cancelled,
}

@immutable
class ReelUploadState {
  const ReelUploadState({
    this.phase = ReelUploadPhase.idle,
    this.bytesSent = 0,
    this.totalBytes = 0,
    this.message,
    this.notices = const [],
    this.postId,
  });

  final ReelUploadPhase phase;
  final int bytesSent;
  final int totalBytes;

  /// Why it failed or stopped, for [ReelUploadPhase.failed] and
  /// [ReelUploadPhase.cancelled].
  final String? message;

  /// Things that went wrong without stopping the reel — a cover that did not
  /// upload, say — to tell the creator once it is live.
  final List<String> notices;

  /// The post, once published.
  final String? postId;

  /// Real progress through the video, or null when there is none to show.
  double? get fraction =>
      totalBytes > 0 &&
          (phase == ReelUploadPhase.uploading ||
              phase == ReelUploadPhase.paused)
      ? (bytesSent / totalBytes).clamp(0.0, 1.0)
      : null;

  /// Whether leaving the screen now would interrupt something.
  bool get isActive => const {
    ReelUploadPhase.preparing,
    ReelUploadPhase.uploading,
    ReelUploadPhase.paused,
    ReelUploadPhase.retrying,
    ReelUploadPhase.processing,
  }.contains(phase);

  bool get canPause => phase == ReelUploadPhase.uploading;
  bool get canResume => phase == ReelUploadPhase.paused;

  /// Once the post is being written it is too late to take it back cleanly.
  bool get canCancel => const {
    ReelUploadPhase.preparing,
    ReelUploadPhase.uploading,
    ReelUploadPhase.paused,
    ReelUploadPhase.retrying,
  }.contains(phase);

  ReelUploadState copyWith({
    ReelUploadPhase? phase,
    int? bytesSent,
    int? totalBytes,
    String? message,
    List<String>? notices,
    String? postId,
  }) => ReelUploadState(
    phase: phase ?? this.phase,
    bytesSent: bytesSent ?? this.bytesSent,
    totalBytes: totalBytes ?? this.totalBytes,
    message: message,
    notices: notices ?? this.notices,
    postId: postId ?? this.postId,
  );
}

/// A failure with a sentence the creator can act on.
class ReelPublishFailure implements Exception {
  const ReelPublishFailure(this.message, {this.cancelled = false});

  final String message;
  final bool cancelled;

  @override
  String toString() => message;
}

/// One file on its way to Storage.
abstract interface class ReelTransfer {
  /// Bytes sent and total, as Storage reports them.
  Stream<({int sent, int total})> get progress;

  /// Completes when the file is stored. Throws [ReelPublishFailure] — with
  /// `cancelled` set when [cancel] stopped it.
  Future<void> get done;

  Future<bool> pause();
  Future<bool> resume();
  Future<bool> cancel();
}

/// The server side of publishing a reel, behind a seam for tests.
abstract interface class ReelPublishBackend {
  String reservePostId();

  String folderFor({
    required String uid,
    required String postId,
    String? privateCommunityId,
  });

  ReelTransfer upload({
    required String storagePath,
    required String localPath,
    required String contentType,
    required String mediaType,
  });

  Future<String> downloadUrl(String storagePath);

  /// Best effort; never throws.
  Future<void> deleteFiles(List<String> storagePaths);

  Future<bool> postExists(String postId, {String? privateCommunityId});

  /// The community as it is now, if [uid] may still post in it. Throws
  /// [ReelPublishFailure] saying why not.
  Future<PostCommunityStamp> confirmCommunity(
    PostCommunityStamp community,
    String uid,
  );

  Future<void> writePost({
    required CommunityProfile author,
    required String postId,
    required String caption,
    required CommunityMedia media,
    required ReelPostDetails details,
    PostCommunityStamp? community,
  });
}

/// The outcome of one call to [ReelPublisher.publish].
@immutable
class ReelPublishResult {
  const ReelPublishResult({
    required this.draft,
    this.postId,
    this.busy = false,
  });

  /// The draft as it stands after the attempt — carrying its upload record,
  /// so a retry resumes where this one stopped.
  final ReelDraft draft;

  /// Set when the reel is live.
  final String? postId;

  /// True when another publish of this reel was already running and this call
  /// did nothing.
  final bool busy;

  bool get published => postId != null;
}

/// Publishes a [ReelDraft] as a community post, one step at a time, recording
/// each step in the draft store so an interrupted publish resumes and a
/// repeated one never makes a second post.
///
/// ── The order, and why ────────────────────────────────────────────────────
///  1. **Preparing** — validate the draft again, confirm the file is still on
///     the phone and the community still takes the member's posts, reserve a
///     post id and write it into the draft *before* sending a byte.
///  2. **Uploading** — the video, with real byte counts, pausable. Skipped when
///     the draft records that this exact file already reached this folder.
///  3. **Processing** — the cover, then the post document. The draft records
///     that a write was attempted just before it happens, because a write can
///     land even when the phone never hears back; the next attempt looks for
///     the post before writing another.
///  4. **Complete** — the draft and its files are deleted.
class ReelPublisher extends ChangeNotifier {
  ReelPublisher({
    required this.backend,
    required this.store,
    this.limits = ReelLimits.standard,
  });

  final ReelPublishBackend backend;
  final ReelDraftStore store;
  final ReelLimits limits;

  var _state = const ReelUploadState();
  ReelUploadState get state => _state;

  ReelTransfer? _transfer;
  StreamSubscription<({int sent, int total})>? _progress;
  var _running = false;
  var _cancelRequested = false;
  var _disposed = false;

  bool get isRunning => _running;

  void _set(ReelUploadState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  Future<ReelPublishResult> publish({
    required ReelDraft draft,
    required CommunityProfile author,
    Set<String>? joinedCommunityIds,
  }) async {
    // A second tap, or a retry fired while the first attempt is still going,
    // must not start a second upload of the same reel.
    if (_running) return ReelPublishResult(draft: draft, busy: true);
    _running = true;
    _cancelRequested = false;
    final retrying = const {
      ReelUploadPhase.failed,
      ReelUploadPhase.cancelled,
    }.contains(_state.phase);
    var current = draft;
    String? uploadedCover;
    try {
      _set(
        ReelUploadState(
          phase: retrying
              ? ReelUploadPhase.retrying
              : ReelUploadPhase.preparing,
        ),
      );

      final issues = reelIssues(
        current,
        limits,
        joinedCommunityIds: joinedCommunityIds,
      );
      if (issues.isNotEmpty) throw ReelPublishFailure(issues.first.message);
      final video = current.video!;
      final file = File(video.path);
      if (!await file.exists()) {
        throw const ReelPublishFailure(
          'The video for this reel is no longer on this phone. Go back to '
          'Media and choose it again.',
        );
      }
      final size = await file.length();
      if (size > limits.maxBytes) {
        throw ReelPublishFailure(
          'This video is ${formatReelBytes(size)}; the limit is '
          '${formatReelBytes(limits.maxBytes)}.',
        );
      }

      var record = current.upload;
      if (record != null && record.writeAttempted) {
        final landed = await _exists(
          record.postId,
          privateCommunityId: record.writePrivateCommunityId,
        );
        if (landed) return await _finish(current, record.postId, const []);
      }

      final community = current.community == null
          ? null
          : await backend.confirmCommunity(current.community!, author.uid);
      _checkCancelled();
      final privateId = community != null && community.isPrivate
          ? community.id
          : null;
      record ??= ReelUploadRecord(postId: backend.reservePostId());
      current = current.copyWith(upload: record, community: community);
      await store.save(current);

      final folder = backend.folderFor(
        uid: author.uid,
        postId: record.postId,
        privateCommunityId: privateId,
      );
      if (!record.hasVideo(video, folder)) {
        final stale = record.videoStoragePath;
        final stamp = DateTime.now().millisecondsSinceEpoch;
        final path = '$folder/0_${stamp}_${_safeName(video.fileName)}';
        _set(
          ReelUploadState(phase: ReelUploadPhase.uploading, totalBytes: size),
        );
        await _send(
          storagePath: path,
          localPath: video.path,
          contentType: video.contentType,
          mediaType: 'video',
          reportProgress: true,
        );
        final url = await _guard(
          () => backend.downloadUrl(path),
          'The video uploaded, but its link could not be read. Try again.',
        );
        record = record.copyWith(
          folder: folder,
          videoStoragePath: path,
          videoUrl: url,
          videoFingerprint: video.fingerprint,
        );
        current = current.copyWith(upload: record);
        await store.save(current);
        if (stale != null && stale != path) {
          unawaited(backend.deleteFiles([stale]));
        }
      }
      _checkCancelled();

      _set(const ReelUploadState(phase: ReelUploadPhase.processing));
      final notices = <String>[];
      String? thumbnailUrl;
      final coverPath = current.coverPath;
      if (coverPath != null && await File(coverPath).exists()) {
        final extension = coverPath.split('.').last.toLowerCase();
        final coverStorage =
            '$folder/0_poster_${DateTime.now().millisecondsSinceEpoch}'
            '.$extension';
        try {
          await _send(
            storagePath: coverStorage,
            localPath: coverPath,
            contentType: switch (extension) {
              'png' => 'image/png',
              'webp' => 'image/webp',
              'heic' => 'image/heic',
              _ => 'image/jpeg',
            },
            mediaType: 'image',
            reportProgress: false,
          );
          thumbnailUrl = await backend.downloadUrl(coverStorage);
          uploadedCover = coverStorage;
        } on ReelPublishFailure catch (failure) {
          if (failure.cancelled) rethrow;
          notices.add(
            'The cover could not be uploaded, so Explore will show a frame '
            'from the video instead.',
          );
        } on Object {
          notices.add(
            'The cover could not be uploaded, so Explore will show a frame '
            'from the video instead.',
          );
        }
      }

      final captions = current.captions?.normalised();
      final media = CommunityMedia(
        url: record.videoUrl!,
        type: 'video',
        storagePath: record.videoStoragePath!,
        thumbnailUrl: thumbnailUrl,
        aspectRatio: video.aspectRatio,
        durationSeconds: (current.selectedDuration.inMilliseconds / 1000)
            .round(),
        focalPoint: video.needsFraming ? current.focalPoint : null,
        trimStartMs: current.trimStartMs > 0 ? current.trimStartMs : null,
        trimEndMs:
            current.trimEndMs != null && current.trimEndMs! < video.durationMs
            ? current.trimEndMs
            : null,
        originalSound: current.originalSound,
        captions: captions != null && captions.isShowable ? captions : null,
      );

      record = record.copyWith(
        writeAttempted: true,
        writePrivateCommunityId: privateId,
      );
      current = current.copyWith(upload: record);
      await store.save(current);
      await _guard(
        () => backend.writePost(
          author: author,
          postId: record!.postId,
          caption: current.caption.trim(),
          media: media,
          details: current.details!,
          community: community,
        ),
        'The reel could not be published. Try again.',
      );
      return await _finish(current, record.postId, notices);
    } on ReelPublishFailure catch (failure) {
      if (uploadedCover != null) {
        unawaited(backend.deleteFiles([uploadedCover]));
      }
      _set(
        ReelUploadState(
          phase: failure.cancelled
              ? ReelUploadPhase.cancelled
              : ReelUploadPhase.failed,
          message: failure.cancelled
              ? 'Upload cancelled. Your draft is saved on this phone.'
              : failure.message,
        ),
      );
      return ReelPublishResult(draft: current);
    } finally {
      await _progress?.cancel();
      _progress = null;
      _transfer = null;
      _running = false;
    }
  }

  Future<ReelPublishResult> _finish(
    ReelDraft draft,
    String postId,
    List<String> notices,
  ) async {
    _set(
      ReelUploadState(
        phase: ReelUploadPhase.complete,
        postId: postId,
        notices: notices,
      ),
    );
    try {
      await store.delete(draft.id);
    } on Object catch (error) {
      debugPrint('Published reel draft not removed: $error');
    }
    return ReelPublishResult(draft: draft, postId: postId);
  }

  Future<bool> _exists(String postId, {String? privateCommunityId}) => _guard(
    () => backend.postExists(postId, privateCommunityId: privateCommunityId),
    'Could not check whether this reel was already published. Check your '
    'connection and try again.',
  );

  Future<void> _send({
    required String storagePath,
    required String localPath,
    required String contentType,
    required String mediaType,
    required bool reportProgress,
  }) async {
    _checkCancelled();
    final transfer = backend.upload(
      storagePath: storagePath,
      localPath: localPath,
      contentType: contentType,
      mediaType: mediaType,
    );
    _transfer = transfer;
    await _progress?.cancel();
    _progress = reportProgress
        ? transfer.progress.listen((progress) {
            if (_state.phase != ReelUploadPhase.uploading &&
                _state.phase != ReelUploadPhase.paused) {
              return;
            }
            _set(
              _state.copyWith(
                bytesSent: progress.sent,
                totalBytes: progress.total > 0
                    ? progress.total
                    : _state.totalBytes,
              ),
            );
          }, onError: (Object _) {})
        : null;
    try {
      await transfer.done;
    } finally {
      if (identical(_transfer, transfer)) _transfer = null;
    }
  }

  /// Runs [action], turning anything but a [ReelPublishFailure] into one that
  /// says [message].
  Future<T> _guard<T>(Future<T> Function() action, String message) async {
    try {
      return await action();
    } on ReelPublishFailure {
      rethrow;
    } on Object catch (error) {
      debugPrint('Reel publish step failed: $error');
      throw ReelPublishFailure(
        error is CommunityFailure ? error.message : message,
      );
    }
  }

  void _checkCancelled() {
    if (_cancelRequested) {
      throw const ReelPublishFailure('Upload cancelled.', cancelled: true);
    }
  }

  Future<void> pause() async {
    final transfer = _transfer;
    if (transfer == null || !_state.canPause) return;
    if (await transfer.pause()) {
      _set(_state.copyWith(phase: ReelUploadPhase.paused));
    }
  }

  Future<void> resume() async {
    final transfer = _transfer;
    if (transfer == null || !_state.canResume) return;
    if (await transfer.resume()) {
      _set(_state.copyWith(phase: ReelUploadPhase.uploading));
    }
  }

  /// Stops the publish at the next safe point. Files already stored stay
  /// recorded in the draft, so starting again does not resend them.
  Future<void> cancel() async {
    if (!_running || !_state.canCancel) return;
    _cancelRequested = true;
    final transfer = _transfer;
    if (transfer != null) await transfer.cancel();
  }

  /// Back to idle after a failure or cancellation has been read.
  void acknowledge() {
    if (_running) return;
    if (_state.phase == ReelUploadPhase.failed ||
        _state.phase == ReelUploadPhase.cancelled) {
      _set(const ReelUploadState());
    }
  }

  @override
  void dispose() {
    _disposed = true;
    if (_running) {
      _cancelRequested = true;
      unawaited(_transfer?.cancel());
    }
    super.dispose();
  }

  static String _safeName(String name) =>
      name.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
}

// ── Firebase ────────────────────────────────────────────────────────────────

final reelPublishBackendProvider = Provider<ReelPublishBackend?>((ref) {
  final repository = ref.watch(communityRepositoryProvider);
  if (repository == null) return null;
  return FirebaseReelPublishBackend(
    repository,
    ref.watch(communitySpaceRepositoryProvider),
  );
});

/// [ReelPublishBackend] over the community repositories, so a reel lands in
/// the same collections, Storage folders and rules as any other post.
class FirebaseReelPublishBackend implements ReelPublishBackend {
  const FirebaseReelPublishBackend(this._posts, this._spaces);

  final CommunityRepository _posts;
  final CommunitySpaceRepository? _spaces;

  @override
  String reservePostId() => _posts.reservePostId();

  @override
  String folderFor({
    required String uid,
    required String postId,
    String? privateCommunityId,
  }) => CommunityRepository.mediaFolder(
    uid: uid,
    postId: postId,
    privateCommunityId: privateCommunityId,
  );

  @override
  ReelTransfer upload({
    required String storagePath,
    required String localPath,
    required String contentType,
    required String mediaType,
  }) => _FirebaseTransfer(
    _posts,
    _posts.startFileUpload(
      storagePath: storagePath,
      file: File(localPath),
      contentType: contentType,
    ),
    mediaType,
  );

  @override
  Future<String> downloadUrl(String storagePath) =>
      _posts.downloadUrl(storagePath);

  @override
  Future<void> deleteFiles(List<String> storagePaths) async {
    try {
      await _posts.deleteStoragePaths(storagePaths);
    } on Object catch (error) {
      debugPrint('Reel upload cleanup skipped: $error');
    }
  }

  @override
  Future<bool> postExists(String postId, {String? privateCommunityId}) =>
      _posts.postExists(postId, privateCommunityId: privateCommunityId);

  @override
  Future<PostCommunityStamp> confirmCommunity(
    PostCommunityStamp community,
    String uid,
  ) async {
    final spaces = _spaces;
    if (spaces == null) {
      throw const ReelPublishFailure(
        'Communities are unavailable right now. Publish without one or try '
        'again later.',
      );
    }
    final CommunitySpace? space;
    final CommunityMembership? membership;
    try {
      space = await spaces.getCommunity(community.id);
      membership = await spaces.watchMembership(community.id, uid).first;
    } on FirebaseException catch (error) {
      debugPrint('Reel community check failed: $error');
      throw ReelPublishFailure(
        'Could not confirm your membership of ${community.name}. Check your '
        'connection and try again.',
      );
    }
    if (space == null || !space.isAvailable) {
      throw ReelPublishFailure(
        '${community.name} is no longer available. Choose another community '
        'or publish without one.',
      );
    }
    if (membership == null || !membership.isActive) {
      throw ReelPublishFailure(
        membership?.isPending ?? false
            ? 'Your request to join ${space.name} has not been approved yet. '
                  'Choose another community or publish without one.'
            : 'You are not a member of ${space.name}. Choose another '
                  'community or publish without one.',
      );
    }
    return PostCommunityStamp(
      id: space.id,
      name: space.name,
      isPrivate: space.isPrivate,
    );
  }

  @override
  Future<void> writePost({
    required CommunityProfile author,
    required String postId,
    required String caption,
    required CommunityMedia media,
    required ReelPostDetails details,
    PostCommunityStamp? community,
  }) async {
    try {
      await _posts.createPost(
        author: author,
        text: caption,
        postId: postId,
        uploadedMedia: [media],
        community: community,
        category: details.topic.postCategory,
        reel: details,
      );
    } on FirebaseException catch (error) {
      throw ReelPublishFailure(_posts.describeFailure(error));
    }
  }
}

class _FirebaseTransfer implements ReelTransfer {
  _FirebaseTransfer(this._posts, this._task, this._mediaType);

  final CommunityRepository _posts;
  final UploadTask _task;
  final String _mediaType;

  @override
  Stream<({int sent, int total})> get progress => _task.snapshotEvents.map(
    (snapshot) => (sent: snapshot.bytesTransferred, total: snapshot.totalBytes),
  );

  @override
  Future<void> get done async {
    try {
      await _task;
    } on FirebaseException catch (error) {
      if (error.code == 'canceled') {
        throw const ReelPublishFailure('Upload cancelled.', cancelled: true);
      }
      debugPrint('Reel upload refused (${error.code}): ${error.message}');
      throw ReelPublishFailure(
        _posts.describeUploadFailure(error, mediaType: _mediaType),
      );
    }
  }

  @override
  Future<bool> pause() => _task.pause();

  @override
  Future<bool> resume() => _task.resume();

  @override
  Future<bool> cancel() => _task.cancel();
}
