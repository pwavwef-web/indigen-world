// The rules behind the 0.1.37 community upgrades, without a screen in sight:
// what a muted word catches, where the "seen" line goes, how replies sort,
// what an event says about itself, and what a draft keeps.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_screen.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_local_prefs.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/event_reminders.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/community/data/post_event.dart';
import 'package:indigen_world_mobile/features/community/data/saved_drafts.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/send_post_sheet.dart';

import 'community_test_harness.dart';

void main() {
  group('muted words', () {
    test('a single word matches only as a whole word', () {
      final post = fakePost(text: 'Come to the party at the art centre');
      expect(mutedWordIn(post, ['art']), 'art');
      expect(mutedWordIn(post, ['par']), isNull);
      expect(mutedWordIn(fakePost(text: 'A partial view'), ['art']), isNull);
    });

    test('case and tone marks are set aside', () {
      final post = fakePost(text: 'Kasɛ́na history night');
      expect(mutedWordIn(post, ['KASENA']), 'KASENA');
    });

    test('a phrase matches anywhere, across runs of spaces', () {
      final post = fakePost(text: 'Big   news  today for everyone');
      expect(mutedWordIn(post, ['big news']), 'big news');
      expect(mutedWordIn(post, ['news big']), isNull);
    });

    test('poll choices count as the post', () {
      final post = fakePost(
        text: 'Which one?',
        poll: CommunityPoll(
          options: const [
            CommunityPollOption(id: 'a', text: 'Football'),
            CommunityPollOption(id: 'b', text: 'Music'),
          ],
          endsAt: DateTime(2030),
        ),
      );
      expect(mutedWordIn(post, ['football']), 'football');
    });

    test('an empty list or empty word mutes nothing', () {
      final post = fakePost(text: 'Anything at all');
      expect(mutedWordIn(post, const []), isNull);
      expect(mutedWordIn(post, const ['  ']), isNull);
    });
  });

  group('the seen-on-your-last-visit line', () {
    final lastSeen = DateTime.utc(2026, 10, 28, 12);
    CommunityPost at(String id, DateTime time) =>
        fakePost(id: id, createdAt: time);

    test('sits above the first post that was already there', () {
      final posts = [
        at('new1', DateTime.utc(2026, 10, 29, 9)),
        at('new2', DateTime.utc(2026, 10, 29, 8)),
        at('old1', DateTime.utc(2026, 10, 28, 11)),
        at('old2', DateTime.utc(2026, 10, 28, 10)),
        at('old3', DateTime.utc(2026, 10, 27, 10)),
      ];
      expect(caughtUpIndex(posts, lastSeen), 2);
    });

    test('is not drawn when everything is new, or everything is old', () {
      final fresh = [
        at('a', DateTime.utc(2026, 10, 29, 9)),
        at('b', DateTime.utc(2026, 10, 29, 8)),
      ];
      final stale = [
        at('c', DateTime.utc(2026, 10, 27, 9)),
        at('d', DateTime.utc(2026, 10, 27, 8)),
      ];
      expect(caughtUpIndex(fresh, lastSeen), isNull);
      expect(caughtUpIndex(stale, lastSeen), isNull);
      expect(caughtUpIndex(fresh, null), isNull);
    });

    test('is not fooled by one older post lifted among new ones', () {
      final posts = [
        at('new1', DateTime.utc(2026, 10, 29, 9)),
        at('lifted', DateTime.utc(2026, 10, 25, 9)),
        at('new2', DateTime.utc(2026, 10, 29, 7)),
        at('new3', DateTime.utc(2026, 10, 29, 6)),
        at('old1', DateTime.utc(2026, 10, 28, 1)),
        at('old2', DateTime.utc(2026, 10, 27, 1)),
        at('old3', DateTime.utc(2026, 10, 26, 1)),
      ];
      expect(caughtUpIndex(posts, lastSeen), 4);
    });
  });

  test('a community has news only after a visit, and only for later posts', () {
    final visit = DateTime.utc(2026, 10, 28);
    expect(
      communityHasNews(
        latestPost: DateTime.utc(2026, 10, 29),
        lastVisit: visit,
      ),
      isTrue,
    );
    expect(
      communityHasNews(
        latestPost: DateTime.utc(2026, 10, 27),
        lastVisit: visit,
      ),
      isFalse,
    );
    expect(
      communityHasNews(latestPost: DateTime.utc(2026, 10, 29), lastVisit: null),
      isFalse,
    );
    expect(communityHasNews(latestPost: null, lastVisit: visit), isFalse);
  });

  group('events', () {
    test('round-trip through Firestore and the draft store', () {
      final event = PostEvent(
        startsAt: DateTime(2026, 11, 14, 16, 30),
        place: 'Chief’s palace, Paga',
      );
      final stored = PostEvent.fromMap(event.toMap());
      expect(stored, event);
      expect(stored!.toMap()['startsAt'], isA<Timestamp>());
      expect(PostEvent.fromMap(event.toJson()), event);
      expect(PostEvent.fromMap({'place': 'Nowhere'}), isNull);
    });

    test('say how far off they are in calendar days', () {
      final now = DateTime(2026, 10, 29, 22);
      expect(
        eventCountdownLabel(DateTime(2026, 10, 29, 23), now: now),
        'Today',
      );
      // Eleven hours away, and still "Tomorrow".
      expect(
        eventCountdownLabel(DateTime(2026, 10, 30, 9), now: now),
        'Tomorrow',
      );
      expect(
        eventCountdownLabel(DateTime(2026, 11, 2, 9), now: now),
        'In 4 days',
      );
      expect(
        eventCountdownLabel(DateTime(2026, 11, 7, 9), now: now),
        'Next week',
      );
      expect(
        eventCountdownLabel(DateTime(2026, 10, 29, 21), now: now),
        'Happening now',
      );
      expect(eventCountdownLabel(DateTime(2026, 10, 28, 9), now: now), 'Ended');
    });

    test('ride along on a post, even when its count is redrawn', () {
      final post = CommunityPost.fromMap('e1', {
        'authorId': 'a',
        'text': 'Harvest dance',
        'media': const [],
        'category': 'event',
        'event': {
          'startsAt': Timestamp.fromDate(DateTime(2026, 12, 1, 15)),
          'place': 'Navrongo',
        },
      });
      expect(post.event?.place, 'Navrongo');
      expect(post.withLikeCount(4).event, post.event);
    });

    test('a reminder is offered only for events still ahead', () {
      final now = DateTime(2026, 10, 29, 12);
      final ahead = fakePost(
        id: 'ev',
        text: 'Harvest dance\nAll welcome',
        category: PostCategory.event,
        event: PostEvent(startsAt: DateTime(2026, 11, 1, 15)),
      );
      final reminder = eventReminderFor(ahead, now: now)!;
      expect(reminder.title, 'Harvest dance');
      expect(reminder.firesAt, DateTime(2026, 11, 1, 14));
      expect(reminder.route, '/post/ev');
      expect(
        eventReminderFor(
          fakePost(event: PostEvent(startsAt: DateTime(2026, 10, 1))),
          now: now,
        ),
        isNull,
      );
      expect(eventReminderFor(fakePost(), now: now), isNull);
    });

    test('a private community event reminder finds its way back', () {
      final reminder = EventReminder(
        postId: 'p1',
        title: 'Meeting',
        startsAt: DateTime(2026, 12, 1),
        privateCommunityId: 'paga-elders',
      );
      expect(reminder.route, '/post/p1?community=paga-elders');
      expect(EventReminder.fromJson(reminder.toJson())?.route, reminder.route);
    });

    test('a post keeps the same reminder slot', () {
      expect(eventReminderSlot('abc'), eventReminderSlot('abc'));
      expect(eventReminderSlot('abc'), inInclusiveRange(0, 999));
    });
  });

  group('image descriptions', () {
    test('travel on the media item and back', () {
      const media = CommunityMedia(
        url: 'https://example.com/a.jpg',
        type: 'image',
        alt: 'Two drummers under a baobab',
      );
      final back = CommunityMedia.fromMap(media.toMap())!;
      expect(back.alt, 'Two drummers under a baobab');
      expect(
        const CommunityMedia(url: 'u', type: 'image').toMap(),
        isNot(contains('alt')),
      );
    });

    test('a staged photo keeps its shape when described', () {
      const upload = PendingUpload(
        path: '/tmp/a.jpg',
        isVideo: false,
        aspectRatio: 0.75,
      );
      final described = upload.withDescription('  A market stall  ');
      expect(described.description, 'A market stall');
      expect(described.aspectRatio, 0.75);
      expect(described.path, upload.path);
    });
  });

  test('a saved draft keeps everything it was saved with', () {
    final draft = SavedDraft(
      id: 'draft-1',
      text: 'Half a thought',
      savedAt: DateTime(2026, 10, 29, 9),
      category: PostCategory.event,
      community: const PostCommunityStamp(
        id: 'paga',
        name: 'Paga',
        isPrivate: true,
      ),
      attachmentPaths: const ['/tmp/a.jpg'],
      descriptions: const ['A gate'],
      event: PostEvent(startsAt: DateTime(2026, 11, 2, 10), place: 'Paga'),
    );
    final back = SavedDraft.fromJson(draft.toJson())!;
    expect(back.text, draft.text);
    expect(back.category, PostCategory.event);
    expect(back.community?.isPrivate, isTrue);
    expect(back.attachmentPaths, draft.attachmentPaths);
    expect(back.descriptions, draft.descriptions);
    expect(back.event, draft.event);
    expect(SavedDraft.fromJson({'id': 1}), isNull);
  });

  group('replies', () {
    final replies = [
      fakePost(id: 'r1', likeCount: 1, createdAt: DateTime(2026, 10, 1, 9)),
      fakePost(id: 'r2', likeCount: 5, createdAt: DateTime(2026, 10, 1, 10)),
      fakePost(id: 'r3', likeCount: 1, createdAt: DateTime(2026, 10, 1, 11)),
    ];
    List<String> ids(List<CommunityPost> posts) => [
      for (final p in posts) p.id,
    ];

    test('sort oldest, newest and most appreciated', () {
      expect(ids(sortReplies(replies, ReplyOrder.oldest)), ['r1', 'r2', 'r3']);
      expect(ids(sortReplies(replies, ReplyOrder.newest)), ['r3', 'r2', 'r1']);
      // Ties keep the conversation's order.
      expect(ids(sortReplies(replies, ReplyOrder.top)), ['r2', 'r1', 'r3']);
    });
  });

  test('followers you know are said in a sentence', () {
    final ama = fakeProfile(uid: 'ama', displayName: 'Ama');
    final kofi = fakeProfile(uid: 'kofi', displayName: 'Kofi');
    expect(followersYouKnowLine((named: const [], total: 0)), isNull);
    expect(followersYouKnowLine((named: [ama], total: 1)), 'Followed by Ama');
    expect(
      followersYouKnowLine((named: [ama, kofi], total: 2)),
      'Followed by Ama and Kofi',
    );
    expect(
      followersYouKnowLine((named: [ama, kofi], total: 3)),
      'Followed by Ama, Kofi and 1 other you follow',
    );
    expect(
      followersYouKnowLine((named: [ama, kofi], total: 6)),
      'Followed by Ama, Kofi and 4 others you follow',
    );
  });

  test('saved posts and members are searched by words and names', () {
    final post = fakePost(
      text: 'Recipe for tuo zaafi',
      authorName: 'Abena Owusu',
      authorUsername: 'abena',
      category: PostCategory.culture,
    );
    expect(savedPostMatches(post, query: 'TUO'), isTrue);
    expect(savedPostMatches(post, query: '@aben'), isTrue);
    expect(savedPostMatches(post, query: 'jollof'), isFalse);
    expect(savedPostMatches(post, topic: PostCategory.culture), isTrue);
    expect(savedPostMatches(post, topic: PostCategory.music), isFalse);

    final member = fakeProfile(displayName: 'Atia Ayine', username: 'atia_a');
    expect(memberMatches(member, 'ayine'), isTrue);
    expect(memberMatches(member, '@atia'), isTrue);
    expect(memberMatches(member, 'kofi'), isFalse);
    expect(memberMatches(null, 'kofi'), isFalse);
    expect(memberMatches(null, ''), isTrue);
  });

  test('a post link in a message is recognised by its id', () {
    expect(
      linkedCommunityPostId('Look\nhttps://indigenworld.com/post/AbC_12-x'),
      'AbC_12-x',
    );
    expect(
      linkedCommunityPostId('https://www.indigenworld.com/post/p9 nice'),
      'p9',
    );
    expect(linkedCommunityPostId('https://example.com/post/p9'), isNull);
    expect(communityPostLink('p9'), 'https://indigenworld.com/post/p9');
  });

  test('Kawuri is asked about the post, by its author, as a draft', () {
    final request = kawuriPostRequest(
      fakePost(text: 'Words to explain', authorName: 'Ayine'),
    );
    expect(request, contains('Ayine'));
    expect(request, contains('“Words to explain”'));
  });

  test('a profile remembers its pinned post', () {
    final profile = CommunityProfile.fromMap('u1', {
      'username': 'ayine',
      'displayName': 'Ayine',
      'pinnedPostId': 'p7',
    });
    expect(profile.pinnedPostId, 'p7');
    expect(profile.copyWith(bio: 'new').pinnedPostId, 'p7');
    expect(
      CommunityProfile.fromMap('u2', {'pinnedPostId': ''}).pinnedPostId,
      isNull,
    );
  });

  test('image descriptions are bounded', () {
    expect(CommunityRepository.maxImageDescriptionLength, 420);
  });
}
