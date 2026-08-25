import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/messages_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_sidebar.dart';

import 'community_test_harness.dart';

void main() {
  final amina = fakeProfile();

  /// The feed's pulse dot animates forever, so `pumpAndSettle` never returns
  /// on this screen. Pumping past the drawer's own transition is what the rest
  /// of the community tests do, and it is enough.
  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Finder sidebarList() => find.descendant(
    of: find.byType(CommunitySidebar),
    matching: find.byType(Scrollable),
  );

  /// Scoped to the panel: "Following" is also the name of a feed tab sitting
  /// behind the open drawer, and an unscoped finder matches both.
  Finder sidebarText(String text) => find.descendant(
    of: find.byType(CommunitySidebar),
    matching: find.text(text),
  );

  Future<void> pumpFeed(
    WidgetTester tester,
    FakeCommunityRepository repository, {
    String? uid = 'amina-uid',
  }) async {
    await tester.pumpWidget(
      communityHarness(
        repository: repository,
        profile: uid == null ? null : amina,
        uid: uid,
        child: const CommunityScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<void> openSidebar(WidgetTester tester) async {
    await tester.tap(find.byIcon(Icons.menu_rounded));
    await settle(tester);
  }

  /// The panel's rows build lazily, so reaching the ones below the fold means
  /// actually scrolling it.
  Future<void> scrollSidebar(WidgetTester tester) async {
    await tester.drag(sidebarList(), const Offset(0, -400));
    await settle(tester);
  }

  testWidgets('the header offers a menu rather than a slogan', (tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository);

    // The width the slogan used to occupy now opens something.
    expect(find.text('Speak together.'), findsNothing);
    expect(find.byIcon(Icons.menu_rounded), findsOneWidget);
    expect(find.byType(CommunitySidebar), findsNothing);
  });

  testWidgets('the menu opens a sidebar of every community room', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository);
    await openSidebar(tester);

    expect(find.byType(CommunitySidebar), findsOneWidget);
    // Identity first, then the rooms.
    expect(find.text('Amina Ayaribisa'), findsWidgets);
    expect(sidebarText('@amina_paga'), findsOneWidget);
    for (final room in const [
      'Messages',
      'Notifications',
      'Find people',
      'Your profile',
      'Saved posts',
      'Your keeps',
    ]) {
      expect(sidebarText(room), findsOneWidget, reason: 'missing "$room" row');
    }

    await scrollSidebar(tester);
    for (final room in const [
      'Followers',
      'Following',
      'Ask Kawuri',
      'Settings',
      'Sign out',
    ]) {
      expect(sidebarText(room), findsOneWidget, reason: 'missing "$room" row');
    }
  });

  testWidgets('a guest is offered sign-in instead of sign-out', (tester) async {
    final repository = FakeCommunityRepository(profiles: [amina]);

    await pumpFeed(tester, repository, uid: null);
    await openSidebar(tester);

    expect(sidebarText('Not signed in'), findsOneWidget);
    // A guest has no counts to show, so the identity block stays a name and a
    // prompt rather than three em dashes.
    expect(sidebarText('FOLLOWERS'), findsNothing);

    await scrollSidebar(tester);
    expect(sidebarText('Sign in'), findsOneWidget);
    expect(sidebarText('Sign out'), findsNothing);
  });

  testWidgets('Messages opens the inbox and closes the drawer behind it', (
    tester,
  ) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost()],
    );

    await pumpFeed(tester, repository);
    await openSidebar(tester);
    await tester.tap(find.text('Messages'));
    await settle(tester);

    expect(find.byType(MessagesScreen), findsOneWidget);
    // Back from the inbox has to land on the feed, not on a half-open panel.
    expect(find.byType(CommunitySidebar), findsNothing);
  });

  group('thread ids', () {
    test('are the same whichever member asks for one', () {
      // This is what stops a pair of members ending up with two conversations
      // because they each opened one at the same moment.
      expect(
        ChatRepository.threadId('amina-uid', 'nyaaba-uid'),
        ChatRepository.threadId('nyaaba-uid', 'amina-uid'),
      );
    });

    test('are the two account ids, sorted, joined by an underscore', () {
      // The Firestore rule recomputes exactly this to decide who may create a
      // thread, so the shape is a contract rather than an implementation
      // detail.
      expect(
        ChatRepository.threadId('nyaaba-uid', 'amina-uid'),
        'amina-uid_nyaaba-uid',
      );
    });
  });
}
