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
  /// The form's own list. `.first` because the panel of Kassena names is a
  /// horizontal list *inside* it, and both answer to the same descendant query.
  Finder setupScroll() => find
      .descendant(
        of: find.byKey(const PageStorageKey('community-setup-scroll')),
        matching: find.byType(Scrollable),
      )
      .first;


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
      // The form is longer than a test surface now that it carries the Kassena
      // name offer, and the panel's row of names is a second scrollable — so
      // the walk has to say which list it means.
      await tester.scrollUntilVisible(
        find.byKey(const Key('community-setup-submit')),
        140,
        scrollable: setupScroll(),
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
      await tester.scrollUntilVisible(
        find.byKey(const Key('community-setup-submit')),
        140,
        scrollable: setupScroll(),
      );
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

    /// Opens [dropdown] and chooses [option].
    ///
    /// Both halves have to be *hit-testable*, not merely built. `ensureVisible`
    /// on the field because `scrollUntilVisible` stops as soon as a target
    /// enters the ListView's cache extent, which can be a couple of hundred
    /// pixels below the fold where a tap lands on nothing; and a drag inside
    /// the open menu because a thirty-one-day list is taller than the test
    /// surface, so the day somebody wants is often below its last visible row.
    ///
    /// `.last` because the closed button draws the chosen value too, so the
    /// text is on screen twice the moment the menu is open.
    Future<void> choose(
      WidgetTester tester,
      Key dropdown,
      String option,
    ) async {
      await tester.ensureVisible(find.byKey(dropdown));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(dropdown));
      await tester.pumpAndSettle();
      final target = find.text(option).hitTestable();
      if (target.evaluate().isEmpty) {
        await tester.dragUntilVisible(
          target,
          find.byType(Scrollable).last,
          const Offset(0, -60),
        );
      }
      await tester.tap(target.last);
      await tester.pumpAndSettle();
    }

    testWidgets('asks for a birthday, and keeps the year out of it', (
      tester,
    ) async {
      final repository = FakeCommunityRepository();
      await pumpSetup(tester, repository);

      await tester.enterText(find.byKey(const Key('community-handle')), 'awine');
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Display name'),
        'Awine Atulley',
      );
      await tester.pump(const Duration(milliseconds: 600));

      await tester.scrollUntilVisible(
        find.byKey(const Key('birthday-month')),
        140,
        scrollable: setupScroll(),
      );
      await choose(tester, const Key('birthday-month'), 'March');
      await choose(tester, const Key('birthday-day'), '27');

      await tester.scrollUntilVisible(
        find.byKey(const Key('community-setup-submit')),
        140,
        scrollable: setupScroll(),
      );
      await tester.tap(find.byKey(const Key('community-setup-submit')));
      await tester.pumpAndSettle();

      expect(repository.createdProfiles, hasLength(1));
      final created = repository.createdProfiles.single;
      expect(created.birthMonth, 3);
      expect(created.birthDay, 27);
      expect(created.birthdayLabel, '27 March');
    });

    testWidgets('will not take half a birthday', (tester) async {
      // A month with no day is a date nothing can be drawn from, and the write
      // would drop it silently -- which leaves somebody sure they gave it.
      final repository = FakeCommunityRepository();
      await pumpSetup(tester, repository);

      await tester.enterText(find.byKey(const Key('community-handle')), 'awine');
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Display name'),
        'Awine Atulley',
      );
      await tester.pump(const Duration(milliseconds: 600));

      await tester.scrollUntilVisible(
        find.byKey(const Key('birthday-month')),
        140,
        scrollable: setupScroll(),
      );
      await choose(tester, const Key('birthday-month'), 'March');

      expect(find.byKey(const Key('birthday-incomplete')), findsOneWidget);

      await tester.scrollUntilVisible(
        find.byKey(const Key('community-setup-submit')),
        140,
        scrollable: setupScroll(),
      );
      await tester.tap(find.byKey(const Key('community-setup-submit')));
      await tester.pumpAndSettle();

      expect(repository.createdProfiles, isEmpty);
      expect(find.textContaining('Finish your birthday'), findsOneWidget);
    });

    testWidgets('a day the month cannot hold is dropped, not refused later', (
      tester,
    ) async {
      // 31 April is not a date. Narrowing the day list the moment the month is
      // known is the only place this can be said without a refusal afterwards.
      await pumpSetup(tester, FakeCommunityRepository());

      await tester.scrollUntilVisible(
        find.byKey(const Key('birthday-month')),
        140,
        scrollable: setupScroll(),
      );
      await choose(tester, const Key('birthday-month'), 'March');
      await choose(tester, const Key('birthday-day'), '31');
      await choose(tester, const Key('birthday-month'), 'February');

      // The 31st went with it rather than being carried into a month that has
      // no 31st, and the screen says the birthday is unfinished. February gets
      // 29 rather than 28: there is no year here to make it a leap year or
      // not, and somebody born on the 29th has to be able to say so.
      expect(find.byKey(const Key('birthday-incomplete')), findsOneWidget);
    });
  });
}
