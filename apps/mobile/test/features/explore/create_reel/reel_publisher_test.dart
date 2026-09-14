import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_publisher.dart';

import 'reel_test_fakes.dart';

void main() {
  late Directory temp;
  late FakeReelDraftStore store;
  late FakeReelPublishBackend backend;
  late ReelPublisher publisher;

  /// A draft whose video and cover exist on disk, as the publisher checks.
  Future<ReelDraft> draftOnDisk({
    Duration duration = const Duration(seconds: 42),
    double aspectRatio = 9 / 16,
    bool withCover = true,
  }) async {
    final video = File('${temp.path}/video.mp4')
      ..writeAsBytesSync(List.filled(4096, 1));
    final cover = File('${temp.path}/cover.jpg')..writeAsBytesSync([1, 2, 3]);
    return completeTestDraft(
      video: testVideo(
        path: video.path,
        sizeBytes: 4096,
        duration: duration,
        aspectRatio: aspectRatio,
      ),
    ).copyWith(coverPath: withCover ? cover.path : null);
  }

  /// Waits for the publisher to reach [phase]; the file checks before an
  /// upload are real disk reads, which a microtask pump does not wait for.
  Future<void> untilPhase(ReelUploadPhase phase) async {
    for (var i = 0; i < 200 && publisher.state.phase != phase; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    expect(publisher.state.phase, phase);
  }

  setUp(() {
    temp = Directory.systemTemp.createTempSync('reel_publisher_test');
    store = FakeReelDraftStore();
    backend = FakeReelPublishBackend();
    publisher = ReelPublisher(backend: backend, store: store);
  });

  tearDown(() {
    publisher.dispose();
    temp.deleteSync(recursive: true);
  });

  test('publishes through every real phase and cleans up', () async {
    final phases = <ReelUploadPhase>[];
    final fractions = <double?>[];
    publisher.addListener(() {
      phases.add(publisher.state.phase);
      fractions.add(publisher.state.fraction);
    });
    late FakeTransfer video;
    backend.transferFor = (path) {
      if (path.contains('poster')) return FakeTransfer();
      return video = FakeTransfer(autoComplete: false);
    };

    final draft = (await draftOnDisk(
      aspectRatio: 16 / 9,
    )).copyWith(trimStartMs: 1200, trimEndMs: 31700, focalX: 0.3, focalY: 0.5);
    final publishing = publisher.publish(draft: draft, author: testAuthor);
    await untilPhase(ReelUploadPhase.uploading);
    video.report(1024, 4096);
    await pumpEventQueue();
    expect(publisher.state.fraction, 0.25);
    video
      ..report(4096, 4096)
      ..complete();
    final result = await publishing;

    expect(result.published, isTrue);
    expect(result.postId, 'post_1');
    expect(
      phases,
      containsAllInOrder([
        ReelUploadPhase.preparing,
        ReelUploadPhase.uploading,
        ReelUploadPhase.processing,
        ReelUploadPhase.complete,
      ]),
    );
    // Progress is only ever a number while bytes are moving.
    for (var i = 0; i < phases.length; i++) {
      if (phases[i] != ReelUploadPhase.uploading) expect(fractions[i], isNull);
    }

    final written = backend.written.single;
    expect(written.postId, 'post_1');
    expect(written.caption, 'Harvest dance in Navrongo\nSecond line');
    expect(written.details.topic, ReelTopic.dance);
    expect(written.details.draftId, draft.id);
    final media = written.media;
    expect(media.url, contains('community-media/uid-ama/post_1/0_'));
    expect(media.thumbnailUrl, contains('poster'));
    expect(media.aspectRatio, 16 / 9);
    expect(media.durationSeconds, 31); // 30.5 s selected, rounded
    expect(media.trimStartMs, 1200);
    expect(media.trimEndMs, 31700);
    expect(media.focalPoint, (x: 0.3, y: 0.5));
    expect(media.originalSound, isTrue);
    expect(store.deleted, [draft.id]);
  });

  test('an untrimmed portrait clip carries no trim or focal point', () async {
    final draft = (await draftOnDisk()).copyWith(focalX: 0.2, focalY: 0.2);
    await publisher.publish(draft: draft, author: testAuthor);
    final media = backend.written.single.media;
    expect(media.trimStartMs, isNull);
    expect(media.trimEndMs, isNull);
    expect(media.focalPoint, isNull);
  });

  test('only checked captions are published', () async {
    const cues = [CaptionCue(startMs: 0, endMs: 900, text: 'Hi')];
    final draft = (await draftOnDisk()).copyWith(
      captions: const CaptionTrack(language: 'xsm', cues: cues, reviewed: true),
      originalSound: false,
    );
    await publisher.publish(draft: draft, author: testAuthor);
    final media = backend.written.single.media;
    expect(media.captions?.cues, cues);
    expect(media.originalSound, isFalse);
  });

  test('a second publish while one runs does nothing', () async {
    backend.transferFor = (_) => FakeTransfer(autoComplete: false);
    final draft = await draftOnDisk();
    final first = publisher.publish(draft: draft, author: testAuthor);
    await untilPhase(ReelUploadPhase.uploading);
    final second = await publisher.publish(draft: draft, author: testAuthor);
    expect(second.busy, isTrue);
    expect(backend.uploads, hasLength(1));
    await publisher.cancel();
    await first;
  });

  test('a retry after a refused write does not send the video again', () async {
    backend.writeFailure = const ReelPublishFailure('Network problem.');
    final draft = await draftOnDisk();
    final failed = await publisher.publish(draft: draft, author: testAuthor);
    expect(failed.published, isFalse);
    expect(publisher.state.phase, ReelUploadPhase.failed);
    expect(publisher.state.message, 'Network problem.');
    expect(failed.draft.upload?.videoUrl, isNotNull);
    expect(failed.draft.upload?.writeAttempted, isTrue);
    expect(store.drafts[draft.id]?.upload?.postId, 'post_1');
    final videoUploads = backend.uploads.where((p) => !p.contains('poster'));
    expect(videoUploads, hasLength(1));
    // The half-published cover is not left behind.
    expect(backend.deletedFiles.single, contains('poster'));

    backend.writeFailure = null;
    final retried = await publisher.publish(
      draft: failed.draft,
      author: testAuthor,
    );
    expect(retried.published, isTrue);
    expect(
      backend.uploads.where((p) => !p.contains('poster')),
      hasLength(1),
      reason: 'the stored video is reused',
    );
    expect(backend.written.single.postId, 'post_1');
  });

  test('a write that landed unheard is found, not repeated', () async {
    final draft = (await draftOnDisk()).copyWith(
      upload: const ReelUploadRecord(
        postId: 'post_7',
        folder: 'community-media/uid-ama/post_7',
        videoStoragePath: 'community-media/uid-ama/post_7/0_v.mp4',
        videoUrl: 'https://storage.test/v.mp4',
        writeAttempted: true,
      ),
    );
    backend.existingPosts.add('post_7');
    final result = await publisher.publish(draft: draft, author: testAuthor);
    expect(result.postId, 'post_7');
    expect(backend.uploads, isEmpty);
    expect(backend.written, isEmpty);
    expect(publisher.state.phase, ReelUploadPhase.complete);
  });

  test('moving to a private community re-uploads into its folder', () async {
    const community = PostCommunityStamp(
      id: 'paga-elders',
      name: 'Paga elders',
      isPrivate: true,
    );
    final base = await draftOnDisk();
    final draft = base.copyWith(
      community: community,
      upload: ReelUploadRecord(
        postId: 'post_3',
        folder: 'community-media/uid-ama/post_3',
        videoStoragePath: 'community-media/uid-ama/post_3/0_old.mp4',
        videoUrl: 'https://storage.test/old.mp4',
        videoFingerprint: base.video!.fingerprint,
      ),
    );
    final result = await publisher.publish(
      draft: draft,
      author: testAuthor,
      joinedCommunityIds: {'paga-elders'},
    );
    expect(result.published, isTrue);
    expect(
      backend.uploads.first,
      startsWith('community-private-media/paga-elders/uid-ama/post_3/'),
    );
    expect(
      backend.deletedFiles,
      contains('community-media/uid-ama/post_3/0_old.mp4'),
    );
    expect(backend.written.single.community?.isPrivate, isTrue);
  });

  test('cancelling mid-upload keeps the draft and its reserved id', () async {
    backend.transferFor = (_) => FakeTransfer(autoComplete: false);
    final draft = await draftOnDisk();
    final publishing = publisher.publish(draft: draft, author: testAuthor);
    await untilPhase(ReelUploadPhase.uploading);
    expect(publisher.state.canCancel, isTrue);
    await publisher.cancel();
    final result = await publishing;
    expect(result.published, isFalse);
    expect(publisher.state.phase, ReelUploadPhase.cancelled);
    expect(publisher.state.message, contains('draft is saved'));
    expect(store.drafts[draft.id]?.upload?.postId, 'post_1');
    expect(store.deleted, isEmpty);
    expect(backend.written, isEmpty);
  });

  test('pause and resume are reflected in the phase', () async {
    late FakeTransfer video;
    backend.transferFor = (_) => video = FakeTransfer(autoComplete: false);
    final draft = await draftOnDisk(withCover: false);
    final publishing = publisher.publish(draft: draft, author: testAuthor);
    await untilPhase(ReelUploadPhase.uploading);
    await publisher.pause();
    expect(publisher.state.phase, ReelUploadPhase.paused);
    expect(video.paused, isTrue);
    await publisher.resume();
    expect(publisher.state.phase, ReelUploadPhase.uploading);
    video.complete();
    expect((await publishing).published, isTrue);
  });

  test('an upload refusal is said in the backend\'s words', () async {
    backend.transferFor = (_) => FakeTransfer(
      failure: const ReelPublishFailure('Videos cannot be uploaded right now.'),
    );
    final result = await publisher.publish(
      draft: await draftOnDisk(),
      author: testAuthor,
    );
    expect(result.published, isFalse);
    expect(publisher.state.message, 'Videos cannot be uploaded right now.');
  });

  test('a cover that fails still publishes, with a notice', () async {
    backend.transferFor = (path) => path.contains('poster')
        ? FakeTransfer(failure: const ReelPublishFailure('nope'))
        : FakeTransfer();
    final result = await publisher.publish(
      draft: await draftOnDisk(),
      author: testAuthor,
    );
    expect(result.published, isTrue);
    expect(backend.written.single.media.thumbnailUrl, isNull);
    expect(publisher.state.notices.single, contains('cover could not'));
  });

  test('a community that refuses the member stops before any upload', () async {
    backend.communityFailure = const ReelPublishFailure(
      'You are not a member of Paga elders.',
    );
    final draft = (await draftOnDisk()).copyWith(
      community: const PostCommunityStamp(
        id: 'paga-elders',
        name: 'Paga elders',
        isPrivate: true,
      ),
    );
    await publisher.publish(draft: draft, author: testAuthor);
    expect(publisher.state.message, 'You are not a member of Paga elders.');
    expect(backend.uploads, isEmpty);
  });

  test('an invalid draft is refused with its first problem', () async {
    final draft = (await draftOnDisk()).copyWith(rights: null);
    await publisher.publish(draft: draft, author: testAuthor);
    expect(publisher.state.phase, ReelUploadPhase.failed);
    expect(
      publisher.state.message,
      'Confirm your right to publish this media.',
    );
    expect(backend.uploads, isEmpty);
  });

  test('a video gone from the phone is said plainly', () async {
    final draft = completeTestDraft(
      video: testVideo(path: '${temp.path}/missing.mp4'),
    );
    await publisher.publish(draft: draft, author: testAuthor);
    expect(publisher.state.message, contains('no longer on this phone'));
  });

  test('a failed publish that is tried again says so', () async {
    backend.writeFailure = const ReelPublishFailure('Network problem.');
    final draft = await draftOnDisk();
    final failed = await publisher.publish(draft: draft, author: testAuthor);
    backend.writeFailure = null;
    final phases = <ReelUploadPhase>[];
    publisher.addListener(() => phases.add(publisher.state.phase));
    await publisher.publish(draft: failed.draft, author: testAuthor);
    expect(phases.first, ReelUploadPhase.retrying);
  });
}
