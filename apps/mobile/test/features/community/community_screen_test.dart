import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/communities/communities_screen.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/inline_video.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

import 'community_test_harness.dart';

void main() {
  final amina = fakeProfile();
  final nyaaba = fakeProfile(
    uid: 'nyaaba-uid',
    username: 'nyaaba',
    displayName: 'Nyaaba Atanga',
    bio: 'Learning every day.',
  );

  test('captionless community videos use only the community source pill', () {
    final post = fakePost(
      text: '',
      media: const [
        CommunityMedia(url: 'https://example.test/reel.mp4', type: 'video'),
      ],
    );

    final reel = Reel.fromCommunityPost(post, post.media.first);

    expect(reel.label, 'FROM THE COMMUNITY');
    expect(reel.title, isEmpty);
  });

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

  testWidgets('renders the daily prompt, composer and live feed', (
    tester,
  ) async {
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

    // A compact prompt strip and the composer open the feed.
    expect(find.text('Today in Kasem'), findsOneWidget);
    expect(find.text('Share a word from home'), findsOneWidget);
    expect(find.text('Make a post'), findsOneWidget);
    expect(find.byTooltip('Add a photo'), findsOneWidget);
    expect(find.byTooltip('Add a video'), findsOneWidget);
    expect(find.text('De zaanem. Ko gara.'), findsOneWidget);
    expect(find.text('Amo wora a zamese Kasem mo.'), findsOneWidget);
    expect(find.byType(CommunityPostCard), findsNWidgets(2));
    // Author, handle and relative age all come from the post document.
    expect(
      find.descendant(
        of: find.byType(CommunityPostCard),
        matching: find.text('Nyaaba Atanga'),
      ),
      findsOneWidget,
    );
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

    expect(find.text('Nothing from the people you follow'), findsOneWidget);

    await tester.tap(find.text('Find people'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(PeopleScreen), findsOneWidget);
  });

  testWidgets('the prompt strip stays compact and opens a labelled composer', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );
    await pumpFeed(tester, repository, profile: amina);

    // Roughly one list row: no more than a tenth of the first screen.
    final strip = tester.getRect(
      find.byKey(const Key('community-prompt-strip')),
    );
    final screen = tester.getRect(find.byType(CommunityScreen));
    expect(strip.height, lessThanOrEqualTo(screen.height * 0.10));

    await tester.tap(find.byKey(const Key('community-prompt-strip')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(ComposePostScreen), findsOneWidget);
    expect(
      tester
          .widget<ChoiceChip>(
            find.byKey(const ValueKey('post-category-language')),
          )
          .selected,
      isTrue,
    );
    expect(
      find.text('Share a word from home, and what it means…'),
      findsOneWidget,
    );
    // Only staff and moderators may announce.
    expect(
      find.byKey(const ValueKey('post-category-announcement')),
      findsNothing,
    );
  });

  testWidgets('+ Communities opens the directory instead of filtering', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );
    await pumpFeed(tester, repository, profile: amina);

    final tab = find.byKey(const Key('community-communities-tab'));
    expect(tab, findsOneWidget);
    // The plus is visible, not just implied by the label.
    expect(
      find.descendant(of: tab, matching: find.byIcon(Icons.add_rounded)),
      findsOneWidget,
    );

    await tester.tap(tab);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(CommunitiesScreen), findsOneWidget);
  });

  testWidgets('a categorised community post shows its label and community', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [
        fakePost(
          text: 'Which word do you use for a calabash?',
          category: PostCategory.question,
          community: const PostCommunityStamp(
            id: 'kasem-circle',
            name: 'Kasem Circle',
            isPrivate: false,
          ),
        ),
      ],
    );
    await pumpFeed(tester, repository, profile: amina);

    expect(find.text('Question'), findsOneWidget);
    expect(find.text('in Kasem Circle'), findsOneWidget);
    // The X-style byline is intact: name, handle and age on one line, and the
    // overflow menu beside it.
    expect(find.text('Amina Ayaribisa'), findsOneWidget);
    expect(find.textContaining('@amina_paga'), findsOneWidget);
    expect(find.byTooltip('More'), findsOneWidget);
  });

  testWidgets('New voices sits a few posts down, never at the top', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        for (var index = 0; index < 6; index++)
          fakePost(
            id: 'post$index',
            text: 'Post number $index',
            createdAt: DateTime(2026, 8, 20).subtract(Duration(hours: index)),
          ),
      ],
    );
    await pumpFeed(tester, repository, profile: amina);
    await tester.pump(const Duration(milliseconds: 300));

    final module = find.text('New voices');
    await tester.scrollUntilVisible(
      module,
      300,
      scrollable: find
          .descendant(
            of: find.byKey(const PageStorageKey('community-scroll')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(module, findsOneWidget);
    // Below the third post, above the fourth.
    expect(
      tester.getRect(module).top,
      greaterThan(tester.getRect(find.text('Post number 2')).bottom),
    );
    expect(find.text('Nyaaba Atanga'), findsOneWidget);
    expect(find.text('See all'), findsOneWidget);
  });

  testWidgets('an appreciation shows at once and is taken back if refused', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost(likeCount: 3)],
      likeError: FirebaseException(
        plugin: 'cloud_firestore',
        code: 'permission-denied',
      ),
    )..likeGate = Completer<void>();
    await pumpFeed(tester, repository, profile: amina);

    expect(find.text('3'), findsOneWidget);
    await tester.tap(find.byTooltip('Appreciate'));
    await tester.pump();

    // Drawn ahead of the server.
    expect(find.byTooltip('Appreciated'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);

    repository.likeGate!.complete();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // Refused: both the heart and the count go back, and the member is told.
    expect(find.byTooltip('Appreciate'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('Could not update. Try again.'), findsOneWidget);
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
    expect(find.text('1 reply'), findsOneWidget);
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

    // A clip posted on its own is a player rather than a poster with a badge on
    // it: it starts itself once it is mostly on screen, silently, and carries
    // the controls that go with that. There is no decoder in a test, so what is
    // on screen here is the state it falls back to — the placeholder, the play
    // glyph, and the speaker that would have been muting it.
    expect(find.byType(InlineVideoTile), findsOneWidget);
    expect(find.byType(PlayGlyph), findsOneWidget);
    expect(find.byTooltip('Sound off'), findsOneWidget);
  });

  testWidgets('a muted clip can be given its sound back from the feed', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [
        fakePost(
          text: 'De zaanem.',
          media: const [
            CommunityMedia(url: 'https://example.test/reel.mp4', type: 'video'),
          ],
        ),
      ],
    );

    await pumpFeed(tester, repository, profile: amina);

    // The speaker sits in the bottom corner of the attachment, which on a test
    // surface is below the fold.
    await tester.ensureVisible(find.byTooltip('Sound off'));
    await tester.pump();
    await tester.tap(find.byTooltip('Sound off'));
    await tester.pump();

    // One switch for every clip in the app, which is what members expect from
    // every product that has this control.
    expect(find.byTooltip('Sound on'), findsOneWidget);
  });

  testWidgets('a refused feed offers a way back, not a dead end', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
      feedError: FirebaseException(
        plugin: 'cloud_firestore',
        code: 'permission-denied',
        message: 'Missing or insufficient permissions.',
      ),
    );

    await pumpFeed(tester, repository, profile: amina);

    // A denied read is ours to fix, so the copy says so instead of sending a
    // member on full signal to look at their connection.
    expect(
      find.text('The community service is still starting up'),
      findsOneWidget,
    );
    expect(find.text('The feed could not load'), findsNothing);
    expect(find.textContaining('Check your connection'), findsNothing);
    expect(find.text('Try again'), findsOneWidget);
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
