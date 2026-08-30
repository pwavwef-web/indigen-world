// What the mark beside a name is allowed to claim.
//
// There used to be one boolean, drawn six different ways in three colours, that
// nothing could grant and nothing explained. There are four kinds now, and the
// rule underneath all of them is that a badge naming a person rests on a phone
// number: the project vouching for someone must not sit above an account that
// could belong to nobody.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/verified_badge.dart';

import 'community_test_harness.dart';

void main() {
  group('which mark a profile earns', () {
    test('nothing at all, by default', () {
      expect(fakeProfile().mark, VerifiedMark.none);
    });

    test('a phone alone makes a member', () {
      expect(
        fakeProfile(phoneVerified: true).mark,
        VerifiedMark.member,
      );
    });

    test('a granted kind shows once a phone is behind it', () {
      expect(
        fakeProfile(verifiedKind: 'elder', phoneVerified: true).mark,
        VerifiedMark.elder,
      );
      expect(
        fakeProfile(verifiedKind: 'creator', phoneVerified: true).mark,
        VerifiedMark.creator,
      );
    });

    test('and shows nothing until there is one', () {
      final granted = fakeProfile(verifiedKind: 'elder');
      expect(granted.mark, VerifiedMark.none);
      // Pending rather than denied — and the member is told so in Settings.
      expect(granted.hasPendingVerification, isTrue);
    });

    test('the project is its own guarantor', () {
      // The one exception, and not for convenience: a phone proves a *person*
      // is there, and the project's accounts — the assistant among them — are
      // not people.
      final project = fakeProfile(verifiedKind: 'project');
      expect(project.mark, VerifiedMark.project);
      expect(project.hasPendingVerification, isFalse);
    });

    test('an unknown kind is not a badge', () {
      expect(
        fakeProfile(verifiedKind: 'founder', phoneVerified: true).mark,
        VerifiedMark.member,
      );
    });
  });

  group('the profile document', () {
    test('reads the old boolean as the project itself', () {
      // Nothing in the app could ever set `isVerified`, so a profile carrying
      // it was marked by hand in the console — which means the project.
      final legacy = CommunityProfile.fromMap('kawuri', {
        'username': 'kawuri',
        'displayName': 'Kawuri',
        'isVerified': true,
      });
      expect(legacy.mark, VerifiedMark.project);
    });

    test('is created with neither half of a verification', () {
      final created = fakeProfile().toCreateMap();
      expect(created['verifiedKind'], '');
      expect(created['phoneVerified'], false);
    });

    test('stamps both halves onto a post, so a feed costs no extra reads', () {
      final stamp = fakeProfile(
        verifiedKind: 'elder',
        phoneVerified: true,
      ).toAuthorStamp();
      expect(stamp['verifiedKind'], 'elder');
      expect(stamp['phoneVerified'], true);
    });
  });

  group('the badge', () {
    Future<void> pump(WidgetTester tester, VerifiedMark mark) => tester
        .pumpWidget(
          communityHarness(
            repository: FakeCommunityRepository(),
            child: Scaffold(body: Center(child: VerifiedBadge(mark: mark))),
          ),
        );

    testWidgets('names its kind rather than relying on its colour', (
      tester,
    ) async {
      // At fourteen pixels the colour is all that reads, which makes colour a
      // bad place to keep the meaning.
      for (final mark in const [
        VerifiedMark.project,
        VerifiedMark.elder,
        VerifiedMark.creator,
        VerifiedMark.member,
      ]) {
        await pump(tester, mark);
        expect(
          find.bySemanticsLabel(VerifiedBadge.label(mark)),
          findsOneWidget,
          reason: 'the $mark mark should announce itself',
        );
      }
    });

    testWidgets('draws a different shape for the earned mark', (tester) async {
      await pump(tester, VerifiedMark.member);
      expect(find.byIcon(Icons.check_circle_outline_rounded), findsOneWidget);

      await pump(tester, VerifiedMark.elder);
      expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
    });

    testWidgets('is nothing at all when there is nothing to say', (
      tester,
    ) async {
      await pump(tester, VerifiedMark.none);
      expect(find.byType(Icon), findsNothing);
    });

    testWidgets('explains itself when tapped', (tester) async {
      await pump(tester, VerifiedMark.elder);

      await tester.tap(find.byType(VerifiedBadge));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('Language custodian'), findsWidgets);
      expect(find.textContaining('custodian of Kasem'), findsOneWidget);
    });
  });

  testWidgets('a post shows the mark its author had when they wrote it', (
    tester,
  ) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(
          // No live profile behind the post, so the byline has only the stamp
          // to go on — which is the case for every author a reader has not met.
          profiles: const [],
        ),
        child: Scaffold(
          body: ListView(
            children: [
              CommunityPostCard(
                post: fakePost(
                  authorVerifiedKind: 'creator',
                  authorPhoneVerified: true,
                ),
                liked: false,
                saved: false,
                onLike: () {},
                onReply: () {},
                onSave: () {},
                onOpen: () {},
                onOpenAuthor: () {},
                onMore: () {},
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    // A pattern rather than an exact label: the byline merges its name, handle
    // and mark into one semantics node, which is right for a screen reader and
    // means the mark's own words are a fragment of a longer sentence.
    expect(find.bySemanticsLabel(RegExp('Published creator')), findsOneWidget);
  });
}
