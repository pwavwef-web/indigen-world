// The community tab's header, and the posts that arrive while somebody reads.
//
// The header used to be the first row of the feed, so the menu, the bell,
// member search and the saved posts were three screens of scrolling away the
// moment anybody started reading. It is pinned now, and it answers to the same
// flag as the rail and the composer: gone while a reader moves on, back the
// instant they turn around — except for the For you / Following switch, which
// stays, because that is not chrome, it is where you are.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/app/shell_chrome.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';

import 'community_test_harness.dart';

void main() {
  final amina = fakeProfile();

  FakeCommunityRepository manyPosts() => FakeCommunityRepository(
    profiles: [amina],
    posts: [
      for (var index = 0; index < 12; index++)
        fakePost(
          id: 'post$index',
          text: 'Kasem post number $index',
          createdAt: DateTime(2026, 8, 20).subtract(Duration(hours: index)),
        ),
    ],
  );

  Future<void> pumpFeed(
    WidgetTester tester,
    FakeCommunityRepository repository,
  ) async {
    await tester.pumpWidget(
      communityHarness(
        repository: repository,
        profile: amina,
        child: const CommunityScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  Finder feedScroll() => find.descendant(
    of: find.byKey(const PageStorageKey('community-scroll')),
    matching: find.byType(Scrollable),
  );

  ProviderContainer containerOf(WidgetTester tester) =>
      ProviderScope.containerOf(tester.element(find.byType(CommunityScreen)));

  testWidgets('the header sits over the feed rather than in it', (
    tester,
  ) async {
    await pumpFeed(tester, manyPosts());

    // Pinned means at the very top of the tab, above everything that scrolls.
    final header = tester.getRect(find.text('Community'));
    final firstPost = tester.getRect(find.byType(CommunityPostCard).first);
    expect(header.top, lessThan(60));
    expect(firstPost.top, greaterThan(header.bottom));
  });

  testWidgets('reading on takes the title away and leaves the switch', (
    tester,
  ) async {
    await pumpFeed(tester, manyPosts());
    final restingTabs = tester.getRect(find.text('For you')).top;

    await tester.drag(feedScroll(), const Offset(0, -320));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // The title row has gone up under the status bar; the switch has taken its
    // place at the top of the screen and is still there to be read.
    expect(containerOf(tester).read(shellChromeVisibilityProvider), isFalse);
    expect(tester.getRect(find.text('For you')).top, lessThan(restingTabs));
    expect(find.text('For you'), findsOneWidget);

    await tester.drag(feedScroll(), const Offset(0, 260));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(containerOf(tester).read(shellChromeVisibilityProvider), isTrue);
    expect(tester.getRect(find.text('For you')).top, closeTo(restingTabs, 0.5));
  });

  testWidgets('posts that arrive mid-read are counted, not spliced in', (
    tester,
  ) async {
    final repository = manyPosts();
    await pumpFeed(tester, repository);
    addTearDown(repository.closeFeed);

    await tester.drag(feedScroll(), const Offset(0, -400));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    repository.publish(
      fakePost(
        id: 'fresh',
        text: 'Something that just happened',
        createdAt: DateTime(2026, 8, 21),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // Held above the line rather than inserted over the paragraph being read.
    expect(find.text('1 new post'), findsOneWidget);
    expect(find.text('Something that just happened'), findsNothing);

    await tester.tap(find.text('1 new post'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('1 new post'), findsNothing);
    expect(find.text('Something that just happened'), findsOneWidget);
    expect(tester.getRect(find.text('For you')).top, lessThan(120));
  });

  testWidgets('tapping the tab you are already on flies home', (tester) async {
    await pumpFeed(tester, manyPosts());

    await tester.drag(feedScroll(), const Offset(0, -600));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final position = tester.widget<Scrollable>(feedScroll()).controller!;
    expect(position.offset, greaterThan(100));

    containerOf(tester)
        .read(tabReselectProvider.notifier)
        .fire(kCommunityTabIndex);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(position.offset, 0);
  });
}
