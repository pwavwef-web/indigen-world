import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft_store.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_media_tools.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_publisher.dart';
import 'package:video_player/video_player.dart';

/// Shared doubles for the reel creator's tests. Nothing here touches a
/// platform channel, the file system or Firebase.

const testAuthor = CommunityProfile(
  uid: 'uid-ama',
  username: 'ama',
  displayName: 'Ama Kasena',
);

/// A one-by-one JPEG, for timeline frames.
final testFrameBytes = Uint8List.fromList(const [
  0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x03, 0x02, 0x02, 0x02, 0x02, //
  0x02, 0x03, 0x02, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x04, 0x06, 0x04,
  0x04, 0x04, 0x04, 0x04, 0x08, 0x06, 0x06, 0x05, 0x06, 0x09, 0x08, 0x0A,
  0x0A, 0x09, 0x08, 0x09, 0x09, 0x0A, 0x0C, 0x0F, 0x0C, 0x0A, 0x0B, 0x0E,
  0x0B, 0x09, 0x09, 0x0D, 0x11, 0x0D, 0x0E, 0x0F, 0x10, 0x10, 0x11, 0x10,
  0x0A, 0x0C, 0x12, 0x13, 0x12, 0x10, 0x13, 0x0F, 0x10, 0x10, 0x10, 0xFF,
  0xC9, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xFF, 0xCC, 0x00, 0x06, 0x00, 0x10, 0x10, 0x05, 0xFF, 0xDA, 0x00, 0x08,
  0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xD2, 0xCF, 0x20, 0xFF, 0xD9,
]);

/// A video as the probe would describe it.
ReelVideo testVideo({
  String path = '/drafts/reel_1/video_1.mp4',
  String fileName = 'dance.mp4',
  int sizeBytes = 8 * 1024 * 1024,
  Duration duration = const Duration(seconds: 42),
  double aspectRatio = 9 / 16,
}) => ReelVideo(
  path: path,
  fileName: fileName,
  sizeBytes: sizeBytes,
  contentType: 'video/mp4',
  durationMs: duration.inMilliseconds,
  aspectRatio: aspectRatio,
);

/// A draft that passes every check.
ReelDraft completeTestDraft({
  String id = 'reel_1',
  ReelVideo? video,
  PostCommunityStamp? community,
}) {
  final now = DateTime(2026, 9, 13, 14, 5);
  return ReelDraft(
    id: id,
    createdAt: now,
    updatedAt: now,
    video: video ?? testVideo(),
    coverPath: '/drafts/reel_1/cover.jpg',
    caption: 'Harvest dance in Navrongo\nSecond line',
    topic: ReelTopic.dance,
    community: community,
    context: 'Young people dancing at the harvest festival in Navrongo.',
    originalCreator: 'Ama Kasena',
    rights: ReelRights.created,
    stage: ReelStage.review,
  );
}

/// [ReelDraftStore] in memory. Files are pretended: [existingFiles] decides
/// what `load` and `list` consider present.
class FakeReelDraftStore implements ReelDraftStore {
  final drafts = <String, ReelDraft>{};
  final discarded = <String>[];
  final adopted = <String>[];
  final saves = <ReelDraft>[];
  var deleted = <String>[];

  /// Completes each save only when released, when set.
  Completer<void>? saveGate;

  @override
  Future<List<ReelDraft>> list() async =>
      drafts.values.toList()
        ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));

  @override
  Future<ReelDraft?> load(String id) async => drafts[id];

  @override
  Future<void> save(ReelDraft draft) async {
    await saveGate?.future;
    saves.add(draft);
    drafts[draft.id] = draft;
  }

  @override
  Future<void> delete(String id) async {
    drafts.remove(id);
    deleted = [...deleted, id];
  }

  @override
  Future<String> adoptFile(
    String draftId,
    String sourcePath, {
    required String fileName,
  }) async {
    adopted.add(sourcePath);
    return '/drafts/$draftId/$fileName';
  }

  @override
  Future<String> pathFor(String draftId, String fileName) async =>
      '/drafts/$draftId/$fileName';

  @override
  Future<void> discardFile(String? path) async {
    if (path != null) discarded.add(path);
  }
}

/// [ReelMediaTools] that answers from fields a test sets.
class FakeReelMediaTools implements ReelMediaTools {
  /// What the picker returns: a path, or null for "backed out".
  String? pickedPath = '/cache/picked.mp4';

  /// What probing returns, or throws when [probeProblem] is set.
  ReelVideoProbe probe = const ReelVideoProbe(
    fileName: 'picked.mp4',
    sizeBytes: 8 * 1024 * 1024,
    contentType: 'video/mp4',
    durationMs: 42000,
    aspectRatio: 9 / 16,
  );
  ReelMediaProblem? probeProblem;

  String? recovered;
  String? coverImagePath = '/cache/cover.png';
  ReelCaptionFile? captionFile;
  ReelMediaProblem? captionProblem;
  var coverFramesFail = false;

  final pickRequests = <bool>[];
  final frameRequests = <int>[];
  final coverRequests = <int>[];

  @override
  Future<String?> pickVideo({required bool record}) async {
    pickRequests.add(record);
    return pickedPath;
  }

  @override
  Future<String?> recoverLostVideo() async => recovered;

  @override
  Future<ReelVideoProbe> probeVideo(String path, ReelLimits limits) async {
    final problem = probeProblem;
    if (problem != null) throw problem;
    return probe;
  }

  @override
  Future<Uint8List?> timelineFrame(String path, int timeMs) async {
    frameRequests.add(timeMs);
    return testFrameBytes;
  }

  @override
  Future<String?> writeCoverFrame({
    required String videoPath,
    required int timeMs,
    required String outputPath,
  }) async {
    coverRequests.add(timeMs);
    return coverFramesFail ? null : outputPath;
  }

  @override
  Future<String?> pickCoverImage() async => coverImagePath;

  @override
  Future<ReelCaptionFile?> pickCaptionFile(ReelLimits limits) async {
    final problem = captionProblem;
    if (problem != null) throw problem;
    return captionFile;
  }
}

/// A preview player that never touches a platform channel.
class FakePreviewController extends VideoPlayerController {
  FakePreviewController({
    this.duration = const Duration(seconds: 42),
    this.size = const Size(1080, 1920),
    this.fail = false,
  }) : super.networkUrl(Uri.parse('https://example.test/preview.mp4'));

  final Duration duration;
  final Size size;
  final bool fail;
  var disposed = false;
  final seeks = <Duration>[];

  @override
  Future<void> initialize() async {
    if (fail) throw Exception('No decoder for this clip');
    value = value.copyWith(isInitialized: true, duration: duration, size: size);
  }

  @override
  Future<void> play() async => value = value.copyWith(isPlaying: true);

  @override
  Future<void> pause() async => value = value.copyWith(isPlaying: false);

  @override
  Future<void> setLooping(bool looping) async =>
      value = value.copyWith(isLooping: looping);

  @override
  Future<void> setVolume(double volume) async =>
      value = value.copyWith(volume: volume);

  @override
  Future<void> seekTo(Duration position) async {
    seeks.add(position);
    value = value.copyWith(position: position);
  }

  @override
  Future<void> dispose() async {
    disposed = true;
    await super.dispose();
  }
}

/// A transfer a test drives by hand.
class FakeTransfer implements ReelTransfer {
  FakeTransfer({this.autoComplete = true, this.failure});

  final bool autoComplete;
  final ReelPublishFailure? failure;
  final _progress = StreamController<({int sent, int total})>.broadcast();
  final _done = Completer<void>();
  var paused = false;
  var cancelled = false;

  void report(int sent, int total) => _progress.add((sent: sent, total: total));

  void complete() {
    if (!_done.isCompleted) _done.complete();
  }

  void fail(ReelPublishFailure failure) {
    if (!_done.isCompleted) _done.completeError(failure);
  }

  @override
  Stream<({int sent, int total})> get progress => _progress.stream;

  @override
  Future<void> get done {
    if (autoComplete) {
      final failure = this.failure;
      if (failure != null) {
        fail(failure);
      } else {
        complete();
      }
    }
    return _done.future;
  }

  @override
  Future<bool> pause() async => paused = true;

  @override
  Future<bool> resume() async {
    paused = false;
    return true;
  }

  @override
  Future<bool> cancel() async {
    cancelled = true;
    fail(const ReelPublishFailure('Upload cancelled.', cancelled: true));
    return true;
  }
}

/// [ReelPublishBackend] recording every call.
class FakeReelPublishBackend implements ReelPublishBackend {
  var nextPostId = 'post_1';
  final existingPosts = <String>{};
  final uploads = <String>[];
  final deletedFiles = <String>[];
  final written =
      <
        ({
          String postId,
          CommunityMedia media,
          ReelPostDetails details,
          PostCommunityStamp? community,
          String caption,
        })
      >[];

  /// Builds the transfer for each upload; defaults to one that completes.
  FakeTransfer Function(String storagePath) transferFor = (_) => FakeTransfer();
  ReelPublishFailure? writeFailure;
  ReelPublishFailure? communityFailure;
  PostCommunityStamp? confirmedCommunity;
  final _transfers = <String, FakeTransfer>{};

  FakeTransfer? transferAt(String storagePathPrefix) {
    for (final entry in _transfers.entries) {
      if (entry.key.contains(storagePathPrefix)) return entry.value;
    }
    return null;
  }

  @override
  String reservePostId() => nextPostId;

  @override
  String folderFor({
    required String uid,
    required String postId,
    String? privateCommunityId,
  }) => privateCommunityId == null
      ? 'community-media/$uid/$postId'
      : 'community-private-media/$privateCommunityId/$uid/$postId';

  @override
  ReelTransfer upload({
    required String storagePath,
    required String localPath,
    required String contentType,
    required String mediaType,
  }) {
    uploads.add(storagePath);
    final transfer = transferFor(storagePath);
    _transfers[storagePath] = transfer;
    return transfer;
  }

  @override
  Future<String> downloadUrl(String storagePath) async =>
      'https://storage.test/$storagePath';

  @override
  Future<void> deleteFiles(List<String> storagePaths) async =>
      deletedFiles.addAll(storagePaths);

  @override
  Future<bool> postExists(String postId, {String? privateCommunityId}) async =>
      existingPosts.contains(postId);

  @override
  Future<PostCommunityStamp> confirmCommunity(
    PostCommunityStamp community,
    String uid,
  ) async {
    final failure = communityFailure;
    if (failure != null) throw failure;
    return confirmedCommunity ?? community;
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
    final failure = writeFailure;
    if (failure != null) throw failure;
    written.add((
      postId: postId,
      media: media,
      details: details,
      community: community,
      caption: caption,
    ));
    existingPosts.add(postId);
  }
}

/// A controller wired to fakes, with a fake preview player per opened path.
({
  ReelEditorController controller,
  FakeReelDraftStore store,
  FakeReelMediaTools tools,
  FakeReelPublishBackend backend,
  ReelPublisher publisher,
  List<FakePreviewController> players,
})
buildTestEditor({
  Duration autosaveDelay = const Duration(milliseconds: 800),
  bool withPublisher = true,
  FakeReelDraftStore? store,
  FakeReelMediaTools? tools,
  DateTime Function()? clock,
}) {
  final draftStore = store ?? FakeReelDraftStore();
  final mediaTools = tools ?? FakeReelMediaTools();
  final backend = FakeReelPublishBackend();
  final publisher = ReelPublisher(backend: backend, store: draftStore);
  final players = <FakePreviewController>[];
  final controller = ReelEditorController(
    store: draftStore,
    tools: mediaTools,
    openPreview: (path) {
      final player = FakePreviewController(
        duration: Duration(milliseconds: mediaTools.probe.durationMs),
      );
      players.add(player);
      return player;
    },
    publisher: withPublisher ? publisher : null,
    autosaveDelay: autosaveDelay,
    clock: clock,
  );
  return (
    controller: controller,
    store: draftStore,
    tools: mediaTools,
    backend: backend,
    publisher: publisher,
    players: players,
  );
}
