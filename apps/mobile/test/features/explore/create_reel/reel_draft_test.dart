import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';

import 'reel_test_fakes.dart';

void main() {
  const limits = ReelLimits.standard;

  List<String> messages(List<ReelIssue> issues) => [
    for (final issue in issues) issue.message,
  ];

  group('limits', () {
    test('come from the recorder, the storage rule and the post rules', () {
      expect(limits.maxDuration, const Duration(minutes: 3));
      expect(limits.maxBytes, 128 * 1024 * 1024);
      expect(limits.maxCaptionLength, 500);
    });
  });

  group('JSON', () {
    test('a complete draft survives a round trip', () {
      final draft =
          completeTestDraft(
            community: const PostCommunityStamp(
              id: 'paga-elders',
              name: 'Paga elders',
              isPrivate: true,
            ),
          ).copyWith(
            trimStartMs: 1500,
            trimEndMs: 20000,
            coverSource: ReelCoverSource.frame,
            coverTimeMs: 4200,
            originalSound: false,
            focalX: 0.3,
            focalY: 0.6,
            captions: const CaptionTrack(
              language: 'xsm',
              source: CaptionSource.uploaded,
              reviewed: true,
              cues: [CaptionCue(startMs: 1500, endMs: 3000, text: 'Hello')],
            ),
            ownWork: false,
            originalCreator: 'Elder Awia',
            sourceOrganisation: 'Paga archive',
            rights: ReelRights.permission,
            upload: const ReelUploadRecord(
              postId: 'post_9',
              folder: 'community-media/u/post_9',
              videoStoragePath: 'community-media/u/post_9/0_v.mp4',
              videoUrl: 'https://storage.test/v.mp4',
              videoFingerprint: 'dance.mp4|1|2',
              writeAttempted: true,
              writePrivateCommunityId: 'paga-elders',
            ),
          );
      final restored = ReelDraft.fromJson(draft.toJson())!;
      expect(restored.toJson(), draft.toJson());
      expect(restored.community?.isPrivate, isTrue);
      expect(restored.captions?.cues.single.text, 'Hello');
      expect(restored.upload, draft.upload);
    });

    test('a minimal draft survives a round trip', () {
      final now = DateTime(2026, 9, 13);
      final draft = ReelDraft(id: 'reel_2', createdAt: now, updatedAt: now);
      final restored = ReelDraft.fromJson(draft.toJson())!;
      expect(restored.video, isNull);
      expect(restored.stage, ReelStage.media);
      expect(restored.ownWork, isTrue);
      expect(restored.hasContent, isFalse);
    });

    test('garbage is not a draft', () {
      expect(ReelDraft.fromJson(null), isNull);
      expect(ReelDraft.fromJson('reel'), isNull);
      expect(ReelDraft.fromJson({'id': 'x'}), isNull);
      expect(
        ReelDraft.fromJson({
          'id': '',
          'createdAt': '2026',
          'updatedAt': '2026',
        }),
        isNull,
      );
    });

    test('line breaks in the caption are kept', () {
      final draft = completeTestDraft();
      expect(ReelDraft.fromJson(draft.toJson())!.caption, contains('\n'));
    });
  });

  group('selection', () {
    test('an untrimmed clip selects the whole file', () {
      final draft = completeTestDraft();
      expect(draft.selectedDuration, const Duration(seconds: 42));
      expect(draft.isTrimmed, isFalse);
    });

    test('a trim narrows the selection and clamps to the file', () {
      final trimmed = completeTestDraft().copyWith(
        trimStartMs: 2000,
        trimEndMs: 12000,
      );
      expect(trimmed.selectedDuration, const Duration(seconds: 10));
      expect(trimmed.isTrimmed, isTrue);
      final overrun = completeTestDraft().copyWith(trimEndMs: 99000);
      expect(overrun.selectionEnd, const Duration(seconds: 42));
    });

    test('an end before the start selects nothing', () {
      final draft = completeTestDraft().copyWith(
        trimStartMs: 9000,
        trimEndMs: 4000,
      );
      expect(draft.selectedDuration, Duration.zero);
    });
  });

  group('media validation', () {
    test('a complete draft has no media issues', () {
      expect(reelMediaIssues(completeTestDraft(), limits), isEmpty);
    });

    test('no video', () {
      final now = DateTime(2026);
      final draft = ReelDraft(id: 'r', createdAt: now, updatedAt: now);
      expect(messages(reelMediaIssues(draft, limits)), [
        'Record or choose a video first.',
      ]);
    });

    test('unsupported type', () {
      final draft = completeTestDraft(
        video: testVideo(fileName: 'festival.avi'),
      );
      expect(
        messages(reelMediaIssues(draft, limits)).single,
        contains('.AVI videos cannot be published'),
      );
    });

    test('oversized file', () {
      final draft = completeTestDraft(
        video: testVideo(sizeBytes: 200 * 1024 * 1024),
      );
      expect(
        messages(reelMediaIssues(draft, limits)).single,
        contains('This video is 200 MB; the limit is 128 MB'),
      );
    });

    test('unreadable length', () {
      final draft = completeTestDraft(
        video: testVideo(duration: Duration.zero),
      );
      expect(
        messages(reelMediaIssues(draft, limits)).single,
        contains("length could not be read"),
      );
    });

    test('end at or before start', () {
      final draft = completeTestDraft().copyWith(
        trimStartMs: 5000,
        trimEndMs: 5000,
      );
      expect(messages(reelMediaIssues(draft, limits)), [
        'The end of your selection must come after its start.',
      ]);
    });

    test('shorter than a second', () {
      final draft = completeTestDraft().copyWith(
        trimStartMs: 5000,
        trimEndMs: 5600,
      );
      expect(messages(reelMediaIssues(draft, limits)), [
        'Keep at least 1 second of video.',
      ]);
    });

    test('longer than the limit', () {
      final draft = completeTestDraft(
        video: testVideo(duration: const Duration(minutes: 4, seconds: 12)),
      );
      expect(messages(reelMediaIssues(draft, limits)), [
        'Your selection is 4:12. Trim it to 3:00 or less.',
      ]);
    });

    test('a trimmed long clip is fine', () {
      final draft = completeTestDraft(
        video: testVideo(duration: const Duration(minutes: 10)),
      ).copyWith(trimStartMs: 60000, trimEndMs: 200000);
      expect(reelMediaIssues(draft, limits), isEmpty);
    });

    test('captions not yet checked', () {
      final draft = completeTestDraft().copyWith(
        captions: const CaptionTrack(
          language: 'en',
          cues: [CaptionCue(startMs: 0, endMs: 900, text: 'Hi')],
        ),
      );
      expect(
        messages(reelMediaIssues(draft, limits)).single,
        startsWith('Check your captions'),
      );
    });
  });

  group('story validation', () {
    test('a complete draft has no story issues', () {
      expect(
        reelStoryIssues(
          completeTestDraft(),
          limits,
          joinedCommunityIds: const {},
        ),
        isEmpty,
      );
    });

    test('an empty caption is allowed, a blank one is not', () {
      expect(
        reelStoryIssues(completeTestDraft().copyWith(caption: ''), limits),
        isEmpty,
      );
      expect(
        messages(
          reelStoryIssues(
            completeTestDraft().copyWith(caption: ' \n  '),
            limits,
          ),
        ).single,
        startsWith('A caption cannot be only spaces'),
      );
    });

    test('caption too long', () {
      final draft = completeTestDraft().copyWith(caption: 'a' * 501);
      expect(
        messages(reelStoryIssues(draft, limits)).single,
        'Captions can be up to 500 characters; yours is 501.',
      );
    });

    test('missing topic', () {
      final draft = completeTestDraft().copyWith(topic: null);
      expect(messages(reelStoryIssues(draft, limits)), [
        'Choose what this reel is about.',
      ]);
    });

    test('a community the member is not in', () {
      final draft = completeTestDraft(
        community: const PostCommunityStamp(
          id: 'paga-elders',
          name: 'Paga elders',
          isPrivate: true,
        ),
      );
      expect(
        messages(reelStoryIssues(draft, limits, joinedCommunityIds: {'other'}))
            .single,
        startsWith('You are not an active member of Paga elders'),
      );
      expect(
        reelStoryIssues(draft, limits, joinedCommunityIds: {'paga-elders'}),
        isEmpty,
      );
      // Still loading: the server is asked again before publishing.
      expect(reelStoryIssues(draft, limits), isEmpty);
    });

    test('context missing, short and long', () {
      expect(
        messages(
          reelStoryIssues(completeTestDraft().copyWith(context: ''), limits),
        ),
        ['Explain what is happening in this reel.'],
      );
      expect(
        messages(
          reelStoryIssues(
            completeTestDraft().copyWith(context: 'Dance'),
            limits,
          ),
        ).single,
        contains('at least 10 characters'),
      );
      expect(
        messages(
          reelStoryIssues(
            completeTestDraft().copyWith(context: 'x' * 1001),
            limits,
          ),
        ).single,
        contains('1000 characters; yours is 1001'),
      );
    });

    test('creator missing, in both voices', () {
      expect(
        messages(
          reelStoryIssues(
            completeTestDraft().copyWith(originalCreator: ' '),
            limits,
          ),
        ),
        ['Add the name you want credited as the creator.'],
      );
      expect(
        messages(
          reelStoryIssues(
            completeTestDraft().copyWith(
              originalCreator: '',
              ownWork: false,
              rights: ReelRights.permission,
            ),
            limits,
          ),
        ),
        ['Say who created this media.'],
      );
    });

    test('rights missing', () {
      expect(
        messages(
          reelStoryIssues(completeTestDraft().copyWith(rights: null), limits),
        ),
        ['Confirm your right to publish this media.'],
      );
    });

    test('"I created this" is refused for someone else\'s work', () {
      final draft = completeTestDraft().copyWith(ownWork: false);
      expect(
        messages(reelStoryIssues(draft, limits)).single,
        contains('cannot be your declaration'),
      );
    });
  });

  group('helpers', () {
    test('file types', () {
      expect(unsupportedVideoMessage('clip.MP4'), isNull);
      expect(unsupportedVideoMessage('clip.mov'), isNull);
      expect(unsupportedVideoMessage('clip.3gp'), isNull);
      expect(unsupportedVideoMessage('clip'), isNull);
      expect(unsupportedVideoMessage('clip.mkv'), isNotNull);
      expect(reelFileExtension('/a/b.c/clip.WebM'), 'webm');
    });

    test('clocks and sizes', () {
      expect(formatReelClock(const Duration(seconds: 125)), '2:05');
      expect(formatReelClock(const Duration(hours: 1, seconds: 5)), '1:00:05');
      expect(formatReelPrecise(const Duration(milliseconds: 125450)), '2:05.4');
      expect(formatReelBytes(128 * 1024 * 1024), '128 MB');
      expect(formatReelBytes(3 * 1024 * 1024 + 512 * 1024), '3.5 MB');
      expect(formatReelBytes(900 * 1024), '900 KB');
    });

    test('details carry the declaration once topic and rights are chosen', () {
      final details = completeTestDraft().details!;
      expect(details.topic, ReelTopic.dance);
      expect(details.rights, ReelRights.created);
      expect(details.draftId, 'reel_1');
      expect(completeTestDraft().copyWith(rights: null).details, isNull);
    });
  });
}
