import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/explore/explore_topics.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

Map<String, dynamic> _postData({
  Map<String, Object?>? reel,
  Map<String, Object?>? media,
}) => {
  'authorId': 'uid-ama',
  'author': {'displayName': 'Ama Kasena', 'username': 'ama'},
  'text': 'Harvest dance',
  'media': [
    {
      'url': 'https://storage.test/v.mp4',
      'type': 'video',
      'storagePath': 'community-media/uid-ama/p/0_v.mp4',
      'thumbnailUrl': 'https://storage.test/poster.jpg',
      'aspectRatio': 0.5625,
      'durationSeconds': 30,
      ...?media,
    },
  ],
  'likeCount': 3,
  'replyCount': 1,
  'category': 'music',
  'reel': ?reel,
};

void main() {
  const details = ReelPostDetails(
    topic: ReelTopic.dance,
    rights: ReelRights.permission,
    context: 'Young people dancing at the harvest festival.',
    originalCreator: 'Elder Awia',
    sourceOrganisation: 'Paga archive',
    ownWork: false,
    draftId: 'reel_1',
  );

  group('CommunityMedia', () {
    test('reel choices survive a round trip', () {
      const media = CommunityMedia(
        url: 'https://storage.test/v.mp4',
        type: 'video',
        storagePath: 'p/v.mp4',
        aspectRatio: 16 / 9,
        durationSeconds: 12,
        focalPoint: (x: 0.25, y: 0.5),
        trimStartMs: 1500,
        trimEndMs: 13500,
        originalSound: false,
        captions: CaptionTrack(
          language: 'xsm',
          reviewed: true,
          cues: [CaptionCue(startMs: 1500, endMs: 3000, text: 'Hello')],
        ),
      );
      final restored = CommunityMedia.fromMap(media.toMap())!;
      expect(restored.trimStartMs, 1500);
      expect(restored.trimEndMs, 13500);
      expect(restored.originalSound, isFalse);
      expect(restored.focalPoint, (x: 0.25, y: 0.5));
      expect(restored.captions, media.captions);
      expect(restored.clipWindow?.start, const Duration(milliseconds: 1500));
    });

    test('an old media map reads exactly as before', () {
      final restored = CommunityMedia.fromMap({
        'url': 'https://storage.test/v.mp4',
        'type': 'video',
      })!;
      expect(restored.trimStartMs, isNull);
      expect(restored.clipWindow, isNull);
      expect(restored.originalSound, isTrue);
      expect(restored.captions, isNull);
      const plain = CommunityMedia(url: 'u', type: 'video');
      expect(plain.toMap().keys, isNot(contains('originalSound')));
      expect(plain.toMap().keys, isNot(contains('trimStartMs')));
    });
  });

  group('ReelPostDetails', () {
    test('round trip and attribution line', () {
      expect(ReelPostDetails.fromMap(details.toMap()), details);
      expect(
        details.attributionLine,
        'Created by Elder Awia · Source: Paga archive',
      );
      const own = ReelPostDetails(
        topic: ReelTopic.food,
        rights: ReelRights.created,
        originalCreator: 'Ama',
      );
      expect(own.attributionLine, '');
    });

    test('a declaration without rights is not one', () {
      expect(ReelPostDetails.fromMap({'topic': 'dance'}), isNull);
      expect(ReelPostDetails.fromMap('dance'), isNull);
    });

    test('topics file under the categories the feed already knows', () {
      expect(ReelTopic.storytelling.postCategory?.wire, 'story');
      expect(ReelTopic.history.postCategory?.wire, 'story');
      expect(ReelTopic.dance.postCategory?.wire, 'music');
      expect(ReelTopic.food.postCategory?.wire, 'culture');
      expect(ReelTopic.communityLife.wire, 'community_life');
      expect(ReelTopic.other.postCategory, isNull);
    });
  });

  group('Explore', () {
    test('an ordinary video post is unchanged', () {
      final post = CommunityPost.fromMap('p1', _postData());
      final reel = Reel.fromCommunityPost(post, post.media.first);
      expect(post.reel, isNull);
      expect(reel.label, 'MUSIC');
      expect(reel.categoryLabel, 'MUSIC');
      expect(reel.culturalNotes, '');
      expect(reel.sourceAttribution, '');
      expect(reel.credit, 'Posted by @ama in Community');
      expect(reel.sound, 'Original sound · @ama');
      expect(reel.clipWindow, isNull);
      expect(reel.playsOriginalSound, isTrue);
    });

    test('a reel carries its context, attribution and choices', () {
      final post = CommunityPost.fromMap(
        'p2',
        _postData(
          reel: details.toMap(),
          media: {
            'trimStartMs': 2000,
            'trimEndMs': 9000,
            'originalSound': false,
          },
        ),
      );
      final reel = Reel.fromCommunityPost(post, post.media.first);
      expect(reel.label, 'DANCE');
      expect(reel.categoryLabel, 'DANCE');
      expect(reel.culturalNotes, details.context);
      expect(reel.sourceAttribution, details.attributionLine);
      expect(reel.credit, "Published with the creator's permission");
      expect(reel.sound, 'No original sound · @ama');
      expect(reel.clipWindow?.end, const Duration(seconds: 9));
      expect(reel.playsOriginalSound, isFalse);
      // A replay keeps every choice.
      expect(reel.replayed(1).clipWindow, reel.clipWindow);
      // Dance is filed under music, so the Music topic finds it.
      expect(reelTopics(reel), contains(ExploreTopic.music));
    });
  });
}
