import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_media_tools.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_publisher.dart';

import 'reel_test_fakes.dart';

/// A store that keeps adopted files where they are, so the publisher's disk
/// checks see real files.
class _InPlaceStore extends FakeReelDraftStore {
  @override
  Future<String> adoptFile(
    String draftId,
    String sourcePath, {
    required String fileName,
  }) async => sourcePath;
}

Future<void> settle() async {
  for (var i = 0; i < 6; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
}

void main() {
  test('starts a blank draft crediting the member', () async {
    final editor = buildTestEditor();
    await editor.controller.start(creatorName: '  Ama Kasena ');
    final draft = editor.controller.draft;
    expect(editor.controller.isStarted, isTrue);
    expect(draft.video, isNull);
    expect(draft.originalCreator, 'Ama Kasena');
    expect(editor.controller.originalCreatorText.text, 'Ama Kasena');
    expect(editor.controller.stage, ReelStage.media);
    editor.controller.dispose();
  });

  test('backing out of the picker changes nothing', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    editor.tools.pickedPath = null;
    await editor.controller.pickVideo(record: true);
    expect(editor.tools.pickRequests, [true]);
    expect(editor.controller.draft.video, isNull);
    expect(editor.controller.mediaProblem, isNull);
    expect(editor.players, isEmpty);
    editor.controller.dispose();
  });

  test('an unusable file is explained, not adopted', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    editor.tools.probeProblem = const ReelMediaProblem(
      'This video is 200 MB; reels can be up to 128 MB.',
    );
    await editor.controller.pickVideo(record: false);
    expect(editor.controller.draft.video, isNull);
    expect(editor.controller.mediaProblem, contains('200 MB'));
    expect(editor.store.adopted, isEmpty);
    editor.controller.dispose();
  });

  test('a chosen clip gets a player, a timeline and a cover', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    await editor.controller.pickVideo(record: false);
    await settle();
    final controller = editor.controller;
    expect(controller.draft.video?.durationMs, 42000);
    expect(controller.player, same(editor.players.single));
    expect(
      controller.timeline,
      hasLength(ReelEditorController.timelineFrameCount),
    );
    expect(controller.timeline.every((frame) => frame != null), isTrue);
    expect(controller.draft.coverSource, ReelCoverSource.automatic);
    expect(controller.draft.coverPath, isNotNull);
    expect(editor.tools.coverRequests.first, 200);
    expect(editor.store.drafts[controller.draft.id]?.video, isNotNull);
    controller.dispose();
    expect(editor.players.single.disposed, isTrue);
  });

  test('replacing a clip releases the old player and files', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    await editor.controller.pickVideo(record: false);
    await settle();
    final firstVideo = editor.controller.draft.video!.path;
    final firstCover = editor.controller.draft.coverPath;
    await editor.controller.pickVideo(record: true);
    await settle();
    expect(editor.players, hasLength(2));
    expect(editor.players.first.disposed, isTrue);
    expect(editor.store.discarded, containsAll([firstVideo, firstCover]));
    editor.controller.dispose();
  });

  test('a clip longer than the limit starts trimmed to it', () async {
    final editor = buildTestEditor();
    editor.tools.probe = const ReelVideoProbe(
      fileName: 'long.mp4',
      sizeBytes: 50 * 1024 * 1024,
      contentType: 'video/mp4',
      durationMs: 300000,
      aspectRatio: 16 / 9,
    );
    await editor.controller.start();
    await editor.controller.pickVideo(record: false);
    expect(editor.controller.draft.trimEndMs, 180000);
    expect(editor.controller.notice?.message, contains('first 3:00'));
    expect(editor.controller.issuesFor(ReelStage.media), isEmpty);
    editor.controller.dispose();
  });

  test(
    'trim is clamped, can be reset, and moves the automatic cover',
    () async {
      final editor = buildTestEditor();
      await editor.controller.start();
      await editor.controller.pickVideo(record: false);
      await settle();
      final controller = editor.controller;
      controller.setTrim(
        start: const Duration(seconds: -3),
        end: const Duration(minutes: 9),
      );
      expect(controller.draft.trimStartMs, 0);
      expect(controller.draft.trimEndMs, isNull);
      controller.setTrim(
        start: const Duration(seconds: 5),
        end: const Duration(seconds: 20),
      );
      expect(controller.draft.selectedDuration, const Duration(seconds: 15));
      await Future<void>.delayed(const Duration(milliseconds: 600));
      await settle();
      expect(editor.tools.coverRequests.last, 5200);
      controller.resetTrim();
      expect(controller.draft.trimStartMs, 0);
      expect(controller.draft.selectedDuration, const Duration(seconds: 42));
      controller.dispose();
    },
  );

  test('cover choices: frame, picture, and back to automatic', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    await editor.controller.pickVideo(record: false);
    await settle();
    final controller = editor.controller;
    await controller.useFrameAsCover(const Duration(seconds: 7));
    expect(controller.draft.coverSource, ReelCoverSource.frame);
    expect(controller.draft.coverTimeMs, 7000);
    await controller.pickCoverImage();
    expect(controller.draft.coverSource, ReelCoverSource.image);
    expect(controller.draft.coverPath, endsWith('.png'));
    await controller.useAutomaticCover();
    expect(controller.draft.coverSource, ReelCoverSource.automatic);
    controller.dispose();
  });

  test('removing the original sound mutes the preview', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    await editor.controller.pickVideo(record: false);
    editor.controller.setOriginalSound(false);
    await settle();
    expect(editor.players.single.value.volume, 0);
    expect(editor.controller.draft.originalSound, isFalse);
    editor.controller.dispose();
  });

  test('moving forward stops at the first unfinished stage', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    final controller = editor.controller;
    expect(controller.goTo(ReelStage.review), isFalse);
    expect(controller.stage, ReelStage.media);
    expect(controller.hasAttempted(ReelStage.media), isTrue);
    expect(controller.issueFor(ReelField.video)?.message, contains('Record'));

    await controller.pickVideo(record: false);
    expect(controller.continueForward(), isTrue);
    expect(controller.stage, ReelStage.story);
    expect(controller.goTo(ReelStage.review), isFalse);
    expect(controller.stage, ReelStage.story);
    // Going back always works.
    expect(controller.goTo(ReelStage.media), isTrue);
    expect(controller.stage, ReelStage.media);
    controller.dispose();
  });

  test('saying someone else made it clears the pre-filled credit', () async {
    final editor = buildTestEditor();
    await editor.controller.start(creatorName: 'Ama');
    final controller = editor.controller;
    controller.setRights(ReelRights.created);
    controller.setOwnWork(false);
    expect(controller.draft.originalCreator, '');
    expect(controller.originalCreatorText.text, '');
    expect(controller.draft.rights, isNull);
    controller.setOwnWork(true);
    expect(controller.draft.originalCreator, 'Ama');
    controller.dispose();
  });

  test(
    'typed text reaches the draft and autosaves, empty drafts do not',
    () async {
      final editor = buildTestEditor(
        autosaveDelay: const Duration(milliseconds: 20),
      );
      await editor.controller.start();
      final controller = editor.controller;
      await Future<void>.delayed(const Duration(milliseconds: 40));
      expect(editor.store.saves, isEmpty);

      controller.captionText.text = 'Line one\nLine two';
      controller.contextText.text = 'Elders dancing at the harvest';
      expect(controller.draft.caption, 'Line one\nLine two');
      expect(controller.draft.context, 'Elders dancing at the harvest');
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect(
        editor.store.drafts[controller.draft.id]?.caption,
        'Line one\nLine two',
      );
      expect(controller.lastSavedAt, isNotNull);
      controller.dispose();
    },
  );

  test('a manual save of nothing says why', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    await editor.controller.saveDraft(manual: true);
    expect(editor.controller.notice?.message, contains('Add a video'));
    expect(editor.store.saves, isEmpty);
    editor.controller.dispose();
  });

  test('closing with an edit still pending writes it', () async {
    final editor = buildTestEditor(autosaveDelay: const Duration(seconds: 30));
    await editor.controller.start();
    editor.controller.captionText.text = 'Unsaved words';
    editor.controller.dispose();
    await settle();
    expect(editor.store.saves.last.caption, 'Unsaved words');
  });

  test(
    'resuming another draft swaps everything, text fields included',
    () async {
      final editor = buildTestEditor();
      final other = completeTestDraft(id: 'reel_other')
          .copyWith(video: null, caption: 'The other one');
      editor.store.drafts[other.id] = other;
      await editor.controller.start(creatorName: 'Ama');
      editor.controller.captionText.text = 'Current';
      expect((await editor.controller.otherDrafts()).map((draft) => draft.id), [
        'reel_other',
      ]);
      await editor.controller.resumeDraft('reel_other');
      expect(editor.controller.draft.id, 'reel_other');
      expect(editor.controller.captionText.text, 'The other one');
      expect(editor.controller.stage, ReelStage.review);
      expect(
        editor.store.drafts.values.where((draft) => draft.caption == 'Current'),
        hasLength(1),
        reason: 'the draft being left was saved first',
      );
      editor.controller.dispose();
    },
  );

  test('deleting the open draft starts a fresh one', () async {
    final editor = buildTestEditor();
    await editor.controller.start(creatorName: 'Ama');
    await editor.controller.pickVideo(record: false);
    final id = editor.controller.draft.id;
    await editor.controller.deleteDraft(id);
    expect(editor.store.deleted, contains(id));
    expect(editor.controller.draft.id, isNot(id));
    expect(editor.controller.draft.video, isNull);
    expect(editor.controller.player, isNull);
    editor.controller.dispose();
  });

  test('captions from a file arrive unchecked', () async {
    final editor = buildTestEditor();
    await editor.controller.start();
    await editor.controller.pickVideo(record: false);
    editor.tools.captionFile = (
      fileName: 'words.srt',
      text: '1\n00:00:01,000 --> 00:00:02,000\nHello\n',
    );
    await editor.controller.importCaptionFile();
    final captions = editor.controller.draft.captions!;
    expect(captions.source, CaptionSource.uploaded);
    expect(captions.reviewed, isFalse);
    expect(
      editor.controller.issuesFor(ReelStage.media).single.field,
      ReelField.captions,
    );
    editor.controller.dispose();
  });

  group('publishing', () {
    late Directory temp;

    setUp(() => temp = Directory.systemTemp.createTempSync('reel_editor_test'));
    tearDown(() => temp.deleteSync(recursive: true));

    Future<
      ({
        ReelEditorController controller,
        FakeReelPublishBackend backend,
        FakeReelDraftStore store,
      })
    >
    readyToPublish() async {
      final video = File('${temp.path}/clip.mp4')..writeAsBytesSync([1, 2, 3]);
      final tools = FakeReelMediaTools()..pickedPath = video.path;
      final editor = buildTestEditor(store: _InPlaceStore(), tools: tools);
      final controller = editor.controller;
      await controller.start(creatorName: 'Ama');
      await controller.pickVideo(record: false);
      controller
        ..setTopic(ReelTopic.food)
        ..setRights(ReelRights.created);
      controller.contextText.text =
          'Grandmother pounding fufu for the naming feast.';
      return (
        controller: controller,
        backend: editor.backend,
        store: editor.store,
      );
    }

    test('a problem sends the creator to the stage that has it', () async {
      final ready = await readyToPublish();
      final controller = ready.controller..setTopic(null);
      controller.goTo(ReelStage.media);
      expect(await controller.publish(testAuthor), isNull);
      expect(controller.stage, ReelStage.story);
      expect(controller.issueFor(ReelField.topic), isNotNull);
      expect(ready.backend.uploads, isEmpty);
      controller.dispose();
    });

    test('without a profile it asks for one', () async {
      final ready = await readyToPublish();
      expect(await ready.controller.publish(null), isNull);
      expect(ready.controller.notice?.message, contains('community profile'));
      ready.controller.dispose();
    });

    test('a published reel locks the editor and removes the draft', () async {
      final ready = await readyToPublish();
      final controller = ready.controller;
      final result = await controller.publish(testAuthor);
      expect(result?.published, isTrue);
      expect(controller.isPublished, isTrue);
      expect(controller.locked, isTrue);
      expect(ready.store.deleted, contains(controller.draft.id));
      expect(ready.backend.written.single.details.topic, ReelTopic.food);
      // Edits after publishing go nowhere.
      controller.setTopic(ReelTopic.music);
      expect(controller.draft.topic, ReelTopic.food);
      controller.dispose();
    });

    test('a failed publish keeps its record for the retry', () async {
      final ready = await readyToPublish();
      ready.backend.writeFailure = const ReelPublishFailure('Network problem.');
      final controller = ready.controller;
      final result = await controller.publish(testAuthor);
      expect(result?.published, isFalse);
      expect(controller.upload.phase, ReelUploadPhase.failed);
      expect(controller.locked, isFalse);
      expect(controller.draft.upload?.videoUrl, isNotNull);
      controller.dispose();
    });

    test('without Firebase the draft is kept and the reason given', () async {
      final editor = buildTestEditor(withPublisher: false);
      await editor.controller.start();
      await editor.controller.pickVideo(record: false);
      expect(await editor.controller.publish(testAuthor), isNull);
      expect(editor.controller.notice?.message, contains('draft is saved'));
      editor.controller.dispose();
    });
  });
}
