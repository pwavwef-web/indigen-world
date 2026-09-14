// Sub-communities on screen: finding one, joining it, asking to join a private
// one, starting one, and what a community shows to members and to strangers.
//
// The repository is faked with live streams, so a join lands on screen the way
// Firestore's local write does in the app — the button changes because the
// membership changed, not because the widget guessed.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/communities/communities_screen.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_actions.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_screen.dart';
import 'package:indigen_world_mobile/features/community/communities/create_community_screen.dart';
import 'package:indigen_world_mobile/features/community/communities/edit_community_screen.dart';
import 'package:indigen_world_mobile/features/community/communities/hand_over_community_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';

import 'community_test_harness.dart';

void main() {
  final amina = fakeProfile();
  final nyaaba = fakeProfile(
    uid: 'nyaaba-uid',
    username: 'nyaaba',
    displayName: 'Nyaaba Atanga',
  );

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    required FakeCommunitySpaceRepository spaces,
    FakeCommunityRepository? repository,
    CommunityProfile? profile,
    String? uid = 'amina-uid',
  }) async {
    await tester.pumpWidget(
      communityHarness(
        repository:
            repository ?? FakeCommunityRepository(profiles: [amina, nyaaba]),
        profile: profile ?? amina,
        uid: uid,
        spaces: spaces,
        child: child,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  group('the directory', () {
    testWidgets('lists communities with what they are and who is in them', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [
          fakeCommunity(),
          fakeCommunity(
            id: 'paga-elders',
            name: 'Paga Elders',
            visibility: CommunityVisibility.private,
            memberCount: 1,
          ),
        ],
      );
      await pump(tester, const CommunitiesScreen(), spaces: spaces);

      expect(find.text('Kasem Circle'), findsOneWidget);
      expect(find.text('Language · Kasem · Navrongo'), findsWidgets);
      expect(find.text('12 members'), findsOneWidget);
      expect(find.text('1 member'), findsOneWidget);
      expect(find.text('Join'), findsOneWidget);
      // A private community asks rather than joins, and says it is private.
      expect(find.text('Ask to join'), findsOneWidget);
      expect(find.byIcon(Icons.lock_outline_rounded), findsOneWidget);
    });

    testWidgets('joining a public community writes through and shows Joined', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity()],
      );
      await pump(tester, const CommunitiesScreen(), spaces: spaces);

      await tester.tap(
        find.byKey(const ValueKey('community-join-kasem-circle')),
      );
      await settle(tester);

      expect(spaces.joined, ['kasem-circle']);
      expect(
        find.byKey(const ValueKey('community-joined-kasem-circle')),
        findsOneWidget,
      );
      expect(find.text('You joined Kasem Circle.'), findsOneWidget);
    });

    testWidgets('asking to join a private community leaves it Requested', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [
          fakeCommunity(
            id: 'paga-elders',
            name: 'Paga Elders',
            visibility: CommunityVisibility.private,
          ),
        ],
      );
      await pump(tester, const CommunitiesScreen(), spaces: spaces);

      await tester.tap(find.text('Ask to join'));
      await settle(tester);

      expect(spaces.joined, ['paga-elders']);
      expect(
        find.byKey(const ValueKey('community-requested-paga-elders')),
        findsOneWidget,
      );
      expect(
        find.text('Request sent. A moderator will look at it soon.'),
        findsOneWidget,
      );
    });

    testWidgets('a guest is asked to sign in before joining', (tester) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity()],
      );
      await tester.pumpWidget(
        communityHarness(
          repository: FakeCommunityRepository(profiles: [amina]),
          uid: null,
          spaces: spaces,
          child: const CommunitiesScreen(),
        ),
      );
      await settle(tester);

      await tester.tap(find.text('Join'));
      await settle(tester);

      expect(find.text('Welcome back'), findsOneWidget);
      expect(spaces.joined, isEmpty);
    });

    testWidgets('a search with no match says so and offers to start one', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity()],
      );
      await pump(tester, const CommunitiesScreen(), spaces: spaces);

      await tester.enterText(
        find.byKey(const Key('communities-search')),
        'Sirigu',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await settle(tester);

      expect(find.text('No communities match “Sirigu”'), findsOneWidget);
      expect(find.text('Start one'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('communities-search')),
        'navrongo',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await settle(tester);
      expect(find.text('Kasem Circle'), findsOneWidget);
    });

    testWidgets('with nothing joined, Joined points back to discovery', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity()],
      );
      await pump(tester, const CommunitiesScreen(), spaces: spaces);

      await tester.tap(find.text('Joined'));
      await settle(tester);

      expect(find.text("You haven't joined a community yet"), findsOneWidget);
      await tester.tap(find.text('Discover communities'));
      await settle(tester);
      expect(find.text('Kasem Circle'), findsOneWidget);
    });
  });

  group('creating', () {
    /// Opens the form from a launcher, so its pop has somewhere to return to.
    Future<List<CommunitySpace>> openForm(
      WidgetTester tester,
      FakeCommunitySpaceRepository spaces,
    ) async {
      final results = <CommunitySpace>[];
      await pump(
        tester,
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () async {
                  final created = await Navigator.of(context).push(
                    MaterialPageRoute<CommunitySpace>(
                      builder: (context) => const CreateCommunityScreen(),
                    ),
                  );
                  if (created != null) results.add(created);
                },
                child: const Text('Open form'),
              ),
            ),
          ),
        ),
        spaces: spaces,
      );
      await tester.tap(find.text('Open form'));
      await settle(tester);
      return results;
    }

    Future<void> next(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('create-community-next')));
      await settle(tester);
    }

    testWidgets('an empty name stops the first step', (tester) async {
      final spaces = FakeCommunitySpaceRepository();
      await openForm(tester, spaces);

      await next(tester);

      expect(find.text('Give the community a name.'), findsOneWidget);
      expect(find.text('1/3 · Basics'), findsOneWidget);
    });

    testWidgets('a taken address is caught before the next step', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        takenSlugs: {'navrongo-kasem-circle'},
      );
      await openForm(tester, spaces);

      await tester.enterText(
        find.byKey(const Key('create-community-name')),
        'Navrongo Kasem Circle',
      );
      await tester.pump(const Duration(milliseconds: 600));
      await next(tester);

      expect(
        find.text('That address is already taken. Try another.'),
        findsOneWidget,
      );
      expect(find.text('1/3 · Basics'), findsOneWidget);
      expect(spaces.created, isEmpty);
    });

    testWidgets('a guided draft publishes as a private community', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository();
      final results = await openForm(tester, spaces);

      await tester.enterText(
        find.byKey(const Key('create-community-name')),
        'Navrongo Kasem Circle',
      );
      await tester.pump(const Duration(milliseconds: 600));
      // The address follows the name.
      expect(find.text('navrongo-kasem-circle'), findsOneWidget);
      await next(tester);
      expect(find.text('2/3 · Details'), findsOneWidget);

      // Too long a description holds the step.
      await tester.enterText(
        find.byKey(const Key('create-community-description')),
        'x' * (kCommunityDescriptionMax + 1),
      );
      await next(tester);
      expect(
        find.text('Descriptions can be at most 500 characters.'),
        findsOneWidget,
      );
      expect(find.text('2/3 · Details'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('create-community-description')),
        'Words from home, every day.',
      );
      // Typing scrolls the focused field into view, and a list ignores taps
      // while it is still moving: let that finish across a few frames.
      for (var frame = 0; frame < 3; frame++) {
        await tester.pump(const Duration(milliseconds: 300));
      }
      await tester.ensureVisible(
        find.byKey(const Key('create-visibility-private')),
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('create-visibility-private')));
      await tester.pump();
      await next(tester);
      expect(find.text('3/3 · Look and rules'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('create-rule-0')),
        'Be kind.',
      );
      await next(tester);

      expect(spaces.created, hasLength(1));
      final draft = spaces.created.single;
      expect(draft.slug, 'navrongo-kasem-circle');
      expect(draft.visibility, CommunityVisibility.private);
      expect(draft.cleanRules, ['Be kind.']);
      // The form closes with the community it created.
      for (var frame = 0; frame < 3; frame++) {
        await tester.pump(const Duration(milliseconds: 300));
      }
      expect(results.single.id, 'navrongo-kasem-circle');
      expect(find.byType(CreateCommunityScreen), findsNothing);
    });
  });

  group('a community', () {
    testWidgets('a private one keeps its feed behind the request', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [
          fakeCommunity(
            id: 'paga-elders',
            name: 'Paga Elders',
            visibility: CommunityVisibility.private,
          ),
        ],
      );
      final repository = FakeCommunityRepository(
        profiles: [amina, nyaaba],
        posts: [
          fakePost(
            text: 'Members only',
            community: const PostCommunityStamp(
              id: 'paga-elders',
              name: 'Paga Elders',
              isPrivate: true,
            ),
          ),
        ],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'paga-elders'),
        spaces: spaces,
        repository: repository,
      );

      expect(find.text('This community is private'), findsOneWidget);
      expect(find.text('Members only'), findsNothing);

      // The header's button, at the top of the screen.
      await tester.tap(find.text('Ask to join').first);
      await settle(tester);

      expect(spaces.joined, ['paga-elders']);
      expect(find.text('Your request is waiting for approval'), findsOneWidget);
      expect(find.text('Members only'), findsNothing);
    });

    testWidgets('members see its prompt, its composer and its posts', (
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
            text: 'Ba zaana, Kasem Circle.',
            community: const PostCommunityStamp(
              id: 'kasem-circle',
              name: 'Kasem Circle',
              isPrivate: false,
            ),
          ),
          fakePost(id: 'elsewhere', text: 'Not in this community'),
        ],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'kasem-circle'),
        spaces: spaces,
        repository: repository,
      );

      expect(find.text('Today in Kasem'), findsOneWidget);
      expect(find.text('Post in Kasem Circle'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Ba zaana, Kasem Circle.'),
        200,
      );
      expect(find.text('Ba zaana, Kasem Circle.'), findsOneWidget);
      expect(find.text('Not in this community'), findsNothing);
      // Inside the community, posts do not repeat its name on every row.
      expect(find.text('in Kasem Circle'), findsNothing);
    });

    testWidgets('a moderator approves a request from the Members tab', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [
          fakeCommunity(
            id: 'paga-elders',
            name: 'Paga Elders',
            ownerId: 'amina-uid',
            visibility: CommunityVisibility.private,
          ),
        ],
        memberships: const [
          CommunityMembership(
            communityId: 'paga-elders',
            uid: 'amina-uid',
            role: CommunityRole.owner,
            status: MembershipStatus.active,
          ),
          CommunityMembership(
            communityId: 'paga-elders',
            uid: 'nyaaba-uid',
            role: CommunityRole.member,
            status: MembershipStatus.pending,
          ),
        ],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(
          communityId: 'paga-elders',
          initialTab: CommunitySpaceTab.members,
        ),
        spaces: spaces,
      );
      await settle(tester);

      expect(find.text('Requests to join · 1'), findsWidgets);
      expect(find.text('Nyaaba Atanga'), findsOneWidget);
      // Below the community's header on a phone-sized test surface.
      await tester.ensureVisible(find.text('Approve'));
      await tester.pump();
      await tester.tap(find.text('Approve'));
      await settle(tester);

      expect(spaces.approved, ['nyaaba-uid']);
      expect(find.text('Approve'), findsNothing);
      expect(find.text('Request approved.'), findsOneWidget);
    });

    testWidgets('its rules and about pages read from the community', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [
          fakeCommunity(rules: const ['Be kind.', 'Speak Kasem when you can.']),
        ],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'kasem-circle'),
        spaces: spaces,
      );

      await tester.tap(find.text('Rules'));
      await settle(tester);
      expect(find.text('Speak Kasem when you can.'), findsOneWidget);

      await tester.tap(find.text('About'));
      await settle(tester);
      expect(find.text('Primary language'), findsOneWidget);
      expect(find.text('Navrongo'), findsOneWidget);
    });

    testWidgets('a deleted or removed community says it is unavailable', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity(id: 'gone', status: 'removed')],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'missing'),
        spaces: spaces,
      );
      expect(find.text('This community is unavailable'), findsOneWidget);

      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'gone'),
        spaces: spaces,
      );
      expect(find.text('This community is unavailable'), findsOneWidget);
    });
  });

  group('running a community', () {
    CommunityMembership row(String uid, CommunityRole role) =>
        CommunityMembership(
          communityId: 'kasem-circle',
          uid: uid,
          role: role,
          status: MembershipStatus.active,
        );

    Future<void> openOptions(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('community-options')));
      await settle(tester);
    }

    Future<void> frames(WidgetTester tester) async {
      for (var frame = 0; frame < 3; frame++) {
        await tester.pump(const Duration(milliseconds: 300));
      }
    }

    test('a shared community is a web link the app also claims', () {
      expect(
        CommunitySpaceActions.linkFor(fakeCommunity()),
        'https://indigenworld.com/communities/kasem-circle',
      );
    });

    testWidgets('an admin edits the community from its options', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity()],
        memberships: [
          row('nyaaba-uid', CommunityRole.owner),
          row('amina-uid', CommunityRole.admin),
        ],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'kasem-circle'),
        spaces: spaces,
      );

      await openOptions(tester);
      await tester.tap(find.text('Edit community'));
      await frames(tester);
      expect(find.byType(EditCommunityScreen), findsOneWidget);
      // The address and visibility are shown, not offered.
      expect(
        find.text("Address: communities/kasem-circle. It can't be changed."),
        findsOneWidget,
      );

      await tester.enterText(
        find.byKey(const Key('edit-community-name')),
        'Navrongo Kasem Circle',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('edit-community-save')));
      await frames(tester);

      expect(spaces.updated.single.name, 'Navrongo Kasem Circle');
      expect(find.byType(EditCommunityScreen), findsNothing);
      expect(find.text('Navrongo Kasem Circle'), findsWidgets);
    });

    testWidgets('an empty name is not saved', (tester) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity()],
      );
      await pump(
        tester,
        EditCommunityScreen(space: fakeCommunity()),
        spaces: spaces,
      );

      await tester.enterText(find.byKey(const Key('edit-community-name')), '');
      await tester.pump();
      await tester.tap(find.byKey(const Key('edit-community-save')));
      await settle(tester);

      expect(find.text('Give the community a name.'), findsOneWidget);
      expect(spaces.updated, isEmpty);
    });

    testWidgets('a member leaves from the options and cannot edit', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity()],
        memberships: [
          row('nyaaba-uid', CommunityRole.owner),
          row('amina-uid', CommunityRole.member),
        ],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'kasem-circle'),
        spaces: spaces,
      );

      await openOptions(tester);
      expect(find.text('Edit community'), findsNothing);
      expect(find.text('Hand over ownership'), findsNothing);
      await tester.tap(find.text('Leave community'));
      await settle(tester);
      await tester.tap(find.text('Leave').last);
      await settle(tester);

      expect(spaces.left, ['kasem-circle']);
    });

    testWidgets('an owner hands the community to a member', (tester) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity(ownerId: 'amina-uid', memberCount: 2)],
        memberships: [
          row('amina-uid', CommunityRole.owner),
          row('nyaaba-uid', CommunityRole.member),
        ],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'kasem-circle'),
        spaces: spaces,
      );

      await openOptions(tester);
      // Somebody else is in it, so it can be handed over but not closed.
      expect(find.text('Close community'), findsNothing);
      expect(find.text('Report community'), findsNothing);
      await tester.tap(find.text('Hand over ownership'));
      await frames(tester);

      expect(find.byType(HandOverCommunityScreen), findsOneWidget);
      await tester.tap(find.text('Nyaaba Atanga'));
      await settle(tester);
      expect(find.text('Make Nyaaba Atanga the owner?'), findsOneWidget);
      await tester.tap(find.text('Hand over ownership').last);
      await frames(tester);

      expect(spaces.transfers, [('kasem-circle', 'nyaaba-uid')]);
      expect(find.byType(HandOverCommunityScreen), findsNothing);
    });

    testWidgets('an owner tapping their own badge is offered a way out', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [fakeCommunity(ownerId: 'amina-uid', memberCount: 1)],
        memberships: [row('amina-uid', CommunityRole.owner)],
      );
      await pump(
        tester,
        const CommunitySpaceScreen(communityId: 'kasem-circle'),
        spaces: spaces,
      );

      await tester.tap(
        find.byKey(const ValueKey('community-joined-kasem-circle')),
      );
      await settle(tester);
      expect(find.text('You own this community'), findsOneWidget);

      // Alone in it: closing is the way out.
      await tester.tap(find.text('Close community'));
      await settle(tester);
      expect(find.text('Close Kasem Circle?'), findsOneWidget);
      await tester.tap(find.text('Close community').last);
      await frames(tester);

      expect(spaces.closed, ['kasem-circle']);
      expect(find.text('This community is unavailable'), findsOneWidget);
    });
  });
}
