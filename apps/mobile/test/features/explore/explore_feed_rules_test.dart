// The rules that decide what reaches Explore and what a reel carries with it.
//
//   * Community posts arrive only by their video — never a picture, whatever
//     category it is filed under. A reshare is one reel, not two.
//   * Whatever the member hid — a reel, a creator, a community — stays hidden,
//     and muting a creator reaches their published work too.
//   * Following is the people followed and the communities joined.
//   * A reel keeps its provenance: source, community, dates, review status.
//   * The pager finds a reel again by its key when the list moves.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/explore_preferences.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_context_sheet.dart';
import 'package:indigen_world_mobile/features/explore/reel_overflow_menu.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

const _video = CommunityMedia(
  url: 'https://example.test/clip.mp4',
  type: 'video',
  aspectRatio: 9 / 16,
);
const _photo = CommunityMedia(
  url: 'https://example.test/photo.jpg',
  type: 'image',
  aspectRatio: 4 / 3,
  focalPoint: (x: 0.3, y: 0.4),
);

CommunityPost _post(
  String id, {
  List<CommunityMedia> media = const [_video],
  PostCategory? category,
  String author = 'afi',
  PostCommunityStamp? community,
  String? parentId,
}) => CommunityPost(
  id: id,
  authorId: author,
  authorName: 'Afi Mensah',
  authorUsername: 'afi',
  text: 'Drumming in Navrongo',
  media: media,
  likeCount: 0,
  replyCount: 0,
  category: category,
  community: community,
  parentId: parentId,
  createdAt: DateTime.utc(2026, 9, 12),
);

const _kasenaCulture = PostCommunityStamp(
  id: 'kasena-culture',
  name: 'Kasena Culture',
  isPrivate: false,
);

void main() {
  group('communityReels', () {
    test('community posts reach Explore by their video, never a picture', () {
      final reels = communityReels([
        _post('clip'),
        _post('screenshot', media: const [_photo]),
        _post(
          'question',
          media: const [_photo],
          category: PostCategory.question,
        ),
        // A photograph filed under a cultural category is still a photograph.
        _post('weaving', media: const [_photo], category: PostCategory.culture),
        _post('tale', media: const [_photo], category: PostCategory.story),
        // A post with both is shown by its video.
        _post(
          'both',
          media: const [_photo, _video],
          category: PostCategory.music,
        ),
        _post('text-only', media: const []),
      ], limit: 30);
      expect(reels.map((reel) => reel.id), [
        'community:clip',
        'community:both',
      ]);
      expect(reels.every((reel) => reel.isVideo), isTrue);
      expect(reels.any((reel) => reel.isImage), isFalse);
    });

    test('a reply is never a reel, and a reshare is one reel', () {
      final reels = communityReels([
        _post('clip'),
        _post('clip'),
        _post('reply', parentId: 'clip'),
      ], limit: 30);
      expect(reels.map((reel) => reel.id), ['community:clip']);
    });

    test('a community reel carries its community and provenance', () {
      final reel = communityReels([
        _post('clip', community: _kasenaCulture, category: PostCategory.story),
      ], limit: 1).single;
      expect(reel.community?.name, 'Kasena Culture');
      expect(reel.categoryLabel, 'STORYTELLING');
      expect(reel.handle, 'afi');
      expect(reel.sourceLabel, 'Community post');
      expect(reel.createdAt, DateTime.utc(2026, 9, 12));
      expect(reel.communityPost?.id, 'clip');
      expect(reel.isReviewed, isFalse);
    });
  });

  group('published provenance', () {
    test('is read from the published record', () {
      final published = PublishedReel.fromMap('song-1', {
        'title': 'Harvest song',
        'creatorAttribution': {'creatorId': 'afi', 'displayName': 'Afi Mensah'},
        'mediaUrl': 'https://example.test/song.mp4',
        'mediaType': 'video',
        'category': 'oral-history',
        'language': 'xsm',
        'publicationRoute': 'reviewed',
        'sourceAttribution': 'Recorded with elders in Paga',
        'translations': ['a song for the harvest'],
        'tags': ['harvest'],
        'ageRating': '13+',
        'publishedAt': '2026-09-10T08:00:00.000Z',
        'lifecycle': {'createdAt': '2026-09-01T08:00:00.000Z'},
        'aspectRatio': 16 / 9,
        'focalPoint': {'x': 40, 'y': 60},
      });
      final reel = Reel.fromPublished(published);
      expect(reel.categoryLabel, 'ORAL HISTORY');
      expect(reel.languageLabel, 'Kasem');
      expect(reel.isReviewed, isTrue);
      expect(reel.sourceAttribution, 'Recorded with elders in Paga');
      expect(reel.translations, ['a song for the harvest']);
      expect(reel.ageRating, '13+');
      expect(reel.createdAt, DateTime.utc(2026, 9, 1, 8));
      expect(reel.publishedAt, DateTime.utc(2026, 9, 10, 8));
      expect(reel.mediaAspectRatio, closeTo(16 / 9, 1e-9));
      expect(reel.focalPoint, (x: 0.4, y: 0.6));
      expect(reel.sourceLabel, 'Published archive');
      expect(reel.credit, isNotEmpty);
    });
  });

  group('withoutHidden', () {
    final reels = [
      ...communityReels([
        _post('a', author: 'afi'),
        _post('b', author: 'nyaaba', community: _kasenaCulture),
        _post('c', author: 'kofi'),
      ], limit: 10),
    ];

    test('drops reels, creators and communities the member hid', () {
      expect(
        withoutHidden(
          reels,
          hidden: const ExploreHiddenState(reelIds: {'community:a'}),
        ).map((reel) => reel.id),
        ['community:b', 'community:c'],
      );
      expect(
        withoutHidden(
          reels,
          hidden: const ExploreHiddenState(communityIds: {'kasena-culture'}),
        ).map((reel) => reel.id),
        ['community:a', 'community:c'],
      );
      expect(
        withoutHidden(
          reels,
          hidden: const ExploreHiddenState(),
          silencedCreators: const {'kofi'},
        ).map((reel) => reel.id),
        ['community:a', 'community:b'],
      );
    });
  });

  group('Following', () {
    test('includes the public posts of joined communities', () async {
      final container = ProviderContainer(
        overrides: [
          publishedReelsProvider.overrideWith(
            (ref) => Stream.value(const <PublishedReel>[]),
          ),
          followingIdsProvider.overrideWith(
            (ref) => Stream.value(const <String>[]),
          ),
          myMembershipsProvider.overrideWith(
            (ref) => Stream.value(const [
              CommunityMembership(
                communityId: 'kasena-culture',
                uid: 'me',
                role: CommunityRole.member,
                status: MembershipStatus.active,
              ),
            ]),
          ),
          communityFeedProvider.overrideWithValue(
            AsyncValue.data([
              _post('in-community', author: 'x', community: _kasenaCulture),
              _post('elsewhere', author: 'y'),
            ]),
          ),
          followingFeedProvider.overrideWithValue(
            const AsyncValue.data(<CommunityPost>[]),
          ),
        ],
      );
      addTearDown(container.dispose);
      container.listen(exploreFollowingFeedProvider, (_, _) {});
      for (var turn = 0; turn < 6; turn++) {
        await Future<void>.delayed(Duration.zero);
      }
      expect(
        container.read(exploreFollowingFeedProvider).map((reel) => reel.id),
        ['community:in-community'],
      );
    });
  });

  group('the pager keys', () {
    Reel reel(String id, {int cycle = 0}) => Reel(
      id: id,
      imageUrl: '',
      label: '',
      title: id,
      creator: 'c',
      initials: 'C',
      caption: '',
      sound: '',
      credit: '',
      isLive: true,
      cycle: cycle,
    );

    test('find a reel again after the list moves', () {
      final before = [reel('a'), reel('b'), reel('c')];
      final after = [reel('new'), reel('a'), reel('b'), reel('c')];
      expect(reelIndexNear(after, before[1], 1), 2);
    });

    test('a repeat on a later pass is a different page', () {
      expect(
        reelPageKey(reel('a'), 0),
        isNot(reelPageKey(reel('a', cycle: 1), 30)),
      );
    });

    test('adverts are keyed by position, so two slots never collide', () {
      final ad = Reel.fromServedAd(
        const ServedAd(
          campaignId: 'drums',
          headline: 'Drums',
          body: '',
          creativeUrl: '',
          mediaType: 'image',
          placements: [AdPlacement.explore],
        ),
      );
      expect(reelPageKey(ad, 3), isNot(reelPageKey(ad, 9)));
      expect(reelIndexNear([ad], ad, 0), 0);
    });

    test('a reel that is gone is not found', () {
      expect(reelIndexNear([reel('x')], reel('a'), 0), isNull);
    });
  });

  group('reports', () {
    test('are filed under an id a moderator can tell apart', () {
      final community = communityReels([_post('p1')], limit: 1).single;
      expect(reelReportId(community), 'p1');
      final published = Reel.fromPublished(
        const PublishedReel(id: 'song', title: 'Song', creatorName: 'Afi'),
      );
      expect(reelReportId(published), 'published:song');
    });
  });

  group('translation and pronunciation', () {
    DictionaryEntry entry(String headword, String meaning) => DictionaryEntry(
      id: headword,
      headword: headword,
      partOfSpeech: 'noun',
      translation: meaning,
      pronunciation: '',
      example: '',
      exampleTranslation: '',
      dialect: '',
      attribution: '',
      audioUrl: 'https://example.test/$headword.m4a',
    );

    final index = {
      'zaanem': [entry('zaanem', 'today')],
      'kasem': [entry('Kasem', 'the Kasem language')],
    };

    test('finds each known word once, in reading order', () {
      final matches = reelWordMatches(
        'Zaanem, we sing in Kasem. Zaanem!',
        index,
      );
      expect(matches.map((match) => match.word), ['Zaanem', 'Kasem']);
      expect(matches.first.senses.single.audioUrl, isNotEmpty);
    });

    test('a translation is offered only when there is one to give', () {
      const plain = Reel(
        id: 'r',
        imageUrl: '',
        label: '',
        title: 'Good morning',
        creator: 'c',
        initials: 'C',
        caption: 'Good morning',
        sound: '',
        credit: '',
      );
      expect(reelHasTranslation(plain, index), isFalse);
      const kasem = Reel(
        id: 'k',
        imageUrl: '',
        label: '',
        title: '',
        creator: 'c',
        initials: 'C',
        caption: 'Zaanem',
        sound: '',
        credit: '',
      );
      expect(reelHasTranslation(kasem, index), isTrue);
      const summarised = Reel(
        id: 's',
        imageUrl: '',
        label: '',
        title: '',
        creator: 'c',
        initials: 'C',
        caption: '',
        sound: '',
        credit: '',
        englishSummary: 'A harvest song.',
      );
      expect(reelHasTranslation(summarised, const {}), isTrue);
    });

    test('Kawuri is told to say when it is unsure', () {
      const reel = Reel(
        id: 'r',
        imageUrl: '',
        label: '',
        title: 'Harvest song',
        creator: 'c',
        initials: 'C',
        caption: 'Sung in Paga',
        sound: '',
        credit: '',
        culturalNotes: 'Sung at the end of the millet harvest.',
      );
      final prompt = reelExplanationPrompt(reel);
      expect(prompt, contains('not sure'));
      expect(prompt, contains('Harvest song'));
      expect(prompt, contains('millet harvest'));
    });
  });
}
