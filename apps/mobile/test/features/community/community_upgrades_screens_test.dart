// The 0.1.37 community upgrades on screen: a label that opens its topic, a
// muted word folding a post away, an event with its reminder, the thread
// author's badge and reply order, a pinned post and "Follows you", saved-post
// search, muted words in Settings, drafts, the composer's event fields and
// "Save draft?", a linked post drawn in a chat bubble, and a community's dot.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/communities/communities_screen.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_local_prefs.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/event_reminders.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/community/data/post_event.dart';
import 'package:indigen_world_mobile/features/community/data/saved_drafts.dart';
import 'package:indigen_world_mobile/features/community/drafts_screen.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/community/topic_feed_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/chat_post_link_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/standard_post_card.dart';
import 'package:indigen_world_mobile/features/settings/privacy_controls_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'community_test_harness.dart';

/// Records what would have been put on the phone's schedule.
class _FakeScheduler implements EventReminderScheduler {
  final scheduled = <String>[];
  final cancelled = <int>[];

  @override
  Future<bool> schedule(EventReminder reminder, {required int slot}) async {
    scheduled.add(reminder.postId);
    return true;
  }

  @override
  Future<void> cancel({required int slot}) async => cancelled.add(slot);
}

void main() {
  final amina = fakeProfile();
  final nyaaba = fakeProfile(
    uid: 'nyaaba-uid',
    username: 'nyaaba',
    displayName: 'Nyaaba Atanga',
  );

  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<ProviderContainer> pump(
    WidgetTester tester,
    Widget child, {
    FakeCommunityRepository? repository,
    FakeCommunitySpaceRepository? spaces,
    List<Override> overrides = const [],
  }) async {
    await tester.pumpWidget(
      communityHarness(
        repository:
            repository ?? FakeCommunityRepository(profiles: [amina, nyaaba]),
        profile: amina,
        spaces: spaces,
        overrides: overrides,
        child: child,
      ),
    );
    await settle(tester);
    return ProviderScope.containerOf(tester.element(find.byWidget(child)));
  }

  testWidgets('a post’s label opens every post carrying it', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        fakePost(
          id: 'q1',
          text: 'Who knows the old songs?',
          category: PostCategory.question,
        ),
        fakePost(
          id: 'm1',
          text: 'New drum recording',
          category: PostCategory.music,
        ),
      ],
    );
    await pump(
      tester,
      StandardPostCard(
        post: fakePost(
          id: 'q1',
          text: 'Who knows the old songs?',
          category: PostCategory.question,
        ),
      ),
      repository: repository,
    );

    await tester.tap(find.byKey(const ValueKey('post-topic-question')));
    await settle(tester);

    expect(find.byType(TopicFeedScreen), findsOneWidget);
    expect(find.byKey(const ValueKey('topic-post-q1')), findsOneWidget);
    expect(find.byKey(const ValueKey('topic-post-m1')), findsNothing);

    // The other labels are a tap away.
    await tester.tap(find.byKey(const ValueKey('topic-chip-music')));
    await settle(tester);
    expect(find.byKey(const ValueKey('topic-post-m1')), findsOneWidget);
    expect(find.byKey(const ValueKey('topic-post-q1')), findsNothing);
  });

  testWidgets('a muted word folds a post away, and Show brings it back', (
    tester,
  ) async {
    final post = fakePost(
      id: 'p1',
      authorId: 'nyaaba-uid',
      text: 'Big football match tonight',
    );
    final container = await pump(tester, StandardPostCard(post: post));
    await container.read(mutedWordsProvider.notifier).add('football');
    await settle(tester);

    expect(find.textContaining('a word you muted'), findsOneWidget);
    expect(find.text('Big football match tonight'), findsNothing);

    await tester.tap(find.byKey(const Key('muted-post-show')));
    await settle(tester);
    expect(find.text('Big football match tonight'), findsOneWidget);
  });

  testWidgets('a member’s own post is never folded by their muted words', (
    tester,
  ) async {
    final post = fakePost(id: 'mine', text: 'My football post');
    final container = await pump(tester, StandardPostCard(post: post));
    await container.read(mutedWordsProvider.notifier).add('football');
    await settle(tester);

    expect(find.text('My football post'), findsOneWidget);
  });

  testWidgets('an event says when, and Remind me sets a reminder', (
    tester,
  ) async {
    final scheduler = _FakeScheduler();
    final starts = DateTime.now().add(const Duration(days: 3));
    final post = fakePost(
      id: 'ev1',
      authorId: 'nyaaba-uid',
      text: 'Harvest dance at the square',
      category: PostCategory.event,
      event: PostEvent(startsAt: starts, place: 'Navrongo square'),
    );
    final container = await pump(
      tester,
      StandardPostCard(post: post),
      overrides: [eventReminderSchedulerProvider.overrideWithValue(scheduler)],
    );

    expect(find.text('Navrongo square'), findsOneWidget);
    expect(find.text(eventWhenLabel(starts)), findsOneWidget);

    await tester.tap(find.byKey(const Key('event-remind-ev1')));
    await settle(tester);

    expect(scheduler.scheduled, ['ev1']);
    expect(container.read(eventRemindersProvider).containsKey('ev1'), isTrue);
    expect(find.byTooltip('Cancel reminder'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('replies by the thread’s author say so, and can be reordered', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        fakePost(
          id: 'root',
          authorId: 'nyaaba-uid',
          text: 'A question',
          replyCount: 2,
        ),
        fakePost(
          id: 'r1',
          parentId: 'root',
          authorId: 'amina-uid',
          text: 'First answer',
          likeCount: 0,
          createdAt: DateTime(2026, 10, 1, 9),
        ),
        fakePost(
          id: 'r2',
          parentId: 'root',
          authorId: 'nyaaba-uid',
          authorName: 'Nyaaba Atanga',
          text: 'Thanks, and more',
          likeCount: 7,
          createdAt: DateTime(2026, 10, 1, 10),
        ),
      ],
    );
    await pump(
      tester,
      const PostDetailScreen(postId: 'root'),
      repository: repository,
    );

    expect(find.text('Author'), findsOneWidget);
    double top(String text) => tester.getTopLeft(find.text(text)).dy;
    expect(top('First answer'), lessThan(top('Thanks, and more')));

    await tester.tap(find.byKey(const Key('reply-order')));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('reply-order-top')));
    await settle(tester);

    expect(top('Thanks, and more'), lessThan(top('First answer')));
  });

  testWidgets('a pinned post leads the profile, and Follows you is shown', (
    tester,
  ) async {
    final pinnedProfile = CommunityProfile(
      uid: nyaaba.uid,
      username: nyaaba.username,
      displayName: nyaaba.displayName,
      pinnedPostId: 'old',
    );
    final repository = FakeCommunityRepository(
      profiles: [amina, pinnedProfile],
      followsMe: {'nyaaba-uid'},
      posts: [
        fakePost(
          id: 'new',
          authorId: 'nyaaba-uid',
          text: 'Newest thing',
          createdAt: DateTime(2026, 10, 29),
        ),
        fakePost(
          id: 'old',
          authorId: 'nyaaba-uid',
          text: 'The one I pinned',
          createdAt: DateTime(2026, 9, 1),
        ),
      ],
    );
    await pump(
      tester,
      const CommunityProfileScreen(uid: 'nyaaba-uid'),
      repository: repository,
    );

    expect(
      find.byKey(const ValueKey('follows-you-nyaaba-uid')),
      findsOneWidget,
    );
    expect(find.text('Pinned'), findsOneWidget);
    double top(String text) => tester.getTopLeft(find.text(text)).dy;
    expect(top('The one I pinned'), lessThan(top('Newest thing')));
    // Shown once, not again further down.
    expect(find.text('The one I pinned'), findsOneWidget);
  });

  testWidgets('saved posts can be searched', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      savedPostIds: {'s1', 's2'},
      posts: [
        fakePost(
          id: 's1',
          text: 'Recipe for tuo zaafi',
          category: PostCategory.culture,
        ),
        fakePost(
          id: 's2',
          text: 'Drum lesson notes',
          category: PostCategory.music,
        ),
      ],
    );
    await pump(tester, const SavedPostsScreen(), repository: repository);

    expect(find.byKey(const ValueKey('saved-s1')), findsOneWidget);
    expect(find.byKey(const ValueKey('saved-s2')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('saved-posts-search')), 'drum');
    await settle(tester);
    expect(find.byKey(const ValueKey('saved-s1')), findsNothing);
    expect(find.byKey(const ValueKey('saved-s2')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('saved-posts-search')), '');
    await tester.tap(find.byKey(const ValueKey('saved-topic-culture')));
    await settle(tester);
    expect(find.byKey(const ValueKey('saved-s1')), findsOneWidget);
    expect(find.byKey(const ValueKey('saved-s2')), findsNothing);
  });

  testWidgets('muted words are added and removed in Settings', (tester) async {
    final container = await pump(tester, const PrivacyControlsScreen());

    await tester.enterText(
      find.byKey(const Key('muted-word-input')),
      'spoilers',
    );
    await tester.tap(find.byKey(const Key('muted-word-add')));
    await settle(tester);

    expect(container.read(mutedWordsProvider), ['spoilers']);
    expect(find.byKey(const ValueKey('muted-word-spoilers')), findsOneWidget);

    await tester.tap(find.byTooltip('Unmute “spoilers”'));
    await settle(tester);
    expect(container.read(mutedWordsProvider), isEmpty);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('drafts are listed, newest first', (tester) async {
    final container = await pump(tester, const DraftsScreen());
    final drafts = container.read(savedDraftsProvider.notifier);
    await drafts.save(
      SavedDraft(id: 'd1', text: 'Older idea', savedAt: DateTime(2026, 10, 1)),
    );
    await drafts.save(
      SavedDraft(id: 'd2', text: 'Newer idea', savedAt: DateTime(2026, 10, 2)),
    );
    await settle(tester);

    expect(find.text('Saved on this phone only.'), findsOneWidget);
    double top(String text) => tester.getTopLeft(find.text(text)).dy;
    expect(top('Newer idea'), lessThan(top('Older idea')));
  });

  testWidgets('an Event post asks when and where', (tester) async {
    await pump(tester, const ComposePostScreen());

    expect(find.byKey(const Key('event-pick-time')), findsNothing);
    await tester.tap(find.byKey(const Key('post-tag-picker')));
    await settle(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Search tags'),
      'Event',
    );
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('post-category-event')));
    await settle(tester);

    expect(find.byKey(const Key('event-pick-time')), findsOneWidget);
    expect(find.byKey(const Key('event-place')), findsOneWidget);
  });

  testWidgets('leaving a written post offers to keep it as a draft', (
    tester,
  ) async {
    final container = await pump(
      tester,
      Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<bool>(
                  builder: (context) => const ComposePostScreen(),
                ),
              ),
              child: const Text('Open composer'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open composer'));
    await settle(tester);
    await tester.enterText(
      find.byKey(const Key('community-composer')),
      'Something worth finishing',
    );
    await settle(tester);

    await tester.tap(find.byType(BackButton));
    await settle(tester);
    expect(find.text('Keep this post for later?'), findsOneWidget);
    await tester.tap(find.text('Save draft'));
    await settle(tester);
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Open composer'), findsOneWidget);
    final saved = container.read(savedDraftsProvider);
    expect(saved, hasLength(1));
    expect(saved.single.text, 'Something worth finishing');
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('a post linked in a message is drawn as the post', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        fakePost(
          id: 'linked',
          authorName: 'Nyaaba Atanga',
          text: 'Come and see',
        ),
      ],
    );
    await pump(
      tester,
      const Material(child: ChatPostLinkCard(postId: 'linked', onMine: false)),
      repository: repository,
    );

    expect(find.text('Nyaaba Atanga'), findsOneWidget);
    expect(find.text('Come and see'), findsOneWidget);
    expect(find.text('Community post'), findsOneWidget);
  });

  testWidgets('a joined community with posts since the last visit has a dot', (
    tester,
  ) async {
    final spaces = FakeCommunitySpaceRepository(
      communities: [fakeCommunity()],
      memberships: const [
        CommunityMembership(
          communityId: 'kasem-circle',
          uid: 'amina-uid',
          role: CommunityRole.member,
          status: MembershipStatus.active,
        ),
      ],
    );
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        fakePost(
          id: 'c1',
          community: const PostCommunityStamp(
            id: 'kasem-circle',
            name: 'Kasem Circle',
            isPrivate: false,
          ),
          createdAt: DateTime.utc(2026, 10, 29),
        ),
      ],
    );
    final container = await pump(
      tester,
      const CommunitiesScreen(),
      repository: repository,
      spaces: spaces,
    );
    await container
        .read(communityVisitsProvider.notifier)
        .visit('kasem-circle', at: DateTime.utc(2026, 10, 28));
    // The tab, not the "Joined" mark on the community's own row.
    await tester.tap(
      find.descendant(
        of: find.byType(SegmentedButton<int>),
        matching: find.text('Joined'),
      ),
    );
    // The joined list, then each community's newest post, arrive a frame
    // or two apart.
    await settle(tester);
    await settle(tester);
    await settle(tester);

    expect(
      find.byKey(const ValueKey('community-news-kasem-circle')),
      findsOneWidget,
    );

    await container
        .read(communityVisitsProvider.notifier)
        .visit('kasem-circle', at: DateTime.utc(2026, 10, 30));
    await settle(tester);
    expect(
      find.byKey(const ValueKey('community-news-kasem-circle')),
      findsNothing,
    );
  });

  testWidgets('the feed marks where the last visit ended', (tester) async {
    final lastSeen = DateTime.utc(2026, 10, 28, 12);
    SharedPreferences.setMockInitialValues({
      '${feedVisitKeyPrefix}amina-uid_for-you': lastSeen.millisecondsSinceEpoch,
    });
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        // Two since the last visit, three from before it.
        for (final (index, hours) in [2, 1, -30, -40, -50].indexed)
          fakePost(
            id: 'p$index',
            authorId: 'nyaaba-uid',
            text: 'Post number $index',
            createdAt: lastSeen.add(Duration(hours: hours)),
          ),
      ],
    );
    await pump(tester, const CommunityScreen(), repository: repository);
    await settle(tester);

    expect(find.text('Seen on your last visit'), findsOneWidget);
    double top(Finder finder) => tester.getTopLeft(finder).dy;
    expect(
      top(find.text('Seen on your last visit')),
      greaterThan(top(find.text('Post number 1'))),
    );
    expect(
      top(find.text('Seen on your last visit')),
      lessThan(top(find.text('Post number 2'))),
    );
    // And the mark moves up to this visit, for next time.
    final preferences = await SharedPreferences.getInstance();
    expect(
      preferences.getInt('${feedVisitKeyPrefix}amina-uid_for-you'),
      greaterThan(lastSeen.millisecondsSinceEpoch),
    );
  });

  testWidgets('tapping the feed already showing goes back to its top', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        for (var index = 0; index < 14; index++)
          fakePost(
            id: 'p$index',
            authorId: 'nyaaba-uid',
            text: 'Post number $index',
            createdAt: DateTime(
              2026,
              10,
              29,
              12,
            ).subtract(Duration(minutes: index)),
          ),
      ],
    );
    await pump(tester, const CommunityScreen(), repository: repository);
    final feed = find.descendant(
      of: find.byKey(const PageStorageKey('community-scroll')),
      matching: find.byType(Scrollable),
    );
    ScrollPosition position() =>
        tester.state<ScrollableState>(feed.first).position;

    await tester.drag(feed.first, const Offset(0, -900));
    await settle(tester);
    // Turning back a little brings the header out again, as it does by hand.
    await tester.drag(feed.first, const Offset(0, 60));
    await settle(tester);
    expect(position().pixels, greaterThan(200));

    await tester.tap(find.text('For you'));
    await tester.pumpAndSettle();
    expect(position().pixels, 0);
  });
}
