import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/edit_community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

import 'community_test_harness.dart';

void main() {
  final amina = fakeProfile();
  final nyaaba = fakeProfile(
    uid: 'nyaaba-uid',
    username: 'nyaaba',
    displayName: 'Nyaaba Atanga',
    bio: 'Learning every day.',
    location: 'Navrongo',
    dialect: 'Navrongo',
  );

  Future<void> pumpProfile(
    WidgetTester tester,
    FakeCommunityRepository repository, {
    required String uid,
    String? viewerUid = 'amina-uid',
  }) async {
    await tester.pumpWidget(
      communityHarness(
        repository: repository,
        profile: amina,
        uid: viewerUid,
        child: CommunityProfileScreen(uid: uid),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 200));
  }

  testWidgets('shows identity, bio, meta chips and counts', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      posts: [
        fakePost(id: 'p1'),
        fakePost(id: 'p2', text: 'Second post'),
      ],
    );

    await pumpProfile(tester, repository, uid: 'amina-uid');

    expect(find.text('Amina Ayaribisa'), findsWidgets);
    expect(find.text('@amina_paga'), findsOneWidget);
    expect(find.text('Kasem speaker from Paga.'), findsOneWidget);
    expect(find.byType(StatusPillChip), findsNWidgets(2));
    // profileCounts on the fake reports 12 followers and two top-level posts.
    expect(find.text('12'), findsOneWidget);
    expect(find.text('Followers'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    // "Posts" labels both the count chip and the first tab.
    expect(find.text('Posts'), findsNWidgets(2));
  });

  testWidgets('your own page says so, and does not edit itself', (
    tester,
  ) async {
    // This is the *public* page, reached from half the app — a name in the
    // feed, an actor in a notification, an avatar in the media viewer. An
    // editor hanging off all of those is the sprawl the Profile tab was
    // consolidated to end, so what a member sees here is exactly what a
    // stranger sees. Editing lives in one place now, and this is what that
    // place previews.
    final repository = FakeCommunityRepository(profiles: [amina]);

    await pumpProfile(tester, repository, uid: 'amina-uid');

    expect(find.text('This is your page'), findsOneWidget);
    expect(find.text('Edit profile'), findsNothing);
    expect(find.byType(EditCommunityProfileScreen), findsNothing);
    expect(find.byType(FollowButton), findsNothing);
  });

  testWidgets(
    'someone else profile offers Follow, and following writes through',
    (tester) async {
      final repository = FakeCommunityRepository(profiles: [amina, nyaaba]);

      await pumpProfile(tester, repository, uid: 'nyaaba-uid');

      expect(find.text('Edit profile'), findsNothing);
      expect(find.text('Follow'), findsOneWidget);

      await tester.tap(find.text('Follow'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(repository.toggledFollows, ['nyaaba-uid']);
    },
  );

  testWidgets('an already-followed member reads as Following', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      following: ['nyaaba-uid'],
    );

    await pumpProfile(tester, repository, uid: 'nyaaba-uid');

    expect(
      find.descendant(
        of: find.byType(FollowButton),
        matching: find.text('Following'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('the tabs switch between posts, replies, media and likes', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [
        fakePost(id: 'p1', text: 'A top level post'),
        fakePost(id: 'r1', text: 'A reply of mine', parentId: 'p1'),
      ],
      likedPostIds: {'p1'},
    );

    await pumpProfile(tester, repository, uid: 'amina-uid');
    expect(find.text('A top level post'), findsOneWidget);

    await tester.tap(find.text('Replies'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('A reply of mine'), findsOneWidget);

    await tester.tap(find.text('Media'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Nothing here yet'), findsOneWidget);
    expect(
      find.text('Photos and reels appear here once they are posted.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Appreciated'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byType(CommunityPostCard), findsOneWidget);
  });

  testWidgets('the follower and following counts open people lists', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina, nyaaba],
      following: ['nyaaba-uid'],
    );

    await pumpProfile(tester, repository, uid: 'amina-uid');

    await tester.tap(find.text('Followers'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byType(PeopleListScreen), findsOneWidget);
    expect(find.text('Nyaaba Atanga'), findsOneWidget);
  });

  testWidgets('a member with no community profile is reported plainly', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(profiles: [amina]);

    await pumpProfile(tester, repository, uid: 'stranger-uid');

    expect(find.text('No community profile'), findsOneWidget);
  });
}
