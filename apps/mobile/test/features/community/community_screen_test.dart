import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';

import 'community_test_harness.dart';

void main() {
  final amina = fakeProfile();
  final nyaaba = fakeProfile(
    uid: 'nyaaba-uid',
    username: 'nyaaba',
    displayName: 'Nyaaba Atanga',
    bio: 'Learning every day.',
  );

  Future<void> pumpFeed(
    WidgetTester tester,
    FakeCommunityRepository repository, {
    CommunityProfile? profile,
    String? uid = 'amina-uid',
  }) async {
    await tester.pumpWidget(
      communityHarness(
        repository: repository,
        profile: profile,
        uid: uid,
        child: const CommunityScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  testWidgets('renders the pulse rail, composer and live feed', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        fakePost(text: 'De zaanem. Ko gara.'),
        fakePost(
          id: 'post2',
          authorId: 'nyaaba-uid',
          authorName: 'Nyaaba Atanga',
          authorUsername: 'nyaaba',
          text: 'Amo wora a zamese Kasem mo.',
        ),
      ],
    );

    await pumpFeed(tester, repository, profile: amina);

    expect(find.text('COMMUNITY PULSE'), findsOneWidget);
    expect(find.text('Make a Kasem post'), findsOneWidget);
    expect(find.text('De zaanem. Ko gara.'), findsOneWidget);
    expect(find.text('Amo wora a zamese Kasem mo.'), findsOneWidget);
    expect(find.byType(CommunityPostCard), findsNWidgets(2));
    // Author, handle and relative age all come from the post document.
    expect(find.text('Nyaaba Atanga'), findsOneWidget);
    expect(find.textContaining('@amina_paga'), findsWidgets);
  });

  testWidgets('the Following tab narrows the feed to people you follow', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        fakePost(text: 'From Amina'),
        fakePost(
          id: 'post2',
          authorId: 'nyaaba-uid',
          authorUsername: 'nyaaba',
          text: 'From Nyaaba',
        ),
      ],
      following: ['nyaaba-uid'],
    );

    await pumpFeed(tester, repository, profile: amina);
    expect(find.text('From Amina'), findsOneWidget);

    await tester.tap(find.text('Following'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('From Nyaaba'), findsOneWidget);
    expect(find.text('From Amina'), findsNothing);
  });

  testWidgets('an empty Following feed points at member search', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository, profile: amina);
    await tester.tap(find.text('Following'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Your Following feed is quiet'), findsOneWidget);

    await tester.tap(find.text('Find people'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(PeopleScreen), findsOneWidget);
  });

  testWidgets('an empty feed invites the first post', (tester) async {
    await pumpFeed(
      tester,
      FakeCommunityRepository(profiles: [amina]),
      profile: amina,
    );

    expect(find.text('No posts yet'), findsOneWidget);
    expect(find.text('Make the first post'), findsOneWidget);
  });

  testWidgets('appreciating a post writes through the repository', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository, profile: amina);

    await tester.tap(find.byTooltip('Appreciate'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(repository.toggledLikes, ['post1']);
  });

  testWidgets('saving a post writes through and confirms', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository, profile: amina);

    await tester.tap(find.byTooltip('Save'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(repository.toggledSaves, ['post1']);
    expect(find.text('Saved.'), findsOneWidget);
  });

  testWidgets('a liked post renders in its appreciated state', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
      likedPostIds: {'post1'},
      savedPostIds: {'post1'},
    );

    await pumpFeed(tester, repository, profile: amina);

    expect(find.byTooltip('Appreciated'), findsOneWidget);
    expect(find.byTooltip('Saved'), findsOneWidget);
  });

  testWidgets('old post stamps pick up the live profile photo', (tester) async {
    final withPhoto = fakeProfile(
      avatarUrl: 'https://example.test/profiles/amina.jpg',
    );
    final repository = FakeCommunityRepository(
      profiles: [withPhoto],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository, profile: withPhoto);

    final avatars = tester.widgetList<CommunityAvatar>(
      find.byType(CommunityAvatar),
    );
    expect(
      avatars.any((avatar) => avatar.imageUrl == withPhoto.avatarUrl),
      isTrue,
    );
  });

  testWidgets('resharing writes through and quote opens a composer', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost(repostCount: 7, quoteCount: 3, viewCount: 22)],
    );
    await pumpFeed(tester, repository, profile: amina);

    expect(find.text('10'), findsOneWidget);
    expect(find.text('22'), findsOneWidget);
    await tester.tap(find.byTooltip('Reshare or quote'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Reshare'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(repository.toggledReposts, ['post1']);

    await tester.tap(find.byTooltip('Reshare or quote'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Quote post'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('QUOTING'), findsOneWidget);
  });

  testWidgets('a poll choice records one vote', (tester) async {
    final poll = CommunityPoll(
      options: const [
        CommunityPollOption(id: 'paga', text: 'Choose Paga'),
        CommunityPollOption(id: 'navrongo', text: 'Choose Navrongo'),
      ],
      endsAt: DateTime.now().add(const Duration(days: 1)),
    );
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost(poll: poll)],
    );
    await pumpFeed(tester, repository, profile: amina);

    await tester.tap(find.text('Choose Paga'));
    await tester.pump();
    expect(repository.recordedVotes, [('post1', 'paga')]);
  });

  testWidgets('a visible post records one non-author view', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [fakePost()],
    );
    await pumpFeed(tester, repository, profile: nyaaba, uid: nyaaba.uid);
    await tester.pump(const Duration(milliseconds: 600));

    expect(repository.trackedViews, ['post1']);
  });

  testWidgets('tapping a post opens its conversation', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [
        fakePost(),
        fakePost(id: 'reply1', text: 'Ko gara.', parentId: 'post1'),
      ],
    );

    await pumpFeed(tester, repository, profile: amina);

    await tester.tap(find.text('De zaanem. Ko gara.'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byType(PostDetailScreen), findsOneWidget);
    expect(find.text('Conversation'), findsOneWidget);
    expect(find.text('1 REPLY'), findsOneWidget);
    expect(find.text('Ko gara.'), findsOneWidget);
  });

  testWidgets('tapping an author opens their community profile', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository, profile: amina);

    await tester.tap(find.text('Amina Ayaribisa').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(CommunityProfileScreen), findsOneWidget);
  });

  testWidgets('the header opens saved posts', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
      savedPostIds: {'post1'},
    );

    await pumpFeed(tester, repository, profile: amina);

    await tester.tap(find.byTooltip('Saved posts'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byType(SavedPostsScreen), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(SavedPostsScreen),
        matching: find.text('De zaanem. Ko gara.'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('the header opens member search', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository, profile: amina);

    await tester.tap(find.byTooltip('Find people'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byType(PeopleScreen), findsOneWidget);
    expect(find.text('NEW IN THE COMMUNITY'), findsOneWidget);
    expect(find.text('Nyaaba Atanga'), findsOneWidget);
  });

  testWidgets('a video attachment renders without touching the network', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [
        fakePost(
          text: 'De zaanem.',
          media: const [
            CommunityMedia(
              url: 'https://example.test/reel.mp4',
              type: 'video',
              storagePath: 'community-media/amina-uid/post1/0_reel.mp4',
            ),
          ],
        ),
      ],
    );

    await pumpFeed(tester, repository, profile: amina);

    expect(find.text('REEL'), findsOneWidget);
    expect(find.byIcon(Icons.play_circle_fill_rounded), findsOneWidget);
  });

  testWidgets('a guest sees the feed but is asked to sign in to appreciate', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository, uid: null);

    // Reading is open to everyone.
    expect(find.text('De zaanem. Ko gara.'), findsOneWidget);

    await tester.tap(find.byTooltip('Appreciate'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Welcome back'), findsOneWidget);
    expect(repository.toggledLikes, isEmpty);
  });
}
