import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';

import 'community_test_harness.dart';

void main() {
  final amina = fakeProfile();

  group('ComposePostScreen', () {
    Future<void> pumpComposer(
      WidgetTester tester, {
      required FakeCommunityRepository repository,
      bool asReply = false,
    }) async {
      await tester.pumpWidget(
        communityHarness(
          repository: repository,
          profile: amina,
          child: ComposePostScreen(replyTo: asReply ? fakePost() : null),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
    }

    testWidgets('offers the Kasem pledge, a counter and an attach control', (
      tester,
    ) async {
      await pumpComposer(tester, repository: FakeCommunityRepository());

      expect(find.text('New post'), findsOneWidget);
      expect(
        find.text('I confirm this post is written in Kasem.'),
        findsOneWidget,
      );
      expect(
        find.text('0/${CommunityRepository.maxPostLength}'),
        findsOneWidget,
      );
      expect(
        find.text('0/${CommunityRepository.maxMediaPerPost}'),
        findsOneWidget,
      );
      expect(find.byTooltip('Add photo or video'), findsOneWidget);
    });

    testWidgets('the character counter tracks what is typed', (tester) async {
      await pumpComposer(tester, repository: FakeCommunityRepository());

      await tester.enterText(
        find.byKey(const Key('community-composer')),
        'De zaanem.',
      );
      await tester.pump();

      expect(
        find.text('10/${CommunityRepository.maxPostLength}'),
        findsOneWidget,
      );
    });

    testWidgets('an empty post is refused before anything is uploaded', (
      tester,
    ) async {
      await pumpComposer(tester, repository: FakeCommunityRepository());

      await tester.tap(find.byKey(const Key('community-publish')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        find.text('Write something or add a photo first.'),
        findsOneWidget,
      );
    });

    testWidgets('publishing without the Kasem pledge is refused', (
      tester,
    ) async {
      await pumpComposer(tester, repository: FakeCommunityRepository());

      await tester.enterText(
        find.byKey(const Key('community-composer')),
        'De zaanem.',
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('community-publish')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        find.text('Confirm this post is written in Kasem.'),
        findsOneWidget,
      );
    });

    testWidgets('reply mode shows the parent and asks about the reply', (
      tester,
    ) async {
      await pumpComposer(
        tester,
        repository: FakeCommunityRepository(),
        asReply: true,
      );

      expect(find.text('Reply'), findsOneWidget);
      expect(find.text('Replying to @amina_paga'), findsOneWidget);
      expect(find.text('De zaanem. Ko gara.'), findsOneWidget);
      expect(
        find.text('I confirm this reply is written in Kasem.'),
        findsOneWidget,
      );
    });
  });

  group('CommunitySetupScreen', () {
    Future<void> pumpSetup(
      WidgetTester tester,
      FakeCommunityRepository repository,
    ) async {
      await tester.pumpWidget(
        communityHarness(
          repository: repository,
          child: const CommunitySetupScreen(),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
    }

    testWidgets('explains that the handle is permanent', (tester) async {
      await pumpSetup(tester, FakeCommunityRepository());

      expect(find.text('Join the community'), findsOneWidget);
      expect(
        find.textContaining('handle is public and cannot be changed later'),
        findsOneWidget,
      );
      expect(find.text('Create my community profile'), findsOneWidget);
    });

    testWidgets('rejects a malformed handle before touching the network', (
      tester,
    ) async {
      final repository = FakeCommunityRepository();
      await pumpSetup(tester, repository);

      await tester.enterText(find.byKey(const Key('community-handle')), 'ab');
      await tester.pump();
      await tester.tap(find.byKey(const Key('community-setup-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Handles need at least 3 characters.'), findsOneWidget);
    });

    testWidgets('previews the normalised handle and flags one already taken', (
      tester,
    ) async {
      final repository = FakeCommunityRepository(profiles: [amina]);
      await pumpSetup(tester, repository);

      await tester.enterText(
        find.byKey(const Key('community-handle')),
        'Amina Paga',
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      // Uppercase and spaces are normalised away before the availability check.
      expect(find.text('You will appear as @aminapaga'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('community-handle')),
        'amina_paga',
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.byIcon(Icons.error_outline_rounded), findsOneWidget);
    });

    testWidgets('marks a free handle as available', (tester) async {
      await pumpSetup(tester, FakeCommunityRepository(profiles: [amina]));

      await tester.enterText(
        find.byKey(const Key('community-handle')),
        'awine',
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
    });
  });
}
